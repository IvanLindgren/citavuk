/**
 * Язык интерфейса и язык перевода слов.
 *
 * Сайт написан по-русски, и русская строка сама служит ключом словаря: так
 * перевод не требует переписывать сотни компонентов, а новый текст без
 * перевода просто остаётся русским, а не превращается в пустое место.
 *
 * Интерфейс переводит наблюдатель за DOM: каждый новый узел текста и
 * подписи (placeholder, title, aria-label, alt) ищется в словаре. Данные, по
 * которым проверяются ответы (курс, тренажёрка, путешествие), переводятся при
 * загрузке через {@link translateData}: иначе на экране был бы английский
 * вариант, а проверка ждала бы русский.
 *
 * Значения слов («глоссы») идут не на языке интерфейса, а на языке перевода
 * слов: сербский интерфейс с переводом на русский — обычный выбор, и словарь
 * «перевёл» бы значение слова на сербский, превратив упражнение в бессмыслицу.
 * Поэтому у каждой области два словаря: интерфейсный и глоссы английского.
 *
 * Словари собирает scripts/i18n-build.mjs из web/i18n/*.jsonl.
 */

export type Lang = 'ru' | 'en' | 'sr';
export type GlossLang = 'ru' | 'en';
export type Domain = 'ui' | 'course' | 'trainer' | 'travel';

export const LANGUAGES: { id: Lang; name: string; short: string }[] = [
  { id: 'ru', name: 'Русский', short: 'RU' },
  { id: 'en', name: 'English', short: 'EN' },
  { id: 'sr', name: 'Srpski', short: 'SR' },
];

const LANG_KEY = 'citavuk-lang';
const GLOSS_KEY = 'citavuk-gloss';
const CYRILLIC = /[А-Яа-яЁё]/;
/** Буквы русского алфавита, которых нет в сербском. */
const RUSSIAN_ONLY = /[ЁёЙйЩщЪъЫыЬьЭэЮюЯя]/;

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Приватный режим: выбор проживёт до перезагрузки.
  }
}

function isLang(value: unknown): value is Lang {
  return value === 'ru' || value === 'en' || value === 'sr';
}

let cachedLang: Lang | null = null;

/**
 * Часовые пояса, где сайт сам открывается по-английски: США, Канада,
 * Великобритания, Ирландия, Австралия, Новая Зеландия и крупные страны
 * Западной Европы. Пояс, а не IP: из России сюда часто ходят через VPN с
 * европейским адресом. Те же три выражения стоят в index.html — тест сверяет.
 */
export const ENGLISH_ZONES =
  '^(Europe/(London|Dublin|Berlin|Busingen|Paris|Monaco|Rome|Vatican|San_Marino|Malta|Madrid|Andorra|Gibraltar|Lisbon|Amsterdam|Brussels|Luxembourg|Vienna|Zurich|Vaduz|Copenhagen|Stockholm|Oslo|Helsinki)' +
  '|Atlantic/(Canary|Madeira|Azores|Reykjavik)|Africa/Ceuta' +
  '|America/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Adak|Boise|Detroit|Juneau|Sitka|Nome|Yakutat|Metlakatla|Menominee|Indiana/.+|Kentucky/.+|North_Dakota/.+' +
  '|Toronto|Montreal|Vancouver|Edmonton|Winnipeg|Regina|Swift_Current|Halifax|Glace_Bay|Moncton|Goose_Bay|St_Johns|Whitehorse|Dawson|Dawson_Creek|Fort_Nelson|Creston|Yellowknife|Inuvik|Cambridge_Bay|Iqaluit|Rankin_Inlet|Resolute|Atikokan|Nipigon|Thunder_Bay|Rainy_River|Pangnirtung)' +
  '|Pacific/(Honolulu|Auckland|Chatham)|Australia/.+)$';
/** Русский в языках браузера — человек и так читает по-русски, где бы ни жил. */
export const RUSSIAN_READER = '^(ru|uk|be|kk)\\b';
/** Роботы и пререндер видят русский оригинал, иначе выдача станет английской. */
export const ROBOT = 'bot|crawl|spider|slurp|lighthouse|headless|prerender';

