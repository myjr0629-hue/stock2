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
        href: '/dashboard',
        icon: (active: boolean) => (
            <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5}>
                {active ? (
                    <path d="M12 2.1L1 12h3v9h6v-6h4v6h6v-9h3L12 2.1z" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                )}
            </svg>
        ),
        matchPath: '/dashboard',
    },
    {
        label: 'COMMAND',
        href: '/ticker',
        icon: (active: boolean) => (
            <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5}>
                {active ? (
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
                )}
            </svg>
        ),
        matchPath: '/ticker',
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
        matchPath: '/intel-guardian',
    },
    {
        label: 'FLOW',
        href: '/flow',
        icon: (active: boolean) => (
            <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5}>
                {active ? (
                    <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
                )}
            </svg>
        ),
        matchPath: '/flow',
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
        matchPath: '/intel',
        matchExact: true,
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
                            ? pathname === item.matchPath
                            : item.matchPath
                                ? pathname?.startsWith(item.matchPath)
                                : false;
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
