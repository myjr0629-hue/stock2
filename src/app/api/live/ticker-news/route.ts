// ============================================================================
// 종목별 뉴스 — 앱에 «이 종목 오늘 무슨 일이 있었나»가 아예 없었다.
// ----------------------------------------------------------------------------
// 가디언의 뉴스는 «전체 시장» 뉴스라 종목 태그가 없다. 종목 화면(커맨드)을 열어도
// 그 종목 뉴스는 어디에도 안 나온다. deep-analysis 안에서 재료로만 쓰이고 버려진다.
//
// 왜 여기는 «가벼운 모델»인가 — 실측으로 정했다.
//   같은 날 실적 캘린더에서는 깊이를 요구하자 가벼운 모델이 무너졌다(예측 표현·동어반복).
//   그런데 **뉴스 현지화**는 다르다. 우리 실제 news-digest 프롬프트로 두 모델을 돌린 결과:
//     Nova Lite  3/3 통과 · 8.1초 · $0.000424     ← 숫자·고유명사 오류 없음
//     Haiku      2/3     · 19.9초 · $0.0147
//   번역·요약은 대등하고 35배 싸고 2.5배 빠르다. 그리고 **RPM 200 vs 10** —
//   종목마다 부르는 이 기능은 호출량이 관건이라 이쪽이 구조적으로 맞다.
//   (해석이 필요한 자리는 전부 Haiku 그대로 둔다)
//
// ★2026-09-30 원천·신선도 수리 — 대표 «종목별 뉴스에 7시간 전·4시간 전 뉴스가 나온다».
//   실측(9/29 23:02 UTC, MU): 이 라우트는 fetchMassive('/v2/reference/news') → 라우터 → FMP 어댑터를 타고
//   있었다. 어댑터가 FMP 의 뉴욕 벽시계에 «Z» 를 붙여 **모든 기사가 정확히 240분 늙게** 나왔다
//   (같은 기사의 야후·구글 RSS 시각과 4건 대조 = 240·240·240·239분). «8h» 로 뜬 최신 기사는 실제 4시간 12분 전.
//   게다가 FMP 종목 피드 자체가 RSS 보다 늦었고(MU 최신: FMP 18:49 vs 야후 22:33 UTC),
//   age 라벨을 만들 때 계산해 30분 캐시에 박아 두어 그만큼 또 멈췄다.
//   고친 것:
//     ① 원천 = FMP 종목 뉴스(시각은 뉴욕 벽시계로 — fmpNewsAdapter/fmpTime) + 공개 RSS(야후 종목·구글 뉴스
//        회사명 검색). 가디언과 같은 층(lib/news/rss·fmpNewsAdapter)을 쓴다. Massive 는 예비로도 두지 않는다.
//     ② URL·제목으로 중복 제거 → 종목 관련성(회사명·티커가 제목에, lib/news/company) → 예측·권유 필터 → 최신순.
//     ③ 목록 캐시 5분, age 는 응답할 때마다 published 로 다시 계산한다.
//     ④ 번역은 «기사별»로 저장해(48시간) 이미 번역한 기사는 다시 부르지 않는다 — 캐시를 줄여도 호출이 늘지 않는다.
// ============================================================================
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getNewsFromFmp } from '@/services/fmpNewsAdapter';
import { getTickerDetails } from '@/services/intrinioClient';
import { fetchRssPool, type RssArticle } from '@/lib/news/rss';
import { newsNamesFor, googleNewsSearchUrl, isAboutTicker, isTrustedNewsHost, type NewsNames } from '@/lib/news/company';
import { tickerName } from '@/lib/app/tickerNames';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const LIGHT_MODEL = 'us.amazon.nova-lite-v1:0';
const MAX_ITEMS = 5;
const LIST_TTL = 5 * 60;             // 목록 — 5분이면 새 기사가 5분 안에 뜬다
const RETRY_TTL = 60;                // 번역이 통째로 실패했거나 원천이 전부 비었을 때 — 1분 뒤 다시
const TR_TTL = 48 * 3600;            // 기사별 번역 — 목록에서 밀려날 때까지 충분히
const TR_RETRY_MS = 30 * 60_000;     // 검사에 떨어진 번역은 30분 뒤에 다시 시도(예전 30분 캐시와 같은 주기)
const SOURCE_TIMEOUT_MS = 6000;

