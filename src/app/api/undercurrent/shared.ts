// ============================================================================
// Undercurrent prototype — shared helpers for the feed & ticker-search routes.
// Isolated to /api/undercurrent/*; not imported by any existing SIGNUM code.
// ============================================================================

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { financeTermsRule } from '@/lib/ai/commonTerms';
import { getFromCache, setInCache, deleteFromCache } from '@/services/redisClient';
import { reserveBedrockSlot, BEDROCK_CLIENT_RETRY } from '@/services/bedrockRateLimit';
import { checkAmounts } from '@/lib/ai/amountGuard';
import { ucNumberProblems } from '@/lib/ai/ucNumbers';
import { weekdayName } from '@/lib/marketSession';

// ★ [2026-09-09] «us.» 한도 통이 말라 UC 일본어·WIM 이 통째로 죽었다.
//   같은 Haiku 4.5 라도 «global.» 은 한도 통이 따로다(27M/일 vs 13.5M/일).
//   실측: 같은 순간 us. 는 ThrottlingException, global. 은 정상 응답.
export const BEDROCK_MODEL = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
/** 같은 모델·다른 한도 통 — 기본이 스로틀되면 여기로 한 번 더 시도한다 */
export const BEDROCK_MODEL_ALT = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

let _bedrock: BedrockRuntimeClient | null = null;
export function getBedrock(): BedrockRuntimeClient {
  if (_bedrock) return _bedrock;
  _bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1', ...BEDROCK_CLIENT_RETRY });
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
   * 장외(다크풀) 체결 비중 % — **2026-08-31 복원됨**.
   *   벤더 상실 후 「측정 불가」로 두었으나, FINRA TRF 규제 보고 원본으로
   *   되살렸다(전 종목 11,663개·T+1). 아래 파생값과 함께 쓴다.
   */
  darkPoolPct: number | null;
  /** 장외 공매도 비중 %. ⚠️ 시장 중앙값 49.4% — 절반은 구조적이다. 반드시 아래 평균과 함께 */
  darkPoolShortPct: number | null;
  /** 그 종목의 20일 평균 (기준선) */
  darkPoolShortAvg: number | null;
  /** 오늘 − 평소 (%p) — «이상»은 여기서 판단 */
  darkPoolShortDev: number | null;
  /** 오늘 장외 물량 ÷ 자기 20일 평균. 1.0 = 평소 */
  darkPoolVolRatio: number | null;
  /** 은밀 포지셔닝 점수 0~100 (물량↑ + 공매도비중↓ = 매집 쪽) */
  darkPoolStealth: number | null;
  darkPoolRegime: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | null;
  /** 같은 날 전 종목 평균 — 「높다/낮다」의 기준 */
  darkPoolMarketAvg: number | null;
  /** 다크풀 기준일 (T+1) */
  darkPoolDate: string | null;
  /** 같은 날 등락률 % — 다크풀 해석을 «주가 방향»과 엮는 데 쓴다 */
  changePct: number | null;
  /** 그 세션(optionsDate)에 새로 걸린 옵션 계약 수 (미결제약정 증가분 합) */
  newOiContracts: number | null;
  /** 그 신규 포지션의 명목가 ($) — 대형주·소형주를 공평하게 비교하려고 */
  newOiNotional: number | null;
  /** 신규 포지션이 콜 쪽인가 풋 쪽인가 */
  newOiSide: 'call' | 'put' | null;
  /** 포지션이 열린 세션 = 묶음 prevDate(지각 종목은 그 종목의 prevDate — fetchOptionsOpening, 10/3) */
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
    darkPoolPct: null, darkPoolShortPct: null, darkPoolShortAvg: null, darkPoolShortDev: null, darkPoolVolRatio: null,
    darkPoolStealth: null, darkPoolRegime: null, darkPoolMarketAvg: null, darkPoolDate: null,
    changePct: null,
    oiPcr: null, volumePcr: null, squeezeScore: null,
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

    // 다크풀은 FINRA 원본에서 온다 — 벤더 응답의 darkPoolPct 는 이제 없다.
    let dp: Awaited<ReturnType<typeof import('@/services/darkPool').getDarkPool>> = null;
    try {
      const { getDarkPool } = await import('@/services/darkPool');
      dp = await getDarkPool(ticker);
    } catch { /* 없으면 null 로 둔다 — 0 을 만들지 않는다 */ }

    return {
      darkPoolPct: dp?.pct ?? null,
      darkPoolShortPct: dp?.shortPct ?? null,
      darkPoolShortAvg: dp?.shortAvg ?? null,
      darkPoolShortDev: dp?.shortDev ?? null,
      darkPoolVolRatio: dp?.volRatio ?? null,
      darkPoolStealth: dp?.stealth ?? null,
      darkPoolRegime: dp?.regime ?? null,
      darkPoolMarketAvg: dp?.marketAvg ?? null,
      darkPoolDate: dp?.date ?? null,
      changePct: num(d?.prices?.changePercent) ?? num(find(d, 'changePercent')),
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
  // 다크풀이 FINRA 로 복원되어 다시 «돈 데이터»의 한 축이다.
  // 옵션 신규 포지션도 함께 본다 — 한 축이 비어도 큐레이션이 무너지지 않게.
  return m.darkPoolPct !== null || m.oiPcr !== null || m.volumePcr !== null
    || m.newOiContracts !== null || m.maxPain !== null;
}

export function buildSystem(loc: Locale): string {
  return `You write for "Undercurrent", a premium general-audience market app. Your ONE job per story: compare what the NEWS says vs what the MONEY (institutional & options positioning) is actually doing, and surface real DIVERGENCE.

HOW TO READ THE MONEY SIGNALS (be precise):
- newOiContracts / newOiNotional / newOiSide = option positions OPENED in the last completed session (open interest INCREASED). That session's day is money.session (e.g. "Friday") — on a Monday it is Friday, so NEVER call it "yesterday"; name the day. This is the strongest "smart money" read available: rising open interest means a NEW position, not a close-out — volume alone cannot tell those apart. newOiSide says whether the new money leaned call (upside) or put (downside). Judge size by notional, not contract count.
- darkPoolPct = share of the day's volume executed OFF-EXCHANGE (dark pools + wholesaler internalization), from FINRA's regulatory tape. This is where institutions work large orders away from the public book. Compare it to darkPoolMarketAvg — the same day's average across all names — never to a fixed number. darkPoolVolRatio says how that off-exchange volume compares to the SAME ticker's own 20-day norm (1.0 = normal, 1.8 = nearly double); a jump there is a stronger signal than the raw share.
- darkPoolShortPct = what fraction of that off-exchange volume was SHORT. ⚠️ NEVER read this level as bearish on its own: the market-wide median is ~49% because wholesalers sell short to fill retail buys and cover afterwards — half of it is plumbing, not a bet. Judge it ONLY against darkPoolShortAvg (this ticker's own 20-day norm); darkPoolShortDev is the gap in points. 46% against a 46% norm is unremarkable; 62% against a 48% norm is the real anomaly. darkPoolStealth (0-100) and darkPoolRegime (ACCUMULATION / DISTRIBUTION / NEUTRAL) combine those two. Treat it as a read on POSITIONING, never as a prediction.
- Dark-pool figures are as of the prior close (darkPoolDate), not intraday. If darkPoolPct is null for this ticker, do not mention off-exchange activity at all and never infer it from other fields.
- HOW TO READ IT WELL: the raw share is structural — big ETFs always sit near 30%, small caps near 70% — so never call a share "high" or "low" on its own. Lead with darkPoolVolRatio (the same name vs its own 20-day norm), then use darkPoolShortPct to say WHICH WAY that size leaned: volume up + short share low = size was accumulated quietly off the public book; volume up + short share high = hedging or trimming, not buying. Explain the mechanism in one clause — off-exchange prints do not touch the public book, so large orders move size without moving the quote. Describe positioning, never a forecast.
- putCallRatio: oiPcr (standing positions) and volumePutCallRatio (the prior session's traded volume) are BOTH put ÷ call. >1.2 = put-heavy (defensive/bearish lean); 0.8-1.2 = balanced; <0.8 = call-heavy (bullish lean). A put ÷ call ratio BELOW 1 means FEWER puts than calls.
- DIRECTION IS COMPUTED FOR YOU: positionLeanText (from oiPcr) and flowLeanText (from volumePutCallRatio) state the lean in ${langName[loc]}. Use them as given; NEVER infer or restate a different direction from the raw ratios.
- squeezeScore (0-100) = short-squeeze pressure. >60 = high squeeze potential; <20 = low.
- maxPain / callWall / putFloor = option magnet/resistance/support price levels (compare to price when given).

RULES:
- Write in ${langName[loc]}.
- EVERY output field INCLUDING plainTitle must be written in ${langName[loc]}. Headlines usually arrive in English — TRANSLATE them into ${langName[loc]}; NEVER copy the original English wording. Keep tickers and company names as-is.
- Plain language for ordinary people. NEVER output raw jargon (no "PCR", "GEX", "open interest", "max pain"). Translate: e.g. "금요일(그 세션의 요일) 상승 쪽에 큰 규모로 새 포지션이 걸렸다", "하락 대비 보험(풋)을 많이 쌓아둔 상태".
- TIME WORDS (2026-09-28: Monday cards said "yesterday's flow" about Friday): every money number comes from ONE past session, money.session. Use that day's name ("on Friday" / "금요일" / "金曜日"); NEVER "today", "yesterday", "오늘", "어제", "今日", "昨日" for them. If money.session is null, say "in the latest session".
- Describe facts only — NEVER buy/sell/hold advice, NEVER price predictions.
- moneyRead: ONE sentence, grounded ONLY in the given numbers. If signals are mixed or weak, say so honestly.
- DOLLAR AMOUNTS: NEVER convert or compute amounts from raw numbers yourself. When you state the size of the new positions, copy money.newOiNotionalText EXACTLY (it is already written in ${langName[loc]} units). Do not write any other dollar amount unless it appears in the headline or summary.
- divergence=true ONLY when news tone and money signals clearly point OPPOSITE ways. Mixed/unclear = false.
- moneyMood: 'bullish' (call-heavy / accumulation), 'cautious' (put-heavy / defensive / high squeeze stress), or 'neutral'.
- Output STRICT JSON only.`;
}

export function storyPayload(stories: {
  ticker: string; title: string; description?: string; newsSentiment?: string | null; money: MoneyData;
}[], loc: Locale = 'en'): string {
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
        // 금액은 코드가 그 언어 단위로 만들어 준다 — 모델이 3.3B 를 «330억»·«329億»으로 옮기는 10배 오류(9/30 운영 실측)
        newOiNotionalText: fmtNotional(s.money.newOiNotional, loc),
        newOiSide: s.money.newOiSide,
        oiPcr: s.money.oiPcr,
        // ★ volumePcr 는 이름과 반대로 «콜÷풋»(api/live/ticker: callVol/putVol) — oiPcr(풋÷콜)와 같은 방향으로 바꿔 넘긴다(2026-09-30)
        volumePutCallRatio: volumePutCall(s.money.volumePcr),
        positionLeanText: leanText(loc, leanOf(s.money.oiPcr)),
        flowLeanText: leanText(loc, leanOf(volumePutCall(s.money.volumePcr))),
        squeezeScore: s.money.squeezeScore,
        price: s.money.price,
        maxPain: s.money.maxPain,
        callWall: s.money.callWall,
        putFloor: s.money.putFloor,
        // 이 숫자들이 속한 세션의 요일 — 월요일 카드가 금요일 값을 «yesterday»라고 쓰지 않게(2026-09-28)
        session: s.money.optionsDate ? `${weekdayName(s.money.optionsDate, 'en')} ${s.money.optionsDate}` : null,
      },
    })),
  );
}

