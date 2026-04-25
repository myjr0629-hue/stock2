"use client";
// MobileDashboardShell — Sticky Header + 3-Tab nav + Watchlist Drawer
// Data: useDashboardStore only. Zero new logic.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useDashboardStore } from "@/stores/dashboardStore";
import { calcPriceDisplay } from "@/utils/calcPriceDisplay";
import { usePriceFlash, getFlashStyle, tickerDelay } from "@/components/ui/PriceDisplay";
import { MobileBottomSheet } from "@/components/mobile/MobileBottomSheet";
import { List, BarChart3, TrendingUp, Zap, Plus, X, Search } from "lucide-react";
import { useTier } from "@/contexts/TierContext";

// ── Market status helper ──
function useMarketStatus() {
    const market = useDashboardStore(s => s.market);
    const [status, setStatus] = useState("CLOSED");
    useEffect(() => {
        const u = () => {
            const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
            const d = et.getDay(), m = et.getHours() * 60 + et.getMinutes();
            if (d === 0 || d === 6 || market?.isHoliday) { setStatus("CLOSED"); return; }
            if (m >= 240 && m < 570) setStatus("PRE");
            else if (m >= 570 && m < 960) setStatus("OPEN");
            else if (m >= 960 && m < 1200) setStatus("AFTER");
            else setStatus("CLOSED");
        };
        u(); const i = setInterval(u, 60000);
        return () => clearInterval(i);
    }, [market]);
    return status;
}

// ── Countdown ──
function useCountdown() {
    const [cd, setCd] = useState("");
    const [label, setLabel] = useState("");
    useEffect(() => {
        const calc = () => {
            const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
            const d = et.getDay(), cm = et.getHours() * 60 + et.getMinutes();
            if (d === 0 || d === 6) { setCd(""); return; }
            let t = 0, l = "";
            if (cm < 240) { t = 240; l = "Pre-Market"; }
            else if (cm < 570) { t = 570; l = "Market Open"; }
            else if (cm < 960) { t = 960; l = "Market Close"; }
            else if (cm < 1200) { t = 1200; l = "AH Close"; }
            else { t = 240 + 1440; l = "Pre-Market"; }
            const diff = t - cm, h = Math.floor(diff / 60), m = diff % 60;
            setCd(h > 0 ? `${h}h ${m}m` : `${m}m`);
            setLabel(l);
        };
        calc(); const i = setInterval(calc, 60000);
        return () => clearInterval(i);
    }, []);
    return { cd, label };
}

