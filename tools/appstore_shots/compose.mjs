// Промо-кадры App Store: подпись, орнамент, рамка устройства и статус-бар
// поверх кадров, которые снимает integration_test/layer_tour_test.dart.
// node tools/appstore_shots/compose.mjs <ios-screenshots> <mac-screenshots> <выход>
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../../', import.meta.url);
const require = createRequire(new URL('web/package.json', root));
const puppeteer = require('puppeteer');

const [iosDir, macDir, outDir] = process.argv.slice(2);
const FONT = (name) => new URL(`web/public/fonts/${name}`, root).href;

const CAPTIONS = {
  '01-word': ['Перевод прямо <em>в тексте</em>', 'Тапни слово — увидишь значение именно в этом предложении'],
  '02-reader': ['Читай <em>по-сербски</em> с первого дня', 'Свои книги, статьи и PDF — латиницей или кириллицей'],
  '03-course': ['Курс <em>грамматики</em> с нуля', 'Падежи, времена и упражнения с мгновенной проверкой'],
  '04-vukotok': ['Лента <em>Вукоток</em>', 'Короткие тексты на сербском под твой уровень'],
  '05-roadmap': ['Путь <em>от A1 до C1</em>', 'Слова, темы и тексты по уровням — прогресс считается сам'],
  '06-daily': ['Слова <em>на каждый день</em>', 'Новые слова и текст дня под твой уровень'],
  '07-listening': ['<em>Слушай</em> живую речь', 'Радио, передачи и аудиокниги с расшифровкой'],
  '08-library': ['Классика <em>бесплатно</em>', 'Нушич, Доманович, Лазаревич и сербские сказки'],
};
const ORDER = ['01-word', '02-reader', '03-course', '04-vukotok', '05-roadmap', '06-daily', '07-listening', '08-library'];

