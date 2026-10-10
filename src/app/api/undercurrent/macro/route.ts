// ============================================================================
// Undercurrent (spin-off prototype) — MACRO: the big picture that shakes markets
// ----------------------------------------------------------------------------
// PROTOTYPE, ISOLATED. GET /api/undercurrent/macro?locale=ko
// Macro/geopolitical breaking news (FMP general news; Polygon keyword fallback)
// fused with OUR market-wide money context (10Y treasury, FedWatch probabilities,
// fear & greed) → AI writes a plain-language "macroRead" + per-story market-impact
// cards (risk-on / risk-off / mixed). Redis-cached per locale (12 min).
// 2026-09-28: every index/futures/10Y number now travels with its SESSION label
// (src/lib/marketBackdrop.ts) — the Monday morning edition had called Friday's
// +0.48% "today" and FRED's T+1 10Y "now". The AI text is checked, not trusted.
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache } from '@/services/redisClient';
import { fmpEtToIso } from '@/lib/fmpTime';
import { pacingKnobs, BASELINE_KNOBS } from '@/lib/ai/creditPacing';
import { isFreshTierSkipped } from '@/lib/ai/freshTier';
import { normLocale, isSpam, invokeJSON, ucCardsGate, langName, cleanImage, enforceLanguage, serveSWR, publicBase, type NewsItem, type Locale } from '../shared';
import { loadBackdrop, simInputsFrom } from '@/services/marketBackdropLoader';
import { buildBackdrop, factsBlock, backdropText, timeLabelViolation, calendarKey, TIME_RULES, type MarketBackdrop } from '@/lib/marketBackdrop';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_SEC = BASELINE_KNOBS.ucMacroFreshSec;   // 기본 12분 — 실제 수명은 페이싱 조절기가 정한다(5~30분)
const MAX_STORIES = 8;

const MACRO_KEYWORD_RE = /fed|fomc|rate|inflation|cpi|ppi|jobs|payroll|unemployment|treasury|yield|opec|oil|crude|tariff|trade war|china|geopolit|sanction|war|ukraine|middle east|election|shutdown|debt ceiling|dollar|recession/i;

interface FmpNews {
  title?: string; text?: string; image?: string; url?: string;
  publishedDate?: string; site?: string;
}