/**
 * 거래량 풋÷콜 — money.volumePcr 는 이름과 반대로 «콜÷풋»이다(api/live/ticker route: _cvol / _pvol, 메모리 volume-pcr-field-is-call-over-put).
 * 형제 필드 oiPcr(풋÷콜)와 섞거나 «P/C»로 보여 주기 전에 반드시 이것으로 바꾼다. 0·없음은 null.
 */
export function volumePutCall(volumePcr: number | null | undefined): number | null {
  return typeof volumePcr === 'number' && Number.isFinite(volumePcr) && volumePcr > 0 ? Math.round((1 / volumePcr) * 100) / 100 : null;
}

// ── 방향(풋·콜) — 모델에게 비율 해석을 맡기지 않는다 (2026-09-30) ─────────────────
// 운영 실측: NVDA oiPcr(풋÷콜) 0.81 을 «풋 옵션이 콜 옵션보다 약간 많다»로, 풋÷콜 0.40·0.81 인 날 «방어적 포지셔닝(풋옵션 비중 높음)»으로 썼다.
// 방향은 코드가 판정해 문구로 넘기고(positionLean·flowLean), 생성 뒤·캐시에서 나갈 때 «수치와 모순되는 방향 주장»을 걸러
// 코드가 만든 사실 문장으로 바꾼다. 모델이 드물게 내는 깨진 글자(U+FFFD)도 같은 자리에서 거른다.
export type Lean = 'put-heavy' | 'balanced' | 'call-heavy';
/** 풋÷콜 → 방향. >1.2 풋 우세 · <0.8 콜 우세 · 그 사이 비슷 (지시문과 같은 경계) */
export function leanOf(putCall: number | null | undefined): Lean | null {
  if (typeof putCall !== 'number' || !Number.isFinite(putCall) || putCall <= 0) return null;
  return putCall > 1.2 ? 'put-heavy' : putCall < 0.8 ? 'call-heavy' : 'balanced';
}
const LEAN_TEXT: Record<Locale, Record<Lean, string>> = {
  ko: { 'call-heavy': '콜 쪽이 많다', balanced: '콜·풋이 비슷하다', 'put-heavy': '풋 쪽이 많다' },
  ja: { 'call-heavy': 'コールが多い', balanced: 'コールとプットが拮抗', 'put-heavy': 'プットが多い' },
  en: { 'call-heavy': 'more calls than puts', balanced: 'calls and puts balanced', 'put-heavy': 'more puts than calls' },
};
export const leanText = (loc: Locale, l: Lean | null): string | null => (l ? LEAN_TEXT[loc][l] : null);

