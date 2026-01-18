
import React from 'react';
import { useTranslations } from 'next-intl';
import { GemsTicker } from '@/services/stockTypes';

interface DecisionBadgeProps {
    tickerData: any;
}

export function DecisionBadge({ tickerData }: DecisionBadgeProps) {
    const t = useTranslations('command');
    // [S-56.4.4] UI SSOT LOCK: Enforce decisionSSOT priority
    const decision = tickerData.decisionSSOT || tickerData.v71?.decisionSSOT;
    const gs = tickerData.v71?.gateStatus;

    if (decision) {
        const { action, triggersKR } = decision;
        const mainReason = triggersKR?.[0] || t('dataAnalyzing');

        // SSOT Actions
        if (action === 'MAINTAIN' || action === 'ENTER') return (
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                🟢 {action === 'ENTER' ? t('enter') : t('maintain')} <span className="text-slate-500 font-medium">| {mainReason}</span>
            </span>
        );
        if (action === 'CAUTION') return (
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1">
                🟡 {t('cautionAction')} <span className="text-slate-500 font-medium">| {mainReason}</span>
            </span>
        );
        if (action === 'EXIT' || action === 'REPLACE') return (
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1">
                🔴 {action === 'REPLACE' ? t('replace') : t('exit')} <span className="text-slate-500 font-medium">| {mainReason}</span>
            </span>
        );
    }

    // Fallback to GateStatus (Legacy Display)
    if (!gs) {
        return (
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                ⚪ {t('dataSyncing')} ({tickerData.v71?.gate || 'WAIT'})
            </span>
        );
    }

    const { eligible, reasonsKR, summary } = gs;
    const mainReason = reasonsKR?.[0] || summary;

    if (eligible === 'FAIL') return (
        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1">
            🔴 {t('tradingNotAllowed')} ({mainReason})
        </span>
    );

    return (
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            ⚪ {eligible} ({mainReason})
        </span>
    );
}
