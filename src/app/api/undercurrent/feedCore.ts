// ============================================================================
// Undercurrent feed CORE — the locale-INDEPENDENT half of the feed pipeline.
// ----------------------------------------------------------------------------
// News selection + per-ticker money overlay are identical for ko/en/ja; only
// the AI prose differs. Before this module the FULL pipeline (news + 12-18
// money fetches + AI) ran per locale ×3. Now the core is built ONCE, cached in
// Redis, and shared by all three locale generations (§ cost/staleness ÷3, and
// en/ja are exactly as fresh as ko).
//
// Also owns CURATION (the "풍성함" fix): instead of first-12-by-recency —
// which on PR-heavy nights yields 12 unknown microcaps with zero options/
// dark-pool coverage (→ empty 큰손/괴리 tabs) — we rank candidates by
// (has real money data) then (well-known name), recency as tiebreak.
//
// getFreshCore() semantics differ from serveSWR on purpose: callers are
// GENERATORS (they run under the locale key's own SWR), so a *stale* core must
// BLOCK-refresh here — serving a 5h-old core stamped with a fresh generatedAt
// would silently relabel old news as new. Single-flight lock + poll keeps the
// 3-locale warm cycle to ONE core build.
// ============================================================================

import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache, deleteFromCache } from '@/services/redisClient';
import {
  isSpam, primaryTicker, fetchMoney, hasRealMoney, cleanImage,
  type NewsItem, type MoneyData,
} from './shared';

const CORE_KEY = 'undercurrent:feedcore:v2'; // v2: flush cores poisoned by the empty-money self-call bug (2026-07-14)
const CORE_FRESH_SEC = 15 * 60;         // same freshness contract as the feed
const CORE_PHYSICAL_SEC = 6 * 60 * 60;  // keep last-known-good far past freshness
const PICK = 12;                        // stories in the core (client always asks 12)
const MONEY_PROBE = 20;                 // candidates probed for money data (parallel)
const MONEY_TIMEOUT_MS = 12_000;        // internal route, Redis-warmed upstream — don't let one slow ticker stall the core

// Issue/household names — same rationale as WIM: the hook is "a stock you KNOW
// did something", and famous names are also where options/dark-pool coverage
// (→ 큰손/괴리 material) actually exists. Kept UC-local on purpose: route files
// can't export extras, and UC must not couple to WIM internals.
const WELL_KNOWN = new Set([
  'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'AVGO', 'AMD',
  'PLTR', 'COIN', 'MSTR', 'SMCI', 'INTC', 'MU', 'QCOM', 'ORCL', 'CRM', 'NFLX',
  'DIS', 'BA', 'JPM', 'GS', 'BAC', 'MS', 'WMT', 'COST', 'TGT', 'NKE', 'SBUX',
  'MCD', 'KO', 'PEP', 'PFE', 'MRNA', 'LLY', 'UNH', 'XOM', 'CVX', 'OXY', 'F',
  'GM', 'RIVN', 'LCID', 'UBER', 'LYFT', 'ABNB', 'DASH', 'SHOP', 'SQ', 'PYPL',
  'SOFI', 'HOOD', 'RBLX', 'SNAP', 'PINS', 'SPOT', 'ARM', 'TSM', 'BABA', 'NIO',
  'JD', 'PDD', 'GME', 'AMC', 'CVNA', 'DKNG', 'CELH', 'ANET', 'ADBE', 'NOW',
  'SNOW', 'CRWD', 'PANW', 'NET', 'DDOG', 'MDB', 'ZS', 'TXN', 'AMAT', 'LRCX',
  'KLAC', 'ASML', 'IBM', 'CSCO', 'T', 'VZ', 'CMCSA', 'V', 'MA', 'AXP', 'CAT',
  'DE', 'GE', 'LMT', 'RTX', 'NOC', 'HON', 'UPS', 'FDX', 'DAL', 'UAL', 'AAL',
  'SPY', 'QQQ', 'IWM', 'DIA', 'SOXL', 'TQQQ', 'SQQQ',
]);

export interface CoreStory {
  ticker: string;
  title: string;
  description?: string;
  newsSentiment: string | null;
  money: MoneyData;
  hasMoneyData: boolean;
  wellKnown: boolean;
  image: string | null;
  source: string | null;
  url: string | null;
  publishedAt: string | null;
}

export interface FeedCore {
  generatedAt?: string; // stamped on write
  sig: string;          // content identity — lets locale generations SKIP the AI call when nothing changed
  stories: CoreStory[];
}

function coreAgeSec(c: FeedCore | null | undefined): number {
  const ms = c?.generatedAt ? Date.parse(c.generatedAt) : NaN;
  return Number.isFinite(ms) ? (Date.now() - ms) / 1000 : Infinity;
}

