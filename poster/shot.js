const puppeteer = require('/tmp/pp/node_modules/puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox','--force-color-profile=srgb','--hide-scrollbars']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 720, deviceScaleFactor: 2 });
  const file = 'file://' + path.resolve(__dirname, 'poster.html');
  await page.goto(file, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));
  const el = await page.$('#poster');
  await el.screenshot({ path: path.resolve(__dirname, 'poster.png') });
  await browser.close();
  console.log('done');
})();
