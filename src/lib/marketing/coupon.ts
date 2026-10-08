/**
 * 리딤 «쿠폰 경험» 공용 정의 — 2026-10-05 (브랜치 feat/coupon-ux)
 *
 * 왜 만들었나 (대표 10/5 13시대 원문 요지):
 *   «지금 여기 링크 누르고 설치하면 무료 1개월이 적용됩니다 — 이런 사용자 경험이 필요하다. 자동 적용이어도 그런 식이어야 한다.
 *    그냥 모두 적용이면 1개월 무료로 하는 것과 차이가 없다. 안드로이드 무료 코드 번호도 그런 식으로 — 쿠폰 받는 느낌.»
 *   그래서 코드 링크(/app?from=<채널>&code=<우리 애플 맞춤 코드>)를 폰으로 열면 302 대신 «쿠폰 화면»(lib/marketing/couponHtml.ts)을 먼저 보여 준다.
 *   · 아이폰: 그 채널의 애플 맞춤 코드를 쿠폰 번호로 크게 보여 주고, 단추가 애플 적용 주소(앱이 없으면 설치부터)다.
 *   · 안드로이드: «내 쿠폰 받기» → 서버가 개인 일회용 Play 번호 1장을 배정(/api/coupon/claim, lib/marketing/couponClaim.ts).
 *     켜기·끄기는 서버 환경변수 COUPON_ANDROID=1(기본 꺼짐) — 꺼져 있으면 예전처럼 Play 설치로 302.
 *
 * 숫자는 «진짜»만 쓴다(가짜 희소성 금지 — 대표 9/27·10/4):
 *   · 아이폰 «선착순 500명» = 애플이 맞춤 코드마다 강제하는 사용 한도(ASC 오퍼 51bd34ef, 코드 8종 × 500).
 *   · 안드로이드 «선착순 200명» = 서버 풀에 넣은 Play 일회용 번호 수(300장 중 대표 시험 1 · 게시용 99 제외).
 *   · 날짜 «10/30까지» = 애플 만료 2026-10-31 07:00Z(= 10/30 PT 자정) · Play 프로모션 종료 2026-10-31 00:00 GMT.
 * 번호 값(애플·Play 일회용, Play 맞춤 코드)은 이 공개 저장소 어디에도 쓰지 않는다 — 풀 적재는 저장소 밖 일회성 스크립트로.
 */
import { isCreatorPromoCode, type PreviewLang } from './linkPreview';
// ⚠ 이 파일은 클라이언트(홈 칩)도 import 한다 — node 전용 모듈(crypto 등)을 넣지 않는다. IP 해시는 couponClaim.ts(서버 전용).

// ── 켜기·끄기 ────────────────────────────────────────────────────────────────

/** 안드로이드 쿠폰(개인 일회용 Play 번호) 켜짐 — 서버 환경변수 COUPON_ANDROID 가 정확히 "1" 일 때만(순수 함수). */
export function androidCouponFlag(v: string | undefined = process.env.COUPON_ANDROID): boolean {
  return (v || '').trim() === '1';
}

/** ★2026-10-07 아이폰 «앱 안 브라우저» 쿠폰 화면의 «Safari 로 열기» 안내(눌렀는데 2.5초 뒤에도 화면이 그대로일 때만 뜨는 줄) — 서버 환경변수 COUPON_IOS_STAY_HINT 가 정확히 "1" 일 때만(기본 꺼짐 = 측정만).
 *  꺼져 있어도 apply_stay 비콘·ios|app:<가족> 집계는 돈다(화면에는 아무것도 안 보인다). 대표 아이폰 실기기 확인 뒤 켠다. */
export function iosStayHintFlag(v: string | undefined = process.env.COUPON_IOS_STAY_HINT): boolean {
  return (v || '').trim() === '1';
}

/** Play 프로모션(일회용 300장) 종료 — Play 콘솔 시각은 GMT. 애플 코드보다 7시간 빠르다. */
export const PLAY_PROMO_END = Date.parse('2026-10-31T00:00:00Z');

