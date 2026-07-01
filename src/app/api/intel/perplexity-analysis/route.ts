/**
 * POST /api/intel/perplexity-analysis
 * 
 * [V2.0] Intel Session Grid Analysis — Bedrock Claude Sonnet 4
 * (Migrated from Perplexity → AWS Bedrock + Polygon News)
 * 
 * Batch-processes M7/sector stocks with all indicators + Polygon news
 * Returns 3-language institutional-grade analysis (ko/en/ja) per stock
 * 
 * COMPLIANCE: Observation-only language. No investment advice.
 */

import { NextResponse } from 'next/server';
import { callBedrock } from '@/services/bedrockClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive } from '@/services/massiveClient';
import { fetchBatch8K, buildSECTextBlock } from '@/services/secFilingsService';

export const maxDuration = 60;



interface StockData {
    ticker: string;
    price: number;
    changePct: number;
    gex: number;
    pcr: number;
    gammaRegime: string;
    netPremium: number;
    callWall: number;
    putFloor: number;
    maxPain: number;
    whaleIndex: number;
    darkPoolPct: number;
    ivSkew: number;
    impliedMovePct: number;
    squeezeScore: number;
    contextScore: number;
}

function buildDataBlock(stocks: StockData[]): string {
    return stocks.map(s => {
        const mpDist = s.maxPain > 0 ? ((s.price - s.maxPain) / s.maxPain * 100).toFixed(1) : '0';
        return `${s.ticker} $${s.price.toFixed(2)} (${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%)
  GEX: ${(s.gex / 1e6).toFixed(1)}M | Gamma: ${s.gammaRegime} | PCR: ${s.pcr.toFixed(2)}
  Squeeze: ${s.squeezeScore}% | NetPremium: $${(s.netPremium / 1e6).toFixed(1)}M
  CallWall: $${s.callWall.toFixed(0)} | PutFloor: $${s.putFloor.toFixed(0)} | MaxPain: $${s.maxPain.toFixed(0)} (${mpDist}% from price)
  Whale: ${s.whaleIndex} | DarkPool: ${s.darkPoolPct}% | IVSkew: ${s.ivSkew > 0 ? '+' : ''}${s.ivSkew.toFixed(1)}%
  ImpliedMove: ±${s.impliedMovePct.toFixed(1)}% | ContextScore: ${s.contextScore.toFixed(1)}`;
    }).join('\n\n');
}

// --- Fetch News from Polygon (via Massive/Redis) ---
async function fetchTickerNews(ticker: string): Promise<{ title: string; age: string; sentiment: string }[]> {
    try {
        const newsData = await fetchMassive(
            '/v2/reference/news',
            { ticker, limit: '5', order: 'desc', sort: 'published_utc' },
            true
        );
        const now = Date.now();
        return (newsData?.results || []).slice(0, 4).map((n: any) => {
            const ageMs = now - new Date(n.published_utc || 0).getTime();
            const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
            const ageStr = ageHours < 1 ? 'Now' : ageHours < 24 ? `${ageHours}h` : `${Math.floor(ageHours / 24)}d`;
            return {
                title: (n.title || '').slice(0, 150),
                age: ageStr,
                sentiment: n.insights?.[0]?.sentiment || 'neutral',
            };
        });
    } catch {
        return [];
    }
}

// --- Market Hours Detection ---
function isMarketActive(): boolean {
    const now = new Date();
    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etStr);
    const day = et.getDay();
    if (day === 0 || day === 6) return false;
    const time = et.getHours() * 60 + et.getMinutes();
    return time >= 240 && time < 1200;
}

function getCacheTtl(): number {
    return isMarketActive() ? 1200 : 28800; // 20min market, 8hr off-hours
}

