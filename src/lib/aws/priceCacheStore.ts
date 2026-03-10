/**
 * [Phase 2] Price Cache Store — DynamoDB-backed instant price lookup
 * 
 * Lambda writes 150+ ticker prices to DynamoDB every 5 minutes.
 * This module reads the latest cached prices for instant response.
 * 
 * Purpose: Replace individual Polygon API calls with single DynamoDB reads
 * to dramatically reduce latency (Polygon: ~200ms/ticker → DynamoDB: ~30ms/batch)
 */

import { queryItems, TABLES } from './dynamoClient';

export interface CachedPriceData {
    ticker: string;
    date: string;
    close: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    vwap: number;
    changePct: number;
    qualityTier: string;
}

/**
 * Get the latest cached price for a single ticker from DynamoDB
 * Returns the most recent entry (today or yesterday if today hasn't been written yet)
 */
export async function getLatestPrice(ticker: string): Promise<CachedPriceData | null> {
    try {
        const items = await queryItems<CachedPriceData>(
            TABLES.ALPHA_HISTORY,
            'ticker = :t',
            { ':t': ticker },
            { limit: 1, scanForward: false } // newest first
        );
        return items[0] || null;
    } catch {
        return null;
    }
}

/**
 * Get latest prices for multiple tickers in parallel
 * Much faster than calling Polygon API for each ticker individually
 * 
 * Performance: 150 tickers in ~300ms (vs ~30s with Polygon API)
 */
export async function getLatestPricesBatch(tickers: string[]): Promise<Map<string, CachedPriceData>> {
    const result = new Map<string, CachedPriceData>();

    // Query in parallel batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (ticker) => {
            const data = await getLatestPrice(ticker);
            if (data) result.set(ticker, data);
        });
        await Promise.all(promises);
    }

    return result;
}

/**
 * Get price history for a ticker (last N days)
 * Used for sparkline, return3D, RSI calculations
 */
export async function getPriceHistory(ticker: string, days = 20): Promise<CachedPriceData[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
        return await queryItems<CachedPriceData>(
            TABLES.ALPHA_HISTORY,
            'ticker = :t AND #d >= :since',
            { ':t': ticker, ':since': since },
            { limit: days + 5, scanForward: true, expressionNames: { '#d': 'date' } }
        );
    } catch {
        return [];
    }
}

/**
 * Get batch price histories for sparklines
 * Returns Map<ticker, priceHistory[]>
 */
export async function getBatchPriceHistories(tickers: string[], days = 20): Promise<Map<string, CachedPriceData[]>> {
    const result = new Map<string, CachedPriceData[]>();

    const BATCH_SIZE = 10;
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (ticker) => {
            const history = await getPriceHistory(ticker, days);
            if (history.length > 0) result.set(ticker, history);
        });
        await Promise.all(promises);
    }

    return result;
}
