// ============================================================================
// MarketEventDetector — Detect video-worthy market events
// Wraps existing event-detect logic for the Shorts Engine pipeline.
// ============================================================================

import type { MarketEvent, TickerStructure, MarketSnapshot } from '../types';

const TRACKED_TICKERS = [
  'SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA',
  'AMD', 'AVGO', 'ARM', 'PLTR', 'SMCI',
  'CRM', 'SNOW', 'NET', 'CRWD',
  'COIN', 'SQ', 'PYPL',
  'LLY', 'MRNA', 'ABBV',
  'BA', 'LMT', 'XOM',
  'DIS', 'NFLX', 'SHOP', 'UBER', 'RIVN',
];

/** Detect hidden wall events — price approaching call wall or put floor */
export function detectHiddenWallEvent(ticker: TickerStructure): MarketEvent | null {
  if (!ticker.callWall || !ticker.putFloor || ticker.price <= 0) return null;

  const distToCall = ((ticker.callWall - ticker.price) / ticker.price) * 100;
  const distToPut = ((ticker.price - ticker.putFloor) / ticker.price) * 100;
  const nearest = distToCall < distToPut ? 'call' : 'put';
  const nearestDist = Math.min(distToCall, distToPut);

  // Only trigger if within 3% of a wall
  if (nearestDist > 3) return null;

  const wallType = nearest === 'call' ? 'Call Wall' : 'Put Floor';
  const wallPrice = nearest === 'call' ? ticker.callWall : ticker.putFloor;

  return {
    id: `hidden-wall-${ticker.ticker}-${Date.now()}`,
    type: 'hidden_wall',
    ticker: ticker.ticker,
    timestamp: new Date().toISOString(),
    title: `${ticker.ticker} approaching ${wallType}`,
    description: `${ticker.ticker} is ${nearestDist.toFixed(1)}% from the ${wallType} at $${wallPrice}`,
    data: ticker,
    marketContext: {},
  };
}

/** Detect all video-worthy events from a snapshot */
export function detectAllEvents(snapshot: MarketSnapshot): MarketEvent[] {
  const events: MarketEvent[] = [];

  for (const [, tickerData] of Object.entries(snapshot.tickers)) {
    const wallEvent = detectHiddenWallEvent(tickerData);
    if (wallEvent) events.push(wallEvent);
  }

  return events;
}

export { TRACKED_TICKERS };
