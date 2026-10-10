/**
 * 크레딧 페이싱 조절기 — «월 크레딧을 남김없이, 넘치지 않게» (2026-10-10 대표: «남는 것 없이 사용하는 방향»).
 *
 * 하는 일: 월 목표($198)를 남은 날짜로 나눈 «오늘 목표 속도»와 실제 누적 속도를 견줘, 크레딧으로 도는 용도의
 *   «신선도»(갱신 주기·사전 생성 범위)를 한 단계(level)씩 올리고 내린다. 덜 쓰면 더 자주, 넘치면 덜 자주.
 *
 *   level 0 = 이 조절기가 생기기 전의 동작(기본 주기·예열 0). +  = 더 자주/더 넓게. − = 덜 자주(상한까지).
 *
 * 조절 대상(PacingKnobs) — 전부 «사용자가 보는 신선도»이고, 각자 안전 범위가 있다:
 *   · 뉴스 다이제스트 갱신 주기      5~30분   (원천: 마켓 뉴스 캐시 300초 · FMP·RSS 는 분 단위 — 5분보다 잦아도 같은 기사)
 *   · UC 코어/피드/매크로/종목 수명  300초~    (원천: FMP 뉴스 + 자금 오버레이(Redis 예열값) — 5분 미만은 같은 입력)
 *   · UC 종목 카드 사전 생성 종목 수  0~72      (장중 평일만 · 3개 언어 · 입력이 같으면 AI 를 부르지 않는다)
 *   · 종목 뉴스 사전 번역 종목 수     0~100     (새 헤드라인만 번역 — 기사별 48시간 저장)
 *
 * 안전 규칙:
 *   · 원천보다 잦은 갱신 금지 — 위 최소값 아래로 내려가지 않는다(KNOB_BOUNDS).
 *   · 월말 3일(endgame)은 남은 예산을 소진하도록 더 공격적으로 올린다. 목표 $198 · 내부 상한 $199(llmPricing) · 콘솔 한도 $200.
 *   · 목표 도달(done)·착륙(landing: 남은 $0.8 이하)·크레딧 불가(credit-off)에서는 증가분을 끈다(level ≤ 0).
 *   · 증가분 호출은 freshTier 로 불러 크레딧이 안 되면 AWS 로 넘기지 않고 건너뛴다(기본 용도만 AWS 로 넘어간다).
 *   · 조절기가 죽어도 안전: 상태가 12시간 넘게 갱신되지 않으면 읽는 쪽이 level ≤ 0 으로 본다.
 *
 * 순수 함수(stepPacing·knobsForLevel·weightedHours)는 tests/creditPacing.test.ts 가 고정한다.
 */
import { LEDGER_CAP_USD, nextRenewal, periodId } from '@/lib/ai/llmPricing';
import { upstashStore, type LlmStore } from '@/lib/ai/llmStore';

export const PACING_TARGET_USD = 198;
export const LEVEL_MIN = -3;
export const LEVEL_MAX = 8;
/** 처음 켤 때의 시작 단계 — 주기만 조이고(예열 0) 실측을 본 뒤 올린다 */
export const BOOTSTRAP_LEVEL = 1;
export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** 같은 단계에서 최소 머무는 시간(일반·월말) — 바꾼 효과가 지출 속도에 나타난 뒤에 다시 판단 */
export const HOLD_MS = 4 * HOUR_MS;
export const HOLD_ENDGAME_MS = 2 * HOUR_MS;
/** 속도 측정에 필요한 최소 구간 */
export const MIN_WINDOW_MS = 3 * HOUR_MS;
/** 남은 예산이 이 값 이하이면 «착륙» — 증가분을 끈다 */
export const LANDING_USD = 0.8;
export const ENDGAME_DAYS = 3;
/** 조절기 상태가 이 시간 넘게 갱신되지 않으면(크론 정지) 읽는 쪽이 증가분을 끈다 */
export const STATE_STALE_MS = 12 * HOUR_MS;

// ─────────────────────────────────────────────────────────────────────────────
// 1) 조절 대상 · 안전 범위
// ─────────────────────────────────────────────────────────────────────────────

