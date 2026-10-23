import fs from 'fs';
const cfg = JSON.parse(fs.readFileSync('C:/wamp64/www/appscreen/tools/scenarios.json','utf8'));
const OUT = 'C:/wamp64/www/appscreen/tools/smoke';
fs.mkdirSync(OUT, { recursive: true });
const report = [];
for (const s of cfg.scenarios) {
    const t0 = Date.now();
    try {
        const job = await fetch('http://127.0.0.1:3777/capture', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: cfg.baseUrl + s.path, locales: ['pl'], auth: 'demo',
                waitMs: 1500, waitSelector: null,
                viewport: { width: 1320, height: 2868 }, format: 'iphone-6.9',
                steps: s.steps,
            }),
        }).then(r => r.json());
        if (!job.ok) { report.push({ id: s.id, status: 'submit-fail', error: JSON.stringify(job) }); continue; }
        let j;
        const deadline = Date.now() + 8 * 60 * 1000;
        do {
            await new Promise(r => setTimeout(r, 10000));
            j = await fetch(`http://127.0.0.1:3777/job?id=${job.jobId}`).then(r => r.json());
        } while (!j.finished && Date.now() < deadline);
        const r = j.results?.pl || {};
        if (r.status === 'ok') fs.writeFileSync(`${OUT}/${s.id}.png`, Buffer.from(r.image.split(',')[1], 'base64'));
        report.push({ id: s.id, status: r.status || 'timeout', error: r.error || '', secs: Math.round((Date.now() - t0) / 1000) });
    } catch (e) {
        report.push({ id: s.id, status: 'exception', error: String(e).slice(0, 200) });
    }
    console.log(report.at(-1).id, '→', report.at(-1).status, report.at(-1).error || '');
}
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log('\n=== REPORT ===');
for (const r of report) console.log(`${r.status.padEnd(12)} ${r.id} ${r.error || ''} (${r.secs || 0}s)`);
