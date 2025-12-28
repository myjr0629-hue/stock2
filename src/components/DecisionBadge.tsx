
import React from 'react';
import { GemsTicker } from '@/services/stockTypes';

interface DecisionBadgeProps {
    tickerData: any;
}

export function DecisionBadge({ tickerData }: DecisionBadgeProps) {
    // [S-56.4.4] UI SSOT LOCK: Enforce decisionSSOT priority
    // decisionSSOT가 있으면 무조건 그것을 따름. v71은 Legacy로 취급.
    const decision = tickerData.decisionSSOT || tickerData.v71?.decisionSSOT;
    const gs = tickerData.v71?.gateStatus;

    if (decision) {
        const { action, triggersKR } = decision;
        const mainReason = triggersKR?.[0] || "데이터 분석 중";

        // SSOT Actions
        if (action === 'MAINTAIN' || action === 'ENTER') return (
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                🟢 {action === 'ENTER' ? '진입 (ENTER)' : '유지 (MAINTAIN)'} <span className="text-slate-500 font-medium">| {mainReason}</span>
            </span>
        );
        if (action === 'CAUTION') return (
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1">
                🟡 주의 (CAUTION) <span className="text-slate-500 font-medium">| {mainReason}</span>
            </span>
        );
        if (action === 'EXIT' || action === 'REPLACE') return (
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1">
                🔴 {action === 'REPLACE' ? '교체 (REPLACE)' : '청산 (EXIT)'} <span className="text-slate-500 font-medium">| {mainReason}</span>
            </span>
        );
    }

    // Fallback to GateStatus (Legacy Display)
    if (!gs) {
        return (
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                ⚪ 데이터 동기화 중 ({tickerData.v71?.gate || 'WAIT'})
            </span>
        );
    }

    const { eligible, reasonsKR, summary } = gs;
    const mainReason = reasonsKR?.[0] || summary;

    if (eligible === 'FAIL') return (
        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1">
            🔴 거래 불가 ({mainReason})
        </span>
    );

    return (
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            ⚪ {eligible} ({mainReason})
        </span>
    );
}