export interface PacingKnobs {
    /** 뉴스 다이제스트 갱신 주기(분) */
    digestIntervalMin: number;
    /** UC 피드(종목 카드 모음) 수명(초) — 지나면 «낡음» → 크론·사용자가 다시 만든다 */
    ucFeedFreshSec: number;
    ucMacroFreshSec: number;
    /** UC 코어(뉴스 선별 + 자금 오버레이) 수명(초) */
    ucCoreFreshSec: number;
    ucTickerFreshSec: number;
    /** 사전 생성할 UC 종목 카드 수(3개 언어) */
    ucPrewarmTickers: number;
    /** 사전 번역할 종목 뉴스 종목 수 */
    tickerNewsPrewarm: number;
}

/** level 0 = 조절기 이전 값(코드의 기존 상수와 같다 — 시험이 고정) */
export const BASELINE_KNOBS: PacingKnobs = {
    digestIntervalMin: 15,
    ucFeedFreshSec: 40 * 60,
    ucMacroFreshSec: 12 * 60,
    ucCoreFreshSec: 15 * 60,
    ucTickerFreshSec: 10 * 60,
    ucPrewarmTickers: 0,
    tickerNewsPrewarm: 0,
};

/** [최소, 최대] — 최소 = «원천보다 잦게 만들지 않는» 하한(위 머리말), 최대 = 넘칠 때 늦추는 상한 */
export const KNOB_BOUNDS = {
    digestIntervalMin: [5, 30],
    ucFeedFreshSec: [300, 3600],
    ucMacroFreshSec: [300, 1800],
    ucCoreFreshSec: [300, 1800],
    ucTickerFreshSec: [300, 1800],
} as const;

/** level → 사전 생성 종목 수 (0 이하 = 0) */
export const UC_PREWARM_BY_LEVEL = [0, 0, 6, 12, 20, 30, 42, 56, 72] as const;
export const NEWS_PREWARM_BY_LEVEL = [0, 0, 8, 16, 28, 44, 64, 84, 100] as const;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const clampLevel = (l: number) => clamp(Math.round(Number.isFinite(l) ? l : 0), LEVEL_MIN, LEVEL_MAX);

/** 간격 배율 — level 1 마다 0.7배(더 자주), −1 마다 1/0.7배(덜 자주) */
export function levelScale(level: number): number {
    return level >= 0 ? Math.pow(0.7, level) : Math.pow(1 / 0.7, -level);
}

export function knobsForLevel(level: number): PacingKnobs {
    const L = clampLevel(level);
    const s = levelScale(L);
    const sec = (base: number, [lo, hi]: readonly [number, number] | readonly number[]) => clamp(Math.round((base * s) / 30) * 30, lo, hi);
    const [dLo, dHi] = KNOB_BOUNDS.digestIntervalMin;
    return {
        digestIntervalMin: clamp(Math.round(BASELINE_KNOBS.digestIntervalMin * s), dLo, dHi),
        ucFeedFreshSec: sec(BASELINE_KNOBS.ucFeedFreshSec, KNOB_BOUNDS.ucFeedFreshSec),
        ucMacroFreshSec: sec(BASELINE_KNOBS.ucMacroFreshSec, KNOB_BOUNDS.ucMacroFreshSec),
        ucCoreFreshSec: sec(BASELINE_KNOBS.ucCoreFreshSec, KNOB_BOUNDS.ucCoreFreshSec),
        ucTickerFreshSec: sec(BASELINE_KNOBS.ucTickerFreshSec, KNOB_BOUNDS.ucTickerFreshSec),
        ucPrewarmTickers: L > 0 ? UC_PREWARM_BY_LEVEL[Math.min(L, UC_PREWARM_BY_LEVEL.length - 1)] : 0,
        tickerNewsPrewarm: L > 0 ? NEWS_PREWARM_BY_LEVEL[Math.min(L, NEWS_PREWARM_BY_LEVEL.length - 1)] : 0,
    };
}

/** 장중(미국 프리마켓~애프터) 평일 UTC 11~23시 — 이 밖(밤·주말)은 원천이 거의 바뀌지 않아 기본 주기보다 잦게 하지 않는다 */
export function inMarketWindow(ms: number): boolean {
    const d = new Date(ms);
    const dow = d.getUTCDay();
    const h = d.getUTCHours();
    return dow >= 1 && dow <= 5 && h >= 11 && h < 23;
}

