// ============================================================================
// Undercurrent prototype — shared helpers for the feed & ticker-search routes.
// Isolated to /api/undercurrent/*; not imported by any existing SIGNUM code.
// ============================================================================

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { getFromCache, setInCache, deleteFromCache } from '@/services/redisClient';

export const BEDROCK_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

let _bedrock: BedrockRuntimeClient | null = null;
export function getBedrock(): BedrockRuntimeClient {
  if (_bedrock) return _bedrock;
  _bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
  return _bedrock;
}

export type Locale = 'ko' | 'en' | 'ja';
export const normLocale = (l: string | null): Locale => (l === 'en' || l === 'ja' ? l : 'ko');
export const langName: Record<Locale, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };

export interface NewsItem {
  title: string;
  description?: string;
  tickers?: string[];
  image_url?: string;
  article_url?: string;
  published_utc?: string;
  publisher?: { name?: string };
  insights?: { ticker: string; sentiment?: string; sentiment_reasoning?: string }[];
}

export interface MoneyData {
  darkPoolPct: number | null;
  oiPcr: number | null;
  volumePcr: number | null;
  squeezeScore: number | null;
  maxPain: number | null;
  callWall: number | null;
  putFloor: number | null;
  price: number | null;
}

export const TICKER_RE = /^[A-Z]{1,5}$/;

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

export function isSpam(item: NewsItem): boolean {
  return SPAM_RE.test(`${item.title || ''} ${item.description || ''}`);
}

