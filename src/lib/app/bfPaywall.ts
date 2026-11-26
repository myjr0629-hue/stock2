// ============================================================================
// 정가 페이월 안 «블프 연간 첫 1년 50%» 카드 (2026-11-26 — 대표 «매출을 올리는 데 모든 역량을 집중») — 순수 모듈(화면·시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 왜: 11/19~25 iOS 정가 페이월(체험이 적용되지 않는 사람 — 체험 종료 안내 요금제 탭·설정·하루 첫 페이월·게이트·내 종목 한도)은
//   열림 ≈45 → 결제 단추 1. 첫 화면 가격이 연 ₩89,000(기본 선택)·월 ₩11,900 이고, 블프 50%(₩44,500)는 쿠폰 줄 아래 작은 한 줄뿐이었다.
//   해지 사유 1위도 가격(7일 price 6 / 응답 10). 같은 사람에게 이미 있는 애플 블프 오퍼 코드(연간 첫 1년 50% — NEW·EXISTING·EXPIRED 자격)를
//   «플랜 카드 맨 위 한 장 + 기본 선택»으로 보여 준다. 기존 카드(연간·월간·평생)와 순서는 그대로, 그 위에 한 장(11/12 만료자 할인 카드와 같은 자리·방식).
// 누구에게(전부 참일 때만 — 하나라도 모르면 카드 없음 = 예전 화면 그대로):
//   · iOS 네이티브 앱(프리뷰 확인 모드 ?sgbfpw=1 포함) · 블프 기간 안(lib/app/blackFriday bfLive — 12/2 07:00 UTC 전)
//   · 체험 머리 화면(첫 실행·하루 첫 페이월·기존 사용자 체험 안내 — trialHead)에서 체험이 적용되면 카드 없음(예전 «7일 무료» 화면 그대로 — 업계 표준 첫 단계를 바꾸지 않는다)
//     그 밖의 정가 페이월에서 체험이 적용되는 사람(체험 자격 조회가 늦게 오는 설정·게이트 등)은 카드는 보이되 기본 선택은 체험 플랜(bfDefaultSelected)
//   · 만료 1회 페이월(자체 할인 카드)·웜 카드의 «다른 요금제 보기»(방금 블프 카드를 봤다)·심사용 미리보기 화면이 아님
//   · 스토어가 준 연간 정가가 애플 할인가 표(KRW·JPY·USD)와 맞음 — 할인가를 지어내지 않는다
//   · 끄기 스위치(/api/app/bf-pw · 레디스 bf-pw:off)가 켜짐으로 확인됨 — 못 읽음 = 꺼짐
// 결제: 카드를 고른 채 단추 = 코드가 채워진 애플 적용 창(lib/app/redeem openBlackFridayRedeem — 블프 시트와 같은 주소·같은 복귀 재조회).
//   금액·시작일·자동 갱신은 애플 창이 보여 주고, 확인한 뒤에만 결제된다. 다른 카드를 고르면 예전 구매(RevenueCat purchase) 그대로.
// 애플 3.1.2: 카드에 할인가·기간(첫 1년)·이후 정가, 고지문에 자동 갱신·해지 장소·결제 확인 위치. 5.6: 실제 애플 오퍼(50%·12/2 만료) — 가짜 할인·가짜 시한 없음.
// ============================================================================

import { BF_COPY, bfLive, bfPriceView, toBfLang } from './blackFriday';

/** 끄기 스위치 레디스 키(값이 있으면 카드 없음) · 예비 환경변수 BF_PW_OFF(재배포 필요) */
export const BF_PW_OFF_KEY = 'bf-pw:off';
/** 페이월이 열린 뒤 이 안에 스위치가 확인될 때만 카드를 끼운다 — 보고 있는 카드들이 늦게 밀려 잘못 누르지 않게 */
export const BF_PW_LATE_MS = 1_200;
/** 스위치 조회 상한 */
export const BF_PW_FETCH_MS = 2_500;
/** 한 번 읽은 스위치를 다시 읽기 전까지(앱 실행 중) */
export const BF_PW_TTL_MS = 10 * 60_000;

/** 카드를 안 보이는 출처 — 만료 1회 페이월(자체 할인 카드) · 웜 카드 «다른 요금제 보기» · 심사·디자인 미리보기 */
const EXCLUDED_SRCS = new Set(['trial_expired', 'warm_bf_reg', 'preview']);

export type BfPwPlan = { plan: string; price?: number | null; currencyCode?: string | null; priceString?: string | null; trialDays?: number | null };
export type BfPwCard = { regular: string; offer: string };

/** 카드 판정 — 보이면 {정가, 할인가}(같은 형식 문자열), 아니면 null */
export function bfPaywallCard(s: {
  ios: boolean; now: number; switchOn: boolean; src: string; context: boolean; discount: boolean; trialHead: boolean;
  plans: readonly BfPwPlan[]; locale: string;
}): BfPwCard | null {
  if (!s.ios || !s.switchOn || !bfLive(s.now)) return null;
  if (s.context || s.discount || EXCLUDED_SRCS.has(s.src)) return null;
  if (s.trialHead && bfTrialAny(s.plans)) return null;
  const a = s.plans.find((p) => p.plan === 'annual');
  if (!a) return null;
  const v = bfPriceView('annual', { price: a.price ?? null, currencyCode: a.currencyCode ?? null, priceString: a.priceString ?? null }, s.locale);
  return v.regular && v.offer ? { regular: v.regular, offer: v.offer } : null;
}