const bedrock = () => new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
        ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! }
        : undefined,
    maxAttempts: 2,
});

const SYSTEM = [
    'You localize US market news for a Korean/Japanese stock app, for ONE ticker.',
    'For each item produce: ko, ja (natural native summaries) and impact.',
    '',
    'ACCURACY — this is the hard part. Get it wrong and the app is worthless.',
    '- Every company, product and person named in your output MUST appear in the source headline.',
    '  NEVER introduce a company that is not in the headline. If unsure of a Korean/Japanese form,',
    '  keep the original English spelling.',
    '- Numbers must match exactly ($18 Million = 1,800만 달러).',
    '- Add NOTHING that is not in the headline. No extra day, date, venue, cause or comparison.',
    '    "down over 2% on Thursday" → 「목요일 2% 넘게 하락」 (NOT 「목요일 화요일 종가 대비…」).',
    '  If the headline names ONE day, your output names exactly that one day.',
    '- Idioms and market terms are NOT literal. Use the phrase Korean/Japanese investors actually use:',
    '    all-time high → 사상 최고치 (NOT 전시간 고점) · 史上最高値',
    '    guilty by association → 연좌·동반 하락 (NOT 유죄)',
    '    outpacing → 앞서다·상회 · take-or-pay → 테이크 오어 페이',
    '    walking a tightrope → 줄타기·아슬아슬한 균형 (NOT 긴장 상태)',
    '    bucks the trend → 흐름을 거스르다 · headwind/tailwind → 역풍/순풍',
    '  Translate the MEANING for an investor, never word by word.',
    '- Company/product names WITHOUT an established Korean/Japanese form stay in ENGLISH.',
    '    Groq → Groq (NOT 구로크) · Anthropic → 앤스로픽 · Palantir → 팔란티어',
    '    Micron → 마이크론 (NOT 미크론) · Broadcom → 브로드컴 · Arm → ARM',
    '    bull / bear (market stance) → 강세론·약세론 (NOT 불립/베어)',
    '    bullish/bearish bets → 강세/약세 베팅 · kill switch → 킬 스위치',
    '    If you are not certain the Korean form is what investors actually use, keep the English.',
    '- ACRONYMS of institutions are NEVER transliterated by sound. Use the established form:',
    '    DOJ → 미 법무부 / 米司法省 (NOT 도잉)   ·  SEC → 미 증권거래위원회 / 米SEC',
    '    FTC → 미 연방거래위원회   ·  FDA → 미 식품의약국   ·  Fed / FOMC → 연준 / FOMC',
    '    IPO · M&A · EPS · GDP · CPI · AI keep the acronym as-is.',
    '  If you do not know the established Korean/Japanese form, keep the English acronym.',
    '',
    'RULES',
    '- ko: 35-70자 · ja: 25-55자. One sentence. What happened, for THIS ticker.',
    '- impact: "BULLISH" | "BEARISH" | "NEUTRAL" — how the market would read it for this ticker.',
    '- NEVER predict. No 전망/예상/will rise. Report what happened.',
    '- No investment advice. If the headline itself is a buy/sell recommendation, state the FACT it',
    '  reports (who said it, what changed) — never repeat the recommendation.',
    '- LANGUAGE PURITY: "ko" Korean only, "ja" Japanese only.',
    '',
    'Return ONLY JSON: {"items":[{"id":1,"ko":"..","ja":"..","impact":".."}]}',
].join('\n');

const HANGUL = /[가-힣]/, KANA = /[぀-ヿ]/, KANJI = /[一-鿿]/;

