'use client';

// MobileCmdFlow — SSOT: Same FlowSniper + useFlowData as web, zero separate logic
import React from 'react';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { EliteGate } from '@/components/gate/FeatureGate';
import { FlowSniper } from '@/components/FlowSniper';
import { useFlowData } from '@/hooks/useFlowData';
import { useMarketStatus } from '@/hooks/useMarketStatus';

interface Props { ticker: string; quote: IntelQuote; unified: any; unifiedLoading: boolean; }

export function MobileCmdFlow({ ticker, quote, unified, unifiedLoading }: Props) {
    const q = quote;

    // Same market status as desktop
    const { status: marketStatus } = useMarketStatus();
    const isClosed = marketStatus.isHoliday || marketStatus.market === 'closed';

    const effectiveSession = isClosed
        ? 'CLOSED'
        : (q.session || 'CLOSED').toUpperCase();

    // Same useFlowData hook as desktop L142-147 → provides liveQuote.flow
    const { data: liveQuote } = useFlowData(ticker, {
        refreshInterval: isClosed ? 0 : 10000, // [COST OPT] 10s polling
        skipAlpha: true,
        revalidateOnFocus: !isClosed,
        revalidateOnReconnect: !isClosed,
    });

    return (
        <div className="space-y-4">

            {/* ═══ Flow Unit — same FlowSniper as web (EliteGate) ═══ */}
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
                    {/* Same FlowSniper component as web L2451-2456 */}
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
