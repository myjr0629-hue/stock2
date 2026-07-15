import type { MetadataRoute } from 'next';
import { publicBase } from '@/lib/net/publicBase';

// Programmatic sitemap. Starts with a curated set of high-search tickers for the
// /flow/[ticker] pages (expand later toward the full universe). Without this, Google
// had no way to discover these pages. `new Date()` is fine here (server route, not a
// workflow script). x-default + per-locale URLs help Google pick the right language.
const LOCALES = ['en', 'ko', 'ja'] as const;

const STATIC_PATHS = ['', '/undercurrent', '/how-it-works', '/pricing'];

// Curated high-search / high-attention tickers (v1). Expand programmatically later.
const FLOW_TICKERS = [
  'NVDA', 'TSLA', 'AAPL', 'AMD', 'MSFT', 'GOOGL', 'META', 'AMZN', 'AVGO', 'MU',
  'SPY', 'QQQ', 'NFLX', 'PLTR', 'SMCI', 'COIN', 'SOFI', 'INTC', 'CRM', 'ORCL',
  'ADBE', 'QCOM', 'ARM', 'DELL', 'MARA', 'SOXL', 'TQQQ', 'IWM', 'GLD', 'TLT',
];

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
