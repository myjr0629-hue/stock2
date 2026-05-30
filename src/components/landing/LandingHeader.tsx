"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Search, LogOut, Settings, ChevronDown, LayoutDashboard, Shield, Crosshair, Waves, Radar, Briefcase, Star, BookOpen, CreditCard } from "lucide-react";
import { Link, useRouter, usePathname } from "@/i18n/routing";
import { clsx } from 'clsx';
import { useFavorites } from "@/hooks/useFavorites";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations, useLocale } from 'next-intl';
import { createClient } from "@/lib/supabase/client";

export function LandingHeader() {
    const t = useTranslations();
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { favorites } = useFavorites();
    const [searchQuery, setSearchQuery] = useState("");
    const [user, setUser] = useState<any>(null);
    const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
    const isAdminUser = user ? ADMIN_EMAILS.includes((user.email || '').toLowerCase()) : false;
    const [profileOpen, setProfileOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
    const mobileSearchRef = useRef<HTMLInputElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const currentTicker = mounted
        ? (searchParams.get('ticker')?.toUpperCase()
            || searchParams.get('t')?.toUpperCase()
            || 'NVDA')
        : 'NVDA';

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => { setUser(user); });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Lock body scroll when mobile menu is open
    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [mobileMenuOpen]);

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
            if (!pathname?.startsWith('/flow')) {
                fetch(`/api/command/unified?t=${ticker}&lang=${locale}`, { priority: 'low' } as any).catch(() => {});
            }
            if (pathname?.startsWith('/flow')) {
                router.push(`/flow?ticker=${ticker}`);
            } else {
                router.push(`/ticker?ticker=${ticker}&range=1d`);
            }
        }
    };

    const getAvatarUrl = () => user?.user_metadata?.avatar_url || null;
    const getInitials = () => {
        const name = user?.user_metadata?.full_name || user?.email || '';
        if (!name) return '?';
        const parts = name.split(/[\s@]+/);
        return parts[0]?.[0]?.toUpperCase() || '?';
    };

    // ── Mobile Drawer (portal to document.body — escapes all stacking contexts) ──
    const mobileDrawer = mobileMenuOpen && mounted ? createPortal(
        <div className="fixed inset-0 z-[9999] xl:hidden" style={{ isolation: 'isolate' }}>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-md"
                onClick={() => setMobileMenuOpen(false)}
                style={{ animation: 'fadeIn 0.2s ease-out' }}
            />
            {/* Drawer panel */}
            <div className="absolute right-0 top-0 bottom-0 w-[85%] max-w-[360px] bg-[#0a0f1a] border-l border-white/10 shadow-2xl overflow-y-auto"
                style={{ animation: 'slideInRight 0.25s ease-out' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <span className="text-lg font-black text-white tracking-tight">
                        SIGNUM<span className="text-cyan-400">HQ</span>
                    </span>
                    <button onClick={() => setMobileMenuOpen(false)}
                        className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="px-5 pb-4">
                    <form onSubmit={(e) => { handleSearch(e); setMobileMenuOpen(false); }}>
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input ref={mobileSearchRef} type="text" value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('landing.searchPlaceholder')}
                                className="w-full pl-10 pr-4 h-11 bg-white/[0.05] border border-white/10 rounded-xl
                                    text-sm font-bold text-white placeholder:text-slate-500
                                    focus:border-cyan-500/50 focus:shadow-[0_0_12px_rgba(34,211,238,0.15)]
                                    transition-all outline-none uppercase tracking-wider" />
                        </div>
                    </form>
                </div>

                {user && (
                    <Link href="/settings" onClick={() => setMobileMenuOpen(false)}
                        className="block mx-5 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 active:bg-white/[0.08] transition-all cursor-pointer">
                        <div className="flex items-center gap-3">
                            {getAvatarUrl() ? (
                                <img src={getAvatarUrl()!} alt="Profile"
                                    className="w-10 h-10 rounded-full ring-2 ring-cyan-500/20"
                                    referrerPolicy="no-referrer" />
                            ) : (
                                <div className="w-10 h-10 rounded-full ring-2 ring-cyan-500/20 bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 flex items-center justify-center text-sm font-bold text-white">
                                    {getInitials()}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-white truncate">
                                    {user?.user_metadata?.full_name || user?.email}
                                </p>
                                {user?.user_metadata?.full_name && (
                                    <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                                )}
                            </div>
                            <Settings className="w-4 h-4 text-slate-500 shrink-0" />
                        </div>
                    </Link>
                )}

                {/* Navigation */}
                <nav className="px-3 space-y-0.5" suppressHydrationWarning>
                    {[
                        { label: "DASHBOARD", href: "/dashboard", icon: LayoutDashboard },
                        { label: "GUARDIAN", href: "/intel-guardian", icon: Shield },
                        { label: "COMMAND", href: `/ticker?ticker=${currentTicker}`, icon: Crosshair },
                        { label: "FLOW", href: `/flow?ticker=${currentTicker}`, icon: Waves },
                        ...(isAdminUser ? [{ label: "QUANT RADAR", href: "/quant-radar", icon: Radar }] : []),
                        { label: "INTEL", href: "/intel", icon: Radar },
                        { label: "PORTFOLIO", href: "/portfolio", icon: Briefcase },
                        { label: "WATCHLIST", href: "/watchlist", icon: Star },
                        { label: "GUIDE", href: "/how-it-works", icon: BookOpen },
                        { label: "PRICING", href: "/pricing", icon: CreditCard },
                    ].map((item) => {
                        const isActive = item.href === "/intel"
                            ? pathname === "/intel"
                            : pathname?.startsWith(item.href.split('?')[0]);
                        return (
                            <Link key={item.label} href={item.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className={clsx(
                                    "flex items-center gap-3.5 px-4 py-3.5 rounded-xl transition-all text-[13px] font-bold tracking-widest uppercase",
                                    isActive
                                        ? "text-emerald-400 bg-emerald-950/30 border border-emerald-500/20"
                                        : "text-slate-300 hover:text-white hover:bg-white/5"
                                )}>
                                <item.icon className={clsx("w-[18px] h-[18px] shrink-0", isActive ? "text-emerald-400" : "text-slate-500")} />
                                {item.label}
                                {isActive && (
                                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Language + Auth */}
                <div className="mt-6 mx-3 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-1 px-4 py-3 font-jakarta">
                        {([
                            { code: 'en', label: 'English' },
                            { code: 'ja', label: '日本語' },
                            { code: 'ko', label: '한국어' },
                        ] as const).map((loc) => {
                            const isActiveLang = locale === loc.code;
                            return (
                                <button key={loc.code}
                                    onClick={() => {
                                        const queryString = searchParams.toString();
                                        const newPath = queryString ? `${pathname}?${queryString}` : pathname;
                                        router.replace(newPath, { locale: loc.code });
                                        setMobileMenuOpen(false);
                                    }}
                                    className={clsx(
                                        "flex-1 py-2.5 text-xs font-bold rounded-lg transition-all text-center",
                                        isActiveLang
                                            ? "text-cyan-400 bg-cyan-950/30 border border-cyan-500/20"
                                            : "text-slate-400 hover:text-white hover:bg-white/5"
                                    )}>
                                    {loc.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="px-1 py-2">
                        {user ? (
                            <>
                                <Link href="/settings" onClick={() => setMobileMenuOpen(false)}
                                    className="flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
                                    <Settings className="w-4 h-4" />
                                    {t('nav.settings')}
                                </Link>
                                <button onClick={() => { handleSignOut(); setMobileMenuOpen(false); }}
                                    className="flex items-center gap-3 w-full px-4 py-3.5 text-sm font-bold text-rose-400/80 hover:text-rose-400 hover:bg-rose-950/20 rounded-xl transition-colors">
                                    <LogOut className="w-4 h-4" />
                                    {t('nav.signOut')}
                                </button>
                            </>
                        ) : (
                            <Link href="/login" onClick={() => setMobileMenuOpen(false)}
                                className="flex items-center justify-center gap-2 w-full px-4 py-3.5 text-sm font-bold text-cyan-400 border border-cyan-500/40 rounded-xl hover:border-cyan-400/70 hover:shadow-[0_0_15px_rgba(34,211,238,0.15)] transition-all">
                                {t('nav.signIn')}
                            </Link>
                        )}
                    </div>
                </div>
                <div className="h-8" />
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
        <header className="w-full bg-[#0a0f1a]/95 backdrop-blur-xl relative z-[60]">
            <div className="w-full flex h-12 items-center px-4 sm:px-6 gap-4">
                {/* LOGO */}
                <Link href="/" className="flex items-center gap-2 group shrink-0">
                    <img src="/signum-sg-vectorized.svg" alt="SIGNUM HQ" width="28" height="28" className="shrink-0" />
                    <span className="text-xl font-black tracking-tight text-white leading-none group-hover:text-cyan-400 transition-colors">
                        SIGNUM<span className="text-cyan-400">HQ</span>
                    </span>
                </Link>

                {/* Desktop Nav */}
                <div className="hidden xl:flex items-center gap-1 flex-1 min-w-0">
                    <nav className="flex items-center gap-1.5 font-jakarta" suppressHydrationWarning>
                        {[
                            { label: "DASHBOARD", href: "/dashboard", path: "/dashboard" },
                            { label: "GUARDIAN", href: "/intel-guardian", path: "/intel-guardian" },
                            { label: "COMMAND", href: `/ticker?ticker=${currentTicker}`, path: "/ticker" },
                            { label: "FLOW", href: `/flow?ticker=${currentTicker}`, path: "/flow" },
                            ...(isAdminUser ? [{ label: "RADAR", href: "/quant-radar", path: "/quant-radar" }] : []),
                            { label: "INTEL", href: "/intel", path: "/intel" },
                            { label: "PORTFOLIO", href: "/portfolio", path: "/portfolio" },
                            { label: "WATCHLIST", href: "/watchlist", path: "/watchlist" },
                            { label: "GUIDE", href: "/how-it-works", path: "/how-it-works" },
                            { label: "PRICING", href: "/pricing", path: "/pricing" }
                        ].map((item) => {
                            const isActive = item.path === "/intel" 
                                ? pathname === "/intel" 
                                : item.path === "/quant-radar"
                                ? pathname === "/quant-radar"
                                : pathname?.startsWith(item.path);
                            return (
                                <Link suppressHydrationWarning key={item.label} href={item.href}
                                    className={clsx(
                                        "relative px-3.5 py-2 text-[13px] font-bold tracking-wider uppercase rounded-lg transition-colors group flex items-center gap-1.5",
                                        isActive ? "text-emerald-400 bg-emerald-950/30 border border-emerald-500/20" : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                                    )}>
                                    {item.label}
                                    {isActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />}
                                </Link>
                            );
                        })}
                    </nav>
                    <div className="relative group ml-3">
                        <form onSubmit={handleSearch}>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('landing.searchPlaceholder')}
                                className="pl-8 pr-3 h-8 w-36 focus:w-48 bg-slate-900/60 border border-slate-700/50 rounded-lg text-[11px] font-bold text-white placeholder:text-slate-500 focus:border-cyan-500/70 focus:shadow-[0_0_12px_rgba(34,211,238,0.2)] focus:ring-1 focus:ring-cyan-500/30 transition-all duration-300 outline-none uppercase tracking-wider" />
                        </form>
                    </div>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {user ? (
                        <div ref={profileRef} className="relative hidden xl:block">
                            <button onClick={() => setProfileOpen(!profileOpen)}
                                className="flex items-center gap-2 px-1.5 py-1 rounded-full hover:bg-white/5 transition-all group">
                                {getAvatarUrl() ? (
                                    <img src={getAvatarUrl()!} alt="Profile"
                                        className="w-8 h-8 rounded-full ring-2 ring-white/10 group-hover:ring-cyan-500/30 transition-all"
                                        referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full ring-2 ring-white/10 group-hover:ring-cyan-500/30 bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 flex items-center justify-center text-xs font-bold text-white transition-all">
                                        {getInitials()}
                                    </div>
                                )}
                                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {profileOpen && (
                                <div className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-[#0d1424]/95 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/50 z-50">
                                    <div className="px-4 py-3.5 border-b border-white/5">
                                        <p className="text-sm font-bold text-white truncate">{user?.user_metadata?.full_name || user?.email}</p>
                                        {user?.user_metadata?.full_name && <p className="text-xs text-slate-400 truncate mt-1">{user?.email}</p>}
                                    </div>
                                    <div className="py-1">
                                        <Link href="/settings" onClick={() => setProfileOpen(false)}
                                            className="flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors">
                                            <Settings className="w-4 h-4 text-slate-400" />
                                            {t('nav.settings')}
                                        </Link>
                                    </div>
                                    <div className="py-1 border-t border-white/5">
                                        <div className="px-4 py-2.5"><LanguageSwitcher /></div>
                                    </div>
                                    <div className="py-1 border-t border-white/5">
                                        <button onClick={handleSignOut}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-[13px] font-medium text-rose-400/80 hover:text-rose-400 hover:bg-rose-950/20 transition-colors">
                                            <LogOut className="w-4 h-4" />
                                            {t('nav.signOut')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="hidden xl:flex items-center gap-0.5 font-jakarta">
                                {([
                                    { code: 'en', label: 'EN' },
                                    { code: 'ja', label: 'JA' },
                                    { code: 'ko', label: 'KO' },
                                ] as const).map((loc, idx) => {
                                    const isActive = locale === loc.code;
                                    return (
                                        <span key={loc.code} className="flex items-center">
                                            {idx > 0 && <span className="text-slate-600 text-[11px] mx-0.5">|</span>}
                                            <button onClick={() => {
                                                const qs = searchParams.toString();
                                                router.replace(qs ? `${pathname}?${qs}` : pathname, { locale: loc.code });
                                            }}
                                                className={`text-[11px] font-bold tracking-wider px-1 py-0.5 rounded transition-all ${isActive ? 'text-cyan-400' : 'text-slate-400 hover:text-white'}`}>
                                                {loc.label}
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                            <Link href="/login"
                                className="hidden xl:flex items-center gap-1.5 px-5 py-1.5 text-[11px] font-bold text-cyan-400 border border-cyan-500/40 rounded-lg bg-transparent hover:border-cyan-400/70 hover:shadow-[0_0_15px_rgba(34,211,238,0.15)] transition-all duration-300 uppercase tracking-wider">
                                {t('nav.signIn')}
                            </Link>
                        </>
                    )}

                    {/* Mobile toggle */}
                    <div className="xl:hidden flex items-center gap-2">
                        <button onClick={() => { setMobileMenuOpen(true); setTimeout(() => mobileSearchRef.current?.focus(), 300); }}
                            className="p-2.5 text-slate-400 hover:text-white transition-colors" aria-label="Search">
                            <Search className="w-5 h-5" />
                        </button>
                        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="p-2.5 text-slate-400 hover:text-white transition-colors" aria-label="Menu">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </header>
        {mobileDrawer}
        </>
    );
}

export default LandingHeader;
