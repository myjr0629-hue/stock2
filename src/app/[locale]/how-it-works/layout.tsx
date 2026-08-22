import { publicBase } from '@/lib/net/publicBase';


// 2026-08-22 실측: 이 페이지 제목·설명이 홈과 «완전히 동일»했다(둘 다 루트 layout 값).
// 중복 제목은 구글이 저품질로 보고 색인 우선순위를 낮춘다.
const HIW_META: Record<string, { title: string; desc: string }> = {
  ko: { title: '사용법 — 다크풀·맥스페인 읽는 법 | SIGNUM HQ', desc: '다크풀 비중, 맥스페인, 감마 노출, 콜월·풋플로어가 무엇이고 어떻게 읽는지. 화면별 사용법을 예시와 함께.' },
  en: { title: 'How It Works — Reading Dark Pool & Max Pain | SIGNUM HQ', desc: 'What dark pool share, max pain, gamma exposure and the call wall / put floor mean, and how to read them screen by screen.' },
  ja: { title: '使い方 — ダークプールとマックスペインの読み方 | SIGNUM HQ', desc: 'ダークプール比率、マックスペイン、ガンマ、コールウォール・プットフロアの意味と読み方を画面ごとに解説。' },
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
