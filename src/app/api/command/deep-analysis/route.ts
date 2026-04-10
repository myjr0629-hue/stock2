/**
 * POST /api/command/deep-analysis
 * 
 * [V2.0] AI Deep Analysis — Claude Sonnet 4 (Centralized Client)
 * Generates TRILINGUAL (ko/en/ja) institutional-grade narrative.
 * Single Bedrock call → all 3 languages → cached per ticker.
 * 
 * Features: Retry + Haiku fallback + concurrency control via bedrockClient.
 * 
 * Trigger: FIRST_VIEW | SCHEDULED | PRICE_MOVE | GAMMA_FLIP
 * Cache: Redis with session-aware TTL (key: ai-deep-analysis:${ticker})
 * POLICY: Observation-only language. No investment advice.
 */

import { NextResponse } from 'next/server';
import { callBedrock } from '@/services/bedrockClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive } from '@/services/massiveClient';
import { fetchSECFilings, buildSECXmlBlock } from '@/services/secFilingsService';

export const maxDuration = 60;

// --- Session-aware TTL ---
function getSessionTTL(session: string): number {
    switch (session) {
        case 'PRE': return 90 * 60;       // 90 min
        case 'REG': return 30 * 60;       // 30 min
        case 'POST': return 90 * 60;      // 90 min
        case 'CLOSED': return 12 * 60 * 60; // 12 hours (until next open)
        default: return 60 * 60;          // 1 hour fallback
    }
}

// --- News Keyword Weights ---
function getNewsWeight(ageHours: number, title: string): string {
    const urgentKeywords = /surge|plunge|crash|rally|soar|plummet|급등|급락|폭등|폭락|暴騰|暴落|breaking|halt/i;
    if (urgentKeywords.test(title)) return '3x_URGENT';
    if (ageHours <= 24) return '2x_RECENT';
    if (ageHours <= 48) return '1.5x';
    return '1x';
}



