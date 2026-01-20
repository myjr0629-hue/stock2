'use client';

import React, { useState, useEffect } from 'react';
import { useWatchlist, type EnrichedWatchlistItem } from '@/hooks/useWatchlist';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { TradingViewTicker } from '@/components/TradingViewTicker';
import { useTranslations } from 'next-intl';
import {
    Star,
    Plus,
    RefreshCw,
    Trash2,
    TrendingUp,
    TrendingDown,
    X,
    Loader2,
    Activity,
    Fish,
    Zap,
    Target,
    BarChart3,
    Shield,
    RefreshCcw,
    Crosshair
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useLocale } from 'next-intl';

export default function WatchlistPage() {
    const { items, loading, isRefreshing, refresh, addItem, removeItem } = useWatchlist();
    const [showAddModal, setShowAddModal] = useState(false);
    const t = useTranslations('watchlist');
    const tCommon = useTranslations('common');
    const locale = useLocale();

    return (
        <div className="min-h-screen bg-[#0c1118] text-slate-100">
            {/* Global Header */}
            <LandingHeader />

            {/* Live Ticker Bar */}
            <TradingViewTicker />

            {/* Page Header - Minimal & Premium */}
            <div className="border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-400/80" />
                        <span className="text-sm font-bold tracking-wide text-white/90">WATCHLIST</span>
                        <span className="text-[8px] font-medium text-amber-400/60 tracking-widest">{t('premium')}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => refresh()}
                            className="p-2 hover:bg-white/5 rounded transition-all relative"
                            title={t('refresh')}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 hover:text-slate-300 ${loading ? 'animate-spin' : ''}`} />
                            {isRefreshing && (
                                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full" />
                            )}
                        </button>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-1 px-3 py-1.5 text-amber-400/90 hover:text-amber-300 text-xs font-medium transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{tCommon('add')}</span>
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
                {/* Stats Bar */}
                <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-400">
                        <Activity className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-white">{items.length}</span>
                        <span>{t('monitoring')}</span>
                    </div>
                </div>

                {/* Premium Table */}
                <div className="relative rounded-lg overflow-hidden">
                    {/* Glass Background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-slate-900/60 backdrop-blur-xl border border-amber-900/10" />

                    {/* Table Content */}
                    <div className="relative">
                        {/* Table Header */}
                        <div className="grid grid-cols-[2fr_1.5fr_1.2fr_1.2fr_1.2fr_1fr_1fr_1fr_1.2fr_1.2fr] px-4 py-3 bg-gradient-to-r from-slate-900/80 to-slate-800/50 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5">
                            <div>{t('symbol')}</div>
                            <div className="text-center">{t('price')}</div>
                            <div className="flex items-center justify-center gap-1"><Zap className="w-3 h-3" />Alpha</div>
                            <div className="flex items-center justify-center gap-1"><Target className="w-3 h-3" />{t('signal')}</div>
                            <div className="flex items-center justify-center gap-1"><Fish className="w-3 h-3 text-cyan-400" />Whale</div>
                            <div className="flex items-center justify-center gap-1"><BarChart3 className="w-3 h-3" />{t('rsiLabel')}</div>
                            <div className="flex items-center justify-center gap-1"><RefreshCcw className="w-3 h-3" />{t('gammaFlip')}</div>
                            <div className="flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" />{t('return3d')}</div>
                            <div className="flex items-center justify-center gap-1"><Crosshair className="w-3 h-3" />MaxPain</div>
                            <div className="flex items-center justify-center gap-1"><Shield className="w-3 h-3" />{t('gex')}</div>
                        </div>

                        {/* Rows */}
                        {loading ? (
                            <div className="px-4 py-16 text-center">
                                <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-amber-500/50" />
                                <p className="text-slate-500 text-sm">{t('loadingWatchlist')}</p>
                            </div>
                        ) : items.length === 0 ? (
                            <div className="px-4 py-16 text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-white/5 flex items-center justify-center">
                                    <Star className="w-8 h-8 text-slate-600" />
                                </div>
                                <p className="text-slate-400 font-medium mb-1">{t('noWatchlist')}</p>
                                <p className="text-slate-600 text-xs mb-4">{t('startMonitoring')}</p>
                                <button
                                    onClick={() => setShowAddModal(true)}
                                    className="text-amber-400 hover:text-amber-300 text-sm font-bold"
                                >
                                    {t('addFirstItem')}
                                </button>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {items.map(item => (
                                    <WatchlistRow
                                        key={item.ticker}
                                        item={item}
                                        onRemove={() => removeItem(item.ticker)}
                                        locale={locale}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Add Modal */}
            {showAddModal && (
                <AddWatchlistModal
                    onClose={() => setShowAddModal(false)}
                    onAdd={addItem}
                />
            )}
        </div>
    );
}

// === ROW COMPONENT ===
function WatchlistRow({ item, onRemove, locale }: { item: EnrichedWatchlistItem; onRemove: () => void; locale: string }) {
    const isPositive = item.changePct >= 0;
    const t = useTranslations('watchlist');
    const tCommon = useTranslations('common');

    return (
        <Link
            href={`/ticker?ticker=${item.ticker}`}
            className="grid grid-cols-[2fr_1.5fr_1.2fr_1.2fr_1.2fr_1fr_1fr_1fr_1.2fr_1.2fr] px-4 py-3 hover:bg-amber-900/5 transition-colors items-center group"
        >
            {/* 종목 with Sparkline */}
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                        src={`https://financialmodelingprep.com/image-stock/${item.ticker}.png`}
                        alt={item.ticker}
                        className="w-5 h-5 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className="text-[9px] font-bold text-slate-500 absolute">{item.ticker.slice(0, 2)}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-white">{item.ticker}</div>
                    <div className="text-[10px] text-slate-500 truncate">{item.name}</div>
                </div>
                {item.sparkline && item.sparkline.length > 2 && (
                    <Sparkline data={item.sparkline} isPositive={isPositive} />
                )}
            </div>

            {/* 현재가 */}
            <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                    <span className="font-bold font-num text-sm text-white">${item.currentPrice.toFixed(2)}</span>
                    {item.session && item.session !== 'reg' && (
                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${item.session === 'pre' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                            {item.session === 'pre' ? 'PRE' : 'POST'}
                        </span>
                    )}
                </div>
                <div className={`text-[10px] font-num font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? '+' : ''}{item.changePct.toFixed(2)}%
                </div>
            </div>

            {/* Alpha Score */}
            <div className="flex justify-center">
                <CircularAlphaGauge score={item.alphaScore} grade={item.alphaGrade} />
            </div>

            {/* Signal */}
            <div className="flex justify-center">
                <SignalBadge action={item.action} confidence={item.confidence} />
            </div>

            {/* Whale Index */}
            <div className="flex justify-center">
                <WhaleIndicator index={item.whaleIndex} confidence={item.whaleConfidence} />
            </div>

            {/* RSI */}
            <div className="flex justify-center">
                <RSIIndicator value={item.rsi} />
            </div>

            {/* Gamma Flip */}
            <div className="flex justify-center">
                <GammaFlipIndicator value={item.gammaFlipLevel} price={item.currentPrice} gexM={item.gexM} />
            </div>

            {/* 3D Return */}
            <div className="flex justify-center">
                <Return3DIndicator value={item.return3d} />
            </div>

            {/* MaxPain */}
            <div className="flex justify-center">
                <MaxPainIndicator maxPain={item.maxPain} dist={item.maxPainDist} />
            </div>

            {/* GEX + Delete */}
            <div className="relative flex justify-center">
                <GexIndicator gexM={item.gexM} />
                <button
                    onClick={(e) => { e.preventDefault(); onRemove(); }}
                    className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-500/20 rounded text-rose-400"
                    title={tCommon('delete')}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </Link>
    );
}

// === INDICATOR COMPONENTS ===

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

    const strokeColor = isPositive ? '#34d399' : '#f87171';

    return (
        <svg width={width} height={height} className="flex-shrink-0">
            <title>{`가격 추이 (${data.length}개)`}</title>
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

function CircularAlphaGauge({ score, grade }: { score?: number; grade?: string }) {
    if (score === undefined) {
        return (
            <div className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full border-2 border-slate-700 flex items-center justify-center">
                    <span className="text-[8px] text-slate-500">N/A</span>
                </div>
            </div>
        );
    }

    const percentage = Math.min(Math.max(score, 0), 100);
    const circumference = 2 * Math.PI * 12;
    const offset = circumference - (percentage / 100) * circumference;

    const displayGrade = grade || (score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D');
    const gradeColor = displayGrade === 'A' ? 'text-emerald-400 stroke-emerald-400' :
        displayGrade === 'B' ? 'text-cyan-400 stroke-cyan-400' :
            displayGrade === 'C' ? 'text-amber-400 stroke-amber-400' : 'text-rose-400 stroke-rose-400';

    return (
        <div className="flex items-center gap-1.5">
            <div className="relative w-8 h-8">
                <svg className="w-8 h-8 -rotate-90">
                    <circle cx="16" cy="16" r="12" fill="none" stroke="#1e293b" strokeWidth="2.5" />
                    <circle
                        cx="16" cy="16" r="12"
                        fill="none"
                        className={gradeColor}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                    />
                </svg>
                <div className={`absolute inset-0 flex items-center justify-center text-[9px] font-black ${gradeColor}`}>
                    {displayGrade}
                </div>
            </div>
            <span className="text-xs font-bold font-num text-white">{score}</span>
        </div>
    );
}

function SignalBadge({ action, confidence }: { action?: string; confidence?: number }) {
    if (!action) {
        return <span className="text-[10px] text-slate-600">N/A</span>;
    }

    const config: Record<string, { bg: string; text: string; border: string }> = {
        'HOLD': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
        'ADD': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
        'WATCH': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
        'TRIM': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
    };
    const c = config[action] || config['HOLD'];

    return (
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${c.bg} border ${c.border}`}>
            <span className={`text-[11px] font-black ${c.text}`}>{action}</span>
            {confidence !== undefined && (
                <span className="text-[10px] font-bold font-num text-slate-400">{confidence}%</span>
            )}
        </div>
    );
}

