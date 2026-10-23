// Runs inside the lesson item page (/dashboard/lessons/{lesson}/{item}).
// `arg` is 'wrong' or 'correct'. Fetches the item JSON to learn the
// valid_answers, then picks a deliberately wrong (or correct) option and
// presses the Check button so the feedback state is visible on screen.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => !!(el && el.offsetParent);

// Read the exercise actually rendered on screen via React props — the API
// returns a shuffled random subset of items[], so the fetched payload cannot
// be trusted. Several panels can coexist in the DOM during slide animations,
// so correlate fiber data with the *visible* option buttons.
const fiberData = () => {
    const cands = [];
    for (const el of document.querySelectorAll('button.btn-base, h2, input')) {
        if (!visible(el)) continue;
        const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
        let f = key && el[key];
        while (f) {
            const d = f.memoizedProps?.data;
            if (d && d.sentence && (Array.isArray(d.select_options) || typeof d.correct === 'boolean')) {
                cands.push(d);
                break;
            }
            f = f.return;
        }
    }
    if (!cands.length) return null;
    const texts = [...document.querySelectorAll('button.btn-base')]
        .filter(visible)
        .map((b) => b.textContent.trim().toLowerCase());
    return cands.find(
        (d) => Array.isArray(d.select_options) && d.select_options.length
            && d.select_options.every((o) => texts.includes(String(o).trim().toLowerCase()))
    ) || cands[0];
};

let ex = fiberData();
if (!ex) {
    const m = location.pathname.match(/lessons\/(\d+)\/(\d+)/);
    if (m) {
        try {
            const res = await fetch(`/api/lessons/item/${m[2]}`, { headers: { Accept: 'application/json' } });
            const data = await res.json();
            const found = [];
            const find = (o, d) => {
                if (!o || typeof o !== 'object' || d > 6) return;
                if (o.valid_answers && (o.select_options || o.sentence)) found.push(o);
                else if (typeof o.correct === 'boolean' && o.sentence) found.push(o);
                for (const v of Object.values(o)) if (v && typeof v === 'object') find(v, d + 1);
            };
            find(data, 0);
            // Match the sentence text on screen (gap [..] rendered as input).
            const h2 = document.querySelector('h2');
            const shown = (h2?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            ex = found.find((c) => {
                const s = String(c.sentence || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
                return shown && s && (shown.includes(s) || s.includes(shown));
            }) || found[0] || null;
        } catch (e) {
            // fall through — still answer, just without knowing the right option
        }
    }
}

const correct = ex
    ? (String(ex.valid_answers || '').match(/\[[^\]]*\]/g) || []).map((s) => s.slice(1, -1).trim().toLowerCase())
    : [];
const wantWrong = arg === 'wrong';

// ExerciseCorrect renders a pair of btn-base buttons with ✓ (true) / ✗ (false)
// icons that keep their red/green verdict colors after checking.
const btnTrue = [...document.querySelectorAll('button.btn-base')].find(
    (b) => visible(b) && b.querySelector('svg[class*="tabler-icon-check"]')
);
const btnFalse = [...document.querySelectorAll('button.btn-base')].find(
    (b) => visible(b) && b.querySelector('svg[class*="tabler-icon-x"]')
);

if (typeof ex?.correct === 'boolean' && btnTrue && btnFalse) {
    const wrong = wantWrong ? (ex.correct ? btnFalse : btnTrue) : (ex.correct ? btnTrue : btnFalse);
    wrong.click();
    await sleep(400);
} else {
    // Skip disabled inputs — in 'select'/'check' exercises the sentence input
    // is disabled and just mirrors the picked option; writing into it was the
    // "xxxx" bug. Only a truly fillable input should take the typing path.
    const input = [...document.querySelectorAll('input')].find(
        (i) => visible(i) && !i.disabled && !i.readOnly
            && !['checkbox', 'radio', 'hidden', 'submit', 'button'].includes(i.type)
    );

    if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, wantWrong ? 'xxxx' : correct[0] || 'test');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(300);
    } else {
        const opts = [...document.querySelectorAll('button.btn-base, .grid button')].filter(visible);
        // Prefer a wrong option from the same inflection family as the correct
        // answer — "There are a cat" is obviously wrong, while "There was a
        // cat" would look correct on a marketing screenshot.
        const FAMILY = {
            is: 'are', was: 'were', has: 'have', does: 'do', am: 'are',
            goes: 'go', lives: 'live', works: 'work', plays: 'play', reads: 'read',
            speaks: 'speak', likes: 'like', wants: 'want', needs: 'need', eats: 'eat',
            drinks: 'drink', sings: 'sing', buys: 'buy', watches: 'watch',
            studies: 'study', teaches: 'teach', dances: 'dance', makes: 'make',
        };
        let pick;
        if (correct.length) {
            const partner = FAMILY[correct[0]];
            pick = wantWrong
                ? opts.find((b) => partner && b.textContent.trim().toLowerCase() === partner)
                    || opts.find((b) => !correct.includes(b.textContent.trim().toLowerCase()))
                : opts.find((b) => correct.includes(b.textContent.trim().toLowerCase()));
        }
        pick = pick || (wantWrong ? opts[opts.length - 1] : opts[0]);
        if (pick) pick.click();
        await sleep(400);
    }
}

// Keep pressing Check until the verdict replaces it with the Next button —
// a single click can land while the button is still disabled and no-op.
for (let i = 0; i < 25; i++) {
    const check = [...document.querySelectorAll('button')].find((b) => /btn-green/.test(b.className) && visible(b));
    if (!check) break;
    if (!check.disabled) check.click();
    await sleep(300);
}
await sleep(1600);
return { picked: wantWrong ? 'wrong' : 'correct', knewAnswers: correct.length > 0 };
