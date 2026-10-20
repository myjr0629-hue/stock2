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
      // Enumerate locale roots: robots '*' also crosses '/', blocking public guides.
      // Boundary forms cover the route itself, queries, and descendants independently.
      disallow: [
        '/api/', '/admin/',
        ...['', '/en', '/ko', '/ja'].flatMap((prefix) =>
          ['app-view', 'login', 'settings', 'dashboard', 'intel', 'intel-guardian',
            'quant-radar', 'watchlist', 'portfolio', 'ticker'].flatMap((route) => {
              const path = `${prefix}/${route}`;
              return [`${path}$`, `${path}?`, `${path}/`];
            }),
        ),
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    // AI 답변엔진용 안내(신흥 규약). robots.txt 가 «가지 마라»면 llms.txt 는
    // «여기를 봐라»다 — 인용은 참조 도메인이 2개뿐인 지금 링크만큼 값어치가 있다.
    host: base,
  };
}
