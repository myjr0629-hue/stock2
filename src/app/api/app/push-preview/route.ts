// ============================================================================
// GET /api/app/push-preview?loc=ko|en|ja — 첫 실행 알림 단계의 «이런 알림이 옵니다» 미리보기 (2026-10-12)
// ----------------------------------------------------------------------------
//   응답: {morning:{body,date}} — body = 모닝 푸시가 실제로 쓰는 «AI 한 줄»(lib/push/aiLine 의 모든 검사 통과본), 없으면 null.
//   저장본(레디스 guardian:morning_briefing:{ko,en,ja} 읽기)만 — AI 호출·쓰기 0. CDN 5분.
//   기본 푸시 정책·본문 생성은 건드리지 않는다(읽어서 같은 규칙으로 자르기만).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { mgetFromCache } from '@/services/redisClient';
import { morningPreview } from '@/lib/app/pushPreview';
import type { MorningBriefRecord } from '@/lib/push/aiLine';

export const dynamic = 'force-dynamic';

const READ_BUDGET_MS = 2_500;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('loc');
  const loc = q === 'ko' || q === 'ja' ? q : 'en';
  const none = { morning: { body: null, date: null } };
  try {
    const got = await Promise.race([
      mgetFromCache<MorningBriefRecord>(['guardian:morning_briefing:ko', 'guardian:morning_briefing:en', 'guardian:morning_briefing:ja']),
      new Promise<null>((r) => setTimeout(() => r(null), READ_BUDGET_MS)),
    ]);
    if (!got) return NextResponse.json(none, { headers: { 'cache-control': 'no-store' } });
    const p = morningPreview({ ko: got[0], en: got[1], ja: got[2] }, loc);
    return NextResponse.json({ morning: { body: p.body, date: p.date } }, { headers: { 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=900' } });
  } catch {
    return NextResponse.json(none, { headers: { 'cache-control': 'no-store' } });
  }
}