/** 지금 안드로이드 쿠폰 화면을 보여 줄까 — 플래그 켜짐 + Play 프로모션 종료 전(순수 함수). */
export function androidCouponLive(now = Date.now(), flag = androidCouponFlag()): boolean {
  return flag && now < PLAY_PROMO_END;
}

// ── 실제 한도 ───────────────────────────────────────────────────────────────

/** 애플 맞춤 코드 1종의 사용 한도(오퍼 코드 numberOfCodes) — 코드 8종 모두 500. */
export const APPLE_CODE_LIMIT = 500;
/** 서버 풀에 넣은 Play 일회용 번호 수 — 풀 적재 개수와 같게 유지한다(바꾸면 여기도). */
export const ANDROID_POOL_SIZE = 200;
/** 하루 배정 상한 기본값(KST 하루). 미리보기 시험용으로만 COUPON_ANDROID_DAILY_CAP 로 낮춘다. */
export const ANDROID_DAILY_CAP_DEFAULT = 60;
export function androidDailyCap(v: string | undefined = process.env.COUPON_ANDROID_DAILY_CAP): number {
  const n = Number((v || '').trim());
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : ANDROID_DAILY_CAP_DEFAULT;
}

// ── 날짜(KST = JST, UTC+9) ──────────────────────────────────────────────────

const KST_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;
/** KST 날짜 YYYY-MM-DD — 하루 상한의 경계(한국·일본 독자가 대부분이고 두 나라 시각이 같다). */
export function kstDay(now = Date.now()): string {
  return new Date(now + KST_MS).toISOString().slice(0, 10);
}
/** 다음 KST 자정(= 다음 배정 시작) — 화면은 이 시각을 방문자 기기 시간대로 보여 준다. */
export function nextKstMidnight(now = Date.now()): number {
  return Math.floor((now + KST_MS) / DAY_MS) * DAY_MS + DAY_MS - KST_MS;
}

// ── 채널 이름 ───────────────────────────────────────────────────────────────

type Names = { ko: string; en: string; ja: string; web?: true; member?: true };
const N = (en: string, ko = en, ja = en, web?: true): Names => (web ? { ko, en, ja, web } : { ko, en, ja });
/** 회원제 커뮤니티(뽐뿌·클리앙 등) — «독자 전용» 대신 «회원 전용»(2026-10-08) */
const M = (en: string, ko = en, ja = en): Names => ({ ko, en, ja, member: true });

const THREADS = N('Threads');
const X = N('X');
const BLUESKY = N('Bluesky');
const NOTE = N('note');
const NAVER_BLOG = N('Naver Blog', '네이버 블로그', 'NAVERブログ');
const IH = N('Indie Hackers');
const WEB = N('signumhq.com', 'SIGNUM 웹', 'SIGNUMサイト', true);

