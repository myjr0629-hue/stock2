// ============================================================================
// WIM (Why'd It Move?) — TODAY: the daily quiz set, built from REAL movers.
// ----------------------------------------------------------------------------
// PROTOTYPE, ISOLATED (per WIM_BUILD_BLUEPRINT §2/§5 — generation is SWR
// on-demand here instead of the nightly cron; promote to /api/cron/wim-bake
// when the shell ships). GET /api/wim/today  (?refresh=1 to regenerate)
//
// Pipeline: real movers (2%≤|Δ|≤30, liquid names first) → per-ticker news +
// institutional money data in parallel → ONE AI call attributes each move to a
// cause category + writes a ≤2-sentence observer-tone explanation and an
// institutional deep-read, all in {ko,en,ja} → choices assembled from the
// cause bank → compliance scan → cached per ET date (all locales in one unit).
//
// Compliance (hard): observer tone only — describe, never advise or predict.
// Units failing the forbidden-language scan are discarded.
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import {
  isSpam, invokeJSON, fetchMoney, serveSWR, type NewsItem,
} from '../../undercurrent/shared';
import {
  CAUSE_BANK, CAUSE_IDS, DISCLAIMER, pickChoices, type CauseCategoryId, type Loc,
} from '../causeBank';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FRESH_SEC = 4 * 60 * 60; // regenerate at most every 4h within the day
const MAX_UNITS = 5;

// Issue/household names get PRIORITY when they moved — the education hook is
// "a stock you know did something today", not an unknown microcap. (User call.)
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
]);
const MIN_DOLLAR_VOLUME = 150_000_000; // liquidity floor for non-famous movers

function dateET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
function etDateOf(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
}

