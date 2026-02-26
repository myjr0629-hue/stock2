const puppeteer = require('puppeteer');
const path = require('path');

const LOCALES = ['ko', 'en', 'ja'];
const BASE = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'public', 'guide');

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    for (const locale of LOCALES) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        const url = `${BASE}/${locale}/intel`;
        console.log(`Navigating to ${url}...`);
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log('Page loaded, waiting 8s for data...');
            await new Promise(r => setTimeout(r, 8000));

            const filename = locale === 'ko' ? 'intel-full.png' : `intel-full-${locale}.png`;
            const outPath = path.join(OUT_DIR, filename);
            await page.screenshot({ path: outPath, fullPage: true });
            console.log(`Saved: ${outPath}`);
        } catch (e) {
            console.error(`Error for ${locale}:`, e.message);
        }
        await page.close();
    }

    await browser.close();
    console.log('Done!');
})();
