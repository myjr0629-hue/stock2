/**
 * Bedrock vs Gemini — News Pulse Comparison Test
 * 
 * Fetches REAL market news from Polygon, sends the SAME prompt to both 
 * Gemini (gemini-2.5-flash) and Bedrock (Claude 3.5 Haiku), then 
 * compares results side-by-side across all 3 languages (ko, en, ja).
 * 
 * Usage: node scripts/test-bedrock-vs-gemini.js
 */

require('dotenv').config({ path: '.env.local' });
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const https = require('https');

// ─── Config ───
const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const GEMINI_KEY = process.env.GEMINI_NEWS_KEY || process.env.GEMINI_API_KEY;

// Bedrock Models — Amazon Nova (ON_DEMAND, no form needed)
// Claude requires use-case form submission in AWS Console — will switch once approved
const BEDROCK_MODEL_FLASH = 'amazon.nova-pro-v1:0';  // Best immediate option
const BEDROCK_MODEL_PRO = 'amazon.nova-pro-v1:0';    // Same for now (Nova Pro is the strongest Nova)

// ─── Helpers ───
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('TIMEOUT')), 15000);
        https.get(url, { headers: { 'User-Agent': 'SIGNUM-HQ/7.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(data)); } catch { resolve(data); } });
        }).on('error', (e) => { clearTimeout(to); reject(e); });
    });
}

// ─── Step 1: Fetch Polygon News (same as production) ───
async function fetchPolygonNews() {
    console.log('\n📰 Step 1: Fetching market-wide news from Polygon...');
    const url = `https://api.polygon.io/v2/reference/news?limit=30&order=desc&sort=published_utc&apiKey=${POLYGON_KEY}`;
    const data = await httpsGet(url);
    const articles = data?.results || [];
    console.log(`   Found ${articles.length} articles`);
    return articles;
}

// ─── Step 2: Build the EXACT same prompt used in production ───
function buildPrompt(articles, macroContext) {
    const inputItems = articles.slice(0, 30).map((a, i) => ({
        id: a.id || `news-${i}`,
        title: a.title || '',
        desc: (a.description || '').substring(0, 200),
        source: a.publisher?.name || '',
        published: a.published_utc || '',
        ageMin: Math.round((Date.now() - new Date(a.published_utc || Date.now()).getTime()) / 60000),
    }));

    return `You are a top-tier macro strategist at a Bloomberg-class terminal.
Your job: CURATE the most impactful global market news, translate into 3 languages, and provide ACTIONABLE market interpretation linked to real-time indicators.

CURRENT MARKET DATA (use this for your analysis):
${macroContext || 'Market data unavailable (weekend)'}

INPUT NEWS (${inputItems.length} articles — select TOP 5 by global market impact):
${JSON.stringify(inputItems)}

CRITICAL RULES:
1. SELECT ONLY TOP 5 most impactful news for global market investors. Prioritize: geopolitical > macro policy > market-moving events > sector rotation > commentary.
2. DEDUPLICATE: if multiple articles cover the same event, keep only the most detailed one.
3. COMPLIANCE: Do NOT provide specific trading recommendations (buy/sell/hold). Focus on factual impact analysis and conditional scenarios (IF→THEN). Use language like "may indicate", "suggests potential", "watch for" instead of directives.
4. TRANSLATIONS must be PERFECT natural language — not machine-translated. Korean=한국어 전문 투자 톤, Japanese=日本語金融プロフェッショナルトーン.
5. ANALYSIS must CONNECT news to the market data above when relevant (e.g., "VIX surging confirms market fear from tariff news").
6. Each 'summary' should be 1-2 concise sentences capturing the key fact.
7. Each 'analysis' MUST be exactly 1 sharp sentence. Be maximally dense — no filler words. Link to indicator data using IF→THEN format when possible.
8. 'urgency' 1-10: 8+ = BREAKING (published < 60 min AND extreme market impact keywords like crash, halt, emergency, war, collapse, default).

For EACH of the TOP 5 selected items, output:
{
  "id": "original article id",
  "headline": "original English headline",
  "summaryKR": "한국어 요약 (1-2문장, 전문 투자 톤)",
  "summaryEN": "English summary (1-2 sentences, professional)",
  "summaryJP": "日本語要約 (1-2文、金融プロトーン)",
  "analysisKR": "한국어 시장 해석 — 지표 연결 (조건부 시나리오 형식)",
  "analysisEN": "English market interpretation — indicator-linked (IF→THEN format)",
  "analysisJP": "日本語市場解釈 — 指標連動 (条件付きシナリオ)",
  "category": "US_MARKET|GLOBAL|GEOPOLITICAL|MACRO|SECTOR",
  "impact": "BULLISH|BEARISH|MIXED|NEUTRAL",
  "urgency": 1-10
}

Output MUST be a valid JSON Array of EXACTLY 5 items (or fewer if < 5 unique):
[ { ... }, { ... } ]
DO NOT output markdown code blocks. Raw JSON only.`;
}

