// ============================================================================
// «배경 갱신 흐름» 표식 — Intrinio 호출 하나하나가 어느 흐름에서 나갔는지(계측) + 배경 흐름의 행동 규칙 (2026-10-13)
// ----------------------------------------------------------------------------
// 왜: /api/intel/fast 는 Intrinio 429 로그의 80%(976/1,224줄)였다. 호출은 사람이 아니라 우리 자신의 예열(앱 예열 크론·화면 목록 갱신)이 냈다.
//   예열 하나가 섹터 10곳을 «같은 초에» 따로 띄워(함수 인스턴스가 따로라 인스턴스별 동시성 상한이 아무 도움이 안 된다) 한 번에 수백 콜을 쏘고,
//   429 를 받으면 callIntrinio 가 120~240ms 뒤 «한 번 더» 묻는다 — 한도가 바닥난 바로 그 순간 호출이 두 배가 된다.
// 어떻게: AsyncLocalStorage — `runWithBg(ctx, fn)` 안에서 시작된 비동기 흐름만 이 표식을 본다.
//   · label 은 모든 흐름에 붙는다(계측용 — 사용자 요청 흐름에도 «intel:user» 같은 이름만 붙는다, 행동은 그대로).
//   · noRetry429 / tripOn429 는 «배경 갱신»(refresh=1·응답 뒤 갱신)에만 켠다:
//       noRetry429 — 429 를 받으면 즉시 다시 묻지 않는다(재시도는 한도 바닥에서 호출을 두 배로 만든다).
//       tripOn429  — 429 를 처음 받은 순간부터 이 흐름의 나머지 벤더 호출을 보내지 않는다(바닥난 예산을 계속 두드리지 않는다).
//     사용자 경로(표식 없음 또는 둘 다 꺼짐)의 callIntrinio 는 한 줄도 달라지지 않는다 — structure-warm 의 관문(intrinioWarmGate)과 같은 방식.
// ============================================================================
import { AsyncLocalStorage } from 'node:async_hooks';

export type BgCtx = {
  /** 계측 이름(예: 'intel:app-warm', 'intel:user') */
  label: string;
  /** 429 를 받아도 즉시 다시 묻지 않는다 */
  noRetry429: boolean;
  /** 429 를 받으면 이 흐름의 나머지 벤더 호출을 보내지 않는다 */
  tripOn429: boolean;
  /** 벤더로 실제 나간 호출 수(캐시 적중·합치기는 세지 않는다) */
  calls: number;
  /** 429 를 받은 횟수 */
  saw429: number;
  /** 관문이 닫혔는가(tripOn429 일 때 첫 429 에서) */
  tripped: boolean;
  /** 닫힌 뒤 보내지 않고 막은 호출 수 */
  skippedByTrip: number;
};

export const bgStore = new AsyncLocalStorage<BgCtx>();

export function newBgCtx(label: string, opts: { noRetry429?: boolean; tripOn429?: boolean } = {}): BgCtx {
  return { label, noRetry429: !!opts.noRetry429, tripOn429: !!opts.tripOn429, calls: 0, saw429: 0, tripped: false, skippedByTrip: 0 };
}

/** fn 안(과 거기서 시작된 비동기)의 callIntrinio 가 이 표식을 본다. */
export function runWithBg<T>(ctx: BgCtx, fn: () => Promise<T>): Promise<T> {
  return bgStore.run(ctx, fn);
}
