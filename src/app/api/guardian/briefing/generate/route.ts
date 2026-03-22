/**
 * POST /api/guardian/briefing/generate
 * 
 * [V8.0] Bloomberg-Grade Morning Briefing Generator
 * Called by EC2 Worker at 08:00 ET — generates narrative-driven briefing via Claude Sonnet 4.
 * 
 * Input: Market data + news + calendar (from Worker)
 * Output: { ko: "...", en: "...", ja: "..." } narrative briefing
 * 
 * POLICY: Observation-only language. No investment advice.
 */

import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getYahooDataSSOT } from '@/services/yahooFinanceHub';

export const maxDuration = 60;

const BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

let _bedrockClient: BedrockRuntimeClient | null = null;
function getBedrock(): BedrockRuntimeClient {
    if (_bedrockClient) return _bedrockClient;
    _bedrockClient = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    });
    return _bedrockClient;
}

export async function POST(req: Request) {
    const startTime = Date.now();

    try {
        const body = await req.json();
        const { snapshot, rlsiHistory } = body;

        // 1. Fetch Polygon broad market news (macro/geopolitical included)
        let marketNews: string[] = [];
        try {
            const newsData = await fetchMassive(
                '/v2/reference/news',
                { ticker: 'SPY,QQQ,DIA,TLT,GLD', limit: '10', order: 'desc', sort: 'published_utc' },
                true
            );
            marketNews = (newsData?.results || []).map((n: any) => {
                const title = n.title || '';
                const desc = n.description ? ` — ${n.description.slice(0, 200)}` : '';
                return title + desc;
            }).filter(Boolean).slice(0, 7);
        } catch (e) {
            console.warn('[Briefing Gen] News fetch failed:', e);
        }

        // 2. Get economic calendar from Redis
        let calendarEvents: string[] = [];
        try {
            const calRaw = await getFromCache<any>('fmp:econ-calendar');
            if (calRaw?.events) {
                const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                calendarEvents = calRaw.events
                    .filter((e: any) => e.date === todayET && e.impact === 'HIGH')
                    .map((e: any) => `${e.time} ET: ${e.event} (Est: ${e.estimate || 'N/A'}, Prev: ${e.previous || 'N/A'})`)
                    .slice(0, 5);
            }
        } catch (e) {
            console.warn('[Briefing Gen] Calendar fetch failed:', e);
        }

        // 2.5. Fetch ALL market data from Redis (cron-updated every minute)
        let marketDataStr = '';
        try {
            const mkt = await getYahooDataSSOT();
            const fmt = (q: any, label: string) => {
                if (!q || q.source === 'DEFAULT') return null;
                return `${label}: ${q.price?.toFixed(2)} (${q.changePct >= 0 ? '+' : ''}${q.changePct?.toFixed(2)}%)`;
            };
            const lines = [
                fmt(mkt.spx, 'S&P 500 Futures (ES)'),
                fmt(mkt.nq, 'NASDAQ 100 Futures (NQ)'),
                fmt(mkt.rut, 'Russell 2000 Futures (RTY)'),
                fmt(mkt.tnx, 'US 10Y Yield'),
                fmt(mkt.tlt, 'TLT (20Y+ Bond ETF)'),
                fmt(mkt.btc, 'Bitcoin (BTC)'),
                fmt(mkt.gold, 'Gold (GC)'),
                fmt(mkt.oil, 'WTI Oil (CL)'),
                mkt.vix && mkt.vix3m && mkt.vix.source !== 'DEFAULT' && mkt.vix3m.source !== 'DEFAULT'
                    ? `VIX Term Structure: VIX ${mkt.vix.price?.toFixed(2)} / VIX3M ${mkt.vix3m.price?.toFixed(2)} (Ratio: ${(mkt.vix.price / (mkt.vix3m.price || 1)).toFixed(3)}, ${mkt.vix.price > mkt.vix3m.price ? 'BACKWARDATION' : 'CONTANGO'})`
                    : null,
            ].filter(Boolean);
            marketDataStr = lines.join('\n');
            console.log(`[Briefing Gen] Market data: ${lines.length} indicators loaded`);
        } catch (e) {
            console.warn('[Briefing Gen] Market data fetch failed:', e);
        }

        // 3. Extract key metrics from snapshot
        const rlsi = snapshot?.rlsi?.score ?? 'N/A';
        const vix = snapshot?.rlsi?.components?.vix ?? 'N/A';
        const gex = snapshot?.gammaShield?.gexIndex ?? 'N/A';
        const squeeze = snapshot?.gammaShield?.squeezeRisk ?? 'N/A';
        const breadth = snapshot?.breadth?.breadthPct ?? 'N/A';
        const triggerHigh = snapshot?.gammaShield?.triggerHigh ?? 'N/A';
        const triggerLow = snapshot?.gammaShield?.triggerLow ?? 'N/A';
        const flipPoint = snapshot?.gammaShield?.flipPoint ?? 'N/A';
        const regime = snapshot?.tripleA?.regime ?? 'N/A';

        // Top moving sectors
        const sectors = (snapshot?.sectors || [])
            .sort((a: any, b: any) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
            .slice(0, 5)
            .map((s: any) => `${s.name} ${s.change >= 0 ? '+' : ''}${s.change?.toFixed(1)}%`)
            .join(', ');

        // RLSI trend
        const historyStr = (rlsiHistory || []).slice(-5)
            .map((h: any) => h.score).join(' → ');

        // 4. Build Claude Prompt — NARRATIVE-DRIVEN
        if (!process.env.AWS_ACCESS_KEY_ID) {
            return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 500 });
        }

        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
        const dayOfWeekKo = new Date().toLocaleDateString('ko-KR', { weekday: 'long', timeZone: 'America/New_York' });
        const dayOfWeekJa = new Date().toLocaleDateString('ja-JP', { weekday: 'long', timeZone: 'America/New_York' });

        const systemPrompt = `You are a Bloomberg Terminal Pre-Market Analyst writing the MORNING BRIEFING.
Your briefing must read like a NARRATIVE STORY, not a list of indicators.

<critical_rules>
- TODAY IS: ${todayStr} — ${dayOfWeek} / ${dayOfWeekKo} / ${dayOfWeekJa}
- In Korean: use "${dayOfWeekKo}" (e.g., "${dayOfWeekKo} 개장 전 거래에서...")
- In English: use "${dayOfWeek}" (e.g., "${dayOfWeek} pre-market trading...")
- In Japanese: use "${dayOfWeekJa}" (e.g., "${dayOfWeekJa}のプレマーケットで...")
- FORBIDDEN: Do NOT use any other day of the week. Using a wrong day is a CRITICAL ERROR.
- Write exactly 4-5 sentences per language. CONCISE but COMPLETE.
- NEVER give investment advice. ONLY observational language: "관찰됨", "나타남", "observed", "noted".
- Each language must be NATIVE quality — not a translation, but written as if by a native analyst.
- Do NOT use any emoji or special Unicode symbols. Plain text only.
- MANDATORY: Mention actual S&P 500 and NASDAQ 100 performance (price and % change) in the first or second sentence.
- Start with day of week + big market picture, then connect to RLSI/GEX/VIX analysis.
</critical_rules>`;

        const userPrompt = `<market_snapshot>
- RLSI: ${rlsi} | Recent Trend: ${historyStr || 'N/A'}
- VIX: ${vix} | GEX: ${gex} | Squeeze Risk: ${squeeze}%
- Breadth: ${breadth}% | Regime: ${regime}
- Gamma: Resistance ${triggerHigh}, Support ${triggerLow}, Flip ${flipPoint}
- Top Sectors: ${sectors || 'N/A'}
</market_snapshot>

<live_prices>
${marketDataStr || 'Market data unavailable'}
</live_prices>

<economic_calendar>
${calendarEvents.length > 0 ? calendarEvents.join('\n') : 'No HIGH impact events today'}
</economic_calendar>

<overnight_news>
${marketNews.length > 0 ? marketNews.map((n, i) => `${i + 1}. ${n}`).join('\n') : 'No major headlines'}
</overnight_news>

<style_examples>
- KO: "화요일 프리마켓에서 S&P 500 선물 5,650(+0.45%)과 NASDAQ 100 선물 19,840(+0.72%)으로 시장은 소폭 상승 출발하며 인플레이션 우려 속 CPI 발표를 앞두고 관망세가 관찰됨."
- EN: "Tuesday pre-market shows S&P 500 futures at 5,650 (+0.45%) and NASDAQ 100 futures at 19,840 (+0.72%) as markets enter a cautious stance ahead of today's 12:30 ET CPI release."
- JA: "火曜日のプレマーケットではS&P 500先物5,650(+0.45%)、NASDAQ 100先物19,840(+0.72%)と小幅上昇で取引開始。"
</style_examples>

Output ONLY valid JSON (no markdown fences):
{"ko": "한국어 브리핑 (4-5문장)", "en": "English briefing (4-5 sentences)", "ja": "日本語ブリーフィング (4-5文)"}`;

        const client = getBedrock();
        const command = new InvokeModelCommand({
            modelId: BEDROCK_MODEL,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 2048,
                temperature: 0.3,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: userPrompt },
                    { role: 'assistant', content: '{' },  // Prefill to guarantee JSON object start
                ],
            }),
        });

        const result = await Promise.race([
            client.send(command),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Claude timeout 60s')), 55000))
        ]);

        const responseBody = JSON.parse(new TextDecoder().decode(result.body));
        const rawText = '{' + (responseBody.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        if (!rawText || rawText === '{') {
            return NextResponse.json({ error: 'Claude returned empty response' }, { status: 500 });
        }

        const briefing = JSON.parse(rawText);
        const elapsed = Date.now() - startTime;
        const etDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

        console.log(`[Briefing Gen] ✅ Narrative briefing generated in ${elapsed}ms`);

        // [AUTO-SAVE] Store directly in Redis — no Worker dependency
        const locales = ['ko', 'en', 'ja'] as const;
        for (const loc of locales) {
            const briefingText = briefing[loc] || briefing.en || 'Briefing not available';
            await setInCache(`guardian:morning_briefing:${loc}`, {
                date: etDateStr,
                generatedAt: new Date().toISOString(),
                briefing: briefingText,
                source: 'claude',
                newsCount: marketNews.length,
                calendarCount: calendarEvents.length,
            }, 24 * 60 * 60);
        }
        // Legacy key
        await setInCache('guardian:morning_briefing', {
            date: etDateStr,
            generatedAt: new Date().toISOString(),
            text: briefing.ko || briefing.en,
            briefing: briefing.ko || briefing.en,
            source: 'gemini',
        }, 24 * 60 * 60);

        console.log(`[Briefing Gen] ✅ Saved to Redis (3 locales + legacy)`);

        return NextResponse.json({
            success: true,
            briefing,  // { ko: "...", en: "...", ja: "..." }
            newsCount: marketNews.length,
            calendarCount: calendarEvents.length,
            elapsedMs: elapsed,
            savedToRedis: true,
        });

    } catch (e: any) {
        console.error('[Briefing Gen] Error:', e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
