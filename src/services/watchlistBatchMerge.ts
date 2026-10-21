import { calculateWhaleIndex } from '@/services/alphaEngine';
import { wallRangePct } from '@/lib/impliedMove';
import { levelViolations, rowSpot } from '@/lib/optionLevelGate';
import { isFreshOptionsRow } from '@/lib/app/intelOptionsBasis';
import { isOptionExpiredAt } from '@/lib/marketCalendar';

/**
 * 관심종목 배치 정상본 갱신 = «필드 묶음 단위 병합» (2026-10-21, 관문 보류 5회의 근본 수리).
 *
 * 규칙 하나: 묶음 값이 새 계산에서 비었고(null·누락) 직전 정상본에는 있으며,
 *            «그 묶음의 원천이 이번 계산에 도착하지 않았다»는 증거가 있을 때만
 *   → 직전 값과 그 «원천 시각 필드»를 그대로 유지한다(시각을 새로 찍지 않는다 = 옛 값이 새 값처럼 보이지 않는다).
 *   → held[묶음] = 그 값이 처음 계산된 시각 · 상한 HOLD_MAX_MS(30분) · 5초 뒤 배경 재계산(HELD_RETRY_MS).
 * 원천이 도착했는데 비었다면 그 null 은 계산의 결론이다(정당한 소멸) — 새 계산 그대로 쓴다.
 *   «null 이 정당한가»를 값으로 추측하지 않는다(관문 10211255·이후: 만기·NO_MARKET·OI 계산 불가·FINRA 행 없음·
 *   ivSkew 게이트·3일 수익률 0 등 정당한 null 이 끝없이 있다). 원천 경계에서 «읽었나/못 읽었나»만 기록한다.
 *
 * 원천 도착 증거(WatchlistBatchTiming):
 *   다크풀     ← FINRA 일괄 조회 실패(getDarkPoolBatchChecked !ok·예외)             missed.darkPool
 *   유동성     ← 직전 정규장 저장본 읽기 실패(sessionAwareLiquidity onReadFailure)    missed.liquidity
 *   레벨       ← 구조 판본 저장소 읽기 실패(prefetchLevelsForExit onReadFailure·예외)  missed.levels
 *   GEX·스퀴즈 ← 종목별 구조 판본이 안 옴(optionMetricsService onEdition structure=false)
 *   P/C        ← 종목별 OI 행이 안 옴(onEdition oiRow=false)
 * 유지 대상이 아닌 필드(새 계산 그대로): 세션·현재가 표시값(price·changePct·missingFields·session·extended*·vwap·volume·relVol·
 *   sparkline 등 — PRE→정규장에서 extended* 가 비는 것이 정상), 분석 캐시 유래값(rsi·return3d·ivSkew·iv·예상 변동·
 *   순프리미엄·alphaSnapshot — 분석 캐시를 못 읽으면 같은 요청이 새로 계산하므로 «못 받은 null»이 없다), 틱 지표(늘 null).
 * 유지값 재검사: 레벨은 직전 판본 만기·새 가격 기준 정의 위반이면, P/C 는 직전 행이 지금 기준 신선도 상한을 넘으면 유지하지 않는다.
 * 파생값: 고래지수(출구와 같은 식)·맥스페인 거리·벽 사이 폭은 유지값·새 가격으로 다시 계산한다.
 */
export const HOLD_MAX_MS = 30 * 60_000;
export const HELD_RETRY_MS = 5_000;

type Rt = Record<string, any>;
/** 이번 계산의 원천 도착 증거. 모르면(undefined) 유지하지 않는다. */
export type SourceEvidence = {
    structure?: boolean; oiRow?: boolean;                                  // 종목별: 읽었으면 true
    missed?: { darkPool?: boolean; liquidity?: boolean; levels?: boolean }; // 배치: 못 읽었으면 true
};
type Group = {
    name: string;
    fields: readonly string[];
    has: (rt: Rt) => boolean;
    /** 원천이 이번 계산에 도착하지 않았다는 증거 */
    notDelivered: (ev: SourceEvidence) => boolean;
    /** 유지해도 되는가(지금 시각·새 가격 기준 재검사) */
    stillValid?: (prev: Rt, next: Rt, now: number) => boolean;
    whale?: boolean;
};

const present = (v: unknown) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')
    && !(typeof v === 'number' && !Number.isFinite(v));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const LEVELS = ['maxPain', 'callWall', 'putFloor', 'gammaFlipLevel'] as const;
const ALPHA_INPUTS = ['gex', 'squeezeScore', 'pcr', 'darkPoolPct'];

