
import { NextResponse, after } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getMarketStatusSSOT } from '@/services/marketStatusProvider';
import { reconstructLastSession, type LastSessionData } from '@/services/lastSession';
import { peekExtendedSessionClosesAndWarm, isTradeInExtSession, type ExtSessionClose } from '@/services/extendedSessionClose';
import { etDateOf, shownRegularSessionDate } from '@/lib/marketCalendar';

/**
 * 휴장일의 «오늘 바»인가.
 *
 * 벤더는 휴장일에 두 가지로 답한다:
 *   ① day.c = 0         — 바를 안 준다
 *   ② day.c = prevDay.c — 전일 종가를 그대로 복사한다(미러)
 *
 * ②를 «정상 데이터»로 읽으면 등락률이 0 이 되어 전 종목이 보합으로 나간다.
 * 값이 있으니 빈칸 검사에도 안 걸린다 — 조용히 틀리는 종류다.
 */
function isHolidayDayBar(S: any): boolean {
    const d = Number(S?.day?.c) || 0;
    const p = Number(S?.prevDay?.c) || 0;
    if (!d) return true;
    return p > 0 && d === p;
}

/**
 * ★ 값으로는 휴장을 다 못 가른다 — 달력을 봐야 한다.
 *
 * 2026-09-07(노동절) 실측: day.c 가 0 도 아니고 prevDay.c 의 복사본도 아니었다.
 * **금요일의 굳은 마지막 체결가**(NVDA 230.31, 금요일 공식 종가는 230.36)가
 * 들어 있었다. 그래서 day.c ≠ prevDay.c 이고, 값만 보는 검사는 전부 통과한다.
 * 그 결과 등락률이 (230.31-230.36)/230.36 = -0.02% 가 되어 전 종목이 보합.
 *
 * 휴장 여부는 우리가 이미 안다(marketStatusProvider). 값으로 추측하지 말고
 * 그걸 쓴다.
 */
function shouldReconstruct(isHoliday: boolean, S: any): boolean {
    return isHoliday || isHolidayDayBar(S);
}

export const dynamic = 'force-dynamic'; // No caching allowed

