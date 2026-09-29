import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, EarningsEvent } from '@/services/finnhubClient';
import { swrFetch } from '@/lib/cache/redisSWR';
import { daysBetweenYmd, etDateOf } from '@/lib/marketCalendar';

// [V45.15] Earnings API - Uses Finnhub earnings calendar
// Shows: Next earnings date, days remaining, expected EPS
//
// ★ 2026-09-30 날짜는 미국 동부 «시장 날짜»(marketCalendar)로 센다 — 서버(UTC) 날짜로 셌더니 ET 20:00(겨울 19:00)~자정
//   (한국 오전)에 D-n 이 하루 작았고, 그날 실적은 «지났다»로 빠져 다음 분기 날짜가 나왔다(Finnhub 조회 시작일도 UTC 날짜였다).
//   D-n·라벨·색은 «지금» 기준이라 캐시(1시간)에 굳히지 않고 요청마다 다시 센다.

/** 실적까지 남은 날 — ET 오늘 기준(요청마다). 날짜 모양이 아니면 null */
function earningsCountdown(dateStr: string | null | undefined, nowMs: number) {
    const days = daysBetweenYmd(etDateOf(nowMs), String(dateStr ?? '').slice(0, 10));
    if (days == null) return null;
    const daysLabel = days < 0 ? `D+${Math.abs(days)}` : days === 0 ? 'today' : `D-${days}`;
    let color = 'text-slate-400';
    if (days <= 7 && days >= 0) color = 'text-amber-400';
    if (days <= 3 && days >= 0) color = 'text-rose-400';
    if (days < 0) color = 'text-slate-500';
    return { daysUntilEarnings: days, daysLabel, color };
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('ticker') || searchParams.get('t');

    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const startTime = Date.now();
    const tickerUpper = ticker.toUpperCase();

    try {
        const result = await swrFetch(
            `earnings:${tickerUpper}`,
            async () => {
                const FMP_KEY = process.env.POLYGON_API_KEY ? process.env.FMP_API_KEY : process.env.FMP_API_KEY; // Using env safely
                const fmpKeyToUse = FMP_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
                const todayET = etDateOf(Date.now());
                const [rawEarnings, forwardRes] = await Promise.all([
                    // 조회 시작일 = ET 오늘(기본값은 UTC 날짜라 ET 20:00 이후엔 오늘 실적이 창 밖이었다)
                    getEarningsCalendar(tickerUpper, todayET),
                    fmpKeyToUse ? fetch(`https://financialmodelingprep.com/stable/analyst-estimates?symbol=${tickerUpper}&period=annual&apikey=${fmpKeyToUse}`).catch(()=>null) : null
                ]);
                // ★ Finnhub 는 ADR 요청에도 «해외 원주» 를 섞어 준다(TSM→2330.TW, ASML→ASML.AS,
                //   NVO→"NOVO B.CO"). 그 EPS 는 TWD/EUR 인데 화면은 $ 를 붙여 그린다 —
                //   실측(2026-09-05): TSM 예상 EPS $28.96(실제 ADR 기준 약 $2.5), ASML $10.62.
                //   에러 없이 숫자만 틀리는 형태라 눈으로는 안 잡힌다. 요청한 심볼과 다른 행은 버린다.
                const sameListing = (sym: unknown) => {
                    const v = String(sym ?? '').toUpperCase().trim();
                    return v === '' || v === tickerUpper;   // 심볼이 없으면 응답 자체가 그 종목 것
                };
                const rawSameListing = rawEarnings.filter((e: any) => sameListing(e?.symbol));
                const droppedForeign = rawEarnings.length - rawSameListing.length;

                const earnings = [...rawSameListing].sort((a, b) =>
                    new Date(a.date).getTime() - new Date(b.date).getTime()
                );
                
                let forwardEps = null, forwardRevenue = null, forwardYear = null;
                if (forwardRes && forwardRes.ok) {
                    try {
                        const forwardData = await forwardRes.json();
                        if (Array.isArray(forwardData)) {
                            const currentYearStr = new Date().toISOString().slice(0, 4);
                            const nextYearData = [...forwardData].reverse().find((f: any) => f.date && f.date.slice(0, 4) > currentYearStr);
                            if (nextYearData && nextYearData.epsAvg !== undefined && nextYearData.revenueAvg) {
                                forwardEps = nextYearData.epsAvg;
                                forwardRevenue = nextYearData.revenueAvg;
                                forwardYear = nextYearData.date.slice(0, 4);
                            }
                        }
                    } catch (e) {}
                }

                if (!earnings || earnings.length === 0) {
                    return {
                        ticker: tickerUpper,
                        nextEarningsDate: null, daysUntilEarnings: null,
                        daysLabel: 'TBD', epsEstimate: null, quarter: null, year: null,
                        color: 'text-slate-400', hasData: false,
                        debug: { latencyMs: Date.now() - startTime, eventsFound: 0, droppedForeign }
                    };
                }

                // 오늘(ET) 실적도 «다가오는» 실적이다 — 날짜 글자로 견준다(서버 시간대와 무관)
                const upcomingEarnings = earnings.find((e: EarningsEvent) => String(e.date).slice(0, 10) >= todayET);

                const targetEarnings = upcomingEarnings || earnings[earnings.length - 1];

                const nextEarningsDate: string | null = targetEarnings ? targetEarnings.date : null;
                const cd = targetEarnings ? earningsCountdown(targetEarnings.date, Date.now()) : null;
                const daysUntilEarnings = cd ? cd.daysUntilEarnings : null;
                const daysLabel = cd ? cd.daysLabel : 'TBD';
                const color = cd ? cd.color : 'text-slate-400';

                const hourCode = targetEarnings?.hour || '';

                return {
                    ticker: tickerUpper,
                    nextEarningsDate, daysUntilEarnings, daysLabel,
                    epsEstimate: targetEarnings?.epsEstimate || null,
                    epsActual: targetEarnings?.epsActual || null,
                    quarter: targetEarnings?.quarter || null,
                    year: targetEarnings?.year || null,
                    forwardEps, forwardRevenue, forwardYear,
                    hourLabel: hourCode, color, hasData: true,
                    debug: { latencyMs: Date.now() - startTime, eventsFound: earnings.length }
                };
            },
            { ttlSeconds: 3600, keyPrefix: 'swr' }
        );

        // D-n·라벨·색은 요청마다 ET 오늘로 다시 센다 — 캐시에 담긴 값은 담던 날의 것이다(ET 자정을 넘기면 하루 어긋난다)
        const data: any = result.data;
        const cd = data?.nextEarningsDate ? earningsCountdown(data.nextEarningsDate, Date.now()) : null;
        return NextResponse.json({ ...data, ...(cd ?? {}), _cache: result._cache });
    } catch (e: any) {
        console.error('[Earnings API] Error:', e);
        return NextResponse.json({
            ticker: tickerUpper,
            nextEarningsDate: null, daysUntilEarnings: null, daysLabel: 'N/A',
            epsEstimate: null, color: 'text-slate-400', hasData: false, error: e.message
        });
    }
}
