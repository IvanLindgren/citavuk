// Собирает 3D-машинку для приложения в один HTML: frontend/assets/games/typewriter3d.html.
//
// Сцена та же, что на сайте (src/games/cases/typewriterScene.ts); в файл
// вкладываются бандл и шрифты (Courier Prime, Lora) — WebView не должен ходить за
// ними в сеть. Запуск: npm run build:typewriter-embed
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fonts = join(root, '..', 'frontend', 'assets', 'fonts');
const out = join(root, '..', 'frontend', 'assets', 'games', 'typewriter3d.html');

execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.embed.config.ts'], {
  cwd: root,
  stdio: 'inherit',
});

const script = readFileSync(join(root, 'dist-embed', 'typewriter3d.js'), 'utf8');
// Закрывающий тег внутри строки оборвал бы встроенный скрипт.
if (/<\/script/i.test(script)) throw new Error('в бандле встретился </script');

const face = (family, file, weight) => {
  const data = readFileSync(join(fonts, file)).toString('base64');
  return `@font-face{font-family:"${family}";font-weight:${weight};font-display:block;src:url(data:font/ttf;base64,${data}) format("truetype")}`;
};

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
${face('Courier Prime', 'CourierPrime-Regular.ttf', 400)}
${face('Courier Prime', 'CourierPrime-Bold.ttf', 700)}
${face('Lora', 'Lora-Regular.ttf', 400)}
${face('Lora', 'Lora-Bold.ttf', 700)}
html,body{margin:0;height:100%;overflow:hidden;background:transparent;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
#tw-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;-webkit-mask-image:linear-gradient(to bottom,transparent,#000 56px);mask-image:linear-gradient(to bottom,transparent,#000 56px)}
</style>
</head>
<body>
<canvas id="tw-canvas" aria-hidden="true"></canvas>
<script>
${script}
</script>
</body>
</html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`typewriter3d.html: ${(html.length / 1024).toFixed(0)} КБ`);
