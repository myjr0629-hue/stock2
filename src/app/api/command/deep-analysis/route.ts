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
 * Cache: Redis with session-aware TTL (key: ai-deep-analysis:v2:${ticker})
 * POLICY: Observation-only language. No investment advice.
 */

import { NextResponse } from 'next/server';
import { callBedrock } from '@/services/bedrockClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive } from '@/services/massiveClient';
import { fetchSECFilings, buildSECXmlBlock } from '@/services/secFilingsService';
import { getTickerDisclosures } from '@/services/disclosures';

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
        const { ticker, locale = 'ko', snapshot, triggerReason = 'FIRST_VIEW', gexStats } = body;

        if (!ticker) {
            return NextResponse.json({ error: 'ticker required' }, { status: 400 });
        }

        const session = snapshot?.session || 'CLOSED';
        const cacheKey = `ai-deep-analysis:v2:${ticker}`;

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

        const [newsResult, secResult, discResult] = await Promise.allSettled([
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
            // Categorized 8-K disclosure events (taxonomy + one-line summaries, 12h cached)
            getTickerDisclosures(ticker, 30),
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

        // Categorized disclosure events → grounded "why it moved" evidence.
        // Appended to the SEC block; degrades to nothing on failure/no events.
        if (discResult.status === 'fulfilled' && discResult.value.events.length > 0) {
            const evXml = discResult.value.events.map(e =>
                `    <event date="${e.date}" category="${e.primary}${e.tertiary ? '/' + e.tertiary : ''}" high_impact="${e.highImpact}">${e.summary.en}</event>`
            ).join('\n');
            secXmlBlock += `\n<disclosure_events note="Categorized 8-K material corporate events (SEC taxonomy, last 30 days). Cite as factual evidence where relevant to price/flow behavior.">\n${evXml}\n</disclosure_events>`;
            console.log(`[DeepAnalysis] Disclosure events: ${discResult.value.events.length}`);
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
        const insider = s.insider || null;
        // [2026-08-30] 고급 기술지표 + 신용 스프레드 — 클라이언트가 실어 보낸다.
        //   없으면 전부 null 이고 프롬프트는 N/A 로 나간다. **추측하게 두지 않는다.**
        const t = s.technicals || {};
        const tech = {
            adx: t.adx?.value ?? null,
            adxRegime: t.adx?.regime ?? 'N/A',
            diPos: t.adx?.diPos ?? null,
            diNeg: t.adx?.diNeg ?? null,
            obvSlopePct: t.obv?.slopePct ?? null,
            obvDivergence: t.obv?.divergence ?? null,
            bbWidthPct: t.bb?.widthPct ?? null,
            bbPercentile: t.bb?.percentile ?? null,
            bbSqueeze: t.bb?.squeeze ?? false,
            atrPct: t.atr?.pct ?? null,
            volIv: t.volPremium?.ivPct ?? null,
            volRv: t.volPremium?.rvPct ?? null,
            volSpread: t.volPremium?.spread ?? null,
            volLabel: t.volPremium?.label ?? 'N/A',
        };
        const credit = s.creditSpread || { value: null, change20d: null, percentile: null, regime: 'N/A' };

        const priceChange = s.priceChange || 0;
        const priceChangeStr = priceChange >= 0 ? `+${priceChange.toFixed(2)}%` : `${priceChange.toFixed(2)}%`;

        // [MOVE ATTRIBUTION] ±2%+ move → the analysis must answer "why is it moving
        // this much?" — attributing to news/8-K events AND/OR structural options
        // mechanics (and saying so explicitly when NO news exists). Server-side only:
        // all three clients (web / app / mobile web) render `sections` dynamically,
        // so the extra attribution section appears everywhere with zero UI changes.
        const bigMove = Math.abs(priceChange) >= 2.0;

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
    <insider note="SEC_FORM_4_LAST_30D">${institutional.insiderNet30d != null
        ? `net ${institutional.insiderNet30d > 0 ? '+' : ''}$${(Math.abs(institutional.insiderNet30d) / 1e6).toFixed(1)}M, buys ${institutional.insiderBuy ?? 0}, sells ${institutional.insiderSell ?? 0}`
        : 'N/A'} (${institutional.activity || 'N/A'})</insider>
    <short_squeeze status="${squeeze.status || 'N/A'}" si="${squeeze.siPercent || 'N/A'}%"/>
  </institutional>
  
  <volatility regime="${volatility.regime || 'N/A'}" score="${volatility.regimeScore || 'N/A'}" gex_long="${volatility.gexLong || 'N/A'}%"/>

  <!-- [2026-08-30] Massive 시절엔 없던 지표. 값이 없으면 N/A — 추측 금지. -->
  <advanced_technicals>
    <trend_strength note="ADX_BELOW_20_MEANS_NO_TREND_CROSSOVERS_UNRELIABLE">${tech.adx != null
        ? `ADX ${tech.adx} (${tech.adxRegime}), +DI ${tech.diPos ?? 'N/A'} / -DI ${tech.diNeg ?? 'N/A'}`
        : 'N/A'}</trend_strength>
    <money_flow note="OBV_20D_SLOPE_AND_PRICE_DIVERGENCE">${tech.obvSlopePct != null
        ? `${tech.obvSlopePct > 0 ? '+' : ''}${tech.obvSlopePct}% over 20 sessions${tech.obvDivergence ? `, ${tech.obvDivergence} divergence vs price` : ''}`
        : 'N/A'}</money_flow>
    <bollinger_squeeze note="BAND_WIDTH_PERCENTILE_VS_OWN_130_SESSIONS_LOW_MEANS_COMPRESSED">${tech.bbPercentile != null
        ? `width ${tech.bbWidthPct}% at percentile ${tech.bbPercentile}${tech.bbSqueeze ? ' — COMPRESSED' : ''}`
        : 'N/A'}</bollinger_squeeze>
    <realized_vol note="ATR_IS_ACTUAL_MOVEMENT_INCLUDING_GAPS">${tech.atrPct != null ? `ATR ${tech.atrPct}% of price` : 'N/A'}</realized_vol>
    <vol_premium note="IMPLIED_MINUS_REALIZED_POSITIVE_MEANS_OPTIONS_RICH">${tech.volSpread != null
        ? `IV ${tech.volIv} vs RV ${tech.volRv} = ${tech.volSpread > 0 ? '+' : ''}${tech.volSpread}pp (${tech.volLabel})`
        : 'N/A'}</vol_premium>
  </advanced_technicals>

  <macro_credit note="HIGH_YIELD_OAS_WIDENING_IS_RISK_OFF_INDEPENDENT_OF_EQUITY_SIGNALS">${credit.value != null
      ? `${credit.value}% , 20d change ${credit.change20d > 0 ? '+' : ''}${credit.change20d}pp, 1y percentile ${credit.percentile}, regime ${credit.regime}`
      : 'N/A'}</macro_credit>
  
  <earnings days_until="${earnings.daysUntil || 'N/A'}" date="${earnings.date || 'N/A'}" estimated_eps="${earnings.estimatedEps || 'N/A'}"/>
  
  <news recency_weighted="true" count="${newsArticles.length}">
${newsXml}
  </news>${sectorNewsNote}
${secXmlBlock ? '\n' + secXmlBlock : ''}
  
  <trigger_reason>${triggerReason}</trigger_reason>
${bigMove ? `  <price_move_alert magnitude="${priceChangeStr}" direction="${priceChange >= 0 ? 'UP' : 'DOWN'}" session="${session}">
    Sharp move detected. The reader's #1 question is WHY the stock is moving this much.
    Attribute the move using the evidence in this document: weighted news headlines, SEC/8-K disclosure events, and structural options mechanics (gamma flip crossings, dealer hedging direction, net premium flow, put/call positioning).
    If NO news or disclosure plausibly explains it, SAY SO explicitly and attribute to structural/flow factors.
  </price_move_alert>` : ''}
${(() => {
    if (!insider) return '';
    const fmtVal = (n: number) => { const a = Math.abs(n); return a >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n}`; };
    const latestStr = insider.latest
        ? `name="${insider.latest.name}" title="${insider.latest.title}" type="${insider.latest.code}" value="${fmtVal(insider.latest.value)}" date="${insider.latest.date}" is_10b5_1="${insider.latest.is10b5}"`
        : '';
    return `  <insider_activity source="SEC_Form_4" sentiment="${insider.sentiment}">
    <net_30d>${fmtVal(insider.net30d)}</net_30d>
    <buy_count>${insider.buyCount}</buy_count>
    <sell_count>${insider.sellCount}</sell_count>${insider.latest ? `\n    <latest_transaction ${latestStr}/>` : ''}
    <note>Voluntary (non-10b5-1) insider buys are historically among the strongest bullish signals. Clustered insider selling, especially by C-suite, warrants caution.</note>
  </insider_activity>`;
})()
}
${(() => {
    if (!gexStats) return '';
    const gs = gexStats;
    const flipStr = gs.flipEvents?.length > 0
        ? gs.flipEvents.map((f: any) => {
            const d = new Date(f.timestamp);
            return `${d.getMonth()+1}/${d.getDate()} ${f.from}→${f.to} $${f.price}`;
        }).join(', ')
        : 'None in 30d';
    return `  <gex_history_30d percentile="${gs.percentile}" regime="${gs.latestRegime}" streak_sessions="${gs.streakDays}" avg_regime_duration="${gs.avgRegimeDuration}d" streak_multiple="${gs.streakMultiple}x" total_days="${gs.totalDays}">
    <call_wall_accuracy overall="${gs.callWallAccuracy !== null ? gs.callWallAccuracy + '%' : 'N/A'}" current_regime="${gs.cwStreakAccuracy !== null ? gs.cwStreakAccuracy + '%' : 'N/A'}"/>
    <flip_events count="${gs.flipEvents?.length || 0}">${flipStr}</flip_events>
    <note>30-day historical GEX percentile and regime persistence data. Use for structural context.</note>
  </gex_history_30d>`;
})()}
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
- SECTIONS: 3-4 sections with clear titles. Each section 2-4 sentences of DEEP analysis.
- DEPTH (CRITICAL): Do NOT merely list indicator values. For EACH observation:
  → Explain the MECHANISM (WHY does this indicator reading matter?)
  → Explain the INTERACTION (HOW does it connect to other indicators?)
  → Provide the SO-WHAT (What structural condition does this create?)
  → Example BAD: "GEX is -70M, gamma flip at $205"
  → Example GOOD: "The -70M GEX reading indicates dealer short gamma exposure, meaning options market makers must sell into declines (amplifying downside) and buy into rallies (dampening upside), structurally constraining price movement to the $190-$205 corridor."
- DATA ACCURACY: Use EXACT values from the XML data. call_wall ≠ gamma_flip_level.
- NO DUPLICATE METRICS: Focus purely on narrative insight.
- NEWS INTEGRATION: Weave news naturally into analysis. DO NOT put indicator data in the News section.
- NEW GAUGES INTEGRATION: The XML now provides <context_score> (overall momentum/fundamentals) and <smart_flow> (institutional money flow).
   -> MUST blend <context_score> NATURALLY into "Technical Structure Analysis".
   -> MUST blend <smart_flow> NATURALLY into "Options Positioning".
   -> IMPORTANT: Do NOT make the entire section about these two scores. They should act as supporting evidence (e.g., "The SMA golden cross is further validated by a solid Context Score of 66...") alongside the existing deep technical/options indicators.
- If news is scarce, focus on structural indicators and sector context.
- If trigger_reason=PRICE_MOVE, explain WHAT likely caused it.
- MOVE ATTRIBUTION (CRITICAL — only when <price_move_alert> is present):
  → Add ONE EXTRA section as the FIRST section, titled: { "ko": "급변동 원인", "en": "Price Move Attribution", "ja": "急変動の要因" }.
  → Its job: resolve the reader's question "why is this stock moving this much?" in 2-4 sentences.
  → Attribute the move to concrete evidence, in priority order: ① news/8-K disclosure events (cite source + age, e.g., "로이터, 3시간 전"), ② structural options mechanics (gamma flip crossing, dealer short-gamma hedging amplification, net premium direction, put positioning), ③ sector/market-wide moves.
  → If NO news or disclosure explains the move, state that explicitly (e.g., "특별한 뉴스·공시는 확인되지 않으며") and attribute to structural/flow factors — absence of news IS the answer the reader needs.
  → Clearly separate CONFIRMED evidence (news that exists, structural readings) from INFERENCE (what likely amplified the move). Observation language only — never predict.
  → The "currentState" headline must also lead with the move and its primary driver.
  → The other 3 sections keep their usual roles (do NOT duplicate the attribution content in them).
- SEC FILINGS (8-K/10-K): If provided in <sec_filings>, reference recent corporate events (8-K) as supporting context. Use 10-K business overview to understand the company's revenue structure and competitive positioning.
- INSIDER ACTIVITY (Form 4): If <insider_activity> is present, weave insider trading patterns into your analysis. Key rules:
  → Voluntary (non-10b5-1) insider BUYING by C-suite (CEO, CFO, President) is a powerful bullish signal — highlight prominently.
  → Clustered insider SELLING (multiple executives selling within days) warrants cautionary language.
  → 10b5-1 plan transactions are routine and should be noted but given less weight.
  → Connect insider activity to the overall narrative (e.g., "The CEO's voluntary purchase of $2M in shares aligns with the golden cross formation and institutional accumulation signals").
  → Reference the net 30-day value and sentiment grade (CAUTIOUS, NEUTRAL, BULLISH) in context.
- GEX HISTORY (30D): If <gex_history_30d> is present, weave the percentile ranking, regime streak duration, and streak multiple into the Options Positioning section. For example: "GEX at 0th percentile with NEGATIVE regime persisting 5 sessions (1.7× average duration) indicates structurally elevated dealer hedging pressure." Do NOT repeat raw numbers — synthesize into narrative insight.
- FORBIDDEN: investment advice, buy/sell recommendations, emojis.
- COMPLIANCE (STRICT): You are an OBSERVER, not an advisor. Use ONLY observation-based language:
  → ALLOWED: "관찰됨/observed", "확인됨/noted", "시사함/suggests", "나타남/indicates", "구조적으로 X 상태/structurally in X state"
  → FORBIDDEN: "~해야 한다/should", "매수/매도 추천/buy/sell recommendation", "~될 것이다/will happen", "~가 지지된다/is supported", "breakout expected"
  → ALL sentences must describe CURRENT or PAST conditions, NEVER predict future outcomes.
- Make connections between indicators.
</critical_rules>`;

        const userPrompt = xmlContext;

        // --- Call Bedrock (with retry + fallback) ---
        const bedrockResult = await callBedrock({
            system: systemPrompt,
            userPrompt,
            maxTokens: 6144,
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
        rawText = rawText.replace(/(?<=[{,]\s*)'([^']+)'\s*:/g, '"$1":');

        let analysis;
        try {
            analysis = JSON.parse(rawText);
        } catch (parseErr: any) {
            // === REPAIR STRATEGY ===
            // 1. Bracket-matching: Haiku sometimes appends text after JSON
            // 2. Truncation repair: If maxTokens hit, JSON may have unterminated strings
            try {
                let repaired = rawText;

                // [FIX] Repair unterminated strings from maxTokens truncation
                if (parseErr.message.includes('Unterminated string') || parseErr.message.includes('Unexpected end')) {
                    const lastQuote = repaired.lastIndexOf('"');
                    const lastBrace = repaired.lastIndexOf('}');

                    if (lastQuote > lastBrace) {
                        // We're inside an unterminated string — truncate to last complete field
                        const lastGoodComma = repaired.lastIndexOf('",');
                        const lastGoodBrace = repaired.lastIndexOf('"}');
                        const cutPoint = Math.max(lastGoodComma, lastGoodBrace);

                        if (cutPoint > 0) {
                            repaired = repaired.slice(0, cutPoint + 2);
                        } else {
                            repaired = repaired.slice(0, lastQuote + 1);
                        }

                        // Close all open brackets/braces
                        let openBraces = 0, openBrackets = 0;
                        let inStr = false;
                        for (let i = 0; i < repaired.length; i++) {
                            const c = repaired[i];
                            if (c === '"' && (i === 0 || repaired[i-1] !== '\\')) inStr = !inStr;
                            if (!inStr) {
                                if (c === '{') openBraces++;
                                else if (c === '}') openBraces--;
                                else if (c === '[') openBrackets++;
                                else if (c === ']') openBrackets--;
                            }
                        }
                        repaired = repaired.replace(/,\s*$/, '');
                        repaired += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
                        console.log(`[DeepAnalysis] Repaired truncated JSON: closed ${openBrackets} brackets + ${openBraces} braces`);
                    }
                }

                // Try bracket-matching parse on repaired text
                let depth = 0;
                let endIdx = -1;
                for (let i = 0; i < repaired.length; i++) {
                    if (repaired[i] === '{') depth++;
                    else if (repaired[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
                }
                if (endIdx > 0) {
                    analysis = JSON.parse(repaired.slice(0, endIdx + 1));
                    console.log(`[DeepAnalysis] JSON recovered at position ${endIdx + 1}`);
                } else {
                    throw parseErr;
                }
            } catch (e2: any) {
                console.error(`[DeepAnalysis] JSON parse failed for ${ticker}:`, parseErr.message, '\nRaw (first 500):', rawText.slice(0, 500));
                return NextResponse.json({ error: parseErr.message }, { status: 500 });
            }
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
            const cacheKey = `ai-deep-analysis:v2:${t}`;
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
