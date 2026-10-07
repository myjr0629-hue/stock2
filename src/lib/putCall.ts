/**
 * 풋/콜 비율(P/C) — «정의 한 곳» (2026-10-07, 앱 강화 1단계)
 *
 *   P/C = 풋 ÷ 콜     (1 보다 크면 풋 우위·방어/약세 쪽, 작으면 콜 우위·강세 쪽)
 *   C/P = 콜 ÷ 풋     (= 1 / (P/C)) — 이 이름을 쓰는 곳만 C/P 다
 *
 * 왜 한 곳인가: 같은 이름의 숫자를 여러 생산자가 다른 뜻으로 만들었다(메모리 options-levels-five-producers-one-door-rule).
 *   `volumePcr` 한 이름이 네 가지로 쓰였다 — 아래 표. 소비자는 «어느 문으로 들어왔느냐»에 따라 값의 방향·기준이 달라졌고,
 *   그중 `/api/intel/fast` 의 pcr 폴백은 C/P(거래량)를 P/C(미결제약정) 자리에 그대로 넣었다(앱 Intel 의 PCR 칸).
 *
 * ── 필드 이름 규약: «기준(미결제약정/거래량)»을 이름에 적는다 ──────────────────────────────────────────────
 *   필드                       정의                                   생산자
 *   oiPcr · pcr(분석·구조)       풋 미결제약정 ÷ 콜 미결제약정  (P/C, OI)  structureService.pcr = Σ풋OI/Σ콜OI · live/ticker flow.oiPcr ·
 *                                                                      analysisCache.pcr · DynamoDB gex.pcr(수집 Lambda) · stockApi.putCallRatio
 *   volumePutCallRatio          풋 거래량 ÷ 콜 거래량  (P/C, 거래량)    live/ticker flow.volumePutCallRatio (이 파일의 volumePutCallFromChain)  ← 새 이름(2026-10-07)
 *   ── 아래는 «이름이 거짓말»인 옛 필드 — 읽지 않는다(웹 호환을 위해 응답에는 남는다) ──
 *   volumePcr  (live/ticker)    **콜 ÷ 풋 (C/P, 거래량)** — 이름은 P/C 처럼 보이지만 callVol/putVol. 소비자(UC·WIM·웹 Flow)가 1/x 로 뒤집어 썼다.
 *   volumePcr  (Lambda 분석캐시) 풋 ÷ 콜 (P/C, **미결제약정**) — scripts/lambda-harvest: structure.totalPutOI/totalCallOI 를 volumePcr 이름으로 저장
 *   volumePcr  (watchlist 배치)  풋 ÷ 콜 (P/C, 거래량 — 거래량이 0 이면 미결제약정으로 조용히 대체)
 *   volumePcr  (dashboard/unified) 분석캐시값 ?? 미결제약정 P/C ?? (라이브 분기에서는) live/ticker 의 C/P  ← 갈래마다 뜻이 다르다(웹 대시보드 전용)
 *
 * ── 미결제약정 P/C 의 «만기 범위»도 둘이다(2026-10-07 운영 실측 · 아직 하나로 못 묶었다 — 아래 «남은 것») ──────────
 *   (W) 목표(주간) 만기 1개   structureService.pcr · live/ticker oiPcr · structure:v2 판본(레벨과 같은 만기·판본)      예 TER 0.67 (만기 10/9)
 *   (T) 35일 이내 전 만기 합   수집 Lambda → DynamoDB gex.pcr(probe 계약 952~1,002개) · 분석캐시/배치 pcr(Dynamo 경로)     예 TER 2.04 (같은 시각)
 *   앱 Intel 의 PCR(분석캐시 pcr 우선, 없으면 oiPcr)은 종목에 따라 T 또는 W 다 — 운영 70종목 중 34종목에서 oiPcr(W)와 0.01 이상 다르다(TER 2.04↔0.67, PWR 1.78↔3.28, MU 1.23↔1.52).
 *   ★ 결정(2026-10-07 운영 세션) · 구현(정확성 2차): 화면의 «P/C(미결제약정)» = (T) 하나 — 수집 Lambda DynamoDB gex 최신 행(35일 이내 전 만기 합계). (W)는 «주간 만기 P/C» 로 이름을 나눈다.
 *     · 앱 Intel: /api/intel/fast?app=1 (+ fast-all · cron/app-warm) — pcr·gex 를 DynamoDB 최신 행 «한 곳»에서만 읽고 행 시각(optionsAsOf)을 싣는다 → lib/app/intelOptionsBasis.ts.
 *       (옛 경로는 분석 캐시(W)가 살아 있는 동안 W, ET 자정에 만료되면 DynamoDB(T)로 바뀌어 한국 13시에 섹터 전체의 GEX 부호가 뒤집혔다.)
 *     · 색 문턱도 앱 전체 하나 — 아래 pcLean(0.75 / 1.3)을 Intel 의 모든 PCR 칸이 쓴다(예전: 0.8/1.1 · 0.7/1.2 · 0.95/1.05).
 *     · Flow 의 C/P 카드 OI 칸은 예전에 live/ticker rawChain(= 주간 만기 1개)을 «OI (Monthly)» 로 보였다 → 이제 /api/app/oi-pcr(같은 DynamoDB 최신 행)로 «OI · 35일 전 만기»를 그린다. 거래량 칸은 «주간 만기 거래량».
 *     · 웹·알파는 그대로다 — 배치 pcr(알파 점수 입력)·옛 /api/intel/fast(app 없음)·웹 SSR 은 값을 바꾸지 않았다.
 *     · 아직 W/T 가 섞이는 곳: command/unified 의 structure.pcRatio(직접 생성 경로=W · DynamoDB 경로=T — 앱 Command 는 숫자를 그리지 않고 확신 점수·AI 재료에만 쓴다),
 *       /api/intel/snapshot·cross-sector-brief 의 avg_pcr(서버가 옛 경로로 만든 일일 리포트 — 앱 Intel 의 «장마감 리포트» 탭).
 *
 * 소비자 규칙: 새 코드는 oiPcr / volumePutCallRatio 만 읽는다. 옛 volumePcr 을 꼭 읽어야 하면 어느 생산자의 것인지 확인하고 legacyVolumePcrToPutCall 로 방향을 맞춘다.
 *   서로 다른 기준(OI·거래량)의 값을 한 칸에 섞어 채우지 않는다 — 기준이 없으면 «—»(null)다.
 *
 * 순수 함수 — 시험 tests/putCall.test.ts.
 */

