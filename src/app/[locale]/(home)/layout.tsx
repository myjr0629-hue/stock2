import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import PhLaunchBanner from '@/components/marketing/PhLaunchBanner';
import { publicBase } from '@/lib/net/publicBase';
import { APPS, appJsonLd, orgJsonLd } from '@/lib/seo/apps';
import { markPageView } from '@/lib/marketing/pageViewMark';

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
    title: 'SIGNUM HQ — 미국 주식 실적, 예상 변동폭과 실제',
    desc: '미국 주식 실적, 발표 전 예상 변동폭과 발표 뒤 실제를 한눈에. 예상 변동폭은 옵션 가격으로 계산합니다. 주간 성적표 무료 제공. 투자 자문이 아닌 정보 제공입니다.',
  },
  en: {
    title: 'SIGNUM HQ — US Stock Earnings: Expected Move vs Actual',
    desc: 'US stocks: the expected earnings move before the report, and what actually happened after. The expected move is derived from options prices. Weekly scorecard, free. Information, not investment advice.',
  },
  ja: {
    title: 'SIGNUM HQ — 米国株の決算、想定変動幅と実際',
    desc: '米国株の決算、発表前の想定変動幅と発表後の実際を一目で。想定変動幅はオプション価格から算出。週間スコアカードを無料で提供。投資助言ではなく情報提供です。',
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

export default async function HomeLayout({
  children, params,
}: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lc = loc(locale);
  await markPageView('home', lc); // 사람 페이지뷰 — 응답 뒤 집계(lib/marketing/pageViewHuman)
  // 앱 엔티티 JSON-LD(2026-09-30 GEO 제안 P2) — 홈에 구조화 데이터가 0개라 «SIGNUM HQ 는 iOS·Android 무료 금융 앱»이
  //   사이트 어디에도 기계가 읽는 모양으로 없었다. Organization(#org, 티커 페이지와 같은 엔티티) + WebSite + MobileApplication.
  const base = publicBase();
  const { ['@context']: _ctx, ...app } = appJsonLd(APPS.signum, lc, base) as Record<string, unknown>;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      orgJsonLd(base),
      { '@type': 'WebSite', '@id': `${base}/#website`, url: base, name: 'SIGNUM HQ', publisher: { '@id': `${base}/#org` }, inLanguage: ['en', 'ko', 'ja'] },
      { ...app, description: META[lc].desc, publisher: { '@id': `${base}/#org` } },
    ],
  };
  return (
    <>
      {/* 런치 당일에만 뜨는 PH 배너 — 날짜가 지나면 스스로 사라진다 */}
      <PhLaunchBanner locale={lc} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
