"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Search, LogOut, Settings, ChevronDown } from "lucide-react";
import { Link, useRouter, usePathname } from "@/i18n/routing";
import { clsx } from 'clsx';
import { useFavorites } from "@/hooks/useFavorites";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations } from 'next-intl';
import { TradingViewTicker } from "@/components/TradingViewTicker";
import { createClient } from "@/lib/supabase/client";

export function LandingHeader() {
    const t = useTranslations();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { favorites } = useFavorites();
    const [searchQuery, setSearchQuery] = useState("");
    const [user, setUser] = useState<any>(null);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // Get current ticker from URL params for cross-page sync
    const currentTicker = searchParams.get('ticker')?.toUpperCase()
        || searchParams.get('t')?.toUpperCase()
        || 'NVDA';

    // Auth state detection
    useEffect(() => {
        const supabase = createClient();

        // Check current session
        supabase.auth.getUser().then(({ data: { user } }) => {
            setUser(user);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Close profile dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        setUser(null);
        setProfileOpen(false);
        router.push('/');
        router.refresh();
    };

    const handleSearch = (e: FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            const ticker = searchQuery.toUpperCase();
            if (pathname?.startsWith('/flow')) {
                router.push(`/flow?ticker=${ticker}`);
            } else {
                router.push(`/ticker?ticker=${ticker}&range=1d`);
            }
        }
    };

    // Get user avatar URL (Google) or generate initials
    const getAvatarUrl = () => user?.user_metadata?.avatar_url || null;
    const getInitials = () => {
        const name = user?.user_metadata?.full_name || user?.email || '';
        if (!name) return '?';
        const parts = name.split(/[\s@]+/);
        return parts[0]?.[0]?.toUpperCase() || '?';
    };

    return (
        <header className="sticky top-0 z-50 w-full bg-[#0a0f1a]/95 backdrop-blur-xl">
            {/* Navigation Row */}
            <div className="w-full flex h-12 items-center px-4 sm:px-6 gap-4">
                {/* 1. LOGO */}
                <Link href="/" className="flex items-center gap-2 group shrink-0">
                    <svg width="24" height="24" viewBox="0 0 48 48" className="text-cyan-400">
                        <path d="M24 4 L42 14 L42 34 L24 44 L6 34 L6 14 Z" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-80" />
                        <circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50" />
                        <circle cx="24" cy="24" r="3" fill="currentColor" className="animate-pulse" />
                        <line x1="24" y1="24" x2="34" y2="14" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span className="text-xl font-black tracking-tight text-white leading-none group-hover:text-cyan-400 transition-colors">
                        SIGNUM<span className="text-cyan-400">HQ</span>
                    </span>
                </Link>

                {/* 2. NAVIGATION + SEARCH (fill middle) */}
                <div className="hidden xl:flex items-center gap-1 flex-1 min-w-0">
                    <nav className="flex items-center gap-1 font-jakarta">
                        {[
                            { label: "DASHBOARD", href: "/dashboard", path: "/dashboard", hasLive: true },
                            { label: "GUARDIAN", href: "/intel-guardian", path: "/intel-guardian", hasLive: false },
                            { label: "COMMAND", href: `/ticker?ticker=${currentTicker}`, path: "/ticker", hasLive: false },
                            { label: "FLOW", href: `/flow?ticker=${currentTicker}`, path: "/flow", hasLive: false },
                            { label: "INTEL", href: "/intel", path: "/intel", hasLive: false },
                            { label: "PORTFOLIO", href: "/portfolio", path: "/portfolio", hasLive: false },
                            { label: "WATCHLIST", href: "/watchlist", path: "/watchlist", hasLive: false },
                            { label: "GUIDE", href: "/how-it-works", path: "/how-it-works", hasLive: false }
                        ].map((item) => {
                            const isActive = item.path
                                ? (item.path === "/intel" ? pathname === "/intel" : pathname?.startsWith(item.path))
                                : false;
                            return (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className={clsx(
                                        "relative px-3.5 py-2 text-[13px] font-bold tracking-wider uppercase rounded-lg transition-all group flex items-center gap-1.5",
                                        isActive ? "text-emerald-400 bg-emerald-950/30 border border-emerald-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    {item.label}
                                    {item.hasLive && (
                                        <span className="flex items-center gap-1">
                                            <span className="relative flex h-1.5 w-1.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                            </span>
                                            <span className="text-[8px] text-emerald-400 font-bold tracking-wider">LIVE</span>
                                        </span>
                                    )}
                                    {isActive && (
                                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Search Bar - right after nav */}
                    <div className="relative group ml-3">
                        <form onSubmit={handleSearch}>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="분석할 Ticker..."
                                className="pl-8 pr-3 h-8 w-36 focus:w-48 
                                    bg-slate-900/60 border border-slate-700/50 rounded-lg 
                                    text-[11px] font-bold text-white placeholder:text-slate-500 
                                    focus:border-cyan-500/70 focus:shadow-[0_0_12px_rgba(34,211,238,0.2)] 
                                    focus:ring-1 focus:ring-cyan-500/30
                                    transition-all duration-300 outline-none uppercase tracking-wider"
                            />
                        </form>
                    </div>
                </div>

                {/* 3. RIGHT SIDE - Profile or Sign In */}
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {/* Profile Avatar Dropdown (logged in) */}
                    {user ? (
                        <div ref={profileRef} className="relative hidden xl:block">
                            <button
                                onClick={() => setProfileOpen(!profileOpen)}
                                className="flex items-center gap-2 px-1.5 py-1 rounded-full hover:bg-white/5 transition-all group"
                            >
                                {getAvatarUrl() ? (
                                    <img
                                        src={getAvatarUrl()!}
                                        alt="Profile"
                                        className="w-8 h-8 rounded-full ring-2 ring-white/10 group-hover:ring-cyan-500/30 transition-all"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-full ring-2 ring-white/10 group-hover:ring-cyan-500/30 
                                        bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 
                                        flex items-center justify-center text-xs font-bold text-white transition-all">
                                        {getInitials()}
                                    </div>
                                )}
                                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Dropdown Menu */}
                            {profileOpen && (
                                <div className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-[#0d1424]/95 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/50 z-50">
                                    {/* User info header */}
                                    <div className="px-4 py-3.5 border-b border-white/5">
                                        <p className="text-sm font-bold text-white truncate">
                                            {user?.user_metadata?.full_name || user?.email}
                                        </p>
                                        {user?.user_metadata?.full_name && (
                                            <p className="text-xs text-slate-400 truncate mt-1">{user?.email}</p>
                                        )}
                                    </div>

                                    {/* Menu items */}
                                    <div className="py-1">
                                        <Link
                                            href="/settings"
                                            onClick={() => setProfileOpen(false)}
                                            className="flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            <Settings className="w-4 h-4 text-slate-400" />
                                            {t('nav.settings')}
                                        </Link>
                                    </div>

                                    {/* Language */}
                                    <div className="py-1 border-t border-white/5">
                                        <div className="px-4 py-2.5">
                                            <LanguageSwitcher />
                                        </div>
                                    </div>

                                    {/* Sign out */}
                                    <div className="py-1 border-t border-white/5">
                                        <button
                                            onClick={handleSignOut}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-[13px] font-medium text-rose-400/80 hover:text-rose-400 hover:bg-rose-950/20 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            {t('nav.signOut')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="hidden xl:flex items-center gap-1.5 px-5 py-1.5 
                                text-[11px] font-bold text-cyan-400 
                                border border-cyan-500/40 rounded-lg
                                bg-transparent
                                hover:border-cyan-400/70 hover:shadow-[0_0_15px_rgba(34,211,238,0.15)]
                                transition-all duration-300 uppercase tracking-wider"
                        >
                            {t('nav.signIn')}
                        </Link>
                    )}

                    {/* [Mobile Menu Toggle] */}
                    <div className="xl:hidden flex items-center">
                        <details className="group relative">
                            <summary className="list-none cursor-pointer p-2 text-slate-400 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                            </summary>
                            <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 p-2 space-y-1">
                                {[
                                    { label: "DASHBOARD", href: "/dashboard" },
                                    { label: "GUARDIAN", href: "/intel-guardian" },
                                    { label: "COMMAND", href: `/ticker?ticker=${currentTicker}` },
                                    { label: "FLOW", href: `/flow?ticker=${currentTicker}` },
                                    { label: "INTEL", href: "/intel" },
                                    { label: "PORTFOLIO", href: "/portfolio" },
                                    { label: "WATCHLIST", href: "/watchlist" },
                                    { label: "GUIDE", href: "/how-it-works" }
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
                                {user ? (
                                    <>
                                        <Link
                                            href="/settings"
                                            className="block px-4 py-3 text-xs font-black text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors uppercase tracking-widest"
                                        >
                                            {t('nav.settings')}
                                        </Link>
                                        <button
                                            onClick={handleSignOut}
                                            className="w-full text-left block px-4 py-3 text-xs font-black text-rose-400 hover:bg-rose-950/30 rounded-lg uppercase tracking-widest"
                                        >
                                            {t('nav.signOut')}
                                        </button>
                                    </>
                                ) : (
                                    <Link href="/login" className="block px-4 py-3 text-xs font-black text-emerald-400 hover:bg-emerald-950/30 rounded-lg uppercase tracking-widest">
                                        {t('nav.signIn')}
                                    </Link>
                                )}
                            </div>
                        </details>
                    </div>
                </div>
            </div>
            {/* Global Market Ticker */}
            <TradingViewTicker />
        </header>
    );
}

export default LandingHeader;
