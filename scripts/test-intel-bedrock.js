/**
 * Test: Intel Session Grid — Bedrock Claude S4 + Polygon News
 * Usage: node scripts/test-intel-bedrock.js
 */
require('dotenv').config({ path: '.env.local' });

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const bedrock = new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';

async function fetchNews(ticker) {
    const res = await fetch(`https://api.polygon.io/v2/reference/news?ticker=${ticker}&limit=5&order=desc&sort=published_utc&apiKey=${POLYGON_KEY}`);
    const data = await res.json();
    const now = Date.now();
    return (data.results || []).slice(0, 5).map(n => {
        const h = Math.floor((now - new Date(n.published_utc || 0).getTime()) / 3600000);
        return {
            title: (n.title || '').slice(0, 150),
            age: h < 1 ? 'Now' : h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`,
            sentiment: n.insights?.[0]?.sentiment || 'neutral',
        };
    });
}

async function test() {
    console.log('=== Bedrock + Polygon News Test ===\n');

    // 1. Fetch news
    console.log('Fetching news...');
    const nvdaNews = await fetchNews('NVDA');
    const tslaNews = await fetchNews('TSLA');
    console.log(`NVDA: ${nvdaNews.length} articles`);
    console.log(`TSLA: ${tslaNews.length} articles`);

    const newsSection = [
        'NVDA NEWS:', ...nvdaNews.map(a => `  [${a.age}] [${a.sentiment}] ${a.title}`),
        '', 'TSLA NEWS:', ...tslaNews.map(a => `  [${a.age}] [${a.sentiment}] ${a.title}`),
    ].join('\n');

    const dataBlock = `NVDA $172.70 (-3.28%)
  GEX: 47.0M | Gamma: POSITIVE | PCR: 0.92
  Squeeze: 13% | NetPremium: $-22.9M
  CallWall: $185 | PutFloor: $165 | MaxPain: $180 (4.1% from price)
  Whale: 40 | DarkPool: 97% | IVSkew: +1.4%
  ImpliedMove: +/-17.3% | ContextScore: 48.0

TSLA $367.96 (-3.24%)
  GEX: 115.0M | Gamma: POSITIVE | PCR: 0.99
  Squeeze: 26% | NetPremium: $-393.3M
  CallWall: $410 | PutFloor: $300 | MaxPain: $303 (21.4% from price)
  Whale: 40 | DarkPool: 68% | IVSkew: +1.0%
  ImpliedMove: +/-21.4% | ContextScore: 47.0`;

    const sys = `You are a senior equity research analyst at Goldman Sachs. Write institutional-grade 2-3 sentence analysis for each stock.

RULES:
1. Cross-correlate ALL indicators. Explain HOW they interact, not just list values.
2. Weave news naturally as cause-and-effect into indicator analysis.
3. End with actionable environment conclusion.
4. No buy/sell advice. Observation only.
5. Each language reads NATIVELY (not translation).

Return ONLY valid JSON:
{"analyses":[{"ticker":"SYM","ko":"150-200 chars","en":"100-150 words","ja":"150-200 chars"}]}`;

    const userPrompt = `Analyze:\n${dataBlock}\n\nNEWS:\n${newsSection}`;

    // 2. Call Bedrock
    console.log('\nCalling Bedrock Claude S4...');
    const t0 = Date.now();
    const cmd = new InvokeModelCommand({
        modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 3000,
            temperature: 0.3,
            system: sys,
            messages: [
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: '{' },
            ],
        }),
    });

    const result = await bedrock.send(cmd);
    const body = JSON.parse(new TextDecoder().decode(result.body));
    const raw = '{' + (body.content?.[0]?.text || '');
    const elapsed = Date.now() - t0;

    const parsed = JSON.parse(raw);
    for (const a of parsed.analyses || []) {
        console.log('\n' + '='.repeat(50));
        console.log(`  ${a.ticker}`);
        console.log('='.repeat(50));
        console.log(`[KO] ${a.ko}`);
        console.log(`[EN] ${a.en}`);
        console.log(`[JA] ${a.ja}`);
    }
    console.log(`\nDone in ${(elapsed / 1000).toFixed(1)}s`);
}

test().catch(e => console.error('Error:', e.message));
