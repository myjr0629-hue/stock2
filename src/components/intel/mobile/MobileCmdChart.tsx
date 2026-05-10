'use client';

import React from 'react';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { DecisionGate } from '@/components/DecisionGate';
import { EliteGate } from '@/components/gate/FeatureGate';
import { useTranslations } from 'next-intl';
import { useLivePrice } from '@/hooks/useLivePrice';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';

// Same StockChart as desktop — dynamic import, SSR disabled
const StockChart = dynamic(() => import("@/components/StockChart").then(mod => mod.StockChart), {
    ssr: false,
    loading: () => (
        <div className="h-[360px] flex items-center justify-center bg-[#0b1219] rounded-md border border-slate-800">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
    )
});

interface Props { ticker: string; quote: IntelQuote; unified: any; unifiedLoading: boolean; initialStockData?: any; }

export function MobileCmdChart({ ticker, quote, unified, unifiedLoading, initialStockData }: Props) {
    const q = quote;
    const tg = useTranslations('gate');

    // Same live price hooks as desktop
    const { status: marketStatus } = useMarketStatus();
    const isClosed = marketStatus.isHoliday || marketStatus.market === 'closed';
    const livePrice = useLivePrice(ticker, marketStatus.market);
    const { getPrice: wsGetPrice } = useRealtimeData([ticker]);
    const wsPrice = wsGetPrice(ticker);

    const effectiveSession = isClosed
        ? 'CLOSED'
        : (q.session || 'CLOSED').toUpperCase();

    const { displayPrice, displayChangePct, activeExtPrice } = calcPriceDisplay({
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

    // Structure data for DecisionGate + chart overlays
    const structure = unified?.structure || {};
    const flipLevel = structure.gammaFlipLevel || 0;

    return (
        <div className="space-y-4">
            {/* Chart — StockChart handles its own range/fetch/toggle internally.
                No duplicate range buttons. Mobile CSS makes header compact. */}
            <div className="mobile-chart-container rounded-2xl border border-white/[0.06] bg-[#0b1219] overflow-hidden">
                <StockChart
                    key={ticker}
                    data={[]}  /* empty = StockChart fetches internally */
                    ticker={ticker}
                    initialRange="1d"
                    hideHeaderExtras={true}
                    currentPrice={
                        (effectiveSession === 'POST' || effectiveSession === 'PRE' || effectiveSession === 'CLOSED') && activeExtPrice > 0
                            ? activeExtPrice
                            : (wsPrice?.price || livePrice?.price || displayPrice)
                    }
                    prevClose={
                        (effectiveSession === 'POST' || (effectiveSession === 'CLOSED' && activeExtPrice > 0)) && displayPrice > 0
                            ? displayPrice
                            : (q.prevClose || initialStockData?.prevClose)
                    }
                    session={effectiveSession}
                    vwap={initialStockData?.vwap}
                    gammaFlipLevel={flipLevel}
                />
                {/* Mobile CSS overrides — scoped to .mobile-chart-container, ZERO web impact */}
                <style dangerouslySetInnerHTML={{__html: `
                    .mobile-chart-container [class*="CardHeader"] {
                        flex-wrap: wrap !important;
                        gap: 6px !important;
                        padding: 8px 10px !important;
                    }
                    .mobile-chart-container [role="tablist"] {
                        height: 36px !important;
                        padding: 3px !important;
                        gap: 2px !important;
                        border-radius: 10px !important;
                    }
                    .mobile-chart-container [role="tab"] {
                        height: 28px !important;
                        padding: 0 10px !important;
                        font-size: 12px !important;
                        font-weight: 700 !important;
                        border-radius: 7px !important;
                        min-width: 32px !important;
                    }
                    .mobile-chart-container button {
                        min-height: 36px !important;
                    }
                    .mobile-chart-container [role="tab"] {
                        min-height: 28px !important;
                    }
                `}} />
            </div>

            {/* Signal Core — same DecisionGate as desktop */}
            <EliteGate title="Signal Core" mode="blur" fomoTagline={tg('taglineSignalCore')} description={tg('descSignalCore')}>
            <div className="rounded-2xl border border-white/[0.06] bg-slate-900/60 overflow-hidden backdrop-blur-md">
                <DecisionGate
                    ticker={ticker}
                    displayPrice={displayPrice}
                    session={effectiveSession}
                    structure={structure}
                    krNews={null}
                    smaData={unified?.sma || null}
                    newsScore={null}
                    liveQuote={null}
                    analystData={unified?.analyst || null}
                    fundamentalData={unified?.fundamentals || null}
                    institutionalData={unified?.institutional || null}
                    volatilityData={unified?.volatility || null}
                    squeezeData={unified?.squeeze || null}
                    convictionData={null}
                    earningsData={unified?.earnings || null}
                />
            </div>
            </EliteGate>
        </div>
    );
}
