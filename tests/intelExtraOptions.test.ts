/**
 * 앱 Intel «엔진 목록 밖 설정 종목»(RGTI·QBTS)의 옵션 지표 — src/lib/app/intelExtraOptions.ts (2026-10-07, 앱 강화 정확성 3차)
 *
 * 출발점: 퀀텀 엣지 카드(IONQ·RGTI·QBTS)의 GEX·PCR 이 «1/3» — RGTI·QBTS 가 수집 Lambda 목록(GEX_TICKERS)에 없어 행이 없었다(RGTI 의 최신 행은 8/28).
 *   수집 목록에 두 종목을 넣은 뒤에는 다른 종목과 «같은 행·같은 규칙»(5일 안의 행 · GEX = row.gex · P/C = 35일 이내 전 만기)으로 읽어 3/3 이 된다.
 *
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/intelExtraOptions.test.ts
 */
import assert from 'node:assert/strict';
import { mergeExtraOptions, optionsFromRow } from '../src/lib/app/intelExtraOptions';
import { APP_SECTOR_STOCKS, configTickersMissingFrom, rebucketBySectorLists } from '../src/lib/app/intelSectorLists';
import { OPTIONS_ROW_MAX_AGE_MS } from '../src/lib/app/intelOptionsBasis';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const NOW = Date.UTC(2026, 9, 7, 14, 30);   // 10/7 14:30Z
const HOUR = 3600_000;

t('행이 없으면 전부 «못 쟀다»(null · UNKNOWN) — 지어내지 않는다', () => {
  for (const row of [null, undefined, {}, { timestamp: 'x' }]) {
    assert.deepEqual(optionsFromRow(row, NOW), { gex: null, pcr: null, gammaRegime: 'UNKNOWN', optionsAsOf: null });
  }
});

t('5일 안의 행 — GEX = row.gex · P/C = row.pcr(35일 이내 전 만기) · 부호로 감마 구도 · 행 시각', () => {
  const ts = NOW - 2 * HOUR;
  assert.deepEqual(optionsFromRow({ timestamp: ts, gex: 5_730_000, pcr: 0.97 }, NOW), { gex: 5_730_000, pcr: 0.97, gammaRegime: 'LONG', optionsAsOf: ts });
  assert.deepEqual(optionsFromRow({ timestamp: ts, gex: -2_000_000, pcr: 1.4 }, NOW), { gex: -2_000_000, pcr: 1.4, gammaRegime: 'SHORT', optionsAsOf: ts });
  // pcr 필드가 없으면 풋 OI ÷ 콜 OI
  assert.equal(optionsFromRow({ timestamp: ts, gex: 1, totalCallOI: 200, totalPutOI: 50 }, NOW).pcr, 0.25);
});

t('수집이 멈춘 종목의 옛 «최신 행»(RGTI 8/28)은 지금 값이 아니다 → 못 쟀다', () => {
  const old = { timestamp: Date.UTC(2026, 7, 28, 20, 0), gex: 123456, pcr: 0.5 };
  assert.deepEqual(optionsFromRow(old, NOW), { gex: null, pcr: null, gammaRegime: 'UNKNOWN', optionsAsOf: null });
  // 경계 — 정확히 5일 이내는 쓴다, 5일 + 1분은 안 쓴다
  assert.notEqual(optionsFromRow({ timestamp: NOW - OPTIONS_ROW_MAX_AGE_MS + 60_000, gex: 1, pcr: 1 }, NOW).gex, null);
  assert.equal(optionsFromRow({ timestamp: NOW - OPTIONS_ROW_MAX_AGE_MS - 60_000, gex: 1, pcr: 1 }, NOW).gex, null);
});

const quote = (ticker: string, over: Record<string, unknown> = {}) => ({ ticker, price: 10, changePct: 0.5, gex: 0, pcr: 0, gammaRegime: 'UNKNOWN', optionsAsOf: null as number | null, pcrBasis: null as string | null, ...over });

