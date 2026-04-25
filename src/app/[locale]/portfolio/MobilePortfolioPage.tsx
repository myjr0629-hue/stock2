'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { usePortfolio, type EnrichedHolding } from '@/hooks/usePortfolio';
import { useTranslations, useLocale } from 'next-intl';
import { Briefcase, Plus, BookOpen, ArrowRightLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useTier } from '@/contexts/TierContext';
import useSWR from 'swr';
import MobileHoldingCard from '@/components/portfolio/MobileHoldingCard';
import MobilePortfolioOverview from '@/components/portfolio/MobilePortfolioOverview';
import MobilePortfolioRisk from '@/components/portfolio/MobilePortfolioRisk';

// Exchange rate (reuse same pattern)
const fxFetcher = (url: string) => fetch(url).then(r => r.json());
function useExchangeRate(locale: string) {
    const { data } = useSWR('/api/exchange-rates', fxFetcher, { refreshInterval: 60_000, dedupingInterval: 30_000 });
    const rate = locale === 'ko' ? data?.usdkrw : locale === 'ja' ? data?.usdjpy : null;
    const symbol = locale === 'ko' ? '₩' : locale === 'ja' ? '¥' : '$';
    const label = locale === 'ko' ? 'KRW' : locale === 'ja' ? 'JPY' : 'USD';
    const changePct = locale === 'ko' ? data?.usdkrwChange : locale === 'ja' ? data?.usdjpyChange : null;
    return { rate, symbol, label, changePct };
}

type Tab = 'overview' | 'holdings' | 'risk';
type SortKey = 'default' | 'score' | 'pnl' | 'weight' | 'today';

