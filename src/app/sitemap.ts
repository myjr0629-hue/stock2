import type { MetadataRoute } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { FLOW_TICKERS } from '@/lib/seo/flowTickers';
import { CONCEPT_SLUGS } from '@/lib/seo/concepts';

// Programmatic sitemap. Starts with a curated set of high-search tickers for the
// /flow/[ticker] pages (expand later toward the full universe). Without this, Google
// had no way to discover these pages. `new Date()` is fine here (server route, not a
// workflow script). x-default + per-locale URLs help Google pick the right language.
const LOCALES = ['en', 'ko', 'ja'] as const;

// ⛔ 2026-08-20: '/wim' 이 빠져 있었다. 라이브 200 인데 sitemap 에 없어 3개 로케일 전부
//    검색엔진에 «존재하지 않는» 페이지였다. /app·/app-uc·/app-wim 은 404(리다이렉트 전용)라 넣지 않는다.
// '/tickers' = 595 티커 페이지의 허브. 이게 없으면 티커 페이지는 «고아»다.
const STATIC_PATHS = ['', '/undercurrent', '/wim', '/how-it-works', '/pricing', '/tickers', '/learn'];
// 개념 설명 6종 — 정보성 질의(dark pool, max pain …)를 겨냥하고,
// 동시에 595 티커 페이지가 링크하는 «개념 허브» 로 링크 그래프를 한 층 더 만든다.
const LEARN_PATHS = CONCEPT_SLUGS.map((c) => `/learn/${c}`);

// 티커 목록은 단일 진실원천에서 가져온다 (허브 페이지·상호링크와 공유)


export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicBase();
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const loc of LOCALES) {
    for (const p of STATIC_PATHS) {
      entries.push({
        url: `${base}/${loc}${p}`,
        lastModified: now,
        changeFrequency: p === '' ? 'daily' : 'weekly',
        priority: p === '' ? 0.9 : 0.6,
      });
    }
    for (const p of LEARN_PATHS) {
      entries.push({ url: `${base}/${loc}${p}`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 });
    }
    for (const t of FLOW_TICKERS) {
      entries.push({
        url: `${base}/${loc}/flow/${t}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
  }

  return entries;
}
