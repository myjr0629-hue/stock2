import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import PhLaunchBanner from '@/components/marketing/PhLaunchBanner';
import { ShareLanding } from '@/components/share/ShareLanding';
import { publicBase } from '@/lib/net/publicBase';
import { APPS, appJsonLd, type Loc } from '@/lib/seo/apps';
import { COPY } from '@/lib/marketing/linkPreview';
import { readShareQuery, cleanTicker } from '@/lib/share/shareQuery';

// UC 는 page.tsx 가 'use client' 라 메타데이터를 export 할 수 없다 → 레이아웃에서 준다.
//
// ★ 스마트앱배너(itunes.appId)가 여기 있는 이유 (2026-08-18 실측):
//   루트 layout.tsx 가 전 페이지에 SIGNUM(6783130444)을 박고 있어서,
//   /ko/undercurrent 를 아이폰 사파리로 연 사람에게 «엉뚱한 앱»을 권하고 있었다.
//   Next 는 하위 세그먼트의 metadata 로 덮어쓰므로 이 파일 하나면 UC 경로가 낫는다.
//
// ★ canonical/hreflang/OG 가 여기 있는 이유 (2026-08-22 실측):
//   제목·설명만 있고 canonical 도 hreflang 도 OG 도 없었다. 3개 로케일이
//   서로 중복 취급되고, 공유하면 카드가 안 뜨는 상태였다.
//
// ★ 공유 루프 (2026-09-29): 앱의 «이야기 공유»는 /<loc>/undercurrent?open=<티커>&from=share 로 온다.
//   그 요청에만 ① 미리보기 카드를 «그 종목 + UC 전용 카드»(/api/og/app)로 ② 맨 위에 설치 띠를 단다.
//   from=share 가 없는 요청(앱 셸·일반 방문)은 메타데이터도 화면도 예전과 같다.
const LOCALES = ['en', 'ko', 'ja'] as const;
const loc = (l: string): Loc => (LOCALES as readonly string[]).includes(l) ? (l as Loc) : 'en';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const lc = loc(locale);
  const app = APPS.undercurrent;
  const base = publicBase();
  const url = `${base}/${lc}/undercurrent`;
  const title = app.name[lc];
  const desc = app.desc[lc];
  // 공유 요청 전용 미리보기 — 제목에 종목, 이미지는 UC 카드(기본 og-brand.png 는 SIGNUM 그림이다).
  // og:url 도 공유 주소로 둔다: 페이스북 계열 스크래퍼는 og:url 을 다시 긁어 그 태그를 쓴다.
  const share = await readShareQuery();
  const tk = share.fromShare ? cleanTicker(share.get('open')) : null;
  const og = share.fromShare
    ? {
        title: tk ? `${tk} · ${COPY.uc[lc].title}` : COPY.uc[lc].title,
        description: COPY.uc[lc].desc,
        url: `${url}?${tk ? `open=${tk}&` : ''}from=share`,
        image: `${base}/api/og/app?app=uc&l=${lc}`,
      }
    : { title, description: desc, url, image: `${base}${app.image}` };
  return {
    title,
    description: desc,
    itunes: { appId: app.appleId },
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(LOCALES.map((x) => [x, `${base}/${x}/undercurrent`])),
        'x-default': `${base}/en/undercurrent`,
      },
      types: { 'application/rss+xml': [{ url: `/${lc}/feed.xml`, title }] },
    },
    openGraph: { title: og.title, description: og.description, url: og.url, type: 'website', images: [og.image] },
    twitter: { card: 'summary_large_image', title: og.title, description: og.description, images: [og.image] },
  };
}

export default async function UndercurrentLayout({
  children, params,
}: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lc = loc(locale);
  const jsonLd = appJsonLd(APPS.undercurrent, lc, publicBase());
  const share = await readShareQuery();
  return (
    <>
      <PhLaunchBanner app="undercurrent" locale={lc} />
      {share.fromShare && <ShareLanding app="uc" surface="uc" locale={lc} via={share.via} variant="bar" />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
