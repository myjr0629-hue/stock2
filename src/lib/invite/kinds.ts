/**
 * 공유 카드 + 추천 보상(바이럴 루프) 공용 정의 — 2026-10-14 (브랜치 feat/viral-loop)
 *
 * 왜(대표 10/14): «설치를 아이폰이든 안드로이드든 기하급수적으로 늘려 최소 하루 100건» — 설치가 «글이 터지는 날»에만 몰리고(10/12 클리앙 27·10/13 아사모 24·평소 2~7),
 *   커뮤니티 글은 사이트마다 하루 1편이 한계다. 기하급수는 «사용자가 사용자를 데려오는 루프»에서만 나온다.
 *   앱 안 세 곳(✦AI 오늘 볼 것 · 내 종목 ✦AI 한 줄 · 실적 옵션 반영 변동폭)에 작은 공유 단추를 두고, 누르면 «카드(OG 이미지) + 링크» 가 OS 공유 시트로 나간다.
 *   받은 사람이 링크를 열면 웹에서 그 카드 내용을 보고 «앱에서 이어 보기»(설치)로 간다. 초대한 사람에게는 친구가 설치하면 PRO 1개월 코드(선물함)를 준다.
 *
 * 이 파일은 «서버(페이지·OG·/app 라우트)·클라이언트»가 같이 import 한다 — node 전용 모듈을 넣지 않는다.
 *
 * 링크 규칙:
 *   공유 카드  https://www.signumhq.com/<ko|en|ja>/s/<pick|line|earn>/<TICKER>?from=share_<kind>&ref=<익명 초대 id>&via=<ios|android|web>
 *   앱으로 잇기 https://www.signumhq.com/app?from=share_<kind>&ref=<익명 초대 id>&l=<ko|ja>[&code=<선물 맞춤 코드>]
 *   · from=share_<kind> 는 기존 스마트링크 집계(mkt:attr:hit · clk:sg 사람 판정 · 애플 캠페인 ct · Play referrer utm_source)가 «그대로» 센다.
 *   · ref 는 «익명 초대 id» — 기기 로컬 비공개 열쇠에서 한 방향으로 만든 값(lib/invite/identity.ts). 이름·이메일·기기 식별자와 무관하다.
 *   · 카드 내용은 «서버가 저장본에서» 읽어 그린다 — 주소에 글을 싣지 않는다(위조 불가). 주소에 실리는 것은 종류·티커·언어·ref·via 뿐이다.
 */
import { SHARE_ORIGIN } from '@/lib/share/share';
import { GIFT_FROM, normalizeGiftRef } from '@/lib/gift/gift';
import { withGift } from '@/lib/giftShare/config';

export type ShareKind = 'pick' | 'line' | 'earn';
export const SHARE_KINDS: readonly ShareKind[] = ['pick', 'line', 'earn'];
export const isShareKind = (x: unknown): x is ShareKind => typeof x === 'string' && (SHARE_KINDS as readonly string[]).includes(x);

/** 스마트링크 태그 — 기존 클릭 집계가 그대로 센다(FROM_RE ^[a-z0-9_]{1,24}$ 안). */
export const SHARE_FROM: Record<ShareKind, string> = { pick: 'share_pick', line: 'share_line', earn: 'share_earn' };
/** 공유 퍼널 비콘 표면(/api/share-hit · lib/share/share ShareSurface) */
export const SHARE_SURFACE = { pick: 'sh_pick', line: 'sh_line', earn: 'sh_earn' } as const;
export type ShareSurfaceKey = (typeof SHARE_SURFACE)[ShareKind];
export const SHARE_SURFACES: readonly ShareSurfaceKey[] = ['sh_pick', 'sh_line', 'sh_earn'];

/** 이 스마트링크 태그가 «초대 링크»(친구 초대로 센다)인가 — 선물(gift) + 공유 카드 3종. */
export function isInviteFrom(tag: string | null | undefined): boolean {
  const f = (tag || '').toLowerCase();
  return f === GIFT_FROM || (SHARE_KINDS as readonly string[]).some((k) => f === SHARE_FROM[k as ShareKind]);
}

/** 태그 → 비콘 표면 — 선물은 gift_*(기존 계측)·공유 카드는 sh_* . 모르면 null. */
export function surfaceOfFrom(tag: string | null | undefined): ShareSurfaceKey | 'gift' | null {
  const f = (tag || '').toLowerCase();
  if (f === GIFT_FROM) return 'gift';
  for (const k of SHARE_KINDS) if (f === SHARE_FROM[k]) return SHARE_SURFACE[k];
  return null;
}

export type InviteLang = 'ko' | 'en' | 'ja';
export const INVITE_LANGS: readonly InviteLang[] = ['ko', 'en', 'ja'];
export const toInviteLang = (l: string | null | undefined): InviteLang => (l === 'ko' || l === 'ja' ? l : 'en');

export const SHARE_TICKER_RE = /^[A-Z][A-Z0-9.]{0,6}$/;
export function normalizeShareTicker(raw: unknown): string | null {
  const t = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return SHARE_TICKER_RE.test(t) ? t : null;
}

export type InviteVia = 'ios' | 'android' | 'web';
const toVia = (v: unknown): InviteVia => (v === 'ios' || v === 'android' ? v : 'web');

/** 공유 카드 주소 — 항상 운영 도메인. ref 가 형식 밖이면 붙이지 않는다(링크는 깨지지 않는다). */
export function buildShareCardUrl(kind: ShareKind, p: { locale: string; ticker: string; ref?: string | null; via?: string | null }): string {
  const u = new URL(`/${toInviteLang(p.locale)}/s/${kind}/${encodeURIComponent(p.ticker.toUpperCase())}`, SHARE_ORIGIN);
  u.searchParams.set('from', SHARE_FROM[kind]);
  const ref = normalizeGiftRef(p.ref);
  if (ref) u.searchParams.set('ref', ref);
  u.searchParams.set('via', toVia(p.via));
  return u.toString();
}

/**
 * 받은 쪽 페이지의 «앱에서 이어 보기» 주소 — 기존 스마트링크(/app). code 가 있으면(선물 코드가 켜져 있을 때) 쿠폰 화면이 먼저 뜬다.
 * 영어는 기본값이라 l 을 붙이지 않는다(미리보기 봇·쿠폰 화면 언어를 보낸 사람 언어로 맞추는 용도).
 */
export function inviteAppHref(kind: ShareKind, p: { lang: string; ref?: string | null; code?: string | null; giftToken?: string | null }): string {
  const u = new URL('/app', SHARE_ORIGIN);
  u.searchParams.set('from', SHARE_FROM[kind]);
  const code = (p.code || '').trim().toUpperCase();
  if (/^[A-Z0-9]{4,24}$/.test(code)) u.searchParams.set('code', code);
  const ref = normalizeGiftRef(p.ref);
  if (ref) u.searchParams.set('ref', ref);
  const lang = toInviteLang(p.lang);
  if (lang !== 'en') u.searchParams.set('l', lang);
  return withGift(u.toString(), p.giftToken);
}
