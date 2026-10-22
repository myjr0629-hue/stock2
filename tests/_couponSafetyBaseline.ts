import assert from 'node:assert/strict';
import { COUPON_SAFETY } from '../src/lib/marketing/couponSafety';

/** 날짜·한도·선물 회귀에서 설계 B의 지정 경고와 단계 이름만 이전 표기로 정규화한다. */
export function couponSafetyNormalized(html: string): string {
  return html.replace(/<p class="step2" id="coupon-warning">([^\n]*?)<\/p>\n/g, (_, body: string) => {
    assert.ok(Object.values(COUPON_SAFETY).includes(body.replace(/<[^>]*>/g, '') as any));
    return '';
  }).replaceAll('① Play 스토어에서 코드 등록', '① Play 스토어에서 적용')
    .replaceAll('① Redeem code in Play Store', '① Apply in Play Store')
    .replaceAll('① Playストアでコードを登録', '① Playストアで適用')
    .replace(/<p class="help">([^\n]*🎟[^\n]*?)<\/p>/g, (_, body: string) => {
      const text = body.replace(/<[^>]*>/g, '').replace('② 구독 시작', '계속')
        .replace('② Start subscription', 'Continue').replace('② 定期購入を開始', '続ける');
      return `<p class="help">${text}</p>`;
    });
}
