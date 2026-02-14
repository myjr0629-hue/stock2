
import React, { Suspense } from 'react';
import IntelClientPage from './IntelClientPage';

interface PageProps {
    params: Promise<{ locale: string }>;
}

// [PERF v2] SSR prefetch REMOVED — was blocking HTML delivery for 2-3s.
// Client-side useIntelSharedData + fetchReport already loads data in parallel.
// Removing SSR prefetch lets Next.js send HTML instantly (no server-side await).

export default async function IntelPage({ params }: PageProps) {
    const { locale } = await params;

    return (
        <div className="flex flex-col min-h-screen bg-[#05090f]">
            <Suspense fallback={null}>
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
                    <IntelClientPage initialReport={null} locale={locale} />
                </Suspense>
            </div>
        </div>
    );
}
