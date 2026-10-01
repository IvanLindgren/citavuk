// Локальные фикстуры, без списаний и отправки настоящих писем.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base=process.env.CITAVUK_UI_URL||'http://127.0.0.1:5188';
assert.equal(new URL(base).hostname,'127.0.0.1');
const out='../output/guest-donation-ui';await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true});
try {
 for(const [width,height] of [[1440,1000],[390,844],[360,740]]) {
  for(const signedIn of [false,true]) {
   const page=await browser.newPage();const errors=[];let attempts=0;
   await page.setViewport({width,height,isMobile:width<500,hasTouch:width<500});
   await page.evaluateOnNewDocument(signed=>{localStorage.setItem('citavuk-theme','light');if(signed)localStorage.setItem('citavuk-token','cookie');},signedIn);
   page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
   page.on('request',async r=>{
    const u=new URL(r.url());
    if(u.pathname.startsWith('/api/v1/')){
     const path=u.pathname.slice(4);let status=200;
     let body={items:[],unread:0,books:[],vocabulary:[],reviews:[],palaces:[],changes:[],cursor:0,hasMore:false};
     if(path==='/v1/auth/me') {status=signedIn?200:401;body=signedIn?{id:'fixture',email:'friend@example.test',displayName:'Друг',emailVerified:true,serbianLevel:'A2'}:{error:{code:'unauthorized',message:'Войди'}};}
     else if(path==='/v1/donations/availability')body={available:true,testMode:false,guestLinkAvailable:true};
     else if(path==='/v1/donations/guest')body={items:[{id:'fixture-payment',status:'succeeded',amountKopecks:20000,hasRecoveryEmail:true,emailSent:true}]};
     else if(path==='/v1/donations/fixture-payment')body={status:'succeeded',amountKopecks:20000,publicName:'',showPublic:false,hasAccount:false,totalKopecks:20000,unlocked:false,thresholdKopecks:20000};
     else if(path==='/v1/supporters')body={supporters:[],spotlight:null};
     else if(path==='/v1/donations/guest/claim'){
      const data=JSON.parse(r.postData());assert.equal(data.token,'ctv_'+'a'.repeat(43));assert.equal(u.search,'');attempts++;
      status=attempts===1?403:200;body=attempts===1?{code:'claim_email_mismatch',message:'Войди в аккаунт с подтверждённой почтой, на которую пришла ссылка'}:{id:'fixture-payment'};
     }
     else if(path.startsWith('/v1/daily'))body={enabled:false,set:null,themes:[],available:[],level:'A2',configured:true,progress:{streak:0,dueNow:0,faded:[]}};
     else if(path==='/v1/study')body={timezone:'UTC',today:'2026-10-01',days:[],freezes:2};
     await r.respond({status,contentType:'application/json',body:JSON.stringify(body)});return;
    }
    if(u.origin!==new URL(base).origin&&!['data:','blob:'].includes(u.protocol))await r.abort();else await r.continue();
   });
   if(!signedIn){
    await page.goto(`${base}/support`,{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.body.textContent.includes('Почта для привязки на другом устройстве'));
    assert.ok(await page.$('input[type=email]'));
    await page.goto(`${base}/support/thanks?d=fixture-payment`,{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.body.textContent.includes('Гостевая поддержка'));
    assert.ok(await page.$('a[href*="login?next="]'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:`${out}/thanks-${width}.png`,fullPage:true});
   }
   await page.goto(`${base}/support/claim#token=ctv_${'a'.repeat(43)}`,{waitUntil:'networkidle0'});
   await page.waitForFunction(()=>document.body.textContent.includes('Привяжи поддержку Читавука'));
   assert.equal(new URL(page.url()).hash,'');
   if(signedIn){
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Привязать к этому аккаунту').click());
    await page.waitForFunction(()=>document.body.textContent.includes('подтверждённой почтой, на которую пришла ссылка'));
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Привязать к этому аккаунту').click());
    await page.waitForFunction(()=>document.body.textContent.includes('Поддержка в твоём аккаунте'));
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('citavuk-donation-claim-link')),null);
   }else assert.ok(await page.$('a[href="/login?next=%2Fsupport%2Fclaim"]'));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`${out}/claim-${width}-${signedIn?'account':'guest'}.png`,fullPage:true});
   console.log(`OK ${width} ${signedIn?'account claim, mismatch, retry':'guest checkout, thanks, cross-device login'}: no overflow or JS errors`);
   await page.close();
  }
 }
} finally {await browser.close();}
