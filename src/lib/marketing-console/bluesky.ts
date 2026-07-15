// ============================================================================
// Bluesky (AT Protocol) auto-publish. Unlike X, Bluesky has NO cold-reply
// restriction → originals AND replies can auto-post. Needs BLUESKY_HANDLE +
// BLUESKY_APP_PASSWORD (app password from bsky.app settings, NOT the real pw).
// Degrades cleanly (configured=false) when unset.
// ============================================================================

const PDS = 'https://bsky.social';

export function blueskyConfigured(): boolean {
  return Boolean(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD);
}

interface Session { accessJwt: string; did: string; handle: string }

async function createSession(): Promise<Session | null> {
  const identifier = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return null;
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { accessJwt: string; did: string; handle: string };
  return { accessJwt: j.accessJwt, did: j.did, handle: j.handle };
}

/** Post an original Bluesky post (auto-publish). Returns the record uri. */
export async function bskyPost(text: string): Promise<{ ok: boolean; uri?: string; error?: string }> {
  const s = await createSession();
  if (!s) return { ok: false, error: 'BLUESKY_HANDLE / BLUESKY_APP_PASSWORD 미설정 또는 인증 실패' };
  try {
    const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.accessJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: s.did,
        collection: 'app.bsky.feed.post',
        record: { $type: 'app.bsky.feed.post', text: text.slice(0, 300), createdAt: new Date().toISOString() },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const j = (await res.json().catch(() => ({}))) as { uri?: string; error?: string; message?: string };
    if (!res.ok) return { ok: false, error: j.error || j.message || `bsky ${res.status}` };
    return { ok: true, uri: j.uri };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Connection status for the console (does NOT post). */
export async function bskyStatus(): Promise<{ configured: boolean; connected: boolean; handle?: string }> {
  if (!blueskyConfigured()) return { configured: false, connected: false };
  const s = await createSession();
  return { configured: true, connected: Boolean(s), handle: s?.handle };
}

// ---- Reply-target discovery + auto-reply (Bluesky has NO cold-reply limit) --
import { detectTicker } from './xScan';

export interface BskyTarget {
  uri: string;
  cid: string;
  text: string;
  author: string;      // handle
  ticker: string | null;
  likes: number;
  replies: number;
  createdAt: string;
}

// Search terms that surface US-equity/options chatter we can ground.
const BSKY_QUERIES = ['$NVDA', '$TSLA', '$SPY', 'max pain', 'gamma exposure', 'options flow', 'dark pool'];

/** Find recent reply-worthy Bluesky posts that mention a ticker we can ground. */
export async function bskySearchTargets(limit = 30): Promise<BskyTarget[]> {
  const s = await createSession();
  if (!s) return [];
  const seen = new Set<string>();
  const out: BskyTarget[] = [];
  for (const q of BSKY_QUERIES) {
    try {
      const url = `${PDS}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=15&sort=latest`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${s.accessJwt}` }, signal: AbortSignal.timeout(9000) });
      if (!res.ok) continue;
      const j = (await res.json()) as {
        posts?: Array<{ uri: string; cid: string; author?: { handle?: string }; record?: { text?: string; createdAt?: string }; likeCount?: number; replyCount?: number }>;
      };
      for (const p of j.posts || []) {
        if (!p.uri || !p.cid || seen.has(p.uri)) continue;
        const text = p.record?.text || '';
        const author = p.author?.handle || '';
        // Skip our own posts.
        if (author && s.handle && author.toLowerCase() === s.handle.toLowerCase()) continue;
        seen.add(p.uri);
        out.push({
          uri: p.uri, cid: p.cid, text, author,
          ticker: detectTicker(text),
          likes: p.likeCount || 0, replies: p.replyCount || 0,
          createdAt: p.record?.createdAt || '',
        });
      }
    } catch { /* skip this query */ }
    if (out.length >= limit) break;
  }
  return out;
}

/** Post a grounded reply to a target post (root=parent=target for a top-level post). */
export async function bskyReply(target: BskyTarget, text: string): Promise<{ ok: boolean; uri?: string; error?: string }> {
  const s = await createSession();
  if (!s) return { ok: false, error: 'BLUESKY 인증 실패' };
  try {
    const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.accessJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: s.did,
        collection: 'app.bsky.feed.post',
        record: {
          $type: 'app.bsky.feed.post',
          text: text.slice(0, 300),
          createdAt: new Date().toISOString(),
          reply: { root: { uri: target.uri, cid: target.cid }, parent: { uri: target.uri, cid: target.cid } },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const j = (await res.json().catch(() => ({}))) as { uri?: string; error?: string; message?: string };
    if (!res.ok) return { ok: false, error: j.error || j.message || `bsky ${res.status}` };
    return { ok: true, uri: j.uri };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
