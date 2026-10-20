import { buildSitemap } from '@/lib/seo/sitemap';

export const dynamic = 'force-dynamic';

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
}[c]!));

/** Korean public URLs for manual submission to Naver Search Advisor. */
export async function GET() {
  const entries = await buildSitemap(['ko']);
  const urls = entries.map((entry) => {
    const lastmod = entry.lastModified instanceof Date ? entry.lastModified.toISOString() : entry.lastModified;
    return `<url><loc>${escapeXml(entry.url)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</url>`;
  }).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
