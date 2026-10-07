/**
 * «친구에게 PRO 1개월 선물» v1 — 공용 정의 (2026-10-06, 브랜치 feat/gift-pro)
 *
 * 무엇: 앱 안(설정 카드 · 대시보드 맨 아래 작은 단추)에서 «선물 링크»를 공유한다. 링크를 받은 친구는 기존 스마트링크·쿠폰 화면을 그대로 탄다.
 *   https://www.signumhq.com/app?from=gift&code=<선물 맞춤 코드>&ref=<익명 초대자 id>[&l=ko|ja]
 *   · 아이폰 = 쿠폰 화면 → 애플 적용 주소(그 코드의 오퍼 «PRO 1개월 무료»)
 *   · 안드로이드 = «내 쿠폰 받기»(서버가 COUPON_ANDROID=1 일 때) → 개인 일회용 Play 번호
 *
 * 코드 값은 이 공개 저장소에 쓰지 않는다 — 서버 환경변수 GIFT_PROMO_CODE 로만 주입한다(lib/gift/giftConfig.ts → /api/gift/config).
 *   변수가 없거나 코드 만료(2026-10-31 PT) 뒤면 선물 입구는 어디에도 그려지지 않는다(= 기능 꺼짐·킬 스위치).
 *
 * ref = «익명 초대자 id» — 기기 로컬 랜덤(localStorage). 이름·이메일·기기 식별자와 무관하고, 앱 데이터를 지우면 새로 만들어진다.
 *   서버는 이 값으로 «초대자별 클릭·쿠폰 받기»만 센다(clk:gift:<ref>:<ET날짜>, 사람 판정은 기존 clk: 와 같다).
 *
 * ⚠ 이 파일은 서버(/app 라우트)·클라이언트가 같이 import 한다 — node 전용 모듈을 넣지 않는다.
 */
import { SHARE_ORIGIN } from '@/lib/share/share';

/** 스마트링크 태그 — 기존 클릭 집계(mkt:attr:hit:gift · clk:sg|code|coupon:gift)가 그대로 센다. */
export const GIFT_FROM = 'gift';

export type GiftLang = 'ko' | 'en' | 'ja';
export const toGiftLang = (l: string | null | undefined): GiftLang => (l === 'ko' || l === 'ja' ? l : 'en');

/** 공유 퍼널 비콘 표면(lib/share/share ShareSurface · /api/share-hit) — 어느 «문»이 먹히는지 가른다. */
export type GiftSurface = 'gift_set' | 'gift_dash';

// ── 익명 초대자 id ───────────────────────────────────────────────────────────

export const GIFT_REF_STORAGE_KEY = 'signumhq.gift.ref';
/** 영문 소문자·숫자 8~16자 + «숫자 하나 이상». 숫자 조건 덕에 /app 의 ?ref=<분류 이름>(google·x·threads…)과 절대 겹치지 않는다. */
export const GIFT_REF_RE = /^(?=[a-z0-9]*\d)[a-z0-9]{8,16}$/;
/** 헷갈리는 글자(i·l·o·0·1)를 뺀 31자 — 10자리 ≈ 8×10^14 가지. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const DIGITS = '23456789';

export function normalizeGiftRef(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return GIFT_REF_RE.test(s) ? s : null;
}

function randomInt(max: number): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % max;
  } catch {
    return Math.floor(Math.random() * max);
  }
}

/** 새 id — 10자, 숫자가 하나도 없으면 한 자리를 숫자로 바꾼다(시험용으로 난수 함수를 받는다). */
export function newGiftRef(rand: (max: number) => number = randomInt): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[rand(ALPHABET.length)];
  if (!/\d/.test(s)) {
    const p = rand(s.length);
    s = s.slice(0, p) + DIGITS[rand(DIGITS.length)] + s.slice(p + 1);
  }
  return s;
}

let memoryRef: string | null = null;
/** 이 기기의 초대자 id — 없으면 만들어 저장한다. 저장소가 막힌 환경(사생활 보호 창 등)이면 이 화면이 열려 있는 동안만 같은 값. */
export function getGiftRef(): string {
  try {
    const cur = normalizeGiftRef(localStorage.getItem(GIFT_REF_STORAGE_KEY));
    if (cur) return cur;
    const fresh = newGiftRef();
    localStorage.setItem(GIFT_REF_STORAGE_KEY, fresh);
    return fresh;
  } catch { /* 저장소 막힘 — 아래 메모리 값 */ }
  if (!memoryRef) memoryRef = newGiftRef();
  return memoryRef;
}

// ── 링크 ─────────────────────────────────────────────────────────────────────