// ─── Gemini Call ───
async function callGemini(prompt) {
    console.log('\n🔵 Calling Gemini (gemini-2.5-flash)...');
    const start = Date.now();
    
    // Dynamic import for ESM-only package
    const { GoogleGenAI } = await import('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: GEMINI_KEY });
    
    const result = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    const text = result.text || '';
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`   ✅ Gemini responded in ${elapsed}s (${text.length} chars)`);
    
    const json = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return { parsed: JSON.parse(json), raw: text, elapsed };
}

// ─── Bedrock Call ───
async function callBedrock(prompt, modelId = BEDROCK_MODEL_FLASH) {
    console.log(`\n🟠 Calling Bedrock (${modelId})...`);
    const start = Date.now();
    
    const client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });
    
    // Detect model type for request format
    const isAnthropic = modelId.includes('claude') || modelId.includes('anthropic');
    const isNova = modelId.includes('nova') || modelId.includes('amazon');
    
    let body;
    if (isAnthropic) {
        body = JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 4096,
            temperature: 0.3,
            messages: [{ role: "user", content: prompt }],
        });
    } else {
        // Amazon Nova format (Converse-compatible)
        body = JSON.stringify({
            messages: [{ role: "user", content: [{ text: prompt }] }],
            inferenceConfig: { maxTokens: 4096, temperature: 0.3 },
        });
    }
    
    const command = new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body,
    });
    
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Extract text depending on model family
    let text, inputTokens, outputTokens;
    if (isAnthropic) {
        text = responseBody.content?.[0]?.text || '';
        inputTokens = responseBody.usage?.input_tokens || 0;
        outputTokens = responseBody.usage?.output_tokens || 0;
    } else {
        text = responseBody.output?.message?.content?.[0]?.text || '';
        inputTokens = responseBody.usage?.inputTokens || 0;
        outputTokens = responseBody.usage?.outputTokens || 0;
    }
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`   ✅ Bedrock responded in ${elapsed}s (${text.length} chars, ${inputTokens}in/${outputTokens}out tokens)`);
    
    const json = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return { parsed: JSON.parse(json), raw: text, elapsed, tokens: { input: inputTokens, output: outputTokens } };
}

