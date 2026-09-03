// [Guardian] SWR Hook for News Digest (NEWS PULSE)
// Reads from Redis-cached data (pre-warmed by cron every 30 min)
"use client";

import useSWR from 'swr';
import { useLocale } from 'next-intl';

const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
});

export interface NewsDigestItem {
    id: string;
    headline: string;
    summaryKR: string;
    summaryEN: string;
    summaryJP: string;
    analysisKR: string;
    analysisEN: string;
    analysisJP: string;
    category: 'US_MARKET' | 'GLOBAL' | 'GEOPOLITICAL' | 'MACRO' | 'SECTOR';
    impact: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL';
    urgency: number;
    source: string;
    publishedAt: string;
    publishedAtET: string;
    ageMinutes: number;
}

export interface NewsDigest {
    items: NewsDigestItem[];
    generatedAt: string;
    generatedAtET: string;
    nextRefreshAt: string;
    marketContext: string;
    _source: 'fresh' | 'cached';
}

export function useGuardianNews(enabled: boolean = true) {
    // ⚠️ locale 을 반드시 보낸다. 서버가 «요청한 언어로 읽을 수 있는 것»만 돌려주므로
    //    이걸 빠뜨리면 한국어·일본어 사용자에게 영어가 간다(2026-09-03).
    //    SWR 키에 locale 이 들어가야 언어 전환 시 캐시가 섞이지 않는다.
    const locale = useLocale();

    const { data, error, isLoading, mutate } = useSWR<NewsDigest>(
        enabled ? `/api/guardian/news-digest?locale=${locale}` : null,
        fetcher,
        {
            refreshInterval: 60000,      // Re-check every 60s (cache hit = fast)
            dedupingInterval: 30000,
            revalidateOnFocus: true,     // Refresh when tab becomes active
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    const hasBreaking = (data?.items || []).some(item => item.urgency >= 8);

    return {
        digest: data || null,
        items: data?.items || [],
        hasBreaking,
        error,
        isLoading,
        mutate,
    };
}
