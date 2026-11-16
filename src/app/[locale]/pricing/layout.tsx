import type { ReactNode } from 'react';
import { publicBase } from '@/lib/net/publicBase';

// pricing/page.tsx 가 'use client' 라 메타데이터를 export 할 수 없다 → 레이아웃에서 준다.
// 2026-08-22 실측: 이 페이지 제목·설명이 홈과 «완전히 동일»했다(둘 다 루트 layout 값).
// 중복 제목은 구글이 저품질로 보고 색인 우선순위를 낮춘다.
const META: Record<string, { title: string; desc: string }> = {
  ko: { title: '요금제 — SIGNUM HQ', desc: '무료로 시작하세요. 가격 차트·기관 보유 현황은 무료, PRO는 AI 해석·10개 섹터 리포트·장마감 브리핑을 모두 열고 관심종목을 50개까지 늘립니다. 옵션·다크풀 같은 고급 지표도 PRO·ELITE에 포함됩니다.' },
  en: { title: 'Pricing — SIGNUM HQ', desc: 'Start free. Price charts and institutional holdings are free; PRO unlocks AI insights, all 10 sector reports and the post-market brief, and raises your watchlist to 50 stocks. Advanced data such as options and dark pool activity is included in PRO and ELITE.' },
  ja: { title: '料金プラン — SIGNUM HQ', desc: '無料で始められます。株価チャート・機関保有状況は無料、PROはAI解説・全10セクターレポート・引け後ブリーフをすべて開放し、ウォッチリストを50銘柄まで拡大。オプション・ダークプールなどの上級データもPRO・ELITEに含まれます。' },
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
