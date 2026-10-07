/**
 * /api/flow/ai-analysis 의 캐시 키 — 종목별 한 칸(3개 언어 한 번에 생성·저장). (2026-10-07, 앱 강화 0단계 T2)
 *
 * 왜 키를 가르나: 앱(app-view/flow)은 이제 «P/C = 풋÷콜» 로 정정한 재료를 보낸다(factors.pcRatio.definition === 'put_over_call').
 *   웹(FlowRadar·FlowAIAnalysis)은 아직 «콜÷풋 값에 P/C 이름»으로 보낸다(웹 별도 작업) — 한 칸을 같이 쓰면 웹이 만든
 *   «풋 헤비» 오독 글이 앱 화면에 나가고(그 반대도), 옛 앱 글(오독)도 앱에 남는다.
 *   → 정정 선언이 있는 재료는 v4 칸, 선언이 없는 재료(웹·옛 앱)는 v3 칸. 웹 동작은 바이트 단위로 그대로다.
 *
 * 순수 함수(네트워크·Redis 없음) — 시험 tests/flowPcRatio.test.ts.
 */

/** 웹·옛 재료가 쓰는 칸(변경 없음) */
export const FLOW_AI_CACHE_LEGACY = 'ai-flow-analysis:v3';
/** P/C 정의를 선언한 재료(앱)만 쓰는 칸 */
export const FLOW_AI_CACHE_PC_FIXED = 'ai-flow-analysis:v4';

/** 재료가 «P/C = 풋÷콜» 을 선언했는가 */
export function flowDataDeclaresPutOverCall(flowData: any): boolean {
  return flowData?.factors?.pcRatio?.definition === 'put_over_call';
}

export function flowAiCacheKey(ticker: string, flowData: any): string {
  const prefix = flowDataDeclaresPutOverCall(flowData) ? FLOW_AI_CACHE_PC_FIXED : FLOW_AI_CACHE_LEGACY;
  return `${prefix}:${String(ticker).toUpperCase()}`;
}