export function primaryTicker(item: NewsItem): string | null {
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

export async function fetchMoney(origin: string, ticker: string, timeoutMs = 25_000): Promise<MoneyData> {
  const empty: MoneyData = {
    darkPoolPct: null, oiPcr: null, volumePcr: null, squeezeScore: null,
    maxPain: null, callWall: null, putFloor: null, price: null,
  };
  try {
    const res = await fetch(`${origin}/api/live/ticker?t=${ticker}&skip_alpha=1`, {
      signal: AbortSignal.timeout(timeoutMs),
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

// Polygon sets image_url to the ARTICLE PAGE (text/html) for some publishers
// (seen live: GlobeNewswire) — browsers then render a broken-image glyph.
// Reject obvious non-image URLs; the client additionally hides onError.
export function cleanImage(url?: string | null): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  if (/\.html?(\?|#|$)/i.test(url)) return null;
  return url;
}

export function hasRealMoney(m: MoneyData): boolean {
  return m.darkPoolPct !== null || m.oiPcr !== null || m.volumePcr !== null;
}

export function buildSystem(loc: Locale): string {
  return `You write for "Undercurrent", a premium general-audience market app. Your ONE job per story: compare what the NEWS says vs what the MONEY (institutional & options positioning) is actually doing, and surface real DIVERGENCE.

HOW TO READ THE MONEY SIGNALS (be precise):
- darkPoolPct = share of volume traded off-exchange by institutions. >50 = unusually heavy institutional activity; 30-50 = elevated; <30 = normal.
- putCallRatio (oiPcr / volumePcr) = hedging/direction lean. >1.2 = put-heavy (defensive/bearish lean); 0.8-1.2 = balanced; <0.8 = call-heavy (bullish lean). volumePcr is today's flow; oiPcr is standing positions.
- squeezeScore (0-100) = short-squeeze pressure. >60 = high squeeze potential; <20 = low.
- maxPain / callWall / putFloor = option magnet/resistance/support price levels (compare to price when given).

RULES:
- Write in ${langName[loc]}.
- EVERY output field INCLUDING plainTitle must be written in ${langName[loc]}. Headlines usually arrive in English — TRANSLATE them into ${langName[loc]}; NEVER copy the original English wording. Keep tickers and company names as-is.
- Plain language for ordinary people. NEVER output raw jargon (no "PCR", "GEX", "dark pool", "max pain"). Translate: e.g. "기관들이 장외에서 이례적으로 많이 거래 중", "하락 대비 보험(풋)을 많이 쌓아둔 상태".
- Describe facts only — NEVER buy/sell/hold advice, NEVER price predictions.
- moneyRead: ONE sentence, grounded ONLY in the given numbers. If signals are mixed or weak, say so honestly.
- divergence=true ONLY when news tone and money signals clearly point OPPOSITE ways. Mixed/unclear = false.
- moneyMood: 'bullish' (call-heavy / accumulation), 'cautious' (put-heavy / defensive / high squeeze stress), or 'neutral'.
- Output STRICT JSON only.`;
}

export function storyPayload(stories: {
  ticker: string; title: string; description?: string; newsSentiment?: string | null; money: MoneyData;
}[]): string {
  return JSON.stringify(
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
  );
}

export async function invokeJSON(system: string, user: string, maxTokens = 4096): Promise<any> {
  const command = new InvokeModelCommand({
    modelId: BEDROCK_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
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
  return JSON.parse(raw);
}

// ── language enforcement ─────────────────────────────────────────────────────
// The model sometimes keeps text in the WRONG language for the target locale:
//  - ko/ja: an English headline leaks through a "rewrite" (missing target script).
//  - en:    a Korean/Japanese tag or phrase leaks BECAUSE our prompt examples are
//           written in Korean (e.g. tag example 금리/지정학/원자재) — seen live on
//           the EN macro feed showing "지정학/원자재". Previously en was skipped
//           entirely, so these never got corrected.
// Guard: any field whose text is NOT in the target locale's script gets translated
// in ONE follow-up call. Mutates the given items in place; silent on failure.
// CJK/kana/hangul = "foreign" for en (English content romanizes names, so any of
// these characters signals an untranslated leak).
const FOREIGN_FOR_EN = /[가-힣぀-ヿ一-鿿]/;
const SCRIPT_RE: Record<Locale, RegExp> = {
  ko: /[가-힣]/,
  ja: /[぀-ヿ一-鿿]/,
  en: FOREIGN_FOR_EN,
};

export function inLocaleLang(loc: Locale, s: string | null | undefined): boolean {
  if (!s) return true;
  // en: leaked if it CONTAINS foreign script. ko/ja: leaked if it LACKS own script.
  if (loc === 'en') return !FOREIGN_FOR_EN.test(s);
  return SCRIPT_RE[loc].test(s);
}

export async function enforceLanguage(
  loc: Locale,
  items: Record<string, any>[],
  fields: string[],
): Promise<void> {
  // en is NO LONGER skipped — Korean/Japanese leaks into the EN feed get caught too.
  const jobs: { item: Record<string, any>; field: string; text: string }[] = [];
  for (const item of items) {
    for (const f of fields) {
      const v = item?.[f];
      if (typeof v === 'string' && v.trim() && !inLocaleLang(loc, v)) jobs.push({ item, field: f, text: v });
    }
  }
  if (!jobs.length) return;
  try {
    const sys = `You translate financial news text into natural ${langName[loc]} for a general audience. Keep tickers, company names and numbers as-is. Output STRICT JSON only: {"t":["..."]} — exactly the same order and count as the input array.`;
    const parsed = await invokeJSON(sys, JSON.stringify({ t: jobs.map((j) => j.text) }));
    const out: any[] = Array.isArray(parsed?.t) ? parsed.t : [];
    jobs.forEach((j, i) => {
      const tr = out[i];
      if (typeof tr === 'string' && tr.trim() && inLocaleLang(loc, tr)) j.item[j.field] = tr;
    });
  } catch { /* keep originals — better English than broken */ }
}

// ── SWR (stale-while-revalidate) cache ───────────────────────────────────────
// The UX rule: a NORMAL request must NEVER block on the ~20s AI generation. If
// ANY value is cached (even logically stale), serve it instantly; the CLIENT then
// fires a refresh=1 request (its own serverless lifetime — no waitUntil needed) to
// regenerate for the next visitor. Only a truly EMPTY cache (first-ever request,
// eviction, or key-version bump) blocks — kept rare by a long physical TTL + a
// one-time deploy warm. Generation errors serve the last-known-good stale value
// (never a 500 when we have anything). Best-effort single-flight lock prevents a
// regeneration stampede; setInCache already blocks null/error payloads (no poison).
const SWR_PHYSICAL_SEC = 6 * 60 * 60; // keep keys alive far past logical freshness

function swrAgeSec(generatedAt: unknown): number {
  const ms = typeof generatedAt === 'number' ? generatedAt
    : typeof generatedAt === 'string' ? Date.parse(generatedAt) : NaN;
  return Number.isFinite(ms) ? (Date.now() - ms) / 1000 : Infinity;
}

async function swrAcquireLock(key: string): Promise<boolean> {
  // NOT atomic (no SET NX in this Redis layer) — best-effort. Worst case on a race
  // is a duplicate generation (wasteful, never incorrect: last write wins and bad
  // payloads are rejected by setInCache). Lock auto-expires so a dead gen can't wedge.
  const lk = `${key}:swrlock`;
  const held = await getFromCache<number>(lk).catch(() => null);
  if (held) return false;
  await setInCache(lk, Date.now(), 90).catch(() => {});
  return true;
}

export type SwrResult<T> = { body: T; stale: boolean; error?: boolean };

// Returns the payload to serve + whether it is stale (client should bg-refresh),
// or null when there is nothing to serve (caller returns an error status).
export async function serveSWR<T extends Record<string, any>>(opts: {
  key: string;
  freshSec: number;
  refresh: boolean;            // refresh=1 → force (re)generation (client bg-refresh / manual warm)
  generate: () => Promise<T>;  // must resolve a truthy payload or throw; generatedAt is stamped here
}): Promise<SwrResult<T> | null> {
  const { key, freshSec, refresh, generate } = opts;
  const cached = await getFromCache<any>(key).catch(() => null);

  // NORMAL request with anything cached → serve instantly, never block.
  if (!refresh && cached) {
    return { body: cached, stale: swrAgeSec(cached.generatedAt) >= freshSec };
  }

  // Here: refresh=1, OR cold (nothing cached). (Re)generate under a best-effort lock.
  const gotLock = await swrAcquireLock(key);
  if (!gotLock) {
    if (cached) return { body: cached, stale: true }; // holder is regenerating; serve stale
    // cold + contended: POLL for the lock holder's result up to the generation budget
    // (a single short wait would expire long before the ~20s gen writes the key, so
    // every waiter would fall through and generate — the very stampede we prevent here).
    for (let i = 0; i < 18; i++) {                     // 18 × 1.5s = 27s (> gen, < maxDuration 60)
      await new Promise((r) => setTimeout(r, 1500));
      const c2 = await getFromCache<any>(key).catch(() => null);
      if (c2) return { body: c2, stale: swrAgeSec(c2.generatedAt) >= freshSec };
    }
    // holder never wrote (died/failed) — fall through and generate ourselves (last resort)
  }
  try {
    const fresh = await generate();
    (fresh as any).generatedAt = new Date().toISOString();
    await setInCache(key, fresh, SWR_PHYSICAL_SEC).catch(() => {});
    return { body: fresh, stale: false };
  } catch (e) {
    if (cached) return { body: cached, stale: true, error: true }; // serve-stale-on-error
    return null; // truly nothing to serve
  } finally {
    if (gotLock) await deleteFromCache(`${key}:swrlock`).catch(() => {});
  }
}
