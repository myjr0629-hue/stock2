import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin, appendAudit, bumpVolume, getVolume, X_CHANNELS, DAILY_CAP, getKillSwitch, isDuplicateSkeleton, recordSkeleton } from '@/lib/marketing-console/mkt';
import { bskyPost } from '@/lib/marketing-console/bluesky';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// Bluesky LIVE publish (no draft restriction on Bluesky). Human-triggered from
// the console; same guardrails as Buffer path: kill switch + daily cap + skeleton
// dedup + audit. Bluesky = the one channel where posting auto-goes-live.
export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  let body: { text?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const text = (body.text || '').trim();
  if (!text) return NextResponse.json({ ok: false, error: '본문이 비어있음' }, { status: 400 });

  if (await getKillSwitch()) return NextResponse.json({ ok: false, error: '킬스위치 ON — 발행 정지' }, { status: 423 });

  const channel = X_CHANNELS.bsky;
  const current = await getVolume(channel);
  if (current >= DAILY_CAP) return NextResponse.json({ ok: false, error: `볼륨 캡 (${current}/${DAILY_CAP})` }, { status: 429 });
  if (await isDuplicateSkeleton(text)) return NextResponse.json({ ok: false, error: '중복 구조 차단 (72h)' }, { status: 409 });

  const res = await bskyPost(text);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 502 });

  const bumped = await bumpVolume(channel);
  await recordSkeleton(text);
  await appendAudit(gate.admin.email, 'bluesky-post', `${bumped.count}/${DAILY_CAP} · ${res.uri?.split('/').pop() || ''}`);
  return NextResponse.json({ ok: true, uri: res.uri, count: bumped.count, cap: DAILY_CAP });
}
