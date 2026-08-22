import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { publicBase } from '@/lib/net/publicBase';

// ============================================================================
// 로케일 «홈»만의 메타데이터 — 라우트 그룹 (home) 으로 격리한 이유
// ----------------------------------------------------------------------------
// canonical/hreflang 을 [locale]/layout.tsx 에 넣으면 그 아래 «모든» 페이지가
// 상속받는다. 자기 alternates 가 없는 /privacy·/terms·/pricing 같은 페이지가
// 전부 «홈이 정본»이라고 선언하게 되어 색인에서 빠진다.
// 라우트 그룹은 URL 을 바꾸지 않으면서 홈에만 메타데이터를 붙일 수 있다.
//
// 왜 필요했나 (2026-08-22 seo-audit 실측):
//   /en · /ko · /ja 홈 세 개에 canonical 도 hreflang 도 «아예 없었다».
//   같은 결함 조합(=서로 구별되는 신호 부재)이 /ko/flow 150건을
//   "Duplicate without user-selected canonical" 로 만든 원인이었다.
//   사이트에서 권위가 가장 높은 페이지를 같은 위험에 두지 않는다.
// ============================================================================
const LOCALES = ['en', 'ko', 'ja'] as const;
type Loc = (typeof LOCALES)[number];
const loc = (l: string): Loc => (LOCALES as readonly string[]).includes(l) ? (l as Loc) : 'en';

const META: Record<Loc, { title: string; desc: string }> = {
  ko: {
    title: 'SIGNUM HQ — 미국주식 다크풀·맥스페인·옵션 플로우',
    desc: '기관이 실제로 움직인 자리를 봅니다. 다크풀 비중, 맥스페인, 감마 노출, 옵션 플로우를 매일 무료로. 투자 자문이 아닌 정보 제공입니다.',
  },
  en: {
    title: 'SIGNUM HQ — Dark Pool, Max Pain & Options Flow for US Stocks',
    desc: 'See where institutional money actually moved. Dark pool share, max pain, gamma exposure and options flow — free, refreshed every US session. Information, not investment advice.',
  },
  ja: {
    title: 'SIGNUM HQ — 米国株のダークプール・マックスペイン・オプションフロー',
    desc: '機関投資家が実際に動いた場所を見る。ダークプール比率、マックスペイン、ガンマ、オプションフローを毎日無料で。投資助言ではなく情報提供です。',
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const lc = loc(locale);
  const m = META[lc];
  const base = publicBase();
  return {
    title: m.title,
    description: m.desc,
    alternates: {
      canonical: `${base}/${lc}`,
      languages: {
        ...Object.fromEntries(LOCALES.map((x) => [x, `${base}/${x}`])),
        'x-default': `${base}/en`,
      },
      // RSS 자동발견 — 이 <link> 가 없으면 리더가 URL 을 직접 쳐야만 피드를 찾는다.
      types: { 'application/rss+xml': [{ url: `/${lc}/feed.xml`, title: m.title }] },
    },
    openGraph: { title: m.title, description: m.desc, url: `${base}/${lc}`, type: 'website', images: [`${base}/og-brand.png`] },
    twitter: { card: 'summary_large_image', title: m.title, description: m.desc, images: [`${base}/og-brand.png`] },
  };
}

export default function HomeLayout({ children }: { children: ReactNode }) {
  return children;
}
