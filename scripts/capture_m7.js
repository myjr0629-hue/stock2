const puppeteer = require('puppeteer');
const path = require('path');

async function captureM7() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    const locales = ['ko', 'en', 'ja'];

    for (const locale of locales) {
        console.log(`\n--- Capturing ${locale} M7 tab ---`);

        try {
            // Navigate to Intel page
            await page.goto(`http://localhost:3000/${locale}/intel`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            await new Promise(r => setTimeout(r, 5000));

            // Click on M7 REPORT tab in the sidebar
            // Look for sidebar button containing "M7"
            const clicked = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, a, div[role="button"]');
                for (const btn of buttons) {
                    const text = btn.textContent || '';
                    if (text.includes('M7 REPORT') || text.includes('M7') && text.includes('REPORT')) {
                        btn.click();
                        return true;
                    }
                }
                // Try to find by text "Magnificent" 
                for (const btn of buttons) {
                    const text = btn.textContent || '';
                    if (text.includes('Magnificent') || text.includes('M7 REPORT')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });

            console.log('M7 tab clicked:', clicked);
            await new Promise(r => setTimeout(r, 4000));

            // Take screenshot of viewport (M7 Session Grid)
            const suffix = locale === 'ko' ? '' : `-${locale}`;
            const m7Path = path.join(__dirname, '..', 'public', 'guide', `intel-m7${suffix}.png`);

            await page.screenshot({
                path: m7Path,
                fullPage: false,
                type: 'png'
            });
            console.log(`Saved: ${m7Path}`);

        } catch (err) {
            console.error(`Error capturing ${locale}:`, err.message);
        }
    }

    await browser.close();
    console.log('\nDone! M7 screenshots captured.');
}

captureM7().catch(console.error);
