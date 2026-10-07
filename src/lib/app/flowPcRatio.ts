/**
 * Flow 화면(앱)의 풋/콜 비율 — «한 정의»로 고정 (2026-10-07, 앱 강화 0단계 T2)
 *
 *   P/C = 풋 ÷ 콜   (1 보다 크면 풋 우위·약세 쪽, 작으면 콜 우위·강세 쪽)
 *   C/P = 콜 ÷ 풋   (= 1 / (P/C)) — «C/P RATIO» 카드가 표시하는 역수
 *
 * 옛 결함: `flow/page.tsx` 의 `pcRatio` 가 실제로는 콜÷풋(C/P)인데 같은 변수가 ⓐ 종합 점수 pcScore(≥2.0 → −5: P/C 관례)
 *   ⓑ OPI 구성요인 «P/C 압력» 레일(≤0.75 초록·≥1.25 빨강) ⓒ regimeInsight «P/C {값}» ⓓ AI 페이로드(P/C 로 설명되는 입력)에
 *   P/C 로 쓰였다 → 방향 반대로 합산(콜 441K·풋 272K 에서 «P/C 압력 1.62» 빨강, NVDA 점수 −3 이어야 할 것이 +3 과 6점 차).
 *   C/P 카드(콜 우위로 올바르게 읽음)만 맞았다. 이제 P/C 는 풋÷콜 하나이고 C/P 는 그 역수다.
 *
 * 판정 문턱은 P/C 기준 하나다(점수·레일·카드 모두) — C/P 카드도 같은 문턱으로 우위를 말해 두 숫자가 서로 모순하지 않는다.
 *   (카드의 옛 C/P 문턱 1.3·0.75 는 P/C 문턱 0.77·1.33 과 살짝 어긋나 좁은 구간에서 한 화면이 서로 다른 말을 했다.)
 */

/** AI 분석 라우트에 «이 재료의 P/C 는 풋÷콜»이라고 선언하는 값 — 선언이 있으면 정정된 재료만 쓰는 캐시(v4)를 쓴다(lib/ai/flowCacheKey) */
export const PC_AI_DEFINITION = 'put_over_call';

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** P/C = 풋 ÷ 콜. 콜이 0 이면 정의되지 않는다(null). 소수 둘째 자리 */
export function putCallRatio(putVol: number, callVol: number): number | null {
  if (!(callVol > 0) || !(putVol >= 0)) return null;
  return round2(putVol / callVol);
}

/** C/P = 콜 ÷ 풋. 풋이 0 이면 정의되지 않는다(null). 소수 둘째 자리 */
export function callPutRatio(callVol: number, putVol: number): number | null {
  if (!(putVol > 0) || !(callVol >= 0)) return null;
  return round2(callVol / putVol);
}

/**
 * 종합 점수의 P/C 항목(±5·±3·0). P/C ≥ 2.0 → −5 · ≥ 1.3 → −3 · ≤ 0.5 → +5 · ≤ 0.75 → +3.
 * 거래량이 없어 P/C 를 모르면(hasData=false) 0 — 옛 코드는 미로딩 0 을 «≤0.5 → +5» 로 읽어 데이터가 없을 때 점수를 +5 올렸다.
 */
export function pcScoreOf(pc: number, hasData: boolean): number {
  if (!hasData || !Number.isFinite(pc)) return 0;
  if (pc >= 2.0) return -5;
  if (pc >= 1.3) return -3;
  if (pc <= 0.5) return 5;
  if (pc <= 0.75) return 3;
  return 0;
}

export type PcBias = 'strongCall' | 'call' | 'balanced' | 'put' | 'strongPut';

/** P/C 로 말하는 우위 — 점수(pcScoreOf)와 같은 문턱 */
export function pcBias(pc: number): PcBias {
  if (pc >= 2.0) return 'strongPut';
  if (pc >= 1.3) return 'put';
  if (pc <= 0.5) return 'strongCall';
  if (pc <= 0.75) return 'call';
  return 'balanced';
}

/**
 * 거래량(또는 미결제약정)으로 우위를 판정 — 점수·레일과 같은 P/C 문턱. «C/P RATIO» 카드가 쓴다.
 * 둘 다 0 이면 null(모름). 콜이 0 이고 풋만 있으면 strongPut(P/C 가 무한대).
 */
export function pcBiasOf(callVol: number, putVol: number): PcBias | null {
  if (!(callVol > 0)) return putVol > 0 ? 'strongPut' : null;
  return pcBias(putCallRatio(putVol, callVol) ?? 0);
}

/** «C/P RATIO» 카드의 숫자 글자 — C/P(콜÷풋). 풋이 0 이고 콜이 있으면 ∞, 둘 다 없으면 — */
export function cpText(callVol: number, putVol: number): string {
  const v = callPutRatio(callVol, putVol);
  if (v !== null) return v.toFixed(2);
  return callVol > 0 ? '∞' : '—';
}

/** OPI 구성요인 «P/C 압력» 레일 색(초록=콜 우위·빨강=풋 우위·노랑=중립) — 기존 레일 문턱(0.75 / 1.25) 그대로 */
export function pcRailColor(pc: number): string {
  return pc <= 0.75 ? '#10b981' : pc >= 1.25 ? '#f43f5e' : '#f59e0b';
}
