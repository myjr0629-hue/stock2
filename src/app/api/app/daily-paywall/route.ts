// ============================================================================
// GET /api/app/daily-paywall — 무료 사용자 «하루 한 번» 앱 열 때 페이월(출처 daily_open) 끄기 스위치 (2026-11-23)
// ----------------------------------------------------------------------------
//   응답: {on:true} = 켜짐 · {on:true, off:'ios'|'android'} = 그 플랫폼만 끔 · {on:false, reason} = 전부 끔/못 읽음
//   끄기(재배포 없이): 레디스 키 daily-paywall:off 에 값 — '1'(전부) · 'ios' · 'android'. 다시 켜기: DEL daily-paywall:off.
//     환경변수 DAILY_PAYWALL_OFF(같은 값, 재배포 필요)도 같다. CDN 15초(+재검증 30초) 안에 반영 — 이미 열린 앱은 다음 실행부터.
//   못 읽으면(레디스 지연 1.5초 초과·오류) {on:false} — «모르면 안 보인다»(예전 그대로의 앱), 이 응답은 캐시하지 않는다.
//   사용자·기기 정보를 읽지도 쓰지도 않는다. 판정 규칙은 lib/app/dailyPaywall 머리말.
// ============================================================================
import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { DAILY_PAYWALL_OFF_KEY, dailyOffScope } from '@/lib/app/dailyPaywall';

export const dynamic = 'force-dynamic';

const READ_BUDGET_MS = 1_500;
const CACHED = { 'cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' };

export async function GET() {
  if (dailyOffScope({ env: process.env.DAILY_PAYWALL_OFF, redis: null }) === 'all') {
    return NextResponse.json({ on: false, reason: 'env' }, { headers: CACHED });
  }
  let redis: unknown;
  try {
    const got = await Promise.race([
      getFromCache<unknown>(DAILY_PAYWALL_OFF_KEY).then((v) => ({ v })),
      new Promise<null>((r) => setTimeout(() => r(null), READ_BUDGET_MS)),
    ]);
    if (!got) return NextResponse.json({ on: false, reason: 'slow' }, { headers: { 'cache-control': 'no-store' } });
    redis = got.v;
  } catch {
    return NextResponse.json({ on: false, reason: 'error' }, { headers: { 'cache-control': 'no-store' } });
  }
  const off = dailyOffScope({ env: process.env.DAILY_PAYWALL_OFF, redis });
  if (off === 'all') return NextResponse.json({ on: false, reason: 'switch' }, { headers: CACHED });
  return NextResponse.json(off ? { on: true, off } : { on: true }, { headers: CACHED });
}
