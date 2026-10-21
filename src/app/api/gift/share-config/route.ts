import { NextResponse } from 'next/server';
import { giftEnabled } from '@/lib/giftShare/config';
import { giftAvailable, giftStore } from '@/lib/giftShare/server';
import { giftHeaders } from '@/lib/giftShare/http';

export const dynamic = 'force-dynamic';
export async function GET() {
  const enabled = giftEnabled();
  let available = false;
  if (enabled) {
    try { const store = giftStore(); available = !!store && await giftAvailable(store); } catch { /* 일반 공유 */ }
  }
  return NextResponse.json({ enabled, available }, { headers: giftHeaders });
}