function fmpDateToIso(d?: string): string | null {
  // FMP "YYYY-MM-DD HH:mm:ss" 는 뉴욕 벽시계다(2026-09-24 원문 대조 12/12 = +240분). 예전엔 UTC 로 가정해 4시간 늙게 읽었다.
  return fmpEtToIso(d);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const loc: Locale = normLocale(searchParams.get('locale'));
  const skipCache = searchParams.get('refresh') === '1';
  // v7 (2026-09-28): macroRead is written against a SESSION-LABELED backdrop and time-checked
  // (v6 fed Friday's index change + FRED's T+1 10Y as «now» → «higher today» on a Monday pre-market).
  // v6: flush caches built while the self-calls (treasury/fedwatch/index-close) failed on the
  // protected cron origin (same bug as feedCore.fetchMoney) → 2026-07-14
  const knobs = await pacingKnobs();   // 400ms 안에 못 읽으면 기본 값
  const cacheKey = `undercurrent:macro:v7:${loc}`;
  const base = publicBase(origin); // self-calls must hit the public domain, never the request/cron origin
  // preview-only: a simulated clock + quotes (pre-market / weekend) run the SAME pipeline, uncached
  const sim = simInputsFrom(new URL(request.url));

  // SWR: normal requests serve cache instantly (stale ok); client triggers refresh=1.
  const generate = async () => {
    // 1) macro news (FMP general) + OUR market-wide money context, in parallel.
    //    Indices · futures · 10Y come from ONE session-labeled backdrop: the 10Y is the SIGNUM
    //    dashboard's own value (getMacroSnapshotSSOT), not /api/live/treasury (FRED/UST daily, T+1).
    const fmpKey = process.env.FMP_API_KEY;
    const [fmpRes, fedRes, fearGreed, backdrop] = await Promise.all([
      fmpKey
        ? fetch(`https://financialmodelingprep.com/stable/news/general-latest?limit=20&apikey=${fmpKey}`, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
      fetch(`${base}/api/guardian/fedwatch`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      getFromCache<{ score: number; rating: string }>('cnn:feargreed').catch(() => null),
      sim ? Promise.resolve(buildBackdrop(sim)) : loadBackdrop(),
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

    // Both news upstreams empty (transient) → THROW so SWR serves the last good macro
    // instead of caching an empty payload over it (empty-over-good poisoning).
    if (stories.length === 0) throw new Error('no macro stories');

    const fed = {
      noChange: typeof fedRes?.noChange === 'number' ? fedRes.noChange : null,
      hike: typeof fedRes?.hike === 'number' ? fedRes.hike : null,
      ease: typeof fedRes?.ease === 'number' ? fedRes.ease : null,
      daysUntilFomc: typeof fedRes?.daysUntilFomc === 'number' ? fedRes.daysUntilFomc : null,
      // the FedWatch scrape is periodic (last seen: Fri 22:08Z still served Monday) — the AI gets its as-of
      asOf: typeof fedRes?.scrapedAt === 'string' ? fedRes.scrapedAt : typeof fedRes?.storedAt === 'string' ? fedRes.storedAt : null,
    };
    // legacy chip shape (same keys the screens already read) — now filled from the labeled backdrop
    const context = {
      ...legacyContext(backdrop),
      fedNoChange: fed.noChange,
      fedHike: fed.hike,
      fedEase: fed.ease,
      daysUntilFomc: fed.daysUntilFomc,
      fearGreed: typeof fearGreed?.score === 'number' ? fearGreed.score : null,
      fearGreedRating: fearGreed?.rating || null,
    };
    const facts = factsBlock(backdrop, { fed, fearGreed: { score: context.fearGreed, rating: context.fearGreedRating } });

    // 2) AI: macroRead + per-story market-impact cards (single call)
    let macroRead: string | null = null;
    let aiCards: any[] = [];
    let timeGuard: 'ok' | 'rewritten' | 'fallback' | 'no-ai' = 'ok';
    if (stories.length > 0) {
      const system = `You write the MACRO section of "Undercurrent", a premium general-audience market app. Job: explain how macro/geopolitical news is shaking (or could shake) the MARKET, fused with the market-money context provided.

${TIME_RULES}

CONTEXT SIGNALS (read precisely, mention only what's given):
- NASDAQ / Dow level (+ % change): how the stock market ITSELF is doing — "now" ONLY when labeled LIVE; otherwise it is a past session's close, named by its day.
- Stock-index futures (only present when trading LIVE): where stocks are pointing while the cash market is shut.
- 10Y treasury yield (+change in bp): rising = tightening pressure / risk-off tilt for stocks; falling = easing.
- Fed probabilities (noChange/hike/ease %, days to FOMC): what rate path the market is pricing (as of the time given).
- Fear & Greed (0-100): <30 fear, >70 greed.

RULES:
- Write in ${langName[loc]}.
- EVERY output field INCLUDING plainTitle must be written in ${langName[loc]}. Headlines usually arrive in English — TRANSLATE them; NEVER copy the original English wording.
- Plain language for ordinary people; no jargon. Describe, NEVER advise; no predictions beyond what the numbers imply as positioning.
- macroRead: 2-3 sentences on the macro-money backdrop, grounded ONLY in the FACTS. START from how stocks are trading: LIVE indices if the market is open; otherwise LIVE futures (if trading), then the last session by its day name; if nothing is live, say the market is closed. THEN connect rates/Fed/sentiment to it.
- Per story: "marketImpact" = 'risk-on' | 'risk-off' | 'mixed' (how this news leans for risk assets), "impactNote" = one plain sentence WHY it moves markets / what it touches (rates, oil, supply chains…). Honest 'mixed' when unclear.
- Output STRICT JSON only.`;

      const user = `Return {"macroRead":"...","cards":[...]} — one card per story IN ORDER:
{"plainTitle":"<short accessible rewrite>","whyItMatters":"<one plain sentence for an ordinary person>","marketImpact":"risk-on|risk-off|mixed","impactNote":"<one plain sentence: why/how this shakes markets>","tag":"<1-2 word theme IN ${langName[loc]}, e.g. rates/geopolitics/commodities/trade>"}

${facts}

STORIES:
${JSON.stringify(stories.map((s, i) => ({ n: i + 1, headline: s.title, summary: s.description })))}`;

      try {
        const parsed = await invokeJSON(system, user, 4096, { purpose: 'UC', locale: loc, validate: ucCardsGate(loc, stories.length) });
        macroRead = typeof parsed?.macroRead === 'string' ? parsed.macroRead : null;
        aiCards = parsed?.cards || [];
      } catch (e) { if (isFreshTierSkipped(e)) throw e; /* cards fall back to raw headlines */ }
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

    // time guard — the model is checked, not trusted: a past session's number called «today/now»
    // gets ONE targeted rewrite; if that still fails, the deterministic sentence (always right) goes out.
    if (!macroRead) {
      macroRead = backdropText(backdrop, loc);
      timeGuard = 'no-ai';
    } else {
      const bad = timeLabelViolation(macroRead, backdrop, loc);
      if (bad) {
        console.warn(`[uc-macro] time label violation (${loc}): ${bad.slice(0, 160)}`);
        let fixed: string | null = null;
        try {
          const r = await invokeJSON(
            `You fix one short paragraph for a market app.\n\n${TIME_RULES}\n\nWrite in ${langName[loc]}. Keep it 2-3 plain sentences; describe, never advise. Output STRICT JSON {"macroRead":"..."}.`,
            `${facts}\n\nDRAFT — this sentence breaks the time rules: "${bad}"\n${macroRead}\n\nRewrite the draft so every number keeps its time label.`,
            1024,
          );
          fixed = typeof r?.macroRead === 'string' ? r.macroRead : null;
          if (fixed) {
            const box: Record<string, any> = { macroRead: fixed };
            await enforceLanguage(loc, [box], ['macroRead']);
            fixed = box.macroRead;
          }
        } catch (e) { if (isFreshTierSkipped(e)) throw e; /* fall through to the deterministic sentence */ }
        if (fixed && !timeLabelViolation(fixed, backdrop, loc)) {
          macroRead = fixed;
          timeGuard = 'rewritten';
        } else {
          macroRead = backdropText(backdrop, loc);
          timeGuard = 'fallback';
        }
      }
    }

    return { success: true, locale: loc, context, backdrop, macroRead, timeGuard, count: cards.length, cards };
  };

  if (sim) {
    // preview simulation — never read or write the shared cache (production reads the same Redis)
    try {
      const body = await generate();
      return NextResponse.json({ ...body, generatedAt: new Date().toISOString(), _sim: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message || 'failed', _sim: true }, { status: 500 });
    }
  }

  try {
    const res = await serveSWR({ key: cacheKey, freshSec: knobs.ucMacroFreshSec, baselineFreshSec: TTL_SEC, refresh: skipCache, generate });
    if (!res) return NextResponse.json({ success: false, error: 'unavailable' }, { status: 503 });
    const body: any = res.body;
    // An edition is written for ONE session. Across a boundary (open, close, ET midnight, futures
    // reopen/close) its words can turn false — «today» becomes yesterday — so it never goes out as-is:
    // current backdrop + the deterministic sentence, flagged stale so the client regenerates.
    if (body?.backdrop?.calKey !== calendarKey(Date.now())) {
      const now = await loadBackdrop().catch(() => null);
      if (now) {
        return NextResponse.json({
          ...body, backdrop: now, context: { ...body.context, ...legacyContext(now) },
          macroRead: backdropText(now, loc), timeGuard: 'session-changed', _cached: true, _stale: true,
        });
      }
      return NextResponse.json({ ...body, macroRead: null, timeGuard: 'session-changed', _cached: true, _stale: true });
    }
    return NextResponse.json({ ...body, _cached: true, _stale: res.stale });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}

/** the chip keys every UC screen already reads, filled from the session-labeled backdrop */
function legacyContext(b: MarketBackdrop) {
  const r2 = (x: number | null | undefined) => (typeof x === 'number' ? Math.round(x * 100) / 100 : null);
  return {
    nasdaq: b.cash.nasdaq?.level ?? null,
    nasdaqChangePct: r2(b.cash.nasdaq?.changePct),
    dow: b.cash.dow?.level ?? null,
    dowChangePct: r2(b.cash.dow?.changePct),
    yield10Y: b.us10y ? Math.round(b.us10y.level * 100) / 100 : null,
    // %p (0.025 = 2.5bp) — the unit the old tile printed
    yield10YChange: b.us10y?.changeBp != null ? Math.round(b.us10y.changeBp * 10) / 1000 : null,
  };
}