/**
 * ★ [2026-09-10] «원문에 없는 회사명»을 잡아 낸다.
 *
 *   첫 판 프롬프트에 예시로 「Anthropic→앤스로픽, NVIDIA→엔비디아」를 넣었더니,
 *   모델이 그 예시를 잘못 붙들어 **NVIDIA 를 「앤스로픽」으로 세 번 오역**했다.
 *   길이·언어 검사는 전부 통과했다 — 회사명이 바뀐 것은 형식으로는 안 잡힌다.
 *   프롬프트에서 예시를 걷어내니 0/5 로 잡혔지만, 프롬프트만 믿지 않는다.
 *   원문에 없는 유명 회사명이 번역에 나타나면 그 항목은 버린다(영어 원문으로 떨어진다).
 */
const GHOST_NAMES: [string, string][] = [
    ['앤스로픽', 'anthropic'], ['오픈AI', 'openai'], ['엔비디아', 'nvidia'],
    ['구글', 'google'], ['알파벳', 'alphabet'], ['애플', 'apple'], ['테슬라', 'tesla'],
    ['마이크로소프트', 'microsoft'], ['아마존', 'amazon'], ['메타', 'meta'],
    ['인텔', 'intel'], ['AMD', 'amd'], ['브로드컴', 'broadcom'], ['넷플릭스', 'netflix'],
];
function hasGhostCompany(translated: string, sourceTitle: string): boolean {
    const src = sourceTitle.toLowerCase();
    return GHOST_NAMES.some(([ko, en]) => translated.includes(ko) && !src.includes(en));
}

/**
 * ★ 기관 약어를 «소리나는 대로» 옮긴 것을 잡는다.
 *   실측: "DOJ Probes $20 Billion Groq Deal" → 「**도잉** 조사가 …」.
 *   DOJ 는 미 법무부다. 금융 뉴스에 자주 나오는 약어라 틀리면 뜻이 통째로 바뀐다.
 *   프롬프트에 대응표를 넣었지만 그것만 믿지 않는다.
 */
const BAD_TRANSLITERATIONS = ['도잉', '도제이', '에스이씨', '에프티씨', '에프디에이', '아이피오', '구로크', '그로크', '미크론', '불립', '베어리시', '불리시'];
function hasBadTransliteration(translated: string): boolean {
    return BAD_TRANSLITERATIONS.some((w) => translated.includes(w));
}

/**
 * ★ 번역문에 «매매 권유»가 남아 있으면 버린다.
 *   헤드라인 필터를 넓혔지만 원문 표현은 무한하다. 두 겹으로 막는다 —
 *   걸리면 그 항목만 영어 원문으로 떨어지므로 화면은 비지 않는다.
 */
const ADVICE_RE = new RegExp([
    '매수\\s*(기회|타이밍|시점|추천)', '매도\\s*(추천|시점)',
    // ★ 「투자자들이 둘 다 **매수해야 한다**」가 첫 판을 통과했다 — 어미 변형을 넓힌다
    '(매수|매도|투자|보유)\\s*해야\\s*(한다|합니다|할)',
    '사야\\s*(한다|할|합니다)', '팔아야\\s*(한다|할|합니다)',
    '담아야', '저가\\s*매수', '하락\\s*매수', '지금\\s*사',
    '(사|살)\\s*(때|타이밍)', '주목할\\s*만한\\s*매수',
    '다음\\s*[A-Z가-힣]+(가|이)\\s*될', '제2의\\s*[A-Z가-힣]+',
    '買い(場|時)', '売り時', '今が買い', '買うべき', '売るべき',
].join('|'));
function hasAdvice(translated: string): boolean {
    return ADVICE_RE.test(translated);
}

/**
 * ★ 원문에 없는 «요일»을 지어냈는지 본다.
 *   실측: 원문 "down over 2% on Thursday" → 「**목요일 화요일** 종가 대비 2% 하락」.
 *   원문엔 요일이 하나인데 번역엔 둘이다. 날짜를 지어내면 사실이 바뀐다.
 *   길이·언어·권유 검사는 전부 통과하는 유형이라 따로 센다.
 */
