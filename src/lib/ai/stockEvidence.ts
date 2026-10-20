/** 공급사 태그를 우선한다. 태그가 없을 때만 제목의 명시적 표기를 허용한다. */
export interface StockNewsEvidence { text: string; headline: string; symbols: string[] }

// 공식 회사명만 허용하는 좁은 사전. 짧은 티커는 회사명으로도 연결하지 않는다.
const COMPANY_NAMES: Record<string, string[]> = {
    AAPL: ['Apple Inc.'], MSFT: ['Microsoft Corporation'],
    NVDA: ['NVIDIA Corporation'], AMZN: ['Amazon.com, Inc.'],
    GOOGL: ['Alphabet Inc.'], GOOG: ['Alphabet Inc.'],
    META: ['Meta Platforms, Inc.'], TSLA: ['Tesla, Inc.'],
    WFC: ['Wells Fargo & Company'],
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function providerSymbols(n: { symbols?: unknown; tickers?: unknown; symbol?: unknown }): string[] {
    return [...new Set([n.symbols, n.tickers, n.symbol].flatMap(v => Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
        .filter((v): v is string => typeof v === 'string').map(v => v.trim().toUpperCase()).filter(v => /^[A-Z][A-Z0-9.]{0,9}$/.test(v)))];
}

export function newsForStock(n: StockNewsEvidence, ticker: string): boolean {
    if (n.symbols.length) return n.symbols.includes(ticker);
    if (ticker.length <= 2) return false;
    // 본문·출처·시각은 검색하지 않는다. 대소문자 무시 검색도 금지한다.
    const boundary = (s: string) => new RegExp(`(?<![A-Za-z0-9_.$])${escape(s)}(?![A-Za-z0-9_$]|\\.[A-Za-z0-9])`).test(n.headline);
    return boundary(ticker) || boundary(`$${ticker}`) || (COMPANY_NAMES[ticker] || []).some(boundary);
}
