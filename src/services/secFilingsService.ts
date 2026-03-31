/**
 * SEC Filings Service — 8-K + 10-K Data Provider
 * 
 * Fetches SEC filing data from Massive API with Redis caching.
 * Used by: AI Deep Analysis, Intel Session Grid, Guardian Briefing
 * 
 * 8-K: Current reports (earnings, leadership changes, M&A)
 * 10-K: Annual business/risk factor sections
 * 
 * Error-tolerant: returns empty data on any failure (never blocks analysis).
 */

import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';

// --- Types ---

export interface SECFiling8K {
    ticker: string;
    filingDate: string;
    itemsText: string;          // Truncated to MAX_8K_CHARS
    accessionNumber: string;
}

export interface SECFiling10K {
    ticker: string;
    section: string;            // 'business' | 'risk_factors'
    filingDate: string;
    periodEnd: string;
    text: string;               // Truncated to MAX_10K_CHARS
}

export interface SECFilingsData {
    filings8k: SECFiling8K[];
    business10k: SECFiling10K | null;
}

// --- Config ---

const MAX_8K_CHARS = 500;       // Per filing — keeps prompt token budget low
const MAX_10K_CHARS = 800;      // Business section summary
const CACHE_TTL_8K = 6 * 60 * 60;      // 6 hours
const CACHE_TTL_10K = 7 * 24 * 60 * 60; // 7 days (annual filings)

function truncate(text: string, maxLen: number): string {
    if (!text || text.length <= maxLen) return text || '';
    return text.substring(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

// --- Core Fetchers ---

async function fetch8KFilings(ticker: string): Promise<SECFiling8K[]> {
    const cacheKey = `sec:8k:${ticker}`;
    try {
        const cached = await getFromCache<SECFiling8K[]>(cacheKey);
        if (cached && cached.length >= 0) return cached;
    } catch { /* cache miss */ }

    try {
        const data = await fetchMassive(
            '/stocks/filings/8-K/vX/text',
            { ticker, limit: '3' },
            true
        );
        const results: SECFiling8K[] = (data?.results || []).map((r: any) => ({
            ticker: r.ticker || ticker,
            filingDate: r.filing_date || '',
            itemsText: truncate(r.items_text || '', MAX_8K_CHARS),
            accessionNumber: r.accession_number || '',
        }));

        await setInCache(cacheKey, results, CACHE_TTL_8K).catch(() => {});
        return results;
    } catch (e: any) {
        console.warn(`[SEC] 8-K fetch failed for ${ticker}:`, e?.message || e);
        return [];
    }
}

async function fetch10KBusiness(ticker: string): Promise<SECFiling10K | null> {
    const cacheKey = `sec:10k:${ticker}`;
    try {
        const cached = await getFromCache<SECFiling10K>(cacheKey);
        if (cached) return cached;
    } catch { /* cache miss */ }

    try {
        const data = await fetchMassive(
            '/stocks/filings/10-K/vX/sections',
            { ticker, limit: '1', section: 'business' },
            true
        );
        const r = data?.results?.[0];
        if (!r) return null;

        const result: SECFiling10K = {
            ticker: r.ticker || ticker,
            section: r.section || 'business',
            filingDate: r.filing_date || '',
            periodEnd: r.period_end || '',
            text: truncate(r.text || '', MAX_10K_CHARS),
        };

        await setInCache(cacheKey, result, CACHE_TTL_10K).catch(() => {});
        return result;
    } catch (e: any) {
        console.warn(`[SEC] 10-K fetch failed for ${ticker}:`, e?.message || e);
        return null;
    }
}

// --- Public API ---

/**
 * Fetch all SEC filing data for a ticker (8-K + 10-K).
 * Returns empty data on any failure — never blocks analysis.
 */
export async function fetchSECFilings(ticker: string): Promise<SECFilingsData> {
    const [filings8k, business10k] = await Promise.all([
        fetch8KFilings(ticker),
        fetch10KBusiness(ticker),
    ]);
    return { filings8k, business10k };
}

/**
 * Batch fetch 8-K filings for multiple tickers (for Session Grid).
 * Concurrency-limited to avoid API overload.
 */
export async function fetchBatch8K(tickers: string[]): Promise<Record<string, SECFiling8K[]>> {
    const CONCURRENCY = 10;
    const result: Record<string, SECFiling8K[]> = {};
    
    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
        const batch = tickers.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
            batch.map(async (ticker) => {
                const filings = await fetch8KFilings(ticker);
                return { ticker, filings };
            })
        );
        for (const { ticker, filings } of batchResults) {
            result[ticker] = filings;
        }
    }
    
    return result;
}

/**
 * Build XML context block for SEC data (used by Deep Analysis prompt).
 */
export function buildSECXmlBlock(data: SECFilingsData): string {
    if (data.filings8k.length === 0 && !data.business10k) return '';

    const parts: string[] = ['  <sec_filings>'];

    if (data.filings8k.length > 0) {
        parts.push(`    <recent_8k count="${data.filings8k.length}">`);
        for (const f of data.filings8k) {
            parts.push(`      <filing date="${f.filingDate}" type="8-K">${f.itemsText}</filing>`);
        }
        parts.push('    </recent_8k>');
    }

    if (data.business10k) {
        parts.push(`    <business_overview source="10-K" period_end="${data.business10k.periodEnd}">${data.business10k.text}</business_overview>`);
    }

    parts.push('  </sec_filings>');
    return parts.join('\n');
}

/**
 * Build plain-text SEC context for Session Grid / Briefing prompts.
 */
export function buildSECTextBlock(filings8k: SECFiling8K[]): string {
    if (filings8k.length === 0) return '';
    return filings8k.map(f =>
        `  [${f.filingDate}] 8-K: ${f.itemsText}`
    ).join('\n');
}
