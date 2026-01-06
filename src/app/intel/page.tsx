
import React from 'react';
import { getLatestReport } from '@/services/reportScheduler';
import { LandingHeader } from '@/components/landing/LandingHeader';
import IntelClientPage from './IntelClientPage';

export const dynamic = 'force-dynamic';

export default async function IntelPage() {
    // 1. Fetch Latest Report (Server Side for Speed/SEO/Reliability)
    // We try 'final' first, then 'pre' or 'eod' if looking back.
    const report = await getLatestReport('final') || await getLatestReport('pre') || await getLatestReport('eod');

    return (
        <div className="flex flex-col min-h-screen bg-[#05090f]">
            {/* 1. TOP NAVIGATION (Restored by User Request) */}
            <LandingHeader />

            {/* 2. TACTICAL CLIENT CONTENT (Sidebar + Dashboard) */}
            {/* We pass the initial report to hydrate the client state immediately */}
            <div className="flex-1 relative">
                <IntelClientPage initialReport={report} />
            </div>
        </div>
    );
}
