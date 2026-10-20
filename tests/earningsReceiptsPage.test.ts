// 오프라인 시험. 실제 저장소·환경 파일·외부 API를 사용하지 않는다.
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { actualsKey } from '../src/lib/earnings/earningsActuals';
import { CONFIRMED_EARNINGS } from '../src/lib/earningsConfirmed';
import { selectWeekEntries } from '../src/lib/earningsWeek';
import { RECEIPT_COPY } from '../src/lib/earnings/earningsReceiptsCopy';
import { record, NOW } from './earningsScorecardFixture';

const store = new Map<string, unknown>();
let reads = 0, writes = 0, fail = false, keys: string[] = [], fontAttempts = 0;
const stub = (path: string, exports: unknown) => {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
};
stub('../src/services/redisClient', {
  mgetFromCache: async (ks: string[]) => {
    reads++; keys = ks;
    if (fail) throw new Error('시험용 저장소 장애');
    return ks.map((k) => store.get(k) ?? null);
  },
  setInCache: () => { writes++; throw new Error('쓰기 금지'); },
  getFromCache: () => { throw new Error('예상하지 않은 읽기'); },
});
stub('../src/lib/net/publicBase', { publicBase: () => 'https://local.test' });
stub('../src/services/todayPicksService', { readPicks: async () => ({ doc: null, off: false }) });
stub('../src/lib/share/share', { shareBeacon: () => { throw new Error('공유 비콘 금지'); } });
const realFetch = globalThis.fetch, realNow = Date.now;
globalThis.fetch = async (url) => {
  assert.match(String(url), /^https:\/\/fonts\.googleapis\.com\//, '공급사·운영 API 호출 금지');
  fontAttempts++;
  throw new Error('오프라인 글꼴 장애');
};
Date.now = () => NOW;
const page = require('../src/app/[locale]/receipts/earnings/page') as typeof import('../src/app/[locale]/receipts/earnings/page');
const og = require('../src/app/[locale]/receipts/earnings/og/route') as typeof import('../src/app/[locale]/receipts/earnings/og/route');
const { ShareLanding } = require('../src/components/share/ShareLanding') as typeof import('../src/components/share/ShareLanding');
const { readEarningsReceipts } = require('../src/services/earningsReceiptsService') as typeof import('../src/services/earningsReceiptsService');
const props = (locale: string, week?: string) => ({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ week }) });
const html = async (locale: string, week?: string) => renderToStaticMarkup(await page.default(props(locale, week)));
let n = 0;
// 앞선 검사가 통과한 경우 --from=N으로 실패 지점부터 남은 검사만 실행한다.
const fromTest = Number(process.argv.find((arg) => arg.startsWith('--from='))?.slice(7) ?? 1);
let index = 0;
const test = async (name: string, fn: () => unknown) => {
  if (++index < fromTest) return;
  await fn(); n++; console.log(`✓ ${name}`);
};

