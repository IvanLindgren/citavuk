// Собирает словари перевода сайта из web/i18n/<область>.jsonl.
//
// Строка исходника — JSON-массив [русский, английский, сербский]. Сербский
// null означает глоссу — значение слова, которое идёт на языке перевода слов,
// а не на языке интерфейса (см. src/lib/i18n.ts). На выходе для каждой
// области: <область>.en.json, <область>.sr.json и <область>.gloss.en.json.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sources = join(root, 'i18n');
const output = join(root, 'src', 'i18n');

const placeholders = (text) => [...text.matchAll(/\{(\d+)(?::[^}]*)?\}/g)].map((m) => m[1]).sort().join(',');

export async function build() {
  await mkdir(output, { recursive: true });
  const problems = [];
  for (const name of (await readdir(sources)).filter((file) => file.endsWith('.jsonl')).sort()) {
    const domain = name.replace(/\.jsonl$/, '');
    const en = {};
    const sr = {};
    const gloss = {};
    const lines = (await readFile(join(sources, name), 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        problems.push(`${name}:${index + 1}: не JSON`);
        return;
      }
      const [key, english, serbian] = row;
      if (typeof key !== 'string' || typeof english !== 'string') {
        problems.push(`${name}:${index + 1}: нет ключа или перевода`);
        return;
      }
      const expected = [...new Set(placeholders(key).split(','))].filter(Boolean).sort().join(',');
      for (const value of [english, serbian]) {
        if (typeof value !== 'string') continue;
        const got = [...new Set(placeholders(value).split(','))].filter(Boolean).sort().join(',');
        if (got !== expected) problems.push(`${name}:${index + 1}: подстановки {${expected}} ≠ {${got}} в «${value}»`);
      }
      if (serbian === null) {
        gloss[key] = english;
      } else {
        en[key] = english;
        if (typeof serbian === 'string') sr[key] = serbian;
      }
    });
    await writeFile(join(output, `${domain}.en.json`), JSON.stringify(en));
    await writeFile(join(output, `${domain}.sr.json`), JSON.stringify(sr));
    await writeFile(join(output, `${domain}.gloss.en.json`), JSON.stringify(gloss));
    console.log(`${domain}: ${Object.keys(en).length} строк, ${Object.keys(gloss).length} глосс`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = await build();
  for (const problem of problems) console.warn(problem);
  if (problems.length && process.argv.includes('--strict')) process.exit(1);
}
