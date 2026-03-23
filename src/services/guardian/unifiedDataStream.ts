import { calculateRLSI, RLSIResult, getMarketSession, MarketSession } from "./rlsiEngine";
// [FIX] Import getMarketSession for cache session validation
import { SectorEngine, SectorFlowRate, GuardianVerdict, FlowVector, RotationIntensity } from "./sectorEngine";
import { getMacroSnapshotSSOT, MacroSnapshot } from "@/services/macroHubProvider";
import { IntelligenceNode } from "./intelligenceNode";
import { RvolEngine, RvolProfile } from "./rvolEngine";
import { fetchMassive } from "@/services/massiveClient";
import { getGammaShield, GammaShieldData } from "./gammaShieldEngine";

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
        totalTickers: number;
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
}

// === CACHE CONFIG (per-locale to prevent AI text cross-contamination) ===
const _cachedContext: Record<Locale, GuardianContext | null> = { ko: null, en: null, ja: null };
const _lastFetchTime: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
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
const RLSI_HISTORY_TTL = 24 * 60 * 60; // 24 hours

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

// === LOCALIZED TEXT FOR VERDICTS ===
type Locale = 'ko' | 'en' | 'ja';

const VERDICT_TEXTS: Record<string, Record<Locale, { title: string; desc: string }>> = {
    SYNC: {
        ko: { title: "MARKET SYNCHRONIZED", desc: "지수와 유동성 흐름이 동기화 상태. 이상 징후 미관측." },
        en: { title: "MARKET SYNCHRONIZED", desc: "Index and liquidity flows are aligned. No anomalies detected." },
        ja: { title: "MARKET SYNCHRONIZED", desc: "指数と流動性フローが同期状態。異常兆候は未観測。" }
    },
    RETAIL_TRAP: {
        ko: { title: "DIVERGENCE DETECTED", desc: "지수 상승에도 유동성 이탈 진행 중. 표면 강세와 내부 약세 괴리 관측." },
        en: { title: "DIVERGENCE DETECTED", desc: "Index advancing while liquidity exits. Surface strength diverges from internal weakness." },
        ja: { title: "DIVERGENCE DETECTED", desc: "指数上昇中も流動性離脱が進行。表面の強さと内部の弱さの乖離を観測。" }
    },
    SILENT_ACCUM: {
        ko: { title: "STEALTH INFLOW", desc: "가격 하락 구간에서 기관 유동성 유입 관측. 역방향 자금 흐름 감지." },
        en: { title: "STEALTH INFLOW", desc: "Institutional liquidity inflow observed during price decline. Counter-directional capital flow detected." },
        ja: { title: "STEALTH INFLOW", desc: "価格下落局面で機関流動性の流入を観測。逆方向の資金フローを検出。" }
    },
    QUANTUM_LEAP: {
        ko: { title: "MOMENTUM SURGE", desc: "강한 유동성 동반 상승세 관측. 거래량과 가격 동시 확장 구간." },
        en: { title: "MOMENTUM SURGE", desc: "Strong liquidity-backed advance observed. Volume and price expanding simultaneously." },
        ja: { title: "MOMENTUM SURGE", desc: "強い流動性を伴う上昇トレンドを観測。出来高と価格が同時拡大中。" }
    },
    DEEP_FREEZE: {
        ko: { title: "MOMENTUM DEPLETION", desc: "모멘텀 및 유동성 동시 위축 관측. 방향성 부재 구간." },
        en: { title: "MOMENTUM DEPLETION", desc: "Momentum and liquidity contraction observed simultaneously. Directionless phase." },
        ja: { title: "MOMENTUM DEPLETION", desc: "モメンタムと流動性の同時収縮を観測。方向性不在の局面。" }
    },
    STABLE: {
        ko: { title: "SYSTEM STABLE", desc: "특이 징후 미관측. 섹터 순환 흐름 모니터링 중." },
        en: { title: "SYSTEM STABLE", desc: "No anomalies detected. Sector rotation flows under surveillance." },
        ja: { title: "SYSTEM STABLE", desc: "特異兆候は未観測。セクターローテーションフローを監視中。" }
    },
    SETUP_REQUIRED: {
        ko: { title: "SETUP REQUIRED", desc: "AI 인텔리전스를 활성화하려면 .env.local 파일에 GEMINI_API_KEY가 필요합니다." },
        en: { title: "SETUP REQUIRED", desc: "GEMINI_API_KEY is required in .env.local to activate AI intelligence." },
        ja: { title: "SETUP REQUIRED", desc: "AIインテリジェンスを有効にするには.env.localにGEMINI_API_KEYが必要です。" }
    }
};

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

