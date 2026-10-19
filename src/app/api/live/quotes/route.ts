
import { NextResponse, after } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getMarketStatusSSOT } from '@/services/marketStatusProvider';
import { reconstructLastSession, type LastSessionData } from '@/services/lastSession';
import { peekExtendedSessionClosesAndWarm, isTradeInExtSession, pickRegularPreClose, recallProvisionalPreCloses, rememberProvisionalPreClose, type ExtSessionClose, type ProvisionalPreStored } from '@/services/extendedSessionClose';
import { etDateOf, etMinutesOf, shownRegularSessionDate, etLastCompletedSessionDate } from '@/lib/marketCalendar';
import { correctBulkSnapshot } from '@/lib/bulkQuoteClose';
import { overlayBulkWithHub, HUB_OVERLAY_MIN_SYMBOLS, HUB_OVERLAY_MAX_SYMBOLS } from '@/lib/hubLiveOverlay';
import { regularPriceStamp, missingStamp } from '@/lib/sourceStamp';

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

        // ── 31개 이상 한 요청(벌크 경로) — 정규장 밖에선 day.c 가 시간외 호가 중간값이다 → 마지막 정규장 종가로 바로잡는다(src/lib/bulkQuoteClose.ts · 벤더 호출 0) ──
        //   (Intel 섹터 화면이 90여 종목을 한 요청으로 묻는다 — 10/13 NVDA 224.54(실제 종가 226.32))
        if (session !== 'regular' && results.some((r) => r.snapshot && r.snapshot._eodDate)) {
            // 완료일은 세션(조기 폐장 13:00 이후 POST)과 짝이 맞는 «조기 폐장 반영» 완료일 — 16:00 고정 완료일이면 11/27 13:30 에
            //   전 거래일(11/25) EOD 종가가 오늘 값 자리에 앉는다(관문 10191642 P1). 평일은 etLastClosedSessionDate 와 같은 날짜다(marketCalendar.etLastCompletedSessionDate).
            const lastClosed = etLastCompletedSessionDate(Date.now());
            results = results.map((r) => (r.snapshot && r.snapshot._eodDate ? { ...r, snapshot: correctBulkSnapshot(r.snapshot, lastClosed) } : r));
        }

        // ── 31~100개 한 요청(벌크 경로) 정규장 — 벌크 행의 «지금 가격» 은 벤더 스냅샷 CSV 의 호가 중간값이라 최대 약 20분 묵는다(파일 자체가 15분 늦고 5분 캐시, HOOD 109.52 vs 110.19) ──
        //   가격 허브(실시간 WS)의 마지막 체결로 가격만 덮는다(src/lib/hubLiveOverlay.ts · 벤더 REST 호출 0). 허브가 느리거나 값이 이상하면 덮지 않는다 = 예전 값.
        let hubLive: { applied: number; rejected: number; missing: number } | null = null;
        if (session === 'regular' && tickers.length >= HUB_OVERLAY_MIN_SYMBOLS && tickers.length <= HUB_OVERLAY_MAX_SYMBOLS && results.some((r) => r.snapshot && r.snapshot._eodDate)) {
            const o = await overlayBulkWithHub(results, etDateOf(Date.now()));
            results = o.results;
            if (o.used) hubLive = { applied: o.applied, rejected: o.rejected, missing: o.missing };
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
        // ★ [2026-10-05] 정규장 PRE CLOSE 가 «아직 없는» 종목(확정 09:47 ET 전 · 계산 전)은 끊기지 않게 잠정값으로 잇는다.
        //   스냅샷 마지막 체결이 오늘 프리 체결이면 그 값(개장 직후 지연 피드 09:30~09:45), 아니면 기억해 둔 값(09:45~확정).
        //   기억값은 «확정이 아직 없고(undefined) 스냅샷도 프리 체결이 아닌» 종목만 한 번에 읽는다 — 확정 뒤엔 읽지 않는다.
        //   (확인 결과 «그날 프리 체결 없음»(null)인 종목은 읽지 않는다 — 비유동 종목이 매 폴링 Redis 를 치지 않게)
        const recallMap: Record<string, ProvisionalPreStored | null> = {};
        if (session === 'regular') {
            const needRecall = results
                .filter(({ ticker, snapshot: S }) => {
                    if (closeMap[ticker] !== undefined) return false;
                    const lt = Number(S?.lastTrade?.t) > 0 ? Math.round(Number(S.lastTrade.t) / 1e6) : 0;
                    return !((S?.lastTrade?.p || 0) > 0 && isTradeInExtSession(lt, todayET, 'pre'));
                })
                .map((r) => r.ticker);
            if (needRecall.length > 0) {
                const vals = await recallProvisionalPreCloses(needRecall, todayET);
                needRecall.forEach((t, i) => { recallMap[t] = vals[i]; });
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
                data[ticker] = { price: 0, changePercent: 0, error, ...missingStamp(nowMs) };
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
            // ★ [2026-10-05] 값의 종류·체결 시각 — close = 확정 종가 · live = 진행 중 체결 또는 잠정값(화면이 기준 시각을 그린다)
            let extendedKind: 'close' | 'live' | null = null;
            let extendedTime: string | null = null;
            let extendedBasis: string | null = null;
            let extendedSource: string | null = null;
            const lastTradeMs = Number(S.lastTrade?.t) > 0 ? Math.round(Number(S.lastTrade.t) / 1e6) : 0;

            if (session === 'regular') {
                price = liveLast || dayClose || prevClose;
                // PRE CLOSE = 오늘 프리마켓의 마지막 Form T 체결(확정 뒤) — 확정 전·계산 전엔 잠정값으로 잇는다(pickRegularPreClose).
                // ⚠️ 예전 폴백 두 개를 뺐다: flow:extended(날짜 없음 · 정규장 분봉이 앉아 있었다)와
                //    스냅샷 시가(day.o = 개장 단일가 ≠ 프리마켓 종가 — COST 9/25 시가 887 vs 프리 종가 887.53).
                // ★ [2026-10-05] 확정 전(09:30~09:47 ET)엔 null 이라 화면이 PRE 칸을 숨겼다(대표 10/5 09:32 ET 캡처) → 잠정값 + 기준 시각.
                const preSnapshot = S._preCloseSnapshot ?? S.lastTrade;
                const prePrice = Number(preSnapshot?.p) || 0;
                const preTimeMs = Number(preSnapshot?.t) > 0 ? Math.round(Number(preSnapshot.t) / 1e6) : 0;
                const snapPre = prePrice > 0 && isTradeInExtSession(preTimeMs, todayET, 'pre');
                const pc = pickRegularPreClose({
                    today: todayET,
                    final: closeMap[ticker],
                    snapPrice: snapPre ? prePrice : 0,
                    snapTradeMs: preTimeMs,
                    recalled: recallMap[ticker] ?? null,
                });
                if (pc) {
                    extendedPrice = pc.price;
                    extendedLabel = 'PRE';
                    extendedDate = pc.date;
                    extendedKind = pc.kind;
                    extendedTime = pc.time;
                    extendedBasis = pc.source === 'tape' ? 'session_close' : pc.source === 'snapshot' ? (preSnapshot?.basis ?? null) : null;
                    extendedSource = pc.source === 'tape' ? (closeMap[ticker]?.source ?? null) : pc.source === 'snapshot' ? (preSnapshot?.source ?? null) : null;
                    if (pc.source === 'snapshot') rememberProvisionalPreClose(ticker, todayET, pc.price, preTimeMs);
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
                    extendedKind = 'live';
                    extendedTime = new Date(lastTradeMs).toISOString();
                    extendedBasis = S.lastTrade?.basis ?? null;
                    extendedSource = S.lastTrade?.source ?? null;
                    // ★ [2026-10-13] 개장 순간부터 PRE CLOSE 칸을 잇는다 — 정규장은 09:30:00 부터 실시간 체결이라 «지연 피드가 09:45 까지 프리 체결을 준다»는
                    //   10/5 수리의 전제(전환 구간 스냅샷에서 잠정값을 읽어 기억)가 깨졌다: 10/13 09:39 ET 41종목 전부 PRE CLOSE 칸이 비었다(확정 09:47 전).
                    //   그래서 프리마켓에 «오늘 프리 체결»을 볼 때 기억해 둔다 — 정규장 분기가 같은 날짜 키로 읽는다(recalled). 종목·20초당 한 번만 쓴다(함수가 거른다).
                    if (etMinutesOf(nowMs) >= 9 * 60) rememberProvisionalPreClose(ticker, todayET, liveLast, lastTradeMs);
                }
                extendedLabel = 'PRE';
            } else if (session === 'post') {
                price = dayClose || prevClose;
                // ⚠️ 예전엔 S.min?.c 를 먼저 봤다 — 어댑터의 min.c 는 «정규장 종가»라 POST 가 늘 비었다.
                if (liveLast > 0 && isTradeInExtSession(lastTradeMs, todayET, 'post')) {
                    extendedPrice = liveLast;
                    extendedDate = todayET;
                    extendedKind = 'live';
                    extendedTime = new Date(lastTradeMs).toISOString();
                    extendedBasis = S.lastTrade?.basis ?? null;
                    extendedSource = S.lastTrade?.source ?? null;
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
                    extendedKind = 'close';
                    extendedTime = pc.time || null;
                    extendedBasis = 'session_close';
                    extendedSource = pc.source || null;
                } else if (liveLast > 0 && isTradeInExtSession(lastTradeMs, shownDate, 'post')) {
                    extendedPrice = liveLast;
                    extendedLabel = 'POST';
                    extendedDate = shownDate;
                    extendedKind = 'live';
                    extendedTime = new Date(lastTradeMs).toISOString();
                    extendedBasis = S.lastTrade?.basis ?? null;
                    extendedSource = S.lastTrade?.source ?? null;
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
                // Every extendedPrice above is a dated extended-session trade, so a price equal
                // to the baseline is a measured 0%, not a mirror of the regular price.
                : (extendedPrice > 0 ? extendedPrice : 0);
            const outExtLabel = recon
                ? (recon.postPrice > 0 ? 'POST' : undefined)
                : (extendedLabel || undefined);
            const outExtChangePct = recon ? recon.postChangePct : extendedChangePct;

            const regularPriceMs = S.priceTime ?? lastTradeMs;
            // ★ [2026-10-19 묶음 4 + 가격 채택 통합] «값 + 원천 날짜/근거» — price 가 속한 정규장 날짜·관측 시각·근거를 값과 같이 싣는다.
            //   화면이 «받은 시각 + 지금 달력»으로 날짜를 다시 만들지 않게(관심종목 «9/28 종가»가 묵은 값에도 오늘 날짜였다 — W01).
            //   정규장 원천 날짜·관측 시각은 priceTime 과 «같은 관측»에서(허브가 priceTime 을 앞당겨도 lastTrade.t 는 옛 체결일 수 있다 — 관문 B1-10191422).
            //   완료일은 조기 폐장 반영 달력(etLastCompletedSessionDate — 세션 판정 POST 와 짝).
            const lastClosedForStamp = etLastCompletedSessionDate(nowMs);
            const stampRegDate: string | null = recon
                ? (recon.sourceSessionDate ?? lastClosedForStamp)
                : S._closeCorrected ? (S._eodDate ?? null)
                : (S._intrinio?.regularDate || (S._eodDate && S.lastTrade?.basis === 'eod_close' ? (S.lastTrade?.date || S._eodDate) : null) || null);
            const priceStamp = regularPriceStamp({
                session,
                regularDate: stampRegDate,
                // 정규장 밖: 벌크 경로에서 EOD 가 아직 그 세션을 못 따라와 보정되지 않은 행(day.c = 지금 호가 중간값·시간외 체결)만 관측 시각을 싣는다 —
                //   스탬프가 «정규장 종가 아님(proxy)»이 되어 화면 채택 규칙이 직전 실제 정규장 값을 남긴다(설계서 T35)
                tradeMs: session === 'regular' ? (Number(regularPriceMs) || null)
                    : (!recon && S._eodDate && !S._closeCorrected && S.priceBasis && S.priceBasis !== 'eod_close' ? (Number(S.priceTime) || null) : null),
                priceBasis: session === 'regular' ? (S.priceBasis ?? S.lastTrade?.basis ?? null) : (S._closeCorrected ? 'eod_close' : null),
                hasPrice: outPrice > 0,
                lastClosed: lastClosedForStamp,
                nowMs,
            });

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
                // ★ [2026-10-05] close = 확정 종가 · live = 진행 중 체결·잠정값(정규장 개장 직후 PRE CLOSE) — 화면이 잠정값에 기준 시각을 그린다
                extendedKind: recon ? (recon.postPrice > 0 ? 'close' : null) : (outExtPrice > 0 ? extendedKind : null),
                extendedTime: recon ? null : (outExtPrice > 0 ? extendedTime : null),
                // 표시 문구와 종가 확정 규칙은 그대로 두고, 가격의 정의·원천시각을 전달한다.
                priceBasis: session === 'regular' ? (S.priceBasis ?? S.lastTrade?.basis ?? null) : (S._closeCorrected ? 'eod_close' : null),
                priceSource: session === 'regular' ? (S.priceSource ?? S.lastTrade?.source ?? null) : (S._closeCorrected ? 'intrinio_eod' : null),
                priceTime: session === 'regular' ? regularPriceMs : null,
                extendedBasis: outExtPrice > 0 ? (recon ? 'session_close' : extendedBasis) : null,
                extendedSource: outExtPrice > 0 && !recon ? extendedSource : null,
                volume: S.day?.v || 0,
                session,
                lastUpdate: Date.now(),
                // 묶음 4 스탬프(평평한 필드 — src/lib/sourceStamp.ts readStamp). lastUpdate 는 «조회 시각»이라 원천 날짜가 아니다.
                sourceSessionDate: priceStamp.sourceSessionDate,
                observedAt: priceStamp.observedAt,
                receivedAt: priceStamp.receivedAt,
                basis: priceStamp.basis,
            };
        });

        // [FIX] Redis cache write REMOVED — see cache read removal above

        return NextResponse.json({
            data,
            session,
            timestamp: Date.now(),
            ...(hubLive ? { hubLive } : {}),
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
