// ============================================================================
// 구독 퍼널 — 닫힌 목록과 키 규칙 (순수 모듈: 클라이언트 funnel.ts · 서버 /api/funnel-hit · 시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 왜 (2026-09-30): RevenueCat 28일 신규 121 · 체험 0 · 구독 0 — 어디서 끊기는지 볼 수단이 없었다.
//   페이월이 몇 번 열렸나(어디서) → 몇 번 눌렀나 → 결제 결과(성공·취소·오류 코드) → 복원.
//
// 싣는 것: 단계 · 출처(화면) · 플랫폼 · 앱 버전 · (오류일 때) 오류 코드 — 전부 닫힌 목록.
// 싣지 않는 것: 기기 식별자·사용자 ID·IP·종목·가격·거래 ID. 서버는 «하루 합계 숫자»만 남긴다.
//   애플 개인정보 라벨: «사용 데이터 › 제품 상호작용 — 분석 — 사용자와 연결되지 않음» 선언 범위.
//   Play 데이터 보안에는 «앱 활동 › 앱 상호작용»이 없다 → 안드로이드 앱은 보내지 않는다(funnel.ts FUNNEL_SEND_ANDROID).
// ============================================================================

export const FUNNEL_STAGES = [
  'open',          // 페이월(또는 «내 종목» 판매 시트)이 열렸다
  'cta',           // 구매 버튼을 눌렀다
  'buy_ok', 'buy_cancel', 'buy_err',            // 결제 결과
  'restore_ok', 'restore_none', 'restore_err',  // 복원 결과(none = 복원할 구매 없음)
  'code_open', 'code_cta', 'code_pro',          // 🎟 쿠폰 코드 입력을 열었다 · (안드) 안내 시트의 [계속] = 구독 결제 창 열기(2026-10-06, lib/app/couponGuide.ts)
                                                //   · 코드 흐름 뒤 PRO 확인(2026-10-05, lib/app/redeem.ts). 결제 결과는 다른 결제와 같이 buy_* 로 센다
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_SRCS = [
  'settings',    // 설정 › SIGNUM Pro
  'value_wall',  // 프리미엄 데이터 가치 벽의 «광고 없이 보기»
  'ad_modal',    // 보상형 광고 창의 «매번 기다리지 않으려면»
  'dash_gate',   // 대시보드 게이트의 광고 제거
  'wl_limit',    // «내 종목» 한도 시트(무료 5개)
  'wl_upsell',   // «내 종목» PRO·알림 안내 시트
  'wl_paywall',  // «내 종목» 시트가 연 페이월(스토어 가격을 못 받았을 때)
  'preview',     // 프리뷰 배포의 페이월 확인 화면
  'other',
] as const;
export type FunnelSrc = (typeof FUNNEL_SRCS)[number];

export const FUNNEL_PLATFORMS = ['ios', 'android', 'web'] as const;
export type FunnelPlatform = (typeof FUNNEL_PLATFORMS)[number];

const STAGE_SET = new Set<string>(FUNNEL_STAGES);
const SRC_SET = new Set<string>(FUNNEL_SRCS);
const PLAT_SET = new Set<string>(FUNNEL_PLATFORMS);

export const isFunnelStage = (x: unknown): x is FunnelStage => typeof x === 'string' && STAGE_SET.has(x);
export const isFunnelSrc = (x: unknown): x is FunnelSrc => typeof x === 'string' && SRC_SET.has(x);
export const isFunnelPlatform = (x: unknown): x is FunnelPlatform => typeof x === 'string' && PLAT_SET.has(x);

/** 앱 버전 — 숫자 점 형식만(최대 4마디·15자). 아니면 'na'. */
export function normalizeVersion(v: unknown): string {
  const s = String(v ?? '').trim();
  return s.length <= 15 && /^\d{1,3}(\.\d{1,3}){0,3}$/.test(s) ? s : 'na';
}

/**
 * 오류 코드 — RevenueCat PURCHASES_ERROR_CODE("0"~"42") → rc<숫자>, 우리 서비스의 사유 → 짧은 이름.
 *   rc1 = 사용자 취소 · rc2 = 스토어 문제 · rc3 = 결제 불가 기기 · rc5 = 상품 없음 · rc10 = 네트워크
 *   rc11 = 자격 오류(Play 서비스 계정 등) · rc15 = 이미 진행 중 · rc20 = 결제 대기 · rc23 = 설정 오류
 *   iap = 이 기기에서 구매 불가(웹·SDK 미설정) · nooffer = 스토어 가격(오퍼링) 없음 · noent = 결제됐는데 권한 미반영
 */
export function normalizeCode(c: unknown): string {
  const s = String(c ?? '').trim().toLowerCase();
  if (/^rc\d{1,2}$/.test(s)) return s;
  if (s === 'iap' || s === 'nooffer' || s === 'noent') return s;
  return 'x';
}

/** 구매·복원 결과(PurchaseOutcome) → 퍼널 단계와 코드. */
export type OutcomeLike = { ok: boolean; isPro: boolean; cancelled?: boolean; error?: string; code?: string };
export function outcomeStage(kind: 'buy' | 'restore', o: OutcomeLike): { stage: FunnelStage; code?: string } {
  const code = o.code ? normalizeCode(o.code)
    : o.error === 'iap_unavailable' ? 'iap' : o.error === 'no_offering' ? 'nooffer' : 'x';
  if (kind === 'buy') {
    if (o.ok) return o.isPro ? { stage: 'buy_ok' } : { stage: 'buy_ok', code: 'noent' };
    if (o.cancelled) return { stage: 'buy_cancel' };
    return { stage: 'buy_err', code };
  }
  if (o.ok) return { stage: o.isPro ? 'restore_ok' : 'restore_none' };
  return { stage: 'restore_err', code };
}

/**
 * 레디스 키. 접두사 fx·fxp 는 redisClient 의 복제 정책(REPLICATE_PREFIXES·UPSTASH_ONLY_PREFIXES) 밖 →
 *   TTL 쓰기는 EC2 에만 간다(Upstash 명령 0 — 프록시 장애 때만 폴백). 프리뷰·로컬은 fxp(운영 숫자 오염 방지).
 *   ①  <ns>:<단계>:<출처>:<플랫폼>:<ET날짜>   정수 — 퍼널 본표
 *   ②  <ns>:v:<ET날짜>   {"단계|플랫폼|버전": n}   버전별(열린 목록이라 한 키에 모은다)
 *   ③  <ns>:c:<ET날짜>   {"단계|플랫폼|코드": n}   오류 코드별(오류·noent 일 때만)
 */
export function funnelNs(vercelEnv: string | undefined): 'fx' | 'fxp' {
  return vercelEnv === 'production' ? 'fx' : 'fxp';
}
export function funnelKeys(ns: string, day: string, stage: FunnelStage, src: FunnelSrc, plat: FunnelPlatform) {
  return {
    main: `${ns}:${stage}:${src}:${plat}:${day}`,
    ver: `${ns}:v:${day}`,
    code: `${ns}:c:${day}`,
  };
}

/** 미국 동부 날짜(YYYY-MM-DD) — /app 의 etDate()·mkt:attr 키와 같은 날짜 경계. */
export function etDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