export async function POST(req: Request) {
    const startTime = Date.now();
    let body: any = {};

    try {
        body = await req.json();
        const { ticker, locale = 'ko', snapshot, triggerReason = 'FIRST_VIEW' } = body;

        if (!ticker) {
            return NextResponse.json({ error: 'ticker required' }, { status: 400 });
        }

        const session = snapshot?.session || 'CLOSED';
        const cacheKey = `ai-deep-analysis:${ticker}`;

        // --- Check Cache (unless PRICE_MOVE or GAMMA_FLIP forces refresh) ---
        const forceRefresh = triggerReason === 'PRICE_MOVE' || triggerReason === 'GAMMA_FLIP' || triggerReason === 'MANUAL_REFRESH';
        if (!forceRefresh) {
            const cached = await getFromCache<any>(cacheKey);
            if (cached && (cached.currentState || cached.narrative)) {
                console.log(`[DeepAnalysis] Cache HIT for ${ticker}:${locale}`);
                return NextResponse.json({
                    ...cached,
                    fromCache: true,
                });
            }
        }



        // --- Fetch News + SEC Data (parallel) ---
        let newsArticles: { title: string; age: string; sentiment: string; source: string; weight: string }[] = [];
        let secXmlBlock = '';

        const [newsResult, secResult] = await Promise.allSettled([
            // News fetch
            (async () => {
                const newsData = await fetchMassive(
                    '/v2/reference/news',
                    { ticker, limit: '15', order: 'desc', sort: 'published_utc' },
                    true
                );
                const now = Date.now();
                return (newsData?.results || []).slice(0, 10).map((n: any) => {
                    const pubDate = new Date(n.published_utc || 0).getTime();
                    const ageMs = now - pubDate;
                    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
                    const ageStr = ageHours < 1 ? 'Now' : ageHours < 24 ? `${ageHours}h` : `${Math.floor(ageHours / 24)}d`;
                    const desc = n.description ? ` — ${n.description.slice(0, 300)}` : '';
                    return {
                        title: (n.title || '') + desc,
                        age: ageStr,
                        sentiment: n.insights?.[0]?.sentiment || 'neutral',
                        source: n.publisher?.name || 'Unknown',
                        weight: getNewsWeight(ageHours, n.title || ''),
                    };
                }).filter((a: any) => a.title);
            })(),
            // SEC filings fetch (8-K + 10-K)
            fetchSECFilings(ticker),
        ]);

        if (newsResult.status === 'fulfilled') {
            newsArticles = newsResult.value;
        } else {
            console.warn('[DeepAnalysis] News fetch failed:', newsResult.reason);
        }

        if (secResult.status === 'fulfilled') {
            secXmlBlock = buildSECXmlBlock(secResult.value);
            if (secXmlBlock) {
                console.log(`[DeepAnalysis] SEC data: ${secResult.value.filings8k.length} 8-K, ${secResult.value.business10k ? '1' : '0'} 10-K`);
            }
        }

        // --- If news is scarce (< 2 articles in 7 days), fetch sector news ---
        let sectorNewsNote = '';
        if (newsArticles.length < 2) {
            try {
                const sectorTickers = snapshot?.relatedTickers || ['SPY', 'QQQ'];
                const sectorTickerStr = Array.isArray(sectorTickers) ? sectorTickers.slice(0, 3).join(',') : 'SPY,QQQ';
                const sectorNews = await fetchMassive(
                    '/v2/reference/news',
                    { ticker: sectorTickerStr, limit: '5', order: 'desc', sort: 'published_utc' },
                    true
                );
                if (sectorNews?.results?.length > 0) {
                    const sectorItems = sectorNews.results.slice(0, 3).map((n: any) => n.title).join('; ');
                    sectorNewsNote = `\n<sector_news_fallback>This ticker has limited recent news. Related sector headlines: ${sectorItems}</sector_news_fallback>`;
                }
            } catch (e) {
                console.warn('[DeepAnalysis] Sector news fallback failed:', e);
            }
        }

        // --- Build XML Context ---
        const s = snapshot || {};
        const signalCore = s.signalCore || {};
        const structure = s.structure || {};
        const sma = s.sma || {};
        const fundamental = s.fundamental || {};
        const analyst = s.analyst || {};
        const institutional = s.institutional || {};
        const volatility = s.volatility || {};
        const squeeze = s.squeeze || {};
        const earnings = s.earnings || {};
        const flow = s.flow || {};
        const conviction = s.conviction || {};

        const priceChange = s.priceChange || 0;
        const priceChangeStr = priceChange >= 0 ? `+${priceChange.toFixed(2)}%` : `${priceChange.toFixed(2)}%`;

        const newsXml = newsArticles.length > 0
            ? newsArticles.map(n =>
                `    <article age="${n.age}" sentiment="${n.sentiment}" source="${n.source}" weight="${n.weight}">${n.title}</article>`
            ).join('\n')
            : '    <none>No recent news available for this ticker</none>';

        const xmlContext = `<ticker_analysis ticker="${ticker}" price="$${s.price || 0}" session="${session}" price_change="${priceChangeStr}">
  <signal_core direction="${signalCore.direction || 'NEUTRAL'}" conviction="${signalCore.conviction || 'MIXED'}" condition="${signalCore.condition || 'TREND'}">
    <conclusion>${signalCore.conclusion || 'N/A'}</conclusion>
    <bull_signals count="${signalCore.bullCount || 0}">${signalCore.bullSignals || 'None'}</bull_signals>
    <bear_signals count="${signalCore.bearCount || 0}">${signalCore.bearSignals || 'None'}</bear_signals>
  </signal_core>
  
  <high_level_gauges>
    <context_score value="${s.contextScore?.value ?? 'N/A'}" grade="${s.contextScore?.grade ?? 'N/A'}"/>
    <smart_flow value="${s.smartFlow?.value ?? 'N/A'}" trend="${s.smartFlow?.trend ?? 'N/A'}"/>
  </high_level_gauges>
  
  <technicals>
    <sma cross="${sma.cross || 'NONE'}" sma50="${sma.sma50 || 'N/A'}" sma200="${sma.sma200 || 'N/A'}"/>
    <vwap value="${s.vwap || 'N/A'}" distance="${s.vwapDistance || 'N/A'}"/>
    <conviction score="${conviction.score || 'N/A'}" grade="${conviction.grade || 'N/A'}"/>
    <trend_phase>${sma.trendPhase || 'N/A'}</trend_phase>
  </technicals>
  
  <options_flow>
    <net_gex>${structure.netGex ? (structure.netGex / 1e6).toFixed(1) + 'M' : 'N/A'}</net_gex>
    <gamma_flip_level note="THIS_IS_NOT_CALL_WALL">$${structure.gammaFlipLevel || 'N/A'} (${s.price > (structure.gammaFlipLevel || 0) ? 'LONG_GAMMA' : 'SHORT_GAMMA'} zone)</gamma_flip_level>
    <squeeze_risk>${structure.squeezeRisk || 'N/A'} (${structure.squeezeScore || 0}%)</squeeze_risk>
    <pc_ratio>${structure.pcRatio?.toFixed(2) || 'N/A'}</pc_ratio>
    <call_wall note="HIGHEST_CALL_CONCENTRATION">$${structure.callWall || 'N/A'}</call_wall>
    <put_floor note="HIGHEST_PUT_CONCENTRATION">$${structure.putFloor || 'N/A'}</put_floor>
    <max_pain>$${structure.maxPain || 'N/A'}</max_pain>
    <net_premium>${flow.netPremium ? (flow.netPremium > 0 ? '+' : '') + '$' + (Math.abs(flow.netPremium) / 1e6).toFixed(1) + 'M' : 'N/A'} (${flow.netPremium > 0 ? 'CALL dominant' : flow.netPremium < 0 ? 'PUT dominant' : 'NEUTRAL'})</net_premium>
    <gamma_concentration>${structure.gammaConcentration || 'N/A'}% (${structure.gammaConcentrationLabel || 'N/A'})</gamma_concentration>
  </options_flow>
  
  <fundamentals score="${fundamental.score || 'N/A'}" grade="${fundamental.grade || 'N/A'}" pe="${fundamental.pe || 'N/A'}" fcf_margin="${fundamental.fcfMargin || 'N/A'}"/>
  
  <institutional>
    <analyst_score>${analyst.score || 'N/A'}/100 (Buy ${analyst.buyPct || 'N/A'}%)</analyst_score>
    <inst_radar>${institutional.dpRatio || 'N/A'}% (${institutional.activity || 'N/A'})</inst_radar>
    <short_squeeze status="${squeeze.status || 'N/A'}" si="${squeeze.siPercent || 'N/A'}%"/>
  </institutional>
  
  <volatility regime="${volatility.regime || 'N/A'}" score="${volatility.regimeScore || 'N/A'}" gex_long="${volatility.gexLong || 'N/A'}%"/>
  
  <earnings days_until="${earnings.daysUntil || 'N/A'}" date="${earnings.date || 'N/A'}" estimated_eps="${earnings.estimatedEps || 'N/A'}"/>
  
  <news recency_weighted="true" count="${newsArticles.length}">
${newsXml}
  </news>${sectorNewsNote}
${secXmlBlock ? '\n' + secXmlBlock : ''}
  
  <trigger_reason>${triggerReason}</trigger_reason>
</ticker_analysis>`;

        // --- System Prompt (V2: Trilingual) ---
        const systemPrompt = `You are a senior institutional equity research analyst writing a DEEP ANALYSIS NOTE.

<persona>
- You write like a Goldman Sachs or Morgan Stanley research team
- Your analysis connects indicators to tell a STORY, not list data points
- News is woven naturally into the narrative as supporting evidence or context
- The current state assessment is crystal clear
- You go DEEP — explain WHY indicators matter, how they RELATE to each other
</persona>

<language>
You MUST produce output in ALL THREE languages simultaneously: Korean (ko), English (en), Japanese (ja).
- Korean: 네이티브 품질. 번역체 금지. 기관 리서치 애널리스트급. "관찰됨", "확인됨" 등 관찰적 표현.
- English: Native quality. Institutional research analyst. "observed", "noted", "suggests".
- Japanese: ネイティブ品質。翻訳調禁止。「観測された」「確認された」等。
All versions convey the SAME analysis with NATIVE expressions. No investment advice.
</language>

<output_format>
Return ONLY valid JSON (no markdown fences).
All text fields use { "ko": "...", "en": "...", "ja": "..." } trilingual structure.
{
  "currentState": {
    "ko": "1줄 현재 상태 핵심 판단 (예: 'BULLISH — 기술적 골든크로스 + 기관 매수 우위 속 감마 롱존 유지')",
    "en": "One-line current state assessment (e.g., 'BULLISH — Technical golden cross + institutional call dominance')",
    "ja": "1行の現状核心判断 (例: 'BULLISH — テクニカルゴールデンクロス + 機関買い優勢の中ガンマロングゾーン維持')"
  },
  "sections": [
    {
      "title": { "ko": "기술적 구조 분석", "en": "Technical Structure Analysis", "ja": "テクニカル構造分析" },
      "content": { "ko": "2-4문장", "en": "2-4 sentences", "ja": "2-4文" }
    },
    {
      "title": { "ko": "옵션 포지셔닝", "en": "Options Positioning", "ja": "オプションポジショニング" },
      "content": { "ko": "2-3문장", "en": "2-3 sentences", "ja": "2-3文" }
    },
    {
      "title": { "ko": "뉴스 및 시장 맥락", "en": "News & Market Context", "ja": "ニュースと市場コンテクスト" },
      "content": { "ko": "2-3문장", "en": "2-3 sentences", "ja": "2-3文" }
    }
  ],
  "keyInsight": { "ko": "핵심 인사이트 1줄", "en": "One-line key insight", "ja": "核心インサイト1行" },
  "riskFlag": "HIGH | MEDIUM | LOW | NONE",
  "confidence": "HIGH | MEDIUM | LOW"
}
</output_format>

<critical_rules>
- SECTIONS: 2-4 sections with clear titles. Each section 2-4 sentences of DEEP analysis.
- DATA ACCURACY: Use EXACT values from the XML data. call_wall ≠ gamma_flip_level.
- NO DUPLICATE METRICS: Focus purely on narrative insight.
- NEWS INTEGRATION: Weave news naturally into analysis. DO NOT put indicator data in the News section.
- NEW GAUGES INTEGRATION: The XML now provides <context_score> (overall momentum/fundamentals) and <smart_flow> (institutional money flow).
   -> MUST blend <context_score> NATURALLY into "Technical Structure Analysis".
   -> MUST blend <smart_flow> NATURALLY into "Options Positioning".
   -> IMPORTANT: Do NOT make the entire section about these two scores. They should act as supporting evidence (e.g., "The SMA golden cross is further validated by a solid Context Score of 66...") alongside the existing deep technical/options indicators.
- If news is scarce, focus on structural indicators and sector context.
- If trigger_reason=PRICE_MOVE, explain WHAT likely caused it.
- SEC FILINGS (8-K/10-K): If provided in <sec_filings>, reference recent corporate events (8-K) as supporting context. Use 10-K business overview to understand the company's revenue structure and competitive positioning.
- FORBIDDEN: investment advice, buy/sell recommendations, emojis.
- Make connections between indicators.
</critical_rules>`;

        const userPrompt = xmlContext;

        // --- Call Bedrock (with retry + fallback) ---
        const bedrockResult = await callBedrock({
            system: systemPrompt,
            userPrompt,
            maxTokens: 4096,
            temperature: 0.4,
            label: 'DeepAnalysis',
        });

        // [FIX] Robust JSON parsing — handle common LLM output issues
        let rawText = bedrockResult.text.trim();
        // Strip markdown code fences if present
        rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        // Strip any preamble text before the first {
        const jsonStart = rawText.indexOf('{');
        if (jsonStart > 0) rawText = rawText.slice(jsonStart);
        // Remove trailing commas before } or ]
        rawText = rawText.replace(/,\s*([}\]])/g, '$1');
        // Replace single-quoted property names (e.g., 'key': → "key":)
        rawText = rawText.replace(/(?<=[\{,]\s*)'([^']+)'\s*:/g, '"$1":');

        let analysis;
        try {
            analysis = JSON.parse(rawText);
        } catch (parseErr: any) {
            console.error(`[DeepAnalysis] JSON parse failed for ${ticker}:`, parseErr.message, '\nRaw (first 500):', rawText.slice(0, 500));
            return NextResponse.json({ error: parseErr.message }, { status: 500 });
        }
        const elapsed = Date.now() - startTime;

        // --- Build News Summary (UI-rendered, not AI-generated) ---
        const bullishCount = newsArticles.filter(a => a.sentiment === 'positive').length;
        const bearishCount = newsArticles.filter(a => a.sentiment === 'negative').length;
        const neutralCount = newsArticles.length - bullishCount - bearishCount;
        const topHeadlines = newsArticles.slice(0, 3).map(a => ({
            title: a.title.split(' — ')[0].slice(0, 120),  // Clean title only, no description
            age: a.age,
            sentiment: a.sentiment,
            source: a.source,
        }));

        // --- Save to Redis (language-agnostic) ---
        const resultPayload = {
            ...analysis,
            ticker,
            session,
            triggerReason,
            generatedAt: new Date().toISOString(),
            elapsedMs: elapsed,
            newsCount: newsArticles.length,
            newsSummary: {
                total: newsArticles.length,
                bullish: bullishCount,
                bearish: bearishCount,
                neutral: neutralCount,
                headlines: topHeadlines,
            },
            model: bedrockResult.model,
            usedFallback: bedrockResult.usedFallback,
        };

        const ttl = getSessionTTL(session);
        await setInCache(cacheKey, resultPayload, ttl);

        console.log(`[DeepAnalysis] ✅ ${ticker} trilingual generated in ${elapsed}ms (trigger: ${triggerReason}, news: ${newsArticles.length}, TTL: ${ttl}s, model: ${bedrockResult.model})`);

        return NextResponse.json({
            ...resultPayload,
            fromCache: false,
        });

    } catch (e: any) {
        console.error('[DeepAnalysis] Error:', e.message);
        
        // [V10] Graceful fallback — NEVER show "Analysis Error" to users
        // Generate a basic analysis from snapshot data instead
        try {
            const t = body?.ticker || '???';
            const s = body?.snapshot || {};
            const sc = s.signalCore || {};
            const dir = sc.direction || 'NEUTRAL';
            const fallback = {
                currentState: {
                    ko: `${dir} — 분석 데이터 업데이트 대기 중`,
                    en: `${dir} — Analysis update pending`,
                    ja: `${dir} — 分析データ更新待ち`,
                },
                sections: [],
                keyInsight: {
                    ko: `${t}의 현재 세션 상태를 기반으로 한 기본 관측입니다. 잠시 후 전체 AI 분석이 갱신됩니다.`,
                    en: `Basic observation based on ${t}'s current session. Full AI analysis will refresh shortly.`,
                    ja: `${t}の現在のセッション状態に基づく基本観測です。まもなくAI分析が更新されます。`,
                },
                riskFlag: 'NONE',
                confidence: 'LOW',
                generatedAt: new Date().toISOString(),
                elapsedMs: Date.now() - startTime,
                newsCount: 0,
                fromCache: false,
                triggerReason: 'FALLBACK',
                session: s.session || 'CLOSED',
                model: 'fallback',
                usedFallback: true,
            };
            // Cache fallback briefly (3 min) so repeated errors don't hammer Bedrock
            const cacheKey = `ai-deep-analysis:${t}`;
            await setInCache(cacheKey, fallback, 180).catch(() => {});
            return NextResponse.json(fallback);
        } catch {
            // Last resort — still return 200 with minimal data
            return NextResponse.json({
                currentState: { ko: 'NEUTRAL — 분석 준비 중', en: 'NEUTRAL — Preparing analysis', ja: 'NEUTRAL — 分析準備中' },
                sections: [], riskFlag: 'NONE', confidence: 'LOW',
                generatedAt: new Date().toISOString(), elapsedMs: 0,
                newsCount: 0, fromCache: false, triggerReason: 'FALLBACK',
                session: 'CLOSED', model: 'fallback', usedFallback: true,
            });
        }
    }
}
