// Runs on the hearing intro screen (step 0) — the <Play mode="player"> widget.
// Starts real playback so the screenshot shows a moved progress bar, elapsed
// time and the pause icon instead of a pristine "0:00" state.
// `arg` = seconds of playback to accumulate (default 12).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const playFor = (Number(arg) || 12) * 1000;

const playBtn = document.querySelector('button[aria-label="Play"]');
if (!playBtn) return { error: 'play button not found' };
playBtn.click();

// Audio may need to load or be generated via TTS — wait for the pause state.
let playing = false;
for (let i = 0; i < 70; i++) {
    await sleep(500);
    if (document.querySelector('button[aria-label="Pause"]')) { playing = true; break; }
}
if (!playing) return { error: 'audio did not start' };

// 1.5x speed accumulates visible progress faster and looks like real usage.
const speedBtn = [...document.querySelectorAll('button')].find((b) => /Prędkość/.test(b.textContent || ''));
if (speedBtn) {
    speedBtn.click();
    await sleep(400);
    const rate = [...document.querySelectorAll('button')].find((b) => /^\s*1\.5x\s*$/.test((b.textContent || '').trim()));
    if (rate) rate.click();
    await sleep(300);
}

await sleep(playFor);
return { playing: !!document.querySelector('button[aria-label="Pause"]') };
