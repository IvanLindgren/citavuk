import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.slot-embed.config.ts'], { cwd: root, stdio: 'inherit' });
const script = readFileSync(join(root, 'dist-slot-embed/slot_machine.js'), 'utf8');
if (/<\/script/i.test(script)) throw new Error('unsafe script end');
// У WebView нет origin сайта, поэтому рисунок Читавука и шрифты из slotAssets.ts встраиваются в страницу.
const types = { '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const files = {};
for (const [, url] of script.matchAll(/["'](\/(?:img|fonts)\/[\w@./-]+\.(?:webp|png|woff2|svg))["']/g)) {
  const body = readFileSync(join(root, 'public', url));
  // SVG кладём как есть (data-URL из него собирает slotEmbed.ts): и экранирование, и base64 раздули бы страницу.
  files[url] = url.endsWith('.svg')
    ? `svg:${body.toString('utf8')}`
    : `data:${types[url.slice(url.lastIndexOf('.'))]};base64,${body.toString('base64')}`;
}
const wolfParts = Object.keys(files).filter((url) => url.startsWith('/img/citavuk-magician/')).length;
if (wolfParts !== 7 || !Object.keys(files).some((url) => url.includes('PressStart2P'))) throw new Error(`embed assets not found: ${Object.keys(files)}`);
const assets = JSON.stringify(files);
if (/<\/script/i.test(assets)) throw new Error('unsafe asset text');
const notice = '<!-- Шрифты: Press Start 2P (Copyright 2012 The Press Start 2P Project Authors) и Lora (Copyright 2011 The Lora Project Authors) — SIL Open Font License 1.1, https://openfontlicense.org -->';
const html = `<!doctype html>\n${notice}\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{position:relative}canvas{display:block;width:100%;height:100%}</style></head><body><canvas></canvas><script>window.__SLOT_FILES__=${assets}</script><script>${script}</script></body></html>`;
writeFileSync(join(root, '../frontend/assets/games/slot_machine.html'), html);
console.log(`slot_machine.html: ${(html.length / 1024).toFixed(0)} KB (${Object.keys(files).join(', ')})`);
