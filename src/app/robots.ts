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
      disallow: ['/api/', '/admin/', '/app-view/', '/login', '/settings'],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