const SYSTEM_PROMPT = `You are a senior equity research analyst at a top-tier institution (Goldman Sachs / Morgan Stanley caliber). You produce institutional-grade market intelligence briefs for the Intel Session Grid.

═══ CRITICAL ANALYSIS RULES ═══

1. PRICE MOMENTUM IS PRIMARY CONTEXT
   - If changePct ≥ +10%: This is an EXTREME RALLY. Lead with the momentum and explain WHY it surged. Do NOT describe bearish pressure.
   - If changePct ≤ -10%: This is a SHARP SELLOFF. Lead with the decline and explain contributing factors.
   - If changePct is moderate (±1~5%): Balance indicators and news equally.
   - NEVER contradict obvious price action. A +30% stock is NOT in a "support test environment."

2. ALL INDICATORS MUST BE CROSS-CORRELATED (not just listed)
   - BAD: "GEX -1.0M, PCR 0.50, Squeeze 15%, MaxPain $25에서 38.5% 이격 관찰"
   - GOOD: "마이너스 3.28% 낙폭은 AI 인프라 수혜주 중 최악의 낙폭이며, 47.1M 감마와 0.92 PCR이 약한 옵션 구조를 드러낸다. 97% 극단적 다크풀 거래와 $-22.9M 순프리미엄 유출, 1.4% 최고 IVSkew가 동시 진행되면서 기관 대량 청산 신호를 보내고 있다."
   - Explain HOW indicators INTERACT and WHAT structural story they tell together

3. NEWS INTEGRATION
   - News articles from Polygon API are provided below. Weave them naturally into the narrative as cause-and-effect.
   - State news facts directly — DO NOT cite source names or URLs.
   - If no relevant news, focus purely on structural indicators and sector context.

4. CONCLUSION: Always end with an actionable environment assessment
   - GOOD: "~가속화될 수 있는 환경이다" "~압축 구간에 진입하고 있다" "~재평가 과정이 진행 중이다"
   - BAD: "~관찰된다" "~주목된다" (passive observation = useless)

5. COMPLIANCE (STRICT): You are an OBSERVER, not an advisor.
   - ALLOWED: "관찰됨/observed", "확인됨/noted", "시사함/suggests", "나타남/indicates", "~환경이다/environment"
   - FORBIDDEN: "~해야 한다/should", "매수/매도/buy/sell", "~될 것이다/will happen", "breakout expected"
   - ALL sentences must describe CURRENT or PAST conditions, NEVER predict future outcomes

6. TONE: Professional institutional research — concise, authoritative, zero fluff

7. STOCK-SPECIFIC DEPTH (not generic sector talk)
   - Anchor the read in THIS company's own drivers — its product/earnings cycle, competitive position, or the specific news/filing provided. Reject interchangeable boilerplate that could describe any ticker. A reader must learn something true about THIS name.

8. CATALYST TIMING (when the data supports it)
   - If the news/filings reference a dated event (earnings, guidance, product launch, regulatory/8-K action) or the option structure implies an expiry/gamma inflection, name the catalyst and its timing context (e.g. "8-K 공시 직후", "실적 발표를 앞둔"). Describe scheduled/observed events only — NEVER predict their outcome.

9. REGIME LINKAGE (one clause)
   - Tie the single-name option structure to the prevailing backdrop it sits in — its sector's gamma regime and the broad risk-on/off tone — so the read is contextual, not isolated.

10. CONVICTION BASIS (make it explicit)
   - State whether the indicators ALIGN (reinforcing one structural story = high-conviction read) or DIVERGE (mixed signals = low-conviction/uncertain), since that alignment is exactly what a conviction score reflects. Frame as observed structure, never as a recommendation.

═══ OUTPUT FORMAT ═══
Return ONLY valid JSON (no markdown fences):
{
  "analyses": [
    {
      "ticker": "SYMBOL",
      "ko": "한국어 기관급 분석 3-4문장 (200-300자). 종목 특화·촉매 타이밍·레짐 연계·컨빅션 근거 포함. 번역체 금지, 네이티브 품질.",
      "en": "English institutional analysis 3-4 sentences (130-200 words). Stock-specific, catalyst timing, regime linkage, conviction basis. Native quality.",
      "ja": "日本語機関級分析 3-4文 (200-300文字). 銘柄特化・カタリスト時期・レジーム連携・確信度根拠を含む. 翻訳調禁止、ネイティブ品質."
    }
  ]
}

All 3 languages must have IDENTICAL analytical depth and conclusions. Not translations — each language should read NATIVELY.`;


