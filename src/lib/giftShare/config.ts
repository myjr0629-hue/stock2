/** 클라이언트에도 전달 가능한 형식 검사. 플래그 판단은 서버에서만 한다. */
export type GiftOs = 'ios' | 'android';
export const giftToken = (v: unknown): string | null => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) ? v : null;
export const giftEnabled = () => process.env.GIFT_SHARE_ENABLED === '1';
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
