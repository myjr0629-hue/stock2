const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const TICKER = 'NVDA';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'guide');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    for (const locale of ['ko', 'en', 'ja']) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

        const url = `${BASE_URL}/${locale}/ticker?ticker=${TICKER}`;
        console.log(`📸 Capturing ${locale}: ${url}`);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        // Wait for data to load (SWR fetches)
        await new Promise(r => setTimeout(r, 12000));

        const suffix = locale === 'ko' ? '' : `-${locale}`;
        const outputPath = path.join(OUTPUT_DIR, `command-full${suffix}.png`);
        await page.screenshot({ path: outputPath, fullPage: true });

        console.log(`✅ Saved: ${outputPath}`);
        await page.close();
    }

    await browser.close();
    console.log('\n🎉 All Command captures done!');
})();