/** Язык по умолчанию для того, кто ещё ничего не выбирал. */
export function autoLang(zone: string, languages: readonly string[], agent: string, webdriver: boolean): Lang {
  if (webdriver || new RegExp(ROBOT, 'i').test(agent)) return 'ru';
  if (languages.some((tag) => new RegExp(RUSSIAN_READER, 'i').test(tag))) return 'ru';
  return new RegExp(ENGLISH_ZONES).test(zone) ? 'en' : 'ru';
}

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/** Язык интерфейса: ?lang= в адресе, затем сохранённый выбор, иначе по часовому поясу. */
export function uiLang(): Lang {
  if (cachedLang) return cachedLang;
  let lang: Lang = 'ru';
  if (typeof window !== 'undefined') {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    const saved = stored(LANG_KEY);
    if (isLang(fromUrl)) {
      lang = fromUrl;
      store(LANG_KEY, fromUrl);
    } else if (isLang(saved)) {
      lang = saved;
    } else {
      const languages = navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
      lang = autoLang(browserZone(), languages, navigator.userAgent, navigator.webdriver === true);
    }
  }
  cachedLang = lang;
  return lang;
}

/** На какой язык переводятся слова. По умолчанию — английский только при английском интерфейсе. */
export function glossLang(): GlossLang {
  const saved = stored(GLOSS_KEY);
  if (saved === 'ru' || saved === 'en') return saved;
  return uiLang() === 'en' ? 'en' : 'ru';
}

/** Локаль для дат и чисел. */
export function uiLocale(): string {
  return { ru: 'ru-RU', en: 'en-GB', sr: 'sr-Latn-RS' }[uiLang()];
}

/** Название языка перевода слов в родительном/предложном смысле для подсказок. */
export function glossName(): string {
  return glossLang() === 'en' ? 'English' : 'Русский';
}

/**
 * Меняет язык. Страница перезагружается: курс, каталоги и закешированные
 * данные переводятся при загрузке, и пересобирать их на лету значило бы
 * держать вторую копию всего.
 */
export function setLanguages(lang: Lang, gloss: GlossLang) {
  store(LANG_KEY, lang);
  store(GLOSS_KEY, gloss);
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  window.location.replace(url.toString());
}

// ---------------------------------------------------------------------------
// Словари

type Dict = Record<string, string>;

const loaders = import.meta.glob<{ default: Dict }>('../i18n/*.json');

async function loadDict(name: string): Promise<Dict> {
  const load = loaders[`../i18n/${name}.json`];
  if (!load) return {};
  try {
    return (await load()).default;
  } catch {
    return {};
  }
}

/** Словарь области: интерфейс на языке сайта плюс глоссы на языке перевода слов. */
async function dictFor(domain: Domain): Promise<Dict | null> {
  const lang = uiLang();
  const gloss = glossLang();
  if (lang === 'ru' && gloss === 'ru') return null;
  const [main, glosses] = await Promise.all([
    lang === 'ru' ? Promise.resolve({}) : loadDict(`${domain}.${lang}`),
    gloss === 'en' ? loadDict(`${domain}.gloss.en`) : Promise.resolve({}),
  ]);
  return { ...main, ...glosses };
}

/**
 * Переводит строки внутри загруженных данных (по точному совпадению).
 *
 * [fields] ограничивает перевод полями с такими именами: в Путешествии
 * сербское «хлеб» и русская глосса «хлеб» пишутся одинаково, и без фильтра
 * перевод испортил бы сербскую сторону.
 */
export async function translateData<T>(
  domain: Exclude<Domain, 'ui'>,
  value: T,
  fields?: (key: string) => boolean,
): Promise<T> {
  const dict = await dictFor(domain);
  if (!dict) return value;
  const ui = active?.dict ?? {};
  const walk = (node: unknown, key: string): unknown => {
    if (typeof node === 'string') {
      if (!CYRILLIC.test(node) || (fields && !fields(key))) return node;
      return dict[node] ?? ui[normalize(node)] ?? node;
    }
    if (Array.isArray(node)) return node.map((item) => walk(item, key));
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [name, item] of Object.entries(node)) out[name] = walk(item, name);
      return out;
    }
    return node;
  };
  return walk(value, '') as T;
}

// ---------------------------------------------------------------------------
// Перевод строки

interface Pattern {
  prefix: string;
  suffix: string;
  regex: RegExp;
  value: string;
}

interface Active {
  dict: Dict;
  patterns: Pattern[];
}

let active: Active | null = null;