(async () => {
  await test('데이터 주: 동일 확정 집합 MGET 1회, 실제 가격·시각·만기·모든 결측 행 유지', async () => {
    store.set(actualsKey('JPM', '2026-10-13'), record());
    const late = record('JNJ'); late.expected!.src = 'eod-chain';
    store.set(actualsKey('JNJ', '2026-10-13'), late);
    const before = reads;
    const data = await readEarningsReceipts('2026-10-12');
    assert.equal(reads - before, 1);
    const entries = selectWeekEntries(CONFIRMED_EARNINGS, '2026-10-12', '2026-10-18');
    assert.deepEqual(keys, entries.map((e) => actualsKey(e.ticker, e.date)));
    assert.equal(data.rows.length, entries.length);
    assert.equal(data.summary.pre, 1); assert.equal(data.summary.backfilled, 1);
    assert.ok(data.summary.missing > 0);
    const h = await html('ko', '2026-10-12');
    for (const value of ['±3.0%', '−2.0%', '$100.00', '$98.00', '2026-10-16',
      '2026-10-12T20:00:00.000Z', 'data-provenance="backfilled"', '사후 보강', '기록 없음']) assert.ok(h.includes(value), value);
    assert.equal((h.match(/<tr[^>]*data-provenance=/g) ?? []).length, entries.length);
    for (const e of entries) assert.ok(h.includes(`/ko/flow/${e.ticker}`));
  });
  await test('3언어 SSR: 카드·표·데이터 행 일치, 큰 요약 숫자·문자 배지·접힌 상세 보존', async () => {
    store.set(actualsKey('C', '2026-10-13'), record('C', 3, 3.0001));
    const data = await readEarningsReceipts('2026-10-12');
    const beforeSource = execFileSync('git', ['show', 'HEAD:src/app/[locale]/receipts/earnings/page.tsx'], { encoding: 'utf8' });
    const beforeJs = ts.transpileModule(beforeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const before: { default?: typeof page.default } = {};
    vm.runInNewContext(beforeJs, { exports: before, require });
    for (const l of ['ko', 'en', 'ja'] as const) {
      const h = await html(l, '2026-10-12'), c = RECEIPT_COPY[l];
      const cards = h.match(/<article class="er-card"[\s\S]*?<\/article>/g) ?? [];
      const table = h.match(/<table>[\s\S]*?<\/table>/)![0];
      assert.equal(cards.length, data.rows.length);
      assert.equal((table.match(/<tr[^>]*data-provenance=/g) ?? []).length, cards.length);
      const oldHtml = renderToStaticMarkup(await before.default!(props(l, '2026-10-12')));
      assert.equal(table, oldHtml.match(/<table>[\s\S]*?<\/table>/)![0], '기존 표 HTML 바이트 일치');
      for (const [i, row] of data.rows.entries()) {
        const card = cards[i];
        assert.ok(card.includes(`/${l}/flow/${row.ticker}`));
        assert.ok(card.includes(row.date));
        assert.ok(card.includes(`data-provenance="${row.provenance}"`));
        assert.ok(card.includes(c.provenance[row.provenance]));
        assert.ok(card.includes(`<details><summary>${c.details}</summary>`), '기본 접힌 상세');
        assert.doesNotMatch(card, /<details[^>]*\bopen\b/);
        assert.ok(card.includes(c.source));
        const label = row.beyond == null ? c.notCompared : row.beyond ? c.outside : c.within;
        assert.match(card, new RegExp(`class="er-badge"[^>]*>${label}</span>`));
        for (const issue of row.issues) assert.ok(card.includes(c.issues[issue]), issue);
        if (row.expected) {
          for (const value of [c.captured, c.session, c.expiry, row.expected.expiry,
            row.expected.session, row.expected.src, new Date(row.expected.capturedAt).toISOString()]) assert.ok(card.includes(value), value);
        } else assert.ok(card.includes(c.noRecord));
        if (row.actual) {
          for (const value of [c.price, c.calculated, row.actual.baseDate, row.actual.reactDate]) assert.ok(card.includes(value), value);
        } else assert.ok(card.includes(c.noRecord));
        if (row.beyond != null && row.provenance !== 'pre') assert.ok(card.includes(c.provisional));
      }
      assert.ok(cards.some((card) => card.includes(`>${c.within}</span>`)));
      assert.ok(cards.some((card) => card.includes(`>${c.outside}</span>`) && card.includes('+3.0001%')));
      assert.ok(cards.some((card) => card.includes('data-provenance="missing"')));
      assert.ok(h.indexOf('class="er-mobile-summary"') < h.indexOf('class="er-cards"'));
      for (const key of Object.keys(c.summaryLabels) as (keyof typeof data.summary)[]) {
        assert.ok(h.includes(`data-summary="${key}"><dt>${c.summaryLabels[key]}</dt><dd>${data.summary[key]}</dd>`));
      }
      assert.ok(h.includes('@media(min-width:640px){.er-scroll,.er-table-summary{display:block}.er-cards,.er-mobile-summary{display:none}}'));
    }
  });
  await test('3언어 실제 서버 렌더·방법·설치 컴포넌트·주 선택 보존', async () => {
    for (const l of ['ko', 'en', 'ja'] as const) {
      const h = await html(l, '2026-10-12'), c = RECEIPT_COPY[l];
      assert.ok(h.includes(c.title)); assert.ok(h.includes(c.method));
      assert.ok(h.includes('120')); assert.ok(h.includes(`from=receipts&amp;l=${l}`));
      assert.ok(h.includes(`/${l}/receipts/earnings`));
      assert.ok(h.includes('value="2026-10-12" selected=""'));
      for (const other of ['ko', 'en', 'ja']) assert.ok(h.includes(`/${other}/receipts/earnings?week=2026-10-12`));
      assert.ok(!h.includes('from=share'));
    }
  });
  await test('결측 주는 빈 표 대신 각 행에 이유, 일정 없는 주는 명시적 기록 없음', async () => {
    store.clear();
    const missing = await html('ko', '2026-10-12');
    assert.ok(missing.includes('120일 보관 만료')); assert.ok(!missing.includes('±0.0%'));
    const data = await readEarningsReceipts('2026-10-12');
    for (const l of ['ko', 'en', 'ja'] as const) {
      const h = await html(l, '2026-10-12'), c = RECEIPT_COPY[l];
      const cards = h.match(/<article class="er-card"[\s\S]*?<\/article>/g) ?? [];
      assert.equal(cards.length, data.rows.length);
      for (const [i, card] of cards.entries()) {
        for (const issue of data.rows[i].issues) assert.ok(card.includes(c.issues[issue]), issue);
        assert.ok(card.includes(c.notCompared));
        assert.ok(card.includes('data-provenance="missing"'));
        assert.doesNotMatch(card, /±0\.0%|<strong>[+−]?0\.0%/);
      }
    }
    const empty = await html('ko', '2026-01-05');
    assert.ok(empty.includes('기록 없음 (이 주의 확정 일정이 등록되어 있지 않음)'));
    assert.ok(!empty.includes('<table'));
  });
  await test('전파된 읽기 장애와 조용한 null 응답 모두 이유 표시, 가짜 비교값 없음', async () => {
    fail = true;
    const h = await html('ko', '2026-10-12');
    assert.ok(h.includes('저장소 읽기 실패')); assert.ok(!h.includes('±3.0%'));
    fail = false;
    const data = await readEarningsReceipts('2026-10-12');
    assert.equal(data.summary.pre, 0); assert.equal(data.summary.missing, data.summary.total);
    assert.ok((await html('en', '2026-10-12')).includes('unavailable storage'));
  });
  await test('메타데이터는 주별 canonical·3언어·기본 en·같은 주 OG 연결', async () => {
    for (const l of ['ko', 'en', 'ja']) {
      const m = await page.generateMetadata(props(l, '2026-10-05'));
      assert.equal(m.alternates?.canonical, `https://local.test/${l}/receipts/earnings?week=2026-10-05`);
      assert.equal(m.alternates?.languages?.['x-default'], 'https://local.test/en/receipts/earnings?week=2026-10-05');
      assert.ok(JSON.stringify(m.openGraph).includes('/og?week=2026-10-05'));
    }
    const m = await page.generateMetadata(props('unsupported', 'bad'));
    assert.equal(m.alternates?.canonical, 'https://local.test/en/receipts/earnings?week=2026-10-12');
  });
  await test('기존 설치 안내 4개 호출 형태의 문구·링크 유지, 영수증 경로만 별도', () => {
    const beforeSource = execFileSync('git', ['show', 'HEAD:src/components/share/ShareLanding.tsx'], { encoding: 'utf8' });
    const beforeJs = ts.transpileModule(beforeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const before: { ShareLanding?: typeof ShareLanding } = {};
    vm.runInNewContext(beforeJs, { exports: before, require });
    for (const [app, surface, variant] of [['signum', 'ticker', 'card'], ['signum', 'rank', 'card'], ['uc', 'uc', 'bar'], ['wim', 'wim', 'bar']] as const) {
      for (const l of ['ko', 'en', 'ja']) {
        const pps = { app, surface, variant, locale: l };
        const h = renderToStaticMarkup(createElement(ShareLanding, pps));
        assert.equal(h, renderToStaticMarkup(createElement(before.ShareLanding!, pps)), '기존 HTML 바이트 일치');
        const p = app === 'signum' ? 'app' : app === 'uc' ? 'app-uc' : 'app-wim';
        assert.ok(h.includes(`/${p}?from=share&amp;l=${l}`)); assert.ok(!h.includes('from=receipts'));
      }
    }
  });
  await test('기존 실적 화면·서비스·API·robots 소스는 HEAD와 바이트 동일', () => {
    for (const p of [
      'src/app/[locale]/earnings-week/page.tsx', 'src/app/[locale]/app-view/earnings/page.tsx',
      'src/services/earningsWeekService.ts', 'src/services/earningsActualsService.ts',
      'src/services/earningsScorecardService.ts', 'src/lib/earnings/earningsScorecard.ts',
      'src/app/api/earnings/scorecard/route.ts', 'src/app/robots.ts',
    ]) assert.equal(readFileSync(p, 'utf8'), execFileSync('git', ['show', `HEAD:${p}`], { encoding: 'utf8' }), p);
  });
  await test('사이트맵은 3언어 영수증 추가, 기존 robots 규칙에서 모두 허용', async () => {
    const { buildSitemap } = require('../src/lib/seo/sitemap');
    const robot = require('../src/app/robots').default();
    const entries = await buildSitemap();
    for (const l of ['ko', 'en', 'ja']) {
      const path = `/${l}/receipts/earnings`;
      const item = entries.find((e: { url: string }) => e.url === `https://local.test${path}`);
      assert.ok(item); assert.equal(item.lastModified, undefined);
      assert.equal(robot.rules.allow, '/');
      assert.ok(!robot.rules.disallow.some((pattern: string) => path.startsWith(pattern.replace(/\$$/, ''))));
    }
  });
  await test('OG 3언어 경로·선택 주: 실제 PNG 생성·200, 글꼴 장애에도 응답', async () => {
    for (const locale of ['en', 'ko', 'ja']) {
      const res = await og.GET(new Request('http://localhost/og?week=2026-10-12'), { params: Promise.resolve({ locale }) });
      assert.equal(res.status, 200); assert.match(res.headers.get('content-type')!, /image\/png/);
      const png = Buffer.from(await res.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
      writeFileSync(`/tmp/signum-earnings-receipts-${locale}.png`, png);
    }
    assert.equal(fontAttempts, 2);
    const res = await og.GET(new Request('http://localhost/og?week=2026-01-05'), { params: Promise.resolve({ locale: 'en' }) });
    assert.equal(res.status, 200); assert.ok((await res.arrayBuffer()).byteLength > 1000);
    store.set(actualsKey('JPM', '2026-10-13'), record('JPM', 3, 3.0001));
    const h = await html('en', '2026-10-12');
    assert.ok(h.includes('+3.0001%')); assert.ok(h.includes('Outside range'));
    const populated = await og.GET(new Request('http://localhost/og?week=2026-10-12'), { params: Promise.resolve({ locale: 'en' }) });
    assert.equal(populated.status, 200);
    writeFileSync('/tmp/signum-earnings-receipts-data.png', Buffer.from(await populated.arrayBuffer()));
  });
  await test('영수증 경로는 기존 채우기·벤더·페이지 열람 쓰기 함수를 호출하지 않음', () => {
    for (const p of ['src/services/earningsReceiptsService.ts', 'src/app/[locale]/receipts/earnings/page.tsx']) {
      assert.doesNotMatch(readFileSync(p, 'utf8'), /markPageView|setInCache|runActualsCycle|seedExpected|getEarningsWeek\(/);
    }
    assert.equal(writes, 0);
  });
  console.log(`${n}개 서비스·페이지·OG 시험 통과 · 운영 쓰기 0`);
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = realFetch; Date.now = realNow;
});
