"use client";
// MobileDashboardPage — 3-Tab + Watchlist Drawer
// Data: useDashboardStore ONLY. Zero new logic. Zero web impact.
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useDashboardStore } from "@/stores/dashboardStore";
import { useRealtimeData } from "@/providers/WebSocketProvider";
import { useTier } from "@/contexts/TierContext";
import { useCardCustomize } from "@/components/dashboard/CardCustomize";
import { MobileBottomSheet } from "@/components/mobile/MobileBottomSheet";
import { MobileStickyHeader, MobileTabNav, WatchlistDrawerItem } from "@/components/mobile/MobileDashboardShell";
import type { MobileTabKey } from "@/components/mobile/MobileDashboardShell";
import { MobileMetricsGrid } from "@/components/mobile/MobileMetricsTab";
import { List, Plus, Search, Loader2, Radio } from "lucide-react";
import { calcPriceDisplay } from "@/utils/calcPriceDisplay";

const StockChart = dynamic(() => import("@/components/StockChart").then(m => m.StockChart), { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-slate-500">Loading...</div> });

// ═══ Signal Feed (same data as DashboardClient SignalFeedPanel) ═══
const SIGNAL_MESSAGES: Record<string, Record<string, string>> = {
    signalBuyPutFloor: { ko: '지지선 지지 구간 (Put Floor ${putFloor})', en: 'Support Zone Active (Put Floor ${putFloor})', ja: 'サポートゾーン活性化 (Put Floor ${putFloor})' },
    signalBuyCallBullish: { ko: '콜 우위 관측 (PCR ${pcr})', en: 'Call Dominance Observed (PCR ${pcr})', ja: 'コール優位観測 (PCR ${pcr})' },
    signalSellCallWall: { ko: '저항 레벨 접근 (Call Wall ${callWall})', en: 'Approaching Resistance (Call Wall ${callWall})', ja: '抵抗レベル接近 (Call Wall ${callWall})' },
    signalSellPutHedge: { ko: '풋 볼륨 증가 관측 (PCR ${pcr})', en: 'Put Volume Elevated (PCR ${pcr})', ja: 'プットボリューム増加観測 (PCR ${pcr})' },
    signalWhaleGex: { ko: '${size} 고래 GEX (${gex})', en: '${size} Whale GEX (${gex})', ja: '${size} クジラ GEX (${gex})' },
    signalGammaSqueeze: { ko: '⚡ 감마 스퀴즈 감지', en: '⚡ Gamma Squeeze Detected', ja: '⚡ ガンマスクイーズ検知' },
    signalHighIv: { ko: '📈 고변동성 구간 (IV ${iv}%)', en: '📈 Elevated IV Zone (IV ${iv}%)', ja: '📈 高IV圏 (IV ${iv}%)' },
    signalCallWallBreak: { ko: '🚀 Call Wall 돌파 ($${callWall})', en: '🚀 Call Wall Breach ($${callWall})', ja: '🚀 Call Wall 突破 ($${callWall})' },
    signalPutFloorBreak: { ko: '💥 Put Floor 이탈 ($${putFloor})', en: '💥 Put Floor Breach ($${putFloor})', ja: '💥 Put Floor 割れ ($${putFloor})' },
    signalDarkPool: { ko: '🏦 Dark Pool 집중 (${pct}%)', en: '🏦 Dark Pool Concentration (${pct}%)', ja: '🏦 Dark Pool 集中 (${pct}%)' },
    signalShortVol: { ko: '📉 Short Vol 확대 (${pct}%)', en: '📉 Short Vol Elevated (${pct}%)', ja: '📉 Short Vol 拡大 (${pct}%)' },
    signalImpliedMove: { ko: '⚡ Implied Move ±${pct}%', en: '⚡ Implied Move ±${pct}%', ja: '⚡ Implied Move ±${pct}%' },
};

function translateSig(sig: any, locale: string): string {
    if (!sig.messageKey || !SIGNAL_MESSAGES[sig.messageKey]) return sig.message;
    const tpl = SIGNAL_MESSAGES[sig.messageKey][locale] || SIGNAL_MESSAGES[sig.messageKey].en || sig.message;
    if (!sig.params) return tpl;
    return tpl.replace(/\$\{(\w+)\}/g, (_: string, k: string) => String(sig.params?.[k] ?? k));
}

function SignalsTab() {
    const signals = useDashboardStore(s => s.signals);
    const session = useDashboardStore(s => s.tickers[s.selectedTicker]?.session || "CLOSED");
    const locale = useLocale();
    const td = useTranslations("dashboard");
    const isOpen = session === "REG";
    const [dbSignals, setDbSignals] = useState<any[]>([]);
    useEffect(() => {
        const f = async () => { try { const r = await fetch("/api/dashboard/signals"); if (r.ok) { const d = await r.json(); setDbSignals(d.signals || []); } } catch {} };
        f(); const i = setInterval(f, 60000); return () => clearInterval(i);
    }, []);
    const merged = useMemo(() => {
        const m = new Map<string, any>();
        const add = (s: any) => { const ts = new Date(s.timestamp || s.time || s.ts || Date.now()).getTime(); const k = `${s.ticker}-${s.type}-${Math.floor(ts / 60000)}`; if (!m.has(k) || m.get(k).timestamp < ts) m.set(k, { ...s, timestamp: ts }); };
        for (const s of signals) add(s);
        for (const s of dbSignals) add(s);
        return Array.from(m.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    }, [signals, dbSignals]);

    const typeStyle: Record<string, { card: string; bar: string; text: string }> = {
        BULLISH: { card: "bg-emerald-500/10 border-emerald-500/30", bar: "bg-emerald-400", text: "text-emerald-400" },
        BEARISH: { card: "bg-rose-500/10 border-rose-500/30", bar: "bg-rose-400", text: "text-rose-400" },
        WHALE: { card: "bg-amber-500/10 border-amber-500/30", bar: "bg-amber-400", text: "text-amber-400" },
        ALERT: { card: "bg-purple-500/10 border-purple-500/30", bar: "bg-purple-400", text: "text-purple-400" },
    };

    return (
        <div className="px-3 py-3 space-y-1.5">
            <div className="flex items-center justify-between px-1 mb-2">
                <div className="flex items-center gap-2">
                    <Radio className={`w-3.5 h-3.5 ${isOpen ? "text-emerald-400 animate-pulse" : "text-slate-500"}`} />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Signal Feed</span>
                    {isOpen ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">LIVE</span>
                        : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">PREV SESSION</span>}
                </div>
                <span className="text-[11px] text-slate-400">{merged.length}</span>
            </div>
            {merged.length > 0 ? merged.map((sig, i) => {
                const st = typeStyle[sig.type] || typeStyle.ALERT;
                const time = new Date(sig.timestamp).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
                return (
                    <div key={i} className={`relative p-2.5 rounded-lg border backdrop-blur-sm ${st.card}`}>
                        <div className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${st.bar}`} />
                        <div className="flex items-center gap-2 pl-2 mb-1">
                            <div className="w-5 h-5 rounded bg-slate-800/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                                <img loading="lazy" src={`/api/logo/${sig.ticker}`} alt="" className="w-3.5 h-3.5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            </div>
                            <span className="font-semibold text-xs text-white">{sig.ticker}</span>
                            <span className={`text-[11px] font-bold ${st.text}`}>{sig.type}</span>
                            <span className="text-[10px] text-slate-400 ml-auto bg-slate-800/50 px-1.5 py-0.5 rounded">{time} <span className="text-[8px] font-bold text-slate-500">ET</span></span>
                        </div>
                        <p className="text-xs text-white leading-snug pl-2">{translateSig(sig, locale)}</p>
                    </div>
                );
            }) : (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <Radio className="w-6 h-6 text-slate-500" />
                    <p className="text-slate-300 text-sm font-medium">{td("signalWaiting")}</p>
                    <p className="text-[11px] text-slate-500">Signals are generated during market hours (9:30–16:00 ET)</p>
                </div>
            )}
        </div>
    );
}

// ═══ Chart+History Tab ═══
function ChartHistoryTab() {
    const td = useTranslations("dashboard");
    const selectedTicker = useDashboardStore(s => s.selectedTicker);
    const data = useDashboardStore(s => s.tickers[s.selectedTicker]);
    const [chartHistory, setChartHistory] = useState<any[]>([]);
    const [chartLoading, setChartLoading] = useState(true);
    const [dailyHistory, setDailyHistory] = useState<any[]>([]);

    useEffect(() => {
        if (!selectedTicker) return;
        setChartLoading(true);
        const f = async () => { try { const r = await fetch(`/api/chart?symbol=${selectedTicker}&range=1d`); if (r.ok) { const j = await r.json(); setChartHistory(j.data || []); } } catch {} setChartLoading(false); };
        f(); const i = setInterval(f, 15000); return () => clearInterval(i);
    }, [selectedTicker]);

    useEffect(() => {
        if (!selectedTicker) return;
        setDailyHistory([]);
        (async () => { try { const r = await fetch(`/api/dashboard/daily-history?t=${selectedTicker}&days=5`); if (r.ok) { const j = await r.json(); setDailyHistory(j.data || []); } } catch {} })();
    }, [selectedTicker]);

    return (
        <div className="px-3 py-3 space-y-3">
            {/* Chart */}
            <div className="h-[440px] bg-[#0d1829]/60 rounded-xl border border-white/5 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 p-2.5 border-b border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Price History</span>
                </div>
                <div className="flex-1 min-h-0">
                    {chartLoading ? <div className="h-full flex items-center justify-center"><Loader2 className="w-5 h-5 text-cyan-400 animate-spin" /></div>
                        : chartHistory.length > 0 ? (
                            <StockChart data={chartHistory} ticker={selectedTicker}
                                currentPrice={
                                    (data?.session === "POST" || data?.session === "PRE" || data?.session === "CLOSED") && (data?.extended?.postPrice || data?.extended?.prePrice)
                                        ? (data?.extended?.postPrice || data?.extended?.prePrice) ?? undefined : (data?.underlyingPrice ?? undefined)
                                }
                                prevClose={
                                    ((data?.session === "POST" || (data?.session === "CLOSED" && (data?.extended?.postPrice ?? 0) > 0)) && data?.regularCloseToday
                                        ? data.regularCloseToday : (data?.prevRegularClose || data?.prevClose)) ?? undefined
                                }
                                alphaLevels={{ callWall: data?.levels?.callWall ?? undefined, putFloor: data?.levels?.putFloor ?? undefined, maxPain: data?.maxPain ?? undefined }}
                                session={data?.session || "CLOSED"} hideHeaderExtras={true}
                            />
                        ) : <div className="h-full flex items-center justify-center text-slate-500 text-sm">{td("noChartData")}</div>}
                </div>
            </div>
            {/* 5-Day History */}
            {dailyHistory.length > 0 && (
                <div className="bg-[#0d1829]/60 rounded-xl border border-white/5 overflow-hidden">
                    <div className="p-2.5 border-b border-white/5"><span className="text-xs font-bold uppercase tracking-wider text-slate-400">5-Day History</span></div>
                    <div className="divide-y divide-white/5">
                        {dailyHistory.map((day: any, idx: number) => (
                            <div key={idx} className="px-3 py-2.5">
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-white font-mono font-bold text-[13px]">{day.date}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-mono font-bold text-[13px]">${day.close?.toFixed(2)}</span>
                                        <span className={`font-mono text-xs font-bold ${(day.changePct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                            {day.changePct != null ? `${day.changePct > 0 ? "+" : ""}${day.changePct.toFixed(2)}%` : "—"}
                                        </span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                                    <div><div className="text-slate-500 text-[10px] font-sans font-semibold">VOL</div><div className="text-white">{day.volume ? `${(day.volume / 1e6).toFixed(1)}M` : "—"}</div></div>
                                    <div><div className="text-slate-500 text-[10px] font-sans font-semibold">VWAP</div><div className="text-white">${day.vwap?.toFixed(2) || "—"}</div></div>
                                    <div><div className="text-slate-500 text-[10px] font-sans font-semibold">GAP</div><div className={(day.gapPct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>{day.gapPct != null ? `${day.gapPct > 0 ? "+" : ""}${day.gapPct.toFixed(2)}%` : "—"}</div></div>
                                    <div><div className="text-slate-500 text-[10px] font-sans font-semibold">RNG</div><div className="text-amber-400">{day.rangePct != null ? `${day.rangePct.toFixed(2)}%` : "—"}</div></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══ MAIN EXPORT ═══
export function MobileDashboardPage({ initialTickers, initialQuotes }: { initialTickers: string[]; initialQuotes: any }) {
    const [activeTab, setActiveTab] = useState<MobileTabKey>("metrics");
    const [drawerOpen, setDrawerOpen] = useState(false);
    const t = useTranslations("dashboard");
    const { tier } = useTier();

    // ── Store init ──
    const dashboardTickers = useDashboardStore(s => s.dashboardTickers);
    const selectedTicker = useDashboardStore(s => s.selectedTicker);
    const setSelectedTicker = useDashboardStore(s => s.setSelectedTicker);
    const initializeStore = useDashboardStore(s => s.initializeStore);
    const fetchDashboardData = useDashboardStore(s => s.fetchDashboardData);
    const fetchPriceOnly = useDashboardStore(s => s.fetchPriceOnly);
    const updateRealtimePrice = useDashboardStore(s => s.updateRealtimePrice);
    const toggleDashboardTicker = useDashboardStore(s => s.toggleDashboardTicker);

    const hasInit = useRef(false);
    if (!hasInit.current) { initializeStore(initialTickers, initialQuotes); hasInit.current = true; }

    const tickersRef = useRef(dashboardTickers);
    useEffect(() => { tickersRef.current = dashboardTickers; }, [dashboardTickers]);

    // ── Polling ──
    useEffect(() => {
        const gl = () => tickersRef.current.length > 0 ? tickersRef.current : undefined;
        let fi: any = null, pi: any = null;
        const start = () => { fi = setInterval(() => fetchDashboardData(gl()), 30000); pi = setInterval(() => fetchPriceOnly(gl()), 2000); };
        const stop = () => { if (fi) clearInterval(fi); if (pi) clearInterval(pi); };
        const vis = () => { if (document.hidden) stop(); else { fetchPriceOnly(gl()); fetchDashboardData(gl()); start(); } };
        fetchPriceOnly(gl()); fetchDashboardData(gl()); start();
        document.addEventListener("visibilitychange", vis);
        return () => { stop(); document.removeEventListener("visibilitychange", vis); };
    }, []);

    // ── WebSocket ──
    const { prices: wsPrices } = useRealtimeData(dashboardTickers);
    const prevWs = useRef<Map<string, any>>(new Map());
    useEffect(() => {
        if (!wsPrices || wsPrices.size === 0) return;
        wsPrices.forEach((upd, ticker) => { const prev = prevWs.current.get(ticker); if (prev && prev.price === upd.price) return; if (upd.price > 0) updateRealtimePrice(ticker, upd.price, upd.changePct); });
        prevWs.current = new Map(wsPrices);
    }, [wsPrices, updateRealtimePrice]);

    // ── Watchlist search ──
    const [newTicker, setNewTicker] = useState("");
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const TIER_MAX: Record<string, number> = { guest: 3, free: 3, pro: 10, elite: 20 };
    const maxSlots = TIER_MAX[tier] ?? 3;
    const isAtLimit = dashboardTickers.length >= maxSlots;
    const fetchSuggestions = useCallback(async (q: string) => {
        if (!q || q.length < 1) { setSuggestions([]); return; }
        try { const r = await fetch(`/api/tickers/search?q=${encodeURIComponent(q)}`); if (r.ok) { const d = await r.json(); setSuggestions((d.symbols || []).filter((s: string) => !dashboardTickers.includes(s))); } } catch {}
    }, [dashboardTickers]);
    const addTicker = useCallback((t: string) => {
        if (isAtLimit || !t) return;
        if (!dashboardTickers.includes(t)) toggleDashboardTicker(t, maxSlots);
        setNewTicker(""); setSuggestions([]);
    }, [isAtLimit, dashboardTickers, toggleDashboardTicker, maxSlots]);

    return (
        <div className="min-h-screen bg-[#050a14] pb-24 touch-pan-y max-w-[100vw] overflow-x-hidden">
            <MobileStickyHeader onOpenDrawer={() => setDrawerOpen(true)} />
            <MobileTabNav active={activeTab} onChange={setActiveTab} />
            {activeTab === "metrics" && <MobileMetricsGrid />}
            {activeTab === "chart" && <ChartHistoryTab />}
            {activeTab === "signals" && <SignalsTab />}

            {/* Watchlist Drawer */}
            <MobileBottomSheet isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title="Watchlist">
                <div className="px-3 pb-2">
                    <div className="flex items-center justify-between mb-2">
                        <span className={`text-[11px] font-bold ${isAtLimit ? "text-amber-400" : "text-slate-400"}`}>{dashboardTickers.length} / {maxSlots}</span>
                    </div>
                    <div className="flex gap-1.5 mb-3">
                        <div className="flex-1 relative">
                            <input type="text" value={newTicker} onChange={e => { const v = e.target.value.toUpperCase(); setNewTicker(v); fetchSuggestions(v); }}
                                onKeyDown={e => { if (e.key === "Enter") addTicker(newTicker.trim().toUpperCase()); }}
                                placeholder={isAtLimit ? "Limit reached" : "Add ticker..."}
                                className="w-full px-3 py-2 text-xs bg-white/[0.04] border border-white/[0.06] rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                                disabled={isAtLimit} maxLength={6} autoComplete="off" />
                            {suggestions.length > 0 && (
                                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-white/10 bg-[#0d1829] shadow-2xl overflow-hidden">
                                    {suggestions.slice(0, 5).map(s => (
                                        <button key={s} onClick={() => addTicker(s)} className="w-full px-3 py-1.5 text-left text-xs font-mono text-slate-300 hover:bg-white/5">{s}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={() => addTicker(newTicker.trim().toUpperCase())}
                            className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400" disabled={isAtLimit}>
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    {/* Column Headers */}
                    <div className="grid grid-cols-[80px_1fr_1fr_1fr] px-3 py-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/[0.06]">
                        <span>Symbol</span><span className="text-right">Last</span><span className="text-right">Chg%</span><span className="text-right">Post</span>
                    </div>
                </div>
                <div className="max-h-[50vh] overflow-y-auto">
                    {dashboardTickers.map(ticker => (
                        <WatchlistDrawerItem key={ticker} ticker={ticker} isSelected={ticker === selectedTicker}
                            onSelect={() => { setSelectedTicker(ticker); setDrawerOpen(false); }} />
                    ))}
                </div>
            </MobileBottomSheet>
        </div>
    );
}
