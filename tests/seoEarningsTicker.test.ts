/**
 * 종목 페이지 «실적 시즌» 메타(TRACKER T28, 2026-10-25) — 네트워크·Redis·공급사·AI 없음.
 * 실행: node -r ./scripts/offline-test-typescript.cjs tests/seoEarningsTicker.test.ts (정식: node scripts/run-offline-tests.cjs seoEarningsTicker.test.ts)
 *
 * 지키는 것:
 *   1. 조건 — 이번 주 회사 공지 실적 + 유효한 예상 변동 + 발표 전일 때만 제목·설명이 «회사명 + 실적 + 예상 변동». 아니면 기존 메타와 «글자 하나 다르지 않게» 같다.
 *   2. 값 — 실적 주간 페이지가 보여 주는 값(viewRow.moveText)과 같은 표기 · readOnly 로만 읽는다 · 확인된 실적이 없는 종목은 저장본조차 읽지 않는다.
 *   3. 언어 — ko/ja/en 각각 현지어 회사명 · 제목 62자 상한 · 금지 표현 없음.
 *   4. 화면 — 화면 HTML(JSON-LD 제외)은 실적 메타가 켜져도 바이트 단위로 같다(화면 문구 변경 0).
 *   5. 실패 — 읽기 오류·시간 초과면 기존 메타(던지지 않는다).
 *   6. 사이트맵 — flow·실적 주간 URL 에 세 언어 + x-default 대체 링크.
 */
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

let now = Date.parse('2026-10-25T12:00:00-04:00'); // 일요일 → 실적 주간은 10/26~10/30
Date.now = () => now;
const stub = (path: string, exports: any) => {
  const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};

const rowOf = (over: Record<string, unknown> = {}): any => ({
  ticker: 'MSFT', date: '2026-10-28', hour: 'amc', etTime: null,
  impliedMovePct: 5.3, impliedExpiry: '2026-10-30', impliedBasis: 'eod', impliedSession: '2026-10-23', impliedAsOf: now - 3600_000,
  straddle: 27.6, strike: 520, spot: 520.5, impliedReason: null,
  maxPain: 525, callWall: 555, putFloor: 500, levelsExpiry: '2026-10-30', levelsChainDate: '2026-10-23', levelsAsOf: now - 3600_000,
  ...over,
});
let rows: any[] = [rowOf()];
let weekCalls: any[] = [];
let weekMode: 'ok' | 'throw' | 'hang' = 'ok';
stub('../src/services/earningsWeekService', {
  getEarningsWeek: async (opts: any) => {
    weekCalls.push(opts);
    if (weekMode === 'throw') throw new Error('redis down');
    if (weekMode === 'hang') return new Promise(() => {});
    return { range: { start: '2026-10-26', end: '2026-10-30', today: '2026-10-25', rolled: true }, rows, pending: [], listVerifiedAt: '', dataSession: '2026-10-23', dataBasis: 'eod', dataAt: null, generatedAt: now };
  },
});
stub('../src/services/structureService', { peekStructureLevelsDetailed: async () => ({ levels: new Map(), noSnapshot: [] }) });
stub('../src/services/darkPool', { getDarkPoolCurrent: async () => null });
stub('../src/services/intrinioClient', { peekEodCloseRow: async () => null });
stub('../src/lib/marketing/pageViewMark', { markPageView: async () => {} });
stub('../src/components/share/ShareLanding', { ShareLanding: () => null });
stub('../src/lib/net/publicBase', { publicBase: () => 'https://local.test' });
stub('next/headers', { headers: async () => new Headers({ 'user-agent': 'Googlebot' }), cookies: async () => ({ get: () => undefined }) });
stub('../src/services/todayPicksService', { readPicks: async () => ({ doc: null, off: false }) });
// UC 사본 — 맥스페인 레벨이 «현재 판본»(levelsFresh)으로 읽히도록 다크풀 판본 없이 사본만
globalThis.fetch = async (url: any) => {
  assert.ok(String(url).startsWith('https://local.test/api/undercurrent/ticker?'), `외부 요청 금지: ${url}`);
  const t = new URL(String(url)).searchParams.get('t');
  return Response.json({ success: true, ticker: t, hasMoneyData: true, cards: [], generatedAt: new Date(now - 600_000).toISOString(), money: { price: null, maxPain: 525, callWall: 555, putFloor: 500, darkPoolPct: 37.3, darkPoolDate: '2026-10-23' } });
};

