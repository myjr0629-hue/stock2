// Intel Shared Data Hook - Centralized data fetching for all sector reports
// [PERF v2] Two-Phase Loading: fast API (prices ~1s) → full API (options/alpha ~15s)
// Phase 1: Polygon batch snapshot → instant price display
// Phase 2: Full watchlist/batch → complete data with options
// [FIXED] Keeps existing data during refresh, no page reset
'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { computeOnePipe, type MarketSession } from '@/hooks/useOnePipe';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { Capacitor } from '@capacitor/core';
import { configTickersMissingFrom, rebucketBySectorLists } from '@/lib/app/intelSectorLists';

// Ticker lists
const M7_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];
const PHYSICAL_AI_TICKERS = ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'];
const SILICON_CORE_TICKERS = ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'];
const POWER_MATRIX_TICKERS = ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'];
const BIO_PULSE_TICKERS = ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'];
const CYBER_SHIELD_TICKERS = ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'];
const ORBIT_DEFENSE_TICKERS = ['LMT', 'RTX', 'AXON', 'SPCX', 'LDOS', 'ASTS', 'LUNR'];
const QUANTUM_EDGE_TICKERS = ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'];
const FINTECH_PULSE_TICKERS = ['XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST'];
const CLOUD_FORTRESS_TICKERS = ['CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS'];

const ALL_INTEL_TICKERS = [
    ...M7_TICKERS, ...PHYSICAL_AI_TICKERS, ...SILICON_CORE_TICKERS, ...POWER_MATRIX_TICKERS,
    ...BIO_PULSE_TICKERS, ...CYBER_SHIELD_TICKERS, ...ORBIT_DEFENSE_TICKERS, ...QUANTUM_EDGE_TICKERS,
    ...FINTECH_PULSE_TICKERS, ...CLOUD_FORTRESS_TICKERS,
];

// Normalize a raw session string to the MarketSession union computeOnePipe expects.
// computeOnePipe's switch has no default price branch, so an unrecognized session would
// yield price=0 — always normalize before calling it.
function normalizeSession(s: string | undefined): MarketSession {
    if (!s) return 'CLOSED';
    const u = s.toUpperCase();
    if (u === 'PRE' || u === 'PRE_MARKET' || u === 'PREMARKET') return 'PRE';
    if (u === 'REG' || u === 'REGULAR' || u === 'OPEN') return 'REG';
    if (u === 'POST' || u === 'POST_MARKET' || u === 'POSTMARKET') return 'POST';
    return 'CLOSED';
}

// Types for shared data
export interface IntelQuote {
    ticker: string;
    price: number;
    changePct: number;
    prevClose: number;
    volume: number;
    extendedPrice: number;
    extendedChangePct: number;
    extendedLabel: string;
    session: string;
    alphaScore: number;
    grade: string;
    maxPain: number;
    callWall: number;
    putFloor: number;
    gex: number;
    pcr: number;
    gammaRegime: string;
    sparkline: number[];
    netPremium: number;
    rsi: number;
    rvol: number;
    squeezeScore: number;
    ivSkew: number;
    impliedMovePct: number;
    /** [10/4] 예상 변동의 기준·세션 — eod 면 «10/2 종가» 꼬리표(impliedMoveSessionNote) */
    impliedMoveBasis?: 'live' | 'eod' | null;
    impliedMoveSession?: string | null;
    impliedMoveAsOf?: number | null;
    whaleIndex: number;
    darkPoolPct: number;
    /** [앱 전용 응답] GEX·P/C 를 읽은 DynamoDB 행의 시각(ms) — «10/6 마감 기준» 표기의 근거. 앱 응답이 아니면 없다 */
    optionsAsOf?: number | null;
    /** [앱 전용 응답] pcr 의 기준 — 'oi_all_expiries_35d'(미결제약정, 35일 이내 전 만기 합계) */
    pcrBasis?: string | null;
    priceFlash?: 'up' | 'down' | null; // flash animation direction
    regularCloseToday?: number | null;  // [ONE-PIPE] 정규장 종가 잠금용
}

export interface IntelSharedData {
    m7: IntelQuote[];
    physicalAI: IntelQuote[];
    siliconCore: IntelQuote[];
    powerMatrix: IntelQuote[];
    bioPulse: IntelQuote[];
    cyberShield: IntelQuote[];
    orbitDefense: IntelQuote[];
    quantumEdge: IntelQuote[];
    fintechPulse: IntelQuote[];
    cloudFortress: IntelQuote[];
    loading: boolean;
    refreshing: boolean;
    optionsLoading: boolean;
    fetchedAt: string | null;
}

