/**
 * 2026-10-20 SPY 장중 OI P/C 결측 핫픽스 — 무네트워크.
 * 실행: NODE_PATH=…/stock2/node_modules TS_NODE_TRANSPILE_ONLY=1 TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","jsx":"react","esModuleInterop":true}' node -r ts-node/register -r tsconfig-paths/register tests/oiPcrSpyGuardian.test.ts
 *
 *   운영 실측(10/20 09:5x ET): signum-gex-history 의 SPY 최신 행이 EC2 guardian 스냅샷(SPX 수준 11필드·OI 없음, 약 5분마다)이라
 *   수집 Lambda 행(15분, OI 합계 23필드)을 가렸다 → /api/app/oi-pcr·live/ticker flow.oiPcr null → C/P 카드·OPI «—».
 *   체인 합산은 «결측 0건» 규칙(운영 결정 10/20)에 10/19 상장 만기(11/02, 60/60 결측)가 걸려 매번 거부, EOD 35일도 결측 50건으로 거부.
 *   ① 근본: 수집 행만 읽는다(guardian 행 건너뜀) ② 안전망: 종목별 «직전 정상값»(같은 35일 정의·값 시각·기준일).
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const realRedis = require('../src/services/redisClient');
const store = new Map<string, unknown>();
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
    id: rcPath, filename: rcPath, loaded: true,
    exports: {
        ...realRedis,
        getFromCache: async (k: string) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
        mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null)),
        setInCache: async (k: string, v: unknown) => { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
} as unknown as Module;
/** 최신순 행 목록(종목별) — getLatestGex = [0], getGexHistory = 앞에서 n 개 */
const history: Record<string, any[]> = {};
let historyCalls = 0;
const dyPath = require.resolve('../src/lib/aws/dynamoDataProvider');
require.cache[dyPath] = {
    id: dyPath, filename: dyPath, loaded: true,
    exports: {
        getLatestGex: async (t: string) => (history[t] || [])[0] ?? null,
        getGexHistory: async (t: string, n: number) => { historyCalls++; return (history[t] || []).slice(0, n); },
    },
} as unknown as Module;
const realFetch = global.fetch;
(global as any).fetch = async () => { throw new Error('Unexpected network access'); };

import { isGuardianSnapshotRow, firstCollectorRow, oiRowHasQuantities, latestCollectorGexRow } from '../src/lib/app/intelOptionsBasis';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const getLatestCollectorGex = (t: string) => latestCollectorGexRow(require('../src/lib/aws/dynamoDataProvider'), t);
import {
    readLastGoodOi, validLastGoodOi, rememberLastGoodOi, OI_PCR_LASTGOOD_KEY, CHAIN_OI35_PREV_KEY, _resetOi35Memo, _resetLastGoodMemo,
} from '../src/services/oiNear35Fallback';
import { opiFromOiPcr, opiGaugeStatus, measuredOiPcr } from '../src/lib/app/flowOpi';
import { readOptionMetrics } from '../src/services/optionMetricsService';
import { optionMetricsRowHasOi } from '../src/lib/optionMetrics';

const EDT = (y: number, mo: number, d: number, h: number, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h + 4, mi, s);
const NOW = EDT(2026, 10, 20, 9, 52);   // 10/20(화) 정규장 — 22:52 KST

// 운영 DynamoDB 실측 행(10/20) 그대로
const GUARDIAN = (ts: number) => ({ squeezeRisk: 37, callWall: 7900, ticker: 'SPY', gammaRegime: 'NEUTRAL', maxPain: null, squeezeLevel: 'MEDIUM', gex: 8, price: 7654, flipLevel: null, putFloor: 7450, timestamp: ts });
const COLLECTOR_SPY = {
    optionVolume: 1084151, totalPutOI: 870084, ivSkew: 0.94, atmIv: 14.62, ticker: 'SPY', gammaRegime: 'NEGATIVE', totalCallOI: 521743, iv30Def: 'cm30-v1',
    squeezeScore: 80, flipLevel: 767.5, totalContracts: 1834, callWall: 790, iv30Date: '2026-10-19', iv30: 14.31, impliedMovePct: 0.8, maxPain: 770,
    gex: -302778704, iv30Near: '2026-11-13', pcr: 1.67, iv30Far: '2026-11-20', price: 766.48, putFloor: 745, timestamp: EDT(2026, 10, 20, 9, 47, 54),
};
const COLLECTOR_QQQ = { ...COLLECTOR_SPY, ticker: 'QQQ', totalCallOI: 378888, totalPutOI: 523023, totalContracts: 2122, pcr: 1.38 };
const SPY_ROWS = () => [GUARDIAN(EDT(2026, 10, 20, 9, 50, 57)), COLLECTOR_SPY, GUARDIAN(EDT(2026, 10, 20, 9, 45, 54)), GUARDIAN(EDT(2026, 10, 20, 9, 40, 50))];

