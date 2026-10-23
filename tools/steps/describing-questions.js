// Runs on /dashboard/describing/{id}. Fills the step-0 description textarea by
// clicking the hint chips (≥50 chars unlocks Next), then walks the question
// steps and selects the correct answer via `valid_answer` read from React
// props. Stops on the last question with the correct option highlighted.
// `arg` = how many questions to answer (default: all but the last one is
// left answered — we stop on the final question with a selection visible).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
const visible = (el) => !!(el && el.offsetParent);
const maxAnswered = Math.max(1, Number(arg) || 2);

// The pack payload (questions + valid_answer) is inside React props — walk the
// fiber tree up from the question heading to grab it.
const packData = () => {
    for (const el of document.querySelectorAll('h2, h1, textarea, img')) {
        const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
        let f = key && el[key];
        while (f) {
            const d = f.memoizedProps?.data?.data ?? f.memoizedProps?.data;
            if (d?.questions?.length) return d;
            f = f.return;
        }
    }
    return null;
};

const nextBtn = () => [...document.querySelectorAll('button')].find(
    (b) => visible(b) && !b.disabled && /btn-sky/.test(b.className)
);

// Step 0: click hint chips until the textarea reaches the 50-char minimum.
for (let i = 0; i < 40; i++) {
    const ta = document.querySelector('textarea');
    if (!ta) break;
    if ((ta.value || '').length >= 55) break;
    const chips = [...document.querySelectorAll('button')].filter(
        (b) => visible(b) && !/opacity-30/.test(b.className) && /rounded-lg/.test(b.className) && /h-6/.test(b.className)
    );
    if (!chips.length) break;
    chips[0].click();
    await sleep(150);
}
// Fallback if there were no hint chips.
const ta = document.querySelector('textarea');
if (ta && (ta.value || '').length < 50) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'In the picture I can see people spending time together.');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
}

let answered = 0;
let idle = 0;
for (let i = 0; i < 120; i++) {
    await sleep(500);
    const data = packData();
    const totalQ = data?.questions?.length ?? 0;

    // On a question step: pick the correct option by matching the heading text.
    const h2 = [...document.querySelectorAll('h2')].find(visible);
    const qIdx = h2 && data ? data.questions.findIndex((q) => norm(q.question) === norm(h2.textContent)) : -1;

    if (qIdx >= 0) {
        const q = data.questions[qIdx];
        const want = norm(q['answer_' + q.valid_answer] || '');
        const opts = [...document.querySelectorAll('button.btn-base')].filter(visible);
        const already = opts.find((b) => /bg-sky-200/.test(b.className));
        if (!already) {
            const pick = opts.find((b) => norm(b.textContent).toLowerCase() === want.toLowerCase()) || opts[0];
            if (pick) { pick.click(); idle = 0; continue; }
        } else {
            answered = Math.max(answered, qIdx + 1);
            if (answered >= Math.min(maxAnswered, totalQ)) return { answered, last: qIdx };
        }
    }

    // Advance when Next is enabled — on step 0 (textarea filled) or after an
    // answered question.
    const next = nextBtn();
    if (next && answered < Math.min(maxAnswered, totalQ)) {
        next.click();
        idle = 0;
        continue;
    }
    if (++idle > 30) return { error: 'stalled', answered, qIdx, totalQ };
}
return { error: 'budget exhausted', answered };
