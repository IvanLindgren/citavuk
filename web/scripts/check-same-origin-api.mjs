import puppeteer from 'puppeteer';

const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width:390, height:844, isMobile:true, hasTouch:true });
  let blocked = 0;
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (new URL(req.url()).hostname === 'api.citavuk.ru') { blocked++; void req.abort(); }
    else void req.continue();
  });
  await page.goto('https://citavuk.ru/', { waitUntil:'domcontentloaded', timeout:30000 });
  await page.waitForFunction(() => window.__citavukReady, {timeout:30000});
  const results = await page.evaluate(async () => {
    const paths = ['/api/v1/auth/providers', '/api/v1/auth/me', '/api/v1/micro-feed?limit=1&mode=text', '/api/audio/lessons'];
    const results = [];
    for (const path of paths) {
      const start = performance.now();
      const response = await fetch(path, {headers:{'X-Citavuk-Client':'web'}, signal:AbortSignal.timeout(15000)});
      const value = await response.json();
      results.push({path,status:response.status,json:typeof value === 'object',ms:Math.round(performance.now()-start)});
    }
    return results;
  });
  console.log(JSON.stringify({blockedOldDomain:blocked, results}));
  for (const result of results) {
    const expected = result.path.endsWith('/auth/me') ? 401 : 200;
    if (result.status !== expected || !result.json) throw new Error('API proxy regression: '+result.path);
  }
  if (blocked) throw new Error('Страница всё ещё обращается к отдельному API-домену');
} finally { await browser.close(); }
