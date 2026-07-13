import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY X API connectivity probe.
// Confirms X_CLIENT_ID / X_CLIENT_SECRET / X_BEARER_TOKEN are present and that the
// app-only Bearer token can perform a real read. Returns NO secret values.
// Gated by a probe token so it isn't a fully-open endpoint. Safe to delete after verifying.

export const dynamic = 'force-dynamic';

const PROBE = 'signum-xtest-2026';

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== PROBE) {
    return new NextResponse('Not found', { status: 404 });
  }

  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const bearer = process.env.X_BEARER_TOKEN;

  const envPresent = {
    X_CLIENT_ID: Boolean(clientId),
    X_CLIENT_SECRET: Boolean(clientSecret),
    X_BEARER_TOKEN: Boolean(bearer),
  };

  if (!bearer) {
    return NextResponse.json({ envPresent, read: { ok: false, error: 'X_BEARER_TOKEN missing' } }, { status: 200 });
  }

  // Try both current base hosts; report which one answered.
  const hosts = ['https://api.x.com', 'https://api.twitter.com'];
  const results: Array<Record<string, unknown>> = [];

  for (const host of hosts) {
    try {
      const r = await fetch(`${host}/2/users/by/username/signumhq?user.fields=public_metrics`, {
        headers: { Authorization: `Bearer ${bearer}` },
        cache: 'no-store',
      });
      const status = r.status;
      const body = await r.json().catch(() => null);
      const data = body?.data;
      results.push({
        host,
        status,
        ok: r.ok,
        username: data?.username ?? null,
        followers: data?.public_metrics?.followers_count ?? null,
        // surface X error title only (no token, no PII), for diagnosis
        error: body?.errors?.[0]?.title ?? body?.title ?? null,
      });
      if (r.ok) break;
    } catch (e) {
      results.push({ host, ok: false, error: (e as Error).message });
    }
  }

  const success = results.find((x) => x.ok);
  return NextResponse.json({ envPresent, read: success ?? results }, { status: 200 });
}
