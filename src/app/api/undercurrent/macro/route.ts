// ============================================================================
// Undercurrent (spin-off prototype) — MACRO: the big picture that shakes markets
// ----------------------------------------------------------------------------
// PROTOTYPE, ISOLATED. GET /api/undercurrent/macro?locale=ko
// Macro/geopolitical breaking news (FMP general news; Polygon keyword fallback)
// fused with OUR market-wide money context (10Y treasury, FedWatch probabilities,
// fear & greed) → AI writes a plain-language "macroRead" + per-story market-impact
// cards (risk-on / risk-off / mixed). Redis-cached per locale (12 min).
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache } from '@/services/redisClient';
import { normLocale, isSpam, invokeJSON, langName, cleanImage, enforceLanguage, serveSWR, type NewsItem, type Locale } from '../shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_SEC = 12 * 60;
const MAX_STORIES = 8;

const MACRO_KEYWORD_RE = /fed|fomc|rate|inflation|cpi|ppi|jobs|payroll|unemployment|treasury|yield|opec|oil|crude|tariff|trade war|china|geopolit|sanction|war|ukraine|middle east|election|shutdown|debt ceiling|dollar|recession/i;

interface FmpNews {
  title?: string; text?: string; image?: string; url?: string;
  publishedDate?: string; site?: string;
}

