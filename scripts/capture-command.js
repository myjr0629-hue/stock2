const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  const locales = ['ko', 'en', 'ja'];
  // Using AAPL as the default ticker for command/dashboard screenshots
  const ticker = 'AAPL';
  
  for (const locale of locales) {
    console.log(`Capturing ${locale} dashboard for ${ticker}...`);
    const page = await context.newPage();
    
    await page.goto(`https://www.signumhq.com/${locale}/dashboard?ticker=${ticker}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // Wait for content to load
    await page.waitForTimeout(8000);
    
    const outPath = `./public/guide/command-full${locale === 'ko' ? '' : '-' + locale}.png`;
    await page.screenshot({
      path: outPath,
      fullPage: true,
      type: 'png',
    });
    
    console.log(`  Saved: ${outPath}`);
    await page.close();
  }

  await browser.close();
  console.log('All command screenshots captured!');
})();