function WhaleIndicator({ index, confidence }: { index?: number; confidence?: string }) {
    if (index === undefined || index === null) {
        return <span className="text-[10px] text-slate-600">N/A</span>;
    }

    const t = useTranslations('watchlist');
    const level = index >= 70 ? t('strongAccumulation') : index >= 40 ? t('attention') : t('normal');
    const color = index >= 70 ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' :
        index >= 40 ? 'text-slate-300 bg-slate-300/10 border-slate-400/30' :
            'text-slate-500 bg-slate-500/10 border-slate-600/30';

    return (
        <div className="flex items-center gap-1" title={`Whale Index: ${index}`}>
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded border ${color}`}>
                <Fish className="w-3 h-3" />
                <span className="text-[11px] font-bold font-num">{index}</span>
            </div>
            <span className="text-[10px] text-white/80">{level}</span>
        </div>
    );
}

function RSIIndicator({ value }: { value?: number }) {
    if (value === undefined || value === null) {
        return <span className="text-[10px] text-slate-600">—</span>;
    }

    const t = useTranslations('watchlist');
    const color = value >= 70 ? 'text-rose-400' : value <= 30 ? 'text-emerald-400' : 'text-white';
    const label = value >= 70 ? t('overbought') : value <= 30 ? t('oversold') : t('neutral');

    return (
        <div className="flex items-center gap-1" title={`RSI(14): ${value.toFixed(0)}`}>
            <span className={`text-xs font-bold font-num ${color}`}>{value.toFixed(0)}</span>
            <span className="text-[10px] text-white/80">{label}</span>
        </div>
    );
}

function GammaFlipIndicator({ value, price, gexM }: { value?: number; price?: number; gexM?: number }) {
    // [V7.4] Context-aware display matching Command page

    const tInd = useTranslations('indicators');
    // Case 1: Value exists and is valid
    if (value !== undefined && value !== null && value > 0) {
        const isAbove = price ? price > value : false;
        const color = isAbove ? 'text-rose-400' : 'text-emerald-400';
        const label = isAbove ? tInd('shortGamma') : tInd('longGamma');
        return (
            <div className="flex items-center gap-1" title={`Gamma Flip Level: $${value}`}>
                <span className={`text-xs font-bold font-num ${color}`}>${value.toFixed(0)}</span>
                <span className="text-[10px] text-white/80">{label}</span>
            </div>
        );
    }

    // Case 2: No value but have GEX data - show gamma state
    if (gexM !== undefined && gexM !== null) {
        if (gexM < 0) {
            return (
                <div className="flex items-center gap-1" title={tInd('allShortGamma')}>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-600/80 text-white">SHORT</span>
                </div>
            );
        } else if (gexM > 0) {
            return (
                <div className="flex items-center gap-1" title={tInd('allLongGamma')}>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600/80 text-white">LONG</span>
                </div>
            );
        }
    }

    // Case 3: No data at all
    return <span className="text-[10px] text-slate-600">—</span>;
}

function Return3DIndicator({ value }: { value?: number }) {
    if (value === undefined || value === null) {
        return <span className="text-[10px] text-slate-600">—</span>;
    }

    const color = value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-white';

    return (
        <span className={`text-xs font-bold font-num ${color}`} title={`3일 수익률 - 단기 모멘텀`}>
            {value > 0 ? '+' : ''}{value.toFixed(1)}%
        </span>
    );
}

function MaxPainIndicator({ maxPain, dist }: { maxPain?: number; dist?: number }) {
    if (dist === undefined || dist === null) {
        return <span className="text-[10px] text-slate-600">—</span>;
    }

    const color = dist > 0 ? 'text-emerald-400' : dist < 0 ? 'text-rose-400' : 'text-white';
    const arrow = dist > 0 ? '↑' : dist < 0 ? '↓' : '→';

    return (
        <div className="text-center" title={`Max Pain: $${maxPain?.toFixed(2)} - 옵션 만기 예상가`}>
            {maxPain && (
                <span className="text-[11px] text-white font-num font-bold block">${maxPain.toFixed(0)}</span>
            )}
            <span className={color}>
                <span className="text-sm">{arrow}</span>
                <span className="text-[10px] font-bold font-num">{dist > 0 ? '+' : ''}{dist.toFixed(1)}%</span>
            </span>
        </div>
    );
}

function GexIndicator({ gexM }: { gexM?: number }) {
    if (gexM === undefined || gexM === null) {
        return <span className="text-[10px] text-slate-600">—</span>;
    }

    const color = gexM > 0 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
        : gexM < 0 ? 'text-rose-400 bg-rose-400/10 border-rose-400/30'
            : 'text-slate-400 bg-slate-400/10 border-slate-400/30';

    return (
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-bold ${color}`} title={`GEX: ${gexM}M - 감마 노출`}>
            {gexM > 0 ? <Shield className="w-3 h-3" /> : gexM < 0 ? <Zap className="w-3 h-3" /> : null}
            <span>{gexM > 0 ? 'LONG' : gexM < 0 ? 'SHORT' : 'N/A'}</span>
        </div>
    );
}