const KO_DAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
const EN_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
function inventsWeekday(translated: string, sourceTitle: string): boolean {
    const src = sourceTitle.toLowerCase();
    const srcCount = EN_DAYS.filter((d) => src.includes(d)).length;
    const outCount = KO_DAYS.filter((d) => translated.includes(d)).length;
    return outCount > Math.max(srcCount, 0);
}
/**
 * 예측 표현. 실측으로 계속 새 형태가 나와 넓혀 왔다.
 *   「지속될 것으로 예상됨」 — 첫 정규식(예상\s*됩니다)이 «예상됨»을 못 잡았다.
 *   금융 앱에서 예측은 규정 위험이라 조사·어미 변형까지 포괄한다.
 */
const PREDICT = /전망|예상\s*(됩니다|된다|됨|되며|상회)|것으로\s*(예상|전망)|상회할|하회할|will\s+(rise|fall|beat|miss|continue)|expected\s+to|予想され/i;

/**
 * 경과 라벨 — **응답할 때마다** 계산한다(캐시에 박으면 캐시 수명만큼 시계가 멈춘다).
 *   5분 안 NOW · 1시간 안 분(35m) · 하루 안 시간(7h) · 그 뒤 일(2d).
 *   예전엔 1시간 안이 전부 NOW 였다 — RSS 로 바꾸면 대부분이 1시간 안이라 그 구분이 곧 신선도다.
 */