interface IntelSharedDataRuntimeOptions {
    /**
     * 앱 Intel 전용(2026-10-07 앱 강화 정확성 2차): ① 섹터 응답을 앱 전용 저장본(?app=1)에서 받는다 — GEX·P/C 는 DynamoDB 최신 행 한 곳(35일 이내 전 만기)
     * ② 뒤에 오는 watchlist/batch 가 GEX·P/C·감마 구도를 덮어쓰지 않는다(배치 값은 만기 범위가 다르다 — 알파 점수 입력용) ③ 배치만 먼저 온 종목에
     * 알파 점수 50·등급 B 를 채우지 않는다(못 쟀으면 0·''). 웹(옵션 없음)은 예전 그대로.
     */
    appBasis?: boolean;
    fullData?: 'all' | 'manual' | 'staggered';
    batchMode?: 'full' | 'price' | 'price-dp' | 'ssr';
    pricePollMs?: number;
    fastPollMs?: number;
    fullPollMs?: number;
}

// Helper: safe JSON fetch
async function safeFetch(url: string): Promise<any> {
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        const text = await res.text();
        if (!text) return null;
        try { return JSON.parse(text); } catch { return null; }
    } catch { return null; }
}

export function useIntelSharedData(
    initialM7Data?: IntelQuote[],
    initialPAIData?: IntelQuote[],
    initialSCData?: IntelQuote[],
    initialPMData?: IntelQuote[],
    initialBPData?: IntelQuote[],
    initialCSData?: IntelQuote[],
    initialODData?: IntelQuote[],
    initialQEData?: IntelQuote[],
    initialFPData?: IntelQuote[],
    initialCFData?: IntelQuote[],
    runtimeOptions?: IntelSharedDataRuntimeOptions
): IntelSharedData & { refresh: () => void } {
    const appBasis = runtimeOptions?.appBasis ?? false;
    const fullDataMode = runtimeOptions?.fullData ?? 'all';
    const batchMode = runtimeOptions?.batchMode ?? 'full';
    const shouldAutoFull = fullDataMode !== 'manual';
    const shouldStaggerFull = fullDataMode === 'staggered';
    const pricePollMs = runtimeOptions?.pricePollMs ?? 2000;
    const fastPollMs = runtimeOptions?.fastPollMs ?? 30000;
    const fullPollMs = runtimeOptions?.fullPollMs ?? 120000;

    const [m7Data, setM7Data] = useState<IntelQuote[]>(initialM7Data || []);
    const [physicalAIData, setPhysicalAIData] = useState<IntelQuote[]>(initialPAIData || []);
    const [siliconCoreData, setSiliconCoreData] = useState<IntelQuote[]>(initialSCData || []);
    const [powerMatrixData, setPowerMatrixData] = useState<IntelQuote[]>(initialPMData || []);
    const [bioPulseData, setBioPulseData] = useState<IntelQuote[]>(initialBPData || []);
    const [cyberShieldData, setCyberShieldData] = useState<IntelQuote[]>(initialCSData || []);
    const [orbitDefenseData, setOrbitDefenseData] = useState<IntelQuote[]>(initialODData || []);
    const [quantumEdgeData, setQuantumEdgeData] = useState<IntelQuote[]>(initialQEData || []);
    const [fintechPulseData, setFintechPulseData] = useState<IntelQuote[]>(initialFPData || []);
    const [cloudFortressData, setCloudFortressData] = useState<IntelQuote[]>(initialCFData || []);
    const [loading, setLoading] = useState(!(initialM7Data?.length && initialPAIData?.length));
    const [refreshing, setRefreshing] = useState(false);
    const [optionsLoading, setOptionsLoading] = useState(shouldAutoFull);
    const [fetchedAt, setFetchedAt] = useState<string | null>(null);

    const isFastFetching = useRef(false);
    const isFullFetching = useRef(false);
    const hasFullData = useRef(false);

    // ── Phase 1: Fast API — instant prices (~1-2s) ──
    const fetchFast = useCallback(async () => {
        if (isFastFetching.current) return;
        isFastFetching.current = true;

        try {
            // ★ [2026-10-07 앱 성능] 섹터 10곳을 «한 번에» 받는다(/api/intel/fast-all — 서버가 저장해 둔 섹터 응답을 모아 준다).
            //   예전엔 10곳을 동시에 불러 서버리스 인스턴스 10개가 각자 콜드스타트했다(캐시 적중이어도 요청마다 0.7~1.2초) —
            //   KPI 는 10곳이 전부 와야 계산돼 가장 느린 것에 맞춰졌다. 저장본이 없는 섹터만 예전 경로로 받고,
            //   이 호출이 실패해도 10곳 전부 예전 경로로 받는다(= 예전 동작 그대로 · 안전망).
            const all = await safeFetch(appBasis ? '/api/intel/fast-all?app=1' : '/api/intel/fast-all');
            const got: Record<string, any> = (all && all.success && all.sectors) || {};
            const one = (id: string) => (got[id] && got[id].data?.length > 0 ? Promise.resolve(got[id]) : safeFetch(`/api/intel/fast?sector=${id}${appBasis ? '&app=1' : ''}`));
            const [m7Res, paiRes, scRes, pmRes, bpRes, csRes, odRes, qeRes, fpRes, cfRes] = await Promise.all([
                one('m7'), one('physical_ai'), one('silicon_core'), one('power_matrix'), one('bio_pulse'),
                one('cyber_shield'), one('orbit_defense'), one('quantum_edge'), one('fintech_pulse'), one('cloud_fortress'),
            ]);

            const mergeOrSet = (res: any, setter: React.Dispatch<React.SetStateAction<IntelQuote[]>>) => {
                if (res?.data?.length > 0) {
                    setter(prev => {
                        if (hasFullData.current && prev.length > 0) {
                            return mergeFastIntoFull(prev, res.data, appBasis);
                        }
                        return res.data;
                    });
                }
            };

            mergeOrSet(m7Res, setM7Data);
            mergeOrSet(paiRes, setPhysicalAIData);
            mergeOrSet(scRes, setSiliconCoreData);
            mergeOrSet(pmRes, setPowerMatrixData);
            mergeOrSet(bpRes, setBioPulseData);
            mergeOrSet(csRes, setCyberShieldData);
            mergeOrSet(odRes, setOrbitDefenseData);
            mergeOrSet(qeRes, setQuantumEdgeData);
            mergeOrSet(fpRes, setFintechPulseData);
            mergeOrSet(cfRes, setCloudFortressData);

            setFetchedAt(new Date().toISOString());
            setLoading(false);
        } catch (e) {
            console.error('[IntelSharedData] Fast fetch failed:', e);
            setLoading(false);
        } finally {
            isFastFetching.current = false;
        }
    }, [appBasis]);

    // ── Phase 2: Options/Alpha via watchlist/batch — much faster (~3-5s) ──
    // Instead of calling /api/intel/m7 (which calls 7× /api/live/ticker individually),
    // we call /api/watchlist/batch directly — it uses getStockDataLight + parallel options fetch
    const fetchFull = useCallback(async () => {
        if (isFullFetching.current) return;
        isFullFetching.current = true;
        setOptionsLoading(true);

        try {
            const mergeIfPresent = (batch: any, setter: React.Dispatch<React.SetStateAction<IntelQuote[]>>) => {
                if (batch?.results) setter(prev => mergeWatchlistBatchIntoQuotes(prev, batch.results, appBasis));
            };

            const batchJobs: Array<{ url: string; setter: React.Dispatch<React.SetStateAction<IntelQuote[]>> }> = [
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${M7_TICKERS.join(',')}`, setter: setM7Data },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${PHYSICAL_AI_TICKERS.join(',')}`, setter: setPhysicalAIData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${SILICON_CORE_TICKERS.join(',')}`, setter: setSiliconCoreData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${POWER_MATRIX_TICKERS.join(',')}`, setter: setPowerMatrixData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${BIO_PULSE_TICKERS.join(',')}`, setter: setBioPulseData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${CYBER_SHIELD_TICKERS.join(',')}`, setter: setCyberShieldData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${ORBIT_DEFENSE_TICKERS.join(',')}`, setter: setOrbitDefenseData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${QUANTUM_EDGE_TICKERS.join(',')}`, setter: setQuantumEdgeData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${FINTECH_PULSE_TICKERS.join(',')}`, setter: setFintechPulseData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${CLOUD_FORTRESS_TICKERS.join(',')}`, setter: setCloudFortressData },
            ];

            if (shouldStaggerFull) {
                const chunkSize = 3;
                for (let i = 0; i < batchJobs.length; i += chunkSize) {
                    const chunk = batchJobs.slice(i, i + chunkSize);
                    const batches = await Promise.all(chunk.map(job => safeFetch(job.url)));
                    batches.forEach((batch, index) => mergeIfPresent(batch, chunk[index].setter));
                }
            } else {
                const batches = await Promise.all(batchJobs.map(job => safeFetch(job.url)));
                batches.forEach((batch, index) => mergeIfPresent(batch, batchJobs[index].setter));
            }

            hasFullData.current = true;
            setOptionsLoading(false);
            setFetchedAt(new Date().toISOString());
            console.log(`[IntelSharedData] ✅ Full data loaded via watchlist/batch (${shouldStaggerFull ? 'staggered' : 'parallel'})`);
        } catch (e) {
            console.error('[IntelSharedData] Full fetch failed:', e);
            setOptionsLoading(false);
        } finally {
            isFullFetching.current = false;
        }
    }, [batchMode, shouldStaggerFull, appBasis]);

    // ── Phase 0: Ultra-fast price-only polling (5s) via /api/live/quotes ──
    // [ONE-PIPE] calcUnifiedPrice 적용 — regularCloseToday 잠금으로 Polygon 불안정 차단
    const isPriceFetching = useRef(false);
    const fetchPriceOnly = useCallback(async () => {
        if (isPriceFetching.current) return;
        isPriceFetching.current = true;

        try {
            const allTickers = [...M7_TICKERS, ...PHYSICAL_AI_TICKERS, ...SILICON_CORE_TICKERS, ...POWER_MATRIX_TICKERS, ...BIO_PULSE_TICKERS, ...CYBER_SHIELD_TICKERS, ...ORBIT_DEFENSE_TICKERS, ...QUANTUM_EDGE_TICKERS, ...FINTECH_PULSE_TICKERS, ...CLOUD_FORTRESS_TICKERS].join(',');
            const res = await safeFetch(`/api/live/quotes?symbols=${allTickers}`);
            if (!res?.data) return;

            const priceMap = res.data as Record<string, any>;

            const toSession = (s: string): MarketSession => {
                if (!s) return 'CLOSED';
                const u = s.toUpperCase();
                if (u === 'PRE' || u === 'PRE_MARKET' || u === 'PREMARKET') return 'PRE';
                if (u === 'REG' || u === 'REGULAR' || u === 'OPEN') return 'REG';
                if (u === 'POST' || u === 'POST_MARKET' || u === 'POSTMARKET') return 'POST';
                return 'CLOSED';
            };

            const updateFn = (prev: IntelQuote[]) => {
                if (prev.length === 0) return prev;
                let hasAnyChange = false;
                const updated = prev.map(q => {
                    const p = priceMap[q.ticker];
                    if (!p || !p.price) return q;

                    const session = toSession(p.session);
                    const prevCl = q.prevClose || p.prevClose || 0;

                    // [ONE-PIPE] regularCloseToday: 최초 설정 후 유지
                    // ★ [2026-09-25] 마감 세션(POST·CLOSED)의 quotes.price 만 «정규장 종가»다. PRE·REG 에선 비운다
                    //   (예전엔 정규장 중 가격이 잠겨 애프터의 메인 가격·POST 기준선으로 남았다).
                    const isCloseSession = session === 'POST' || session === 'CLOSED';
                    const regCloseToday = !isCloseSession ? null
                        : (q.regularCloseToday && q.regularCloseToday > 0 && (toSession(q.session || '') === 'POST' || toSession(q.session || '') === 'CLOSED')
                            ? q.regularCloseToday
                            : (p.price > 0 ? p.price : null));

                    const pipe = computeOnePipe({
                        session,
                        pollPrice: p.price,
                        pollPrevClose: prevCl,
                        pollExtPrice: p.extendedPrice || 0,
                        pollExtLabel: p.extendedLabel || '',
                        pollChangePct: p.changePercent ?? null,
                        wsPrice: null,
                        regularCloseToday: regCloseToday,
                    });

                    const hasIncomingRegularChange = typeof p.changePercent === 'number' && Number.isFinite(p.changePercent);
                    const nextChangePct = !hasIncomingRegularChange
                        && (session === 'CLOSED' || session === 'PRE' || session === 'POST')
                        && q.changePct !== 0
                        && Math.abs(pipe.changePct) < 0.001
                        ? q.changePct
                        : pipe.changePct;

                    // Skip if price unchanged
                    // ★ [2026-09-25] 시간외 값도 비교한다 — 프리마켓엔 메인 가격(직전 종가)이 고정이라
                    //   메인만 보면 PRE 가격이 처음 값에서 영영 갱신되지 않았다.
                    const nextExtPrice = pipe.extPrice ?? 0;
                    const nextExtLabel = pipe.extLabel || '';
                    if (pipe.price === q.price && nextChangePct === q.changePct
                        && nextExtPrice === (q.extendedPrice || 0) && nextExtLabel === (q.extendedLabel || '')) return q;

                    hasAnyChange = true;
                    const flash: 'up' | 'down' | null = pipe.price > q.price ? 'up'
                        : pipe.price < q.price ? 'down' : null;

                    return {
                        ...q,
                        price: pipe.price,
                        changePct: nextChangePct,
                        prevClose: pipe.prevClose || q.prevClose,
                        volume: p.volume ?? q.volume,
                        regularCloseToday: regCloseToday,
                        // ★ [2026-09-25] 시간외 칸은 이번 폴링(quotes — 세션·날짜로 이미 고른 값)이 정답이다.
                        //   `|| 옛값` 이면 어제 POST 가 오늘 프리·정규장까지 남는다.
                        extendedPrice: nextExtPrice,
                        extendedChangePct: pipe.extChangePct ?? 0,
                        extendedLabel: nextExtLabel,
                        session: p.session ?? q.session,
                        priceFlash: flash,
                    };
                });
                return hasAnyChange ? updated : prev;
            };

            setM7Data(updateFn);
            setPhysicalAIData(updateFn);
            setSiliconCoreData(updateFn);
            setPowerMatrixData(updateFn);
            setBioPulseData(updateFn);
            setCyberShieldData(updateFn);
            setOrbitDefenseData(updateFn);
            setQuantumEdgeData(updateFn);
            setFintechPulseData(updateFn);
            setCloudFortressData(updateFn);
        } catch {
            // silent fail — prices will refresh on next cycle
        } finally {
            isPriceFetching.current = false;
        }
    }, []);

    // Combined refresh: fast first, then full
    const refresh = useCallback(async () => {
        setRefreshing(true);
        await fetchFast();
        setRefreshing(false);
        if (shouldAutoFull) {
            // Full data refresh in background
            fetchFull();
        } else {
            setOptionsLoading(false);
        }
    }, [fetchFast, fetchFull, shouldAutoFull]);

    // Initial load + intervals
    useEffect(() => {

        if (initialM7Data?.length && initialPAIData?.length) {
            // [SSR HYDRATED] Skip redundant Phase 1 fetch
            setFetchedAt(new Date().toISOString());
        } else {
            // Phase 1: Instant prices (Fallback if CSR)
            fetchFast();
        }

        // Phase 2: Full data in background (non-blocking)
        if (shouldAutoFull) {
            fetchFull();
        } else {
            setOptionsLoading(false);
        }

        // Price-only refresh. App screens can request a slower cadence to avoid
        // hammering all sector tickers while a detail view fetches its own batch.
        const priceInterval = setInterval(() => {
            if (!isPriceFetching.current) {
                fetchPriceOnly();
            }
        }, pricePollMs);

        // Fast refresh (sparklines, extended prices stay fresh)
        const fastInterval = setInterval(() => {
            if (!isFastFetching.current) {
                fetchFast();
            }
        }, fastPollMs);

        // Full refresh every 2 minutes (keeps Redis cache + options/alpha alive)
        const fullInterval = shouldAutoFull
            ? setInterval(() => {
                if (!isFullFetching.current) {
                    fetchFull();
                }
            }, fullPollMs)
            : null;

        return () => {
            clearInterval(priceInterval);
            clearInterval(fastInterval);
            if (fullInterval) clearInterval(fullInterval);
        };
    }, [
        fetchFast,
        fetchFull,
        fetchPriceOnly,
        fastPollMs,
        fullPollMs,
        initialM7Data?.length,
        initialPAIData?.length,
        pricePollMs,
        shouldAutoFull,
    ]);

    return {
        m7: m7Data,
        physicalAI: physicalAIData,
        siliconCore: siliconCoreData,
        powerMatrix: powerMatrixData,
        bioPulse: bioPulseData,
        cyberShield: cyberShieldData,
        orbitDefense: orbitDefenseData,
        quantumEdge: quantumEdgeData,
        fintechPulse: fintechPulseData,
        cloudFortress: cloudFortressData,
        loading,
        refreshing,
        optionsLoading,
        fetchedAt,
        refresh
    };
}

