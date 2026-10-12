// ============================================================================
// GET /api/app/onboarding-config — 첫 실행 «가치 먼저»(v2)를 보일지 (2026-10-12, 브랜치 feat/first-run-value)
// ----------------------------------------------------------------------------
//   응답: {v2:true} = 새 흐름(법적 고지 → 종목 고르기·AI 한 줄 → 알림) · {v2:false} = 옛 흐름(법적 고지 → 알림 2/2)
//   끄기 스위치(재배포 없이): 레디스 키 onb2:off 에 아무 값(예: SET onb2:off 1) 또는 환경변수 ONB2_OFF=1(재배포 필요).
//     다시 켜기: DEL onb2:off.  CDN 15초 — 키를 넣으면 최대 15초(+재검증 30초) 안에 새로 설치하는 사람부터 옛 흐름이다.
//   못 읽으면(레디스 지연 1.5초 초과·오류) {v2:false, reason} — «모르면 옛 흐름»(알려진 정상 경로)이고, 이 응답은 캐시하지 않는다.
//   사용자·기기 정보를 읽지도 쓰지도 않는다. 이미 첫 안내를 마친 기기(localStorage 'accepted')는 이 값을 묻지도 않는다.
// ============================================================================
import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { ONB2_OFF_KEY, onb2Enabled } from '@/lib/app/onboardingConfig';

export const dynamic = 'force-dynamic';

const READ_BUDGET_MS = 1_500;

export async function GET() {
  if (process.env.ONB2_OFF === '1') {
    return NextResponse.json({ v2: false, reason: 'env' }, { headers: { 'cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' } });
  }
  let redis: unknown;
  try {
    const got = await Promise.race([
      getFromCache<unknown>(ONB2_OFF_KEY).then((v) => ({ v })),
      new Promise<null>((r) => setTimeout(() => r(null), READ_BUDGET_MS)),
    ]);
    if (!got) return NextResponse.json({ v2: false, reason: 'slow' }, { headers: { 'cache-control': 'no-store' } });
    redis = got.v;
  } catch {
    return NextResponse.json({ v2: false, reason: 'error' }, { headers: { 'cache-control': 'no-store' } });
  }
  const v2 = onb2Enabled({ env: process.env.ONB2_OFF, redis });
  return NextResponse.json({ v2, ...(v2 ? {} : { reason: 'switch' }) }, { headers: { 'cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' } });
}
