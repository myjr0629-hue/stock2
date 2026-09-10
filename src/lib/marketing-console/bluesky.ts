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

// ---------------------------------------------------------------------------
// Rich-text facets. AT Protocol linkifies NOTHING on its own — the bsky.app
// composer computes facets client-side, which is why a hand-typed post has a
// live link and an API post of the same text ships it as dead plain text.
// autopilot appends our smartlink to every Bluesky post, so without this the
// CTA was unclickable on every auto-published post.
// Indices are UTF-8 BYTE offsets — ko/ja text must never be measured with
// String.length.
// ---------------------------------------------------------------------------
const ENC = new TextEncoder();
const FACET_URL_RE = /(^|\s|\()((?:https?:\/\/\S+)|(?:[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?))/gim;
const FACET_TAG_RE = /(^|\s)(#[^\s#]{1,64})/g;
// Cashtags are a #tag facet whose value KEEPS the '$' (verified against a post
// made by the official composer). This is what puts us in $TICKER search feeds.
const FACET_CASHTAG_RE = /(^|\s)(\$[A-Za-z][A-Za-z.-]{0,6})\b/g;

export function buildFacets(text: string): unknown[] {
  const facets: unknown[] = [];
  const byteOf = (upTo: number) => ENC.encode(text.slice(0, upTo)).length;

  for (const m of text.matchAll(FACET_URL_RE)) {
    const start = (m.index ?? 0) + m[1].length;
    // Trailing punctuation belongs to the sentence, not the URL.
    let raw = m[2].replace(/[.,;:!?'"]+$/, '');
    if (raw.endsWith(')') && !raw.includes('(')) raw = raw.slice(0, -1);
    if (!raw) continue;
    const uri = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    facets.push({
      index: { byteStart: byteOf(start), byteEnd: byteOf(start + raw.length) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
    });
  }

  for (const m of text.matchAll(FACET_TAG_RE)) {
    const start = (m.index ?? 0) + m[1].length;
    const tag = m[2].replace(/[.,;:!?]+$/, '');
    if (tag.length < 2) continue;
    facets.push({
      index: { byteStart: byteOf(start), byteEnd: byteOf(start + tag.length) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: tag.slice(1) }],
    });
  }

  for (const m of text.matchAll(FACET_CASHTAG_RE)) {
    const start = (m.index ?? 0) + m[1].length;
    const cash = m[2].replace(/[.-]+$/, '').toUpperCase();
    if (cash.length < 2) continue;
    facets.push({
      index: { byteStart: byteOf(start), byteEnd: byteOf(start + cash.length) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: cash }],
    });
  }

  return facets;
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
    // Facets are byte-indexed into the FINAL text, so truncate first.
    const finalText = text.slice(0, 300);
    const record: Record<string, unknown> = { $type: 'app.bsky.feed.post', text: finalText, createdAt: new Date().toISOString() };
    const facets = buildFacets(finalText);
    if (facets.length) record.facets = facets;
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
  const replyText = text.slice(0, 300);
  const replyFacets = buildFacets(replyText);
  try {
    const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.accessJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: s.did,
        collection: 'app.bsky.feed.post',
        record: {
          $type: 'app.bsky.feed.post',
          text: replyText,
          createdAt: new Date().toISOString(),
          ...(replyFacets.length ? { facets: replyFacets } : {}),
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
