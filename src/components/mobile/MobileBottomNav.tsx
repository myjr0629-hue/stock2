'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { usePathname, Link } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { LayoutDashboard, Crosshair, Shield, Waves, Radar, Star, Briefcase } from 'lucide-react';

/**
 * MobileBottomNav — Exclusive Mobile Native Bottom Tab Bar
 * Rendered ONLY via Server-Side detection. Contains no CSS responsive hacks.
 * [FIX] Dynamic ticker propagation: Command→Flow ticker continuity
 */

import { useTier } from '@/contexts/TierContext';

export function MobileBottomNav() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { isAdmin } = useTier();

    // [FIX] Extract current ticker from URL for cross-page continuity
    // Command: /ticker?ticker=NVDA, Flow: /flow?ticker=NVDA
    const currentTicker = searchParams.get('ticker') || searchParams.get('t') || null;

    const NAV_ITEMS = useMemo(() => [
        {
            label: 'DASHBOARD',
            href: '/dashboard',
            icon: LayoutDashboard,
            matchPath: '/dashboard',
        },
        {
            label: 'GUARDIAN',
            href: '/intel-guardian',
            icon: Shield,
            matchPath: '/intel-guardian',
        },
        {
            label: 'COMMAND',
            href: currentTicker ? `/ticker?ticker=${currentTicker}` : '/ticker?ticker=NVDA',
            icon: Crosshair,
            matchPath: '/ticker',
        },
        {
            label: 'FLOW',
            href: currentTicker ? `/flow?ticker=${currentTicker}` : '/flow',
            icon: Waves,
            matchPath: '/flow',
        },
        {
            label: 'INTEL',
            href: '/intel',
            icon: Radar,
            matchPath: '/intel',
            matchExact: true,
        },
        ...(isAdmin ? [{
            label: 'RADAR',
            href: '/quant-radar',
            icon: Radar,
            matchPath: '/quant-radar',
        }] : []),
        {
            label: 'WATCHLIST',
            href: '/watchlist',
            icon: Star,
            matchPath: '/watchlist',
        },
        {
            label: 'PORTFOLIO',
            href: '/portfolio',
            icon: Briefcase,
            matchPath: '/portfolio',
        },
    ], [currentTicker, isAdmin]);
    // Defer active state to client to avoid SSR hydration mismatch
    const [activePath, setActivePath] = useState<string | null>(null);
    useEffect(() => {
        setActivePath(pathname);
    }, [pathname]);

    if (pathname.includes('/app-view')) return null;

    return (
        <>
            {/* Native spacer to prevent content overlap */}
            <div className="h-[68px]" />

            <nav 
                className="fixed bottom-0 left-0 right-0 z-[100] bg-[#0a0f1a]/85 backdrop-blur-[24px] border-t border-white/[0.08] native-bottom-nav"
                style={{
                    paddingBottom: 'env(safe-area-inset-bottom, 16px)',
                    transform: 'translateZ(0)',
                }}
                suppressHydrationWarning
            >
                <div className="flex items-center h-[56px] px-2 gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }} suppressHydrationWarning>
                    {NAV_ITEMS.map((item) => {
                        const isActive = activePath == null ? false
                            : item.matchExact
                                ? activePath === item.matchPath
                                : item.matchPath
                                    ? activePath?.startsWith(item.matchPath)
                                    : false;
                                
                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={clsx(
                                    "relative flex flex-col items-center justify-center min-w-[76px] shrink-0 h-full gap-1 transition-all duration-200 tap-highlight-transparent native-tab-item",
                                    isActive ? "text-cyan-400" : "text-slate-500 hover:text-slate-300"
                                )}
                            >
                                {/* Indicator Glow for Active State */}
                                {isActive && (
                                    <>
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                                        <div className="native-tab-active-dot absolute bottom-1 left-1/2 -translate-x-1/2 hidden" />
                                    </>
                                )}
                                
                                <item.icon 
                                    className={clsx(
                                        "w-[22px] h-[22px] transition-transform duration-200",
                                        isActive ? "scale-105" : "scale-100"
                                    )} 
                                    strokeWidth={isActive ? 2.5 : 1.5} 
                                />
                                
                                <span className={clsx(
                                    "text-[9px] font-bold tracking-wider",
                                    isActive ? "text-cyan-400" : "text-slate-500 font-medium"
                                )}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </>
    );
}