// 방향 주장 찾기. ① 비교문은 주어·배수를 읽는다: «콜이 풋의 2.8배»=콜 우세 · «풋이 콜의 0.5배»=콜 우세 · «풋이 콜보다 많다»=풋 우세 · «…보다 적다»=반대.
//   ② 비교문을 지운 나머지에서 일반 표현(«풋 비중이 높다»·«약세 쪽으로 기울어» 등)을 찾는다 — 비교 대상(«콜 옵션보다/대비»)은 주장이 아니다.
type Side = 'put' | 'call';
const CMP: Record<Locale, RegExp> = {
  ko: /(풋|콜)\s*(?:옵션)?\s*[이가]\s*(콜|풋)\s*(?:옵션)?\s*(?:의\s*([\d.]+)\s*배|보다\s*[^.,。!?\n]{0,12}?(많|적))/g,
  ja: /(プット|コール)(?:オプション)?が(コール|プット)(?:オプション)?(?:の([\d.]+)倍|より[^。、!?\n]{0,10}?(多|少))/g,
  en: /\b(puts?|calls?)\b[^.;!?\n]{0,20}?\b(outnumber|outweigh)\w*\s+(calls?|puts?)\b/gi,
};
const GEN_PUT: Record<Locale, RegExp> = {
  ko: /풋\s*(?:옵션)?(?!\s*(?:보다|대비))\s*[이가의]?\s*[^.,。!?\n]{0,10}?(많|높|우세|쌓)|(약세|하락)\s*(쪽|방향)으로\s*기울/,
  ja: /プット(?:オプション)?(?!より)[^。、!?\n]{0,10}?(多|高|優勢|積み上)|弱気(方向)?に傾/,
  // «방어적(defensive)»은 부정문(«no new defensive hedging»)에도 나와 쓰지 않는다 — 방향을 직접 말한 표현만
  en: /put-heavy|more puts than calls|puts? (dominate)|hedged with puts|leaning bearish|bearish tilt/i,
};
const GEN_CALL: Record<Locale, RegExp> = {
  ko: /콜\s*(?:옵션)?(?!\s*(?:보다|대비))\s*[이가의]?\s*[^.,。!?\n]{0,10}?(많|높|우세)|(강세|상승)\s*(쪽|방향)으로\s*기울/,
  ja: /コール(?:オプション)?(?!より)[^。、!?\n]{0,10}?(多|高|優勢)|強気(方向)?に傾/,
  en: /call-heavy|more calls than puts|calls? (dominate)|leaning bullish|bullish tilt|call-biased/i,
};
const sideOf = (w: string): Side => (/풋|プット|put/i.test(w) ? 'put' : 'call');
const other = (x: Side): Side => (x === 'put' ? 'call' : 'put');

