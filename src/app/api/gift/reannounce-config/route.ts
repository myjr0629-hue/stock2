import { NextResponse } from 'next/server';
import { getAuthoritativeCache } from '@/services/redisClient';
import { GIFT_REANNOUNCE_SWITCH } from '@/lib/gift/giftAnnounce';

export const dynamic = 'force-dynamic';

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let enabled = false;
  try {
    const result = await Promise.race([
      getAuthoritativeCache<unknown>(GIFT_REANNOUNCE_SWITCH),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 1500); }),
    ]);
    enabled = result.ok && (result.value === '1' || result.value === 1);
  } catch { /* 조회 실패 시 회차 비활성 */ }
  finally { clearTimeout(timer); }
  return NextResponse.json({ enabled }, { headers: { 'cache-control': 'no-store' } });
}
