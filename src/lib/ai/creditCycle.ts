/**
 * 실제 크레딧 주기 · 잔액 기준점 · 용도 등급별 정지선 (2026-11-06).
 *
 * 왜: 11/5 대표가 Claude API 크레딧이 새로 찼다(13:18Z «205.83달러»)고 확인한 뒤에도, 우리 내부 원장은
 *   «매월 6일 00:00Z 갱신»이라는 추정 주기(llmPricing.periodId)로 $199 상한에 닿아(16:00Z) 모든 용도의 ①(Haiku 5.5)을 끊었다.
 *   → 장마감 리포트가 현행(Haiku 4.5)으로 만들어져 서빙 가드에서 떨어졌다(2026-11-06/close-report-1105/RESULT.md).
 *   대표 11/6: «이미 크레딧이 해결이 되었는데 이런 일이 발생하게 하면 안 되는 것이다».
 *
 * 그래서:
 *   1) 주기·한도는 «실제 잔액 기준점»(checkpoint)에서 시작한다 — «이 시각에 실제 잔액이 $B 였다».
 *      그 시각부터의 지출만 새 원장(llm:cost:<주기 id>)에 쌓이고, 한도는 B 다. 기준점은 Redis `llm:credit:checkpoint`
 *      (관리자 POST /api/admin/ai-ladder {action:'credit-reset'}) — 없거나 깨지면 코드 기본값(CODE_CHECKPOINT).
 *      다음 갱신(nextResetAt) 뒤에는 매월 같은 시각에 monthlyUsd(기본 $200)로 새 주기가 시작된다.
 *   2) 정지선은 용도 등급별로 다르다. 덜 중요한 지출부터 끊고, 사용자에게 정해진 시각에 나가는 글은 실제 잔액 바로 아래까지 돈다.
 *        extra     (증가분·예열·재생성·시험)      잔액 − $1.5 에서 정지 — AWS 로 넘기지 않고 건너뜀(옛 사본 유지)
 *        standard  (사용자가 연 화면의 생성 등)    잔액 − $1.0 에서 ① 정지 → ②③(AWS)
 *        essential (장마감 리포트·모닝 브리핑·Tactical·푸시/알림 글·내 종목 AI 줄 등) 잔액 − $0.2 에서 정지(안전 여유 — 원장은 실제보다 약간 크게 센다)
 *      페이싱 조절기의 목표는 잔액 − $2.0 (extra 정지선보다 아래).
 *   3) 경보: 잔액의 80%·95% 를 넘을 때, 등급이 처음 끊길 때, Anthropic 이 실제로 «크레딧 부족»을 돌려줄 때 — 주기마다 한 번씩 SNS(signum-lambda-alerts → contact@).
 *
 * 실제 잔액·한도가 있는 곳: Anthropic 콘솔(Billing·Limits). 우리 코드는 콘솔을 읽지 못한다(관리자 API 키 없음) — 그래서 기준점을 사람이 넣는다.
 * 순수 함수(cycleAt·tierStopUsd·spendTier·parseCheckpoint)는 tests/creditCycle.test.ts 가 고정한다.
 */
import { nextRenewal, periodId } from '@/lib/ai/llmPricing';
import type { LlmStore } from '@/lib/ai/llmStore';

export interface CreditCheckpoint {
    /** ISO — 이 시각에 실제 잔액이 balanceUsd 였다(콘솔에서 본 값) */
    at: string;
    balanceUsd: number;
    /** 다음 실제 갱신(새 크레딧이 들어오는) 시각. 없으면 at + 1개월 */
    nextResetAt?: string;
    /** 그 뒤 매월 새로 들어오는 크레딧(USD). 없으면 DEFAULT_MONTHLY_USD */
    monthlyUsd?: number;
    note?: string;
    setAt?: string;
}

export const CREDIT_CHECKPOINT_KEY = 'llm:credit:checkpoint';
export const DEFAULT_MONTHLY_USD = 200;