/** 이 정의를 선언하는 표식(AI 재료·응답에 싣는다). lib/app/flowPcRatio 의 PC_AI_DEFINITION 과 같은 값 */
export const PC_DEFINITION = 'put_over_call' as const;

export type PcBasis = 'oi' | 'volume';

const round2 = (v: number): number => Math.round(v * 100) / 100;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** P/C = 풋 ÷ 콜. 콜이 0(또는 없음)이면 정의되지 않는다(null). 풋이 음수·NaN 이면 null. 소수 둘째 자리 */
export function putOverCall(put: number | null | undefined, call: number | null | undefined): number | null {
  if (!isNum(put) || !isNum(call) || !(call > 0) || !(put >= 0)) return null;
  return round2(put / call);
}

/** C/P = 콜 ÷ 풋. 풋이 0(또는 없음)이면 정의되지 않는다(null). 소수 둘째 자리 */
export function callOverPut(call: number | null | undefined, put: number | null | undefined): number | null {
  if (!isNum(call) || !isNum(put) || !(put > 0) || !(call >= 0)) return null;
  return round2(call / put);
}

/**
 * live/ticker 의 옛 `volumePcr`(= 콜÷풋, 거래량)를 P/C(풋÷콜)로 뒤집는다. 0·음수·없음은 null.
 * ⚠️ live/ticker 가 만든 값에만 쓴다 — Lambda·배치·unified 폴백의 volumePcr 은 이미 풋÷콜(위 표)이라 뒤집으면 틀린다.
 */
export function legacyVolumePcrToPutCall(volumePcr: number | null | undefined): number | null {
  return isNum(volumePcr) && volumePcr > 0 ? round2(1 / volumePcr) : null;
}

export interface ChainVolume {
  callVol: number;
  putVol: number;
  /** 풋÷콜(거래량). 콜 거래량이 0 이면 null */
  putCall: number | null;
}

/**
 * 옵션 체인 행(Polygon·Intrinio 정규화 모양: day.volume · details.contract_type)에서 콜·풋 거래량을 합산해 P/C(거래량)를 만든다.
 * live/ticker 가 응답을 만들 때 쓴다(옛 volumePcr 과 같은 입력 — 방향만 다르다).
 */
export function volumePutCallFromChain(rawChain: unknown): ChainVolume {
  let callVol = 0, putVol = 0;
  if (Array.isArray(rawChain)) {
    for (const o of rawChain as any[]) {
      const v = Number(o?.day?.volume) || 0;
      const ct = o?.details?.contract_type;
      if (ct === 'call') callVol += v;
      else if (ct === 'put') putVol += v;
    }
  }
  return { callVol, putVol, putCall: putOverCall(putVol, callVol) };
}

/**
 * live/ticker `flow` 객체에서 P/C 두 개(기준별)를 읽는다. 기준을 섞지 않는다 — 없으면 null.
 *   oi      = flow.oiPcr
 *   volume  = flow.volumePutCallRatio (새 필드). 옛 캐시 응답(새 필드 없음)은 옛 volumePcr(콜÷풋)을 뒤집어 쓴다.
 */
export function readFlowPutCall(flow: any): { oi: number | null; volume: number | null } {
  const oi = isNum(flow?.oiPcr) && flow.oiPcr > 0 ? flow.oiPcr : null;
  const volume = isNum(flow?.volumePutCallRatio) && flow.volumePutCallRatio >= 0
    ? flow.volumePutCallRatio
    : legacyVolumePcrToPutCall(flow?.volumePcr);
  return { oi, volume };
}

export type PcLean = 'strongCall' | 'call' | 'balanced' | 'put' | 'strongPut';

/** 방향 읽기 문턱(P/C 기준 하나) — 앱 Flow 점수·레일과 같은 값(lib/app/flowPcRatio.pcBias) */
export function pcLean(pc: number | null | undefined): PcLean | null {
  if (!isNum(pc)) return null;
  if (pc >= 2.0) return 'strongPut';
  if (pc >= 1.3) return 'put';
  if (pc <= 0.5) return 'strongCall';
  if (pc <= 0.75) return 'call';
  return 'balanced';
}