const ORNAMENT = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><path d="M20 6 34 20 20 34 6 20Z" fill="none" stroke="#a3271f" stroke-width="3"/><rect x="17" y="17" width="6" height="6" fill="#a3271f" transform="rotate(45 20 20)"/></svg>`,
);

const SIGNAL = (h) => `<svg height="${h}" viewBox="0 0 34 22"><rect x="0" y="14" width="6" height="8" rx="1.5"/><rect x="9" y="10" width="6" height="12" rx="1.5"/><rect x="18" y="5" width="6" height="17" rx="1.5"/><rect x="27" y="0" width="6" height="22" rx="1.5"/></svg>`;
const WIFI = (h) => `<svg height="${h}" viewBox="0 0 30 22"><path d="M15 4.5c4.6 0 8.8 1.8 11.9 4.7l2.3-2.4C25.5 3.2 20.5 1 15 1S4.5 3.2.8 6.8l2.3 2.4C6.2 6.3 10.4 4.5 15 4.5Zm0 6.6c2.8 0 5.3 1 7.2 2.8l2.3-2.4C22 9.2 18.7 7.8 15 7.8s-7 1.4-9.5 3.7l2.3 2.4c1.9-1.8 4.4-2.8 7.2-2.8Zm0 6.4c1.1 0 2.1.4 2.8 1.1L15 21.5l-2.8-2.9c.7-.7 1.7-1.1 2.8-1.1Z"/></svg>`;
const BATTERY = (h) => `<svg height="${h}" viewBox="0 0 50 22"><rect x="1" y="1" width="42" height="20" rx="6" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="2"/><rect x="4" y="4" width="36" height="14" rx="3.5"/><path d="M46 8v6c1.5-.4 2.5-1.6 2.5-3s-1-2.6-2.5-3Z" fill-opacity=".45"/></svg>`;

function statusBar(kind) {
  if (kind === 'iphone') {
    // Кадр iPhone 6,9" в пикселях 3x: полоса 62 pt, «остров» по центру.
    return `<div class="sb sb-iphone">
      <span class="time">9:41</span>
      <span class="island"></span>
      <span class="icons">${SIGNAL(36)}${WIFI(36)}${BATTERY(38)}</span>
    </div>`;
  }
  return `<div class="sb sb-ipad">
    <span class="time">9:41&nbsp;&nbsp;Пт 3 окт.</span>
    <span class="icons">${WIFI(26)}<b>100%</b>${BATTERY(28)}</span>
  </div>`;
}

function page({ kind, width, height, image, caption }) {
  const [title, subtitle] = caption;
  const L = {
    iphone: { pad: 100, top: 170, h1: 124, sub: 58, deviceW: 1010, deviceTop: 700, screenW: 1320, screenH: 2868, bezel: 40, radius: 190 },
    ipad: { pad: 150, top: 170, h1: 132, sub: 64, deviceW: 1640, deviceTop: 600, screenW: 2064, screenH: 2752, bezel: 52, radius: 80 },
    mac: { pad: 0, top: 120, h1: 108, sub: 54, deviceW: 2240, deviceTop: 440, screenW: 2880, screenH: 1800, bezel: 0, radius: 0 },
  }[kind];
  const scale = (L.deviceW - 2 * L.bezel * (L.deviceW / (L.screenW + 2 * L.bezel))) / L.screenW;
  const frameScale = L.deviceW / (L.screenW + 2 * L.bezel);
  const device =
    kind === 'mac'
      ? `<div class="window" style="width:${L.deviceW}px;top:${L.deviceTop}px">
          <div class="titlebar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>Читавук</span></div>
          <div class="win-screen" style="height:${(L.screenH * L.deviceW) / L.screenW}px">
            <img src="${image}" style="width:${L.screenW}px;height:${L.screenH}px;transform:scale(${L.deviceW / L.screenW})">
          </div>
        </div>`
      : `<div class="device" style="width:${L.screenW + 2 * L.bezel}px;height:${L.screenH + 2 * L.bezel}px;border-radius:${L.radius + L.bezel}px;padding:${L.bezel}px;top:${L.deviceTop}px;transform:translateX(-50%) scale(${frameScale})">
          <div class="screen" style="border-radius:${L.radius}px">
            <img src="${image}">
            ${statusBar(kind)}
          </div>
        </div>`;
  void scale;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Noto; src: url(${FONT('NotoSans-Regular.woff2')}); font-weight: 400; }
    @font-face { font-family: Noto; src: url(${FONT('NotoSans-Bold.woff2')}); font-weight: 700; }
    * { box-sizing: border-box; margin: 0; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
    body { position: relative; font-family: Noto, sans-serif; color: #2b2118;
      background: radial-gradient(120% 70% at 85% 0%, #fbf3e3 0%, transparent 60%), linear-gradient(180deg, #f6eedf 0%, #efe3cc 100%); }
    .ornament { position: absolute; left: 0; right: 0; top: ${kind === 'mac' ? 46 : 92}px; height: 40px;
      background: url("data:image/svg+xml,${ORNAMENT}") repeat-x center / 40px 40px; opacity: .9; }
    .caption { position: absolute; left: ${L.pad}px; right: ${L.pad}px; top: ${L.top}px; ${kind === 'mac' ? 'text-align:center;' : ''} }
    h1 { font-size: ${L.h1}px; line-height: 1.06; font-weight: 700; letter-spacing: -0.01em; }
    h1 em { font-style: normal; color: #a3271f; }
    p { margin-top: ${Math.round(L.sub * 0.55)}px; font-size: ${L.sub}px; line-height: 1.3; color: #5f5246; max-width: ${kind === 'mac' ? 'none' : '92%'}; }
    .device { position: absolute; left: 50%; transform-origin: top center; background: linear-gradient(145deg, #4a423b, #1d1915 40%, #2b2520);
      box-shadow: 0 0 0 4px #6b6158 inset, 0 60px 120px rgba(70, 40, 20, .28), 0 20px 40px rgba(70, 40, 20, .18); }
    .screen { position: relative; width: 100%; height: 100%; overflow: hidden; background: #fdf8ee; }
    .screen img { display: block; width: 100%; height: 100%; }
    .sb { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; color: #1b1612; fill: currentColor; font-weight: 700; }
    .sb-iphone { height: 186px; padding: 0 92px 0 120px; justify-content: space-between; }
    .sb-iphone .time { font-size: 54px; width: 230px; text-align: center; }
    .sb-iphone .island { position: absolute; left: 50%; top: 34px; width: 375px; height: 110px; margin-left: -187px; border-radius: 60px; background: #000; }
    .sb-iphone .icons { display: flex; gap: 18px; align-items: center; }
    .sb-ipad { height: 48px; padding: 0 44px; justify-content: space-between; font-size: 28px; }
    .sb-ipad .icons { display: flex; gap: 14px; align-items: center; }
    .sb-ipad b { font-size: 26px; }
    .window { position: absolute; left: 50%; transform: translateX(-50%); border-radius: 26px; overflow: hidden; background: #fdf8ee;
      box-shadow: 0 0 0 2px rgba(60, 40, 20, .18), 0 60px 140px rgba(70, 40, 20, .3), 0 18px 40px rgba(70, 40, 20, .2); }
    .titlebar { position: relative; height: 66px; display: flex; align-items: center; gap: 16px; padding: 0 26px; background: #efe6d6; border-bottom: 2px solid #e0d4bf; }
    .titlebar i { width: 24px; height: 24px; border-radius: 50%; }
    .titlebar span { position: absolute; left: 0; right: 0; text-align: center; font-size: 28px; font-weight: 700; color: #5f5246; }
    .win-screen { position: relative; overflow: hidden; }
    .win-screen img { position: absolute; left: 0; top: 0; transform-origin: top left; }
  </style></head><body>
    <div class="ornament"></div>
    <div class="caption"><h1>${title}</h1><p>${subtitle}</p></div>
    ${device}
  </body></html>`;
}

