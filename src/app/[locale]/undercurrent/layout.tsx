import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import PhLaunchBanner from '@/components/marketing/PhLaunchBanner';
import { publicBase } from '@/lib/net/publicBase';
import { APPS, appJsonLd, type Loc } from '@/lib/seo/apps';

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
    openGraph: { title, description: desc, url, type: 'website', images: [`${base}${app.image}`] },
    twitter: { card: 'summary_large_image', title, description: desc, images: [`${base}${app.image}`] },
  };
}

export default async function UndercurrentLayout({
  children, params,
}: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lc = loc(locale);
  const jsonLd = appJsonLd(APPS.undercurrent, lc, publicBase());
  return (
    <>
      <PhLaunchBanner app="undercurrent" locale={lc} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
