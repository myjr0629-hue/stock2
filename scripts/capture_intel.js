const puppeteer = require('puppeteer');
const path = require('path');

async function captureIntel() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    const locales = ['ko', 'en', 'ja'];

    for (const locale of locales) {
        console.log(`\n--- Capturing ${locale} Intel page ---`);

        try {
            // Navigate to Intel page 
            await page.goto(`http://localhost:3000/${locale}/intel`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for content to render
            await new Promise(r => setTimeout(r, 5000));

            // Full page screenshot
            const suffix = locale === 'ko' ? '' : `-${locale}`;
            const fullPath = path.join(__dirname, '..', 'public', 'guide', `intel-full${suffix}.png`);

            await page.screenshot({
                path: fullPath,
                fullPage: false, // Just the viewport
                type: 'png'
            });
            console.log(`Saved: ${fullPath}`);

            // Now scroll to M7 tab area and capture
            // Click on M7 tab if available
            try {
                // Try to find and click Magnificent 7 tab
                const m7Tab = await page.$('button:has-text("Magnificent"), [data-sector="m7"], button:has-text("M7")');
                if (m7Tab) {
                    await m7Tab.click();
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (e) {
                console.log('M7 tab click skipped:', e.message);
            }

            // Capture M7 report section
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
    console.log('\nDone! All screenshots captured.');
}

captureIntel().catch(console.error);
