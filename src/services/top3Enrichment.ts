// [S-51.7] Top3 Enrichment - Fetch live VWAP/RSI/News for Top3 candidates
// Returns enriched candidates with real-time data for proper scoring

import { getStockData, getStockNews } from './stockApi';

export interface EnrichedCandidate {
    ticker: string;
    alphaScore: number;
    // Price data
    price: number;
    prevClose: number;
    changePct: number;
    // Session-specific
    preMarketPrice?: number;
    preMarketChangePct?: number;
    afterHoursPrice?: number;
    afterHoursChangePct?: number;
    // Technical
    vwap: number | null;
    vwapDistance: number | null;
    rsi14: number | null;
    // News
    hasNews: boolean;
    newsAgeHours: number | null;
    newsTitle?: string;
    // Scoring metadata
    dataQuality: 'complete' | 'partial' | 'poor';
    missingData: string[];
    dataPenalty: number;
    // Original data
    original: any;
}

export type SessionType = 'pre' | 'regular' | 'post';

function getSessionType(): SessionType {
    // [S-52.2.3] Use reliable timezone utility
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getETNow } = require('@/services/timezoneUtils');
    const et = getETNow();
    const etTime = et.hour + et.minute / 60;

    if (et.isWeekend) return 'regular';

    if (etTime >= 4 && etTime < 9.5) return 'pre';
    else if (etTime >= 16 && etTime < 20) return 'post';
    else if (etTime >= 9.5 && etTime < 16) return 'regular';
    else return 'post';  // overnight
}

export async function enrichTop3Candidates(
    candidates: any[],
    limit: number = 10
): Promise<{ enriched: EnrichedCandidate[], session: SessionType }> {
    const session = getSessionType();
    const topCandidates = candidates.slice(0, limit);

    console.log(`[S-51.7] Enriching ${topCandidates.length} candidates (session: ${session})...`);

    const enriched: EnrichedCandidate[] = await Promise.all(
        topCandidates.map(async (c) => {
            const ticker = c.ticker || c.symbol || 'N/A';
            const missingData: string[] = [];

            try {
                // Fetch live data in parallel
                const [stockData, news] = await Promise.all([
                    getStockData(ticker, '1d').catch(() => null),
                    getStockNews(ticker, 5).catch(() => [])
                ]);

                // Extract prices
                const prevClose = stockData?.regPrice || c.prevDay?.c || 0;
                const currentPrice = stockData?.price || c.lastTrade?.p || c.price || prevClose;

                // Session-specific change calculation
                let changePct = 0;
                let displayPrice = currentPrice;

                if (prevClose > 0) {
                    if (session === 'pre') {
                        displayPrice = stockData?.extPrice || c.extended?.prePrice || currentPrice;
                        changePct = ((displayPrice - prevClose) / prevClose) * 100;
                    } else if (session === 'post') {
                        displayPrice = stockData?.extPrice || c.extended?.postPrice || currentPrice;
                        changePct = ((displayPrice - prevClose) / prevClose) * 100;
                    } else {
                        changePct = stockData?.regChangePercent || c.todaysChangePerc ||
                            ((currentPrice - prevClose) / prevClose) * 100;
                    }
                }

                // VWAP
                const vwap = stockData?.vwap || c.day?.vw || null;
                let vwapDistance: number | null = null;
                if (vwap && vwap > 0 && currentPrice > 0) {
                    vwapDistance = ((currentPrice - vwap) / vwap) * 100;
                } else {
                    missingData.push('VWAP');
                }

                // RSI
                const rsi14 = stockData?.rsi || null;
                if (rsi14 === null || rsi14 === 50) {  // 50 is default fallback
                    missingData.push('RSI');
                }

                // News
                const hasNews = news.length > 0;
                const latestNews = news[0];
                let newsAgeHours: number | null = null;
                if (hasNews && latestNews.ageHours !== undefined) {
                    newsAgeHours = latestNews.ageHours;
                } else {
                    missingData.push('뉴스');
                }

                // Data quality assessment
                const dataQuality: 'complete' | 'partial' | 'poor' =
                    missingData.length === 0 ? 'complete' :
                        missingData.length === 1 ? 'partial' : 'poor';

                // Data penalty (severe for poor data)
                const dataPenalty =
                    dataQuality === 'poor' ? -15 :
                        dataQuality === 'partial' ? -5 : 0;

                return {
                    ticker,
                    alphaScore: (c.alphaScore || 0) + dataPenalty,
                    price: displayPrice,
                    prevClose,
                    changePct: Math.round(changePct * 100) / 100,
                    preMarketPrice: session === 'pre' ? displayPrice : undefined,
                    preMarketChangePct: session === 'pre' ? changePct : undefined,
                    afterHoursPrice: session === 'post' ? displayPrice : undefined,
                    afterHoursChangePct: session === 'post' ? changePct : undefined,
                    vwap,
                    vwapDistance: vwapDistance !== null ? Math.round(vwapDistance * 100) / 100 : null,
                    rsi14,
                    hasNews,
                    newsAgeHours,
                    newsTitle: latestNews?.title,
                    dataQuality,
                    missingData,
                    dataPenalty,
                    original: c
                };
            } catch (e) {
                console.warn(`[S-51.7] Enrichment failed for ${ticker}:`, (e as Error).message);

                // Fallback with severe penalty
                return {
                    ticker,
                    alphaScore: (c.alphaScore || 0) - 20,
                    price: c.prevDay?.c || 0,
                    prevClose: c.prevDay?.c || 0,
                    changePct: 0,
                    vwap: null,
                    vwapDistance: null,
                    rsi14: null,
                    hasNews: false,
                    newsAgeHours: null,
                    dataQuality: 'poor',
                    missingData: ['VWAP', 'RSI', '뉴스', '가격'],
                    dataPenalty: -20,
                    original: c
                };
            }
        })
    );

    // Sort by adjusted alphaScore
    enriched.sort((a, b) => b.alphaScore - a.alphaScore);

    // Log summary
    const completeCount = enriched.filter(e => e.dataQuality === 'complete').length;
    const partialCount = enriched.filter(e => e.dataQuality === 'partial').length;
    const poorCount = enriched.filter(e => e.dataQuality === 'poor').length;
    console.log(`[S-51.7] Enrichment complete: ${completeCount} complete, ${partialCount} partial, ${poorCount} poor`);

    return { enriched, session };
}

