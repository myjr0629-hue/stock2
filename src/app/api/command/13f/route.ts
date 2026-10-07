/**
 * [13-F] Institutional Holdings API
 *
 * Usage: GET /api/command/13f?ticker=NVDA
 *
 * Data flow (2026-10-07 재작성 — 앱 강화 1단계):
 * 1. 티커 → CUSIP (src/data/cusipByTicker.json — OpenFIGI 로 만든 표, 분기에 한 번 갱신: scripts/build-13f-ticker-map.js)
 * 2. Redis `cache:13f:cusip:{CUSIP}` — signum-13f Lambda 가 SEC «Form 13F Data Sets»(분기 공개 데이터 전수)로 만든 색인(상위 60 + 정확 집계)
 *    · 항목에 universeFilers(색인에 든 제출 기관 수)·dataset·source 가 있다. 소표본(제출 기관 3,000 미만 · 출처 표식 없는 옛 항목의 소수 기관)이면
 *      summary.partial = true — 화면이 «전체»처럼 보여 주지 않는다(옛 색인은 9/27·10/4 에 5쪽 표본으로 덮여 NVDA 24곳·$0.7B 로 보였다).
 * 3. 색인에 없으면 Intrinio 기관보유 — «기준일(period)»이 있을 때만(직전 분기 말 이전이면 stalePeriod 로 표시). 기준일 없는 응답은 쓰지 않는다.
 * 4. 이름은 색인(SEC 표지)에 들어 있다 — 없는 기관만 SEC EDGAR 로 해석(캐시).
 * (옛 Massive/Polygon 폴백은 9/23 해지로 죽었다 — 제거. 실패한 외부 호출을 매 미스마다 최대 10번 반복하던 경로였다.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { cusipForTicker, isPartialIndex, latestCompletedPeriod } from '@/lib/holders13f';

// SEC EDGAR 이름 해석(색인에 이름이 없는 기관만) — 인스턴스 메모리 캐시.
// (옛 «CIK → 이름·도메인» 손표는 삭제했다: 실제 SEC 데이터와 대조하니 0000019617 = JPMorgan 인데 Morgan Stanley 로, 0001167557 = AQR 인데 Two Sigma 로 적혀 있었다.
//  이름·로고 도메인은 색인(Lambda)이 SEC 표지·이름 패턴으로 직접 싣는다.)
const cikNameCache = new Map<string, string>();

async function resolveCikName(cik: string): Promise<string> {
    if (cikNameCache.has(cik)) return cikNameCache.get(cik)!;

    try {
        const paddedCik = cik.replace(/^0*/, '').padStart(10, '0');
        const res = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, {
            headers: { 'User-Agent': 'SIGNUM HQ admin@signumhq.com' },
            next: { revalidate: 604800 } // 7 days cache
        });
        if (res.ok) {
            const data = await res.json();
            const name = data.name || `CIK ${cik}`;
            cikNameCache.set(cik, name);
            return name;
        }
    } catch (e) {
        console.warn(`[13F] CIK resolution failed for ${cik}`);
    }

    const fallback = `Institution (${cik.replace(/^0+/, '')})`;
    cikNameCache.set(cik, fallback);
    return fallback;
}

export interface Holder13F {
    rank: number;
    cik: string;
    name: string;
    domain: string | null;
    shares: number;
    marketValue: number;
    period: string;
    filingDate: string;
    // QoQ changes
    prevShares: number | null;
    sharesChange: number | null;
    sharesChangePct: number | null;
    prevMarketValue: number | null;
    marketValueChange: number | null;
    /** 직전 분기 보유 0 → 신규 편입. «0% 변화» 로 표시하면 안 된다 */
    isNewPosition?: boolean;
}

