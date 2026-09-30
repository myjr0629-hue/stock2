// ============================================================================
// 종목 뉴스의 «회사명 규칙» — 무엇으로 검색하고, 기사 제목이 그 종목 얘기인지 무엇으로 판정하나.
// 종목 뉴스(live/ticker-news)와 원천 비교(debug/news-compare)가 같이 쓴다.
// ----------------------------------------------------------------------------
// 원래 news-compare 안에 있던 두 표(GQ: 구글 검색어 · TICKERS: 관련성 정규식)를 옮겨 넓혔다(2026-09-30).
//   · 이름의 정본은 앱 이름표(src/lib/app/tickerNames.ts 의 영어 이름) — «내 종목» 화면과 같은 이름이다.
//     옛 GQ 10개(Nvidia·Apple·…·Meta Platforms)는 그 표와 같은 값이라 따로 두지 않는다.
//   · 표에 없는 종목은 벤더 회사명에서 법인 꼬리(Inc·Corp·Class A…)를 뗀 것을 따옴표로 검색한다.
//   · 티커만으로 검색하면 «COST stock»이 비용 기사로 샌다(9/24 v1 실측 COST 정확도 6%) → 회사명으로.
//   · 회사명이 «일반 단어»면 이름 검색이 쓰레기가 된다. 9/30 실측 "Target when:1d" 상위 = 「price target」
//     ·미식축구·경찰 기사, "Visa when:1d" = 비자 발급 기사 → 그 종목만 티커를 붙여 검색한다(QUERY_OVERRIDE).
//   · 검색어 모양은 실측으로 골랐다(9/30, 15종목): «이름 when:1d» 가 «이름 stock»·«이름 티커»보다
//     관련 최신 5건이 대체로 더 새롭다(NKE 3·31·44분 vs 110·119·123분). 예외는 위의 일반 단어 이름뿐.
// ============================================================================
import { tickerName } from '@/lib/app/tickerNames';

/** 제목이 회사를 부르는 짧은 이름 — 이름표의 정식 이름과 다를 때만 적는다(9/30 제목 실측) */
const HEADLINE_ALIASES: Record<string, string[]> = {
    META: ['Meta'], GOOGL: ['Google'], GOOG: ['Google'], JPM: ['JPMorgan'], GS: ['Goldman'],
    'BRK.B': ['Berkshire'], XOM: ['Exxon', 'ExxonMobil'], LMT: ['Lockheed'], LLY: ['Lilly'], ARM: ['Arm'],
    NVO: ['Novo'], JNJ: ['J&J'], PG: ['P&G'], MSTR: ['MicroStrategy'], AMD: ['Advanced Micro'],
    // ETF 는 회사가 없다 — 추종 대상이 제목에 나오는 말
    QQQ: ['Nasdaq'], TQQQ: ['Nasdaq'], SOXL: ['Semiconductor'], TLT: ['Treasury'],
};

/** 이름이 일반 단어라 이름만으로는 검색이 안 되는 종목 → 티커를 붙인 검색어(9/30 실측으로 정밀도 확인) */
const QUERY_OVERRIDE: Record<string, string> = {
    TGT: 'Target TGT', V: 'Visa NYSE:V', XYZ: 'Block XYZ', MSTR: 'Strategy MSTR',
    VRTX: 'Vertex VRTX', AFRM: 'Affirm AFRM', UPST: 'Upstart UPST',
};

