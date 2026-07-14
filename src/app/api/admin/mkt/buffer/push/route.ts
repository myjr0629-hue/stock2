import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin, appendAudit, bumpVolume, getVolume, X_CHANNELS, DAILY_CAP, getKillSwitch, isDuplicateSkeleton, recordSkeleton } from '@/lib/marketing-console/mkt';
import { createPost } from '@/lib/marketing/bufferClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Buffer channel IDs (verified — BUFFER_OPS §1). Draft-only, human publishes.
const BUFFER_CH: Record<string, { id: string; channel: string }> = {
  x_en: { id: '6a518928404834462892924a', channel: X_CHANNELS.en },
  x_ja: { id: '6a53936480cc80cdcaa625d0', channel: X_CHANNELS.ja },
  bluesky: { id: '69ca84bbaf47dacb696d9d0f', channel: X_CHANNELS.bsky },
};

export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  let body: { channelKey?: string; text?: string; mediaUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  if (await getKillSwitch()) {
    return NextResponse.json({ ok: false, error: '킬스위치 ON — 전체 발행 정지 상태' }, { status: 423 });
  }
  const meta = body.channelKey ? BUFFER_CH[body.channelKey] : undefined;
  const text = (body.text || '').trim();
  if (!meta) return NextResponse.json({ ok: false, error: '알 수 없는 채널' }, { status: 400 });
  if (!text) return NextResponse.json({ ok: false, error: '본문이 비어있음' }, { status: 400 });

  // Server-enforced daily cap (§0-2) — reject the 4th of the day.
  const current = await getVolume(meta.channel);
  if (current >= DAILY_CAP) {
    return NextResponse.json(
      { ok: false, error: `볼륨 캡 도달 (${current}/${DAILY_CAP}) — 오늘 이 채널은 더 적재 불가` },
      { status: 429 }
    );
  }

  // Anti-1000-post: block repeated template skeletons within 72h.
  if (await isDuplicateSkeleton(text)) {
    return NextResponse.json(
      { ok: false, error: '중복 구조 차단 — 72h 내 같은 템플릿(숫자만 다름). 다른 포맷/사건으로.' },
      { status: 409 }
    );
  }

  try {
    const res = await createPost({
      channelIds: [meta.id],
      text,
      mediaUrl: body.mediaUrl,
      draft: true, // 불변 — 발행은 항상 사람
    });
    if (!res.success) {
      return NextResponse.json({ ok: false, error: res.error || 'buffer 실패' }, { status: 502 });
    }
    const bumped = await bumpVolume(meta.channel);
    await recordSkeleton(text);
    await appendAudit(gate.admin.email, 'buffer-draft', `${body.channelKey} (${bumped.count}/${DAILY_CAP})`);
    return NextResponse.json({ ok: true, postId: res.postId, count: bumped.count, cap: DAILY_CAP });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