// 조언·예측 어휘 스캔 — 교육앱 절대선. 하나라도 걸리면 유닛 폐기.
const FORBIDDEN = /매수|매도|추천|목표가를 제시|사세요|파세요|will rise|will fall|should buy|should sell|buy now|sell now|買うべき|売るべき|上がるだろう|下がるだろう/i;
function locClean(l: Loc | null | undefined): boolean {
  if (!l) return true;
  return !FORBIDDEN.test(`${l.ko} ${l.en} ${l.ja}`);
}
function locFull(l: any): l is Loc {
  return !!l && typeof l.ko === 'string' && l.ko.trim() !== ''
    && typeof l.en === 'string' && l.en.trim() !== ''
    && typeof l.ja === 'string' && l.ja.trim() !== '';
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const refresh = searchParams.get('refresh') === '1';
  const today = dateET();
  // v2: well-known-first selection + real intraday chart (5-min closes + VWAP) per unit
  const cacheKey = `wim:units:v2:${today}`;

  const generate = async () => {
    // 1) real movers — three sources: value (top dollar-volume = the household names,
    // where NVDA/MU-type movers actually live; the gainers/losers top-30 is usually
    // microcap noise), plus gainers/losers for the big swings
    const [vRes, gRes, lRes] = await Promise.all([
      fetch(`${origin}/api/market/movers?type=value&limit=30`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${origin}/api/market/movers?type=gainers&limit=30`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${origin}/api/market/movers?type=losers&limit=30`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    type Mover = { ticker: string; price: number; changePercent: number; value?: number };
    // movers route returns { movers: [...] } (object), not a bare array
    const all: Mover[] = [
      ...(((vRes?.movers ?? vRes) || []) as Mover[]),
      ...(((gRes?.movers ?? gRes) || []) as Mover[]),
      ...(((lRes?.movers ?? lRes) || []) as Mover[]),
    ].filter((m) => /^[A-Z]{1,5}$/.test(m.ticker) && Math.abs(m.changePercent) <= 30);
    // TIER 1: household/issue names that actually moved today (≥1.5%), biggest move first
    const famous = all
      .filter((m) => WELL_KNOWN.has(m.ticker) && Math.abs(m.changePercent) >= 1.5)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    // TIER 2: liquid movers (dollar-volume floor keeps microcap noise out), ≥2%
    const liquid = all
      .filter((m) => !WELL_KNOWN.has(m.ticker) && Math.abs(m.changePercent) >= 2 && (m.value || 0) >= MIN_DOLLAR_VOLUME)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    const picked: Mover[] = [];
    const seen = new Set<string>();
    for (const m of [...famous, ...liquid]) {
      if (picked.length >= MAX_UNITS) break;
      if (!seen.has(m.ticker)) { seen.add(m.ticker); picked.push(m); }
    }
    if (picked.length === 0) throw new Error('no movers today');

    // 2) per mover: news + institutional money + company name + REAL intraday chart
    //    (5-min bars: close + per-bar VWAP — the "this is real data" proof the UI shows)
    const enriched = await Promise.all(picked.map(async (m) => {
      const [news, money, ref, aggs] = await Promise.all([
        fetchMassive('/v2/reference/news', { ticker: m.ticker, limit: '6', order: 'desc', sort: 'published_utc' }, false, undefined, { cache: 'no-store' as RequestCache }).catch(() => null),
        fetchMoney(origin, m.ticker).catch(() => null),
        fetchMassive(`/v3/reference/tickers/${m.ticker}`, {}, false, undefined, { cache: 'no-store' as RequestCache }).catch(() => null),
        // pull ~6 days and keep only the LAST session's bars — before the ET open,
        // "today's" calendar date has no bars yet, but the move being quizzed is the
        // LAST session's move, so its chart is the right chart (holiday-safe too)
        fetchMassive(`/v2/aggs/ticker/${m.ticker}/range/5/minute/${new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10)}/${today}`, { adjusted: 'true', sort: 'asc', limit: '5000' }, false, undefined, { cache: 'no-store' as RequestCache }).catch(() => null),
      ]);
      const headlines = ((news?.results || []) as NewsItem[])
        .filter((n) => !isSpam(n))
        .slice(0, 3)
        .map((n) => n.title);
      const barsAll = (aggs?.results || []) as { c?: number; vw?: number; t?: number }[];
      const lastDay = barsAll.length && typeof barsAll[barsAll.length - 1].t === 'number'
        ? etDateOf(barsAll[barsAll.length - 1].t as number) : null;
      const bars = lastDay ? barsAll.filter((b) => typeof b.t === 'number' && etDateOf(b.t) === lastDay) : [];
      const closes = bars.map((b) => b.c).filter((x): x is number => typeof x === 'number' && x > 0);
      const vwaps = bars.map((b) => b.vw).filter((x): x is number => typeof x === 'number' && x > 0);
      const spark = closes.length >= 8
        ? { closes, vwap: vwaps.length === closes.length ? vwaps : null }
        : null;
      return { ...m, headlines, money, spark, companyName: ref?.results?.name || '' };
    }));

    // 3) ONE AI call: attribute + explain + institutional deep-read, ×3 languages
    const catalog = CAUSE_IDS.map((id) => `${id}: ${CAUSE_BANK[id].label.en}`).join('\n');
    const system = `You write quiz answer keys for "Why'd It Move?", an EDUCATION app that turns today's real stock moves into a 30-second cause-and-effect lesson for beginners.

STRICT RULES:
- OBSERVER tone. Describe what happened and why. NEVER advise, recommend, or predict (no buy/sell/should/will rise/target).
- Attribute each move to exactly ONE cause category from the catalog (the id string).
- "explanation": ≤2 short sentences in plain language a beginner gets, the causal driver wrapped in **bold**. Written natively in EACH of Korean, English, Japanese (not literal translations of each other — natural in each).
- "headline": translate the single most causal headline into each language (or null if none is causal).
- "deepRead": 1-2 sentences of the INSTITUTIONAL view grounded ONLY in the money numbers given (dark-pool share, put/call, squeeze score, max pain) — what a desk would notice. Observer tone, no advice. Null if numbers are absent.
- Output STRICT JSON only.

CAUSE CATALOG:
${catalog}`;

    const user = `Return {"units":[...]} — one item per mover IN ORDER:
{"n":<number>,"cat":"<category id>","explanation":{"ko":"...","en":"...","ja":"..."},"headline":{"ko":"...","en":"...","ja":"..."}|null,"deepRead":{"ko":"...","en":"...","ja":"..."}|null}

MOVERS (today, real):
${JSON.stringify(enriched.map((m, i) => ({
  n: i + 1,
  ticker: m.ticker,
  companyName: m.companyName,
  changePct: Math.round(m.changePercent * 100) / 100,
  headlines: m.headlines,
  money: m.money ? {
    darkPoolPct: m.money.darkPoolPct, volumePcr: m.money.volumePcr,
    squeezeScore: m.money.squeezeScore, maxPain: m.money.maxPain,
  } : null,
})))}`;

    const parsed = await invokeJSON(system, user);
    const ai: any[] = Array.isArray(parsed?.units) ? parsed.units : [];

    // 4) assemble QuizUnits (schema per WIM_BUILD_BLUEPRINT §3)
    const units = enriched.map((m, i) => {
      const a = ai.find((x) => x?.n === i + 1) || ai[i] || {};
      const cat: CauseCategoryId = CAUSE_IDS.includes(a.cat) ? a.cat : 'own_earnings';
      if (!locFull(a.explanation)) return null;                     // no key → no quiz
      if (!locClean(a.explanation) || !locClean(a.headline) || !locClean(a.deepRead)) return null; // compliance
      const choiceIds = pickChoices(cat, `${m.ticker}:${today}`);
      return {
        id: `${today}:${m.ticker}`,
        type: 'daily_move' as const,
        dateET: today,
        ticker: m.ticker,
        companyName: m.companyName,
        moveMagnitude: Math.round(Math.abs(m.changePercent) * 10) / 10,
        session: 'REG',
        prompt: {
          ko: `오늘 ${m.ticker}, 무슨 일이 있었을까?`,
          en: `What happened to ${m.ticker} today?`,
          ja: `今日の${m.ticker}、何があった？`,
        } as Loc,
        choices: choiceIds.map((cid) => ({ id: cid, categoryId: cid, label: CAUSE_BANK[cid].label })),
        correctCategoryIds: [cat],
        explanation: a.explanation as Loc,
        evidence: locFull(a.headline) ? { newsHeadline: a.headline as Loc } : undefined,
        deepRead: locFull(a.deepRead) ? (a.deepRead as Loc) : null,
        money: m.money && (m.money.darkPoolPct != null || m.money.volumePcr != null) ? {
          darkPoolPct: m.money.darkPoolPct, volumePcr: m.money.volumePcr,
          squeezeScore: m.money.squeezeScore, maxPain: m.money.maxPain,
          callWall: m.money.callWall, putFloor: m.money.putFloor,
        } : null,
        price: m.price,
        spark: m.spark, // real intraday 5-min closes (+ per-bar VWAP) — chart payload
        attributionPriority: i + 1,
        difficultyLevel: CAUSE_BANK[cat].level,
        disclaimer: DISCLAIMER,
        compliancePassed: true,
      };
    }).filter(Boolean);

    if (units.length === 0) throw new Error('no units survived'); // SWR keeps last good day
    return { success: true, dateET: today, count: units.length, units };
  };

  try {
    const res = await serveSWR({ key: cacheKey, freshSec: FRESH_SEC, refresh, generate });
    if (!res) return NextResponse.json({ success: false, error: 'unavailable' }, { status: 503 });
    return NextResponse.json({ ...res.body, _stale: res.stale });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
