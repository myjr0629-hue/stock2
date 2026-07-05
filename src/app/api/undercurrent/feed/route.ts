// ============================================================================
// Undercurrent (spin-off prototype) — news × money feed  [v4]
// ----------------------------------------------------------------------------
// PROTOTYPE, ISOLATED (touches no existing SIGNUM code). news → per-ticker
// money overlay → Bedrock compares news tone vs money → plain-language cards +
// divergence + feed pulse. v4: Redis-cached per locale (instant loads while
// browsing; Bedrock at most once per TTL) + more stories (12, max 16).
// GET /api/undercurrent/feed?locale=ko[&limit=12][&refresh=1]
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import {
  normLocale, isSpam, primaryTicker, fetchMoney, hasRealMoney,
  buildSystem, storyPayload, invokeJSON, type NewsItem,
} from '../shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FEED_TTL_SEC = 15 * 60;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const loc = normLocale(searchParams.get('locale'));
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '12', 10) || 12, 1), 16);
  const skipCache = searchParams.get('refresh') === '1';
  const cacheKey = `undercurrent:feed:v4:${loc}`;

  try {
    if (!skipCache) {
      const cached = await getFromCache<any>(cacheKey).catch(() => null);
      if (cached?.cards?.length) {
        return NextResponse.json({ ...cached, _cached: true });
      }
    }

    // 1) recent market news (tickers + per-ticker sentiment + image built-in)
    const news = await fetchMassive(
      '/v2/reference/news',
      { limit: '80', order: 'desc', sort: 'published_utc' },
      false,
      undefined,
      { cache: 'no-store' as RequestCache },
    );
    const results: NewsItem[] = news?.results || [];

    // spam filter → one story per ticker (variety across tickers)
    const seen = new Set<string>();
    const picked: { item: NewsItem; ticker: string }[] = [];
    for (const item of results) {
      if (isSpam(item)) continue;
      const t = primaryTicker(item);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      picked.push({ item, ticker: t });
      if (picked.length >= limit) break;
    }
    if (picked.length === 0) {
      return NextResponse.json({ success: false, error: 'no usable news after spam filter', cards: [] });
    }

    // 2) overlay OUR per-ticker money data (parallel; Redis-cached upstream)
    const money = await Promise.all(picked.map((p) => fetchMoney(origin, p.ticker)));

    const stories = picked.map((p, i) => {
      const ins = (p.item.insights || []).find((x) => x.ticker === p.ticker);
      return {
        ticker: p.ticker,
        title: p.item.title,
        description: p.item.description,
        newsSentiment: ins?.sentiment,
        money: money[i],
      };
    });

    // 3) AI compares news vs money
    const user = `Return {"cards":[...]} — one card per story IN ORDER:
{
 "plainTitle": "<short accessible rewrite of the headline>",
 "whyItMatters": "<one plain sentence why an ordinary person should care>",
 "moneyRead": "<one plain sentence on what the money signals show>",
 "moneyMood": "bullish|cautious|neutral",
 "divergence": true|false,
 "tag": "<1-2 word theme>"
}

STORIES:
${storyPayload(stories)}`;
    const parsed = await invokeJSON(buildSystem(loc), user);
    const aiCards: any[] = parsed?.cards || [];

    // 4) merge AI verdicts + metadata; only trust divergence when money was real
    const cards = picked.map((p, i) => {
      const a = aiCards[i] || {};
      const real = hasRealMoney(money[i]);
      return {
        ticker: p.ticker,
        tag: a.tag || null,
        plainTitle: a.plainTitle || p.item.title,
        whyItMatters: a.whyItMatters || null,
        moneyRead: real ? a.moneyRead || null : null,
        moneyMood: real ? a.moneyMood || 'neutral' : 'neutral',
        divergence: real ? Boolean(a.divergence) : false,
        hasMoneyData: real,
        money: money[i],
        newsSentiment: stories[i].newsSentiment || null,
        image: p.item.image_url || null,
        source: p.item.publisher?.name || null,
        url: p.item.article_url || null,
        publishedAt: p.item.published_utc || null,
      };
    });

    // 5) feed-level pulse — the glanceable market mood (lock-in: re-check it)
    const pulse = {
      bullish: cards.filter((c) => c.moneyMood === 'bullish').length,
      cautious: cards.filter((c) => c.moneyMood === 'cautious').length,
      neutral: cards.filter((c) => c.moneyMood === 'neutral').length,
      divergences: cards.filter((c) => c.divergence).length,
    };

    const payload = { success: true, locale: loc, count: cards.length, generatedAt: new Date().toISOString(), pulse, cards };
    setInCache(cacheKey, payload, FEED_TTL_SEC).catch(() => {});
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