// ── 시간외 «종가» 인스턴스 메모리 캐시 — 60초 ──
// 확정된 종가는 그날 안에 바뀌지 않는다. 폴링(2~15초)마다 Redis 를 치지 않게 한다.
// ★ [2026-09-25] 예전엔 여기서 날짜 없는 flow:extended(24h)를 읽었다 — 어제 PRE·POST 와
//   «정규장 분봉 PRE»(COST 916.26)가 그 통로로 오늘 화면에 앉았다. 이제 키에 날짜가 있다.
const EXT_MEM_CACHE = new Map<string, { data: ExtSessionClose | null; expiry: number }>();
const EXT_MEM_TTL_MS = 60_000; // 60 seconds

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
        return NextResponse.json({ error: 'Symbols required' }, { status: 400 });
    }

    try {
        const tickers = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        const marketStatus = await getMarketStatusSSOT();
        const session = marketStatus.session; // 'pre', 'regular', 'post', 'closed'

        // [FIX] Redis cache REMOVED — 2s TTL was conflicting with 2s polling interval,
        // causing stale prices to be returned repeatedly. Prices must ALWAYS be fresh from Polygon.
        // Browser-level Cache-Control header provides sufficient caching.

        // ── [STRATEGY B] Batch Polygon snapshot — 1 API call instead of N ──
        // Previous: N parallel calls to /v2/snapshot/locale/us/markets/stocks/tickers/${ticker}
        // Now: Single batch call to /v2/snapshot/locale/us/markets/stocks/tickers?tickers=NVDA,TSLA,...
        // All downstream logic (session-aware price, changePct) is unchanged.
        const tickerString = tickers.join(',');
        let results: { ticker: string; snapshot: any; error: string | null }[] = [];

        try {
            const batchRes = await fetchMassive(
                `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerString}`,
                {},
                false,
                undefined,
                { cache: 'no-store' as RequestCache }
            );
            const snapshots = batchRes?.tickers || [];
            // Map batch response to same format as individual calls
            const snapshotMap: Record<string, any> = {};
            snapshots.forEach((s: any) => {
                if (s?.ticker) snapshotMap[s.ticker] = s;
            });
            results = tickers.map(ticker => ({
                ticker,
                snapshot: snapshotMap[ticker] || {},
                error: snapshotMap[ticker] ? null : 'no data in batch'
            }));
        } catch (batchErr: any) {
            // Fallback: if batch fails, try individual calls (original behavior)
            console.warn('[LiveAPI] Batch snapshot failed, falling back to individual calls:', batchErr.message);
            results = await Promise.all(
                tickers.map(async ticker => {
                    try {
                        const snapshotRes = await fetchMassive(
                            `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
                            {},
                            false,
                            undefined,
                            { cache: 'no-store' as RequestCache }
                        );
                        const snapshot = snapshotRes?.ticker || {};
                        return { ticker, snapshot, error: null };
                    } catch (e: any) {
                        return { ticker, snapshot: {}, error: e.message };
                    }
                })
            );
        }

        const data: Record<string, any> = {};

        // ── 시간외 «종가» (날짜 키) — 정규장엔 오늘 PRE CLOSE, 마감 뒤엔 화면 날짜의 POST CLOSE ──
        //   저장된 값은 즉시 쓰고, 없는 종목은 뒤에서 몇 개만 계산해 둔다(다음 폴링이 읽는다).
        //   pre·post 진행 중엔 스냅샷의 마지막 체결을 «시각»으로 걸러 쓴다(아래).
        const nowMs = Date.now();
        const todayET = etDateOf(nowMs);
        const shownDate = shownRegularSessionDate(nowMs);
        const closeKind: 'pre' | 'post' | null = session === 'regular' ? 'pre' : session === 'closed' ? 'post' : null;
        const closeDate = closeKind === 'pre' ? todayET : shownDate;
        const closeMap: Record<string, ExtSessionClose | null> = {};
        if (closeKind) {
            const need: string[] = [];
            for (const ticker of tickers) {
                const mem = EXT_MEM_CACHE.get(`${closeKind}:${ticker}:${closeDate}`);
                if (mem && nowMs < mem.expiry) closeMap[ticker] = mem.data;
                else need.push(ticker);
            }
            if (need.length > 0) {
                try {
                    const { values, warm } = await peekExtendedSessionClosesAndWarm(need, closeDate, closeKind, 3);
                    need.forEach((ticker, i) => {
                        const v = values[i];
                        if (v === undefined) return;               // 아직 계산 전 — 메모리에 «없음»을 굳히지 않는다
                        closeMap[ticker] = v;
                        EXT_MEM_CACHE.set(`${closeKind}:${ticker}:${closeDate}`, { data: v, expiry: Date.now() + EXT_MEM_TTL_MS });
                    });
                    if (EXT_MEM_CACHE.size > 5000) EXT_MEM_CACHE.clear();
                    if (warm) after(() => warm);
                } catch { /* non-critical */ }
            }
        }
        // [HOLIDAY] Reconstruct the last real session — see src/services/lastSession.ts.
        //
        // ★ 2026-09-07(노동절) 실측: 휴장의 지문은 «빈 바» 하나가 아니라 둘이다.
        //     ① day.c = 0        — 벤더가 오늘 바를 아예 안 준다
        //     ② day.c = prevDay.c — 벤더가 «전일 종가를 그대로 복사»한다  ← 이번 경우
        //   ②를 빼놨더니 재구성이 안 돌아 NVDA -0.02%(실제 +0.84%) ·
        //   TSLA -0.05%(실제 -5.92%)로 나갔다. 가격이 «있어서» 조용히 틀렸다.
        //
        // 주말은 금요일 바가 남아 day.c ≠ prevDay.c 이므로 여기 걸리지 않는다.
        // 진짜로 보합 마감한 날에 걸리더라도 재구성 결과가 같은 값이라 해가 없다.
        let reconMap: Record<string, LastSessionData> = {};
        if (session === 'closed') {
            const holidayTickers = results
                .filter(r => r.snapshot && shouldReconstruct(marketStatus.isHoliday, r.snapshot))
                .map(r => r.ticker);
            if (holidayTickers.length > 0) {
                reconMap = await reconstructLastSession(holidayTickers);
            }
        }

        results.forEach(({ ticker, snapshot: S, error }) => {
            if (error || !S) {
                data[ticker] = { price: 0, changePercent: 0, error };
                return;
            }

            const liveLast = S.lastTrade?.p || 0;
            const dayClose = S.day?.c || 0;
            const prevDayClose = S.prevDay?.c || 0;
            const prevClose = prevDayClose;

            const todaysChangePerc = S.todaysChangePerc || 0;

            // REG: Always use manual calc — Polygon todaysChangePerc uses inconsistent base for some tickers
            // PRE/POST/CLOSED: Calculate from day.c vs prevDay.c (regular session close)
            // [FIX V3] Polygon todaysChangePerc completely removed for REG — manual calc matches SSR formula exactly
            let changePercent: number | null = 0;
            const manualCalc = (liveLast > 0 && prevDayClose > 0) ? ((liveLast - prevDayClose) / prevDayClose) * 100 : 0;

            if (session === 'regular') {
                // Always use (lastTrade - prevDayClose) / prevDayClose — same as Yahoo/Google/SSR
                changePercent = manualCalc !== 0 ? manualCalc : todaysChangePerc;
            } else {
                // PRE / POST / CLOSED
                // [FIX 2026-07-31] `dayClose !== prevDayClose` 조건을 제거했다.
                // 그 조건은 **진짜 보합(0.00%)을 «데이터 없음»으로 오판**했다. 실측: SOXL이
                // 7/30 114.72(+24.71%) → 7/31 114.72(0.00%)로 마감하자 day.c === prevDay.c가 되어
                // changePercent가 null이 됐고, null을 "다른 데서 가져오라"는 신호로 쓰는 클라이언트가
                // **7/30의 +24.71%를 7/31 자리에 그대로 표시**했다.
                // 원래 의도한 방어는 아래 주석대로 day.c=0(결측)이며 그건 `dayClose > 0`이 잡는다.
                // 휴일 미러(day 바가 prevDay를 복사)는 이 함수가 아니라 [HOLIDAY] recon 블록의
                // `session === 'closed' && !dayClose`가 잡으므로 여기서 중복 방어할 이유가 없다.
                if (dayClose > 0 && prevDayClose > 0) {
                    // 두 값이 같으면 식이 자연히 0을 낸다 — 보합은 유효한 답이지 결측이 아니다.
                    changePercent = ((dayClose - prevDayClose) / prevDayClose) * 100;
                } else {
                    // [FIX 2026-05-06] PRE 마켓에서 day.c=0이면 todaysChangePerc 사용 금지
                    // todaysChangePerc = (lastTrade - prevDay.c) / prevDay.c → PRE 가격 포함된 값이라 본장 등락률로 부정확
                    // null을 반환하면 클라이언트가 batch API의 정확한 값을 폴백으로 사용
                    changePercent = null;
                }
            }

            // Session-aware price & extended price selection
            // ★ [2026-09-25] 시간외 값은 «라벨»이 아니라 «세션·날짜·체결 시각»으로 고른다.
            //   지연 피드(15분)는 04:0x 에 어제 애프터 체결을, 16:0x 에 정규장 체결을 «마지막 체결»로 준다.
            let price = 0;
            let extendedPrice = 0;
            let extendedLabel = '';
            let extendedDate: string | null = null;
            const lastTradeMs = Number(S.lastTrade?.t) > 0 ? Math.round(Number(S.lastTrade.t) / 1e6) : 0;

            if (session === 'regular') {
                price = liveLast || dayClose || prevClose;
                // PRE CLOSE = 오늘 프리마켓의 마지막 Form T 체결(확정 뒤에만).
                // ⚠️ 예전 폴백 두 개를 뺐다: flow:extended(날짜 없음 · 정규장 분봉이 앉아 있었다)와
                //    스냅샷 시가(day.o = 개장 단일가 ≠ 프리마켓 종가 — COST 9/25 시가 887 vs 프리 종가 887.53).
                const pc = closeMap[ticker];
                if (pc && pc.price > 0) {
                    extendedPrice = pc.price;
                    extendedLabel = 'PRE';
                    extendedDate = pc.date;
                }
            } else if (session === 'pre') {
                // ══════════════════════════════════════════════════════
                // [2026-08-31 수정] PRE 에서 두 값이 모두 틀려 있었다.
                //   ① price 는 «마지막 정규장 종가»여야 한다. prevClose(= prevDay.c)는
                //      그 하나 앞(목요일)이라 한 세션 밀린다.
                //   ② 마지막 체결이 오늘 프리마켓 체결이 아니면 프리마켓 가격이 아니다.
                //      없으면 0 을 내보내 클라이언트가 다른 소스로 폴백하게 둔다
                //      — 그럴듯한 가짜 숫자보다 «값 없음»이 언제나 낫다.
                // ══════════════════════════════════════════════════════
                price = dayClose || prevClose;
                if (liveLast > 0 && isTradeInExtSession(lastTradeMs, todayET, 'pre')) {
                    extendedPrice = liveLast;
                    extendedDate = todayET;
                }
                extendedLabel = 'PRE';
            } else if (session === 'post') {
                price = dayClose || prevClose;
                // ⚠️ 예전엔 S.min?.c 를 먼저 봤다 — 어댑터의 min.c 는 «정규장 종가»라 POST 가 늘 비었다.
                if (liveLast > 0 && isTradeInExtSession(lastTradeMs, todayET, 'post')) {
                    extendedPrice = liveLast;
                    extendedDate = todayET;
                }
                extendedLabel = 'POST';
            } else {
                // CLOSED — 화면 날짜의 애프터 종가(마지막 Form T). 확정 전(20:00~20:17)·계산 전이면
                // 그날 애프터 체결만 잠정값으로 쓴다. 날짜 없는 캐시는 읽지 않는다.
                price = dayClose || prevClose;
                const pc = closeMap[ticker];
                if (pc && pc.price > 0) {
                    extendedPrice = pc.price;
                    extendedLabel = 'POST';
                    extendedDate = pc.date;
                } else if (liveLast > 0 && isTradeInExtSession(lastTradeMs, shownDate, 'post')) {
                    extendedPrice = liveLast;
                    extendedLabel = 'POST';
                    extendedDate = shownDate;
                }
            }

            // 등락률은 두 가격으로 직접 계산한다(서버 캐시 값으로 덮지 않는다 — 한 세션 밀린 값이 앉아 있었다).
            //   PRE(진행 중) 기준 = 마지막 정규장 종가(프리마켓엔 day.c 가 그것이다)
            //   PRE CLOSE(정규장 중) 기준 = 전일 종가 — day.c 는 정규장 중엔 «실시간 가격»이다
            //   POST 기준 = 그날 정규장 종가(price)
            let extendedChangePct = 0;
            if (extendedPrice > 0) {
                const preBaseline = session === 'pre' ? (dayClose || prevDayClose) : prevDayClose;
                if (extendedLabel === 'PRE' && preBaseline > 0) {
                    extendedChangePct = ((extendedPrice - preBaseline) / preBaseline) * 100;
                } else if (extendedLabel === 'POST' && price > 0) {
                    extendedChangePct = ((extendedPrice - price) / price) * 100;
                }
            }

            // [HOLIDAY] Override with reconstructed last-session data when the snapshot
            // day bar is empty (day.c=0 on a market holiday), so change% and POST reflect
            // the last real session instead of collapsing to prevClose / 0.00% / a mirror.
            const recon = (session === 'closed' && shouldReconstruct(marketStatus.isHoliday, S)) ? reconMap[ticker] : undefined;
            const outPrice = recon ? recon.regClose : price;
            const outPrevClose = recon ? recon.prevClose : prevClose;
            const outChangePct = recon ? recon.changePct : changePercent;
            const outExtPrice = recon
                ? recon.postPrice
                : (extendedPrice > 0 && extendedPrice !== price ? extendedPrice : 0);
            const outExtLabel = recon
                ? (recon.postPrice > 0 ? 'POST' : undefined)
                : (extendedLabel || undefined);
            const outExtChangePct = recon ? recon.postChangePct : extendedChangePct;

            data[ticker] = {
                price: outPrice,
                previousClose: outPrevClose,
                prevClose: outPrevClose,
                change: outPrice - outPrevClose,
                changePercent: outChangePct,
                regChangePct: outChangePct,
                extendedPrice: outExtPrice,
                extendedChange: outExtPrice > 0 ? outExtPrice - outPrice : 0,
                extendedChangePercent: outExtChangePct,
                extendedLabel: outExtLabel,
                extendedDate: recon ? null : (outExtPrice > 0 ? extendedDate : null),
                volume: S.day?.v || 0,
                session,
                lastUpdate: Date.now()
            };
        });

        // [FIX] Redis cache write REMOVED — see cache read removal above

        return NextResponse.json({
            data,
            session,
            timestamp: Date.now()
        }, {
            headers: {
                // [PERF] Short stale-while-revalidate for browser-level caching during rapid 2s polling
                'Cache-Control': 'private, max-age=1, stale-while-revalidate=3',
            }
        });

    } catch (error) {
        console.error('[LiveAPI] Failed to fetch quotes:', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
