// Собирает все русские строки интерфейса из исходников сайта.
//
// Перевод интерфейса работает по тексту (см. src/lib/i18n.ts): ключ словаря —
// сама русская строка. Здесь ключи и добываются: строковые литералы, текст
// JSX и шаблоны (`${…}` становится {0}, {1}…), без комментариев.
//
// node scripts/i18n-extract.mjs > i18n-keys.json
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CYR = /[А-Яа-яЁё]/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(tsx?|mts)$/.test(entry.name) && !/\.test\./.test(entry.name) && !entry.name.endsWith('.d.ts')) yield path;
  }
}

export function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export async function extract() {
  const found = new Map();
  const add = (text, file) => {
    const key = normalize(text);
    if (!key || !CYR.test(key)) return;
    const entry = found.get(key) ?? { files: new Set() };
    entry.files.add(file);
    found.set(key, entry);
  };
  for await (const path of walk(join(root, 'src'))) {
    const file = relative(root, path).replaceAll('\\', '/');
    const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true,
      path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        // Импорты и ключи вида 'ru' не интересны, а вот тексты — все.
        if (!ts.isImportDeclaration(node.parent)) add(node.text, file);
      } else if (ts.isJsxText(node)) {
        add(node.text, file);
      } else if (ts.isTemplateExpression(node)) {
        let text = node.head.text;
        node.templateSpans.forEach((span, index) => {
          text += `{${index}}` + span.literal.text;
        });
        add(text, file);
        // Части шаблона тоже бывают отдельными узлами текста.
        add(node.head.text, file);
        for (const span of node.templateSpans) add(span.literal.text, file);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const found = await extract();
  const out = {};
  for (const [key, entry] of [...found].sort((a, b) => a[0].localeCompare(b[0], 'ru'))) {
    out[key] = [...entry.files].sort();
  }
  process.stdout.write(JSON.stringify(out, null, 1));
}
