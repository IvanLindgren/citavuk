/**
 * Кладёт worker PDF.js в public/ как обычный .js.
 *
 * Почему не оставить как есть. Vite собирает worker из node_modules и сохраняет
 * расширение .mjs. В стандартном mime.types nginx такого расширения нет, файл
 * уходит как application/octet-stream, и браузер отказывается исполнять модуль:
 * «Failed to fetch dynamically imported module». Настройка nginx это чинит, но
 * оставляет две мины:
 *
 *   1. Имя файла содержит хеш содержимого и не меняется. Пока тип отдавался
 *      неверно, ответ закешировался с `immutable` на год — и у тех, кто зашёл
 *      в это время, worker останется сломанным навсегда, сколько сервер ни чини.
 *   2. Сайт перестаёт быть самодостаточным: перенос на другой хостинг снова
 *      ломает импорт PDF, причём неочевидным образом.
 *
 * Расширение .js типизируют верно все серверы без исключения, а новое имя
 * обходит уже отравленный кеш.
 *
 * Запускается автоматически перед сборкой (см. package.json).
 */

import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

const source = join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const target = join(root, 'public', 'pdf.worker.js');

const version = JSON.parse(
  readFileSync(join(root, 'node_modules', 'pdfjs-dist', 'package.json'), 'utf8'),
).version;

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

const size = Math.round(statSync(target).size / 1024);
console.log(`pdf.worker.js: ${size} КБ (pdfjs-dist ${version})`);
