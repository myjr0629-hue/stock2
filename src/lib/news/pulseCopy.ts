// ============================================================================
// 뉴스 펄스 «전체 보기» 화면(app-view/guardian/news) 문구·날짜 묶기 (2026-10-13, 대표 10/13)
// ----------------------------------------------------------------------------
// 순수 모듈 — 화면과 시험이 같이 쓴다. 금융 공통어(BULLISH·BEARISH 등 임팩트 배지)는 번역하지 않는다(대표 10/8 원칙) —
// 카드(RealityCheck)가 그 값을 그대로 보여 주는 것과 같다. 분류 이름은 카드의 CATEGORY_CONFIG 와 같은 말을 쓴다.
// ============================================================================

export type NewsLoc = 'ko' | 'ja' | 'en';

export interface NewsCopy {
    title: string;
    aiAria: string;
    back: string;
    backAria: string;
    /** 머리 아래 한 줄 — 창과 개수 */
    sub: (n: number) => string;
    today: string;
    yesterday: string;
    empty: string;
    error: string;
    categories: Record<string, string>;
}

export const NEWS_COPY: Record<NewsLoc, NewsCopy> = {
    ko: {
        title: '뉴스 펄스', aiAria: 'AI 해석', back: '뒤로', backAria: '뒤로 가기',
        sub: (n) => `최근 48시간 · ${n}건`,
        today: '오늘', yesterday: '어제',
        empty: '아직 AI 해석이 붙은 뉴스가 없습니다',
        error: '불러오지 못했습니다. 잠시 뒤 다시 열어 주세요',
        categories: { US_MARKET: '미국 시장', GLOBAL: '글로벌', GEOPOLITICAL: '지정학', MACRO: '매크로', SECTOR: '섹터' },
    },
    ja: {
        title: 'ニュースパルス', aiAria: 'AI解説', back: '戻る', backAria: '前の画面に戻る',
        sub: (n) => `直近48時間 · ${n}件`,
        today: '今日', yesterday: '昨日',
        empty: 'AI解説つきのニュースはまだありません',
        error: '読み込めませんでした。しばらくしてからもう一度開いてください',
        categories: { US_MARKET: '米国市場', GLOBAL: 'グローバル', GEOPOLITICAL: '地政学', MACRO: 'マクロ', SECTOR: 'セクター' },
    },
    en: {
        title: 'News Pulse', aiAria: 'AI analysis', back: 'Back', backAria: 'Go back',
        sub: (n) => `Last 48 hours · ${n}`,
        today: 'Today', yesterday: 'Yesterday',
        empty: 'No AI-analyzed news yet',
        error: 'Could not load. Please reopen in a moment',
        categories: { US_MARKET: 'US MARKET', GLOBAL: 'GLOBAL', GEOPOLITICAL: 'GEOPOLITICAL', MACRO: 'MACRO', SECTOR: 'SECTOR' },
    },
};

/** 카드 아래 «전체 보기 · n ›» 줄 — 오늘 볼 것 카드(lib/todayPicks/copy viewAll)와 같은 말·같은 꼴. n 을 모르면 숫자 없이 */
export const VIEW_ALL: Record<NewsLoc, (n: number | null | undefined) => string> = {
    ko: (n) => (n ? `전체 보기 · ${n}` : '전체 보기'),
    ja: (n) => (n ? `すべて見る · ${n}` : 'すべて見る'),
    en: (n) => (n ? `View all · ${n}` : 'View all'),
};

export function toNewsLoc(locale: string | null | undefined): NewsLoc {
    return locale === 'ko' || locale === 'ja' ? locale : 'en';
}

/** 기기 시간대의 달력 날짜 키(YYYY-MM-DD) */
export function localDayKey(t: number | Date): string {
    const d = new Date(t);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

const WEEKDAY: Record<NewsLoc, readonly string[]> = {
    ko: ['일', '월', '화', '수', '목', '금', '토'],
    ja: ['日', '月', '火', '水', '木', '金', '土'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

/** 묶음 머리 — 오늘 · 어제 · 그 이전은 «10/11 토»(경제 캘린더 머리와 같은 꼴) */
export function dayHeading(key: string, now: number, loc: NewsLoc): string {
    const c = NEWS_COPY[loc];
    if (key === localDayKey(now)) return c.today;
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    if (key === localDayKey(y)) return c.yesterday;
    const [yy, mm, dd] = key.split('-').map(Number);
    const wd = WEEKDAY[loc][new Date(yy, mm - 1, dd).getDay()];
    return `${mm}/${dd} ${wd}`;
}

/** 기기 시간대 24시간제 «HH:mm» */
export function clockOf(t: number | string): string {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface DayGroup<T> { key: string; heading: string; items: T[] }

/** 발행 시각 내림차순 목록을 기기 날짜별로 묶는다(순서 유지) */
export function groupByLocalDay<T extends { publishedAt: string }>(items: T[], now: number, loc: NewsLoc): DayGroup<T>[] {
    const out: DayGroup<T>[] = [];
    for (const it of items) {
        const key = localDayKey(Date.parse(it.publishedAt));
        const last = out[out.length - 1];
        if (last && last.key === key) last.items.push(it);
        else out.push({ key, heading: dayHeading(key, now, loc), items: [it] });
    }
    return out;
}