/** 문장이 주장하는 방향들 */
export function leanClaims(loc: Locale, text: string): Set<Side> {
  const out = new Set<Side>();
  let rest = text;
  for (const m of text.matchAll(CMP[loc])) {
    if (loc === 'en') { out.add(sideOf(m[1])); rest = rest.replace(m[0], ' '); continue; }
    const subj = sideOf(m[1]);
    const mult = m[3] ? Number(m[3]) : null;
    const more = m[4] ? /많|多/.test(m[4]) : null;
    const claim = mult != null ? (mult > 1 ? subj : mult < 1 ? other(subj) : null) : more == null ? null : more ? subj : other(subj);
    if (claim) out.add(claim);
    rest = rest.replace(m[0], ' ');
  }
  if (GEN_PUT[loc].test(rest)) out.add('put');
  if (GEN_CALL[loc].test(rest)) out.add('call');
  return out;
}

/** 문장이 수치와 모순되는 방향을 주장하는가 — 풋÷콜이 모두 1 미만인데 «풋 우세», 모두 1 초과인데 «콜 우세» */
export function contradictsLean(loc: Locale, text: string, m: Partial<MoneyData> | null | undefined): boolean {
  const ratios = [m?.oiPcr, volumePutCall(m?.volumePcr)].filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0);
  if (!ratios.length || !text) return false;
  const c = leanClaims(loc, text);
  if (c.size !== 1) return false;         // 주장 없음·섞임은 판정하지 않는다
  return c.has('put') ? ratios.every((r) => r < 1) : ratios.every((r) => r > 1);
}

