// Runs inside /dashboard/repeat. Grouped WordMatchItem screens always sit at
// the END of the session, so we answer the preceding single exercises
// (any answer advances the step) until the match grid appears, then connect
// `arg` pairs (default 2) and leave the rest open for a mid-exercise shot.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => !!(el && el.offsetParent) && !el.disabled;
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
const wantMatched = Number(arg) || 2;

// The pair map (word_en -> word_base) is deterministic per session — a fresh
// fetch recomputes the same group pool, letting us pair buttons by text.
let pairs = [];
try {
    const d = await fetch('/api/repeat/pack', { headers: { Accept: 'application/json' } }).then((r) => r.json());
    const g = (d.exercises || []).find((e) => e.type === 'WordMatchItem');
    pairs = (g?.pairs || []).map((p) => ({ en: p.word_en, base: p.word_base }));
} catch (e) {}

const locale = document.cookie.match(/NEXT_LOCALE=([^;]+)/)?.[1] || 'en';
const isMatchScreen = () => {
    const counter = [...document.querySelectorAll('p')].some((p) => /^\s*\d+\s*\/\s*\d+\s*$/.test(p.textContent));
    return counter && document.querySelectorAll('.grid .btn-base').length >= 4;
};

// Phase 1 — advance singles until the match grid renders. Generous budget:
// under capture the fresh context hydrates slowly and each exercise takes
// ~3 ticks (pick → check → next), with up to ~8 singles before the groups.
let idle = 0;
let lastSig = '';
let sameSig = 0;
for (let i = 0; i < 220 && !isMatchScreen(); i++) {
    await sleep(550);
    const sig = norm(document.body.innerText).slice(0, 200);
    if (sig === lastSig) { if (++sameSig > 25) return { error: 'screen not advancing', sig }; }
    else { lastSig = sig; sameSig = 0; }
    const buttons = [...document.querySelectorAll('button')].filter(visible);
    const next = buttons.find((b) => /btn-sky/.test(b.className));
    const check = buttons.find((b) => /btn-green/.test(b.className));
    const inputs = [...document.querySelectorAll('input')].filter(
        (i) => visible(i) && (i.type === 'text' || i.type === '')
    );
    const opts = [...document.querySelectorAll('.grid .btn-base, .grid button')].filter(visible);

    const emptyInputs = inputs.filter((i) => !i.value);
    if (emptyInputs.length) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        emptyInputs.forEach((inp) => { setter.call(inp, 'x'); inp.dispatchEvent(new Event('input', { bubbles: true })); });
        idle = 0; continue;
    }
    // Check before options: it stays disabled until a pick, so an enabled
    // Check means an answer is already selected — confirm it, don't re-pick.
    if (check) { check.click(); idle = 0; continue; }
    // Next before options: after Check the result panel shows a Dalej button
    // while the (styled, not disabled) options stay visible — clicking an
    // option again would stall the loop forever, so advance first.
    if (next) { next.click(); idle = 0; continue; }
    if (opts.length) { opts[0].click(); idle = 0; continue; }
    // word_speak has a "Skip this word" underline link — last resort, after
    // real progress controls (listen screens render decorative underlined
    // divs that must not swallow every tick).
    const skip = [...document.querySelectorAll('div')].find(
        (d) => /underline/.test(d.className) && /cursor-pointer/.test(d.className) && d.offsetParent
    );
    if (skip) { skip.click(); idle = 0; continue; }
    if (++idle > 12) return { error: 'stuck before reaching match screen' };
}
if (!isMatchScreen()) return { error: 'match screen not reached' };
await sleep(800);

// Phase 2 — connect `wantMatched` pairs by visible text.
const enToBase = {};
for (const p of pairs) {
    const b = p.base?.[locale] ?? p.base?.en;
    if (b) enToBase[norm(p.en).toLowerCase()] = norm(b);
}
const leftBtns = () => [...document.querySelectorAll('.grid button:not([lang])')].filter(visible);
const rightBtns = () => [...document.querySelectorAll('.grid button[lang="en"]')].filter(visible);

let matched = 0;
for (const left of leftBtns()) {
    if (matched >= wantMatched) break;
    const lText = norm(left.textContent).toLowerCase();
    const en = Object.keys(enToBase).find((e) => enToBase[e].toLowerCase() === lText);
    if (!en) continue;
    const right = rightBtns().find((b) => norm(b.textContent).toLowerCase() === en);
    if (!right) continue;
    left.click();
    await sleep(300);
    right.click();
    await sleep(650);
    matched++;
}
return { matched };