const T = require('../src/lib/seo/earningsTicker');
const { viewRow } = require('../src/lib/earningsWeekView');
const { BANNED_WORDS } = require('../src/lib/earningsWeek');
const Page = require('../src/app/[locale]/flow/[ticker]/page');
const sitemap = require('../src/app/sitemap').default;

let checks = 0;
const ok = (name: string) => { checks++; console.log(`✓ ${name}`); };
const meta = (locale: string, ticker = 'MSFT') => Page.generateMetadata({ params: Promise.resolve({ locale, ticker }), searchParams: Promise.resolve({}) });
const html = async (locale: string, ticker = 'MSFT') => renderToStaticMarkup(await Page.default({ params: Promise.resolve({ locale, ticker }), searchParams: Promise.resolve({}) }));
const visible = (h: string) => h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
const ld = (h: string) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)![1]);

(async () => {
  // ── 회사명 표 ──
  const names = Object.entries(T.COMPANY_NAMES) as [string, { en: string; ko: string; ja: string }][];
  assert.ok(names.length >= 30, `회사명 ${names.length}개 < 30`);
  for (const [t, n] of names) {
    assert.ok(n.en && n.ko && n.ja, t);
    assert.ok(!/[぀-ヿ]/.test(n.ko), `ko 에 가나: ${t}`);
    assert.ok(!/[가-힣]/.test(n.ja), `ja 에 한글: ${t}`);
    assert.ok(!/[가-힣぀-ヿ]/.test(n.en), `en 에 한글·가나: ${t}`);
    assert.notEqual(n.en.toUpperCase(), t, `이름=티커는 넣지 않는다: ${t}`);
  }
  for (const t of ['MSFT', 'AMZN', 'GOOGL', 'INTC', 'ABBV', 'CVX', 'AAPL', 'AMD', 'V', 'META']) assert.ok(T.COMPANY_NAMES[t] || t === 'AMD', `실적 대형주 누락 ${t}`);
  assert.equal(T.nameTag('MSFT', 'ko'), '마이크로소프트(MSFT)');
  assert.equal(T.nameTag('AMZN', 'ja'), 'アマゾン(AMZN)');
  assert.equal(T.nameTag('MSFT', 'en'), 'Microsoft (MSFT)');
  assert.equal(T.nameTag('GOOGL', 'ko'), '알파벳(구글) GOOGL');
  assert.equal(T.nameTag('ZZZZ', 'ko'), 'ZZZZ');
  ok(`회사명 ${names.length}개 · 언어별 문자 · 표기 모양`);

  // ── 순수 규칙 ──
  assert.equal(T.confirmedThisWeek('MSFT', now)?.date, '2026-10-28');
  assert.equal(T.confirmedThisWeek('NVDA', now), null, 'NVDA 는 이번 주 회사 공지 없음');
  assert.equal(T.confirmedThisWeek('AAPL', now), null, 'AAPL(11/2)은 다음 주 — 실적 주간 페이지와 같은 주만');
  assert.equal(T.earningsSeo('MSFT', 'ko', null), null);
  assert.equal(T.earningsSeo('MSFT', 'ko', rowOf({ impliedMovePct: null })), null, '값 없음 → null');
  assert.equal(T.earningsSeo('MSFT', 'ko', rowOf({ impliedMovePct: 0 })), null, '0 → null');
  assert.equal(T.earningsSeo('MSFT', 'ko', rowOf({ ticker: 'AMZN' })), null, '다른 종목 행 → null');
  assert.equal(T.earningsSeo('MSFT', 'ko', rowOf(), { nowMs: Date.parse('2026-10-28T18:00:00-04:00') }), null, '장후 발표 18:00 ET 이후 → 발표 완료');
  assert.ok(T.earningsSeo('MSFT', 'ko', rowOf(), { nowMs: Date.parse('2026-10-28T17:59:00-04:00') }), '발표 직전까지는 켜짐');
  assert.equal(T.earningsSeo('ABBV', 'ko', rowOf({ ticker: 'ABBV', date: '2026-10-30', hour: 'bmo' }), { nowMs: Date.parse('2026-10-30T09:30:00-04:00') }), null, '장전 발표 09:30 ET 이후 → 완료');
  const shown = viewRow(rowOf(), 'ko', { dataSession: '2026-10-23' }, now).moveText;
  for (const loc of ['ko', 'ja', 'en']) {
    const e = T.earningsSeo('MSFT', loc, rowOf(), { maxPain: '$525' });
    assert.ok(e.titles[0].includes(shown) && e.lead.join(' ').includes(shown), `${loc}: 실적 주간 표시값 ${shown} 과 같은 표기`);
    for (const s of [...e.titles, ...e.lead]) for (const b of BANNED_WORDS) assert.ok(!b.test(s), `${loc} 금지 표현 ${b}: ${s}`);
  }
  for (const loc of ['ko', 'ja', 'en']) {
    const e = T.earningsSeo('MSFT', loc, rowOf({ method: 'event-split', impliedMovePct: 5.1, eventMovePct: 5.1 }));
    assert.ok(!/ATM|스트래들|ストラドル|straddle/i.test([...e.titles, ...e.lead].join(' ')), `${loc}: 산출 방식 이름을 붙이지 않는다(이벤트 분리값 오표기 방지)`);
    assert.ok(e.lead.join(' ').includes('±5.1%'));
  }
  const noExp = T.earningsSeo('MSFT', 'ko', rowOf({ impliedExpiry: null, impliedSession: null }));
  assert.equal(noExp.lead[1], '옵션이 반영한 예상 변동폭 ±5.3%.', '기준 정보 없으면 값만');
  const live = T.earningsSeo('MSFT', 'en', rowOf({ impliedBasis: 'live' }));
  assert.ok(live.lead[1].includes('live quotes') && !live.lead[1].includes('closing'), '장중 값은 «live quotes»');
  ok('조건(값 없음·발표 완료·다른 종목) · 표시값 일치 · 산출 방식 이름 없음 · 장중/마감 기준 · 금지 표현 없음');

  // ── 운영 경로: generateMetadata ──
  weekCalls = [];
  const m = { ko: await meta('ko'), ja: await meta('ja'), en: await meta('en') };
  assert.ok(weekCalls.length >= 1 && weekCalls.every((o) => o?.readOnly === true), '저장본 읽기 전용(readOnly)만');
  assert.equal(m.ko.title, '마이크로소프트(MSFT) 실적 옵션 예상 변동폭 ±5.3% · 10/28(수) 발표 · 맥스페인 $525');
  assert.equal(m.ja.title, 'マイクロソフト(MSFT) 決算の予想変動幅±5.3%・10/28(水)発表・マックスペイン$525');
  assert.equal(m.en.title, 'Microsoft (MSFT) Earnings Expected Move ±5.3% · Reports Oct 28');
  for (const [loc, x] of Object.entries(m)) {
    assert.ok(x.title.length <= 62, `${loc} 제목 ${x.title.length}자`);
    assert.ok(x.description.length <= 158, `${loc} 설명 ${x.description.length}자`);
    assert.equal(x.openGraph.title, x.title);
    assert.equal(x.alternates.canonical, `https://local.test/${loc}/flow/MSFT`, '캐노니컬 불변');
  }
  assert.ok(m.ko.description.startsWith('마이크로소프트(MSFT) 실적 발표 10/28(수) 장후(회사 공지). 옵션이 반영한 예상 변동폭 ±5.3% — 10/30 만기, 10/23 마감 호가 기준.'), m.ko.description);
  assert.ok(m.ja.description.startsWith('マイクロソフト(MSFT)の決算発表は10/28(水)引け後(企業告知)。オプションが織り込む予想変動幅は±5.3%(10/30満期、10/23引け気配基準)。'), m.ja.description);
  assert.ok(m.en.description.startsWith('Microsoft (MSFT) reports earnings Oct 28 after the close (company-announced). Options imply a ±5.3% move (Oct 30 expiry, Oct 23 closing quotes).'), m.en.description);
  ok(`메타 ko «${m.ko.title}» · ja · en (62자·158자 상한, OG 같은 제목, canonical 불변)`);

  // ── 화면 HTML 불변 + JSON-LD ──
  const on = { ko: await html('ko'), en: await html('en'), ja: await html('ja') };
  const ldKo = ld(on.ko);
  const ds = ldKo.find((x: any) => x['@type'] === 'Dataset');
  assert.deepEqual(ds.about, { '@type': 'Corporation', name: '마이크로소프트', alternateName: ['Microsoft', 'マイクロソフト'], tickerSymbol: 'MSFT' });
  assert.ok(!/실적|±5\.3/.test(ds.description), 'JSON-LD 에 본문에 없는 실적·예상 변동 문장 없음(구조화 데이터 지침)');
  rows = [rowOf({ impliedMovePct: null })];
  const off = { ko: await html('ko'), en: await html('en'), ja: await html('ja') };
  for (const loc of ['ko', 'en', 'ja'] as const) assert.equal(visible(on[loc]), visible(off[loc]), `${loc}: 화면 HTML 은 실적 메타와 무관하게 같다`);
  assert.deepEqual(ld(on.ko), ld(off.ko), 'JSON-LD 는 실적 메타와 무관(about 만 추가)');
  ok('화면 HTML(JSON-LD 제외) 바이트 동일 · JSON-LD 는 Corporation(about)만 추가 · 실적 문장 없음');

  // ── 값 없음 / 발표 완료 / 읽기 실패 / 시간 초과 → 기존 메타와 완전히 같다 ──
  rows = [];  // 기준선: 행 자체가 없을 때 = 기존 메타
  const base = { ko: await meta('ko'), ja: await meta('ja'), en: await meta('en') };
  assert.ok(base.ko.title.startsWith('MSFT 맥스페인'), base.ko.title);
  const same = async (why: string) => { for (const loc of ['ko', 'ja', 'en'] as const) assert.deepEqual(await meta(loc), base[loc], `${why} ${loc}`); };
  rows = [rowOf({ impliedMovePct: null })]; await same('값 없음');
  rows = [rowOf()]; now = Date.parse('2026-10-28T18:30:00-04:00'); await same('발표 완료'); now = Date.parse('2026-10-25T12:00:00-04:00');
  weekMode = 'throw'; await same('읽기 실패');
  weekMode = 'hang'; const t0 = Date.now(); const realNow = performance.now(); await same('시간 초과'); assert.ok(performance.now() - realNow < 4 * 2600, '상한 안에 기존 메타'); void t0;
  weekMode = 'ok';
  ok('값 없음·발표 완료·읽기 실패·시간 초과 → 기존 메타와 deepEqual');

  // ── 확인된 실적이 없는 종목은 저장본을 읽지 않는다 ──
  weekCalls = [];
  const nv = await meta('ko', 'NVDA');
  assert.equal(weekCalls.length, 0, 'NVDA: getEarningsWeek 호출 0');
  assert.ok(nv.title.startsWith('NVDA 맥스페인'), nv.title);
  ok('이번 주 회사 공지 없는 종목(NVDA): 읽기 0 · 기존 메타');

  // ── 사이트맵 hreflang ──
  const sm = await sitemap();
  const flow = sm.find((e: any) => e.url === 'https://local.test/ko/flow/MSFT');
  assert.deepEqual(flow.alternates, { languages: { en: 'https://local.test/en/flow/MSFT', ko: 'https://local.test/ko/flow/MSFT', ja: 'https://local.test/ja/flow/MSFT', 'x-default': 'https://local.test/en/flow/MSFT' } });
  const ew = sm.find((e: any) => e.url === 'https://local.test/ja/earnings-week');
  assert.equal(ew.alternates.languages['x-default'], 'https://local.test/en/earnings-week');
  assert.ok(!sm.find((e: any) => e.url === 'https://local.test/en/dark-pool').alternates, '다른 허브는 그대로');
  const flows = sm.filter((e: any) => /\/flow\//.test(e.url));
  assert.ok(flows.length > 1000 && flows.every((e: any) => e.alternates.languages[new URL(e.url).pathname.split('/')[1]] === e.url), '모든 flow 항목이 자기 언어 대체 링크 = 자기 URL');
  assert.equal(new Set(sm.map((e: any) => e.url)).size, sm.length, '중복 0');
  ok(`사이트맵 flow ${flows.length}개 · 실적 주간 hreflang(세 언어 + x-default) · 중복 0`);

  console.log(`전체 ${checks}개 통과`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
