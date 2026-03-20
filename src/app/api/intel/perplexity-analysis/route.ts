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
    alphaScore: number;
}

function buildDataBlock(stocks: StockData[]): string {
    return stocks.map(s => {
        const mpDist = s.maxPain > 0 ? ((s.price - s.maxPain) / s.maxPain * 100).toFixed(1) : '0';
        return `${s.ticker} $${s.price.toFixed(2)} (${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%)
  GEX: ${(s.gex / 1e6).toFixed(1)}M | Gamma: ${s.gammaRegime} | PCR: ${s.pcr.toFixed(2)}
  Squeeze: ${s.squeezeScore}% | NetPremium: $${(s.netPremium / 1e6).toFixed(1)}M
  CallWall: $${s.callWall.toFixed(0)} | PutFloor: $${s.putFloor.toFixed(0)} | MaxPain: $${s.maxPain.toFixed(0)} (${mpDist}% from price)
  Whale: ${s.whaleIndex} | DarkPool: ${s.darkPoolPct}% | IVSkew: ${s.ivSkew > 0 ? '+' : ''}${s.ivSkew.toFixed(1)}%
  ImpliedMove: ±${s.impliedMovePct.toFixed(1)}% | AlphaScore: ${s.alphaScore.toFixed(1)}`;
    }).join('\n\n');
}

const SYSTEM_PROMPT = `You are a senior equity analyst writing market intelligence briefs. Weave news and indicators into a flowing, readable narrative.

STYLE REFERENCE (follow this exact tone and structure):
"GOOGL은 GEX -21.0M과 SHORT Gamma로 dealers의 헤지 압력이 하방을 지시하며, PCR 0.92와 22% Squeeze가 단기 변동성을 암시한다. $290 MaxPain 근처에서 거래 중이며, Wiz $32억 인수 완료와 48% 클라우드 성장으로 지지받고 있으나 지리정치적 불안과 유가 상승이 랠리를 억제하는 환경이다."

KEY PRINCIPLES:
1. SEARCH the web for each ticker's recent news (last 7 days)
2. Write 2-3 flowing sentences — indicators and news woven together naturally
3. INTERPRET indicators, don't just list values:
   - BAD: "PCR 0.92, Squeeze 22%, MaxPain $290 관찰"
   - GOOD: "PCR 0.92와 22% Squeeze가 단기 변동성을 암시하며" "MaxPain $290 근처에서 거래 중이며"
4. Always END with a synthesized environment conclusion:
   - GOOD endings: "~억제하는 환경이다" "~확대되는 구간이다" "~지지 테스트가 예상된다"
   - BAD endings: "~관찰된다" "~주목된다" (these just observe, don't conclude)
5. DO NOT cite source names (no "Reuters", "CNBC에 따르면"). State news facts directly
6. Tone: professional but readable — like a smart analyst explaining to a colleague, not a legal document
7. COMPLIANCE: Never recommend buy/sell. No "will rise/fall" or "should buy/sell"

OUTPUT: Valid JSON only:
{
  "analyses": [
    {
      "ticker": "SYMBOL",
      "ko": "한국어 스토리텔링 2-3문장",
      "en": "English narrative 2-3 sentences",
      "ja": "日本語ストーリー 2-3文"
    }
  ]
}`;




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
                const key = `cache:perplexity:intel:v5:${s.ticker}`;
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
            const userPrompt = `IMPORTANT: Search the web for recent news about each of these stocks: ${tickerList}

For each stock, find at least one specific recent news article from major outlets (Reuters, Bloomberg, CNBC, WSJ, etc.) and combine it with the indicator data below.

INDICATOR DATA:
${dataBlock}

Instructions:
1. Search for "${tickerList}" recent news, earnings, analyst ratings, regulatory actions, product launches
2. Lead each analysis with the specific news you found (cite source name)
3. Then connect news to the indicator values provided
4. Provide analysis in Korean, English, and Japanese
5. Return valid JSON only`;

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

                // ── Cache fresh results (30min TTL) ──
                for (const s of needsFetch) {
                    const a = freshAnalyses[s.ticker];
                    if (a) {
                        try {
                            await setInCache(`cache:perplexity:intel:v5:${s.ticker}`, {
                                ko: a.ko, en: a.en, ja: a.ja,
                                basePrice: s.price,
                                updatedAt: new Date().toISOString(),
                            }, 1800);
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

