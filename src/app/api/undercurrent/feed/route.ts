// ============================================================================
// Undercurrent (spin-off prototype) — news × money feed  [v2]
// ----------------------------------------------------------------------------
// PROTOTYPE, ISOLATED. New route; touches NO existing SIGNUM code. Proves the
// core concept: fetch news → map to tickers → overlay OUR per-ticker money data
// (dark pool %, put/call ratio, squeeze score, option walls) → AI (Bedrock)
// compares "what the news says" vs "what the money is doing" → plain-language
// cards + divergence flag, ko/en/ja.
//
// v2 fixes from the first live run:
//  - money source: /api/live/premium-metrics returned IDENTICAL values for every
//    ticker (global cache) → switched to /api/live/ticker?t=X&skip_alpha=1 which
//    is genuinely per-ticker (verified: NVDA darkPool 58.6/PCR 1.09 vs GTM 34.8/0.04).
//  - news spam: the wire is flooded with law-firm class-action PR → filtered.
//  - prompt: explicit signal semantics so the AI reads PCR/dark pool honestly.
//  - lock-in: feed-level `pulse` (bullish/cautious/divergence counts) computed in
//    code — the glanceable "market mood" a user re-checks during the day.
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BEDROCK_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

let _bedrock: BedrockRuntimeClient | null = null;
function getBedrock(): BedrockRuntimeClient {
  if (_bedrock) return _bedrock;
  _bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
  return _bedrock;
}

type Locale = 'ko' | 'en' | 'ja';
const normLocale = (l: string | null): Locale => (l === 'en' || l === 'ja' ? l : 'ko');
const langName: Record<Locale, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };

interface NewsItem {
  title: string;
  description?: string;
  tickers?: string[];
  image_url?: string;
  article_url?: string;
  published_utc?: string;
  publisher?: { name?: string };
  insights?: { ticker: string; sentiment?: string; sentiment_reasoning?: string }[];
}

interface MoneyData {
  darkPoolPct: number | null;
  oiPcr: number | null;
  volumePcr: number | null;
  squeezeScore: number | null;
  maxPain: number | null;
  callWall: number | null;
  putFloor: number | null;
  price: number | null;
}

const TICKER_RE = /^[A-Z]{1,5}$/;

// Law-firm / class-action PR spam floods the wire — not "news" for our purposes.
const SPAM_RE = new RegExp(
  [
    'class action', 'lawsuit', 'law firm', 'securities fraud', 'shareholder rights',
    'investors? (?:with|who) (?:losses|lost)', 'deadline', 'lead plaintiff',
    'rosen law', 'pomerantz', 'glancy', 'levi & korsinsky', 'bronstein', 'kahn swick',
    'faruqi', 'hagens berman', 'robbins geller', 'kirby mcinerney', 'investor alert',
    'contact the firm', 'recover(?:y)? of (?:your )?losses',
  ].join('|'),
  'i',
);

function isSpam(item: NewsItem): boolean {
  const text = `${item.title || ''} ${item.description || ''}`;
  return SPAM_RE.test(text);
}

