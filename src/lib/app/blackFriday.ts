// ============================================================================
// 블랙프라이데이 «앱 안 1회 안내» (2026-11-22 저녁 — 대표 «매출을 올리는데 모든 역량을 집중») — 순수 모듈(화면·시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 무엇: 11/22 02시에 만든 iOS 할인 오퍼 코드 2개(연간 첫 1년 50% · 월간 첫 3개월 50%, 175개국, 12/2 만료, NEW+EXISTING+EXPIRED 자격)를
//   이미 앱을 깐 사람에게 알린다. 지금까지는 블프 할인 모음 사이트에만 걸려 있었다(signum-work/2026-11-22/black-friday/RESULT.md).
// 왜 앱 안 시트인가: 홍보 푸시는 애플 4.5.4(명시적 동의 없는 홍보 푸시 금지) 때문에 쓰지 않는다 — 선물 안내(10/8)·체험 안내(11/16)와 같은 «앱 안 1회».
// 누구에게(전부 참일 때만 — 하나라도 모르면 안 보인다):
//   · iOS 네이티브 앱(안드로이드·웹은 범위 밖 — Play 는 할인 코드가 없다) · 이 실행이 시작될 때 첫 실행 흐름을 마친 기기
//   · 기간 안(지금 ~ 12/1 23:00 PT — 애플 만료 12/2 보다 하루 일찍 끊어 «만료된 코드»를 안내하지 않는다)
//   · 이 기기에서 아직 안 봄(본 시각을 기기에 적는다 — 닫으면 끝, 쓰기 실패 = 안 보인다)
//   · RevenueCat 새 고객 정보로 «돈 내는 PRO 아님»: PRO 권한이 없거나, 있어도 무료 체험(TRIAL — 1개월 무료 코드 체험 포함)·소개가(INTRO)일 때만.
//     정가 결제 중(NORMAL)·프로모션 권한(PROMOTIONAL)·스토어가 App Store 가 아님·필드 모름 = 안 보인다.
//   · 오늘 다른 안내·페이월을 안 봤고(lib/app/trialAnnounce otherSheetToday) · 다른 시트가 안 떠 있고 · 앱 화면 경로일 때
// 언제나 열 수 있는 입구: 페이월·가치 벽·게이트의 «코드가 있으신가요?» 줄 아래 블프 한 줄 · 설정 «쿠폰 코드 입력» 아래 한 줄(BlackFridayLine) → 같은 시트.
// 가격(애플 3.1.2): 정가는 스토어가 준 값으로만. 할인가는 애플이 국가별로 정한 값 중 «통화+정가가 확인된» 경우만(KRW·JPY·USD — raw/half-*.json 대조:
//   USD 정가 $74.99 인 79개국 연간 할인가는 모두 $37.49 · 월간 $9.99 인 115개국은 모두 $4.99) — 그 밖은 «50%»만.
// 버튼 = 애플 오퍼 코드 사용 주소(코드 미리 채움). 결제 창은 애플이 띄운다. 돌아오면 lib/app/redeem armReturn('url') 이 PRO 를 다시 읽는다.
// ============================================================================

import { BF_CODES } from './blackFridayCodes';

export type BfPlan = 'annual' | 'monthly';
export type BfLang = 'ko' | 'en' | 'ja';

/** 이 기기에서 본 시각 — 한 번 보면(닫든 누르든) 다시 자동으로 띄우지 않는다 */
export const BF_SEEN_KEY = 'signumhq.bf.1122.v1';
/** 줄·설정에서 시트를 여는 창 이벤트(BlackFridayHost 가 듣는다) */
export const BF_OPEN_EVENT = 'signum:bf-open';
/** 애플 맞춤 코드 만료 2026-12-02 — 하루 일찍(12/1 23:00 PT = 12/2 07:00 UTC) 끊는다 */
export const BF_VALID_UNTIL = Date.parse('2026-12-02T07:00:00Z');
/** 오퍼 코드 생성 시각(11/22 02시 KST) 이전에는 의미 없음 — 시계가 크게 틀린 기기 방어 */
export const BF_VALID_FROM = Date.parse('2026-11-21T17:00:00Z');
/** 포그라운드 뒤 기다렸다 판정 — 체험 종료·만료 시트(우선)가 먼저 자리를 잡게(체험 안내 2.5초보다 조금 늦게) */
export const BF_DELAY_MS = 3_000;
/** 보이기 직전 고객 정보 조회 상한 */
export const BF_VERIFY_MS = 3_000;

export function bfLive(now: number): boolean {
  return now >= BF_VALID_FROM && now < BF_VALID_UNTIL;
}

export function toBfLang(locale: string | null | undefined): BfLang {
  return locale === 'ko' || locale === 'ja' ? locale : 'en';
}

