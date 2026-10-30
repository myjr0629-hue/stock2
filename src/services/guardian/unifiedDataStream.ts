import { fmpFetch } from '@/lib/fmpClient';
import { buildIndexFacts, hasFuturesSinceCloseFact, mergePostIndexBasis, postTacticalMayLackFutures, postTacticalMayDriftFutures, postTacticalNeedsDriftRefresh, tacticalSessionAt, regTacticalNeedsRefresh, REG_TACTICAL_RETRY_MS, type TacticalFuturesPct, type PostTacticalFuturesState } from '@/lib/ai/tacticalIndexFacts';
import { reserveRegTacticalRefresh, finishRegTacticalRefresh } from '@/lib/ai/postTacticalRefreshBudget';
import { filterMarketHeadlines } from '@/lib/ai/tacticalNews';
import { guardianCashChange } from '@/lib/marketIndexBasis';
import { loadMarketIndexBasis } from '@/services/marketIndexBasis';
import { datedHeadline, cachedEvidence, buildTacticalPrompt } from '@/lib/ai/tacticalPrompt';
import { rotationFactsFrom } from '@/lib/ai/rotationPrompt';
import { calculateRLSI, RLSIResult, getMarketSession, MarketSession } from "./rlsiEngine";
// [FIX] Import getMarketSession for cache session validation
import { SectorEngine, SectorFlowRate, GuardianVerdict, FlowVector, RotationIntensity } from "./sectorEngine";
import { getMacroSnapshotSSOT, MacroSnapshot } from "@/services/macroHubProvider";
import { guardianNumsFromAiContext, guardianNumsFromContext, guardianNumsFromMarket, type GNums } from '@/lib/ai/guardianNumbers';
import { sectorLabelForAi } from '@/lib/ai/sectorLabels';
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
import { Redis } from '@upstash/redis';
import { tryBackgroundLock, releaseBackgroundLock } from '@/lib/cache/staleLock';
// ★2026-10-08 언어와 무관한 숫자는 «공유 코어» 하나 — 같은 시각 ko·ja·en 의 RLSI·GEX 가 갈리던 것을 막는다(guardianCore.ts 머리말)
import {
    CORE_KEY, CORE_LOCK_KEY, CORE_LOCK_MS, VERDICT_TEXTS, deriveLocaleParts, getSharedCore, overlayCore,
    withCashIndexBasis, type CoreDeps, type GuardianCore,
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
    /**
     * ★2026-10-28 T2 장후(POST) 스냅샷에만 — 이 스냅샷의 Tactical 글이 «종가 이후 선물 사실이 있는 재료»로 만들어졌나.
     *   스냅샷은 세션 전환 때 한 번 계산된 뒤 워커가 도장만 갱신하므로, false 인데 지금 선물 사실이 있으면 다시 계산한다.
     */
    tacticalFutures?: boolean;
    /** 글을 만들 때 INDEX_FACTS의 종가 대비 선물 변화율(pp). 옛 스냅샷에는 없음. */
    tacticalFuturesPct?: TacticalFuturesPct;
    /** 워커가 갱신하는 도장과 별개인 마지막 변동 재계산 시각(실패 포함). */
    tacticalFuturesCheckedAt?: string;
    /** 이 스냅샷이 살펴본 가장 새 Tactical 저장본 시각(ISO). 저장소에 이보다 새 글이 있으면 30분 간격과 무관하게 채택한다(관문 10281110). 없으면 timestamp. */
    tacticalSeenAt?: string;
}

// === CACHE CONFIG (per-locale to prevent AI text cross-contamination) ===
const _cachedContext: Record<Locale, GuardianContext | null> = { ko: null, en: null, ja: null };
const _lastFetchTime: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
// [LAST GOOD] Throttle for refreshing the long-TTL last-good snapshot copy
const _lastGoodWriteTime: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
const CACHE_TTL_MS = 25 * 1000; // 25 seconds — matches 30s polling interval

/**
 * ★2026-10-31 T35 장중 «준비 중» 고정 — 스냅샷의 AI 글 칸이 대기 문구인데 장중(PRE·REG·POST)이면 다시 계산한다.
 *   10/30 실측: ko Tactical NEXT 가 «10/30(금) 12:00 ET Fed Daly 연설»(11:52 ET 생성). 12:00 ET 가 지나자 출구 검사가
 *   (지난 일정을 «다음»으로 내보내지 않게) 정상적으로 탈락시켜 «준비 중»으로 바꿨는데, EC2 워커가 30초마다 그 스냅샷에
 *   _workerTimestamp 만 새로 찍어 «신선»으로 남겨 재계산(=재생성)이 한 번도 일어나지 않았다(ko 15:53Z·en 15:25Z·ja 13:30Z 스냅샷이 17:12Z 까지).
 *   대기 문구 칸은 출구 검사를 통과(검사 대상 아님)하므로 스스로는 풀리지 않는다.
 *   재계산 간격은 스냅샷 «계산 시각»(timestamp, 워커 도장 아님) 기준 5분 — 생성이 계속 실패해도 언어당 5분에 한 번만.
 *   장외(CLOSED)는 모델을 부르지 않는 경로라 대상 아님.
 */
