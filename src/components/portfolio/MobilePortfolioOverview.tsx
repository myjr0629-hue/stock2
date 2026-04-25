'use client';

import React, { useMemo, useState, useEffect } from 'react';
import type { EnrichedHolding, PortfolioSummary } from '@/hooks/usePortfolio';
import { useTranslations, useLocale } from 'next-intl';
import { Wallet, PiggyBank, Activity, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ProGate } from '@/components/gate/FeatureGate';
import { useTier } from '@/contexts/TierContext';
import { EChartsSectorDonut, EChartsPnlTreemap } from '@/components/portfolio/PortfolioCharts';
import useSWR from 'swr';

// ── Exchange Rate (shared logic) ──
const fxFetcher = (url: string) => fetch(url).then(r => r.json());
function useExchangeRate(locale: string) {
    const { data } = useSWR('/api/exchange-rates', fxFetcher, { refreshInterval: 60_000, dedupingInterval: 30_000 });
    const rate = locale === 'ko' ? data?.usdkrw : locale === 'ja' ? data?.usdjpy : null;
    const symbol = locale === 'ko' ? '₩' : locale === 'ja' ? '¥' : '$';
    return { rate, symbol };
}

function CurrencyLine({ usd, locale, showSign }: { usd: number; locale: string; showSign?: boolean }) {
    const { rate, symbol } = useExchangeRate(locale);
    if (!rate || locale === 'en') return null;
    const converted = usd * rate;
    const formatted = Math.abs(converted).toLocaleString(locale === 'ko' ? 'ko-KR' : 'ja-JP', { maximumFractionDigits: 0 });
    const sign = showSign && converted >= 0 ? '+' : showSign && converted < 0 ? '-' : '';
    return <div className="text-[13px] font-bold tabular-nums text-slate-300 mt-0.5">≈ {sign}{symbol}{formatted}</div>;
}

// ── Sector Data (same mapping as PortfolioClientPage) ──
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
    MA: { sector: 'Financials', color: '#fbbf24' }, MS: { sector: 'Financials', color: '#fbbf24' },
    UNH: { sector: 'Healthcare', color: '#34d399' }, JNJ: { sector: 'Healthcare', color: '#34d399' },
    LLY: { sector: 'Healthcare', color: '#34d399' }, PFE: { sector: 'Healthcare', color: '#34d399' },
    XOM: { sector: 'Energy', color: '#f87171' }, CVX: { sector: 'Energy', color: '#f87171' },
    PG: { sector: 'Consumer Staples', color: '#a78bfa' }, KO: { sector: 'Consumer Staples', color: '#a78bfa' },
    DIS: { sector: 'Communication', color: '#f472b6' }, BA: { sector: 'Industrials', color: '#94a3b8' },
    CAT: { sector: 'Industrials', color: '#94a3b8' }, UPS: { sector: 'Industrials', color: '#94a3b8' },
    NEE: { sector: 'Utilities', color: '#67e8f9' }, SPY: { sector: 'ETF', color: '#6ee7b7' },
    QQQ: { sector: 'ETF', color: '#6ee7b7' }, IWM: { sector: 'ETF', color: '#6ee7b7' },
    PLTR: { sector: 'Technology', color: '#818cf8' }, COIN: { sector: 'Financials', color: '#fbbf24' },
    SQ: { sector: 'Financials', color: '#fbbf24' }, SOFI: { sector: 'Financials', color: '#fbbf24' },
    SMCI: { sector: 'Technology', color: '#818cf8' }, MSTR: { sector: 'Technology', color: '#818cf8' },
    ARM: { sector: 'Technology', color: '#818cf8' }, TSM: { sector: 'Technology', color: '#818cf8' },
    MU: { sector: 'Technology', color: '#818cf8' }, QCOM: { sector: 'Technology', color: '#818cf8' },
    UBER: { sector: 'Technology', color: '#818cf8' }, SHOP: { sector: 'Technology', color: '#818cf8' },
    SNOW: { sector: 'Technology', color: '#818cf8' }, NET: { sector: 'Technology', color: '#818cf8' },
};
const DEFAULT_SECTOR = { sector: 'Other', color: '#64748b' };

// ═══════════════════════════════════════════════════════════════
// MobilePortfolioOverview — Tab 1: Hero + Stats + Sector + Treemap
// ═══════════════════════════════════════════════════════════════

