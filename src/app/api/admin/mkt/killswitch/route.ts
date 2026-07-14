import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin, getKillSwitch, setKillSwitch, appendAudit } from '@/lib/marketing-console/mkt';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Command-center kill switch: when ON, every publish/draft path refuses.
export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;
  return NextResponse.json({ ok: true, on: await getKillSwitch() });
}

export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;
  let body: { on?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const on = Boolean(body.on);
  await setKillSwitch(on);
  await appendAudit(gate.admin.email, 'killswitch', on ? 'ON (전체 발행 정지)' : 'OFF (재개)');
  return NextResponse.json({ ok: true, on });
}
