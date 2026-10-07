// ============================================================================
// /api/intel/fast — 경량 배치 Intel API
// [PERF] Polygon snapshot batch (1 call for all tickers) + Redis cache
// Target: ~1-2초 (vs 기존 15-20초)
// ============================================================================

import { NextRequest } from 'next/server';
import { NextResponse, after } from 'next/server';
import { fetchMassive, CACHE_POLICY } from '@/services/massiveClient';
import { reconstructLastSession, type LastSessionData } from '@/services/lastSession';
import { getFromCache, setInCache } from '@/services/redisClient';
import { tryBackgroundLock, releaseBackgroundLock, ageSec } from '@/lib/cache/staleLock';
import { etPhase, intelFastKey, intelFastWindow, usableEnvelope, INTEL_FAST_STORE_TTL_SEC, type IntelFastEnvelope } from '@/lib/cache/intelFastCache';
import { CentralDataHub } from '@/services/centralDataHub';
import { getAnalysisCacheForTickers } from '@/services/analysisCache';
import { readImpliedMoveFields, NO_IMPLIED_MOVE, type ImpliedMoveFields } from '@/lib/impliedMove';
import { GET as getLiveTicker } from '@/app/api/live/ticker/route';
import { xsSnapshotOverride } from '@/services/xsScores';
import { peekExtendedSessionClosesAndWarm, isTradeInExtSession, pickRegularPreClose, recallProvisionalPreCloses, rememberProvisionalPreClose, type ExtSessionClose, type ProvisionalPreStored } from '@/services/extendedSessionClose';
import { etDateOf, shownRegularSessionDate } from '@/lib/marketCalendar';
import { calculateWhaleIndex } from '@/services/alphaEngine';
import { levelsForExit, applyLevelsToRealtime } from '@/services/structureService';
import { oiPcrAllExpiries, gexFromRow } from '@/lib/app/intelOptionsBasis';

/** null·undefined·빈문자를 먼저 거른다. `Number(null)===0` 함정 방지. */
function numOk(v: any): boolean {
    return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

// Sector ticker maps
const SECTOR_TICKERS: Record<string, string[]> = {
    m7: ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'],
    physical_ai: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'],
    silicon_core: ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'],
    power_matrix: ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'],
    bio_pulse: ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'],
    cyber_shield: ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'],
    orbit_defense: ['LMT', 'RTX', 'AXON', 'SPCX', 'LDOS', 'ASTS', 'LUNR'],
    quantum_edge: ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'],
    fintech_pulse: ['XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST'],
    cloud_fortress: ['CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS'],
};

// Redis key matching /api/live/ticker format
// ⚠️ 응답 모양이 바뀌면 **반드시 이 버전을 올린다.** 안 올리면 옛 페이로드가
//    그대로 나가서 새 필드가 «조용히» 빠진다(2026-08-30 에 두 번 겪었다).
//    v2 = 다크풀(FINRA) 필드 추가 2026-08-31
function tickerCacheKey(ticker: string): string {
    return `flow:ticker:v2:${ticker}`;
}

export const revalidate = 15; // 15-second edge cache

// ============================================================================
// ★ [2026-10-07 앱 성능] 응답 단위 «마지막 정상값 즉시 + 뒤에서 갱신».
//
//   실측(운영·폰 UA): 인텔 첫 KPI(강세·약세 섹터·커버리지·평균 변동)가 3~20초 «—» 로 남았다.
//   KPI 는 섹터 10곳의 이 API 가 «전부» 돌아와야 계산되는데, 요청마다 전체를 새로 계산했다
//   (Polygon 스냅샷 + 분석 캐시 + 유동성 + 차가운 종목 데우기 + 다크풀 2MB + DynamoDB 14건 …) → 섹터당 0.7~4.5초 × 10 동시.
//   응답 캐시가 없었다(revalidate 15 는 Request 를 읽는 핸들러라 CDN 이 안 쓴다 — x-vercel-cache: MISS 실측).
//
//   지금: 계산 결과 전체를 Redis(EC2 전용 키)에 «세션 칸» 이름표와 함께 12시간 둔다.
//     · 같은 칸(ET 날짜 + 프리/정규/애프터/야간 — 시각만으로 정한다, 벤더 호출 없음)이고
//       신선(장중 20초 · 장외 5분) 안이면 그대로, 식었어도 허용 나이(장중 10분 · 장외 12시간) 안이면
//       «정상본을 즉시 주고 갱신은 응답 뒤(after)». 칸이 바뀌었거나 너무 낡았으면 예전처럼 요청 안에서 계산한다.
//     · 응답 meta 에 cache(hit|stale|miss)·cacheAgeSec·serverMs 를 싣는다 — 낡은 값을 숨기지 않는다.
//     · 크론(cron/app-warm)이 ?refresh=1 로 5~20분마다 미리 굽는다. 계산식·응답 모양은 한 줄도 바꾸지 않았다.
// ============================================================================
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector');
    if (!sector || !SECTOR_TICKERS[sector]) return computeSector(request);   // 400 응답은 예전 그대로

    const t0 = Date.now();
    // ★ [2026-10-07 앱 강화 정확성 2차] ?app=1 = 앱 전용 응답 — GEX·P/C 를 수집 Lambda DynamoDB 최신 행(35일 이내 전 만기) «한 곳»에서만 읽고
    //   행 시각(optionsAsOf)을 싣는다. 별도 저장 키·허용 나이 30분(intelFastCache). 웹 SSR·옛 경로(app 없음)는 한 줄도 바뀌지 않는다.
    const appMode = searchParams.get('app') === '1';
    const key = intelFastKey(sector, appMode);
    const lock = `perf:lock:${key}`;
    const ph = etPhase(t0);

    const refreshStore = async () => {
        const res = await computeSector(request);
        let body: any = null;
        try {
            body = await res.clone().json();
            if (res.ok && body?.success && Array.isArray(body.data) && body.data.length > 0) {
                await setInCache(key, { at: Date.now(), phase: ph.key, body } as IntelFastEnvelope, INTEL_FAST_STORE_TTL_SEC);
            }
        } catch { /* 저장 실패는 응답에 영향 없다 */ }
        return { res, body };
    };

    if (searchParams.get('refresh') !== '1') {
        const env = await getFromCache<IntelFastEnvelope>(key).catch(() => null);
        const { fresh, maxStale } = intelFastWindow(ph.open, appMode);
        const ok = usableEnvelope(env, ph.key, t0, maxStale);
        if (env && ok) {
            const stale = ok.age > fresh;
            if (stale) {
                after(async () => {
                    if (!(await tryBackgroundLock(lock, 60))) return;
                    try { await refreshStore(); }
                    catch (e: any) { console.warn('[intel/fast] 배경 갱신 실패(정상본 유지):', e?.message); }
                    finally { await releaseBackgroundLock(lock); }
                });
            }
            return NextResponse.json({
                ...env.body,
                meta: { ...env.body.meta, cache: stale ? 'stale' : 'hit', cacheAgeSec: ageSec(ok.age), serverMs: Date.now() - t0 },
            });
        }
    }

    const { res, body } = await refreshStore();
    if (res.ok && body?.success) {
        return NextResponse.json({ ...body, meta: { ...body.meta, cache: 'miss', cacheAgeSec: 0, serverMs: Date.now() - t0 } });
    }
    return res;   // 오류 응답은 예전 그대로(상태 코드 포함)
}

