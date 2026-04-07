// Mark this file as an ES module
export {};

const ALARM_NAME = 'water-reminder';
const BADGE_ALARM_NAME = 'water-reminder-badge';
const DEFAULT_INTERVAL = 30; // minutes
const DEFAULT_GOAL = 2000;   // ml
const DEFAULT_NOTIFICATIONS_ENABLED = true;
const DEFAULT_SOUNDS_ENABLED = true;
const DEFAULT_KEEP_REMINDING_AFTER_GOAL = true;
let badgeTickerId: number | undefined;

// ── Date helpers ──────────────────────────────────────────────────────────────

function getToday(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

async function checkDailyReset(): Promise<void> {
  const today = getToday();
  const { lastReset = '' } = await chrome.storage.sync.get({ lastReset: '' }) as { lastReset: string };
  if (lastReset !== today) {
    await chrome.storage.sync.set({ intake: 0, lastReset: today });
  }
}

// ── Alarm management ──────────────────────────────────────────────────────────

function formatGoalCompletionBadgeText(intake: number, goal: number): string {
  const safeGoal = goal > 0 ? goal : DEFAULT_GOAL;
  const pct = Math.max(0, Math.round((intake / safeGoal) * 100));
  return `${Math.min(pct, 999)}%`;
}

function stopBadgeTicker(): void {
  if (badgeTickerId !== undefined) {
    clearInterval(badgeTickerId);
    badgeTickerId = undefined;
  }
}

async function updateReminderBadge(): Promise<void> {
  const reminderAlarm = await chrome.alarms.get(ALARM_NAME);

  if (!reminderAlarm) {
    stopBadgeTicker();
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'Water Today' });
    return;
  }

  const { intake = 0 } = await chrome.storage.sync.get({ intake: 0 }) as { intake: number };
  const { goal = DEFAULT_GOAL } = await chrome.storage.sync.get({ goal: DEFAULT_GOAL }) as { goal: number };
  const badgeText = formatGoalCompletionBadgeText(intake, goal);
  await chrome.action.setBadgeBackgroundColor({ color: '#1565c0' });
  await chrome.action.setBadgeText({ text: badgeText });
  await chrome.action.setTitle({
    title: `Water Today - ${badgeText} of daily goal completed`,
  });
}

async function startBadgeTicker(): Promise<void> {
  stopBadgeTicker();
  await updateReminderBadge();
  badgeTickerId = globalThis.setInterval(() => {
    void updateReminderBadge();
  }, 1000);
}

async function scheduleAlarm(intervalMinutes: number): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.clear(BADGE_ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalMinutes });
  chrome.alarms.create(BADGE_ALARM_NAME, { periodInMinutes: 1 });
  await startBadgeTicker();
}

// ── Offscreen document (for audio playback in the service worker) ─────────────

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({});
  const hasOffscreen = contexts.some(
    (ctx) => ctx.contextType === 'OFFSCREEN_DOCUMENT'
  );
  if (hasOffscreen) return;

  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('offscreen.html'),
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: 'Play water-reminder chime via Web Audio',
  });
}

async function playReminderSound(): Promise<void> {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ target: 'offscreen', action: 'playReminder' });
  } catch (_) {
    // Audio failure is non-critical — swallow silently
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  // Seed defaults if they don't already exist
  const stored = await chrome.storage.sync.get({
    interval: DEFAULT_INTERVAL,
    goal: DEFAULT_GOAL,
    notificationsEnabled: DEFAULT_NOTIFICATIONS_ENABLED,
    soundsEnabled: DEFAULT_SOUNDS_ENABLED,
    keepRemindingAfterGoal: DEFAULT_KEEP_REMINDING_AFTER_GOAL,
  }) as {
    interval: number;
    goal: number;
    notificationsEnabled: boolean;
    soundsEnabled: boolean;
    keepRemindingAfterGoal: boolean;
  };
  await chrome.storage.sync.set(stored);

  await checkDailyReset();
  await scheduleAlarm(stored.interval);
});

chrome.runtime.onStartup.addListener(async () => {
  await checkDailyReset();
  // Recreate the alarm if it was cleared (e.g. browser restart)
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    const { interval = DEFAULT_INTERVAL } = await chrome.storage.sync.get({
      interval: DEFAULT_INTERVAL,
    }) as { interval: number };
    await scheduleAlarm(interval);
    return;
  }

  const badgeAlarm = await chrome.alarms.get(BADGE_ALARM_NAME);
  if (!badgeAlarm) {
    chrome.alarms.create(BADGE_ALARM_NAME, { periodInMinutes: 1 });
  }

  await startBadgeTicker();
});

// ── Alarm handler ─────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === BADGE_ALARM_NAME) {
    await startBadgeTicker();
    return;
  }

  if (alarm.name !== ALARM_NAME) return;

  await checkDailyReset();

  const { intake = 0 } = await chrome.storage.sync.get({ intake: 0 }) as { intake: number };
  const {
    goal = DEFAULT_GOAL,
    notificationsEnabled = DEFAULT_NOTIFICATIONS_ENABLED,
    soundsEnabled = DEFAULT_SOUNDS_ENABLED,
    keepRemindingAfterGoal = DEFAULT_KEEP_REMINDING_AFTER_GOAL,
  } = await chrome.storage.sync.get({
    goal: DEFAULT_GOAL,
    notificationsEnabled: DEFAULT_NOTIFICATIONS_ENABLED,
    soundsEnabled: DEFAULT_SOUNDS_ENABLED,
    keepRemindingAfterGoal: DEFAULT_KEEP_REMINDING_AFTER_GOAL,
  }) as {
    goal: number;
    notificationsEnabled: boolean;
    soundsEnabled: boolean;
    keepRemindingAfterGoal: boolean;
  };

  const pct = Math.round((intake / goal) * 100);
  const remaining = goal - intake;

  if (remaining <= 0 && !keepRemindingAfterGoal) {
    return;
  }

  const message =
    remaining <= 0
      ? `You have completed ${pct}% of the goal, but let's keep on going!`
      : `${intake} ml so far (${pct}%).  ${remaining} ml left to reach your goal!`;

  // Show Chrome notification
  if (notificationsEnabled) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon.png'),
      title: 'Time to drink water!',
      message,
      priority: 2,
    });
  }

  if (soundsEnabled) {
    await playReminderSound();
  }

  await updateReminderBadge();
});

// ── Message handler (from popup) ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: { action?: string; target?: string; interval?: number },
    _sender,
    sendResponse
  ) => {
    // Messages destined for the offscreen document — ignore them here
    if (message.target === 'offscreen') return false;

    if (message.action === 'reschedule') {
      const newInterval = message.interval ?? DEFAULT_INTERVAL;
      scheduleAlarm(newInterval).then(() => sendResponse({ success: true }));
      return true; // keep channel open for async response
    }

    return false;
  }
);
