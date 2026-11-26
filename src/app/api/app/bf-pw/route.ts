// ============================================================================
// GET /api/app/bf-pw — 정가 페이월 안 «블프 연간 첫 1년 50%» 카드(lib/app/bfPaywall) 끄기 스위치 (2026-11-26)
// ----------------------------------------------------------------------------
//   응답: {on:true} = 켜짐 · {on:false, reason} = 끔/못 읽음 — «모르면 안 보인다», 못 읽음은 캐시하지 않는다(warm-bf·daily-paywall 과 같은 권위 읽기)
//   끄기(재배포 없이): 레디스 bf-pw:off 에 아무 값 · 다시 켜기: DEL. 환경변수 BF_PW_OFF(재배포 필요)도 같다.
//   사용자·기기 정보를 읽지도 쓰지도 않는다.
// ============================================================================
import { NextResponse } from 'next/server';
import { getAuthoritativeCache } from '@/services/redisClient';
import { BF_PW_OFF_KEY, bfPwSwitchValue } from '@/lib/app/bfPaywall';

export const dynamic = 'force-dynamic';

const READ_BUDGET_MS = 1_500;
const CACHED = { 'cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' };
const NO_STORE = { 'cache-control': 'no-store' };

export async function GET() {
  if (!bfPwSwitchValue({ env: process.env.BF_PW_OFF, off: null })) {
    return NextResponse.json({ on: false, reason: 'env' }, { headers: CACHED });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let got: { ok: boolean; value: unknown } | null = null;
  try {
    got = await Promise.race([
      getAuthoritativeCache<unknown>(BF_PW_OFF_KEY),
      new Promise<null>((r) => { timer = setTimeout(() => r(null), READ_BUDGET_MS); }),
    ]);
  } catch {
    return NextResponse.json({ on: false, reason: 'error' }, { headers: NO_STORE });
  } finally {
    clearTimeout(timer);
  }
  if (!got) return NextResponse.json({ on: false, reason: 'slow' }, { headers: NO_STORE });
  if (!got.ok) return NextResponse.json({ on: false, reason: 'error' }, { headers: NO_STORE });
  if (!bfPwSwitchValue({ env: process.env.BF_PW_OFF, off: got.value })) return NextResponse.json({ on: false, reason: 'switch' }, { headers: CACHED });
  return NextResponse.json({ on: true }, { headers: CACHED });
}
