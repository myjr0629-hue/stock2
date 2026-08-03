// ============================================================================
// /api/guardian/breaking — 오늘의 급변동 속보 (앱 가디언 화면이 읽는다)
// ----------------------------------------------------------------------------
// 감지는 /api/cron/breaking-detect 가 하고 Redis에 쌓는다. 여기는 읽기 전용.
//
// 🅢 섀도 모드에서는 «빈 배열»을 준다.
//   감지기는 이미 돌지만 사용자에게는 아무것도 안 보인다 — 그게 섀도의 정의다.
//   ?debug=1(+CRON_SECRET)로만 섀도 항목까지 본다. 대표 검증용.
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { etDate } from '@/services/breaking/sigmaEngine';
import type { BreakingItem } from '@/app/api/cron/breaking-detect/route';
import type { Locale } from '@/services/breaking/whyBuilder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEED_KEY = (d: string) => `breaking:feed:v1:${d}`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('locale') || 'en').slice(0, 2);
  const loc: Locale = raw === 'ko' ? 'ko' : raw === 'ja' ? 'ja' : 'en';

  // 디버그 열람은 크론 시크릿을 요구한다 — 섀도 데이터가 공개로 새면 안 된다.
  const debug = searchParams.get('debug') === '1'
    && !!process.env.CRON_SECRET
    && searchParams.get('secret') === process.env.CRON_SECRET;

  const today = etDate();
  const feed = (await getFromCache<BreakingItem[]>(FEED_KEY(today))) ?? [];

  // 섀도 항목은 일반 요청에 노출하지 않는다.
  const visible = debug ? feed : feed.filter((f) => f.mode === 'live');

  const items = visible
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((f) => ({
      id: f.id,
      symbol: f.signal.symbol,
      kind: f.signal.kind,
      changePct: +f.signal.changePct.toFixed(2),
      priorPct: f.signal.priorPct != null ? +f.signal.priorPct.toFixed(2) : null,
      sigmaMult: +f.signal.sigmaMult.toFixed(2),
      volumeMult: +f.signal.volumeMult.toFixed(2),
      dayChangePct: +f.signal.dayChangePct.toFixed(2),
      price: f.signal.price,
      atET: f.signal.atET,
      headline: f.copy[loc]?.headline ?? f.copy.en.headline,
      why: f.copy[loc]?.why ?? f.copy.en.why,
      confidence: f.context[loc]?.confidence ?? 'NONE',
      news: (f.context[loc] ?? f.context.en).news,
      calendar: (f.context[loc] ?? f.context.en).calendar,
      mode: f.mode,
    }));

  return NextResponse.json(
    { items, date: today, count: items.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
