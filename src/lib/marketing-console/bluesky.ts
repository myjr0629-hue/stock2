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

// Bluesky does NOT auto-fetch an OG image from a URL (and our posts carry no
// link anyway) — the level card must be uploaded as a BLOB and embedded, or the
// post ships text-only (the gap the user spotted 2026-07-21). Blob cap ~1MB; our
// /api/og/level PNG is ~100KB. Returns the blob ref to embed, or null on any fail.
async function uploadBskyImage(s: Session, imageUrl: string): Promise<unknown | null> {
  try {
    const img = await fetch(imageUrl, { signal: AbortSignal.timeout(12000) });
    if (!img.ok) return null;
    const contentType = img.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) return null;
    const bytes = Buffer.from(await img.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 976_000) return null; // stay under bsky's ~1MB cap
    const up = await fetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.accessJwt}`, 'Content-Type': contentType },
      body: bytes,
      signal: AbortSignal.timeout(12000),
    });
    if (!up.ok) return null;
    const j = (await up.json().catch(() => ({}))) as { blob?: unknown };
    return j.blob ?? null;
  } catch { return null; }
}

/** Post an original Bluesky post (auto-publish), embedding the level card when
 *  an image URL is given. Returns the record uri. */
export async function bskyPost(text: string, imageUrl?: string, altText = 'SIGNUM HQ — live options levels'): Promise<{ ok: boolean; uri?: string; error?: string; withImage?: boolean }> {
  const s = await createSession();
  if (!s) return { ok: false, error: 'BLUESKY_HANDLE / BLUESKY_APP_PASSWORD 미설정 또는 인증 실패' };
  try {
    const record: Record<string, unknown> = { $type: 'app.bsky.feed.post', text: text.slice(0, 300), createdAt: new Date().toISOString() };
    let withImage = false;
    if (imageUrl) {
      const blob = await uploadBskyImage(s, imageUrl);
      if (blob) {
        record.embed = { $type: 'app.bsky.embed.images', images: [{ alt: altText, image: blob, aspectRatio: { width: 1200, height: 675 } }] };
        withImage = true;
      }
    }
    const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.accessJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record }),
      signal: AbortSignal.timeout(12000),
    });
    const j = (await res.json().catch(() => ({}))) as { uri?: string; error?: string; message?: string };
    if (!res.ok) return { ok: false, error: j.error || j.message || `bsky ${res.status}` };
    return { ok: true, uri: j.uri, withImage };
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
// Cashtags first (highest ground-ability) — aligned with the expanded ST_TICKERS
// attention pool; concept terms catch discussions with no cashtag.
const BSKY_QUERIES = [
  '$NVDA', '$TSLA', '$SPY', '$QQQ', '$AMD', '$PLTR', '$COIN', '$MSTR', '$SMCI',
  'max pain', 'gamma exposure', 'options flow', 'dark pool', '0DTE', 'call wall',
];

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
