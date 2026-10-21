import { calculateWhaleIndex } from '@/services/alphaEngine';
import { readImpliedMoveFields, wallRangePct } from '@/lib/impliedMove';
import { levelViolations, rowSpot } from '@/lib/optionLevelGate';
import { isFreshOptionsRow } from '@/lib/app/intelOptionsBasis';
import { isOptionExpiredAt } from '@/lib/marketCalendar';

/**
 * 관심종목 배치 정상본 갱신 = «필드 묶음 단위 병합» (2026-10-21, 관문 3회 보류의 근본 수리).
 *
 * 원천마다 실패 신호를 붙이는 대신, 새 계산 결과 자체를 직전 정상본과 묶음별로 견준다.
 *   새 계산에서 묶음의 값이 비었고(null·누락) 직전 정상본에는 값이 있으며, 아래 «정당하게 사라지는 경우»가 아니면
 *   → 그 묶음의 값과 «원천 시각 필드»를 직전 정상본 그대로 유지한다(시각을 새로 찍지 않는다 = 옛 값이 새 값처럼 보이지 않는다).
 *   → 유지한 묶음은 held[묶음] = 그 값이 처음 계산된 시각으로 기록하고, 짧은 뒤(HELD_RETRY_MS) 배경 재계산을 부른다.
 *   → 유지 상한(HOLD_MAX_MS)을 넘으면 더 붙잡지 않고 새 계산(빈 값)을 그대로 쓴다.
 * 유지한 입력에서 나오는 파생값(고래지수·맥스페인 거리·벽 사이 폭)은 새 가격·유지값으로 다시 계산한다.
 *
 * 정당하게 사라지는 경우(코드 전수 확인 — 유지하지 않는다):
 *   1) 세션·현재가에 묶인 표시값: price·changePct·missingFields·session·extendedPrice·extendedChange·extendedChangePct·
 *      extendedLabel·vwap·vwapDist·volume·relVol·sparkline·lastQuote 등 — 세션 전환(PRE→정규장)에서 extended* 가 비는 것이 정상,
 *      등락률 결측은 missingFields 로 따로 표시된다. 묶음 표에 없는 필드는 전부 새 계산 그대로다.
 *   2) 틱 지표 blockTrades·blockVolume·netBuyValue — 플랜 밖이라 늘 null(정책).
 *   3) 옵션 레벨: 새 계산이 구조 판본을 읽었으면(levelsSource 있음) 정의상 «범위 밖» null·안전망 levelsDropped 가 정상이다.
 *      판본이 만기·지연으로 가려진 경우(levelsStaleReason 있음)도 정상. 직전 판본 만기가 지났거나(isOptionExpiredAt)
 *      새 가격 기준 정의 위반(levelViolations)이면 유지하지 않는다.
 *   4) P/C(pcr·optionsAsOf): 이번 계산이 OI 행을 실제로 읽었으면(신선도 초과·계산 불가로 null) 유지 안 함.
 *      행을 못 읽었을 때도 직전 행 시각이 지금 기준 신선할 때만 유지.
 *   4-1) GEX·스퀴즈: 이번 계산이 구조 판본을 실제로 읽었으면(만기·NO_MARKET·값 없음으로 null) 유지 안 함.
 *   5) 예상 변동: 정의 표식·만기 검사(readImpliedMoveFields)를 지금 시각으로 다시 통과할 때만 유지.
 *   6) 파생값 whaleIndex·whaleConfidence·maxPainDist·wallRangePct — 유지하지 않고 다시 계산(또는 새 계산 그대로).
 *      alphaSnapshot 은 설명 입력(gex·squeeze·pcr·darkPool)을 유지했을 때 직전 스냅샷을 통째로 유지한다(자기 capturedAt).
 */
export const HOLD_MAX_MS = 30 * 60_000;
export const HELD_RETRY_MS = 5_000;

type Rt = Record<string, any>;
/** 이번 계산에서 옵션 원천을 실제로 읽었는가(optionMetricsService.onEdition). 모르면 undefined. */
export type SourceRead = { structure: boolean; oiRow: boolean };
type Group = {
    name: string;
    fields: readonly string[];
    /** 직전·새 결과에서 묶음이 «값 있음»인가 */
    has: (rt: Rt) => boolean;
    /** 새 계산이 이 묶음을 정당하게 비웠는가(유지 금지) */
    legit?: (next: Rt, prev: Rt, now: number, read?: SourceRead) => boolean;
    whale?: boolean;
};

const present = (v: unknown) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')
    && !(typeof v === 'number' && !Number.isFinite(v));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const LEVELS = ['maxPain', 'callWall', 'putFloor', 'gammaFlipLevel'] as const;
const ALPHA_INPUTS = ['gex', 'squeeze', 'pcr', 'darkPool'];