const CODE_RE = /^[A-Z0-9]{4,24}$/;
/** 애플 오퍼 코드 사용 주소(코드 미리 채움) — /app 스마트링크가 아이폰에서 302 하는 주소와 같은 꼴 */
export function bfRedeemUrl(plan: BfPlan): string | null {
  const code = BF_CODES[plan];
  return CODE_RE.test(code) ? `https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=${encodeURIComponent(code)}` : null;
}

// ── 대상 판정(고객 정보) ─────────────────────────────────────────────────────
type EntLike = { isActive?: unknown; periodType?: unknown; store?: unknown };
type InfoLike = { entitlements?: { active?: Record<string, EntLike | undefined> | null } | null } | null | undefined;

/**
 * «돈 내는 PRO 아님» 확인 — true = 보여도 된다.
 *   권한 없음 → true · 권한이 무료 체험/소개가(App Store) → true(1개월 코드 체험 포함) · 그 밖(정가·프로모션·다른 스토어·모름) → false
 */
export function bfEligibleInfo(info: InfoLike, entitlementId = 'pro'): boolean {
  if (!info || !info.entitlements) return false;
  const active = info.entitlements.active;
  if (!active || typeof active !== 'object') return false;
  const ent = active[entitlementId];
  if (!ent) return Object.keys(active).length === 0;
  const pt = String(ent.periodType ?? '').toUpperCase();
  const store = String(ent.store ?? '').toUpperCase();
  return (pt === 'TRIAL' || pt === 'INTRO') && store === 'APP_STORE';
}

// ── 가격 ─────────────────────────────────────────────────────────────────────
/** 애플이 정한 할인가(통화+정가가 맞을 때만) — signum-work/2026-11-22/black-friday/raw/half-*.json 의 KOR·JPN·USA */
const BF_PRICE_TABLE: Record<BfPlan, Record<string, { regular: number; offer: number }>> = {
  annual: { KRW: { regular: 89000, offer: 44500 }, JPY: { regular: 12000, offer: 6000 }, USD: { regular: 74.99, offer: 37.49 } },
  monthly: { KRW: { regular: 11900, offer: 5900 }, JPY: { regular: 1280, offer: 640 }, USD: { regular: 9.99, offer: 4.99 } },
};

export type BfStorePrice = { price?: number | null; currencyCode?: string | null; priceString?: string | null } | null | undefined;
export type BfPriceView = {
  /** 정가 문자열(스토어 값 — 없으면 null) */
  regular: string | null;
  /** 할인가 문자열(애플 값이 확인될 때만 — 아니면 null = «50%»만) */
  offer: string | null;
};

function fmt(locale: string, currency: string, v: number): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: currency === 'USD' ? 2 : 0, minimumFractionDigits: currency === 'USD' ? 2 : 0 }).format(v);
  } catch { return ''; }
}

/** 스토어 상품 값 → 화면 값. 표에 맞으면 정가·할인가를 같은 형식으로, 아니면 정가만 스토어 문자열 그대로 */
export function bfPriceView(plan: BfPlan, p: BfStorePrice, locale: string): BfPriceView {
  if (!p) return { regular: null, offer: null };
  const cur = String(p.currencyCode ?? '').toUpperCase();
  const row = BF_PRICE_TABLE[plan][cur];
  if (row && typeof p.price === 'number' && Math.abs(p.price - row.regular) < 0.001) {
    const r = fmt(locale, cur, row.regular), o = fmt(locale, cur, row.offer);
    if (r && o) return { regular: r, offer: o };
  }
  return { regular: p.priceString ? String(p.priceString) : null, offer: null };
}

