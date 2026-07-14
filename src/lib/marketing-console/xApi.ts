// ============================================================================
// X (Twitter) API helpers for the marketing console.
// Reads use the verified app-only Bearer (X_BEARER_TOKEN, api.x.com — 200 verified).
// Reply drafts are GROUNDED in our own options data (no fabricated numbers).
// Posting (write) is NOT here — it requires per-account OAuth user tokens (Phase 3).
// ============================================================================

import { callBedrock } from '@/services/bedrockClient';

const X_BASE = 'https://api.x.com';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';

const KNOWN_TICKERS = new Set([
  'NVDA', 'MU', 'TSLA', 'SOXL', 'AAPL', 'SPY', 'QQQ', 'MSFT', 'META', 'AMZN',
  'GOOGL', 'AMD', 'PLTR', 'SMCI', 'AVGO', 'NFLX', 'COIN', 'MSTR',
]);

export interface ScanTweet {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  likes: number;
  replies: number;
  retweets: number;
  score: number;
  ticker: string | null;
  url: string;
}

function bearer(): string {
  const t = process.env.X_BEARER_TOKEN;
  if (!t) throw new Error('X_BEARER_TOKEN not set');
  return t;
}

async function xGet<T>(path: string): Promise<T> {
  const res = await fetch(`${X_BASE}${path}`, {
    headers: { Authorization: `Bearer ${bearer()}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`X API ${res.status}: ${body.slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

export function detectTicker(text: string): string | null {
  const cash = text.match(/\$([A-Za-z]{1,5})\b/);
  if (cash && KNOWN_TICKERS.has(cash[1].toUpperCase())) return cash[1].toUpperCase();
  for (const m of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    if (KNOWN_TICKERS.has(m[1])) return m[1];
  }
  return cash ? cash[1].toUpperCase() : null;
}

/** Engagement × freshness score for prioritising which tweet to reply to. */
function scoreTweet(likes: number, replies: number, ageMin: number, hasTicker: boolean): number {
  const engagement = likes + replies * 3;
  const freshness = Math.max(0, 1 - ageMin / 240); // decays over 4h
  const relevance = hasTicker ? 1.5 : 1;
  return Math.round(engagement * (0.5 + freshness) * relevance);
}

/** Scan target accounts' recent (7-day) posts via X recent-search. */
export async function scanTargets(handles: string[], max = 10): Promise<ScanTweet[]> {
  if (!handles.length) return [];
  const from = handles.map((h) => `from:${h}`).join(' OR ');
  const query = encodeURIComponent(`(${from}) -is:retweet -is:reply`);
  const fields =
    'tweet.fields=public_metrics,created_at,author_id&expansions=author_id&user.fields=username';
  const data = await xGet<{
    data?: Array<{
      id: string;
      text: string;
      created_at: string;
      author_id: string;
      public_metrics?: { like_count: number; reply_count: number; retweet_count: number };
    }>;
    includes?: { users?: Array<{ id: string; username: string }> };
  }>(`/2/tweets/search/recent?query=${query}&max_results=${Math.min(max, 100)}&${fields}`);

  const users = new Map((data.includes?.users || []).map((u) => [u.id, u.username]));
  const now = Date.now();
  const out: ScanTweet[] = (data.data || []).map((t) => {
    const pm = t.public_metrics || { like_count: 0, reply_count: 0, retweet_count: 0 };
    const ageMin = (now - new Date(t.created_at).getTime()) / 60000;
    const ticker = detectTicker(t.text);
    const author = users.get(t.author_id) || t.author_id;
    return {
      id: t.id,
      author,
      text: t.text,
      createdAt: t.created_at,
      likes: pm.like_count,
      replies: pm.reply_count,
      retweets: pm.retweet_count,
      ticker,
      score: scoreTweet(pm.like_count, pm.reply_count, ageMin, Boolean(ticker)),
      url: `https://x.com/${author}/status/${t.id}`,
    };
  });
  return out.sort((a, b) => b.score - a.score);
}

interface Structure {
  underlyingPrice?: number;
  spotPrice?: number;
  gex?: { maxPain?: number; gammaFlipLevel?: number; callWall?: number; putFloor?: number };
  maxPain?: number;
  gammaFlipLevel?: number;
}

/** Fetch OUR real options structure for grounding (numbers we can stand behind). */
export async function fetchStructure(ticker: string): Promise<Structure | null> {
  try {
    const res = await fetch(`${SITE}/api/live/options/structure?t=${encodeURIComponent(ticker)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Structure;
  } catch {
    return null;
  }
}

function extractLevels(s: Structure | null) {
  if (!s) return null;
  const price = s.underlyingPrice ?? s.spotPrice ?? s.gex?.callWall;
  const maxPain = s.gex?.maxPain ?? s.maxPain;
  const gammaFlip = s.gex?.gammaFlipLevel ?? s.gammaFlipLevel;
  const callWall = s.gex?.callWall;
  const putFloor = s.gex?.putFloor;
  const has = [price, maxPain, gammaFlip, callWall, putFloor].some((v) => typeof v === 'number');
  if (!has) return null;
  return { price, maxPain, gammaFlip, callWall, putFloor };
}

/**
 * Generate a data-backed reply DRAFT for a tweet, grounded ONLY in the provided
 * real levels. Returns { draft, grounded, levels }. If we have no data for the
 * ticker, grounded=false and the draft is empty (operator writes manually) —
 * we never fabricate numbers.
 */
export async function draftReply(
  tweet: ScanTweet,
  lang: 'en' | 'ja'
): Promise<{ draft: string; grounded: boolean; levels: Record<string, unknown> | null }> {
  const structure = tweet.ticker ? await fetchStructure(tweet.ticker) : null;
  const levels = extractLevels(structure);
  if (!levels) {
    return { draft: '', grounded: false, levels: null };
  }

  const factLines = Object.entries(levels)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

  const langRule =
    lang === 'ja'
      ? 'Write in natural Japanese (casual 米国株 voice, KessanMan-style). NOT a translation.'
      : 'Write in natural English.';

  const system = `You draft ONE short reply for @signumhq, an educational options-data account.
STRICT RULES (compliance — violation is unacceptable):
- Use ONLY the numbers provided below. NEVER invent or estimate any number.
- No prediction, no "will/헤드/about to break/knife's edge" framing. Present/past facts only.
- No buy/sell language. No app name. No links.
- One or two sentences, under 30 words. ${langRule}
- Frame as: the options structure already showed this before the chart.`;

  const userPrompt = `Original tweet by @${tweet.author}: "${tweet.text}"
Ticker: ${tweet.ticker}
Our verified levels (use ONLY these numbers): ${factLines}

Write the reply now (reply text only, no quotes, no preamble):`;

  try {
    const { text } = await callBedrock({
      system,
      userPrompt,
      maxTokens: 200,
      temperature: 0.4,
      jsonPrefill: false,
      label: 'mkt-x-reply',
    });
    return { draft: text.trim(), grounded: true, levels };
  } catch {
    return { draft: '', grounded: false, levels };
  }
}
