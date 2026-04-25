'use client';

// MobileCmdOptions — SSOT: Import web components directly, zero separate logic
// Now includes Flow Unit (merged from deleted MobileCmdFlow tab)
import React, { useState } from 'react';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { ProGate, EliteGate } from '@/components/gate/FeatureGate';
import { GammaPressureGauge } from '@/components/GammaPressureGauge';
import { TechnicalLevelsMap } from '@/components/TechnicalLevelsMap';
import { GexTimeline } from '@/components/history/GexTimeline';
import { FlowSniper } from '@/components/FlowSniper';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { useLivePrice } from '@/hooks/useLivePrice';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';
import { useFlowData } from '@/hooks/useFlowData';

// Same IVSkewCurve as desktop — dynamic import
const IVSkewCurve = dynamic(() => import("@/components/IVSkewCurve"), {
    ssr: false,
    loading: () => (
        <div className="h-[200px] flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
    )
});

interface Props { ticker: string; quote: IntelQuote; unified: any; unifiedLoading: boolean; initialStockData?: any; }

export function MobileCmdOptions({ ticker, quote, unified, unifiedLoading, initialStockData }: Props) {
    const q = quote;
    const structure = unified?.structure || {};
    const smaData = unified?.sma || {};
    const options = unified?.options || {};

    // Same live price pipeline as desktop
    const { status: marketStatus } = useMarketStatus();
    const isClosed = marketStatus.isHoliday || marketStatus.market === 'closed';
    const livePrice = useLivePrice(ticker, marketStatus.market);
    const { getPrice: wsGetPrice } = useRealtimeData([ticker]);
    const wsPrice = wsGetPrice(ticker);

    const effectiveSession = isClosed
        ? 'CLOSED'
        : (q.session || 'CLOSED').toUpperCase();

    const { displayPrice } = calcPriceDisplay({
        livePrice: wsPrice?.price || livePrice?.price,
        liveChangePct: wsPrice?.changePct || livePrice?.changePercent,
        liveExtPrice: livePrice?.extendedPrice,
        liveExtChangePct: livePrice?.extendedChangePercent,
        liveExtLabel: livePrice?.extendedLabel,
        apiDisplayPrice: q.price || 0,
        apiDisplayChangePct: q.changePct || 0,
        session: effectiveSession,
        prevRegularClose: q.prevClose || null,
        prevClose: q.prevClose || 0,
        fallbackChangePct: q.changePct || 0,
        lastTrade: q.price || 0,
        extended: initialStockData?.extended || {},
        prices: {},
    });

    // Same 3 insight tabs as web: GEX Timeline 30D / Tech Levels / IV Skew
    const [activeInsightTab, setActiveInsightTab] = useState<'gex' | 'levels' | 'ivskew'>('gex');

    // Flow data — same useFlowData hook as desktop (merged from MobileCmdFlow)
    const { data: liveQuote } = useFlowData(ticker, {
        refreshInterval: isClosed ? 0 : 2000,
        skipAlpha: true,
        revalidateOnFocus: !isClosed,
        revalidateOnReconnect: !isClosed,
    });

    return (
        <div className="space-y-4">

            {/* ═══ 1. GEX TIMELINE / TECH LEVELS / IV SKEW — same 3 tabs as web ═══ */}
            <div className="rounded-2xl border border-white/[0.06] bg-slate-900/60 overflow-hidden">
                {/* Tab buttons — same 3 tabs as web */}
                <div className="flex border-b border-white/[0.04]">
                    <button onClick={() => setActiveInsightTab('gex')}
                        className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                            activeInsightTab === 'gex' ? 'text-white bg-white/[0.06]' : 'text-slate-500'}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}>
                        GEX Timeline
                    </button>
                    <button onClick={() => setActiveInsightTab('levels')}
                        className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                            activeInsightTab === 'levels' ? 'text-white bg-white/[0.06]' : 'text-slate-500'}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}>
                        Tech Levels
                    </button>
                    <button onClick={() => setActiveInsightTab('ivskew')}
                        className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                            activeInsightTab === 'ivskew' ? 'text-white bg-white/[0.06]' : 'text-slate-500'}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}>
                        IV Skew
                    </button>
                </div>

                {/* Tab content — same components as web */}
                <div className="p-2">
                    {activeInsightTab === 'gex' ? (
                        <ProGate title="GEX Timeline 30D" mode="blur" fomoMessage="30-Day Gamma Exposure · Regime Shifts · Gamma Flip Events">
                            <GexTimeline ticker={ticker} days={30} onEmpty={() => setActiveInsightTab('levels')} />
                        </ProGate>
                    ) : activeInsightTab === 'levels' ? (
                        <TechnicalLevelsMap isMobile={true}
                            currentPrice={displayPrice}
                            sma50={smaData?.sma50}
                            sma200={smaData?.sma200}
                            smaCross={smaData?.cross}
                            vwap={initialStockData?.vwap}
                            maxPain={structure?.maxPain || initialStockData?.flow?.maxPain}
                            callWall={structure?.levels?.callWall}
                            putFloor={structure?.levels?.putFloor}
                            gammaFlipLevel={structure?.gammaFlipLevel}
                        />
                    ) : (
                        <ProGate title="IV Skew Curve" mode="blur" fomoMessage="Call IV · Put IV · Skew Direction · ATM IV Smile">
                            <IVSkewCurve
                                ticker={ticker}
                                atmSlice={options?.atmSlice || []}
                                underlyingPrice={displayPrice}
                                expiration={options?.atmSlice?.[0]?.expiration || structure?.expiration}
                            />
                        </ProGate>
                    )}
                </div>
            </div>

            {/* ═══ 2. GAMMA PRESSURE GAUGE — same component as web ═══ */}
            <ProGate title="Gamma Pressure" mode="blur" fomoMessage="Short Gamma · Call Wall · Put Floor · Gamma Flip Level · Squeeze Risk">
                <GammaPressureGauge isMobile={true}
                    netGex={structure?.netGex || 0}
                    callWall={structure?.levels?.callWall || 0}
                    putFloor={structure?.levels?.putFloor || 0}
                    gammaFlipLevel={structure?.gammaFlipLevel || 0}
                    currentPrice={displayPrice}
                    squeezeRisk={structure?.squeezeRisk || 'LOW'}
                    squeezeScore={structure?.squeezeScore ?? 0}
                />
            </ProGate>

            {/* ═══ 3. FLOW UNIT — merged from MobileCmdFlow (same FlowSniper as web) ═══ */}
            <EliteGate title="Flow Unit" mode="blur" fomoMessage="Net Premium Flow · Call/Put Split · Institutional Flow">
                <div className="rounded-2xl border border-white/[0.06] bg-slate-900/60 overflow-hidden">
                    {/* Session badge header — same as web L2434-2449 */}
                    <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
                        <span className="text-[11px] font-bold text-sky-200 uppercase tracking-wider">Flow Unit</span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded border font-bold ${
                            effectiveSession === 'REG' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/20' :
                            effectiveSession === 'PRE' ? 'bg-amber-900/50 text-amber-400 border-amber-500/20' :
                            effectiveSession === 'POST' ? 'bg-blue-900/50 text-blue-400 border-blue-500/20' :
                                'bg-slate-800/80 text-slate-400 border-white/5'
                        }`}>{
                            effectiveSession === 'REG' ? 'INTRADAY' :
                            effectiveSession === 'PRE' ? 'PRE-MKT' :
                            effectiveSession === 'POST' ? 'POST-MKT' : 'CLOSED'
                        }</span>
                    </div>
                    {/* Same FlowSniper component as web */}
                    <div className="p-2">
                        <FlowSniper
                            netPremium={liveQuote?.flow?.netPremium || 0}
                            callPremium={liveQuote?.flow?.callPremium || 0}
                            putPremium={liveQuote?.flow?.putPremium || 0}
                            optionsCount={liveQuote?.flow?.optionsCount || 0}
                        />
                    </div>
                </div>
            </EliteGate>
        </div>
    );
}
