import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, EarningsEvent } from '@/services/finnhubClient';
import { swrFetch } from '@/lib/cache/redisSWR';
import { etDateOf } from '@/lib/marketCalendar';
import { earningsCountdown, pickNextEarnings, ymdOf, type EarningsCandidate } from '@/lib/earningsDate';
import { earningsCalendarRowsFor } from '@/services/earningsCalendarService';

// [V45.15] Earnings API - Uses Finnhub earnings calendar
// Shows: Next earnings date, days remaining, expected EPS
//
// ★ 2026-09-30 날짜는 미국 동부 «시장 날짜»(marketCalendar)로 센다 — 서버(UTC) 날짜로 셌더니 ET 20:00(겨울 19:00)~자정
//   (한국 오전)에 D-n 이 하루 작았고, 그날 실적은 «지났다»로 빠져 다음 분기 날짜가 나왔다(Finnhub 조회 시작일도 UTC 날짜였다).
//   D-n·라벨·색은 «지금» 기준이라 캐시(1시간)에 굳히지 않고 요청마다 다시 센다.
//
// ★★ 2026-09-30 실적일은 공용 규칙 하나로 고른다(lib/earningsDate.ts pickNextEarnings — FMP 실적 캘린더 우선, 없을 때만 Finnhub).
//   예전엔 이 라우트(Command·Intel)는 Finnhub, 실적 캘린더·내 종목 칩은 FMP 였다 — NKE 가 12/16 과 10/1 로 갈렸다(공식 10/1).
//   Finnhub 행들은 캐시(1시간)에 그대로 담고, 고르기는 요청마다 한다 — 같은 순간 캘린더 화면과 같은 캘린더 사본을 본다.
//   캘린더는 시장 전체 1벌(6시간 캐시 + 인스턴스 메모 60초)이라 이 라우트가 벤더 호출을 늘리지 않는다.

/** 옛 캐시(1시간)에는 Finnhub 행 목록 없이 고른 한 행만 있었다 — 그 한 행을 목록으로 */
function finnhubRowsOf(data: any): EarningsCandidate[] {
    if (Array.isArray(data?.events)) return data.events;
    const d = ymdOf(data?.nextEarningsDate);
    return d ? [{ date: d, hour: data?.hourLabel, epsEstimate: data?.epsEstimate, epsActual: data?.epsActual, quarter: data?.quarter, year: data?.year }] : [];
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

                // Finnhub 행들 — 고르기는 응답 직전에(요청마다) 한다
                const events: EarningsCandidate[] = earnings.map((e: EarningsEvent) => ({
                    date: String(e.date).slice(0, 10), hour: e.hour || '',
                    epsEstimate: e.epsEstimate ?? null, epsActual: e.epsActual ?? null,
                    revenueEstimate: e.revenueEstimate ?? null, quarter: e.quarter ?? null, year: e.year ?? null,
                }));

                if (!earnings || earnings.length === 0) {
                    return {
                        ticker: tickerUpper,
                        nextEarningsDate: null, daysUntilEarnings: null,
                        daysLabel: 'TBD', epsEstimate: null, quarter: null, year: null,
                        forwardEps, forwardRevenue, forwardYear,
                        color: 'text-slate-400', hasData: false, events,
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
                    hourLabel: hourCode, color, hasData: true, events,
                    debug: { latencyMs: Date.now() - startTime, eventsFound: earnings.length }
                };
            },
            { ttlSeconds: 3600, keyPrefix: 'swr' }
        );

        // ★ 실적일은 공용 규칙으로 요청마다 고른다(FMP 캘린더 우선 → 없으면 Finnhub).
        //   D-n·라벨·색도 요청마다 ET 오늘로 센다 — 캐시에 담긴 값은 담던 날의 것이다(ET 자정을 넘기면 하루 어긋난다)
        const data: any = { ...(result.data || {}) };
        delete data.events;                       // Finnhub 행 목록은 캐시 안에서만 쓴다(응답 모양은 예전 그대로)
        const nowMs = Date.now();
        const todayET = etDateOf(nowMs);
        const finnhubRows = finnhubRowsOf(result.data);
        // 캘린더가 비어 만드는 중이면 4초까지만 기다린다(보통 1~3초) — FMP 장애(창마다 15초 시간 초과) 때 Command 가
        //   함께 멈추지 않게. 넘기면 이 응답만 Finnhub 날짜이고, 만들기는 뒤에서 끝나 다음 요청부터 캘린더 날짜다.
        const cal = await earningsCalendarRowsFor(tickerUpper, { waitMs: 4000 });
        const next = pickNextEarnings({ fmp: cal.rows ?? [], finnhub: finnhubRows }, todayET);
        const debug = { ...(data.debug || {}), calendar: cal.status };
        if (next) {
            return NextResponse.json({
                ...data,
                ticker: tickerUpper,
                nextEarningsDate: next.date, ...earningsCountdown(next.date, nowMs),
                epsEstimate: next.epsEstimate, epsActual: next.epsActual,
                quarter: next.quarter, year: next.year,
                hourLabel: next.hour, hasData: true, dateSource: next.source, ...(next.dateStatus ? { dateStatus: next.dateStatus } : {}),
                debug, _cache: result._cache,
            });
        }
        // 다가오는 실적이 어디에도 없다 — 지난 실적만 있으면(옛 캐시가 ET 자정을 넘긴 경우) D+n 으로(예전과 같은 규칙), 없으면 TBD
        const past = finnhubRows.filter((r) => ymdOf(r?.date)).sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
        if (past) {
            return NextResponse.json({
                ...data,
                ticker: tickerUpper,
                nextEarningsDate: ymdOf(past.date), ...earningsCountdown(ymdOf(past.date), nowMs),
                epsEstimate: past.epsEstimate ?? null, epsActual: past.epsActual ?? null,
                quarter: past.quarter ?? null, year: past.year ?? null,
                hourLabel: past.hour || '', hasData: true, dateSource: 'finnhub',
                debug, _cache: result._cache,
            });
        }
        return NextResponse.json({
            ...data,
            ticker: tickerUpper,
            nextEarningsDate: null, daysUntilEarnings: null, daysLabel: 'TBD', color: 'text-slate-400',
            epsEstimate: null, epsActual: null, quarter: null, year: null, hasData: false,
            debug, _cache: result._cache,
        });
    } catch (e: any) {
        console.error('[Earnings API] Error:', e);
        return NextResponse.json({
            ticker: tickerUpper,
            nextEarningsDate: null, daysUntilEarnings: null, daysLabel: 'N/A',
            epsEstimate: null, color: 'text-slate-400', hasData: false, error: e.message
        });
    }
}
