import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { getTradeKill, setTradeKill, tradeJournal } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  return NextResponse.json({ ok: true, on: await getTradeKill() });
}

export async function POST(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  let b: { on?: boolean };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  await setTradeKill(Boolean(b.on));
  await tradeJournal({ at: Date.now(), who: gate.admin.email, action: b.on ? 'kill-on' : 'kill-off', detail: '트레이드 킬스위치' });
  return NextResponse.json({ ok: true, on: Boolean(b.on) });
}
