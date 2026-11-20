// ============================================================================
// «체험 끝난 분께 다시 시작» 할인 오퍼 코드 — 설정 상수(서버 푸시 · 앱 푸시 탭 · PC 코드 화면이 같이 쓴다) (2026-11-21)
// ----------------------------------------------------------------------------
// ASC 월간 구독의 오퍼 코드 «Comeback 50% x2 (Expired)»(2026-11-21 생성 · signum-work/2026-11-21/revenue-offers/RESULT.md):
//   대상 = 구독 그룹에서 «만료(EXPIRED)» 고객만(신규·현 구독자는 애플이 거절) · 첫 2개월 할인가(PAY_AS_YOU_GO 1개월×2) → 이후 정가 자동 갱신.
//   맞춤 코드 500회 · 애플 기준 2026-11-22 00:00 PT 부터 · 만료 2027-05-20.
// 코드 값은 공개 저장소에 쓰지 않는다(lib/marketing/coupon 의 저장소 규칙 · 관문 11210848) — 서버 환경 변수 COMEBACK_OFFER_CODE 에만 둔다.
//   없거나 형식이 아니면 푸시·PC 화면 분기가 전부 꺼진다(예전 동작). 앱은 푸시 데이터(c)로 받은 값을 형식 검사한 뒤 애플 적용 주소에만 쓴다.
// 가격(애플 3.1.2 — 할인가·기간·이후 정가·자동 갱신·해지 가능을 함께): 스토어프런트별 실제 가격(ASC 가격점 2026-11-21 조회).
//   KOR ₩5,900 → ₩11,900 · USA $3.99 → $9.99 · JPN ¥600 → ¥1,280. 그 밖 나라는 가격을 단정할 수 없어 푸시를 보내지 않는다.
// ============================================================================

/** 코드 형식(애플 맞춤 코드 — 영문 대문자·숫자) */
export const COMEBACK_CODE_RE = /^[A-Z0-9]{4,24}$/;
/** 서버 설정의 코드(없거나 형식이 아니면 null — 기능 꺼짐) */
export function comebackCode(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.COMEBACK_OFFER_CODE || '').trim().toUpperCase();
  return COMEBACK_CODE_RE.test(v) ? v : null;
}
/** 애플 오퍼 코드 시작(2026-11-22 00:00 PT = 08:00 UTC) — 이 전에는 코드가 통하지 않는다 */
export const COMEBACK_VALID_FROM = Date.parse('2026-11-22T08:00:00Z');
/** 맞춤 코드 만료(2027-05-20) — 하루 일찍 끊는다(시간대 차이로 «만료된 코드»를 안내하지 않게) */
export const COMEBACK_VALID_UNTIL = Date.parse('2027-05-19T07:00:00Z');
/** 할인 개월 수 */
export const COMEBACK_MONTHS = 2;
/** 푸시 데이터 type 값 — app-view/layout.tsx 탭 처리와 같아야 한다 */
export const COMEBACK_PUSH_TYPE = 'comeback';

export type ComebackStorefront = 'KR' | 'US' | 'JP';
export const COMEBACK_PRICES: Record<ComebackStorefront, { offer: string; regular: string }> = {
  KR: { offer: '₩5,900', regular: '₩11,900' },
  US: { offer: '$3.99', regular: '$9.99' },
  JP: { offer: '¥600', regular: '¥1,280' },
};

export function isComebackCode(code: unknown, env: Record<string, string | undefined> = process.env): boolean {
  const c = comebackCode(env);
  return !!c && typeof code === 'string' && code.trim().toUpperCase() === c;
}

export function comebackLive(now: number): boolean {
  return now >= COMEBACK_VALID_FROM && now < COMEBACK_VALID_UNTIL;
}

/** 애플 오퍼 코드 사용 주소(코드 미리 채움) — /app 스마트링크가 아이폰에서 302 하는 주소와 같다 */
export function comebackRedeemUrl(code: unknown): string | null {
  return typeof code === 'string' && COMEBACK_CODE_RE.test(code) ? `https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=${encodeURIComponent(code)}` : null;
}