// ─── Compare Results ───
function compareResults(geminiItems, bedrockItems) {
    console.log('\n' + '═'.repeat(80));
    console.log('  📊 COMPARISON REPORT: Gemini vs Bedrock');
    console.log('═'.repeat(80));
    
    // 1. Article Selection
    console.log('\n── Article Selection ──');
    const geminiIds = geminiItems.map(i => i.id);
    const bedrockIds = bedrockItems.map(i => i.id);
    const overlap = geminiIds.filter(id => bedrockIds.includes(id));
    console.log(`   Gemini selected: ${geminiIds.join(', ')}`);
    console.log(`   Bedrock selected: ${bedrockIds.join(', ')}`);
    console.log(`   Overlap: ${overlap.length}/5 articles (${(overlap.length/5*100).toFixed(0)}%)`);
    
    // 2. Compare each overlapping article
    for (const id of overlap) {
        const g = geminiItems.find(i => i.id === id);
        const b = bedrockItems.find(i => i.id === id);
        console.log(`\n── Article: ${g.headline?.substring(0, 60)}... ──`);
        
        console.log('\n   🇰🇷 Korean Summary:');
        console.log(`      Gemini:  ${g.summaryKR}`);
        console.log(`      Bedrock: ${b.summaryKR}`);
        
        console.log('\n   🇺🇸 English Summary:');
        console.log(`      Gemini:  ${g.summaryEN}`);
        console.log(`      Bedrock: ${b.summaryEN}`);
        
        console.log('\n   🇯🇵 Japanese Summary:');
        console.log(`      Gemini:  ${g.summaryJP}`);
        console.log(`      Bedrock: ${b.summaryJP}`);
        
        console.log('\n   🇰🇷 Korean Analysis:');
        console.log(`      Gemini:  ${g.analysisKR}`);
        console.log(`      Bedrock: ${b.analysisKR}`);
        
        console.log('\n   🇺🇸 English Analysis:');
        console.log(`      Gemini:  ${g.analysisEN}`);
        console.log(`      Bedrock: ${b.analysisEN}`);
        
        console.log('\n   🇯🇵 Japanese Analysis:');
        console.log(`      Gemini:  ${g.analysisJP}`);
        console.log(`      Bedrock: ${b.analysisJP}`);
        
        console.log(`\n   Impact:  Gemini=${g.impact} | Bedrock=${b.impact}`);
        console.log(`   Urgency: Gemini=${g.urgency} | Bedrock=${b.urgency}`);
        console.log(`   Category: Gemini=${g.category} | Bedrock=${b.category}`);
    }
    
    // 3. Quality metrics
    console.log('\n\n── Quality Metrics ──');
    const avgLenG = {
        summaryKR: geminiItems.reduce((s, i) => s + (i.summaryKR?.length || 0), 0) / geminiItems.length,
        summaryEN: geminiItems.reduce((s, i) => s + (i.summaryEN?.length || 0), 0) / geminiItems.length,
        summaryJP: geminiItems.reduce((s, i) => s + (i.summaryJP?.length || 0), 0) / geminiItems.length,
        analysisKR: geminiItems.reduce((s, i) => s + (i.analysisKR?.length || 0), 0) / geminiItems.length,
        analysisEN: geminiItems.reduce((s, i) => s + (i.analysisEN?.length || 0), 0) / geminiItems.length,
        analysisJP: geminiItems.reduce((s, i) => s + (i.analysisJP?.length || 0), 0) / geminiItems.length,
    };
    const avgLenB = {
        summaryKR: bedrockItems.reduce((s, i) => s + (i.summaryKR?.length || 0), 0) / bedrockItems.length,
        summaryEN: bedrockItems.reduce((s, i) => s + (i.summaryEN?.length || 0), 0) / bedrockItems.length,
        summaryJP: bedrockItems.reduce((s, i) => s + (i.summaryJP?.length || 0), 0) / bedrockItems.length,
        analysisKR: bedrockItems.reduce((s, i) => s + (i.analysisKR?.length || 0), 0) / bedrockItems.length,
        analysisEN: bedrockItems.reduce((s, i) => s + (i.analysisEN?.length || 0), 0) / bedrockItems.length,
        analysisJP: bedrockItems.reduce((s, i) => s + (i.analysisJP?.length || 0), 0) / bedrockItems.length,
    };
    
    console.log('   Average field lengths (chars):');
    console.log('   ┌──────────────────┬──────────┬──────────┐');
    console.log('   │ Field            │ Gemini   │ Bedrock  │');
    console.log('   ├──────────────────┼──────────┼──────────┤');
    for (const key of Object.keys(avgLenG)) {
        console.log(`   │ ${key.padEnd(16)} │ ${avgLenG[key].toFixed(0).padStart(6)}   │ ${avgLenB[key].toFixed(0).padStart(6)}   │`);
    }
    console.log('   └──────────────────┴──────────┴──────────┘');
    
    // 4. JSON compliance check
    console.log('\n── JSON Compliance ──');
    const requiredFields = ['id', 'headline', 'summaryKR', 'summaryEN', 'summaryJP', 'analysisKR', 'analysisEN', 'analysisJP', 'category', 'impact', 'urgency'];
    for (const provider of [{ name: 'Gemini', items: geminiItems }, { name: 'Bedrock', items: bedrockItems }]) {
        let missingCount = 0;
        let emptyCount = 0;
        for (const item of provider.items) {
            for (const field of requiredFields) {
                if (!(field in item)) missingCount++;
                else if (!item[field] && field !== 'urgency') emptyCount++;
            }
        }
        const status = missingCount === 0 && emptyCount === 0 ? '✅ PERFECT' : `⚠️ Missing: ${missingCount}, Empty: ${emptyCount}`;
        console.log(`   ${provider.name}: ${status}`);
    }
    
    // 5. Non-overlapping articles
    const onlyGemini = geminiIds.filter(id => !bedrockIds.includes(id));
    const onlyBedrock = bedrockIds.filter(id => !geminiIds.includes(id));
    if (onlyGemini.length > 0 || onlyBedrock.length > 0) {
        console.log('\n── Non-overlapping Articles ──');
        for (const id of onlyGemini) {
            const item = geminiItems.find(i => i.id === id);
            console.log(`   [Gemini Only] ${item?.headline?.substring(0, 70)}`);
            console.log(`      KR: ${item?.summaryKR}`);
            console.log(`      EN: ${item?.summaryEN}`);
            console.log(`      JP: ${item?.summaryJP}`);
        }
        for (const id of onlyBedrock) {
            const item = bedrockItems.find(i => i.id === id);
            console.log(`   [Bedrock Only] ${item?.headline?.substring(0, 70)}`);
            console.log(`      KR: ${item?.summaryKR}`);
            console.log(`      EN: ${item?.summaryEN}`);
            console.log(`      JP: ${item?.summaryJP}`);
        }
    }
}