export function generateTop3WHY(candidate: EnrichedCandidate): string {
    const { changePct, vwapDistance, rsi14, hasNews, newsAgeHours, dataQuality, missingData } = candidate;

    // Reject poor data for Top3
    if (dataQuality === 'poor') {
        return `데이터 부족(${missingData.join('/')}) → Top3 부적격`;
    }

    const reasons: string[] = [];
    const risks: string[] = [];

    // Reasons (positive signals)
    if (changePct > 1) reasons.push(`+${changePct.toFixed(1)}% 강세`);
    else if (changePct > 0.3) reasons.push(`+${changePct.toFixed(1)}% 상승`);

    if (vwapDistance !== null && vwapDistance > 0) reasons.push('VWAP 상회');
    if (rsi14 !== null && rsi14 >= 55 && rsi14 <= 68) reasons.push('RSI 적정');
    if (hasNews && newsAgeHours !== null && newsAgeHours <= 24) reasons.push('신선 촉매');

    // Risks (negative signals)
    if (rsi14 !== null && rsi14 > 70) risks.push('RSI 과열');
    if (vwapDistance !== null && vwapDistance < -1) risks.push('VWAP 하회');
    if (hasNews && newsAgeHours !== null && newsAgeHours > 72) risks.push('촉매 경과');
    if (dataQuality === 'partial') risks.push(`${missingData[0]} 미수신`);

    // Build WHY string
    const reasonStr = reasons.length > 0 ? reasons.slice(0, 2).join(' + ') : '모멘텀 관찰';
    const riskStr = risks.length > 0 ? risks[0] : '리스크 낮음';
    const action = changePct > 0.5 ? '진입 검토' : changePct > 0 ? '관망/대기' : '관망';

    return `${reasonStr} / 리스크: ${riskStr} / ${action}`;
}

export function getVelocitySymbol(changePct: number): string {
    if (changePct >= 1.5) return '▲▲';
    if (changePct >= 0.5) return '▲';
    if (changePct >= 0) return '►';
    if (changePct >= -0.5) return '▼';
    return '▼▼';
}
