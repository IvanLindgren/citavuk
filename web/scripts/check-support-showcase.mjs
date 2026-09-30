// Проверка публичной витрины без создания настоящих платежей.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = path.resolve('dist');
const out = path.resolve('../output/support-qa');
await mkdir(out, { recursive: true });
let count = 1;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/v1/supporters') return res.end(JSON.stringify({supporters: Array.from({length: count}, (_,i) => ({name: ['Ана из Белграда', 'Очень длинное имя друга Читавука', 'Иван'][i], since: '2026-09-30', amountKopecks: 50000/(i+1)})), spotlight: {name:'Ана',message:'Спасибо за сербский!',amountKopecks:50000,day:'2026-09-30'}}));
    if (url.pathname === '/api/v1/donations/availability') return res.end(JSON.stringify({available: true, testMode: false, monthlyAvailable: true}));
    res.statusCode = 401; return res.end('{}');
  }
  const types = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.webp':'image/webp','.json':'application/json'};
  const requested = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!requested.startsWith(root + path.sep) && requested !== root) { res.statusCode=403; return res.end(); }
  for (const candidate of [requested, requested + '.html', path.join(root,'index.html')]) {
    try { const data = await readFile(candidate); res.setHeader('Content-Type',types[path.extname(candidate)] ?? 'application/octet-stream'); return res.end(data); } catch { /* пробуем пререндер маршрута */ }
  }
  res.statusCode=404;res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await puppeteer.launch({headless: true});
try {
  const page = await browser.newPage();
  const base = `http://127.0.0.1:${server.address().port}`;
  for (count of [0,1,2,3]) {
    await page.setViewport({width:390,height:844});
    await page.goto(base+'/supporters', {waitUntil:'networkidle0'});
    const rows = await page.$$eval('ol[aria-label="Друзья, поддержавшие больше всего"] > li', list=>list.length);
    if (rows !== count) throw new Error(`Expected ${count} podium places, got ${rows}`);
    if (await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile horizontal overflow');
    await page.screenshot({path:path.join(out,`supporters-${count}.png`),fullPage:true});
  }
  await page.goto(base+'/support', {waitUntil:'networkidle0'});
  await page.screenshot({path:path.join(out,'form-mobile.png'),fullPage:true});
  const payButton = await page.$('button[type="submit"]');
  if (await payButton.evaluate(el=>el.disabled)) throw new Error('One-time payment is unexpectedly disabled');
  await page.setViewport({width:1366,height:900});
  await page.goto(base, {waitUntil:'networkidle0'});
  await page.screenshot({path:path.join(out,'landing-desktop.png'),fullPage:false});
  await page.click('button[aria-label="Погладить Читавука"]');
  await page.waitForFunction(()=>[...document.querySelectorAll('[role=status]')].some(el=>el.textContent.includes('Спасибо за поддержку')));
  console.log('Поддержка: 0/1/2/3 участника, мобильная форма, главная и благодарность маскота — OK');
} finally { await browser.close(); server.close(); }