export const PLACEHOLDER_RECOMPUTE_MS = 5 * 60 * 1000;
export function snapshotPlaceholderNeedsRecompute(
    c: { timestamp?: string; verdict?: { description?: unknown; realityInsight?: unknown; gammaInsight?: unknown } | null } | null | undefined,
    session: string | undefined, now: number,
): boolean {
    if (!c?.verdict || !session || session === 'CLOSED') return false;
    const v = c.verdict;
    const pending = [v.realityInsight, v.description, v.gammaInsight].some((t) => typeof t === 'string' && IntelligenceNode.isPlaceholderInsight(t));
    if (!pending) return false;
    const at = c.timestamp ? Date.parse(c.timestamp) : NaN;
    return !Number.isFinite(at) || now - at >= PLACEHOLDER_RECOMPUTE_MS;
}
/** ★T35-B 정기 재생성 결과가 대기 문구면 직전 스냅샷의 장중 글·생성 기준을 그대로 둔다(«실패 시 기존 글 유지»). 출구 검사는 그 뒤에 다시 돈다. */
export function keepRegTacticalOnFailure(
    next: { verdict?: any; tacticalSeenAt?: string; timestamp?: string },
    previous: { verdict?: any; tacticalSeenAt?: string; timestamp?: string },
): boolean {
    const now = next.verdict?.realityInsight, old = previous.verdict?.realityInsight;
    if (!next.verdict || typeof old !== 'string' || !old || IntelligenceNode.isPlaceholderInsight(old)) return false;
    if (typeof now === 'string' && now && !IntelligenceNode.isPlaceholderInsight(now)) return false;
    const tpl = { ...next.verdict.num?.tpl }, basis = { ...next.verdict.num?.basis };
    if (previous.verdict?.num?.tpl?.realityInsight !== undefined) tpl.realityInsight = previous.verdict.num.tpl.realityInsight; else delete tpl.realityInsight;
    if (previous.verdict?.num?.basis?.realityInsight !== undefined) basis.realityInsight = previous.verdict.num.basis.realityInsight; else delete basis.realityInsight;
    next.verdict = { ...next.verdict, realityInsight: old, num: { ...next.verdict.num, tpl, basis } };
    // 생성 시각도 옛 글의 것 — 30분 간격·변화 판정이 옛 글 기준으로 이어지게(예약 간격이 재시도를 30분 뒤로 민다)
    next.tacticalSeenAt = previous.tacticalSeenAt || previous.timestamp;
    return true;
}

/** 정기 재생성 재계산 결과 정리 — 대기 문구면 기존 글 유지(keepRegTacticalOnFailure). 새 정상 글로 바뀐 경우만 true(예약 성공), 유지·같은 글(복구본)은 false(60분 대기·연속 2회 중지). */
export function settleRegTacticalRefresh(next: { verdict?: any; tacticalSeenAt?: string; timestamp?: string }, previous: { verdict?: any; tacticalSeenAt?: string; timestamp?: string }): boolean {
    if (keepRegTacticalOnFailure(next, previous)) return false;
    const now = next.verdict?.realityInsight;
    return typeof now === 'string' && !!now && !IntelligenceNode.isPlaceholderInsight(now) && now !== previous.verdict?.realityInsight;
}

/**
 * 대기 문구 재계산 시도 간격(관문 10310216·10310219) — 재계산이 실패해 스냅샷 timestamp 가 그대로여도 언어당 5분에 한 번만.
 *   인스턴스 메모리 + 인스턴스 간 원자적 예약(Upstash SET NX EX — 지터 없는 정확한 300초, 동시에 읽어도 한 곳만 성공).
 *   예약 저장소에 못 닿으면 인스턴스 메모리 간격만 쓴다(예전 경로보다 호출이 늘지 않게 언어당 5분/인스턴스).
 */
const _placeholderRecomputeAt: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
const PLACEHOLDER_CLAIM_RETRY_MS = 30 * 1000;
let _placeholderClaimRedis: Redis | null | undefined;
function claimRedis(): Redis | null {
    if (_placeholderClaimRedis === undefined) {
        const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
        _placeholderClaimRedis = url && token ? new Redis({ url, token }) : null;
    }
    return _placeholderClaimRedis;
}
/** 'exclusive' = 인스턴스 간 원자 예약 성공(20초 잠금 우회 가능) · 'local' = 예약 저장소 없음·장애(인스턴스 간격만 — 기존 20초 잠금·lastgood 그대로, 관문 10310224) · false = 지금은 아님 */
async function claimPlaceholderRecompute(locale: Locale, now: number): Promise<'exclusive' | 'local' | false> {
    if (now - _placeholderRecomputeAt[locale] < PLACEHOLDER_RECOMPUTE_MS) return false;
    _placeholderRecomputeAt[locale] = now;
    if (!claimRedis()) return 'local';
    try {
        const ok = await claimRedis()!.set(`guardian:snapshot:phrecompute:${locale}`, now, { nx: true, ex: Math.ceil(PLACEHOLDER_RECOMPUTE_MS / 1000) });
        // 다른 인스턴스가 예약 중이면 이 인스턴스는 30초 뒤 다시 묻는다(공유 예약 만료 뒤 최대 5분 늦어지지 않게 — 관문 10310221 ③)
        if (ok !== 'OK') _placeholderRecomputeAt[locale] = now - PLACEHOLDER_RECOMPUTE_MS + PLACEHOLDER_CLAIM_RETRY_MS;
        return ok === 'OK' ? 'exclusive' : false;
    } catch { return 'local'; }
}

/**
 * ★2026-10-31 T35-B 장중(REG) 정기 재생성 예약 — 생성 30분 경과 && 지수 0.5%p·RLSI 5 변화(regTacticalNeedsRefresh)일 때 호출.
 *   예약은 ET 날짜 공용(모든 언어·인스턴스): 30분 간격·8회 상한·공급사 실패 60분 대기·연속 2회 중지(장후 변동 재생성과 같은 Lua).
 *   예약 저장소가 없거나 장애면 재생성하지 않는다(상한을 확인하지 못한 호출 금지 — 기존 글 유지). 같은 인스턴스·언어는 5분에 한 번만 묻는다.
 */
const _regRefreshAskAt: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
async function claimRegTacticalRefresh(locale: Locale, now: number): Promise<'exclusive' | false> {
    const last = _regRefreshAskAt[locale];
    if (now >= last && now - last < REG_TACTICAL_RETRY_MS) return false;
    _regRefreshAskAt[locale] = now;
    return await reserveRegTacticalRefresh(claimRedis(), now) ? 'exclusive' : false;
}
/** 다른 언어·인스턴스의 정기 재생성이 저장한 더 새 장중 글이 있나(GET 한 번, 인스턴스·언어별 30초 간격) */
const _regAdoptCheckAt: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
async function regTacticalHasNewerStored(c: { tacticalSeenAt?: string; timestamp?: string } | null | undefined, session: string | undefined, locale: Locale, now: number): Promise<boolean> {
    if (!c || session !== 'REG') return false;
    const last = _regAdoptCheckAt[locale];
    if (now >= last && now - last < POST_TACTICAL_ADOPT_CHECK_MS) return false;
    _regAdoptCheckAt[locale] = now;
    const latest = await IntelligenceNode.latestStoredRegTacticalAt(locale, now).catch(() => null);
    return latest != null && latest > tacticalSeenAtOf(c);
}