function primaryTicker(item: NewsItem): string | null {
  const t = (item.tickers || []).find((x) => TICKER_RE.test(x));
  return t || null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Deep-search a nested object for the first occurrence of a key (bounded depth).
function find(obj: any, key: string, depth = 0): unknown {
  if (depth > 3 || !obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const r = find(v, key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

async function fetchMoney(origin: string, ticker: string): Promise<MoneyData> {
  const empty: MoneyData = {
    darkPoolPct: null, oiPcr: null, volumePcr: null, squeezeScore: null,
    maxPain: null, callWall: null, putFloor: null, price: null,
  };
  try {
    const res = await fetch(`${origin}/api/live/ticker?t=${ticker}&skip_alpha=1`, {
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return empty;
    const d = await res.json();
    return {
      darkPoolPct: num(find(d, 'darkPoolPct')),
      oiPcr: num(find(d, 'oiPcr')),
      volumePcr: num(find(d, 'volumePcr')),
      squeezeScore: num(find(d, 'squeezeScore')),
      maxPain: num(find(d, 'maxPain')),
      callWall: num(find(d, 'callWall')),
      putFloor: num(find(d, 'putFloor')),
      price: num(d?.prices?.price) ?? num(d?.prices?.regularCloseToday) ?? num(find(d, 'regularCloseToday')),
    };
  } catch {
    return empty;
  }
}

function hasRealMoney(m: MoneyData): boolean {
  return m.darkPoolPct !== null || m.oiPcr !== null || m.volumePcr !== null;
}

function buildPrompt(loc: Locale, stories: any[]): { system: string; user: string } {
  const system = `You write for "Undercurrent", a premium general-audience market app. Your ONE job per story: compare what the NEWS says vs what the MONEY (institutional & options positioning) is actually doing, and surface real DIVERGENCE.

HOW TO READ THE MONEY SIGNALS (be precise):
- darkPoolPct = share of volume traded off-exchange by institutions. >50 = unusually heavy institutional activity; 30-50 = elevated; <30 = normal.
- putCallRatio (oiPcr / volumePcr) = hedging/direction lean. >1.2 = put-heavy (defensive/bearish lean); 0.8-1.2 = balanced; <0.8 = call-heavy (bullish lean). volumePcr is today's flow; oiPcr is standing positions.
- squeezeScore (0-100) = short-squeeze pressure. >60 = high squeeze potential; <20 = low.
- maxPain / callWall / putFloor = option magnet/resistance/support price levels (compare to price when given).

RULES:
- Write in ${langName[loc]}.
- Plain language for ordinary people. NEVER output raw jargon (no "PCR", "GEX", "dark pool", "max pain"). Translate: e.g. "기관들이 장외에서 이례적으로 많이 거래 중", "하락 대비 보험(풋)을 많이 쌓아둔 상태".
- Describe facts only — NEVER buy/sell/hold advice, NEVER price predictions.
- moneyRead: ONE sentence, grounded ONLY in the given numbers. If signals are mixed or weak, say so honestly ("돈의 움직임은 아직 뚜렷한 방향이 없어요").
- divergence=true ONLY when news tone and money signals clearly point OPPOSITE ways (e.g. positive news + put-heavy defensive positioning; negative news + call-heavy accumulation). Mixed/unclear = false.
- moneyMood: 'bullish' (call-heavy / accumulation), 'cautious' (put-heavy / defensive / high squeeze stress), or 'neutral'.
- Output STRICT JSON only.`;

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
${JSON.stringify(
    stories.map((s, i) => ({
      n: i + 1,
      ticker: s.ticker,
      headline: s.title,
      summary: (s.description || '').slice(0, 220),
      newsSentiment: s.newsSentiment || 'unknown',
      money: {
        darkPoolPct: s.money.darkPoolPct,
        oiPcr: s.money.oiPcr,
        volumePcr: s.money.volumePcr,
        squeezeScore: s.money.squeezeScore,
        price: s.money.price,
        maxPain: s.money.maxPain,
        callWall: s.money.callWall,
        putFloor: s.money.putFloor,
      },
    })),
  )}`;
  return { system, user };
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const loc = normLocale(searchParams.get('locale'));
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '6', 10) || 6, 1), 8);

  try {
    // 1) recent market news (tickers + per-ticker sentiment + image built-in)
    const news = await fetchMassive(
      '/v2/reference/news',
      { limit: '50', order: 'desc', sort: 'published_utc' },
      false,
      undefined,
      { cache: 'no-store' as RequestCache },
    );
    const results: NewsItem[] = news?.results || [];

    // filter spam → pick one story per ticker
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
    const { system, user } = buildPrompt(loc, stories);
    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        temperature: 0.3,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const result = await Promise.race([
      getBedrock().send(command),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('bedrock timeout')), 50_000)),
    ]);
    let raw = (JSON.parse(new TextDecoder().decode((result as any).body)).content?.[0]?.text || '')
      .replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonStart = raw.indexOf('{');
    if (jsonStart > 0) raw = raw.slice(jsonStart);
    const parsed = JSON.parse(raw);
    const aiCards: any[] = parsed?.cards || [];

    // 4) merge AI verdicts + metadata; only trust divergence when money data was real
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

    // 5) feed-level pulse — the glanceable "market mood" (lock-in: re-check it)
    const pulse = {
      bullish: cards.filter((c) => c.moneyMood === 'bullish').length,
      cautious: cards.filter((c) => c.moneyMood === 'cautious').length,
      neutral: cards.filter((c) => c.moneyMood === 'neutral').length,
      divergences: cards.filter((c) => c.divergence).length,
    };

    return NextResponse.json({ success: true, locale: loc, count: cards.length, pulse, cards });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
