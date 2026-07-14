// ============================================================================
// Reddit discovery (read-only, app-only OAuth via a "script" app).
// Finds threads where OUR options data adds value. Posting stays 100% human
// (rewrite required — r/Daytrading R4 bans AI-generated content).
// Needs REDDIT_CLIENT_ID / REDDIT_SECRET (free script app). Degrades cleanly
// with a clear message if unset. Uses OUR user-agent (Reddit requires it).
// ============================================================================

import { getFromCache, setInCache } from '@/services/redisClient';
import { detectTicker } from './xScan';

const UA = 'web:signum-marketing:1.0 (by /u/seamoca)';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const OAUTH = 'https://oauth.reddit.com';

export function redditConfigured(): boolean {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_SECRET);
}

interface CachedToken { token: string; expires_at: number }

async function appToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_SECRET;
  if (!id || !secret) return null;

  const cached = await getFromCache<CachedToken>('mkt:reddit:token');
  if (cached && Date.now() < cached.expires_at) return cached.token;

  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  await setInCache('mkt:reddit:token', { token: j.access_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000 - 60000 }, (j.expires_in || 3600) - 60);
  return j.access_token;
}

export interface RedditThread {
  id: string;
  sub: string;
  title: string;
  selftext: string;
  author: string;
  score: number;
  numComments: number;
  createdUtc: number;
  permalink: string;
  ticker: string | null;
  relevance: number; // our-data-answers score
}

// A thread is relevant when it mentions a ticker we cover and asks/discusses
// levels/structure (the exact gap our data fills).
const NEED_WORDS = /\b(max ?pain|gamma|dealer|level|support|resistance|options?|iv|structure|flow|dark ?pool|put|call)\b/i;

function relevanceScore(title: string, body: string, ticker: string | null, ageH: number, comments: number): number {
  let s = 0;
  if (ticker) s += 5;
  const text = `${title} ${body}`;
  if (NEED_WORDS.test(text)) s += 4;
  if (/\?/.test(title)) s += 2; // a question = our data can answer
  s += Math.min(comments / 5, 4); // some traction
  if (ageH <= 3) s += 3; // fresh (rides momentum — best karma window)
  else if (ageH <= 8) s += 1;
  return Math.round(s * 10) / 10;
}

/** Scan target subs for threads our data can answer. */
export async function scanSubs(subs: string[], perSub = 8): Promise<RedditThread[]> {
  const token = await appToken();
  if (!token) throw new Error('REDDIT_CLIENT_ID / REDDIT_SECRET 미설정 — 무료 script 앱 등록 필요');

  const out: RedditThread[] = [];
  const now = Date.now();
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const res = await fetch(`${OAUTH}/r/${sub}/hot?limit=${perSub}`, {
          headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
          signal: AbortSignal.timeout(9000),
        });
        if (!res.ok) return;
        const j = (await res.json()) as { data?: { children?: Array<{ data: Record<string, unknown> }> } };
        for (const c of j.data?.children || []) {
          const d = c.data as {
            id: string; title: string; selftext?: string; author: string; score: number;
            num_comments: number; created_utc: number; permalink: string; stickied?: boolean;
          };
          if (d.stickied) continue;
          const title = d.title || '';
          const body = (d.selftext || '').slice(0, 400);
          const ticker = detectTicker(`${title} ${body}`);
          const ageH = (now / 1000 - d.created_utc) / 3600;
          out.push({
            id: d.id, sub, title, selftext: body, author: d.author, score: d.score,
            numComments: d.num_comments, createdUtc: d.created_utc,
            permalink: `https://www.reddit.com${d.permalink}`, ticker,
            relevance: relevanceScore(title, body, ticker, ageH, d.num_comments),
          });
        }
      } catch { /* skip a sub that errors */ }
    })
  );
  return out.sort((a, b) => b.relevance - a.relevance);
}