export async function GET(request: NextRequest) {
    const ticker = request.nextUrl.searchParams.get('ticker')?.toUpperCase();
    if (!ticker) {
        return NextResponse.json({ error: 'ticker required' }, { status: 400 });
    }

    try {
        // 1. 티커 → CUSIP
        const cusip = cusipForTicker(ticker);

        // 2. Redis 색인(signum-13f Lambda · SEC Form 13F Data Sets)
        if (cusip) {
            try {
                const cached = await getFromCache<{
                    holders: Array<{
                        cik: string; name?: string | null; domain?: string | null;
                        shares: number; marketValue: number;
                        period?: string; filingDate?: string | null;
                    }>;
                    totalHolders?: number; totalShares?: number; totalValue?: number;
                    period?: string;
                    updatedAt: string;
                    source?: string; dataset?: string; universeFilers?: number;
                }>(`cache:13f:cusip:${cusip}`);

                if (cached && cached.holders && cached.holders.length > 0) {
                    const totalHolders = cached.totalHolders ?? cached.holders.length;
                    const partial = isPartialIndex(cached);
                    console.log(`[13F] Cache HIT for ${ticker} (${cusip}): ${cached.holders.length} stored / ${totalHolders} total${partial ? ' · PARTIAL' : ''}`);

                    // Display top 20; 이름이 없는 기관(옛 항목)만 SEC EDGAR 로 해석한다. Holders are pre-sorted desc.
                    const top = cached.holders.slice(0, 20);
                    const names = await Promise.all(top.map(h => h.name ? Promise.resolve(h.name) : resolveCikName(h.cik)));
                    const period = cached.period || top[0]?.period || null;
                    const holders: Holder13F[] = top.map((h, i) => ({
                        rank: i + 1,
                        cik: h.cik,
                        name: names[i],
                        domain: h.domain || null,
                        shares: h.shares,
                        marketValue: h.marketValue,
                        period: period || '',
                        filingDate: h.filingDate || '',
                        prevShares: null,      // QoQ not available from cache (single period)
                        sharesChange: null,
                        sharesChangePct: null,
                        prevMarketValue: null,
                        marketValueChange: null,
                    }));

                    // Accurate aggregates computed at ingest over ALL holders (fallback: sum
                    // stored rows for legacy cache format).
                    const totalShares = cached.totalShares ?? cached.holders.reduce((s, h) => s + h.shares, 0);
                    const totalValue = cached.totalValue ?? cached.holders.reduce((s, h) => s + h.marketValue, 0);

                    return NextResponse.json({
                        ticker,
                        holders,
                        summary: {
                            totalHolders,
                            totalShares,
                            totalValue,
                            period,
                            prevPeriod: null,
                            newEntrants: 0,
                            exits: 0,
                            // ★ 표본 표기 — 소표본 색인이면 true (화면이 «전체 기관»처럼 보여 주지 않는다)
                            partial,
                            universeFilers: cached.universeFilers ?? null,
                        },
                        _source: 'redis-cache',
                        _dataset: cached.dataset ?? null,
                        _updatedAt: cached.updatedAt,
                    });
                }
            } catch (e) {
                // Redis error — fall through to Intrinio
                console.warn('[13F] Redis cache error, falling back to Intrinio:', e);
            }
        }

        // 3. Intrinio 기관보유 — 색인에 없는 종목(CUSIP 표 밖·신규 상장)만.
        //    ★ 기준일(period)이 있는 응답만 쓴다 — 기준일 없이 «전체 기관»처럼 보이면 안 된다. 직전 분기 말보다 오래된 기준일(예: 2025-12-31)이면
        //    stalePeriod 로 표시한다(화면은 «기준일»을 같이 적는다 — holdersBasis). Intrinio 는 직전 분기 대비 증감을 계산해 준다.
        try {
            const { getInstitutionalOwnershipIntrinio } = await import('@/services/intrinioClient');
            const rows = await getInstitutionalOwnershipIntrinio(ticker, 120);
            if (rows.length >= 5) {
                const sorted = [...rows].sort((a, b) => (b.market_value || 0) - (a.market_value || 0));
                const period = sorted[0]?.period_ended || '';
                if (!period) {
                    console.warn(`[13F] Intrinio ${ticker}: 기준일(period_ended) 없음 — 쓰지 않는다`);
                } else {
                    const intrinioHolders: Holder13F[] = sorted.slice(0, 50).map((r, i) => ({
                        rank: i + 1,
                        cik: r.owner_cik,
                        name: r.owner_name,
                        domain: null,
                        shares: r.shares,
                        marketValue: r.market_value,
                        period: r.period_ended,
                        // Intrinio 는 제출일을 주지 않는다 — 지어내지 않는다
                        filingDate: '',
                        prevShares: r.previous_shares ?? null,
                        sharesChange: r.shares_change ?? null,
                        // 신규 편입은 «0% 변화» 가 아니라 비율 없음이다
                        sharesChangePct: r.shares_change_pct ?? null,
                        isNewPosition: r.isNewPosition === true,
                        // 직전 분기 «평가액»은 미제공 — 주식수 증감만 신뢰할 수 있다
                        prevMarketValue: null,
                        marketValueChange: null,
                    }));
                    const stalePeriod = period < latestCompletedPeriod();
                    console.log(`[13F] Intrinio hit for ${ticker}: ${intrinioHolders.length} holders @ ${period}${stalePeriod ? ' · STALE' : ''}`);
                    return NextResponse.json({
                        ticker, period, holders: intrinioHolders,
                        totalHolders: rows.length,
                        stalePeriod,
                        _source: 'intrinio',
                    }, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } });
                }
            }
        } catch (e: any) {
            console.warn('[13F] Intrinio path failed:', e?.message);
        }

        // 4. 데이터 없음 — 옛 Massive/Polygon 폴백은 9/23 해지로 죽었다(제거). 지어내지 않고 비어 있다고 답한다.
        return NextResponse.json({
            ticker,
            holders: [],
            summary: { totalHolders: 0, totalShares: 0, totalValue: 0, period: null },
            message: 'No 13-F data found for this ticker'
        });

    } catch (error: any) {
        console.error('[13F] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch 13-F data', details: error.message }, { status: 500 });
    }
}
