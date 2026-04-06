// Mark this file as an ES module to avoid collision with other compiled scripts
export {};

// Circumference of the SVG progress ring (r = 50)
const CIRCUMFERENCE = 2 * Math.PI * 50; // ≈ 314.159
const CLICK_VOLUME = 0.45;
const GOAL_VOLUME = 0.75;

const clickSoundTemplate = createPreloadedSound('assets/click.mp3', CLICK_VOLUME);
const goalSoundTemplate = createPreloadedSound('assets/chime.mp3', GOAL_VOLUME);

function createPreloadedSound(assetPath: string, volume: number): HTMLAudioElement {
  const audio = new Audio(chrome.runtime.getURL(assetPath));
  audio.preload = 'auto';
  audio.volume = volume;
  audio.load();
  return audio;
}

function playPreparedSound(template: HTMLAudioElement): void {
  const audio = template.cloneNode(true) as HTMLAudioElement;
  audio.volume = template.volume;
  audio.currentTime = 0;
  audio.play().catch(() => { /* ignore if audio blocked */ });
}

function warmUpPopupAudio(): void {
  clickSoundTemplate.load();
  goalSoundTemplate.load();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getToday(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

async function ensureDailyReset(): Promise<void> {
  const today = getToday();
  const { lastReset = '' } = await chrome.storage.local.get({ lastReset: '' }) as { lastReset: string };
  if (lastReset !== today) {
    await chrome.storage.local.set({ intake: 0, lastReset: today });
  }
}

async function loadState(): Promise<{
  intake: number;
  goal: number;
  interval: number;
  notificationsEnabled: boolean;
  soundsEnabled: boolean;
  keepRemindingAfterGoal: boolean;
}> {
  await ensureDailyReset();
  const local = await chrome.storage.local.get({ intake: 0 }) as { intake: number };
  const sync = await chrome.storage.sync.get({
    goal: 2000,
    interval: 30,
    notificationsEnabled: true,
    soundsEnabled: true,
    keepRemindingAfterGoal: true,
  }) as {
    goal: number;
    interval: number;
    notificationsEnabled: boolean;
    soundsEnabled: boolean;
    keepRemindingAfterGoal: boolean;
  };
  return {
    intake: local.intake,
    goal: sync.goal,
    interval: sync.interval,
    notificationsEnabled: sync.notificationsEnabled,
    soundsEnabled: sync.soundsEnabled,
    keepRemindingAfterGoal: sync.keepRemindingAfterGoal,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderProgress(intake: number, goal: number): void {
  const progressRatio = intake / goal;
  const visualRatio = Math.min(progressRatio, 1);
  const offset = CIRCUMFERENCE * (1 - visualRatio);

  const circle = document.getElementById('progressCircle') as HTMLElement;
  circle.style.strokeDashoffset = String(offset);
  // Turn blue when goal is met
  circle.style.stroke = progressRatio >= 1 ? '#00838f' : 'url(#waterGrad)';

  (document.getElementById('intakeAmount') as HTMLSpanElement).textContent = String(intake);
  (document.getElementById('goalText') as HTMLSpanElement).textContent = `/ ${goal} ml`;
  (document.getElementById('percentText') as HTMLSpanElement).textContent =
    `${Math.round(progressRatio * 100)}% of goal`;
}

async function updateNextReminder(): Promise<void> {
  const alarm = await chrome.alarms.get('water-reminder');
  const el = document.getElementById('nextReminder') as HTMLSpanElement;
  if (alarm) {
    const msLeft = alarm.scheduledTime - Date.now();
    if (msLeft > 0) {
      const mins = Math.ceil(msLeft / 60_000);
      el.textContent = `Next in ${mins} min`;
    } else {
      el.textContent = 'Due now';
    }
  } else {
    el.textContent = '—';
  }
}

// ── Audio ─────────────────────────────────────────────────────────────────────

function playClickSound(): void {
  try {
    playPreparedSound(clickSoundTemplate);
  } catch (_) { /* ignore */ }
}

function playGoalSound(): void {
  try {
    playPreparedSound(goalSoundTemplate);
  } catch (_) { /* ignore */ }
}

function wireUiSound(element: HTMLElement | null, eventName: string = 'click'): void {
  element?.addEventListener(eventName, () => {
    playClickSound();
  });
}

// ── Water actions ─────────────────────────────────────────────────────────────

async function addWater(amount: number): Promise<void> {
  const { intake = 0 } = await chrome.storage.local.get({ intake: 0 }) as { intake: number };
  const newIntake = intake + amount;
  await chrome.storage.local.set({ intake: newIntake });
  const { goal = 2000, soundsEnabled = true } = await chrome.storage.sync.get({
    goal: 2000,
    soundsEnabled: true,
  }) as { goal: number; soundsEnabled: boolean };
  renderProgress(newIntake, goal);

  if (soundsEnabled && intake < goal && newIntake >= goal) {
    playGoalSound();
    return;
  }

  playClickSound();
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const {
    intake,
    goal,
    interval,
    notificationsEnabled,
    soundsEnabled,
    keepRemindingAfterGoal,
  } = await loadState();
  let currentInterval = interval;

  // Warm audio on popup open and again on the first user gesture.
  warmUpPopupAudio();
  document.addEventListener('pointerdown', warmUpPopupAudio, { once: true });

  renderProgress(intake, goal);
  await updateNextReminder();

  // Populate settings fields
  (document.getElementById('intervalInput') as HTMLInputElement).value = String(interval);
  (document.getElementById('goalInput') as HTMLInputElement).value = String(goal);
  (document.getElementById('notificationsEnabled') as HTMLInputElement).checked = notificationsEnabled;
  (document.getElementById('soundsEnabled') as HTMLInputElement).checked = soundsEnabled;
  (document.getElementById('keepRemindingAfterGoal') as HTMLInputElement).checked = keepRemindingAfterGoal;

  // Quick-add buttons
  document.querySelectorAll<HTMLButtonElement>('.quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const amount = parseInt(btn.dataset.amount ?? '0', 10);
      addWater(amount);
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 180);
    });
  });

  // Custom amount
  const customInput = document.getElementById('customAmount') as HTMLInputElement;
  document.getElementById('addCustom')!.addEventListener('click', () => {
    const val = parseInt(customInput.value, 10);
    if (!isNaN(val) && val > 0 && val <= 5000) {
      addWater(val);
      customInput.value = '';
    }
  });
  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (document.getElementById('addCustom') as HTMLButtonElement).click();
  });

  // Settings toggle
  const settingsToggle = document.getElementById('settingsToggle') as HTMLButtonElement;
  const settingsPanel = document.getElementById('settingsPanel') as HTMLElement;
  wireUiSound(settingsToggle);
  settingsToggle.addEventListener('click', () => {
    const isOpen = settingsPanel.classList.toggle('open');
    settingsPanel.setAttribute('aria-hidden', String(!isOpen));
    settingsToggle.classList.toggle('is-open', isOpen);
    settingsToggle.setAttribute('aria-label', isOpen ? 'Close settings' : 'Open settings');
  });

  wireUiSound(document.getElementById('saveSettings'));
  wireUiSound(document.getElementById('notificationsEnabled'), 'change');
  wireUiSound(document.getElementById('soundsEnabled'), 'change');
  wireUiSound(document.getElementById('keepRemindingAfterGoal'), 'change');

  // Save settings
  document.getElementById('saveSettings')!.addEventListener('click', async () => {
    const newInterval = parseInt((document.getElementById('intervalInput') as HTMLInputElement).value, 10);
    const newGoal = parseInt((document.getElementById('goalInput') as HTMLInputElement).value, 10);
    const newNotificationsEnabled = (document.getElementById('notificationsEnabled') as HTMLInputElement).checked;
    const newSoundsEnabled = (document.getElementById('soundsEnabled') as HTMLInputElement).checked;
    const newKeepRemindingAfterGoal = (document.getElementById('keepRemindingAfterGoal') as HTMLInputElement).checked;

    if (isNaN(newInterval) || newInterval < 1 || newInterval > 480) return;
    if (isNaN(newGoal) || newGoal < 100 || newGoal > 10000) return;

    await chrome.storage.sync.set({
      interval: newInterval,
      goal: newGoal,
      notificationsEnabled: newNotificationsEnabled,
      soundsEnabled: newSoundsEnabled,
      keepRemindingAfterGoal: newKeepRemindingAfterGoal,
    });
    if (newInterval !== currentInterval) {
      // Ask background to reschedule the alarm only when the interval changes
      chrome.runtime.sendMessage({ action: 'reschedule', interval: newInterval });
      currentInterval = newInterval;
    }

    const { intake: current = 0 } = await chrome.storage.local.get({ intake: 0 }) as { intake: number };
    renderProgress(current, newGoal);

    const fb = document.getElementById('saveFeedback') as HTMLParagraphElement;
    fb.textContent = '✓ Settings saved!';
    fb.style.opacity = '1';
    setTimeout(() => { fb.style.opacity = '0'; }, 2200);

    await updateNextReminder();
  });

  // Reset today
  document.getElementById('resetBtn')!.addEventListener('click', async () => {
    if (!confirm("Reset today's water intake to 0?")) return;
    await chrome.storage.local.set({ intake: 0, lastReset: getToday() });
    const { goal: g = 2000 } = await chrome.storage.sync.get({ goal: 2000 }) as { goal: number };
    renderProgress(0, g);
    playClickSound();
  });

  // Refresh countdown every 30 s while popup is open
  setInterval(updateNextReminder, 30_000);
}

document.addEventListener('DOMContentLoaded', init);
