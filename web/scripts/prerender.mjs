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
  // Сотня эпизодов «Слушания» запрашивает один и тот же каталог: держим ответы
  // API в памяти, иначе сборка зависит от сотни запросов к боевому серверу.
  const apiCache = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Повторяем production-прокси: иначе /api/... вернул бы index.html,
    // и пререндер сохранил бы ошибки загрузки вместо каталогов.
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
      try {
        const key = url.pathname + url.search;
        let cached = apiCache.get(key);
        if (!cached) {
          const response = await fetch('https://api.citavuk.ru' + url.pathname.slice(4) + url.search, {
            signal: AbortSignal.timeout(20000),
          });
          cached = {
            status: response.status,
            type: response.headers.get('content-type') || 'application/json',
            body: Buffer.from(await response.arrayBuffer()),
          };
          if (response.ok) apiCache.set(key, cached);
        }
        res.writeHead(cached.status, { 'Content-Type': cached.type });
        res.end(cached.body);
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' }).end('{"message":"API недоступен при пререндере"}');
      }
      return;
    }
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
  // Порядок карты сайта сохраняем: по нему же собирается llms.txt.
  return [...new Set(found.map((loc) => new URL(loc).pathname))];
}

/** Адрес, на котором приложение рисует «Такой страницы нет». nginx отдаёт этот
 *  файл с кодом 404 на любой неизвестный адрес — иначе каждая опечатка в
 *  ссылке становилась для поисковика ещё одной копией главной. */
const NOT_FOUND_ROUTE = '/404';

/** Куда сохранить страницу: `/` → dist/index.html, `/course` → dist/course.html. */
function outputFor(route) {
  if (route === '/') return path.join(DIST, 'index.html');
  return path.join(DIST, `${route.replace(/^\/|\/$/g, '')}.html`);
}

async function render(browser, route, { notFound = false } = {}) {
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

    const { html, description } = await page.evaluate((site, pathname, notFound) => {
      const url = site + (pathname === '/' ? '/' : pathname);
      if (notFound) {
        // У страницы ошибки нет своего адреса: канонический и языковые
        // альтернативы указывали бы на /404.
        document.head.querySelectorAll('link[rel="canonical"], link[rel="alternate"][hreflang]').forEach((tag) => tag.remove());
      } else {
        // Канонический адрес обязателен: без него робот считает страницу
        // дублем главной, потому что содержимое пришло по тому же index.html.
        const canonical = document.head.querySelector('link[rel="canonical"]')
          ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' }));
        canonical.setAttribute('href', url);
        document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((tag) => tag.setAttribute('href', url));
      }
      return {
        html: `<!doctype html>\n${document.documentElement.outerHTML}`,
        description: document.head.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
      };
    }, SITE, route.path, notFound);

    const title = await page.title();
    return { html, title, description };
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
  const pages = new Map();

  try {
    for (let i = 0; i < list.length; i += CONCURRENCY) {
      const batch = list.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (pathname) => {
        try {
          const { html, title, description } = await render(browser, { base, path: pathname });
          const out = outputFor(pathname);
          await mkdir(path.dirname(out), { recursive: true });
          await writeFile(out, html, 'utf8');
          titles.set(pathname, title);
          pages.set(pathname, { title, description });
        } catch (error) {
          failures.push(`${pathname}: ${error.message}`);
        }
      }));
    }
    try {
      const { html } = await render(browser, { base, path: NOT_FOUND_ROUTE }, { notFound: true });
      await writeFile(path.join(DIST, '404.html'), html, 'utf8');
    } catch (error) {
      failures.push(`${NOT_FOUND_ROUTE}: ${error.message}`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  await writeLlms(list.filter((route) => pages.has(route)).map((route) => ({ route, ...pages.get(route) })));

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

/** Заголовок без хвоста с названием сайта. */
function shortTitle(title) {
  return title.replace(/\s*[—|]\s*Читавук\s*$/u, '').trim();
}

function llmsLine({ route, title, description }) {
  const tail = description ? `: ${description}` : '';
  return `- [${shortTitle(title)}](${SITE}${route})${tail}`;
}

/** Вопросы и ответы из разметки FAQPage на главной. */
async function homeFaq() {
  const home = await readFile(path.join(DIST, 'index.html'), 'utf8');
  const faq = [];
  for (const [, json] of home.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      for (const node of JSON.parse(json)['@graph'] ?? []) {
        if (node['@type'] !== 'FAQPage') continue;
        for (const item of node.mainEntity ?? []) faq.push(`### ${item.name}\n\n${item.acceptedAnswer?.text ?? ''}`);
      }
    } catch {
      // Битая разметка — файл соберётся и без FAQ.
    }
  }
  return faq;
}

/**
 * llms.txt (llmstxt.org) — сайт одним markdown-файлом для нейросетевых
 * поисковиков. Заголовки и описания берутся из только что отрисованных
 * страниц, поэтому файл не расходится с сайтом. llms-full.txt — то же плюс
 * частые вопросы, все эпизоды «Слушания» и материалы по предметам.
 */
async function writeLlms(rendered) {
  const intro = (await readFile(path.join(ROOT, 'scripts', 'llms-intro.md'), 'utf8')).trim();
  const group = (prefix) => rendered.filter((page) => page.route.startsWith(prefix));
  const lessons = group('/course/lesson/');
  const episodes = group('/listening/');
  const subjects = group('/materials/');
  const sections = rendered.filter((page) => !lessons.includes(page) && !episodes.includes(page) && !subjects.includes(page));
  const list = (pages) => pages.map(llmsLine).join('\n');
  const faq = await homeFaq();

  const short = [
    intro,
    '## Разделы', list(sections),
    '## Курс сербской грамматики', list(lessons),
    '## Optional',
    [
      `- [Полная версия: частые вопросы, все аудиокниги и подкасты, материалы](${SITE}/llms-full.txt)`,
      '- [Исходный код (MIT)](https://github.com/IvanLindgren/citavuk)',
    ].join('\n'),
  ];
  const full = [
    intro,
    ...(faq.length ? ['## Частые вопросы', faq.join('\n\n')] : []),
    '## Разделы', list(sections),
    '## Курс сербской грамматики', list(lessons),
    '## Сербский на слух: аудиокниги и подкасты с текстом', list(episodes),
    '## Материалы для поступления по предметам', list(subjects),
  ];
  await writeFile(path.join(DIST, 'llms.txt'), `${short.join('\n\n')}\n`, 'utf8');
  await writeFile(path.join(DIST, 'llms-full.txt'), `${full.join('\n\n')}\n`, 'utf8');
  console.log(`llms.txt: разделов ${sections.length}, уроков ${lessons.length}, эпизодов ${episodes.length}, вопросов ${faq.length}`);
}

await main();
