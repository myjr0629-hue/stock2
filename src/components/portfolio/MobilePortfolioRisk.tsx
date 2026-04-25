'use client';

import React, { useMemo } from 'react';
import type { EnrichedHolding, PortfolioSummary } from '@/hooks/usePortfolio';
import { useTranslations } from 'next-intl';
import { CardTooltip, PORTFOLIO_TOOLTIPS } from '@/components/ui/CardTooltip';

const SECTOR_MAP: Record<string, { sector: string; color: string }> = {
    AAPL: { sector: 'Technology', color: '#818cf8' }, MSFT: { sector: 'Technology', color: '#818cf8' },
    GOOGL: { sector: 'Communication', color: '#f472b6' }, GOOG: { sector: 'Communication', color: '#f472b6' },
    META: { sector: 'Communication', color: '#f472b6' }, NFLX: { sector: 'Communication', color: '#f472b6' },
    AMZN: { sector: 'Consumer Disc.', color: '#fb923c' }, TSLA: { sector: 'Consumer Disc.', color: '#fb923c' },
    NVDA: { sector: 'Technology', color: '#818cf8' }, AMD: { sector: 'Technology', color: '#818cf8' },
    INTC: { sector: 'Technology', color: '#818cf8' }, CRM: { sector: 'Technology', color: '#818cf8' },
    AVGO: { sector: 'Technology', color: '#818cf8' }, ORCL: { sector: 'Technology', color: '#818cf8' },
    JPM: { sector: 'Financials', color: '#fbbf24' }, GS: { sector: 'Financials', color: '#fbbf24' },
    BAC: { sector: 'Financials', color: '#fbbf24' }, V: { sector: 'Financials', color: '#fbbf24' },
    UNH: { sector: 'Healthcare', color: '#34d399' }, JNJ: { sector: 'Healthcare', color: '#34d399' },
    XOM: { sector: 'Energy', color: '#f87171' }, CVX: { sector: 'Energy', color: '#f87171' },
    PG: { sector: 'Consumer Staples', color: '#a78bfa' }, KO: { sector: 'Consumer Staples', color: '#a78bfa' },
    PLTR: { sector: 'Technology', color: '#818cf8' }, COIN: { sector: 'Financials', color: '#fbbf24' },
    SMCI: { sector: 'Technology', color: '#818cf8' }, ARM: { sector: 'Technology', color: '#818cf8' },
    TSM: { sector: 'Technology', color: '#818cf8' }, MU: { sector: 'Technology', color: '#818cf8' },
    SPY: { sector: 'ETF', color: '#6ee7b7' }, QQQ: { sector: 'ETF', color: '#6ee7b7' },
};
const DEFAULT_SECTOR = { sector: 'Other', color: '#64748b' };

export default function MobilePortfolioRisk({
    holdings, summary,
}: {
    holdings: EnrichedHolding[];
    summary: PortfolioSummary;
}) {
    const t = useTranslations('portfolio');

    const sectorData = useMemo(() => {
        const map: Record<string, { sector: string; value: number }> = {};
        holdings.forEach(h => {
            const s = SECTOR_MAP[h.ticker] || DEFAULT_SECTOR;
            if (!map[s.sector]) map[s.sector] = { sector: s.sector, value: 0 };
            map[s.sector].value += h.marketValue;
        });
        return Object.values(map).sort((a, b) => b.value - a.value);
    }, [holdings]);

    const riskMetrics = useMemo(() => {
        const topWeight = holdings.length > 0 ? Math.max(...holdings.map(h => h.marketValue / Math.max(summary.totalValue, 1) * 100)) : 0;
        const topSectorWeight = sectorData.length > 0 ? (sectorData[0].value / Math.max(summary.totalValue, 1)) * 100 : 0;
        return { topWeight, topSectorWeight, holdingsCount: holdings.length, sectorCount: sectorData.length };
    }, [holdings, sectorData, summary.totalValue]);

    if (holdings.length === 0) return null;

    return (
        <div className="space-y-3">
            {/* Risk Assessment */}
            <div className="m-glass-card">
                <CardTooltip tooltip={PORTFOLIO_TOOLTIPS.RISK_ASSESSMENT.tooltip} badge={PORTFOLIO_TOOLTIPS.RISK_ASSESSMENT.badge}>
                    <div className="text-[11px] text-slate-300 uppercase tracking-widest font-bold mb-4">{t('riskAssessment')}</div>
                </CardTooltip>

                {/* Concentration */}
                <div className="mb-4">
                    <div className="flex justify-between items-center mb-1.5">
                        <CardTooltip tooltip={PORTFOLIO_TOOLTIPS.CONCENTRATION.tooltip}>
                            <span className="text-[12px] text-slate-300 font-bold">{t('concentration')}</span>
                        </CardTooltip>
                        <span className={`text-[13px] font-black tabular-nums ${riskMetrics.topWeight > 40 ? 'text-rose-400' : riskMetrics.topWeight > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {riskMetrics.topWeight.toFixed(0)}%
                        </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${riskMetrics.topWeight > 40 ? 'bg-rose-400' : riskMetrics.topWeight > 30 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(riskMetrics.topWeight, 100)}%` }} />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1.5">{riskMetrics.topWeight > 40 ? t('highConcentration') : riskMetrics.topWeight > 30 ? t('moderateConcentration') : t('wellDiversified')}</div>
                </div>

                {/* Sector Bias */}
                <div className="mb-4">
                    <div className="flex justify-between items-center mb-1.5">
                        <CardTooltip tooltip={PORTFOLIO_TOOLTIPS.SECTOR_BIAS.tooltip}>
                            <span className="text-[12px] text-slate-300 font-bold">{t('sectorBias')}</span>
                        </CardTooltip>
                        <span className={`text-[13px] font-black tabular-nums ${riskMetrics.topSectorWeight > 60 ? 'text-rose-400' : riskMetrics.topSectorWeight > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {riskMetrics.topSectorWeight.toFixed(0)}%
                        </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${riskMetrics.topSectorWeight > 60 ? 'bg-rose-400' : riskMetrics.topSectorWeight > 40 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(riskMetrics.topSectorWeight, 100)}%` }} />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1.5">{sectorData[0]?.sector || '-'} {t('dominant')}</div>
                </div>

                {/* Diversification */}
                <div>
                    <div className="flex justify-between items-center mb-1.5">
                        <CardTooltip tooltip={PORTFOLIO_TOOLTIPS.DIVERSIFICATION.tooltip}>
                            <span className="text-[12px] text-slate-300 font-bold">{t('diversification')}</span>
                        </CardTooltip>
                        <span className="text-[13px] font-black tabular-nums text-white">{riskMetrics.holdingsCount} / {riskMetrics.sectorCount} {t('sect')}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-400 transition-all duration-700" style={{ width: `${Math.min(riskMetrics.sectorCount * 15, 100)}%` }} />
                    </div>
                </div>
            </div>
        </div>
    );
}
