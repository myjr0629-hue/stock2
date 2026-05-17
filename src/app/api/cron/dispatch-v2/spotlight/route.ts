// ============================================================================
// Dispatch V2 — Spotlight (종목 심층 분석)
// M7 주목 종목 3개 연속 draft → 유저가 체인 트윗으로 조합 후 수동 발행
// ============================================================================

import { NextResponse } from 'next/server';
import { prepareSpotlight } from '@/lib/marketing-v2/prepare/spotlight';
import { checkAuth, parseParams, dispatchToAll, buildResponse } from '../_shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // 3개 종목 순차 처리

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { dryRun, date, ticker, region } = parseParams(request);
  const startTime = Date.now();

  // 체인 트윗 수: 메인 1 + 추가 2 = 총 3개
  const chainCount = 3;

  try {
    console.log(`[DispatchV2/Spotlight] Starting chain×${chainCount}... region=${region} dryRun=${dryRun}`);

    const allResults: any[] = [];
    const tickers: string[] = [];

    for (let i = 0; i < chainCount; i++) {
      const label = i === 0 ? 'MAIN' : `CHAIN_${i}`;
      
      // 첫번째는 지정 ticker 사용, 나머지는 자동 선택 (dedup이 이전 티커 제외)
      const pkg = await prepareSpotlight({
        date,
        dryRun,
        ticker: i === 0 ? ticker : undefined,
      });

      const selectedTicker = pkg.metrics?.ticker || 'UNKNOWN';
      tickers.push(selectedTicker);
      console.log(`[DispatchV2/Spotlight] ${label}: $${selectedTicker}`);

      // 모든 채널 draft=true로 발행
      const results = await dispatchToAll(pkg, { dryRun, draft: true, region });
      allResults.push(...results);
    }

    const elapsed = `${Date.now() - startTime}ms`;
    const success = allResults.filter(r => r.success).length;
    const failed = allResults.filter(r => !r.success && !r.dryRun).length;

    return NextResponse.json({
      slot: 'spotlight',
      date: date || new Date().toISOString().split('T')[0],
      region,
      elapsed,
      chainTickers: tickers,
      platforms: 'twitter, threads, bluesky',
      results: {
        total: allResults.length,
        success,
        skipped: allResults.filter(r => r.postId === 'dedup_skipped').length,
        failed,
        dryRun: allResults.filter(r => r.dryRun).length,
      },
      details: allResults,
    });
  } catch (err: any) {
    console.error('[DispatchV2/Spotlight] Error:', err);
    return NextResponse.json({ error: err.message, slot: 'spotlight' }, { status: 500 });
  }
}