function ageLabel(iso: string, now = Date.now()): string {
    const min = Math.floor((now - Date.parse(iso)) / 60000);
    if (!Number.isFinite(min) || min < -5) return '';
    if (min < 5) return 'NOW';
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/**
 * ★ 원문 헤드라인 자체가 «예측 기사»면 아예 싣지 않는다.
 *   실측: "Prediction: Apple Stock Could Be Headed for a Big Move" →
 *   번역은 정확했지만(「예측: …」) **우리 앱은 예측을 싣지 않는다**(규정 위험).
 *   번역 단계에서 막을 일이 아니라 **고르는 단계에서 빼야** 하는 것이다.
 *
 * ★ 2차 실측: 예측 필터를 통과한 «투자 권유» 기사가 그대로 실렸다.
 *     "Alphabet's Decline Is a Clear Buying Opportunity" → 「분명한 매수 기회입니다」
 *     "Is September a Buy-the-Dip Month?"                → 「하락 매수의 달일까요?」
 *   예측(무엇이 일어날까)과 권유(사라/팔라)는 다른 것이라 정규식도 따로 필요하다.
 *   우리는 둘 다 싣지 않는다.
 *
 * ★ 3차(2026-09-30) — RSS 로 풀이 넓어지며 새 모양이 들어왔다. 9/29 실제 제목:
 *     "…Tesla Did in 3 Years. Prediction: It Will Be Worth More…"  → prediction: 가 문장 중간
 *     "…May Look Weak Tomorrow. Buy MU Stock Anyway"                → buy <티커> stock
 *     "Micron and Nike are on the downturn right now. Is it time to invest?"
 *     "Could Micron Stock Help You Become a Millionaire?"
 *     "If You'd Invested $1,000 in the Invesco QQQ Trust…"          → 옛 식은 둘 다 못 잡았다(\b$ 는 안 맞는다)
 *     "Is It Still a Good ETF to Buy Right Now?" · "History Says to Buy Stocks Right Now"
 *     "What History Says Will Happen If Micron's Earnings Stars Align"
 *     "GameStop Just Gained 31% in a Month: Take Profits, or Buy More?"
 *     "Innodata vs. Nebius Group N.V.: Which AI Stock Is a Better Buy in 2026?"
 *   9/30 구글 결과: "Palantir: Buy At An Elite Growth Valuation"(«종목: Buy/Sell/Hold» 필자 의견 — «: Sell-Off» 는 뉴스라 남긴다),
 *     "4D Molecular: Reiterate 'Buy' With…", "Palantir keeps Buy rating with $287 target",
 *     "Goldman Sachs Group, Inc. (The) (GS) Stock Forecasts"
 *   («Micron forecasts revenue above estimates» 같은 회사 가이던스 기사는 뉴스라 남긴다 — «stock forecast» 만 뺀다)
 */
const FORECAST_HEADLINE = new RegExp([
    // ① 예측물
    "^\\s*(prediction|forecast|outlook)\\b", "\\bprediction:",
    "\\b(price target|could (be )?(headed|soar|surge|plunge|jump|crash))\\b",
    "\\bhere'?s why .* (will|could)\\b", "\\bwill happen\\b",
    // ② 투자 권유·매매 판단
    "\\b(buy|sell|hold) (now|this|these|the dip)\\b",
    "\\bbuy[- ]the[- ]dip\\b",
    "\\b(is it time to|should you|why you should|reasons? to) (buy|sell|own|hold|invest)\\b",
    "\\b(buy or sell|screaming buy|no[- ]brainer|must[- ]own|table[- ]pounding|better buy|take profits,? or buy more)\\b",
    "\\b(buying|selling) opportunity\\b",
    "\\b(top|best) \\d+ .* (stocks?|picks?) to (buy|own)\\b",
    "\\bstock to buy\\b", "\\bto buy (right )?now\\b", "\\bbuy (\\w+ ){0,2}right now\\b",
    // 문장 첫머리의 «Buy X Stock» 만 — «SoftBank to buy shares»·«Nvidia Will Buy Back Shares»(자사주)는 뉴스다
    "(^|[.:;!?]\\s+)buy (\\$?\\w+ ){0,2}(stock|shares)\\b",
    // ★ 「다음 엔비디아가 될 수 있다」류 — 예측도 권유도 아닌 척하지만 사실상 종목 추천이다
    "\\bcould be the next\\b", "\\bthe next (nvidia|tesla|apple|amazon|google|microsoft|amd)\\b",
    "\\bmillionaire\\b", "\\bif you'?d? invested\\b", "\\$1,?000 in\\b",
    ":\\s*(a\\s+)?(strong\\s+)?(buy|sell|hold)(?![-\\w])", "\\breiterates?\\s+['\"‘’]?(buy|sell|hold)\\b", "\\b(buy|sell|hold) rating\\b",
    "\\$\\d[\\d,.]*\\s+(price\\s+)?target\\b", "\\bstock (forecast|prediction)s?\\b",
].join('|'), 'i');

/** 한 기사(원천 여럿에서 합친 것) */
interface Art { title: string; url: string; source: string; ms: number; from: string }

const titleKey = (t: string) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
/** 추적용 쿼리만 떼고 비교한다 — youtube.com/watch?v= 처럼 쿼리가 기사 자체인 주소가 있다 */
const TRACKING = /^(\.tsrc|cid|ref|oc|utm_.*|guccounter|ncid|soc_src|soc_trk|mod|yptr)$/i;
function urlKey(u: string): string {
    try {
        const x = new URL(u);
        for (const k of [...x.searchParams.keys()]) if (TRACKING.test(k)) x.searchParams.delete(k);
        return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}${x.search}`;
    } catch { return String(u || ''); }
}

/**
 * 원천 순서 = 우선순위(FMP 원문 링크 > 야후 > 구글 중계 링크). 같은 기사면 앞선 쪽의 링크·출처를 쓰고,
 * 시각은 가장 이른 것을 쓴다 — 원문에 가장 가깝다. 9/30 원문 대조: 야후는 제휴 기사를 늦게 올린다
 * (fool.com 5건 전부 +20분), 구글은 fool.com 을 +60분으로 적은 건이 있다. FMP(뉴욕 벽시계 해석)는 원문과 같다.
 * 같은 thestreet 기사를 야후는 20:56, 구글은 17:56 으로 적었다(FMP 의 같은 영상 18:00) — 이른 쪽이 맞았다.
 * 같은 제목이라도 12시간 넘게 떨어지면 다른 기사다(날마다 같은 제목으로 나오는 정기 기사).
 */
function mergeArticles(pools: RssArticle[][]): Art[] {
    const out: Art[] = [];
    const seen = new Map<string, Art>();
    for (const a of pools.flat()) {
        const ms = Date.parse(a.published_utc);
        const tk = titleKey(a.title);
        if (!tk || !Number.isFinite(ms)) continue;
        const uk = a.url ? `u:${urlKey(a.url)}` : '';
        const hit = (uk && seen.get(uk)) || seen.get(`t:${tk}`);
        if (hit && Math.abs(hit.ms - ms) <= 12 * 3600_000) {
            // 1분 넘게 이를 때만 바꾼다 — 구글은 초를 :00 으로 적는다(16:45:12 → 16:45:00). 초 절삭은 «이른 시각»이 아니다.
            if (ms < hit.ms - 60_000) hit.ms = ms;
            if (uk) seen.set(uk, hit);
            continue;
        }
        const art: Art = { title: String(a.title).slice(0, 220), url: a.url || '', source: a.publisher?.name || '', ms, from: a._source };
        out.push(art);
        seen.set(`t:${tk}`, art);
        if (uk) seen.set(uk, art);
    }
    return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
        p.catch(() => fallback),
        new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
    ]).finally(() => clearTimeout(timer));
}

/** 이름표에 없는 종목만 벤더 회사명을 묻는다(Intrinio companies/ — 공유 캐시 1시간이라 대개 캐시 적중) */
async function namesFor(ticker: string): Promise<NewsNames> {
    if (tickerName(ticker, 'en')) return newsNamesFor(ticker);
    const vendor = await withTimeout(
        getTickerDetails(ticker).then((d: any) => String(d?.results?.name || '')), 2500, '');
    return newsNamesFor(ticker, vendor);
}

/** FMP 종목 뉴스 — 가디언과 같은 이관된 층(fmpNewsAdapter). 시각은 뉴욕 벽시계로 해석돼 온다(fmpTime). */
async function fmpPool(ticker: string): Promise<RssArticle[]> {
    const r: any = await withTimeout(getNewsFromFmp({ ticker, limit: 20 }), SOURCE_TIMEOUT_MS, null);
    return (r?.results || []).filter((n: any) => n?.title && n?.published_utc).map((n: any) => ({
        id: String(n.id || ''), title: String(n.title), description: '', published_utc: String(n.published_utc),
        publisher: { name: String(n.publisher?.name || '') }, url: String(n.article_url || ''), sourceHost: '', _source: 'fmp',
    }));
}

// ── 번역: 기사별로 저장한다 ─────────────────────────────────────────────
//   예전엔 «목록 전체»를 30분 캐시했다. 목록 캐시를 5분으로 줄이면 번역 호출이 6배가 된다.
//   그래서 번역은 기사(URL 해시) 단위로 48시간 들고, 새 기사만 모델에 보낸다.
//   종목별로 따로 둔다 — 같은 기사라도 «이 종목에 무슨 일인가»(impact)는 종목마다 다르다.
type Tr = { ko: string; ja: string; impact: string; at: number };
const trKeyOf = (ticker: string) => `ticker-news:tr:v1:${ticker}`;
const artHash = (a: Art) => createHash('sha1').update(urlKey(a.url) || titleKey(a.title)).digest('base64url').slice(0, 16);

/** 모델 출력 한 건을 검사한다 — 언어별로 따로(하나가 오염돼도 나머지는 쓴다). 실패하면 빈 문자열 → 화면은 원문 */
function checked(ai: any, title: string): Omit<Tr, 'at'> {
    const ko = String(ai?.ko || '').trim(), ja = String(ai?.ja || '').trim();
    const okKo = ko.length >= 18 && HANGUL.test(ko) && !PREDICT.test(ko)
                 && !hasGhostCompany(ko, title) && !hasBadTransliteration(ko) && !hasAdvice(ko)
                 && !inventsWeekday(ko, title);
    const okJa = ja.length >= 12 && !HANGUL.test(ja) && (KANA.test(ja) || KANJI.test(ja))
                 && !PREDICT.test(ja) && !hasAdvice(ja);
    const impact = ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(String(ai?.impact)) ? String(ai.impact) : 'NEUTRAL';
    return { ko: okKo ? ko : '', ja: okJa ? ja : '', impact };
}

async function localize(ticker: string, picked: Art[]) {
    const key = trKeyOf(ticker);
    const store: Record<string, Tr> = (await getFromCache<Record<string, Tr>>(key).catch(() => null)) || {};
    const now = Date.now();
    const hashes = picked.map(artHash);
    const need = picked.map((p, i) => ({ p, h: hashes[i] })).filter(({ h }) => {
        const t = store[h];
        return !t || ((!t.ko || !t.ja) && now - t.at > TR_RETRY_MS);
    });
    let calls = 0, failed = false;
    if (need.length) {
        calls = 1;
        try {
            const user = [
                `Ticker: ${ticker}`,
                `Headlines (${need.length}):`,
                JSON.stringify(need.map(({ p }, i) => ({ id: i + 1, title: p.title, source: p.source })), null, 1),
                'JSON only.',
            ].join('\n');
            const r = await bedrock().send(new ConverseCommand({
                modelId: LIGHT_MODEL,
                system: [{ text: SYSTEM }],
                messages: [{ role: 'user', content: [{ text: user }] }],
                inferenceConfig: { maxTokens: 2000, temperature: 0.3 },
            }));
            const txt = (r.output?.message?.content || []).map((x: any) => x.text || '').join('').trim();
            const m = txt.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(m ? m[0] : txt);
            const byId = new Map<number, any>();
            for (const it of (parsed?.items || [])) byId.set(Number(it.id), it);
            need.forEach(({ p, h }, i) => {
                const ai = byId.get(i + 1);
                if (ai) store[h] = { ...checked(ai, p.title), at: now };   // 모델이 빠뜨린 건 저장하지 않는다 → 다음 갱신에 다시
            });
        } catch {
            // 현지화가 실패해도 «원문 뉴스»는 준다. 화면이 비는 것보다 낫다.
            failed = true;
        }
        if (!failed) {
            // 48시간 넘은 것은 버리고 최근 60건만 남긴다(종목당 키 하나가 무한히 크지 않게)
            const keep = Object.entries(store)
                .filter(([, v]) => v && now - Number(v.at) < TR_TTL * 1000)
                .sort((a, b) => Number(b[1].at) - Number(a[1].at))
                .slice(0, 60);
            await setInCache(key, Object.fromEntries(keep), TR_TTL).catch(() => {});
        }
    }
    return { store, hashes, calls, reused: picked.length - need.length, requested: need.length, failed };
}

async function build(ticker: string, t0: number): Promise<{ payload: any; ttl: number }> {
    // FMP·야후는 이름이 필요 없어 먼저 출발시키고, 구글은 회사명이 정해지면 부른다.
    const fmpP = fmpPool(ticker);
    const yahooP = fetchRssPool('yahoo',
        `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker.replace('.', '-'))}&region=US&lang=en-US`,
        60, SOURCE_TIMEOUT_MS);
    const names = await namesFor(ticker);
    const googleP = names.query
        ? fetchRssPool('gnews', googleNewsSearchUrl(names.query), 100, SOURCE_TIMEOUT_MS)
        : Promise.resolve([] as RssArticle[]);
    const [fmp, yahoo, gnewsAll] = await Promise.all([fmpP, yahooP, googleP]);
    // 구글 결과는 금융·통신·경제지·기술 매체만(lib/news/company 허용 목록 — 운동화 블로그·지역 방송·13F 자동 기사 제외)
    const gnews = gnewsAll.filter((a) => isTrustedNewsHost(a.sourceHost));

    const usable = (title: string) => isAboutTicker(title, ticker, names.titleNames) && !FORECAST_HEADLINE.test(title);
    // 원천별 기여 — 밖에서 «어느 원천이 얼마나 새로운가»를 잴 수 있게 싣는다(추가 호출 없음)
    const stat = (arr: RssArticle[]) => {
        const ok = arr.filter((a) => usable(a.title));
        const newest = ok.reduce((mx, a) => Math.max(mx, Date.parse(a.published_utc) || 0), 0);
        return { n: arr.length, usable: ok.length, newest: newest ? new Date(newest).toISOString() : null };
    };
    const pool = { fmp: stat(fmp), yahoo: stat(yahoo), gnews: { ...stat(gnews), fetched: gnewsAll.length } };

    const merged = mergeArticles([fmp, yahoo, gnews]);
    const picked = merged.filter((a) => usable(a.title)).sort((a, b) => b.ms - a.ms).slice(0, MAX_ITEMS);
    const base = { ticker, pool, generatedAt: new Date().toISOString() };
    if (!picked.length) {
        // 뉴스가 없는 것은 «정상»이다. 원천이 전부 비었으면(장애일 수 있다) 1분, 아니면 5분 뒤 다시 본다.
        const reason = merged.length ? 'no-relevant' : 'no-news';
        return { payload: { ...base, items: [], localized: 0, reason, ms: Date.now() - t0 }, ttl: merged.length ? LIST_TTL : RETRY_TTL };
    }

    const tr = await localize(ticker, picked);
    const items = picked.map((p, i) => {
        const t = tr.store[tr.hashes[i]];
        return {
            id: i + 1,
            headline: p.title,          // 영어 원문 = en
            ko: t?.ko || '',            // 실패하면 빈 문자열 → 화면이 원문으로 떨어진다
            ja: t?.ja || '',
            impact: t?.impact || 'NEUTRAL',
            source: p.source,
            url: p.url,
            published: new Date(p.ms).toISOString(),
            from: p.from,               // fmp · yahoo · gnews
        };
    });
    const payload = {
        ...base, items,
        localized: items.filter((x) => x.ko).length,
        translate: { reused: tr.reused, requested: tr.requested, calls: tr.calls, failed: tr.failed },
        ms: Date.now() - t0,
    };
    return { payload, ttl: tr.failed ? RETRY_TTL : LIST_TTL };
}

/** 응답 직전에 age 를 붙인다 — 캐시에는 published 만 있다 */
function present(p: any, fromCache: boolean) {
    const now = Date.now();
    return { ...p, items: (p.items || []).map((it: any) => ({ ...it, age: ageLabel(it.published, now) })), fromCache };
}

// 같은 인스턴스에 같은 종목 요청이 겹치면 한 번만 만든다(원천·번역 호출을 겹쳐 부르지 않게)
const inflight = new Map<string, Promise<{ payload: any; ttl: number }>>();

export async function GET(req: Request) {
    const t0 = Date.now();
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get('t') || searchParams.get('ticker') || '').toUpperCase().trim();
    if (!/^[A-Z.]{1,6}$/.test(ticker)) {
        return NextResponse.json({ error: 'ticker required' }, { status: 400 });
    }

    const cacheKey = `ticker-news:v10:${ticker}`;   // v10(9/30): 원천 FMP+RSS · age 는 응답 때 계산 — v9 와 모양이 다르다
    const cached = await getFromCache<any>(cacheKey).catch(() => null);
    if (cached && Array.isArray(cached.items)) {
        return NextResponse.json(present(cached, true));
    }

    let job = inflight.get(ticker);
    if (!job) {
        job = build(ticker, t0).then(async (r) => {
            await setInCache(cacheKey, r.payload, r.ttl).catch(() => {});
            return r;
        }).finally(() => inflight.delete(ticker));
        inflight.set(ticker, job);
    }
    const { payload } = await job;
    return NextResponse.json(present(payload, false));
}
