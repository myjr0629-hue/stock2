import { FlowPageClient } from "./FlowPageClient";
import { getFromCache, setInCache } from '@/services/redisClient';
import { getFlowCache } from '@/lib/aws/flowCacheProvider';
import { TerminalGateWrapper } from '@/components/gate/TerminalGateWrapper';

interface Props {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ ticker?: string; t?: string }>;
}

/**
 * Sanitize data for React Server → Client serialization.
 * React Flight protocol crashes on NaN, Infinity, -Infinity, undefined in objects.
 * This round-trips through JSON to convert them to null safely.
 */
function sanitizeForClient(data: any): any {
    if (data === null || data === undefined) return data;
    try {
        return JSON.parse(JSON.stringify(data));
    } catch {
        return null;
    }
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

    // [SSR HYDRATION] 3-Tier: Redis → DynamoDB → null
    const cacheKey = `cache:flow:unified:${ticker}`;
    let initialFlowData = await getFromCache<any>(cacheKey).catch(() => null);

    // Tier 2: DynamoDB fallback if Redis misses
    if (!initialFlowData) {
        try {
            const dynamoData = await getFlowCache(ticker, 600000); // max 10 min
            if (dynamoData) {
                initialFlowData = dynamoData;
                // Re-warm Redis from DynamoDB for subsequent requests
                setInCache(cacheKey, dynamoData, 300).catch(() => {});
            }
        } catch { /* DynamoDB unavailable, continue without SSR data */ }
    }

    // [FIX] Sanitize for React Flight — NaN/Infinity crash client hydration
    const safeData = sanitizeForClient(initialFlowData);

    return (
        <TerminalGateWrapper pageName="FLOW">
            <FlowPageClient
                ticker={ticker}
                initialFlowData={safeData || undefined}
            />
        </TerminalGateWrapper>
    );
}
