import puppeteer from 'puppeteer';
const browser=await puppeteer.launch();
try {
  const page=await browser.newPage();
  await page.goto('https://citavuk.ru/robots.txt');
  await page.evaluate(async () => {
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('citavuk',6);
      request.onupgradeneeded=()=>{
        const quotes=request.result.createObjectStore('readerQuotes',{keyPath:'id'});
        quotes.createIndex('bookId','bookId');
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{
      const t=db.transaction('readerQuotes','readwrite');
      t.objectStore('readerQuotes').put({id:'quote-before-sync',bookId:'test-book',page:0,paragraph:0,start:0,end:3,text:'Тест'});
      t.oncomplete=resolve;t.onerror=()=>reject(t.error);
    });
    db.close();
  });
  await page.goto('https://citavuk.ru/library',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__citavukReady,{timeout:30000});
  const row=await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('citavuk',7);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const result=await new Promise((resolve,reject)=>{const t=db.transaction('readerQuotes');const r=t.objectStore('readerQuotes').get('quote-before-sync');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const indexed=db.transaction('readerQuotes').objectStore('readerQuotes').indexNames.contains('dirty');
    db.close();
    return {...result,indexed};
  });
  if(row.dirty!==1||row.deleted!==0||!row.indexed) throw new Error('Quote migration lost sync state');
  console.log('Legacy quote preserved and queued for sync');
} finally {await browser.close();}
