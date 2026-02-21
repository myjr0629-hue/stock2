const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'guide');

const REPLACEMENTS = {
    en: {
        // RLSI INSIGHT section (diagnosis block)
        rlsi_block: '[Diagnosis] Off-hours — Market inactive, analysis resumes after pre-market 04:00 ET',
        last_session: 'Last session analysis',
        // TACTICAL VERDICT labels
        label_현황: '[Status]',
        label_해석: '[Analysis]',
        label_액션: '[Action]',
        // Korean sentences near labels
        korean_sentences: [
            { match: '장외 시간 - 실시간 분석 대기 중', replace: 'Off-hours — Awaiting real-time analysis' },
            { match: '프리마켓 시작 시 자동 갱신', replace: 'Auto-refresh on pre-market open' },
            { match: '다음 세션까지 기존 포지션 유지', replace: 'Maintain current positions until next session' },
            { match: '장외 시간 - 시장 비활성', replace: 'Off-hours — Market inactive' },
            { match: '프리마켓 04:00 ET 이후 분석 재개', replace: 'Analysis resumes after pre-market 04:00 ET' },
        ],
        breadth_msg: 'Breadth analysis available during regular session',
    },
    ja: {
        rlsi_block: '[診断] 時間外 — 市場非アクティブ、プレマーケット04:00 ET以降に分析再開',
        last_session: '前回セッション分析',
        label_현황: '[現況]',
        label_해석: '[解析]',
        label_액션: '[アクション]',
        korean_sentences: [
            { match: '장외 시간 - 실시간 분석 대기 중', replace: '時間外 — リアルタイム分析待機中' },
            { match: '프리마켓 시작 시 자동 갱신', replace: 'プレマーケット開始時に自動更新' },
            { match: '다음 세션까지 기존 포지션 유지', replace: '次のセッションまで既存ポジションを維持' },
            { match: '장외 시간 - 시장 비활성', replace: '時間外 — 市場非アクティブ' },
            { match: '프리마켓 04:00 ET 이후 분석 재개', replace: 'プレマーケット04:00 ET以降に分析再開' },
        ],
        breadth_msg: 'レギュラーセッション中にBreadth分析が行われます',
    },
};

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    for (const locale of ['en', 'ja']) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

        const url = `${BASE_URL}/${locale}/intel-guardian`;
        console.log(`📸 Capturing ${locale}: ${url}`);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 8000));

        const rep = REPLACEMENTS[locale];

        await page.evaluate((rep) => {
            const koreanRegex = /[\uAC00-\uD7AF]/;

            // Walk ALL text nodes
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null
            );

            let node;
            while ((node = walker.nextNode())) {
                let text = node.textContent;
                if (!text || !koreanRegex.test(text)) continue;

                // Replace label tags
                text = text.replace('[현황]', rep.label_현황);
                text = text.replace('[해석]', rep.label_해석);
                text = text.replace('[액션]', rep.label_액션);
                text = text.replace('[진단]', '[Diagnosis]');
                text = text.replace('[결론]', '[Conclusion]');

                // Replace known Korean sentences
                for (const s of rep.korean_sentences) {
                    if (text.includes(s.match)) {
                        text = text.replace(s.match, s.replace);
                    }
                }

                // Fallback: replace any remaining Korean characters with empty
                // (catch stray particles like 중, 시, 후)
                // Only do this if the text still has Korean after specific replacements
                if (koreanRegex.test(text)) {
                    // Replace remaining Korean sequences
                    text = text.replace(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]+/g, '');
                    // Clean up extra spaces
                    text = text.replace(/\s{2,}/g, ' ').trim();
                }

                node.textContent = text;
            }
        }, rep);

        await new Promise(r => setTimeout(r, 500));

        const outputPath = path.join(OUTPUT_DIR, `guardian-full-${locale}.png`);
        await page.screenshot({ path: outputPath, fullPage: true });

        console.log(`✅ Saved: ${outputPath}`);
        await page.close();
    }

    await browser.close();
    console.log('\n🎉 All captures done!');
})();
