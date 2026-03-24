const { chromium } = require('playwright');

(async () => {
  // Step 1: Launch headless browser, go to login page
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('\n=== SIGNUM HQ Dashboard Screenshot Capture ===');
  console.log('Browser opened. Please log in to SIGNUM HQ.');
  console.log('After login completes, screenshots will auto-capture.\n');

  await page.goto('https://www.signumhq.com/ko/dashboard?ticker=AAPL', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  // Wait until URL no longer contains 'login' or 'sign-in', or we see dashboard content
  console.log('Waiting for you to log in...');
  try {
    await page.waitForURL('**/dashboard**', { timeout: 300000 }); // 5 min max
  } catch (e) {
    // URL might already be dashboard
  }
  
  // Extra wait: keep checking until we see real dashboard content
  for (let i = 0; i < 60; i++) {
    const url = page.url();
    if (url.includes('/dashboard') && !url.includes('login')) {
      // Check for dashboard-specific text
      const body = await page.textContent('body').catch(() => '');
      if (body.includes('VOL') || body.includes('CONVICTION') || body.includes('AAPL') || body.includes('Apple')) {
        console.log('Dashboard loaded!');
        break;
      }
    }
    await page.waitForTimeout(3000);
  }

  // Wait for full render
  await page.waitForTimeout(8000);

  // Capture all 3 locales
  const locales = ['ko', 'en', 'ja'];
  for (const locale of locales) {
    console.log(`Capturing ${locale}...`);
    
    await page.goto(`https://www.signumhq.com/${locale}/dashboard?ticker=AAPL`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(6000);

    const outPath = `./public/guide/command-full${locale === 'ko' ? '' : '-' + locale}.png`;
    await page.screenshot({
      path: outPath,
      fullPage: true,
      type: 'png',
    });

    console.log(`  Saved: ${outPath}`);
  }

  await browser.close();
  console.log('\nAll screenshots captured! 🎉');
})();