// === ADD MODAL ===
function AddWatchlistModal({ onClose, onAdd }: { onClose: () => void; onAdd: (ticker: string, name: string) => Promise<void> }) {
    const [ticker, setTicker] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [validated, setValidated] = useState(false);
    const t = useTranslations('watchlist');
    const tCommon = useTranslations('common');

    const fetchTickerInfo = async (tickerInput: string) => {
        if (!tickerInput || tickerInput.length < 1) {
            setCompanyName('');
            setValidated(false);
            setError('');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/stock?symbol=${tickerInput.toUpperCase()}`);
            if (!res.ok) throw new Error('Ticker not found');
            const data = await res.json();

            setCompanyName(data.name || data.shortName || tickerInput.toUpperCase());
            setValidated(true);
        } catch {
            setError(t('invalidTicker'));
            setCompanyName('');
            setValidated(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (ticker.length >= 1) {
                fetchTickerInfo(ticker);
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [ticker]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ticker || !validated || loading) return;

        setLoading(true);
        try {
            await onAdd(ticker.toUpperCase(), companyName || ticker.toUpperCase());
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="relative rounded-lg overflow-hidden max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-900/95 backdrop-blur-xl border border-amber-900/20" />

                <div className="relative p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-amber-400">{t('addToWatchlist')}</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">{t('addToWatchlistDesc')}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                {t('tickerSymbol')}
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={ticker}
                                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                    placeholder="NVDA, AAPL, TSLA..."
                                    className={`w-full bg-slate-900/70 border ${error ? 'border-rose-500/50' : validated ? 'border-amber-500/50' : 'border-slate-700'} rounded-lg px-4 py-3 text-white text-lg font-bold focus:border-amber-500 focus:outline-none uppercase tracking-wider placeholder:text-slate-600 placeholder:font-normal`}
                                    autoFocus
                                />
                                {loading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                                    </div>
                                )}
                                {validated && !loading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400">✓</div>
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
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-3 bg-slate-800/50 text-slate-300 rounded-lg font-bold hover:bg-slate-800 transition-colors border border-slate-700"
                            >
                                {tCommon('cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={!validated || loading}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500/80 to-orange-500/80 text-white rounded-lg font-bold hover:from-amber-500 hover:to-orange-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Star className="w-4 h-4" />
                                        {tCommon('add')}
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