/** 자금 숫자로 만든 사실 문장 — 금액(있으면) + 방향(있으면). 아무것도 없으면 null */
export function factSentence(loc: Locale, m: Partial<MoneyData> | null | undefined): string | null {
  const parts: string[] = [];
  const amt = loc === 'en' ? null : moneyFallback(loc, m);
  if (amt) parts.push(amt);
  const oi = typeof m?.oiPcr === 'number' && m.oiPcr > 0 ? m.oiPcr : null;
  const vol = volumePutCall(m?.volumePcr);
  const lo = leanText(loc, leanOf(oi)), lv = leanText(loc, leanOf(vol));
  if (lo || lv) {
    const f = (x: number) => x.toFixed(2);
    if (loc === 'ko') parts.push([lo && `옵션 포지션은 ${lo}(풋÷콜 ${f(oi!)})`, lv && `전 거래일 거래량은 ${lv}(풋÷콜 ${f(vol!)})`].filter(Boolean).join(', ') + '.');
    else if (loc === 'ja') parts.push([lo && `オプション建玉は${lo}（プット÷コール${f(oi!)}）`, lv && `前営業日の出来高は${lv}（プット÷コール${f(vol!)}）`].filter(Boolean).join('、') + '。');
    else parts.push([lo && `Open positions: ${lo} (put/call ${f(oi!)})`, lv && `prior-session volume: ${lv} (put/call ${f(vol!)})`].filter(Boolean).join('; ') + '.');
  }
  return parts.length ? parts.join(' ') : null;
}

