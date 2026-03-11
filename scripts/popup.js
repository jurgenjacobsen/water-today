// Circumference of the SVG progress ring (r = 50)
const CIRCUMFERENCE = 2 * Math.PI * 50; // ≈ 314.159
// ── Helpers ──────────────────────────────────────────────────────────────────
function getToday() {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}
async function ensureDailyReset() {
    const today = getToday();
    const { lastReset = '' } = await chrome.storage.local.get({ lastReset: '' });
    if (lastReset !== today) {
        await chrome.storage.local.set({ intake: 0, lastReset: today });
    }
}
async function loadState() {
    await ensureDailyReset();
    const local = await chrome.storage.local.get({ intake: 0 });
    const sync = await chrome.storage.sync.get({
        goal: 2000,
        interval: 30,
        notificationsEnabled: true,
        soundsEnabled: true,
        keepRemindingAfterGoal: true,
    });
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
function renderProgress(intake, goal) {
    const progressRatio = intake / goal;
    const visualRatio = Math.min(progressRatio, 1);
    const offset = CIRCUMFERENCE * (1 - visualRatio);
    const circle = document.getElementById('progressCircle');
    circle.style.strokeDashoffset = String(offset);
    // Turn blue when goal is met
    circle.style.stroke = progressRatio >= 1 ? '#00838f' : 'url(#waterGrad)';
    document.getElementById('intakeAmount').textContent = String(intake);
    document.getElementById('goalText').textContent = `/ ${goal} ml`;
    document.getElementById('percentText').textContent =
        `${Math.round(progressRatio * 100)}% of goal`;
}
async function updateNextReminder() {
    const alarm = await chrome.alarms.get('water-reminder');
    const el = document.getElementById('nextReminder');
    if (alarm) {
        const msLeft = alarm.scheduledTime - Date.now();
        if (msLeft > 0) {
            const mins = Math.ceil(msLeft / 60000);
            el.textContent = `Next in ${mins} min`;
        }
        else {
            el.textContent = 'Due now';
        }
    }
    else {
        el.textContent = '—';
    }
}
// ── Audio ─────────────────────────────────────────────────────────────────────
function playClickSound() {
    try {
        const audio = new Audio(chrome.runtime.getURL('assets/click.mp3'));
        audio.volume = 0.45;
        audio.play().catch(() => { });
    }
    catch (_) { /* ignore */ }
}
function playGoalSound() {
    try {
        const audio = new Audio(chrome.runtime.getURL('assets/chime.mp3'));
        audio.volume = 0.75;
        audio.play().catch(() => { });
    }
    catch (_) { /* ignore */ }
}
function wireUiSound(element, eventName = 'click') {
    element?.addEventListener(eventName, () => {
        playClickSound();
    });
}
// ── Water actions ─────────────────────────────────────────────────────────────
async function addWater(amount) {
    const { intake = 0 } = await chrome.storage.local.get({ intake: 0 });
    const newIntake = intake + amount;
    await chrome.storage.local.set({ intake: newIntake });
    const { goal = 2000, soundsEnabled = true } = await chrome.storage.sync.get({
        goal: 2000,
        soundsEnabled: true,
    });
    renderProgress(newIntake, goal);
    if (soundsEnabled && intake < goal && newIntake >= goal) {
        playGoalSound();
        return;
    }
    playClickSound();
}
// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    const { intake, goal, interval, notificationsEnabled, soundsEnabled, keepRemindingAfterGoal, } = await loadState();
    renderProgress(intake, goal);
    await updateNextReminder();
    // Populate settings fields
    document.getElementById('intervalInput').value = String(interval);
    document.getElementById('goalInput').value = String(goal);
    document.getElementById('notificationsEnabled').checked = notificationsEnabled;
    document.getElementById('soundsEnabled').checked = soundsEnabled;
    document.getElementById('keepRemindingAfterGoal').checked = keepRemindingAfterGoal;
    // Quick-add buttons
    document.querySelectorAll('.quick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const amount = parseInt(btn.dataset.amount ?? '0', 10);
            addWater(amount);
            btn.classList.add('pressed');
            setTimeout(() => btn.classList.remove('pressed'), 180);
        });
    });
    // Custom amount
    const customInput = document.getElementById('customAmount');
    document.getElementById('addCustom').addEventListener('click', () => {
        const val = parseInt(customInput.value, 10);
        if (!isNaN(val) && val > 0 && val <= 5000) {
            addWater(val);
            customInput.value = '';
        }
    });
    customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')
            document.getElementById('addCustom').click();
    });
    // Settings toggle
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsPanel = document.getElementById('settingsPanel');
    wireUiSound(settingsToggle);
    settingsToggle.addEventListener('click', () => {
        const isOpen = settingsPanel.classList.toggle('open');
        settingsPanel.setAttribute('aria-hidden', String(!isOpen));
        settingsToggle.textContent = isOpen ? '✕' : '⚙️';
    });
    wireUiSound(document.getElementById('saveSettings'));
    wireUiSound(document.getElementById('notificationsEnabled'), 'change');
    wireUiSound(document.getElementById('soundsEnabled'), 'change');
    wireUiSound(document.getElementById('keepRemindingAfterGoal'), 'change');
    // Save settings
    document.getElementById('saveSettings').addEventListener('click', async () => {
        const newInterval = parseInt(document.getElementById('intervalInput').value, 10);
        const newGoal = parseInt(document.getElementById('goalInput').value, 10);
        const newNotificationsEnabled = document.getElementById('notificationsEnabled').checked;
        const newSoundsEnabled = document.getElementById('soundsEnabled').checked;
        const newKeepRemindingAfterGoal = document.getElementById('keepRemindingAfterGoal').checked;
        if (isNaN(newInterval) || newInterval < 1 || newInterval > 480)
            return;
        if (isNaN(newGoal) || newGoal < 100 || newGoal > 10000)
            return;
        await chrome.storage.sync.set({
            interval: newInterval,
            goal: newGoal,
            notificationsEnabled: newNotificationsEnabled,
            soundsEnabled: newSoundsEnabled,
            keepRemindingAfterGoal: newKeepRemindingAfterGoal,
        });
        // Ask background to reschedule the alarm
        chrome.runtime.sendMessage({ action: 'reschedule', interval: newInterval });
        const { intake: current = 0 } = await chrome.storage.local.get({ intake: 0 });
        renderProgress(current, newGoal);
        const fb = document.getElementById('saveFeedback');
        fb.textContent = '✓ Settings saved!';
        fb.style.opacity = '1';
        setTimeout(() => { fb.style.opacity = '0'; }, 2200);
        await updateNextReminder();
    });
    // Reset today
    document.getElementById('resetBtn').addEventListener('click', async () => {
        if (!confirm("Reset today's water intake to 0?"))
            return;
        await chrome.storage.local.set({ intake: 0, lastReset: getToday() });
        const { goal: g = 2000 } = await chrome.storage.sync.get({ goal: 2000 });
        renderProgress(0, g);
        playClickSound();
    });
    // Refresh countdown every 30 s while popup is open
    setInterval(updateNextReminder, 30000);
}
document.addEventListener('DOMContentLoaded', init);
export {};
