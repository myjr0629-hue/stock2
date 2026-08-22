import type { MetadataRoute } from 'next';
import { publicBase } from '@/lib/net/publicBase';

// Tell crawlers the site is open and where the sitemap is. (None existed before —
// which is why programmatic pages weren't being discovered.) Keep API/admin/app-shell
// out of the index; content pages (incl. /flow/[ticker]) are crawlable.
export default function robots(): MetadataRoute.Robots {
  const base = publicBase();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // ⛔ 2026-08-22 실측: 아래 패턴들이 «로케일 프리픽스»를 못 덮고 있었다.
      //   Disallow: /app-view/  는 /app-view/ 만 막고 실제 경로인 /en/app-view/ 는 못 막는다.
      //   그래서 앱 화면 전체(/en/app-view/dash 등)와 /ko/login, /ja/settings 가
      //   Googlebot 에 200 으로 열려 있었다 — 크롤 예산 낭비이자 저품질 색인 위험이다.
      //   next-intl 이 모든 실경로에 /{locale} 을 붙이므로 와일드카드가 필요하다.
      disallow: [
        '/api/', '/admin/',
        '/app-view/', '/*/app-view/',
        '/login', '/*/login',
        '/settings', '/*/settings',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