/**
 * 방향 모순·숫자 불일치(배수·가격대 거리, 2026-10-04)·깨진 글자를 고친다(제자리). moneyRead·tickerRead → 사실 문장, whyItMatters → 비움, plainTitle(깨진 글자) → 원문.
 * 모든 로케일에 건다(영어도 방향을 뒤집어 쓸 수 있다). 고친 칸 수를 돌려준다.
 */
export function enforceLean(
  loc: Locale,
  cards: Record<string, any>[],
  opts: { sourceOf?: (i: number) => { title: string }; extra?: { box: Record<string, any>; field: string; money: Partial<MoneyData> | null } } = {},
): number {
  let fixed = 0;
  // ★2026-10-04 숫자도 — 배수(«콜이 풋의 5.9배», 실제 5.75)·가격대 방향/거리(«$4 below max pain», 실제 $3.69 위)가 카드 값과 틀리면 같은 대체(lib/ai/ucNumbers)
  const bad = (t: unknown, m: any) => typeof t === 'string' && !!t && (t.includes('\uFFFD') || contradictsLean(loc, t, m) || ucNumberProblems(loc, t, m).length > 0);
  cards.forEach((c, i) => {
    if (!c) return;
    if (bad(c.moneyRead, c.money)) { c.moneyRead = factSentence(loc, c.money); fixed++; }
    if (bad(c.whyItMatters, c.money)) { c.whyItMatters = null; fixed++; }
    if (typeof c.plainTitle === 'string' && c.plainTitle.includes('\uFFFD')) { c.plainTitle = opts.sourceOf?.(i).title || c.plainTitle.replace(/\uFFFD/g, ''); fixed++; }
  });
  const ex = opts.extra;
  if (ex && bad(ex.box[ex.field], ex.money)) { ex.box[ex.field] = factSentence(loc, ex.money); fixed++; }
  return fixed;
}

// ── 금액 자릿수 (2026-09-30) ─────────────────────────────────────────────────
// 운영 UC 피드 실측: 영어 «3.3B notional» → ko «330억 달러», ja «329億ドル»(10배) · «1.01B» → ja «101億ドル» ·
// «1.51B» → ja «151億ドル». 모델에 날것의 달러(3254000000)를 주고 억·億 환산을 맡긴 탓이다.
//   ① 금액은 코드가 그 언어 단위로 만들어 넘긴다(fmtNotional → newOiNotionalText, 지시문: 그대로 베껴 쓸 것)
//   ② 생성 뒤 lib/ai/amountGuard 로 대조 — 틀리면 moneyRead 는 코드가 만든 사실 문장으로, 그 밖의 칸은 원문으로
//   ③ 캐시(최대 24시간·«같은 내용 재사용»)에서 나갈 때도 moneyRead·tickerRead 를 자금 숫자와 다시 대조(AI 호출 없음)

/** 명목금액 → 그 언어 단위 문구. en «$3.3B» · ko «약 33억 달러» · ja «約33億ドル» */
export function fmtNotional(n: number | null | undefined, loc: Locale): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  if (loc === 'en') return n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : `$${Math.round(n / 1e3)}K`;
  const big = loc === 'ko' ? { t: '조', o: '억', m: '만', cur: ' 달러', pre: '약 ' } : { t: '兆', o: '億', m: '万', cur: 'ドル', pre: '約' };
  const body = n >= 1e12 ? `${(n / 1e12).toFixed(1).replace(/\.0$/, '')}${big.t}`
    : n >= 1e8 ? `${Math.round(n / 1e8).toLocaleString('en-US')}${big.o}`
    : `${Math.max(1, Math.round(n / 1e4)).toLocaleString('en-US')}${big.m}`;
  return `${big.pre}${body}${big.cur}`;
}

