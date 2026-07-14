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
import { getFromCache, setInCache } from '@/services/redisClient';
import {
  normLocale, buildSystem, storyPayload, invokeJSON, enforceLanguage, serveSWR,
} from '../shared';
import { getFreshCore } from '../feedCore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FEED_TTL_SEC = 15 * 60;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const loc = normLocale(searchParams.get('locale'));
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '12', 10) || 12, 1), 16);
  const skipCache = searchParams.get('refresh') === '1';
  const cacheKey = `undercurrent:feed:v8:${loc}`; // v8: flush feeds built from the poisoned empty-money core (2026-07-14)

  // SWR: a normal request never blocks on generation — stale is served instantly and
  // the client triggers a refresh=1 regeneration. Only an empty cache generates inline.
  const generate = async () => {
    // 1+2) locale-independent core: curated news + money overlay, built ONCE and
    // shared across ko/en/ja (see feedCore.ts). A stale core block-refreshes there.
    const core = await getFreshCore(origin);
    const stories = core.stories.slice(0, limit);

    // AI-skip: identical core (same stories, same money numbers) ⇒ the previous
    // localization is still the right output — re-serve it as fresh instead of
    // burning an AI call. Fires on quiet cycles (nights/weekends), never during
    // active markets (prices move ⇒ sig changes).
    const prev = await getFromCache<any>(cacheKey).catch(() => null);
    if (prev?._coreSig && prev._coreSig === core.sig && Array.isArray(prev.cards) && prev.cards.length) {
      return { ...prev }; // serveSWR re-stamps generatedAt
    }

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

    // 4) merge AI verdicts + core metadata; only trust divergence when money was real
    const cards = stories.map((s, i) => {
      const a = aiCards[i] || {};
      const real = s.hasMoneyData;
      return {
        ticker: s.ticker,
        tag: a.tag || null,
        plainTitle: a.plainTitle || s.title,
        whyItMatters: a.whyItMatters || null,
        moneyRead: real ? a.moneyRead || null : null,
        moneyMood: real ? a.moneyMood || 'neutral' : 'neutral',
        divergence: real ? Boolean(a.divergence) : false,
        hasMoneyData: real,
        money: s.money,
        newsSentiment: s.newsSentiment || null,
        image: s.image,
        source: s.source,
        url: s.url,
        publishedAt: s.publishedAt,
      };
    });

    // 4.5) language guard — translate any field the model left in English
    // (titles leak through even with the system rule; body text rarely does)
    await enforceLanguage(loc, cards, ['plainTitle', 'whyItMatters', 'moneyRead', 'tag']);

    // 5) feed-level pulse — the glanceable market mood (lock-in: re-check it)
    const pulse = {
      bullish: cards.filter((c) => c.moneyMood === 'bullish').length,
      cautious: cards.filter((c) => c.moneyMood === 'cautious').length,
      neutral: cards.filter((c) => c.moneyMood === 'neutral').length,
      divergences: cards.filter((c) => c.divergence).length,
    };

    // [SCOREBOARD] Persist today's divergence signals so the scoreboard can
    // resolve them at D+3 close ("그때 돈이 맞았나") — the app's trust loop.
    // Deduped by (ticker, ET date) across locales; capped at 200 signals.
    try {
      const divs = cards.filter((c) => c.divergence && c.money?.price);
      if (divs.length) {
        const KEY = 'undercurrent:scoreboard:signals:v1';
        const doc = (await getFromCache<any[]>(KEY)) || [];
        const dateET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        let changed = false;
        for (const c of divs) {
          if (doc.some((s) => s.ticker === c.ticker && s.dateET === dateET)) continue;
          doc.push({
            ticker: c.ticker, dateET, mood: c.moneyMood,
            newsSentiment: c.newsSentiment || null,
            priceAtSignal: c.money.price, title: c.plainTitle || '',
            resolved: false,
          });
          changed = true;
        }
        if (changed) await setInCache(KEY, doc.slice(-200), 60 * 60 * 24 * 45);
      }
    } catch { /* non-critical */ }

    // _coreSig powers the AI-skip above (never rendered by the client)
    return { success: true, locale: loc, count: cards.length, pulse, cards, _coreSig: core.sig };
  };

  try {
    const res = await serveSWR({ key: cacheKey, freshSec: FEED_TTL_SEC, refresh: skipCache, generate });
    if (!res) return NextResponse.json({ success: false, error: 'unavailable', cards: [] }, { status: 503 });
    return NextResponse.json({ ...res.body, _cached: true, _stale: res.stale });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed', cards: [] }, { status: 500 });
  }
}
