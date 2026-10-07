/**
 * 13F 기관 보유 색인 — SEC «Form 13F Data Sets» 빌더 (2026-10-07, 앱 강화 1단계)
 *
 * 진단(Lambda 로그 실측): signum-13f 주간 실행 9/20 = 3,831쪽·NVDA 5,937곳 → 9/27 = 5쪽·22곳 → 10/4 = 5쪽·24곳. 피드 한도(분당 5회)로 5쪽만 받고도
 *   «성공»으로 색인을 덮어썼다. 이제 원천은 SEC 공개 데이터셋(ZIP ≈100MB·380만 행)이고, 소표본이면 저장을 거부한다.
 * 이 시험이 고정하는 것:
 *   1) 데이터셋 찾기(경로가 바뀐 최신 파일 포함) · 날짜·이름·로고 도메인 정리(옛 CIK 표는 Morgan Stanley/JPMorgan 을 바꿔 적었다)
 *   2) 정정 처리(RESTATEMENT 대체 · NEW HOLDINGS 추가 · 원본 없는 NEW HOLDINGS 제외) · 최신 제출만
 *   3) 평가액 단위 오기재 보정(천 달러로 적은 기관 — T. Rowe Price 가 $74M 으로 보이던 것) · 주식수와 평가액이 어긋나는 행 제외
 *   4) ★ 저장 거부 가드 — 9/27·10/4 의 소표본 수치는 전부 걸리고, 정상(2026 Q2)은 통과. 가드가 쓰기보다 먼저다(소스 순서)
 *   5) ZIP 중앙 디렉터리·스트리밍 해제·줄 나누기(청크 경계) · 합성 데이터셋 종단(자식 프로세스): 소표본 데이터셋은 종료 코드 1·«저장 거부»
 *
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/sec13fIngest.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const B = require('../scripts/build-13f-cache.js')._internals;

let n = 0;
const queue: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => { queue.push([name, fn]); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// ─────────────────────────── 1) 데이터셋 찾기 · 날짜 · 이름 · 도메인 ───────────────────────────

t('isoDate: DD-MON-YYYY → ISO, 모르는 형식은 null', () => {
  assert.equal(B.isoDate('31-JUL-2026'), '2026-07-31');
  assert.equal(B.isoDate('1-Jun-2026'), '2026-06-01');
  assert.equal(B.isoDate('30-SEP-2001'), '2001-09-30');
  assert.equal(B.isoDate(''), null);
  assert.equal(B.isoDate('2026-07-31'), null);
  assert.equal(B.isoDate('31-XXX-2026'), null);
});

t('parseDatasetLinks: 실제 안내 페이지(10/7) — 최신은 경로가 바뀐 datastandardsinnovation, 옛 파일·분기판은 뒤로', () => {
  const html = `
    <a href="/files/datastandardsinnovation/data/form-13f-data-sets/01jun2026-31aug2026_form13f.zip">01 Jun 2026 - 31 Aug 2026</a>
    <a href="/files/structureddata/data/form-13f-data-sets/01mar2026-31may2026_form13f.zip">x</a>
    <a href="/files/structureddata/data/form-13f-data-sets/01dec2025-28feb2026_form13f.zip">x</a>
    <a href="/files/structureddata/data/form-13f-data-sets/2023q4_form13f.zip">old quarterly naming</a>
    <a href="/files/structureddata/data/form-13f-data-sets/01mar2026-31may2026_form13f.zip">dup</a>`;
  const l = B.parseDatasetLinks(html);
  assert.equal(l.length, 3, '분기 번호식 옛 이름(2023q4)은 제외하고 중복은 하나로');
  assert.equal(l[0].file, '01jun2026-31aug2026_form13f.zip');
  assert.equal(l[0].url, 'https://www.sec.gov/files/datastandardsinnovation/data/form-13f-data-sets/01jun2026-31aug2026_form13f.zip');
  assert.equal(l[0].windowStart, '2026-06-01');
  assert.equal(l[0].windowEnd, '2026-08-31');
  assert.equal(l[0].name, '01jun2026-31aug2026');
  assert.equal(l[2].windowEnd, '2026-02-28');
  assert.deepEqual(B.parseDatasetLinks('<html>없음</html>'), []);
});

t('cleanFilerName: 주 코드·EDGAR 접미사·앞뒤 공백 정리, 이름 본문은 그대로 (실제 데이터의 형태)', () => {
  assert.equal(B.cleanFilerName('Arbor Wealth Management LLC\\AZ'), 'Arbor Wealth Management LLC');
  assert.equal(B.cleanFilerName('DEUTSCHE BANK AG\\'), 'DEUTSCHE BANK AG');
  assert.equal(B.cleanFilerName('BANK OF AMERICA CORP /DE/'), 'BANK OF AMERICA CORP');
  assert.equal(B.cleanFilerName('PRICE T ROWE ASSOCIATES INC /MD/'), 'PRICE T ROWE ASSOCIATES INC');
  assert.equal(B.cleanFilerName('MERCER GLOBAL ADVISORS INC /ADV'), 'MERCER GLOBAL ADVISORS INC');
  assert.equal(B.cleanFilerName('WELLS FARGO & COMPANY/MN'), 'WELLS FARGO & COMPANY');
  assert.equal(B.cleanFilerName('PRIMECAP MANAGEMENT CO/CA/'), 'PRIMECAP MANAGEMENT CO');
  assert.equal(B.cleanFilerName('  NEUBERGER BERMAN GROUP LLC'), 'NEUBERGER BERMAN GROUP LLC');
  assert.equal(B.cleanFilerName('BlackRock, Inc.'), 'BlackRock, Inc.');
  assert.equal(B.cleanFilerName('Jupiter  Topco   LLC'), 'Jupiter Topco LLC');
  assert.equal(B.cleanFilerName(''), '');
  assert.equal(B.cleanFilerName(null), '');
});

t('domainForFiler: 이름 패턴 — 옛 CIK 표가 바꿔 적었던 Morgan Stanley/JPMorgan 이 맞게 나온다', () => {
  assert.equal(B.domainForFiler('BlackRock, Inc.'), 'blackrock.com');
  assert.equal(B.domainForFiler('VANGUARD CAPITAL MANAGEMENT LLC'), 'vanguard.com');
  assert.equal(B.domainForFiler('VANGUARD PORTFOLIO MANAGEMENT LLC'), 'vanguard.com');
  assert.equal(B.domainForFiler('STATE STREET CORP'), 'statestreet.com');
  assert.equal(B.domainForFiler('FMR LLC'), 'fidelity.com');
  assert.equal(B.domainForFiler('MORGAN STANLEY'), 'morganstanley.com');
  assert.equal(B.domainForFiler('JPMORGAN CHASE & CO'), 'jpmorgan.com');
  assert.equal(B.domainForFiler('GEODE CAPITAL MANAGEMENT, LLC'), 'geodecapital.com');
  assert.equal(B.domainForFiler('PRICE T ROWE ASSOCIATES INC'), 'troweprice.com');
  assert.equal(B.domainForFiler('Capital World Investors'), 'capitalgroup.com');
  assert.equal(B.domainForFiler('UBS Group AG'), 'ubs.com');
  assert.equal(B.domainForFiler('Sixth Street Partners Management Company, L.P.'), null, '확실하지 않으면 로고를 달지 않는다(이니셜 칩)');
  assert.equal(B.domainForFiler('First Nebraska Trust Co'), null);
  assert.equal(B.domainForFiler(null), null);
});

// ─────────────────────────── 2) 기준일 · 정정 처리 ───────────────────────────

const sub = (acc: string, cik: string, type: string, period: string, filingDate: string) => ({ acc, cik, type, period, filingDate });
const cover = (entries: Array<[string, string, string]>) => new Map(entries.map(([acc, amendmentType, name]) => [acc, { amendmentType, name }]));

t('chooseReportPeriod: 13F-HR 제출이 가장 많은 기준일(NT 통지·옛 기준일의 늦은 제출은 안 센다)', () => {
  const subs = [
    sub('a1', '1', '13F-HR', '30-JUN-2026', '05-AUG-2026'), sub('a2', '2', '13F-HR', '30-JUN-2026', '06-AUG-2026'), sub('a3', '3', '13F-HR/A', '30-JUN-2026', '07-AUG-2026'),
    sub('b1', '4', '13F-HR', '31-MAR-2026', '07-AUG-2026'), sub('c1', '5', '13F-NT', '30-JUN-2026', '07-AUG-2026'), sub('c2', '6', '13F-NT', '30-JUN-2026', '07-AUG-2026'),
    sub('c3', '7', '13F-NT', '30-JUN-2026', '07-AUG-2026'), sub('c4', '8', '13F-NT', '30-JUN-2026', '07-AUG-2026'),
  ];
  const p = B.chooseReportPeriod(subs);
  assert.deepEqual(p, { raw: '30-JUN-2026', period: '2026-06-30', count: 3 });
  assert.equal(B.chooseReportPeriod([]), null);
  assert.equal(B.chooseReportPeriod([sub('x', '1', '13F-NT', '30-JUN-2026', '01-AUG-2026')]), null);
});

t('resolveAccessions: 본 제출 · RESTATEMENT 대체 · NEW HOLDINGS 추가 · 원본 없는 NEW HOLDINGS 제외 · 다른 기준일 무시 · 같은 기관의 최신 본 제출', () => {
  const subs = [
    // A: 본 제출 후 RESTATEMENT — 정정본 하나만
    sub('A1', 'A', '13F-HR', '30-JUN-2026', '05-AUG-2026'), sub('A2', 'A', '13F-HR/A', '30-JUN-2026', '20-AUG-2026'),
    // B: 본 제출 + NEW HOLDINGS — 둘 다
    sub('B1', 'B', '13F-HR', '30-JUN-2026', '05-AUG-2026'), sub('B2', 'B', '13F-HR/A', '30-JUN-2026', '25-AUG-2026'),
    // C: NEW HOLDINGS 만(원본이 이전 창에 있다) — 제외
    sub('C1', 'C', '13F-HR/A', '30-JUN-2026', '25-AUG-2026'),
    // D: 다른 기준일 — 무시
    sub('D1', 'D', '13F-HR', '31-MAR-2026', '05-AUG-2026'),
    // E: 같은 기준일에 본 제출 두 번 — 나중 것
    sub('E1', 'E', '13F-HR', '30-JUN-2026', '05-AUG-2026'), sub('E2', 'E', '13F-HR', '30-JUN-2026', '09-AUG-2026'),
    // F: 13F-NT — 무시
    sub('F1', 'F', '13F-NT', '30-JUN-2026', '05-AUG-2026'),
    // G: 유형 미표기 정정 — 대체로 본다
    sub('G1', 'G', '13F-HR', '30-JUN-2026', '05-AUG-2026'), sub('G2', 'G', '13F-HR/A', '30-JUN-2026', '12-AUG-2026'),
  ];
  const covers = cover([
    ['A1', '', 'Alpha Capital LLC'], ['A2', 'RESTATEMENT', 'Alpha Capital LLC'],
    ['B1', '', 'Beta Partners LP /DE/'], ['B2', 'NEW HOLDINGS', 'Beta Partners LP /DE/'],
    ['C1', 'NEW HOLDINGS', 'Gamma Trust'],
    ['E1', '', 'Epsilon Old'], ['E2', '', 'Epsilon New'], ['G1', '', 'Zeta'], ['G2', '', 'Zeta'],
  ]);
  const r = B.resolveAccessions(subs, covers, '30-JUN-2026');
  assert.deepEqual([...r.accToCik.keys()].sort(), ['A2', 'B1', 'B2', 'E2', 'G2']);
  assert.equal(r.accToCik.get('B2'), 'B');
  assert.equal(r.skippedNewHoldings, 1);
  assert.deepEqual([...r.filers.keys()].sort(), ['A', 'B', 'E', 'G']);
  assert.equal(r.filers.get('B').name, 'Beta Partners LP', '이름 정리가 적용된다');
  assert.equal(r.filers.get('B').filingDate, '2026-08-25', '여러 제출이면 마지막 제출일');
  assert.equal(r.filers.get('E').name, 'Epsilon New');
});

// ─────────────────────────── 3) 평가액 보정 ───────────────────────────

t('median', () => {
  assert.equal(B.median([3, 1, 2]), 2);
  assert.equal(B.median([4, 1, 2, 3]), 2.5);
  assert.equal(B.median([200.1]), 200.1);
  assert.equal(B.median([]), null);
});

t('reconcileHolding: 정상 · 천 배 단위 오기재(양방향) · 어긋남 유지 · 크게 어긋나면 제외 · 대표 가격을 모르면 as-filed', () => {
  const P = 200.09;                                                         // 2026 Q2 NVDA 중앙값 가격
  assert.deepEqual(B.reconcileHolding(1000, 200090, P), { keep: true, marketValue: 200090, flag: null });
  // 천 달러로 적은 기관: T. Rowe Price — 3.34억 주인데 평가액 $66.87M(= 실제 $66.87B 의 1/1000)
  assert.deepEqual(B.reconcileHolding(334_210_126, 66_872_105, P), { keep: true, marketValue: Math.round(334_210_126 * P), flag: 'unit' });
  // 천 배 크게 적은 곳: PeakShares — 12,128주에 평가액 $2.43B
  assert.deepEqual(B.reconcileHolding(12_128, 2_426_692_000, P), { keep: true, marketValue: Math.round(12_128 * P), flag: 'unit' });
  // 원인 불명 2.8배 어긋남(MFS) — 주식수를 믿고 유지
  assert.deepEqual(B.reconcileHolding(2_460_782, 1_383_879_977, P), { keep: true, marketValue: Math.round(2_460_782 * P), flag: 'mismatch' });
  // 70억 주·평가액 $35M(가격 0.005) — 어느 쪽도 못 믿는다 → 제외
  assert.deepEqual(B.reconcileHolding(7_007_449_934, 35_021_490, P), { keep: false, flag: 'inconsistent' });
  assert.deepEqual(B.reconcileHolding(835, 21_533_946, P), { keep: false, flag: 'inconsistent' });                 // 가격 25,789 = 129배
  assert.deepEqual(B.reconcileHolding(0, 100, P), { keep: false, flag: 'invalid' });
  assert.deepEqual(B.reconcileHolding(100, 0, P), { keep: false, flag: 'invalid' });
  assert.deepEqual(B.reconcileHolding(100, 5000, null), { keep: true, marketValue: 5000, flag: null }, '대표 가격(5행 이상)을 모르면 as-filed');
});

t('buildCusipEntry: T. Rowe 보정 후 순위 · 제외 행은 합계에서 빠진다 · 상위 60 저장 · 이름·도메인·기준일 포함', () => {
  const filers = new Map<string, { name: string; filingDate: string }>([
    ['BR', { name: 'BlackRock, Inc.', filingDate: '2026-08-07' }],
    ['TR', { name: 'PRICE T ROWE ASSOCIATES INC', filingDate: '2026-08-12' }],
    ['ZZ', { name: 'Small Advisor LLC', filingDate: '2026-08-14' }],
  ]);
  const P = 200;
  const holders: Array<{ cik: string; shares: number; value: number }> = [
    { cik: 'BR', shares: 1_000_000_000, value: 1_000_000_000 * P },
    { cik: 'TR', shares: 300_000_000, value: 300_000_000 * P / 1000 },        // 천 달러로 적음
    { cik: 'ZZ', shares: 7_000_000_000, value: 35_000_000 },                    // 말이 안 되는 행
  ];
  for (let i = 0; i < 100; i++) holders.push({ cik: `F${i}`, shares: 10_000 + i, value: (10_000 + i) * P });   // 잔챙이 100곳(대표 가격 중앙값을 P 로)
  const { entry, stats } = B.buildCusipEntry(holders, filers, { period: '2026-06-30', updatedAt: '2026-10-07T00:00:00.000Z', dataset: '01jun2026-31aug2026', universeFilers: 8857 });
  assert.equal(stats.unit, 1);
  assert.equal(stats.inconsistent, 1);
  assert.equal(entry.totalHolders, 102, '제외된 1곳은 세지 않는다(전체 103 중)');
  assert.equal(entry.holders.length, B.STORE_TOP);
  assert.equal(entry.holders[0].name, 'BlackRock, Inc.');
  assert.equal(entry.holders[0].domain, 'blackrock.com');
  assert.equal(entry.holders[1].name, 'PRICE T ROWE ASSOCIATES INC');
  assert.equal(entry.holders[1].marketValue, 300_000_000 * P, 'T. Rowe 는 $60B 로 보정되어 2위');
  assert.equal(entry.holders[1].filingDate, '2026-08-12');
  assert.equal(entry.holders[0].period, '2026-06-30');
  assert.equal(entry.period, '2026-06-30');
  assert.equal(entry.source, 'sec-form13f-datasets');
  assert.equal(entry.universeFilers, 8857);
  assert.equal(entry.totalShares, 1_000_000_000 + 300_000_000 + holders.slice(3).reduce((s, h) => s + h.shares, 0), '합계는 «전체» 보유 기관 기준(상위 60 합이 아니다)');
  assert.ok(!entry.holders.some((h: any) => h.cik === 'ZZ'), '제외된 행은 목록에도 없다');
  // 5행 미만이면 보정 없이 as-filed
  const tiny = B.buildCusipEntry([{ cik: 'BR', shares: 10, value: 5 }, { cik: 'TR', shares: 20, value: 7 }], filers, { period: '2026-06-30', updatedAt: 'x', dataset: 'd', universeFilers: 1 });
  assert.equal(tiny.entry.totalHolders, 2);
  assert.equal(tiny.entry.totalValue, 12);
});

// ─────────────────────────── 4) 저장 거부 가드 ───────────────────────────

t('checkGuards: 정상(2026 Q2 실측)은 통과 — 제출 기관 8,857 · CUSIP 24,548 · 보유 2,395,944쌍 · NVDA 5,905 · AAPL 6,110 · MSFT 6,208', () => {
  const g = B.checkGuards({ filers: 8857, cusips: 24548, holdings: 2_395_944, sentinelHolders: { '67066G104': 5905, '037833100': 6110, '594918104': 6208 }, period: '2026-06-30', previousPeriod: '2026-03-31' });
  assert.deepEqual(g, { ok: true, failures: [] });
});

t('checkGuards: 9/27·10/4 의 소표본(5쪽·1,954 CUSIP·4,234쌍·NVDA 24곳)은 전부 걸린다 — 좋은 색인을 덮어쓰지 않는다', () => {
  const g = B.checkGuards({ filers: 120, cusips: 1954, holdings: 4234, sentinelHolders: { '67066G104': 24, '037833100': 31, '594918104': 28 }, period: '2026-06-30', previousPeriod: '2026-06-30' });
  assert.equal(g.ok, false);
  assert.ok(g.failures.length >= 6, g.failures.join(' | '));
  assert.ok(g.failures.some((f: string) => f.includes('NVDA')));
  assert.ok(g.failures.some((f: string) => f.includes('CUSIP')));
});

t('checkGuards: 한 항목만 모자라도 막는다(경계) · 기준일이 거꾸로 가면 막는다 · 빠진 표지 종목은 0 으로 본다', () => {
  const base = { filers: 8000, cusips: 20000, holdings: 2_000_000, sentinelHolders: { '67066G104': 5000, '037833100': 5000, '594918104': 5000 }, period: '2026-06-30', previousPeriod: null };
  assert.equal(B.checkGuards(base).ok, true);
  assert.equal(B.checkGuards({ ...base, filers: 2999 }).ok, false);
  assert.equal(B.checkGuards({ ...base, cusips: 9999 }).ok, false);
  assert.equal(B.checkGuards({ ...base, holdings: 999_999 }).ok, false);
  assert.equal(B.checkGuards({ ...base, sentinelHolders: { ...base.sentinelHolders, '594918104': 1499 } }).ok, false);
  assert.equal(B.checkGuards({ ...base, sentinelHolders: { '67066G104': 5000, '037833100': 5000 } }).ok, false);
  const back = B.checkGuards({ ...base, period: '2026-03-31', previousPeriod: '2026-06-30' });
  assert.equal(back.ok, false);
  assert.ok(back.failures.some((f: string) => f.includes('거꾸로')));
});

t('소스 순서: 가드 실패 throw 가 첫 SET 보다 앞이다 · 가드 덮어쓰기(GUARD_JSON)는 DRY 일 때만 · 임시 ZIP 은 finally 에서 지운다', () => {
  const src = read('scripts/build-13f-cache.js');
  const guardIdx = src.indexOf('if (!guard.ok)');
  const setIdx = src.indexOf("batch.push(['SET'");
  assert.ok(guardIdx > 0 && setIdx > guardIdx, '가드가 저장보다 먼저');
  assert.ok(src.includes('throw new Error(`저장 거부'));
  assert.ok(/DRY && process\.env\.GUARD_JSON/.test(src), 'GUARD_JSON 은 DRY 에서만');
  assert.ok(/finally \{ if \(state\.downloaded\)/.test(src));
  assert.ok(/150 \* 86400/.test(src), '분기 갱신에 맞춰 TTL 150일(옛 14일은 주간 재색인 전제)');
  assert.ok(!/MASSIVE_API_KEY|api\.polygon\.io/.test(src), '죽은 Massive 피드에 더는 기대지 않는다');
});

// ─────────────────────────── 5) ZIP · 스트리밍 · 종단 ───────────────────────────

/** 시험용 최소 ZIP(deflate/stored) 만들기 — 로컬 헤더 + 중앙 디렉터리 + EOCD */
function makeZip(files: Array<{ name: string; data: Buffer; method?: 0 | 8 }>): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const method = f.method ?? 8;
    const comp = method === 8 ? zlib.deflateRawSync(f.data) : f.data;
    const name = Buffer.from(f.name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sec13f-test-'));

t('ZIP: 중앙 디렉터리 읽기 + deflate/stored 해제 + 줄 나누기(청크 경계·CRLF·한글 멀티바이트)', async () => {
  const big = Array.from({ length: 6000 }, (_, i) => `행${i}\t가나다${i}\tCUSIP${String(i).padStart(5, '0')}`).join('\r\n') + '\r\n마지막(개행 없음)';
  const zip = makeZip([{ name: 'A.tsv', data: Buffer.from(big, 'utf8'), method: 8 }, { name: 'B.tsv', data: Buffer.from('h1\th2\nx\ty\n', 'utf8'), method: 0 }]);
  const f = path.join(tmp, 'x.zip'); fs.writeFileSync(f, zip);
  const entries = B.readZipEntries(f);
  assert.deepEqual(entries.map((e: any) => e.name), ['A.tsv', 'B.tsv']);
  assert.equal(entries[0].method, 8);
  assert.equal(entries[1].method, 0);
  assert.ok(Buffer.byteLength(big) > 65536, '해제 스트림 청크 경계를 넘는 크기');
  const lines: string[] = [];
  await B.forEachLine(B.openZipEntry(f, entries[0]), (l: string) => lines.push(l));
  assert.equal(lines.length, 6001);
  assert.equal(lines[0], '행0\t가나다0\tCUSIP00000');
  assert.equal(lines[5999], '행5999\t가나다5999\tCUSIP05999');
  assert.equal(lines[6000], '마지막(개행 없음)');
  assert.ok(lines.every((l) => !l.includes('\r')), 'CRLF 의 \\r 제거');
  const b: string[] = [];
  await B.forEachLine(B.openZipEntry(f, entries[1]), (l: string) => b.push(l));
  assert.deepEqual(b, ['h1\th2', 'x\ty']);
  fs.writeFileSync(path.join(tmp, 'bad.zip'), Buffer.from('not a zip at all'));
  assert.throws(() => B.readZipEntries(path.join(tmp, 'bad.zip')), /EOCD|ZIP/);
});

function syntheticDataset(filerCount: number, cusipCount: number): Buffer {
  const SUB = ['ACCESSION_NUMBER\tFILING_DATE\tSUBMISSIONTYPE\tCIK\tPERIODOFREPORT'];
  const COV = ['ACCESSION_NUMBER\tREPORTCALENDARORQUARTER\tISAMENDMENT\tAMENDMENTNO\tAMENDMENTTYPE\tCONFDENIEDEXPIRED\tDATEDENIEDEXPIRED\tDATEREPORTED\tREASONFORNONCONFIDENTIALITY\tFILINGMANAGER_NAME\tFILINGMANAGER_STREET1'];
  const INFO = ['ACCESSION_NUMBER\tINFOTABLE_SK\tNAMEOFISSUER\tTITLEOFCLASS\tCUSIP\tFIGI\tVALUE\tSSHPRNAMT\tSSHPRNAMTTYPE\tPUTCALL\tINVESTMENTDISCRETION\tOTHERMANAGER\tVOTING_AUTH_SOLE\tVOTING_AUTH_SHARED\tVOTING_AUTH_NONE'];
  let sk = 1;
  for (let i = 0; i < filerCount; i++) {
    const acc = `0000000${String(i).padStart(3, '0')}-26-000001`, cik = String(1000 + i).padStart(10, '0');
    SUB.push(`${acc}\t07-AUG-2026\t13F-HR\t${cik}\t30-JUN-2026`);
    COV.push(`${acc}\t30-JUN-2026\t\t\t\t\t\t\t\tFiler ${i} LLC\\NY\tMain St`);
    for (let c = 0; c < cusipCount; c++) {
      INFO.push(`${acc}\t${sk++}\tISSUER ${c}\tCOM\tCUSIP${String(c).padStart(4, '0')}\t\t${(c + 1) * 1000}\t${c + 1}\tSH\t\tSOLE\t\t${c + 1}\t0\t0`);
    }
    INFO.push(`${acc}\t${sk++}\tOPTION ISSUER\tCOM\tCUSIP0000\t\t999\t9\tSH\tCall\tSOLE\t\t9\t0\t0`);   // 옵션 행 — 제외돼야 한다
    INFO.push(`${acc}\t${sk++}\tBOND ISSUER\tNOTE\tCUSIP0000\t\t888\t8\tPRN\t\tSOLE\t\t8\t0\t0`);       // 원금 행 — 제외돼야 한다
  }
  return makeZip([
    { name: 'SUBMISSION.tsv', data: Buffer.from(SUB.join('\n') + '\n') },
    { name: 'COVERPAGE.tsv', data: Buffer.from(COV.join('\n') + '\n') },
    { name: 'INFOTABLE.tsv', data: Buffer.from(INFO.join('\n') + '\n') },
  ]);
}
const runBuilder = (zipFile: string, env: Record<string, string>) => spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-13f-cache.js')], {
  env: { PATH: process.env.PATH || '', SRC_ZIP: zipFile, ...env }, encoding: 'utf8',
});

