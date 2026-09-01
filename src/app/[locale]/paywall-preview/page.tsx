'use client';

// ============================================================================
// 페이월 «디자인 확인 + 심사 스크린샷 촬영» 전용 화면.
// ----------------------------------------------------------------------------
// 운영에서는 렌더되지 않는다(아래 가드). 개발에서만 열린다.
//
// 심사 스크린샷 다시 찍는 법 (페이월을 고쳤을 때):
//   npm run dev
//   node scripts/_shoot-paywall.js /tmp/paywall-en.png http://localhost:3000/en/paywall-preview
//   → 1179×2556 (iPhone 15 Pro ×3). ASC 업로드는 .agent/SUBSCRIPTION-STATUS.md 참고.
//
// ⚠️ 여기 가격은 «더미»다. 실제 앱은 스토어가 사용자 계정 국가에 맞춰 준다
//    (미국 $9.99 · 한국 ₩13,000 · 일본 ¥…). 우리가 고르는 값이 아니다.
// ============================================================================

import { use } from 'react';
import { ProPaywall } from '@/components/app/ProPaywall';

const DUMMY: Record<string, string> = { ko: '₩13,000', ja: '¥1,500', en: '$9.99' };

export default function PaywallPreview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  if (process.env.NODE_ENV === 'production') return null;
  return (
    <div style={{
      minHeight: '100vh',
      background:
        'radial-gradient(60% 40% at 20% 15%, rgba(56,189,248,.22), transparent 60%),' +
        'radial-gradient(50% 40% at 85% 70%, rgba(16,185,129,.18), transparent 60%),' +
        'linear-gradient(180deg,#0a1020,#050912)',
    }}>
      <ProPaywall locale={locale} onClose={() => {}} previewPrice={DUMMY[locale] ?? DUMMY.en} />
    </div>
  );
}