/** 다이제스트 실제 주기 — 장중이 아니면 기본(15분)보다 짧아지지 않는다 */
export function effectiveDigestIntervalMin(k: PacingKnobs, nowMs: number): number {
    return inMarketWindow(nowMs) ? k.digestIntervalMin : Math.max(k.digestIntervalMin, BASELINE_KNOBS.digestIntervalMin);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) 활동 가중 시간 — 평일 장중에 지출이 몰린다. 속도 비교는 «가중 시간당»으로 한다(주말에 오해하지 않게)
// ─────────────────────────────────────────────────────────────────────────────

export function activityWeight(hourStartMs: number): number {
    const d = new Date(hourStartMs);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) return 0.4;       // 주말 — 요청 기반(사용자가 여는 화면) 호출은 평일의 절반 안팎(10/10 연구: 평일 대 주말 1.3~2배)
    const h = d.getUTCHours();
    return h >= 11 && h < 23 ? 1 : 0.5;           // 평일 장중 1.0, 그 밖 0.5
}

/** [from,to) 구간의 가중 시간(시간 단위) */
export function weightedHours(fromMs: number, toMs: number): number {
    if (!(toMs > fromMs)) return 0;
    let t = fromMs;
    let sum = 0;
    while (t < toMs) {
        const hourStart = Math.floor(t / HOUR_MS) * HOUR_MS;
        const next = Math.min(toMs, hourStart + HOUR_MS);
        sum += ((next - t) / HOUR_MS) * activityWeight(hourStart);
        t = next;
    }
    return sum;
}

/** [from,to) 구간 중 «장중»(평일 UTC 11~23시)인 시간 — 사전 생성·다이제스트 단축이 실제로 일하는 시간이다 */
export function marketHoursIn(fromMs: number, toMs: number): number {
    if (!(toMs > fromMs)) return 0;
    let t = fromMs;
    let sum = 0;
    while (t < toMs) {
        const hourStart = Math.floor(t / HOUR_MS) * HOUR_MS;
        const next = Math.min(toMs, hourStart + HOUR_MS);
        if (inMarketWindow(hourStart)) sum += (next - t) / HOUR_MS;
        t = next;
    }
    return sum;
}
/** 올리기 판단에 필요한 최소 장중 시간 — 밤·주말의 낮은 지출은 «신선도를 올려야 한다»는 근거가 아니다(증가분은 장중에만 일한다) */
export const MIN_MARKET_HOURS_TO_RAISE = 3;

// ─────────────────────────────────────────────────────────────────────────────
// 3) 한 걸음 — 순수 함수
// ─────────────────────────────────────────────────────────────────────────────

export type PacingMode = 'bootstrap' | 'measuring' | 'on-pace' | 'raising' | 'lowering' | 'endgame' | 'landing' | 'done' | 'credit-off';

export interface PacingState {
    v: 1;
    period: string;
    level: number;
    /** 단계가 마지막으로 바뀐 시각 */
    changedAt: number;
    /** 마지막 판단 시각 */
    tickAt: number;
    mode: PacingMode;
    ratio: number | null;
    /** [시각(ms), 누적 지출(USD)] — 30분 간격, 최근 5일 */
    snaps: Array<[number, number]>;
    reason: string;
}

export interface PacingInput {
    now: number;
    /** 이번 주기 크레딧 누적(원장) */
    spent: number;
    /** 크레딧 키 있음 · a55 서킷 닫힘 · 킬 스위치 꺼짐 */
    creditOk: boolean;
    state: PacingState | null;
}

export interface PacingDecision {
    period: string;
    endsAt: number;
    daysLeft: number;
    remainingUsd: number;
    /** 오늘 목표 속도 = (목표 − 누적) ÷ 남은 일수 */
    todayTargetUsd: number;
    /** 최근 24시간 실제 지출(구간이 모자라면 null) */
    last24hUsd: number | null;
    /** 가중 시간당 실제/필요 — ratio = 실제 ÷ 필요 (1 이면 목표 속도) */
    actualPerWeightedHour: number | null;
    neededPerWeightedHour: number;
    ratio: number | null;
    /** 지금 속도로 주기 끝까지 가면 누적 */
    projectedEndUsd: number | null;
    projectedUsedPct: number | null;
    endgame: boolean;
}

