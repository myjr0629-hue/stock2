// ============================================================================
// publicBase — canonical base URL for server-side self-calls (fetch to own /api/*)
// ----------------------------------------------------------------------------
// A server route must NEVER self-call using the request-derived origin. Cron/warm
// routes run at their invocation URL — a protected *.vercel.app deployment URL — so
// a self-call there returns 401/redirect and fails SILENTLY (empty result). If that
// result is cached + shared, every user gets the degraded output even from www.
// (This is exactly what killed the UC money layer + Guardian News Pulse, 2026-07.)
//
// Rule: use the request origin ONLY when it is already the public signumhq host;
// otherwise fall back to the canonical www host (public, unauthenticated), and
// normalize apex → www so the self-call never eats a 307 redirect.
// ============================================================================

const norm = (u: string) => u.replace('https://signumhq.com', 'https://www.signumhq.com');

export function publicBase(origin?: string | null): string {
  if (origin && /^https:\/\/(www\.)?signumhq\.com/.test(origin)) return norm(origin);
  return norm(process.env.NEXT_PUBLIC_BASE_URL || 'https://www.signumhq.com');
}
