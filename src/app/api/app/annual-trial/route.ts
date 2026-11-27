import { NextResponse } from 'next/server';
import { getAuthoritativeCache } from '@/services/redisClient';
import { bfPwSwitchValue } from '@/lib/app/bfPaywall';

export const dynamic = 'force-dynamic';

// 체험 기본 선택은 화면을 열 때마다 확인한다. 읽기 실패나 이전의 켜짐 응답을 재사용하지 않는다.
export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  const env = process.env.ANNUAL_TRIAL_OFF;
  if (!bfPwSwitchValue({ env, off: null })) return NextResponse.json({ on: false }, { headers });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      getAuthoritativeCache<unknown>('annual-trial:off'),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 1500); }),
    ]);
    const on = !!result?.ok && bfPwSwitchValue({ env, off: result.value });
    return NextResponse.json({ on }, { headers });
  } catch {
    return NextResponse.json({ on: false }, { headers });
  } finally {
    clearTimeout(timer);
  }
}