/** from 태그 → 사람이 읽는 채널 이름. 위에서부터 처음 맞는 것. 모르는 태그는 코드의 채널로(아래 BY_CODE). */
const BY_TAG: ReadonlyArray<readonly [RegExp, Names]> = [
  [/^threads/, THREADS],
  [/^(x|twitter)(_|$)/, X],
  [/^(bluesky|bsky)/, BLUESKY],
  [/^note(_|$)/, NOTE],
  [/^naver_blog/, NAVER_BLOG],
  [/^naver_cafe/, N('Naver Cafe', '네이버 카페', 'NAVERカフェ')],
  [/^naver_kin/, N('Naver KnowledgeiN', '네이버 지식iN', 'NAVER知識iN')],
  [/^naver/, N('Naver', '네이버', 'NAVER')],
  [/^(indiehackers|ih)(_|$)/, IH],
  [/^(home|web|site)(_|$)/, WEB],
  [/^reddit/, N('Reddit')],
  [/^medium/, N('Medium')],
  [/^(linkedin|li_)/, N('LinkedIn')],
  [/^quora/, N('Quora')],
  [/^okky$/, N('OKKY')],
  [/^geeknews$/, N('GeekNews')],
  [/^tistory$/, N('Tistory', '티스토리', 'Tistory')],
  [/^disquiet$/, N('Disquiet', '디스콰이엇', 'Disquiet')],
  [/^fmkorea$/, N('FM Korea', '에펨코리아', 'FM Korea')],
  [/^dcinside$/, N('DC Inside', '디시인사이드', 'DC Inside')],
  // ★2026-10-08 커뮤니티 코드 나눔 글(뽐뿌 앱정보 no=10950 등) — 기존 채널 코드(NAVERPRO)를 from 태그로 나눠 쓰면 «네이버 블로그 독자 전용»으로 보였다
  [/^ppomppu$/, M('Ppomppu', '뽐뿌', 'Ppomppu')],
  [/^clien$/, M('Clien', '클리앙', 'Clien')],
  // ★2026-10-08 전 세계 게시판·디렉터리(growth/communities/GLOBAL-TARGETS) — 태그가 없으면 코드의 채널 이름(«Indie Hackers 독자 전용» 등)으로 어긋나 보였다
  [/^macrumors$/, M('MacRumors')],
  [/^ruliweb$/, M('Ruliweb', '루리웹', 'Ruliweb')],
  [/^androidcentral$/, M('Android Central')],
  [/^valuebuddies$/, M('ValueBuddies')],
  [/^hardwarezone$/, M('HardwareZone')],
  [/^ptt$/, M('PTT')],
  [/^lihkg$/, M('LIHKG')],
  [/^kojindev$/, N('kojin.dev', '個人dev', '個人dev')],
  [/^tsukutta$/, N('Tsukutta')],
  [/^appvillage$/, N('AppVillage')],
  [/^alternativeto$/, N('AlternativeTo')],
  [/^betalist$/, N('BetaList')],
  [/^saashub$/, N('SaaSHub')],
  [/^daum$/, N('Daum', '다음', 'Daum')],
  [/^qiita$/, N('Qiita')],
  [/^zenn$/, N('Zenn')],
  [/^hatena/, N('Hatena', '하테나', 'はてな')],
  [/^producthunt$/, N('Product Hunt')],
  [/^(instagram|ig_)/, N('Instagram')],
  [/^tiktok/, N('TikTok')],
  [/^youtube/, N('YouTube')],
  [/^telegram/, N('Telegram')],
  [/^line(_|$)/, N('LINE')],
  [/^pinterest/, N('Pinterest')],
  [/^substack$/, N('Substack')],
  [/^devto$/, N('DEV')],
  [/^github/, N('GitHub')],
  [/^hf_/, N('Hugging Face')],
];
/** 코드 → 그 코드를 뿌린 채널(애플 맞춤 코드 8종). from 태그를 모를 때(시험 태그 등)만 쓴다. */
const BY_CODE: Readonly<Record<string, Names>> = {
  THREADSPRO: THREADS, XPRO: X, XJPPRO: X, BSKYPRO: BLUESKY, NOTEJP: NOTE, NAVERPRO: NAVER_BLOG, IHPRO: IH, WEBPRO: WEB,
};
/** ★2026-10-06 크리에이터 맞춤 코드(형식 규칙 — linkPreview.isCreatorPromoCode)는 채널·크리에이터 이름을 «지어내지 않는다» — 일반 문구 «구독자 전용». */
const CREATOR_AUDIENCE: Record<PreviewLang, string> = { ko: '구독자 전용', ja: '購読者限定', en: 'For subscribers only' };

/** ★2026-10-06 «친구에게 PRO 1개월 선물»(lib/gift) 링크(from=gift)의 부제 조각 — 채널·구독자 전용 문구 대신 «친구가 보낸 선물». */
const GIFT_AUDIENCE: Record<PreviewLang, string> = { ko: '친구가 보낸 선물', ja: '友だちからのプレゼント', en: 'A gift from a friend' };