const CHECKLIST_TEXTS: Record<Locale, {
    targetLocked: string;
    bearMode: string;
    waitMode: string;
    nasdaqUp: string;
    targetSectorUp: string;
    yieldStable: string;
    above: string;
    rising: string;
    under: string;
}> = {
    ko: {
        targetLocked: "TARGET LOCKED :: 강세장 진입 조건 충족",
        bearMode: "BEAR MODE :: 보수적 운용 구간",
        waitMode: "STANDBY :: 관망 구간",
        nasdaqUp: "NASDAQ 상승",
        targetSectorUp: "타겟 섹터 상승",
        yieldStable: "금리 안정",
        above: "이상",
        rising: "상승",
        under: "미만"
    },
    en: {
        targetLocked: "TARGET LOCKED :: Bull market conditions met",
        bearMode: "BEAR MODE :: Defensive stance recommended",
        waitMode: "STANDBY :: Wait recommended",
        nasdaqUp: "NASDAQ Rising",
        targetSectorUp: "Target Sector Rising",
        yieldStable: "Yield Stable",
        above: "or above",
        rising: "Rising",
        under: "under"
    },
    ja: {
        targetLocked: "TARGET LOCKED :: 強気相場条件充足",
        bearMode: "BEAR MODE :: 防御運用推奨",
        waitMode: "STANDBY :: 様子見推奨",
        nasdaqUp: "NASDAQ上昇",
        targetSectorUp: "ターゲットセクター上昇",
        yieldStable: "金利安定",
        above: "以上",
        rising: "上昇",
        under: "未満"
    }
};

const RULE_VERDICT_TEXTS: Record<Locale, {
    bullish: { headline: string; action: string };
    bearish: { headline: string; action: string };
    neutral: { headline: string; action: string };
    rotation: string;
    riskScore: string;
    dangerScore: string;
    advanceRatio: string;
}> = {
    ko: {
        bullish: { headline: "BULL PHASE ACTIVE", action: "상승 종목 비중 확대 유효" },
        bearish: { headline: "DEFENSIVE PHASE", action: "신규 매수 자제, 현금 비중 확대" },
        neutral: { headline: "STANDBY PHASE", action: "방향성 확인 후 진입" },
        rotation: "순환매",
        riskScore: "양호",
        dangerScore: "위험",
        advanceRatio: "상승비율"
    },
    en: {
        bullish: { headline: "BULL PHASE ACTIVE", action: "Increase exposure to rising stocks" },
        bearish: { headline: "DEFENSIVE PHASE", action: "Avoid new buys, increase cash" },
        neutral: { headline: "STANDBY PHASE", action: "Enter after direction confirmed" },
        rotation: "Rotation",
        riskScore: "Healthy",
        dangerScore: "Danger",
        advanceRatio: "Advance Ratio"
    },
    ja: {
        bullish: { headline: "BULL PHASE ACTIVE", action: "上昇銘柄のウェイト拡大有効" },
        bearish: { headline: "DEFENSIVE PHASE", action: "新規買い自制、現金ウェイト拡大" },
        neutral: { headline: "STANDBY PHASE", action: "方向性確認後にエントリー" },
        rotation: "ローテーション",
        riskScore: "良好",
        dangerScore: "危険",
        advanceRatio: "上昇比率"
    }
};

export class GuardianDataHub {

