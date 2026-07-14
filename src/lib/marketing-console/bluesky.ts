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