/** 무료 체험이 적용되는 구독 플랜이 있나(평생 제외) */
export function bfTrialAny(plans: readonly BfPwPlan[]): boolean {
  return plans.some((p) => p.plan !== 'lifetime' && !!p.trialDays);
}

/** 기본 선택이 블프 카드인가 — 사용자가 고른 것(true=블프·false=다른 카드)이 먼저, 안 골랐으면 «체험이 적용되지 않을 때만» 블프 */
export function bfDefaultSelected(userPick: boolean | null, plans: readonly BfPwPlan[]): boolean {
  return userPick ?? !bfTrialAny(plans);
}

/** 서버: 환경변수·레디스 값 → 켜짐 */
export function bfPwSwitchValue(input: { env?: string; off: unknown }): boolean {
  const truthy = (v: unknown) => !(v == null || v === '' || v === 0 || v === false || v === '0' || v === 'false');
  return !truthy(input.env) && !truthy(input.off);
}
/** 클라이언트: 응답의 on 이 정확히 true 일 때만 켜짐 */
export function bfPwSwitchFrom(j: unknown): boolean {
  return !!j && typeof j === 'object' && (j as { on?: unknown }).on === true;
}

// ── 스위치 읽기(앱 실행 중 한 번 · 10분마다 다시) — 블프 자리(BlackFridayHost)가 앱 시작 때 미리 읽어 두면 페이월은 기다리지 않는다 ──
let memo: { at: number; p: Promise<boolean>; v: boolean | null } | null = null;

export function bfPwSwitch(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<boolean> {
  if (memo && now - memo.at < BF_PW_TTL_MS) return memo.p;
  const m: { at: number; p: Promise<boolean>; v: boolean | null } = { at: now, p: Promise.resolve(false), v: null };
  m.p = (async () => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), BF_PW_FETCH_MS);
    try {
      const r = await fetchImpl('/api/app/bf-pw', ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' });
      if (!r.ok) throw new Error('http');
      const on = bfPwSwitchFrom(await r.json());
      m.v = on;
      return on;
    } catch {
      // 못 읽음 = 이번엔 꺼짐 · 다음 페이월에서 다시 읽는다
      if (memo === m) memo = null;
      return false;
    } finally { clearTimeout(timer); }
  })();
  memo = m;
  return m.p;
}

/** 이미 읽어 둔 값(동기) — 켜짐으로 확인돼 있으면 true(페이월 첫 그림부터 카드) */
export function bfPwCachedOn(now = Date.now()): boolean {
  return !!memo && memo.v === true && now - memo.at < BF_PW_TTL_MS;
}

/** 시험 전용 */
export function resetBfPwSwitchForTest() { memo = null; }

// ── 문구(카드·단추·고지 — 예측·투자 권유 없음) ─────────────────────────────
export type BfPwLang = 'ko' | 'en' | 'ja';
export const BF_PW_COPY: Record<BfPwLang, {
  name: string; badge: string; sub: (regular: string) => string; per: string; cta: (offer: string) => string; fine: (offer: string, regular: string) => string;
}> = {
  ko: {
    name: '블프 연간',
    badge: '50% 할인',
    sub: (r) => `이후 연 ${r} · 12/2까지`,
    per: '첫 1년',
    cta: (o) => BF_COPY.ko.annualCta(o),
    fine: (o, r) => `할인가(${o})는 연간 첫 1년에만 적용되고, 이후 연 ${r}으로 자동 갱신됩니다. App Store 화면에서 금액과 시작일을 확인한 뒤에만 결제되며, App Store 설정에서 언제든 해지할 수 있어요.`,
  },
  en: {
    // 375폭에서 이름·배지가 한 줄이 되게 짧게(«Black Friday» + 배지는 두 줄로 접혀 카드가 94px — 11/26 캡처) — 행사명은 아래 줄에
    name: 'Annual',
    badge: '50% off',
    sub: (r) => `Black Friday · then ${r}/yr · until Dec 2`,
    per: '1st year',
    cta: (o) => BF_COPY.en.annualCta(o),
    fine: (o, r) => `${o} covers the first year only, then it renews automatically at ${r}/year. You are charged only after confirming the amount and start date in the App Store. Cancel anytime in App Store settings.`,
  },
  ja: {
    name: 'BF 年額',
    badge: '50%OFF',
    sub: (r) => `その後 年${r} · 12/2まで`,
    per: '初年度',
    cta: (o) => BF_COPY.ja.annualCta(o),
    fine: (o, r) => `${o}は年額プランの初年度のみで、その後は年${r}で自動更新されます。App Storeの画面で金額と開始日を確認してからのみ請求され、App Storeの設定からいつでも解約できます。`,
  },
};
export function bfPwCopy(locale: string) { return BF_PW_COPY[toBfLang(locale)]; }
