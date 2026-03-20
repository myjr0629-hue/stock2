import { NextResponse } from 'next/server';

// ────────────────────────────────────────────────────────────
// Perplexity Intel Analysis API
// Batch-processes stocks with all indicators + news context
// Returns 3-language analysis (ko/en/ja) per stock
// ────────────────────────────────────────────────────────────

import { getFromCache, setInCache } from '@/services/redisClient';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || '';

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

const SYSTEM_PROMPT = `You are a senior equity research analyst at a top-tier institution (Goldman Sachs / Morgan Stanley caliber). You produce institutional-grade market intelligence briefs.

═══ CRITICAL ANALYSIS RULES ═══

1. PRICE MOMENTUM IS PRIMARY CONTEXT
   - If changePct ≥ +10%: This is an EXTREME RALLY. Lead with the momentum and explain WHY it surged. Do NOT describe bearish pressure.
   - If changePct ≤ -10%: This is a SHARP SELLOFF. Lead with the decline and explain contributing factors.
   - If changePct is moderate (±1~5%): Balance indicators and news equally.
   - NEVER contradict obvious price action. A +30% stock is NOT in a "support test environment."

2. ALL INDICATORS MUST BE CROSS-CORRELATED (not just listed)
   - BAD: "GEX -1.0M, PCR 0.50, Squeeze 15%, MaxPain $25에서 38.5% 이격 관찰"
   - GOOD: "30% 급등에도 GEX -1.0M의 SHORT Gamma 환경이 유지되어 딜러 헤지 매수가 추가 상승을 가속화할 수 있으며, PCR 0.50의 극단적 콜 편향이 이를 뒷받침한다"
   - Explain HOW indicators interact, not what their values are

3. NEWS INTEGRATION
   - SEARCH the web for each ticker's recent news (last 7 days)
   - Bloomberg, Reuters, WSJ, Financial Times only. NO YouTube, social media, blogs
   - State news facts directly — DO NOT cite source names
   - Connect news to indicators as cause-and-effect

4. CONCLUSION: Always end with an actionable environment assessment
   - GOOD: "~가속화될 수 있는 환경이다" "~압축 구간에 진입하고 있다" "~재평가 과정이 진행 중이다"
   - BAD: "~관찰된다" "~주목된다" (passive observation = useless)

5. COMPLIANCE: Never recommend buy/sell/hold. No price targets. No "will rise/fall."

6. TONE: Professional institutional research — concise, authoritative, zero fluff

═══ OUTPUT FORMAT ═══
Return ONLY valid JSON:
{
  "analyses": [
    {
      "ticker": "SYMBOL",
      "ko": "한국어 기관급 분석 2-3문장 (150-200자)",
      "en": "English institutional analysis 2-3 sentences (100-150 words)",
      "ja": "日本語機関級分析 2-3文 (150-200文字)"
    }
  ]
}

All 3 languages must have IDENTICAL analytical depth and conclusions. Not translations — each language should read natively.`;


// ── Market Hours Detection (ET timezone) ──
function isMarketActive(): boolean {
    const now = new Date();
    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etStr);
    const day = et.getDay();
    if (day === 0 || day === 6) return false; // Weekend
    const time = et.getHours() * 60 + et.getMinutes();
    // PRE 4:00 ~ POST 20:00 = active
    return time >= 240 && time < 1200;
}

function getCacheTtl(): number {
    return isMarketActive() ? 1200 : 28800; // 20min during market, 8hr off-hours
}

export async function POST(req: Request) {
    try {
        if (!PERPLEXITY_API_KEY) {
            return NextResponse.json({ error: 'Missing PERPLEXITY_API_KEY' }, { status: 500 });
        }

        const { stocks } = await req.json() as { stocks: StockData[] };
        if (!stocks || stocks.length === 0) {
            return NextResponse.json({ error: 'No stocks provided' }, { status: 400 });
        }

        // ── Check cache for each stock ──
        const cached: Record<string, { ko: string; en: string; ja: string }> = {};
        const needsFetch: StockData[] = [];

        for (const s of stocks) {
            try {
                const key = `cache:perplexity:intel:v6:${s.ticker}`;
                const entry = await getFromCache<{ ko: string; en: string; ja: string; basePrice: number }>(key);
                if (entry) {
                    // ±1% check: if price moved more than 1% from cached basePrice, invalidate
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

        // ── Fetch from Perplexity for uncached stocks ──
        let freshAnalyses: Record<string, { ko: string; en: string; ja: string }> = {};

        if (needsFetch.length > 0) {
            const dataBlock = buildDataBlock(needsFetch);
            const tickerList = needsFetch.map(s => s.ticker).join(', ');
            const userPrompt = `Analyze these ${tickerList.split(',').length} stocks with recent web news + provided indicators.

INDICATOR DATA:
${dataBlock}

CRITICAL:
1. Search for "${tickerList}" recent news from major financial outlets (last 7 days)
2. For stocks with changePct > ±10%, LEAD with price momentum context — do NOT write bearish analysis for a +30% stock
3. Cross-correlate ALL provided indicators (GEX, PCR, Gamma, Squeeze, Whale, DarkPool, IVSkew, ImpliedMove) — explain interactions, not values
4. Do NOT cite any source names or URLs
5. End each analysis with an environment conclusion
6. Return valid JSON only`;

            const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'sonar',
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: 0.3,
                    max_tokens: needsFetch.length * 600,
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`[Perplexity] API error ${response.status}: ${errText}`);
            } else {
                const data = await response.json();
                const content = data.choices?.[0]?.message?.content || '';

                // Parse JSON from response
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        const analyses = parsed.analyses || [];
                        for (const a of analyses) {
                            if (a.ticker && a.ko && a.en && a.ja) {
                                freshAnalyses[a.ticker] = { ko: a.ko, en: a.en, ja: a.ja };
                            }
                        }
                    } catch (e) {
                        console.error('[Perplexity] JSON parse failed:', e);
                    }
                }

                // ── Cache fresh results (dynamic TTL: 20min market / 8hr off-hours) ──
                const ttl = getCacheTtl();
                for (const s of needsFetch) {
                    const a = freshAnalyses[s.ticker];
                    if (a) {
                        try {
                            await setInCache(`cache:perplexity:intel:v6:${s.ticker}`, {
                                ko: a.ko, en: a.en, ja: a.ja,
                                basePrice: s.price,
                                updatedAt: new Date().toISOString(),
                            }, ttl);
                        } catch {}
                    }
                }
            }
        }

        // ── Merge cached + fresh ──
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
        console.error('[Perplexity] Unexpected error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

