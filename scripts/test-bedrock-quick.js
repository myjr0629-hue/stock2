/**
 * Quick re-run: save Gemini vs Bedrock results as UTF-8 JSON
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
    const url = `https://api.polygon.io/v2/reference/news?limit=15&order=desc&sort=published_utc&apiKey=${POLYGON_KEY}`;
    const data = await httpsGet(url);
    const articles = data?.results || [];
    console.log(`Got ${articles.length} articles`);

    const inputItems = articles.slice(0, 10).map((a, i) => ({
        id: a.id || `news-${i}`,
        title: a.title || '',
        desc: (a.description || '').substring(0, 200),
        source: a.publisher?.name || '',
    }));

    const prompt = `You are a top-tier macro strategist. Curate TOP 3 most impactful news for global investors.
For EACH, output JSON with these fields:
- id, headline
- summaryKR (한국어 전문 투자 톤, 1-2문장)
- summaryEN (English, 1-2 sentences)  
- summaryJP (日本語金融プロフェッショナルトーン, 1-2文)
- analysisKR (한국어 시장 해석, IF→THEN)
- analysisEN (English market interpretation, IF→THEN)
- analysisJP (日本語市場解釈, IF→THEN)
- category: US_MARKET|GLOBAL|GEOPOLITICAL|MACRO|SECTOR
- impact: BULLISH|BEARISH|MIXED|NEUTRAL
- urgency: 1-10

Market data: S&P 500 5,667 (-1.52%), VIX 26.78 (+11.3%), US 10Y 4.31%

NEWS:
${JSON.stringify(inputItems)}

Output ONLY a valid JSON array. No markdown.`;

    // 2. Call Gemini
    console.log('Calling Gemini...');
    const t1 = Date.now();
    const { GoogleGenAI } = await import('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_NEWS_KEY });
    const gr = await genAI.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    const gtext = (gr.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const gemini = JSON.parse(gtext);
    console.log(`Gemini done in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

    // 3. Call Bedrock (Nova Pro)
    console.log('Calling Bedrock Nova Pro...');
    const t2 = Date.now();
    const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
    const bc = new BedrockRuntimeClient({
        region: 'us-east-1',
        credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    });
    const cmd = new InvokeModelCommand({
        modelId: 'amazon.nova-pro-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
            messages: [{ role: 'user', content: [{ text: prompt }] }],
            inferenceConfig: { maxTokens: 4096, temperature: 0.3 },
        }),
    });
    const br = await bc.send(cmd);
    const bb = JSON.parse(new TextDecoder().decode(br.body));
    const btext = (bb.output?.message?.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const bedrock = JSON.parse(btext);
    console.log(`Bedrock done in ${((Date.now() - t2) / 1000).toFixed(1)}s`);

    // 4. Save as UTF-8 JSON
    const result = { gemini, bedrock };
    fs.writeFileSync('scripts/comparison-result.json', JSON.stringify(result, null, 2), 'utf8');
    console.log('Saved to scripts/comparison-result.json');
}

go().catch(e => console.error('ERROR:', e.message));
