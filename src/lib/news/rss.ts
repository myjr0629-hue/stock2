// ============================================================================
// 공개 RSS 읽기 — 가디언 뉴스(guardian/news-digest)와 종목 뉴스(live/ticker-news)가 같이 쓴다.
// ----------------------------------------------------------------------------
// 원래 news-digest 안에 있던 파서를 그대로 옮겼다(2026-09-30). 같은 원천을 두 곳이 따로 읽으면
// 한쪽만 고쳐지는 일이 생긴다 — 파서는 하나다. 바뀐 점은 넷이다(가디언 4개 피드 실측: 제목·시각·본문·id 는 옛 파서와 같다).
//   ① 링크(url)도 돌려준다 — 종목 뉴스는 기사로 보내야 한다(가디언은 쓰지 않는다).
//   ② 시각에 «시간대»가 없으면 버린다. RFC 822 pubDate 는 원래 시간대를 달고 온다(GMT·+0000).
//      없으면 서버 시계(UTC)로 읽혀 몇 시간씩 틀린다 — FMP 뉴스를 4시간 늙게 읽은 것과 같은 종류다
//      (메모리 fmp-news-time-is-new-york-wall-clock). 미래 시각(10분 넘게 앞선 것)도 해석 오류라 버린다.
//      9/30 실측: 가디언 4곳·야후 종목·구글 검색 pubDate 는 전부 GMT/+0000 이라 지금 버려지는 건 0건.
//   ③ 야후 피드는 <source> 가 없어 전부 «Yahoo Finance»로 적혔다. 링크가 야후 밖(fool.com·247wallst.com
//      ·thestreet.com …)이면 그 사이트가 출처다 — 제목·출처·링크만 싣는 우리에겐 출처가 틀리면 안 된다.
//   ④ 매체 도메인(sourceHost)을 싣는다 — 구글 링크는 news.google.com 중계라 <source url> 이 매체다(종목 뉴스의 매체 허용 목록).
// ============================================================================

export const RSS_USER_AGENT = 'Mozilla/5.0 (compatible; SignumNews/1.0; +https://www.signumhq.com)';

export interface RssArticle {
    id: string;
    title: string;
    description: string;
    published_utc: string;       // ISO(UTC)
    publisher: { name: string };
    url: string;
    /** 매체 도메인 — 구글은 <source url>(링크가 news.google.com 중계라서), 나머지는 링크의 도메인 */
    sourceHost: string;
    _source: string;             // 피드 표지(cnbc·yahoo·gnews …)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s: string): string {
    return (s || '')
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[String(n).toLowerCase()] ?? m);
}
export function stripTags(s: string): string {
    return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function pick(item: string, tag: string): string {
    const m = item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
    return m ? decodeEntities(m[1].trim()) : '';
}

/** pubDate 끝에 시간대가 있는가 — GMT·UTC·Z·EDT 류·+0000 */
const HAS_ZONE = /(?:GMT|UTC|UT|Z|[ECMP][SD]T|[+-]\d{2}:?\d{2})\s*$/i;
/** 시간대가 명시된 pubDate 만 읽는다. 없거나 미래(10분 넘게)면 null */
export function parsePubDate(s: string, now = Date.now()): number | null {
    const v = String(s || '').trim();
    if (!v || !HAS_ZONE.test(v)) return null;
    const ms = Date.parse(v);
    if (!Number.isFinite(ms) || ms > now + 10 * 60_000) return null;
    return ms;
}

function hostOf(u: string): string {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

const DEFAULT_PUBLISHER: Record<string, string> = { cnbc: 'CNBC', marketwatch: 'MarketWatch', yahoo: 'Yahoo Finance' };

/** 피드 XML → 기사 목록(피드 순서 그대로, 최대 limit 건) */
export function parseRssItems(xml: string, tag: string, limit: number): RssArticle[] {
    const items = [...String(xml || '').matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(m => m[0]);
    const out: RssArticle[] = [];
    const now = Date.now();
    for (const it of items) {
        const rawTitle = pick(it, 'title');
        const ms = parsePubDate(pick(it, 'pubDate'), now);
        if (!rawTitle || ms === null) continue;
        // 구글 뉴스는 제목 끝에 « - 매체명»을 붙인다. 매체명은 source 태그가 정본이다.
        const srcTag = pick(it, 'source');
        const dash = rawTitle.lastIndexOf(' - ');
        const title = (tag === 'gnews' && dash > 20) ? rawTitle.slice(0, dash) : rawTitle;
        const link = pick(it, 'link');
        const srcUrl = (it.match(/<source[^>]*\burl="([^"]+)"/) || [])[1] || '';
        const host = tag === 'yahoo' ? hostOf(link) : '';
        const offSite = !!host && !/(^|\.)yahoo\.com$/.test(host);
        out.push({
            id: `${tag}-${(link || title).slice(-24)}`,
            title,
            description: stripTags(pick(it, 'description')).slice(0, 300),
            published_utc: new Date(ms).toISOString(),
            publisher: { name: srcTag || (offSite ? host : DEFAULT_PUBLISHER[tag] || 'News') },
            url: link,
            sourceHost: hostOf(srcUrl || link),
            _source: tag,
        });
        if (out.length >= limit) break;
    }
    return out;
}

/** 피드 하나를 받아 읽는다. 실패하면 빈 배열(호출자는 다른 원천으로 넘어간다) */
export async function fetchRssPool(tag: string, url: string, limit: number, timeoutMs = 8000): Promise<RssArticle[]> {
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
            cache: 'no-store',
            // ⚠️ 브라우저 흉내 UA(Chrome/…)는 야후가 429 로 막는다(9/30 실측). 이 UA 는 200.
            headers: { 'user-agent': RSS_USER_AGENT },
        });
        if (!res.ok) return [];
        return parseRssItems(await res.text(), tag, limit);
    } catch (e) {
        console.error(`[rss] ${tag} failed:`, e);
        return [];
    }
}
