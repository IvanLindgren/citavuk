import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const cache = new Map();
const startup = await readFile(new URL('./startup-recovery.js', import.meta.url), 'utf8');
let count = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await walk(file); continue; }
    if (!entry.name.endsWith('.html')) continue;
    let html = await readFile(file, 'utf8');
    const links = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)];
    for (const [tag] of links) {
      if (tag.includes('data-citavuk-inlined')) continue;
      const href = tag.match(/href="(\/assets\/[^"?#]+\.css)"/)?.[1];
      if (!href) continue;
      const target = path.resolve(dist, '.' + href);
      if (!target.startsWith(dist + path.sep)) throw new Error('CSS outside dist');
      if (!cache.has(href)) cache.set(href, await readFile(target, 'utf8'));
      const css = cache.get(href).replace(/<\/style/gi, '<\\/style');
      // Disabled link сохраняет href для дедупликации preload-helper Vite.
      // Стили уже доступны из HTML; повторная сетевая загрузка не нужна.
      html = html.replace(tag, '<style data-citavuk-style="' + href + '">' + css + '</style>' + tag.replace('<link', '<link disabled data-citavuk-inlined'));
    }
    if (links.length) {
      html = html.replace(/(<script\b[^>]*type="module"[^>]*src=)/, '<script data-citavuk-boot>' + startup + '</script>$1');
      await writeFile(file, html); count++;
    }
  }
}
await walk(dist);
console.log('Стили включены в HTML: ' + count + ' страниц');
