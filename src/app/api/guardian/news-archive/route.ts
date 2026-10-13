// ============================================================================
// Guardian — 뉴스 펄스 «전체 보기» 읽기 API (2026-10-13)
//   GET /api/guardian/news-archive?locale=ko|ja|en
//   → 최근 48시간(발행 시각 기준)에 AI 해석이 붙은 뉴스를 최신 먼저, 요청한 언어 하나로.
//
// 저장본만 읽는다 — AI·공급사·외부 호출 0, 쓰기 0. 항목은 뉴스 펄스 다이제스트가 저장될 때마다 쌓인다
//   (lib/news/pulseArchive · app/api/guardian/news-digest). 보관본이 비어 있으면(막 배포됐거나 키가 유실됐을 때)
//   지금 카드가 보여 주는 다이제스트 항목으로 대신 채워 «빈 화면»을 만들지 않는다(source:'digest').
//   요청한 언어로 읽을 수 없는 항목은 거른다 — 다른 언어로 조용히 대체하지 않는다(다이제스트 API 와 같은 규칙).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import {
    ARCHIVE_RETURN_CAP, ARCHIVE_WINDOW_MS, DIGEST_REDIS_KEY,
    inWindow, normLocale, readableIn, readPulseArchive, toArchiveItem, toLean,
    type ArchiveItem, type DigestLikeItem, type LeanItem,
} from '@/lib/news/pulseArchive';

export const maxDuration = 15;

export interface NewsArchiveResponse {
    items: LeanItem[];
    /** 창 안 전체 항목 수(요청 언어) — 응답 상한(120)에 잘렸어도 전체를 센다 */
    count: number;
    windowHours: number;
    source: 'archive' | 'digest' | 'empty';
    generatedAt: string;
    _locale: 'ko' | 'ja' | 'en';
}

export async function GET(req: NextRequest) {
    const locale = normLocale(new URL(req.url).searchParams.get('locale'));
    const now = Date.now();

    let source: NewsArchiveResponse['source'] = 'archive';
    let rows: ArchiveItem[] = [];
    try {
        rows = (await readPulseArchive(now)).filter((it) => readableIn(it, locale));
    } catch (e) {
        console.warn('[NewsArchive] read failed:', e);
    }

    if (rows.length === 0) {
        // 보관본이 비어 있다 — 지금 카드의 다이제스트 항목으로 대신(같은 창·같은 규칙으로 거른다)
        try {
            const digest = await getFromCache<{ items?: DigestLikeItem[] }>(DIGEST_REDIS_KEY);
            const fromDigest = (digest?.items || []).map(toArchiveItem).filter((x): x is ArchiveItem => !!x);
            rows = inWindow(fromDigest, now).filter((it) => readableIn(it, locale));
            source = rows.length ? 'digest' : 'empty';
        } catch {
            source = 'empty';
        }
    }

    const body: NewsArchiveResponse = {
        items: rows.slice(0, ARCHIVE_RETURN_CAP).map((it) => toLean(it, locale)),
        count: rows.length,
        windowHours: ARCHIVE_WINDOW_MS / 3600_000,
        source,
        generatedAt: new Date(now).toISOString(),
        _locale: locale,
    };
    // 새 항목은 15분마다 — 30초 공용 캐시면 충분하고 EC2 읽기를 줄인다
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } });
}
