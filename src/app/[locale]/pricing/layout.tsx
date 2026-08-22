import type { ReactNode } from 'react';
import { publicBase } from '@/lib/net/publicBase';

// pricing/page.tsx 가 'use client' 라 메타데이터를 export 할 수 없다 → 레이아웃에서 준다.
// 2026-08-22 실측: 이 페이지 제목·설명이 홈과 «완전히 동일»했다(둘 다 루트 layout 값).
// 중복 제목은 구글이 저품질로 보고 색인 우선순위를 낮춘다.
const META: Record<string, { title: string; desc: string }> = {
  ko: { title: '요금제 — SIGNUM HQ', desc: '무료로 시작하세요. 다크풀·맥스페인·옵션 플로우는 가입 없이 볼 수 있습니다. 유료 요금제와 포함 항목을 확인하세요.' },
  en: { title: 'Pricing — SIGNUM HQ', desc: 'Start free. Dark pool, max pain and options flow are available with no account. See what each plan includes.' },
  ja: { title: '料金プラン — SIGNUM HQ', desc: '無料で始められます。ダークプール・マックスペイン・オプションフローは登録不要。各プランの内容をご確認ください。' },
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
