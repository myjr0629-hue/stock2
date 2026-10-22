/** 클라이언트에도 전달 가능한 형식 검사. 플래그 판단은 서버에서만 한다. */
export type GiftOs = 'ios' | 'android';
export const giftToken = (v: unknown): string | null => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) ? v : null;
export const giftEnabled = () => process.env.GIFT_SHARE_ENABLED === '1';
/**
 * 등록 한도(기기·계정·IP·전체)는 «등록 처리 시각»이 아니라 발신 기기가 보낸 «공유 완료 시각(at)»의 KST 날짜로 센다.
 * 기기가 그날 보낸 선물 링크 수만 세면 서버 셈과 정확히 같아져, 재시도·응답 지연이 자정을 넘어도 등록 거부 링크가 생기지 않는다.
 * 서버는 at 이 [지금−48시간, 지금+10분] 안일 때만 받는다(과거 날짜 한도 끌어쓰기 상한). 기기 재시도는 47시간 안에서만 한다.
 */
export const GIFT_SHARE_WINDOW_MS = 48 * 3_600_000;
export const GIFT_SHARE_SKEW_MS = 10 * 60_000;
export function giftCap(os: GiftOs): number {
  const n = Number(process.env[os === 'ios' ? 'GIFT_SHARE_DAILY_CAP_IOS' : 'GIFT_SHARE_DAILY_CAP_ANDROID'] ?? 20);
  return Number.isInteger(n) && n >= 0 && n <= 200 ? n : 20;
}
export const giftPrefix = (target = process.env.VERCEL_ENV) => target === 'production' ? 'promo:gift:v1' : 'promo:pv:gift:v1';
export function withGift(href: string, token: unknown): string {
  const t = giftToken(token);
  return t ? `${href}${href.includes('?') ? '&' : '?'}gift=${encodeURIComponent(t)}` : href;
}
export const installUrl = (os: GiftOs | null) => os === 'android'
  ? 'https://play.google.com/store/apps/details?id=com.signumhq.app'
  : 'https://apps.apple.com/app/signum-hq-stock-market-intel/id6783130444';
