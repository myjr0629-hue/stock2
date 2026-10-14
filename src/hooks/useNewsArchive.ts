// [Guardian] SWR hook — 뉴스 펄스 «전체 보기» 화면(app-view/guardian/news)의 읽기
// GET /api/guardian/news-archive?locale= — 저장본만 읽는다(AI·공급사 호출 0). 새 항목은 15분마다 쌓이므로 2분 간격이면 충분하다.
"use client";

import useSWR from 'swr';
import { useLocale } from 'next-intl';
import type { NewsArchiveResponse } from '@/app/api/guardian/news-archive/route';

export const NEWS_ARCHIVE_REFRESH_MS = 120_000;

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<NewsArchiveResponse>;
});

export function useNewsArchive() {
    // locale 을 키에 넣는다 — 언어를 바꿀 때 캐시가 섞이지 않게(서버가 «그 언어로 읽을 수 있는 것»만 돌려준다)
    const locale = useLocale();
    const { data, error, isLoading, isValidating } = useSWR<NewsArchiveResponse>(
        `/api/guardian/news-archive?locale=${locale}`,
        fetcher,
        {
            refreshInterval: NEWS_ARCHIVE_REFRESH_MS,
            dedupingInterval: 30_000,
            revalidateOnFocus: true,
            errorRetryCount: 2,
            keepPreviousData: true,
        },
    );
    return { data: data ?? null, items: data?.items ?? [], isLoading, isValidating, error };
}
