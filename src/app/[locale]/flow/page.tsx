import { FlowPageClient } from "./FlowPageClient";
import { getFromCache } from '@/services/redisClient';

interface Props {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ ticker?: string; t?: string }>;
}

export default async function FlowPage({ params, searchParams }: Props) {
    const resolvedParams = await searchParams;
    const ticker = (resolvedParams.ticker || resolvedParams.t || 'TSLA').toUpperCase();

    if (!ticker) {
        return (
            <div className="min-h-screen font-sans bg-slate-950 text-slate-200">
                <main className="mx-auto max-w-5xl px-6 pb-12">
                    <div className="border border-slate-800 bg-slate-900/50 rounded-lg p-6">
                        <div className="text-lg font-bold mb-2 text-white">Ticker required</div>
                        <div className="text-sm text-slate-400">Example: /flow?ticker=NVDA</div>
                    </div>
                </main>
            </div>
        );
    }

    // [SSR HYDRATION] Pre-fetch the exact same unified payload from Redis
    // The key matches CACHE_KEY_PREFIX from flow/unified/route.ts
    const cacheKey = `cache:flow:unified:${ticker}`;
    const initialFlowData = await getFromCache<any>(cacheKey).catch(() => null);

    return (
        <FlowPageClient
            ticker={ticker}
            initialFlowData={initialFlowData || undefined}
        />
    );
}