/**
 * ★2026-10-28 T2 장후 스냅샷의 Tactical 글이 «종가 이후 선물 사실 없이» 만들어졌는데 지금은 그 사실이 있다 → 다시 계산.
 *   10/27 실측: 기준 키는 16:10 ET 무렵 EC2·Upstash 둘 다 저장됐지만 글은 16:01 ET 스냅샷 그대로 장후 내내 «종가 이후 변화 미확인».
 *   선물 사실 없는 글은 기존 5분 재시도, 생성 기준 있는 글은 30분 뒤 변동을 비교한다.
 *   값싼 판정을 통과할 때만 지수 기준을 읽는다(캐시 읽기만 — 공급사 호출 0).
 */
async function postTacticalNeedsFutures(c: PostTacticalFuturesState | null | undefined, session: string | undefined, now: number): Promise<boolean> {
    const lacks = postTacticalMayLackFutures(c, session, now);
    if (!lacks && !postTacticalMayDriftFutures(c, session, now)) return false;
    const basis = await loadMarketIndexBasis(now).catch(() => null);
    if (lacks) return hasFuturesSinceCloseFact(basis, now);
    const pct = Object.fromEntries(buildIndexFacts(basis ?? undefined, 'POST', now).filter(f => f.kind === 'futures').map(f => [f.id, f.chgPct]));
    return postTacticalNeedsDriftRefresh(c, session, now, pct);
}

/** 저장본 채택 검사(GET 한 번) 최소 간격 — 인스턴스·언어별. 모델 호출 없음. 30분 재생성 간격과 별개. */
const POST_TACTICAL_ADOPT_CHECK_MS = 30 * 1000;
const _tacticalAdoptCheckAt: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
/** 시험 전용 — 인스턴스 메모리(스냅샷 사본·채택 검사 간격)를 비워 «다른 인스턴스»를 흉내 낸다. */
export function _resetGuardianHubStateForTest(): void {
    for (const l of ['ko', 'en', 'ja'] as const) { _cachedContext[l] = null; _lastFetchTime[l] = 0; _tacticalAdoptCheckAt[l] = 0; _placeholderRecomputeAt[l] = 0; _regRefreshAskAt[l] = 0; _regAdoptCheckAt[l] = 0; }
    _placeholderClaimRedis = undefined;
}
const tacticalSeenAtOf = (c: { tacticalSeenAt?: string; timestamp?: string }): number => {
    const at = Date.parse(c.tacticalSeenAt || c.timestamp || '');
    return Number.isFinite(at) ? at : 0;
};
/**
 * ★2026-10-28 관문 10281110 — 다른 인스턴스가 변동 재생성으로 저장한 새 Tactical 이 있나(생성 시각이 이 스냅샷이 본 글보다 늦음).
 *   예약 거절 쪽 스냅샷이 30분 간격에 묶여 새 정상본을 두고 옛 «보합» 글을 계속 내보내던 경로. 생성 기준이 있는 POST 스냅샷만(옛 스냅샷·다른 세션 기존 동작).
 */
async function postTacticalHasNewerStored(c: (PostTacticalFuturesState & { tacticalSeenAt?: string }) | null | undefined, session: string | undefined, locale: Locale, now: number): Promise<boolean> {
    if (!c || session !== 'POST' || c.tacticalFutures !== true || !c.tacticalFuturesPct) return false;
    const last = _tacticalAdoptCheckAt[locale];
    if (now >= last && now - last < POST_TACTICAL_ADOPT_CHECK_MS) return false;
    _tacticalAdoptCheckAt[locale] = now;
    const latest = await IntelligenceNode.latestStoredTacticalAt(locale, now).catch(() => null);
    return latest != null && latest > tacticalSeenAtOf(c);
}

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

/**
 * ★2026-10-24 장외 순환매 v3 승격용 생성 재료 — 공유 코어만으로(공급사 호출 없음). 장중 aiContext 의 순환매 관련 필드와 같은 출처.
 *   장외 경로(저장 판정·스냅샷 출구)는 aiContext 를 만들지 않아 여기서 만든다.
 */
function offHoursRotationContext(core: GuardianCore, locale: Locale) {
    const macro = core.market, g = core.gammaShield;
    let divergenceCase: 'A' | 'B' | 'C' | 'D' | 'N' | undefined;
    try { divergenceCase = deriveLocaleParts(core, locale).divCase.caseId as typeof divergenceCase; } catch { divergenceCase = undefined; }
    return {
        rlsiScore: core.rlsi.score, nasdaqChange: macro?.nqChangePercent || 0, indexBasis: macro?.indexBasis, session: core.rlsi.session,
        vectors: core.vectors?.map(v => ({ source: v.sourceId, target: v.targetId, strength: v.strength })) || [],
        vix: macro?.vix || 0, locale,
        us10yChangeBp: us10yChangeBp(macro?.factors?.us10y),
        dxy: macro?.dxy ?? undefined,
        goldChangePct: macro?.factors?.gold?.chgPct ?? undefined,
        oilChangePct: macro?.factors?.oil?.chgPct ?? undefined,
        btcChangePct: macro?.factors?.btc?.chgPct ?? undefined,
        tltChangePct: macro?.tltChangePct ?? undefined,
        gexIndex: g?.gexIndex ?? undefined, gexLevel: g?.gexLevel ?? undefined, squeezeRisk: g?.squeezeRisk ?? undefined,
        triggerSupport: g?.supportWall ?? undefined, triggerResistance: g?.resistanceWall ?? undefined,
        marketNewsHeadlines: core.news?.length ? core.news : undefined, scheduledEvents: core.scheduledEvents, asOf: core.timestamp,
        divergenceCase,
        rotationFacts: rotationFactsFrom(core.rotationIntensity, core.sectors, core.vectors),
    };
}