async function computeSector(request: Request) {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector');

    if (!sector || !SECTOR_TICKERS[sector]) {
        return NextResponse.json(
            { error: 'Invalid sector', valid: Object.keys(SECTOR_TICKERS) },
            { status: 400 }
        );
    }

    const startTime = Date.now();
    const tickers = SECTOR_TICKERS[sector];
    const appMode = searchParams.get('app') === '1';

    try {
        // ── Phase 1: Parallel fetch — Polygon batch + Redis cache ──
        const [snapshotData, marketStatus, ...interleaved] = await Promise.all([
            // 1. Polygon batch snapshot — single API call for all tickers (~500ms)
            fetchMassive(
                `/v2/snapshot/locale/us/markets/stocks/tickers`,
                { tickers: tickers.join(',') },
                false, undefined, CACHE_POLICY.LIVE
            ).catch(() => null),

            // 2. Market status for session detection
            CentralDataHub.getMarketStatus().catch(() => ({ session: 'closed' })),

            // 3. Redis cached data
            // ★ [2026-09-25] 날짜 없는 flow:extended(24h) 읽기를 뺐다 — «정규장 분봉 PRE»(COST 916.26)와
            //   어제 POST 가 그 통로로 오늘 목록에 앉았다. 시간외 종가는 아래에서 날짜 키로 읽는다.
            ...tickers.map(t => getFromCache<any>(tickerCacheKey(t)).catch(() => null)),
        ]);

        const cachedTickers = tickers.map((_, i) => interleaved[i]);

        // [CACHE WARMER] Also fetch analysis cache as additional data source
        const analysisCache = await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));

        // Build snapshot lookup map
        const snapshotMap: Record<string, any> = {};
        (snapshotData?.tickers || []).forEach((t: any) => {
            snapshotMap[t.ticker] = t;
        });

        // Determine session
        const sRaw = (marketStatus as any)?.session || 'closed';
        const session = sRaw === 'pre' ? 'PRE' :
            sRaw === 'regular' ? 'REG' :
                sRaw === 'post' ? 'POST' : 'CLOSED';

        // [FIX] During PRE session, fetch daily aggregates to calculate real regular session change
        // Polygon snapshot's day.c === prevDay.c during PRE, making direct calculation impossible.
        // Use historicalResults (like live/ticker API does) for accurate regular session change.
        let aggMap: Record<string, { prevClose: number, prevPrevClose: number }> = {};
        if (session === 'PRE') {
            const aggResults = await Promise.all(
                tickers.map(t =>
                    fetchMassive(
                        `/v2/aggs/ticker/${t}/range/1/day/${new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)}/${new Date().toISOString().slice(0, 10)}`,
                        { adjusted: 'true', sort: 'desc', limit: '3' },
                        false, undefined, CACHE_POLICY.LIVE
                    ).catch(() => null)
                )
            );
            aggResults.forEach((agg, i) => {
                const results = agg?.results || [];
                if (results.length >= 2) {
                    aggMap[tickers[i]] = {
                        prevClose: results[0].c || 0,
                        prevPrevClose: results[1].c || 0,
                    };
                }
            });
        }

        // ── 시간외 «종가» (날짜 키) ─────────────────────────────────────
        // 정규장: 오늘 PRE CLOSE · CLOSED: 화면이 보여주는 정규장 날짜의 POST CLOSE.
        // 저장된 값은 즉시 쓰고, 없는 종목은 뒤에서 몇 개만 계산해 둔다 — 목록이 종목 수만큼
        // 벤더(체결 테이프)를 기다리지 않게 한다. 정의는 services/extendedSessionClose.ts.
        const nowMs = Date.now();
        const todayET = etDateOf(nowMs);
        const shownDate = shownRegularSessionDate(nowMs);
        const extCloseMap: Record<string, ExtSessionClose | null | undefined> = {};
        if (session === 'REG' || session === 'CLOSED') {
            const kind = session === 'REG' ? 'pre' : 'post';
            try {
                const { values, warm } = await peekExtendedSessionClosesAndWarm(
                    tickers, kind === 'pre' ? todayET : shownDate, kind, 3,
                );
                tickers.forEach((t, i) => { extCloseMap[t] = values[i]; });
                if (warm) after(() => warm);
            } catch { /* 없으면 시간외 블록을 비운다 — 날짜 없는 값으로 메우지 않는다 */ }
        }
        // ★ [2026-10-05] 정규장 PRE CLOSE 가 아직 없는(확정 09:47 ET 전·계산 전) 종목은 잠정값으로 잇는다 — live/quotes 와 같은 규칙.
        //   기억값은 «확정이 아직 없고 스냅샷도 오늘 프리 체결이 아닌» 종목만 한 번에 읽는다(확정 뒤·«그날 프리 체결 없음»은 안 읽는다).
        const preRecallMap: Record<string, ProvisionalPreStored | null> = {};
        if (session === 'REG') {
            const need = tickers.filter((t) => {
                if (extCloseMap[t] !== undefined) return false;
                const sn: any = snapshotMap[t];
                const lt = Number(sn?.lastTrade?.t) > 0 ? Math.round(Number(sn.lastTrade.t) / 1e6) : 0;
                return !((Number(sn?.lastTrade?.p) || 0) > 0 && isTradeInExtSession(lt, todayET, 'pre'));
            });
            if (need.length > 0) {
                const vals = await recallProvisionalPreCloses(need, todayET);
                need.forEach((t, i) => { preRecallMap[t] = vals[i]; });
            }
        }

        // [HOLIDAY] Reconstruct the last real session for tickers whose snapshot day
        // bar is empty (day.c=0 on a market holiday) — otherwise the CLOSED branch
        // collapses change% to 0 and the POST badge mirrors the regular price.
        let reconMap: Record<string, LastSessionData> = {};
        if (session === 'CLOSED') {
            const holidayTickers = tickers.filter(t => !(snapshotMap[t]?.day?.c));
            if (holidayTickers.length > 0) {
                reconMap = await reconstructLastSession(holidayTickers);
            }
        }

        // ── Phase 2: Build unified quotes ──
        // 유동성은 세션에 따라 실시간/직전정규장이 갈리므로 미리 일괄 조회한다
        const liqMap: Record<string, { liquidityScore: number | null; spreadPct: number | null }> = {};
        try {
            const { sessionAwareLiquidity } = await import('@/services/intrinioClient');
            // ⚠️ [2026-09-04] `sn.bidPrice` / `sn.askPrice` 는 **존재하지 않는 이름**이다.
            //   스냅샷은 호가를 `lastQuote.p`(bid) · `lastQuote.P`(ask) 로 준다
            //   (Massive 스키마 그대로). 그래서 늘 null 이 넘어갔고, 유동성은
            //   EC2 에 적재된 직전 정규장 중앙값으로만 나왔다 — 그게 없는 종목은 «—».
            //   스냅샷이 이미 계산해 실어 보내는 liquidityScore/spreadPct 도 함께 쓴다.
            const liqRes = await Promise.all(tickers.map((t, i) => {
                const sn: any = snapshotMap[t];
                const bid = sn?.lastQuote?.p ?? sn?.bidPrice ?? null;
                const ask = sn?.lastQuote?.P ?? sn?.askPrice ?? null;
                return sessionAwareLiquidity(t, bid > 0 ? bid : null, ask > 0 ? ask : null);
            }));
            tickers.forEach((t, i) => {
                const sn: any = snapshotMap[t];
                const r: any = liqRes[i] || {};
                // 세션 인지 계산이 비면 스냅샷이 직접 실어 보낸 값으로 메운다.
                liqMap[t] = {
                    // ⚠️ `Number(null)===0` 이라 null 이 0 으로 통과한다 — 유동성 «0점»은 주장이다.
                    liquidityScore: r.liquidityScore ?? (numOk(sn?.liquidityScore) ? Number(sn.liquidityScore) : null),
                    spreadPct: r.spreadPct ?? (numOk(sn?.spreadPct) ? Number(sn.spreadPct) : null),
                };
            });
        } catch (e: any) {
            console.warn('[intel/fast] liquidity lookup failed:', e?.message);
        }

        // ══════════════════════════════════════════════════════════════
        // ★★ AWS 저장소 폴백  [2026-09-04]
        //
        //   대표 지적: 「섹터 인텔에 자료가 왜 이렇게 많이 비어 있어?」
        //   실측(10섹터 70종목): **24종목이 옵션 지표 전부 null**
        //   (pcr·gex·callWall·putFloor·maxPain). 화면엔 «—» 만 줄줄이 떴다.
        //
        //   원인은 여기가 analysisCache(2분 크론) → live/ticker 캐시 두 갈래만
        //   보고, 둘 다 비면 포기했기 때문이다. 그런데 **같은 값이 DynamoDB
        //   (GEX_HISTORY)에 이미 있다** — flow-harvest Lambda 가 넣어 둔다.
        //   커맨드 화면은 그 폴백을 붙여 100% 가 됐다. 인텔에도 같이 붙인다.
        //
        //   ⚠️ 없는 종목까지 조회해 낭비하지 않도록, **정말 빈 종목만** 묻는다.
        // ══════════════════════════════════════════════════════════════
        let warmDiag: any = { cold: 0, tried: 0, warmed: 0 };
        // ══════════════════════════════════════════════════════════════
        // ★★ [2026-09-04] «영영 차가운 종목»을 스스로 데운다.
        //
        //   LLY·CCJ·GEV·PATH 의 RSI 가 계속 «—» 였다. 값이 없어서가 아니다 —
        //   /api/live/ticker 는 그 순간 41.2 · 47.8 · 27.8 · 62.5 를 주고 있었다.
        //   문제는 그 값이 «Redis 에 있을 때만» 여기로 온다는 것이다(60초 TTL).
        //   그런데 인텔은 live/ticker 를 부르지 않으므로 그 키가 **채워질 일이 없다.**
        //   커맨드 화면에서 직접 눌러 본 종목만 우연히 따뜻해진다 — 그래서
        //   「어떤 종목은 나오고 어떤 종목은 안 나온다」가 됐다.
        //
        //   → 정말 비어 있는 종목만 골라 라우트 핸들러를 **직접** 부른다(HTTP 왕복 없음).
        //     그 김에 Redis 키도 채워지므로 다음 회전부터는 이 경로를 안 탄다(자가치유).
        //     한 번에 최대 8종목 — 벤더 예산을 이 화면이 독점하지 않게.
        // ══════════════════════════════════════════════════════════════
        try {
            const coldIdx: number[] = [];
            tickers.forEach((t, i) => {
                const a: any = analysisCache[t];
                const c: any = cachedTickers[i];
                // «차갑다»의 기준은 한 필드가 아니다 — 화면이 읽는 축 중 하나라도 비면 데운다.
                //   (처음엔 RSI 만 봤는데, RSI 는 있고 넷프리미엄만 빈 종목이 10개 남았다)
                //
                // ⚠️⚠️ `Number.isFinite(Number(x))` 로 판정하면 **null 이 통과한다** —
                //   `Number(null) === 0` 이고 0 은 유한수다. 그래서 netPremium 이 null 인
                //   TEAM·PYPL·AXON 이 「값 있음」으로 판정돼 데우기에서 빠졌다
                //   (cold=0 인데 화면엔 «—» — 진단을 안 실었으면 또 못 찾았다).
                //   아래 pick() 은 null 을 먼저 걸러서 옳게 동작했다. **판정도 같아야 한다.**
                const has = (...xs: any[]) => xs.some((x) => x !== null && x !== undefined && Number.isFinite(Number(x)));
                const hasRsi = has(a?.rsi, c?.display?.rsi14);
                const hasPrem = has(a?.netPremium, c?.flow?.netPremium);
                const hasSkew = has(a?.ivSkew, c?.flow?.ivSkew);
                if (!hasRsi || !hasPrem || !hasSkew) coldIdx.push(i);
            });
            if (coldIdx.length > 0) {
                const take = coldIdx.slice(0, 12);
                const got = await Promise.all(take.map(async (i) => {
                    try {
                        const url = `https://www.signumhq.com/api/live/ticker?t=${tickers[i]}&chain=0&skip_alpha=1`;
                        const res: any = await Promise.race([
                            getLiveTicker(new NextRequest(url) as any),
                            new Promise<null>((r) => setTimeout(() => r(null), 6000)),
                        ]);
                        return res && typeof res.json === 'function' ? await res.json() : null;
                    } catch { return null; }
                }));
                take.forEach((i, gi) => { if (got[gi]) cachedTickers[i] = { ...(cachedTickers[i] || {}), ...got[gi] }; });
                const warmed = got.filter(Boolean).length;
                if (warmed) console.log(`[intel/fast] 차가운 종목 데우기 ${warmed}/${take.length}`);
                warmDiag = {
                    cold: coldIdx.length, tried: take.length, warmed,
                    sample: take.map((i) => tickers[i]).slice(0, 8),
                    premAfter: take.map((i) => `${tickers[i]}:${(cachedTickers[i] as any)?.flow?.netPremium ?? 'null'}`).slice(0, 5),
                };
            }
        } catch (e: any) {
            console.warn('[intel/fast] 차가운 종목 데우기 실패:', e?.message);
        }

        // 다크풀(FINRA 규제 원본) — 인텔 페이로드엔 아예 키가 없어서 화면이 늘 «—» 였다.
        let dpMap: Record<string, any> = {};
        try {
            const { getDarkPoolBatch } = await import('@/services/darkPool');
            dpMap = await getDarkPoolBatch(tickers);
        } catch (e: any) {
            console.warn('[intel/fast] 다크풀(FINRA) 조회 실패:', e?.message);
        }

        const gexFallback: Record<string, any> = {};
        // 진단 — 「폴백이 왜 안 걸리나」를 응답에서 바로 볼 수 있게. 추측 대신 실측.
        let gexDiag: any = { need: 0, filled: 0, sample: [] as string[], err: null as string | null };
        try {
            // ★★ [2026-09-04] 처음엔 «종목 단위»로 걸렀다 — 「값이 하나라도 있으면 제외」.
            //   그런데 실제 결손은 **필드 단위**다. MSFT 는 gex 는 있는데 pcr·예상변동폭이
            //   비고, 그 종목이 「값이 있다」는 이유로 폴백에서 통째로 빠졌다
            //   (DynamoDB 엔 4분 전 값이 gex·pcr·im·maxPain 전부 있는데도 화면은 null).
            //   queryItems 를 고친 뒤 조회가 **20ms 수준**이라 아낄 이유가 없다.
            //   → 전 종목을 읽고, 아래에서 **비어 있는 필드만** 채운다.
            const needGex = tickers;
            if (needGex.length > 0) {
                const gexT0 = Date.now();
                const { getLatestGex } = await import('@/lib/aws/dynamoDataProvider');
                gexDiag.importMs = Date.now() - gexT0;
                // ⚠️ 처음엔 2.5초로 잡았다가 **전부 null** 이 돌아왔다(need=5 filled=0 err=없음).
                //   AWS SDK 콜드 로딩 + 동시 조회가 그 안에 안 끝난다. 넉넉히 준다 —
                //   여기서 못 채우면 화면에 «—» 가 남으므로 몇 백 ms 를 아낄 이유가 없다.
                // GEX 레코드엔 netPremium 이 없다 — 프리미엄 계열은 flow-history 에 산다.
                // 둘을 같이 읽어 합친다(둘 다 같은 하베스터가 채운다).
                const { getLatestFlow } = await import('@/lib/aws/dynamoDataProvider');
                const got = await Promise.all(
                    needGex.map(async (t) => {
                        const [gx, fl] = await Promise.all([
                            Promise.race([
                                getLatestGex(t).catch((e: any) => { gexDiag.err = String(e?.message || e).slice(0, 80); return null; }),
                                new Promise<null>((r) => setTimeout(() => r(null), 8000)),
                            ]),
                            Promise.race([
                                getLatestFlow(t).catch(() => null),
                                new Promise<null>((r) => setTimeout(() => r(null), 8000)),
                            ]),
                        ]);
                        if (!gx && !fl) return null;
                        return { ...(fl || {}), ...(gx || {}) } as any;
                    })
                );
                gexDiag.ms = Date.now() - gexT0;
                needGex.forEach((t, gi) => { if (got[gi]) gexFallback[t] = got[gi]; });
                const filled = Object.keys(gexFallback).length;
                if (filled) console.log(`[intel/fast] DynamoDB GEX 폴백 ${filled}/${needGex.length}종목`);
                gexDiag = { ...gexDiag, need: needGex.length, filled, sample: needGex.slice(0, 6) };  // ⚠️ 통째로 덮으면 err 가 지워진다
            }
        } catch (e: any) {
            console.warn('[intel/fast] DynamoDB GEX 폴백 실패:', e?.message);
            gexDiag.err = String(e?.message || e).slice(0, 120);
        }

        const quotes = tickers.map((ticker, i) => {
            const snap = snapshotMap[ticker];
            const cached = cachedTickers[i];

            // ── 다크풀 대체 지표 (세션 인지) ────────────────────────
            // 유동성은 **정규장 지표**다. 휴장 중 호가는 벌어져 있어서
            // 그대로 재면 전 종목이 나쁘게 나온다(GOOGL 2.0% → 0점 실측).
            // 정규장이면 실시간 호가, 아니면 EC2 가 적재한 직전 정규장
            // 분봉 중앙값을 쓴다. 둘 다 없으면 null.
            const liq = liqMap[ticker] || { liquidityScore: null, spreadPct: null };
            const spreadPct: number | null = liq.spreadPct;
            const liquidityScore: number | null = liq.liquidityScore;

            // --- Price data from Polygon snapshot ---
            const prevClose = snap?.prevDay?.c || 0;
            const todayClose = snap?.day?.c || prevClose;
            const latestPrice = snap?.lastTrade?.p || snap?.min?.c || todayClose || prevClose;
            const todaysChangePerc = snap?.todaysChangePerc || 0;
            const volume = snap?.day?.v || 0;

            // Session-aware pricing
            let displayPrice = latestPrice;
            let displayChangePct = todaysChangePerc;

            if (session === 'POST' || session === 'CLOSED') {
                const regularClose = todayClose;
                if (regularClose > 0 && prevClose > 0) {
                    displayPrice = regularClose;
                    displayChangePct = ((regularClose - prevClose) / prevClose) * 100;
                }
            }

            if (session === 'PRE') {
                // ⚠️ [2026-09-25] 프리마켓의 «본장»은 마지막 정규장(= 스냅샷 day.c)이다. prevDay.c 는 그
                //   하나 앞이라 한 세션 밀린다 — live/ticker·live/quotes 는 8/31 에 고쳤고 여기만 남아 있었다.
                displayPrice = todayClose || prevClose;
                // [FIX] Use daily aggregates for accurate regular session change
                // Priority: 1) daily aggs, 2) snapshot day.c diff, 3) cached prevChangePct, 4) 0
                const agg = aggMap[ticker];
                if (agg && agg.prevClose > 0 && agg.prevPrevClose > 0) {
                    // Use historical aggregates: yesterday's close vs day-before-yesterday's close
                    displayChangePct = ((agg.prevClose - agg.prevPrevClose) / agg.prevPrevClose) * 100;
                // [FIX 2026-07-31] `todayClose !== prevClose` 제거 — 보합(0.00%)은 결측이 아니다.
                // 그 조건이 거짓이 되면 아래 `cached.prices.prevChangePct`(= **어제의 등락률**)로
                // 떨어져 화면에 전날 숫자가 남았다. 실측 SOXL 7/31: 114.72 → 114.72(0.00%)인데
                // 7/30의 +24.71%가 표시됨.
                } else if (todayClose > 0 && prevClose > 0) {
                    displayChangePct = ((todayClose - prevClose) / prevClose) * 100;
                } else if (cached?.prices?.prevChangePct) {
                    displayChangePct = cached.prices.prevChangePct;
                } else {
                    displayChangePct = 0;
                }
            }

            // Extended hours — ★ [2026-09-25] «세션·날짜·체결 시각»으로 고른다(live/ticker·live/quotes 와 같은 규칙).
            //   예전: PRE·POST = 시각을 안 본 마지막 체결(지연 피드라 04:0x 엔 어제 애프터, 16:0x 엔 정규장 체결),
            //         REG = 날짜 없는 flow:extended(«정규장 분봉 PRE»가 앉아 있었다) → 종목별 분봉 조회.
            //   등락률은 두 가격으로 직접 계산한다(캐시된 등락률로 덮지 않는다).
            let extendedPrice = 0;
            let extendedChangePct = 0;
            let extendedLabel = '';
            const lastTradeMs = Number(snap?.lastTrade?.t) > 0 ? Math.round(Number(snap.lastTrade.t) / 1e6) : 0;
            const lastP = Number(snap?.lastTrade?.p) || 0;

            if (session === 'PRE') {
                // 기준 = 마지막 정규장 종가(프리마켓의 day.c) — prevDay.c 는 한 세션 앞이다
                const preBase = todayClose || prevClose;
                if (lastP > 0 && isTradeInExtSession(lastTradeMs, todayET, 'pre')) {
                    extendedPrice = lastP;
                    extendedLabel = 'PRE';
                    if (preBase > 0) extendedChangePct = ((lastP - preBase) / preBase) * 100;
                }
            } else if (session === 'POST') {
                if (lastP > 0 && displayPrice > 0 && isTradeInExtSession(lastTradeMs, todayET, 'post')) {
                    extendedPrice = lastP;
                    extendedLabel = 'POST';
                    extendedChangePct = ((lastP - displayPrice) / displayPrice) * 100;
                }
            } else if (session === 'CLOSED') {
                // 화면 날짜의 애프터 종가(마지막 Form T) → 확정 전·계산 전이면 그날 애프터 체결
                const pc = extCloseMap[ticker];
                const postExt = (pc && pc.price > 0) ? pc.price
                    : ((lastP > 0 && isTradeInExtSession(lastTradeMs, shownDate, 'post')) ? lastP : 0);
                if (postExt > 0 && displayPrice > 0) {
                    extendedPrice = postExt;
                    extendedLabel = 'POST';
                    extendedChangePct = ((postExt - displayPrice) / displayPrice) * 100;
                }
            } else if (session === 'REG') {
                // 오늘 프리마켓 종가 — 확정(09:47 ET~) > 잠정(지연 피드의 오늘 프리 체결 · 기억해 둔 값). 기준 = 전일 종가
                // ★ [2026-10-05] 예전엔 확정 전이면 비워 개장 직후 17분+ 동안 PRE CLOSE 배지가 사라졌다(대표 10/5 09:32 ET 캡처와 같은 원인)
                const snapPre = lastP > 0 && isTradeInExtSession(lastTradeMs, todayET, 'pre');
                const pc = pickRegularPreClose({
                    today: todayET,
                    final: extCloseMap[ticker],
                    snapPrice: snapPre ? lastP : 0,
                    snapTradeMs: lastTradeMs,
                    recalled: preRecallMap[ticker] ?? null,
                });
                if (pc) {
                    extendedPrice = pc.price;
                    extendedLabel = 'PRE';
                    extendedChangePct = prevClose > 0 ? ((pc.price - prevClose) / prevClose) * 100 : 0;
                    if (pc.source === 'snapshot') rememberProvisionalPreClose(ticker, todayET, pc.price, lastTradeMs);
                }
            }

            // [HOLIDAY] Empty day bar → override with the reconstructed last trading
            // session so we show that session's close + change% + after-hours (POST),
            // instead of 0.00% and a POST badge that mirrors the regular price.
            const recon = (session === 'CLOSED' && !(snap?.day?.c)) ? reconMap[ticker] : undefined;
            if (recon) {
                displayPrice = recon.regClose;
                displayChangePct = recon.changePct;
                if (recon.postPrice > 0) {
                    extendedPrice = recon.postPrice;
                    extendedLabel = 'POST';
                    extendedChangePct = recon.postChangePct;
                } else {
                    extendedPrice = 0;
                    extendedLabel = '';
                    extendedChangePct = 0;
                }
            }

            // --- Options/Alpha data from Redis cache (instant if available) ---
            // [CACHE WARMER] Try analysis cache first, then fall back to flow:ticker cache
            const analysis = analysisCache[ticker];
            let alphaScore = 0;
            let grade = '-';
            // ★ [2026-08-30] 기본값을 0/1 에서 **null** 로 바꿨다.
            //   옵션 지표가 없는 종목이 화면에 «GEX 0.00 · PCR 1.00» 으로 떴다.
            //   0 은 «감마 노출이 0» 이라는 주장이고 1.00 은 «풋콜 균형»이라는
            //   주장이다 — 둘 다 재지 않았을 뿐이다.
            //   같은 카드 안에서 CALL WALL 은 «—» 인데 GEX 만 «0.00» 이라
            //   일관성도 없었다(대표 지적: TSM 은 안 나오고 AVGO 는 나온다).
            //   null 로 두면 화면이 전부 «—» 로 그린다.
            let maxPain: number | null = null;
            let callWall: number | null = null;
            let putFloor: number | null = null;
            let gex: number | null = null;
            let pcr: number | null = null;
            let gammaRegime = 'NEUTRAL';
            let sparkline: number[] = [];
            let netPremium: number | null = null;
            let rsi: number | null = null;
            let rvol: number | null = null;
            let squeezeScore: number | null = null;
            let ivSkew: number | null = null;
            let impliedMove: ImpliedMoveFields = { ...NO_IMPLIED_MOVE };

            // ══════════════════════════════════════════════════════════════
            // ★★ [2026-09-04] 여기가 «같은 실수를 세 번» 하게 만든 구조였다.
            //
            //   원래는 `if (analysis) { …전부… } else if (cached) { …전부… }` —
            //   **종목 단위 배타 분기**다. analysis 가 «존재하되 일부만 채워진»
            //   흔한 경우에 cached 를 **아예 보지 않는다.**
            //   실측: LLY·CCJ·GEV·PATH 의 rsi 가 «—» 였는데,
            //   /api/live/ticker 는 그 순간 41.2 · 47.8 · 27.8 · 62.5 를 주고 있었다.
            //   게다가 cached 분기는 `cached.realtime?.rsi` 를 읽는데 실제 모양은
            //   `display.rsi14` 다 — **읽어도 못 찾는 경로**였다.
            //
            //   → 분기를 없애고 **필드마다** analysis → cached → AWS 순으로 내려간다.
            //     한 층이 비어도 다음 층이 채운다. 새 필드를 넣을 때도 한 줄이면 된다.
            // ══════════════════════════════════════════════════════════════
            const cAlphaSnap = cached?.alpha ? xsSnapshotOverride(ticker, cached.alpha) : null;
            /** 첫 번째로 «실제 값»인 것을 고른다. null·undefined·NaN 은 건너뛴다. */
            const pick = (...xs: any[]): number | null => {
                for (const x of xs) {
                    if (x === null || x === undefined) continue;
                    const n = Number(x);
                    if (Number.isFinite(n)) return n;
                }
                return null;
            };

            alphaScore = pick(analysis?.alphaSnapshot?.score, cAlphaSnap?.score) ?? 0;
            grade = analysis?.alphaSnapshot?.grade || cAlphaSnap?.grade || '-';
            maxPain = pick(analysis?.maxPain, cached?.flow?.maxPain);
            callWall = pick(analysis?.callWall, cached?.flow?.callWall);
            putFloor = pick(analysis?.putFloor, cached?.flow?.putFloor);
            gex = pick(analysis?.gex, cached?.flow?.netGex);
            // ★ [2026-10-07] PCR 칸 = 풋÷콜, «미결제약정» 기준 하나(analysis.pcr = structureService.pcr = Σ풋OI/Σ콜OI · live/ticker oiPcr · 아래 DynamoDB gex.pcr).
            //   예전엔 세 번째 폴백이 `cached.flow.volumePcr` 였다 — 이름과 달리 «콜÷풋(거래량)» 이라 OI 기준 풋÷콜 칸에 방향·기준이 둘 다 다른 값이 들어갔다
            //   (콜 441K·풋 272K 인 NVDA 라면 P/C 0.62 인데 1.62 가 PCR 로 떠 «풋 우위(빨강)»로 읽힌다). 기준이 다른 값은 섞지 않는다 — 없으면 «—»(null).
            pcr = pick(analysis?.pcr, cached?.flow?.oiPcr);
            netPremium = pick(analysis?.netPremium, cached?.flow?.netPremium);
            // ⚠️ live/ticker 의 RSI 는 `display.rsi14` 다. `realtime.rsi` 는 없는 경로였다.
            rsi = pick(analysis?.rsi, cached?.display?.rsi14, cached?.technical?.rsi14);
            rvol = pick(analysis?.relVol, cached?.realtime?.relVol);
            squeezeScore = pick(analysis?.squeezeScore, cached?.flow?.squeezeScore);
            const skewRaw = pick(analysis?.ivSkew, cached?.flow?.ivSkew);
            ivSkew = (skewRaw != null && skewRaw <= 2.0) ? skewRaw : null;
            // ★ [2026-09-29] 예상 변동은 «정의 표식이 있는» ATM 스트래들 값만(src/lib/impliedMove.ts).
            //   예전엔 분석 캐시의 «벽 사이 폭»(콜월 − 풋플로어)이나 아래 AWS 이력(수집 Lambda 의 전일 종가 스트래들)을
            //   같은 칸에 «±x%»로 냈다. `cached?.flow?.impliedMove` 는 live/ticker 가 한 번도 싣지 않은 경로였다.
            impliedMove = readImpliedMoveFields(analysis);
            sparkline = (analysis?.sparkline?.length ? analysis.sparkline : cached?.flow?.sparkline) || [];
            // 못 잰 것은 «중립»이 아니라 «알 수 없음»이다
            if (gex != null && gex > 0) gammaRegime = 'LONG';
            else if (gex != null && gex < 0) gammaRegime = 'SHORT';
            else if (gex == null) gammaRegime = 'UNKNOWN';


            // ★ 두 갈래가 다 비었으면 AWS 저장소에서 메운다. «—» 보다 낫다.
            const gxf = gexFallback[ticker];
            if (gxf) {
                if (maxPain == null && gxf.maxPain != null) maxPain = gxf.maxPain;
                if (callWall == null && gxf.callWall != null) callWall = gxf.callWall;
                if (putFloor == null && gxf.putFloor != null) putFloor = gxf.putFloor;
                if (gex == null && gxf.gex != null) gex = gxf.gex;
                if (pcr == null && gxf.pcr != null) pcr = gxf.pcr;
                if (squeezeScore == null && gxf.squeezeScore != null) squeezeScore = gxf.squeezeScore;
                if (ivSkew == null && gxf.ivSkew != null && gxf.ivSkew <= 2.0) ivSkew = gxf.ivSkew;
                if (netPremium == null && gxf.netPremium != null) netPremium = gxf.netPremium;
                // ⛔ 예상 변동은 여기서 채우지 않는다 — GEX 이력 행의 impliedMovePct 는 수집 Lambda 가 «다리마다 따로 고른
                //   최근접 행사가의 전일 종가 합»으로 쓴 값이다(9/28 MU 9.0 vs ATM 중간값 7.9). 정의가 다르면 비워 둔다.
                if (gex != null) gammaRegime = gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : gammaRegime;
            }

            // ★★ [2026-10-07 앱 강화 정확성 2차] 앱 전용 응답: GEX·P/C·감마 구도는 «수집 Lambda DynamoDB 최신 행 한 곳»에서만 읽는다(35일 이내 전 만기 합계).
            //   위 층 순서(분석 캐시 → live/ticker → DynamoDB)는 «어느 캐시가 지금 살아 있느냐»가 값의 만기 범위를 정했다 — 분석 캐시(주간 만기 1개)가
            //   ET 자정에 «다른 거래일»로 만료되면 같은 섹터가 DynamoDB(35일)로 바뀌어 한국 13시에 7종목 GEX 부호가 통째로 뒤집혔다(10/7 physical_ai).
            //   행이 없는 종목은 null(«—») — 다른 만기 범위의 값으로 메우지 않는다. 행 시각을 싣는다(화면이 «10/6 마감 기준»을 말한다).
            let optionsAsOf: number | null = null;
            if (appMode) {
                const row = gexFallback[ticker];
                gex = gexFromRow(row);
                pcr = oiPcrAllExpiries(row);
                gammaRegime = gex == null ? 'UNKNOWN' : gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : 'NEUTRAL';
                const ts = Number(row?.timestamp);
                optionsAsOf = Number.isFinite(ts) && ts > 0 ? ts : null;
            }

            return {
                ticker,
                price: displayPrice,
                changePct: displayChangePct,
                prevClose,
                volume,
                extendedPrice,
                extendedChangePct,
                extendedLabel,
                session,
                alphaScore,
                grade,
                maxPain,
                callWall,
                putFloor,
                gex,
                pcr,
                gammaRegime,
                sparkline,
                netPremium,
                rsi,
                rvol,
                squeezeScore,
                // [2026-08-29] whaleIndex 추가.
                // 섹터 카드의 WHALE 배지가 이 필드를 못 받아 0 이 되었고,
                // 그동안 화면이 «감마 펄스에서 합성한 가짜 값»으로 그 공백을
                // 메우고 있었다. 합성값을 걷어내면서 진짜 값을 채운다.
                // (다크풀은 여전히 null — 그건 측정 자체가 불가하다)
                whaleIndex: calculateWhaleIndex(gex, null, null, netPremium),
                // 다크풀 대체 — 호가 스프레드 기반 유동성 점수(0~100)
                liquidityScore: liquidityScore,
                spreadPct: spreadPct,
                // ★ 다크풀 본체 — FINRA 규제 원본(T+1). 라이선스상 출처 표기 필수.
                darkPoolPct: dpMap[ticker]?.pct ?? null,
                darkPoolVol: dpMap[ticker]?.volume ?? null,
                darkPoolDate: dpMap[ticker]?.date ?? null,
                darkPoolSource: dpMap[ticker] ? 'FINRA' : null,
                ivSkew,
                ...impliedMove,
                ...(appMode ? { optionsAsOf, pcrBasis: 'oi_all_expiries_35d', gexBasis: 'dynamo_latest_row' } : {}),
            };
        });

        // ★★ [2026-09-25] 옵션 레벨은 나가기 직전에 «구조 한 벌»로 덮는다(structureService.peekStructureLevels).
        //   위에서는 분석 캐시 → 티커 캐시 → DynamoDB 이력 순으로 필드마다 따로 골랐다 — 한 카드 안에서
        //   맥스페인과 벽이 서로 다른 계산·만기에서 올 수 있었다. 저장본만 한 번에 읽는다.
        // ★★ [2026-09-29] 없으면 «원래 값»이 아니라 null(위 DynamoDB 이력 = 수집 Lambda 의 다른 정의) + 정의 게이트
        //   + 저장본 없는 종목은 응답 뒤 계산 — watchlist/batch 와 같은 applyLevelsToRealtime 한 함수.
        let lvMap: Map<string, any> = new Map();
        try {
            lvMap = await levelsForExit(quotes.map((q: any) => q.ticker));
        } catch (e: any) {
            console.warn('[/api/intel/fast] 옵션 레벨 저장본 읽기 실패(레벨 비움):', e?.message);
        }
        quotes.forEach((q: any) => applyLevelsToRealtime(q, lvMap.get(String(q.ticker || '').toUpperCase()), 'intel/fast'));

        // Sort by changePct descending
        quotes.sort((a, b) => b.changePct - a.changePct);

        const elapsed = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            data: quotes,
            meta: {
                tickers,
                count: quotes.length,
                elapsedMs: elapsed,
                cachedFor: '15s',
                gexFallback: gexDiag,
                warm: warmDiag,
                dataSource: 'polygon_batch+redis',
                cacheHits: cachedTickers.filter(Boolean).length,
                cacheMisses: cachedTickers.filter(c => !c).length,
                ...(appMode ? {
                    app: true,
                    optionsAsOf: quotes.reduce((m: number | null, q: any) => (typeof q.optionsAsOf === 'number' && (m == null || q.optionsAsOf > m) ? q.optionsAsOf : m), null),
                    computedAt: Date.now(),
                } : {}),
            }
        });

    } catch (error: any) {
        console.error('[/api/intel/fast] Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch sector data',
            data: []
        }, { status: 500 });
    }
}
