/**
 * Local capture backend for appscreen "Auto-capture".
 *
 * Starts a tiny HTTP server on 127.0.0.1:3777 that drives Playwright
 * (resolved from the LearnMe app's node_modules, or PLAYWRIGHT_PATH).
 * For each requested locale it opens an isolated browser context with
 * NEXT_LOCALE cookie set, optionally replays interaction steps and
 * returns a PNG screenshot as a data URL.
 *
 * Endpoints:
 *   GET  /health              -> { ok, playwright }
 *   GET  /profiles?dir=...    -> { ok, profiles: [name,...] }
 *   POST /login               -> headed browser; saves storageState on window close
 *   POST /capture             -> { jobId, total }   (body: capture spec, see runCapture)
 *   GET  /job?id=N            -> { done, total, finished, results }
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');

const HOST = '127.0.0.1';
const PORT = 3777;
const APP_DIR = path.resolve(__dirname, '..');
const DEFAULT_AUTH_DIR = process.env.CAPTURE_AUTH_DIR || 'C:/wamp64/www/learnme/app/e2e/.auth';
const LOCAL_AUTH_DIR = path.join(APP_DIR, 'tools', '.auth');
const CONCURRENCY = 2; // php dev backend is effectively single-threaded — keep SSR starvation low

fs.mkdirSync(LOCAL_AUTH_DIR, { recursive: true });

const DEFAULT_LOCALES = ['pl', 'en', 'de', 'fr', 'es', 'it', 'nl', 'ro', 'cs', 'sv', 'pt', 'el', 'no', 'uk', 'hr', 'sl', 'et', 'lt', 'lv', 'sk', 'bg', 'fi', 'da'];

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
        } catch (e) {
            // try next candidate
        }
    }
    return null;
}

const pw = loadPlaywright();

let browserPromise = null;
function getBrowser() {
    if (!browserPromise) {
        browserPromise = pw.chromium.launch({ headless: true });
    }
    return browserPromise;
}

const jobs = new Map();
let nextJobId = 1;

function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function resolveTpl(str, vars) {
    return String(str ?? '').replace(/\{(\w+)\}/g, (_, key) => {
        if (vars[key] == null) throw new Error(`template var {${key}} has no value — an earlier apiFetch returned nothing`);
        return encodeURIComponent(String(vars[key]));
    });
}

const STEPS_DIR = path.join(__dirname, 'steps');

async function runSteps(page, steps, vars = {}) {
    for (const step of Array.isArray(steps) ? steps : []) {
        switch (step.do) {
            case 'goto': {
                const target = resolveTpl(step.url, vars);
                const url = /^https?:\/\//.test(target) ? target : new URL(target, page.url()).href;
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: step.timeout ?? 60000 });
                break;
            }
            case 'apiFetch': {
                const endpoint = resolveTpl(step.endpoint, vars);
                const value = await page.evaluate(async ({ endpoint, pickJs }) => {
                    const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
                    const data = await res.json().catch(() => ({}));
                    if (!pickJs) return data;
                    return new Function('data', `return (${pickJs});`)(data);
                }, { endpoint, pickJs: step.pickJs });
                if (value == null) throw new Error(`apiFetch ${endpoint}: pickJs returned null`);
                vars[step.into || 'value'] = value;
                break;
            }
            case 'evalFile': {
                const file = path.basename(String(step.file || ''));
                const src = fs.readFileSync(path.join(STEPS_DIR, file), 'utf8');
                await page.evaluate(
                    ({ src, arg }) => new Function('arg', `return (async () => { ${src}\n })();`)(arg),
                    { src, arg: step.arg }
                );
                break;
            }
            case 'click':
                await page.click(step.selector, { timeout: step.timeout ?? 10000 });
                break;
            case 'fill':
                await page.fill(step.selector, String(step.value ?? ''));
                break;
            case 'press':
                await page.press(step.selector || 'body', step.key);
                break;
            case 'hover':
                await page.hover(step.selector, { timeout: step.timeout ?? 10000 });
                break;
            case 'wait':
                await page.waitForTimeout(step.ms ?? 500);
                break;
            case 'waitFor':
                await page.waitForSelector(step.selector, { timeout: step.timeout ?? 15000 });
                break;
            case 'scrollTo':
                await page.evaluate((y) => window.scrollTo(0, y), step.y ?? 0);
                break;
            case 'eval':
                await page.evaluate(step.js);
                break;
        }
    }
}

async function gotoWithRetry(page, url, navTimeout) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
    } catch (e) {
        // One retry — the dev SSR stalls under parallel load; a fresh nav often lands.
        await page.goto(url, { waitUntil: 'commit', timeout: navTimeout }).catch(() => {});
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
        if (!await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0)) throw e;
    }
}

// Wait until the rendered text stops growing (hydration/data settle) — a fixed
// ms wait alone is unreliable across locales with different SSR speeds.
async function waitForContentSettle(page, { timeout = 15000, minChars = 300 } = {}) {
    let last = -1, stable = 0;
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const len = await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0);
        if (len >= minChars && len === last) {
            if (++stable >= 2) return;
        } else {
            stable = 0;
        }
        last = len;
        await page.waitForTimeout(500);
    }
}

// Draw the captured PNG into a canvas inside the page and measure how
// uniform/gray it is — catches screenshots taken before the app rendered.
async function analyzeShot(page, buffer) {
    const dataUrl = 'data:image/png;base64,' + buffer.toString('base64');
    return page.evaluate(async (src) => {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
        const sw = 96;
        const sh = Math.max(1, Math.round(img.height * sw / img.width));
        const cv = document.createElement('canvas');
        cv.width = sw;
        cv.height = sh;
        const cx = cv.getContext('2d');
        cx.drawImage(img, 0, 0, sw, sh);
        const d = cx.getImageData(0, 0, sw, sh).data;
        const total = sw * sh;
        let flat = 0, white = 0, colorful = 0;
        const buckets = new Set();
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
            if (a < 10) continue;
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            // skeleton-ish flat fill: mid-light grays only. Near-white is
            // counted separately — legit pages have white backgrounds.
            if (mx - mn < 14 && mx > 180 && mx <= 245) flat++;
            if (mx - mn < 14 && mx > 245) white++;
            if (mx - mn > 40) colorful++;
            buckets.add((r >> 5) * 64 + (g >> 5) * 8 + (b >> 5));
        }
        return { flatFrac: flat / total, whiteFrac: white / total, colorfulFrac: colorful / total, distinct: buckets.size };
    }, dataUrl).catch(() => null);
}

async function captureLocale(browser, spec, lang) {
    const context = await browser.newContext({
        viewport: spec.viewport,
        deviceScaleFactor: spec.deviceScaleFactor ?? 1,
        isMobile: !!spec.isMobile,
        hasTouch: !!spec.hasTouch,
        userAgent: spec.userAgent || undefined,
        locale: lang,
        extraHTTPHeaders: { 'Accept-Language': `${lang},en;q=0.8` },
        storageState: spec.storageStatePath || undefined,
        ignoreHTTPSErrors: true,
    });
    try {
        const origin = new URL(spec.url).origin;
        await context.addCookies([
            { name: 'NEXT_LOCALE', value: lang, url: origin },
            { name: 'NEXT_LOCALE_CHOICE', value: lang, url: origin },
        ]);
        // LearnMe syncs NEXT_LOCALE from user.language on the profile (once per
        // session), which would stomp our cookie. Rewrite /api/me so the app
        // itself persists the target locale — UI + content stay consistent.
        if (spec.localizeUser !== false) {
            await context.route('**/api/me', async (route) => {
                try {
                    const res = await route.fetch();
                    const body = await res.json().catch(() => null);
                    if (body && typeof body === 'object') {
                        if ('language' in body) body.language = lang;
                        if (body.extra_data && typeof body.extra_data === 'object') {
                            body.extra_data.native_language = lang;
                        }
                    }
                    await route.fulfill({ response: res, json: body ?? undefined });
                } catch {
                    await route.continue();
                }
            });
        }
        const page = await context.newPage();
        await gotoWithRetry(page, spec.url, spec.navTimeout ?? 90000);
        const vars = {};
        await runSteps(page, spec.steps, vars);
        if (spec.wait?.selector) {
            await page.waitForSelector(spec.wait.selector, { timeout: spec.wait.timeout ?? 15000 });
        }
        if (spec.wait?.ms) {
            await page.waitForTimeout(spec.wait.ms);
        }
        if (spec.settle !== false) {
            await waitForContentSettle(page);
        }
        // Wait out skeleton/loading placeholders still mounted in the DOM —
        // a settled innerText can still mean gray skeleton blocks.
        for (let i = 0; i < 8; i++) {
            const pending = await page.evaluate(() =>
                document.querySelectorAll('.animate-pulse, [class*="skeleton" i], [class*="Skeleton"], [aria-busy="true"]').length
            ).catch(() => 0);
            if (!pending) break;
            await page.waitForTimeout(1500);
        }
        // Detect a redirect to login/welcome so the caller sees a clear
        // "session expired" result instead of a screenshot of the login page.
        const wantedPath = new URL(spec.url).pathname;
        const wantedBase = '/' + (wantedPath.split('/').filter(Boolean)[0] || '');
        const finalPath = new URL(page.url()).pathname;
        const looksAuth = /\/(auth|login|signin|welcome|onboarding)(\/|$)/i.test(finalPath);
        const wantedAuth = /\/(auth|login|signin|welcome|onboarding)(\/|$)/i.test(wantedPath);
        const landedElsewhere = wantedBase !== '/' && !finalPath.startsWith(wantedBase);
        if ((looksAuth && !wantedAuth) || landedElsewhere) {
            return { status: 'auth', error: `redirected to ${finalPath} — session expired; use Login… to refresh the profile` };
        }
        // Hide Next.js dev overlay (issues badge, build watcher) — dev-mode-only
        // chrome that must never end up on marketing screenshots.
        await page.addStyleTag({
            content: 'nextjs-portal, [data-nextjs-dev-tools-button], #__next-build-watcher, [data-nextjs-dialog-overlay] { display: none !important; }',
        }).catch(() => {});
        // Shoot, then verify the PNG isn't a blank/gray frame — with one
        // auto-retry after an extra wait before reporting a failure.
        let buffer = await page.screenshot({ type: 'png' });
        for (let attempt = 0; attempt < 2; attempt++) {
            const stats = await analyzeShot(page, buffer);
            // Flag skeleton screens (lots of flat gray) and truly blank pages
            // (almost only white + a couple of colors). A white page with real
            // content has many distinct buckets + dark text pixels, so it passes.
            const blank = stats && (
                stats.flatFrac > 0.5 ||
                (stats.distinct < 10 && stats.whiteFrac > 0.9 && stats.colorfulFrac < 0.005)
            );
            if (!blank) break;
            if (attempt === 1) {
                return { status: 'error', error: `page looks blank/gray (distinct=${stats?.distinct}, flat=${stats?.flatFrac?.toFixed(2)}) — use Retry` };
            }
            await page.waitForTimeout(5000);
            buffer = await page.screenshot({ type: 'png' });
        }
        return { status: 'ok', image: 'data:image/png;base64,' + buffer.toString('base64'), finalUrl: page.url() };
    } catch (err) {
        return { status: 'error', error: String(err?.message || err).slice(0, 400) };
    } finally {
        await context.close().catch(() => {});
    }
}

