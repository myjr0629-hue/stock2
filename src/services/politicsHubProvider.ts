import { fetchMassive } from './massiveClient';

// Types for PoliticsHub
export interface PolicyEvent {
    id: string;
    title: string;
    source: 'WHITEHOUSE' | 'TREASURY' | 'FDA' | 'CONGRESS' | 'UNKNOWN';
    date: string;
    url: string;
    keywords: string[];
    sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface PoliticsSummary {
    events: PolicyEvent[];
    activeThemes: string[]; // e.g., "Tariffs", "Green Energy"
    fetchedAtET: string;
}

// Mock Data for Initial Implementation (to be replaced with real RSS/API)
const MOCK_POLICIES: PolicyEvent[] = [
    {
        id: 'wh-001',
        title: 'Executive Order on Artificial Intelligence Standards',
        source: 'WHITEHOUSE',
        date: new Date().toISOString(),
        url: 'https://whitehouse.gov/ai-eo',
        keywords: ['AI', 'Tech', 'Regulation'],
        sentiment: 'NEUTRAL',
        impactLevel: 'HIGH'
    },
    {
        id: 'treasury-001',
        title: 'Treasury Announces New Semiconductor Tax Credits',
        source: 'TREASURY',
        date: new Date().toISOString(),
        url: 'https://treasury.gov/chips',
        keywords: ['Semiconductor', 'Tax', 'Chips'],
        sentiment: 'POSITIVE',
        impactLevel: 'MEDIUM'
    }
];

// Cache storage
let cachedPoliticalData: PoliticsSummary | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetches the latest political/policy events from configured sources.
 * Currently returns mock data until RSS parsing is integrated.
 */
export async function getPoliticsSSOT(): Promise<PoliticsSummary> {
    const now = Date.now();

    // Return cache if valid
    if (cachedPoliticalData && (now - lastFetchTime < CACHE_TTL_MS)) {
        return cachedPoliticalData;
    }

    try {
        console.log('[PoliticsHub] Fetching fresh policy data...');
        // TODO: Implement real RSS fetching using xml2js or similar
        // For now, we simulate a fetch

        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate latency

        const summary: PoliticsSummary = {
            events: MOCK_POLICIES,
            activeThemes: ['AI Regulation', 'Semiconductor Incentives'],
            fetchedAtET: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
        };

        cachedPoliticalData = summary;
        lastFetchTime = now;

        return summary;

    } catch (error) {
        console.error('[PoliticsHub] Failed to fetch policy data:', error);
        return {
            events: [],
            activeThemes: [],
            fetchedAtET: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
        };
    }
}

/**
 * Returns relevant policy events for a specific sector or ticker keywords.
 */
export function getRelevantPolicies(tickerTags: string[]): PolicyEvent[] {
    if (!cachedPoliticalData) return [];

    // Simple verification: if ticker tag matches policy keyword
    return cachedPoliticalData.events.filter(event =>
        event.keywords.some(k => tickerTags.some(t => t.toLowerCase().includes(k.toLowerCase())))
    );
}
