// Runs inside a hearing/describing pack page (/<type>/{id}). Advances past
// the intro/listening screen, correctly answers `arg` questions (default 1)
// and leaves the NEXT question with a selected answer on screen — the shot
// shows comprehension questions in progress.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => !!(el && el.offsetParent) && !el.disabled;
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

const m = location.pathname.match(/(hearing|reading|describing)\/(\d+)/);
let questions = [];
if (m) {
    try {
        const d = await fetch(`/api/${m[1]}/${m[1]}/${m[2]}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
        questions = d.data?.questions || [];
    } catch (e) {}
}

const qDone = arg == null ? 1 : Number(arg);
let answered = 0;

for (let i = 0; i < 40; i++) {
    await sleep(650);
    const q = questions[answered];
    const opts = q ? [q.answer_1, q.answer_2, q.answer_3, q.answer_4].filter(Boolean).map(norm) : [];
    const buttons = [...document.querySelectorAll('button')].filter(visible);
    const optionBtns = opts.length ? buttons.filter((b) => opts.includes(norm(b.textContent))) : [];

    if (optionBtns.length) {
        const correctText = norm(q['answer_' + q.valid_answer]);
        const pick = optionBtns.find((b) => norm(b.textContent) === correctText) || optionBtns[0];
        if (!/border-sky-600/.test(pick.className)) { pick.click(); await sleep(400); }
        if (answered >= qDone) return { answered, stoppedOn: answered + 1 };
        const next = buttons.find((b) => /btn-sky/.test(b.className));
        if (!next) break;
        next.click();
        answered++;
        await sleep(700);
        continue;
    }
    // Not a question screen yet — hit the main CTA (intro "I've listened").
    const next = buttons.find((b) => /btn-sky/.test(b.className));
    if (!next) break;
    next.click();
}
return { answered };
