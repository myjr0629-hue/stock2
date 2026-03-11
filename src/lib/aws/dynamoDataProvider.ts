/**
 * [AWS Phase 2] DynamoDB Data Provider
 * Reads pre-computed data from Lambda harvest (300 tickers every 5 min)
 * Used by ALL pages as primary data source (Polygon = fallback only)
 * 
 * Tables:
 *  - signum-alpha-history: 300 tickers price/OHLCV (5 min intervals)
 *  - signum-gex-history: 50 tickers GEX/PCR/CallWall/PutFloor
 *  - signum-flow-history: 50 tickers options flow
 *  - signum-sector-daily: sector rankings
 */

import { queryItems, TABLES, getDynamoClient } from './dynamoClient';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// ====== Price Data (signum-alpha-history) ======

export interface DynamoPriceData {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  changePct: number;
}

/**
 * Get latest price data for a ticker from DynamoDB
 * Lambda writes every 5 minutes during market hours
 */
export async function getLatestPrice(ticker: string): Promise<DynamoPriceData | null> {
  try {
    const items = await queryItems<DynamoPriceData>(
      TABLES.ALPHA_HISTORY,
      'ticker = :tk',
      { ':tk': ticker },
      { limit: 1, scanForward: false }
    );
    return items[0] || null;
  } catch (e) {
    console.error(`[DynamoDB] getLatestPrice(${ticker}) failed:`, e);
    return null;
  }
}

/**
 * Get latest prices for multiple tickers (batch)
 * Returns Map<ticker, DynamoPriceData>
 */
export async function getLatestPrices(tickers: string[]): Promise<Map<string, DynamoPriceData>> {
  const result = new Map<string, DynamoPriceData>();
  // Parallel queries (DynamoDB handles concurrency well)
  const promises = tickers.map(async (ticker) => {
    const data = await getLatestPrice(ticker);
    if (data) result.set(ticker, data);
  });
  await Promise.all(promises);
  return result;
}

/**
 * Get price history for a ticker (for charts)
 * Returns up to `days` entries
 */
export async function getPriceHistory(ticker: string, days: number = 30): Promise<DynamoPriceData[]> {
  return queryItems<DynamoPriceData>(
    TABLES.ALPHA_HISTORY,
    'ticker = :tk',
    { ':tk': ticker },
    { limit: days * 12, scanForward: false } // ~12 entries per day (5 min intervals, 1 hour market)
  );
}

// ====== GEX Data (signum-gex-history) ======

export interface DynamoGexData {
  ticker: string;
  timestamp: number;
  gex: number;
  flipLevel: number | null;
  callWall: number | null;
  putFloor: number | null;
  maxPain: number | null;
  price: number;
  gammaRegime: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  totalContracts: number;
  totalCallOI: number;
  totalPutOI: number;
  pcr: number;
}

/**
 * Get latest GEX data for a ticker
 * Lambda calculates full options chain for 50 tickers
 */
export async function getLatestGex(ticker: string): Promise<DynamoGexData | null> {
  try {
    const items = await queryItems<DynamoGexData>(
      TABLES.GEX_HISTORY,
      'ticker = :tk',
      { ':tk': ticker },
      { limit: 1, scanForward: false }
    );
    return items[0] || null;
  } catch (e) {
    console.error(`[DynamoDB] getLatestGex(${ticker}) failed:`, e);
    return null;
  }
}

/**
 * Get GEX history for percentile calculations and charts
 */
export async function getGexHistory(ticker: string, limit: number = 30): Promise<DynamoGexData[]> {
  return queryItems<DynamoGexData>(
    TABLES.GEX_HISTORY,
    'ticker = :tk',
    { ':tk': ticker },
    { limit, scanForward: false }
  );
}

// ====== Flow Data (signum-flow-history) ======

export interface DynamoFlowData {
  ticker: string;
  timestamp: number;
  compositeScore: number;
  opi: number;
  whaleScore: number;
  dex: number;
  ivSkew: number;
  squeezeProbability: number;
  smartMoneyScore: number;
  totalCallOI: number;
  totalPutOI: number;
  pcr: number;
}

/**
 * Get latest flow data for a ticker
 */
export async function getLatestFlow(ticker: string): Promise<DynamoFlowData | null> {
  try {
    const items = await queryItems<DynamoFlowData>(
      TABLES.FLOW_HISTORY,
      'ticker = :tk',
      { ':tk': ticker },
      { limit: 1, scanForward: false }
    );
    return items[0] || null;
  } catch (e) {
    return null;
  }
}

// ====== Pattern DB Data (signum-pattern-db) ======
// Lambda v5 stores detailed data with pk='TYPE:TICKER', sk='YYYY-MM-DD'

async function getPatternData(pattern: string): Promise<any | null> {
  try {
    const items = await queryItems<any>(
      TABLES.PATTERN_DB,
      'pattern = :p',
      { ':p': pattern },
      { limit: 1, scanForward: false }
    );
    return items[0] || null;
  } catch {
    return null;
  }
}

export async function getAnalystData(ticker: string) {
  return getPatternData(`ANALYST:${ticker}`);
}

export async function getEarningsData(ticker: string) {
  return getPatternData(`EARNINGS:${ticker}`);
}

export async function getFundamentalsData(ticker: string) {
  return getPatternData(`FUND:${ticker}`);
}

export async function getRelatedData(ticker: string) {
  return getPatternData(`RELATED:${ticker}`);
}

// ====== Combined Data Provider ======

export interface DynamoTickerSnapshot {
  price: (DynamoPriceData & { sma50?: number; sma200?: number; cross?: string; crossType?: string }) | null;
  gex: DynamoGexData | null;
  flow: DynamoFlowData | null;
  analyst: any | null;
  earnings: any | null;
  fundamentals: any | null;
  related: any | null;
}

/**
 * Get ALL available DynamoDB data for a single ticker in parallel
 * This is the primary entry point for page APIs
 */
export async function getTickerSnapshot(ticker: string): Promise<DynamoTickerSnapshot> {
  const [price, gex, flow, analyst, earnings, fundamentals, related] = await Promise.all([
    getLatestPrice(ticker),
    getLatestGex(ticker),
    getLatestFlow(ticker),
    getAnalystData(ticker),
    getEarningsData(ticker),
    getFundamentalsData(ticker),
    getRelatedData(ticker),
  ]);
  return { price, gex, flow, analyst, earnings, fundamentals, related };
}

/**
 * Check if DynamoDB data is fresh enough to use
 * - For date strings (YYYY-MM-DD from alpha-history): today's data = fresh
 * - For timestamps (from gex/flow-history): < maxAgeMs = fresh
 */
export function isDataFresh(timestamp: number | string, maxAgeMs: number = 10 * 60 * 1000): boolean {
  if (typeof timestamp === 'string') {
    // YYYY-MM-DD format: compare to today's date in ET
    const etDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return timestamp === etDate;
  }
  return Date.now() - timestamp < maxAgeMs;
}

