import { NextResponse } from 'next/server';
import { getAuthoritativeCache } from '@/services/redisClient';
import { withinDeadline } from '@/lib/app/requestDeadline';

export const dynamic = 'force-dynamic';

export async function GET() {
  let on = process.env.HARD_GATE_ON === '1';
  if (!on) {
    try {
      const result = await withinDeadline(() => getAuthoritativeCache<unknown>('hard-gate:on'), 1500);
      on = result.ok && (result.value === '1' || result.value === 1);
    } catch { /* 기본 off */ }
  }
  return NextResponse.json({ on }, { headers: { 'cache-control': 'no-store' } });
}
