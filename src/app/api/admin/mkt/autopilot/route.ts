import { NextRequest, NextResponse } from 'next/server';
import {
  requireMktAdmin, appendAudit,
  getAutoModes, setAutoMode, AUTO_CHANNELS,
  getDeadman, resetDeadman, getAllVolumes, DAILY_CAP,
  type AutoMode, type AutoChannel,
} from '@/lib/marketing-console/mkt';
import { runAutopilotOriginals, runAutopilotReplies } from '@/lib/marketing-console/autopilot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // manual run triggers Bedrock generation

const VALID_MODES: AutoMode[] = ['off', 'shadow', 'live'];

// Console 총지휘소 — read/set per-channel automation modes + deadman state.
export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;
  const [modes, deadman, volumes] = await Promise.all([getAutoModes(), getDeadman(), getAllVolumes()]);
  return NextResponse.json({
    ok: true,
    channels: AUTO_CHANNELS,
    modes,
    deadman: { tripped: Boolean(deadman.trippedAt), fails: deadman.fails || 0, reason: deadman.reason },
    volumes,
    cap: DAILY_CAP,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  let body: { channel?: string; mode?: string; resetDeadman?: boolean; run?: 'originals' | 'replies' | 'all' };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  // Manual deadman reset (after fixing whatever tripped it).
  if (body.resetDeadman) {
    await resetDeadman();
    await appendAudit(gate.admin.email, 'deadman-reset', '');
    return NextResponse.json({ ok: true, reset: true });
  }

  // Manual run — fire the engine once now (same gates as the cron). Lets the
  // operator verify autonomy immediately instead of waiting for the next window.
  if (body.run) {
    const which = body.run;
    await appendAudit(gate.admin.email, 'autopilot-run', which);
    const [originals, replies] = await Promise.all([
      which === 'replies' ? Promise.resolve([]) : runAutopilotOriginals().catch((e) => [{ channel: 'originals', mode: 'off' as const, action: 'fail' as const, ok: false, detail: (e as Error).message }]),
      which === 'originals' ? Promise.resolve([]) : runAutopilotReplies().catch((e) => [{ channel: 'replies', mode: 'off' as const, action: 'fail' as const, ok: false, detail: (e as Error).message }]),
    ]);
    const results = [...originals, ...replies];
    return NextResponse.json({ ok: true, ran: which, posted: results.filter((r) => r.ok).length, results });
  }

  const channel = body.channel as AutoChannel;
  const mode = body.mode as AutoMode;
  if (!AUTO_CHANNELS.includes(channel)) return NextResponse.json({ ok: false, error: '알 수 없는 채널' }, { status: 400 });
  if (!VALID_MODES.includes(mode)) return NextResponse.json({ ok: false, error: 'off|shadow|live 중 하나' }, { status: 400 });

  await setAutoMode(channel, mode);
  await appendAudit(gate.admin.email, 'autopilot-mode', `${channel} → ${mode}`);
  return NextResponse.json({ ok: true, channel, mode });
}
