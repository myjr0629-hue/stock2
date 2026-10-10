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
import { pacingKnobs, BASELINE_KNOBS } from '@/lib/ai/creditPacing';
import { isFreshTierSkipped } from '@/lib/ai/freshTier';
import {
  normLocale, isSpam, fetchMoney, hasRealMoney, buildSystem, storyPayload,
  invokeJSON, ucCardsGate, TICKER_RE, cleanImage, enforceLanguage, enforceAmounts, enforceLean, fmtNotional, volumePutCall, leanOf, leanText, serveSWR, type NewsItem,
} from '../shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_SEC = BASELINE_KNOBS.ucTickerFreshSec;   // 기본 10분 — 실제 수명은 페이싱 조절기가 정한다(5~30분)
const MAX_STORIES = 5;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const loc = normLocale(searchParams.get('locale'));
  const ticker = (searchParams.get('t') || '').trim().toUpperCase();

  // «NULL» = 자바스크립트 null 이 글자로 붙은 것 — 형식은 통과하지만 티커가 아니다. 뉴스·자금 원천을 부르기 전에 막는다
  //   (2026-09-30 21:14 KST~ t=null 호출이 3시간에 503 166건 — 매번 원천 2곳 호출·FMP 429 후보. TRUE·NAN 은 실제 티커라 막지 않는다)
  if (!TICKER_RE.test(ticker) || ticker === 'NULL') {
    return NextResponse.json({ success: false, error: 'invalid ticker' }, { status: 400 });
  }

  const skipCache = searchParams.get('refresh') === '1';
  const knobs = await pacingKnobs();   // 400ms 안에 못 읽으면 기본 값
  // ⚠️ money/cards 모양이 바뀌면 **반드시 이 버전을 올린다.** 안 올리면 옛
  //    페이로드가 그대로 나가 새 필드가 «조용히» 빠진다. SWR 이라 stale 도
  //    돌려주므로 더 오래 남는다. (2026-08-31 하루에 세 번 겪었다.)
  //    v5 = 다크풀(FINRA) + 파생지표 필드 추가 2026-08-31
  const cacheKey = `undercurrent:ticker:v6:${ticker}:${loc}`; // v6: money reads name the session day (2026-09-28)

  // SWR: repeat lookups serve cache instantly (stale ok); client triggers refresh=1.
  const generate = async () => {
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

    // Nothing to show (no news AND no real money) → THROW so SWR keeps the last good
    // snapshot for this ticker rather than caching a barren one over it for 6h.
    if (items.length === 0 && !real) throw new Error('no ticker data');

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

MONEY (current, for ${ticker}): ${JSON.stringify({ ...money, volumePcr: undefined, volumePutCallRatio: volumePutCall(money.volumePcr), positionLeanText: leanText(loc, leanOf(money.oiPcr)), flowLeanText: leanText(loc, leanOf(volumePutCall(money.volumePcr))), newOiNotionalText: fmtNotional(money.newOiNotional, loc) })}

STORIES:
${storyPayload(stories, loc)}`;
      try {
        const parsed = await invokeJSON(buildSystem(loc), user, 4096, { purpose: 'UC', locale: loc, validate: ucCardsGate(loc, stories.length) });
        tickerRead = typeof parsed?.tickerRead === 'string' ? parsed.tickerRead : null;
        aiCards = parsed?.cards || [];
      } catch (e) { if (isFreshTierSkipped(e)) throw e; /* keep nulls — page still renders raw signals */ }
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
        image: cleanImage(item.image_url),
        source: item.publisher?.name || null,
        url: item.article_url || null,
        publishedAt: item.published_utc || null,
      };
    });

    // language guard — the model can leave headlines (and rarely the read) in English
    const trBox: Record<string, any> = { tickerRead };
    await enforceLanguage(loc, [...cards, trBox], ['plainTitle', 'whyItMatters', 'moneyRead', 'tag', 'tickerRead']);
    // 금액 자릿수 — 3.3B 를 «330억»으로 옮기는 10배 오류(shared.enforceAmounts 주석)
    const amtFixed = enforceAmounts(loc, cards, {
      sourceOf: (i) => ({ title: stories[i]?.title || '', summary: stories[i]?.description || '' }),
      extra: { box: trBox, field: 'tickerRead', money },
    });
    if (amtFixed) console.warn(`[UC ticker] ${ticker} ${loc}: 금액 자릿수 불일치 ${amtFixed}칸 교체`);
    const leanFixed = enforceLean(loc, cards, { sourceOf: (i) => ({ title: stories[i]?.title || '' }), extra: { box: trBox, field: 'tickerRead', money } });
    if (leanFixed) console.warn(`[UC ticker] ${ticker} ${loc}: 방향 모순·깨진 글자 ${leanFixed}칸 교체`);
    tickerRead = trBox.tickerRead;

    return {
      success: true,
      locale: loc,
      ticker,
      money,
      hasMoneyData: real,
      tickerRead: real ? tickerRead : null,
      count: cards.length,
      cards,
    };
  };

  try {
    const res = await serveSWR({ key: cacheKey, freshSec: knobs.ucTickerFreshSec, baselineFreshSec: TTL_SEC, refresh: skipCache, generate, extra: searchParams.get('pace') === '1' });
    if (!res) return NextResponse.json({ success: false, error: 'unavailable' }, { status: 503 });
    // 캐시에서 나가는 판도 금액을 다시 본다(AI 호출 없음) — moneyRead·tickerRead 를 자금 숫자와 대조
    const b: any = res.body;
    if (Array.isArray(b?.cards)) {
      enforceAmounts(loc, b.cards, { extra: { box: b, field: 'tickerRead', money: b.money ?? null } });
      enforceLean(loc, b.cards, { extra: { box: b, field: 'tickerRead', money: b.money ?? null } });
    }
    return NextResponse.json({ ...res.body, _cached: true, _stale: res.stale });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
