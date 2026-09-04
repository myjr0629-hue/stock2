// API Route: /api/live/fundamentals
// [AWS-FIRST] DynamoDB unified cache → Redis SWR → Polygon fallback (최후)
// Grade: A(80+) B(60+) C(40+) D(20+) F(<20)

import { NextRequest, NextResponse } from 'next/server';
import { swrFetch } from '@/lib/cache/redisSWR';

export const revalidate = 3600;

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t')?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

    try {
        const result = await swrFetch(
            `fundamentals:${ticker}`,
            async () => {
                // ── [AWS-FIRST] Tier 1: DynamoDB unified cache ──
                try {
                    const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
                    const dynData = await getUnifiedCache(ticker, 'en');
                    // ⚠️⚠️ [2026-09-04] 「객체가 있으면 쓴다」가 **빈 껍데기를 통과시킨다.**
                    //   META 실측: DynamoDB 에 fundamentals 가 «있긴 한데» score·pe·roe·
                    //   marketCap 이 전부 null 이었다. 그래도 여기서 그대로 반환해 버리니
                    //   **살아 있는 아래 폴백으로 영영 못 갔다**(grade:'NO_DATA' 로 화면 빈칸).
                    //   overview·structure·sma 에서 이미 세 번 겪은 같은 모양이다.
                    //   판정은 「객체가 있나」가 아니라 **「화면이 읽는 값이 있나」**로.
                    const _f: any = dynData?.fundamentals;
                    const _num = (v: any) => v !== null && v !== undefined && Number.isFinite(Number(v));
                    const _hasSubstance = !!_f && (_num(_f.score) || _num(_f.pe) || _num(_f.roe)
                        || _num(_f.marketCap) || _num(_f.revenueGrowth) || _num(_f.netMargin));
                    if (_hasSubstance) {
                        const f = dynData!.fundamentals;
                        console.log(`[live/fundamentals] ✅ DynamoDB hit for ${ticker}: score=${f.score} grade=${f.grade}`);
                        return {
                            ticker,
                            score: f.score ?? null,
                            grade: f.grade ?? 'NO_DATA',
                            breakdown: f.breakdown ?? {},
                            pe: f.pe ?? null,
                            de: f.de ?? null,
                            roe: f.roe ?? null,
                            revenueGrowth: f.revenueGrowth ?? null,
                            netMargin: f.netMargin ?? null,
                            fcfYield: f.fcfYield ?? null,
                            pb: f.pb ?? null,
                            ps: f.ps ?? null,
                            name: f.name ?? ticker,
                            marketCap: f.marketCap ?? null,
                            sector: f.sector ?? null,
                            _source: 'dynamodb',
                        };
                    }
                } catch (e: any) {
                    console.warn(`[live/fundamentals] DynamoDB error for ${ticker}:`, e.message);
                }

                // ── Tier 2: Polygon fallback (비유니버스 + DynamoDB 미적중) ──
                console.log(`[live/fundamentals] ⚠️ DynamoDB miss for ${ticker} — falling back to Polygon`);
                const { fetchMassive } = await import('@/services/massiveClient');
                // vX/reference/financials sunset 2026-06-22 → stocks/financials/v1/income-statements
                // (15-ticker old-vs-new value comparison passed 2026-07-07; flat field shape)
                const [ratiosRes, vxFinRes] = await Promise.all([
                    fetchMassive(`/stocks/financials/v1/ratios`, { ticker, limit: '1' }, true).catch(() => null),
                    fetchMassive(`/stocks/financials/v1/income-statements`, { tickers: ticker, limit: '5', timeframe: 'quarterly', sort: 'period_end.desc' }, true).catch(() => null),
                ]);

                const ratios = ratiosRes?.results?.[0] || {};
                const pe = ratios.price_to_earnings ?? null;
                const de = ratios.debt_to_equity ?? null;
                const roe = ratios.return_on_equity ?? null;
                const pb = ratios.price_to_book ?? null;
                const ps = ratios.price_to_sales ?? null;
                const fcfRaw = ratios.free_cash_flow ?? null;
                const marketCap = ratios.market_cap ?? null;

                let fcfYield: number | null = null;
                if (fcfRaw !== null && marketCap !== null && marketCap > 0) {
                    fcfYield = (fcfRaw / marketCap) * 100;
                }

                const vxResults = vxFinRes?.results || [];
                let revenueGrowth: number | null = null;
                let netMargin: number | null = null;

                if (vxResults.length >= 1) {
                    // v1 income-statements shape is flat: { revenue, consolidated_net_income_loss }
                    const latest = vxResults[0];
                    if (latest) {
                        const revLatest = latest.revenue || 0;
                        const netIncome = latest.consolidated_net_income_loss || 0;
                        if (revLatest > 0) netMargin = (netIncome / revLatest) * 100;
                    }
                    if (latest && vxResults.length >= 2) {
                        const revLatest = latest.revenue || 0;
                        let revPrev = 0;
                        const preferredIdx = vxResults.length >= 5 ? 4 : vxResults.length - 1;
                        for (let i = preferredIdx; i >= 1; i--) {
                            const val = vxResults[i]?.revenue;
                            if (val && val > 0) { revPrev = val; break; }
                        }
                        if (revPrev > 0 && revLatest > 0) {
                            revenueGrowth = ((revLatest - revPrev) / Math.abs(revPrev)) * 100;
                        }
                    }
                }

                let score = 0;
                const breakdown: Record<string, { value: string; score: number; label: string }> = {};

                if (pe !== null && pe > 0) { const s = pe < 15 ? 20 : pe < 25 ? 16 : pe < 35 ? 12 : pe < 50 ? 8 : 4; score += s; breakdown.pe = { value: pe.toFixed(1), score: s, label: 'P/E' }; } else { breakdown.pe = { value: pe !== null ? pe.toFixed(1) : 'N/A', score: 0, label: 'P/E' }; }
                if (de !== null) { const s = de < 0.3 ? 20 : de < 0.6 ? 16 : de < 1.0 ? 12 : de < 2.0 ? 8 : 4; score += s; breakdown.de = { value: de.toFixed(2), score: s, label: 'D/E' }; } else { breakdown.de = { value: 'N/A', score: 0, label: 'D/E' }; }
                if (fcfYield !== null) { const s = fcfYield > 8 ? 20 : fcfYield > 5 ? 16 : fcfYield > 3 ? 12 : fcfYield > 1 ? 8 : 4; score += s; breakdown.fcf = { value: fcfYield.toFixed(1) + '%', score: s, label: 'FCF' }; } else { breakdown.fcf = { value: 'N/A', score: 0, label: 'FCF' }; }
                if (revenueGrowth !== null) { const s = revenueGrowth > 50 ? 20 : revenueGrowth > 25 ? 16 : revenueGrowth > 10 ? 12 : revenueGrowth > 0 ? 8 : 4; score += s; breakdown.rev = { value: (revenueGrowth > 0 ? '+' : '') + revenueGrowth.toFixed(0) + '%', score: s, label: 'Rev' }; } else { breakdown.rev = { value: 'N/A', score: 0, label: 'Rev' }; }
                if (netMargin !== null) { const s = netMargin > 30 ? 20 : netMargin > 20 ? 16 : netMargin > 10 ? 12 : netMargin > 0 ? 8 : 4; score += s; breakdown.margin = { value: netMargin.toFixed(1) + '%', score: s, label: 'Margin' }; } else { breakdown.margin = { value: 'N/A', score: 0, label: 'Margin' }; }

                const hasAnyData = Object.values(breakdown).some(b => b.score > 0);
                let grade: string;
                let finalScore: number | null;
                if (!hasAnyData) { grade = 'NO_DATA'; finalScore = null; }
                else { finalScore = score; grade = score >= 80 ? 'A' : score >= 70 ? 'A-' : score >= 60 ? 'B+' : score >= 50 ? 'B' : score >= 40 ? 'C+' : score >= 30 ? 'C' : score >= 20 ? 'D' : 'F'; }

                return {
                    ticker, score: finalScore, grade, breakdown,
                    pe: pe !== null ? Math.round(pe * 10) / 10 : null,
                    de: de !== null ? Math.round(de * 100) / 100 : null,
                    roe: roe !== null ? Math.round(roe * 1000) / 10 : null,
                    revenueGrowth: revenueGrowth !== null ? Math.round(revenueGrowth * 10) / 10 : null,
                    netMargin: netMargin !== null ? Math.round(netMargin * 10) / 10 : null,
                    fcfYield: fcfYield !== null ? Math.round(fcfYield * 10) / 10 : null,
                    pb: pb !== null ? Math.round(pb * 10) / 10 : null,
                    ps: ps !== null ? Math.round(ps * 10) / 10 : null,
                    _source: 'polygon-fallback',
                };
            },
            { ttlSeconds: 21600, keyPrefix: 'swr' }
        );

        return NextResponse.json({ ...result.data, _cache: result._cache });
    } catch (error) {
        console.error('[fundamentals] Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
