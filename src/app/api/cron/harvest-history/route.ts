/**
 * [Phase 1] Cron: Harvest History Data → DynamoDB
 * 
 * Runs every 5 minutes during market hours.
 * Collects GEX/RLSI/Sector data and writes to DynamoDB history tables.
 * 
 * This is ADDITIVE — does not modify any existing cron behavior.
 * Vercel Cron: *​/5 14-21 * * 1-5  (every 5 min, market hours UTC)
 */

import { NextResponse } from 'next/server';
import {
    saveGexSnapshot, saveRlsiSnapshot, saveBatchSectorDaily, saveBatchAlphaDaily,
    type GexHistoryItem, type RlsiHistoryItem, type SectorDailyItem, type AlphaHistoryItem
} from '@/lib/aws/historyStore';
import { publicBase } from '@/lib/net/publicBase';

// [Phase 2] Full universe tickers — matches Lambda harvest scope
const HARVEST_TICKERS = [
    'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA',
    'AMD', 'AVGO', 'QCOM', 'MU', 'LRCX', 'AMAT', 'KLAC', 'MRVL', 'ASML',
    'CRWD', 'PANW', 'ZS', 'FTNT', 'OKTA',
    'AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB',
    'ISRG', 'TER', 'ROK', 'MBLY', 'PONY',
    'VST', 'CEG', 'VRT', 'ETN', 'PWR',
    'RTX', 'LMT', 'GD', 'NOC', 'BA',
    'JPM', 'BAC', 'GS', 'WFC', 'C',
    'JNJ', 'UNH', 'LLY', 'PFE', 'ABBV', 'MRK', 'TMO',
    'XOM', 'CVX', 'COP', 'SLB',
    'HD', 'COST', 'WMT', 'TGT', 'LOW',
    'PG', 'KO', 'PEP', 'MCD', 'SBUX', 'NKE',
    'DIS', 'NFLX', 'CMCSA',
    'CAT', 'GE', 'HON', 'UPS', 'DE',
    'NEE', 'DUK', 'SO', 'PLD', 'O', 'VICI',
    'TXN', 'ON', 'INTC',
    'UBER', 'ABNB', 'DASH', 'SHOP', 'SE',
    'AI', 'PLTR', 'SMCI', 'ARM', 'DELL',
    'FCX', 'NEM', 'LIN', 'SHW',
    'BLK', 'SCHW', 'AXP',
    'CRM', 'ADBE', 'TSM', 'SNOW', 'COIN', 'HOOD', 'DKNG', 'NET',
    'V', 'MA', 'PYPL',
    'IBM', 'IONQ', 'RGTI', 'QUBT',
    'EQIX', 'DLR', 'AMT', 'CCI', 'SBAC',
];
const SECTORS = ['m7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse',
    'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress'];

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
    const start = Date.now();
    const results: Record<string, any> = {};
    const baseUrl = publicBase(request.url.split('/api/')[0]);

    try {
        // ====== 1. Harvest GEX data for full universe ======
        const gexResults: string[] = [];
        for (const ticker of HARVEST_TICKERS) {
            try {
                const res = await fetch(`${baseUrl}/api/live/ticker?ticker=${ticker}`, {
                    headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                        ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {},
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.gex !== undefined) {
                        const gexItem: GexHistoryItem = {
                            ticker,
                            timestamp: Date.now(),
                            gex: data.gex || 0,
                            flipLevel: data.gammaFlip || null,
                            callWall: data.callWall || null,
                            putFloor: data.putFloor || null,
                            maxPain: data.maxPain || null,
                            price: data.price || data.last || 0,
                            gammaRegime: data.gammaRegime || 'NEUTRAL',
                        };
                        await saveGexSnapshot(gexItem);
                        gexResults.push(`${ticker}:✅`);
                    }
                }
            } catch (e) {
                gexResults.push(`${ticker}:❌`);
            }
        }
        results.gex = gexResults.join(' ');

        // ====== 2. Harvest RLSI V2.0 data ======
        try {
            const res = await fetch(`${baseUrl}/api/debug/guardian?force=true`, {
                headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {},
            });
            if (res.ok) {
                const json = await res.json();
                const ctx = json.data || json;
                const rlsiData = ctx?.rlsi;
                if (rlsiData && rlsiData.score !== undefined) {
                    const comp = rlsiData.components || {};
                    await saveRlsiSnapshot({
                        timestamp: Date.now(),
                        rlsi: rlsiData.score || 0,
                        momentum: comp.momentumScore || comp.crossAssetMomentumScore || 0,
                        participation: comp.priceActionScore || 0,
                        priceTrend: comp.breadthScore || comp.breadthMcClellanScore || 0,
                        rotation: comp.rotationScore || 0,
                        sentiment: comp.sentimentScore || 0,
                        regime: rlsiData.level || 'NEUTRAL',
                        // [V2.0] Extended fields
                        version: 'V2.0',
                        marketRegime: rlsiData.regime || 'NEUTRAL',
                        gammaScore: comp.gammaScore ?? null,
                        gexIndex: comp.gexIndex ?? null,
                        squeezeRisk: comp.squeezeRisk ?? null,
                        volatilityScore: comp.volatilityScore ?? null,
                        liquidityScore: comp.liquidityScore ?? null,
                        breadthMcClellan: comp.breadthMcClellanScore ?? null,
                        mcClellanOsc: comp.mcClellanOsc ?? null,
                        crossAssetMomentum: comp.crossAssetMomentumScore ?? null,
                        zScore: rlsiData.zScore ?? null,
                        zSignal: rlsiData.zSignal ?? null,
                        gammaAdjustment: rlsiData.gammaAdjustment ?? null,
                        vix: comp.vix ?? null,
                        yieldPenalty: comp.yieldPenalty ?? null,
                    });
                    results.rlsi = `✅ RLSI=${rlsiData.score} Regime=${rlsiData.regime} Gamma=${comp.gexIndex ?? 'N/A'} Z=${rlsiData.zScore ?? 'N/A'}`;
                } else {
                    results.rlsi = '⚠️ No RLSI in response';
                }
            }
        } catch (e) {
            results.rlsi = '❌';
        }

        // ====== 3. Harvest Sector Daily (only at close) ======
        const now = new Date();
        const hour = now.getUTCHours();
        // Only save sector daily at market close (UTC 21:00 = ET 16:00)
        if (hour >= 20 && hour <= 22) {
            try {
                const sectorItems: SectorDailyItem[] = [];
                const today = now.toISOString().slice(0, 10);

                for (const sectorId of SECTORS) {
                    try {
                        const apiName = sectorId.replace(/_/g, '');
                        const res = await fetch(`${baseUrl}/api/intel/${apiName}`, {
                            headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                                ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {},
                        });
                        if (res.ok) {
                            const data = await res.json();
                            const tickers = data.tickers || data.data || [];

                            if (tickers.length > 0) {
                                const avgChange = tickers.reduce((s: number, t: any) => s + (t.changePct || 0), 0) / tickers.length;
                                const gexSum = tickers.reduce((s: number, t: any) => s + (t.gex || 0), 0);
                                const avgPcr = tickers.reduce((s: number, t: any) => s + (t.pcr || 0), 0) / tickers.length;
                                const avgAlpha = tickers.reduce((s: number, t: any) => s + (t.alphaScore || 0), 0) / tickers.length;

                                // Sort by change to find lead/lag
                                const sorted = [...tickers].sort((a: any, b: any) => (b.changePct || 0) - (a.changePct || 0));

                                sectorItems.push({
                                    sectorId,
                                    date: today,
                                    avgChange,
                                    gexSum,
                                    avgPcr: avgPcr || 0,
                                    alphaScore: avgAlpha || 0,
                                    ranking: 0, // Will be calculated from all sectors
                                    leadTicker: sorted[0]?.ticker || '',
                                    lagTicker: sorted[sorted.length - 1]?.ticker || '',
                                });
                            }
                        }
                    } catch (e) {
                        // Skip failed sector
                    }
                }

                if (sectorItems.length > 0) {
                    // Calculate rankings by avgChange
                    sectorItems.sort((a, b) => b.avgChange - a.avgChange);
                    sectorItems.forEach((s, i) => { s.ranking = i + 1; });

                    await saveBatchSectorDaily(sectorItems);
                    results.sectors = `✅ ${sectorItems.length} sectors saved`;
                }
            } catch (e) {
                results.sectors = '❌';
            }
        } else {
            results.sectors = 'Skipped (not market close)';
        }

        const duration = Date.now() - start;
        return NextResponse.json({
            success: true,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString(),
            harvested: results,
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            harvested: results,
        }, { status: 500 });
    }
}
