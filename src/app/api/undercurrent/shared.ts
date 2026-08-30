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
  /**
   * 장외(다크풀) 체결 비중.
   * ⚠️ 현재 데이터 공급으로는 **측정 불가**라 항상 null 이다.
   *    화면은 이 값 대신 아래 옵션 신규 포지션을 쓴다.
   */
  darkPoolPct: number | null;
  /** 어제 새로 걸린 옵션 계약 수 (미결제약정 증가분 합) */
  newOiContracts: number | null;
  /** 그 신규 포지션의 명목가 ($) — 대형주·소형주를 공평하게 비교하려고 */
  newOiNotional: number | null;
  /** 신규 포지션이 콜 쪽인가 풋 쪽인가 */
  newOiSide: 'call' | 'put' | null;
  /** 기준 거래일 (전일 마감) */
  optionsDate: string | null;
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

// [FIX 2026-07-14] Internal self-calls (a route fetching its own /api/...) must hit the public
// production domain, NEVER the request-derived origin. The uc-warm cron builds at its invocation
// URL — a protected *.vercel.app deployment URL — so a self-call there returns 401/redirect and
// fails silently (empty). Use the request origin only when it is already the public signumhq host;
// otherwise fall back to the canonical www host (public, unauthenticated, normalized to non-redirect).
export function publicBase(origin: string): string {
  const norm = (u: string) => u.replace('https://signumhq.com', 'https://www.signumhq.com');
  return /^https:\/\/(www\.)?signumhq\.com/.test(origin)
    ? norm(origin)
    : norm(process.env.NEXT_PUBLIC_BASE_URL || 'https://www.signumhq.com');
}

export async function fetchMoney(origin: string, ticker: string, timeoutMs = 25_000): Promise<MoneyData> {
  const empty: MoneyData = {
    darkPoolPct: null, oiPcr: null, volumePcr: null, squeezeScore: null,
    maxPain: null, callWall: null, putFloor: null, price: null,
    newOiContracts: null, newOiNotional: null, newOiSide: null, optionsDate: null,
  };
  const base = publicBase(origin); // never the request origin — see publicBase note above
  try {
    const res = await fetch(`${base}/api/live/ticker?t=${ticker}&skip_alpha=1`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
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
      // 옵션 신규 포지션은 종목당 호출하지 않는다 — 전 종목이 한 키에 있으므로
      // 호출부가 fetchOptionsOpening() 으로 «1콜»에 받아 병합한다.
      newOiContracts: null, newOiNotional: null, newOiSide: null, optionsDate: null,
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
  // 다크풀은 이제 항상 null 이다 — 그것만 보면 «돈 데이터 없음»이 되어
  // UC 의 큐레이션(돈 있는 기사 우대)이 통째로 무너진다.
  // 옵션 신규 포지션을 판단 재료에 포함한다.
  return m.darkPoolPct !== null || m.oiPcr !== null || m.volumePcr !== null
    || m.newOiContracts !== null || m.maxPain !== null;
}

export function buildSystem(loc: Locale): string {
  return `You write for "Undercurrent", a premium general-audience market app. Your ONE job per story: compare what the NEWS says vs what the MONEY (institutional & options positioning) is actually doing, and surface real DIVERGENCE.

HOW TO READ THE MONEY SIGNALS (be precise):
- newOiContracts / newOiNotional / newOiSide = option positions OPENED yesterday (open interest INCREASED). This is the strongest "smart money" read available: rising open interest means a NEW position, not a close-out — volume alone cannot tell those apart. newOiSide says whether the new money leaned call (upside) or put (downside). Judge size by notional, not contract count.
- darkPoolPct is ALWAYS null on the current data feed — never mention off-exchange or dark pool activity, and never infer it from other fields.
- putCallRatio (oiPcr / volumePcr) = hedging/direction lean. >1.2 = put-heavy (defensive/bearish lean); 0.8-1.2 = balanced; <0.8 = call-heavy (bullish lean). volumePcr is today's flow; oiPcr is standing positions.
- squeezeScore (0-100) = short-squeeze pressure. >60 = high squeeze potential; <20 = low.
- maxPain / callWall / putFloor = option magnet/resistance/support price levels (compare to price when given).

RULES:
- Write in ${langName[loc]}.
- EVERY output field INCLUDING plainTitle must be written in ${langName[loc]}. Headlines usually arrive in English — TRANSLATE them into ${langName[loc]}; NEVER copy the original English wording. Keep tickers and company names as-is.
- Plain language for ordinary people. NEVER output raw jargon (no "PCR", "GEX", "open interest", "max pain"). Translate: e.g. "어제 상승 쪽에 큰 규모로 새 포지션이 걸렸다", "하락 대비 보험(풋)을 많이 쌓아둔 상태".
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
        // 다크풀은 항상 null 이다 — AI 가 «0%» 나 «낮음»으로 서술하지 않도록 아예 뺀다
        newOiContracts: s.money.newOiContracts,
        newOiNotional: s.money.newOiNotional,
        newOiSide: s.money.newOiSide,
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


// ── 옵션 신규 포지션 (전 종목 1콜) ─────────────────────────────────────────
//
// [왜 이게 큰손 레이더를 대체하나]
//   기존 「큰손 레이더」는 다크풀 비중(장외 체결 비중)이었다. 현재 데이터
//   공급으로는 측정 자체가 불가능해서 그 자리가 **영영 비어 있었다**
//   (앱 화면: «지금은 두드러진 장외 큰손 움직임이 없어요» 가 상시 노출).
//
//   대체재는 «어제 기관이 어디에 새로 걸었나»다. 옵션 미결제약정이 늘었다는
//   것은 그 계약에 **새 포지션이 생겼다**는 뜻이고, 이건 거래량과 달리
//   신규와 청산을 구분한다. 익명 다크풀보다 오히려 검증 가능하다.
//
// [비용]  전 종목이 한 Redis 키에 있으므로 **1콜**이면 끝난다.
//   종목당 호출하던 다크풀과 달리 UC 의 호출 예산을 거의 안 쓴다.
export interface OpeningPosition {
  contracts: number;
  notional: number;
  side: 'call' | 'put';
}

export async function fetchOptionsOpening(
  origin: string,
  timeoutMs = 8000,
): Promise<{ date: string | null; byTicker: Record<string, OpeningPosition> }> {
  const base = publicBase(origin);
  try {
    const res = await fetch(`${base}/api/flow/options-eod?all=1`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return { date: null, byTicker: {} };
    const d = await res.json();
    return { date: d?.date ?? null, byTicker: d?.opening || {} };
  } catch {
    return { date: null, byTicker: {} };
  }
}
