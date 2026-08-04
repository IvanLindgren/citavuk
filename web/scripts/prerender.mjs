/**
 * Пререндер статических страниц сайта.
 *
 * Зачем. Одностраничное приложение отдаёт роботу один и тот же `index.html` на
 * всех адресах: `<div id="root">` пуст, а заголовок и описание проставляет
 * `useSeo` уже в браузере. Google JavaScript исполняет и в итоге страницу
 * увидит, но на первом проходе получает 77 одинаковых документов и схлопывает
 * их в один. Яндекс JS почти не рендерит, и для него сайт состоит из одной
 * страницы. Отсюда и семь адресов в индексе вместо семидесяти семи.
 *
 * Что делает. Поднимает статический сервер над `dist/`, обходит headless-
 * браузером все адреса из `dist/sitemap.xml` и сохраняет получившийся HTML.
 * Дальше бот и человек получают один и тот же документ — никакого разделения
 * по User-Agent, а значит и никакого риска попасть под клоакинг.
 *
 * Раскладка ПЛОСКАЯ: `/course` сохраняется в `dist/course.html`, а не в
 * `dist/course/index.html`. Причина в nginx: рядом уже лежит каталог
 * `dist/course/` с ассетами курса, и вариант с каталогом ломает страницу — см.
 * комментарий в `deploy/nginx-site.conf`. Плоский файл ни с чем не совпадает,
 * потому что каталог для `try_files $uri` файлом не является.
 *
 * Запускается из `npm run build` после `vite build`.
 */

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://citavuk.ru';

/** Сколько страниц рендерим одновременно. */
const CONCURRENCY = 4;

/** Сколько ждём появления содержимого, прежде чем считать страницу неудачной. */
const RENDER_TIMEOUT = 20_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * Статический сервер над dist. Повторяет правило nginx: неизвестный путь
 * отдаёт index.html, чтобы маршрутизацией занялось само приложение.
 */
function serveDist() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const target = path.join(DIST, decodeURIComponent(url.pathname));
    const file = existsSync(target) && !target.endsWith(path.sep) && path.extname(target)
      ? target
      : path.join(DIST, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** Адреса берём из sitemap: он и так собирается при сборке и уже исключает
 *  личные разделы, закрытые от индексации. Второго списка маршрутов заводить
 *  нельзя — разойдётся с первым. */
async function routes() {
  const xml = await readFile(path.join(DIST, 'sitemap.xml'), 'utf8');
  const found = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return [...new Set(found.map((loc) => new URL(loc).pathname))].sort();
}

/** Куда сохранить страницу: `/` → dist/index.html, `/course` → dist/course.html. */
function outputFor(route) {
  if (route === '/') return path.join(DIST, 'index.html');
  return path.join(DIST, `${route.replace(/^\/|\/$/g, '')}.html`);
}

async function render(browser, route) {
  const page = await browser.newPage();
  try {
    // Картинки и шрифты для разметки не нужны, а время съедают заметно.
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const type = request.resourceType();
      if (type === 'image' || type === 'font' || type === 'media') request.abort();
      else request.continue();
    });

    const response = await page.goto(`${route.base}${route.path}`, {
      waitUntil: 'networkidle0',
      timeout: RENDER_TIMEOUT,
    });
    if (!response || !response.ok()) throw new Error(`ответ ${response?.status()}`);

    // Ждём, пока приложение действительно нарисует страницу: пустой #root
    // означал бы, что мы сохранили ту же заготовку, ради ухода от которой всё
    // и затевалось.
    await page.waitForFunction(
      () => document.getElementById('root')?.childElementCount > 0,
      { timeout: RENDER_TIMEOUT },
    );

    const html = await page.evaluate((site, pathname) => {
      // Канонический адрес обязателен: без него робот считает страницу
      // дублем главной, потому что содержимое пришло по тому же index.html.
      const canonical = document.head.querySelector('link[rel="canonical"]')
        ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' }));
      canonical.setAttribute('href', site + (pathname === '/' ? '/' : pathname));
      return `<!doctype html>\n${document.documentElement.outerHTML}`;
    }, SITE, route.path);

    const title = await page.title();
    return { html, title };
  } finally {
    await page.close();
  }
}

async function main() {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    console.error('нет dist/index.html — сначала соберите сайт');
    process.exit(1);
  }

  const { server, port } = await serveDist();
  const base = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });

  const list = await routes();
  const failures = [];
  const titles = new Map();

  try {
    for (let i = 0; i < list.length; i += CONCURRENCY) {
      const batch = list.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (pathname) => {
        try {
          const { html, title } = await render(browser, { base, path: pathname });
          const out = outputFor(pathname);
          await mkdir(path.dirname(out), { recursive: true });
          await writeFile(out, html, 'utf8');
          titles.set(pathname, title);
        } catch (error) {
          failures.push(`${pathname}: ${error.message}`);
        }
      }));
    }
  } finally {
    await browser.close();
    server.close();
  }

  // Одинаковые заголовки означают, что пререндер не сработал: ради разных
  // заголовков всё и делается, и молча выложить такую сборку нельзя.
  const unique = new Set(titles.values());
  console.log(`пререндер: ${titles.size} страниц, разных заголовков ${unique.size}`);
  if (failures.length) {
    console.error(`не удалось отрисовать ${failures.length}:`);
    for (const line of failures.slice(0, 10)) console.error(`  ${line}`);
    process.exit(1);
  }
  if (titles.size > 1 && unique.size < 2) {
    console.error('у всех страниц один заголовок — пререндер не дал результата');
    process.exit(1);
  }
}

await main();