export interface IntelAppOptions {
    /** 앱 Intel: 옵션 지표(GEX·P/C)를 앱 전용 응답(DynamoDB 최신 행 한 곳)에서만 읽는다 — 아래 appBasis 설명. 기본 false(히트맵 등은 예전 그대로) */
    optionsBasis?: boolean;
    /** 'config' = 섹터 수치를 «설정 목록»(lib/app/intelSectorLists)으로 계산한다 — 카드 칩·+N 과 같은 목록. 기본 'engine'(서버 엔진 목록 그대로) */
    sectorBasis?: 'engine' | 'config';
}

export function useIntelSharedDataForApp(options?: IntelAppOptions): IntelSharedData & { refresh: () => void } {
    const optionsBasis = options?.optionsBasis ?? false;
    const configBasis = options?.sectorBasis === 'config';
    const base = useIntelSharedData(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
            fullData: 'staggered',
            batchMode: 'price-dp',
            pricePollMs: 10000,
            fastPollMs: 45000,
            fullPollMs: 240000,
            appBasis: optionsBasis,
        }
    );

    // ── 설정 목록 기준 섹터(앱 Intel): 어느 엔진 목록에도 없는 종목(RGTI·QBTS)의 시세를 배치로 따로 받는다 ──
    //   서버 엔진 목록은 알파·웹이 쓰므로 건드리지 않는다. 옵션 지표(GEX·P/C)는 수집 Lambda 행이 없어 «없음(0)» — 앱 화면이 «—» 로 그린다.
    const [extras, setExtras] = useState<IntelQuote[]>([]);
    useEffect(() => {
        if (!configBasis) return;
        const missing = configTickersMissingFrom(ALL_INTEL_TICKERS);
        if (missing.length === 0) return;
        let alive = true;
        const load = async () => {
            const res = await safeFetch(`/api/watchlist/batch?mode=price-dp&tickers=${missing.join(',')}`);
            if (!alive || !Array.isArray(res?.results)) return;
            const next = res.results
                .map((r: any) => quoteFromBatchResult(r, true))
                .filter((q: IntelQuote | null): q is IntelQuote => q !== null && q.price > 0);
            if (next.length > 0) setExtras(next);
        };
        load();
        const id = setInterval(load, 20000);
        return () => { alive = false; clearInterval(id); };
    }, [configBasis]);

    // ═══════════════════════════════════════════════════════════════════
    // [WS OVERLAY] App-only live prices (native WebView only).
    // Layers real-time WebSocket price on top of the REST/ONE-PIPE quotes by
    // routing wsPrice THROUGH computeOnePipe (untouched) — so the session split
    // (REG main vs PRE/POST badge) and after-close retention (regularCloseToday)
    // are preserved exactly. This lives in the APP wrapper only; the web Intel
    // page uses the core useIntelSharedData directly and is completely unaffected.
    // Not native / WS idle / off-market hours → returns base untouched (pure REST).
    // ═══════════════════════════════════════════════════════════════════
    const isNativeApp = typeof window !== 'undefined' && Capacitor.isNativePlatform();
    const wsTickers = useMemo(() => (isNativeApp ? ALL_INTEL_TICKERS : undefined), [isNativeApp]);
    const { prices: wsPrices } = useRealtimeData(wsTickers);

    const live = useMemo(() => {
        if (!isNativeApp || wsPrices.size === 0) return base;

        const overlay = (arr: IntelQuote[]): IntelQuote[] => {
            if (arr.length === 0) return arr;
            let changed = false;
            const next = arr.map(q => {
                const ws = wsPrices.get(q.ticker);
                let wsPrice = (ws?.price && ws.price > 0) ? ws.price : null;

                // ── [2026-08-29] STALE WS 가드 ──────────────────────────
                // Massive 차단 이후 EC2 price-ws 가 실시간 틱을 받지 못해
                // 구독 시점의 **어제 값**만 뱉는 상태가 됐다.
                //   실측: WS $228.2697(고정) vs REST $218.985 → 4% 괴리.
                // REST 기준가에서 2% 이상 벗어난 WS 값은 신뢰하지 않는다.
                // (EC2 를 Intrinio WS 로 이관하면 자연히 통과하는 가드)
                if (wsPrice != null) {
                    const ref = q.price > 0 ? q.price : q.prevClose;
                    if (ref > 0 && Math.abs(wsPrice - ref) / ref > 0.02) wsPrice = null;
                }

                if (wsPrice == null) return q;
                const pipe = computeOnePipe({
                    session: normalizeSession(q.session),
                    pollPrice: q.price,
                    pollPrevClose: q.prevClose,
                    pollExtPrice: q.extendedPrice || 0,
                    pollExtLabel: q.extendedLabel || '',
                    pollChangePct: q.changePct,
                    wsPrice,
                    regularCloseToday: q.regularCloseToday ?? null,
                });
                const nextExt = pipe.extPrice ?? q.extendedPrice;
                if (pipe.price === q.price && pipe.changePct === q.changePct && nextExt === q.extendedPrice) return q;
                changed = true;
                return {
                    ...q,
                    price: pipe.price,
                    changePct: pipe.changePct,
                    extendedPrice: nextExt,
                    extendedChangePct: pipe.extChangePct ?? q.extendedChangePct,
                    extendedLabel: pipe.extLabel || q.extendedLabel,
                    priceFlash: pipe.price > q.price ? 'up' : pipe.price < q.price ? 'down' : (q.priceFlash ?? null),
                };
            });
            return changed ? next : arr;
        };

        const m7 = overlay(base.m7);
        const physicalAI = overlay(base.physicalAI);
        const siliconCore = overlay(base.siliconCore);
        const powerMatrix = overlay(base.powerMatrix);
        const bioPulse = overlay(base.bioPulse);
        const cyberShield = overlay(base.cyberShield);
        const orbitDefense = overlay(base.orbitDefense);
        const quantumEdge = overlay(base.quantumEdge);
        const fintechPulse = overlay(base.fintechPulse);
        const cloudFortress = overlay(base.cloudFortress);

        // If no sector array actually changed, return base (same ref) so downstream memos bail.
        if (
            m7 === base.m7 && physicalAI === base.physicalAI && siliconCore === base.siliconCore &&
            powerMatrix === base.powerMatrix && bioPulse === base.bioPulse && cyberShield === base.cyberShield &&
            orbitDefense === base.orbitDefense && quantumEdge === base.quantumEdge &&
            fintechPulse === base.fintechPulse && cloudFortress === base.cloudFortress
        ) return base;

        return {
            ...base,
            m7, physicalAI, siliconCore, powerMatrix, bioPulse,
            cyberShield, orbitDefense, quantumEdge, fintechPulse, cloudFortress,
        };
    }, [base, wsPrices, isNativeApp]);

    return useMemo(() => {
        if (!configBasis) return live;
        const rebucketed = rebucketBySectorLists<IntelQuote>({
            m7: live.m7, physicalAI: live.physicalAI, siliconCore: live.siliconCore, powerMatrix: live.powerMatrix, bioPulse: live.bioPulse,
            cyberShield: live.cyberShield, orbitDefense: live.orbitDefense, quantumEdge: live.quantumEdge, fintechPulse: live.fintechPulse, cloudFortress: live.cloudFortress,
        }, extras);
        return { ...live, ...rebucketed };
    }, [live, extras, configBasis]);
}

