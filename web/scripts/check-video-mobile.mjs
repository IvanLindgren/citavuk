import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [width, height] of [[390, 844], [360, 640], [740, 360]]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await page.goto('https://citavuk.ru/vukotok/video', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.feed-video-screen iframe', { timeout: 30000 });
    const result = await page.evaluate(() => {
      const video = document.querySelector('.feed-video-screen iframe').getBoundingClientRect();
      const actions = document.querySelector('.feed-video-actions').getBoundingClientRect();
      const overlap = Math.max(0, Math.min(video.right, actions.right) - Math.max(video.left, actions.left))
        * Math.max(0, Math.min(video.bottom, actions.bottom) - Math.max(video.top, actions.top));
      return { overlap, videoWidth: video.width, videoHeight: video.height, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    console.log(JSON.stringify({ width, height, ...result }));
    if (result.overlap || result.videoWidth <= 0 || result.videoHeight <= 0 || result.overflow) throw new Error('Видео перекрыто или выходит за экран');
  }
} finally {
  await browser.close();
}
