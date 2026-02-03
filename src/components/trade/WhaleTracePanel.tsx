"use client";

interface FlowEntry {
    time: string;      // "09:30", "10:00", etc.
    amount: number;    // In millions, negative = sell
    type: "buy" | "sell";
}

interface WhaleTraceProps {
    symbol: string;
    flows: FlowEntry[];
    netFlow: number;       // Net flow in millions
    darkPoolPct?: number;  // Dark pool percentage
    timeRange?: string;    // "4H", "1D", etc.
}

/**
 * Whale Trace Panel
 * Institutional order flow timeline visualization
 */
export function WhaleTracePanel({
    symbol,
    flows,
    netFlow,
    darkPoolPct,
    timeRange = "4H",
}: WhaleTraceProps) {
    // Find max flow for bar sizing
    const maxFlow = Math.max(...flows.map(f => Math.abs(f.amount)), 1);

    // Calculate net assessment
    const assessment = netFlow > 5 ? "Strong Accumulation" :
        netFlow > 0 ? "Accumulation" :
            netFlow > -5 ? "Distribution" : "Strong Distribution";

    const assessmentColor = netFlow > 0 ? "emerald" : "rose";

    const formatAmount = (amount: number) => {
        const sign = amount > 0 ? "+" : "";
        return `${sign}$${Math.abs(amount).toFixed(1)}M`;
    };

    return (
        <div className="relative bg-gradient-to-br from-[#0a0a1a]/95 to-[#0f1428]/95 backdrop-blur-xl rounded-2xl border border-[#1a2744] shadow-2xl overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />

            {/* Header */}
            <div className="relative px-6 py-4 border-b border-[#1a2744]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-8 bg-gradient-to-b from-cyan-400 to-blue-500 rounded-full" />
                        <div>
                            <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                                Whale Trace
                            </h3>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                Last {timeRange} Flow
                            </p>
                        </div>
                    </div>
                    <div className="text-lg font-mono font-bold text-white">
                        {symbol}
                    </div>
                </div>
            </div>

            {/* Flow Timeline */}
            <div className="relative px-6 py-5">
                <div className="space-y-2">
                    {flows.map((flow, index) => {
                        const barWidth = (Math.abs(flow.amount) / maxFlow) * 100;
                        const isBuy = flow.type === "buy";

                        return (
                            <div
                                key={index}
                                className="flex items-center gap-4"
                            >
                                {/* Time label */}
                                <div className="w-12 text-xs font-mono text-slate-500">
                                    {flow.time}
                                </div>

                                {/* Direction indicator */}
                                <div className={`w-5 h-5 rounded flex items-center justify-center
                                    ${isBuy ? 'bg-emerald-500/20' : 'bg-rose-500/20'}
                                `}>
                                    <svg
                                        className={`w-3 h-3 ${isBuy ? 'text-emerald-400' : 'text-rose-400 rotate-180'}`}
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <polygon points="12,4 20,16 4,16" />
                                    </svg>
                                </div>

                                {/* Flow Bar */}
                                <div className="flex-1 h-7 bg-[#0f1428] rounded-lg overflow-hidden border border-[#1a2744]">
                                    <div
                                        className={`h-full rounded-lg transition-all duration-500
                                            ${isBuy
                                                ? 'bg-gradient-to-r from-emerald-600/80 to-emerald-500/60'
                                                : 'bg-gradient-to-r from-rose-600/80 to-rose-500/60'
                                            }
                                        `}
                                        style={{ width: `${barWidth}%` }}
                                    />
                                </div>

                                {/* Amount label */}
                                <div className={`w-20 text-right text-xs font-mono font-bold
                                    ${isBuy ? 'text-emerald-400' : 'text-rose-400'}
                                `}>
                                    ${Math.abs(flow.amount).toFixed(1)}M
                                    <span className="ml-1 text-[9px] uppercase">
                                        {isBuy ? 'BUY' : 'SELL'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Divider */}
            <div className="mx-6 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

            {/* Net Flow Summary */}
            <div className="relative px-6 py-4 flex items-center justify-between">
                <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Net {timeRange}
                    </div>
                    <div className={`text-2xl font-mono font-black
                        ${assessmentColor === 'emerald' ? 'text-emerald-400' : 'text-rose-400'}
                    `}>
                        {formatAmount(netFlow)}
                    </div>
                </div>

                <div className="text-right">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border
                        ${assessmentColor === 'emerald'
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-rose-500/10 border-rose-500/30'
                        }
                    `}>
                        <svg
                            className={`w-4 h-4 ${assessmentColor === 'emerald' ? 'text-emerald-400' : 'text-rose-400'}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M12 2L2 22h20L12 2z" />
                        </svg>
                        <span className={`text-[10px] font-bold uppercase tracking-wider
                            ${assessmentColor === 'emerald' ? 'text-emerald-400' : 'text-rose-400'}
                        `}>
                            {assessment}
                        </span>
                    </div>
                </div>
            </div>

            {/* Dark Pool indicator */}
            {darkPoolPct !== undefined && (
                <div className="relative px-6 py-3 border-t border-[#1a2744] flex items-center gap-3 bg-[#0a0a14]/50">
                    <div className="w-5 h-5 rounded bg-slate-500/10 border border-slate-500/30 flex items-center justify-center">
                        <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18M9 21V9" />
                        </svg>
                    </div>
                    <div className="text-[10px] text-slate-500">
                        Dark Pool: <span className="font-mono font-bold text-slate-400">{darkPoolPct}%</span> off-exchange
                    </div>
                </div>
            )}
        </div>
    );
}

export default WhaleTracePanel;
