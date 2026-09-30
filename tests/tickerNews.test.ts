/**
 * 종목 뉴스(/api/live/ticker-news) 시험 — 원천 합치기·관련성·예측/권유 필터·age·캐시·번역 재사용
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/tickerNews.test.ts
 *
 * 벤더·Redis·Bedrock·RSS 는 전부 가짜로 바꿔 끼운다(실제 호출 0). 제목과 시각은 9/29 실제 피드에서 옮겼다.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

// ── 시계 ────────────────────────────────────────────────────────────────
let clock = Date.parse('2026-09-29T23:00:00Z');
Date.now = () => clock;

// ── 가짜 Redis(TTL 지킴) ─────────────────────────────────────────────────
const mem = new Map<string, { v: any; exp: number }>();
const setCalls: { key: string; ttl?: number }[] = [];
const fakeRedis = {
    getFromCache: async (k: string) => { const e = mem.get(k); return e && e.exp > clock ? JSON.parse(JSON.stringify(e.v)) : null; },
    setInCache: async (k: string, v: any, ttl?: number) => { setCalls.push({ key: k, ttl }); mem.set(k, { v: JSON.parse(JSON.stringify(v)), exp: clock + (ttl || 1e9) * 1000 }); return true; },
};

// ── 가짜 FMP(이미 뉴욕 벽시계로 해석된 값 — 해석 자체는 tests/fmpTime.test.ts 가 본다) ──
const FMP: Record<string, any[]> = {
    MU: [
        { id: 'f1', title: 'JPMorgan Sees Micron Positioned for Beat-and-Raise Ahead of Q4 Results', published_utc: '2026-09-29T16:45:12.000Z', publisher: { name: '24/7 Wall Street' }, article_url: 'https://247wallst.com/investing/2026/09/29/jpmorgan-sees-micron' },
        { id: 'f2', title: 'I Sold My Archer Aviation Shares and Bought This Growth Stock Instead.', published_utc: '2026-09-29T18:49:11.000Z', publisher: { name: 'The Motley Fool' }, article_url: 'https://www.fool.com/investing/2026/09/29/sold-archer-aviation-bought-growth-stock-mu/' },
        { id: 'f3', title: 'Micron Q4 Preview: Market Expert Highlights $1,575 as Stock Price to Watch', published_utc: '2026-09-29T18:08:58.000Z', publisher: { name: 'Benzinga' }, article_url: 'https://www.benzinga.com/trading-ideas/previews/26/09/62061245/micron-q4-preview' },
    ],
};
let fmpCalls = 0;
const fakeFmp = { getNewsFromFmp: async ({ ticker }: any) => { fmpCalls++; return { status: 'OK', results: FMP[ticker] || [] }; }, hasFmpKey: () => true };
const fakeIntrinio = { getTickerDetails: async (tk: string) => ({ results: { name: tk === 'RGTI' ? 'Rigetti Computing Inc' : tk } }) };

// ── 가짜 Bedrock(호출 수·받은 제목 수를 센다) ─────────────────────────────
const bedrockLog: number[] = [];
let bedrockFails = false;
class ConverseCommand { input: any; constructor(i: any) { this.input = i; } }
class BedrockRuntimeClient {
    async send(cmd: any) {
        if (bedrockFails) throw new Error('ThrottlingException');
        const text: string = cmd.input.messages[0].content[0].text;
        const list = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
        bedrockLog.push(list.length);
        const items = list.map((x: any) => ({ id: x.id, ko: `마이크론 관련 소식: ${x.title.slice(0, 20)} 기사 요약입니다`, ja: `マイクロンの関連ニュースの要約です`, impact: 'NEUTRAL' }));
        return { output: { message: { content: [{ text: JSON.stringify({ items }) }] } } };
    }
}

// ── 가짜 RSS ─────────────────────────────────────────────────────────────
const item = (title: string, link: string, pub: string, source?: string, sourceUrl = 'https://www.reuters.com') =>
    `<item><title>${title}</title><link>${link}</link><pubDate>${pub}</pubDate>${source ? `<source url="${sourceUrl}">${source}</source>` : ''}<description>d</description></item>`;
const YAHOO: Record<string, string[]> = {
    MU: [
        item('Dow Jones Futures Rise With Micron, Inflation Data Due', 'https://finance.yahoo.com/m/0f05/dow-jones-futures?.tsrc=rss', 'Tue, 29 Sep 2026 22:33:48 +0000'),
        item('JPMorgan Sees Micron Positioned for Beat-and-Raise Ahead of Q4 Results', 'https://247wallst.com/investing/2026/09/29/jpmorgan-sees-micron?.tsrc=rss', 'Tue, 29 Sep 2026 16:45:12 +0000'),
        item('Why Muse is Winning the Agentic AI Race', 'https://finance.yahoo.com/technology/ai/articles/why-muse', 'Tue, 29 Sep 2026 19:07:00 +0000'),
        item('Prediction: Micron Will Do a Stock-Split Before the End of the Year', 'https://www.fool.com/p', 'Tue, 29 Sep 2026 19:35:01 +0000'),
        item('Micron’s Earnings Guidance May Look Weak Tomorrow. Buy MU Stock Anyway', 'https://247wallst.com/b', 'Tue, 29 Sep 2026 16:07:54 +0000'),
        item('Could Micron Stock Help You Become a Millionaire?', 'https://www.fool.com/m', 'Tue, 29 Sep 2026 16:05:00 +0000'),
        item('Here’s How Much Micron Stock Is Expected to Move After Earnings', 'https://www.investopedia.com/m', 'Tue, 29 Sep 2026 22:10:00 +0000'),
        item('Bullish on Micron? When a 2X ETF makes sense — and when it doesn’t', 'https://www.thestreet.com/video/bullish-on-micron?.tsrc=rss', 'Tue, 29 Sep 2026 20:56:12 +0000'),
        item('Micron item without a time zone', 'https://x.com/nozone', 'Tue, 29 Sep 2026 21:00:00'),
        item('Micron item from the future', 'https://x.com/future', 'Tue, 29 Sep 2026 23:30:00 +0000'),
    ],
};
const GOOGLE: Record<string, string[]> = {
    Micron: [
        item('JPMorgan Sees Micron Positioned for Beat-and-Raise Ahead of Q4 Results - 24/7 Wall St.', 'https://news.google.com/rss/articles/A1?oc=5', 'Tue, 29 Sep 2026 16:45:00 GMT', '24/7 Wall St.', 'https://247wallst.com'),
        item('Netlist seeks U.S. import ban on Micron chips used in Google, Nvidia AI computing - Reuters', 'https://news.google.com/rss/articles/B2?oc=5', 'Tue, 29 Sep 2026 15:50:51 GMT', 'Reuters'),
        item('Micron and Nike are on the downturn right now. Is it time to invest? - CNBC', 'https://news.google.com/rss/articles/C3?oc=5', 'Tue, 29 Sep 2026 21:35:06 GMT', 'CNBC', 'https://www.cnbc.com'),
        item('Bullish on Micron? When a 2X ETF makes sense — and when it doesn’t - thestreet.com', 'https://news.google.com/rss/articles/D4?oc=5', 'Tue, 29 Sep 2026 17:56:12 GMT', 'thestreet.com', 'https://www.thestreet.com'),
        item('Stifel cuts Stryker stock price target on revenue pressures - Investing.com', 'https://news.google.com/rss/articles/E5?oc=5', 'Tue, 29 Sep 2026 22:36:00 GMT', 'Investing.com', 'https://www.investing.com'),
        // 허용 목록 밖 매체 — 제목은 관련이 있어도 싣지 않는다(9/30 실측: 토큰화 주식 블로그)
        item('Micron Technology Tokenised BStocks Jumps As Capital Rotates To RWAs - MarketForces Africa', 'https://news.google.com/rss/articles/F6?oc=5', 'Tue, 29 Sep 2026 22:50:00 GMT', 'MarketForces Africa', 'https://marketforces.africa'),
        item('Micron: Buy At An Elite Growth Valuation - Seeking Alpha', 'https://news.google.com/rss/articles/G7?oc=5', 'Tue, 29 Sep 2026 22:40:00 GMT', 'Seeking Alpha', 'https://seekingalpha.com'),
        item('Micron Technology (MU) Stock Forecasts - Yahoo Finance', 'https://news.google.com/rss/articles/H8?oc=5', 'Tue, 29 Sep 2026 22:45:00 GMT', 'Yahoo Finance', 'https://finance.yahoo.com'),
        item('Micron: Sell-Off Deepens As Memory Prices Slip - Reuters', 'https://news.google.com/rss/articles/I9?oc=5', 'Tue, 29 Sep 2026 12:00:00 GMT', 'Reuters', 'https://www.reuters.com'),
    ],
};
const fetched: string[] = [];
(globalThis as any).fetch = async (url: string) => {
    const u = String(url);
    fetched.push(u);
    const rss = (items: string[] = []) => new Response(`<rss><channel>${items.join('')}</channel></rss>`, { status: 200 });
    const y = u.match(/feeds\.finance\.yahoo\.com\/rss\/2\.0\/headline\?s=([^&]+)/);
    if (y) return rss(YAHOO[decodeURIComponent(y[1])]);
    const g = u.match(/news\.google\.com\/rss\/search\?q=([^&]+)/);
    if (g) return rss(GOOGLE[decodeURIComponent(g[1]).replace(/ when:1d$/, '')]);
    return new Response('nope', { status: 404 });
};

// ── 모듈 바꿔 끼우기(라우트를 불러오기 전에) ───────────────────────────────
const stub = (request: string, exports: any) => {
    const file = require.resolve(request);
    const m = new (Module as any)(file);
    m.filename = file; m.loaded = true; m.exports = exports;
    require.cache[file] = m;
};
stub('../src/services/redisClient', fakeRedis);
stub('../src/services/fmpNewsAdapter', fakeFmp);
stub('../src/services/intrinioClient', fakeIntrinio);
stub('@aws-sdk/client-bedrock-runtime', { BedrockRuntimeClient, ConverseCommand });

const { GET } = require('../src/app/api/live/ticker-news/route');
const { isAboutTicker, newsNamesFor, cleanCompanyName, isTrustedNewsHost } = require('../src/lib/news/company');
const { parsePubDate, parseRssItems } = require('../src/lib/news/rss');
const call = async (tk: string) => (await GET(new Request(`https://www.signumhq.com/api/live/ticker-news?t=${tk}`))).json();

(async () => {
    console.log('━━━ 1. 회사명 규칙(lib/news/company) — 9/29 실제 제목 ━━━');
    const about = (title: string, tk: string, vendor?: string) => isAboutTicker(title, tk, newsNamesFor(tk, vendor).titleNames);
    await t('관련: 이름·별칭·(MU:NASDAQ)·$MU·세 글자 이상 맨몸 티커', () => {
        assert.ok(about("Micron's 269% Rally Is About to Face Four Big Tests", 'MU'));
        assert.ok(about('AMD takes on Nvidia with aggressive $8.2 billion bet', 'NVDA'));
        assert.ok(about("Meta & Anthropic CEOs: 'Whoever wins AI, wins'", 'META'));
        assert.ok(about('What Is The One Risk Every Google Stock Investor Should Know?', 'GOOGL'));
        assert.ok(about('Micron Q4 earnings on deck: What to expect (MU:NASDAQ)', 'MU'));
        assert.ok(about('$MU calls light up', 'MU'));
        assert.ok(about('S&P 500, Dow Extend Losses From Elevated Yield Pressure — SPCX, TGT, AAPL, MU, NTAP In Focus', 'AAPL'));
        assert.ok(about('Target’s price cuts are a sign of strength, some analysts say', 'TGT'));
        assert.ok(about('S&P 500, Dow Extend Losses From Elevated Yield Pressure', 'SPY'));
        assert.ok(about('If the Nasdaq 100 slips again', 'QQQ'));
        assert.ok(about('Rigetti Stock Soars on Quantum Deal', 'RGTI', 'Rigetti Computing Inc'));
    });
    await t('무관: 제목에 회사가 없다 · 소문자 일반어(price target) · 두 글자 맨몸 티커', () => {
        assert.ok(!about('I Sold My Archer Aviation Shares and Bought This Growth Stock Instead.', 'MU'));
        assert.ok(!about('Why Muse is Winning the Agentic AI Race', 'AAPL'));
        assert.ok(!about('Jensen Huang: AI data center push will create 1 million US jobs', 'NVDA'));
        assert.ok(!about('Stifel cuts Stryker stock price target on revenue pressures', 'TGT'));
        assert.ok(!about('A new meta-analysis of rate cuts', 'META'));
        assert.ok(!about('S&P 500, Dow Extend Losses — SPCX, TGT, AAPL, MU, NTAP In Focus', 'MU'));
    });
    await t('검색어: 이름표 이름 · 일반 단어 이름은 티커를 붙인다 · 표 밖은 벤더 이름을 따옴표로 · 모르면 구글을 건너뛴다', () => {
        assert.deepEqual(newsNamesFor('MU'), { query: 'Micron', titleNames: ['Micron'] });
        assert.deepEqual(newsNamesFor('META'), { query: 'Meta Platforms', titleNames: ['Meta Platforms', 'Meta'] });
        assert.equal(newsNamesFor('TGT').query, 'Target TGT');
        assert.equal(newsNamesFor('V').query, 'Visa NYSE:V');
        assert.deepEqual(newsNamesFor('SPY').titleNames, ['S&P 500']);
        assert.deepEqual(newsNamesFor('RGTI', 'Rigetti Computing Inc'), { query: '"Rigetti Computing"', titleNames: ['Rigetti Computing', 'Rigetti'] });
        assert.equal(newsNamesFor('ZZZZ', 'ZZZZ').query, null);
        assert.equal(cleanCompanyName('Alphabet Inc Class A'), 'Alphabet');
        assert.equal(cleanCompanyName('Micron Technology, Inc.'), 'Micron Technology');
        assert.equal(cleanCompanyName('Nebius Group NV'), 'Nebius');
    });

    console.log('━━━ 2. RSS 시각(lib/news/rss) — 시간대가 적힌 것만 ━━━');
    await t('+0000 · GMT · 초 없는 GMT · EDT 를 정확히 읽는다', () => {
        assert.equal(parsePubDate('Tue, 29 Sep 2026 22:33:48 +0000'), Date.UTC(2026, 8, 29, 22, 33, 48));
        assert.equal(parsePubDate('Tue, 29 Sep 2026 15:50:51 GMT'), Date.UTC(2026, 8, 29, 15, 50, 51));
        assert.equal(parsePubDate('Tue, 29 Sep 2026 22:16 GMT'), Date.UTC(2026, 8, 29, 22, 16, 0));
        assert.equal(parsePubDate('Tue, 29 Sep 2026 18:33:48 EDT'), Date.UTC(2026, 8, 29, 22, 33, 48));
    });
    await t('시간대 없음·10분 넘는 미래는 버린다', () => {
        assert.equal(parsePubDate('Tue, 29 Sep 2026 21:00:00'), null);
        assert.equal(parsePubDate('Tue, 29 Sep 2026 23:30:00 +0000'), null);
        assert.notEqual(parsePubDate('Tue, 29 Sep 2026 23:05:00 +0000'), null);
    });
    await t('야후의 야후 밖 링크는 그 사이트가 출처 · 구글은 « - 매체» 를 떼고 source 태그', () => {
        const y = parseRssItems(YAHOO.MU.join(''), 'yahoo', 50);
        assert.equal(y.find((a: any) => a.url.includes('247wallst')).publisher.name, '247wallst.com');
        assert.equal(y.find((a: any) => a.url.includes('finance.yahoo.com')).publisher.name, 'Yahoo Finance');
        const g = parseRssItems(GOOGLE.Micron.join(''), 'gnews', 50);
        assert.equal(g[1].title, 'Netlist seeks U.S. import ban on Micron chips used in Google, Nvidia AI computing');
        assert.equal(g[1].publisher.name, 'Reuters');
        assert.equal(g[1].sourceHost, 'reuters.com');
        assert.equal(g[0].sourceHost, '247wallst.com');
    });
    await t('구글 결과 매체 허용 목록 — 금융·통신·기술 매체만(하위 도메인 포함)', () => {
        assert.ok(isTrustedNewsHost('reuters.com') && isTrustedNewsHost('ca.finance.yahoo.com') && isTrustedNewsHost('www.cnbc.com'));
        for (const h of ['sneakerfiles.com', 'facebook.com', 'marketbeat.com', 'shopping.yahoo.com', 'sportsbook.fanduel.com', 'marketforces.africa', '']) assert.ok(!isTrustedNewsHost(h), h);
    });

    console.log('━━━ 3. 라우트 — 첫 요청(원천 셋 합치기) ━━━');
    const r1 = await call('MU');
    await t('관련·필터 통과 5건, 최신순 · 원천 우선순위(FMP > 야후 > 구글) · 중복은 한 건', () => {
        assert.deepEqual(r1.items.map((x: any) => x.headline), [
            'Dow Jones Futures Rise With Micron, Inflation Data Due',
            'Micron Q4 Preview: Market Expert Highlights $1,575 as Stock Price to Watch',
            'Bullish on Micron? When a 2X ETF makes sense — and when it doesn’t',
            'JPMorgan Sees Micron Positioned for Beat-and-Raise Ahead of Q4 Results',
            'Netlist seeks U.S. import ban on Micron chips used in Google, Nvidia AI computing',
        ]);
        assert.deepEqual(r1.items.map((x: any) => x.from), ['yahoo', 'fmp', 'yahoo', 'fmp', 'gnews']);
    });
    await t('같은 기사: 링크·출처는 FMP 원문, 시각은 초 절삭(구글 16:45:00)이 아니라 16:45:12 그대로', () => {
        const j = r1.items[3];
        assert.equal(j.url, 'https://247wallst.com/investing/2026/09/29/jpmorgan-sees-micron');
        assert.equal(j.source, '24/7 Wall Street');
        assert.equal(j.published, '2026-09-29T16:45:12.000Z');
    });
    await t('야후가 3시간 늦게 적은 thestreet 기사는 구글의 이른 시각(17:56:12)', () => {
        assert.equal(r1.items[2].published, '2026-09-29T17:56:12.000Z');
    });
    await t('예측·권유·무관 제목은 빠진다(Prediction:·Buy MU Stock·Millionaire·Is it time to invest?·Archer·Muse·Stryker)', () => {
        const all = r1.items.map((x: any) => x.headline).join('|');
        for (const w of ['Prediction', 'Buy MU Stock', 'Millionaire', 'time to invest', 'Archer', 'Muse', 'Stryker', 'time zone', 'future', 'Tokenised', 'Elite Growth', 'Stock Forecasts', 'Expected to Move']) assert.ok(!all.includes(w), w);
    });
    await t('age 는 응답 시각 기준(23:00): 26m · 4h · 5h · 6h · 7h', () => {
        assert.deepEqual(r1.items.map((x: any) => x.age), ['26m', '4h', '5h', '6h', '7h']);
    });
    await t('원천별 기여가 응답에 실린다(FMP 3건 중 2 · 야후 8건 중 3 · 구글 9건 → 허용 매체 8건 → 4건)', () => {
        assert.deepEqual([r1.pool.fmp.n, r1.pool.fmp.usable, r1.pool.yahoo.n, r1.pool.yahoo.usable, r1.pool.gnews.fetched, r1.pool.gnews.n, r1.pool.gnews.usable], [3, 2, 8, 3, 9, 8, 4]);
        assert.equal(r1.pool.yahoo.newest, '2026-09-29T22:33:48.000Z');
    });
    await t('번역: 모델 1회에 5건, 캐시에는 age 없이 published 만', () => {
        assert.deepEqual(bedrockLog, [5]);
        assert.deepEqual([r1.translate.calls, r1.translate.requested, r1.translate.reused], [1, 5, 0]);
        assert.equal(r1.localized, 5);
        const stored = mem.get('ticker-news:v10:MU')!.v;
        assert.ok(stored.items.every((x: any) => !('age' in x)));
        assert.equal(setCalls.find((c) => c.key === 'ticker-news:v10:MU')!.ttl, 300);
    });

    console.log('━━━ 4. 캐시 적중 — age 는 다시 계산, 원천·모델 호출 0 ━━━');
    clock += 3 * 60_000;
    const before = { fmp: fmpCalls, fetched: fetched.length };
    const r2 = await call('MU');
    await t('3분 뒤: fromCache · 26m → 29m · 원천·모델 호출 0', () => {
        assert.equal(r2.fromCache, true);
        assert.equal(r2.items[0].age, '29m');
        assert.deepEqual([fmpCalls, fetched.length], [before.fmp, before.fetched]);
        assert.deepEqual(bedrockLog, [5]);
    });

    console.log('━━━ 5. 5분 캐시가 끝나면 다시 모은다 — 번역은 새 기사만 ━━━');
    clock += 3 * 60_000;   // 23:06
    YAHOO.MU.push(item('Micron Stock Gains 1.3% as AI Memory Faces Earnings Reality', 'https://finance.yahoo.com/markets/stocks/articles/micron-stock-gains', 'Tue, 29 Sep 2026 23:04:00 +0000'));
    const r3 = await call('MU');
    await t('새 기사 1건만 모델로(1건) · 나머지 4건은 재사용', () => {
        assert.equal(r3.fromCache, false);
        assert.equal(r3.items[0].headline, 'Micron Stock Gains 1.3% as AI Memory Faces Earnings Reality');
        assert.equal(r3.items[0].age, 'NOW');
        assert.deepEqual(bedrockLog, [5, 1]);
        assert.deepEqual([r3.translate.requested, r3.translate.reused], [1, 4]);
        assert.equal(r3.localized, 5);
    });
    clock += 6 * 60_000;
    const r4 = await call('MU');
    await t('새 기사가 없으면 모델 호출 0', () => {
        assert.equal(r4.fromCache, false);
        assert.deepEqual(bedrockLog, [5, 1]);
        assert.deepEqual([r4.translate.calls, r4.translate.requested, r4.translate.reused], [0, 0, 5]);
    });

    console.log('━━━ 6. 실패·이름·검색어 ━━━');
    bedrockFails = true;
    YAHOO.NVDA = [item('Nvidia Stock Is Closing In on a Record High', 'https://finance.yahoo.com/n1', 'Tue, 29 Sep 2026 22:40:00 +0000')];
    const r5 = await call('NVDA');
    await t('번역 실패여도 원문은 보이고(ko 빈칸) 1분 뒤 다시 시도', () => {
        assert.equal(r5.items.length, 1);
        assert.equal(r5.items[0].ko, '');
        assert.equal(r5.translate.failed, true);
        assert.equal(setCalls.filter((c) => c.key === 'ticker-news:v10:NVDA').pop()!.ttl, 60);
    });
    bedrockFails = false;
    await call('RGTI');
    await call('TGT');
    await call('BRK.B');
    await t('표 밖 종목은 벤더 이름을 따옴표로 · Target 은 티커를 붙여 · BRK.B 는 야후 표기 BRK-B', () => {
        assert.ok(fetched.some((u) => u.includes(`q=${encodeURIComponent('"Rigetti Computing" when:1d')}`)));
        assert.ok(fetched.some((u) => u.includes(`q=${encodeURIComponent('Target TGT when:1d')}`)));
        assert.ok(fetched.some((u) => u.includes('headline?s=BRK-B&')));
    });
    await t('원천이 전부 비면 빈 목록(reason no-news)·1분 뒤 다시', async () => {
        const e = await call('ZZZZ');
        assert.deepEqual([e.items.length, e.reason], [0, 'no-news']);
        assert.equal(setCalls.filter((c) => c.key === 'ticker-news:v10:ZZZZ').pop()!.ttl, 60);
    });
    await t('잘못된 티커는 400', async () => {
        const res = await GET(new Request('https://www.signumhq.com/api/live/ticker-news?t=mu;drop'));
        assert.equal(res.status, 400);
    });
    console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
