import { buildSitemap } from '@/lib/seo/sitemap';

export const dynamic = 'force-dynamic';

export default async function sitemap() {
  return buildSitemap();
}
