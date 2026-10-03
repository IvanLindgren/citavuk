// Обходит сайт на не русском языке и собирает видимый русский текст, который
// словарь не перевёл: так находятся строки, собранные кодом на лету.
//
// node scripts/i18n-crawl.mjs http://localhost:5173 en > leftovers.json
import puppeteer from 'puppeteer';

const base = process.argv[2] ?? 'http://localhost:5173';
const lang = process.argv[3] ?? 'en';
const ROUTES = [
  '/', '/daily', '/login', '/library', '/public-library', '/friends-library', '/cards', '/palace',
  '/account', '/listening', '/audio-files', '/events', '/course', '/roadmap', '/lessons', '/vukotok',
  '/teachers', '/dialogues', '/dialogues/drinkit', '/trainer', '/padezi', '/govori', '/basta', '/putovanje',
  '/exams', '/trainer/translation-duel', '/books', '/materials', '/downloads', '/privacy', '/about',
  '/support', '/supporters', '/course/lesson/l_pismo_1', '/nope',
  ...(process.argv[4] ? process.argv[4].split(',') : []),
];

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${base}/?lang=${lang}`, { waitUntil: 'networkidle2', timeout: 60000 });
const found = {};
for (const route of ROUTES) {
  try {
    await page.goto(base + route, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const texts = await page.evaluate(() => {
      const out = [];
      const skip = 'script, style, textarea, [translate="no"], [data-no-i18n], noscript';
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const value = node.nodeValue?.replace(/\s+/g, ' ').trim();
        if (!value || !/[А-Яа-яЁё]/.test(value)) continue;
        if (node.parentElement?.closest(skip)) continue;
        out.push(value);
      }
      for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) {
        for (const name of ['placeholder', 'title', 'aria-label', 'alt']) {
          const value = el.getAttribute(name);
          if (value && /[А-Яа-яЁё]/.test(value) && !el.closest(skip)) out.push(`@${name}: ${value}`);
        }
      }
      if (/[А-Яа-яЁё]/.test(document.title)) out.push(`@title: ${document.title}`);
      return out;
    });
    for (const text of texts) (found[text] ??= []).push(route);
  } catch (error) {
    found[`!! ${route}: ${error.message}`] = [route];
  }
}
await browser.close();
process.stdout.write(JSON.stringify(found, null, 1));