/** 자금 숫자로 만든 사실 문장(모델 문장이 금액을 틀렸을 때 대신 쓴다) — 금액이 없으면 null */
export function moneyFallback(loc: Locale, m: Partial<MoneyData> | null | undefined): string | null {
  const amt = fmtNotional(m?.newOiNotional ?? null, loc);
  if (!amt || loc === 'en') return null;
  const side = m?.newOiSide;
  // [통합 9/30] 63(세션 요일)과 맞춘다 — 옵션 숫자는 그 세션의 요일로 말한다(월요일 카드가 금요일 값을 «어제»라 쓰던 9/28 결함).
  //   운영 피드는 newOiNotional 과 optionsDate 를 함께 채운다(feedCore). 날짜가 없을 때는 «최근 세션» — 프롬프트 규칙
  //   («If money.session is null, say "in the latest session"»)과 같은 말이다. «어제»로 메우지 않는다(2026-10-03).
  const d = typeof m?.optionsDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.optionsDate) ? m.optionsDate : null;
  if (loc === 'ko') return `${d ? weekdayName(d, 'ko') : '최근 세션'} ${side === 'put' ? '하락' : side === 'call' ? '상승' : '옵션'} 쪽에 ${amt} 규모의 새 포지션이 열렸다.`;
  return `${d ? weekdayName(d, 'ja') : '直近のセッション'}は${side === 'put' ? '下落' : side === 'call' ? '上昇' : 'オプション'}方向に${amt}相当の新規ポジションが開かれました。`;
}

/** 자금 숫자를 원문처럼 늘어놓는다(억·億 대조의 기준) */
function moneySource(m: Partial<MoneyData> | null | undefined): string {
  if (!m) return '';
  const nums = Object.values(m).filter((v) => typeof v === 'number' && Number.isFinite(v)).map((v) => String(v));
  return nums.join(' ');
}

/**
 * 카드들의 금액 자릿수를 검사해 고친다(제자리 수정). ko·ja 만(영어는 B·M 표기라 이 오류가 없다).
 *   sourceOf(i): 생성 때만 주는 원문(제목·요약) — 캐시에서 나갈 때는 없으니 moneyRead·tickerRead 만 본다.
 * 고친 칸 수를 돌려준다(기록용).
 */
export function enforceAmounts(
  loc: Locale,
  cards: Record<string, any>[],
  opts: { sourceOf?: (i: number) => { title: string; summary?: string }; extra?: { box: Record<string, any>; field: string; money: Partial<MoneyData> | null } } = {},
): number {
  if (loc === 'en') return 0;
  let fixed = 0;
  cards.forEach((c, i) => {
    if (!c) return;
    const money = moneySource(c.money);
    const src = opts.sourceOf ? opts.sourceOf(i) : null;
    const text = src ? `${src.title} ${src.summary || ''}` : '';
    const read = typeof c.moneyRead === 'string' ? c.moneyRead : '';
    if (read && !checkAmounts(`${money} ${text}`, read, loc).ok) { c.moneyRead = moneyFallback(loc, c.money); fixed++; }
    if (!src) return;
    // 제목·설명은 원문 금액과 대조 — 틀리면 제목은 원문(영어) 그대로, 설명은 비운다(틀린 숫자보다 낫다)
    for (const f of ['plainTitle', 'whyItMatters']) {
      const t = typeof c[f] === 'string' ? c[f] : '';
      if (t && !checkAmounts(`${text} ${money}`, t, loc).ok) { c[f] = f === 'plainTitle' ? src.title || null : null; fixed++; }
    }
  });
  const ex = opts.extra;
  if (ex && typeof ex.box[ex.field] === 'string' && ex.box[ex.field] && !checkAmounts(moneySource(ex.money), ex.box[ex.field], loc).ok) {
    ex.box[ex.field] = moneyFallback(loc, ex.money); fixed++;
  }
  return fixed;
}

