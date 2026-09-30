import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import PhLaunchBanner from '@/components/marketing/PhLaunchBanner';
import { ShareLanding } from '@/components/share/ShareLanding';
import { publicBase } from '@/lib/net/publicBase';
import { APPS, appJsonLd, type Loc } from '@/lib/seo/apps';
import { COPY } from '@/lib/marketing/linkPreview';
import { readShareQuery, cleanTicker } from '@/lib/share/shareQuery';

// WIM gets its own tab identity — without this the page inherits the site-wide
// "SIGNUM HQ" title, which mislabels shares/bookmarks and weakens SEO.
//
// ★ 스마트앱배너 — 루트 layout 이 전 페이지에 SIGNUM(6783130444)을 박고 있어서
//   /wim 을 아이폰 사파리로 연 사람에게 «엉뚱한 앱»을 권하고 있었다(2026-08-18 실측).
// ★ canonical/hreflang/OG/앱 스키마는 2026-08-22 에 추가 — 전부 없었다.
// ★ 공유 루프 (2026-09-29): 오늘의 무브 공유는 /<loc>/wim?t=<티커>&from=share 로 온다.
//   그 요청에만 ① 미리보기 제목을 «그 종목 — 왜 움직였을까?»(방향 없는 원인 질문)로,
//   이미지를 WIM 카드(/api/og/app)로 ② 맨 위에 설치 띠. 그 외 요청은 예전과 같다.
const LOCALES = ['en', 'ko', 'ja'] as const;
const loc = (l: string): Loc => (LOCALES as readonly string[]).includes(l) ? (l as Loc) : 'en';

// 설명은 랜딩 카피(교육 성격)를 유지한다 — 스토어 스키마용 문구와 톤이 다르다.
const DESC: Record<Loc, string> = {
  ko: '매일 밤, 실제 시장 데이터로 배우는 3분 수사. 차트·기관·거시·뉴스를 퀴즈로 익힙니다. 투자 조언이 아닌 교육 콘텐츠입니다.',
  en: 'A 3-minute nightly investigation built on real market data. Learn charts, institutional flow, macro, and news reading through play. Education, not investment advice.',
  ja: '毎晩、実際の市場データで学ぶ3分の捜査。チャート・機関投資家・マクロ・ニュースの読み方をクイズで身につけます。投資助言ではなく教育コンテンツです。',
};

// 공유 미리보기 제목 — 원인만 묻는다(방향·예측 없음, WIM 준법 규칙)
const SHARE_Q: Record<Loc, (t: string) => string> = {
  ko: (t) => `${t}, 오늘 왜 움직였을까? — 30초 퀴즈`,
  en: (t) => `Why did ${t} move today? — a 30-second quiz`,
  ja: (t) => `${t}、今日なぜ動いた？ — 30秒クイズ`,
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const lc = loc(locale);
  const app = APPS.wim;
  const base = publicBase();
  const url = `${base}/${lc}/wim`;
  const title = app.name[lc];
  const desc = DESC[lc];
  const share = await readShareQuery();
  const tk = share.fromShare ? cleanTicker(share.get('t')) : null;
  const og = share.fromShare
    ? {
        title: tk ? `${SHARE_Q[lc](tk)} · Why'd It Move?` : COPY.wim[lc].title,
        description: COPY.wim[lc].desc,
        url: `${url}?${tk ? `t=${tk}&` : ''}from=share`,
        image: `${base}/api/og/app?app=wim&l=${lc}`,
      }
    : { title, description: desc, url, image: `${base}${app.image}` };
  return {
    title,
    description: desc,
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(LOCALES.map((x) => [x, `${base}/${x}/wim`])),
        'x-default': `${base}/en/wim`,
      },
    },
    openGraph: { title: og.title, description: og.description, url: og.url, type: 'website', images: [og.image] },
    twitter: { card: 'summary_large_image', title: og.title, description: og.description, images: [og.image] },
  };
}

export default async function WimLayout({
  children, params,
}: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lc = loc(locale);
  const jsonLd = appJsonLd(APPS.wim, lc, publicBase());
  const share = await readShareQuery();
  return (
    <>
      <PhLaunchBanner app="wim" locale={lc} />
      {share.fromShare && <ShareLanding app="wim" surface="wim" locale={lc} via={share.via} variant="bar" />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
