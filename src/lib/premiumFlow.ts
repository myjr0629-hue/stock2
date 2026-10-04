/**
 * 옵션 프리미엄 «표시 정의» 한 벌 — 화면의 이름과 값이 같아야 한다.
 *
 * 원천(생산자 하나): CentralDataHub._fetchOptionsChain → /api/live/ticker 응답의 flow 블록
 *   · 대상   : 주간 만기 1개(flow.weeklyExpiration)의 체인 계약 전부
 *   · 계약별 : day.volume × day.close × 100  — EOD(직전 정규장 하루치, flow.dataFreshness.premium = 'EOD')
 *   · callPremium = 콜 합 · putPremium = 풋 합
 *   · netPremium   = callPremium − putPremium  → «순 프리미엄»(부호 = 콜/풋 우위)
 *   · totalPremium = callPremium + putPremium  → «총 프리미엄»
 *   · 체인에 거래량이 하나도 없으면(dataSource = 'CALCULATED') 미결제약정 × 전일 종가 × 100 으로 대체된다.
 *
 * [2026-10-04 MISTAKES #62] 앱 히어로 칸이 netPremium 을 «TOTAL PREMIUM» 으로, 플로 카드가
 *   |netPremium| 을 «총 프리미엄» 으로 불렀다. TSLA 실측: 순 $44.9M 이 «합계»로 보였고 실제 합계는 $108.3M.
 *   홍보 글도 «거래 금액 합계»로 옮겨 적었다. 화면은 아래 이름표와 읽기 함수만 쓴다 — 다시 계산하지 않는다.
 */
export type PremiumLocale = 'ko' | 'en' | 'ja';

export const NET_PREMIUM_LABEL: Record<PremiumLocale, string> = {
  ko: '순 프리미엄',
  en: 'Net Premium',
  ja: 'ネットプレミアム',
};

export const TOTAL_PREMIUM_LABEL: Record<PremiumLocale, string> = {
  ko: '총 프리미엄',
  en: 'Total Premium',
  ja: '総プレミアム',
};

export function premiumLabel(kind: 'net' | 'total', locale: string): string {
  const table = kind === 'net' ? NET_PREMIUM_LABEL : TOTAL_PREMIUM_LABEL;
  return table[locale as PremiumLocale] ?? table.en;
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * 총 프리미엄(콜 + 풋) — API 의 totalPremium 만 읽는다(정의는 생산자 한 곳).
 * 값이 없거나 0 이하이거나, 같은 응답의 콜·풋·순과 맞지 않으면 null(«—»)이다 — 맞지 않는 숫자는 그리지 않는다.
 */
export function totalPremiumOf(flow: unknown): number | null {
  const f = (flow ?? {}) as Record<string, unknown>;
  const total = num(f.totalPremium);
  if (total == null || total <= 0) return null;
  const tol = Math.max(1, total * 1e-6);
  const call = num(f.callPremium);
  const put = num(f.putPremium);
  if (call != null && put != null && Math.abs(call + put - total) > tol) return null;
  const net = num(f.netPremium);
  if (net != null && Math.abs(net) > total + tol) return null;
  return total;
}

/** 프리미엄 금액을 «$12.3M» 으로(기존 플로 카드 형식 그대로). 값이 없으면 «—». */
export function fmtPremiumM(v: number | null): string {
  return v == null ? '—' : `$${(v / 1e6).toFixed(1)}M`;
}
