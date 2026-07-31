const puppeteer = require('/tmp/pp/node_modules/puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--force-color-profile=srgb', '--high-dpi-support=1', '--force-device-scale-factor=3'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1188, deviceScaleFactor: 3 });
  const url = 'file://' + path.join(__dirname, 'poster_wall.html');
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  const el = await page.$('#wall');
  await el.screenshot({ path: path.join(__dirname, 'poster_wall.png') });
  console.log('rendered poster_wall.png');
  await browser.close();
})();
