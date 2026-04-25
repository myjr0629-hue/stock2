"use client";

// ============================================================================
// GuardianClient — Mobile/Desktop Bifurcation Layer
// Pattern: Identical to TickerPageClient.tsx (Command page)
// Mobile → MobileGuardianPage (4-tab native experience)
// Desktop → GuardianDesktop (original 1134-line page, ZERO changes)
// ============================================================================

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const GuardianDesktop = dynamic(
    () => import('./GuardianDesktop'),
    { ssr: false }
);

const MobileGuardianPage = dynamic(
    () => import('@/components/guardian/mobile/MobileGuardianPage'),
    { ssr: false }
);

export default function GuardianClient() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    if (isMobile) {
        return <MobileGuardianPage />;
    }

    return <GuardianDesktop />;
}