export function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compile(dict: Dict): Pattern[] {
  const patterns: Pattern[] = [];
  for (const [key, value] of Object.entries(dict)) {
    if (!/\{\d+\}/.test(key)) continue;
    const parts = key.split(/\{\d+\}/);
    const order = [...key.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1]));
    const source = parts.map(escapeRegex).join('(.*?)');
    // Порядок подстановок в ключе может быть любым: {1} перед {0}.
    const remapped = value.replace(/\{(\d+)(:[^}]*)?\}/g, (whole, index: string, plural?: string) => {
      const at = order.indexOf(Number(index));
      return at < 0 ? whole : `{${at}${plural ?? ''}}`;
    });
    patterns.push({
      prefix: parts[0] ?? '',
      suffix: parts.at(-1) ?? '',
      regex: new RegExp(`^${source}$`, 's'),
      value: remapped,
    });
  }
  // Сначала самые конкретные: больше букв вне подстановок.
  patterns.sort((a, b) => b.prefix.length + b.suffix.length - (a.prefix.length + a.suffix.length));
  return patterns;
}

/** Номер формы множественного числа: англ. — one|other, сербск. — one|few|other. */
function pluralIndex(value: number, forms: number): number {
  if (forms === 2) return value === 1 ? 0 : 1;
  const n = Math.abs(Math.trunc(value));
  if (n % 10 === 1 && n % 100 !== 11) return 0;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return 1;
  return Math.min(2, forms - 1);
}

function fill(template: string, args: string[]): string {
  return template.replace(/\{(\d+)(?::([^}]*))?\}/g, (whole, index: string, plural?: string) => {
    const arg = args[Number(index)];
    if (arg === undefined) return whole;
    if (plural === undefined) return arg;
    const forms = plural.split('|');
    const number = Number(arg.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(number)) return forms.at(-1) ?? '';
    return forms[pluralIndex(number, forms.length)] ?? forms.at(-1) ?? '';
  });
}

function lookup(key: string): string | undefined {
  if (!active) return undefined;
  const exact = active.dict[key];
  if (exact !== undefined) return exact;
  // Числа: «5 слов» ищется как «{0} слов».
  if (/\d/.test(key)) {
    const args: string[] = [];
    const skeleton = key.replace(/\d+(?:[.,]\d+)?/g, (number) => `{${args.push(number) - 1}}`);
    const value = active.dict[skeleton];
    if (value !== undefined) return fill(value, args);
  }
  for (const pattern of active.patterns) {
    if (!key.startsWith(pattern.prefix) || !key.endsWith(pattern.suffix)) continue;
    const match = pattern.regex.exec(key);
    if (!match) continue;
    // Подставленное тоже может быть русским: «Слова по метке «{0}»». Но если
    // там непереводимый русский текст (буквы, которых нет в сербском), шаблон
    // подошёл случайно: «Русский {0}» не должен делать из «Русский язык»
    // «Russian язык». Имена и сербские названия пропускаются как есть.
    let accidental = false;
    const args = match.slice(1).map((arg) => {
      const translated = lookup(normalize(arg));
      if (translated !== undefined) return translated;
      if (RUSSIAN_ONLY.test(arg)) accidental = true;
      return arg;
    });
    if (accidental) continue;
    return fill(pattern.value, args);
  }
  return undefined;
}

/** Перевод строки для кода, который рисует текст сам (canvas, alert). */
export function t(text: string): string {
  if (!active || !CYRILLIC.test(text)) return text;
  const key = normalize(text);
  const out = lookup(key);
  if (out === undefined) return text;
  const lead = /^\s*/.exec(text)?.[0] ?? '';
  const trail = /\s*$/.exec(text)?.[0] ?? '';
  return lead + out + trail;
}

// ---------------------------------------------------------------------------
// Наблюдатель за DOM

const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt', 'aria-description'];
const SKIP = 'script, style, textarea, [contenteditable=""], [contenteditable="true"], [translate="no"], [data-no-i18n]';

/** То, что записали мы сами: повторно не переводим и не принимаем за правку React. */
const written = new WeakMap<Node, string>();
const writtenAttrs = new WeakMap<Element, Map<string, string>>();

function skipped(element: Element | null): boolean {
  return Boolean(element?.closest(SKIP));
}

function translateTextNode(node: Text) {
  const value = node.nodeValue;
  if (!value || written.get(node) === value || !CYRILLIC.test(value)) return;
  if (skipped(node.parentElement)) return;
  const out = t(value);
  if (out === value) return;
  written.set(node, out);
  node.nodeValue = out;
}