export async function invokeJSON(system: string, user: string, maxTokens = 4096): Promise<any> {
  try {
    return await invokeJSONOn(BEDROCK_MODEL, system, user, maxTokens);
  } catch (e: any) {
    // 스로틀(한도 소진)이면 «같은 모델의 다른 통»으로 한 번 더. 그 외 오류는 그대로 던진다.
    const throttled = e?.name === 'ThrottlingException' || /throttl|too many tokens/i.test(String(e?.message || ''));
    if (!throttled) throw e;
    console.warn('[bedrock] primary throttled → alt profile');
    return await invokeJSONOn(BEDROCK_MODEL_ALT, system, user, maxTokens);
  }
}

async function invokeJSONOn(model: string, system: string, user: string, maxTokens: number): Promise<any> {
  const command = new InvokeModelCommand({
    modelId: model,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: 0.3,
      // ★2026-10-08 금융 공통어(GEX·Max Pain·Call Wall·Gamma Flip …)는 한국어·일본어 글에서도 번역하지 않는다(lib/ai/commonTerms)
      system: financeTermsRule() + system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  await reserveBedrockSlot('uc');
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
// ★ [2026-09-09] 6시간은 «한 번의 워밍 실패»를 화면 붕괴로 만들었다.
//   일본어 피드가 그렇게 사라져 UC 일본어 앱이 통째로 «読み込めませんでした» 였다.
//   워밍은 15~30분마다 도는데, 실패가 6시간 이어지면 마지막 정상본까지 없어진다.
//   물리 보관을 하루로 늘린다 — 신선도(15분)는 그대로이므로 평소 동작은 같고,
//   워밍이 잠깐 무너져도 «오래된 값»을 줄지언정 화면이 죽지는 않는다.
const SWR_PHYSICAL_SEC = 24 * 60 * 60; // keep keys alive far past logical freshness

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
    // ★2026-09-24: 여기서 조용히 옛 사본만 돌려줘 UC 일본어 피드가 11시간(05:41Z→16:53Z) 멈춰 있었다 —
    //   로그 0줄, 응답은 200·success, uc-warm 은 «실패 0»으로 보고. 실패를 로그와 응답(_genError)에 남긴다.
    const msg = String((e as any)?.message || e).slice(0, 160);
    console.error(`[SWR] generate failed key=${key}: ${msg}`);
    if (cached) return { body: { ...cached, _genError: msg }, stale: true, error: true }; // serve-stale-on-error (응답에만 표시, 캐시엔 안 씀)
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
//
// [날짜 — 2026-10-03 수리]  공급사 레코드 D 의 미결제약정은 D 아침 OCC 공표 = D−1 «마감» 포지션이다.
//   레코드 D 와 직전 레코드(prevDate)의 차이 = prevDate 세션에 새로 열린 포지션(NVDA 261016C00405000: 10/01 레코드 OI 12·거래 873
//   → 10/02 레코드 OI 870, 10/02 거래 0 — «+858» 은 10/1 에 열렸다). 그래서 여기서 돌려주는 date 는 «포지션이 열린 세션» = 묶음 prevDate
//   (예전엔 레코드 날짜 D 를 줘 «금요일 새로 걸린»이 목요일 포지션이었다). 지각 종목(openingStale)은 그 종목 자신의 prevDate 를 byTicker 에 싣는다.
export interface OpeningPosition {
  contracts: number;
  notional: number;
  side: 'call' | 'put';
  /** 이 종목의 신규 포지션이 열린 세션(지각 종목만 묶음과 다를 수 있다) — 없으면 묶음 date */
  date?: string | null;
}

const ymdOrNull = (x: unknown): string | null => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);

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
    const date = ymdOrNull(d?.prevDate);   // 포지션이 열린 세션 = 묶음 prevDate(레코드 D 의 OI 는 D−1 마감)
    const byTicker: Record<string, OpeningPosition> = { ...(d?.opening || {}) };
    for (const [t, v] of Object.entries<any>(d?.openingStale || {})) {
      if (byTicker[t] || !v || typeof v !== 'object') continue;
      byTicker[t] = { contracts: v.contracts, notional: v.notional, side: v.side, date: ymdOrNull(v.prevDate) };
    }
    return { date, byTicker };
  } catch {
    return { date: null, byTicker: {} };
  }
}
