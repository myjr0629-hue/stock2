#!/usr/bin/env node
// Dry only: 환경 파일/외부 통신 차단. Redis·모델·서비스 import 없음.
require('./offline-test-preload.cjs');
require('./offline-test-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { buildLineFacts, buildLineUserPrompt, WL_LINE_SYSTEM } = require('../src/lib/ai/watchlistLine');
const { buildWatchlistV3Prompt, WL_V3_SYSTEM } = require('../src/lib/ai/watchlistV3');
const { rankStockContext } = require('../src/lib/ai/watchlistDepth');
const { stockFactsOf } = require('../src/lib/ai/watchlistStockFacts');

function compare(samples) {
    return samples.map(sample => {
        const at = Date.parse(sample.asOf);
        if (!Number.isFinite(at)) throw new Error('각 표본에 고정 asOf ISO 시각 필요');
        const f = buildLineFacts(sample.ticker, sample.realtime, at);
        if (!f) throw new Error('지도 사실 부족');
        const ranked = rankStockContext({ ticker: f.ticker, earnings: sample.context?.earnings || [], news: sample.context?.news || [], flow: sample.context?.flow || null, insider: sample.context?.insider || null, darkPool: f.darkPool, implied: f.implied }, at);
        f.contextText = ranked.lines.join('\n'); f.topLine = ranked.topLine;
        return {
            ticker: f.ticker, asOf: sample.asOf, facts: stockFactsOf(f),
            old: { system: WL_LINE_SYSTEM, userPrompt: buildLineUserPrompt(f) },
            new: { system: WL_V3_SYSTEM, userPrompt: buildWatchlistV3Prompt(f) },
            parameters: { temperature: 0.2, maxTokens: 700, purpose: 'WatchlistLine', locale: 'multi' },
        };
    });
}
module.exports = { compare };
if (require.main === module) {
    const [input, output] = process.argv.slice(2);
    if (!input || !output || input === '--help') {
        console.log('사용법: node scripts/watchlist-v3-compare.cjs <고정입력.json> <출력.json>\n입력: [{ticker, asOf: ISO, realtime: 배치행, context?: {earnings:[], news:[], flow:null, insider:null}}]\n모델 호출·운영 읽기/쓰기 없음. 같은 사실으로 옛/새 프롬프트만 JSON 저장.');
        process.exit(input === '--help' ? 0 : 1);
    }
    if ([input, output].some(p => /^\.env/.test(path.basename(p)))) throw new Error('환경 파일 경로 금지');
    const data = JSON.parse(fs.readFileSync(input, 'utf8'));
    const result = { mode: 'dry', baseline: 'pre-v3 legacy prompt retained in watchlistLine/watchlistDepth', samples: compare(Array.isArray(data) ? data : [data]) };
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(`dry 프롬프트 ${result.samples.length}개 저장`);
}