const SNAP_GAP_MS = 30 * 60_000;
const SNAP_KEEP_MS = 5 * DAY_MS;

export function stepPacing(inp: PacingInput): { state: PacingState; decision: PacingDecision } {
    const { now } = inp;
    const spent = Number.isFinite(inp.spent) && inp.spent > 0 ? inp.spent : 0;
    const period = periodId(new Date(now));
    const endsAt = nextRenewal(new Date(now)).getTime();
    const daysLeft = Math.max(0, (endsAt - now) / DAY_MS);
    const remaining = Math.max(0, PACING_TARGET_USD - spent);
    const wRem = weightedHours(now, endsAt);
    const needW = wRem > 0 ? remaining / wRem : Infinity;
    const endgame = daysLeft <= ENDGAME_DAYS;

    const prev = inp.state && inp.state.v === 1 && inp.state.period === period ? inp.state : null;
    // 스냅샷 — 30분마다 한 줄, 5일치
    const snaps: Array<[number, number]> = prev ? prev.snaps.filter(([t]) => now - t <= SNAP_KEEP_MS && t <= now) : [];
    if (!snaps.length || now - snaps[snaps.length - 1][0] >= SNAP_GAP_MS) snaps.push([now, spent]);

    // 속도 — 마지막 단계 변경 이후(최대 72시간) 구간. 단계를 바꾼 효과만 본다.
    const since = prev ? Math.max(prev.changedAt, now - 72 * HOUR_MS) : now;
    const ref = prev ? snaps.find(([t]) => t >= since) : undefined;
    let actualW: number | null = null;
    if (ref && now - ref[0] >= MIN_WINDOW_MS) {
        const w = weightedHours(ref[0], now);
        if (w >= 0.5) actualW = Math.max(0, spent - ref[1]) / w;
    }
    const ratio = actualW != null && Number.isFinite(needW) && needW > 0 ? actualW / needW : null;

    // 최근 24시간 실제 지출 — 24시간 전 이후 첫 스냅샷부터(20시간 이상 구간만 신뢰)
    const r24 = snaps.find(([t]) => t >= now - 24 * HOUR_MS);
    const last24hUsd = r24 && now - r24[0] >= 20 * HOUR_MS ? Math.max(0, spent - r24[1]) * (24 * HOUR_MS) / (now - r24[0]) : null;

    let level = prev ? clampLevel(prev.level) : BOOTSTRAP_LEVEL;
    let changedAt = prev ? prev.changedAt : now;
    let mode: PacingMode = prev ? 'measuring' : 'bootstrap';
    let reason = prev ? '속도 측정 중' : `처음 켬 — level ${BOOTSTRAP_LEVEL} 에서 시작`;

    const setLevel = (l: number, why: string) => {
        const nl = clampLevel(l);
        if (nl !== level) { level = nl; changedAt = now; }
        reason = why;
    };

    if (!inp.creditOk) {
        mode = 'credit-off';
        setLevel(Math.min(level, 0), '크레딧 불가(키 없음·서킷·킬 스위치) — 증가분 정지, 기본 주기');
    } else if (spent >= PACING_TARGET_USD) {
        mode = 'done';
        setLevel(LEVEL_MIN, `목표 $${PACING_TARGET_USD} 도달 — 갱신 주기를 최대로 늘려 남은 크레딧을 아낀다`);
    } else if (remaining <= LANDING_USD) {
        mode = 'landing';
        setLevel(Math.min(level, 0), `남은 예산 $${remaining.toFixed(2)} — 착륙(증가분 정지)`);
    } else if (prev) {
        const holdMs = endgame ? HOLD_ENDGAME_MS : HOLD_MS;
        const canChange = now - prev.changedAt >= holdMs;
        if (endgame) mode = 'endgame';
        if (ratio != null) {
            let delta = 0;
            if (ratio > 1.5) delta = -2;                       // 크게 넘침 — 머무름 시간 없이 즉시
            else if (canChange) {
                if (endgame) delta = ratio < 0.97 ? 2 : ratio < 1.0 ? 1 : ratio > 1.2 ? -2 : ratio > 1.05 ? -1 : 0;
                else delta = ratio < 0.5 ? 2 : ratio < 0.9 ? 1 : ratio > 1.3 ? -2 : ratio > 1.1 ? -1 : 0;
            }
            // 올리기는 «증거»가 있어야 한다: 측정 구간에 장중 시간이 충분해야 한다(주말·밤에 낮게 쓴 것을 보고 올려 두면 월요일 장중에 한꺼번에 넘친다)
            const evidenceH = ref ? marketHoursIn(ref[0], now) : 0;
            if (delta > 0 && evidenceH < MIN_MARKET_HOURS_TO_RAISE) {
                mode = endgame ? 'endgame' : 'measuring';
                reason = `목표 속도의 ${(ratio * 100).toFixed(0)}% 이나 측정 구간의 장중이 ${evidenceH.toFixed(1)}시간뿐 — 올리지 않고 장중을 기다린다`;
            } else if (delta > 0) { mode = endgame ? 'endgame' : 'raising'; setLevel(level + delta, `목표 속도의 ${(ratio * 100).toFixed(0)}% — 신선도 +${delta}`); }
            else if (delta < 0) { mode = 'lowering'; setLevel(level + delta, `목표 속도의 ${(ratio * 100).toFixed(0)}% — 신선도 ${delta}`); }
            else { mode = endgame ? 'endgame' : 'on-pace'; reason = `목표 속도의 ${(ratio * 100).toFixed(0)}% — 유지${!canChange && ratio < 0.9 ? '(머무름 시간 중)' : ''}`; }
        }
    }

    // 단계가 바뀐 순간의 기준점 — 다음 판단이 «바뀐 뒤의 속도»만 보게 한다
    if (changedAt === now && snaps[snaps.length - 1][0] !== now) snaps.push([now, spent]);
    const projectedEndUsd = actualW != null ? spent + actualW * wRem : null;
    const state: PacingState = { v: 1, period, level, changedAt, tickAt: now, mode, ratio: ratio != null && Number.isFinite(ratio) ? Math.round(ratio * 1000) / 1000 : null, snaps, reason };
    return {
        state,
        decision: {
            period, endsAt, daysLeft: Math.round(daysLeft * 100) / 100, remainingUsd: Math.round(remaining * 10000) / 10000,
            todayTargetUsd: daysLeft > 0 ? Math.round((remaining / daysLeft) * 10000) / 10000 : remaining,
            last24hUsd: last24hUsd == null ? null : Math.round(last24hUsd * 10000) / 10000,
            actualPerWeightedHour: actualW == null ? null : Math.round(actualW * 10000) / 10000,
            neededPerWeightedHour: Number.isFinite(needW) ? Math.round(needW * 10000) / 10000 : 0,
            ratio: state.ratio,
            projectedEndUsd: projectedEndUsd == null ? null : Math.round(projectedEndUsd * 100) / 100,
            projectedUsedPct: projectedEndUsd == null ? null : Math.round((projectedEndUsd / PACING_TARGET_USD) * 1000) / 10,
            endgame,
        },
    };
}

