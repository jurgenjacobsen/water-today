// This script runs inside the offscreen document (offscreen.html).
// It receives messages from the service worker and plays audio,
// because service workers cannot access the Web Audio API directly.
chrome.runtime.onMessage.addListener((message) => {
    // Only handle messages explicitly directed at the offscreen document
    if (message.target !== 'offscreen')
        return;
    if (message.action === 'playReminder') {
        playSound(chrome.runtime.getURL('assets/water-drop.mp3'), 0.75);
    }
    if (message.action === 'playChime') {
        playSound(chrome.runtime.getURL('assets/chime.mp3'), 0.75);
    }
});
function playSound(url, volume) {
    const audio = new Audio(url);
    audio.volume = volume;
    audio.play().catch(() => { });
}
export {};
