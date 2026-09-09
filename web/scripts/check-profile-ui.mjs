// Проверка настоящей страницы профиля на локальных данных, без записи в API.
import puppeteer from 'puppeteer';
import os from 'node:os';
import path from 'node:path';
const base = 'http://127.0.0.1:5187';
const study = { asOf: '2026-09-09T12:00:00Z', today: '2026-09-09', timezone: 'UTC', current: 0, longest: 1, activeDays: 6, freezes: 2, todayActive: false, newDay: false, days: [
  {date:'2026-08-29',kind:'active'}, {date:'2026-09-01',kind:'active'}, {date:'2026-09-03',kind:'active'}, {date:'2026-09-04',kind:'frozen'}, {date:'2026-09-05',kind:'active'}, {date:'2026-09-07',kind:'active'}, {date:'2026-09-08',kind:'active'},
] };
const stats = {study,streakDays:0,words:{added:180,learned:72,due:18},goal:{target:'B1',done:24,total:80,ratio:.3},achievements:[{key:'first',title:'Первое открытие',description:'Добавь первое слово в свой словарь',icon:'bookmark',unlockedAt:'2026-09-01T12:00:00Z'}],activity:Array.from({length:14},(_,i)=>({day:`2026-08-${18+i}`,added:i%4*3,reviewed:i%5*4}))};
const browser=await puppeteer.launch({headless:true});
try {
  for (const width of [1440,390]) {
    const page=await browser.newPage(),errors=[],writes=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width,height:1050});
    await page.evaluateOnNewDocument(()=>localStorage.setItem('citavuk-token','cookie'));
    await page.setRequestInterception(true);
    page.on('request',async req=>{
      const url=new URL(req.url());
      if(url.pathname.startsWith('/v1/')){
        if(req.method()!=='GET'&&req.method()!=='OPTIONS')writes.push(`${req.method()} ${url.pathname}`);
        let body={items:[],unread:0};
        if(url.pathname==='/v1/auth/me')body={id:'profile-ui-fixture',displayName:'Денис Корнилов',email:'profile@example.test',serbianLevel:'A2',emailVerified:true};
        else if(url.pathname==='/v1/profile/stats')body=stats;
        else if(url.pathname==='/v1/study')body=study;
        else if(url.pathname==='/v1/daily')body={enabled:false,set:null,themes:[],configured:true,progress:{streak:0,dueNow:0,faded:[]}};
        else if(url.pathname.includes('/sync/'))body={changes:[],cursor:0,hasMore:false};
        await req.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
      }else if(url.origin!==base&&!['data:','blob:'].includes(url.protocol))await req.abort();
      else await req.continue();
    });
    await page.goto(`${base}/account`,{waitUntil:'networkidle0'});
    const journal=await page.waitForSelector('.study-journal');
    await journal.scrollIntoView();
    await page.click('[aria-label="4 сентября: Серия сохранена заморозкой"]');
    if(!await page.$('.study-day.frozen'))throw new Error('Не показана заморозка');
    if(await page.$$eval('.study-day',els=>els.length)!==30)throw new Error('В сентябре должно быть 30 дат, а не только дни событий');
    await page.click('[aria-label="Предыдущий месяц"]');
    if(await page.$$eval('.study-day',els=>els.length)!==31)throw new Error('Неверный август');
    await page.click('[aria-label="Следующий месяц"]');
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error(`overflow ${width}`);
    await journal.screenshot({path:path.join(os.tmpdir(),`citavuk-profile-calendar-${width}.png`)});
    await page.evaluate(()=>document.documentElement.classList.add('dark'));
    await journal.screenshot({path:path.join(os.tmpdir(),`citavuk-profile-calendar-dark-${width}.png`)});
    if(errors.length)throw new Error(errors.join('\n'));
    if(writes.some(r=>r.includes('/study')))throw new Error('Календарь записывает прогресс');
    console.log(`OK ${width}: даты, заморозки, смена месяца, ширина, светлая и тёмная темы`);
    await page.close();
  }
} finally {await browser.close();}
