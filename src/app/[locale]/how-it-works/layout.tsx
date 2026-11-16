import { publicBase } from '@/lib/net/publicBase';


// 2026-08-22 실측: 이 페이지 제목·설명이 홈과 «완전히 동일»했다(둘 다 루트 layout 값).
// 중복 제목은 구글이 저품질로 보고 색인 우선순위를 낮춘다.
const HIW_META: Record<string, { title: string; desc: string }> = {
  ko: { title: '사용법 — 미국주식 화면별 가이드 | SIGNUM HQ', desc: '종목 화면·관심종목·포트폴리오·AI 리포트를 어떻게 쓰는지 화면별로. 다크풀 비중·맥스페인·GEX·콜월·풋플로어 같은 고급 지표를 읽는 법도 예시와 함께.' },
  en: { title: 'How It Works — A Screen-by-Screen Guide | SIGNUM HQ', desc: 'How to use stock pages, your watchlist, portfolio and AI reports, screen by screen, plus how to read advanced data such as dark pool share, max pain, gamma exposure and the call wall / put floor.' },
  ja: { title: '使い方 — 画面ごとのガイド | SIGNUM HQ', desc: '銘柄画面・ウォッチリスト・ポートフォリオ・AIレポートの使い方を画面ごとに解説。ダークプール比率・マックスペイン・ガンマ・コールウォール・プットフロアなど上級データの読み方も例つきで。' },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const m = HIW_META[locale] || HIW_META.en;
  const base = publicBase();
  // canonical/hreflang 이 «아예 없었다»(2026-08-22 seo-audit 실측).
  // 세 로케일이 서로 구별되는 신호가 없으면 구글이 중복으로 버린다 —
  // /ko/flow 150건이 정확히 그렇게 색인에서 빠졌다.
  return {
    title: m.title, description: m.desc,
    alternates: {
      canonical: `${base}/${locale}/how-it-works`,
      languages: {
        en: `${base}/en/how-it-works`, ko: `${base}/ko/how-it-works`, ja: `${base}/ja/how-it-works`,
        'x-default': `${base}/en/how-it-works`,
      },
    },
    openGraph: { title: m.title, description: m.desc, url: `${base}/${locale}/how-it-works`, type: 'website', images: [`${base}/og-brand.png`] },
    twitter: { card: 'summary_large_image', title: m.title, description: m.desc, images: [`${base}/og-brand.png`] },
  };
}
export default function HowItWorksRouteLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <div data-guide>{children}</div>;
}
