// ============================================================================
// Undercurrent (spin-off prototype) — ticker lookup: news × money for ONE ticker
// ----------------------------------------------------------------------------
// PROTOTYPE, ISOLATED. GET /api/undercurrent/ticker?t=NVDA&locale=ko
// Returns: the ticker's money snapshot + an AI "tickerRead" (what the money is
// doing on this name right now, plain language) + its recent news as cards
// (same shape as the feed). Redis-cached per ticker+locale (10 min).
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import {
  normLocale, isSpam, fetchMoney, hasRealMoney, buildSystem, storyPayload,
  invokeJSON, TICKER_RE, type NewsItem,
} from '../shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_SEC = 10 * 60;
const MAX_STORIES = 5;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const loc = normLocale(searchParams.get('locale'));
  const ticker = (searchParams.get('t') || '').trim().toUpperCase();

  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json({ success: false, error: 'invalid ticker' }, { status: 400 });
  }

  const cacheKey = `undercurrent:ticker:v1:${ticker}:${loc}`;
  try {
    const cached = await getFromCache<any>(cacheKey).catch(() => null);
    if (cached?.success) {
      return NextResponse.json({ ...cached, _cached: true });
    }

    // 1) this ticker's news + our money data, in parallel
    const [news, money] = await Promise.all([
      fetchMassive(
        '/v2/reference/news',
        { ticker, limit: '15', order: 'desc', sort: 'published_utc' },
        false,
        undefined,
        { cache: 'no-store' as RequestCache },
      ).catch(() => null),
      fetchMoney(origin, ticker),
    ]);

    const items: NewsItem[] = (news?.results || []).filter((n: NewsItem) => !isSpam(n)).slice(0, MAX_STORIES);
    const real = hasRealMoney(money);

    // 2) AI: overall tickerRead + per-story cards (single call)
    const stories = items.map((item) => {
      const ins = (item.insights || []).find((x) => x.ticker === ticker);
      return {
        ticker,
        title: item.title,
        description: item.description,
        newsSentiment: ins?.sentiment,
        money,
      };
    });

    let tickerRead: string | null = null;
    let aiCards: any[] = [];
    if (stories.length > 0 || real) {
      const user = `Return {"tickerRead": "...", "cards":[...]}.
- "tickerRead": 1-2 plain sentences summarizing what the MONEY signals show for ${ticker} RIGHT NOW (grounded only in the money numbers; honest if mixed/weak).
- "cards": one per story IN ORDER (may be empty array if no stories):
{
 "plainTitle": "<short accessible rewrite of the headline>",
 "whyItMatters": "<one plain sentence why an ordinary person should care>",
 "moneyRead": "<one plain sentence: this story vs the money signals>",
 "moneyMood": "bullish|cautious|neutral",
 "divergence": true|false,
 "tag": "<1-2 word theme>"
}

MONEY (current, for ${ticker}): ${JSON.stringify(money)}

STORIES:
${storyPayload(stories)}`;
      try {
        const parsed = await invokeJSON(buildSystem(loc), user);
        tickerRead = typeof parsed?.tickerRead === 'string' ? parsed.tickerRead : null;
        aiCards = parsed?.cards || [];
      } catch { /* keep nulls — page still renders raw signals */ }
    }

    const cards = items.map((item, i) => {
      const a = aiCards[i] || {};
      return {
        ticker,
        tag: a.tag || null,
        plainTitle: a.plainTitle || item.title,
        whyItMatters: a.whyItMatters || null,
        moneyRead: real ? a.moneyRead || null : null,
        moneyMood: real ? a.moneyMood || 'neutral' : 'neutral',
        divergence: real ? Boolean(a.divergence) : false,
        hasMoneyData: real,
        money,
        newsSentiment: stories[i]?.newsSentiment || null,
        image: item.image_url || null,
        source: item.publisher?.name || null,
        url: item.article_url || null,
        publishedAt: item.published_utc || null,
      };
    });

    const payload = {
      success: true,
      locale: loc,
      ticker,
      money,
      hasMoneyData: real,
      tickerRead: real ? tickerRead : null,
      count: cards.length,
      cards,
      generatedAt: new Date().toISOString(),
    };
    setInCache(cacheKey, payload, TTL_SEC).catch(() => {});
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
