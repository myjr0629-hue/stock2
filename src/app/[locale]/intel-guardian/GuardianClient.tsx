"use client";

// ============================================================================
// GuardianClient — Mobile/Desktop Bifurcation Layer
// Pattern: Identical to TickerPageClient.tsx (Command page)
// Mobile → MobileGuardianPage (4-tab native experience)
// Desktop → GuardianDesktop (original 1134-line page, ZERO changes)
//
// [FIX] loading fallback added to dynamic() to prevent blank flash on refresh.
// Without it, ssr:false renders nothing until JS bundle loads → white flash.
// ============================================================================

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Inline skeleton — matches loading.tsx structure, avoids blank flash
function GuardianSkeleton() {
    return (
        <div className="min-h-screen bg-[#050505] text-white">
            {/* Oracle Header Skeleton */}
            <div className="h-20 bg-slate-800/30 animate-pulse" />

            {/* Main Grid Skeleton */}
            <main className="pb-4 px-4 max-w-[1920px] mx-auto flex flex-col gap-4 mt-4">
                {/* Top Row: 3 panels */}
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 lg:col-span-4 h-56 bg-slate-800/20 rounded-lg animate-pulse" />
                    <div className="col-span-12 lg:col-span-4 h-56 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '100ms' }} />
                    <div className="col-span-12 lg:col-span-4 h-56 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '200ms' }} />
                </div>

                {/* Bottom Row: Map + Intel */}
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 lg:col-span-8 h-[500px] bg-slate-800/15 rounded-lg animate-pulse" />
                    <div className="col-span-12 lg:col-span-4 space-y-4">
                        <div className="h-32 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '150ms' }} />
                        <div className="h-48 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '250ms' }} />
                        <div className="flex-1 h-48 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '350ms' }} />
                    </div>
                </div>
            </main>
        </div>
    );
}

// Mobile skeleton — compact single-column layout
function MobileGuardianSkeleton() {
    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <div className="h-14 bg-slate-800/30 animate-pulse" />
            <div className="px-3 pt-3 space-y-3">
                <div className="h-44 bg-slate-800/20 rounded-lg animate-pulse" />
                <div className="h-44 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '100ms' }} />
                <div className="h-64 bg-slate-800/15 rounded-lg animate-pulse" style={{ animationDelay: '200ms' }} />
            </div>
        </div>
    );
}

const GuardianDesktop = dynamic(
    () => import('./GuardianDesktop'),
    { ssr: false, loading: () => <GuardianSkeleton /> }
);

const MobileGuardianPage = dynamic(
    () => import('@/components/guardian/mobile/MobileGuardianPage'),
    { ssr: false, loading: () => <MobileGuardianSkeleton /> }
);

export default function GuardianClient() {
    // null = not yet determined (SSR/initial), false = desktop, true = mobile
    const [isMobile, setIsMobile] = useState<boolean | null>(null);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Before client hydration: show desktop skeleton (matches SSR output)
    if (isMobile === null) {
        return <GuardianSkeleton />;
    }

    if (isMobile) {
        return <MobileGuardianPage />;
    }

    return <GuardianDesktop />;
}
