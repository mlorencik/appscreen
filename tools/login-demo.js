/**
 * Logs the seeded demo account into LearnMe headlessly and saves a fresh
 * Playwright storageState to tools/.auth/demo.json for auto-capture.
 *
 *   node tools/login-demo.js
 */

const path = require('path');
const fs = require('fs');

const APP_DIR = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, '.auth', 'demo.json');
const BASE = process.env.LEARNME_URL || 'http://localhost:3000';

// Credentials live in gitignored tools/accounts.json (see accounts.example.json)
const { email: EMAIL, password: PASSWORD } = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'accounts.json'), 'utf8')
).demo;

function loadPlaywright() {
    const candidates = [
        process.env.PLAYWRIGHT_PATH,
        path.resolve(APP_DIR, '../learnme/app/node_modules/playwright'),
        path.resolve(APP_DIR, '../learnme/app/node_modules/playwright-core'),
        'playwright',
        'playwright-core',
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            return require(candidate);
        } catch (e) { /* next */ }
    }
    throw new Error('Playwright not found');
}

(async () => {
    const pw = loadPlaywright();
    const browser = await pw.chromium.launch({ headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#email', { state: 'visible', timeout: 30000 });
    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await Promise.all([
        page.waitForResponse((res) => res.url().includes('/api/auth/callback/credentials'), { timeout: 60000 }).catch(() => {}),
        page.locator('button[type=submit]').click(),
    ]);
    await page.waitForURL(/dashboard/, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => localStorage.setItem('lmpro-theme', 'auto')).catch(() => {});
    await page.waitForTimeout(2000);

    const cookies = await context.cookies(BASE);
    if (!cookies.some((c) => c.name.includes('session-token'))) {
        console.error('LOGIN FAILED — no session cookie');
        process.exit(1);
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await context.storageState({ path: OUT });
    console.log(`saved ${OUT}`);

    // verify backend auth survives a fresh context
    const vctx = await browser.newContext({ storageState: OUT, ignoreHTTPSErrors: true });
    const vp = await vctx.newPage();
    await vp.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await vp.waitForTimeout(5000);
    const me = await vp.evaluate(async () => {
        try { return (await fetch('/api/me', { headers: { Accept: 'application/json' } })).status; }
        catch { return 0; }
    });
    console.log(`verify /api/me -> ${me} ${me === 200 ? 'OK' : 'FAILED'} (final: ${vp.url()})`);
    await browser.close();
    process.exit(me === 200 ? 0 : 2);
})();
