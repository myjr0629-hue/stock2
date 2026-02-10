
import React, { Suspense } from 'react';
import { LandingHeader } from '@/components/landing/LandingHeader';
import IntelClientPage from './IntelClientPage';

interface PageProps {
    params: Promise<{ locale: string }>;
}

// [PERF] SSR prefetch — load report on server, slim down payload for fast initial render
async function prefetchReport() {
    try {
        const { getGlobalLatestReport } = await import('@/services/reportScheduler');
        const report = await getGlobalLatestReport();
        if (!report) return null;

        // Slim down: keep structure but strip heavy evidence blobs from items
        // Client will re-fetch full data if needed for detail views
        const slimItems = (report.items || []).map((item: any) => {
            const evidence = item.evidence || {};
            return {
                ...item,
                evidence: {
                    price: evidence.price ? {
                        last: evidence.price.last,
                        prevClose: evidence.price.prevClose,
                        changePct: evidence.price.changePct,
                        priceSource: evidence.price.priceSource,
                    } : undefined,
                    options: evidence.options ? {
                        callWall: evidence.options.callWall,
                        putFloor: evidence.options.putFloor,
                    } : undefined,
                    flow: evidence.flow ? {
                        vol: evidence.flow.vol,
                        netPremium: evidence.flow.netPremium,
                        netFlow: evidence.flow.netFlow,
                        largeTradesUsd: evidence.flow.largeTradesUsd,
                    } : undefined,
                },
            };
        });

        return {
            ...report,
            items: slimItems,
            // Strip heavy raw data arrays that aren't needed for card rendering
            _rawGainers: undefined,
            _rawActives: undefined,
            _rawSectors: undefined,
        };
    } catch (e) {
        console.error('[Intel SSR] Failed to prefetch report:', e);
        return null;
    }
}

export default async function IntelPage({ params }: PageProps) {
    const { locale } = await params;

    // Fetch report data during SSR — data is embedded in HTML, no client-side wait
    const initialReport = await prefetchReport();

    return (
        <div className="flex flex-col min-h-screen bg-[#05090f]">
            <Suspense fallback={null}>
                <LandingHeader />
            </Suspense>
            <div className="flex-1 relative">
                <Suspense fallback={
                    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-slate-400 text-sm">Loading Intel...</p>
                        </div>
                    </div>
                }>
                    <IntelClientPage initialReport={initialReport} locale={locale} />
                </Suspense>
            </div>
        </div>
    );
}
