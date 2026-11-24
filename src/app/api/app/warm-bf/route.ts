// ============================================================================
// GET /api/app/warm-bf — 웜 블프 카드(lib/app/warmBf) 끄기 스위치·연간 모드 (2026-11-24)
// ----------------------------------------------------------------------------
//   응답: {on:true, annual:false} = 켜짐(월간 구독자는 월간 블프 코드) · {on:true, annual:true} = 월간 구독자에게도 연간 블프 코드
//         {on:false, reason} = 끔/못 읽음 — «모르면 안 보인다», 못 읽음은 캐시하지 않는다(daily-paywall 과 같은 권위 읽기)
//   끄기(재배포 없이): 레디스 warm-bf:off 에 아무 값 · 다시 켜기: DEL. 환경변수 WARM_BF_OFF(재배포 필요)도 같다.
//   연간 모드: 레디스 warm-bf:annual = '1' — ASC 구독 그룹에서 월간·연간을 같은 단계로 옮긴 «뒤»에만(지금은 월간 1·연간 2 → 월간→연간 = 다운그레이드라 애플이 코드 거절).
//   ★11/24 오후 android: true = 안드로이드 블프(lib/app/androidBf — 1회 시트·웜 카드·블프 줄) 켜짐. warm-bf:off = 'android' 이면 안드로이드만 끄고 iOS 는 그대로,
//     그 밖의 참 값('1' 등)은 iOS·안드로이드 모두 끈다. 응답에 android 가 없으면(옛 배포·끔·못 읽음) 안드로이드는 꺼짐.
//   사용자·기기 정보를 읽지도 쓰지도 않는다.
// ============================================================================
import { NextResponse } from 'next/server';
import { getAuthoritativeCache } from '@/services/redisClient';
import { WARM_BF_ANNUAL_KEY, WARM_BF_OFF_KEY, warmSwitchAndroid, warmSwitchValue } from '@/lib/app/warmBf';

export const dynamic = 'force-dynamic';

const READ_BUDGET_MS = 1_500;
const CACHED = { 'cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' };
const NO_STORE = { 'cache-control': 'no-store' };

export async function GET() {
  if (!warmSwitchValue({ env: process.env.WARM_BF_OFF, off: null, annual: null }).on) {
    return NextResponse.json({ on: false, reason: 'env' }, { headers: CACHED });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let got: [{ ok: boolean; value: unknown }, { ok: boolean; value: unknown }] | null = null;
  try {
    got = await Promise.race([
      Promise.all([getAuthoritativeCache<unknown>(WARM_BF_OFF_KEY), getAuthoritativeCache<unknown>(WARM_BF_ANNUAL_KEY)]),
      new Promise<null>((r) => { timer = setTimeout(() => r(null), READ_BUDGET_MS); }),
    ]);
  } catch {
    return NextResponse.json({ on: false, reason: 'error' }, { headers: NO_STORE });
  } finally {
    clearTimeout(timer);
  }
  if (!got) return NextResponse.json({ on: false, reason: 'slow' }, { headers: NO_STORE });
  if (!got[0].ok || !got[1].ok) return NextResponse.json({ on: false, reason: 'error' }, { headers: NO_STORE });
  const v = warmSwitchValue({ env: process.env.WARM_BF_OFF, off: got[0].value, annual: got[1].value });
  if (!v.on) return NextResponse.json({ on: false, reason: 'switch' }, { headers: CACHED });
  const android = warmSwitchAndroid({ env: process.env.WARM_BF_OFF, off: got[0].value });
  return NextResponse.json({ on: true, annual: v.annual, android }, { headers: CACHED });
}
