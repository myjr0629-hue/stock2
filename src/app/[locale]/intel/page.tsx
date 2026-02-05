
import React from 'react';
import { getLatestReport, getGlobalLatestReport } from '@/services/reportScheduler';
import { LandingHeader } from '@/components/landing/LandingHeader';
import IntelClientPage from './IntelClientPage';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ locale: string }>;
}

export default async function IntelPage({ params }: PageProps) {
    const { locale } = await params;
    // 1. Fetch Latest Report (Server Side for Speed/SEO/Reliability)
    // [VNext] Use global resolver to find the strictly latest report by timestamp
    const report = await getGlobalLatestReport();

    return (
        <div className="flex flex-col min-h-screen bg-[#05090f]">
            {/* 1. TOP NAVIGATION (Restored by User Request) */}
            <LandingHeader />

            {/* 2. TACTICAL CLIENT CONTENT (Sidebar + Dashboard) */}
            {/* We pass the initial report to hydrate the client state immediately */}
            <div className="flex-1 relative">
                <IntelClientPage initialReport={report} locale={locale} />
            </div>
        </div>
    );
}
