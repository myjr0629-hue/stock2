"use client";

import { useState, FormEvent } from "react";
import { Search, Globe, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { clsx } from 'clsx';
import { useFavorites } from "@/hooks/useFavorites";

export function LandingHeader() {
    const router = useRouter();
    const pathname = usePathname();
    const { favorites } = useFavorites();
    const [searchQuery, setSearchQuery] = useState("");

    const handleSearch = (e: FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/ticker?ticker=${searchQuery.toUpperCase()}&range=1d`);
        }
    };

    return (
        <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#0F172A]/80 backdrop-blur-xl">
            <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
                {/* 1. LOGO (SIGNUM HQ) */}
                <Link href="/" className="flex items-center gap-2.5 group">
                    <img
                        src="/logo-signum-original.jpg"
                        alt="SIGNUM HQ"
                        className="w-9 h-9 rounded-lg group-hover:scale-105 transition-transform"
                    />
                    <div className="flex flex-col">
                        <span className="text-sm font-black tracking-tight text-white leading-none group-hover:text-cyan-400 transition-colors">
                            SIGNUM <span className="text-cyan-400">HQ</span>
                        </span>
                        <span className="text-[8px] font-bold text-slate-500 tracking-[0.15em] uppercase leading-none mt-0.5">
                            Signal Command
                        </span>
                    </div>
                </Link>

                {/* 2. NAVIGATION (COMMAND / INTEL / PORTFOLIO / WATCHLIST) */}
                <nav className="hidden md:flex items-center gap-1">
                    {[
                        { label: "GUARDIAN", href: "/intel-guardian", path: "/intel-guardian", active: false },
                        { label: "COMMAND", href: "/ticker?ticker=NVDA", path: "/ticker", active: false },
                        { label: "INTEL", href: "/intel", path: "/intel", active: false },
                        { label: "PORTFOLIO", href: "/portfolio", path: "/portfolio", active: false },
                        { label: "WATCHLIST", href: "/watchlist", path: "/watchlist", active: false }
                    ].map((item) => {
                        // Use exact match for /intel to avoid matching /intel-guardian
                        const isActive = item.path
                            ? (item.path === "/intel" ? pathname === "/intel" : pathname?.startsWith(item.path))
                            : false;
                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={clsx(
                                    "relative px-5 py-2 text-[11px] font-black tracking-widest uppercase rounded-lg transition-all group",
                                    isActive ? "text-emerald-400 bg-emerald-950/30 border border-emerald-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"
                                )}
                            >
                                {item.label}
                                {isActive && (
                                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* 3. UTILITIES */}
                <div className="flex items-center gap-4">
                    {/* Search Bar */}
                    <div className="hidden lg:block relative group">
                        <form onSubmit={handleSearch}>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="TICKER..."
                                className="pl-9 pr-3 h-9 w-32 focus:w-48 bg-slate-900/50 border border-slate-700 rounded-lg text-xs font-bold text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-0 transition-all outline-none uppercase tracking-wider"
                            />
                        </form>
                    </div>

                    <div className="w-px h-4 bg-slate-800 hidden md:block" />

                    {/* EN/KO Toggle */}
                    <button className="hidden md:flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-white transition-colors uppercase tracking-widest">
                        <Globe size={12} />
                        <span>EN <span className="text-slate-700">|</span> KO</span>
                    </button>

                    {/* Login Button */}
                    <Link href="/login" className="hidden md:block">
                        <Button className="bg-emerald-600 hover:bg-emerald-500 text-white h-9 px-5 rounded-lg text-[10px] font-black tracking-widest uppercase shadow-[0_0_15px_rgba(5,150,105,0.4)] hover:shadow-[0_0_25px_rgba(5,150,105,0.6)] transition-all border border-emerald-400/20">
                            <LogIn size={12} className="mr-2" />
                            Login
                        </Button>
                    </Link>

                    {/* [Mobile Menu Toggle] */}
                    <div className="md:hidden flex items-center">
                        <details className="group relative">
                            <summary className="list-none cursor-pointer p-2 text-slate-400 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                            </summary>
                            <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 p-2 space-y-1">
                                {[
                                    { label: "GUARDIAN", href: "/intel-guardian" },
                                    { label: "COMMAND", href: "/ticker?ticker=NVDA" },
                                    { label: "INTEL", href: "/intel" },
                                    { label: "PORTFOLIO", href: "/portfolio" },
                                    { label: "WATCHLIST", href: "/watchlist" }
                                ].map((item) => (
                                    <Link
                                        key={item.label}
                                        href={item.href}
                                        className="block px-4 py-3 text-xs font-black text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors uppercase tracking-widest"
                                    >
                                        {item.label}
                                    </Link>
                                ))}
                                <div className="h-px bg-slate-800 my-1" />
                                <Link href="/login" className="block px-4 py-3 text-xs font-black text-emerald-400 hover:bg-emerald-950/30 rounded-lg uppercase tracking-widest">
                                    Login
                                </Link>
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        </header>
    );
}

export default LandingHeader;