export const HOLD_GROUPS: readonly Group[] = [
    { name: 'darkPool', fields: ['darkPoolPct', 'darkPoolVol', 'darkPoolDate', 'darkPoolSource'], has: rt => present(rt.darkPoolPct),
        notDelivered: ev => ev.missed?.darkPool === true, whale: true },
    { name: 'liquidity', fields: ['liquidityScore', 'spreadPct'], has: rt => present(rt.liquidityScore),
        notDelivered: ev => ev.missed?.liquidity === true },
    { name: 'gex', fields: ['gex', 'netGex', 'gexM', 'gammaRegime', 'gexBasis'], has: rt => present(rt.gex),
        notDelivered: ev => ev.structure === false, whale: true },
    { name: 'squeeze', fields: ['squeezeScore', 'squeezeRisk'], has: rt => present(rt.squeezeScore),
        notDelivered: ev => ev.structure === false },
    { name: 'pcr', fields: ['pcr', 'optionsAsOf', 'pcrBasis'], has: rt => present(rt.pcr),
        notDelivered: ev => ev.oiRow === false,
        stillValid: (prev, _next, now) => isFreshOptionsRow(num(prev.optionsAsOf), now) },
    { name: 'levels', fields: [...LEVELS, 'levelsRefPrice', 'levelsExpiration', 'levelsChainDate', 'levelsSource',
        'levelsAsOf', 'levelsStaleReason', 'levelsStaleAsOf', 'levelsDropped', 'levelsReselected'],
        has: rt => LEVELS.some(f => present(rt[f])),
        notDelivered: ev => ev.missed?.levels === true,
        stillValid: (prev, next, now) => !(present(prev.levelsExpiration) && isOptionExpiredAt(prev.levelsExpiration, now))
            && levelViolations(prev, rowSpot(next)).length === 0 },
];

export type HeldMap = Record<string, number>;
type Env = { at: number; result: any; held?: HeldMap };

/** next.result 를 제자리에서 병합하고 next.held 를 정한다. 반환 = 유지한 묶음 이름. */
export function mergeHeldFields(previous: Env | null | undefined, next: Env, now: number, evidence?: SourceEvidence): string[] {
    const held: HeldMap = {};
    const kept: string[] = [];
    const prevRt: Rt | undefined = previous?.result?.realtime;
    const nextRt: Rt | undefined = next.result?.realtime;
    if (evidence && previous && prevRt && nextRt && previous.at <= next.at) {
        for (const g of HOLD_GROUPS) {
            if (!g.has(prevRt) || g.has(nextRt) || !g.notDelivered(evidence)) continue;
            const since = previous.held?.[g.name] ?? previous.at;
            if (!Number.isFinite(since) || now - since > HOLD_MAX_MS) continue;
            if (g.stillValid && !g.stillValid(prevRt, nextRt, now)) continue;
            for (const f of g.fields) {
                if (f in prevRt) nextRt[f] = structuredClone(prevRt[f]);
                else delete nextRt[f];
            }
            held[g.name] = since;
            kept.push(g.name);
        }
        if (kept.length) {
            const groups = new Set(kept);
            if (HOLD_GROUPS.some(g => g.whale && groups.has(g.name))) {
                // calculateWatchlistBatch 마지막 줄과 같은 식·같은 입력(원값 그대로)
                nextRt.whaleIndex = calculateWhaleIndex(nextRt.gex, nextRt.darkPoolPct, nextRt.blockTrades, nextRt.netPremium);
            }
            // 알파 설명(whyKR·whyFactors·triggerCodes)은 GEX·스퀴즈·P/C·다크풀을 입력으로 만든다(optionAlphaService.readOptionAlpha).
            // 유지로 그 입력이 직전 정상본과 «완전히 같아졌고» 같은 판본(score·action·capturedAt)이면 설명도 직전 것과 같아야 한다 → 직전 설명 사용.
            // 입력 중 하나라도 정당하게 비었거나 바뀌었으면 새 계산의 설명 그대로(관문: NO_MARKET 인데 «GEX안전지대»가 남으면 안 됨).
            const pa = previous.result?.alphaSnapshot, na = next.result?.alphaSnapshot;
            if (['gex', 'squeeze', 'pcr', 'darkPool'].some(g => groups.has(g)) && pa && na && typeof pa === 'object' && typeof na === 'object'
                && ALPHA_INPUTS.every(f => Object.is(nextRt[f] ?? null, prevRt[f] ?? null))
                && ['score', 'action', 'capturedAt'].every(k => Object.is(pa[k] ?? null, na[k] ?? null))) {
                next.result.alphaSnapshot = structuredClone(pa);
            }
            if (groups.has('levels')) {
                // applyLevelsToRealtime 과 같은 규칙: 거리 기준가 = 이 행의 화면 현물
                const ref = rowSpot(nextRt), mp = num(nextRt.maxPain);
                if ('maxPainDist' in nextRt || mp != null) nextRt.maxPainDist = mp && ref ? Number((((mp - ref) / ref) * 100).toFixed(2)) : null;
                if ('wallRangePct' in nextRt) nextRt.wallRangePct = wallRangePct(nextRt.callWall, nextRt.putFloor, nextRt.price);
            }
        }
    }
    if (kept.length) next.held = held; else delete next.held;
    return kept;
}
