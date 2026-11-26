// ============================================================================
// 혜택·할인 알림(광고성 푸시) 동의 규칙 — 순수 함수 · 서버(lib/push/bfPush)와 설정 화면이 같은 규칙을 쓴다 (2026-11-26)
//   · 애플 4.5.4 — iOS 홍보 푸시는 앱 화면의 동의 문구로 «명시적으로 동의한 사람»만 → iOS 기본 꺼짐.
//   · 한국 정보통신망법 50조 — 광고성 앱 푸시는 사전 동의 → 한국 수신자(기기 언어 ko 또는 시간대 Asia/Seoul) 기본 꺼짐.
//   · 그 밖 안드로이드 — 기본 켜짐(설정 › 알림 › 혜택·할인 알림에서 끌 수 있다 — 업계 표준 옵트아웃).
// 명시 값(preferences.promo)이 있으면 언제나 그 값.
// ============================================================================
import { sanitizeTz } from '@/lib/signals/sanitize';

export type PromoLoc = 'ko' | 'ja' | 'en';
export const toPromoLoc = (l: unknown): PromoLoc => (typeof l === 'string' && (l.startsWith('ko') ? 'ko' : l.startsWith('ja') ? 'ja' : 'en')) || 'en';

/** 한국 수신자로 본다 — 기기 언어 ko 또는 시간대 Asia/Seoul */
export function promoKoreaRecipient(loc: PromoLoc, tz: unknown): boolean {
  return loc === 'ko' || sanitizeTz(tz) === 'Asia/Seoul';
}

/** 동의 기록이 없을 때의 기본값 */
export function promoDefaultOn(platform: unknown, loc: PromoLoc, tz: unknown): boolean {
  return String(platform).toLowerCase() === 'android' && !promoKoreaRecipient(loc, tz);
}

/** 이 기기가 지금 혜택 알림을 받는가 */
export function promoAllowed(rec: { platform?: unknown; locale?: unknown; tz?: unknown; preferences?: { promo?: unknown } | null } | null | undefined): boolean {
  if (!rec) return false;
  const p = rec.preferences?.promo;
  if (p === true) return true;
  if (p === false) return false;
  return promoDefaultOn(rec.platform, toPromoLoc(rec.locale), rec.tz);
}

/** 설정 화면 표시값 — 저장된 값이 있으면 그 값, 없으면 기본값 */
export function promoShown(stored: unknown, platform: unknown, loc: PromoLoc, tz: unknown): boolean {
  return typeof stored === 'boolean' ? stored : promoDefaultOn(platform, loc, tz);
}

/** 동의·철회 결과 알림(정보통신망법 50조 ⑦ — 처리 결과 통지: 일자·내용) */
export function promoToast(loc: PromoLoc, on: boolean, now: Date): string {
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  if (loc === 'ko') return `${y}.${m}.${d} 혜택·할인 알림 수신에 ${on ? '동의' : '동의를 철회'}했어요`;
  if (loc === 'ja') return `${y}/${m}/${d} お得な情報の通知を${on ? 'オンにしました' : 'オフにしました'}`;
  return `Offers notifications turned ${on ? 'on' : 'off'} (${m}/${d}/${y})`;
}
