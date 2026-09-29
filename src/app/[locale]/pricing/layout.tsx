import type { ReactNode } from 'react';
import { publicBase } from '@/lib/net/publicBase';

// pricing/page.tsx 가 'use client' 라 메타데이터를 export 할 수 없다 → 레이아웃에서 준다.
// 2026-08-22 실측: 이 페이지 제목·설명이 홈과 «완전히 동일»했다(둘 다 루트 layout 값).
// 중복 제목은 구글이 저품질로 보고 색인 우선순위를 낮춘다.
// 2026-09-30: 예전 설명(«유료 요금제와 포함 항목») → 지금의 PRO(광고 없음 + 내 종목 100개, 앱 결제). 가격은 스토어 실측가.
const META: Record<string, { title: string; desc: string }> = {
  ko: { title: 'SIGNUM Pro — 광고 없이, 내 종목 100개', desc: '모든 데이터·지표는 무료. PRO는 광고 없음과 내 종목 100개, 월 ₩11,900(앱에서 결제).' },
  en: { title: 'SIGNUM Pro — No ads, 100-stock watchlist', desc: 'All data and metrics are free. PRO removes ads and adds a 100-stock watchlist — $9.99/month in the app.' },
  ja: { title: 'SIGNUM Pro — 広告なし・マイ銘柄100', desc: 'データ・指標はすべて無料。PROは広告なし・マイ銘柄100、月額¥1,280（アプリ内課金）。' },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const m = META[locale] || META.en;
  const base = publicBase();
  // canonical/hreflang 이 «아예 없었다»(2026-08-22 seo-audit 실측).
  // 세 로케일이 서로 구별되는 신호가 없으면 구글이 중복으로 버린다 —
  // /ko/flow 150건이 정확히 그렇게 색인에서 빠졌다.
  return {
    title: m.title, description: m.desc,
    alternates: {
      canonical: `${base}/${locale}/pricing`,
      languages: {
        en: `${base}/en/pricing`, ko: `${base}/ko/pricing`, ja: `${base}/ja/pricing`,
        'x-default': `${base}/en/pricing`,
      },
    },
    openGraph: { title: m.title, description: m.desc, url: `${base}/${locale}/pricing`, type: 'website', images: [`${base}/og-brand.png`] },
    twitter: { card: 'summary_large_image', title: m.title, description: m.desc, images: [`${base}/og-brand.png`] },
  };
}

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
