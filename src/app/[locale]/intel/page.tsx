import React, { Suspense } from 'react';
import IntelClientPage from './IntelClientPage';
import { GET as getFastData } from '@/app/api/intel/fast/route';
import { TerminalGateWrapper } from '@/components/gate/TerminalGateWrapper';

interface PageProps {
    params: Promise<{ locale: string }>;
}

async function fetchInitialSectorData(sector: string) {
    try {
        const url = `http://localhost/api/intel/fast?sector=${sector}`;
        const req = new Request(url);
        const res = await getFastData(req);
        if (res.ok) {
            const json = await res.json();
            return json.data || [];
        }
        console.warn(`[Intel SSR] Fast API returned !ok status for ${sector}:`, res.status);
    } catch (e) {
        console.error(`[Intel SSR] Error fetching ${sector} initial data:`, e);
    }
    return [];
}

export const dynamic = 'force-dynamic';

export default async function IntelPage({ params }: PageProps) {
    const { locale } = await params;

    const [m7Data, paiData, scData, pmData, bpData, csData, odData, qeData, fpData, cfData] = await Promise.all([
        fetchInitialSectorData('m7'),
        fetchInitialSectorData('physical_ai'),
        fetchInitialSectorData('silicon_core'),
        fetchInitialSectorData('power_matrix'),
        fetchInitialSectorData('bio_pulse'),
        fetchInitialSectorData('cyber_shield'),
        fetchInitialSectorData('orbit_defense'),
        fetchInitialSectorData('quantum_edge'),
        fetchInitialSectorData('fintech_pulse'),
        fetchInitialSectorData('cloud_fortress'),
    ]);

    return (
        <TerminalGateWrapper pageName="INTEL">
            <div className="flex flex-col min-h-screen bg-[#0a1120]" data-intel>
                <div className="flex-1 relative">
                    <Suspense fallback={
                        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                            <div className="text-center">
                                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                <p className="text-slate-400 text-sm">Initializing Tactical Board...</p>
                            </div>
                        </div>
                    }>
                        <IntelClientPage
                            initialReport={null}
                            initialM7Data={m7Data}
                            initialPAIData={paiData}
                            initialSCData={scData}
                            initialPMData={pmData}
                            initialBPData={bpData}
                            initialCSData={csData}
                            initialODData={odData}
                            initialQEData={qeData}
                            initialFPData={fpData}
                            initialCFData={cfData}
                            locale={locale}
                        />
                    </Suspense>
                </div>
            </div>
        </TerminalGateWrapper>
    );
}