/** 읽는 쪽이 쓰는 안전 변환 — 상태 없음/다른 주기/12시간 넘게 갱신 안 됨 → 증가분 없는 기본 */
export function effectiveLevel(state: PacingState | null, now: number): number {
    if (!state || state.v !== 1 || state.period !== periodId(new Date(now))) return 0;
    const lvl = clampLevel(state.level);
    return now - state.tickAt > STATE_STALE_MS ? Math.min(lvl, 0) : lvl;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) 저장소 입출력
// ─────────────────────────────────────────────────────────────────────────────

export const PACE_STATE_KEY = 'llm:pace:state';
const COST_KEY = (period: string) => `llm:cost:${period}`;       // llmLadder.LLM_KEYS.cost 와 같다(시험이 대조)
const BREAKER_A55_KEY = 'llm:cb:a55';
const KILL_KEY = 'llm:ladder:off';
export const PACE_TICK_MIN_GAP_MS = 9 * 60_000;

export interface PacingDeps {
    store: LlmStore;
    now: () => number;
    /** 크레딧 키가 있는가 */
    hasKey: () => boolean;
}

export function defaultPacingDeps(): PacingDeps {
    return { store: upstashStore, now: () => Date.now(), hasKey: () => !!(process.env.ANTHROPIC_API_KEY_CREDITS || '').trim() };
}

