'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { usePortfolio, type EnrichedHolding } from '@/hooks/usePortfolio';
import { useTranslations, useLocale } from 'next-intl';
import {
    TrendingUp, TrendingDown, Plus, RefreshCw, Briefcase, ChevronRight,
    Trash2, ArrowUpRight, ArrowDownRight, Wallet, PiggyBank, Activity,
    Zap, Target, Edit3, Star, Search, X, Loader2, Clock, LayoutDashboard
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useDashboardStore } from '@/stores/dashboardStore';

export default function PortfolioPage() {
    const { holdings, summary, loading, isRefreshing, refresh, removeHolding } = usePortfolio();
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingHolding, setEditingHolding] = useState<EnrichedHolding | null>(null);
    const t = useTranslations('portfolio');
    const tCommon = useTranslations('common');
    const locale = useLocale();

    // SWR handles dual-interval polling automatically:
    // - Price/P&L: every 5 seconds (lightweight, price-only API)
    // - Alpha/Signal/Action: every 30 seconds (full API with engine)

    // Calculate portfolio score (average of all alpha scores)
    const portfolioScore = holdings.length > 0
        ? Math.round(holdings.reduce((sum, h) => sum + (h.alphaScore || 50), 0) / holdings.length)
        : 0;

    return (
        <div className="min-h-screen bg-[#0c1220] text-slate-100">
            {/* Global Header */}
            {/* Page Header - Minimal & Premium */}
            <div className="border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-emerald-400/80" />
                        <span className="text-sm font-bold tracking-wide text-white/90">PORTFOLIO</span>
                        <span className="text-[8px] font-medium text-emerald-400/60 tracking-widest bg-emerald-400/[0.08] px-1.5 py-0.5 rounded">PREMIUM</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => refresh()}
                            className="p-2 hover:bg-white/5 rounded transition-all relative"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 hover:text-slate-300 ${loading ? 'animate-spin' : ''}`} />
                            {isRefreshing && (
                                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                            )}
                        </button>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-emerald-500/15 to-cyan-500/10 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 text-xs font-bold rounded-lg transition-all hover:from-emerald-500/25 hover:to-cyan-500/15"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ Add</span>
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-5">
                {/* Stats Dashboard */}
                <PortfolioStatsBar summary={summary} portfolioScore={portfolioScore} holdingsCount={holdings.length} />

                {/* Premium Holdings Table - Glassmorphism */}
                {loading ? (
                    <div className="space-y-2">{[0, 1, 2, 3].map(i => (
                        <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-4 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                            <div className="flex items-center gap-4">
                                <div className="w-9 h-9 rounded-lg bg-slate-700/40" />
                                <div className="flex-1 space-y-1.5"><div className="h-4 w-16 bg-slate-700/40 rounded" /><div className="h-2.5 w-28 bg-slate-800/40 rounded" /></div>
                                <div className="h-4 w-12 bg-slate-700/40 rounded" />
                                <div className="h-4 w-16 bg-slate-700/40 rounded" />
                                <div className="h-4 w-16 bg-slate-700/40 rounded" />
                                <div className="h-4 w-12 bg-slate-700/40 rounded" />
                                <div className="w-9 h-9 rounded-full bg-slate-700/40" />
                                <div className="h-7 w-16 bg-slate-700/40 rounded-full" />
                            </div>
                        </div>
                    ))}</div>
                ) : holdings.length === 0 ? (
                    <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.02] backdrop-blur-xl py-20 text-center">
                        <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 border border-emerald-500/20 flex items-center justify-center">
                            <Briefcase className="w-10 h-10 text-emerald-400/40" />
                        </div>
                        <p className="text-slate-300 font-bold text-lg mb-1">{t('noHoldings')}</p>
                        <p className="text-slate-500 text-sm mb-6">{t('startPortfolio')}</p>
                        <button onClick={() => setShowAddModal(true)} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500/20 to-cyan-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-bold rounded-xl hover:from-emerald-500/30 hover:to-cyan-500/20 transition-all">
                            {t('addFirstHolding')}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {/* Column Headers (glassmorphism bar — same as watchlist) */}
                        <div className="flex items-center rounded-lg border border-white/[0.04] bg-white/[0.03] backdrop-blur-sm">
                            <div className="w-11 flex-shrink-0" />
                            <div className={`flex-1 ${PORTFOLIO_GRID} px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider`}>
                                <div className="pl-1">{t('ticker')}</div>
                                <div className="text-center">Chart</div>
                                <div className="text-center">{t('avgPrice') || '매입가'}</div>
                                <div className="text-center">{t('currentPrice')}</div>
                                <div className="text-center">{t('quantity')}</div>
                                <div className="text-center">{t('profitLoss')}</div>
                                <div className="text-center">{t('weight')}</div>
                                <div className="text-center">{t('daysHeld')}</div>
                                <div className="text-center">Alpha</div>
                                <div className="text-center">Signal</div>
                                <div className="text-center">{t('action')}</div>
                            </div>
                            <div className="w-[60px] flex-shrink-0" />
                        </div>
                        {/* Cards */}
                        {holdings.map((holding, i) => (
                            <PremiumHoldingRow key={holding.ticker} holding={holding} onRemove={() => removeHolding(holding.ticker)} onEdit={() => setEditingHolding(holding)} totalValue={summary.totalValue} index={i} />
                        ))}
                    </div>
                )}
            </main>

            {/* Add Modal */}
            {showAddModal && (
                <AddHoldingModal
                    onClose={() => setShowAddModal(false)}
                    onHoldingAdded={refresh}
                />
            )}

            {/* Edit Modal */}
            {editingHolding && (
                <EditHoldingModal
                    holding={editingHolding}
                    onClose={() => setEditingHolding(null)}
                    onUpdated={refresh}
                />
            )}
            <GlobalStyles />
        </div>
    );
}

// === PORTFOLIO STATS BAR ===

function PortfolioStatsBar({ summary, portfolioScore, holdingsCount }: { summary: { totalValue: number; totalCost: number; totalGainLoss: number; totalGainLossPct: number; holdingsCount: number }; portfolioScore: number; holdingsCount: number }) {
    const t = useTranslations('portfolio');
    const [now, setNow] = useState(new Date());
    useEffect(() => { const tm = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(tm); }, []);
    const isPos = summary.totalGainLossPct >= 0;
    const grade = portfolioScore >= 80 ? 'A' : portfolioScore >= 65 ? 'B' : portfolioScore >= 50 ? 'C' : 'D';
    const gaugeRot = isPos ? Math.min(summary.totalGainLossPct, 50) / 50 * 90 : -Math.min(Math.abs(summary.totalGainLossPct), 50) / 50 * 90;

    const etInfo = useMemo(() => {
        const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const etDateStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
        const p = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':');
        const mins = parseInt(p[0]) * 60 + parseInt(p[1]);
        const dow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
        const isWE = dow === 0 || dow === 6;
        let session: string, nextLabel: string, countdown: string;
        if (isWE) { session = 'closed'; nextLabel = 'Pre-Market opens'; const d = (dow === 0 ? 1 : 2) * 1440 + (240 - mins); const h = Math.floor(d / 60); countdown = h > 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${d % 60}m`; }
        else if (mins < 240) { session = 'closed'; nextLabel = 'Pre-Market opens'; const d = 240 - mins; countdown = `${Math.floor(d / 60)}h ${d % 60}m`; }
        else if (mins < 570) { session = 'pre'; nextLabel = 'Regular opens'; const d = 570 - mins; countdown = `${Math.floor(d / 60)}h ${d % 60}m`; }
        else if (mins < 960) { session = 'reg'; nextLabel = 'Market closes'; const d = 960 - mins; countdown = `${Math.floor(d / 60)}h ${d % 60}m`; }
        else if (mins < 1200) { session = 'post'; nextLabel = 'Post closes'; const d = 1200 - mins; countdown = `${Math.floor(d / 60)}h ${d % 60}m`; }
        else { session = 'closed'; nextLabel = 'Pre-Market opens'; const d = 1680 - mins; countdown = `${Math.floor(d / 60)}h ${d % 60}m`; }
        return { etStr, etDateStr, session, nextLabel, countdown };
    }, [now]);

    const sc = etInfo.session === 'reg' ? 'emerald' : etInfo.session === 'pre' ? 'cyan' : etInfo.session === 'post' ? 'amber' : 'slate';
    const gradeColor = grade === 'A' ? 'stroke-emerald-400 text-emerald-400' : grade === 'B' ? 'stroke-cyan-400 text-cyan-400' : grade === 'C' ? 'stroke-amber-400 text-amber-400' : 'stroke-rose-400 text-rose-400';
    const circ = 2 * Math.PI * 15;
    const offset = circ - (portfolioScore / 100) * circ;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Portfolio Value */}
            <div className="group relative overflow-hidden rounded-xl border border-emerald-500/[0.18] bg-gradient-to-br from-emerald-500/[0.12] via-white/[0.06] to-emerald-500/[0.04] backdrop-blur-xl p-4 hover:border-emerald-500/[0.35] transition-all duration-300" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 40px rgba(52,211,153,0.08)' }}>
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
                <div className="flex items-center gap-2 mb-2"><Wallet className="w-4 h-4 text-emerald-400" style={{ filter: 'drop-shadow(0 0 4px rgba(52,211,153,0.5))' }} /><span className="text-[10px] text-slate-300 uppercase tracking-[0.15em] font-bold">{t('totalEvaluation')}</span></div>
                <div className="text-2xl font-black text-white tabular-nums tracking-tight" style={{ textShadow: '0 0 30px rgba(255,255,255,0.15)' }}>${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <svg className="absolute right-0 top-0 w-32 h-full opacity-[0.1]" viewBox="0 0 100 60" preserveAspectRatio="none"><polyline points="0,30 15,30 20,10 25,50 30,20 35,40 40,30 55,30 60,15 65,45 70,25 75,35 80,30 100,30" fill="none" stroke="#34d399" strokeWidth="2" /></svg>
                <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-emerald-400/[0.15] to-transparent rounded-bl-[3rem]" />
                <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-emerald-500/[0.06] rounded-full blur-xl" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.04] bg-gradient-to-r from-transparent via-emerald-400 to-transparent transition-opacity duration-500" style={{ animation: 'shimmer 3s ease-in-out infinite' }} />
            </div>
            {/* Total Cost */}
            <div className="group relative overflow-hidden rounded-xl border border-cyan-500/[0.18] bg-gradient-to-br from-cyan-500/[0.1] via-white/[0.06] to-cyan-500/[0.04] backdrop-blur-xl p-4 hover:border-cyan-500/[0.35] transition-all duration-300" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 40px rgba(34,211,238,0.07)' }}>
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
                <div className="flex items-center gap-2 mb-2"><PiggyBank className="w-4 h-4 text-cyan-400" style={{ filter: 'drop-shadow(0 0 4px rgba(34,211,238,0.5))' }} /><span className="text-[10px] text-slate-300 uppercase tracking-[0.15em] font-bold">{t('totalInvestment')}</span></div>
                <div className="text-2xl font-black text-white tabular-nums tracking-tight" style={{ textShadow: '0 0 30px rgba(255,255,255,0.15)' }}>${summary.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <svg className="absolute right-1 top-1 w-20 h-20 opacity-[0.08]" viewBox="0 0 60 60"><rect x="10" y="25" width="40" height="25" rx="4" fill="none" stroke="#22d3ee" strokeWidth="1.5" /><rect x="18" y="18" width="24" height="10" rx="3" fill="none" stroke="#22d3ee" strokeWidth="1" /></svg>
                <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-cyan-500/[0.06] rounded-full blur-xl" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.04] bg-gradient-to-r from-transparent via-cyan-400 to-transparent transition-opacity duration-500" style={{ animation: 'shimmer 3s ease-in-out infinite' }} />
            </div>
            {/* P&L — Clean Modern */}
            <div className={`group relative overflow-hidden rounded-xl border ${isPos ? 'border-emerald-500/[0.25]' : 'border-rose-500/[0.25]'} bg-gradient-to-br ${isPos ? 'from-emerald-500/[0.12] via-white/[0.07] to-emerald-500/[0.04]' : 'from-rose-500/[0.12] via-white/[0.07] to-rose-500/[0.04]'} backdrop-blur-xl p-4 hover:border-white/[0.35] transition-all duration-300`} style={{ boxShadow: isPos ? '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 40px rgba(52,211,153,0.12)' : '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 40px rgba(251,113,133,0.12)' }}>
                <div className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent ${isPos ? 'via-emerald-400/50' : 'via-rose-400/50'} to-transparent`} />
                <div className="flex items-center gap-2 mb-2"><Activity className={`w-4 h-4 ${isPos ? 'text-emerald-400' : 'text-rose-400'}`} style={{ filter: isPos ? 'drop-shadow(0 0 4px rgba(52,211,153,0.5))' : 'drop-shadow(0 0 4px rgba(251,113,133,0.5))' }} /><span className="text-[10px] text-slate-300 uppercase tracking-[0.15em] font-bold">{t('returnRate')}</span></div>
                <div className="flex items-baseline gap-2">
                    <div className={`text-2xl font-black tabular-nums tracking-tight ${isPos ? 'text-emerald-400' : 'text-rose-400'}`} style={{ textShadow: isPos ? '0 0 24px rgba(52,211,153,0.4)' : '0 0 24px rgba(251,113,133,0.4)' }}>{isPos ? '+' : ''}{summary.totalGainLossPct.toFixed(2)}%</div>
                    <div className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] tabular-nums font-black ${isPos ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/15 text-rose-300 border border-rose-500/20'}`}>{isPos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}${Math.abs(summary.totalGainLoss).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                </div>
                <div className="mt-1.5 w-full h-1 rounded-full bg-slate-800/60 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-1000 ease-out ${isPos ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-rose-500 to-rose-400'}`} style={{ width: `${Math.min(Math.abs(summary.totalGainLossPct) * 2, 100)}%`, boxShadow: isPos ? '0 0 10px rgba(52,211,153,0.5)' : '0 0 10px rgba(251,113,133,0.5)' }} />
                </div>
                <div className={`absolute inset-0 opacity-[0.04] ${isPos ? 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent' : 'bg-gradient-to-r from-transparent via-rose-400 to-transparent'}`} style={{ animation: 'shimmer 3s ease-in-out infinite' }} />
            </div>
            {/* Portfolio Score */}
            <div className="group relative overflow-hidden rounded-xl border border-indigo-500/[0.18] bg-gradient-to-br from-indigo-500/[0.1] via-white/[0.06] to-indigo-500/[0.04] backdrop-blur-xl p-4 hover:border-indigo-500/[0.35] transition-all duration-300" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 40px rgba(129,140,248,0.08)' }}>
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />
                <div className="flex items-center gap-2 mb-2"><Target className="w-4 h-4 text-indigo-400" style={{ filter: 'drop-shadow(0 0 4px rgba(129,140,248,0.5))' }} /><span className="text-[10px] text-slate-300 uppercase tracking-[0.15em] font-bold">{t('portfolioScore')}</span></div>
                <div className="flex items-center gap-3">
                    <div className="relative w-11 h-11 flex-shrink-0">
                        <svg className="w-11 h-11 -rotate-90" style={{ filter: `drop-shadow(0 0 8px ${grade === 'A' ? 'rgba(52,211,153,0.4)' : grade === 'B' ? 'rgba(34,211,238,0.4)' : grade === 'C' ? 'rgba(251,191,36,0.4)' : 'rgba(251,113,133,0.4)'})` }}><circle cx="22" cy="22" r="15" fill="none" stroke="#1e293b" strokeWidth="3" /><circle cx="22" cy="22" r="15" fill="none" className={gradeColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s ease-out' }} /></svg>
                        <div className={`absolute inset-0 flex items-center justify-center text-xs font-black ${gradeColor}`}>{grade}</div>
                    </div>
                    <div><div className="text-xl font-black text-white tabular-nums" style={{ textShadow: '0 0 20px rgba(255,255,255,0.12)' }}>{portfolioScore}</div><div className="text-[10px] text-slate-400">{holdingsCount} {t('avgOfHoldings')}</div></div>
                </div>
                <svg className="absolute right-0 top-0 w-28 h-full opacity-[0.08]" viewBox="0 0 80 80"><circle cx="60" cy="40" r="12" fill="none" stroke="#818cf8" strokeWidth="1" /><circle cx="60" cy="40" r="22" fill="none" stroke="#818cf8" strokeWidth="0.8" /><circle cx="60" cy="40" r="32" fill="none" stroke="#818cf8" strokeWidth="0.5" /></svg>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] bg-gradient-to-r from-transparent via-indigo-400 to-transparent transition-opacity duration-500" style={{ animation: 'shimmer 3s ease-in-out infinite' }} />
            </div>
            {/* Session Status */}
            <div className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-white/[0.1] via-white/[0.06] to-white/[0.03] backdrop-blur-xl p-4 transition-all duration-300 ${sc === 'emerald' ? 'border-emerald-500/[0.2] hover:border-emerald-500/[0.35]' : sc === 'cyan' ? 'border-cyan-500/[0.2] hover:border-cyan-500/[0.35]' : sc === 'amber' ? 'border-amber-500/[0.2] hover:border-amber-500/[0.35]' : 'border-white/[0.12] hover:border-white/[0.25]'}`} style={{ boxShadow: `0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 40px ${sc === 'emerald' ? 'rgba(52,211,153,0.08)' : sc === 'cyan' ? 'rgba(34,211,238,0.08)' : sc === 'amber' ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.02)'}` }}>
                <div className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent ${sc === 'emerald' ? 'via-emerald-400/50' : sc === 'cyan' ? 'via-cyan-400/50' : sc === 'amber' ? 'via-amber-400/50' : 'via-white/20'} to-transparent`} />
                <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sc === 'emerald' ? 'bg-emerald-400 animate-pulse' : sc === 'cyan' ? 'bg-cyan-400 animate-pulse' : sc === 'amber' ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} style={{ boxShadow: sc === 'emerald' ? '0 0 14px rgba(52,211,153,0.6)' : sc === 'cyan' ? '0 0 14px rgba(34,211,238,0.6)' : sc === 'amber' ? '0 0 14px rgba(251,191,36,0.6)' : 'none' }} />
                    <span className="text-sm font-black text-white uppercase tracking-wide leading-none">{etInfo.session === 'reg' ? 'REGULAR' : etInfo.session === 'pre' ? 'PRE-MARKET' : etInfo.session === 'post' ? 'POST-MARKET' : 'CLOSED'}</span>
                </div>
                <div className="text-[13px] font-bold tabular-nums text-white mt-1.5">{etInfo.etStr} <span className="text-[10px] text-slate-400 font-bold">ET</span></div>
                <div className="text-[10px] text-white tabular-nums">{etInfo.etDateStr}</div>
                <div className="mt-1 flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold ${sc === 'emerald' ? 'text-emerald-400' : sc === 'cyan' ? 'text-cyan-400' : sc === 'amber' ? 'text-amber-400' : 'text-slate-400'}`}>{etInfo.nextLabel}</span>
                    <span className="text-[11px] font-black tabular-nums text-white/70">{etInfo.countdown}</span>
                </div>
                <svg className="absolute right-1 top-1 w-16 h-16 opacity-[0.08] text-white" viewBox="0 0 60 60"><circle cx="30" cy="30" r="25" fill="none" stroke="currentColor" strokeWidth="1.5" /><line x1="30" y1="30" x2="30" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="30" y1="30" x2="42" y2="30" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /><circle cx="30" cy="30" r="2" fill="currentColor" /></svg>
            </div>
        </div>
    );
}

