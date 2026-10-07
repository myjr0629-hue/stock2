import { calculateRLSI, RLSIResult, getMarketSession, MarketSession } from "./rlsiEngine";
// [FIX] Import getMarketSession for cache session validation
import { SectorEngine, SectorFlowRate, GuardianVerdict, FlowVector, RotationIntensity } from "./sectorEngine";
import { getMacroSnapshotSSOT, MacroSnapshot } from "@/services/macroHubProvider";
import { guardianNumsFromAiContext, guardianNumsFromContext, guardianNumsFromMarket } from '@/lib/ai/guardianNumbers';
import { IntelligenceNode } from "./intelligenceNode";
import { RvolEngine, RvolProfile } from "./rvolEngine";
import { fetchMassive } from "@/services/massiveClient";
import { getGammaShield, GammaShieldData } from "./gammaShieldEngine";
import { getMarketBreadth } from "./breadthEngine";
// ⚠️ 위 breadthEngine 과 «다른» 지표다.
//    getMarketBreadth  = 등락종목수(A/D) — 정규장에 누적되는 값
//    getIndexBreadth   = 구성종목의 20일 이평 상회 비율 — 종가 기반, 주말에도 나온다
import { getIndexBreadth } from "@/services/indexBreadth";
import { after } from 'next/server';
import { tryBackgroundLock, releaseBackgroundLock } from '@/lib/cache/staleLock';
// ★2026-10-08 언어와 무관한 숫자는 «공유 코어» 하나 — 같은 시각 ko·ja·en 의 RLSI·GEX 가 갈리던 것을 막는다(guardianCore.ts 머리말)
import {
    CORE_KEY, CORE_LOCK_KEY, CORE_LOCK_MS, VERDICT_TEXTS, deriveLocaleParts, getSharedCore, overlayCore,
    type CoreDeps, type GuardianCore,
} from "./guardianCore";

// === TYPES ===
export interface SectorDensity {
    sector: string;
    densityScore: number; // 0-100 normalized
    height: number;       // 0-1.0 for 3D mapping
    topTickers: string[];
}

export interface DivergenceAnalysis {
    caseId: 'A' | 'B' | 'C' | 'D' | 'N';
    verdictTitle: string;
    verdictDesc: string;
    isDivergent: boolean;
    score: number;
}

// [V6.0] Rule-based Market Verdict
export interface MarketVerdict {
    status: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    headline: string;       // 1줄 핵심 결론
    keyMetrics: string[];   // 근거 수치 3개
    action: string;         // 명확한 액션
}

// [V6.0] TARGET LOCK Checklist
export interface TripleACondition {
    id: string;
    label: string;
    passed: boolean;
    current: string;
    required: string;
}

export interface TripleAChecklist {
    conditions: TripleACondition[];
    passedCount: number;
    totalCount: number;
    isLocked: boolean;
    message: string;        // 사용자 친화적 메시지
}

export interface GuardianContext {
    rlsi: RLSIResult;
    market: MacroSnapshot;
    sectors: SectorFlowRate[];
    vectors?: FlowVector[];
    verdict: GuardianVerdict;
    divergence: DivergenceAnalysis;
    verdictSourceId: string | null;
    verdictTargetId: string | null;
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    rvol?: { ndx: RvolProfile; dow: RvolProfile };
    /**
     * 지수 브레드스 — 구성종목 중 20일 이평 위 비율.
     * rvol 과 «다른 지표»다: rvol 은 정규장 거래량, 이건 종가 기반이라 주말에도 나온다.
     * covered/universe 를 같이 담는다 — 구성종목 목록이 낡으면 화면이 그걸 알 수 있어야 한다.
     */
    ma20Breadth?: {
        ndx: { pctAbove20: number | null; covered: number; universe: number; asOf: string | null };
        dow: { pctAbove20: number | null; covered: number; universe: number; asOf: string | null };
    };
    rotationIntensity?: RotationIntensity;
    // [V6.0] Hybrid Intelligence
    ruleVerdict?: MarketVerdict;        // 규칙 기반 핵심 결론
    tripleA?: {
        regime: 'BULL' | 'BEAR' | 'NEUTRAL';
        alignment: boolean;
        acceleration: boolean;
        accumulation: boolean;
        isTargetLock: boolean;
        checklist: TripleAChecklist;    // [V6.0] 체크리스트
    };
    // [V7.0] Market Breadth
    breadth?: {
        advancers: number;
        decliners: number;
        unchanged?: number;
        totalTickers: number;
        hasData?: boolean;
        breadthPct: number;
        adRatio: number;
        volumeBreadth: number;
        signal: string;
        isDivergent: boolean;
    };
    // [V9.0] RLSI Intraday History — 5-min interval sparkline data
    rlsiHistory?: { time: string; score: number }[];
    // [V10.0] GAMMA SHIELD — Market-wide volatility intelligence
    gammaShield?: GammaShieldData | null;
    timestamp: string;
    /** ★2026-10-08 이 컨텍스트의 «숫자»가 나온 공유 코어의 계산 시각(ISO) — 응답 출구(overlayCore)가 더 새 코어로 맞출지 판단한다 */
    coreAt?: string;
}

// === CACHE CONFIG (per-locale to prevent AI text cross-contamination) ===
const _cachedContext: Record<Locale, GuardianContext | null> = { ko: null, en: null, ja: null };
const _lastFetchTime: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
// [LAST GOOD] Throttle for refreshing the long-TTL last-good snapshot copy
const _lastGoodWriteTime: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
const CACHE_TTL_MS = 25 * 1000; // 25 seconds — matches 30s polling interval

// [V12.0] Persistent AI verdict cache — Redis-based for deploy survival & EC2 sync
// [FIX] Per-locale keys to prevent English verdict being served to Korean/Japanese
const getAiVerdictKey = (locale: Locale) => `guardian:ai_verdict:${locale}`;
const AI_VERDICT_TTL = 24 * 60 * 60; // 24 hours

// [V12.0] Redis-first Guardian Snapshot keys (EC2 Worker writes these)
const GUARDIAN_SNAPSHOT_PREFIX = 'guardian:snapshot:';

// [V9.0] RLSI Intraday History — Redis-based for Vercel persistence
interface RlsiHistoryEntry { time: string; score: number; }
const RLSI_HISTORY_REDIS_KEY = 'guardian:rlsi_history';
const RLSI_HISTORY_TTL = 72 * 60 * 60; // 72 hours — survive full weekend (Fri close → Mon open)

