/** 종목별 실적 페이지(/[locale]/earnings/[symbol])·허브·사이트맵 — 오프라인 시험. .env·HTTP·공급사·AI 없음(Redis 는 모의).
 * node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/seoEarningsPage.test.ts
 */
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

const BASE = 'https://local.test';
let checks = 0;
const test = async (name: string, fn: () => unknown) => { await fn(); checks++; console.log(`✓ ${name}`); };
const stub = (path: string, exports: unknown) => {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};

const { etDateOf } = require('../src/lib/marketCalendar');
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = etDateOf(Date.now());
const D = addDays(today, 7);           // 다가오는 발표(장후)
const EXP = addDays(D, 2);
// 회사 공지 덮기(withConfirmedDates)가 날짜를 바꾸지 않는 종목 — 공지·대기 목록 밖, 회사 신원표·flow 목록 안
const { CONFIRMED_EARNINGS, PENDING_EARNINGS } = require('../src/lib/earningsConfirmed');
const { EARNINGS_COMPANIES } = require('../src/lib/earnings/earningsCompanies');
const { FLOW_TICKERS } = require('../src/lib/seo/flowTickers');
const listed = new Set([...CONFIRMED_EARNINGS, ...PENDING_EARNINGS].map((c: any) => c.ticker));
const T = Object.keys(EARNINGS_COMPANIES).find((t) => !listed.has(t) && FLOW_TICKERS.includes(t) && /^[A-Z]{2,5}$/.test(t))!;
const N = Object.keys(EARNINGS_COMPANIES).find((t) => !listed.has(t) && t !== T && /^[A-Z]{2,5}$/.test(t))!;
const tl = T.toLowerCase();

// 공급사·외부 호출은 전부 실패로 — 한 번이라도 부르면 시험이 깨진다
let fetchCalls = 0;
globalThis.fetch = (async () => { fetchCalls++; throw new Error('Unexpected external request'); }) as any;

const calendar = {
  ok: true, generatedAt: new Date().toISOString(), universe: 3, source: 'test', from: today, to: addDays(today, 120), probe: {}, truncated: [], windows: 1, vendorFields: [], hourFilled: 0, hourSource: '',
  rows: [
    { ticker: T, date: D, hour: 'amc', epsEstimate: 1, revenueEstimate: 1, quarter: 3, year: 2026 },
    { ticker: T, date: addDays(D, 90), hour: 'amc', epsEstimate: 1, revenueEstimate: 1, quarter: 4, year: 2026 },
    { ticker: N, date: addDays(today, 70), hour: '', epsEstimate: 1, revenueEstimate: 1, quarter: 1, year: 2027 },
    { ticker: 'ZZZZ', date: D, hour: 'amc', epsEstimate: 1, revenueEstimate: 1, quarter: 1, year: 2027 },
  ],
};
const pack = { v: 1, at: Date.now(), day: today, cells: { [`${T}|${D}`]: { p: 8.4, e: EXP, b: 'eod', s: today, r: null, f: EXP, method: 'weekly' } } };
// 채점표 API 운영 값과 같은 모양(LRCX 10/21 장후 · 예상 7.1 → 실제 −11.7557)
const lrcx = {
  v: 1, ticker: 'LRCX', date: '2026-10-21', hour: 'amc', at: Date.parse('2026-11-05T10:48:56Z'),
  expected: { pct: 7.1, method: 'weekly', straddlePct: 7.1, expiry: '2026-10-23', session: '2026-10-21', basis: 'eod', strike: 150, straddle: 10.65, spot: 150, capturedAt: Date.parse('2026-11-05T10:48:56Z'), src: 'eod-chain' },
  actual: { pct: -11.7557, baseDate: '2026-10-21', baseClose: 150, reactDate: '2026-10-22', reactClose: 132.37, src: 'intrinio-daily', check: 'fmp', at: Date.parse('2026-11-05T10:48:56Z') },
};
let storeDown = false;
let recordsDown = false;
let packDown = false;
let calendarDown = false;
const reads: string[] = [];
stub('../src/services/redisClient', {
  getFromCache: async (key: string) => {
    reads.push(key);
    if (storeDown) throw new Error('down');
    if (key.startsWith('market:earnings-calendar:v4') && calendarDown) throw new Error('down');
    if (key === 'market:earnings-calendar:v4') return calendar;
    if (key === 'earnings:implied:v1') { if (packDown) throw new Error('down'); return pack; }
    return null;
  },
  mgetFromCacheStrict: async (keys: string[]) => {
    reads.push(...keys);
    if (storeDown || recordsDown) throw new Error('down');
    // IONQ 11/5 는 회사 공지가 장후(amc) — 장전(bmo)으로 남은 옛 기록은 채점표처럼 빠져야 한다
    return keys.map((k) => (k === 'earnings:actuals:v1:LRCX:2026-10-21' ? lrcx
      : k === 'earnings:actuals:v1:IONQ:2026-11-05' ? { ...lrcx, ticker: 'IONQ', date: '2026-11-05', hour: 'bmo', expected: { ...lrcx.expected, session: '2026-11-04' }, actual: { ...lrcx.actual, baseDate: '2026-11-04', reactDate: '2026-11-05' } } : null));
  },
  setInCache: async () => { throw new Error('Unexpected Redis write'); },
});
stub('../src/lib/net/publicBase', { publicBase: () => BASE });
stub('../src/lib/marketing/pageViewMark', { markPageView: async () => {} });
stub('../src/services/todayPicksService', { readPicks: async () => ({ doc: null, off: false }) });