/** «{채널} 독자 전용» 줄 — 태그 → 채널, 없으면 코드 8종 → 채널, 없으면 크리에이터 코드 → «구독자 전용», 그래도 모르면 null(그 조각을 빼고 한도·날짜만). 선물 링크(from=gift)는 «친구가 보낸 선물». 순수 함수. */
export function audienceLine(fromTag: string | null, code: string, lang: PreviewLang): string | null {
  const f = (fromTag || '').toLowerCase();
  const c = code.toUpperCase();
  if (f === 'gift') return GIFT_AUDIENCE[lang];
  const hit = BY_TAG.find(([re]) => re.test(f))?.[1] ?? BY_CODE[c] ?? null;
  if (!hit) return isCreatorPromoCode(c) ? CREATOR_AUDIENCE[lang] : null;
  const name = hit[lang];
  if (hit.member) return lang === 'ko' ? `${name} 회원 전용` : lang === 'ja' ? `${name}会員限定` : `For ${name} members only`;
  if (lang === 'ko') return hit.web ? `${name} 방문자 전용` : `${name} 독자 전용`;
  if (lang === 'ja') return hit.web ? `${name}訪問者限定` : `${name}読者限定`;
  return hit.web ? `For ${name} visitors only` : `For ${name} readers only`;
}

// ── 저장 키 ─────────────────────────────────────────────────────────────────

/**
 * Upstash 키(원자 연산 SPOP·INCR·SET NX 가 필요해서 EC2 래퍼가 아니라 Upstash 직접 — push:token_list 와 같은 방식).
 *   redisClient 의 UPSTASH_ONLY_PREFIXES 에 /^promo:/ 를 올려 «Upstash 에만 있는 키»로 등록했다(scripts/test-redis-policy.ts 고정).
 * 운영은 promo:play:*, 미리보기·로컬은 promo:pv:play:* — 미리보기와 운영이 같은 레디스를 쓰므로 «시험 풀»이 진짜 번호를 건드리지 않게.
 */
export function couponKeys(vercelEnv: string | undefined = process.env.VERCEL_ENV) {
  const p = vercelEnv === 'production' ? 'promo:play' : 'promo:pv:play';
  return {
    pool: `${p}:pool`,            // SET — 아직 안 나간 번호
    claims: `${p}:claims`,        // HASH — 번호 → {from, at, ip(해시), ac(링크의 애플 코드)}
    ip: (hash: string) => `${p}:ip:${hash}`,   // STRING — IP 해시 → 번호(24시간)
    day: (day: string) => `${p}:day:${day}`,   // INT — KST 하루 배정 수
  };
}

/** Play 일회용 번호 형식(대문자·숫자 23자) — 적재·응답 검사용. */
export const PLAY_ONE_TIME_RE = /^[A-Z0-9]{23}$/;
/** Play «코드 사용» 창 — 코드가 채워진 채 열린다(앱이 없으면 Play 가 설치부터). */
export function playRedeemUrl(code: string): string {
  return `https://play.google.com/redeem?code=${encodeURIComponent(code)}`;
}

// ── 쿠폰 화면 단추 측정(비콘) ────────────────────────────────────────────────
/** 쿠폰 화면 단추 이름 — 닫힌 목록(키 필드가 무한히 늘지 않게). apply_stay=아이폰 «앱 안 브라우저»에서 적용을 눌렀는데 2.5초 뒤에도 화면이 그대로(App Store 로 안 넘어감 — 2026-10-07). apply=아이폰 적용 · play=Play 에서 적용 · copy=번호 복사 · install=쿠폰 없이 설치
 *  · play_web·install_web = 안드로이드 «앱 안 브라우저»에서만 보이는 보조 https 단추(«안 열리면 여기», 2026-10-05 — 주 단추 play·install 은 그때 intent) */
export const COUPON_TAPS = ['apply', 'play', 'copy', 'install', 'play_web', 'install_web', 'apply_stay'] as const;
export type CouponTap = (typeof COUPON_TAPS)[number];
export const isCouponTap = (x: unknown): x is CouponTap => typeof x === 'string' && (COUPON_TAPS as readonly string[]).includes(x);
