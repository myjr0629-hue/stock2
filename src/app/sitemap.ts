import type { MetadataRoute } from 'next';
import { publicBase } from '@/lib/net/publicBase';

// Programmatic sitemap. Starts with a curated set of high-search tickers for the
// /flow/[ticker] pages (expand later toward the full universe). Without this, Google
// had no way to discover these pages. `new Date()` is fine here (server route, not a
// workflow script). x-default + per-locale URLs help Google pick the right language.
const LOCALES = ['en', 'ko', 'ja'] as const;

// ⛔ 2026-08-20: '/wim' 이 빠져 있었다. 라이브 200 인데 sitemap 에 없어 3개 로케일 전부
//    검색엔진에 «존재하지 않는» 페이지였다. /app·/app-uc·/app-wim 은 404(리다이렉트 전용)라 넣지 않는다.
const STATIC_PATHS = ['', '/undercurrent', '/wim', '/how-it-works', '/pricing'];

// Curated high-search / high-attention, liquid + optioned US tickers (v2, ~165).
// All names that reliably have news + money data (avoids soft-404s). Expand toward
// the full universe later once indexing/traffic proves out.
const FLOW_TICKERS = [
  // mega / semis / tech
  'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'AVGO', 'ORCL',
  'CRM', 'ADBE', 'AMD', 'NFLX', 'INTC', 'QCOM', 'CSCO', 'TXN', 'IBM', 'MU',
  'AMAT', 'LRCX', 'KLAC', 'ADI', 'MRVL', 'ARM', 'SMCI', 'DELL', 'HPQ', 'PANW',
  'CRWD', 'SNOW', 'NOW', 'INTU', 'ANET', 'WDC', 'STX', 'ON', 'MCHP', 'NXPI',
  'ASML', 'TSM',
  // high-attention / growth / meme
  'PLTR', 'COIN', 'MARA', 'RIOT', 'MSTR', 'SOFI', 'HOOD', 'RIVN', 'LCID', 'NIO',
  'RBLX', 'U', 'DKNG', 'ABNB', 'UBER', 'LYFT', 'SHOP', 'PYPL', 'ROKU', 'PINS',
  'SNAP', 'DASH', 'AFRM', 'UPST', 'CVNA', 'GME', 'AMC', 'CHWY', 'F', 'GM',
  // financials
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'SCHW', 'BLK', 'V', 'MA', 'AXP', 'COF',
  // healthcare
  'LLY', 'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'TMO', 'ABT', 'BMY', 'MRNA',
  'AMGN', 'GILD', 'CVS', 'ISRG', 'VRTX', 'REGN',
  // consumer
  'WMT', 'COST', 'HD', 'LOW', 'NKE', 'SBUX', 'MCD', 'DIS', 'KO', 'PEP', 'PG',
  'TGT', 'CMG', 'LULU', 'BKNG',
  // energy / industrials
  'XOM', 'CVX', 'COP', 'OXY', 'SLB', 'BA', 'CAT', 'GE', 'HON', 'LMT', 'RTX',
  'DE', 'UPS', 'FDX', 'UNP',
  // clean / telecom / media / china / other
  'ENPH', 'FSLR', 'PLUG', 'CHPT', 'QS', 'T', 'VZ', 'TMUS', 'CMCSA', 'WBD',
  'BABA', 'JD', 'PDD', 'ZM', 'NET', 'DDOG', 'MDB',
  // ETFs (heavily optioned)
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'ARKK', 'SOXL', 'SOXX', 'SMH',
  'TQQQ', 'SQQQ', 'TLT', 'GLD', 'SLV', 'USO', 'XLE', 'XLF', 'XLK', 'XLV',
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