export async function POST(req: Request) {
    try {
        if (!process.env.AWS_ACCESS_KEY_ID) {
            return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 500 });
        }

        const { stocks } = await req.json() as { stocks: StockData[] };
        if (!stocks || stocks.length === 0) {
            return NextResponse.json({ error: 'No stocks provided' }, { status: 400 });
        }

        // --- Check cache for each stock ---
        const cached: Record<string, { ko: string; en: string; ja: string }> = {};
        const needsFetch: StockData[] = [];

        for (const s of stocks) {
            try {
                const key = `cache:intel-analysis:v8:${s.ticker}`;
                const entry = await getFromCache<{ ko: string; en: string; ja: string; basePrice: number }>(key);
                if (entry) {
                    // ±1% price invalidation
                    if (entry.basePrice && Math.abs(s.price - entry.basePrice) / entry.basePrice >= 0.01) {
                        needsFetch.push(s);
                    } else {
                        cached[s.ticker] = { ko: entry.ko, en: entry.en, ja: entry.ja };
                    }
                } else {
                    needsFetch.push(s);
                }
            } catch {
                needsFetch.push(s);
            }
        }

        // --- Fetch from Bedrock for uncached stocks ---
        let freshAnalyses: Record<string, { ko: string; en: string; ja: string }> = {};

        if (needsFetch.length > 0) {
            // 1. Fetch Polygon news + SEC 8-K data for each stock (parallel)
            const newsMap: Record<string, { title: string; age: string; sentiment: string }[]> = {};
            const [newsResults, sec8kMap] = await Promise.all([
                Promise.all(needsFetch.map(async (s) => {
                    newsMap[s.ticker] = await fetchTickerNews(s.ticker);
                })),
                fetchBatch8K(needsFetch.map(s => s.ticker)),
            ]);

            // 2. Build prompts
            const dataBlock = buildDataBlock(needsFetch);
            const tickerList = needsFetch.map(s => s.ticker).join(', ');

            const newsSection = needsFetch.map(s => {
                const articles = newsMap[s.ticker] || [];
                const sec8k = sec8kMap[s.ticker] || [];
                let block = '';
                if (articles.length === 0 && sec8k.length === 0) return `${s.ticker}: No recent news or filings`;
                if (articles.length > 0) {
                    block += `${s.ticker} NEWS:\n` + articles.map(a =>
                        `  [${a.age}] [${a.sentiment}] ${a.title}`
                    ).join('\n');
                }
                if (sec8k.length > 0) {
                    const secText = buildSECTextBlock(sec8k);
                    block += (block ? '\n' : `${s.ticker} `) + `SEC FILINGS:\n${secText}`;
                }
                return block;
            }).join('\n\n');

            const userPrompt = `Analyze these ${needsFetch.length} stocks using the provided indicators AND recent news.

INDICATOR DATA:
${dataBlock}

RECENT NEWS (from Polygon API):
${newsSection}

CRITICAL:
1. Cross-correlate ALL provided indicators — explain structural interactions, not values
2. Weave news naturally into the structural narrative as cause-and-effect
3. Keep it STOCK-SPECIFIC — this company's own drivers, not generic sector talk
4. When the news/filings carry a dated catalyst (earnings, guidance, 8-K), name it and its timing context (observed/scheduled — never predict the outcome)
5. Add one clause linking the name to its sector/market regime, and state whether the indicators ALIGN or DIVERGE (the conviction basis)
6. End each analysis with an actionable environment conclusion
7. Return valid JSON only with all 3 languages per stock`;

            // 3. Call Bedrock Claude (with retry + fallback)
            const bedrockResult = await callBedrock({
                system: SYSTEM_PROMPT,
                userPrompt,
                maxTokens: needsFetch.length * 800,
                temperature: 0.3,
                label: 'IntelAI',
            });

            if (bedrockResult.text && bedrockResult.text !== '{') {
                try {
                    const parsed = JSON.parse(bedrockResult.text);
                    const analyses = parsed.analyses || [];
                    for (const a of analyses) {
                        if (a.ticker && a.ko && a.en && a.ja) {
                            freshAnalyses[a.ticker] = { ko: a.ko, en: a.en, ja: a.ja };
                        }
                    }
                } catch (e) {
                    console.error('[IntelAI] JSON parse failed:', e);
                }
            }

            // --- Cache fresh results ---
            const ttl = getCacheTtl();
            for (const s of needsFetch) {
                const a = freshAnalyses[s.ticker];
                if (a) {
                    try {
                        await setInCache(`cache:intel-analysis:v8:${s.ticker}`, {
                            ko: a.ko, en: a.en, ja: a.ja,
                            basePrice: s.price,
                            updatedAt: new Date().toISOString(),
                        }, ttl);
                    } catch {}
                }
            }

            console.log(`[IntelAI] ✅ ${Object.keys(freshAnalyses).length}/${needsFetch.length} analyzed (Bedrock Claude S4, news: ${Object.values(newsMap).flat().length} articles)`);
        }

        // --- Merge cached + fresh ---
        const result: Record<string, { ko: string; en: string; ja: string }> = {
            ...cached,
            ...freshAnalyses,
        };

        return NextResponse.json({
            analyses: result,
            meta: {
                cached: Object.keys(cached).length,
                fetched: Object.keys(freshAnalyses).length,
                total: Object.keys(result).length,
            },
        });

    } catch (err: any) {
        console.error('[IntelAI] Unexpected error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