export default function MobilePortfolioPage({
    initialHoldings,
    initialFullData,
}: {
    initialHoldings?: any[];
    initialFullData?: any[];
}) {
    const { holdings, summary, loading, refresh, removeHolding, addHolding } = usePortfolio(initialHoldings, initialFullData);
    const t = useTranslations('portfolio');
    const locale = useLocale();
    const { tier } = useTier();
    const fx = useExchangeRate(locale);

    const [tab, setTab] = useState<Tab>('overview');
    const [sortKey, setSortKey] = useState<SortKey>('default');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [currencyMode, setCurrencyMode] = useState<'usd' | 'local'>('usd');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingHolding, setEditingHolding] = useState<EnrichedHolding | null>(null);

    // Tier limits
    const maxHoldings = tier === 'elite' ? 999 : tier === 'pro' ? 20 : 3;
    const isAtLimit = holdings.length >= maxHoldings;

    // Portfolio score
    const portfolioScore = holdings.length > 0
        ? Math.round(holdings.reduce((sum, h) => sum + (h.alphaScore || 50), 0) / holdings.length)
        : 0;

    // Sorting
    const sortedHoldings = useMemo(() => {
        if (sortKey === 'default') return holdings;
        const sorted = [...holdings].sort((a, b) => {
            switch (sortKey) {
                case 'score': return (b.alphaScore ?? 0) - (a.alphaScore ?? 0);
                case 'pnl': return b.gainLossPct - a.gainLossPct;
                case 'weight': {
                    const wA = summary.totalValue > 0 ? a.marketValue / summary.totalValue : 0;
                    const wB = summary.totalValue > 0 ? b.marketValue / summary.totalValue : 0;
                    return wB - wA;
                }
                case 'today': return b.changePct - a.changePct;
                default: return 0;
            }
        });
        return sortDir === 'asc' ? sorted.reverse() : sorted;
    }, [holdings, sortKey, sortDir, summary.totalValue]);

    const handleSort = useCallback((key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortKey(key); setSortDir('desc'); }
    }, [sortKey]);

    // Lazy-load modals
    const openAddModal = useCallback(async () => {
        if (isAtLimit) return;
        setShowAddModal(true);
    }, [isAtLimit]);

    return (
        <div className="min-h-screen bg-[#0a1225] text-slate-100 pb-24">
            {/* ── Mobile Header ── */}
            <div className="sticky top-0 z-30 bg-[#0a1225]/95 backdrop-blur-xl border-b border-white/[0.06]">
                <div className="px-4 pt-2.5 pb-2">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                            <Briefcase className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[15px] font-black text-white tracking-wide">Portfolio</span>
                                <span className="text-[8px] font-bold text-emerald-400 tracking-widest bg-emerald-400/[0.08] px-1.5 py-0.5 rounded">{t('premium')}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">{holdings.length} Holdings</div>
                        </div>
                        <Link href="/how-it-works" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08]">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        </Link>
                        <button
                            onClick={openAddModal}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold ${isAtLimit
                                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
                                }`}
                        >
                            <Plus className="w-3 h-3" />
                            <span>{isAtLimit ? '' : 'Add'}</span>
                            <span className="tabular-nums font-black opacity-80">{holdings.length}/{maxHoldings >= 999 ? '∞' : maxHoldings}</span>
                        </button>
                    </div>

                    {/* Exchange Rate (ko/ja only) */}
                    {fx.rate && locale !== 'en' && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                            <ArrowRightLeft className="w-3 h-3 text-slate-500" />
                            <span className="text-[10px] font-bold tabular-nums text-slate-300">
                                $1 = {fx.symbol}{fx.rate.toLocaleString(locale === 'ko' ? 'ko-KR' : 'ja-JP', { maximumFractionDigits: 1 })}
                            </span>
                            {fx.changePct != null && (
                                <span className={`text-[10px] font-bold tabular-nums ${fx.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {fx.changePct >= 0 ? '+' : ''}{fx.changePct.toFixed(2)}%
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Tab Bar ── */}
                <div className="flex gap-2 px-4 pb-2">
                    {(['overview', 'holdings', 'risk'] as Tab[]).map(t2 => (
                        <button
                            key={t2}
                            onClick={() => setTab(t2)}
                            className={`flex-shrink-0 px-4 py-2 rounded-full text-[12px] font-bold transition-all ${tab === t2
                                ? 'bg-blue-500 text-white'
                                : 'bg-white/[0.04] border border-white/[0.06] text-slate-400'
                                }`}
                        >
                            {t2 === 'overview' ? 'Overview' : t2 === 'holdings' ? 'Holdings' : 'Risk'}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Content ── */}
            <div className="px-4 pt-3">
                {loading ? (
                    <div className="space-y-3">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="m-glass-card animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-700/40" />
                                    <div className="flex-1 space-y-1.5"><div className="h-4 w-16 bg-slate-700/40 rounded" /><div className="h-3 w-28 bg-slate-800/40 rounded" /></div>
                                    <div className="text-right space-y-1"><div className="h-5 w-20 bg-slate-700/40 rounded ml-auto" /><div className="h-3 w-14 bg-slate-800/40 rounded ml-auto" /></div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : holdings.length === 0 ? (
                    <div className="m-glass-card text-center py-16">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 border border-emerald-500/20 flex items-center justify-center">
                            <Briefcase className="w-8 h-8 text-emerald-400/40" />
                        </div>
                        <p className="text-slate-300 font-bold text-base mb-1">{t('noHoldings')}</p>
                        <p className="text-slate-400 text-[13px] mb-5">{t('startPortfolio')}</p>
                        <button onClick={() => setShowAddModal(true)} className="px-5 py-2.5 bg-gradient-to-r from-emerald-500/20 to-cyan-500/15 border border-emerald-500/30 text-emerald-400 text-[13px] font-bold rounded-xl">
                            {t('addFirstHolding')}
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Tab: Overview */}
                        {tab === 'overview' && (
                            <MobilePortfolioOverview holdings={holdings} summary={summary} portfolioScore={portfolioScore} />
                        )}

                        {/* Tab: Holdings */}
                        {tab === 'holdings' && (
                            <div>
                                {/* Sort Chips */}
                                {holdings.length > 1 && (
                                    <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex-shrink-0">Sort</span>
                                        {(['default', 'score', 'pnl', 'weight', 'today'] as SortKey[]).map(key => (
                                            <button key={key} onClick={() => handleSort(key)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${sortKey === key
                                                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                                                : 'bg-white/[0.04] border border-white/[0.06] text-slate-400'
                                                }`}>
                                                {key === 'default' ? 'Default' : key === 'score' ? 'Score' : key === 'pnl' ? 'P&L' : key === 'weight' ? 'Weight' : 'Today'}
                                                {sortKey === key && key !== 'default' && <span className="ml-0.5">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Currency Toggle (ko/ja) */}
                                {fx.rate && locale !== 'en' && (
                                    <div className="flex justify-end mb-2">
                                        <button onClick={() => setCurrencyMode(m => m === 'usd' ? 'local' : 'usd')} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${currencyMode === 'local' ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400' : 'bg-white/[0.04] border-white/[0.08] text-slate-400'}`}>
                                            <ArrowRightLeft className="w-3 h-3" />
                                            {currencyMode === 'local' ? fx.label : 'USD'}
                                        </button>
                                    </div>
                                )}

                                {/* Cards */}
                                <div className="space-y-3">
                                    {sortedHoldings.map((holding, i) => (
                                        <MobileHoldingCard
                                            key={holding.ticker}
                                            holding={holding}
                                            onRemove={() => removeHolding(holding.ticker)}
                                            onEdit={() => setEditingHolding(holding)}
                                            totalValue={summary.totalValue}
                                            index={i}
                                            currencyMode={currencyMode}
                                            fxRate={fx.rate}
                                            fxSymbol={fx.symbol}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tab: Risk */}
                        {tab === 'risk' && (
                            <MobilePortfolioRisk holdings={holdings} summary={summary} />
                        )}
                    </>
                )}
            </div>

            {/* ── Add Modal (lazy) ── */}
            {showAddModal && <MobileAddModal onClose={() => setShowAddModal(false)} onAdd={addHolding} />}

            {/* ── Edit Modal (lazy) ── */}
            {editingHolding && <MobileEditModal holding={editingHolding} onClose={() => setEditingHolding(null)} onUpdated={refresh} />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// Add Holding Modal (Bottom Sheet style)
// ═══════════════════════════════════════════════════════
function MobileAddModal({ onClose, onAdd }: { onClose: () => void; onAdd: (h: any) => Promise<void> }) {
    const [ticker, setTicker] = useState('');
    const [quantity, setQuantity] = useState('');
    const [avgPrice, setAvgPrice] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [validated, setValidated] = useState(false);
    const t = useTranslations('portfolio');

    React.useEffect(() => {
        const timeout = setTimeout(async () => {
            if (ticker.length < 1) { setCompanyName(''); setCurrentPrice(null); setValidated(false); setError(''); return; }
            setLoading(true); setError('');
            try {
                const res = await fetch(`/api/stock?symbol=${ticker.toUpperCase()}`);
                if (!res.ok) throw new Error('Not found');
                const data = await res.json();
                setCompanyName(data.name || data.shortName || ticker.toUpperCase());
                setCurrentPrice(data.price || data.last || data.close || null);
                setValidated(true);
                if (data.price) setAvgPrice(data.price.toFixed(2));
            } catch { setError(t('invalidTicker')); setCompanyName(''); setCurrentPrice(null); setValidated(false); }
            finally { setLoading(false); }
        }, 500);
        return () => clearTimeout(timeout);
    }, [ticker, t]);

    const qty = parseFloat(quantity) || 0;
    const avg = parseFloat(avgPrice) || 0;
    const canSubmit = ticker && quantity && avgPrice && qty > 0 && avg > 0 && validated && !loading;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setLoading(true);
        try {
            let alphaSnapshot;
            try { const r = await fetch(`/api/portfolio/analyze?ticker=${ticker.toUpperCase()}`); if (r.ok) { const d = await r.json(); alphaSnapshot = d.alphaSnapshot; } } catch {}
            await onAdd({ ticker: ticker.toUpperCase(), name: companyName || ticker.toUpperCase(), quantity: qty, avgPrice: avg, alphaSnapshot });
            onClose();
        } catch { await onAdd({ ticker: ticker.toUpperCase(), name: companyName || ticker.toUpperCase(), quantity: qty, avgPrice: avg }); onClose(); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
            <div className="w-full max-w-lg rounded-t-2xl overflow-hidden relative" onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(to bottom, #111827, #0f172a)' }}>
                <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mt-3 mb-2" />
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500/40 via-cyan-500/30 to-emerald-500/40" />
                <div className="p-5">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                                <span className="text-emerald-400 text-lg">+</span>
                            </div>
                            <div>
                                <h2 className="text-base font-black text-white">{t('addNewHolding')}</h2>
                                <p className="text-[11px] text-slate-400">{t('addNewHoldingDesc')}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-slate-400">✕</button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1 font-bold">{t('tickerSymbol')}</label>
                            <input type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="NVDA, AAPL, TSLA..." className={`w-full bg-black/30 border ${error ? 'border-rose-500/50' : validated ? 'border-emerald-500/50' : 'border-white/[0.1]'} rounded-xl px-4 py-3 text-white text-base font-bold focus:outline-none uppercase tracking-wider placeholder:text-slate-600 placeholder:font-normal`} autoFocus />
                            {error && <p className="text-rose-400 text-[11px] mt-1">{error}</p>}
                            {companyName && !error && (
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[13px] text-slate-300">{companyName}</span>
                                    {currentPrice && <span className="text-[13px] font-bold tabular-nums text-cyan-400 ml-auto">${currentPrice.toFixed(2)}</span>}
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1 font-bold">{t('holdingQuantity')}</label>
                                <input type="number" min="0" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="10" className="w-full bg-black/30 border border-white/[0.1] rounded-xl px-4 py-3 text-white font-bold text-base focus:outline-none tabular-nums" />
                            </div>
                            <div>
                                <label className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1 font-bold">{t('avgBuyPrice')}</label>
                                <input type="number" min="0" step="0.01" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} placeholder={currentPrice ? currentPrice.toFixed(2) : '150.00'} className="w-full bg-black/30 border border-white/[0.1] rounded-xl px-4 py-3 text-white font-bold text-base focus:outline-none tabular-nums" />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-1">
                            <button type="button" onClick={onClose} className="flex-1 py-3 border border-white/[0.1] rounded-xl text-slate-300 font-bold text-[13px]">{t('cancel')}</button>
                            <button type="submit" disabled={!canSubmit} className={`flex-1 py-3 rounded-xl font-bold text-[13px] transition-all ${canSubmit ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white' : 'bg-white/[0.05] text-slate-500 cursor-not-allowed'}`}>
                                {loading ? '...' : t('addHolding')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// Edit Holding Modal (Bottom Sheet style)
// ═══════════════════════════════════════════════════════
function MobileEditModal({ holding, onClose, onUpdated }: { holding: EnrichedHolding; onClose: () => void; onUpdated: () => void }) {
    const [quantity, setQuantity] = useState(holding.quantity.toString());
    const [avgPrice, setAvgPrice] = useState(holding.avgPrice.toFixed(2));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const t = useTranslations('portfolio');

    const handleUpdate = async () => {
        setIsSubmitting(true);
        try {
            const { updateHolding } = await import('@/lib/storage/portfolioStore');
            updateHolding(holding.ticker, { quantity: parseInt(quantity), avgPrice: parseFloat(avgPrice) });
            onUpdated(); onClose();
        } catch (e) { console.error('Failed:', e); }
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
            <div className="w-full max-w-md rounded-t-2xl overflow-hidden relative" onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(to bottom, #111827, #0f172a)' }}>
                <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mt-3 mb-2" />
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500/40 via-indigo-500/30 to-cyan-500/40" />
                <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-base font-bold flex items-center gap-2"><span className="text-cyan-400">{holding.ticker}</span><span className="text-slate-300">{t('edit')}</span></h2>
                            <p className="text-[11px] text-slate-400 mt-0.5">{holding.name}</p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-slate-400">✕</button>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1 font-bold">{t('quantity')}</label>
                            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full bg-black/30 border border-white/[0.1] rounded-xl px-4 py-3 text-white font-bold text-base focus:outline-none tabular-nums" />
                        </div>
                        <div>
                            <label className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1 font-bold">{t('avgBuyPrice')}</label>
                            <input type="number" step="0.01" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} className="w-full bg-black/30 border border-white/[0.1] rounded-xl px-4 py-3 text-white font-bold text-base focus:outline-none tabular-nums" />
                        </div>
                        <div className="flex gap-3 pt-1">
                            <button onClick={onClose} className="flex-1 py-3 border border-white/[0.1] rounded-xl text-slate-300 font-bold text-[13px]">{t('cancel')}</button>
                            <button onClick={handleUpdate} disabled={isSubmitting || !quantity || !avgPrice} className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-indigo-500 text-white rounded-xl font-bold text-[13px] disabled:opacity-50">
                                {isSubmitting ? '...' : t('edit')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
