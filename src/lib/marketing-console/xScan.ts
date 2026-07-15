// ============================================================================
// X read/scan helpers — NO heavy deps (no aws-sdk/bedrock). Import-safe for
// read routes so they don't pull the Bedrock SDK cold-start into the bundle.
// Uses the verified app-only Bearer (X_BEARER_TOKEN, api.x.com — 200 verified).
// ============================================================================

const X_BASE = 'https://api.x.com';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';

const KNOWN_TICKERS = new Set([
  'NVDA', 'MU', 'TSLA', 'SOXL', 'AAPL', 'SPY', 'QQQ', 'MSFT', 'META', 'AMZN',
  'GOOGL', 'AMD', 'PLTR', 'SMCI', 'AVGO', 'NFLX', 'COIN', 'MSTR', 'DRAM',
]);

export interface ScanTweet {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  likes: number;
  replies: number;
  retweets: number;
  impressions: number;
  score: number;
  ticker: string | null;
  url: string;
  replySettings: string; // 'everyone' | 'mentionedUsers' | 'following' | 'subscribers' | ...
  canReply: boolean;     // true only when anyone can reply
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
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`X API ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// Company names → ticker. Lets us ground JP/EN posts that name a US stock in
// prose (テスラ / "Tesla") instead of a $cashtag — the JP 米国株 voice rarely
// uses cashtags, which is why JP drafts kept falling back to "수동 작성".
const NAME_TO_TICKER: Array<[RegExp, string]> = [
  [/tesla|テスラ/i, 'TSLA'],
  [/nvidia|エヌビディア|エヌビ/i, 'NVDA'],
  [/\bapple\b|アップル/i, 'AAPL'],
  [/microsoft|マイクロソフト/i, 'MSFT'],
  [/amazon|アマゾン/i, 'AMZN'],
  [/google|alphabet|グーグル|アルファベット/i, 'GOOGL'],
  [/\bmeta\b|メタ・?プラット|メタ株/i, 'META'],
  [/netflix|ネットフリックス|ネトフリ/i, 'NFLX'],
  [/palantir|パランティア/i, 'PLTR'],
  [/broadcom|ブロードコム/i, 'AVGO'],
  [/micron|マイクロン/i, 'MU'],
  [/coinbase|コインベース/i, 'COIN'],
  [/microstrategy|マイクロストラテジー/i, 'MSTR'],
  [/super\s?micro|スーパーマイクロ/i, 'SMCI'],
];

export function detectTicker(text: string): string | null {
  // 1) $CASHTAG that we cover
  const cash = text.match(/\$([A-Za-z]{1,5})\b/);
  if (cash && KNOWN_TICKERS.has(cash[1].toUpperCase())) return cash[1].toUpperCase();
  // 2) bare uppercase ticker we cover (e.g. "NVDA")
  for (const m of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    if (KNOWN_TICKERS.has(m[1])) return m[1];
  }
  // 3) company name in prose (EN or JP kana) → ticker
  for (const [re, tk] of NAME_TO_TICKER) {
    if (re.test(text)) return tk;
  }
  // 4) any other $cashtag (unknown coverage — caller still checks grounding)
  return cash ? cash[1].toUpperCase() : null;
}

function scoreTweet(likes: number, replies: number, ageMin: number, hasTicker: boolean): number {
  const engagement = likes + replies * 3;
  const freshness = Math.max(0, 1 - ageMin / 240);
  const relevance = hasTicker ? 1.5 : 1;
  return Math.round(engagement * (0.5 + freshness) * relevance);
}

/** Scan target accounts' recent (7-day) posts via X recent-search. */
export async function scanTargets(handles: string[], max = 10): Promise<ScanTweet[]> {
  if (!handles.length) return [];
  const from = handles.map((h) => `from:${h}`).join(' OR ');
  const query = encodeURIComponent(`(${from}) -is:retweet -is:reply`);
  const fields =
    'tweet.fields=public_metrics,created_at,author_id,reply_settings&expansions=author_id&user.fields=username';
  const data = await xGet<{
    data?: Array<{
      id: string;
      text: string;
      created_at: string;
      author_id: string;
      reply_settings?: string;
      public_metrics?: {
        like_count: number;
        reply_count: number;
        retweet_count: number;
        impression_count?: number;
      };
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
    const replySettings = t.reply_settings || 'everyone';
    return {
      id: t.id,
      author,
      text: t.text,
      createdAt: t.created_at,
      likes: pm.like_count,
      replies: pm.reply_count,
      retweets: pm.retweet_count,
      impressions: pm.impression_count ?? 0,
      ticker,
      score: scoreTweet(pm.like_count, pm.reply_count, ageMin, Boolean(ticker)),
      url: `https://x.com/${author}/status/${t.id}`,
      replySettings,
      canReply: replySettings === 'everyone',
    };
  });
  // Repliable tweets first, then by score.
  return out.sort((a, b) => (Number(b.canReply) - Number(a.canReply)) || (b.score - a.score));
}

/** Broad cashtag search across ALL accounts (not just our targets). */
export async function searchTickers(cashtags: string[], max = 20): Promise<ScanTweet[]> {
  if (!cashtags.length) return [];
  const q = cashtags.map((c) => `$${c}`).join(' OR ');
  const query = encodeURIComponent(`(${q}) -is:retweet -is:reply lang:en`);
  const fields =
    'tweet.fields=public_metrics,created_at,author_id,reply_settings&expansions=author_id&user.fields=username';
  const data = await xGet<{
    data?: Array<{ id: string; text: string; created_at: string; author_id: string; reply_settings?: string; public_metrics?: { like_count: number; reply_count: number; retweet_count: number; impression_count?: number } }>;
    includes?: { users?: Array<{ id: string; username: string }> };
  }>(`/2/tweets/search/recent?query=${query}&max_results=${Math.min(max, 100)}&${fields}`);
  const users = new Map((data.includes?.users || []).map((u) => [u.id, u.username]));
  const now = Date.now();
  const out: ScanTweet[] = (data.data || []).map((t) => {
    const pm = t.public_metrics || { like_count: 0, reply_count: 0, retweet_count: 0 };
    const ageMin = (now - new Date(t.created_at).getTime()) / 60000;
    const ticker = detectTicker(t.text);
    const author = users.get(t.author_id) || t.author_id;
    const replySettings = t.reply_settings || 'everyone';
    return {
      id: t.id, author, text: t.text, createdAt: t.created_at,
      likes: pm.like_count, replies: pm.reply_count, retweets: pm.retweet_count,
      impressions: pm.impression_count ?? 0, ticker,
      score: scoreTweet(pm.like_count, pm.reply_count, ageMin, Boolean(ticker)),
      url: `https://x.com/${author}/status/${t.id}`, replySettings, canReply: replySettings === 'everyone',
    };
  });
  return out.sort((a, b) => b.score - a.score);
}

export interface Levels {
  price?: number;
  maxPain?: number;
  gammaFlip?: number;
  callWall?: number;
  putFloor?: number;
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

export function extractLevels(s: Structure | null): Levels | null {
  if (!s) return null;
  const levels: Levels = {
    price: s.underlyingPrice ?? s.spotPrice ?? s.gex?.callWall,
    maxPain: s.gex?.maxPain ?? s.maxPain,
    gammaFlip: s.gex?.gammaFlipLevel ?? s.gammaFlipLevel,
    callWall: s.gex?.callWall,
    putFloor: s.gex?.putFloor,
  };
  const has = Object.values(levels).some((v) => typeof v === 'number');
  return has ? levels : null;
}