async function loadState(store: LlmStore): Promise<PacingState | null> {
    try {
        const raw = await store.get(PACE_STATE_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw) as PacingState;
        return s && s.v === 1 && Array.isArray(s.snaps) ? s : null;
    } catch { return null; }
}

async function creditOk(d: PacingDeps, spent: number): Promise<boolean> {
    if (!d.hasKey()) return false;
    if (process.env.AI_LADDER_OFF === '1') return false;
    if (spent >= LEDGER_CAP_USD) return false;
    const now = d.now();
    const until = Number(await d.store.get(BREAKER_A55_KEY));
    if (Number.isFinite(until) && until > now) return false;
    const kill = await d.store.get(KILL_KEY);
    if (kill) {
        if (kill === '*') return false;
        try { const arr = JSON.parse(kill); if (Array.isArray(arr) && (arr.includes('*') || arr.includes('UC'))) return false; } catch { /* 모양이 깨진 값 — 무시 */ }
    }
    return true;
}

export interface PacingStatus {
    period: string;
    renewsAt: string;
    targetUsd: number;
    capUsd: number;
    spentUsd: number;
    level: number;
    mode: PacingMode;
    reason: string;
    knobs: PacingKnobs;
    baseline: PacingKnobs;
    /** 장중이 아니면 다이제스트는 기본 주기보다 잦지 않다 — 지금 시각의 실제 값 */
    digestIntervalNowMin: number;
    prewarmWindowOpen: boolean;
    decision: PacingDecision | null;
    stateAgeMin: number | null;
    changedAt: string | null;
    stale: boolean;
}

function describe(state: PacingState | null, decision: PacingDecision | null, spent: number, now: number): PacingStatus {
    const lvl = effectiveLevel(state, now);
    const knobs = knobsForLevel(lvl);
    const stale = !!state && now - state.tickAt > STATE_STALE_MS;
    return {
        period: periodId(new Date(now)),
        renewsAt: nextRenewal(new Date(now)).toISOString(),
        targetUsd: PACING_TARGET_USD, capUsd: LEDGER_CAP_USD,
        spentUsd: Math.round(spent * 10000) / 10000,
        level: lvl, mode: state?.mode ?? 'bootstrap', reason: stale ? '조절기 상태가 12시간 넘게 갱신되지 않아 증가분을 끈 기본 값' : state?.reason ?? '상태 없음 — 기본 값',
        knobs, baseline: BASELINE_KNOBS,
        digestIntervalNowMin: effectiveDigestIntervalMin(knobs, now),
        prewarmWindowOpen: inMarketWindow(now),
        decision,
        stateAgeMin: state ? Math.round((now - state.tickAt) / 60000) : null,
        changedAt: state ? new Date(state.changedAt).toISOString() : null,
        stale,
    };
}

/**
 * 판단 한 번 — 크론(pace-warm)이 10분마다 부른다. 직전 판단과 9분 안이면 저장된 값을 그대로 돌려준다.
 * 저장소가 죽으면 예외 없이 «기본 값»(level 0)을 돌려준다.
 */
export async function tickPacing(deps?: Partial<PacingDeps>, opts: { force?: boolean } = {}): Promise<PacingStatus> {
    const d: PacingDeps = { ...defaultPacingDeps(), ...(deps || {}) };
    const now = d.now();
    const period = periodId(new Date(now));
    try {
        const prev = await loadState(d.store);
        const spent = Number(await d.store.get(COST_KEY(period))) || 0;
        if (prev && prev.period === period && !opts.force && now - prev.tickAt < PACE_TICK_MIN_GAP_MS) {
            const { decision } = stepPacing({ now, spent, creditOk: true, state: prev });   // 보여 주기만 — 저장하지 않는다
            return describe(prev, decision, spent, now);
        }
        const ok = await creditOk(d, spent);
        const { state, decision } = stepPacing({ now, spent, creditOk: ok, state: prev });
        await d.store.setEx(PACE_STATE_KEY, JSON.stringify(state), 45 * 24 * 3600);
        _readCache = null;
        return describe(state, decision, spent, now);
    } catch {
        return describe(null, null, 0, now);
    }
}

