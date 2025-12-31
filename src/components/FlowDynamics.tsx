"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

interface FlowData {
    netPremium?: number;
    callPremium?: number;
    putPremium?: number;
    totalPremium?: number;
    optionsCount?: number;
    dataSource?: 'LIVE' | 'PREVIOUS_CLOSE' | 'CALCULATED' | 'NONE';
    isAfterHours?: boolean;
}

interface FlowDynamicsProps {
    flow: FlowData | undefined;
}

export function FlowDynamics({ flow }: FlowDynamicsProps) {
    const isScanning = !flow || flow.optionsCount === undefined;
    const dataSource = flow?.dataSource || 'NONE';
    const netPrem = flow?.netPremium || 0;
    const netPremFormatted = (Math.abs(netPrem) / 1000000).toFixed(1) + "M";
    const isPositive = netPrem > 0;
    const isNeutral = netPrem === 0;

    // [Phase 30/32] DataSource Badge
    const getSourceBadge = () => {
        if (dataSource === 'LIVE') return null; // No badge for live
        if (dataSource === 'CALCULATED')
            return <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">📊 Calculated</span>;
        if (dataSource === 'PREVIOUS_CLOSE')
            return <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">⚪ Prev Close</span>;
        return <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">AFTER HRS</span>;
    };

    return (
        <Card className="shadow-sm border-slate-200 bg-white hover:shadow-md transition-shadow">
            <CardHeader className="pb-2.5 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-indigo-500" /> Flow Dynamics (Dark Pool)
                    {getSourceBadge()}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                {/* Net Premium Large Display */}
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Net Premium (Est)</span>
                    {isScanning ? (
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                            <span className="text-xl font-bold text-slate-300 italic">Scanning...</span>
                        </div>
                    ) : (
                        <div className={`text-3xl font-black tabular-nums tracking-tighter ${isPositive ? "text-emerald-500" : isNeutral ? "text-slate-400" : "text-rose-500"}`}>
                            {isPositive ? "+" : isNeutral ? "" : "-"}${netPremFormatted}
                        </div>
                    )}
                </div>

                {/* Additional Flow Metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-slate-50 rounded border border-slate-100">
                        <div className="text-[9px] text-slate-400 font-bold uppercase">Call Flow</div>
                        <div className="font-mono font-bold text-emerald-600">
                            ${((flow?.callPremium || 0) / 1000000).toFixed(1)}M
                        </div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded border border-slate-100">
                        <div className="text-[9px] text-slate-400 font-bold uppercase">Put Flow</div>
                        <div className="font-mono font-bold text-rose-500">
                            ${((flow?.putPremium || 0) / 1000000).toFixed(1)}M
                        </div>
                    </div>
                </div>

                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-50 pt-2">
                    * Based on {flow?.optionsCount || 0} contracts ({dataSource === 'PREVIOUS_CLOSE' ? 'Previous Session' : 'Latest'})
                </div>
            </CardContent>
        </Card>
    );
}
