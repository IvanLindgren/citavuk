import puppeteer from 'puppeteer';

const base = process.env.CITAVUK_TEST_BASE || 'https://citavuk.ru';
const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  await page.setViewport({width: 390, height: 844, isMobile: true, hasTouch: true});
  const id = '00000000-0000-4000-8000-000000000987';
  await page.goto(`${base}/library`, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__citavukReady, {timeout:30000});
  await page.waitForFunction(async () => {
    const db=await new Promise(resolve=>{const r=indexedDB.open('citavuk',7);r.onsuccess=()=>resolve(r.result);});
    const ready=db.objectStoreNames.contains('books') && db.objectStoreNames.contains('content');
    db.close();
    return ready;
  }, {timeout:30000});
  await page.evaluate(async id => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('citavuk', 7);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['books','content'], 'readwrite');
      transaction.objectStore('books').put({id,title:'Проверка цитат',sourceKey:'test',folder:'',paragraphCount:1,lastParagraph:0,contentSha:'',textMissing:false,addedAt:Date.now(),updatedAt:Date.now(),dirty:0,deleted:0});
      transaction.objectStore('content').put({id,paragraphs:['Ово је кратка реченица за проверу цитата.']});
      transaction.oncomplete=resolve;
      transaction.onerror=()=>reject(transaction.error);
    });
    db.close();
  }, id);
  await page.goto(`${base}/reader/${id}`, {waitUntil:'domcontentloaded'});
  await page.waitForSelector('p.reader-selectable');
  await page.evaluate(() => {
    const words=[...document.querySelectorAll('p.reader-selectable [data-reader-word]')];
    const range=document.createRange();
    range.setStart(words[0].firstChild,0);
    range.setEnd(words[2].firstChild,words[2].textContent.length);
    const selection=window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForSelector('[role="toolbar"]');
  const buttons=await page.$$('button');
  for(const button of buttons) if(await button.evaluate(node=>node.textContent?.trim()==='Подчеркнуть')) { await button.click(); break; }
  await page.waitForFunction(async () => {
    const db=await new Promise(resolve=>{const r=indexedDB.open('citavuk',7);r.onsuccess=()=>resolve(r.result);});
    return new Promise(resolve=>{const t=db.transaction('readerQuotes');const r=t.objectStore('readerQuotes').getAll();r.onsuccess=()=>{db.close();resolve(r.result.length===1);};});
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('p.reader-selectable');
  const quoted = await page.$eval('p.reader-selectable', node => node.querySelector('.underline') !== null);
  if(!quoted) throw new Error('Подчёркивание не восстановилось после перезагрузки');
  console.log('Quote saved and rendered after reload');
} finally { await browser.close(); }