// ─── GRID TEMPLATE (shared between header & cards) ──────────────────────
const PORTFOLIO_GRID = 'grid grid-cols-[0.8fr_0.8fr_0.7fr_1.1fr_0.6fr_1fr_0.8fr_0.6fr_0.8fr_0.9fr_0.9fr]';

// === PREMIUM HOLDING CARD (Watchlist-style) ===

function PremiumHoldingRow({ holding, onRemove, onEdit, totalValue, index = 0 }: {
    holding: EnrichedHolding;
    onRemove: () => void;
    onEdit: () => void;
    totalValue: number;
    index?: number;
}) {
    const isPositive = holding.gainLossPct >= 0;
    const weight = totalValue > 0 ? (holding.marketValue / totalValue) * 100 : 0;
    const daysHeld = holding.addedAt ? Math.floor((Date.now() - new Date(holding.addedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const toggleDashboardTicker = useDashboardStore((s) => s.toggleDashboardTicker);
    const dashboardTickers = useDashboardStore((s) => s.dashboardTickers);
    const [isInDashboard, setIsInDashboard] = useState(false);

    useEffect(() => {
        setIsInDashboard(dashboardTickers.includes(holding.ticker));
    }, [dashboardTickers, holding.ticker]);

    const getPortfolioAction = () => {
        const alpha = holding.alphaScore || 50;
        const isProfitable = holding.gainLossPct > 0;
        if (alpha >= 50 && isProfitable) return 'RUN';
        if (alpha >= 50 && !isProfitable) return 'HOLD';
        if (alpha < 40 && isProfitable) return 'TAKE';
        if (alpha < 40 && !isProfitable) return 'EXIT';
        return 'HOLD';
    };

    const accentBorder = isPositive ? 'border-l-emerald-500/40' : 'border-l-rose-500/40';

    return (
        <div
            className={`
                group relative rounded-xl overflow-hidden
                bg-gradient-to-r from-white/[0.045] via-white/[0.03] to-white/[0.02]
                backdrop-blur-xl
                border border-white/[0.08] border-l-[3px] ${accentBorder}
                hover:from-white/[0.07] hover:via-white/[0.05] hover:to-white/[0.035]
                hover:border-white/[0.12]
                hover:shadow-lg hover:shadow-black/25
                transition-all duration-300 ease-out
                shadow-md shadow-black/10
            `}
            style={{ animation: `fadeSlideIn 0.4s ease-out ${index * 60}ms both` }}
        >
            <div className="flex items-center">
                {/* BOARD Toggle */}
                <button
                    type="button"
                    onClick={() => toggleDashboardTicker(holding.ticker)}
                    className={`flex-shrink-0 w-11 h-full py-4 flex items-center justify-center transition-all duration-200 border-r border-white/[0.03] ${isInDashboard
                        ? 'text-cyan-400 bg-cyan-400/[0.04]'
                        : 'text-slate-700 hover:text-cyan-400 hover:bg-cyan-400/[0.02]'
                        }`}
                    title={isInDashboard ? 'Dashboard에서 제거' : 'Dashboard에 추가'}
                >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                </button>

                {/* All Data in Grid */}
                <Link
                    href={`/ticker?ticker=${holding.ticker}`}
                    className={`flex-1 ${PORTFOLIO_GRID} items-center px-3 py-3`}
                >
                    {/* Ticker */}
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img src={`https://financialmodelingprep.com/image-stock/${holding.ticker}.png`} alt={holding.ticker} className="w-6 h-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            <span className="text-[8px] font-bold text-slate-600 absolute">{holding.ticker.slice(0, 2)}</span>
                        </div>
                        <div className="min-w-0">
                            <div className="font-black text-[13px] text-white tracking-wide">{holding.ticker}</div>
                            <div className="text-[10px] text-slate-500 truncate">{holding.name}</div>
                        </div>
                    </div>

                    {/* Sparkline Chart */}
                    <div className="flex items-center justify-center">
                        {holding.sparkline && holding.sparkline.length > 2 ? (
                            <Sparkline data={holding.sparkline} isPositive={holding.changePct >= 0} />
                        ) : (
                            <div className="w-[55px] h-4 rounded bg-slate-800/30" />
                        )}
                    </div>

                    {/* Cost Basis (매입가) */}
                    <div className="text-center">
                        <span className="font-bold tabular-nums text-[13px] text-slate-400">${holding.avgPrice.toFixed(2)}</span>
                    </div>

                    {/* Price / Change — session-aware */}
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                            <span className="font-bold tabular-nums text-sm text-white">${holding.currentPrice.toFixed(2)}</span>
                            {(() => {
                                const etParts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':');
                                const etMins = parseInt(etParts[0]) * 60 + parseInt(etParts[1]);
                                const etDow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
                                const isWeekend = etDow === 0 || etDow === 6;
                                const realSession = isWeekend ? 'closed' : etMins < 240 ? 'closed' : etMins < 570 ? 'pre' : etMins < 960 ? 'reg' : etMins < 1200 ? 'post' : 'closed';
                                if (realSession === 'pre') return <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400">PRE</span>;
                                if (realSession === 'post') return <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">POST</span>;
                                if (realSession === 'closed') return <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-slate-500/20 text-slate-400">CLOSED</span>;
                                return null;
                            })()}
                        </div>
                        {/* Session-aware change: REG shows changePct, PRE/POST shows regChange + extChange */}
                        {holding.extLabel && holding.extChangePct !== undefined ? (
                            <div className="flex items-center justify-center gap-1 text-[12px] tabular-nums font-bold">
                                <span className={holding.regChangePct !== undefined && holding.regChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                    {holding.regChangePct !== undefined && holding.regChangePct >= 0 ? '+' : ''}{(holding.regChangePct ?? 0).toFixed(2)}%
                                </span>
                                <span className={`text-[11px] font-bold opacity-70 ${holding.extChangePct >= 0 ? 'text-cyan-400' : 'text-rose-400/80'}`}>
                                    {holding.extLabel} {holding.extChangePct >= 0 ? '+' : ''}{holding.extChangePct.toFixed(2)}%
                                </span>
                            </div>
                        ) : (
                            <div className={`text-[12px] tabular-nums font-bold ${holding.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {holding.changePct >= 0 ? '+' : ''}{holding.changePct.toFixed(2)}%
                            </div>
                        )}
                    </div>

                    {/* Quantity */}
                    <div className="text-center font-bold tabular-nums text-sm text-slate-300">{holding.quantity}</div>

                    {/* P&L */}
                    <div className="text-center">
                        <div className={`font-bold tabular-nums text-sm ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>{isPositive ? '+' : ''}${holding.gainLoss.toFixed(0)}</div>
                        <div className={`text-[10px] tabular-nums font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>{isPositive ? '+' : ''}{holding.gainLossPct.toFixed(1)}%</div>
                    </div>

                    {/* Weight */}
                    <div className="flex flex-col items-center gap-1">
                        <span className={`tabular-nums text-sm font-bold ${weight > 30 ? 'text-amber-400' : 'text-slate-300'}`}>{weight.toFixed(1)}%</span>
                        <div className="w-full max-w-[40px] h-1 rounded-full bg-slate-800/80 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${weight > 30 ? 'bg-amber-400' : 'bg-emerald-400/60'}`} style={{ width: `${Math.min(weight, 100)}%` }} />
                        </div>
                    </div>

                    {/* Days Held */}
                    <div className={`text-center tabular-nums text-sm ${daysHeld > 365 ? 'text-cyan-400' : 'text-slate-400'}`} title={daysHeld > 365 ? 'Long-term' : 'Short-term'}>D+{daysHeld}</div>

                    {/* Alpha */}
                    <div className="flex items-center justify-center">
                        <CircularAlphaGauge score={holding.alphaScore} grade={holding.alphaGrade} />
                    </div>

                    {/* Signal */}
                    <div className="flex items-center justify-center">
                        <SignalBadge action={holding.action} confidence={holding.confidence} triggers={holding.triggers} />
                    </div>

                    {/* Action */}
                    <div className="flex items-center justify-center">
                        <PortfolioActionBadge action={getPortfolioAction()} />
                    </div>
                </Link>

                {/* Edit/Delete — fixed width column */}
                <div className="flex-shrink-0 w-[60px] flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(); }} className="p-1.5 rounded-lg hover:bg-cyan-500/20 text-slate-600 hover:text-cyan-400 transition-colors" title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }} className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
            </div>
        </div>
    );
}

// === PREMIUM COMPONENTS ===

// Circular Alpha Gauge with Grade (handles missing data)
function CircularAlphaGauge({ score, grade }: { score?: number; grade?: string }) {
    // Show N/A state if no data
    if (score === undefined || score === null) {
        return (
            <div className="flex items-center gap-2">
                <div className="relative w-10 h-10">
                    <div className="w-10 h-10 rounded-full border-2 border-slate-700 flex items-center justify-center">
                        <span className="text-[9px] text-slate-500">N/A</span>
                    </div>
                </div>
                <div className="text-sm font-bold font-num text-slate-500">-</div>
            </div>
        );
    }

    const percentage = Math.min(Math.max(score, 0), 100);
    const circumference = 2 * Math.PI * 16;
    const offset = circumference - (percentage / 100) * circumference;

    const displayGrade = grade || (score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F');
    const gradeColor = displayGrade === 'A' ? 'text-emerald-400 stroke-emerald-400' :
        displayGrade === 'B' ? 'text-cyan-400 stroke-cyan-400' :
            displayGrade === 'C' ? 'text-amber-400 stroke-amber-400' : 'text-rose-400 stroke-rose-400';

    return (
        <div className="flex items-center gap-2">
            <div className="relative w-10 h-10">
                <svg className="w-10 h-10 -rotate-90">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="#1e293b" strokeWidth="3" />
                    <circle
                        cx="20" cy="20" r="16"
                        fill="none"
                        className={gradeColor}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                    />
                </svg>
                <div className={`absolute inset-0 flex items-center justify-center text-xs font-black ${gradeColor}`}>
                    {displayGrade}
                </div>
            </div>
            <div className="text-sm font-bold font-num text-white">{score}</div>
        </div>
    );
}

// [S-76] Portfolio Action Badge - Compact decision indicator
function PortfolioActionBadge({ action }: { action: 'RUN' | 'HOLD' | 'TAKE' | 'EXIT' }) {
    const config: Record<string, {
        bg: string;
        border: string;
        text: string;
        icon: React.ReactNode;
        tooltip: string;
    }> = {
        'RUN': {
            bg: 'bg-gradient-to-r from-emerald-500/15 to-emerald-600/10',
            border: 'border-emerald-500/30',
            text: 'text-emerald-400',
            icon: <TrendingUp className="w-3 h-3" />,
            tooltip: '모멘텀 유지 - 계속 보유하세요'
        },
        'HOLD': {
            bg: 'bg-gradient-to-r from-amber-500/15 to-yellow-600/10',
            border: 'border-amber-500/30',
            text: 'text-amber-400',
            icon: <Activity className="w-3 h-3" />,
            tooltip: '관망 - 추이를 지켜보세요'
        },
        'TAKE': {
            bg: 'bg-gradient-to-r from-cyan-500/15 to-blue-600/10',
            border: 'border-cyan-500/30',
            text: 'text-cyan-400',
            icon: <Target className="w-3 h-3" />,
            tooltip: '익절 검토 - 수익 확정을 고려하세요'
        },
        'EXIT': {
            bg: 'bg-gradient-to-r from-rose-500/15 to-red-600/10',
            border: 'border-rose-500/30',
            text: 'text-rose-400',
            icon: <Zap className="w-3 h-3" />,
            tooltip: '손절 검토 - 포지션 정리를 고려하세요'
        }
    };

    const c = config[action] || config['HOLD'];

    return (
        <div
            className={`flex items-center gap-1 px-2 py-1 rounded-md ${c.bg} border ${c.border}`}
            title={c.tooltip}
        >
            <span className={c.text}>{c.icon}</span>
            <span className={`text-[11px] font-black tracking-wide ${c.text}`}>{action}</span>
        </div>
    );
}

// Signal Badge with Confidence + Triggers Tooltip
function SignalBadge({ action, confidence, triggers }: { action?: string; confidence?: number; triggers?: string[] }) {
    // Show N/A state if no data
    if (!action) {
        return (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700">
                <span className="text-[10px] font-bold text-slate-500">N/A</span>
            </div>
        );
    }

    const config: Record<string, { bg: string; text: string; border: string }> = {
        'HOLD': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
        'ADD': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
        'WATCH': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
        'TRIM': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
    };
    const c = config[action] || config['HOLD'];

    // Build tooltip from triggers
    const tooltipText = triggers && triggers.length > 0
        ? `📊 Signal 근거\n━━━━━━━━━━━━━━\n${triggers.join('\n')}`
        : `${action} ${confidence}%`;

    return (
        <div
            className={`flex items-center gap-2 px-2.5 py-1 rounded-lg ${c.bg} border ${c.border} cursor-help`}
            title={tooltipText}
        >
            <span className={`text-[10px] font-black ${c.text}`}>{action}</span>
            {confidence !== undefined && (
                <span className="text-[9px] font-bold font-num text-slate-400">{confidence}%</span>
            )}
        </div>
    );
}

// MaxPain Indicator - Distance % with arrow + actual price (with loading)
function MaxPainIndicator({ dist, price }: { dist?: number; price?: number }) {
    // Loading state
    if (dist === undefined || dist === null) {
        return (
            <div className="flex flex-col items-center animate-pulse">
                <span className="text-xs text-slate-500">⏳ 로딩</span>
            </div>
        );
    }

    const color = dist > 0 ? 'text-emerald-400' : dist < 0 ? 'text-rose-400' : 'text-slate-400';
    const arrow = dist > 0 ? '↑' : dist < 0 ? '↓' : '→';
    const label = dist > 0 ? '상승압력' : dist < 0 ? '하락압력' : '중립';

    return (
        <div
            className="flex flex-col items-center"
            title={`Max Pain 이격도: ${dist > 0 ? '+' : ''}${dist.toFixed(1)}%\n${label}`}
        >
            <div className="flex items-center gap-1">
                <span className={`text-sm font-bold ${color}`}>{arrow}</span>
                <span className={`text-xs font-bold font-num ${color}`}>
                    {dist > 0 ? '+' : ''}{dist.toFixed(1)}%
                </span>
            </div>
            {price !== undefined && (
                <span className="text-[10px] font-num text-slate-400">${price.toFixed(0)}</span>
            )}
        </div>
    );
}

// GEX Indicator - Long/Short badge with loading state
function GexIndicator({ gexM }: { gexM?: number }) {
    // Loading state
    if (gexM === undefined || gexM === null) {
        return (
            <div className="px-1.5 py-0.5 rounded border text-[10px] font-bold text-slate-500 bg-slate-800/50 border-slate-700 animate-pulse">
                ⏳ 로딩
            </div>
        );
    }

    const color = gexM > 0 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
        : gexM < 0 ? 'text-rose-400 bg-rose-400/10 border-rose-400/30'
            : 'text-slate-400 bg-slate-400/10 border-slate-400/30';
    const label = gexM > 0 ? 'LONG' : gexM < 0 ? 'SHORT' : 'N/A';
    const icon = gexM > 0 ? '🛡️' : gexM < 0 ? '⚡' : '—';

    return (
        <div
            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${color}`}
            title={`감마 노출(GEX): ${gexM > 0 ? '+' : ''}${gexM.toFixed(1)}M\n${gexM > 0 ? '딜러가 변동성 억제 (안정적)' : gexM < 0 ? '딜러가 변동성 가속 (주의)' : '데이터 없음'}`}
        >
            {icon} {label}
        </div>
    );
}

// Sparkline - SVG mini chart for intraday price movement
function Sparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
    if (!data || data.length < 2) return null;

    const width = 40;
    const height = 16;
    const padding = 1;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((value, i) => {
        const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((value - min) / range) * (height - 2 * padding);
        return `${x},${y}`;
    }).join(' ');

    const strokeColor = isPositive ? '#34d399' : '#f87171'; // emerald-400 : rose-400

    return (
        <svg
            width={width}
            height={height}
            className="flex-shrink-0"
        >
            <title>{`당일 가격 흐름 (${data.length}개 데이터)`}</title>
            <polyline
                points={points}
                fill="none"
                stroke={strokeColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function AddHoldingModal({ onClose, onHoldingAdded }: { onClose: () => void; onHoldingAdded: () => void }) {
    // Import addHolding directly from store to avoid separate hook instance
    const storeAddHolding = async (holding: any) => {
        const { addHolding } = await import('@/lib/storage/portfolioStore');
        addHolding(holding);
    };
    const [ticker, setTicker] = useState('');
    const [quantity, setQuantity] = useState('');
    const [avgPrice, setAvgPrice] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [validated, setValidated] = useState(false);

    // Auto-fetch company info when ticker changes
    const fetchTickerInfo = async (t: string) => {
        if (!t || t.length < 1) {
            setCompanyName('');
            setCurrentPrice(null);
            setValidated(false);
            setError('');
            return;
        }

        setLoading(true);
        setError('');
        try {
            // Fixed: use 'symbol=' instead of 'ticker='
            const res = await fetch(`/api/stock?symbol=${t.toUpperCase()}`);
            if (!res.ok) throw new Error('Ticker not found');
            const data = await res.json();

            setCompanyName(data.name || data.shortName || t.toUpperCase());
            setCurrentPrice(data.price || data.last || data.close || null);
            setValidated(true);

            // Always auto-fill current price as avgPrice when ticker changes
            if (data.price) {
                setAvgPrice(data.price.toFixed(2));
            }
        } catch {
            setError('유효하지 않은 티커입니다');
            setCompanyName('');
            setCurrentPrice(null);
            setValidated(false);
        } finally {
            setLoading(false);
        }
    };

    // Debounced ticker lookup
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (ticker.length >= 1) {
                fetchTickerInfo(ticker);
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [ticker]);

    // Calculate preview
    const qty = parseFloat(quantity) || 0;
    const avg = parseFloat(avgPrice) || 0;
    const totalCost = qty * avg;
    const estimatedValue = qty * (currentPrice || avg);
    const estimatedPL = estimatedValue - totalCost;
    const estimatedPLPct = totalCost > 0 ? (estimatedPL / totalCost) * 100 : 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ticker || !quantity || !avgPrice || !validated) return;

        setLoading(true);
        setError('');

        try {
            // Run Alpha engine for this ticker
            const analyzeRes = await fetch(`/api/portfolio/analyze?ticker=${ticker.toUpperCase()}`);
            let alphaSnapshot = undefined;

            if (analyzeRes.ok) {
                const analyzeData = await analyzeRes.json();
                alphaSnapshot = analyzeData.alphaSnapshot;
            }

            // Add holding with Alpha snapshot
            await storeAddHolding({
                ticker: ticker.toUpperCase(),
                name: companyName || ticker.toUpperCase(),
                quantity: qty,
                avgPrice: avg,
                alphaSnapshot
            });

            // Trigger refresh in parent BEFORE closing modal
            onHoldingAdded();
            onClose();
        } catch (err) {
            console.error('Failed to analyze ticker:', err);
            // Still add holding without alpha data
            await storeAddHolding({
                ticker: ticker.toUpperCase(),
                name: companyName || ticker.toUpperCase(),
                quantity: qty,
                avgPrice: avg
            });
            onHoldingAdded();
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = ticker && quantity && avgPrice && qty > 0 && avg > 0 && validated && !loading;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="relative rounded-2xl overflow-hidden max-w-lg w-full"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Glass Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#111827]/98 via-[#0f172a]/95 to-[#111827]/98 backdrop-blur-2xl border border-white/[0.12] rounded-2xl" />
                {/* Premium Glow */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500/40 via-cyan-500/30 to-emerald-500/40 rounded-t-2xl" />

                <div className="relative p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <Plus className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-white">종목 추가</h2>
                                <p className="text-[10px] text-slate-500 mt-0.5">포트폴리오에 새 종목을 추가합니다</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-slate-500 hover:text-white transition-colors"
                        >
                            ✕
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Ticker Input with Validation */}
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                티커 심볼
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={ticker}
                                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                    placeholder="NVDA, AAPL, TSLA..."
                                    className={`w-full bg-black/30 border ${error ? 'border-rose-500/50' : validated ? 'border-emerald-500/50' : 'border-white/[0.1]'} rounded-xl px-4 py-3 text-white text-lg font-bold focus:border-emerald-500/60 focus:outline-none uppercase tracking-wider placeholder:text-slate-600 placeholder:font-normal transition-colors`}
                                    autoFocus
                                />
                                {loading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                                    </div>
                                )}
                                {validated && !loading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">✓</div>
                                )}
                            </div>
                            {error && <p className="text-rose-400 text-xs mt-1">{error}</p>}
                            {companyName && !error && (
                                <div className="flex items-center gap-2 mt-2">
                                    <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                                        <img
                                            src={`https://financialmodelingprep.com/image-stock/${ticker}.png`}
                                            alt={ticker}
                                            className="w-5 h-5 object-contain"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    </div>
                                    <span className="text-sm text-slate-300">{companyName}</span>
                                    {currentPrice && (
                                        <span className="text-sm font-num text-cyan-400 ml-auto">${currentPrice.toFixed(2)}</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Quantity & Price Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                    보유 수량
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder="10"
                                    className="w-full bg-black/30 border border-white/[0.1] rounded-xl px-4 py-3 text-white font-num text-lg focus:border-emerald-500/60 focus:outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                    평균 매수가 ($)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={avgPrice}
                                    onChange={(e) => setAvgPrice(e.target.value)}
                                    placeholder={currentPrice ? currentPrice.toFixed(2) : '150.00'}
                                    className="w-full bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 text-white font-num text-lg focus:border-cyan-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Investment Preview */}
                        {qty > 0 && avg > 0 && (
                            <div className="bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-white/[0.1] rounded-xl p-4">
                                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-3 font-bold">투자 요약</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-[10px] text-slate-600 mb-0.5">총 투자금액</div>
                                        <div className="text-lg font-bold font-num text-white">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    </div>
                                    {currentPrice && currentPrice !== avg && (
                                        <div>
                                            <div className="text-[10px] text-slate-600 mb-0.5">예상 손익</div>
                                            <div className={`text-lg font-bold font-num ${estimatedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {estimatedPL >= 0 ? '+' : ''}${estimatedPL.toFixed(2)}
                                                <span className="text-xs ml-1">({estimatedPLPct >= 0 ? '+' : ''}{estimatedPLPct.toFixed(1)}%)</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 border border-white/[0.1] rounded-xl text-slate-400 hover:bg-white/[0.05] transition-all font-bold"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                disabled={!canSubmit}
                                className={`flex-1 py-3 rounded-xl font-bold transition-all ${canSubmit
                                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-400 hover:to-cyan-400 shadow-lg shadow-emerald-500/25'
                                    : 'bg-white/[0.05] text-slate-600 cursor-not-allowed'
                                    }`}
                            >
                                포트폴리오에 추가
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

// === EDIT HOLDING MODAL ===

function EditHoldingModal({ holding, onClose, onUpdated }: {
    holding: EnrichedHolding;
    onClose: () => void;
    onUpdated: () => void
}) {
    const [mode, setMode] = useState<'edit' | 'add'>('edit');
    const [quantity, setQuantity] = useState(holding.quantity.toString());
    const [avgPrice, setAvgPrice] = useState(holding.avgPrice.toFixed(2));

    // Add shares mode
    const [addQty, setAddQty] = useState('');
    const [addPrice, setAddPrice] = useState(holding.currentPrice?.toFixed(2) || '');

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleUpdate = async () => {
        setIsSubmitting(true);
        try {
            const { updateHolding } = await import('@/lib/storage/portfolioStore');
            updateHolding(holding.ticker, {
                quantity: parseInt(quantity),
                avgPrice: parseFloat(avgPrice)
            });
            onUpdated();
            onClose();
        } catch (e) {
            console.error('Failed to update holding:', e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddShares = async () => {
        setIsSubmitting(true);
        try {
            const { addHolding } = await import('@/lib/storage/portfolioStore');
            // addHolding will automatically average the price
            addHolding({
                ticker: holding.ticker,
                name: holding.name,
                quantity: parseInt(addQty),
                avgPrice: parseFloat(addPrice)
            });
            onUpdated();
            onClose();
        } catch (e) {
            console.error('Failed to add shares:', e);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Calculate new average for add shares mode
    const newQty = parseInt(addQty) || 0;
    const newPrice = parseFloat(addPrice) || 0;
    const totalShares = holding.quantity + newQty;
    const newAvgPrice = totalShares > 0
        ? ((holding.avgPrice * holding.quantity) + (newPrice * newQty)) / totalShares
        : 0;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative rounded-2xl overflow-hidden max-w-md w-full mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Glass Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#111827]/98 via-[#0f172a]/95 to-[#111827]/98 backdrop-blur-2xl border border-white/[0.12] rounded-2xl" />
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500/40 via-indigo-500/30 to-cyan-500/40 rounded-t-2xl" />

                <div className="relative p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <span className="text-cyan-400">{holding.ticker}</span>
                                <span className="text-slate-400">수정</span>
                            </h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">{holding.name}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-slate-500 hover:text-white transition-colors"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Mode Tabs */}
                    <div className="flex gap-2 mb-5">
                        <button
                            onClick={() => setMode('edit')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'edit'
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-800'
                                }`}
                        >
                            직접 수정
                        </button>
                        <button
                            onClick={() => setMode('add')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'add'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-800'
                                }`}
                        >
                            추가 매수
                        </button>
                    </div>

                    {mode === 'edit' ? (
                        /* Edit Mode */
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                    수량
                                </label>
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="w-full bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 text-white text-lg font-bold focus:border-cyan-500 focus:outline-none font-num"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                    평균 매입가 ($)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={avgPrice}
                                    onChange={(e) => setAvgPrice(e.target.value)}
                                    className="w-full bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 text-white text-lg font-bold focus:border-cyan-500 focus:outline-none font-num"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-3 border border-slate-700 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors font-bold"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleUpdate}
                                    disabled={isSubmitting || !quantity || !avgPrice}
                                    className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-indigo-500 text-white rounded-xl font-bold hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-50"
                                >
                                    {isSubmitting ? '저장 중...' : '저장'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Add Shares Mode (물타기/불타기) */
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                    추가 수량
                                </label>
                                <input
                                    type="number"
                                    value={addQty}
                                    onChange={(e) => setAddQty(e.target.value)}
                                    placeholder="추가할 주식 수"
                                    className="w-full bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 text-white text-lg font-bold focus:border-emerald-500 focus:outline-none font-num placeholder:text-slate-600 placeholder:font-normal"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                    매수 가격 ($)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={addPrice}
                                    onChange={(e) => setAddPrice(e.target.value)}
                                    className="w-full bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 text-white text-lg font-bold focus:border-emerald-500 focus:outline-none font-num"
                                />
                            </div>

                            {/* Preview */}
                            {newQty > 0 && (
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-bold">변경 예상</div>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <div className="text-slate-500 text-[10px]">총 수량</div>
                                            <div className="font-bold font-num text-white">{holding.quantity} → {totalShares}</div>
                                        </div>
                                        <div>
                                            <div className="text-slate-500 text-[10px]">평균단가</div>
                                            <div className="font-bold font-num text-white">${holding.avgPrice.toFixed(2)} → ${newAvgPrice.toFixed(2)}</div>
                                        </div>
                                    </div>
                                    {newPrice < holding.avgPrice && (
                                        <div className="mt-2 text-[10px] text-emerald-400 font-bold">💧 물타기: 평단가 {((1 - newAvgPrice / holding.avgPrice) * 100).toFixed(1)}% 하락</div>
                                    )}
                                    {newPrice > holding.avgPrice && (
                                        <div className="mt-2 text-[10px] text-rose-400 font-bold">🔥 불타기: 평단가 {((newAvgPrice / holding.avgPrice - 1) * 100).toFixed(1)}% 상승</div>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-3 border border-slate-700 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors font-bold"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleAddShares}
                                    disabled={isSubmitting || !addQty || parseInt(addQty) <= 0 || !addPrice}
                                    className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-xl font-bold hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50"
                                >
                                    {isSubmitting ? '추가 중...' : '추가 매수'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// === GLOBAL STYLES ===
function GlobalStyles() {
    return (
        <style jsx global>{`
            @keyframes fadeSlideIn {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes shimmer {
                0%, 100% { transform: translateX(-100%); }
                50% { transform: translateX(100%); }
            }
        `}</style>
    );
}
