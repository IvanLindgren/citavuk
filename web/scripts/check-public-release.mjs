// Пассивная проверка опубликованных страниц: без аккаунта, все POST запрещены.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const out=path.join(os.tmpdir(),'citavuk-public-release');await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true});
try {
 for(const [route,width,expected] of [['/',1366,'по МСК.'],['/govori',390,'13 октября'],['/padezi',390,'12 октября'],['/trainer',390,'Тренажёрка'],['/course',390,'Курс сербского'],['/downloads',1366,'1.22.2']]){
  const page=await browser.newPage(),errors=[];
  await page.setViewport({width,height:844,isMobile:width<500,hasTouch:width<500});
  page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',r=>r.method()==='GET'?r.continue():r.abort());
  await page.goto(`https://citavuk.ru${route}`,{waitUntil:'networkidle0',timeout:40000});
  await page.waitForFunction(text=>document.body.textContent.includes(text),{timeout:20000},expected);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${route}: overflow`);
  assert.deepEqual(errors,[],route);
  if(route==='/course')assert.equal(await page.evaluate(()=>document.body.textContent.includes('Твой маршрут')),false);
  if(route==='/trainer')assert.equal(await page.$('main a[href="/padezi"],main a[href^="/govori"]'),null);
  await page.screenshot({path:path.join(out,`${route.replaceAll('/','')||'home'}-${width}.png`)});
  console.log(`OK ${route} ${width}`);await page.close();
 }
 console.log(out);
} finally {await browser.close();}
