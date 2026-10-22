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
  // 켜짐에만 서버 시각을 함께 준다 — 기기 시계가 크게 어긋나면 등록 시각 검사에 걸릴 링크를 보내지 않게(꺼짐 응답은 그대로).
  return NextResponse.json(enabled ? { enabled, available, now: Date.now() } : { enabled, available }, { headers: giftHeaders });
}
