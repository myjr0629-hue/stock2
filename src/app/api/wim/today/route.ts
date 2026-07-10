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

function dateET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
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
  const cacheKey = `wim:units:v1:${today}`;

  const generate = async () => {
    // 1) real movers — liquid names first (dollar-volume sorted upstream), sane % band
    const [gRes, lRes] = await Promise.all([
      fetch(`${origin}/api/market/movers?type=gainers&limit=30`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${origin}/api/market/movers?type=losers&limit=30`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    type Mover = { ticker: string; price: number; changePercent: number; value?: number };
    const sane = (m: Mover) => Math.abs(m.changePercent) >= 2 && Math.abs(m.changePercent) <= 30 && /^[A-Z]{1,5}$/.test(m.ticker);
    const byValue = (a: Mover, b: Mover) => (b.value || 0) - (a.value || 0);
    // movers route returns { movers: [...] } (object), not a bare array
    const gainers = (((gRes?.movers ?? gRes) || []) as Mover[]).filter(sane).sort(byValue);
    const losers = (((lRes?.movers ?? lRes) || []) as Mover[]).filter(sane).sort(byValue);
    const picked: Mover[] = [];
    const seen = new Set<string>();
    // interleave 3 gainers / 2 losers by liquidity (education wants recognizable names)
    for (const list of [gainers.slice(0, 3), losers.slice(0, 2), gainers.slice(3, 8), losers.slice(2, 6)]) {
      for (const m of list) {
        if (picked.length >= MAX_UNITS) break;
        if (!seen.has(m.ticker)) { seen.add(m.ticker); picked.push(m); }
      }
    }
    if (picked.length === 0) throw new Error('no movers today');

    // 2) per mover: news + institutional money + company name, in parallel
    const enriched = await Promise.all(picked.map(async (m) => {
      const [news, money, ref] = await Promise.all([
        fetchMassive('/v2/reference/news', { ticker: m.ticker, limit: '6', order: 'desc', sort: 'published_utc' }, false, undefined, { cache: 'no-store' as RequestCache }).catch(() => null),
        fetchMoney(origin, m.ticker).catch(() => null),
        fetchMassive(`/v3/reference/tickers/${m.ticker}`, {}, false, undefined, { cache: 'no-store' as RequestCache }).catch(() => null),
      ]);
      const headlines = ((news?.results || []) as NewsItem[])
        .filter((n) => !isSpam(n))
        .slice(0, 3)
        .map((n) => n.title);
      return { ...m, headlines, money, companyName: ref?.results?.name || '' };
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
        } : null,
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
