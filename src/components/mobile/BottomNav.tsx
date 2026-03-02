'use client';

import React from 'react';
import { usePathname } from '@/i18n/routing';
import { Link } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';

/**
 * BottomNav — Mobile-only bottom tab bar (hidden on md: and above)
 * Provides app-like navigation for the 5 most important pages.
 * Uses CSS-only hiding — zero desktop rendering cost.
 */

const NAV_ITEMS = [
    {
        label: 'HOME',
        href: '/',
        icon: (active: boolean) => (
            <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5}>
                {active ? (
                    <path d="M12 2.1L1 12h3v9h6v-6h4v6h6v-9h3L12 2.1z" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                )}
            </svg>
        ),
        matchExact: true,
    },
    {
        label: 'GUARDIAN',
        href: '/intel-guardian',
        icon: (active: boolean) => (
            <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5}>
                {active ? (
                    <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                )}
            </svg>
        ),
    },
    {
        label: 'INTEL',
        href: '/intel',
        icon: (active: boolean) => (
            <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5}>
                {active ? (
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                )}
            </svg>
        ),
    },
    {
        label: 'WATCHLIST',
        href: '/watchlist',
        icon: (active: boolean) => (
            <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5}>
                {active ? (
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                )}
            </svg>
        ),
    },
    {
        label: 'MORE',
        href: '/dashboard',
        icon: (active: boolean) => (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
        ),
    },
];

export function BottomNav() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    return (
        <>
            {/* Spacer to prevent content from being hidden behind bottom nav on mobile */}
            <div className="h-16 md:hidden" />

            {/* Bottom Navigation — MOBILE ONLY (md: hidden) */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#0a0f1a]/95 backdrop-blur-xl border-t border-white/10 safe-bottom"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                <div className="flex items-center justify-around h-16 px-1">
                    {NAV_ITEMS.map((item) => {
                        const isActive = item.matchExact
                            ? pathname === item.href || pathname === '/'
                            : pathname?.startsWith(item.href);
                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={clsx(
                                    "flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 transition-colors",
                                    isActive
                                        ? "text-cyan-400"
                                        : "text-slate-500 active:text-slate-300"
                                )}
                            >
                                {item.icon(!!isActive)}
                                <span className={clsx(
                                    "text-[9px] font-bold tracking-wider uppercase",
                                    isActive ? "text-cyan-400" : "text-slate-500"
                                )}>
                                    {item.label}
                                </span>
                                {isActive && (
                                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                                )}
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </>
    );
}