// ── Sticky Header ──
export function MobileStickyHeader({ onOpenDrawer }: { onOpenDrawer: () => void }) {
    const selectedTicker = useDashboardStore(s => s.selectedTicker);
    const data = useDashboardStore(s => s.tickers[s.selectedTicker]);
    const market = useDashboardStore(s => s.market);
    const status = useMarketStatus();
    const { cd, label } = useCountdown();

    const p = calcPriceDisplay({
        livePrice: data?.display?.price || data?.underlyingPrice,
        liveChangePct: data?.display?.changePctPct ?? data?.changePercent,
        apiDisplayPrice: data?.display?.price || data?.underlyingPrice,
        apiDisplayChangePct: data?.display?.changePctPct ?? data?.intradayChangePct ?? data?.changePercent,
        session: data?.session || "CLOSED",
        prevRegularClose: data?.prevRegularClose, prevClose: data?.prevClose,
        regularCloseToday: data?.regularCloseToday, prevChangePct: data?.prevChangePct,
        fallbackChangePct: data?.intradayChangePct ?? data?.changePercent ?? 0,
        lastTrade: data?.underlyingPrice,
        extended: data?.extended,
        prices: { prePrice: data?.extended?.prePrice, postPrice: data?.extended?.postPrice },
    });
    const price = p.displayPrice;
    const pct = p.displayChangePct;
    const up = pct >= 0;
    const ext = p.activeExtPrice;
    const extPct = p.activeExtPct;
    const extLabel = p.activeExtLabel?.replace(/\s*\(.*\)/, "").replace(/\s*(CLOSE|CLOSED)$/i, "").trim();
    const hasExt = ext > 0 && extLabel;
    const isLive = status === "PRE" || status === "OPEN" || status === "AFTER";

    return (
        <div className="bg-[#0a0f1a]/95 backdrop-blur-xl border-b border-white/[0.06] px-4 pb-2.5 pt-2 sticky top-0 z-30">
            {/* Row 1: Hamburger + Ticker + Price (single line) */}
            <div className="flex items-center gap-2 mb-1.5">
                <button onClick={onOpenDrawer} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] text-slate-400 active:bg-white/[0.08]">
                    <List className="w-4 h-4" />
                </button>
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-800 to-slate-700/50 border border-slate-600/50 flex items-center justify-center overflow-hidden relative flex-shrink-0">
                    <img loading="lazy" src={`/api/logo/${selectedTicker}`} alt="" className="w-5 h-5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <span className="text-[8px] font-bold text-slate-500 absolute">{selectedTicker?.slice(0, 2)}</span>
                </div>
                <span className="text-[17px] font-extrabold text-white tracking-tight">{selectedTicker}</span>
                <span className="text-[11px] text-slate-500">▾</span>
                {/* Price + Change (right-aligned) */}
                <div className="ml-auto flex items-baseline gap-1.5">
                    <span className="text-[20px] font-bold text-white tracking-tight leading-none font-mono">
                        ${price > 0 ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                    </span>
                    <span className={`text-[13px] font-bold font-mono ${up ? "text-emerald-400" : "text-rose-400"}`}>
                        {up ? "+" : ""}{pct.toFixed(2)}%
                    </span>
                </div>
            </div>
            {/* Row 2: POST/PRE badge + Market Status */}
            <div className="flex items-center gap-2 text-[11px]">
                {hasExt ? (
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${extLabel?.includes("PRE") ? "bg-amber-500/15 text-amber-300" : "bg-purple-500/15 text-purple-300"}`}>
                        <span className="font-bold">{extLabel}</span>
                        <span className="font-mono font-semibold text-slate-200">${ext.toFixed(2)}</span>
                        <span className={`font-mono font-semibold ${extPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{extPct > 0 ? "+" : ""}{extPct.toFixed(2)}%</span>
                    </div>
                ) : null}
                <div className="ml-auto flex items-center gap-1.5">
                    {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    <span className={`font-bold ${isLive ? "text-emerald-400" : "text-amber-400"}`}>
                        {isLive ? status : cd ? `${label} ${cd}` : "CLOSED"}
                    </span>
                </div>
            </div>
            {/* Row 4: Macro chips (from store MarketData) */}
            <div className="flex gap-3 mt-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {market?.nq?.price != null && <MacroChip name="NQ" val={market.nq.price} pct={market.nq.change} />}
                {market?.vix != null && <MacroChip name="VIX" val={market.vix} />}
                {market?.phase && <span className="text-[9px] font-semibold text-slate-500 flex-shrink-0">{market.phase}</span>}
            </div>
        </div>
    );
}

function MacroChip({ name, val, pct }: { name: string; val: any; pct?: number }) {
    return (
        <div className="flex items-center gap-1 flex-shrink-0 text-[9px]">
            <span className="text-slate-500 font-semibold">{name}</span>
            {typeof val === "number" ? <span className="text-slate-300 font-bold">{val.toFixed?.(2) ?? val}</span> : <span className="text-slate-300 font-bold">{val}</span>}
            {pct != null && <span className={`font-bold ${pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pct > 0 ? "+" : ""}{pct.toFixed(2)}%</span>}
        </div>
    );
}

// ── Tab Navigation ──
export type MobileTabKey = "metrics" | "chart" | "signals";

export function MobileTabNav({ active, onChange }: { active: MobileTabKey; onChange: (t: MobileTabKey) => void }) {
    const t = useTranslations("dashboard");
    const tabs: { key: MobileTabKey; label: string; icon: React.ReactNode }[] = [
        { key: "metrics", label: t("mobileTabMetrics"), icon: <BarChart3 className="w-4 h-4" /> },
        { key: "chart", label: t("mobileTabChart"), icon: <TrendingUp className="w-4 h-4" /> },
        { key: "signals", label: t("mobileTabSignal"), icon: <Zap className="w-4 h-4" /> },
    ];
    return (
        <div className="flex border-b border-white/[0.04] sticky top-[96px] z-20 bg-[#050a14]/95" style={{ backdropFilter: "blur(16px)" }}>
            {tabs.map(tab => (
                <button key={tab.key} onClick={() => onChange(tab.key)}
                    className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 relative transition-colors touch-manipulation ${active === tab.key ? "text-white" : "text-slate-500"}`}
                    style={{ WebkitTapHighlightColor: "transparent" }}>
                    {tab.icon}
                    <span className="text-[11px] font-bold tracking-wide">{tab.label}</span>
                    {active === tab.key && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-[2px] rounded-full bg-blue-400" />}
                </button>
            ))}
        </div>
    );
}

// ── Watchlist Drawer Row ──
export const WatchlistDrawerItem = React.memo(function WatchlistDrawerItem({ ticker, isSelected, onSelect }: { ticker: string; isSelected: boolean; onSelect: () => void }) {
    const data = useDashboardStore(s => s.tickers[ticker]);
    const ext = data?.session === "POST" || data?.session === "CLOSED"
        ? { price: data?.extended?.postPrice || 0, pct: data?.extended?.postChangePct || 0 }
        : { price: data?.extended?.prePrice || 0, pct: data?.extended?.preChangePct || 0 };
    const pr = calcPriceDisplay({
        livePrice: data?.display?.price || data?.underlyingPrice,
        liveChangePct: data?.display?.changePctPct ?? data?.changePercent,
        apiDisplayPrice: data?.display?.price || data?.underlyingPrice,
        apiDisplayChangePct: data?.display?.changePctPct ?? data?.intradayChangePct ?? data?.changePercent,
        session: data?.session || "CLOSED",
        prevRegularClose: data?.prevRegularClose, prevClose: data?.prevClose,
        regularCloseToday: data?.regularCloseToday, prevChangePct: data?.prevChangePct,
        fallbackChangePct: data?.intradayChangePct ?? data?.changePercent ?? 0,
        lastTrade: data?.underlyingPrice,
        extended: data?.extended,
        prices: { prePrice: data?.extended?.prePrice, postPrice: data?.extended?.postPrice },
    });
    const price = pr.displayPrice;
    const pct = pr.displayChangePct;
    const up = pct >= 0;
    const flash = usePriceFlash(price, tickerDelay(ticker));
    const wf = getFlashStyle(flash);

    return (
        <div onClick={onSelect}
            className={`grid grid-cols-[80px_1fr_1fr_1fr] items-center px-3 py-2.5 border-b border-white/[0.03] active:bg-white/[0.04] ${isSelected ? "bg-blue-500/[0.08] border-l-2 border-l-blue-500" : ""}`}>
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img loading="lazy" src={`/api/logo/${ticker}`} alt="" className="w-4 h-4 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
                <span className={`text-[12px] font-bold ${isSelected ? "text-blue-400" : "text-white"}`}>{ticker}</span>
            </div>
            <span className={`text-[11px] font-mono font-semibold text-right ${wf.color}`} style={wf.style}>{price > 0 ? price.toFixed(2) : "—"}</span>
            <span className={`text-[11px] font-mono font-bold text-right ${up ? "text-emerald-400" : "text-rose-400"}`}>{up ? "+" : ""}{pct.toFixed(2)}%</span>
            <span className={`text-[10px] font-mono font-semibold text-right ${ext.pct >= 0 ? "text-emerald-400/60" : "text-rose-400/60"}`}>
                {ext.price > 0 ? `${ext.pct > 0 ? "+" : ""}${ext.pct.toFixed(2)}%` : "—"}
            </span>
        </div>
    );
});
