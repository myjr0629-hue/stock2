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

// ★2026-11-16 대표 «옵션·다크풀은 소수 — 시그넘은 주식 전반을 아우르는 앱» → 홈 정체성을 «미국 주식 앱»으로(스토어 11/16 과 같은 방향).
//   «실시간»은 정규장 기준(시간외는 15분 지연)이라 문구에 (정규장)/during market hours 를 붙인다. 실적 예상 변동폭은 /earnings·/earnings-week 가 맡는다.
const META: Record<Loc, { title: string; desc: string }> = {
  ko: {
    title: 'SIGNUM HQ — 미국주식 앱: 실시간 주가·AI 분석·뉴스',
    desc: '미국주식·해외주식을 쉽게. 내 종목 실시간 주가(정규장), 움직인 이유를 AI가 한 줄로, 나스닥·미국 증시 뉴스, 아침 AI 브리핑, 장마감 리포트, 실적 일정, 알림까지 무료. 처음 구독이면 PRO 7일 무료 체험. 투자 자문이 아닌 정보 제공입니다.',
  },
  en: {
    title: 'SIGNUM HQ: Stock Market App — Real-Time Prices & AI Analysis',
    desc: 'A free stock tracker for US stocks: real-time stock prices during market hours, AI stock analysis of why your stocks moved, market news, a morning AI brief, a closing report, the earnings calendar and alerts. New subscribers get a 7-day PRO trial. Information, not investment advice.',
  },
  ja: {
    title: 'SIGNUM HQ — 米国株アプリ｜株価リアルタイム・AI分析・ニュース',
    desc: '米国株をもっと手軽に。マイ銘柄の株価をリアルタイムで（通常取引時間）、動いた理由をAIが一行で分析。ニュース、朝のAIブリーフ、引け後レポート、決算日程、通知まで無料。初めての購読ならPRO 7日間無料体験。投資助言ではなく情報提供です。',
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
