// ============================================================================
// Stocktwits discovery (public read, no key). Write has no API → manual paste.
// Scans $TICKER cashtag streams, scores high-value messages we can add data to.
// Stocktwits requires a real User-Agent (empty UA → 403). May throttle a
// datacenter IP; degrades to an error the caller surfaces.
// ============================================================================

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export interface StMessage {
  id: number;
  ticker: string;
  body: string;
  user: string;
  followers: number;
  sentiment: string | null;
  likes: number;
  replies: number;
  createdAt: string;
  url: string;
  score: number;
}

function scoreMsg(followers: number, likes: number, replies: number, isQuestion: boolean): number {
  return Math.round(followers / 50 + likes * 3 + replies * 4 + (isQuestion ? 8 : 0));
}

/** Scan one ticker's Stocktwits stream for reply-worthy messages. */
export async function scanStocktwits(tickers: string[], perTicker = 8): Promise<StMessage[]> {
  const out: StMessage[] = [];
  await Promise.all(
    tickers.map(async (t) => {
      try {
        const res = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(t)}.json?limit=${perTicker}`, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(9000),
        });
        if (!res.ok) return;
        const j = (await res.json()) as {
          messages?: Array<{
            id: number; body: string; created_at: string;
            user?: { username: string; followers: number };
            entities?: { sentiment?: { basic?: string } | null };
            likes?: { total?: number };
            conversation?: { replies?: number };
          }>;
        };
        for (const m of j.messages || []) {
          const followers = m.user?.followers ?? 0;
          const likes = m.likes?.total ?? 0;
          const replies = m.conversation?.replies ?? 0;
          const body = m.body || '';
          const isQuestion = /\?/.test(body);
          out.push({
            id: m.id,
            ticker: t.toUpperCase(),
            body,
            user: m.user?.username || 'user',
            followers,
            sentiment: (m.entities?.sentiment && m.entities.sentiment.basic) || null,
            likes,
            replies,
            createdAt: m.created_at,
            url: `https://stocktwits.com/${m.user?.username || 'symbol'}/message/${m.id}`,
            score: scoreMsg(followers, likes, replies, isQuestion),
          });
        }
      } catch { /* skip a ticker that errors/throttles */ }
    })
  );
  return out.sort((a, b) => b.score - a.score);
}
