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
  isSpam, primaryTicker, fetchMoney, hasRealMoney, cleanImage, fetchOptionsOpening,
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
  // ★ [2026-08-30] 티커를 «명시해서» 부른다.
  //
  //   예전엔 티커 없이 일반 뉴스를 받았다. Massive 는 일반 뉴스에도
  //   `tickers` 배열을 채워 줬지만, 이관한 FMP 의 general-latest 는
  //   **symbol 이 null** 이다(실측). UC 는 «뉴스 → 티커 → 그 종목의 돈»
  //   구조라 티커가 없으면 primaryTicker 가 전부 null 이 되고,
  //   candidates 가 0건이 되어 `no usable news after spam filter` 로 throw 한다.
  //   → 앱이 «unavailable» 만 반환하고 **피드가 통째로 비었다.**
  //
  //   FMP 는 다종목을 1콜로 받을 수 있고 그 응답엔 symbol 이 채워진다.
  //   UC 가 어차피 잘 알려진 종목 위주로 큐레이션하므로 WELL_KNOWN 을 넘긴다.
  //   (가디언 뉴스펄스는 시장 전반을 원하므로 일반 뉴스 그대로 둔다 —
  //    거기선 티커가 필요 없다)
  const symbols = [...WELL_KNOWN].join(',');
  const news = await fetchMassive(
    '/v2/reference/news',
    { ticker: symbols, limit: '120', order: 'desc', sort: 'published_utc' },
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

  // 옵션 신규 포지션은 **전 종목이 한 키**에 있으므로 1콜로 받아 병합한다.
  //   종목당 호출하던 다크풀과 달리 호출 예산을 거의 쓰지 않는다.
  const [money0, opening] = await Promise.all([
    Promise.all(probeList.map((c) => fetchMoney(origin, c.ticker, MONEY_TIMEOUT_MS))),
    fetchOptionsOpening(origin),
  ]);
  const money = money0;

  // ⚠️ 1차 프로브는 «20개 동시 + 12초» 다. /api/live/ticker 는 옵션 체인을
  //    포함한 무거운 경로라, 캐시가 식은 시각(주말 새벽 등)엔 여러 개가
  //    통째로 타임아웃해 **전 필드 null** 로 돌아온다. 실측(2026-08-30):
  //      웜 상태 20개 → 완전 17 · 부분 1 · 타임아웃 2
  //      콜드 생성분 → 12장 중 10장이 oiPcr/volumePcr/squeeze/price 전부 null
  //    1차에서 비어 온 것만 다시 부른다. 1차가 캐시를 데워 놨으므로
  //    2차는 거의 다 성공하고, 비용은 «실패한 개수»만큼이다.
  const retryIdx = probeList
    .map((_, i) => i)
    .filter((i) => money[i].oiPcr === null && money[i].volumePcr === null && money[i].price === null);
  if (retryIdx.length) {
    const again = await Promise.all(
      retryIdx.map((i) => fetchMoney(origin, probeList[i].ticker, MONEY_TIMEOUT_MS))
    );
    retryIdx.forEach((i, k) => {
      const r = again[k];
      // 필드 단위로 «있는 것만» 채운다 — 2차가 더 나쁘면 1차를 덮지 않는다
      (Object.keys(r) as (keyof typeof r)[]).forEach((key) => {
        if (money[i][key] === null && r[key] !== null) (money[i] as any)[key] = r[key];
      });
    });
  }
  probeList.forEach((c, i) => {
    const o = opening.byTicker[c.ticker];
    if (!o) return;
    money[i].newOiContracts = o.contracts;
    money[i].newOiNotional = o.notional;
    money[i].newOiSide = o.side;
    money[i].optionsDate = opening.date;
  });

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
    // 서명에서 darkPoolPct 를 뺀다 — 항상 null 이라 «변화 감지»에 기여하지 않고,
    // 대신 신규 포지션이 바뀌면 AI 를 다시 돌려야 한다
    .map((s) => `${s.ticker}:${s.publishedAt}:${s.money.price}:${s.money.volumePcr}:${s.money.newOiContracts}`)
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