import { getFromCache, setInCache } from '../redisClient';

// In-memory fallback for local dev (when Redis is not available)
let _rlsiHistoryMemory: RlsiHistoryEntry[] = [];

async function loadRlsiHistory(): Promise<RlsiHistoryEntry[]> {
    // Try Redis first
    const fromRedis = await getFromCache<RlsiHistoryEntry[]>(RLSI_HISTORY_REDIS_KEY);
    if (fromRedis && Array.isArray(fromRedis)) {
        _rlsiHistoryMemory = fromRedis;
        return fromRedis;
    }
    // Fallback to memory
    return _rlsiHistoryMemory;
}

async function saveRlsiHistory(history: RlsiHistoryEntry[]) {
    _rlsiHistoryMemory = history;
    await setInCache(RLSI_HISTORY_REDIS_KEY, history, RLSI_HISTORY_TTL);
}

async function appendRlsiHistory(score: number, session: string): Promise<RlsiHistoryEntry[]> {
    let history = await loadRlsiHistory();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Only record during REG session (or keep last session's data)
    if (session === 'REG') {
        // Auto-reset only during REG if it's a new trading day
        if (history.length > 0) {
            const lastDate = history[0].time.split('T')[0];
            if (lastDate !== todayStr) {
                console.log(`[Guardian V9.0] New trading day detected (${lastDate} → ${todayStr}), resetting RLSI history`);
                history = [];
            }
        }

        // Avoid duplicate entries (within 2 min window)
        const lastEntry = history[history.length - 1];
        if (lastEntry) {
            const lastTime = new Date(lastEntry.time).getTime();
            if (now.getTime() - lastTime < 2 * 60 * 1000) {
                return history; // Too recent, skip
            }
        }

        history.push({ time: now.toISOString(), score: Math.round(score) });

        // Cap at 78 entries (6.5h REG session / 5 min = 78)
        if (history.length > 78) {
            history = history.slice(-78);
        }

        await saveRlsiHistory(history);
        console.log(`[Guardian V9.0] RLSI History (Redis): ${history.length} entries, latest=${Math.round(score)}`);
    }
    // During non-REG (holidays, after-hours): return existing history without resetting

    return history;
}

async function saveAiVerdict(verdict: GuardianVerdict, locale: Locale = 'ko') {
    try {
        await setInCache(getAiVerdictKey(locale), verdict, AI_VERDICT_TTL);
    } catch (e) { /* ignore write errors */ }
}

async function loadAiVerdict(locale: Locale = 'ko'): Promise<GuardianVerdict | null> {
    try {
        return await getFromCache<GuardianVerdict>(getAiVerdictKey(locale));
    } catch (e) { /* ignore read errors */ }
    return null;
}

/**
 * 10년물 «전일 대비 절대 변화»(bp) — AI 에 넘기는 값.
 * ⚠️ factors.us10y.chgPct 는 금리 «수준»의 상대 변화율이다(5.18%→5.24% = +1.08%). 예전엔 그걸 «변동 +1.08%»로
 *    AI 에 줬고, 모델은 «10년물 108bp 급등»이라고 썼다(2026-09-29 운영 실측, 실제로는 약 +6bp).
 *    chgAbs(퍼센트포인트)가 있으면 그것을, 없으면 수준과 변화율로 역산한다: prev = level/(1+chgPct/100).
 */
function us10yChangeBp(f?: { level?: number | null; chgPct?: number | null; chgAbs?: number | null } | null): number | undefined {
    if (!f) return undefined;
    // 하루 100bp 넘는 10년물 변화는 단위가 틀린 값으로 본다(×10 호가 등) → 역산으로 넘어간다
    if (typeof f.chgAbs === 'number' && Number.isFinite(f.chgAbs) && Math.abs(f.chgAbs) < 1) {
        return Math.round(f.chgAbs * 100);
    }
    if (typeof f.level === 'number' && typeof f.chgPct === 'number' && Number.isFinite(f.level) && Number.isFinite(f.chgPct) && f.chgPct > -100) {
        const prev = f.level / (1 + f.chgPct / 100);
        const bp = Math.round((f.level - prev) * 100);
        return Math.abs(bp) < 100 ? bp : undefined;
    }
    return undefined;
}

// === LOCALIZED TEXT FOR VERDICTS ===
type Locale = 'ko' | 'en' | 'ja';


const REGIME_TEXTS: Record<string, Record<Locale, string>> = {
    BULL: {
        ko: "강세 환경 관측 :: 모멘텀·유동성 확장 구간 (Alpha Seek)",
        en: "Bullish Environment :: Momentum & Liquidity Expansion Phase (Alpha Seek)",
        ja: "強気環境観測 :: モメンタム・流動性拡大局面 (Alpha Seek)"
    },
    BEAR: {
        ko: "약세 환경 관측 :: 변동성 확대·유동성 위축 구간 (Defense)",
        en: "Bearish Environment :: Volatility Expansion & Liquidity Contraction Phase (Defense)",
        ja: "弱気環境観測 :: ボラティリティ拡大・流動性収縮局面 (Defense)"
    },
    NEUTRAL: {
        ko: "방향성 부재 :: 모멘텀 중립 구간 (Monitor)",
        en: "Directionless :: Momentum Neutral Phase (Monitor)",
        ja: "方向性不在 :: モメンタム中立局面 (Monitor)"
    }
};


// ★2026-10-08 공유 코어의 의존 — 순수 로직(guardianCore.ts)에 Redis·엔진·«응답 뒤 예약»을 꽂는다.
//   gcore: 접두사 = redisClient 의 Upstash 복제 목록에 없다(EC2 에만 쓴다 · EC2 장애 땐 예전처럼 Upstash 가 받는다).
//   perf:lock:gcore = 응답 뒤 갱신이 여러 인스턴스에서 동시에 도는 것을 줄이는 잠금(lib/cache/staleLock — 랭킹·무버와 같은 SWR 방식).
const CORE_BG_LOCK = 'perf:lock:gcore';
const CORE_DEPS: CoreDeps = {
    now: () => Date.now(),
    session: () => getMarketSession(),
    read: () => getFromCache<GuardianCore>(CORE_KEY),
    write: async (core, ttlSec) => { await setInCache(CORE_KEY, core, ttlSec); },
    readLock: () => getFromCache<number>(CORE_LOCK_KEY),
    writeLock: async (at) => { await setInCache(CORE_LOCK_KEY, at, Math.ceil(CORE_LOCK_MS / 1000)); },
    compute: (force) => GuardianDataHub.computeCoreNow(force),
    // 요청 범위 밖(크론·스크립트)에서는 after() 가 던진다 → false → 호출부가 기다리며 계산한다
    background: (job) => { try { after(job); return true; } catch { return false; } },
    bgLock: () => tryBackgroundLock(CORE_BG_LOCK, 45),
    bgUnlock: () => releaseBackgroundLock(CORE_BG_LOCK),
    log: (m) => console.warn(m),
};

export class GuardianDataHub {

    /**
     * Get the Unified Guardian Context (SSOT)
     * Optimized with Parallel Execution for RLSI & Macro Data.
     */
    static async getGuardianSnapshot(force: boolean = false, locale: Locale = 'ko'): Promise<GuardianContext> {
        const context = await GuardianDataHub.computeGuardianSnapshot(force, locale);
        // ★2026-10-08 숫자는 언어와 무관한 «공유 코어» 하나 — 어느 경로(Redis 스냅샷·메모리·lastgood·새 계산)로 온 언어별 컨텍스트든
        //   응답 직전에 최신 코어로 맞춘다. 같은 시각 ko·ja·en 의 RLSI·GEX 가 갈리던 것(10/7 42.7·43.4·46.3 / −26·−10·−16)을 막는다.
        const shared = await GuardianDataHub.withSharedCore(context, locale);
        return GuardianDataHub.guardVerdictOnExit(shared, locale);
    }

    /** 응답 출구의 숫자 일치 — 코어를 못 읽으면(장애) 컨텍스트를 그대로 둔다. 절대 던지지 않는다 */
    private static async withSharedCore(context: GuardianContext, locale: Locale): Promise<GuardianContext> {
        try {
            if (!context?.rlsi) return context;
            const core = await getSharedCore(CORE_DEPS, { mode: 'swr' });
            return core ? overlayCore(context, core, locale) : context;
        } catch (e: any) {
            console.warn('[Guardian] shared core overlay skipped:', e?.message);
            return context;
        }
    }

    /**
     * ★2026-09-29 출구 검사 — getGuardianSnapshot 이 돌려주는 «모든» 경로(Redis 스냅샷·메모리·lastgood·새 계산)의
     * 판정 글 3개(description·realityInsight·gammaInsight)를 검사한다. 통과하면 정리본, 떨어지면 마지막 정상본/번역/안내 문구.
     * 왜 여기까지 거는가: 스냅샷은 EC2 워커가 이 API 를 30초마다 긁어 ElastiCache 에 다시 쓰고(웹소켓 허브가 그걸 뿌린다),
     * 신선하면 재계산 없이 그대로 나간다. 생성기의 검사만으로는 이미 저장된 나쁜 글이 덮이지 않는다
     * (9/29 영어 거절문은 guardian:gemini → ai_verdict → snapshot → lastgood 네 곳에 들어가 있었다).
     * 검사는 정규식뿐이라 비용이 거의 없고, 교체가 필요할 때만 Redis/번역을 탄다.
     */
    private static async guardVerdictOnExit(context: GuardianContext, locale: Locale): Promise<GuardianContext> {
        if (!context?.verdict) return context;
        // ★2026-10-04 같은 응답의 화면 숫자(market·rlsi)로 자리표를 채우고, 숫자로 박힌 지표를 대조한다(lib/ai/guardianNumbers)
        const nums = guardianNumsFromContext(context);   // ★2026-10-07 T5: 시장·RLSI + 감마 쉴드(GEX·스퀴즈)·참여폭
        const r = await IntelligenceNode.repairVerdictTexts(context.verdict, locale, 'snapshot', nums);
        return r.changed ? { ...context, verdict: r.verdict } : context;
    }

    private static async computeGuardianSnapshot(force: boolean, locale: Locale): Promise<GuardianContext> {
        const now = Date.now();

        // [V12.0] Redis-first: Check EC2 Worker's pre-cached snapshot
        // [FIX] Validate that cached session matches current session before returning
        const currentSession = getMarketSession();
        if (!force) {
            try {
                const redisKey = `${GUARDIAN_SNAPSHOT_PREFIX}${locale}`;
                const cached = await getFromCache<any>(redisKey);
                // [MAP FLAP FIX] A snapshot without sectors is a degraded compute
                // (Polygon snapshot returned no tickers → sectorEngine flows:[]).
                // Serving it blanks the Flow Topography Map + Sector Intel on every
                // client for the full TTL — treat it as a cache miss and recompute.
                if (cached && cached.rlsi && cached.rlsi.score !== undefined && Array.isArray(cached.sectors) && cached.sectors.length > 0) {
                    // [FIX] Session validation: if cached session differs from current, recompute
                    const cachedSession = cached.rlsi?.session;
                    if (cachedSession && cachedSession !== currentSession) {
                        console.log(`[Guardian FIX] Session mismatch: cached=${cachedSession}, current=${currentSession} — recomputing for ${locale}`);
                        // Don't return stale cache, fall through to recompute
                    } else {
                        // [FIX] Staleness check: if data is older than FRESH_MS, recompute for real-time freshness
                        // ★2026-09-23 실측: 워커는 약 30초마다 쓰는데(읽힌 나이 25~41초) 기준이 25초라 거의 모든 요청이
                        //   «오래됨» → 재계산(분당 137회)이었다. 워커 주기 + 여유로 45초.
                        const FRESH_MS = 45000;
                        // ★2026-09-23 23:2x 운영 로그로 확인: Vercel 이 계산해 쓴 스냅샷(아래 973행)에는 _workerTimestamp 가
                        //   없어서 «나이 = 현재 시각(1,790,172,997초)» → 매 요청 재계산 → 같은 키를 또 덮어씀(워커의 신선한 사본까지)
                        //   → 영원히 반복됐다(6분에 384회, 매회 FMP 뉴스 + 137종목 시세). 오늘 뉴스가 Massive→FMP 로 넘어오며
                        //   이 반복이 FMP 분당 한도를 태워 429 를 냈다. 워커 시각이 없으면 스냅샷 자체의 timestamp 로 잰다.
                        const stamp = cached._workerTimestamp || cached.timestamp;
                        const workerTs = stamp ? new Date(stamp).getTime() : 0;
                        const dataAge = now - workerTs;
                        if (dataAge > FRESH_MS) {
                            console.log(`[Guardian] Redis cache stale (${(dataAge/1000).toFixed(0)}s old) — recomputing for ${locale}`);
                            // Fall through to recompute
                        } else {
                            // Session matches and data is fresh, safe to return
                            _cachedContext[locale] = cached;
                            _lastFetchTime[locale] = now;
                            // [LAST GOOD] Worker-written good snapshots also refresh the
                            // long-TTL fallback copy (throttled to one write / 5min)
                            if (now - _lastGoodWriteTime[locale] > 5 * 60 * 1000) {
                                _lastGoodWriteTime[locale] = now;
                                setInCache(`${GUARDIAN_SNAPSHOT_PREFIX}lastgood:${locale}`, cached, 72 * 60 * 60).catch(() => { /* non-critical */ });
                            }
                            console.log(`[Guardian V12.0] Redis SWR hit for ${locale} (RLSI: ${cached.rlsi.score?.toFixed?.(0) || 'N/A'}, session: ${cachedSession}, age: ${(dataAge/1000).toFixed(0)}s)`);
                            return cached;
                        }
                    }
                }
            } catch (e) {
                // Redis miss or error — fall through to in-memory then compute
            }
        }

        if (!force && _cachedContext[locale] && (now - _lastFetchTime[locale] < CACHE_TTL_MS)) {
            // [FIX] Also validate in-memory cache session
            const memSession = (_cachedContext[locale] as any)?.rlsi?.session;
            if (memSession && memSession !== currentSession) {
                console.log(`[Guardian FIX] In-memory session mismatch: cached=${memSession}, current=${currentSession} — recomputing for ${locale}`);
            } else {
                return _cachedContext[locale]!;
            }
        }

        // ★2026-09-23 인스턴스 간 재계산 제한: 다른 인스턴스가 20초 안에 재계산을 시작했으면 여기서 또 계산하지 않고
        //   방금 저장된 직전 정상본(lastgood, 72h·Upstash 복제)을 준다. 재계산 한 번이 FMP 뉴스 + 137종목 시세를 부르므로
        //   인스턴스마다 따로 계산하면 벤더 분당 한도를 태운다(9/23 FMP 429). 줄 것이 없으면 그대로 계산한다.
        if (!force) {
            const lockKey = `${GUARDIAN_SNAPSHOT_PREFIX}recompute:${locale}`;
            const lockedAt = await getFromCache<number>(lockKey).catch(() => null);
            if (typeof lockedAt === 'number' && now - lockedAt < 20000) {
                const mem = _cachedContext[locale] as any;
                if (mem?.sectors?.length) return mem;
                const lg = await getFromCache<any>(`${GUARDIAN_SNAPSHOT_PREFIX}lastgood:${locale}`).catch(() => null);
                if (lg?.sectors?.length && lg?.rlsi?.score !== undefined) return lg;
            } else {
                setInCache(lockKey, now, 20).catch(() => { /* non-critical */ });
            }
        }

        console.log("[Guardian] Refreshing Context (shared core)...");

        try {
            // === STEP 1~2: 언어와 무관한 숫자(섹터·시장·RVOL·감마쉴드·RLSI·참여폭)는 «공유 코어»에서 — 세 언어가 같은 숫자를 쓴다 ===
            //   (원문은 computeCoreNow — lib: services/guardian/guardianCore · 2026-10-08)
            const core = await getSharedCore(CORE_DEPS, { force, mode: 'fresh' });
            if (!core) throw new Error('[Guardian] shared core unavailable');
            const { sectors: flows, vectors, sourceId, targetId, rotationIntensity, market: macro, rlsi, gammaShield: gammaShieldData, ma20Breadth, news: marketNews } = core;
            const rvolNdx = core.rvol.ndx;
            const rvolDow = core.rvol.dow;

            // === STEP 3: DIVERGENCE ANALYSIS (The Logic) — 코어에서 파생(guardianCore.deriveLocaleParts) ===
            // Logic: Compare Nasdaq Change vs RLSI Score
            const nq = macro?.nqChangePercent || 0;
            const parts = deriveLocaleParts(core, locale);
            const divCase = parts.divCase;

            // === STEP 4: GENERATE VERDICT NARRATIVE (AI + Templates) ===
            let verdict: GuardianVerdict;

            // [V13.0] Divergence info for AI context (used in all paths)
            const divergenceForAi = {
                divergenceCase: divCase.caseId,
                divergenceDesc: divCase.verdictDesc,
            };

            const storedVerdict = (!force && rlsi.session === 'CLOSED') ? await loadAiVerdict(locale) : null;
            if (storedVerdict) {
                // [V12.0] Only truly CLOSED hours use cached AI verdict (weekends, nights 20:00-04:00 ET)
                // [FIX] PRE and POST sessions now generate fresh AI analysis instead of returning stale off-hours cache
                // ★2026-09-29 저장된 판정도 출구 검사를 지난다. 떨어진 칸은 교체하고 저장본도 고쳐 둔다
                //   (이 키는 마케팅·콘텐츠 생성기도 직접 읽는다 — lib/marketing-v2/core/data.ts, api/admin/content-gen).
                //   ★2026-10-04 숫자도 — 금요일 장중에 만든 글의 «나스닥 +0.94%·RLSI 41»이 주말 화면(+0.98%·38)과 달랐다.
                const repaired = await IntelligenceNode.repairVerdictTexts(storedVerdict, locale, 'ai_verdict', guardianNumsFromMarket(macro, rlsi.score, {
                    gexIndex: gammaShieldData?.gexIndex, squeezeRisk: gammaShieldData?.squeezeRisk,
                    breadthPct: rlsi.session === 'REG' ? rlsi.components?.breadthPct : undefined,
                }));
                verdict = repaired.verdict;
                if (repaired.changed) await saveAiVerdict(verdict, locale);
            } else {
                // Standard Market: Use Dual Stream AI (including divergence situations)
                const staticVerdict: GuardianVerdict = {
                    title: VERDICT_TEXTS.STABLE[locale].title,
                    description: VERDICT_TEXTS.STABLE[locale].desc,
                    sentiment: 'NEUTRAL',
                };

                try {
                    // [PERFORMANCE] Parallel AI Generation - saves ~1s
                    // [V6.0] Build 5-day rotation context for AI
                    const ri = rotationIntensity;
                    const formatTopFlows = (type: 'inflow' | 'outflow') => {
                        const items = type === 'inflow' ? ri.topInflow : ri.topOutflow;
                        return items.map(s => `${s.sector}(${s.flow > 0 ? '+' : ''}${s.flow.toFixed(1)}%)`).join(', ');
                    };
                    const detectBounceWarning = () => {
                        return ri.bounceWarnings?.join(' | ') || undefined;
                    };

                    // [V6.1] Detect signal conflicts before AI context
                    let signalConflict: string | undefined;
                    if (rlsi.score >= 55 && nq > 0 && ri.direction === 'RISK_OFF' && ri.conviction === 'HIGH') {
                        signalConflict = `겉은 강세(RLSI ${rlsi.score.toFixed(0)}, NQ +${nq.toFixed(2)}%), 속은 약세(${ri.direction} ${ri.conviction})`;
                    } else if (rlsi.score <= 35 && nq < 0 && ri.direction === 'RISK_ON' && ri.conviction === 'HIGH') {
                        signalConflict = `지표 약세(RLSI ${rlsi.score.toFixed(0)}, NQ ${nq.toFixed(2)}%), 성장주 유입(${ri.direction} ${ri.conviction})`;
                    }

                    const aiContext = {
                        rlsiScore: rlsi.score,
                        nasdaqChange: macro?.nqChangePercent || 0,
                        vectors: vectors?.map(v => ({ source: v.sourceId, target: v.targetId, strength: v.strength })) || [],
                        // ⚠️ rvolEngine 은 PRE/POST/CLOSED 에서 «측정 안 함»을 rvol:0 으로 표현한다.
                        //    그 0 을 그대로 AI 에 넘기면 «거래량 0.00x 저조»라는 **사실 주장**으로
                        //    바뀌어 사용자에게 나간다(2026-08-29 애프터마켓 실제 발생).
                        //    측정 불가는 값이 아니라 부재로 전달해야 한다 → undefined.
                        rvol: rvolNdx.status === "OPEN" && (rvolNdx.rvol ?? 0) > 0 ? rvolNdx.rvol! : undefined,
                        vix: macro?.vix || 0,
                        locale,
                        // Macro indicators
                        // 10Y 는 수준·변화 모두 통일본(factors.us10y)에서 — 수준은 70(fix/dash-yield-change-units)의 같은 원본,
                        // 변화는 main 의 us10yChangeBp(단위 오류 방어 |bp|<100 포함). 변화는 bp 로 준다 (2026-09-29·통합 9/30)
                        us10y: macro?.factors?.us10y?.level ?? macro?.yieldCurve?.us10y ?? undefined,
                        us10yChangeBp: us10yChangeBp(macro?.factors?.us10y),
                        spread2s10s: macro?.yieldCurve?.spread2s10s ?? undefined,
                        realYield: macro?.realYield?.realYield ?? undefined,
                        realYieldStance: macro?.realYield?.stance ?? undefined,
                        // Breadth indicators — [FIX] Only during REG (off-hours = fallback 50%, no analytical value)
                        breadthPct: rlsi.session === 'REG' ? (rlsi.components?.breadthPct ?? undefined) : undefined,
                        adRatio: rlsi.session === 'REG' ? (rlsi.components?.adRatio ?? undefined) : undefined,
                        volumeBreadth: rlsi.session === 'REG' ? (rlsi.components?.volumeBreadth ?? undefined) : undefined,
                        breadthSignal: rlsi.session === 'REG' ? (rlsi.components?.breadthSignal ?? undefined) : undefined,
                        // [V6.0] Enhanced Rotation Intelligence
                        rotationRegime: ri.regime,
                        topInflow5d: ri.topInflow.length > 0 ? formatTopFlows('inflow') : undefined,
                        topOutflow5d: ri.topOutflow.length > 0 ? formatTopFlows('outflow') : undefined,
                        noiseWarning: ri.noiseFlags?.join(', ') || undefined,
                        trendVsToday: detectBounceWarning(),
                        rotationConviction: ri.conviction,
                        signalConflict,
                        // [V8.0] Market News Headlines
                        marketNewsHeadlines: marketNews.length > 0 ? marketNews : undefined,
                        // [V9.0] Macro Intelligence — full asset class context
                        fearGreedScore: rlsi.components?.sentimentScore ?? undefined,
                        fearGreedRating: rlsi.components?.sentimentSource?.replace('CNN F&G: ', '') ?? undefined,
                        spxChangePct: macro?.factors?.spx?.chgPct ?? undefined,
                        dxy: macro?.dxy ?? undefined,
                        goldChangePct: macro?.factors?.gold?.chgPct ?? undefined,
                        oilChangePct: macro?.factors?.oil?.chgPct ?? undefined,
                        btcChangePct: macro?.factors?.btc?.chgPct ?? undefined,
                        tltChangePct: macro?.tltChangePct ?? undefined,
                        // [V10.0] GAMMA SHIELD — Options-based volatility intelligence
                        gexIndex: gammaShieldData?.gexIndex ?? undefined,
                        gexLevel: gammaShieldData?.gexLevel ?? undefined,
                        squeezeRisk: gammaShieldData?.squeezeRisk ?? undefined,
                        squeezeLevel: gammaShieldData?.squeezeLevel ?? undefined,
                        triggerSupport: gammaShieldData?.supportWall ?? undefined,
                        triggerResistance: gammaShieldData?.resistanceWall ?? undefined,
                        triggerCurrent: gammaShieldData?.currentPrice ?? undefined,
                        gammaFlipPoint: gammaShieldData?.gammaFlipPoint ?? undefined,
                        // ★ 「평소와 무엇이 다른가」 — AI 가 할 말이 없던 진짜 이유였다.
                        //   화면이 이미 보여 주는 숫자만 주니 AI 는 그걸 다시 읽어 줄 수밖에 없었다.
                        //   백분위는 이미 계산해 두고 프리미엄 카드에서만 쓰고 있었다(Redis 1회 읽기).
                        gexChange: gammaShieldData?.gexChange ?? undefined,
                        spyGexIndex: gammaShieldData?.spyGexIndex ?? undefined,
                        qqqGexIndex: gammaShieldData?.qqqGexIndex ?? undefined,
                        ...(await (async () => {
                            try {
                                const { getDealerGamma } = await import('@/services/dealerGamma');
                                const dg = await getDealerGamma('SPY',
                                    gammaShieldData?.gammaFlipPoint ?? null,
                                    gammaShieldData?.currentPrice ?? null);
                                return dg
                                    ? { gexPercentile: dg.percentile ?? undefined, gexSamples: dg.samples ?? undefined }
                                    : {};
                            } catch { return {}; }
                        })()),
                        // [V13.0] DIVERGENCE CONTEXT — pass to AI for divergence-aware analysis
                        ...divergenceForAi,
                        // [V14.0] Institutional Flow Score per sector — for rotation accuracy
                        sectorIFS: flows.filter(f => f.instFlow).map(f => ({
                            id: f.id,
                            ifs: f.instFlow!.ifs,
                            divergence: f.instFlow!.divergence
                        })),
                        stealthAlert: flows.filter(f => f.instFlow?.divergence === 'DIVERGENT' && f.change < 0 && f.instFlow!.ifs > 20)
                            .map(f => `${f.name}: ${f.change.toFixed(1)}% but IFS +${f.instFlow!.ifs.toFixed(0)}`)[0] || undefined,
                        exitAlert: flows.filter(f => f.instFlow?.divergence === 'DIVERGENT' && f.change > 0 && f.instFlow!.ifs < -20)
                            .map(f => `${f.name}: +${f.change.toFixed(1)}% but IFS ${f.instFlow!.ifs.toFixed(0)}`)[0] || undefined,
                    };

                    // ★2026-10-04 생성 재료의 화면 숫자 — 자리표를 채우는 값이자 글의 기준(basis)
                    const aiNums = guardianNumsFromAiContext(aiContext);
                    const [rotationText, realityText, gammaText] = await Promise.all([
                        // ⚠️ 예전엔 실패 시 «Insight generation failed. …» 영어 문장을 돌려줬고, 그게 ko/ja 화면에 그대로 나갔다.
                        //    실패해도 «검사를 통과한 마지막 정상본 → 번역 → 안내 문구» 중 하나만 나간다.
                        IntelligenceNode.generateRotationInsight(aiContext).catch(e => {
                            console.error("[Guardian] Rotation AI failed:", e);
                            return IntelligenceNode.recoverInsight('rotation', locale, { nums: aiNums });
                        }),
                        IntelligenceNode.generateRealityInsight(aiContext).catch(e => {
                            console.error("[Guardian] Reality AI failed:", e);
                            return IntelligenceNode.recoverInsight('reality', locale, { nums: aiNums });
                        }),
                        IntelligenceNode.generateGammaInsight(aiContext).catch(e => {
                            console.error("[Guardian] Gamma AI failed:", e);
                            return IntelligenceNode.recoverInsight('gamma', locale, { nums: aiNums });
                        })
                    ]);

                    // [PART 3] Construct Verdict
                    if (rotationText.includes("NO KEY")) {
                        verdict = {
                            title: VERDICT_TEXTS.SETUP_REQUIRED[locale].title,
                            description: VERDICT_TEXTS.SETUP_REQUIRED[locale].desc,
                            sentiment: 'NEUTRAL'
                        };
                    } else {
                        // [FIX] Sanitize AI text: strip emoji that breaks Upstash Redis REST API
                        const cleanRotation = rotationText.replace(/[\u{10000}-\u{10FFFF}]/gu, '').replace(/[\u2600-\u27BF\u2B50\u2934\u2935\u25AA-\u25FE\u2700-\u27BF\uFE0F]/g, '').trim();
                        const cleanReality = realityText.replace(/[\u{10000}-\u{10FFFF}]/gu, '').replace(/[\u2600-\u27BF\u2B50\u2934\u2935\u25AA-\u25FE\u2700-\u27BF\uFE0F]/g, '').trim();
                        const cleanGamma = gammaText.replace(/[\u{10000}-\u{10FFFF}]/gu, '').replace(/[\u2600-\u27BF\u2B50\u2934\u2935\u25AA-\u25FE\u2700-\u27BF\uFE0F]/g, '').trim();
                        
                        // [V13.0] Divergence-aware verdict:
                        // - Title: Use divergence title (DIVERGENCE DETECTED) when divergent, else TACTICAL INSIGHT
                        // - Description: Always use AI-generated text (now divergence-aware)
                        // - Sentiment: Use divergence sentiment when divergent
                        const isDivergent = divCase.isDivergent && rlsi.session === 'REG';
                        verdict = {
                            title: isDivergent ? divCase.verdictTitle : "TACTICAL INSIGHT",
                            description: cleanRotation, // Sidebar — AI-generated, divergence-aware
                            sentiment: isDivergent 
                                ? (divCase.caseId === 'B' ? 'BULLISH' : 'BEARISH')
                                : 'NEUTRAL',
                            realityInsight: cleanReality, // Center — AI-generated, divergence-aware
                            gammaInsight: cleanGamma
                        };
                        // ★2026-10-04 자리표 원본·기준을 판정에 같이 둔다 — 출구(스냅샷·ai_verdict)가 그 응답의 화면 값으로 다시 채운다.
                        const stripEmoji = (t: string) => t.replace(/[\u{10000}-\u{10FFFF}]/gu, '').replace(/[\u2600-\u27BF\u2B50\u2934\u2935\u25AA-\u25FE\u2700-\u27BF\uFE0F]/g, '').trim();
                        const nRot = IntelligenceNode.numbersFor('rotation', locale, rotationText);
                        const nRea = IntelligenceNode.numbersFor('reality', locale, realityText);
                        const nGam = IntelligenceNode.numbersFor('gamma', locale, gammaText);
                        if (nRot || nRea || nGam) {
                            verdict.num = {
                                tpl: {
                                    ...(nRot ? { description: stripEmoji(nRot.tpl) } : {}),
                                    ...(nRea ? { realityInsight: stripEmoji(nRea.tpl) } : {}),
                                    ...(nGam ? { gammaInsight: stripEmoji(nGam.tpl) } : {}),
                                },
                                basis: {
                                    ...(nRot ? { description: nRot.basis } : {}),
                                    ...(nRea ? { realityInsight: nRea.basis } : {}),
                                    ...(nGam ? { gammaInsight: nGam.basis } : {}),
                                },
                            };
                        }
                        // ★2026-09-29 저장 전 출구 검사 — 생성기가 이미 검사하지만, 이 키(24h)는 장외 내내 그대로 나가고
                        //   마케팅·콘텐츠 생성기도 직접 읽는다. 검사를 통과한 글만 저장한다.
                        verdict = (await IntelligenceNode.repairVerdictTexts(verdict, locale, 'new-verdict', aiNums)).verdict;
                        // [V12.0] Persist AI verdict to Redis for after-hours display & deploy survival
                        //   대기 문구(«준비 중»)가 된 칸은 직전 저장본의 정상 글을 살려서 저장한다 — 밤새 «준비 중»으로 굳지 않게.
                        const hasPlaceholder = [verdict.description, verdict.realityInsight, verdict.gammaInsight]
                            .some((t) => IntelligenceNode.isPlaceholderInsight(t));
                        await saveAiVerdict(
                            hasPlaceholder ? IntelligenceNode.keepRealTextOverPlaceholders(verdict, await loadAiVerdict(locale), locale, aiNums) : verdict,
                            locale,
                        );
                    }
                } catch (e) {
                    console.warn("[Guardian] AI Verdict Failed, using fallback:", e);
                    // [V13.0] Even on AI failure, use divergence info if available
                    if (divCase.isDivergent && rlsi.session === 'REG') {
                        verdict = {
                            title: divCase.verdictTitle,
                            description: divCase.verdictDesc,
                            sentiment: divCase.caseId === 'B' ? 'BULLISH' : 'BEARISH'
                        };
                    } else {
                        verdict = staticVerdict;
                    }
                }
            }
            console.log("[Guardian] Step 3 Complete. AI Verdict Generated.");

            const context: GuardianContext = {
                rlsi,
                market: macro,
                sectors: flows,
                vectors: vectors || [],
                verdict,
                divergence: divCase,
                verdictSourceId: sourceId,
                verdictTargetId: targetId,
                marketStatus: parts.marketStatus,
                rvol: { ndx: rvolNdx, dow: rvolDow },
                // rvol 과 «다른 지표»다. 같은 자리에 섞지 않는다.
                ma20Breadth,
                rotationIntensity,
                ruleVerdict: parts.ruleVerdict, // [V6.0] 규칙 기반 핵심 결론
                tripleA: parts.tripleA,     // [V6.0] 체크리스트 포함
                // [V7.0] Market Breadth — 코어가 만든 실수치(advancers/decliners/totalTickers 포함)
                breadth: core.breadth,
                rlsiHistory: core.rlsiHistory,  // [V9.0] Intraday sparkline data
                gammaShield: gammaShieldData,  // [V10.0] Market-wide volatility intelligence
                timestamp: new Date().toISOString(),
                coreAt: core.timestamp   // ★2026-10-08 이 컨텍스트의 숫자가 나온 코어의 계산 시각 — 응답 출구가 더 새 코어로 맞출지 판단한다
            };

            // [MAP FLAP FIX] Never cache a degraded context (empty sectors = Polygon
            // snapshot failure). Caching it poisoned Redis for up to 10min and made the
            // map/sector-intel vanish on every client until TTL expiry. A degraded
            // compute may be served once, but the next request must recompute.
            const hasSectors = Array.isArray(context.sectors) && context.sectors.length > 0;

            if (!force && hasSectors) {
                _cachedContext[locale] = context;
                _lastFetchTime[locale] = now;
            }

            // [V12.0] Write back to Redis for EC2 Worker / other instances
            if (hasSectors) {
                try {
                    const redisTtl = context.rlsi?.session === 'REG' ? 120 : 600; // 2min REG, 10min EXT
                    await setInCache(`${GUARDIAN_SNAPSHOT_PREFIX}${locale}`, { ...context, _source: 'vercel' }, redisTtl);
                } catch { /* Redis write failure is non-critical */ }
                // [LAST GOOD] Long-TTL copy so vendor outages can never blank the UI:
                // when every fresh compute fails, this is the "직전 정상 데이터" we serve.
                try {
                    _lastGoodWriteTime[locale] = now;
                    await setInCache(`${GUARDIAN_SNAPSHOT_PREFIX}lastgood:${locale}`, { ...context, _source: 'vercel-lastgood' }, 72 * 60 * 60);
                } catch { /* non-critical */ }
            } else {
                // [LAST GOOD] Degraded compute (Polygon snapshot outage). Serving an
                // empty map is worse than serving the last good snapshot — fall back.
                const mem = _cachedContext[locale] as any;
                if (mem?.sectors?.length) {
                    console.warn(`[Guardian] Degraded compute for ${locale} — serving in-memory last-good instead.`);
                    return mem;
                }
                try {
                    const lastGood = await getFromCache<any>(`${GUARDIAN_SNAPSHOT_PREFIX}lastgood:${locale}`);
                    if (lastGood?.sectors?.length) {
                        console.warn(`[Guardian] Degraded compute for ${locale} — serving Redis last-good (ts: ${lastGood.timestamp}).`);
                        return lastGood;
                    }
                } catch { /* fall through to degraded */ }
                console.warn(`[Guardian] Degraded context (sectors empty) for ${locale} — no last-good available, serving once only.`);
            }

            console.log("[Guardian] Context Refresh Complete.");
            return context;

        } catch (error) {
            console.error("[Guardian] Unified Stream Error:", error);
            throw error;
        }
    }

    /**
     * ★2026-10-08 언어와 무관한 숫자를 «새로» 계산한다 — 공유 코어(getSharedCore)가 필요할 때만 부른다.
     * 예전엔 이 계산이 언어마다 따로 돌아(computeGuardianSnapshot 안) ko·ja·en 숫자가 시점 차이로 갈렸다(RLSI 42.7·43.4·46.3).
     * 본문은 옮기기만 했다 — 호출 순서·벤더·가드는 그대로.
     */
    static async computeCoreNow(force: boolean): Promise<GuardianCore> {
        // === STEP 1: PARALLEL DATA FETCHING (Optimization) ===
        // [V5.0] Changed order: Sector first, then RLSI with RIS score
        console.log("[Guardian V5.0] Step 1: Fetching Sector Flows & Macro in Parallel...");
        const [sectorResult, macro, rvolNdx, rvolDow, polygonNews, fmpGeneralNews, gammaShieldData, ma20Breadth] = await Promise.all([
            SectorEngine.getSectorFlows(),
            getMacroSnapshotSSOT(),
            RvolEngine.getRvol("QQQ"),
            RvolEngine.getRvol("DIA"),
            // [V11.0] Polygon: stock/sector-specific news
            fetchMassive('/v2/reference/news', { ticker: 'SPY,QQQ,DIA,TLT,GLD', limit: '15', order: 'desc', sort: 'published_utc' }, true)
                .then((res: any) => (res?.results || []).map((n: any) => {
                    const title = n.title || '';
                    const desc = n.description ? ` — ${n.description.slice(0, 120)}` : '';
                    return title + desc;
                }).filter(Boolean))
                .catch(() => [] as string[]),
            // [V11.1] FMP General News: macro/geopolitical events (Trump, Fed, CPI, trade war, etc.)
            (async () => {
                try {
                    const fmpKey = process.env.FMP_API_KEY;
                    if (!fmpKey) return [] as string[];
                    const res = await fetch(
                        `https://financialmodelingprep.com/stable/news/general-latest?limit=8&apikey=${fmpKey}`,
                        { signal: AbortSignal.timeout(5000) }
                    );
                    if (!res.ok) return [] as string[];
                    const data = await res.json();
                    if (!Array.isArray(data)) return [] as string[];
                    return data.map((n: any) => n.title || '').filter(Boolean).slice(0, 5);
                } catch { return [] as string[]; }
            })(),
            // [V10.0] GAMMA SHIELD — market-wide GEX/squeeze/trigger band
            getGammaShield(force).catch(e => { console.warn('[Guardian] GammaShield failed:', e.message); return null; }),
            // ★ 지수 브레드스 (구성종목 중 20일 이평 위 비율)
            //   화면의 「NDX 20D」·「DOW 20D」 게이지가 라벨·도움말로는
            //   브레드스라고 말하면서 실제로는 RVOL 을 그리고 있었다.
            //   RVOL 은 정규장 지표라 장 밖엔 «—» 인데, 브레드스는 종가로
            //   계산하므로 **주말에도 나와야 하는 값**이다.
            getIndexBreadth().catch(() => ({
                ndx: { pctAbove20: null, covered: 0, universe: 100, asOf: null },
                dow: { pctAbove20: null, covered: 0, universe: 30, asOf: null },
            }))
        ]);

        // Merge Polygon + FMP news with deduplication
        const mergedNews: string[] = [...polygonNews];
        for (const fmpTitle of fmpGeneralNews) {
            const isDup = mergedNews.some(existing => {
                const a = existing.toLowerCase().slice(0, 60);
                const b = fmpTitle.toLowerCase().slice(0, 60);
                return a.includes(b.slice(0, 30)) || b.includes(a.slice(0, 30));
            });
            if (!isDup) mergedNews.push(fmpTitle);
        }
        const marketNews = mergedNews.slice(0, 12);
        if (fmpGeneralNews.length > 0) {
            console.log(`[Guardian] News merged: Polygon ${polygonNews.length} + FMP ${fmpGeneralNews.length} → ${marketNews.length} headlines`);
        }

        const { flows, vectors, source, target, sourceId, targetId, rotationIntensity } = sectorResult;
        console.log(`[Guardian V5.0] Step 1 Complete. RIS: ${rotationIntensity.score}, Direction: ${rotationIntensity.direction}`);

        // === STEP 2: RLSI V2.0 WITH GAMMA + RIS INTEGRATION ===
        // [V2.0] Pass rotation score AND gamma shield data to RLSI
        console.log("[Guardian V2.0] Step 2: Calculating RLSI V2.0 with Gamma+CrossAsset+ZScore+McClellan...");
        const rlsi = await calculateRLSI(force, rotationIntensity.score, gammaShieldData);
        console.log(`[Guardian V2.0] Step 2 Complete. RLSI: ${rlsi.score}, Regime: ${rlsi.regime}, Gamma: ${rlsi.gammaAdjustment}, Z: ${rlsi.zScore ?? 'N/A'}`);

        // [V9.0] Append RLSI history for intraday sparkline
        const rlsiHistory = await appendRlsiHistory(rlsi.score, rlsi.session);

        // Market Breadth 실수치 (advancers/decliners/totalTickers). RLSI 가 이미
        // 같은 호출을 했으므로 메모리 캐시에서 즉시 반환된다.
        // ⚠️ 예전에는 advancers/decliners/totalTickers 를 **0 으로 하드코딩**하고
        //    «populated by breadthEngine cache» 라는 주석만 달려 있었다.
        //    그런데 그 자리를 채워 주는 코드가 어디에도 없어서, 가디언의
        //    Market Breadth 패널은 항상 «0↑ / 0↓ / 총 0» 이었다.
        //    → breadthEngine 은 메모리+Redis 캐시라 재호출이 사실상 공짜다. 직접 읽는다.
        const breadthSnapshot = await getMarketBreadth(macro?.nqChangePercent || 0).catch(() => null);

        return {
            v: 1,
            timestamp: new Date().toISOString(),
            session: rlsi.session,
            rlsi,
            market: macro,
            sectors: flows,
            vectors: vectors || [],
            sourceId,
            targetId,
            rvol: { ndx: rvolNdx, dow: rvolDow },
            // rvol 과 «다른 지표»다. 같은 자리에 섞지 않는다.
            ma20Breadth,
            rotationIntensity,
            breadth: {
                advancers: breadthSnapshot?.advancers ?? 0,
                decliners: breadthSnapshot?.decliners ?? 0,
                unchanged: breadthSnapshot?.unchanged ?? 0,
                totalTickers: breadthSnapshot?.totalTickers ?? 0,
                breadthPct: breadthSnapshot?.breadthPct ?? rlsi.components?.breadthPct ?? 50,
                adRatio: breadthSnapshot?.adRatio ?? rlsi.components?.adRatio ?? 1,
                volumeBreadth: breadthSnapshot?.volumeBreadth ?? rlsi.components?.volumeBreadth ?? 50,
                signal: breadthSnapshot?.signal ?? rlsi.components?.breadthSignal ?? 'NEUTRAL',
                isDivergent: breadthSnapshot?.isDivergent ?? rlsi.components?.breadthDivergent ?? false,
                // 화면이 «기본값인가»를 숫자로 추측하지 않도록 명시 전달
                hasData: breadthSnapshot?.hasData ?? false
            },
            rlsiHistory,  // [V9.0] Intraday sparkline data
            gammaShield: gammaShieldData,  // [V10.0] Market-wide volatility intelligence
            news: marketNews,
        };
    }

}