/** 저장 없이 현재 상태만 계산(관리자 엔드포인트용) */
export async function peekPacing(deps?: Partial<PacingDeps>): Promise<PacingStatus> {
    const d: PacingDeps = { ...defaultPacingDeps(), ...(deps || {}) };
    const now = d.now();
    try {
        const state = await loadState(d.store);
        const spent = Number(await d.store.get(COST_KEY(periodId(new Date(now))))) || 0;
        const ok = await creditOk(d, spent);
        const decision = stepPacing({ now, spent, creditOk: ok, state }).decision;
        return describe(state, decision, spent, now);
    } catch {
        return describe(null, null, 0, now);
    }
}

// ── 사용자 경로용 — 수명(TTL)만 빠르게 읽는다. 60초 캐시 · 400ms 안에 못 읽으면 기본 값 ──
let _readCache: { at: number; knobs: PacingKnobs } | null = null;
export function _resetPacingForTest(): void { _readCache = null; }

export async function pacingKnobs(deps?: Partial<PacingDeps>, budgetMs = 400): Promise<PacingKnobs> {
    const d: PacingDeps = { ...defaultPacingDeps(), ...(deps || {}) };
    const now = d.now();
    if (_readCache && now - _readCache.at < 60_000) return _readCache.knobs;
    try {
        const state = await Promise.race([
            loadState(d.store),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), budgetMs)),
        ]);
        const knobs = knobsForLevel(effectiveLevel(state, now));
        _readCache = { at: now, knobs };
        return knobs;
    } catch { return BASELINE_KNOBS; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) 사전 생성 대상 — 인기 순 (UC 종목 카드 ≤72 · 종목 뉴스 ≤100)
// ─────────────────────────────────────────────────────────────────────────────
export const PREWARM_TICKERS: readonly string[] = [
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ', 'AMD', 'PLTR', 'COIN', 'MU', 'AVGO', 'NFLX', 'IWM',
    'SMCI', 'MSTR', 'ARM', 'INTC', 'TSM', 'ORCL', 'CRM', 'BABA', 'DIS', 'JPM', 'BA', 'SOFI', 'HOOD', 'RIVN', 'UBER', 'SHOP',
    'SNOW', 'CRWD', 'PANW', 'ADBE', 'QCOM', 'LLY', 'UNH', 'XOM', 'WMT', 'COST', 'V', 'MA', 'GS', 'BAC', 'F', 'GM',
    'NIO', 'PYPL', 'SNAP', 'RBLX', 'DKNG', 'CVNA', 'ANET', 'NOW', 'DDOG', 'NET', 'MDB', 'AMAT', 'LRCX', 'KLAC', 'ASML', 'IBM',
    'CSCO', 'T', 'VZ', 'CAT', 'GE', 'LMT', 'RTX', 'DAL', 'UAL', 'PFE', 'MRNA', 'CVX', 'OXY', 'NKE', 'SBUX', 'MCD',
    'KO', 'PEP', 'TGT', 'LCID', 'ABNB', 'DASH', 'SPOT', 'PINS', 'JD', 'PDD', 'GME', 'AMC', 'CELH', 'ZS', 'TXN', 'HON',
    'DIA', 'SOXL', 'TQQQ', 'SQQQ',
];

/** 두 이름이 같은 날 같은 키를 쓰지 않게 — 순환 커서(분 단위 시계 기반, 저장 없이)가 필요할 때 쓴다 */
export function rotateSlice<T>(list: readonly T[], count: number, offset: number): T[] {
    if (count <= 0 || !list.length) return [];
    const n = Math.min(count, list.length);
    const start = ((offset % list.length) + list.length) % list.length;
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(list[(start + i) % list.length]);
    return out;
}