/**
 * Merge fast API data (prices only) into existing full data (with options).
 * Updates prices/change% while preserving alpha/options fields.
 */
function mergeFastIntoFull(full: IntelQuote[], fast: IntelQuote[], appBasis = false): IntelQuote[] {
    const fastMap = new Map(fast.map(q => [q.ticker, q]));

    return full.map(existing => {
        const updated = fastMap.get(existing.ticker);
        if (!updated) return existing;

        // [ONE-PIPE] regularCloseToday 잠금 유지 — ★ [2026-09-25] 마감 세션(POST·CLOSED)에서만
        const sess = String(updated.session || existing.session || '').toUpperCase();
        const isCloseSession = sess === 'POST' || sess === 'CLOSED';
        const existingSess = String(existing.session || '').toUpperCase();
        const regCloseToday = !isCloseSession ? null
            : (existing.regularCloseToday && existing.regularCloseToday > 0 && (existingSess === 'POST' || existingSess === 'CLOSED')
                ? existing.regularCloseToday
                : (updated.price > 0 ? updated.price : null));

        // ★ [2026-09-25] 새 응답이 유효하면(가격 있음) 시간외 칸은 그것이 정답이다 — intel/fast 가 세션·날짜로
        //   골라서 준다. 예전엔 «새 값이 없으면 옛 값»이라 어제 POST 가 오늘 프리·정규장까지 남았다.
        const fresh = updated.price > 0;
        return {
            ...existing,
            price: updated.price > 0 ? updated.price : existing.price,
            changePct: updated.changePct || existing.changePct,
            prevClose: updated.prevClose || existing.prevClose,
            volume: updated.volume || existing.volume,
            regularCloseToday: regCloseToday,
            extendedPrice: fresh ? (updated.extendedPrice || 0) : existing.extendedPrice,
            extendedChangePct: fresh ? (updated.extendedChangePct || 0) : existing.extendedChangePct,
            extendedLabel: fresh ? (updated.extendedLabel || '') : existing.extendedLabel,
            session: updated.session || existing.session,
            // 앱 전용 응답: GEX·P/C·감마 구도는 이 응답(DynamoDB 최신 행 한 곳)이 «정답»이다 — 새 응답이 null 이면 null(«—»)로 따른다(옛 값·다른 만기 값을 남기지 않는다)
            ...(appBasis ? {
                gex: updated.gex ?? 0,
                pcr: updated.pcr ?? 0,
                gammaRegime: updated.gammaRegime || existing.gammaRegime,
                optionsAsOf: updated.optionsAsOf ?? null,
                pcrBasis: updated.pcrBasis ?? null,
            } : {}),
        };
    });
}