// ─── Main ───
async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  🧪 BEDROCK vs GEMINI — News Pulse Comparison Test');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log(`  Gemini Model: gemini-2.5-flash`);
    console.log(`  Bedrock Model: ${BEDROCK_MODEL_FLASH}`);
    
    // 1. Fetch real news
    const articles = await fetchPolygonNews();
    if (articles.length === 0) {
        console.error('❌ No articles found. Exiting.');
        return;
    }
    
    // 2. Build prompt (weekend = no macro data)
    const macroContext = 'Weekend — market data from last session: S&P 500 closed at 5,667.56 (-1.52%), VIX at 26.78 (+11.3%), US 10Y at 4.31% (-1.37%), DXY at 100.5';
    const prompt = buildPrompt(articles, macroContext);
    console.log(`\n   Prompt length: ${prompt.length} chars`);
    
    // 3. Call both in parallel
    let geminiResult, bedrockResult;
    try {
        [geminiResult, bedrockResult] = await Promise.all([
            callGemini(prompt).catch(e => { console.error('❌ Gemini failed:', e.message); return null; }),
            callBedrock(prompt, BEDROCK_MODEL_FLASH).catch(e => { console.error('❌ Bedrock failed:', e.message); return null; }),
        ]);
    } catch (e) {
        console.error('❌ Parallel call failed:', e.message);
        return;
    }
    
    if (!geminiResult && !bedrockResult) {
        console.error('❌ Both providers failed. Check API keys and model access.');
        return;
    }
    
    // 4. Print individual results if one failed
    if (!geminiResult) {
        console.log('\n⚠️ Gemini failed — showing Bedrock only:');
        console.log(JSON.stringify(bedrockResult.parsed, null, 2));
        return;
    }
    if (!bedrockResult) {
        console.log('\n⚠️ Bedrock failed — showing Gemini only:');
        console.log(JSON.stringify(geminiResult.parsed, null, 2));
        return;
    }
    
    // 5. Compare
    console.log(`\n⏱️  Latency: Gemini=${geminiResult.elapsed}s | Bedrock=${bedrockResult.elapsed}s`);
    if (bedrockResult.tokens) {
        console.log(`📊  Bedrock tokens: ${bedrockResult.tokens.input} input / ${bedrockResult.tokens.output} output`);
    }
    
    const geminiItems = Array.isArray(geminiResult.parsed) ? geminiResult.parsed : geminiResult.parsed?.items || [];
    const bedrockItems = Array.isArray(bedrockResult.parsed) ? bedrockResult.parsed : bedrockResult.parsed?.items || [];
    
    compareResults(geminiItems, bedrockItems);
    
    console.log('\n' + '═'.repeat(80));
    console.log('  ✅ TEST COMPLETE');
    console.log('═'.repeat(80));
}

main().catch(e => {
    console.error('❌ Fatal error:', e);
    process.exit(1);
});
