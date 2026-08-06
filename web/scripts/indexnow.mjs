/**
 * Оповещение поисковиков о новых и изменившихся страницах (IndexNow).
 *
 * Обычный порядок — дождаться, пока робот придёт сам: от суток до недель. Карта
 * сайта его не торопит, она лишь перечисляет адреса. IndexNow работает наоборот:
 * сайт сам сообщает, что изменилось, и участники протокола приходят в течение
 * минут.
 *
 * ВАЖНО: Google протокол НЕ поддерживает. Он тестировал IndexNow с 2021 года и
 * так и не внедрил, оставшись при своих инструментах — карте сайта и «Проверке
 * URL» в Search Console. Отсюда участники: Яндекс, Bing, Naver, Seznam, Yep.
 * Половина задачи, но именно та половина, где ускорение реально.
 *
 * Ключ подтверждает право на сайт: он же лежит файлом в корне
 * (`public/<ключ>.txt`), и поисковик сверяет одно с другим. Секретом не
 * является — он публичный по устройству протокола, — но и подделать им ничего
 * нельзя: чужой сайт таким ключом не подтвердить.
 *
 * Запуск из каталога web/:
 *
 *     node scripts/indexnow.mjs                     # все адреса из карт сайта
 *     node scripts/indexnow.mjs --dry-run           # показать, но не отправлять
 *     node scripts/indexnow.mjs https://citavuk.ru/vukotok   # только указанные
 *
 * Адреса указывайте ПОЛНЫЕ. Путь со слэшем скрипт понимает, но Git Bash на
 * Windows подменяет `/vukotok` на `C:/Program Files/Git/vukotok` ещё до запуска,
 * и до скрипта доходит уже не то, что набрали.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://citavuk.ru';
const HOST = 'citavuk.ru';

/** Тот же ключ лежит файлом в public/ — поисковик сверяет одно с другим. */
const KEY = '8c935ef69fc1b854002759a72f5ef26a';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;

/**
 * Общая точка входа протокола: она сама рассылает уведомление всем участникам.
 * Отправлять каждому отдельно не нужно и не рекомендуется.
 */
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Больше за раз протокол не принимает. Нам до этого предела далеко. */
const MAX_URLS = 10_000;

/** Адреса из XML-карты. Разбор регулярным выражением: нужен один тег. */
function locations(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
}

/**
 * Отбрасывает чужие адреса.
 *
 * Протокол отвечает 422 на весь запрос, если в списке есть хоть один адрес с
 * другого домена. Одна опечатка отменила бы отправку целиком, поэтому проверка
 * стоит до запроса, а не после отказа.
 */
export function ownUrls(urls, site = SITE) {
  const seen = new Set();
  for (const raw of urls) {
    const value = String(raw ?? '').trim();
    if (value === '') continue;
    // Относительный адрес обязан начинаться со слэша. Иначе любое слово с
    // опечаткой превращалось бы в правдоподобный адрес вида /не%20адрес: для
    // поисковика это заявка на несуществующую страницу, и повторные 404 по
    // собственным заявкам доверия к сайту не добавляют.
    if (!value.startsWith('/') && !value.startsWith('http')) continue;
    let absolute;
    try {
      absolute = new URL(value, site).toString();
    } catch {
      continue;
    }
    if (!absolute.startsWith(`${site}/`) && absolute !== `${site}/`) continue;
    seen.add(absolute);
  }
  return [...seen].slice(0, MAX_URLS);
}

async function fromSitemaps() {
  const urls = [];

  const local = path.join(ROOT, 'public', 'sitemap.xml');
  urls.push(...locations(await readFile(local, 'utf8')));

  // Уроки преподавателей публикуются между выкладками, поэтому их карту отдаёт
  // сервер из базы. Недоступность сервера не должна отменять отправку
  // остальных адресов — это оповещение, а не сборка.
  try {
    const response = await fetch(`${SITE}/sitemap-lessons.xml`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) urls.push(...locations(await response.text()));
  } catch (error) {
    console.warn(`  карта уроков недоступна, пропускаем: ${error.message}`);
  }

  return urls;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const explicit = args.filter((arg) => !arg.startsWith('--'));

  const urls = ownUrls(explicit.length > 0 ? explicit : await fromSitemaps());
  if (urls.length === 0) {
    console.error('нечего отправлять: список адресов пуст');
    return 1;
  }

  console.log(`IndexNow: ${urls.length} адресов (Яндекс, Bing, Naver, Seznam — Google протокол не поддерживает)`);
  if (explicit.length > 0 || urls.length <= 12) {
    for (const url of urls) console.log(`  ${url}`);
  }
  if (dryRun) {
    console.log('--dry-run: запрос не отправлен');
    return 0;
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls }),
    signal: AbortSignal.timeout(30_000),
  });

  // 200 — принято, 202 — принято, ключ ещё проверяется. Оба означают успех.
  if (response.status === 200 || response.status === 202) {
    console.log(`  принято (${response.status})`);
    return 0;
  }
  console.error(`  отказ ${response.status}: ${EXPLAIN[response.status] ?? await response.text()}`);
  return 1;
}

const EXPLAIN = {
  400: 'неверный формат запроса',
  403: `ключ не подтверждён — проверьте, что ${KEY_LOCATION} отдаётся и содержит ровно ключ`,
  422: 'адреса не принадлежат заявленному домену',
  429: 'слишком часто; повторите позже',
};

// Файл ещё и импортируется тестом, поэтому запускается только как программа.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  // exitCode, а не process.exit(): на Windows принудительный выход обрывает
  // ещё живой сокет fetch, и Node печатает падение libuv уже ПОСЛЕ успешной
  // отправки. В журнале выкатки это выглядит как ошибка там, где всё вышло.
  process.exitCode = await main();
}
