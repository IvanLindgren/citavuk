// Изолированная проверка рулетки: все ответы API — фикстуры, платных вызовов нет.
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const base = process.env.CITAVUK_UI_URL || 'http://127.0.0.1:5188';
assert.equal(new URL(base).hostname, '127.0.0.1');
const catalog = JSON.parse(await readFile(new URL('../../server/internal/speaking/topics.json', import.meta.url), 'utf8'));
const out = path.join(os.tmpdir(), 'citavuk-roulette-ui');
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true });
try {
  for (const [width, height, donor, reduced] of [[1366, 980, true, false], [390, 844, true, false], [360, 740, true, true], [390, 844, false, false]]) {
    const page = await browser.newPage(), errors = [];
    await page.setViewport({ width, height, isMobile: width < 500, hasTouch: width < 500 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => localStorage.setItem('citavuk-token', 'cookie'));
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url()), route = url.pathname.replace(/^\/api\//, '/');
      if (route.startsWith('/v1/')) {
        let body = { items: [], unread: 0 }, status = 200;
        if (route === '/v1/auth/me') body = { id: donor ? 'friend' : 'ordinary', email: 'fixture@example.test', displayName: 'Проверка', emailVerified: true, serbianLevel: 'A2', ...(donor ? { supporterSince: '2026-09-30' } : {}) };
        else if (route === '/v1/games/speaking/access') body = { open: donor, supporter: donor, signedIn: true, publicFrom: '2026-10-13T00:00:00+03:00' };
        else if (route === '/v1/games/speaking/topics') { status = donor ? 200 : 403; body = donor ? catalog : { message: 'Закрыто' }; }
        else if (route.includes('/sync/')) body = { books: [], vocabulary: [], reviews: [], changes: [], cursor: 0, hasMore: false };
        else if (route.startsWith('/v1/daily')) body = { enabled: false, set: null, themes: [], available: [], configured: true, progress: { streak: 0, dueNow: 0, faded: [] } };
        else if (route === '/v1/study') body = { timezone: 'Europe/Moscow', today: '2026-09-30', days: [], freezes: 2 };
        assert.notEqual(route, '/v1/games/speaking/review', 'Проверка интерфейса не вызывает модель');
        await request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
      } else if (url.origin !== new URL(base).origin && !['data:', 'blob:'].includes(url.protocol)) await request.abort();
      else await request.continue();
    });
    await page.goto(`${base}/govori?mode=write`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.textContent.includes('Проверка'));
    if (donor) {
      await page.waitForSelector('[aria-label="Рулетка тем"] canvas');
      await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Выбрать тему')));
      await page.screenshot({ path: path.join(out, `roulette-${width}.png`) });
      await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Выбрать тему')).click());
      await page.waitForSelector('textarea', { timeout: 12000 });
      await page.type('textarea', 'Ovo je moj odgovor na srpskom jeziku.');
      // Потеря контекста после остановки не раскрывает тему второй раз и не стирает ответ.
      await page.evaluate(() => document.querySelector('[aria-label="Рулетка тем"] canvas').getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext());
      await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Ovo je moj odgovor na srpskom jeziku.');
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      await page.screenshot({ path: path.join(out, `answer-${width}.png`), fullPage: true });
    } else {
      await page.waitForFunction(() => document.body.textContent.includes('13 октября'));
      assert.equal(await page.$('[aria-label="Рулетка тем"]'), null);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Горизонтальная прокрутка');
    assert.deepEqual(errors, []);
    console.log(`OK ${width}: ${donor ? `донатер, 3D, текст сохранён${reduced ? ', reduced motion' : ''}` : 'обычный аккаунт, игра закрыта'}`);
    await page.close();
  }
  console.log(out);
} finally { await browser.close(); }