export default function MobilePortfolioOverview({
    holdings, summary, portfolioScore,
}: {
    holdings: EnrichedHolding[];
    summary: PortfolioSummary;
    portfolioScore: number;
}) {
    const t = useTranslations('portfolio');
    const gt = useTranslations('gate');
    const locale = useLocale();
    const isPos = summary.totalGainLossPct >= 0;
    const grade = portfolioScore >= 80 ? 'A' : portfolioScore >= 65 ? 'B' : portfolioScore >= 50 ? 'C' : 'D';
    const gradeColor = grade === 'A' ? 'text-emerald-400' : grade === 'B' ? 'text-cyan-400' : grade === 'C' ? 'text-amber-400' : 'text-rose-400';
    const gradeStroke = grade === 'A' ? 'stroke-emerald-400' : grade === 'B' ? 'stroke-cyan-400' : grade === 'C' ? 'stroke-amber-400' : 'stroke-rose-400';
    const circ = 2 * Math.PI * 15;
    const offset = circ - (portfolioScore / 100) * circ;

    // Session clock
    const [now, setNow] = useState(new Date());
    useEffect(() => { const tm = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(tm); }, []);
    const etInfo = useMemo(() => {
        const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const etDateStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
        const p = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':');
        const mins = parseInt(p[0]) * 60 + parseInt(p[1]);
        const dow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
        const isWE = dow === 0 || dow === 6;
        let session: string, nextLabel: string, countdown: string;
        if (isWE) { session = 'closed'; nextLabel = 'Pre-Market'; const d = (dow === 0 ? 1 : 2) * 1440 + (240 - mins); const h = Math.floor(d / 60); countdown = h > 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${d % 60}m`; }
        else if (mins < 240) { session = 'closed'; nextLabel = 'Pre-Market'; const d = 240 - mins; countdown = `${Math.floor(d / 60)}h ${d % 60}m`; }
        else if (mins < 570) { session = 'pre'; nextLabel = 'Regular opens'; const d = 570 - mins; countdown = `${Math.floor(d / 60)}h ${d % 60}m`; }
        else if (mins < 960) { session = 'reg'; nextLabel = 'Closes'; const d = 960 - mins; countdown = `${Math.floor(d / 60)}h ${d % 60}m`; }
        else if (mins < 1200) { session = 'post'; nextLabel = 'Post closes'; const d = 1200 - mins; countdown = `${Math.floor(d / 60)}h ${d % 60}m`; }
        else { session = 'closed'; nextLabel = 'Pre-Market'; const d = 1680 - mins; countdown = `${Math.floor(d / 60)}h ${d % 60}m`; }
        return { etStr, etDateStr, session, nextLabel, countdown };
    }, [now]);
    const sc = etInfo.session === 'reg' ? 'emerald' : etInfo.session === 'pre' ? 'cyan' : etInfo.session === 'post' ? 'amber' : 'slate';

    // Sector data
    const sectorData = useMemo(() => {
        const map: Record<string, { sector: string; color: string; value: number }> = {};
        holdings.forEach(h => {
            const s = SECTOR_MAP[h.ticker] || DEFAULT_SECTOR;
            if (!map[s.sector]) map[s.sector] = { sector: s.sector, color: s.color, value: 0 };
            map[s.sector].value += h.marketValue;
        });
        return Object.values(map).sort((a, b) => b.value - a.value);
    }, [holdings]);

    if (holdings.length === 0) return null;

    return (
        <div className="space-y-3">
            {/* ── Hero Total Value Card ── */}
            <div className="m-glass-card relative overflow-hidden" style={{ borderColor: 'rgba(52,211,153,0.25)', background: 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(52,211,153,0.02))' }}>
                <svg className="absolute top-2 right-2 w-20 h-7 opacity-40" viewBox="0 0 80 28" preserveAspectRatio="none">
                    <polyline points="0,20 10,18 20,22 30,16 40,14 50,12 60,10 70,6 80,4" stroke="#4ade80" strokeWidth="1" fill="none" />
                </svg>
                <div className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" /> {t('totalEvaluation')}
                </div>
                <div className="text-[32px] font-black text-white tabular-nums tracking-tight leading-none">
                    ${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <CurrencyLine usd={summary.totalValue} locale={locale} />
                <div className="flex items-center gap-2 mt-2">
                    <span className={`text-lg font-black tabular-nums ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPos ? '+' : ''}{summary.totalGainLossPct.toFixed(2)}%
                    </span>
                    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[12px] font-bold tabular-nums ${isPos ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'}`}>
                        {isPos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {isPos ? '+' : ''}${Math.abs(summary.totalGainLoss).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                </div>
                <CurrencyLine usd={summary.totalGainLoss} locale={locale} showSign />
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/[0.06]">
                    <div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">{t('totalInvestment')}</div>
                        <div className="text-[14px] font-bold tabular-nums text-white">${summary.totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Holdings</div>
                        <div className="text-[14px] font-bold text-white">{holdings.length} <span className="text-slate-400 font-normal text-[11px]">/ {sectorData.length} sectors</span></div>
                    </div>
                </div>
            </div>

            {/* ── Score + Market Status (2-col) ── */}
            <div className="grid grid-cols-2 gap-3">
                {/* Portfolio Score */}
                <div className="m-glass-card" style={{ borderColor: 'rgba(251,191,36,0.2)', background: 'linear-gradient(135deg, rgba(251,191,36,0.05), rgba(251,191,36,0.01))' }}>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mb-2 flex items-center gap-1">
                        <Target className="w-3 h-3 text-amber-400" /> {t('portfolioScore')}
                    </div>
                    <ProGate mode="blur" compact tooltipPosition="above" fomoMessage={gt('fomoPortfolioScore')} description={gt('descAiDeep')}>
                        <div className="flex items-center gap-2.5">
                            <div className="relative w-10 h-10 flex-shrink-0">
                                <svg className="w-10 h-10 -rotate-90"><circle cx="20" cy="20" r="15" fill="none" stroke="#1e293b" strokeWidth="3" /><circle cx="20" cy="20" r="15" fill="none" className={gradeStroke} strokeWidth="3" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s' }} /></svg>
                                <div className={`absolute inset-0 flex items-center justify-center text-[11px] font-black ${gradeColor}`}>{grade}</div>
                            </div>
                            <div>
                                <div className="text-xl font-black text-white tabular-nums">{portfolioScore}</div>
                                <div className="text-[10px] text-slate-400">{holdings.length} {t('avgOfHoldings')}</div>
                            </div>
                        </div>
                    </ProGate>
                </div>
                {/* Market Status */}
                <div className="m-glass-card">
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sc === 'emerald' ? 'bg-emerald-400 animate-pulse' : sc === 'cyan' ? 'bg-cyan-400 animate-pulse' : sc === 'amber' ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
                        <span className="text-[11px] font-black text-white uppercase tracking-wide">
                            {etInfo.session === 'reg' ? 'REGULAR' : etInfo.session === 'pre' ? 'PRE-MKT' : etInfo.session === 'post' ? 'POST' : 'CLOSED'}
                        </span>
                    </div>
                    <div className="text-[14px] font-bold tabular-nums text-white">{etInfo.etStr} <span className="text-[10px] text-slate-400">ET</span></div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{etInfo.etDateStr}</div>
                    <div className="mt-1 flex items-center gap-1">
                        <span className={`text-[10px] font-bold ${sc === 'emerald' ? 'text-emerald-400' : sc === 'cyan' ? 'text-cyan-400' : sc === 'amber' ? 'text-amber-400' : 'text-slate-400'}`}>{etInfo.nextLabel}</span>
                        <span className="text-[10px] font-black tabular-nums text-white/60">{etInfo.countdown}</span>
                    </div>
                </div>
            </div>

            {/* ── Sector Distribution ── */}
            {sectorData.length > 0 && (
                <div className="m-glass-card">
                    <div className="flex justify-between items-center mb-3">
                        <div className="text-[11px] text-slate-300 uppercase tracking-widest font-bold">{t('sectorDistribution')}</div>
                        <span className="text-[9px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-bold">{sectorData.length} {t('sectors')}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <EChartsSectorDonut sectors={sectorData} total={summary.totalValue} label={t('sectors')} />
                        <div className="flex-1 space-y-2">
                            {sectorData.slice(0, 5).map(s => (
                                <div key={s.sector} className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                                    <span className="text-[11px] text-slate-300 font-bold truncate flex-1">{s.sector}</span>
                                    <span className="text-[12px] text-white font-black tabular-nums">{summary.totalValue > 0 ? ((s.value / summary.totalValue) * 100).toFixed(0) : 0}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── P&L Treemap ── */}
            {holdings.length > 0 && (
                <div className="m-glass-card">
                    <div className="text-[11px] text-slate-300 uppercase tracking-widest font-bold mb-2">{t('pnlTreemap')}</div>
                    <div style={{ minHeight: 200 }}>
                        <EChartsPnlTreemap holdings={holdings} totalValue={summary.totalValue} />
                    </div>
                </div>
            )}
        </div>
    );
}
