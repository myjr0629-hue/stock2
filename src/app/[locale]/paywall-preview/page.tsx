'use client';

// ============================================================================
// 페이월 «디자인 확인 + 심사 스크린샷 촬영» 전용 화면.
// ----------------------------------------------------------------------------
// 운영에서는 렌더되지 않는다(아래 가드). 개발에서만 열린다.
//
// 심사 스크린샷 다시 찍는 법 (페이월을 고쳤을 때):
//   node scripts/_shoot-paywall.js /tmp/paywall-en.png <프리뷰URL>/en/paywall-preview
//   (또는 npm run dev 후 http://localhost:3000/en/paywall-preview)
//   → 1179×2556 (iPhone 15 Pro ×3). ASC 업로드는 .agent/SUBSCRIPTION-STATUS.md 참고.
//
// ⚠️ 여기 가격은 «더미»다. 실제 앱은 스토어가 사용자 계정 국가에 맞춰 준다
//    (미국 $9.99 · 한국 ₩13,000 · 일본 ¥…). 우리가 고르는 값이 아니다.
// ============================================================================

import { use } from 'react';
import { ProPaywall, type PaywallPlan } from '@/components/app/ProPaywall';

const DUMMY: Record<string, string> = { ko: '₩13,000', ja: '¥1,500', en: '$9.99' };

// ★11/9 `?plans=1` — 월간·연간·평생 카드 모양(심사 스크린샷용 더미 · 실제 앱은 스토어 값만 쓴다)
const DUMMY_PLANS: Record<string, PaywallPlan[]> = {
  ko: [
    { plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW' },
    { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,417' },
    { plan: 'lifetime', priceString: '₩149,000', price: 149000, currencyCode: 'KRW' },
  ],
  ja: [
    { plan: 'monthly', priceString: '¥1,280', price: 1280, currencyCode: 'JPY' },
    { plan: 'annual', priceString: '¥12,000', price: 12000, currencyCode: 'JPY', pricePerMonthString: '¥1,000' },
    { plan: 'lifetime', priceString: '¥20,000', price: 20000, currencyCode: 'JPY' },
  ],
  en: [
    { plan: 'monthly', priceString: '$9.99', price: 9.99, currencyCode: 'USD' },
    { plan: 'annual', priceString: '$74.99', price: 74.99, currencyCode: 'USD', pricePerMonthString: '$6.25' },
    { plan: 'lifetime', priceString: '$124.99', price: 124.99, currencyCode: 'USD' },
  ],
};

export default function PaywallPreview({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ plans?: string }> }) {
  const { locale } = use(params);
  const { plans } = use(searchParams);
  // 운영 도메인(www.signumhq.com)에서는 계속 렌더되지 않는다.
  // 프리뷰 배포에서는 열어 둔다 — 페이월을 고칠 때마다 dev 서버를 띄우지 않고
  // 프리뷰 URL 로 바로 3개 언어를 확인하고 심사 스크린샷을 찍을 수 있다.
  // (프리뷰 URL 자체가 Vercel 보호 토큰 뒤에 있다)
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') return null;
  return (
    <div style={{
      minHeight: '100vh',
      background:
        'radial-gradient(60% 40% at 20% 15%, rgba(56,189,248,.22), transparent 60%),' +
        'radial-gradient(50% 40% at 85% 70%, rgba(16,185,129,.18), transparent 60%),' +
        'linear-gradient(180deg,#0a1020,#050912)',
    }}>
      <ProPaywall locale={locale} onClose={() => {}} previewPrice={DUMMY[locale] ?? DUMMY.en}
        previewPlans={plans === '1' ? (DUMMY_PLANS[locale] ?? DUMMY_PLANS.en) : undefined} />
    </div>
  );
}