function fmpDateToIso(d?: string): string | null {
  if (!d) return null;
  // FMP "YYYY-MM-DD HH:mm:ss" (ET-ish) → treat as UTC for relative freshness (proto tolerance)
  const iso = d.includes('T') ? d : `${d.replace(' ', 'T')}Z`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const loc: Locale = normLocale(searchParams.get('locale'));
  const skipCache = searchParams.get('refresh') === '1';
  const cacheKey = `undercurrent:macro:v4:${loc}`;

  // SWR: normal requests serve cache instantly (stale ok); client triggers refresh=1.
  const generate = async () => {
    // 1) macro news (FMP general) + OUR market-wide money context, in parallel
    const fmpKey = process.env.FMP_API_KEY;
    const [fmpRes, treasuryRes, fedRes, fearGreed] = await Promise.all([
      fmpKey
        ? fetch(`https://financialmodelingprep.com/stable/news/general-latest?limit=20&apikey=${fmpKey}`, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
      fetch(`${origin}/api/live/treasury`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${origin}/api/guardian/fedwatch`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      getFromCache<{ score: number; rating: string }>('cnn:feargreed').catch(() => null),
    ]);

    // normalize macro stories: FMP primary, Polygon macro-keyword fallback
    let stories: { title: string; description: string; image: string | null; url: string | null; publishedAt: string | null; source: string | null }[] = [];
    if (Array.isArray(fmpRes) && fmpRes.length > 0) {
      stories = (fmpRes as FmpNews[])
        .filter((n) => n.title && !isSpam({ title: n.title || '', description: n.text || '' } as NewsItem))
        .slice(0, MAX_STORIES)
        .map((n) => ({
          title: n.title || '',
          description: (n.text || '').slice(0, 300),
          image: cleanImage(n.image),
          url: n.url || null,
          publishedAt: fmpDateToIso(n.publishedDate),
          source: n.site || null,
        }));
    }
    if (stories.length === 0) {
      const poly = await fetchMassive(
        '/v2/reference/news',
        { limit: '80', order: 'desc', sort: 'published_utc' },
        false, undefined, { cache: 'no-store' as RequestCache },
      ).catch(() => null);
      stories = ((poly?.results || []) as NewsItem[])
        .filter((n) => !isSpam(n) && MACRO_KEYWORD_RE.test(`${n.title} ${n.description || ''}`))
        .slice(0, MAX_STORIES)
        .map((n) => ({
          title: n.title,
          description: (n.description || '').slice(0, 300),
          image: cleanImage(n.image_url),
          url: n.article_url || null,
          publishedAt: n.published_utc || null,
          source: n.publisher?.name || null,
        }));
    }

    const context = {
      yield10Y: typeof treasuryRes?.yield10Y === 'number' ? treasuryRes.yield10Y : null,
      yield10YChange: typeof treasuryRes?.change === 'number' ? treasuryRes.change : null,
      fedNoChange: typeof fedRes?.noChange === 'number' ? fedRes.noChange : null,
      fedHike: typeof fedRes?.hike === 'number' ? fedRes.hike : null,
      fedEase: typeof fedRes?.ease === 'number' ? fedRes.ease : null,
      daysUntilFomc: typeof fedRes?.daysUntilFomc === 'number' ? fedRes.daysUntilFomc : null,
      fearGreed: typeof fearGreed?.score === 'number' ? fearGreed.score : null,
      fearGreedRating: fearGreed?.rating || null,
    };

    // 2) AI: macroRead + per-story market-impact cards (single call)
    let macroRead: string | null = null;
    let aiCards: any[] = [];
    if (stories.length > 0) {
      const system = `You write the MACRO section of "Undercurrent", a premium general-audience market app. Job: explain how macro/geopolitical news is shaking (or could shake) the MARKET, fused with the CURRENT market-money context provided.

CONTEXT SIGNALS (read precisely, mention only what's given):
- 10Y treasury yield (+change): rising = tightening pressure / risk-off tilt for stocks; falling = easing.
- Fed probabilities (noChange/hike/ease %, days to FOMC): what rate path the market is pricing.
- Fear & Greed (0-100): <30 fear, >70 greed.

RULES:
- Write in ${langName[loc]}.
- EVERY output field INCLUDING plainTitle must be written in ${langName[loc]}. Headlines usually arrive in English — TRANSLATE them; NEVER copy the original English wording.
- Plain language for ordinary people; no jargon. Describe, NEVER advise; no predictions beyond what the numbers imply as positioning.
- macroRead: 1-2 sentences on the CURRENT macro-money backdrop, grounded ONLY in the context numbers.
- Per story: "marketImpact" = 'risk-on' | 'risk-off' | 'mixed' (how this news leans for risk assets), "impactNote" = one plain sentence WHY it moves markets / what it touches (rates, oil, supply chains…). Honest 'mixed' when unclear.
- Output STRICT JSON only.`;

      const user = `Return {"macroRead":"...","cards":[...]} — one card per story IN ORDER:
{"plainTitle":"<short accessible rewrite>","whyItMatters":"<one plain sentence for an ordinary person>","marketImpact":"risk-on|risk-off|mixed","impactNote":"<one plain sentence: why/how this shakes markets>","tag":"<1-2 word theme IN ${langName[loc]}, e.g. rates/geopolitics/commodities/trade>"}

MARKET CONTEXT: ${JSON.stringify(context)}

STORIES:
${JSON.stringify(stories.map((s, i) => ({ n: i + 1, headline: s.title, summary: s.description })))}`;

      try {
        const parsed = await invokeJSON(system, user);
        macroRead = typeof parsed?.macroRead === 'string' ? parsed.macroRead : null;
        aiCards = parsed?.cards || [];
      } catch { /* cards fall back to raw headlines */ }
    }

    const cards = stories.map((s, i) => {
      const a = aiCards[i] || {};
      const impact = a.marketImpact === 'risk-on' || a.marketImpact === 'risk-off' ? a.marketImpact : 'mixed';
      return {
        tag: a.tag || null,
        plainTitle: a.plainTitle || s.title,
        whyItMatters: a.whyItMatters || null,
        marketImpact: impact,
        impactNote: a.impactNote || null,
        image: s.image,
        source: s.source,
        url: s.url,
        publishedAt: s.publishedAt,
      };
    });

    // language guard — translate anything the model left in English
    const trBox: Record<string, any> = { macroRead };
    await enforceLanguage(loc, [...cards, trBox], ['plainTitle', 'whyItMatters', 'impactNote', 'tag', 'macroRead']);
    macroRead = trBox.macroRead;

    return { success: true, locale: loc, context, macroRead, count: cards.length, cards };
  };

  try {
    const res = await serveSWR({ key: cacheKey, freshSec: TTL_SEC, refresh: skipCache, generate });
    if (!res) return NextResponse.json({ success: false, error: 'unavailable' }, { status: 503 });
    return NextResponse.json({ ...res.body, _cached: true, _stale: res.stale });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
