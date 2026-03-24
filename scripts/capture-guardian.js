const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  const locales = ['ko', 'en', 'ja'];
  
  for (const locale of locales) {
    console.log(`Capturing ${locale}...`);
    const page = await context.newPage();
    
    await page.goto(`https://www.signumhq.com/${locale}/intel-guardian`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // Wait extra for any animations/lazy loading
    await page.waitForTimeout(5000);
    
    // Take full page screenshot
    const outPath = `./public/guide/guardian-full${locale === 'ko' ? '' : '-' + locale}.png`;
    await page.screenshot({
      path: outPath,
      fullPage: true,
      type: 'png',
    });
    
    console.log(`  Saved: ${outPath}`);
    await page.close();
  }

  await browser.close();
  console.log('All screenshots captured!');
})();