/**
 * 코드 기본 기준점 — 대표 2026-11-05 22:18 KST(13:18Z) «클로드 api 205.83달러»(초기화 확인).
 * 11/4 15:05Z 콘솔 잔액 $12.27 → 11/5 13:18Z $205.83: 그사이 실제 갱신이 있었다(우리 추정 11/6 00:00Z 보다 앞).
 * 다음 갱신은 12/5 00:00Z 로 잡는다 — 실제 갱신(11/5, 13:18Z 이전)보다 늦지 않게. 이르면 새 원장이 0 에서 시작할 뿐이고,
 * 실제 잔액이 모자라면 Anthropic 이 «크레딧 부족»을 돌려줘 사다리가 AWS 로 넘기고 경보가 간다.
 */
export const CODE_CHECKPOINT: CreditCheckpoint = {
    at: '2026-11-05T13:18:00.000Z', balanceUsd: 205.83, nextResetAt: '2026-12-05T00:00:00.000Z', monthlyUsd: DEFAULT_MONTHLY_USD,
    note: '대표 11/5 22:18 KST «클로드 api 205.83달러» — 크레딧 초기화 확인',
};

export interface CreditCycle {
    /** 원장 키 접미사 — 기준점·월 주기 'cYYYYMMDDTHHmm' · 기준점 이전(예전 달력 주기) 'YYYY-MM' */
    id: string;
    startMs: number;
    endsMs: number;
    /** 이 주기에 쓸 수 있는 실제 크레딧(USD) */
    amountUsd: number;
    source: 'checkpoint' | 'monthly' | 'legacy';
}

export type SpendTier = 'essential' | 'standard' | 'extra';
/** 잔액에서 남기는 여유(USD) — 작을수록 늦게 끊긴다 */
export const TIER_HEADROOM_USD: Readonly<Record<SpendTier, number>> = { essential: 0.2, standard: 1.0, extra: 1.5 };
export const PACING_HEADROOM_USD = 2.0;
/** 잔액 대비 경보 비율 */
export const ALERT_FRACTIONS = [0.8, 0.95] as const;

export const tierStopUsd = (tier: SpendTier, amountUsd: number): number => Math.max(0, Math.round((amountUsd - TIER_HEADROOM_USD[tier]) * 10000) / 10000);
export const pacingTargetUsd = (amountUsd: number): number => Math.max(0, Math.round((amountUsd - PACING_HEADROOM_USD) * 10000) / 10000);

/**
 * 사용자에게 정해진 시각·정해진 자리에 나가는 글 — 크레딧이 빠듯해도 마지막까지 최고 모델로 만든다.
 *   CrossSector 장마감 리포트 · MorningBriefing 모닝 브리핑 · Guardian/GuardianTranslate Tactical·시장 인사이트 ·
 *   SectorHeadlines 섹터 헤드라인 · EarningsBrief 실적 브리핑 · NewsDigest 뉴스 펄스(기본 주기) ·
 *   WatchlistLine 내 종목 AI 줄 · TodayPicks 오늘 볼 것·이상신호 푸시 글(SIG_PURPOSE) · TodaySummaryEcon 오늘 요약 지표 줄
 */
export const ESSENTIAL_PURPOSES: readonly string[] = [
    'CrossSector', 'MorningBriefing', 'Guardian', 'GuardianTranslate', 'SectorHeadlines', 'EarningsBrief', 'NewsDigest',
    'WatchlistLine', 'TodayPicks', 'TodaySummaryEcon',
];
/** 크레딧 전용이라 늘 withFreshTier 로 불리지만 «증가분»이 아닌 용도 — 증가분 문맥이어도 essential */
export const CREDIT_ONLY_ESSENTIAL: readonly string[] = ['WatchlistLine', 'TodayPicks', 'TodaySummaryEcon'];

export function spendTier(purpose: string, fresh: boolean): SpendTier {
    if (fresh && !CREDIT_ONLY_ESSENTIAL.includes(purpose)) return 'extra';
    return ESSENTIAL_PURPOSES.includes(purpose) ? 'essential' : 'standard';
}

const compact = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace(/[-:]/g, '');   // 20261105T1318

