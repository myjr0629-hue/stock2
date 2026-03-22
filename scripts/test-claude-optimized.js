/**
 * Quick test: verify the new Claude-optimized prompt produces good results
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const https = require('https');

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('TIMEOUT')), 15000);
        https.get(url, { headers: { 'User-Agent': 'SIGNUM' } }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(d)); } catch { resolve(d); } });
        }).on('error', e => { clearTimeout(to); reject(e); });
    });
}

const SYSTEM_PROMPT = `You are a top-tier macro strategist at a Bloomberg-class institutional terminal.
Your role: CURATE the most impactful global market news and provide institutional-grade analysis.

<persona>
- Write Korean (한국어) in authoritative 전문 투자 분석가 tone — use expressions like "~에 주목할 필요가 있습니다", "~할 가능성을 시사합니다", "~에 대한 재평가가 불가피합니다"
- Write Japanese (日本語) in 金融プロフェッショナル tone — formal 「です・ます」 with precise financial terminology
- Write English in concise Bloomberg-wire professional style
- NEVER use machine-translation patterns. Each language must feel native.
</persona>

<compliance>
- Do NOT provide specific trading recommendations (buy/sell/hold)
- Use conditional language: "may indicate", "suggests potential", "watch for"
- Analysis must use IF→THEN format connecting news to market data
</compliance>

<output_rules>
- Select EXACTLY TOP 5 most impactful news (fewer if <5 unique)
- Prioritize: geopolitical > macro policy > market-moving > sector rotation > commentary
- DEDUPLICATE: same event → keep most detailed article only
- Each summary: 1-2 concise sentences with key facts and numbers
- Each analysis: exactly 1 dense IF→THEN sentence — no filler words — MUST reference provided market data
- urgency 1-10: 8+ only for BREAKING (<60 min old + extreme keywords: crash/halt/war/collapse/default)
</output_rules>`;

async function go() {
    console.log('Fetching news...');
    const url = 'https://api.polygon.io/v2/reference/news?limit=30&order=desc&sort=published_utc&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
    const data = await httpsGet(url);
    const articles = data?.results || [];

    const inputItems = articles.slice(0, 15).map((a, i) => ({
        id: a.id || `news-${i}`,
        title: a.title || '',
        desc: (a.description || '').substring(0, 200),
        source: a.publisher?.name || '',
        published: a.published_utc || '',
    }));

    const userPrompt = `<market_data>
S&P 500: 5,667.56 (-1.52%) | VIX: 26.78 (+11.3%) | US 10Y: 4.31% (-1.37%) | DXY: 100.5
</market_data>

<articles count="${inputItems.length}">
${JSON.stringify(inputItems)}
</articles>

Select TOP 5 and output as JSON array with this exact schema per item:
{"id","headline","summaryKR","summaryEN","summaryJP","analysisKR","analysisEN","analysisJP","category":"US_MARKET|GLOBAL|GEOPOLITICAL|MACRO|SECTOR","impact":"BULLISH|BEARISH|MIXED|NEUTRAL","urgency":1-10}

Output ONLY the JSON array — no explanation, no markdown.`;

    console.log('Calling Claude Haiku with optimized prompt...');
    const t = Date.now();
    const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
    const bc = new BedrockRuntimeClient({
        region: 'us-east-1',
        credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    });
    const cmd = new InvokeModelCommand({
        modelId: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 4096,
            temperature: 0.3,
            system: SYSTEM_PROMPT,
            messages: [
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: '[' },
            ],
        }),
    });
    const r = await bc.send(cmd);
    const bb = JSON.parse(new TextDecoder().decode(r.body));
    const text = bb.content?.[0]?.text || '';
    const fullJson = '[' + text;
    const parsed = JSON.parse(fullJson);
    const elapsed = ((Date.now() - t) / 1000).toFixed(1);
    console.log(`Done in ${elapsed}s (${bb.usage?.input_tokens}in/${bb.usage?.output_tokens}out)`);

    fs.writeFileSync('scripts/claude-optimized-result.json', JSON.stringify(parsed, null, 2), 'utf8');
    console.log('Saved to scripts/claude-optimized-result.json');
}

go().catch(e => console.error('ERROR:', e.message));
