/**
 * POST /api/guardian/briefing/generate
 * 
 * [V8.0] Bloomberg-Grade Morning Briefing Generator
 * Called by EC2 Worker at 08:00 ET — generates narrative-driven briefing via Gemini.
 * 
 * Input: Market data + news + calendar (from Worker)
 * Output: { ko: "...", en: "...", ja: "..." } narrative briefing
 * 
 * POLICY: Observation-only language. No investment advice.
 */

import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache } from '@/services/redisClient';

export const maxDuration = 60;

const MODEL_NAME = 'gemini-2.5-flash';

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

        // 4. Build Gemini Prompt — NARRATIVE-DRIVEN
        const geminiKey = process.env.GEMINI_NEWS_KEY || process.env.GEMINI_VERDICT_KEY || process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
        }

        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });

        const prompt = `You are a Bloomberg Terminal Pre-Market Analyst writing the MORNING BRIEFING.
Your briefing must read like a NARRATIVE STORY, not a list of indicators.

## CRITICAL RULES
1. Today is ${todayStr} (${dayOfWeek}).
2. WEAVE the news stories INTO the data. News is the backbone, indicators are the supporting evidence.
3. Write exactly 3-4 sentences per language. CONCISE but COMPLETE.
4. NEVER give investment advice. Use ONLY observational language: "관찰됨", "나타남", "observed", "noted".
5. Connect the dots: WHY does VIX matter given today's news? HOW does GEX relate to the event calendar?
6. Each language must be NATIVE quality — not a translation, but written as if by a native analyst.
7. Do NOT use any emoji or special Unicode symbols. Use plain text only.

## MARKET DATA (Pre-Market Snapshot)
- RLSI: ${rlsi} | Recent Trend: ${historyStr || 'N/A'}
- VIX: ${vix} | GEX: ${gex} | Squeeze Risk: ${squeeze}%
- Breadth: ${breadth}% | Regime: ${regime}
- Gamma: Resistance ${triggerHigh}, Support ${triggerLow}, Flip ${flipPoint}
- Top Sectors: ${sectors || 'N/A'}

## TODAY'S ECONOMIC CALENDAR (HIGH IMPACT)
${calendarEvents.length > 0 ? calendarEvents.join('\n') : 'No HIGH impact events today'}

## OVERNIGHT / PRE-MARKET NEWS
${marketNews.length > 0 ? marketNews.map((n, i) => `${i + 1}. ${n}`).join('\n') : 'No major headlines'}

## NARRATIVE STYLE EXAMPLES (follow this tone):
- KO: "인플레이션 우려 속 CPI 발표를 앞두고 시장은 관망세를 보이고 있으며, 전일 RLSI 44 중립 마감과 VIX 24.9 상승이 변동성 확대 가능 구간을 시사. 숏 감마(GEX -7) 환경에서 유럽 약세(-0.8%)가 프리마켓 하방 압력으로 관찰됨. 오늘 12:30 ET CPI 결과에 따라 감마 체제 전환 가능성 주시 구간."
- EN: "Markets enter a cautious stance ahead of today's 12:30 ET CPI release, with prior close RLSI at 44 and VIX elevated at 24.9. Short gamma positioning (GEX -7) coupled with European weakness (-0.8%) creating pre-market downside pressure. S&P 6,772 approaching the gamma flip level, where dealer hedging dynamics shift observed."
- JA: "CPI発表を控えインフレ懸念が再浮上する中、前日RLSI 44中立圏で引け。VIX 24.9上昇とショートガンマ(GEX -7)環境下で欧州市場の弱さ(-0.8%)がプレマーケットの下方圧力として観測。本日12:30 ET CPI結果次第でガンマ体制転換の可能性を注視。"

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences):
{
  "ko": "한국어 브리핑 (3-4문장, 네이티브 애널리스트 톤)",
  "en": "English briefing (3-4 sentences, Bloomberg tone)",
  "ja": "日本語ブリーフィング（3-4文、野村レポートトーン）"
}`;

        const genAI = new GoogleGenAI({ apiKey: geminiKey });
        const result = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });

        const rawText = (result.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        if (!rawText) {
            return NextResponse.json({ error: 'Gemini returned empty response' }, { status: 500 });
        }

        const briefing = JSON.parse(rawText);
        const elapsed = Date.now() - startTime;

        console.log(`[Briefing Gen] ✅ Narrative briefing generated in ${elapsed}ms`);

        return NextResponse.json({
            success: true,
            briefing,  // { ko: "...", en: "...", ja: "..." }
            newsCount: marketNews.length,
            calendarCount: calendarEvents.length,
            elapsedMs: elapsed,
        });

    } catch (e: any) {
        console.error('[Briefing Gen] Error:', e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