    /**
     * Get the Unified Guardian Context (SSOT)
     * Optimized with Parallel Execution for RLSI & Macro Data.
     */
    static async getGuardianSnapshot(force: boolean = false, locale: Locale = 'ko'): Promise<GuardianContext> {
        const now = Date.now();

        // [V12.0] Redis-first: Check EC2 Worker's pre-cached snapshot
        // [FIX] Validate that cached session matches current session before returning
        const currentSession = getMarketSession();
        if (!force) {
            try {
                const redisKey = `${GUARDIAN_SNAPSHOT_PREFIX}${locale}`;
                const cached = await getFromCache<any>(redisKey);
                if (cached && cached.rlsi && cached.rlsi.score !== undefined) {
                    // [FIX] Session validation: if cached session differs from current, recompute
                    const cachedSession = cached.rlsi?.session;
                    if (cachedSession && cachedSession !== currentSession) {
                        console.log(`[Guardian FIX] Session mismatch: cached=${cachedSession}, current=${currentSession} — recomputing for ${locale}`);
                        // Don't return stale cache, fall through to recompute
                    } else {
                        // [FIX] Staleness check: if data is older than 25s, recompute for real-time freshness
                        const workerTs = cached._workerTimestamp ? new Date(cached._workerTimestamp).getTime() : 0;
                        const dataAge = now - workerTs;
                        if (dataAge > 25000) {
                            console.log(`[Guardian] Redis cache stale (${(dataAge/1000).toFixed(0)}s old) — recomputing for ${locale}`);
                            // Fall through to recompute
                        } else {
                            // Session matches and data is fresh, safe to return
                            _cachedContext[locale] = cached;
                            _lastFetchTime[locale] = now;
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

        console.log("[Guardian] Refreshing Context (Parallel Optimization)...");

        try {
            // === STEP 1: PARALLEL DATA FETCHING (Optimization) ===
            // [V5.0] Changed order: Sector first, then RLSI with RIS score
            console.log("[Guardian V5.0] Step 1: Fetching Sector Flows & Macro in Parallel...");
            const [sectorResult, macro, rvolNdx, rvolDow, polygonNews, fmpGeneralNews, gammaShieldData] = await Promise.all([
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
                getGammaShield(force).catch(e => { console.warn('[Guardian] GammaShield failed:', e.message); return null; })
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

            // === STEP 2: RLSI WITH RIS INTEGRATION ===
            // [V5.0] Pass rotation score to RLSI for 4-factor calculation
            console.log("[Guardian V5.0] Step 2: Calculating RLSI with RIS...");
            const rlsi = await calculateRLSI(force, rotationIntensity.score);
            console.log(`[Guardian V5.0] Step 2 Complete. RLSI: ${rlsi.score}, Session: ${rlsi.session}`);

            // === STEP 3: DIVERGENCE ANALYSIS (The Logic) ===
            // Logic: Compare Nasdaq Change vs RLSI Score
            const nq = macro?.nqChangePercent || 0;
            const score = rlsi.score;

            // caseId: 'N' (Neutral)
            let divCase: DivergenceAnalysis = {
                caseId: 'N',
                verdictTitle: VERDICT_TEXTS.SYNC[locale].title,
                verdictDesc: VERDICT_TEXTS.SYNC[locale].desc,
                isDivergent: false,
                score: 0
            };

            // CASE A (False Rally): Index UP (+), RLSI LOW (<40)
            if (nq > 0.3 && score < 40) {
                divCase = {
                    caseId: 'A',
                    verdictTitle: VERDICT_TEXTS.RETAIL_TRAP[locale].title,
                    verdictDesc: VERDICT_TEXTS.RETAIL_TRAP[locale].desc,
                    isDivergent: true,
                    score: 90
                };
            }
            // CASE B (Hidden Opportunity): Index DOWN (-), RLSI HIGH (>60)
            else if (nq < -0.2 && score > 60) {
                divCase = {
                    caseId: 'B',
                    verdictTitle: VERDICT_TEXTS.SILENT_ACCUM[locale].title,
                    verdictDesc: VERDICT_TEXTS.SILENT_ACCUM[locale].desc,
                    isDivergent: true,
                    score: 90
                };
            }
            // CASE C (Full Bull): Index UP, RLSI HIGH (>70)
            else if (nq > 0.5 && score > 70) {
                divCase = {
                    caseId: 'C',
                    verdictTitle: VERDICT_TEXTS.QUANTUM_LEAP[locale].title,
                    verdictDesc: VERDICT_TEXTS.QUANTUM_LEAP[locale].desc,
                    isDivergent: false,
                    score: 0
                };
            }
            // CASE D (Deep Freeze): Index DOWN, RLSI LOW (<30)
            else if (nq < -0.5 && score < 30) {
                divCase = {
                    caseId: 'D',
                    verdictTitle: VERDICT_TEXTS.DEEP_FREEZE[locale].title,
                    verdictDesc: VERDICT_TEXTS.DEEP_FREEZE[locale].desc,
                    isDivergent: false,
                    score: 0
                };
            }

            // === STEP 4: GENERATE VERDICT NARRATIVE (AI + Templates) ===
            let verdict: GuardianVerdict;

            if (divCase.isDivergent && rlsi.session === 'REG') {
                // Priority: Divergence Overrides AI (only during regular session)
                verdict = {
                    title: divCase.verdictTitle,
                    description: divCase.verdictDesc,
                    sentiment: divCase.caseId === 'B' ? 'BULLISH' : 'BEARISH'
                };
            } else if (rlsi.session !== 'REG' && (await loadAiVerdict(locale))) {
                // [V12.0] After hours with cached AI verdict from Redis: use it (per-locale)
                verdict = (await loadAiVerdict(locale))!;
            } else {
                // Standard Market: Use Dual Stream AI
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
                        rvol: rvolNdx.rvol,
                        vix: macro?.vix || 0,
                        locale,
                        // Macro indicators
                        us10y: macro?.yieldCurve?.us10y ?? undefined,
                        us10yChange: macro?.factors?.us10y?.chgPct ?? undefined,
                        spread2s10s: macro?.yieldCurve?.spread2s10s ?? undefined,
                        realYield: macro?.realYield?.realYield ?? undefined,
                        realYieldStance: macro?.realYield?.stance ?? undefined,
                        // Breadth indicators
                        breadthPct: rlsi.components?.breadthPct ?? undefined,
                        adRatio: rlsi.components?.adRatio ?? undefined,
                        volumeBreadth: rlsi.components?.volumeBreadth ?? undefined,
                        breadthSignal: rlsi.components?.breadthSignal ?? undefined,
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
                        triggerCurrent: gammaShieldData?.currentPrice ?? undefined
                    };

                    const [rotationText, realityText] = await Promise.all([
                        IntelligenceNode.generateRotationInsight(aiContext),
                        IntelligenceNode.generateRealityInsight(aiContext)
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
                        verdict = {
                            title: "TACTICAL INSIGHT",
                            description: cleanRotation, // Sidebar
                            sentiment: 'NEUTRAL',
                            realityInsight: cleanReality // Center
                        };
                        // [V12.0] Persist AI verdict to Redis for after-hours display & deploy survival
                        await saveAiVerdict(verdict, locale);
                    }
                } catch (e) {
                    console.warn("[Guardian] AI Verdict Failed, using fallback:", e);
                    verdict = staticVerdict;
                }
            }
            console.log("[Guardian] Step 3 Complete. AI Verdict Generated.");

            // === STEP 5: FINALIZE ===
            let marketStatus: 'GO' | 'WAIT' | 'STOP' = 'WAIT';
            if (rlsi.level === 'OPTIMAL') marketStatus = 'GO';
            else if (rlsi.level === 'DANGER') marketStatus = 'STOP';
            else {
                if (rlsi.score >= 50) marketStatus = 'GO';
                else marketStatus = 'WAIT';
            }

            // === STEP 5: TRIPLE-A LOGIC (TARGET LOCK) ===
            // Alignment / Acceleration / Accumulation
            // 1. Regime Detection — [V6.1] Cross-validated with Rotation Direction
            let regime: 'BULL' | 'BEAR' | 'NEUTRAL' = 'NEUTRAL';
            if (rlsi.score >= 55 && nq > 0) regime = 'BULL';
            else if (rlsi.score <= 35 && nq < 0) regime = 'BEAR';

            // [V6.1] Rotation Cross-Validation — prevent conflicting signals
            const rotDir = rotationIntensity?.direction;
            const rotConviction = rotationIntensity?.conviction;

            if (regime === 'BULL' && rotDir === 'RISK_OFF' && rotConviction === 'HIGH') {
                // "겉은 강세, 속은 약세" — surface bullish but money rotating to defense
                regime = 'NEUTRAL';
                console.log(`[Guardian V6.1] Regime BULL → NEUTRAL (RISK_OFF HIGH conviction override)`);
            } else if (regime === 'BEAR' && rotDir === 'RISK_ON' && rotConviction === 'HIGH') {
                // Surface bearish but money flowing into growth — potential bottom
                regime = 'NEUTRAL';
                console.log(`[Guardian V6.1] Regime BEAR → NEUTRAL (RISK_ON HIGH conviction override)`);
            }

            // 2. Alignment (Market + Sector)
            // Is the flows target actually aligned with the market direction?
            // If Bull, Target Sector should be Up.
            const targetSector = flows.find(s => s.id === targetId);
            const isSectorAligned = regime === 'BULL' && (targetSector ? targetSector.change > 0 : false);

            // 3. Acceleration (RVOL > 1.2 or Vector Strength)
            // Use Market RVOL as proxy OR Vector Torque
            const isAccelerating = rvolNdx.rvol >= 1.2 || (vectors && vectors.length > 0 && vectors[0].strength > 25);

            // 4. Accumulation (Breadth)
            // Check top 3 constituents of target sector
            let isAccumulating = false;
            if (targetSector && targetSector.topConstituents && targetSector.topConstituents.length >= 3) {
                // If 2 out of top 3 are green
                const top3 = targetSector.topConstituents.slice(0, 3);
                const greenCount = top3.filter(c => c.change > 0).length;
                if (greenCount >= 2) isAccumulating = true;
            }

            // 5. 10Y Bond Filter (Safety Check)
            // If Yield is spiking (> +2.5%), invalidate Bull Lock
            const yieldSpike = (macro?.factors?.us10y?.chgPct || 0) > 2.5;

            // FINAL LOCK DECISION
            const isTargetLock = regime === 'BULL' && isSectorAligned && isAccelerating && isAccumulating && !yieldSpike;

            // [V6.0] Build Checklist with actual values
            const yieldPct = macro?.factors?.us10y?.chgPct || 0;
            const targetSectorChange = targetSector?.change || 0;

            const checklist: TripleAChecklist = {
                conditions: [
                    {
                        id: 'rlsi',
                        label: 'RLSI 55+',
                        passed: rlsi.score >= 55,
                        current: `${rlsi.score.toFixed(0)}`,
                        required: `55 ${CHECKLIST_TEXTS[locale].above}`
                    },
                    {
                        id: 'nasdaq',
                        label: CHECKLIST_TEXTS[locale].nasdaqUp,
                        passed: nq > 0,
                        current: `${nq > 0 ? '+' : ''}${nq.toFixed(2)}%`,
                        required: '> 0%'
                    },
                    {
                        id: 'sector',
                        label: CHECKLIST_TEXTS[locale].targetSectorUp,
                        passed: isSectorAligned,
                        current: targetSector ? `${targetSector.name} ${targetSectorChange > 0 ? '+' : ''}${targetSectorChange.toFixed(2)}%` : 'N/A',
                        required: CHECKLIST_TEXTS[locale].rising
                    },
                    {
                        id: 'rvol',
                        label: 'RVOL 1.2+',
                        passed: isAccelerating,
                        current: `${rvolNdx.rvol.toFixed(2)}x`,
                        required: `1.2x ${CHECKLIST_TEXTS[locale].above}`
                    },
                    {
                        id: 'yield',
                        label: CHECKLIST_TEXTS[locale].yieldStable,
                        passed: !yieldSpike,
                        current: `${yieldPct > 0 ? '+' : ''}${yieldPct.toFixed(2)}%`,
                        required: `< 2.5%`
                    }
                ],
                passedCount: [rlsi.score >= 55, nq > 0, isSectorAligned, isAccelerating, !yieldSpike].filter(Boolean).length,
                totalCount: 5,
                isLocked: isTargetLock,
                message: isTargetLock
                    ? CHECKLIST_TEXTS[locale].targetLocked
                    : regime === 'BEAR'
                        ? CHECKLIST_TEXTS[locale].bearMode
                        : CHECKLIST_TEXTS[locale].waitMode
            };

            const tripleA = {
                regime,
                alignment: isSectorAligned,
                acceleration: isAccelerating,
                accumulation: isAccumulating,
                isTargetLock,
                checklist // [V6.0]
            };

            // [V6.1] Rule-based Market Verdict — Rotation-aware
            const breadth = rotationIntensity?.breadth || 50;
            let ruleVerdict: MarketVerdict;

            if (rlsi.score >= 60 && rotDir === 'RISK_ON') {
                // Strong RLSI + growth rotation → confident bullish
                ruleVerdict = {
                    status: 'BULLISH',
                    headline: RULE_VERDICT_TEXTS[locale].bullish.headline,
                    keyMetrics: [
                        `RLSI ${rlsi.score.toFixed(0)} (${RULE_VERDICT_TEXTS[locale].riskScore})`,
                        `${RULE_VERDICT_TEXTS[locale].rotation}: ${rotDir}`,
                        `NASDAQ ${nq > 0 ? '+' : ''}${nq.toFixed(2)}%`
                    ],
                    action: RULE_VERDICT_TEXTS[locale].bullish.action
                };
            } else if (rlsi.score <= 35 || (rotDir === 'RISK_OFF' && rotConviction === 'HIGH')) {
                // RLSI danger zone OR high-conviction defensive rotation → bearish
                ruleVerdict = {
                    status: 'BEARISH',
                    headline: RULE_VERDICT_TEXTS[locale].bearish.headline,
                    keyMetrics: [
                        `RLSI ${rlsi.score.toFixed(0)} (${rotConviction === 'HIGH' ? RULE_VERDICT_TEXTS[locale].dangerScore : RULE_VERDICT_TEXTS[locale].riskScore})`,
                        `${RULE_VERDICT_TEXTS[locale].rotation}: ${rotDir || 'N/A'} (${rotConviction || 'N/A'})`,
                        `${RULE_VERDICT_TEXTS[locale].advanceRatio} ${breadth.toFixed(0)}%`
                    ],
                    action: RULE_VERDICT_TEXTS[locale].bearish.action
                };
            } else {
                // Mixed or insufficient signal → neutral/standby
                ruleVerdict = {
                    status: 'NEUTRAL',
                    headline: RULE_VERDICT_TEXTS[locale].neutral.headline,
                    keyMetrics: [
                        `RLSI ${rlsi.score.toFixed(0)}`,
                        `${RULE_VERDICT_TEXTS[locale].rotation}: ${rotDir || 'NEUTRAL'} (${rotConviction || 'N/A'})`,
                        `Breadth ${breadth.toFixed(0)}%`
                    ],
                    action: RULE_VERDICT_TEXTS[locale].neutral.action
                };
            }

            console.log(`[Guardian V6.0] RuleVerdict: ${ruleVerdict.headline}, Action: ${ruleVerdict.action}`);

            // [V9.0] Append RLSI history for intraday sparkline
            const rlsiHistory = await appendRlsiHistory(rlsi.score, rlsi.session);

            const context: GuardianContext = {
                rlsi,
                market: macro,
                sectors: flows,
                vectors: vectors || [],
                verdict,
                divergence: divCase,
                verdictSourceId: sourceId,
                verdictTargetId: targetId,
                marketStatus,
                rvol: { ndx: rvolNdx, dow: rvolDow },
                rotationIntensity,
                ruleVerdict, // [V6.0] 규칙 기반 핵심 결론
                tripleA,     // [V6.0] 체크리스트 포함
                // [V7.0] Market Breadth (from RLSI engine components)
                breadth: {
                    advancers: 0, // populated by breadthEngine cache
                    decliners: 0,
                    totalTickers: 0,
                    breadthPct: rlsi.components?.breadthPct ?? 50,
                    adRatio: rlsi.components?.adRatio ?? 1,
                    volumeBreadth: rlsi.components?.volumeBreadth ?? 50,
                    signal: rlsi.components?.breadthSignal ?? 'NEUTRAL',
                    isDivergent: rlsi.components?.breadthDivergent ?? false
                },
                rlsiHistory,  // [V9.0] Intraday sparkline data
                gammaShield: gammaShieldData,  // [V10.0] Market-wide volatility intelligence
                timestamp: new Date().toISOString()
            };

            if (!force) {
                _cachedContext[locale] = context;
                _lastFetchTime[locale] = now;
            }

            // [V12.0] Write back to Redis for EC2 Worker / other instances
            try {
                const redisTtl = context.rlsi?.session === 'REG' ? 120 : 600; // 2min REG, 10min EXT
                await setInCache(`${GUARDIAN_SNAPSHOT_PREFIX}${locale}`, { ...context, _source: 'vercel' }, redisTtl);
            } catch { /* Redis write failure is non-critical */ }

            console.log("[Guardian] Context Refresh Complete.");
            return context;

        } catch (error) {
            console.error("[Guardian] Unified Stream Error:", error);
            throw error;
        }
    }
}