/**
 * 선물 링크. 항상 운영 도메인(www)이다 — 프리뷰에서 눌러도 받는 사람은 운영 스마트링크를 탄다.
 * l=<ko|ja> 는 «링크 미리보기 카드·쿠폰 화면» 언어를 보낸 사람 언어로 맞춘다(영어는 기본값이라 붙이지 않는다).
 *   ?l= 이 없으면 미리보기 봇(언어 헤더 없음)이 from=gift 를 영어 카드로 그린다.
 */
export function buildGiftUrl(code: string, ref: string | null, lang: GiftLang = 'en'): string {
  const u = new URL('/app', SHARE_ORIGIN);
  u.searchParams.set('from', GIFT_FROM);
  u.searchParams.set('code', code);
  if (ref) u.searchParams.set('ref', ref);
  if (lang !== 'en') u.searchParams.set('l', lang);
  return u.toString();
}

// ── 문구(한·일·영) ───────────────────────────────────────────────────────────
// 규칙: ① 자동 갱신 고지는 «무료» 문장 «안에» ② 가짜 희소성 금지(남은 수·타이머·«선착순»은 쓰지 않는다 — 실제 한도는 받는 쪽 쿠폰 화면이 보여 준다)
//       ③ 가격 숫자는 쓰지 않는다(스토어가 사용자 통화로 청구한다 — 받는 쪽 쿠폰 화면이 언어별 가격을 보여 준다)
//       ④ 안드로이드 쿠폰이 꺼져 있으면(config.android=false) «지금은 아이폰 친구용»이라고 솔직히 적는다.

export interface GiftCopy {
  /** 설정 카드 제목 · 대시보드 단추 */
  title: string;
  /** 설정 카드 부제(아이폰·안드로이드 모두) */
  sub: string;
  /** 설정 카드 부제(안드로이드 쿠폰이 꺼진 동안 — 아이폰 친구용) */
  subIosOnly: string;
  cta: string;
  /** 공유 시트 제목(메일 제목 등) */
  shareTitle: string;
  /** 링크 복사 토스트(안드로이드 셸·Web Share 가 없는 곳) */
  copied: string;
  /** 대시보드 맨 아래 작은 단추 */
  dashLabel: string;
}

export const GIFT_COPY: Record<GiftLang, GiftCopy> = {
  ko: {
    title: '친구에게 PRO 1개월 선물',
    sub: '링크로 설치하면 친구가 PRO 1개월 무료 — 이후 자동 갱신, 언제든 해지',
    subIosOnly: '아이폰 친구가 링크로 설치하면 PRO 1개월 무료 — 이후 자동 갱신, 언제든 해지',
    cta: '선물하기',
    shareTitle: 'SIGNUM HQ PRO 1개월 무료 선물',
    copied: '선물 링크를 복사했어요 — 친구에게 붙여넣어 보내세요',
    dashLabel: '친구에게 PRO 1개월 선물',
  },
  en: {
    title: 'Gift a friend 1 month of PRO',
    sub: 'Your friend gets PRO free for 1 month via your link — then auto-renews, cancel anytime',
    subIosOnly: 'An iPhone friend gets PRO free for 1 month via your link — then auto-renews, cancel anytime',
    cta: 'Gift',
    shareTitle: 'A free month of SIGNUM HQ PRO',
    copied: 'Gift link copied — paste it to your friend',
    dashLabel: 'Gift a friend 1 month of PRO',
  },
  ja: {
    title: '友だちにPRO 1か月をプレゼント',
    sub: 'リンクから始めると友だちはPRO 1か月無料 — 以降は自動更新、いつでも解約可',
    subIosOnly: 'iPhoneの友だちがリンクから始めるとPRO 1か月無料 — 以降は自動更新、いつでも解約可',
    cta: '贈る',
    shareTitle: 'SIGNUM HQ PRO 1か月無料のプレゼント',
    copied: 'プレゼントのリンクをコピーしました — 友だちに貼り付けて送ってください',
    dashLabel: '友だちにPRO 1か月をプレゼント',
  },
};

/** 메신저에 실리는 본문 — 링크는 shareOrCopy 가 «맨 끝»에 붙여 한 문자열로 넘긴다(iOS «복사»가 text·url 을 따로 받으면 링크를 떨군다). */
export function giftShareText(lang: GiftLang, android: boolean): string {
  switch (lang) {
    case 'ko':
      return `🎁 SIGNUM HQ PRO 1개월 무료 쿠폰을 선물해요${android ? '' : '(아이폰)'} — 이후 자동 갱신, 언제든 해지할 수 있어요. 링크를 열어 받으세요:`;
    case 'ja':
      return `🎁 SIGNUM HQ PRO 1か月無料クーポンをプレゼント${android ? '' : '(iPhone)'} — 以降は自動更新、いつでも解約できます。リンクを開いて受け取ってね：`;
    default:
      return `🎁 A free month of SIGNUM HQ PRO, on me${android ? '' : ' (iPhone)'} — then it auto-renews, cancel anytime. Open the link to get your coupon:`;
  }
}