async function runJob(job, spec) {
    const browser = await getBrowser();
    const queue = [...job.locales];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
            const lang = queue.shift();
            job.results[lang] = { status: 'running' };
            job.results[lang] = await captureLocale(browser, spec, lang);
            job.done++;
        }
    });
    await Promise.all(workers);
    job.finished = true;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; if (data.length > 2e6) req.destroy(); });
        req.on('end', () => {
            try { resolve(JSON.parse(data || '{}')); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    const u = new URL(req.url, `http://${HOST}:${PORT}`);

    if (u.pathname === '/health') {
        return json(res, { ok: true, playwright: !!pw });
    }

    if (u.pathname === '/profiles') {
        const dirs = [LOCAL_AUTH_DIR, u.searchParams.get('dir') || DEFAULT_AUTH_DIR];
        const profiles = new Set();
        for (const dir of dirs) {
            try {
                fs.readdirSync(dir)
                    .filter((f) => f.endsWith('.json'))
                    .forEach((f) => profiles.add(path.basename(f, '.json')));
            } catch (e) {
                // dir missing or unreadable — skip
            }
        }
        return json(res, { ok: true, profiles: [...profiles], dir: dirs[0] });
    }

    if (u.pathname === '/scenarios') {
        try {
            const raw = fs.readFileSync(path.join(__dirname, 'scenarios.json'), 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(raw);
        } catch (e) {
            return json(res, { ok: false, error: 'scenarios.json missing', scenarios: [] });
        }
        return;
    }

    // Verify a saved profile: opens a context with the storage state, loads the
    // page, then checks NextAuth session + backend /api/me from the page itself.
    if (u.pathname === '/check-auth' && req.method === 'POST') {
        if (!pw) return json(res, { ok: false, error: 'Playwright not found' }, 500);
        let body;
        try {
            body = await readBody(req);
        } catch (e) {
            return json(res, { ok: false, error: 'Invalid JSON body' }, 400);
        }
        const url = /^https?:\/\//.test(body.url || '') ? body.url : 'http://localhost:3000/dashboard';
        let statePath = null;
        if (body.auth && body.auth !== 'none' && /^[a-z0-9_-]+$/i.test(body.auth)) {
            for (const dir of [LOCAL_AUTH_DIR, body.authDir || DEFAULT_AUTH_DIR]) {
                const p = path.join(dir, `${body.auth}.json`);
                if (fs.existsSync(p)) { statePath = p; break; }
            }
            if (!statePath) return json(res, { ok: true, authenticated: false, error: `profile "${body.auth}" not found` });
        }
        const browser = await getBrowser();
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            storageState: statePath || undefined,
            ignoreHTTPSErrors: true,
        });
        try {
            const origin = new URL(url).origin;
            await context.addCookies([
                { name: 'NEXT_LOCALE', value: 'en', url: origin },
                { name: 'NEXT_LOCALE_CHOICE', value: 'en', url: origin },
            ]);
            const page = await context.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(6000);
            const probe = await page.evaluate(async () => {
                const get = async (p) => {
                    try {
                        const r = await fetch(p, { headers: { Accept: 'application/json' } });
                        return { status: r.status, data: await r.json().catch(() => null) };
                    } catch (e) {
                        return { status: 0, data: null };
                    }
                };
                return { session: await get('/api/auth/session'), me: await get('/api/me') };
            });
            const wantedBase = '/' + (new URL(url).pathname.split('/').filter(Boolean)[0] || '');
            const finalPath = new URL(page.url()).pathname;
            const authed = probe.me.status === 200;
            const landedOnAuth =
                /\/(auth|login|signin|welcome|onboarding)(\/|$)/i.test(finalPath) ||
                (wantedBase !== '/' && !finalPath.startsWith(wantedBase));
            return json(res, {
                ok: true,
                authenticated: authed,
                sessionUser: probe.session.data?.user?.email || null,
                meStatus: probe.me.status,
                finalUrl: page.url(),
                landedOnAuth,
            });
        } finally {
            await context.close().catch(() => {});
        }
    }

    if (u.pathname === '/capture' && req.method === 'POST') {
        if (!pw) {
            return json(res, { ok: false, error: 'Playwright not found. Set PLAYWRIGHT_PATH or install playwright.' }, 500);
        }
        let spec;
        try {
            spec = await readBody(req);
        } catch (e) {
            return json(res, { ok: false, error: 'Invalid JSON body' }, 400);
        }
        if (!spec.url || !/^https?:\/\//.test(spec.url)) {
            return json(res, { ok: false, error: 'spec.url must be an http(s) URL' }, 400);
        }
        if (!spec.viewport?.width || !spec.viewport?.height) {
            return json(res, { ok: false, error: 'spec.viewport {width,height} required' }, 400);
        }

        // Resolve storage state: "premium" -> tools/.auth/premium.json
        // (local first), then the LearnMe e2e .auth dir. "none" -> no auth.
        if (spec.auth && spec.auth !== 'none' && /^[a-z0-9_-]+$/i.test(spec.auth)) {
            for (const dir of [LOCAL_AUTH_DIR, spec.authDir || DEFAULT_AUTH_DIR]) {
                const p = path.join(dir, `${spec.auth}.json`);
                if (fs.existsSync(p)) { spec.storageStatePath = p; break; }
            }
        }

        const locales = Array.isArray(spec.locales) && spec.locales.length
            ? spec.locales.filter((l) => /^[a-z]{2}(-[a-z]{2})?$/i.test(l))
            : DEFAULT_LOCALES;

        const job = {
            id: nextJobId++,
            locales,
            total: locales.length,
            done: 0,
            finished: false,
            results: {},
        };
        jobs.set(job.id, job);
        runJob(job, spec).catch((err) => {
            job.finished = true;
            job.fatal = String(err?.message || err);
        });
        return json(res, { ok: true, jobId: job.id, total: job.total });
    }

    // Accounts that can log in without a headed window — kept in the
    // gitignored tools/accounts.json so credentials never hit the repo.
    const AUTO_ACCOUNTS = (() => {
        try {
            return JSON.parse(fs.readFileSync(path.join(__dirname, 'accounts.json'), 'utf8'));
        } catch {
            return {};
        }
    })();
    let loginRunning = false;

    if (u.pathname === '/login' && req.method === 'POST') {
        if (!pw) {
            return json(res, { ok: false, error: 'Playwright not found' }, 500);
        }
        if (loginRunning) {
            return json(res, { ok: false, error: 'a login session is already open' }, 409);
        }
        let body;
        try {
            body = await readBody(req);
        } catch (e) {
            return json(res, { ok: false, error: 'Invalid JSON body' }, 400);
        }
        const profile = String(body.profile || 'default').replace(/[^a-z0-9_-]/gi, '');
        const url = /^https?:\/\//.test(body.url || '') ? body.url : 'http://localhost:3000';
        const savePath = path.join(LOCAL_AUTH_DIR, `${profile}.json`);
        const origin = new URL(url).origin;
        loginRunning = true;
        try {
            const account = AUTO_ACCOUNTS[profile];
            if (account) {
                // Scripted headless login — no window at all.
                const browser = await getBrowser();
                const context = await browser.newContext({ ignoreHTTPSErrors: true });
                const page = await context.newPage();
                try {
                    await page.goto(`${origin}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await page.waitForSelector('#email', { state: 'visible', timeout: 30000 });
                    await page.locator('#email').fill(account.email);
                    await page.locator('#password').fill(account.password);
                    await Promise.all([
                        page.waitForResponse((r) => r.url().includes('/api/auth/callback/credentials'), { timeout: 60000 }).catch(() => {}),
                        page.locator('button[type=submit]').click(),
                    ]);
                    await page.waitForURL(/dashboard/, { timeout: 60000 }).catch(() => {});
                    await page.evaluate(() => localStorage.setItem('lmpro-theme', 'auto')).catch(() => {});
                    await page.waitForTimeout(1500);
                    const cookies = await context.cookies(origin);
                    if (!cookies.some((c) => c.name.includes('session-token'))) {
                        return json(res, { ok: false, error: 'login did not produce a session cookie' }, 500);
                    }
                    fs.mkdirSync(LOCAL_AUTH_DIR, { recursive: true });
                    await context.storageState({ path: savePath });
                } finally {
                    await context.close().catch(() => {});
                }
            } else {
                // Headed browser — user logs in manually on the login form; closing
                // the window keeps the last periodic snapshot (context is dead by
                // the time 'disconnected' fires, so storageState saves on an
                // interval while the window is open). Auto-closes after 3 min.
                const headed = await pw.chromium.launch({ headless: false });
                const context = await headed.newContext({ ignoreHTTPSErrors: true });
                try {
                    const page = await context.newPage();
                    await page.goto(`${origin}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
                } catch (e) {
                    // page may still be usable for manual navigation
                }
                const save = () => context.storageState({ path: savePath }).catch(() => {});
                const saveInterval = setInterval(save, 1000);
                const hookPage = (p) => {
                    p.on('framenavigated', (f) => { if (f === p.mainFrame()) save(); });
                    p.on('close', save);
                };
                context.on('page', hookPage);
                context.pages().forEach(hookPage);
                const autoClose = setTimeout(() => headed.close().catch(() => {}), 3 * 60 * 1000);
                await new Promise((resolve) => headed.on('disconnected', resolve));
                clearTimeout(autoClose);
                clearInterval(saveInterval);
            }
        } finally {
            loginRunning = false;
        }
        if (!fs.existsSync(savePath)) {
            return json(res, { ok: false, error: 'browser closed before saving' }, 500);
        }
        // Verify the saved state really authenticates — reopen it headless and
        // ask the app for /api/me so the caller knows the login persisted.
        let verified = false;
        let meStatus = null;
        try {
            const browser = await getBrowser();
            const vctx = await browser.newContext({ storageState: savePath, ignoreHTTPSErrors: true });
            const vp = await vctx.newPage();
            const origin = new URL(url).origin;
            await vp.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await vp.waitForTimeout(4000);
            meStatus = await vp.evaluate(async () => {
                try { return (await fetch('/api/me', { headers: { Accept: 'application/json' } })).status; }
                catch { return 0; }
            });
            verified = meStatus === 200;
            await vctx.close();
        } catch (e) {
            // verification is best-effort
        }
        return json(res, { ok: true, profile, path: savePath, verified, meStatus });
    }

    if (u.pathname === '/job') {
        const job = jobs.get(Number(u.searchParams.get('id')));
        if (!job) return json(res, { ok: false, error: 'unknown job id' }, 404);
        return json(res, {
            ok: true,
            done: job.done,
            total: job.total,
            finished: job.finished,
            fatal: job.fatal,
            results: job.results,
        });
    }

    if (u.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('appscreen capture-server OK\n');
        return;
    }

    json(res, { ok: false, error: 'not found' }, 404);
});

server.listen(PORT, HOST, () => {
    console.log(`[capture-server] listening on http://${HOST}:${PORT}`);
    console.log(`[capture-server] playwright: ${pw ? 'loaded' : 'NOT FOUND (set PLAYWRIGHT_PATH)'}`);
    console.log(`[capture-server] auth dir: ${DEFAULT_AUTH_DIR}`);
});