/** ms 에 k 개월을 더한다(UTC, 시각 유지). 31일 같은 날이 없는 달은 그달 마지막 날 */
export function addMonthsUTC(ms: number, k: number): number {
    const d = new Date(ms);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + k;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

/** 저장된 값 검사 — 깨졌으면 null */
export function parseCheckpoint(raw: unknown): CreditCheckpoint | null {
    let x: any = raw;
    if (typeof raw === 'string') { try { x = JSON.parse(raw); } catch { return null; } }
    if (!x || typeof x !== 'object') return null;
    const at = Date.parse(String(x.at ?? ''));
    const bal = Number(x.balanceUsd);
    if (!Number.isFinite(at) || !(bal > 0 && bal < 100_000)) return null;
    const out: CreditCheckpoint = { at: new Date(at).toISOString(), balanceUsd: bal };
    if (x.nextResetAt != null) {
        const n = Date.parse(String(x.nextResetAt));
        if (!Number.isFinite(n) || n <= at) return null;
        out.nextResetAt = new Date(n).toISOString();
    }
    if (x.monthlyUsd != null) {
        const mu = Number(x.monthlyUsd);
        if (!(mu > 0 && mu < 100_000)) return null;
        out.monthlyUsd = mu;
    }
    if (typeof x.note === 'string') out.note = x.note.slice(0, 200);
    if (typeof x.setAt === 'string') out.setAt = x.setAt.slice(0, 40);
    return out;
}

/** 지금 시각의 주기 — 순수 함수 */
export function cycleAt(nowMs: number, cp: CreditCheckpoint | null = CODE_CHECKPOINT): CreditCycle {
    const c = cp ? parseCheckpoint(cp) : null;
    const atMs = c ? Date.parse(c.at) : NaN;
    if (!c || !(nowMs >= atMs)) {
        // 기준점 이전(또는 기준점 없음) — 예전 달력 주기(매월 6일 00:00Z), 기준점에서 끝난다
        const now = new Date(nowMs);
        const ends = nextRenewal(now).getTime();
        const prevStart = addMonthsUTC(ends, -1);
        return { id: periodId(now), startMs: prevStart, endsMs: c && atMs > nowMs ? Math.min(ends, atMs) : ends, amountUsd: DEFAULT_MONTHLY_USD, source: 'legacy' };
    }
    const nextMs = c.nextResetAt ? Date.parse(c.nextResetAt) : addMonthsUTC(atMs, 1);
    if (nowMs < nextMs) return { id: `c${compact(atMs)}`, startMs: atMs, endsMs: nextMs, amountUsd: c.balanceUsd, source: 'checkpoint' };
    let k = 0;
    while (addMonthsUTC(nextMs, k + 1) <= nowMs && k < 1200) k++;
    const start = addMonthsUTC(nextMs, k);
    return { id: `c${compact(start)}`, startMs: start, endsMs: addMonthsUTC(nextMs, k + 1), amountUsd: c.monthlyUsd ?? DEFAULT_MONTHLY_USD, source: 'monthly' };
}

// ── 저장소에서 읽기 — 30초 캐시(사다리 상태 캐시와 같은 간격). 저장소가 죽으면 코드 기본 기준점 ──
let _cp: { at: number; cp: CreditCheckpoint } | null = null;
const CP_TTL_MS = 30_000;
export function _resetCreditCycleForTest(): void { _cp = null; }

export async function loadCheckpoint(store: LlmStore, nowMs: number): Promise<CreditCheckpoint> {
    if (_cp && nowMs - _cp.at < CP_TTL_MS && nowMs >= _cp.at) return _cp.cp;
    let cp = CODE_CHECKPOINT;
    try { cp = parseCheckpoint(await store.get(CREDIT_CHECKPOINT_KEY)) ?? CODE_CHECKPOINT; } catch { /* 코드 기본값 */ }
    _cp = { at: nowMs, cp };
    return cp;
}

export async function currentCycle(store: LlmStore, nowMs: number): Promise<CreditCycle> {
    return cycleAt(nowMs, await loadCheckpoint(store, nowMs));
}

export function describeCycle(c: CreditCycle) {
    return {
        id: c.id, source: c.source, startAt: new Date(c.startMs).toISOString(), endsAt: new Date(c.endsMs).toISOString(), amountUsd: c.amountUsd,
        stopsUsd: { essential: tierStopUsd('essential', c.amountUsd), standard: tierStopUsd('standard', c.amountUsd), extra: tierStopUsd('extra', c.amountUsd) },
        pacingTargetUsd: pacingTargetUsd(c.amountUsd),
        alertsAtUsd: ALERT_FRACTIONS.map((f) => Math.round(f * c.amountUsd * 100) / 100),
    };
}
