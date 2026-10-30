import { LEVEL_BANDS } from '@/lib/optionLevelGate';
import type { ExpectedSnap } from '@/lib/earnings/earningsActuals';

const pos = (x: unknown): number | null => typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null;

/**
 * [2026-10-31 T37] 실적 주간 «발표 뒤 갭» 행의 Max Pain.
 *
 * 원인(INTC 10/30): 발표 뒤 −30% 갭(92.07 → 63.6). 체인 OI 는 발표 전 가격대에 쌓여 있어 계산된 Max Pain 은 $94
 * — 현물과 47% 떨어져 계산 단계의 ±35% 정의(structureService · LEVEL_BANDS.maxPain)가 판본에 null(debug.maxPainOutOfBand=94)로 실었다.
 * ±35% 는 «체인이 왜곡된» 경우(행사가 간격이 큰 저가주·얇은 체인·DD 137 대 52.5)를 막는 규칙이다 — 그 경우는 발표 전 가격에서도 멀다.
 *
 * 그래서 이 행에 한해서만: 같은 판본(만기·체인 날짜 일치)이 정의 밖으로 뺀 값이 «발표 전 마지막 기록 현물»(expectedAtReport.spot —
 * 크론이 발표 전 마지막 정규장에 저장)에서 같은 ±35% 안이면 그 값을 쓴다. 기록 세션이 오늘(ET)보다 앞일 때(= 발표가 지난 행)만.
 * 나머지는 전부 null — 지어내지 않는다. 다른 화면의 정의는 바꾸지 않는다.
 */
export function postReportMaxPain(
    raw: { data?: any } | null | undefined,
    shown: { maxPain?: number | null; levelsExpiration?: string | null; levelsChainDate?: string | null } | null | undefined,
    expected: ExpectedSnap | null | undefined,
    todayET: string,
): number | null {
    if (!shown || shown.maxPain != null || !shown.levelsExpiration) return null;
    if (!expected || typeof expected.session !== 'string' || !(expected.session < todayET)) return null;
    const ref = pos(expected.spot);
    const d = raw?.data;
    if (ref == null || !d || d.options_status !== 'OK') return null;
    if (d.expiration !== shown.levelsExpiration || (d.chainDate ?? null) !== (shown.levelsChainDate ?? null)) return null;
    if (d.maxPain != null) return null;   // 판본에 값이 있었는데 문이 지웠다 = 다른 까닭 — 되살리지 않는다
    const mp = pos(d.debug?.maxPainOutOfBand);
    if (mp == null) return null;
    return Math.abs(mp - ref) <= ref * LEVEL_BANDS.maxPain + 1e-9 ? mp : null;
}
