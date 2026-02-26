const puppeteer = require('puppeteer');
const path = require('path');

async function captureM7Screenshots() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    const locales = [
        { code: 'ko', filename: 'intel-m7.png' },
        { code: 'en', filename: 'intel-m7-en.png' },
        { code: 'ja', filename: 'intel-m7-ja.png' },
    ];

    for (const locale of locales) {
        console.log(`Capturing ${locale.code}...`);
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Navigate to Intel page — M7 is the default sector tab
        await page.goto(`http://localhost:3000/${locale.code}/intel`, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait extra for data to load
        await new Promise(r => setTimeout(r, 3000));

        // Click M7 tab to ensure it's active
        try {
            const m7Tab = await page.$('text/M7 REPORT');
            if (m7Tab) await m7Tab.click();
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.log('  M7 tab click skipped (may already be active)');
        }

        // Take full page screenshot
        const outputPath = path.join(__dirname, '..', 'public', 'guide', locale.filename);
        await page.screenshot({
            path: outputPath,
            fullPage: true,
            type: 'png'
        });

        console.log(`  Saved: ${outputPath}`);
        await page.close();
    }

    await browser.close();
    console.log('Done!');
}

captureM7Screenshots().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