const jobs = [];
const iphoneDir = iosDir && readdirSync(iosDir).find((name) => /iPhone/i.test(name));
const ipadDir = iosDir && readdirSync(iosDir).find((name) => /iPad/i.test(name));
for (const name of ORDER) {
  if (iphoneDir && existsSync(join(iosDir, iphoneDir, `${name}.png`)))
    jobs.push({ kind: 'iphone', width: 1320, height: 2868, src: join(iosDir, iphoneDir, `${name}.png`), out: join(outDir, 'iphone-6.9', `${name}.png`), name });
  if (ipadDir && existsSync(join(iosDir, ipadDir, `${name}.png`)))
    jobs.push({ kind: 'ipad', width: 2064, height: 2752, src: join(iosDir, ipadDir, `${name}.png`), out: join(outDir, 'ipad-13', `${name}.png`), name });
  if (macDir && existsSync(join(macDir, `${name}.png`)))
    jobs.push({ kind: 'mac', width: 2880, height: 1800, src: join(macDir, `${name}.png`), out: join(outDir, 'mac', `${name}.png`), name });
}

const browser = await puppeteer.launch({ headless: true, args: ['--allow-file-access-from-files'] });
const tab = await browser.newPage();
for (const job of jobs) {
  mkdirSync(join(job.out, '..'), { recursive: true });
  await tab.setViewport({ width: job.width, height: job.height, deviceScaleFactor: 1 });
  const html = page({ ...job, image: pathToFileURL(job.src).href, caption: CAPTIONS[job.name] });
  const file = join(outDir, '_page.html');
  (await import('node:fs')).writeFileSync(file, html);
  await tab.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0' });
  await tab.evaluate(() => document.fonts.ready);
  // Подпись в две строки сдвигает устройство вниз, а не наезжает на него.
  const gap = { iphone: 90, ipad: 110, mac: 80 }[job.kind];
  await tab.evaluate((gap) => {
    const bottom = document.querySelector('.caption').getBoundingClientRect().bottom;
    const device = document.querySelector('.device, .window');
    device.style.top = `${Math.max(parseFloat(device.style.top), Math.ceil(bottom + gap))}px`;
  }, gap);
  await tab.screenshot({ path: job.out, type: 'png', clip: { x: 0, y: 0, width: job.width, height: job.height } });
  console.log(job.out);
}
await browser.close();
