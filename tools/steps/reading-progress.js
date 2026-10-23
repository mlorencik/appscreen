// Runs on the reading screen. "Reads" `arg` sentences (default 3) by stubbing
// the mic, faking the AssemblyAI websocket and synthesizing formatted Turn
// messages from the on-screen sentence — so previous sentences show colored
// confidence words, the legend appears and the progress bar advances.
// Ends mid-listen on the next unread sentence (active mic state).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
const wantRead = Number(arg) || 3;

// Mic + permission stubs — headless Chromium has no audio device. The stream
// must carry an audio track (an empty MediaStream makes createMediaStreamSource
// throw), so source it from a silent MediaStreamAudioDestinationNode.
try {
    const micSource = new AudioContext();
    const fakeStream = () => micSource.createMediaStreamDestination().stream;
    try { navigator.mediaDevices.getUserMedia = fakeStream; } catch {}
    try {
        Object.defineProperty(navigator, 'mediaDevices', {
            value: { getUserMedia: fakeStream },
            configurable: true,
        });
    } catch {}
} catch {}
try {
    const origQuery = navigator.permissions?.query?.bind(navigator.permissions);
    if (origQuery) {
        navigator.permissions.query = (p) =>
            p?.name === 'microphone' ? Promise.resolve({ state: 'granted' }) : origQuery(p);
    }
} catch {}

// /api/speak token fetch — a real AssemblyAI connection is pointless in
// headless (silence produces empty turns), so return a fake token.
const realFetch = window.fetch.bind(window);
window.fetch = (url, opts) =>
    String(url).includes('/api/speak')
        ? Promise.resolve(new Response(JSON.stringify({ token: 'fake' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
        : realFetch(url, opts);

const currentSentenceText = () => {
    const el = [...document.querySelectorAll('div')].find(
        (d) => /text-lg/.test(d.className || '') && /font-medium/.test(d.className || '') && /my-2/.test(d.className || '')
    );
    return norm(el?.innerText || '');
};

let turnsEmitted = 0;
let wantsMore = true; // stop emitting once wantRead turns are done

class FakeWS {
    constructor() {
        this.readyState = FakeWS.OPEN;
        this.__sent = false;
        window.__captureWS = this;
        setTimeout(() => this.onopen?.(), 30);
        // Emit the Turn on a timer — don't depend on real audio chunks flowing.
        setTimeout(() => this.__emitTurn(), 1500);
    }
    __emitTurn() {
        if (this.__sent || this.readyState !== FakeWS.OPEN) return;
        if (turnsEmitted >= wantRead || !wantsMore) return;
        this.__sent = true;
        const text = currentSentenceText();
        const words = text.split(/\s+/).filter(Boolean).map((w) => ({
            text: w,
            confidence: Math.random() < 0.85 ? 0.75 + Math.random() * 0.24 : 0.45 + Math.random() * 0.18,
        }));
        this.onmessage?.({
            data: JSON.stringify({ type: 'Turn', transcript: text, words, end_of_turn: true, turn_is_formatted: true }),
        });
    }
    send(data) {
        if (typeof data === 'string' && data.includes('terminate_session')) {
            this.close();
            return;
        }
        // First binary chunk → emit now if the timer hasn't yet.
        if (typeof data !== 'string' && !this.__sent) this.__emitTurn();
    }
    close() {
        if (this.readyState === FakeWS.CLOSED) return;
        this.readyState = FakeWS.CLOSED;
        setTimeout(() => this.onclose?.(), 30);
    }
}
FakeWS.OPEN = 1;
FakeWS.CLOSED = 3;
window.WebSocket = FakeWS;

const micDiv = () => {
    const svg = [...document.querySelectorAll('svg')].find((s) => /h-16/.test(s.getAttribute('class') || '') && /w-16/.test(s.getAttribute('class') || ''));
    return svg?.closest('div') || null;
};
const speaking = () => /bg-sky-100/.test(micDiv()?.className || '');
const nextBtn = () => [...document.querySelectorAll('button.btn-sky')].find((b) => !b.disabled && b.offsetParent);

// Step 0 does not auto-listen — kick it off once.
micDiv()?.click();

let idle = 0;
for (let i = 0; i < 160; i++) {
    await sleep(500);
    const ws = window.__captureWS;

    const next = nextBtn();
    const wsBusy = ws && ws.readyState === FakeWS.OPEN;

    if (turnsEmitted >= wantRead) {
        // Stop right after the last read — the current sentence renders its
        // words in confidence colors at full size with the legend below,
        // previous sentences show faded+colored behind it.
        wantsMore = false;
        return { read: turnsEmitted };
    }

    if (ws && ws.readyState === FakeWS.CLOSED && ws.__sent === true) {
        // Turn just processed → count it, then advance to next sentence.
        ws.__sent = 'counted';
        turnsEmitted++;
        idle = 0;
        continue;
    }
    if (next && !wsBusy && !speaking()) {
        next.click();
        idle = 0;
        continue;
    }
    if (++idle > 40) return { error: 'reading flow stalled', read: turnsEmitted };
}
return { error: 'budget exhausted', read: turnsEmitted };
