'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useRouter } from '@/i18n/routing';
import { Search, User, LogOut, Settings, BookOpen, CreditCard } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { clsx } from 'clsx';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

/**
 * MobileHeader — Exclusive Mobile Native Slim Header
 * Rendered ONLY via Server-Side detection. Contains no CSS responsive hacks.
 * State-of-the-Art iOS App styling.
 */

export function MobileHeader() {
    const t = useTranslations();
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [mounted, setMounted] = useState(false);
    
    // Sheet states
    const [sheetOpen, setSheetOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        setMounted(true);
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });
        
        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Prevent body scroll when sheet is open
    useEffect(() => {
        if (sheetOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [sheetOpen]);

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        setUser(null);
        setSheetOpen(false);
        router.push('/');
        router.refresh();
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            setIsSearchOpen(false);
            router.push(`/dashboard?ticker=${searchQuery.toUpperCase()}`);
            setSearchQuery("");
        }
    };

    const getAvatarUrl = () => user?.user_metadata?.avatar_url || null;
    const getInitials = () => {
        const name = user?.user_metadata?.full_name || user?.email || '';
        if (!name) return '?';
        return name.split(/[\s@]+/)[0]?.[0]?.toUpperCase() || '?';
    };

    // User Profile Action Sheet (iOS Style Bottom Sheet)
    const renderActionSheet = () => {
        if (!mounted || !sheetOpen) return null;
        
        return createPortal(
            <div className="fixed inset-0 z-[9999]" style={{ isolation: 'isolate' }}>
                {/* Backdrop */}
                <div 
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={() => setSheetOpen(false)}
                    style={{ animation: 'fadeIn 0.2s ease-out' }}
                />
                
                {/* Sheet */}
                <div 
                    className="absolute bottom-0 left-0 right-0 bg-[#0d1424] rounded-t-3xl border-t border-white/10 shadow-2xl safe-bottom max-h-[85vh] overflow-y-auto"
                    style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
                >
                    <div className="w-full flex justify-center pt-3 pb-2">
                        <div className="w-10 h-1.5 rounded-full bg-white/20" />
                    </div>
                    
                    <div className="px-5 py-4">
                        {user ? (
                            <>
                                <div className="flex items-center gap-4 py-4 border-b border-white/10 mb-2">
                                    {getAvatarUrl() ? (
                                        <img src={getAvatarUrl()!} alt="Profile" className="w-14 h-14 rounded-full ring-2 ring-cyan-500/20" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-14 h-14 rounded-full ring-2 ring-cyan-500/20 bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 flex items-center justify-center text-xl font-bold text-white">
                                            {getInitials()}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-bold text-white truncate">{user.user_metadata?.full_name || user.email}</h3>
                                        {user.user_metadata?.full_name && <p className="text-sm text-slate-400 truncate">{user.email}</p>}
                                    </div>
                                </div>
                                <div className="py-2 space-y-2">
                                    <Link href="/settings" onClick={() => setSheetOpen(false)} className="flex items-center gap-4 px-4 py-3.5 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition-colors">
                                        <Settings className="w-5 h-5 text-slate-400" />
                                        <span className="text-sm font-bold text-slate-200">{t('nav.settings')}</span>
                                    </Link>
                                    <div className="px-4 py-2">
                                        <LanguageSwitcher />
                                    </div>
                                    <button onClick={handleSignOut} className="w-full flex items-center gap-4 px-4 py-3.5 mt-2 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition-colors">
                                        <LogOut className="w-5 h-5 text-rose-400" />
                                        <span className="text-sm font-bold text-rose-400">{t('nav.signOut')}</span>
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="py-6 flex flex-col items-center justify-center gap-6">
                                <div className="w-16 h-16 rounded-full bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center">
                                    <User className="w-8 h-8 text-cyan-400" />
                                </div>
                                <div className="text-center">
                                    <h3 className="text-lg font-bold text-white mb-2">SIGNUM HQ 프로필</h3>
                                    <p className="text-sm text-slate-400 mb-6">로그인하고 모든 시그널을 잠금 해제하세요</p>
                                </div>
                                <Link href="/login" onClick={() => setSheetOpen(false)} className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold text-base rounded-xl text-center transition-colors">
                                    {t('nav.signIn')}
                                </Link>
                                <div className="w-full mt-2">
                                     <LanguageSwitcher />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-50 bg-[#050a14]/95 backdrop-blur-2xl transform translate-z-0 mobile-header-native">
                <div className="relative flex items-center justify-between h-14 px-5">
                    
                    {/* Search Expansion View */}
                    <div className={clsx(
                        "absolute inset-0 px-4 flex items-center bg-[#050a14] z-10 transition-transform duration-300 transform",
                        isSearchOpen ? "translate-y-0" : "-translate-y-full opacity-0 pointer-events-none"
                    )}>
                        <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="티커 검색 (예: NVDA)"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                                    autoFocus={isSearchOpen}
                                />
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setIsSearchOpen(false)}
                                className="px-2 text-sm font-medium text-slate-400 active:text-white tap-highlight-transparent"
                            >
                                취소
                            </button>
                        </form>
                    </div>

                    {/* Native App Style Logo - Just Symbol & Text */}
                    <Link href="/" className={clsx("flex items-center gap-2 tap-highlight-transparent transition-opacity", isSearchOpen && "opacity-0")}>
                        <img src="/signum-sg-vectorized.svg" alt="SIGNUM" className="w-[26px] h-[26px]" />
                        <span className="text-[19px] font-black tracking-tight text-white leading-none">
                            SIGNUM<span className="text-cyan-400">HQ</span>
                        </span>
                    </Link>

                    {/* Right Action Buttons */}
                    <div className={clsx("flex items-center gap-2 transition-opacity", isSearchOpen && "opacity-0")}>
                        <Link
                            href="/how-it-works"
                            className="w-8 h-8 inline-flex items-center justify-center text-slate-400 active:text-cyan-400 transition-all tap-highlight-transparent"
                            aria-label="Guide"
                        >
                            <BookOpen className="w-[18px] h-[18px]" style={{ filter: 'drop-shadow(0 0 3px rgba(148,163,184,0.15))' }} />
                        </Link>
                        <Link
                            href="/pricing"
                            className="w-8 h-8 inline-flex items-center justify-center text-slate-400 active:text-amber-400 transition-all tap-highlight-transparent"
                            aria-label="Pricing"
                        >
                            <CreditCard className="w-[18px] h-[18px]" style={{ filter: 'drop-shadow(0 0 3px rgba(148,163,184,0.15))' }} />
                        </Link>
                        <button
                            onClick={() => setIsSearchOpen(true)}
                            className="w-8 h-8 inline-flex items-center justify-center text-slate-400 active:text-white transition-all tap-highlight-transparent"
                        >
                            <Search className="w-[18px] h-[18px]" style={{ filter: 'drop-shadow(0 0 3px rgba(148,163,184,0.15))' }} />
                        </button>
                        
                        <button 
                            onClick={() => setSheetOpen(true)}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-full tap-highlight-transparent active:scale-95 transition-transform"
                        >
                            {getAvatarUrl() ? (
                                <img src={getAvatarUrl()!} alt="Profile" className="w-7 h-7 rounded-full ring-2 ring-cyan-500/20" referrerPolicy="no-referrer" />
                            ) : (
                                <div className="w-7 h-7 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                                    <User className="w-3.5 h-3.5 text-slate-300" />
                                </div>
                            )}
                        </button>
                    </div>
                </div>
            </header>
            
            {/* Spacer for fixed header */}
            <div className="h-14" />
            
            {renderActionSheet()}
        </>
    );
}
