"use client";

import { useEffect, useState, FormEvent } from "react";
import { Search, Globe, User, Settings, Sparkles, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { clsx } from 'clsx';
import { useRouter } from "next/navigation";
import { useFavorites } from "@/hooks/useFavorites";
import { MarketStatusBadge } from "@/components/common/MarketStatusBadge";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";

export function LandingHeader() {
    const router = useRouter();
    const { favorites } = useFavorites();
    const [searchQuery, setSearchQuery] = useState("");
    const { status: marketStatus } = useMarketStatus();
    const { snapshot: macroData } = useMacroSnapshot(); // Added macroData

    const handleSearch = (e: FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/ticker?ticker=${searchQuery.toUpperCase()}&range=1d`);
        }
    };

    return (
        <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#0F1419]/80 backdrop-blur-md">
            <div className="container flex h-14 items-center justify-between px-4 sm:px-8">
                {/* Left: Logo & Navigation */}
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2 group">
                        {/* Orange Circular Logo */}
                        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-600 shadow-lg shadow-orange-500/20 transition-all group-hover:shadow-orange-500/40 group-hover:scale-105">
                            <span className="font-bold text-white">A</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-100 leading-none group-hover:text-white transition-colors">
                                Alpha
                            </span>
                            <span className="text-[8px] font-bold text-slate-400 tracking-widest uppercase leading-none group-hover:text-amber-400 transition-colors">
                                TIER 0.1
                            </span>
                        </div>
                    </Link>

                    {/* Navigation Links (Restored) */}
                    <nav className="hidden md:flex items-center gap-6">
                        {["Home", "Dashboard", "Tier 0.1", "Portfolio"].map((item) => (
                            <Button
                                key={item}
                                variant="ghost"
                                className="text-slate-400 hover:text-white hover:bg-white/5 font-medium text-xs transition-colors px-3 h-8 rounded-full"
                                onClick={() => {
                                    if (item === "Home") router.push('/');
                                    if (item === "Dashboard") router.push('/ticker?ticker=NVDA');
                                    if (item === "Tier 0.1") router.push('/tier-01');
                                }}
                            >
                                {item}
                            </Button>
                        ))}
                    </nav>
                </div>

                {/* Center: Search Bar */}
                <div className="flex-1 max-w-md mx-8">
                    <form onSubmit={handleSearch} className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search ticker..."
                            className="pl-10 h-9 bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-500 focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all rounded-full text-xs shadow-none"
                        />
                    </form>
                </div>

                {/* Right: Actions & Market Status */}
                <div className="flex items-center gap-4">
                    {/* Favorites Link */}
                    <div className="hidden lg:flex items-center">
                        <Button
                            onClick={() => router.push('/favorites')}
                            variant="ghost"
                            className="relative text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 font-medium text-xs px-2 h-8 rounded-full transition-all group"
                            title="즐겨찾기 (Watchlist)"
                        >
                            <Heart className={`w-3.5 h-3.5 mr-1.5 transition-colors ${favorites.length > 0 ? "fill-rose-500 text-rose-500" : ""}`} />
                            <span>Favorites</span>
                            {favorites.length > 0 && (
                                <span className="absolute top-1.5 right-1 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                                </span>
                            )}
                        </Button>
                    </div>

                    {/* Macro Tickers (SSOT) - Moved to Right */}
                    <div className="hidden xl:flex items-center gap-4 border-l border-white/10 pl-4 mr-2">
                        {/* NDX */}
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400">NDX</span>
                            <span className="text-sm font-semibold text-slate-200">
                                {macroData?.factors?.nasdaq100?.level ? macroData.factors.nasdaq100.level.toLocaleString() : "—"}
                            </span>
                            <span className={clsx("text-xs", (macroData?.factors?.nasdaq100?.chgPct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                {macroData?.factors?.nasdaq100?.chgPct != null ? macroData.factors.nasdaq100.chgPct.toFixed(2) : "—"}%
                            </span>
                        </div>

                        {/* VIX */}
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400">VIX</span>
                            <span className="text-sm font-semibold text-slate-200">
                                {macroData?.factors?.vix?.level ? macroData.factors.vix.level.toFixed(2) : "—"}
                            </span>
                            <span className={clsx("text-xs", (macroData?.factors?.vix?.level ?? 0) > 20 ? "text-rose-400" : "text-slate-400")}>
                                {(macroData?.factors?.vix?.level ?? 0) > 20 ? "HIGH" : "STABLE"}
                            </span>
                        </div>

                        {/* US10Y */}
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400">US10Y</span>
                            <span className="text-sm font-semibold text-slate-200">
                                {macroData?.factors?.us10y?.level?.toFixed(2) ?? "—"}%
                            </span>
                            <span className={clsx("text-xs", (macroData?.factors?.us10y?.chgPct ?? 0) >= 0 ? "text-rose-400" : "text-emerald-400")}>
                                {macroData?.factors?.us10y?.chgPct != null ? macroData.factors.us10y.chgPct.toFixed(2) : "—"}%
                            </span>
                        </div>

                        {/* DXY */}
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400">DXY</span>
                            <span className="text-sm font-semibold text-slate-200">
                                {macroData?.factors?.dxy?.level?.toFixed(2) ?? "—"}
                            </span>
                            <span className={clsx("text-xs", (macroData?.factors?.dxy?.chgPct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                {macroData?.factors?.dxy?.chgPct != null ? macroData.factors.dxy.chgPct.toFixed(2) : "—"}%
                            </span>
                        </div>
                    </div>

                    {/* Market Status (SSOT) - Moved to Right */}
                    <MarketStatusBadge status={marketStatus} variant="header" />

                    <Button className="bg-white text-slate-900 hover:bg-slate-200 h-8 px-4 text-[10px] font-bold uppercase tracking-wide rounded-full transition-transform hover:scale-105">
                        Connect Wallet
                    </Button>
                </div>
            </div>
        </header>
    );
}
