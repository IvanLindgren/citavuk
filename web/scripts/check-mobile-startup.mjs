import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import puppeteer from 'puppeteer';

const dist = path.resolve('dist');
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const candidate = path.resolve(dist, '.' + url.pathname);
  if (candidate !== dist && !candidate.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const file = path.extname(candidate) ? candidate : path.join(dist, 'index.html');
    const bytes = await readFile(file);
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip' });
    res.end(gzipSync(bytes));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await puppeteer.launch();
try {
  for (const broken of [false, true]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 350, downloadThroughput: 50 * 1024, uploadThroughput: 20 * 1024 });
    let aborted = false;
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (broken && req.resourceType() === 'stylesheet') return void req.abort();
      if (broken && !aborted && req.resourceType() === 'script' && /\/assets\/index-.*\.js$/.test(req.url())) { aborted = true; return void req.abort(); }
      void req.continue();
    });
    const start = Date.now();
    await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__citavukReady === true, { timeout: 60000 });
    const result = await page.evaluate(() => ({
      styles: !!getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      navigation: !!document.querySelector('a[href="/library"]'),
      notice: !!document.getElementById('citavuk-startup-notice'),
    }));
    console.log(JSON.stringify({ broken, aborted, elapsedMs: Date.now()-start, ...result }));
    if (!result.styles || !result.navigation || result.notice || (broken && !aborted)) throw new Error('Mobile startup regression');
    await context.close();
  }
} finally { await browser.close(); server.close(); }
