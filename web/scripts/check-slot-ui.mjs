// Изолированная проверка автомата тем: все ответы API — фикстуры, платных вызовов нет.
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const base = process.env.CITAVUK_UI_URL || 'http://127.0.0.1:5188';
assert.equal(new URL(base).hostname, '127.0.0.1');
const catalog = JSON.parse(await readFile(new URL('../../server/internal/speaking/topics.json', import.meta.url), 'utf8'));
const out = path.join(os.tmpdir(), 'citavuk-slot-ui');
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { args: ['--no-sandbox'] } : {}) });
try {
  for (const [width, height, donor, reduced] of [[1366, 980, true, false], [390, 844, true, false], [360, 740, true, true], [390, 844, false, false]]) {
    const page = await browser.newPage(), errors = [];
    await page.setViewport({ width, height, isMobile: width < 500, hasTouch: width < 500 });
    // Дата открытия задана по Москве: в другом поясе витрина покажет соседний день.
    await page.emulateTimezone('Europe/Moscow');
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
      const machine = '[aria-label="Игровой автомат тем"]';
      const button = text => page.evaluate(label => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes(label)), text);
      await page.waitForSelector(`${machine} canvas`);
      await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Выбрать тему')));
      await page.waitForFunction(() => document.body.textContent.includes('Потяни рычаг'));
      // Автомат реально нарисован, а не пустой холст.
      await page.waitForFunction(() => {
        const canvas = document.querySelector('canvas'), data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;
        for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) painted++;
        return painted > 500;
      });
      await page.screenshot({ path: path.join(out, `slot-idle-${width}.png`) });

      // 1. Рычаг тянут рукой (на телефоне — пальцем): страница при этом не прокручивается.
      const zone = await page.$(`${machine} > div[aria-hidden="true"]`);
      await zone.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await new Promise(resolve => setTimeout(resolve, 800)); // на странице плавная прокрутка
      const box = await zone.boundingBox(), x = box.x + box.width * .4, y1 = box.y + box.height * .12, y2 = box.y + box.height * .78;
      const scrollBefore = await page.evaluate(() => scrollY);
      if (width < 500) {
        const touch = await page.touchscreen.touchStart(x, y1);
        await touch.move(x, (y1 + y2) / 2);
        await touch.move(x, y2);
        await touch.end();
      } else {
        await page.mouse.move(x, y1);
        await page.mouse.down();
        await page.mouse.move(x, y2, { steps: 8 });
        await page.mouse.up();
      }
      // Рычаг запускает ту же игру, что и кнопка; при reduced motion тема раскрывается сразу.
      await page.waitForFunction(label => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes(label)), {}, reduced ? 'Другая тема' : 'Крутится');
      assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'Жест по рычагу прокрутил страницу');
      if (!reduced) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await page.screenshot({ path: path.join(out, `slot-spin-${width}.png`) });
        assert.equal(await button('Крутится'), true, 'Во время вращения кнопка занята');
      }
      await page.waitForSelector('textarea', { timeout: 12000 });
      await page.type('textarea', 'Ovo je moj odgovor na srpskom jeziku.');
      await page.screenshot({ path: path.join(out, `slot-landed-${width}.png`) });

      // 2. Второй запуск — просто тапом по рычагу: тема меняется, ответ сбрасывается.
      await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Другая тема')));
      await zone.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await new Promise(resolve => setTimeout(resolve, 800));
      const again = await zone.boundingBox();
      const before = await page.$eval('.scroll-mt-20 h2', h => h.textContent);
      await page.mouse.click(again.x + again.width * .4, again.y + again.height * .15);
      // Экран выбирает другую тему; при reduced motion она раскрывается сразу.
      await page.waitForFunction(text => document.querySelector('.scroll-mt-20 h2')?.textContent !== text, { timeout: 8000 }, before);
      await page.waitForSelector('textarea', { timeout: 12000 });
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      await page.screenshot({ path: path.join(out, `slot-answer-${width}.png`), fullPage: true });
    } else {
      await page.waitForFunction(() => document.body.textContent.includes('13 октября'));
      assert.equal(await page.$('[aria-label="Игровой автомат тем"]'), null);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Горизонтальная прокрутка');
    assert.deepEqual(errors, []);
    console.log(`OK ${width}: ${donor ? `донатер, автомат, рычаг тянется и тапается${reduced ? ', reduced motion' : ''}` : 'обычный аккаунт, игра закрыта'}`);
    await page.close();
  }
  console.log(out);
} finally { await browser.close(); }