t('종단(자식 프로세스): 소표본 합성 데이터셋(제출 기관 7곳)은 «저장 거부»·종료 코드 1 — 기본 가드는 환경변수로 못 낮춘다(DRY 아님)', () => {
  const f = path.join(tmp, 'small.zip'); fs.writeFileSync(f, syntheticDataset(7, 12));
  const r = runBuilder(f, { GUARD_JSON: JSON.stringify({ minFilers: 1, minCusips: 1, minHoldings: 1, sentinels: {} }) });   // DRY 가 아니므로 무시돼야 한다
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok((r.stdout + r.stderr).includes('저장 거부'), r.stdout + r.stderr);
  assert.ok(!/✅ 저장/.test(r.stdout), '아무것도 저장하지 않았다');
});

t('종단(자식 프로세스): DRY + 시험용 가드 — 옵션·원금 행 제외, (기관,CUSIP) 합산, 기준일·제출 기관 수·집계가 맞다', () => {
  const f = path.join(tmp, 'ok.zip'); fs.writeFileSync(f, syntheticDataset(7, 12));
  const emit = path.join(tmp, 'emit.json');
  const guard = { minFilers: 5, minCusips: 10, minHoldings: 50, sentinels: { CUSIP0003: 'S3' }, sentinelMinHolders: 7 };
  const r = runBuilder(f, { DRY: '1', GUARD_JSON: JSON.stringify(guard), EMIT_CUSIPS: emit });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = r.stdout;
  assert.ok(out.includes('기준일 2026-06-30'), out);
  assert.ok(/제출 기관 7곳/.test(out), out);
  assert.ok(/INFOTABLE 98행 → 사용 84행/.test(out), '7곳 × (12 + 옵션 1 + 원금 1) = 98행, 옵션·원금 제외 후 84행: ' + out);
  assert.ok(/\(기관, CUSIP\) 84쌍/.test(out), out);
  assert.ok(/CUSIP 12개/.test(out), out);
  assert.ok(out.includes('가드: 통과'), out);
  const emitted = JSON.parse(fs.readFileSync(emit, 'utf8'));
  assert.equal(emitted.length, 0, 'EMIT 은 보유 기관 40곳 이상만(합성 데이터는 7곳이라 비어 있다)');
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); n += 1; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n`, e); process.exitCode = 1; break; }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!process.exitCode) console.log(`\n${n}개 통과`);
})();
