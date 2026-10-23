// Runs inside a conversation page (/dashboard/conversations/{id}).
// `arg` = max user messages to send (default 3). Sends messages built from
// the hint placeholder (always on-topic) with deliberately broken grammar so
// the API returns fixed_message ("Correct version" box), then clicks
// Translate on the last assistant bubble and waits for the real translation.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => !!(el && el.offsetParent);
const want = Math.max(2, Number(arg) || 3);

const bubbles = () =>
    [...document.querySelectorAll('main .flex > div[class*="max-w-"]')].filter((b) => !b.querySelector('.animate-spin')).length;
// "Correct version" card: rounded-xl sky box under the user bubble.
const fixedBox = () => [...document.querySelectorAll('main div.rounded-xl.bg-sky-50')].some(visible);
const lastItalic = () => [...document.querySelectorAll('main p.italic')].filter(visible).pop();

// Dismiss the "Conversation goals" intro modal (Begin/Continue = .btn-sky).
const begin = [...document.querySelectorAll('button.btn-sky')].find(visible);
if (begin) {
    begin.click();
    await sleep(1500);
}

// The textarea placeholder carries the suggested reply (hint) — break a few
// verb forms so the message is on-topic but triggers a correction.
const BREAK = { am: 'is', is: 'are', are: 'is', do: 'does', does: 'do', have: 'has', has: 'have', want: 'wants', need: 'needs' };
const breakGrammar = (s) => s.replace(/\b(am|is|are|do|does|have|has|want|need)\b/gi, (m) => BREAK[m.toLowerCase()] || m);
const fallbacks = [
    'I wants ask you about few things.',
    'Can you explains me this one more time, slowly?',
    'How much times I needs practice this?',
];
const nextText = (i) => {
    const ta = [...document.querySelectorAll('textarea')].find(visible);
    const ph = (ta?.placeholder || '').trim();
    if (ph && !/\.\.\.$/.test(ph) && ph.length > 12) return breakGrammar(ph);
    return fallbacks[i] || fallbacks[0];
};

const send = async (text) => {
    const ta = [...document.querySelectorAll('textarea')].find(visible);
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return true;
};

const waitBubbles = async (target, tries = 300) => {
    for (let i = 0; i < tries && bubbles() < target; i++) await sleep(200);
    return bubbles() >= target;
};

// Wait for the assistant start message to land after the modal closes.
await waitBubbles(1, 50);

let sent = 0;
for (let i = 0; i < want; i++) {
    const before = bubbles();
    if (!(await send(nextText(i)))) break;
    sent++;
    await waitBubbles(before + 2, 300); // user bubble + assistant reply
    if (sent >= 2 && fixedBox()) break; // enough content once a correction shows
}

// Translate the last assistant reply that still has the Translate button.
const tbtn = [...document.querySelectorAll('main button')]
    .filter((b) => visible(b) && b.querySelector('svg[class*="tabler-icon-language"]'))
    .pop();
let tOk = false;
if (tbtn) {
    tbtn.click();
    // The italic placeholder ("I'm translating") renders instantly — wait for
    // the paragraph text to change into the real translation.
    let placeholder = '';
    for (let i = 0; i < 40; i++) {
        await sleep(100);
        const p = lastItalic();
        if (p) { placeholder = p.textContent; break; }
    }
    for (let i = 0; i < 150; i++) {
        await sleep(200);
        const p = lastItalic();
        if (p && p.textContent.trim() && p.textContent !== placeholder) { tOk = true; break; }
    }
}

await sleep(1200);
return { bubbles: bubbles(), sent, fixed: fixedBox(), translated: tOk };
