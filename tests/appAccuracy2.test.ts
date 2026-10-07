/**
 * 앱 강화 «정확성 2차» (2026-10-07) — 미결제약정 P/C 한 정의 · PCR 색 문턱 하나 · 섹터 설정 목록 기준 · 데이터 없음 기본값 · 신선도 표기
 *
 * 출발점(10/7 운영 실측):
 *   · P/C(OI) 가 주간 만기 1개(W)·35일 전 만기(T)로 갈렸다(NVDA 1.06 · 0.78 · 0.84) — 앱 Intel 의 GEX·PCR 은 «분석 캐시가 살아 있는 동안 W, ET 자정에 만료되면 DynamoDB T» 였다
 *     (한국 13시에 physical_ai 7종목 GEX 숏→롱 — 운영 Redis 의 분석 캐시 timestamp 06:05 KST·gex −38.5M(W) vs DynamoDB 05:47 KST·+68.1M(T) 로 확정).
 *   · 카드마다 PCR 문턱이 달랐다(0.8/1.1 · 0.7/1.2 · 0.95/1.05).
 *   · 카드 칩은 설정 목록(IONQ·RGTI·QBTS)인데 수치는 엔진 목록(SMCI·SNOW·IONQ·DELL·AI·PATH·TWLO).
 *   · Guardian 이 데이터 없이 50/50·1.00:1 균형·유동성 50 우호적·안전자산 0.00 안정을 그렸다. Command 가 시세 실패 시 $0.00·Buy 0 Hold 0 Sell 0·12M 목표가 $0.00 을 그렸다.
 *
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/appAccuracy2.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  pcrTone, pcrColor, PCR_TONE_COLOR, oiPcrAllExpiries, gexFromRow, optionsAsOfNote, optionsSessionDate, latestOptionsAsOf, isFreshOptionsRow,
} from '../src/lib/app/intelOptionsBasis';
import { APP_SECTOR_STOCKS, SECTOR_ID_TO_HOOK_KEY, configTickersMissingFrom, rebucketBySectorLists } from '../src/lib/app/intelSectorLists';
import { intelFastKey, intelFastWindow, etPhase, usableEnvelope } from '../src/lib/cache/intelFastCache';
import { pcLean } from '../src/lib/putCall';
import { quoteFromBatchResult } from '../src/lib/app/intelQuoteFromBatch';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const ROW_1006_CLOSE_EARLY = Date.UTC(2026, 9, 6, 20, 47);
// ── 1. PCR 색 문턱 하나 ───────────────────────────────────────────────────────────
t('PCR 색: 0.75 이하 콜 우위(초록) · 1.3 이상 풋 우위(빨강) · 사이 균형 — Flow 의 pcLean 과 같은 문턱', () => {
  assert.equal(pcrTone(0.5), 'call');
  assert.equal(pcrTone(0.75), 'call');
  assert.equal(pcrTone(0.76), 'balanced');
  assert.equal(pcrTone(1.0), 'balanced');
  assert.equal(pcrTone(1.29), 'balanced');
  assert.equal(pcrTone(1.3), 'put');
  assert.equal(pcrTone(2.04), 'put');
  // 예전 카드별 문턱이 갈랐던 값들이 이제 한 색이다 — 0.78(예전 0.8 문턱=초록 · 0.7 문턱=회색) · 1.15(예전 0.95/1.05=빨강 · 0.8/1.1=빨강 · 0.7/1.2=회색)
  assert.equal(pcrColor(0.78), PCR_TONE_COLOR.balanced);
  assert.equal(pcrColor(1.15), PCR_TONE_COLOR.balanced);
  // 값이 없으면 중립 muted (색으로 판정하지 않는다)
  assert.equal(pcrTone(null), null);
  assert.equal(pcrTone(undefined), null);
  assert.equal(pcrColor(null), PCR_TONE_COLOR.unknown);
  // 문턱은 lib/putCall.pcLean 한 곳 — 두 함수가 어긋나지 않는다
  for (const v of [0.3, 0.5, 0.6, 0.75, 0.8, 1, 1.29, 1.3, 1.8, 2, 3]) {
    const lean = pcLean(v)!;
    const expect = lean === 'strongCall' || lean === 'call' ? 'call' : lean === 'strongPut' || lean === 'put' ? 'put' : 'balanced';
    assert.equal(pcrTone(v), expect, String(v));
  }
});

t('PCR 색: 앱 Intel 소스에 카드별 옛 문턱(0.8/1.1 · 0.7/1.2 · 0.95/1.05)이 남아 있지 않다 — 모든 PCR 칸이 pcrColor 하나', () => {
  const page = read('src/app/[locale]/app-view/intel/page.tsx');
  // (섹터 «심리 점수» 휴리스틱의 avgPcr < 0.9 / > 1.15 는 색이 아니라 점수 계산이라 이 시험 대상이 아니다)
  assert.ok(!/pcr\s*[<>]\s*(0\.8|1\.1|0\.7|1\.2|0\.95|1\.05)\b/i.test(page), '옛 문턱 비교');
  assert.ok(page.includes("from '@/lib/app/intelOptionsBasis'"));
  assert.ok((page.match(/pcrColor\(/g) || []).length >= 4, '게이지·카드·스코어보드·종목 표 네 곳');
  // 섹터 카드의 PCR 칸에도 ⓘ — 카드 전체가 <button> 이라 span 트리거(asSpan) + 닫는 탭이 카드 열기로 새지 않게 stopPropagation
  assert.ok(/tip: 'pcr' as const/.test(page) && /<MetricInfo term=\{metric\.tip\} locale=\{appLocale\} size=\{9\} asSpan \/>/.test(page));
});

t('ⓘ 용어집 pcr·pcrWeekly: 세 언어 모두 — 정의(35일 이내 전 만기)·문턱(0.75 / 1.3)·«주간 만기 P/C» 분리를 말한다', () => {
  const g = read('src/components/app/metricGlossary.ts');
  const pcr = g.slice(g.indexOf('  pcr: {'), g.indexOf('  squeeze: {'));
  assert.ok(pcr.includes('35일') && pcr.includes('35 days') && pcr.includes('35日'));
  assert.ok(pcr.includes('0.75') && pcr.includes('1.3'));
  assert.ok(pcr.includes('주간 만기 P/C') && pcr.includes('Weekly-expiry P/C') && pcr.includes('週次満期P/C'));
  assert.ok(/pcrWeekly: \{/.test(g) && /\| 'pcrWeekly'/.test(g));
});

// ── 2. P/C·GEX 한 출처(DynamoDB 최신 행) ──────────────────────────────────────────
t('oiPcrAllExpiries: row.pcr 우선 · 없으면 풋 OI ÷ 콜 OI · 비정상은 null(못 쟀다)', () => {
  assert.equal(oiPcrAllExpiries({ pcr: 0.94, totalCallOI: 329180, totalPutOI: 307802 }), 0.94);
  assert.equal(oiPcrAllExpiries({ totalCallOI: 329180, totalPutOI: 307802 }), 0.94);
  assert.equal(oiPcrAllExpiries({ pcr: 0, totalCallOI: 100, totalPutOI: 50 }), 0.5);
  assert.equal(oiPcrAllExpiries({ pcr: null }), null);
  assert.equal(oiPcrAllExpiries({ totalCallOI: 0, totalPutOI: 10 }), null);
  assert.equal(oiPcrAllExpiries(null), null);
  assert.equal(oiPcrAllExpiries(undefined), null);
});

t('isFreshOptionsRow: 5일 안의 행만 쓴다 — 수집이 멈춘 종목의 옛 «최신 행»(RGTI 8/28)을 지금 값처럼 그리지 않는다(운영 실측: /api/app/oi-pcr?t=RGTI = 8/28 행)', () => {
  const now = Date.UTC(2026, 9, 7, 5, 30);                       // 10/7 14:30 KST
  assert.equal(isFreshOptionsRow(ROW_1006_CLOSE_EARLY, now), true);   // 10/6 마감 후 행
  assert.equal(isFreshOptionsRow(Date.UTC(2026, 7, 28, 1, 22), now), false);   // RGTI 의 8/28 행
  assert.equal(isFreshOptionsRow(Date.UTC(2026, 9, 2, 5, 29), now), false);   // 5일 + 1분 전
  assert.equal(isFreshOptionsRow(Date.UTC(2026, 9, 2, 5, 31), now), true);    // 5일 − 1분 전
  assert.equal(isFreshOptionsRow(null, now), false);
  assert.equal(isFreshOptionsRow(0, now), false);
  assert.equal(isFreshOptionsRow(now + 5 * 3600_000, now), false);              // 미래 시각은 믿지 않는다
  const r = read('src/app/api/intel/fast/route.ts');
  assert.ok(/const row = isFreshOptionsRow\(ts\) \? rowAny : null;/.test(r));
  const o = read('src/app/api/app/oi-pcr/route.ts');
  assert.ok(/const fresh = isFreshOptionsRow\(ts\);/.test(o) && /stale: !!row && !fresh/.test(o));
});

t('gexFromRow: 유한수만 — 행이 없으면 null(«—»)', () => {
  assert.equal(gexFromRow({ gex: 68075966 }), 68075966);
  assert.equal(gexFromRow({ gex: -38472626.4 }), -38472626.4);
  assert.equal(gexFromRow({}), null);
  assert.equal(gexFromRow(null), null);
  assert.equal(gexFromRow({ gex: 'x' }), null);
});

t('intel/fast 앱 전용 응답(?app=1): GEX·PCR 을 DynamoDB 행에서만 · 행 시각을 싣는다 · 웹(app 없음)은 한 줄도 안 바뀐다', () => {
  const r = read('src/app/api/intel/fast/route.ts');
  assert.ok(/const appMode = searchParams\.get\('app'\) === '1'/.test(r));
  assert.ok(/intelFastKey\(sector, appMode\)/.test(r));
  assert.ok(/intelFastWindow\(ph\.open, appMode\)/.test(r));
  assert.ok(/if \(appMode\) \{[\s\S]*?gex = gexFromRow\(row\);[\s\S]*?pcr = oiPcrAllExpiries\(row\);/.test(r));
  assert.ok(/\.\.\.\(appMode \? \{ optionsAsOf, pcrBasis: 'oi_all_expiries_35d', gexBasis: 'dynamo_latest_row' \} : \{\}\)/.test(r));
  // 옛 경로의 PCR 칸 줄(분석 캐시 → live oiPcr)은 그대로
  assert.ok(/pcr = pick\(analysis\?\.pcr, cached\?\.flow\?\.oiPcr\);/.test(r));
});

t('저장 키·허용 나이: 앱 전용 응답은 별도 키(웹 저장본과 섞이지 않는다) · 장외 허용 나이 30분(12시간 상한 폐지)', () => {
  assert.equal(intelFastKey('m7'), 'perf:intel-fast:v1:m7');
  assert.equal(intelFastKey('m7', true), 'perf:intel-fast:app1:m7');
  assert.deepEqual(intelFastWindow(false), { fresh: 5 * 60_000, maxStale: 12 * 3600_000 });   // 웹·옛 경로 그대로
  assert.deepEqual(intelFastWindow(true), { fresh: 20_000, maxStale: 10 * 60_000 });
  assert.deepEqual(intelFastWindow(false, true), { fresh: 5 * 60_000, maxStale: 30 * 60_000 });
  // 31분 된 야간 저장본은 앱 응답에서 쓰지 않는다 · 웹에서는 예전처럼 쓴다
  const night = { at: 1_000_000, phase: '2026-10-06:night', body: { success: true, data: [1] } };
  const now = 1_000_000 + 31 * 60_000;
  assert.equal(usableEnvelope(night as any, '2026-10-06:night', now, intelFastWindow(false, true).maxStale), null);
  assert.ok(usableEnvelope(night as any, '2026-10-06:night', now, intelFastWindow(false).maxStale));
  // 칸이 바뀌면(다른 세션) 못 쓴다 — 예전 규칙 그대로
  assert.equal(usableEnvelope(night as any, '2026-10-07:pre', now, 12 * 3600_000), null);
  assert.ok(etPhase(Date.UTC(2026, 9, 7, 4, 40)).key === '2026-10-06:night');   // 한국 13:40 = ET 00:40 — 야간 칸(전날 저녁 이름)
});

t('fast-all·app-warm 도 앱 전용 저장본을 읽고 굽는다(?app=1)', () => {
  const a = read('src/app/api/intel/fast-all/route.ts');
  assert.ok(/export async function GET\(request: Request\)/.test(a));
  assert.ok(/new URL\(request\.url\)\.searchParams\.get\('app'\) === '1'/.test(a));
  assert.ok(/intelFastKey\(sec, app\)/.test(a));
  assert.ok(/refresh=1\$\{app \? '&app=1' : ''\}/.test(a));
  const w = read('src/app/api/cron/app-warm/route.ts');
  assert.ok(/intel\/fast\?sector=\$\{s\}&app=1&refresh=1/.test(w));
});

// ── 3. 신선도 표기 («10/6 마감 기준») ─────────────────────────────────────────────
// 운영 실측: DynamoDB 행 2026-10-07 05:47 KST = 10/6 16:47 ET (마감 후 마지막 행)
const ROW_1006_CLOSE = Date.UTC(2026, 9, 6, 20, 47);

t('optionsAsOfNote: 마감 후(한국 13:40 = ET 00:40)·행은 10/6 마감 후 → «10/6 마감 기준»(ko·en·ja)', () => {
  const now = Date.UTC(2026, 9, 7, 4, 40);
  assert.equal(optionsSessionDate(ROW_1006_CLOSE), '2026-10-06');
  const ko = optionsAsOfNote(ROW_1006_CLOSE, now, false, 'ko')!;
  assert.equal(ko.label, '10/6 마감 기준'); assert.equal(ko.isPriorSession, false);
  assert.equal(optionsAsOfNote(ROW_1006_CLOSE, now, false, 'en')!.label, 'as of 10/6 close');
  assert.equal(optionsAsOfNote(ROW_1006_CLOSE, now, false, 'ja')!.label, '10/6 引け基準');
});

t('optionsAsOfNote: 정규장 개장 직후(ET 09:40, 오늘 행 아직 없음) → «10/6 마감 기준 · 이전 세션» (이전 세션 값이 «지금 값»처럼 보이지 않게)', () => {
  const now = Date.UTC(2026, 9, 7, 13, 40);
  const r = optionsAsOfNote(ROW_1006_CLOSE, now, true, 'ko')!;
  assert.equal(r.label, '10/6 마감 기준 · 이전 세션');
  assert.equal(r.isPriorSession, true);
});

t('optionsAsOfNote: 정규장 중 오늘 행(09:47 ET)이면 표기 없음(실시간 갱신 값)', () => {
  const now = Date.UTC(2026, 9, 7, 15, 0);
  const todayRow = Date.UTC(2026, 9, 7, 13, 47);
  assert.equal(optionsAsOfNote(todayRow, now, true, 'ko'), null);
});

t('optionsAsOfNote: 주말 — 금요일 마감 행은 «10/9 마감 기준»(이전 세션 아님) · 행 시각이 없으면 null', () => {
  const sat = Date.UTC(2026, 9, 10, 12, 0);
  const friClose = Date.UTC(2026, 9, 9, 20, 47);
  const r = optionsAsOfNote(friClose, sat, false, 'ko')!;
  assert.equal(r.label, '10/9 마감 기준'); assert.equal(r.isPriorSession, false);
  assert.equal(optionsAsOfNote(null, sat, false, 'ko'), null);
  assert.equal(optionsAsOfNote(0, sat, false, 'ko'), null);
  assert.equal(latestOptionsAsOf([{ optionsAsOf: 5 }, { optionsAsOf: 9 }, {}, { optionsAsOf: null }]), 9);
  assert.equal(latestOptionsAsOf([]), null);
});

// ── 4. 섹터 설정 목록 기준 ─────────────────────────────────────────────────────────
t('설정 목록: 10섹터 · 칩(+N)과 수치가 같은 목록 — 페이지의 SECTOR_CONFIGS.stocks 는 이 표를 쓴다', () => {
  assert.equal(Object.keys(APP_SECTOR_STOCKS).length, 10);
  assert.deepEqual(APP_SECTOR_STOCKS.quantum_edge, ['IONQ', 'RGTI', 'QBTS']);
  const page = read('src/app/[locale]/app-view/intel/page.tsx');
  for (const id of Object.keys(APP_SECTOR_STOCKS)) assert.ok(page.includes(`id: '${id}', stocks: APP_SECTOR_STOCKS.${id}`), id);
  assert.ok(/useIntelSharedDataForApp\(\{ optionsBasis: true, sectorBasis: 'config' \}\)/.test(page));
  assert.equal(Object.keys(SECTOR_ID_TO_HOOK_KEY).length, 10);
});

t('rebucketBySectorLists: 엔진 목록 → 설정 목록(부분집합 · 다른 섹터 종목 · 엔진 밖 종목) — 퀀텀은 IONQ·RGTI·QBTS, 클라우드는 SNOW·NET 을 다른 섹터에서 가져온다', () => {
  const q = (ticker: string, changePct: number) => ({ ticker, changePct });
  const byKey = {
    m7: [q('NVDA', 1), q('AAPL', 0.5), q('MSFT', 0.2), q('TSLA', -1), q('META', 0.1), q('GOOGL', 0.3), q('AMZN', 0.4)],
    physicalAI: [q('PLTR', 3), q('SERV', 1), q('PL', 2), q('TER', -1), q('SYM', 0.5), q('RKLB', 4), q('ISRG', 0.1)],
    quantumEdge: [q('SMCI', 5), q('SNOW', 2), q('IONQ', 1.5), q('DELL', -2), q('AI', 0.3), q('PATH', 0.2), q('TWLO', 0.1)],
    cyberShield: [q('CRWD', 1), q('PANW', 2), q('FTNT', 0.3), q('ZS', 0.2), q('S', 0.1), q('OKTA', 0.4), q('NET', 3)],
    cloudFortress: [q('CRM', 1), q('NOW', 2), q('DDOG', 0.3), q('WDAY', 0.2), q('MDB', 0.1), q('TEAM', 0.4), q('HUBS', 3)],
  } as any;
  const extras = [q('RGTI', 6), q('QBTS', -3)];
  const out = rebucketBySectorLists(byKey, extras);
  assert.deepEqual(out.quantumEdge.map((x: any) => x.ticker), ['RGTI', 'IONQ', 'QBTS']);          // 변동률 내림차순
  assert.deepEqual(out.physicalAI.map((x: any) => x.ticker).sort(), ['ISRG', 'PL', 'RKLB', 'SERV', 'SYM', 'TER']);   // PLTR 제외
  assert.ok(!out.physicalAI.some((x: any) => x.ticker === 'PLTR'));
  assert.deepEqual(out.cloudFortress.map((x: any) => x.ticker).sort(), ['CRM', 'DDOG', 'NET', 'NOW', 'SNOW']);       // SNOW(퀀텀 엔진)·NET(사이버 엔진)을 가져온다
  assert.equal(out.m7.length, 7);
  // 시세가 없는 종목은 만들어 넣지 않는다
  assert.equal(out.siliconCore.length, 0);
  const noExtras = rebucketBySectorLists(byKey, []);
  assert.deepEqual(noExtras.quantumEdge.map((x: any) => x.ticker), ['IONQ']);
});

t('configTickersMissingFrom: 엔진 목록 70종목에 없는 설정 종목은 RGTI·QBTS 둘뿐', () => {
  const engine = [
    'AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG',
    'AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL', 'CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN',
    'LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD', 'CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET',
    'LMT', 'RTX', 'AXON', 'SPCX', 'LDOS', 'ASTS', 'LUNR', 'SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO',
    'XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST', 'CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS',
  ];
  assert.equal(engine.length, 70);
  assert.deepEqual(configTickersMissingFrom(engine), ['RGTI', 'QBTS']);
});

t('앱 훅: 앱 전용 옵션(appBasis)이면 배치가 GEX·P/C 를 덮지 않고 · 배치만 먼저 온 종목에 알파 50·등급 B 를 채우지 않는다(웹은 예전 그대로) — quoteFromBatchResult 실행', () => {
  const batch = { ticker: 'RGTI', realtime: { price: 15.17, changePct: 0.13, gex: 1412812, pcr: 0.44, netPremium: null }, alphaSnapshot: {} };
  const app = quoteFromBatchResult(batch, true)!;
  assert.equal(app.alphaScore, 0); assert.equal(app.grade, '');                 // «없음» — 50·B 를 채우지 않는다
  assert.equal(app.gex, 0); assert.equal(app.pcr, 0); assert.equal(app.gammaRegime, 'UNKNOWN');   // 배치의 W 값은 화면에 쓰지 않는다
  assert.equal(app.price, 15.17);
  const web = quoteFromBatchResult(batch, false)!;                               // 웹(옵션 없음)은 예전 그대로
  assert.equal(web.alphaScore, 50); assert.equal(web.grade, 'B'); assert.equal(web.gex, 1412812); assert.equal(web.pcr, 0.44); assert.equal(web.gammaRegime, 'LONG');
  // 알파를 실제로 잰 종목은 앱에서도 그 값
  const measured = quoteFromBatchResult({ ticker: 'NVDA', realtime: { price: 100 }, alphaSnapshot: { score: 71, grade: 'A' } }, true)!;
  assert.equal(measured.alphaScore, 71); assert.equal(measured.grade, 'A');
  assert.equal(quoteFromBatchResult({ ticker: 'X', error: 'e' }, true), null);
  const h = read('src/hooks/useIntelSharedData.ts');
  assert.ok(/const gex = appBasis \? existing\.gex : pickFiniteNumber\(rt\.gex, existing\.gex\)/.test(h));
  assert.ok(/pcr: appBasis \? existing\.pcr : pickFiniteNumber\(rt\.pcr, existing\.pcr\)/.test(h));
  assert.ok(/safeFetch\(appBasis \? '\/api\/intel\/fast-all\?app=1' : '\/api\/intel\/fast-all'\)/.test(h));
  assert.ok(/appBasis: optionsBasis/.test(h));
  assert.ok(/const appBasis = runtimeOptions\?\.appBasis \?\? false;/.test(h));   // 웹 경로(옵션 없음) 기본값은 예전 그대로
  assert.ok(h.includes("from '@/lib/app/intelQuoteFromBatch'"));
});

// ── 5. 데이터 없음 기본값(Guardian · Command) ────────────────────────────────────
t('Guardian 앱 전용 prop(appBlank): 시장 폭 50/50 · A/D 1.00:1 균형 · 매수량 50% 균형 · 유동성 50 우호적 · 안전자산 0.00 안정 · ROTATION 50% · MOMENTUM 0.0% 를 «—» 로', () => {
  const panel = read('src/components/guardian/MarketBreadthPanel.tsx');
  assert.ok(/appBlank = false,/.test(panel));
  assert.ok(/const blankNumbers = appBlank && \(breadthIsDefault \|\| !!loading\);/.test(panel));
  assert.ok(/\{blankNumbers \? '—' : adRatio\.toFixed\(2\)\}/.test(panel));
  assert.ok(/\{blankNumbers \? '—' : volumeBreadth\.toFixed\(1\)\}/.test(panel));
  assert.ok(/blank=\{blankNumbers\}/.test(panel));
  const ov = read('src/components/guardian/mobile/MobileGuardianOverview.tsx');
  assert.ok(/appBlank = false/.test(ov));
  assert.ok(/liquidityKnown \? liquidityScore\.toFixed\(0\) : '—'/.test(ov));
  assert.ok(/safeHavenKnown \? safeHavenFlow\.toFixed\(2\) : '—'/.test(ov));
  assert.ok(/appBlank=\{appBlank\}/.test(ov));
  const fl = read('src/components/guardian/mobile/MobileGuardianFlow.tsx');
  assert.ok(/appBlank = false/.test(fl));
  assert.ok(/rotKnown \? `\$\{\(data\?\.rotationIntensity\?\.score \|\| 50\)\.toFixed\(0\)\}%` : '—'/.test(fl));
  // Gravity Gauge 구성요소: 점수를 못 받으면 «NaN · 취약»(10/7 재현) 대신 «—»
  const gg = read('src/components/guardian/GravityGauge.tsx');
  assert.ok(/appBlank = false/.test(gg));
  assert.ok(/const known = !appBlank \|\| Number\.isFinite\(item\.score\);/.test(gg));
  assert.ok(/\{known \? Math\.round\(item\.score\) : '—'\}/.test(gg));
  assert.ok(/loading=\{loading \|\| \(appBlank && !\(typeof data\?\.rlsi\?\.score === 'number'/.test(ov));
  // 앱 Guardian 페이지만 켠다 — 웹 MobileGuardianPage 는 prop 을 주지 않는다(기본 false)
  const appPage = read('src/app/[locale]/app-view/guardian/page.tsx');
  assert.ok((appPage.match(/appBlank/g) || []).length >= 2);
  const webPage = read('src/components/guardian/mobile/MobileGuardianPage.tsx');
  assert.ok(!/appBlank/.test(webPage));
});

t('Command(앱): 시세 응답이 없으면 0 값 DEMO 화면이 아니라 «불러오지 못했습니다 · 다시 시도» 패널 · 조금 전 정상값은 기준 시각과 함께 남긴다 · 애널리스트 없음은 «—»', () => {
  const c = read('src/app/[locale]/app-view/cmd/page.tsx');
  assert.ok(/const apiPriceOk = Number\.isFinite\(Number\(price\)\) && Number\(price\) > 0;/.test(c));
  assert.ok(/setLoadFailed\(true\)/.test(c));
  // 가격 훅(실시간)이 가격을 주면 나머지 데이터로 화면을 그린다 — 패널은 «가격을 아는 곳이 하나도 없을 때»만
  assert.ok(/if \(!loading && loadFailed && \(!data \|\| data\.ticker !== ticker \|\| !\(displayPrice > 0\)\)\)/.test(c));
  assert.ok(/if \(apiPriceOk\) \{\s*CMD_CACHE\.set\(ticker/.test(c));   // 0 값 화면은 «조금 전 정상값» 캐시에 넣지 않는다
  assert.ok(c.includes("'불러오지 못했습니다'") && c.includes("'다시 시도'") && c.includes("'読み込めませんでした'") && c.includes("'Try again'"));
  assert.ok(/setStaleSince\(prior\.at\)/.test(c));
  // catch 의 «0 값 DEMO 로 덮기»는 사라졌다
  assert.ok(!/setData\(\{ \.\.\.DEMO, ticker, company: DEMO\.company/.test(c));
  assert.ok(/\{hasConsensus \? `\$\{buyPct\}%` : '—'\}/.test(c));
  assert.ok(/\{hasTarget \? `\$\{analyst\.target\.toFixed\(2\)\}` : '—'\}/.test(c) || /\{hasTarget \? `\$\$\{analyst\.target\.toFixed\(2\)\}` : '—'\}/.test(c));
  assert.ok(/Buy \{hasConsensus \? analyst\.buy : '—'\}/.test(c));
});

t('Flow(앱): C/P 카드 — 거래량 칸은 «주간 만기 거래량», OI 칸은 예전 «OI (Monthly)»(실제로는 rawChain 주간 만기 1개) 대신 Intel 의 PCR 과 같은 정의(35일 이내 전 만기 · /api/app/oi-pcr)', () => {
  const f = read('src/app/[locale]/app-view/flow/page.tsx');
  assert.ok(f.includes("'주간 만기 거래량'") && f.includes("'WEEKLY VOLUME'") && f.includes("'週次満期 出来高'"));
  assert.ok(f.includes("'OI · 35일 전 만기'") && f.includes("'OI · ALL EXP 35D'") && f.includes("'OI · 35日 全満期'"));
  assert.ok(/optionalFetch\(`\/api\/app\/oi-pcr\?t=\$\{ticker\.toUpperCase\(\)\}`, 4500\)/.test(f));
  assert.ok(/const cpOi = oiAll \? \{ text: cpText\(oiAll\.callOI, oiAll\.putOI\), bias: pcBiasOf\(oiAll\.callOI, oiAll\.putOI\) \} : \{ text: '—'/.test(f));
  // OI 칸은 rawChain 합(주간 만기)으로 그리지 않는다
  assert.ok(!/cpText\(pcCallOI, pcPutOI\)/.test(f));
  const r = read('src/app/api/app/oi-pcr/route.ts');
  assert.ok(/oiPcrAllExpiries\(use\)/.test(r) && /basis: 'oi_all_expiries_35d'/.test(r) && /getLatestGex\(t\)/.test(r));
  assert.ok(/\^\[A-Z\]\[A-Z0-9\.\\-\]\{0,9\}\$/.test(r));   // 티커 형식 검사
});

t('Intel 섹터 상세: 종목 목록·집계도 설정 목록으로 — reportRaw(서버 리포트) → reportData(alignReportToConfig) 파생 · 리포트에 없는 설정 종목(RGTI·QBTS)은 시세로 채움', () => {
  const page = read('src/app/[locale]/app-view/intel/page.tsx');
  assert.ok(/const \[reportRaw, setReportData\] = useState<SectorReportData \| null>\(null\);/.test(page));
  assert.ok(/const reportData = useMemo<SectorReportData \| null>\(\(\) => \{[\s\S]*?alignReportToConfig\(reportRaw, selectedSector, quotes\)/.test(page));
  assert.ok(/function alignReportToConfig\(report: SectorReportData, sectorId: string, quotes: IntelQuote\[\]\): SectorReportData \{/.test(page));
  assert.ok(/for \(const sym of sec\.stocks\) \{/.test(page));
  assert.ok(/function quoteToKeyStock\(q: IntelQuote\): KeyStockPremiumData \{/.test(page));
  // 점수가 없는 행들로 «CTX 0» 을 만들지 않는다 — 서버 리포트 값 유지
  assert.ok(/avgAlpha: scoreVals\.length \? scoreVals\.reduce\(\(a, b\) => a \+ b, 0\) \/ scoreVals\.length : report\.avgAlpha,/.test(page));
  // 시세가 없는 종목의 GEX·PCR 은 리포트(스냅샷)의 값으로 메우지 않는다
  assert.ok(/if \(!quote\) return \{ \.\.\.stock, gex: null, pcr: null, gammaRegime: null \};/.test(page));
});

console.log(`\n✅ appAccuracy2: ${n}건 통과`);