// ── 문구(주어 «미국 주식 앱 SIGNUM PRO» · 예측·투자 권유 없음 · 3.1.2 고지) ──────────
export const BF_COPY: Record<BfLang, {
  eyebrow: string;
  title: string;
  lede: string;
  annualCta: (offer: string | null) => string;
  annualSub: (regular: string | null, offer: string | null) => string;
  monthlyCta: (regular: string | null, offer: string | null) => string;
  fine: (yr: string | null, mo: string | null) => string;
  later: string;
  close: string;
  line: string;
}> = {
  ko: {
    eyebrow: '블랙프라이데이 · 12/2까지',
    title: '미국 주식 앱 SIGNUM PRO\n연간 첫 1년 50%',
    lede: '잠긴 AI 종목 분석이 광고 보기 없이 바로 열리고, 시세·장마감 리포트·실적 일정도 광고 없이.',
    annualCta: (o) => (o ? `연간 첫 1년 50% · ${o}` : '연간 첫 1년 50% 받기'),
    annualSub: (r, o) => (r && o ? `${r} → ${o} (첫 1년)` : '첫 1년 50% 할인'),
    monthlyCta: (r, o) => (r && o ? `월간 첫 3개월 50% · ${o}/월` : '월간 첫 3개월 50%'),
    fine: (yr, mo) => `할인은 연간 첫 1년 또는 월간 첫 3개월에만 적용되고, 이후 정가(${yr ? `연 ${yr}` : '연간 정가'} · ${mo ? `월 ${mo}` : '월간 정가'})로 자동 갱신됩니다. App Store 설정에서 언제든 해지할 수 있어요. 결제는 App Store 창에서 확인 후 진행됩니다.`,
    later: '다음에',
    close: '닫기',
    line: 'PRO 연간 첫 1년 50% 할인',
  },
  en: {
    eyebrow: 'Black Friday · until Dec 2',
    title: 'SIGNUM PRO, the US stock market app\n50% off your first year',
    lede: 'Locked AI stock analysis opens at once with no ad to watch, and prices, closing reports and the earnings calendar come with no ads.',
    annualCta: (o) => (o ? `First year 50% off · ${o}` : 'Get 50% off the first year'),
    annualSub: (r, o) => (r && o ? `${r} → ${o} for the first year` : '50% off the first year'),
    monthlyCta: (r, o) => (r && o ? `Monthly 50% off · ${o}/mo for 3 months` : 'Monthly: 50% off 3 months'),
    fine: (yr, mo) => `The discount applies to the first year (annual) or the first 3 months (monthly) only, then renews automatically at the regular price (${yr ? `${yr}/year` : 'regular annual price'} · ${mo ? `${mo}/month` : 'regular monthly price'}). Cancel anytime in App Store settings. You confirm payment in the App Store sheet.`,
    later: 'Not now',
    close: 'Close',
    line: 'PRO yearly: 50% off year one',
  },
  ja: {
    eyebrow: 'ブラックフライデー · 12/2まで',
    title: '米国株アプリ SIGNUM PRO\n年額プラン 初年度50%OFF',
    lede: 'ロック中のAI銘柄分析が広告視聴なしですぐ開き、株価・引け後レポート・決算日程も広告なしで。',
    annualCta: (o) => (o ? `年額 初年度50%OFF · ${o}` : '年額 初年度50%OFFを受け取る'),
    annualSub: (r, o) => (r && o ? `${r} → ${o}（初年度）` : '初年度50%OFF'),
    monthlyCta: (r, o) => (r && o ? `月額 3か月50%OFF · ${o}/月` : '月額 3か月50%OFF'),
    fine: (yr, mo) => `割引は年額の初年度または月額の最初の3か月のみで、その後は通常価格（${yr ? `年 ${yr}` : '年額の通常価格'} · ${mo ? `月 ${mo}` : '月額の通常価格'}）で自動更新されます。App Storeの設定からいつでも解約できます。お支払いはApp Storeの画面で確認してから行われます。`,
    later: 'あとで',
    close: '閉じる',
    line: 'PRO年額 初年度50%OFF',
  },
};

// ── 기기 기록 ────────────────────────────────────────────────────────────────
export type MiniStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** 이미 봤나 — 저장소가 없거나 던지면 «봤다»(안 보인다) */
export function readBfSeen(store: MiniStore | null): boolean {
  try { return !store || store.getItem(BF_SEEN_KEY) !== null; } catch { return true; }
}

/** 봤다고 적는다 — 다시 읽어 확인. 실패면 false(호출자는 보이지 않는다) */
export function markBfSeen(store: MiniStore | null, now = Date.now()): boolean {
  try {
    if (!store) return false;
    const v = String(now);
    store.setItem(BF_SEEN_KEY, v);
    return store.getItem(BF_SEEN_KEY) === v;
  } catch { return false; }
}

/** 자동 안내 가벼운 문(SDK 를 싣기 전에) */
export function bfPreGate(s: { ios: boolean; onboardedAtStart: boolean; store: MiniStore | null; now: number }): boolean {
  return s.ios && s.onboardedAtStart && !!s.store && bfLive(s.now) && !readBfSeen(s.store);
}

/** 'stop' = 이번 실행 끝 · 'later' = 다음 포그라운드에 · 'check' = 고객 정보 확인 뒤 보인다 */
export function bfStep(s: { seen: boolean; live: boolean; routeOk: boolean; otherToday: boolean; dialogOpen: boolean; visible: boolean; gateFlow: boolean; pending: boolean }): 'stop' | 'later' | 'check' {
  if (s.seen || !s.live) return 'stop';
  if (s.pending || !s.visible || !s.routeOk || s.otherToday || s.dialogOpen || s.gateFlow) return 'later';
  return 'check';
}