const EP = require('../src/lib/seo/earningsPage');
const svc = require('../src/services/earningsPageService');
const page = require('../src/app/[locale]/earnings/[symbol]/page');
const hub = require('../src/app/[locale]/earnings/page');
const sitemap = require('../src/app/sitemap').default;
const { BANNED_WORDS } = require('../src/lib/earningsWeek');
const { normalizeFrom } = require('../src/lib/marketing/storeRedirect');
const props = (locale: string, symbol: string) => ({ params: Promise.resolve({ locale, symbol }) });
const html = async (locale: string, symbol: string) => renderToStaticMarkup(await page.default(props(locale, symbol)));

(async () => {
  await test('유니버스: 회사 신원표 ∪ 회사 공지 · 점·소문자·가짜 티커 제외', () => {
    assert.ok(EP.EARNINGS_PAGE_TICKERS.length >= 150, String(EP.EARNINGS_PAGE_TICKERS.length));
    for (const t of ['NVDA', 'AAPL', 'LRCX', 'TSLA', T, N]) assert.ok(EP.isEarningsPageTicker(t), t);
    for (const t of ['ZZZZ', 'nvda', 'BRK.B', 'NULL', '', 'ABCDEF']) assert.ok(!EP.isEarningsPageTicker(t), t);
  });
  await test('예상 변동폭 있는 종목(T) — 3언어 서버 렌더 숫자·index·canonical·hreflang·FAQ JSON-LD', async () => {
    for (const l of ['ko', 'en', 'ja']) {
      const h = await html(l, T);
      assert.ok(h.includes('±8.4%'), `${l} expected move rendered`);
      assert.ok(h.includes(`data-next="${D}"`));
      assert.ok(h.includes(`href="/app?from=seo_${tl}&amp;l=${l}"`), 'smart link');
      assert.ok(h.includes('"@type":"FAQPage"'));
      assert.ok(h.includes(`href="/${l}/flow/${T}"`), 'flow cross-link');
      for (const re of BANNED_WORDS) assert.ok(!re.test(h), `${l} banned ${re}`);
      const m = await page.generateMetadata(props(l, T));
      assert.notEqual(m.robots.index, false);
      assert.equal(m.alternates.canonical, `${BASE}/${l}/earnings/${T}`);
      assert.equal(m.alternates.languages['x-default'], `${BASE}/en/earnings/${T}`);
      assert.equal(m.alternates.languages.ja, `${BASE}/ja/earnings/${T}`);
      assert.match(m.title, /±8\.4%/);
    }
    // 한국어·일본어 검색어(«엔비디아 실적 발표일»·«エヌビディア 決算発表日»·«예상 변동폭»)가 제목 앞쪽에
    const kD = `${Number(D.slice(5, 7))}월 ${Number(D.slice(8, 10))}일`, jD = `${Number(D.slice(5, 7))}月${Number(D.slice(8, 10))}日`;
    const mko = await page.generateMetadata(props('ko', T));
    assert.equal(mko.title, `${EARNINGS_COMPANIES[T].ko}(${T}) 실적 발표일 ${kD}(예정) · 예상 변동폭 ±8.4% | SIGNUM HQ`);
    assert.match(mko.description, new RegExp(`실적 발표일은 ${kD}\\(예정\\), 한국 시간 \\d+월 \\d+일\\(.\\) 0[56]:00 이후\\.`));
    const mja = await page.generateMetadata(props('ja', T));
    assert.equal(mja.title, `${EARNINGS_COMPANIES[T].ja}(${T}) 決算発表日 ${jD}(予定)・予想変動幅±8.4% | SIGNUM HQ`);
    assert.match(mja.description, /日本時間 \d+月\d+日\(.\) [56]:00以降。/);
    assert.match((await page.generateMetadata(props('en', T))).title, /Earnings Date .+ · Expected Move ±8\.4%/);
    // h1·FAQ(JSON-LD 와 화면 같은 배열) — 발표일·한국 시간·방향 아님
    const hk = await html('ko', T);
    assert.ok(hk.includes(`${EARNINGS_COMPANIES[T].ko}(${T}) 실적 발표일·예상 변동폭 vs 실제</h1>`), 'ko h1');
    assert.ok(hk.includes('실적 발표 시간은 한국 시간으로 몇 시인가요?') && hk.includes('뉴욕 기준 장 마감 후, 한국 시간'), 'ko time FAQ');
    assert.ok(hk.includes('주가가 오른다는 뜻인가요, 내린다는 뜻인가요?') && hk.includes('방향은 담겨 있지 않습니다'), 'ko direction FAQ');
    const ld = JSON.parse(hk.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
    const faqLd = ld['@graph'].find((x: any) => x['@type'] === 'FAQPage');
    assert.equal(faqLd.mainEntity.length, 5);
    assert.ok(faqLd.mainEntity.some((q: any) => /한국 시간으로 몇 시/.test(q.name)));
    const hj = await html('ja', T);
    assert.ok(hj.includes('決算発表日・予想変動幅と実際</h1>') && hj.includes('日本時間で何時ですか') && hj.includes('class="ep-local">日本時間 '));
  });
  await test('현지 시각 — 장후 16:00/장전 09:30 ET 경계 · 공지 시각 · 서머타임 · 시각 미정 null', () => {
    assert.equal(EP.localWhenText({ date: '2026-11-17', hour: 'amc' }, 'ko'), '한국 시간 11월 18일(수) 06:00 이후');
    assert.equal(EP.localWhenText({ date: '2026-11-17', hour: 'bmo' }, 'ko'), '한국 시간 11월 17일(화) 23:30 이전');
    assert.equal(EP.localWhenText({ date: '2026-11-17', hour: 'amc', etTime: '16:20' }, 'ja'), '日本時間 11月18日(水) 6:20');
    assert.equal(EP.localWhenText({ date: '2026-08-26', hour: 'amc' }, 'ko'), '한국 시간 8월 27일(목) 05:00 이후', 'EDT');
    assert.equal(EP.localWhenText({ date: '2026-11-27', hour: 'amc' }, 'ko'), '한국 시간 11월 28일(토) 03:00 이후', 'early close 13:00 ET');
    assert.equal(EP.EP_COPY.en.timeLine({ date: '2026-11-27', hour: 'amc' }), 'The report is scheduled after the close (after 1:00 p.m. ET).');
    assert.equal(EP.EP_COPY.en.timeLine({ date: '2026-11-17', hour: 'amc' }), 'The report is scheduled after the close (after 4:00 p.m. ET).');
    assert.equal(EP.releasedByExactTime({ date: '2026-11-17', etTime: '16:20' }, Date.parse('2026-11-17T21:19:00Z')), false);
    assert.equal(EP.releasedByExactTime({ date: '2026-11-17', etTime: '16:20' }, Date.parse('2026-11-17T21:20:00Z')), true);
    assert.equal(EP.releasedByExactTime({ date: '2026-11-17' }, Date.parse('2026-11-18T21:20:00Z')), false);
    assert.equal(EP.localWhenText({ date: '2026-11-17', hour: '' }, 'ko'), null);
    assert.equal(EP.localWhenText({ date: '2026-11-17', hour: 'amc' }, 'en'), null);
    const w = EP.weekWindows(Date.parse('2026-11-13T20:00:00Z')); // 금 15:00 ET
    assert.deepEqual(w, { thisWeek: ['2026-11-13', '2026-11-15'], nextWeek: ['2026-11-16', '2026-11-22'] });
    const s = EP.weekWindows(Date.parse('2026-11-15T20:00:00Z')); // 일
    assert.deepEqual(s, { thisWeek: ['2026-11-15', '2026-11-15'], nextWeek: ['2026-11-16', '2026-11-22'] });
  });
  await test('채점만 있는 종목(LRCX) — 예상 ±7.1% → 실제 −11.8% 범위 밖 · index', async () => {
    const h = await html('ko', 'LRCX');
    assert.ok(h.includes('±7.1%') && h.includes('−11.8%') && h.includes('범위 밖'), 'scorecard row');
    assert.ok(h.includes('10/21 종가 → 10/22 종가'));
    assert.notEqual((await page.generateMetadata(props('ko', 'LRCX'))).robots.index, false);
    assert.ok((await html('en', 'LRCX')).includes('Outside range'));
    assert.equal((await page.generateMetadata(props('ko', 'IONQ'))).robots.index, false, 'hour mismatch with the company notice is not graded');
    assert.ok(!(await html('ko', 'IONQ')).includes('−11.8%'));
  });
  await test('데이터 없는 종목(N: 예정일만) — noindex,follow · 사이트맵 제외', async () => {
    const m = await page.generateMetadata(props('ko', N));
    assert.equal(m.robots.index, false); assert.equal(m.robots.follow, true);
    const h = await html('ko', N);
    assert.ok(h.includes('예정일(회사 공지 전)') && h.includes('data-indexable="0"'));
  });
  await test('잘못된 주소 — 모르는 티커 404 · 소문자는 대문자로 영구 이동', async () => {
    await assert.rejects(page.default(props('ko', 'ZZZZ')), /NEXT_HTTP_ERROR_FALLBACK;404/);
    await assert.rejects(page.default(props('ko', 'BRK.B')), /NEXT_HTTP_ERROR_FALLBACK;404/);
    await assert.rejects(page.default(props('ko', 'nvda')), (e: any) => /NEXT_REDIRECT/.test(e.digest || e.message) && /\/ko\/earnings\/NVDA/.test(e.digest || ''));
  });
  await test('사이트맵 — 허브 3 + index 종목만 ×3(hreflang) · noindex 종목 없음', async () => {
    const all = await sitemap();
    const ep = all.filter((e: any) => /^\/(ko|en|ja)\/earnings(\/|$)/.test(new URL(e.url).pathname));
    const urls = ep.map((e: any) => new URL(e.url).pathname).sort();
    const want = ['ko', 'en', 'ja'].flatMap((l) => [`/${l}/earnings`, `/${l}/earnings/LRCX`, `/${l}/earnings/${T}`]).sort();
    assert.deepEqual(urls, want);
    const nv = ep.find((e: any) => e.url === `${BASE}/ko/earnings/${T}`);
    assert.equal(nv.alternates.languages.en, `${BASE}/en/earnings/${T}`);
  });
  await test('허브 — 다가오는 T ±8.4% · 최근 채점 LRCX · 전체 종목 링크', async () => {
    const h = renderToStaticMarkup(await hub.default({ params: Promise.resolve({ locale: 'ja' }) }));
    assert.ok(h.includes(`href="/ja/earnings/${T}"`) && h.includes('±8.4%'));
    assert.ok(h.includes('href="/ja/earnings/LRCX"') && h.includes('範囲外'));
    assert.ok(h.includes('href="/ja/earnings/TSLA"') && h.includes('テスラ(TSLA)</a>'), 'named chip');
    const m = await hub.generateMetadata({ params: Promise.resolve({ locale: 'ja' }) });
    assert.equal(m.alternates.canonical, `${BASE}/ja/earnings`);
    // 이번 주·다음 주 — T(오늘+7)는 다음 주 또는 그다음(주 경계)에, N(오늘+70)은 없음
    const hk = renderToStaticMarkup(await hub.default({ params: Promise.resolve({ locale: 'ko' }) }));
    assert.ok(hk.includes('이번 주 실적 발표 종목') && hk.includes('다음 주 실적 발표 종목'));
    const w = EP.weekWindows(Date.now());
    const inNext = D >= w.nextWeek[0] && D <= w.nextWeek[1];
    assert.equal(hk.includes(`data-week-ticker="${T}"`), inNext);
    assert.ok(!hk.includes(`data-week-ticker="${N}"`));
    const mk = await hub.generateMetadata({ params: Promise.resolve({ locale: 'ko' }) });
    assert.match(mk.title, /실적 발표일·예상 변동폭/);
    if (inNext) assert.ok(mk.description.startsWith(`이번 주·다음 주 실적 발표: ${EARNINGS_COMPANIES[T].ko} ${Number(D.slice(5, 7))}/${Number(D.slice(8, 10))}(예정)`), mk.description);
  });
  await test('저장소 장애 — 던지지 않고 «지금 읽지 못함» + noindex(얇은 페이지·거짓 0 금지)', async () => {
    svc._resetEarningsPageMemo(); storeDown = true;
    const h = await html('ko', T);
    assert.ok(h.includes('실적 캘린더를 지금 읽지 못했습니다'));
    assert.ok(!h.includes('아직 다음 발표 일정이 없습니다'), 'FAQ/JSON-LD does not claim «no date» when unread');
    assert.equal((await page.generateMetadata(props('ko', T))).robots.index, false);
    const all = await sitemap();
    assert.equal(all.filter((e: any) => /^\/(ko|en|ja)\/earnings(\/|$)/.test(new URL(e.url).pathname)).length, 0, 'no noindex hub/pages in sitemap');
    assert.equal((await hub.generateMetadata({ params: Promise.resolve({ locale: 'ko' }) })).robots.index, false);
    storeDown = false; svc._resetEarningsPageMemo();
  });
  await test('부작용 — 공급사 HTTP 0 · 쓰기 0 · 읽기 키는 캘린더·묶음·채점 기록뿐 · 메모로 반복 읽기 없음', async () => {
    assert.equal(fetchCalls, 0);
    assert.ok(reads.every((k) => k.startsWith('market:earnings-calendar:v4') || k === 'earnings:implied:v1' || k.startsWith('earnings:actuals:v1:')), reads.find((k) => !(k.startsWith('market:') || k.startsWith('earnings:'))));
    svc._resetEarningsPageMemo(); reads.length = 0;
    for (let i = 0; i < 5; i++) await html('en', T);
    const n = reads.length;
    await html('en', 'LRCX'); await sitemap();
    assert.equal(reads.length, n, 'one snapshot serves every page and the sitemap');
  });
  await test('오늘 발표가 끝나면 다음 일정으로 · 끝난 발표만 있으면 그 발표(발표 완료 안내)', () => {
    const snap = { ...EP.emptySnapshot(), calendarOk: true, recordsOk: true,
      next: { [T]: [{ ticker: T, date: '2026-11-12', hour: 'bmo' }, { ticker: T, date: '2027-02-10', hour: 'amc' }], [N]: [{ ticker: N, date: '2026-11-12', hour: 'bmo' }] } };
    const at = Date.parse('2026-11-12T16:00:00Z'); // 11:00 ET — 장전 발표는 끝났다
    assert.equal(EP.buildEarningsPageView(T, snap, at).next.date, '2027-02-10');
    const v = EP.buildEarningsPageView(N, snap, at);
    assert.equal(v.next.date, '2026-11-12'); assert.equal(v.next.phase, 'done');
    assert.equal(EP.buildEarningsPageView(T, snap, Date.parse('2026-11-12T12:00:00Z')).next.date, '2026-11-12', 'before the open it is still today');
  });
  await test('채점 기록만 못 읽음 — «기록 없음»이라 하지 않고 일부 집계 없음 · 예상 변동폭 종목은 그대로 index', async () => {
    svc._resetEarningsPageMemo(); recordsDown = true;
    const h = await html('ko', 'LRCX');
    assert.ok(h.includes('채점 기록을 지금 읽지 못했습니다') && !h.includes('아직 완성된 채점 기록이 없습니다'));
    assert.equal((await page.generateMetadata(props('ko', 'LRCX'))).robots.index, false);
    assert.notEqual((await page.generateMetadata(props('ko', T))).robots.index, false);
    const hh = renderToStaticMarkup(await hub.default({ params: Promise.resolve({ locale: 'ko' }) }));
    assert.ok(hh.includes('채점 기록을 지금 읽지 못했습니다'), 'hub separates outage from «nothing to show»');
    recordsDown = false; svc._resetEarningsPageMemo();
  });
  await test('예상 변동폭 묶음만 못 읽음 — 종목·FAQ·허브 모두 «읽지 못함»(«아직 없음» 아님)', async () => {
    svc._resetEarningsPageMemo(); packDown = true;
    const h = await html('ko', T);
    assert.ok(h.includes('옵션 예상 변동폭 자료를 지금 읽지 못했습니다') && !h.includes('아직 표시할 옵션 예상 변동폭이 없습니다'));
    const hh = renderToStaticMarkup(await hub.default({ params: Promise.resolve({ locale: 'ko' }) }));
    assert.ok(hh.includes('옵션 예상 변동폭 자료를 지금 읽지 못했습니다'));
    packDown = false; svc._resetEarningsPageMemo();
  });
  await test('캘린더만 못 읽음 — 묶음이 있어도 발표 행을 몰라 예상 변동폭도 «읽지 못함»', async () => {
    svc._resetEarningsPageMemo(); calendarDown = true;
    const h = await html('en', T);
    assert.ok(h.includes('could not be read right now') && !h.includes('No options-implied move to show yet'));
    calendarDown = false; svc._resetEarningsPageMemo();
  });
  await test('시간 초과 — 15분 안의 직전 묶음만 대신 주고, 더 오래되면 빈 묶음(«읽지 못함»)', async () => {
    svc._resetEarningsPageMemo();
    const t0 = Date.now();
    const good = await svc.readEarningsPageSnapshot(t0);
    assert.ok(good.calendarOk);
    storeDown = true; // build 는 실패 칸을 비운 채 끝난다 → 부분 묶음은 30초 메모. 시간 초과 경로는 build 를 막아 재현
    const realRace = Promise.race;
    (Promise as any).race = (ps: any[]) => realRace.call(Promise, [ps[1]]); // 상한 타이머만 이기게
    try {
      const old = svc.EARNINGS_PAGE_STALE_MAX_MS;
      const realNow = Date.now;
      try {
        Date.now = () => t0 + 6 * 60_000;
        assert.equal((await svc.readEarningsPageSnapshot(t0 + 6 * 60_000)).calendarOk, true, '6 min old snapshot served on timeout');
        Date.now = () => t0 + old + 1; // 요청 시작은 15분 안이어도 응답 시점에 넘으면 빈 묶음
        assert.equal((await svc.readEarningsPageSnapshot(t0 + old - 1000)).calendarOk, false, 'too old at response time → empty');
      } finally { Date.now = realNow; }
    } finally { (Promise as any).race = realRace; storeDown = false; svc._resetEarningsPageMemo(); }
  });
  await test('스마트링크 from 태그 — normalizeFrom 통과(24자 이내) 전 종목', () => {
    for (const t of EP.EARNINGS_PAGE_TICKERS) {
      const from = new URL(`https://x${EP.earningsAppHref(t, 'ko')}`).searchParams.get('from');
      assert.equal(normalizeFrom(from), from, t);
    }
  });
  console.log(`총 ${checks}개 묶음 통과 (오프라인)`);
})().catch((e) => { console.error(e); process.exit(1); });