function pickFiniteNumber<T extends number | null | undefined>(value: T, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function quoteFromBatchResult(batch: any, appBasis = false): IntelQuote | null {
    if (!batch?.ticker || batch.error) return null;

    const rt = batch.realtime || {};
    const alpha = batch.alphaSnapshot || {};
    // 앱 전용: 배치의 GEX·P/C 는 만기 범위가 다른 값(알파 점수 입력용)이라 화면에 쓰지 않는다 — 0 = «못 쟀다»(앱 화면이 «—» 로 읽는 약속)
    const gex = appBasis ? 0 : pickFiniteNumber(rt.gex, 0);

    return {
        ticker: batch.ticker,
        price: pickFiniteNumber(rt.price, 0),
        changePct: pickFiniteNumber(rt.changePct, 0),
        prevClose: pickFiniteNumber(rt.prevClose, 0),
        volume: pickFiniteNumber(rt.volume, 0),
        extendedPrice: pickFiniteNumber(rt.extendedPrice, 0),
        extendedChangePct: pickFiniteNumber(rt.extendedChangePct, 0),
        extendedLabel: rt.extendedLabel || '',
        session: rt.session || '',
        // ★ [2026-10-07] 앱: 알파 점수를 못 쟀으면 50·등급 B 가 아니라 0·''(= «없음») — 평가받은 값처럼 보이지 않게(웹은 예전 그대로)
        alphaScore: pickFiniteNumber(alpha.score, appBasis ? 0 : 50),
        grade: alpha.grade || (appBasis ? '' : 'B'),
        maxPain: pickFiniteNumber(rt.maxPain, 0),
        callWall: pickFiniteNumber(rt.callWall, 0),
        putFloor: pickFiniteNumber(rt.putFloor, 0),
        gex,
        pcr: appBasis ? 0 : pickFiniteNumber(rt.pcr, 0),
        gammaRegime: appBasis ? 'UNKNOWN' : gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : (rt.gammaRegime || 'NEUTRAL'),
        sparkline: rt.sparkline?.length > 0 ? rt.sparkline : [],
        netPremium: pickFiniteNumber(rt.netPremium, 0),
        rsi: pickFiniteNumber(rt.rsi, 0),
        rvol: pickFiniteNumber(rt.relVol ?? rt.rvol, 0),
        squeezeScore: pickFiniteNumber(rt.squeezeScore, 0),
        ivSkew: pickFiniteNumber(rt.ivSkew, 0),
        impliedMovePct: pickFiniteNumber(rt.impliedMovePct, 0),
        impliedMoveBasis: rt.impliedMoveBasis === 'live' || rt.impliedMoveBasis === 'eod' ? rt.impliedMoveBasis : null,
        impliedMoveSession: typeof rt.impliedMoveSession === 'string' ? rt.impliedMoveSession : null,
        impliedMoveAsOf: typeof rt.impliedMoveAsOf === 'number' ? rt.impliedMoveAsOf : null,
        whaleIndex: pickFiniteNumber(rt.whaleIndex, 0),
        darkPoolPct: pickFiniteNumber(rt.darkPoolPct, 0),
        regularCloseToday: pickFiniteNumber(rt.regularCloseToday, 0) || null,
    };
}

// 앱 래퍼가 «엔진 목록 밖 종목»을 배치로 받을 때 같은 변환을 쓴다
export { quoteFromBatchResult };

// Export ticker constants for components
export { M7_TICKERS, PHYSICAL_AI_TICKERS, SILICON_CORE_TICKERS, POWER_MATRIX_TICKERS, BIO_PULSE_TICKERS, CYBER_SHIELD_TICKERS, ORBIT_DEFENSE_TICKERS, QUANTUM_EDGE_TICKERS, FINTECH_PULSE_TICKERS, CLOUD_FORTRESS_TICKERS };

/**
 * Merge watchlist/batch results (alpha + options) into existing Phase 1 quotes.
 * Preserves Phase 1 prices while enriching with options/alpha data.
 */
function mergeWatchlistBatchIntoQuotes(existingQuotes: IntelQuote[], batchResults: any[], appBasis = false): IntelQuote[] {
    const batchMap = new Map<string, any>();
    batchResults.forEach((r: any) => {
        if (r.ticker && !r.error) batchMap.set(r.ticker, r);
    });

    if (existingQuotes.length === 0) {
        return batchResults
            .map((r) => quoteFromBatchResult(r, appBasis))
            .filter((quote): quote is IntelQuote => quote !== null);
    }

    return existingQuotes.map(existing => {
        const batch = batchMap.get(existing.ticker);
        if (!batch) return existing;

        const rt = batch.realtime || {};
        const alpha = batch.alphaSnapshot || {};
        // 앱 전용: GEX·P/C·감마 구도는 앱 전용 섹터 응답(DynamoDB 최신 행 한 곳)이 정한다 — 배치(만기 범위가 다른 값)로 덮지 않는다
        const gex = appBasis ? existing.gex : pickFiniteNumber(rt.gex, existing.gex);

        return {
            ...existing,
            price: pickFiniteNumber(rt.price, existing.price),
            changePct: pickFiniteNumber(rt.changePct, existing.changePct),
            prevClose: pickFiniteNumber(rt.prevClose, existing.prevClose),
            volume: pickFiniteNumber(rt.volume, existing.volume),
            regularCloseToday: pickFiniteNumber(rt.regularCloseToday, existing.regularCloseToday ?? 0) || existing.regularCloseToday,
            extendedPrice: pickFiniteNumber(rt.extendedPrice, existing.extendedPrice),
            extendedChangePct: pickFiniteNumber(rt.extendedChangePct, existing.extendedChangePct),
            extendedLabel: rt.extendedLabel || existing.extendedLabel,
            session: rt.session || existing.session,
            // Options data from watchlist/batch
            alphaScore: pickFiniteNumber(alpha.score, existing.alphaScore),
            grade: alpha.grade || existing.grade,
            maxPain: pickFiniteNumber(rt.maxPain, existing.maxPain),
            callWall: pickFiniteNumber(rt.callWall, existing.callWall),
            putFloor: pickFiniteNumber(rt.putFloor, existing.putFloor),
            gex,
            pcr: appBasis ? existing.pcr : pickFiniteNumber(rt.pcr, existing.pcr),
            gammaRegime: appBasis ? existing.gammaRegime : gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : existing.gammaRegime,
            sparkline: rt.sparkline?.length > 0 ? rt.sparkline : existing.sparkline,
            netPremium: pickFiniteNumber(rt.netPremium, existing.netPremium),
            rsi: pickFiniteNumber(rt.rsi, existing.rsi || 0),
            rvol: pickFiniteNumber(rt.relVol ?? rt.rvol, existing.rvol || 0),
            squeezeScore: pickFiniteNumber(rt.squeezeScore, existing.squeezeScore || 0),
            ivSkew: pickFiniteNumber(rt.ivSkew, existing.ivSkew || 0),
            impliedMovePct: pickFiniteNumber(rt.impliedMovePct, existing.impliedMovePct || 0),
            // 기준·세션은 값을 준 쪽을 따른다(새 값이 없으면 기존 값의 꼬리표 유지)
            ...(Number(rt.impliedMovePct) > 0
                ? { impliedMoveBasis: rt.impliedMoveBasis ?? null, impliedMoveSession: rt.impliedMoveSession ?? null, impliedMoveAsOf: rt.impliedMoveAsOf ?? null }
                : { impliedMoveBasis: existing.impliedMoveBasis ?? null, impliedMoveSession: existing.impliedMoveSession ?? null, impliedMoveAsOf: existing.impliedMoveAsOf ?? null }),
            whaleIndex: pickFiniteNumber(rt.whaleIndex, existing.whaleIndex || 0),
            darkPoolPct: pickFiniteNumber(rt.darkPoolPct, existing.darkPoolPct || 0),
        };
    });
}
