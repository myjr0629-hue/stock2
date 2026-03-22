/**
 * Claude vs Gemini — News Pulse Comparison
 * Saves results as UTF-8 JSON (no console encoding issues)
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const https = require('https');

const POLYGON_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';

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

async function go() {
    // 1. Fetch news
    console.log('Fetching Polygon news...');
    const url = `https://api.polygon.io/v2/reference/news?limit=30&order=desc&sort=published_utc&apiKey=${POLYGON_KEY}`;
    const data = await httpsGet(url);
    const articles = data?.results || [];
    console.log(`Got ${articles.length} articles`);

    const inputItems = articles.slice(0, 15).map((a, i) => ({
        id: a.id || `news-${i}`,
        title: a.title || '',
        desc: (a.description || '').substring(0, 200),
        source: a.publisher?.name || '',
        published: a.published_utc || '',
    }));

    const prompt = `You are a top-tier macro strategist at a Bloomberg-class terminal.
Your job: CURATE the most impactful global market news, translate into 3 languages, and provide ACTIONABLE market interpretation linked to real-time indicators.

CURRENT MARKET DATA:
S&P 500: 5,667.56 (-1.52%) | VIX: 26.78 (+11.3%) | US 10Y: 4.31% (-1.37%) | DXY: 100.5

INPUT NEWS (${inputItems.length} articles — select TOP 5 by global market impact):
${JSON.stringify(inputItems)}

CRITICAL RULES:
1. SELECT ONLY TOP 5 most impactful news. Prioritize: geopolitical > macro policy > market-moving > sector rotation > commentary.
2. DEDUPLICATE: same event → keep most detailed one only.
3. COMPLIANCE: No buy/sell/hold. Use "may indicate", "suggests potential", "watch for". IF→THEN format.
4. TRANSLATIONS must be PERFECT natural language — Korean=한국어 전문 투자 톤, Japanese=日本語金融プロフェッショナルトーン.
5. ANALYSIS must CONNECT news to market data above (e.g., "VIX surging confirms market fear").
6. Each 'summary' = 1-2 concise sentences.
7. Each 'analysis' = exactly 1 sharp IF→THEN sentence. No filler.
8. 'urgency' 1-10: 8+ = BREAKING only.

For EACH TOP 5 item output:
{
  "id": "original article id",
  "headline": "original English headline",
  "summaryKR": "한국어 요약 (1-2문장, 전문 투자 톤)",
  "summaryEN": "English summary (1-2 sentences)",
  "summaryJP": "日本語要約 (1-2文、金融プロトーン)",
  "analysisKR": "한국어 IF→THEN 시장 해석",
  "analysisEN": "English IF→THEN market interpretation",
  "analysisJP": "日本語 IF→THEN 市場解釈",
  "category": "US_MARKET|GLOBAL|GEOPOLITICAL|MACRO|SECTOR",
  "impact": "BULLISH|BEARISH|MIXED|NEUTRAL",
  "urgency": 1-10
}

Output MUST be a valid JSON Array of EXACTLY 5 items.
DO NOT output markdown code blocks. Raw JSON only.`;

    const results = {};
    const timing = {};

    // 2. Call Gemini
    console.log('\nCalling Gemini (gemini-2.5-flash)...');
    const t1 = Date.now();
    try {
        const { GoogleGenAI } = await import('@google/genai');
        const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_NEWS_KEY });
        const gr = await genAI.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        const gtext = (gr.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        results.gemini = JSON.parse(gtext);
        timing.gemini = ((Date.now() - t1) / 1000).toFixed(1) + 's';
        console.log(`Gemini done in ${timing.gemini}`);
    } catch (e) {
        console.error('Gemini FAILED:', e.message);
        results.gemini = { error: e.message };
    }

    // 3. Call Claude 3.5 Haiku
    console.log('\nCalling Claude 3.5 Haiku...');
    const t2 = Date.now();
    try {
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
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        const br = await bc.send(cmd);
        const bb = JSON.parse(new TextDecoder().decode(br.body));
        const btext = (bb.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        results.claude = JSON.parse(btext);
        timing.claude = ((Date.now() - t2) / 1000).toFixed(1) + 's';
        timing.claudeTokens = { input: bb.usage?.input_tokens, output: bb.usage?.output_tokens };
        console.log(`Claude done in ${timing.claude} (${bb.usage?.input_tokens}in/${bb.usage?.output_tokens}out)`);
    } catch (e) {
        console.error('Claude FAILED:', e.message);
        results.claude = { error: e.message };
    }

    // 4. Call Claude 3.7 Sonnet (pro-level)
    console.log('\nCalling Claude 3.7 Sonnet...');
    const t3 = Date.now();
    try {
        const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
        const bc = new BedrockRuntimeClient({
            region: 'us-east-1',
            credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
        });
        const cmd = new InvokeModelCommand({
            modelId: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 4096,
                temperature: 0.3,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        const br = await bc.send(cmd);
        const bb = JSON.parse(new TextDecoder().decode(br.body));
        const btext = (bb.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        results.sonnet = JSON.parse(btext);
        timing.sonnet = ((Date.now() - t3) / 1000).toFixed(1) + 's';
        timing.sonnetTokens = { input: bb.usage?.input_tokens, output: bb.usage?.output_tokens };
        console.log(`Sonnet done in ${timing.sonnet} (${bb.usage?.input_tokens}in/${bb.usage?.output_tokens}out)`);
    } catch (e) {
        console.error('Sonnet FAILED:', e.message);
        results.sonnet = { error: e.message };
    }

    // 5. Save
    const output = { timing, results };
    fs.writeFileSync('scripts/claude-vs-gemini-result.json', JSON.stringify(output, null, 2), 'utf8');
    console.log('\nSaved to scripts/claude-vs-gemini-result.json');
}

go().catch(e => console.error('FATAL:', e.message));