function translateAttributes(element: Element) {
  for (const name of ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (!value || !CYRILLIC.test(value)) continue;
    const mine = writtenAttrs.get(element);
    if (mine?.get(name) === value) continue;
    const out = t(value);
    if (out === value) continue;
    const map = mine ?? new Map<string, string>();
    map.set(name, out);
    writtenAttrs.set(element, map);
    element.setAttribute(name, out);
  }
  if (element instanceof HTMLInputElement && (element.type === 'button' || element.type === 'submit')) {
    const out = t(element.value);
    if (out !== element.value) element.value = out;
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root instanceof Element) {
    if (skipped(root)) return;
    translateAttributes(root);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches(SKIP)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text);
    else translateAttributes(node as Element);
  }
}

function observe() {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') translateTextNode(record.target as Text);
      else if (record.type === 'attributes') translateAttributes(record.target as Element);
      else record.addedNodes.forEach(translateTree);
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTES,
  });
}

function patchDialogs() {
  const { alert, confirm, prompt } = window;
  window.alert = (message?: unknown) => alert.call(window, typeof message === 'string' ? t(message) : message);
  window.confirm = (message?: string) => confirm.call(window, message === undefined ? message : t(message));
  window.prompt = (message?: string, value?: string) =>
    prompt.call(window, message === undefined ? message : t(message), value);
}

/**
 * Включает перевод до первой отрисовки React. Для русского без английских
 * глоссов ничего не загружает.
 */
export async function startI18n(): Promise<void> {
  const lang = uiLang();
  document.documentElement.lang = lang === 'sr' ? 'sr-Latn' : lang;
  const dict = await dictFor('ui');
  if (dict) {
    active = { dict, patterns: compile(dict) };
    translateTree(document.documentElement);
    observe();
    patchDialogs();
  }
}

/** Снимает скрытие страницы, выставленное index.html на время загрузки словаря. */
export function revealI18n() {
  document.documentElement.classList.remove('i18n-wait');
}

// ---------------------------------------------------------------------------
// Ответы сервера

/** Глоссы английского из всех областей: значение слова из словаря сервера. */
let glossIndex: Promise<Dict> | null = null;

function loadGlossIndex(): Promise<Dict> {
  glossIndex ??= Promise.all(['ui', 'course', 'trainer', 'travel'].map((name) => loadDict(`${name}.gloss.en`)))
    .then((parts) => Object.assign({}, ...parts) as Dict);
  return glossIndex;
}

const PARAGRAPH = String.fromCharCode(10).repeat(2);

/**
 * Переводит текст, собранный сервером из кусков: абзацы и части через
 * запятую ищутся в словаре по отдельности. Непереведённая часть остаётся
 * как есть.
 */
export function tComposite(text: string): string {
  if (!active || !CYRILLIC.test(text)) return text;
  const whole = t(text);
  if (whole !== text) return whole;
  return text
    .split(PARAGRAPH)
    .map((paragraph) => {
      const direct = t(paragraph);
      if (direct !== paragraph) return direct;
      return paragraph.split(', ').map((part) => t(part)).join(', ');
    })
    .join(PARAGRAPH);
}

/**
 * Переводит ответ сервера (разбор слова, фразы): подписи — на язык сайта,
 * значение слова — на язык перевода слов. Поля [keep] — сербские формы, их
 * не трогаем.
 */
export async function translateResponse<T>(
  value: T,
  options: { keep?: string[]; glosses?: string[] } = {},
): Promise<T> {
  const lang = uiLang();
  const gloss = glossLang();
  if (lang === 'ru' && gloss === 'ru') return value;
  const keep = new Set(options.keep ?? []);
  const glossFields = new Set(options.glosses ?? []);
  const glossDict = gloss === 'en' ? await loadGlossIndex() : null;
  const walk = (node: unknown, key: string): unknown => {
    if (typeof node === 'string') {
      if (keep.has(key) || !CYRILLIC.test(node)) return node;
      if (glossFields.has(key)) {
        if (!glossDict) return node;
        // Русское значение англоязычному читателю не поможет: нет перевода — нет поля.
        return glossDict[node] ?? glossDict[normalize(node)] ?? '';
      }
      return lang === 'ru' ? node : tComposite(node);
    }
    if (Array.isArray(node)) return node.map((item) => walk(item, key));
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [name, item] of Object.entries(node)) out[name] = walk(item, name);
      return out;
    }
    return node;
  };
  return walk(value, '') as T;
}