// ── build (news → curate → money overlay) ───────────────────────────────────
async function buildCore(origin: string): Promise<FeedCore> {
  const news = await fetchMassive(
    '/v2/reference/news',
    { limit: '80', order: 'desc', sort: 'published_utc' },
    false,
    undefined,
    { cache: 'no-store' as RequestCache },
  );
  const results: NewsItem[] = news?.results || [];

  // spam filter → one story per ticker (results arrive newest-first, so the
  // first item kept per ticker is that ticker's freshest story)
  const seen = new Set<string>();
  const candidates: { item: NewsItem; ticker: string; idx: number }[] = [];
  for (const item of results) {
    if (isSpam(item)) continue;
    const t = primaryTicker(item);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    candidates.push({ item, ticker: t, idx: candidates.length });
  }
  if (candidates.length === 0) {
    // transient (wire flooded by spam) — throw so callers keep last good core
    throw new Error('no usable news after spam filter');
  }

  // curation pass 1 — famous names float up BEFORE the money probe so the
  // probe budget is spent where coverage exists (recency preserved within tiers)
  const probeList = [...candidates]
    .sort((a, b) => {
      const aw = WELL_KNOWN.has(a.ticker) ? 0 : 1;
      const bw = WELL_KNOWN.has(b.ticker) ? 0 : 1;
      return aw - bw || a.idx - b.idx;
    })
    .slice(0, MONEY_PROBE);

  const money = await Promise.all(
    probeList.map((c) => fetchMoney(origin, c.ticker, MONEY_TIMEOUT_MS)),
  );

  // curation pass 2 — final rank: real money data (큰손/괴리 material) beats
  // fame, fame beats neither; recency breaks ties. Then take the top PICK.
  const ranked = probeList
    .map((c, i) => ({ c, m: money[i], score: (hasRealMoney(money[i]) ? 2 : 0) + (WELL_KNOWN.has(c.ticker) ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.c.idx - b.c.idx)
    .slice(0, PICK);

  const stories: CoreStory[] = ranked.map(({ c, m }) => {
    const ins = (c.item.insights || []).find((x) => x.ticker === c.ticker);
    return {
      ticker: c.ticker,
      title: c.item.title,
      description: c.item.description,
      newsSentiment: ins?.sentiment || null,
      money: m,
      hasMoneyData: hasRealMoney(m),
      wellKnown: WELL_KNOWN.has(c.ticker),
      image: cleanImage(c.item.image_url),
      source: c.item.publisher?.name || null,
      url: c.item.article_url || null,
      publishedAt: c.item.published_utc || null,
    };
  });

  // content signature: same stories + same money numbers ⇒ a locale re-run would
  // produce the same prose, so callers can skip the AI call (nights/weekends the
  // wire is quiet AND prices are frozen — this zeroes those cycles' AI cost).
  const sig = stories
    .map((s) => `${s.ticker}:${s.publishedAt}:${s.money.price}:${s.money.volumePcr}:${s.money.darkPoolPct}`)
    .join('|');

  return { sig, stories };
}

// ── fresh-or-block accessor (single-flight) ──────────────────────────────────
// Fresh cached core → instant. Stale/missing → regenerate under a best-effort
// lock; contenders POLL for the holder's FRESH write (up to ~30s > build time),
// then fall back to the stale copy (annotated staleness is the caller's SWR
// layer's job) and only throw when there is truly nothing.
export async function getFreshCore(origin: string): Promise<FeedCore> {
  const cached = await getFromCache<FeedCore>(CORE_KEY).catch(() => null);
  if (cached && coreAgeSec(cached) < CORE_FRESH_SEC) return cached;

  const lockKey = `${CORE_KEY}:swrlock`;
  const held = await getFromCache<number>(lockKey).catch(() => null);
  if (held) {
    // someone else is building — wait for their FRESH write
    for (let i = 0; i < 20; i++) {                      // 20 × 1.5s = 30s (> build, < route maxDuration 60)
      await new Promise((r) => setTimeout(r, 1500));
      const c2 = await getFromCache<FeedCore>(CORE_KEY).catch(() => null);
      if (c2 && coreAgeSec(c2) < CORE_FRESH_SEC) return c2;
    }
    if (cached) return cached; // holder died/slow — last good beats nothing
    throw new Error('feed core unavailable (lock contention, no cache)');
  }

  await setInCache(lockKey, Date.now(), 90).catch(() => {});
  try {
    const fresh = await buildCore(origin);
    fresh.generatedAt = new Date().toISOString();
    await setInCache(CORE_KEY, fresh, CORE_PHYSICAL_SEC).catch(() => {});
    return fresh;
  } catch (e) {
    if (cached) return cached; // build failed — serve last good, feed stays alive
    throw e;
  } finally {
    await deleteFromCache(lockKey).catch(() => {});
  }
}
