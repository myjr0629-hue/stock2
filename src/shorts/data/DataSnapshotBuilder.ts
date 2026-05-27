// ============================================================================
// DataSnapshotBuilder — Pull all SignumHQ data for a ticker
// Wraps existing services for the Shorts Engine pipeline.
// ============================================================================

import type { MarketSnapshot, TickerStructure } from '../types';

/**
 * Build a full market snapshot for video generation.
 * In production, this pulls from Redis/EC2 via existing services.
 * For now, provides the interface for MISSION 03+ integration.
 */
export async function buildMarketSnapshot(tickers: string[]): Promise<MarketSnapshot> {
  // MISSION 03: Wire to existing services
  // - structureService.analyzeGammaStructure() for callWall/putFloor/gammaFlip/GEX
  // - realtimeMetricsService.fetchTradeData() for darkPool%
  // - Redis yahoo:idx:spx/nasdaq/vix for market context
  // - alphaEngine for alphaScore (→ "Context Score")
  
  console.log(`[DataSnapshot] Building snapshot for: ${tickers.join(', ')}`);
  console.log('[DataSnapshot] Production wiring pending — use mockHiddenWallSnapshot for now');
  
  return {
    timestamp: new Date().toISOString(),
    spy: 0,
    qqq: 0,
    vix: 0,
    gexRegime: 'neutral',
    tickers: {},
    isMock: true,
  };
}

/**
 * Build ticker structure from existing analysis data.
 * Maps internal data shapes to ShortsEngine TickerStructure.
 */
export function mapToTickerStructure(ticker: string, analysis: any, tradeData?: any): TickerStructure {
  return {
    ticker,
    price: analysis?.price?.last || analysis?.currentPrice || 0,
    callWall: analysis?.callWall || analysis?.levels?.callWall || null,
    putFloor: analysis?.putFloor || analysis?.levels?.putFloor || null,
    gammaFlipLevel: analysis?.gammaFlipLevel || null,
    gammaRegime: analysis?.gammaRegime || analysis?.regime || 'neutral',
    gexValue: analysis?.gex || analysis?.netGex || 0,
    darkPoolPercent: tradeData?.darkPoolPercent || 0,
    buyPct: tradeData?.buyPct || 0,
    sellPct: tradeData?.sellPct || 0,
    alphaScore: analysis?.alphaScore || undefined,
  };
}
