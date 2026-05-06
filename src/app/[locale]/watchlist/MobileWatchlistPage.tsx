'use client';
// MobileWatchlistPage — 4-Tab (Overview/Cards/Compact/Signals)
// Data: useWatchlist ONLY. Zero web impact. No heatmap. Sparklines included.
import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { useWatchlist, type EnrichedWatchlistItem } from '@/hooks/useWatchlist';
import { useTranslations, useLocale } from 'next-intl';
import { useTier } from '@/contexts/TierContext';
import { Star, Plus, RefreshCw, Search, Loader2, X, LayoutList, CreditCard, AlignJustify, ArrowUpDown, Clock, type LucideIcon } from 'lucide-react';
import { OverviewRow, CardItem, CompactRow, MobileStatsBar } from './MobileWatchlistTabs';

type TabKey = 'overview' | 'cards' | 'compact';
type SortKey = 'default' | 'change' | 'alpha' | 'whale' | 'return3d';

const TABS: { key: TabKey; icon: LucideIcon; label: string }[] = [
    { key: 'overview', icon: LayoutList, label: 'Overview' },
    { key: 'cards', icon: CreditCard, label: 'Cards' },
    { key: 'compact', icon: AlignJustify, label: 'Compact' },
];

export default function MobileWatchlistPage({ locale, initialWatchlist, initialFullData }: {
    locale?: string; initialWatchlist?: any[]; initialFullData?: any[];
}) {
    const { items, loading, isRefreshing, refresh, addItem, removeItem } = useWatchlist(initialWatchlist, initialFullData);
    const [tab, setTab] = useState<TabKey>('overview');
    const [sortKey, setSortKey] = useState<SortKey>('default');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [showAdd, setShowAdd] = useState(false);
    const [searchQ, setSearchQ] = useState('');
    const { tier } = useTier();
    const t = useTranslations('watchlist');
    const currentLocale = useLocale();

    const maxItems = tier === 'elite' ? 999 : tier === 'pro' ? 50 : 5;
    const isAtLimit = items.length >= maxItems;

    // ── [MOBILE PRECISION FIX] Recalculate extChangePct with correct baseline ──
    // Problem: useWatchlist L187 prioritizes fastPrice.extChangePct (from /api/live/quotes)
    //   over apiData.realtime.extendedChangePct (from batch API).
    //   Quotes API uses prevDayClose as baseline → wrong PRE/POST %
    //   Batch API uses dayClose (regular close) as baseline → correct, matches desktop ticker page
    // Fix: In mobile, recalculate ext% from changePct (accurate, from batch) and currentPrice (WS live)
    //   Step 1: changePct = (dayClose - prevDayClose) / prevDayClose * 100 → prevDayClose = dayClose / (1 + changePct/100)
    //   Step 2: dayClose = prevDayClose * (1 + changePct/100) ... but we need dayClose first
    //   Actually simpler: batch API sets realtime.price = dayClose, WS overrides currentPrice
    //   During PRE/POST, if currentPrice != displayPrice, ext% = (currentPrice - displayPrice) / displayPrice
    //   We can estimate displayPrice: since changePct from batch = (dayClose - prevDayClose) / prevDayClose,
    //   and quotes API has price = prevDayClose, we can compute dayClose = prevDayClose * (1 + changePct/100)
    //   Then ext% = (currentPrice - dayClose) / dayClose * 100
    const correctedItems = useMemo(() => {
        return items.map(item => {
            if (!item.extLabel || !item.currentPrice || item.currentPrice <= 0) return item;
            
            // If extChangePct ≈ changePct, the quotes API's wrong baseline was used
            // Recalculate: back-derive dayClose from changePct + prevDayClose
            // quotes API: price = prevDayClose (during PRE/POST)
            // batch API: changePct = (dayClose - prevDayClose) / prevDayClose * 100
            // ∴ dayClose = prevDayClose * (1 + changePct/100)
            // But we don't have prevDayClose separately...
            // 
            // Alternative: We know from the API data:
            //   extChangePct (quotes) = (extPrice - prevDayClose) / prevDayClose * 100
            //   changePct (batch) = (dayClose - prevDayClose) / prevDayClose * 100
            //   ∴ prevDayClose = currentPrice / (1 + extChangePct_quotes/100)  [approx, since extPrice ≈ currentPrice]
            //   ∴ dayClose = prevDayClose * (1 + changePct/100)
            //   ∴ correct_ext% = (currentPrice - dayClose) / dayClose * 100
            
            const quotesExtPct = item.extChangePct;
            if (quotesExtPct === undefined || quotesExtPct === null) return item;
            
            // Back-derive prevDayClose from currentPrice and quotesExtPct
            // quotesExtPct = (currentPrice - prevDayClose) / prevDayClose * 100
            // ∴ prevDayClose = currentPrice / (1 + quotesExtPct/100)
            const prevDayClose = item.currentPrice / (1 + quotesExtPct / 100);
            if (prevDayClose <= 0) return item;
            
            // Calculate dayClose from batch's changePct
            // changePct = (dayClose - prevDayClose) / prevDayClose * 100
            // ∴ dayClose = prevDayClose * (1 + changePct/100)
            const dayClose = prevDayClose * (1 + item.changePct / 100);
            if (dayClose <= 0) return item;
            
            // Correct extended change %
            const correctExtPct = ((item.currentPrice - dayClose) / dayClose) * 100;
            
            return { ...item, extChangePct: correctExtPct };
        });
    }, [items]);

    // Filter + Sort
    const processed = useMemo(() => {
        let list = correctedItems;
        if (searchQ) {
            const q = searchQ.toUpperCase();
            list = list.filter(i => i.ticker.includes(q));
        }
        if (sortKey !== 'default') {
            list = [...list].sort((a, b) => {
                const v = sortKey === 'change' ? b.changePct - a.changePct
                    : sortKey === 'alpha' ? (b.alphaScore ?? 0) - (a.alphaScore ?? 0)
                    : sortKey === 'whale' ? (b.whaleIndex ?? 0) - (a.whaleIndex ?? 0)
                    : (b.return3d ?? 0) - (a.return3d ?? 0);
                return sortDir === 'asc' ? -v : v;
            });
        }
        return list;
    }, [correctedItems, searchQ, sortKey, sortDir]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    return (
        <div className="min-h-screen bg-[#050a14] pb-24 touch-pan-y max-w-[100vw] overflow-x-hidden">
            <style jsx global>{`
                @keyframes fadeSlideIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
            `}</style>

            {/* ── Header ── */}
            <div className="sticky top-0 z-30 bg-[#050a14]/95 backdrop-blur-xl border-b border-white/[0.04]">
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 flex items-center justify-center">
                            <Star className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-[17px] font-black tracking-wider text-white">WATCHLIST</h1>
                            <p className="text-[10px] text-amber-400/60 tracking-[0.2em] font-semibold -mt-0.5">{items.length}/{maxItems >= 999 ? '∞' : maxItems} {t('items')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button onClick={() => refresh()} className="p-2 rounded-lg border border-white/[0.06] text-slate-400 active:bg-white/[0.06]">
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
                        </button>
                        <button onClick={() => !isAtLimit && setShowAdd(true)} disabled={isAtLimit}
                            className={`p-2 rounded-lg border ${isAtLimit ? 'border-rose-500/30 text-rose-400' : 'border-amber-500/20 text-amber-400 active:bg-amber-500/10'}`}>
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* ── Tab Nav ── */}
                <div className="flex px-2 gap-0.5">
                    {TABS.map(({ key, icon: Icon, label }) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-bold tracking-wide transition-all border-b-2 ${
                                tab === key
                                    ? 'border-amber-400 text-amber-400'
                                    : 'border-transparent text-slate-400 active:text-slate-200'
                            }`}>
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Session Status Bar ── */}
            {!loading && <MobileSessionBar />}

            {/* ── Stats Bar (non-signals) ── */}
            {!loading && correctedItems.length > 0 && <MobileStatsBar items={correctedItems} />}

            {/* ── Search + Sort (non-signals) ── */}
            {!loading && items.length > 1 && (
                <div className="px-3 pb-2 space-y-2.5">
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value.toUpperCase())}
                            placeholder={t('filterTickers')} className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-10 pr-9 py-2.5 text-[13px] text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/30 font-medium" />
                        {searchQ && <button onClick={() => setSearchQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1"><X className="w-3.5 h-3.5 text-slate-400" /></button>}
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
                        {(['default', 'change', 'alpha', 'whale', 'return3d'] as SortKey[]).map(k => (
                            <button key={k} onClick={() => handleSort(k)}
                                className={`px-4 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap transition-all ${
                                    sortKey === k
                                        ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/15 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                                        : 'bg-white/[0.04] text-slate-400 active:text-white active:bg-white/[0.08]'
                                }`}>
                                {k === 'default' ? 'Default' : k === 'change' ? 'Change %' : k === 'alpha' ? 'Score' : k === 'whale' ? 'Whale' : '3-Day'}
                                {sortKey === k && k !== 'default' && <span className="ml-1 text-amber-300/80">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Content ── */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    <span className="text-slate-500 text-sm">{t('loadingText')}</span>
                </div>
            ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 px-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/10 flex items-center justify-center">
                        <Star className="w-6 h-6 text-slate-600" />
                    </div>
                    <p className="text-slate-400 font-semibold">{t('noWatchlist')}</p>
                    <p className="text-slate-600 text-xs">{t('startMonitoring')}</p>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/15 border border-amber-500/20 text-amber-400 font-bold text-sm">
                        <Plus className="w-4 h-4" />{t('addFirstItem')}
                    </button>
                </div>
            ) : tab === 'overview' ? (
                <div>{processed.map((item, i) => <OverviewRow key={item.ticker} item={item} i={i} />)}</div>
            ) : tab === 'cards' ? (
                <div className="px-3 space-y-2 pb-4">{processed.map((item, i) => <CardItem key={item.ticker} item={item} i={i} />)}</div>
            ) : (
                <div>
                    <div className="grid grid-cols-[70px_1fr_1fr_50px] px-3 py-2 text-[10px] font-bold text-slate-400 tracking-wider border-b border-white/[0.06]">
                        <span>{t('symbol')}</span><span className="text-right">{t('change')}</span><span className="text-right">{t('price')}</span><span></span>
                    </div>
                    {processed.map(item => <CompactRow key={item.ticker} item={item} />)}
                </div>
            )}

            {/* ── Add Modal ── */}
            {showAdd && <MobileAddModal onClose={() => setShowAdd(false)} onAdd={addItem} existing={items.map(i => i.ticker)} />}
        </div>
    );
}

// ── Session Status Bar ──
const MobileSessionBar = memo(function MobileSessionBar() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const info = useMemo(() => {
        const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const etParts = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':');
        const h = parseInt(etParts[0]), m = parseInt(etParts[1]);
        const mins = h * 60 + m;
        const etDow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
        const isWE = etDow === 0 || etDow === 6;

        let session: string, next: string, countdown: string;
        if (isWE) {
            session = 'closed'; next = 'Pre-Market';
            const daysToMon = etDow === 0 ? 1 : 2;
            const minsToOpen = daysToMon * 24 * 60 + (240 - mins);
            const dH = Math.floor(minsToOpen / 60);
            countdown = dH > 24 ? `${Math.floor(dH / 24)}d ${dH % 24}h` : `${dH}h ${minsToOpen % 60}m`;
        } else if (mins < 240) {
            session = 'closed'; next = 'Pre-Market';
            const diff = 240 - mins; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`;
        } else if (mins < 570) {
            session = 'pre'; next = 'Market Open';
            const diff = 570 - mins; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`;
        } else if (mins < 960) {
            session = 'reg'; next = 'Market Close';
            const diff = 960 - mins; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`;
        } else if (mins < 1200) {
            session = 'post'; next = 'Post Close';
            const diff = 1200 - mins; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`;
        } else {
            session = 'closed'; next = 'Pre-Market';
            const diff = 24 * 60 + 240 - mins; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`;
        }
        return { etStr, session, next, countdown };
    }, [now]);

    const sc = info.session === 'reg' ? { color: 'text-emerald-400', dot: 'bg-emerald-400 shadow-emerald-400/50', bg: 'border-emerald-500/15', label: 'REGULAR' }
        : info.session === 'pre' ? { color: 'text-cyan-400', dot: 'bg-cyan-400 shadow-cyan-400/50', bg: 'border-cyan-500/15', label: 'PRE-MARKET' }
        : info.session === 'post' ? { color: 'text-amber-400', dot: 'bg-amber-400 shadow-amber-400/50', bg: 'border-amber-500/15', label: 'POST-MARKET' }
        : { color: 'text-slate-400', dot: 'bg-slate-500', bg: 'border-slate-500/15', label: 'CLOSED' };

    return (
        <div className={`mx-3 mt-2 px-3 py-2 rounded-xl border ${sc.bg} bg-white/[0.02]`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shadow-lg flex-shrink-0 ${sc.dot} ${info.session !== 'closed' ? 'animate-pulse' : ''}`} />
                    <span className={`text-[12px] font-black tracking-wider ${sc.color}`}>{sc.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span className="text-[11px] font-bold tabular-nums text-white/80">{info.etStr}</span>
                    <span className="text-[9px] font-bold text-slate-500">ET</span>
                </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] font-semibold text-slate-500">{info.next} in</span>
                <span className={`text-[11px] font-black tabular-nums ${sc.color}`}>{info.countdown}</span>
            </div>
        </div>
    );
});

// ── Mobile Add Modal (bottom-sheet style) ──
function MobileAddModal({ onClose, onAdd, existing }: {
    onClose: () => void;
    onAdd: (ticker: string, name: string) => Promise<void>;
    existing: string[];
}) {
    const [ticker, setTicker] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [validated, setValidated] = useState(false);
    const [error, setError] = useState('');
    const t = useTranslations('watchlist');
    const tCommon = useTranslations('common');
    const isDupe = ticker.length > 0 && existing.includes(ticker.toUpperCase());

    useEffect(() => {
        const tm = setTimeout(async () => {
            if (ticker.length < 1) { setName(''); setValidated(false); setError(''); return; }
            setLoading(true); setError('');
            try {
                const r = await fetch(`/api/stock?symbol=${ticker.toUpperCase()}`);
                if (!r.ok) throw new Error();
                const d = await r.json();
                setName(d.name || d.shortName || ticker); setValidated(true);
            } catch { setError(t('invalidTicker')); setName(''); setValidated(false); }
            setLoading(false);
        }, 500);
        return () => clearTimeout(tm);
    }, [ticker]);

    const submit = async () => {
        if (!validated || loading || isDupe) return;
        setLoading(true);
        try { await onAdd(ticker.toUpperCase(), name || ticker.toUpperCase()); onClose(); }
        finally { setLoading(false); }
    };

    const popular = ['AAPL', 'TSLA', 'NVDA', 'GOOGL', 'MSFT', 'AMZN', 'META'];

    useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = 'unset'; }; }, []);

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end" onClick={onClose}>
            <div className="w-full bg-[#0d1424] rounded-t-2xl border-t border-white/[0.1] p-5 pb-8 animate-[slideUp_0.3s_ease-out]" onClick={e => e.stopPropagation()}>
                <style jsx>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
                <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-4" />
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-black text-white">{t('addToWatchlist')}</h2>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06]"><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <input type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="NVDA, AAPL..."
                        className={`w-full bg-white/[0.04] border ${error ? 'border-rose-500/50' : validated ? 'border-emerald-500/40' : 'border-white/[0.08]'} rounded-xl pl-10 pr-10 py-3 text-white text-sm font-bold uppercase tracking-widest placeholder:text-slate-600 placeholder:normal-case placeholder:tracking-normal focus:outline-none`}
                        autoFocus />
                    {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 animate-spin" />}
                    {validated && !loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-sm font-black">✓</span>}
                </div>
                {error && <p className="text-rose-400 text-xs mb-2">⚠ {error}</p>}
                {isDupe && <p className="text-amber-400 text-xs mb-2">⚠ {t('duplicateWarning', { ticker: ticker.toUpperCase() })}</p>}
                {name && !error && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-white/[0.06] flex items-center justify-center overflow-hidden">
                            <img loading="lazy" src={`/api/logo/${ticker}`} alt="" className="w-5 h-5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                        <div><div className="text-sm text-white font-bold truncate">{name}</div><div className="text-[11px] text-slate-500">{ticker.toUpperCase()}</div></div>
                    </div>
                )}
                {!validated && (
                    <div className="mb-4">
                        <div className="text-[10px] text-slate-500 font-bold tracking-wider mb-2">{t('popular').toUpperCase()}</div>
                        <div className="flex flex-wrap gap-1.5">
                            {popular.map(tk => <button key={tk} onClick={() => setTicker(tk)} className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-slate-400 font-bold active:bg-white/[0.08]">{tk}</button>)}
                        </div>
                    </div>
                )}
                <button onClick={submit} disabled={!validated || loading || isDupe}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" />{tCommon('add')}</>}
                </button>
            </div>
        </div>
    );
}