/** 추가 공급사 호출 없이 공유 코어의 근거를 현재 시각으로 재검사한다. 결측은 그대로 둔다. */
function currentTacticalPrompts(nums: GNums, core: GuardianCore | null, gamma?: GammaShieldData | null) {
    const ctx = {
        ...nums, rlsiScore: nums.RLSI!, nasdaqChange: nums.NDX_CHG ?? null,
        indexBasis: core?.market.indexBasis,
        indexFacts: buildIndexFacts(core?.market.indexBasis, tacticalSessionAt(Date.now()), Date.now()),
        session: tacticalSessionAt(Date.now()), vix: nums.VIX!,
        marketNewsHeadlines: filterMarketHeadlines(core?.news || []), scheduledEvents: core?.scheduledEvents,
        asOf: new Date(Date.now()).toISOString(),
        triggerSupport: gamma?.supportWall, triggerResistance: gamma?.resistanceWall,
        triggerCurrent: gamma?.currentPrice, gammaFlipPoint: gamma?.gammaFlipPoint,
    };
    return (locale: Locale) => buildTacticalPrompt(ctx, locale);
}

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
        const indexBasis = await loadMarketIndexBasis();
        const rebased = withCashIndexBasis(shared.context, indexBasis, locale);
        const rebasedCore = shared.core ? { ...shared.core, market: rebased.market } : null;
        return GuardianDataHub.guardVerdictOnExit(rebased, locale, rebasedCore);
    }

    /** 응답 출구의 숫자 일치 — 코어를 못 읽으면(장애) 컨텍스트를 그대로 둔다. 절대 던지지 않는다 */
    private static async withSharedCore(context: GuardianContext, locale: Locale): Promise<{ context: GuardianContext; core: GuardianCore | null }> {
        try {
            if (!context?.rlsi) return { context, core: null };
            const core = await getSharedCore(CORE_DEPS, { mode: 'swr' });
            return { context: core ? overlayCore(context, core, locale) : context, core };
        } catch (e: any) {
            console.warn('[Guardian] shared core overlay skipped:', e?.message);
            return { context, core: null };
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
    private static async guardVerdictOnExit(context: GuardianContext, locale: Locale, core: GuardianCore | null): Promise<GuardianContext> {
        if (!context?.verdict) return context;
        // ★2026-10-04 같은 응답의 화면 숫자(market·rlsi)로 자리표를 채우고, 숫자로 박힌 지표를 대조한다(lib/ai/guardianNumbers)
        const nums = guardianNumsFromContext(context);   // ★2026-10-07 T5: 시장·RLSI + 감마 쉴드(GEX·스퀴즈)·참여폭
        const r = await IntelligenceNode.repairVerdictTexts(context.verdict, locale, 'snapshot', nums, currentTacticalPrompts(nums, core, context.gammaShield));
        // ★2026-10-24 순환매 v3 — 장외 스냅샷은 워커가 이 응답을 다시 써서 재계산 없이 돈다(저장 판정 경로를 안 탄다). 출구에서도 옛 계약 글을 승격한다
        //   (v3 저장본이 있으면 교체 · 없으면 잠금 1회 백그라운드 생성 · 실패하면 옛 글 그대로). 승격본은 워커가 스냅샷에 다시 쓴다.
        // ★2026-10-28 T2 출구에서 Tactical 글을 복구 글로 바꿨으면 장후 표식도 내린다(복구 글엔 선물 사실이 없을 수 있다 — 5분 뒤 다시 계산, 관문 10280621 ①)
        if (r.repaired.includes('realityInsight') && context.tacticalFutures === true) context = { ...context, tacticalFutures: false };
        const up = core ? await IntelligenceNode.offHoursRotationUpgrade(r.verdict, locale, nums, () => offHoursRotationContext(core, locale), (job) => CORE_DEPS.background?.(job) ?? false) : null;
        if (up) return { ...context, verdict: up };
        return r.changed ? { ...context, verdict: r.verdict } : context;
    }

    /**
     * 선물 변동으로 재생성할 때는 Tactical 한 칸만 갱신한다. 실패·예산 소진 시 기존 글과 생성 기준을 보존한다.
     *   mode 'adopt' = 다른 인스턴스가 저장한 더 새 글만 채택(모델 호출·예약 0, 30분 확인 시각을 소비하지 않음).
     *   'drift' 에서 재생성이 막혀도 저장소에 내 글보다 새 정상본이 있으면 그것을 쓴다(관문 10281110).
     */
    private static async refreshPostTacticalFutures(previous: GuardianContext, locale: Locale, now: number, mode: 'drift' | 'adopt' = 'drift'): Promise<GuardianContext> {
        const adopt = mode === 'adopt';
        const seenBefore = tacticalSeenAtOf(previous);
        let context: GuardianContext = adopt ? { ...previous } : { ...previous, tacticalFuturesCheckedAt: new Date(now).toISOString() };
        let changed = !adopt;
        try {
            const core = await getFromCache<GuardianCore>(CORE_KEY).catch(() => null);
            const basis = mergePostIndexBasis(core?.market.indexBasis ?? previous.market.indexBasis, await loadMarketIndexBasis(now).catch(() => null));
            const base = core ? offHoursRotationContext(core, locale) : {
                locale, rlsiScore: previous.rlsi.score, nasdaqChange: previous.market.nqChangePercent ?? null,
                vectors: [], vix: previous.market.vix ?? 0,
            };
            const r = await IntelligenceNode.refreshRealityForFuturesDriftDetailed({ ...base, indexBasis: basis ?? undefined,
                marketNewsHeadlines: filterMarketHeadlines(core?.news || []) }, { regen: !adopt, newerThan: seenBefore });
            const text = r.text;
            const pct = text ? IntelligenceNode.tacticalFuturesPct(locale, text) : undefined;
            if (text && pct && !IntelligenceNode.isPlaceholderInsight(text)) {
                const n = IntelligenceNode.numbersFor('reality', locale, text);
                const tpl = { ...previous.verdict.num?.tpl }, numBasis = { ...previous.verdict.num?.basis };
                delete tpl.realityInsight; delete numBasis.realityInsight;
                if (n) { tpl.realityInsight = n.tpl; numBasis.realityInsight = n.basis; }
                const at = r.at ?? now;
                context = { ...context, tacticalFuturesPct: pct, tacticalSeenAt: new Date(Math.max(seenBefore, at)).toISOString(),
                    // 채택한 글은 그 생성 시각부터 30분 뒤 변동을 비교한다(채택이 재생성 간격을 앞당기거나 미루지 않게).
                    ...(adopt ? { tacticalFuturesCheckedAt: new Date(at).toISOString() } : {}),
                    verdict: { ...previous.verdict, realityInsight: text, num: { tpl, basis: numBasis } } };
                changed = true;
                await saveAiVerdict(context.verdict, locale);
            } else if (typeof r.seenAt === 'number' && r.seenAt > seenBefore) {
                // 채택하지 못한 저장본(검사 탈락 등)은 «본 것»으로 적어 같은 글을 매번 다시 검사하지 않는다. 새 글이 저장되면 다시 본다.
                context = { ...context, tacticalSeenAt: new Date(r.seenAt).toISOString() };
                changed = true;
            }
        } catch { /* 새 글이 없으면 기존 글 유지. 확인 시각은 30분 재조회에 사용하며, 공급사 실패 시 공유 예산의 60분 대기·2회 중지를 따른다. */ }
        if (!changed) return previous;
        _cachedContext[locale] = context;
        _lastFetchTime[locale] = now;
        const stored = { ...context, _workerTimestamp: new Date(now).toISOString(), _source: 'vercel' };
        await setInCache(`${GUARDIAN_SNAPSHOT_PREFIX}${locale}`, stored, 600).catch(() => false);
        await setInCache(`${GUARDIAN_SNAPSHOT_PREFIX}lastgood:${locale}`, stored, 72 * 60 * 60).catch(() => false);
        return context;
    }

    /**
     * ★2026-10-31 T35-B 장중 — 다른 언어·인스턴스의 정기 재생성이 저장한 새 Tactical 을 이 언어 스냅샷에 채택(모델 호출 0).
     *   출구 검사를 통과한 같은 ET 날짜 REG 저장본만. 못 쓰면 «본 시각»만 적어 같은 글을 반복 검사하지 않는다. 실패하면 기존 스냅샷 그대로.
     */
    private static async adoptRegTactical(previous: GuardianContext, locale: Locale, now: number): Promise<GuardianContext> {
        const seenBefore = tacticalSeenAtOf(previous);
        let context: GuardianContext = previous;
        try {
            const core = await getFromCache<GuardianCore>(CORE_KEY).catch(() => null);
            if (!core) return previous;
            const basis = mergePostIndexBasis(core.market.indexBasis, await loadMarketIndexBasis(now).catch(() => null));
            const r = await IntelligenceNode.adoptStoredRegReality({ ...offHoursRotationContext(core, locale), indexBasis: basis ?? undefined,
                marketNewsHeadlines: filterMarketHeadlines(core.news || []) }, seenBefore);
            if (r.text && !IntelligenceNode.isPlaceholderInsight(r.text)) {
                const n = IntelligenceNode.numbersFor('reality', locale, r.text);
                const tpl = { ...previous.verdict.num?.tpl }, numBasis = { ...previous.verdict.num?.basis };
                delete tpl.realityInsight; delete numBasis.realityInsight;
                if (n) { tpl.realityInsight = n.tpl; numBasis.realityInsight = n.basis; }
                context = { ...previous, tacticalSeenAt: new Date(Math.max(seenBefore, r.at ?? now)).toISOString(),
                    verdict: { ...previous.verdict, realityInsight: r.text, num: { tpl, basis: numBasis } } };
                await saveAiVerdict(context.verdict, locale);
            } else if (typeof r.seenAt === 'number' && r.seenAt > seenBefore) {
                context = { ...previous, tacticalSeenAt: new Date(r.seenAt).toISOString() };
            } else return previous;
        } catch { return previous; }
        _cachedContext[locale] = context;
        _lastFetchTime[locale] = now;
        const stored = { ...context, _workerTimestamp: new Date(now).toISOString(), _source: 'vercel' };
        await setInCache(`${GUARDIAN_SNAPSHOT_PREFIX}${locale}`, stored, 120).catch(() => false);
        await setInCache(`${GUARDIAN_SNAPSHOT_PREFIX}lastgood:${locale}`, stored, 72 * 60 * 60).catch(() => false);
        return context;
    }

    private static async computeGuardianSnapshot(force: boolean, locale: Locale): Promise<GuardianContext> {
        const now = Date.now();

        // [V12.0] Redis-first: Check EC2 Worker's pre-cached snapshot
        // [FIX] Validate that cached session matches current session before returning
        const currentSession = getMarketSession();
        // ★T35 대기 문구 재계산이 실패하면(예외·성분 결측) 예전처럼 그 스냅샷을 그대로 준다(관문 10310216 — 응답 회귀 금지)
        let placeholderFallback: GuardianContext | null = null;
        let placeholderClaim: 'exclusive' | 'local' | false = false;
        // ★T35-B 장중 정기 재생성 예약 시각(예약을 잡았을 때만) — 재계산이 끝나면 결과를 기록하고, 새 글이 대기 문구면 기존 글을 지킨다
        let regRefreshAt = 0;
        let regDrift: string[] = [];
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
                    } else if (await postTacticalNeedsFutures(cached, cachedSession, now)) {
                        if (cached.tacticalFutures === true) return GuardianDataHub.refreshPostTacticalFutures(cached, locale, now);
                        // ★2026-10-28 T2 장후 글이 종가 이후 선물 사실 없이 만들어졌는데 지금은 있다 — 다시 계산한다
                        console.log(`[Guardian] POST tactical lacks after-close futures that are now available (snapshot ${cached.timestamp}) — recomputing for ${locale}`);
                    } else if (snapshotPlaceholderNeedsRecompute(cached, cachedSession, now) && (placeholderClaim = await claimPlaceholderRecompute(locale, now))) {
                        // ★T35 대기 문구가 굳은 스냅샷 — 워커 도장과 무관하게 다시 계산(5분 간격)
                        console.log(`[Guardian] snapshot AI text is a placeholder (snapshot ${cached.timestamp}, ${cachedSession}) — recomputing for ${locale}`);
                        placeholderFallback = cached;
                    } else if ((regDrift = regTacticalNeedsRefresh(cached, cachedSession, now, IntelligenceNode.isPlaceholderInsight)).length
                        && (placeholderClaim = await claimRegTacticalRefresh(locale, now))) {
                        // ★T35-B 장중 글이 생성 30분 뒤 지수·RLSI 가 움직였다 — 운영 생성 경로 그대로 다시 계산(예약 1회 = 3언어 1호출, 다른 언어는 저장본 채택)
                        console.log(`[Guardian] REG tactical refresh (${regDrift.join(',')} drift; text since ${cached.tacticalSeenAt || cached.timestamp}) — recomputing for ${locale}`);
                        placeholderFallback = cached;
                        regRefreshAt = now;
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
                            // ★관문 10281110 다른 인스턴스가 저장한 더 새 Tactical(변동 재생성) — 30분 간격과 무관하게 채택(모델 호출 0)
                            if (await postTacticalHasNewerStored(cached, cachedSession, locale, now)) {
                                const adopted = await GuardianDataHub.refreshPostTacticalFutures(cached, locale, now, 'adopt');
                                if (adopted !== cached) return adopted;
                            }
                            // ★T35-B 다른 언어·인스턴스의 장중 정기 재생성이 저장한 새 글 채택(모델 호출 0)
                            if (await regTacticalHasNewerStored(cached, cachedSession, locale, now)) {
                                const adopted = await GuardianDataHub.adoptRegTactical(cached, locale, now);
                                if (adopted !== cached) return adopted;
                            }
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

        // ★T35 대기 문구 재계산을 예약했으면 메모리 사본(같은 대기 문구)으로 돌아가지 않는다(관문 10310219 ①)
        if (!force && !placeholderFallback && _cachedContext[locale] && (now - _lastFetchTime[locale] < CACHE_TTL_MS)) {
            // [FIX] Also validate in-memory cache session
            const memSession = (_cachedContext[locale] as any)?.rlsi?.session;
            if (memSession && memSession !== currentSession) {
                console.log(`[Guardian FIX] In-memory session mismatch: cached=${memSession}, current=${currentSession} — recomputing for ${locale}`);
            } else if (await postTacticalNeedsFutures(_cachedContext[locale], memSession, now)) {
                if (_cachedContext[locale]!.tacticalFutures === true) return GuardianDataHub.refreshPostTacticalFutures(_cachedContext[locale]!, locale, now);
                // 위 Redis 경로와 같은 이유(T2) — 메모리 사본도 다시 계산한다
            } else {
                const mem = _cachedContext[locale]!;
                if (await postTacticalHasNewerStored(mem, memSession, locale, now)) return GuardianDataHub.refreshPostTacticalFutures(mem, locale, now, 'adopt');
                return mem;
            }
        }

        // ★2026-09-23 인스턴스 간 재계산 제한: 다른 인스턴스가 20초 안에 재계산을 시작했으면 여기서 또 계산하지 않고
        //   방금 저장된 직전 정상본(lastgood, 72h·Upstash 복제)을 준다. 재계산 한 번이 FMP 뉴스 + 137종목 시세를 부르므로
        //   인스턴스마다 따로 계산하면 벤더 분당 한도를 태운다(9/23 FMP 429). 줄 것이 없으면 그대로 계산한다.
        //   ★T35 대기 문구 재계산 예약(5분 원자 예약)을 쥔 요청은 이 20초 잠금으로 물러서지 않는다 — 예약만 소비하고 계산을 건너뛰지 않게(관문 10310221 ①)
        if (!force) {
            const lockKey = `${GUARDIAN_SNAPSHOT_PREFIX}recompute:${locale}`;
            const lockedAt = placeholderClaim === 'exclusive' ? null : await getFromCache<number>(lockKey).catch(() => null);
            if (typeof lockedAt === 'number' && now - lockedAt < 20000) {
                const mem = _cachedContext[locale] as any;
                if (mem?.sectors?.length) return mem;
                const lg = await getFromCache<any>(`${GUARDIAN_SNAPSHOT_PREFIX}lastgood:${locale}`).catch(() => null);
                if (lg?.sectors?.length && lg?.rlsi?.score !== undefined) return lg;
            } else if (placeholderClaim === 'exclusive') {
                await setInCache(lockKey, now, 20).catch(() => false);   // 예약 재계산은 잠금 기록을 기다린 뒤 계산(관문 10310231)
            } else {
                setInCache(lockKey, now, 20).catch(() => { /* non-critical */ });
            }
        }

        console.log("[Guardian] Refreshing Context (shared core)...");

        try {
            // === STEP 1~2: 언어와 무관한 숫자(섹터·시장·RVOL·감마쉴드·RLSI·참여폭)는 «공유 코어»에서 — 세 언어가 같은 숫자를 쓴다 ===
            //   (원문은 computeCoreNow — lib: services/guardian/guardianCore · 2026-10-08)
            //   force 가 아니면 'prefer' — 같은 세션의 쓸 만한 코어가 있으면 그것을 쓰고 갱신은 응답 뒤로(이 경로가 코어를 혼자 밀면 같은 순간 다른 언어와 숫자가 갈린다 · guardianCore 머리말)
            const core = await getSharedCore(CORE_DEPS, { force, mode: force ? 'fresh' : 'prefer' });
            if (!core) throw new Error('[Guardian] shared core unavailable');
            const { sectors: flows, vectors, sourceId, targetId, rotationIntensity, market: macro, rlsi, gammaShield: gammaShieldData, ma20Breadth, news: marketNews, scheduledEvents } = core;
            const rvolNdx = core.rvol.ndx;
            const rvolDow = core.rvol.dow;

            // === STEP 3: DIVERGENCE ANALYSIS (The Logic) — 코어에서 파생(guardianCore.deriveLocaleParts) ===
            // Logic: Compare Nasdaq Change vs RLSI Score
            const nq = guardianCashChange(macro, core.session);
            const parts = deriveLocaleParts(core, locale);
            const divCase = parts.divCase;

            // === STEP 4: GENERATE VERDICT NARRATIVE (AI + Templates) ===
            let verdict: GuardianVerdict;
            let tacticalFuturesPct: TacticalFuturesPct | undefined;
            let tacticalFutures = false;   // ★T2 장후 스냅샷에 싣는 표식 — Tactical 글이 종가 이후 선물 사실이 있는 재료로 만들어졌나

            // [V13.0] Divergence info for AI context (used in all paths)
            const divergenceForAi = {
                divergenceCase: divCase.caseId,
                divergenceDesc: divCase.verdictDesc,
            };

            const storedVerdict = (!force && rlsi.session === 'CLOSED') ? await loadAiVerdict(locale) : null;
            if (storedVerdict) {
                const storedNums = guardianNumsFromMarket(macro, rlsi.score, {
                    gexIndex: gammaShieldData?.gexIndex, squeezeRisk: gammaShieldData?.squeezeRisk,
                    breadthPct: rlsi.session === 'REG' ? rlsi.components?.breadthPct : undefined,
                });
                // [V12.0] Only truly CLOSED hours use cached AI verdict (weekends, nights 20:00-04:00 ET)
                // [FIX] PRE and POST sessions now generate fresh AI analysis instead of returning stale off-hours cache
                // ★2026-09-29 저장된 판정도 출구 검사를 지난다. 떨어진 칸은 교체하고 저장본도 고쳐 둔다
                //   (이 키는 마케팅·콘텐츠 생성기도 직접 읽는다 — lib/marketing-v2/core/data.ts, api/admin/content-gen).
                //   ★2026-10-04 숫자도 — 금요일 장중에 만든 글의 «나스닥 +0.94%·RLSI 41»이 주말 화면(+0.98%·38)과 달랐다.
                const repaired = await IntelligenceNode.repairVerdictTexts(storedVerdict, locale, 'ai_verdict', storedNums, currentTacticalPrompts(guardianNumsFromMarket(macro, rlsi.score), core, gammaShieldData));
                verdict = repaired.verdict;
                // ★2026-10-24 순환매 v3 — 장외 저장 판정의 옛 계약 글(레이블·선물 «나스닥»)을 v3 글로(저장본이 있으면 교체, 없으면 1회 백그라운드 생성 · 실패하면 옛 글 유지)
                const upgraded = await IntelligenceNode.offHoursRotationUpgrade(verdict, locale, storedNums, () => offHoursRotationContext(core, locale), (job) => CORE_DEPS.background?.(job) ?? false);
                if (upgraded) verdict = upgraded;
                if (repaired.changed || upgraded) await saveAiVerdict(verdict, locale);
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
                        return items.map(s => `${sectorLabelForAi(s.sector)}(${s.flow > 0 ? '+' : ''}${s.flow.toFixed(1)}%)`).join(', ');
                    };
                    const detectBounceWarning = () => {
                        return ri.bounceWarnings?.join(' | ') || undefined;
                    };

                    // [V6.1] Detect signal conflicts before AI context
                    let signalConflict: string | undefined;
                    if (rlsi.score >= 55 && nq != null && nq > 0 && ri.direction === 'RISK_OFF' && ri.conviction === 'HIGH') {
                        signalConflict = `겉은 강세(RLSI ${rlsi.score.toFixed(0)}, NASDAQ +${nq.toFixed(2)}%), 속은 약세(${ri.direction} ${ri.conviction})`;
                    } else if (rlsi.score <= 35 && nq != null && nq < 0 && ri.direction === 'RISK_ON' && ri.conviction === 'HIGH') {
                        signalConflict = `지표 약세(RLSI ${rlsi.score.toFixed(0)}, NASDAQ ${nq.toFixed(2)}%), 성장주 유입(${ri.direction} ${ri.conviction})`;
                    }

                    // ★2026-10-28 T2 장후에는 지수 기준을 지금 다시 읽는다(캐시 읽기만) — 공유 코어(prefer)는 종가 이후 선물 기준이 저장되기 전 값일 수 있다
                    //   다시 읽은 값에 결측이 있으면 코어 값을 지킨다(칸별 합치기 — 관문 10280621 ②)
                    const postBasis = rlsi.session === 'POST' ? mergePostIndexBasis(macro.indexBasis, await loadMarketIndexBasis().catch(() => null)) : null;
                    const aiContext = {
                        rlsiScore: rlsi.score,
                        nasdaqChange: macro?.nqChangePercent || 0,
                        indexBasis: postBasis ?? macro.indexBasis,
                        indexFacts: postBasis ? buildIndexFacts(postBasis, rlsi.session, Date.now()) : buildIndexFacts(macro.indexBasis, rlsi.session, Date.parse(core.timestamp)),
                        session: rlsi.session,
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
                        // ★2026-10-24 순환매 v3 재료 — 섹터 5거래일 등락률(소수 1자리)·강도·기관 수급(위 날것 문자열 대신 lib/ai/rotationPrompt 가 쓴다)
                        rotationFacts: rotationFactsFrom(ri, flows, vectors),
                        signalConflict,
                        // [V8.0] Market News Headlines
                        marketNewsHeadlines: marketNews.length ? marketNews : undefined,
                        scheduledEvents,
                        asOf: core.timestamp,
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
                                // Only the GEX percentile is consumed here. Shield prices are
                                // SPY×10 proxies, while dealerGamma accepts USD per share.
                                const dg = await getDealerGamma('SPY');
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
                            .map(f => `${sectorLabelForAi(f.name)}: ${f.change.toFixed(1)}% but IFS +${f.instFlow!.ifs.toFixed(0)}`)[0] || undefined,
                        exitAlert: flows.filter(f => f.instFlow?.divergence === 'DIVERGENT' && f.change > 0 && f.instFlow!.ifs < -20)
                            .map(f => `${sectorLabelForAi(f.name)}: +${f.change.toFixed(1)}% but IFS ${f.instFlow!.ifs.toFixed(0)}`)[0] || undefined,
                    };

                    // ★2026-10-04 생성 재료의 화면 숫자 — 자리표를 채우는 값이자 글의 기준(basis)
                    const aiNums = guardianNumsFromAiContext(aiContext);
                    const tacticalContext = { ...aiContext, marketNewsHeadlines: filterMarketHeadlines(marketNews) };
                    const tacticalPrompts = (l: Locale) => buildTacticalPrompt({ ...tacticalContext, asOf: new Date(Date.now()).toISOString() }, l);   // 일정의 미래 여부는 요청 시각으로
                    const [rotationText, realityText, gammaText] = await Promise.all([
                        // ⚠️ 예전엔 실패 시 «Insight generation failed. …» 영어 문장을 돌려줬고, 그게 ko/ja 화면에 그대로 나갔다.
                        //    실패해도 «검사를 통과한 마지막 정상본 → 번역 → 안내 문구» 중 하나만 나간다.
                        IntelligenceNode.generateRotationInsight(aiContext).catch(e => {
                            console.error("[Guardian] Rotation AI failed:", e);
                            return IntelligenceNode.recoverInsight('rotation', locale, { nums: aiNums });
                        }),
                        IntelligenceNode.generateRealityInsight(tacticalContext).catch(e => {
                            console.error("[Guardian] Reality AI failed:", e);
                            return IntelligenceNode.recoverInsight('reality', locale, { nums: aiNums, tacticalPrompts });
                        }),
                        IntelligenceNode.generateGammaInsight(aiContext).catch(e => {
                            console.error("[Guardian] Gamma AI failed:", e);
                            return IntelligenceNode.recoverInsight('gamma', locale, { nums: aiNums });
                        })
                    ]);

                    if (rlsi.session === 'POST') {
                        tacticalFutures = IntelligenceNode.tacticalHasFutures(locale, realityText);
                        if (tacticalFutures) tacticalFuturesPct = IntelligenceNode.tacticalFuturesPct(locale, realityText);
                    }
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
                        const nRea = IntelligenceNode.numbersFor('reality', locale, realityText);   // Tactical 은 글마다 기억한 생성 기준값(동시 요청에도, 자리표 없어도)
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
                        const checked = await IntelligenceNode.repairVerdictTexts(verdict, locale, 'new-verdict', aiNums, tacticalPrompts);
                        verdict = checked.verdict;
                        if (checked.repaired.includes('realityInsight')) tacticalFutures = false;   // ★T2 복구 글로 바뀌면 표식도 내린다
                        // [V12.0] Persist AI verdict to Redis for after-hours display & deploy survival
                        //   대기 문구(«준비 중»)가 된 칸은 직전 저장본의 정상 글을 살려서 저장한다 — 밤새 «준비 중»으로 굳지 않게.
                        const hasPlaceholder = [verdict.description, verdict.realityInsight, verdict.gammaInsight]
                            .some((t) => IntelligenceNode.isPlaceholderInsight(t));
                        await saveAiVerdict(
                            hasPlaceholder ? IntelligenceNode.keepRealTextOverPlaceholders(verdict, await loadAiVerdict(locale), locale, aiNums, tacticalPrompts) : verdict,
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
                coreAt: core.timestamp,   // ★2026-10-08 이 컨텍스트의 숫자가 나온 코어의 계산 시각 — 응답 출구가 더 새 코어로 맞출지 판단한다
                ...(rlsi.session === 'POST' ? { tacticalFutures } : {}),
                ...(tacticalFutures && tacticalFuturesPct ? { tacticalFuturesPct, tacticalFuturesCheckedAt: new Date(now).toISOString(), tacticalSeenAt: new Date(now).toISOString() } : {}),
            };

            // ★T35-B 정기 재생성이 새 글을 못 만들어 대기 문구가 됐으면 기존 장중 글(과 그 생성 기준)을 지킨다 — 출구 검사가 그 글을 다시 거른다
            //   예약 결과: 새 글로 바뀌었을 때만 성공 — 대기 문구(기존 글 유지)·같은 글(복구본)은 실패로 기록해 60분 대기·연속 2회 중지(관문 10310437 P2)
            const regOk = regRefreshAt && placeholderFallback ? settleRegTacticalRefresh(context, placeholderFallback) : false;

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
                if (placeholderFallback) return placeholderFallback;
                console.warn(`[Guardian] Degraded context (sectors empty) for ${locale} — no last-good available, serving once only.`);
            }

            console.log("[Guardian] Context Refresh Complete.");
            if (regRefreshAt) await finishRegTacticalRefresh(claimRedis(), regRefreshAt, regOk, Date.now());
            return context;

        } catch (error) {
            console.error("[Guardian] Unified Stream Error:", error);
            if (regRefreshAt) await finishRegTacticalRefresh(claimRedis(), regRefreshAt, false, Date.now());
            if (placeholderFallback) return placeholderFallback;
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
        const [sectorResult, macro, rvolNdx, rvolDow, polygonNews, fmpGeneralNews, gammaShieldData, ma20Breadth, evidence] = await Promise.all([
            SectorEngine.getSectorFlows(),
            getMacroSnapshotSSOT(),
            RvolEngine.getRvol("QQQ"),
            RvolEngine.getRvol("DIA"),
            // [V11.0] Polygon: stock/sector-specific news
            fetchMassive('/v2/reference/news', { ticker: 'SPY,QQQ,DIA,TLT,GLD', limit: '15', order: 'desc', sort: 'published_utc' }, true)
                .then((res: any) => (res?.results || []).map((n: any) => datedHeadline(n, 'Polygon')).filter((h: string | null): h is string => !!h))
                .catch(() => [] as string[]),
            // [V11.1] FMP General News: macro/geopolitical events (Trump, Fed, CPI, trade war, etc.)
            (async () => {
                try {
                    const fmpKey = process.env.FMP_API_KEY;
                    if (!fmpKey) return [] as string[];
                    const res = await fmpFetch(
                        `https://financialmodelingprep.com/stable/news/general-latest?limit=8&apikey=${fmpKey}`, 'news', { timeoutMs: 5000 }
                    );
                    if (!res?.ok) return [] as string[];
                    const data = await res.json();
                    if (!Array.isArray(data)) return [] as string[];
                    return data.map((n: any) => datedHeadline(n, 'FMP')).filter((h: string | null): h is string => !!h).slice(0, 5);
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
            })),
            Promise.all([
                getFromCache('guardian:news:digest:v2'),
                getFromCache('fmp:econ-calendar'),
                getFromCache('market:earnings-calendar:v4'),
            ]).then(([pulse, econ, earnings]) => cachedEvidence(pulse, econ, earnings)).catch(() => ({ news: [], events: [] })),
        ]);

        // Merge Polygon + FMP news with deduplication
        const mergedNews: string[] = [...evidence.news, ...polygonNews];
        for (const fmpTitle of fmpGeneralNews) {
            const isDup = mergedNews.some(existing => {
                const a = existing.replace(/^\[[^\]]+\]\s*/, '').toLowerCase().slice(0, 60);
                const b = fmpTitle.replace(/^\[[^\]]+\]\s*/, '').toLowerCase().slice(0, 60);
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
        const breadthSnapshot = await getMarketBreadth(guardianCashChange(macro, rlsi.session)).catch(() => null);

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
            scheduledEvents: evidence.events,
        };
    }

}