export const HOLD_GROUPS: readonly Group[] = [
    { name: 'darkPool', fields: ['darkPoolPct', 'darkPoolVol', 'darkPoolDate', 'darkPoolSource'], has: rt => present(rt.darkPoolPct), whale: true },
    { name: 'liquidity', fields: ['liquidityScore', 'spreadPct'], has: rt => present(rt.liquidityScore) },
    // 구조 판본을 읽었는데 null = 만기 지남·NO_MARKET·판본에 값 없음(정의) → 유지 안 함. 판본이 안 왔을 때(장애·키 부재 구분 불가)만 유지.
    { name: 'gex', fields: ['gex', 'netGex', 'gexM', 'gammaRegime', 'gexBasis'], has: rt => present(rt.gex), whale: true,
        legit: (_n, _p, _now, read) => read?.structure === true },
    { name: 'squeeze', fields: ['squeezeScore', 'squeezeRisk'], has: rt => present(rt.squeezeScore),
        legit: (_n, _p, _now, read) => read?.structure === true },
    // OI 행을 읽었는데 null = 행이 신선도 상한 초과·콜/풋 OI 로 계산 불가(정의) → 유지 안 함. 직전 행도 지금 기준 신선해야 유지.
    { name: 'pcr', fields: ['pcr', 'optionsAsOf', 'pcrBasis'], has: rt => present(rt.pcr),
        legit: (_n, prev, now, read) => read?.oiRow === true || !isFreshOptionsRow(num(prev.optionsAsOf), now) },
    { name: 'netPremium', fields: ['netPremium'], has: rt => present(rt.netPremium), whale: true },
    { name: 'levels', fields: [...LEVELS, 'levelsRefPrice', 'levelsExpiration', 'levelsChainDate', 'levelsSource',
        'levelsAsOf', 'levelsStaleReason', 'levelsStaleAsOf', 'levelsDropped', 'levelsReselected'],
        has: rt => LEVELS.some(f => present(rt[f])),
        legit: (next, prev, now) => present(next.levelsSource) || present(next.levelsStaleReason)
            || (present(prev.levelsExpiration) && isOptionExpiredAt(prev.levelsExpiration, now))
            || levelViolations(prev, rowSpot(next)).length > 0 },
    { name: 'impliedMove', fields: ['impliedMovePct', 'impliedMoveExpiry', 'impliedMoveBasis', 'impliedMoveAsOf', 'impliedMoveDef', 'impliedMoveSession'],
        has: rt => present(rt.impliedMovePct),
        legit: (_n, prev, now) => readImpliedMoveFields(prev, now).impliedMovePct == null },
    { name: 'ivSkew', fields: ['ivSkew'], has: rt => present(rt.ivSkew) },
    { name: 'iv', fields: ['iv', 'ivSourceDate', 'ivObservedAt'], has: rt => present(rt.iv) },
    { name: 'atmIv', fields: ['atmIv', 'atmIvSourceDate', 'atmIvObservedAt'], has: rt => present(rt.atmIv) },
    { name: 'rsi', fields: ['rsi'], has: rt => present(rt.rsi) },
    { name: 'return3d', fields: ['return3d'], has: rt => present(rt.return3d) },
];

export type HeldMap = Record<string, number>;
type Env = { at: number; result: any; held?: HeldMap };

/**
 * next.result 를 제자리에서 병합하고 next.held 를 정한다. 반환 = 유지한 묶음 이름.
 * previous 는 같은 종목·모드의 직전 정상본(가격 검사를 통과한 것)이어야 한다.
 */
export function mergeHeldFields(previous: Env | null | undefined, next: Env, now: number, read?: SourceRead): string[] {
    const held: HeldMap = {};
    const kept: string[] = [];
    const prevRt: Rt | undefined = previous?.result?.realtime;
    const nextRt: Rt | undefined = next.result?.realtime;
    if (previous && prevRt && nextRt && previous.at <= next.at) {
        for (const g of HOLD_GROUPS) {
            if (!g.has(prevRt) || g.has(nextRt)) continue;
            const since = previous.held?.[g.name] ?? previous.at;
            if (!Number.isFinite(since) || now - since > HOLD_MAX_MS) continue;
            if (g.legit?.(nextRt, prevRt, now, read)) continue;
            for (const f of g.fields) {
                if (f in prevRt) nextRt[f] = structuredClone(prevRt[f]);
                else delete nextRt[f];
            }
            held[g.name] = since;
            kept.push(g.name);
        }
        // 알파 스냅샷의 설명(whyFactors 등)은 옵션 지표·다크풀을 입력으로 쓴다(optionAlphaService.readOptionAlpha).
        // 그 입력 묶음을 유지했거나 스냅샷 자체가 비었으면 직전 스냅샷(자기 capturedAt 포함)을 함께 유지한다.
        const prevAlpha = previous.result?.alphaSnapshot;
        const alphaInputHeld = kept.some(g => ALPHA_INPUTS.includes(g));
        const alphaEmpty = next.result && 'alphaSnapshot' in next.result && next.result.alphaSnapshot == null;
        const alphaSince = previous.held?.alphaSnapshot ?? previous.at;
        if (prevAlpha && typeof prevAlpha === 'object' && Object.keys(prevAlpha).length
            && (alphaInputHeld || alphaEmpty) && now - alphaSince <= HOLD_MAX_MS) {
            next.result.alphaSnapshot = structuredClone(prevAlpha);
            held.alphaSnapshot = alphaSince;
            kept.push('alphaSnapshot');
        }
        if (kept.length) {
            const groups = new Set(kept);
            if (HOLD_GROUPS.some(g => g.whale && groups.has(g.name))) {
                // calculateWatchlistBatch 마지막 줄과 같은 식·같은 입력(원값 그대로)
                nextRt.whaleIndex = calculateWhaleIndex(nextRt.gex, nextRt.darkPoolPct, nextRt.blockTrades, nextRt.netPremium);
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
