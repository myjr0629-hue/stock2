"use client";

import { GemsTicker } from "@/services/stockTypes";
import { TradeScenarioPanel } from "./TradeScenarioPanel";
import { ScoreXRayPanel } from "./ScoreXRayPanel";
import { OptionsBattlefieldPanel } from "./OptionsBattlefieldPanel";

interface StockDetailExpandedProps {
    ticker: GemsTicker;
}

/**
 * Stock Detail Expanded View
 * Integrates premium panels: Trade Scenario, Score X-Ray, Options Battlefield
 * Replaces legacy expanded row in GemsReport
 */
export function StockDetailExpanded({ ticker }: StockDetailExpandedProps) {
    const v71 = ticker.v71;
    const hasOptionsData = v71?.options_status === 'OK';

    // Extract price data
    const currentPrice = ticker.price;
    const entryZone = v71?.entryZone || [currentPrice * 0.97, currentPrice * 1.02];
    const targetPrice = v71?.tp1 || ticker.targetPrice;
    const riskLine = ticker.cutPrice;

    // Options data
    const callWall = v71?.oiLevels?.callWall;
    const putFloor = v71?.oiLevels?.putFloor;
    const maxPain = v71?.maxPainNear ?? undefined;

    // Score breakdown
    const scores = ticker.scoreDecomposition || {
        momentum: 12,
        options: 10,
        structure: 14,
        regime: 12,
        risk: 16
    };

    // Build GEX levels for Options Battlefield
    const buildGexLevels = () => {
        if (!hasOptionsData || !callWall || !putFloor) return [];

        const levels = [];
        const priceStep = Math.max(1, Math.round((callWall - putFloor) / 8));

        // Build levels from put floor to call wall
        for (let price = putFloor; price <= callWall; price += priceStep) {
            let type: "resistance" | "support" | "current" | "neutral" = "neutral";
            let label = "";

            if (Math.abs(price - callWall) < 0.1) {
                type = "resistance";
                label = "CALL WALL";
            } else if (Math.abs(price - putFloor) < 0.1) {
                type = "support";
                label = "PUT FLOOR";
            } else if (Math.abs(price - currentPrice) < priceStep / 2) {
                type = "current";
                label = "CURRENT";
            }

            // Simulate GEX values based on distance from current price
            const distance = Math.abs(price - currentPrice);
            const gex = Math.max(0.5, 5 - distance * 0.3);

            levels.push({ price, gex, type, label });
        }

        return levels;
    };

    return (
        <div className="p-6 bg-gradient-to-br from-[#0a0a1a] to-[#0f1428] border-l-4 border-cyan-500 ml-4 mr-4 my-4 rounded-r-xl shadow-inner">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-1 h-6 bg-gradient-to-b from-cyan-400 to-cyan-600 rounded-full" />
                    <h3 className="text-lg font-bold text-white tracking-tight">
                        {ticker.symbol} Analysis
                    </h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider
                        ${v71?.gate === 'PASS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : ''}
                        ${v71?.gate === 'FAIL' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' : ''}
                        ${!v71?.gate ? 'bg-slate-500/10 text-slate-400 border border-slate-500/30' : ''}
                    `}>
                        {v71?.gate || 'PENDING'}
                    </span>
                </div>
                {v71?.gateReason && (
                    <p className="text-xs text-slate-500 ml-4">{v71.gateReason}</p>
                )}
            </div>

            {/* Panels Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Trade Scenario Panel */}
                <TradeScenarioPanel
                    symbol={ticker.symbol}
                    currentPrice={currentPrice}
                    entryZone={entryZone as [number, number]}
                    targetPrice={targetPrice}
                    riskLine={riskLine}
                    atmIv={0.35}
                    callWall={callWall}
                    putFloor={putFloor}
                    maxPain={maxPain}
                    expiryDate="2/7"
                />

                {/* Score X-Ray Panel */}
                <ScoreXRayPanel
                    symbol={ticker.symbol}
                    scores={scores}
                    metrics={{
                        changePct: ticker.changePercent,
                        pcr: v71?.pcrNear || undefined,
                        vix: v71?.rsi14 || undefined,
                    }}
                />

                {/* Options Battlefield Panel */}
                {hasOptionsData && callWall && putFloor && (
                    <OptionsBattlefieldPanel
                        symbol={ticker.symbol}
                        currentPrice={currentPrice}
                        levels={buildGexLevels()}
                        maxPain={maxPain}
                        expiryDate="2/7"
                    />
                )}

                {/* Fallback when no options data */}
                {!hasOptionsData && (
                    <div className="bg-gradient-to-br from-[#0a0a1a]/95 to-[#0f1428]/95 backdrop-blur-xl rounded-2xl border border-amber-500/20 p-6 flex flex-col items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
                            <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                        </div>
                        <div className="text-sm font-bold text-amber-400 mb-1">Options Data Pending</div>
                        <div className="text-xs text-slate-500 text-center">
                            {v71?.options_reason || 'Loading official OI data...'}
                        </div>
                    </div>
                )}
            </div>

            {/* Action Summary */}
            {v71?.action && (
                <div className="mt-6 pt-6 border-t border-[#1a2744]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                                Commander Action
                            </div>
                            <div className={`text-lg font-black tracking-tight
                                ${v71.action === 'Enter' || v71.action === 'Add' ? 'text-emerald-400' : ''}
                                ${v71.action === 'Hold' ? 'text-cyan-400' : ''}
                                ${v71.action === 'Reduce' || v71.action === 'No Trade' ? 'text-rose-400' : ''}
                            `}>
                                {v71.action.toUpperCase()}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                                Entry Zone
                            </div>
                            <div className={`text-sm font-mono font-bold ${v71.isInsideEntry ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ${entryZone[0].toFixed(2)} - ${entryZone[1].toFixed(2)}
                                <span className="ml-2 text-[10px]">
                                    {v71.isInsideEntry ? 'INSIDE ZONE' : 'NO CHASE'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Disclaimer */}
            <div className="mt-4 text-[9px] text-slate-600 text-center">
                This scenario is based on current options data. Not financial advice. Trade at your own risk.
            </div>
        </div>
    );
}

export default StockDetailExpanded;