const queue: Array<[string, () => unknown]> = [];
const t = (name: string, fn: () => unknown) => queue.push([name, fn]);
const flush = () => new Promise((r) => setImmediate(r));
function reset() { store.clear(); _resetOi35Memo(); _resetLastGoodMemo(); historyCalls = 0; for (const k of Object.keys(history)) delete history[k]; }
async function withNow<T>(fn: () => Promise<T>): Promise<T> {
    const realNow = Date.now; (Date as any).now = () => NOW;
    try { return await fn(); } finally { (Date as any).now = realNow; }
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const route = () => require('../src/app/api/app/oi-pcr/route');
const get = async (tk: string) => (await (await route().GET(new Request(`http://x/api/app/oi-pcr?t=${tk}`))).json());

// ━━━ ① 근본: guardian 스냅샷 행 판정·건너뛰기 ━━━
t('guardian 스냅샷 판정: 운영 실측 11필드 행 = guardian · 수집 Lambda 23필드 행 = 아님 · 수량 있는 행에 squeezeLevel 이 있어도 아님', () => {
    assert.equal(isGuardianSnapshotRow(GUARDIAN(NOW)), true);
    assert.equal(isGuardianSnapshotRow(COLLECTOR_SPY), false);
    assert.equal(isGuardianSnapshotRow({ ...COLLECTOR_SPY, squeezeLevel: 'LOW' }), false);
    assert.equal(isGuardianSnapshotRow({ timestamp: NOW, pcr: null }), false);   // 수량 없는 수집 행(squeezeLevel 없음)은 그대로 «행» — 기존 대체 경로
    assert.equal(isGuardianSnapshotRow(null), false);
    assert.equal(firstCollectorRow(SPY_ROWS()), COLLECTOR_SPY);
    assert.equal(firstCollectorRow([GUARDIAN(NOW), GUARDIAN(NOW - 300_000)]), null);
    assert.equal(firstCollectorRow(null), null);
});

t('latestCollectorGexRow: 최신이 guardian 이면 최근 8행 중 첫 수집 행 · 다른 종목은 추가 조회 없이 첫 행 그대로 · 8행 안에 없으면 null', async () => {
    reset();
    history.SPY = SPY_ROWS();
    assert.equal(await getLatestCollectorGex('SPY'), COLLECTOR_SPY);
    assert.equal(historyCalls, 1);
    history.QQQ = [COLLECTOR_QQQ];
    historyCalls = 0;
    assert.equal(await getLatestCollectorGex('QQQ'), COLLECTOR_QQQ);
    assert.equal(historyCalls, 0);
    history.SPY = Array.from({ length: 8 }, (_, i) => GUARDIAN(NOW - i * 300_000)).concat([COLLECTOR_SPY]);
    assert.equal(await getLatestCollectorGex('SPY'), null);
    history.NONE = [];
    assert.equal(await getLatestCollectorGex('NONE'), null);
});

t('SPY·QQQ·SPX 혼합 행: oi-pcr와 optionMetrics가 같은 수집 OI·시각을 사용', async () => {
    reset();
    const spx = { ...COLLECTOR_SPY, ticker: 'SPX', price: 7655, callWall: 7900, pcr: 1.2,
        totalCallOI: 1000, totalPutOI: 1200 };
    history.SPY = SPY_ROWS();
    history.QQQ = [COLLECTOR_QQQ];
    history.SPX = [{ ...GUARDIAN(NOW), ticker: 'SPX', source: 'ec2-guardian' }, spx];
    for (const row of [COLLECTOR_SPY, COLLECTOR_QQQ, spx]) {
        const j = await withNow(() => get(row.ticker));
        const m = (await withNow(() => readOptionMetrics([row.ticker]))).get(row.ticker)!;
        assert.equal(j.pcr, row.pcr);
        assert.equal(j.callOI, row.totalCallOI);
        assert.equal(j.putOI, row.totalPutOI);
        assert.equal(j.asOf, row.timestamp);
        assert.equal(m.pcr, row.pcr);
    }
});

t('oi-pcr 재현(10/20 09:52 ET): 최신 행 guardian → 예전엔 pcr null, 이제 수집 행 1.67(콜 521,743·풋 870,084·35일 정의) — live/ticker 와 같은 행', async () => {
    reset();
    history.SPY = SPY_ROWS();
    // 예전 동작 재현: 최신 행(guardian)은 수량이 없어 «행 사용 불가»
    assert.equal(oiRowHasQuantities(history.SPY[0]), false);
    const j = await withNow(() => get('SPY'));
    assert.equal(j.pcr, 1.67);
    assert.equal(j.callOI, 521743);
    assert.equal(j.putOI, 870084);
    assert.equal(j.contracts, 1834);
    assert.equal(j.basis, 'oi_all_expiries_35d');
    assert.equal(j.asOf, COLLECTOR_SPY.timestamp);
    assert.equal(j.stale, false);
    assert.equal('lastGood' in j, false);
});

t('Flow OPI(live/ticker 입력): optionMetrics 도 수집 행을 읽어 SPY pcr 1.67 · 행 수량 있음 → OPI 17(BEARISH) — «—» 아님', async () => {
    reset();
    history.SPY = SPY_ROWS();
    const m = (await withNow(() => readOptionMetrics(['SPY']))).get('SPY')!;
    assert.equal(m.pcr, 1.67);
    assert.equal(optionMetricsRowHasOi(m), true);   // live/ticker 는 대체로 가지 않고 행 값을 flow.oiPcr 로
    assert.equal(opiFromOiPcr(measuredOiPcr(m.pcr)), 17);
    assert.equal(opiGaugeStatus(opiFromOiPcr(m.pcr)), 'BEARISH');
    // TSLA 같은 일반 종목(guardian 없음)은 그대로
    history.TSLA = [{ ...COLLECTOR_SPY, ticker: 'TSLA', pcr: 0.86, totalCallOI: 1000, totalPutOI: 860 }];
    const tm = (await withNow(() => readOptionMetrics(['TSLA']))).get('TSLA')!;
    assert.equal(tm.pcr, 0.86);
});

// ━━━ ② 안전망: 직전 정상값 ━━━
t('안전망: 행 수량 결측 + 체인·직전 체인·EOD 없음 — 첫 요청(직전값 없음)은 기존 그대로 null · 정상 응답 뒤엔 그 직전 정상값(같은 정의·값 시각)', async () => {
    reset();
    const missingRow = { timestamp: NOW - 120_000, pcr: null };   // 신선하지만 OI 수량 없는 행(guardian 아님)
    history.SPY = [missingRow];
    const first = await withNow(() => get('SPY'));
    assert.deepEqual(
        { pcr: first.pcr, callOI: first.callOI, putOI: first.putOI, contracts: first.contracts, basis: first.basis, stale: first.stale, lastGood: first.lastGood },
        { pcr: null, callOI: null, putOI: null, contracts: null, basis: 'oi_all_expiries_35d', stale: false, lastGood: undefined },
    );
    // 정상 행 응답 → 직전 정상값 저장(응답 뒤)
    history.SPY = [COLLECTOR_SPY];
    const ok = await withNow(() => get('SPY'));
    assert.equal(ok.pcr, 1.67);
    await flush();
    const saved: any = store.get(OI_PCR_LASTGOOD_KEY('SPY'));
    assert.equal(saved.pcr, 1.67); assert.equal(saved.basis, 'oi_all_expiries_35d'); assert.equal(saved.asOf, COLLECTOR_SPY.timestamp);
    // 다시 결측 → 직전 정상값
    history.SPY = [missingRow];
    const lg = await withNow(() => get('SPY'));
    assert.equal(lg.pcr, 1.67);
    assert.equal(lg.callOI, 521743);
    assert.equal(lg.putOI, 870084);
    assert.equal(lg.contracts, 1834);
    assert.equal(lg.basis, 'oi_all_expiries_35d');       // 같은 정의
    assert.equal(lg.asOf, COLLECTOR_SPY.timestamp);       // 값의 시각 그대로(지금 시각으로 바꾸지 않음)
    assert.equal(lg.lastGood, true);
    assert.equal(opiFromOiPcr(lg.pcr), 17);
});

t('안전망 순서: 직전 체인 저장본·EOD 35일이 있으면 그것이 먼저(기준일 표식 유지) — 직전 정상값은 마지막', async () => {
    reset();
    history.SPY = [{ timestamp: NOW - 120_000, pcr: null }];
    store.set(OI_PCR_LASTGOOD_KEY('SPY'), { pcr: 1.67, callOI: 521743, putOI: 870084, contracts: 1834, basis: 'oi_all_expiries_35d', asOf: COLLECTOR_SPY.timestamp, eodDate: null, oiDate: null, savedAt: NOW });
    store.set(CHAIN_OI35_PREV_KEY('SPY'), { callOI: 1_000_000, putOI: 2_500_000, recordDate: '2026-10-16', anchor: '2026-10-19', expiries: 13, contracts: 9000, missingOi: 0 });
    const j = await withNow(() => get('SPY'));
    assert.equal(j.pcr, 2.5);
    assert.equal(j.basis, 'oi_near_expiries_35d_chain_prev');
    assert.equal(j.oiDate, '2026-10-15');
    assert.equal(j.lastGood, undefined);
    await flush();
    // 대체값도 직전 정상값으로 남는다(기준일 포함)
    const saved: any = store.get(OI_PCR_LASTGOOD_KEY('SPY'));
    assert.equal(saved.basis, 'oi_near_expiries_35d_chain_prev'); assert.equal(saved.oiDate, '2026-10-15'); assert.equal(saved.eodDate, '2026-10-16'); assert.equal(saved.anchor, '2026-10-19');
    // 그 뒤 직전 체인 저장본이 사라지면 직전 정상값이 기준일과 함께
    store.delete(CHAIN_OI35_PREV_KEY('SPY'));
    const k = await withNow(() => get('SPY'));
    assert.equal(k.pcr, 2.5); assert.equal(k.basis, 'oi_near_expiries_35d_chain_prev'); assert.equal(k.oiDate, '2026-10-15'); assert.equal(k.eodDate, '2026-10-16'); assert.equal(k.lastGood, true);
});

t('안전망 검사: 다른 만기 범위(basis)·5일 넘은 값·결측 수량·0 이하 P/C 는 쓰지 않는다 · 같은 값 반복 쓰기는 10분에 한 번', async () => {
    reset();
    const base = { pcr: 1.67, callOI: 521743, putOI: 870084, contracts: 1834, basis: 'oi_all_expiries_35d', asOf: COLLECTOR_SPY.timestamp, eodDate: null, oiDate: null, savedAt: NOW };
    assert.ok(validLastGoodOi(base, NOW));
    for (const bad of [
        { basis: 'oi_all_expiries' }, { basis: 'oi_weekly' }, { basis: undefined },
        { asOf: NOW - 5 * 24 * 3600_000 - 1 }, { asOf: NOW + 2 * 3600_000 }, { asOf: null },
        { callOI: null }, { putOI: '' }, { pcr: 0 }, { pcr: null }, { pcr: -1 },
    ]) assert.equal(validLastGoodOi({ ...base, ...bad }, NOW), null, JSON.stringify(bad));
    store.set(OI_PCR_LASTGOOD_KEY('SPY'), { ...base, basis: 'oi_all_expiries' });
    assert.equal(await readLastGoodOi('SPY', NOW), null);
    // 원래 기준의 신선도 규칙 그대로(sessionArchiveB3 D16: 두 세션 넘은 EOD 판은 대체하지 않는다) — 직전 정상값으로 우회 불가
    const eod = { ...base, basis: 'oi_near_expiries_35d_eod', eodDate: '2026-10-16', oiDate: '2026-10-15', asOf: EDT(2026, 10, 16, 16) };
    assert.ok(validLastGoodOi(eod, NOW));                                   // 10/20 장중: 최소 레코드 10/16 → 통과
    assert.equal(validLastGoodOi(eod, EDT(2026, 10, 21, 10, 10)), null);    // 10/21 장중: 10/16 은 두 세션 넘음 → 거부
    assert.equal(validLastGoodOi({ ...eod, eodDate: null }, NOW), null);    // 레코드 날짜 없는 대체값은 거부
    const prev = { ...eod, basis: 'oi_near_expiries_35d_chain_prev', eodDate: '2026-10-15', oiDate: '2026-10-14', anchor: '2026-10-19' };
    assert.ok(validLastGoodOi(prev, NOW));                                  // 직전 체인은 한 세션 더 허용(readPrevChainOi35 와 같다)
    assert.equal(validLastGoodOi({ ...prev, anchor: undefined }, NOW), null);   // 창 시작일 없는 체인 값은 거부
    // 관문 10202338 ①: 10/15 창·레코드를 10/16 에 정상값으로 저장 → 10/20 장중엔 기존 대체(4일 상한)처럼 거부
    const oldWin = { ...base, basis: 'oi_near_expiries_35d_chain', anchor: '2026-10-15', eodDate: '2026-10-15', oiDate: '2026-10-14', asOf: EDT(2026, 10, 15, 16), pcr: 3 };
    assert.ok(validLastGoodOi(oldWin, EDT(2026, 10, 16, 10)));             // 10/16 엔 직전 창으로 통과
    assert.equal(validLastGoodOi(oldWin, NOW), null);                       // 10/20 엔 창 4일 상한 초과 → 거부
    assert.equal(validLastGoodOi({ ...oldWin, basis: 'oi_near_expiries_35d_chain_prev' }, NOW), null);   // 관문 재현 그대로(직전 체인 basis·레코드 10/15 는 한 세션 허용 안이지만 창이 4일 넘음)
    // 오늘 창 체인 값은 오늘 규칙(레코드 ≥ 최소 레코드) · 이전 창 «오늘 체인» 값은 «직전»(chain_prev)으로 밝혀 낸다
    const todayWin = { ...base, basis: 'oi_near_expiries_35d_chain', anchor: '2026-10-20', eodDate: '2026-10-16', oiDate: '2026-10-15', asOf: EDT(2026, 10, 16, 16) };
    assert.equal(validLastGoodOi(todayWin, NOW)!.basis, 'oi_near_expiries_35d_chain');
    assert.equal(validLastGoodOi({ ...todayWin, eodDate: '2026-10-15' }, NOW), null);
    assert.equal(validLastGoodOi({ ...todayWin, anchor: '2026-10-19' }, NOW)!.basis, 'oi_near_expiries_35d_chain_prev');
    assert.equal(validLastGoodOi({ ...todayWin, anchor: '2026-10-21' }, NOW), null);   // 미래 창 거부
    // 같은 값은 인스턴스당 10분에 한 번만 쓴다
    store.clear();
    const { savedAt: _s, ...v } = base as any;
    await rememberLastGoodOi('SPY', v, NOW);
    assert.ok(store.get(OI_PCR_LASTGOOD_KEY('SPY')));
    store.clear();
    await rememberLastGoodOi('SPY', v, NOW + 60_000);
    assert.equal(store.get(OI_PCR_LASTGOOD_KEY('SPY')), undefined);
    await rememberLastGoodOi('SPY', { ...v, pcr: 1.7 }, NOW + 60_000);   // 값이 바뀌면 바로
    assert.equal((store.get(OI_PCR_LASTGOOD_KEY('SPY')) as any).pcr, 1.7);
    // 다른 정의는 저장도 안 한다
    store.clear(); _resetLastGoodMemo();
    await rememberLastGoodOi('SPY', { ...v, basis: 'oi_all_expiries' as any }, NOW);
    assert.equal(store.get(OI_PCR_LASTGOOD_KEY('SPY')), undefined);
});

t('관문 10200048 유지: 행에 유효 수량(콜 0·풋 100)이 있어 P/C 만 못 내면 행 그대로(null) — 직전 정상값으로 덮지 않는다', async () => {
    reset();
    store.set(OI_PCR_LASTGOOD_KEY('NVDA'), { pcr: 0.73, callOI: 521250, putOI: 410259, contracts: 812, basis: 'oi_all_expiries_35d', asOf: NOW - 600_000, eodDate: null, oiDate: null, savedAt: NOW });
    history.NVDA = [{ timestamp: NOW - 60_000, pcr: null, totalCallOI: 0, totalPutOI: 100, totalContracts: 4 }];
    const j = await withNow(() => get('NVDA'));
    assert.equal(j.pcr, null); assert.equal(j.callOI, 0); assert.equal(j.putOI, 100); assert.equal(j.lastGood, undefined);
});

// ━━━ 회귀: 정상 행·QQQ·WTFC ━━━
t('회귀: 정상 행(QQQ)은 응답 모양·값 그대로(lastGood 없음) · 응답 키 집합 무변경', async () => {
    reset();
    history.QQQ = [COLLECTOR_QQQ];
    const j = await withNow(() => get('QQQ'));
    assert.deepEqual(Object.keys(j).sort(), ['asOf', 'basis', 'callOI', 'contracts', 'pcr', 'putOI', 'stale', 'success', 'ticker']);
    assert.equal(j.pcr, 1.38); assert.equal(j.callOI, 378888); assert.equal(j.putOI, 523023); assert.equal(j.contracts, 2122);
    assert.equal(j.basis, 'oi_all_expiries_35d'); assert.equal(j.asOf, COLLECTOR_QQQ.timestamp); assert.equal(j.stale, false);
});

t('회귀: WTFC(수집 행 8/28 에 멈춤) — EOD 35일(결측 0·완전) 대체 그대로 · 대체도 없으면 stale 행 + null(직전값 없음)', async () => {
    reset();
    history.WTFC = [{ ticker: 'WTFC', timestamp: Date.UTC(2026, 7, 28, 13, 2), pcr: 1.2, totalCallOI: 50, totalPutOI: 60, totalContracts: 20 }];
    store.set('intrinio:options:eod', { date: '2026-10-19', tickers: { WTFC: { callOI35: 11, putOI35: 22, callOI35Missing: 0, putOI35Missing: 0, oi35Complete: true } } });
    const j = await withNow(() => get('WTFC'));
    assert.equal(j.pcr, 2); assert.equal(j.basis, 'oi_near_expiries_35d_eod'); assert.equal(j.eodDate, '2026-10-19'); assert.equal(j.oiDate, '2026-10-16');
    assert.equal(j.staleRow, true);
    await flush();
    reset();
    history.WTFC = [{ ticker: 'WTFC', timestamp: Date.UTC(2026, 7, 28, 13, 2), pcr: 1.2, totalCallOI: 50, totalPutOI: 60, totalContracts: 20 }];
    const n = await withNow(() => get('WTFC'));
    assert.equal(n.pcr, null); assert.equal(n.stale, true); assert.equal(n.lastGood, undefined);
});

t('배선: live/ticker 는 대체가 모두 없을 때 같은 직전 정상값(readLastGoodOi)을 flow.oiPcr 로 — 0.8초 상한 안 · oi-pcr 는 수집 행 읽기', () => {
    const lt = fs.readFileSync(path.join(__dirname, '../src/app/api/live/ticker/route.ts'), 'utf8');
    assert.match(lt, /import \{ readOi35Fallback, readLastGoodOi \} from '@\/services\/oiNear35Fallback';/);
    assert.match(lt, /const v = await readOi35Fallback\(ticker\);[\s\S]{0,400}const lg = await readLastGoodOi\(ticker\);[\s\S]{0,300}setTimeout\(\(\) => resolve\(null\), 800\)/);
    // 관문 10202338 ②: 직전 정상값이면 그 값의 시각을 optionsAsOf·oiPcrAsOf 로(기준 시각 유지)
    assert.match(lt, /lastGoodAsOf: lg\.asOf/);
    assert.match(lt, /if \('lastGoodAsOf' in fb && typeof fb\.lastGoodAsOf === 'number'\) \{\n\s+flow\.optionsAsOf = fb\.lastGoodAsOf;\n\s+flow\.oiPcrAsOf = fb\.lastGoodAsOf;/);
    const r = fs.readFileSync(path.join(__dirname, '../src/app/api/app/oi-pcr/route.ts'), 'utf8');
    assert.match(r, /latestCollectorGexRow\(db, t\)/);
    const s = fs.readFileSync(path.join(__dirname, '../src/services/optionMetricsService.ts'), 'utf8');
    assert.match(s, /latestCollectorGexRow\(db, ticker\)/);
    // provider도 동일한 선택 규칙을 적용한다. 정상 종목의 첫 조회는 여전히 1행이다.
    const d = fs.readFileSync(path.join(__dirname, '../src/lib/aws/dynamoDataProvider.ts'), 'utf8');
    assert.match(d, /export async function getLatestGex\(ticker: string\): Promise<DynamoGexData \| null> \{\n\s+try \{\n\s+const items = await queryItems<DynamoGexData>\(\n\s+TABLES\.GEX_HISTORY,\n\s+'ticker = :tk',\n\s+\{ ':tk': ticker \},\n\s+\{ limit: 1, scanForward: false \}/);
});

(async () => {
    let n = 0;
    for (const [name, fn] of queue) {
        try { await fn(); n++; console.log(`  ✓ ${name}`); }
        catch (e) { console.error(`  ✗ ${name}\n`, e); process.exitCode = 1; }
    }
    (global as any).fetch = realFetch;
    console.log(`${n}/${queue.length} 통과`);
    if (n !== queue.length) process.exitCode = 1;
})();