/** 벤더 회사명의 법인 꼬리를 뗀다: "Micron Technology Inc" → "Micron Technology", "Alphabet Inc Class A" → "Alphabet" */
const CORP_TAIL = /[,\s]+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|n\.?v|s\.?a|ag|se|l\.?p|llc|holdings?|group|class [a-c]|common stock|ordinary shares|adrs?|ads)\.?$/i;
export function cleanCompanyName(s: string): string {
    let n = String(s || '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 4 && CORP_TAIL.test(n); i++) n = n.replace(CORP_TAIL, '').trim();
    return n;
}

export interface NewsNames {
    /** 구글 뉴스 검색어(기간 제외). 이름을 모르면 null → 구글은 건너뛴다 */
    query: string | null;
    /** 제목에서 찾을 이름들 */
    titleNames: string[];
}

/**
 * @param vendorName 이름표에 없는 종목만 쓴다(벤더 회사명, 없으면 null)
 */
export function newsNamesFor(ticker: string, vendorName?: string | null): NewsNames {
    const t = String(ticker || '').toUpperCase();
    const table = tickerName(t, 'en');
    if (table) {
        const titleName = table.replace(/\s+ETF$/i, '').trim();   // "S&P 500 ETF" → 제목에는 "S&P 500"
        return { query: QUERY_OVERRIDE[t] || table, titleNames: [titleName, ...(HEADLINE_ALIASES[t] || [])] };
    }
    const name = cleanCompanyName(vendorName || '');
    if (!name || name.toUpperCase() === t) return { query: null, titleNames: [] };
    const titleNames = [name];
    // "Rigetti Computing" → 제목엔 "Rigetti" 가 많다. 다섯 글자 이상 고유명사일 때만 첫 단어를 쓴다.
    const first = name.split(' ')[0];
    if (name.includes(' ') && /^[A-Z][A-Za-z0-9&'.-]{4,}$/.test(first)) titleNames.push(first);
    return { query: `"${name}"`, titleNames };
}

/**
 * 구글 뉴스 검색 결과는 «이 매체»일 때만 받는다(야후 종목 피드·FMP 는 이미 금융 매체로 걸러져 온다).
 *   9/30 실측(20종목 «이름 when:1d»): 관련 기사 1,699건이 585개 매체에서 왔다. 앞쪽은 금융 매체지만 꼬리는
 *   운동화 발매 블로그(Nike 5건 중 5건)·사과 따기 페이스북 글(Apple)·동네 매장 개점 지역 방송(Costco)·
 *   활동가 블로그(Palantir)·13F 자동 기사(MarketBeat)·스포츠 배당(«ORACLE» 팀명)이었다. 종목 화면에 싣지 않는다.
 *   목록은 금융·통신·경제지 + 제품·규제 뉴스를 내는 기술 매체. 하위 도메인도 같다(ca.finance.yahoo.com).
 */
const TRUSTED_NEWS_HOSTS = [
    // 통신·종합지(경제면)
    'reuters.com', 'apnews.com', 'bloomberg.com', 'wsj.com', 'ft.com', 'nytimes.com', 'washingtonpost.com', 'cnbc.com', 'cnn.com',
    'foxbusiness.com', 'axios.com', 'economist.com', 'theinformation.com', 'semafor.com', 'nikkei.com', 'scmp.com',
    'koreatimes.co.kr', 'koreaherald.com', 'japantimes.co.jp',
    // 금융 전문
    'finance.yahoo.com', 'barrons.com', 'marketwatch.com', 'investors.com', 'fool.com', 'seekingalpha.com', 'benzinga.com',
    'zacks.com', 'investopedia.com', 'thestreet.com', '247wallst.com', 'tipranks.com', 'morningstar.com', 'kiplinger.com',
    'investing.com', 'forbes.com', 'businessinsider.com', 'fortune.com', 'marketscreener.com', 'barchart.com', 'streetinsider.com',
    // 기술·산업(제품·규제 뉴스)
    'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com', 'cnet.com', 'engadget.com', 'macrumors.com', '9to5mac.com',
    'appleinsider.com', 'electrek.co', 'theregister.com', 'tomshardware.com',
];
export function isTrustedNewsHost(host: string): boolean {
    const h = String(host || '').toLowerCase().replace(/^www\./, '');
    return !!h && TRUSTED_NEWS_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

/** 구글 뉴스 검색 RSS 주소 */
export function googleNewsSearchUrl(query: string, window = '1d'): string {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${window}`)}&hl=en-US&gl=US&ceid=US:en`;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 이 글(제목)이 그 종목 얘기인가 — 회사명 또는 티커가 있어야 한다.
 *   · 티커: (MU)·(MU:NASDAQ)·$MU·NASDAQ:MU 는 대문자 그대로. 세 글자 이상이면 맨몸(«PLTR stock»)도 센다
 *     (두 글자 이하는 일반 단어·약어와 겹친다 — V·C·AI).
 *   · 회사명: 대소문자 무시로 찾되 첫 글자가 대문자여야 한다 — «price target»(소문자)은 Target 이 아니다.
 *     하이픈·공백은 같게 본다(Nasdaq-100 = Nasdaq 100).
 */
export function isAboutTicker(text: string, ticker: string, titleNames: string[]): boolean {
    const s = String(text || '').replace(/[’‘]/g, "'");
    const t = String(ticker || '').toUpperCase();
    if (!s || !t) return false;
    const e = escRe(t);
    const tick = new RegExp(`\\(${e}[:)\\s]|\\$${e}(?![A-Za-z0-9])|:\\s?${e}(?![A-Za-z0-9])`
        + (t.length >= 3 ? `|(?<![A-Za-z0-9$])${e}(?![A-Za-z0-9])` : ''));
    if (tick.test(s)) return true;
    for (const raw of titleNames) {
        const n = String(raw || '').replace(/[’‘]/g, "'").trim();
        if (!n) continue;
        const re = new RegExp(`(?<![A-Za-z0-9])${escRe(n).replace(/[-\s]+/g, '[-\\s]')}(?![A-Za-z0-9])`, 'gi');
        for (const m of s.matchAll(re)) {
            const c = m[0][0];
            if (c === c.toUpperCase() || c === n[0]) return true;   // 고유명사는 대문자로 시작(eBay 처럼 원래 소문자면 그대로)
        }
    }
    return false;
}