t('mergeExtraOptions — 행이 있는 종목만 채우고, 행이 없는 종목은 그대로(0 = 화면 «—»)', () => {
  const ts = NOW - HOUR;
  const out = mergeExtraOptions([quote('RGTI'), quote('QBTS')], { RGTI: optionsFromRow({ timestamp: ts, gex: 1_000_000, pcr: 0.8 }, NOW), QBTS: optionsFromRow(null, NOW) });
  assert.equal(out[0].gex, 1_000_000); assert.equal(out[0].pcr, 0.8); assert.equal(out[0].gammaRegime, 'LONG'); assert.equal(out[0].optionsAsOf, ts); assert.equal(out[0].pcrBasis, 'oi_all_expiries_35d');
  assert.equal(out[1].gex, 0); assert.equal(out[1].pcr, 0); assert.equal(out[1].gammaRegime, 'UNKNOWN'); assert.equal(out[1].optionsAsOf, null);
  assert.deepEqual(mergeExtraOptions([quote('RGTI')], null), [quote('RGTI')]);
  assert.deepEqual(mergeExtraOptions([quote('RGTI')], {}), [quote('RGTI')]);
});

t('퀀텀 카드 — 수집 목록에 RGTI·QBTS 가 들어가 행이 생기면 GEX·PCR 3/3 (전: 1/3)', () => {
  const engine = ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'];
  const missing = configTickersMissingFrom([...engine, ...Object.values(APP_SECTOR_STOCKS).flat().filter((x) => !['RGTI', 'QBTS'].includes(x))]);
  assert.deepEqual(missing.sort(), ['QBTS', 'RGTI']);   // 엔진 목록 밖 설정 종목 = 정확히 이 둘
  const ionq = quote('IONQ', { gex: 5_730_000, pcr: 0.97, gammaRegime: 'LONG' });
  const coverage = (rows: Array<{ gex: number; pcr: number }>) => [rows.filter((q) => Number.isFinite(q.gex) && q.gex !== 0).length, rows.filter((q) => q.pcr > 0).length];

  const before = rebucketBySectorLists({ quantumEdge: [ionq] }, mergeExtraOptions([quote('RGTI'), quote('QBTS')], {}));
  assert.deepEqual(coverage(before.quantumEdge as any), [1, 1]);          // 전: 1/3
  const ts = NOW - HOUR;
  const after = rebucketBySectorLists({ quantumEdge: [ionq] }, mergeExtraOptions([quote('RGTI'), quote('QBTS')], {
    RGTI: optionsFromRow({ timestamp: ts, gex: 1_100_000, pcr: 0.29 }, NOW), QBTS: optionsFromRow({ timestamp: ts, gex: -300_000, pcr: 0.46 }, NOW),
  }));
  assert.equal(after.quantumEdge.length, 3);
  assert.deepEqual(coverage(after.quantumEdge as any), [3, 3]);           // 후: 3/3
});

t('앱 Intel 설정 목록 56종목 전체 ↔ 수집 Lambda GEX 목록 — 빠진 종목은 RGTI·QBTS 둘뿐(harvest_lambda/index.js 대조)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'harvest_lambda', 'index.js'), 'utf8') as string;
  const gex: string[] = JSON.parse((src.match(/const GEX_TICKERS = (\[[^\]]*\]);/) as RegExpMatchArray)[1]);
  const all = Array.from(new Set(Object.values(APP_SECTOR_STOCKS).flat()));
  assert.equal(all.length, 56);
  assert.deepEqual(all.filter((x) => !gex.includes(x)), [], '설정 목록 종목이 수집 목록에 전부 있어야 한다');
  assert.ok(gex.includes('RGTI') && gex.includes('QBTS'));
  assert.equal(gex.length, 108);
  assert.equal(new Set(gex).size, gex.length, '중복 없음');
});

console.log(`\n${n} tests passed`);
