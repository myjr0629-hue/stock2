/**
 * 완료 세션 보관본 시험 (2026-10-19 묶음 3, fix/session-archive) — 무네트워크(레디스는 메모리로 바꿔 끼운다)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx","resolveJsonModule":true}' tests/sessionArchive.test.ts
 *
 *   · 금요일 16:00 저장 → 토·일·월 04:00 읽기(60시간)  · 월요일 휴일 → 화요일 PRE(84시간)
 *   · 조기 폐장 13:00  · 저장본 없음 → null(0 아님)  · 세션 전환 중 이전 세션 저장이 최신을 덮지 않음
 *   · 적용 4종 배선: breadth·VWAP·옵션 레벨·고래 마감 집계 (+ D07 flow 고래 지난 정상본)
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const realRedis = require('../src/services/redisClient');
const { decideReplicate, shouldFallbackToUpstash } = realRedis as {
    decideReplicate: (k: string, ttl: number | undefined, ecOk: boolean) => string;
    shouldFallbackToUpstash: (k: string, ecAuth: boolean) => boolean;
};

const store = new Map<string, unknown>();
const ttls = new Map<string, number | undefined>();
let sets = 0;
let gets = 0;
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
    id: rcPath, filename: rcPath, loaded: true,
    exports: {
        ...realRedis,
        getFromCache: async (k: string) => { gets++; return store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null; },
        mgetFromCache: async (ks: string[]) => { gets += ks.length; return ks.map((k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null)); },
        setInCache: async (k: string, v: unknown, ttl?: number) => { sets++; store.set(k, JSON.parse(JSON.stringify(v))); ttls.set(k, ttl); return true; },
    },
} as unknown as Module;

// 공급사 클라이언트(massive)도 바꿔 끼운다 — 시험은 네트워크를 타지 않는다. 호출되면 센다(보관본이 있으면 0이어야 한다).
let massiveCalls = 0;
const mcPath = require.resolve('../src/services/massiveClient');
require.cache[mcPath] = {
    id: mcPath, filename: mcPath, loaded: true,
    exports: { fetchMassive: async () => { massiveCalls++; return { tickers: [] }; }, CACHE_POLICY: {} },
} as unknown as Module;
// 시계 바꿔 끼우기(new Date()·Date.now() 둘 다) — 엔진 안의 세션 판정이 시험 시각을 보게
const RealDate = Date;
let fakeNow: number | null = null;
class FakeDate extends RealDate {
    constructor(...a: any[]) { if (a.length === 0 && fakeNow != null) super(fakeNow); else super(...(a as [any])); }
    static now() { return fakeNow ?? RealDate.now(); }
}
const useClock = (ms: number | null) => { fakeNow = ms; (globalThis as any).Date = ms == null ? RealDate : FakeDate; };

import {
    SESSION_ARCHIVE_TTL_SEC, _resetSessionArchiveMemo, archiveReadDates, decideArchiveWrite, isAfterSessionClose, isInRegularSession,
    lastCompletedSessionDate, readSessionArchive, readSessionArchiveMany, saveSessionArchive, sessionArchiveKey,
} from '../src/lib/sessionArchive';

let n = 0;
const queue: Array<[string, () => unknown]> = [];
const t = (name: string, fn: () => unknown) => queue.push([name, fn]);
// ET 벽시계 → ms. 10월은 EDT(UTC-4), 11·12월은 EST(UTC-5).
const EDT = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 4, mi);
const EST = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 5, mi);
const reset = () => { store.clear(); ttls.clear(); sets = 0; gets = 0; _resetSessionArchiveMemo(); };

// ━━━ 1. 달력 ━━━
t('금 10/16 15:59 → 마지막 완료 세션 목 10/15', () => assert.equal(lastCompletedSessionDate(EDT(2026, 10, 16, 15, 59)), '2026-10-15'));
t('금 10/16 16:00 → 금 10/16', () => assert.equal(lastCompletedSessionDate(EDT(2026, 10, 16, 16, 0)), '2026-10-16'));
t('토·일·월 04:00 → 금 10/16', () => {
    assert.equal(lastCompletedSessionDate(EDT(2026, 10, 17, 12)), '2026-10-16');
    assert.equal(lastCompletedSessionDate(EDT(2026, 10, 18, 23)), '2026-10-16');
    assert.equal(lastCompletedSessionDate(EDT(2026, 10, 19, 4)), '2026-10-16');
});
t('노동절(월 9/7) 다음 화 9/8 PRE 06:00 → 금 9/4', () => assert.equal(lastCompletedSessionDate(EDT(2026, 9, 8, 6)), '2026-09-04'));
t('조기 폐장 11/27 13:00 → 11/27 · 12:59 → 11/25(목 추수감사절 휴장)', () => {
    assert.equal(lastCompletedSessionDate(EST(2026, 11, 27, 13, 0)), '2026-11-27');
    assert.equal(lastCompletedSessionDate(EST(2026, 11, 27, 12, 59)), '2026-11-25');
});
t('정규장 판정: 휴장 평일 10:00 = 아님 · 조기 폐장 13:30 = 아님 · 평일 10:00 = 맞음', () => {
    assert.equal(isInRegularSession(EDT(2026, 9, 7, 10)), false);
    assert.equal(isInRegularSession(EST(2026, 11, 27, 13, 30)), false);
    assert.equal(isInRegularSession(EDT(2026, 10, 19, 10)), true);
});
t('확정 판정: 조기 폐장일 13:00 뒤 관측 = 확정 · 다음 날 = 확정', () => {
    assert.equal(isAfterSessionClose('2026-11-27', EST(2026, 11, 27, 13, 1)), true);
    assert.equal(isAfterSessionClose('2026-11-27', EST(2026, 11, 27, 12, 30)), false);
    assert.equal(isAfterSessionClose('2026-10-16', EDT(2026, 10, 17, 1)), true);
});
t('읽기 날짜: 화 9/8 PRE lookback 1 → [9/4, 9/3]', () => assert.deepEqual(archiveReadDates(EDT(2026, 9, 8, 6), undefined, 1), ['2026-09-04', '2026-09-03']));
t('읽기 날짜: 끝나지 않은 세션을 fromDate 로 줘도 마지막 완료 세션으로', () => assert.deepEqual(archiveReadDates(EDT(2026, 10, 19, 10), '2026-10-19'), ['2026-10-16']));

// ━━━ 2. 쓰기 판정(순수) ━━━
t('휴장일·주말 날짜는 쓰지 않는다', () => {
    assert.equal(decideArchiveWrite(null, { sessionDate: '2026-09-07', observedAt: 1, final: true }, EDT(2026, 9, 7, 12)), 'skip-invalid-date');
    assert.equal(decideArchiveWrite(null, { sessionDate: '2026-10-17', observedAt: 1, final: true }, EDT(2026, 10, 17, 12)), 'skip-invalid-date');
});
t('미래·개장 전 오늘 날짜는 쓰지 않는다', () => {
    assert.equal(decideArchiveWrite(null, { sessionDate: '2026-10-20', observedAt: 1, final: false }, EDT(2026, 10, 19, 12)), 'skip-future');
    assert.equal(decideArchiveWrite(null, { sessionDate: '2026-10-19', observedAt: 1, final: false }, EDT(2026, 10, 19, 8)), 'skip-future');
});
t('확정본 위 잠정본 금지 · 더 이른 관측 금지 · 같은 관측 생략 · 더 늦은 관측 허용', () => {
    const now = EDT(2026, 10, 16, 17);
    assert.equal(decideArchiveWrite({ observedAt: 100, final: true }, { sessionDate: '2026-10-16', observedAt: 200, final: false }, now), 'skip-final-exists');
    assert.equal(decideArchiveWrite({ observedAt: 200, final: false }, { sessionDate: '2026-10-16', observedAt: 100, final: false }, now), 'skip-older');
    assert.equal(decideArchiveWrite({ observedAt: 200, final: true }, { sessionDate: '2026-10-16', observedAt: 200, final: true }, now), 'skip-same');
    assert.equal(decideArchiveWrite({ observedAt: 200, final: false }, { sessionDate: '2026-10-16', observedAt: 300, final: true }, now), 'write');
});

// ━━━ 3. 저장·읽기 흐름 ━━━
const BREADTH = { advancers: 1200, decliners: 3400, totalTickers: 4700, breadthPct: 25.5 };
t('금요일 16:00 저장(확정) → 토·일·월 04:00 읽기: 값과 원천 날짜 10/16', async () => {
    reset();
    const fri16 = EDT(2026, 10, 16, 16, 0);
    assert.equal(await saveSessionArchive('breadth', 'ALL', '2026-10-16', BREADTH, { observedAt: fri16, nowMs: fri16 }), 'write');
    const k = sessionArchiveKey('breadth', 'ALL', '2026-10-16');
    assert.equal(k, 'session:breadth:ALL:2026-10-16');
    assert.equal((store.get(k) as any).final, true);
    for (const at of [EDT(2026, 10, 17, 10), EDT(2026, 10, 18, 20), EDT(2026, 10, 19, 4)]) {
        const r = await readSessionArchive<typeof BREADTH>('breadth', 'ALL', { nowMs: at });
        assert.ok(r, `읽기 ${new Date(at).toISOString()}`);
        assert.deepEqual(r!.value, BREADTH);
        assert.equal(r!.stamp.sourceSessionDate, '2026-10-16');
        assert.equal(r!.stamp.basis, 'last-session');
        assert.equal(r!.stamp.observedAt, fri16);
        assert.equal(r!.stamp.receivedAt, at);
    }
});
t('TTL 은 7일 이상(지터 ±10% 뒤에도) — 60h·84h 를 넉넉히 덮는다', () => {
    assert.ok(SESSION_ARCHIVE_TTL_SEC * 0.9 >= 7 * 86400);
    assert.equal(ttls.get('session:breadth:ALL:2026-10-16'), SESSION_ARCHIVE_TTL_SEC);
});
t('월요일 휴일 → 화요일 PRE: 금요일 보관본(9/4 → 9/8 06:00, 84시간)', async () => {
    reset();
    await saveSessionArchive('vwap', 'NVDA', '2026-09-04', { vwap: 171.23, date: '2026-09-04', bars: 390 }, { observedAt: EDT(2026, 9, 4, 16, 5), nowMs: EDT(2026, 9, 4, 16, 5) });
    const r = await readSessionArchive<any>('vwap', 'NVDA', { nowMs: EDT(2026, 9, 8, 6) });
    assert.equal(r?.value.vwap, 171.23);
    assert.equal(r?.stamp.sourceSessionDate, '2026-09-04');
});
t('조기 폐장 11/27 13:00 뒤 저장 = 확정 · 같은 날 13:30 읽기 = 11/27', async () => {
    reset();
    const at = EST(2026, 11, 27, 13, 5);
    await saveSessionArchive('breadth', 'ALL', '2026-11-27', BREADTH, { observedAt: at, nowMs: at });
    assert.equal((store.get('session:breadth:ALL:2026-11-27') as any).final, true);
    const r = await readSessionArchive<any>('breadth', 'ALL', { nowMs: EST(2026, 11, 27, 13, 30) });
    assert.equal(r?.stamp.sourceSessionDate, '2026-11-27');
});
t('저장본 없음 → null(0·중립값을 만들지 않는다)', async () => {
    reset();
    assert.equal(await readSessionArchive('breadth', 'ALL', { nowMs: EDT(2026, 10, 19, 4) }), null);
    assert.equal((await readSessionArchiveMany('levels', ['NVDA', 'SPY'], { nowMs: EDT(2026, 10, 19, 4), lookback: 1 })).size, 0);
});
t('lookback 0 이면 한 세션 전 보관본을 «직전 세션»처럼 내보내지 않는다 · lookback 1 이면 날짜를 정직하게', async () => {
    reset();
    await saveSessionArchive('whale', 'SPY', '2026-10-15', { basis: 'eod-volume', sessionDate: '2026-10-15', items: [1] }, { observedAt: EDT(2026, 10, 15, 18), nowMs: EDT(2026, 10, 15, 18) });
    assert.equal(await readSessionArchive('whale', 'SPY', { nowMs: EDT(2026, 10, 19, 4) }), null);
    const r = await readSessionArchive<any>('whale', 'SPY', { nowMs: EDT(2026, 10, 19, 4), lookback: 1 });
    assert.equal(r?.stamp.sourceSessionDate, '2026-10-15');
});
t('세션 전환: 월 16:01 에 도착한 «금요일» 늦은 저장이 월요일 키를 덮지 않는다 + 금요일 확정본 위 잠정본도 거부', async () => {
    reset();
    const mon = EDT(2026, 10, 19, 15, 59);
    await saveSessionArchive('breadth', 'ALL', '2026-10-19', { ...BREADTH, advancers: 9 }, { observedAt: mon, nowMs: mon });
    await saveSessionArchive('breadth', 'ALL', '2026-10-16', BREADTH, { observedAt: EDT(2026, 10, 16, 16, 2), nowMs: EDT(2026, 10, 16, 16, 2) });
    _resetSessionArchiveMemo();   // 다른 인스턴스
    const late = await saveSessionArchive('breadth', 'ALL', '2026-10-16', { ...BREADTH, advancers: 1 }, { observedAt: EDT(2026, 10, 16, 15, 50), nowMs: EDT(2026, 10, 19, 16, 1) });
    assert.equal(late, 'skip-final-exists');   // 금요일 확정본(16:02) 위의 장중 관측(15:50) — 날짜 키가 달라 월요일 키는 처음부터 안전
    assert.equal((store.get('session:breadth:ALL:2026-10-19:p') as any).value.advancers, 9);   // 장중 관측 = 잠정본 키
    assert.equal((store.get('session:breadth:ALL:2026-10-16') as any).value.advancers, 1200);
    const r = await readSessionArchive<any>('breadth', 'ALL', { nowMs: EDT(2026, 10, 19, 16, 5) });
    assert.equal(r?.stamp.sourceSessionDate, '2026-10-19');
    assert.equal(r?.value.advancers, 9);
});
t('같은 날 안: 장중 늦게 끝난 옛 관측(15:40)이 15:55 관측을 덮지 않는다', async () => {
    reset();
    await saveSessionArchive('breadth', 'ALL', '2026-10-19', { a: 1555 }, { observedAt: EDT(2026, 10, 19, 15, 55), nowMs: EDT(2026, 10, 19, 15, 55) });
    _resetSessionArchiveMemo();
    assert.equal(await saveSessionArchive('breadth', 'ALL', '2026-10-19', { a: 1540 }, { observedAt: EDT(2026, 10, 19, 15, 40), nowMs: EDT(2026, 10, 19, 15, 56) }), 'skip-older');
    assert.equal((store.get('session:breadth:ALL:2026-10-19:p') as any).value.a, 1555);
});
t('쓰기 간격 상한: 같은 키 잠정본은 5분에 한 번 · 확정본 전환은 바로', async () => {
    reset();
    const base = EDT(2026, 10, 19, 14);
    assert.equal(await saveSessionArchive('vwap', 'SPY', '2026-10-19', { v: 1 }, { observedAt: base, nowMs: base }), 'write');
    assert.equal(await saveSessionArchive('vwap', 'SPY', '2026-10-19', { v: 2 }, { observedAt: base + 60_000, nowMs: base + 60_000 }), 'skip-throttled');
    const after = EDT(2026, 10, 19, 16, 1);
    assert.equal(await saveSessionArchive('vwap', 'SPY', '2026-10-19', { v: 3 }, { observedAt: after, nowMs: after }), 'write');
    assert.equal((store.get('session:vwap:SPY:2026-10-19') as any).final, true);
    assert.equal(await saveSessionArchive('vwap', 'SPY', '2026-10-19', { v: 4 }, { observedAt: base + 120_000, nowMs: after + 1000 }), 'skip-final-exists');
});
t('인스턴스가 달라도(기억 없음) 잠정본은 저장된 savedAt 기준 5분 간격', async () => {
    reset();
    const base = EDT(2026, 10, 19, 11);
    assert.equal(await saveSessionArchive('levels', 'NVDA', '2026-10-19', { v: 1 }, { observedAt: base, nowMs: base }), 'write');
    _resetSessionArchiveMemo();
    assert.equal(await saveSessionArchive('levels', 'NVDA', '2026-10-19', { v: 2 }, { observedAt: base + 60_000, nowMs: base + 60_000 }), 'skip-throttled');
    _resetSessionArchiveMemo();
    assert.equal(await saveSessionArchive('levels', 'NVDA', '2026-10-19', { v: 3 }, { observedAt: base + 301_000, nowMs: base + 301_000 }), 'write');
    assert.equal(sets, 2);
});
t('역전 경쟁: 두 인스턴스가 «빈 상태»를 같이 읽고 확정본 → 느린 잠정본 순서로 써도 읽기는 확정본(키가 다르다)', async () => {
    reset();
    const fin = EDT(2026, 10, 16, 16, 5), prov = EDT(2026, 10, 16, 15, 50);
    // 잠정본 쪽 인스턴스는 확정본을 보기 전에 판정을 마쳤다고 가정 — 확정본을 먼저 쓰고, 잠정본 키에 직접 늦은 쓰기를 흉내
    await saveSessionArchive('vwap', 'SPY', '2026-10-16', { v: 'final' }, { observedAt: fin, nowMs: fin });
    store.set('session:vwap:SPY:2026-10-16:p', { v: 1, kind: 'vwap', scope: 'SPY', sessionDate: '2026-10-16', observedAt: prov, savedAt: fin + 1, final: false, value: { v: 'late-provisional' } });
    const r = await readSessionArchive<any>('vwap', 'SPY', { nowMs: EDT(2026, 10, 17, 9) });
    assert.equal(r?.value.v, 'final');
    assert.equal(r?.final, true);
    // 그리고 정상 경로의 늦은 잠정본 저장은 확정본을 보고 거부된다
    _resetSessionArchiveMemo();
    assert.equal(await saveSessionArchive('vwap', 'SPY', '2026-10-16', { v: 'x' }, { observedAt: prov, nowMs: fin + 2000 }), 'skip-final-exists');
});
t('null·undefined 는 저장하지 않는다', async () => {
    reset();
    assert.equal(await saveSessionArchive('vwap', 'SPY', '2026-10-16', null, { nowMs: EDT(2026, 10, 17, 1) }), 'skip-empty');
    assert.equal(sets, 0);
});
t('여러 종목 읽기: 종목마다 가장 최근 날짜 하나(체인 하루 늦은 종목은 한 세션 전)', async () => {
    reset();
    const now = EDT(2026, 10, 19, 4);
    await saveSessionArchive('levels', 'NVDA', '2026-10-16', { m: 'nvda16' }, { observedAt: EDT(2026, 10, 16, 18), nowMs: EDT(2026, 10, 16, 18) });
    await saveSessionArchive('levels', 'WTFC', '2026-10-15', { m: 'wtfc15' }, { observedAt: EDT(2026, 10, 15, 18), nowMs: EDT(2026, 10, 15, 18) });
    await saveSessionArchive('levels', 'WTFC', '2026-10-14', { m: 'wtfc14' }, { observedAt: EDT(2026, 10, 14, 18), nowMs: EDT(2026, 10, 14, 18) });
    const m = await readSessionArchiveMany<any>('levels', ['nvda', 'WTFC', 'SPY'], { nowMs: now, lookback: 1 });
    assert.equal(m.get('NVDA')?.value.m, 'nvda16');
    assert.equal(m.get('WTFC')?.value.m, 'wtfc15');
    assert.equal(m.get('WTFC')?.stamp.sourceSessionDate, '2026-10-15');
    assert.equal(m.has('SPY'), false);
});
t('session: 접두사는 EC2 전용 — Upstash 복제·폴백 0(비용 증가 0)', () => {
    assert.equal(decideReplicate('session:breadth:ALL:2026-10-16', SESSION_ARCHIVE_TTL_SEC, true), 'skip');
    assert.equal(decideReplicate('session:breadth:ALL:2026-10-16', SESSION_ARCHIVE_TTL_SEC, false), 'skip');   // EC2 전용 — 실패해도 Upstash 에 쓰지 않는다
    assert.equal(shouldFallbackToUpstash('session:vwap:NVDA:2026-10-16', true), false);
});

// ━━━ 4. 레벨 보관 모양 ━━━
t('레벨 보관본 모양: 레벨 고르기에 필요한 것만 · NO_MARKET·체인 날짜 없음은 저장하지 않는다', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { slimForLevelsArchive, levelsFromStructure } = require('../src/services/structureService');
    const full = {
        ticker: 'NVDA', options_status: 'OK', maxPain: 180, levels: { callWall: 190, putFloor: 170, pinZone: 180 },
        gammaFlipLevel: null, gammaFlipType: 'ALL_LONG', netGex: 5, expiration: '2026-10-23', chainDate: '2026-10-16', underlyingPrice: 183,
        structure: { strikes: [170, 180, 190], callsOI: [1, 2, 9], putsOI: [9, 2, 1], gexCum: [1, 2, 3], extra: [1, 2, 3] },
        debug: { chainSource: 'lambda-probe', probeTs: 123, gammaFlipCrossings: [], vendorChain: { big: true } }, atmIv: 40,
    };
    const slim = slimForLevelsArchive(full);
    assert.equal(slim.chainDate, '2026-10-16');
    assert.equal(slim.structure.extra, undefined);
    assert.equal(slim.debug.vendorChain, undefined);
    const a = levelsFromStructure(full), b = levelsFromStructure(slim);
    for (const k of ['maxPain', 'callWall', 'putFloor', 'pinZone', 'gammaFlipLevel', 'levelsExpiration', 'levelsChainDate', 'levelsSpot']) assert.deepEqual(b[k], a[k], k);
    assert.deepEqual(b.levelProfile, a.levelProfile);
    assert.equal(slimForLevelsArchive({ ...full, options_status: 'NO_MARKET' }), null);
    assert.equal(slimForLevelsArchive({ ...full, chainDate: null }), null);
    assert.equal(slimForLevelsArchive({ ...full, chainDate: '2026-10-17' }), null);   // 토요일 = 거래일 아님
});

// ━━━ 5. 동작 — breadth·레벨 ━━━
t('breadth 동작: 일요일 밤(장외) — 36h 키가 사라져도 금요일 보관본 + 원천 날짜 · 공급사 호출 0', async () => {
    reset(); massiveCalls = 0;
    await saveSessionArchive('breadth', 'ALL', '2026-10-16', { ...BREADTH, unchanged: 100, adRatio: 0.35, volumeBreadth: 30, breadthScore: 20, isDivergent: false, signal: 'CRITICAL', timestamp: 'x', hasData: true },
        { observedAt: EDT(2026, 10, 16, 15, 58), nowMs: EDT(2026, 10, 16, 15, 58) });
    useClock(EDT(2026, 10, 19, 4));
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getMarketBreadth } = require('../src/services/guardian/breadthEngine');
        const b = await getMarketBreadth(0.5);
        assert.equal(b.hasData, true);
        assert.equal(b.advancers, 1200);
        assert.equal(b.sourceSessionDate, '2026-10-16');
        assert.equal(b.isDivergent, true);   // NQ +0.5 · 폭 25.5% — 발산은 지금 지수로 다시 판정
        assert.equal(massiveCalls, 0);
    } finally { useClock(null); }
});
t('breadth 동작: 보관본도 옛 키도 없으면 결측(hasData false) — 0·50 을 «실측»으로 내지 않는다', async () => {
    reset(); massiveCalls = 0;
    useClock(EDT(2026, 10, 18, 12));
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getMarketBreadth } = require('../src/services/guardian/breadthEngine');
        const b = await getMarketBreadth(0);
        assert.equal(b.hasData, false);
    } finally { useClock(null); }
});
t('레벨 동작: 판본(72h)이 사라진 화요일 PRE — 금요일 체인 보관본으로 맥스페인·콜월·풋플로어 · 계산 후보(noSnapshot)는 그대로', async () => {
    reset();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { slimForLevelsArchive, peekStructureLevelsDetailed } = require('../src/services/structureService');
    const full = {
        ticker: 'NVDA', options_status: 'OK', maxPain: 180, levels: { callWall: 190, putFloor: 170, pinZone: 180 },
        gammaFlipLevel: null, gammaFlipType: 'ALL_LONG', netGex: 5, expiration: '2026-09-11', chainDate: '2026-09-04', underlyingPrice: 183,
        structure: { strikes: [170, 175, 180, 185, 190], callsOI: [1, 1, 2, 3, 9], putsOI: [9, 3, 2, 1, 1], gexCum: [1, 2, 3, 4, 5] },
        debug: { chainSource: 'vendor-direct' },
    };
    const ts = EDT(2026, 9, 4, 18);
    await saveSessionArchive('levels', 'NVDA', '2026-09-04', { data: slimForLevelsArchive(full), timestamp: ts }, { observedAt: ts, nowMs: ts });
    useClock(EDT(2026, 9, 8, 6));
    try {
        const r = await peekStructureLevelsDetailed(['NVDA', 'AMD']);
        const lv = r.levels.get('NVDA');
        assert.ok(lv, '보관본 레벨');
        assert.equal(lv.maxPain, 180);
        assert.equal(lv.callWall, 190);
        assert.equal(lv.putFloor, 170);
        assert.equal(lv.levelsChainDate, '2026-09-04');
        assert.equal(lv.levelsAsOf, ts);
        assert.equal(r.levels.has('AMD'), false);           // 보관본 없음 → 결측
        assert.deepEqual(r.noSnapshot.sort(), ['AMD', 'NVDA']);   // 응답 뒤 계산 예약은 예전과 같다
    } finally { useClock(null); }
});
t('레벨 동작: 만기가 지난 보관본은 쓰지 않는다(9/4 만기 체인 → 9/8 화 PRE)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { slimForLevelsArchive, peekStructureLevelsDetailed } = require('../src/services/structureService');
    const ts = EDT(2026, 9, 4, 18);
    const full = { ticker: 'TSLA', options_status: 'OK', maxPain: 300, levels: { callWall: 320, putFloor: 290, pinZone: 300 }, gammaFlipLevel: null,
        expiration: '2026-09-04', chainDate: '2026-09-04', underlyingPrice: 305, structure: { strikes: [290, 300, 320], callsOI: [1, 2, 9], putsOI: [9, 2, 1], gexCum: null }, debug: {} };
    await saveSessionArchive('levels', 'TSLA', '2026-09-04', { data: slimForLevelsArchive(full), timestamp: ts }, { observedAt: ts, nowMs: ts });
    assert.ok(store.has('session:levels:TSLA:2026-09-04'));
    useClock(EDT(2026, 9, 8, 6));
    try {
        const r = await peekStructureLevelsDetailed(['TSLA']);
        assert.equal(r.levels.has('TSLA'), false);
        assert.deepEqual(r.noSnapshot, ['TSLA']);
    } finally { useClock(null); }
});

// ━━━ 6. 채우기(backfill) — 배포 직후 1회, 공급사 호출 0 ━━━
t('채우기: 판본·분봉·고래 캐시 → 보관본(날짜 = 원천 날짜) · dry 는 쓰지 않음 · 휴장·미래 날짜 거부 · 공급사 호출 0', async () => {
    reset(); massiveCalls = 0;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { backfillSessionArchives } = require('../src/lib/sessionArchiveBackfill');
    const now = EDT(2026, 10, 19, 4);
    const v2 = { data: { ticker: 'NVDA', options_status: 'OK', maxPain: 180, levels: { callWall: 190, putFloor: 170, pinZone: 180 }, expiration: '2026-10-23', chainDate: '2026-10-16',
        underlyingPrice: 183, structure: { strikes: [170, 180, 190], callsOI: [1, 2, 9], putsOI: [9, 2, 1], gexCum: [1, 2, 3] }, debug: {} }, timestamp: EDT(2026, 10, 17, 7) };
    const bar = (h: number, m: number, px: number) => ({ session: 'REG', etDate: '2026-10-16', high: px + 1, low: px - 1, close: px, volume: 100 });
    store.set('structure:v2:NVDA', v2);
    store.set('chart:v5:NVDA:1d', { data: [bar(9, 30, 100), bar(15, 59, 110)], _builtAt: EDT(2026, 10, 16, 17) });
    store.set('whale:SPY', { sessionAggregate: { basis: 'eod-volume', sessionDate: '2026-10-16', count: 1, items: [{ premium: 60000, sessionDate: '2026-10-16', type: 'CALL' }] } });
    store.set('structure:v2:BAD', { data: { ...v2.data, ticker: 'BAD', chainDate: '2026-10-17' }, timestamp: 1 });   // 토요일 체인 날짜 → 거부
    const dry = await backfillSessionArchives(['NVDA', 'SPY', 'BAD'], { nowMs: now, dry: true });
    assert.equal(dry.dry, true);
    assert.equal([...store.keys()].some((k) => k.startsWith('session:')), false);
    const rep = await backfillSessionArchives(['nvda', 'SPY', 'BAD'], { nowMs: now });
    assert.equal(rep.levels.write, 1);
    assert.equal(rep.vwap.write, 1);
    assert.equal(rep.whale.write, 1);
    assert.equal(rep.levels['no-usable-version'], 1);   // BAD: 거래일 아닌 체인 날짜는 보관 모양부터 거부
    assert.equal((await readSessionArchive<any>('vwap', 'NVDA', { nowMs: now }))?.value.vwap, 105);
    assert.equal((await readSessionArchive<any>('whale', 'SPY', { nowMs: now }))?.stamp.sourceSessionDate, '2026-10-16');
    assert.ok(store.has('session:levels:NVDA:2026-10-16'));
    assert.equal(massiveCalls, 0);
    // 두 번 돌려도 같은 관측은 다시 쓰지 않는다
    _resetSessionArchiveMemo();
    const again = await backfillSessionArchives(['NVDA'], { nowMs: now });
    assert.equal(again.levels.write ?? 0, 0);
});
t('breadth 채우기: 보관본 없음 + 옛 lastreg 가 마지막 완료 세션(금) 판독값 → 보관본(호출 0) · 있으면 그대로 · 옛 날짜 lastreg 는 옮기지 않음', async () => {
    reset(); massiveCalls = 0;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { backfillBreadthArchive } = require('../src/services/guardian/breadthEngine');
    const now = EDT(2026, 10, 18, 12);
    store.set('guardian:breadth:lastreg', { ...BREADTH, timestamp: new RealDate(EDT(2026, 10, 15, 15, 55)).toISOString() });
    assert.equal((await backfillBreadthArchive({ nowMs: now })).result, 'none');   // 목요일 값을 금요일로 옮기지 않는다
    store.set('guardian:breadth:lastreg', { ...BREADTH, timestamp: new RealDate(EDT(2026, 10, 16, 15, 55)).toISOString() });
    const r = await backfillBreadthArchive({ nowMs: now });
    assert.deepEqual(r, { result: 'from-lastreg', sessionDate: '2026-10-16' });
    assert.equal((await backfillBreadthArchive({ nowMs: now })).result, 'exists');
    assert.equal(massiveCalls, 0);
});

// ━━━ 7. 배선(소스) — 4종 + D07 ━━━
const src = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
t('breadth: 장외엔 보관본 먼저 → 옛 36h 키 · 저장은 달력상 정규장 안에서만 · 휴장 판정은 달력', () => {
    const s = src('src/services/guardian/breadthEngine.ts');
    assert.match(s, /readSessionArchive<BreadthSnapshot>\('breadth', 'ALL'/);
    assert.match(s, /session !== 'REG' \|\| !isInRegularSession\(now\)/);
    assert.match(s, /marketSession\(\) === 'REG' && isInRegularSession\(savedAt\)/);
    assert.match(s, /saveSessionArchive\('breadth', 'ALL'/);
    assert.match(s, /const want = lastCompletedSessionDate\(\)/);
    assert.ok(s.indexOf("readSessionArchive<BreadthSnapshot>") < s.indexOf('getFromCache<BreadthSnapshot>(LAST_REG_KEY)'));
});
t('VWAP: 계산한 세션 VWAP 저장 · 장외 분봉 없으면 보관본(더 최근일 때만) · 장중엔 오늘 값만(기존 규칙 유지)', () => {
    const s = src('src/app/api/live/ticker/route.ts');
    assert.match(s, /saveSessionArchive\('vwap', ticker, r\.date, r, \{ observedAt: builtAt \}\)/);
    assert.match(s, /readSessionArchive<SessVwap>\('vwap', ticker\)/);
    assert.match(s, /if \(vwapLiveSession && r\.date !== todayStr\) return null;/);
    assert.match(s, /if \(vwapLiveSession\) return r;/);
});
t('레벨: 판본 저장 때 보관 · 판본이 아예 없을 때만 보관본 · 만기 지난 보관본 금지 · 계산 예약은 그대로', () => {
    const s = src('src/services/structureService.ts');
    assert.match(s, /if \(ok\) await archiveLevels\(ticker, data, timestamp\);/);
    assert.match(s, /readSessionArchiveMany<ArchivedLevels>\('levels', bare, \{ nowMs: now, lookback: 1 \}\)/);
    assert.match(s, /isCachedExpiryStale\(v\.data, todayET\)\) continue;/);
    assert.match(s, /noSnapshot 에는 그대로 남긴다/);
});
t('고래: 집계 저장(EOD 날짜 키) · 빈 체인·오류·집계 없음 → 보관본 · 실측 0건은 옛 세션으로 덮지 않음', () => {
    const s = src('src/app/api/live/options/trades/route.ts');
    assert.match(s, /saveSessionArchive\('whale', ticker, eodDate as string, agg\)/);
    assert.equal((s.match(/archivedWhaleAggregate\(ticker\)/g) || []).length, 3);
    assert.match(s, /if \(arch && \(!eodDate \|\| arch\.sessionDate > eodDate\)\) sessionAggregate = arch;/);
    assert.match(s, /Number\(cached\.debug\?\.tradesObserved\) > 0/);   // 빈 체인 때 «실측 0» 캐시는 옛 집계보다 먼저
    const b = src('src/app/api/cron/session-archive-backfill/route.ts');
    assert.match(b, /\(!cronSecret \|\| authHeader !== `Bearer \$\{cronSecret\}`\)/);   // 운영은 비밀값 필수
});
t('D07 flow 고래: 8초 · 시간 초과·오류(응답 못 받음)는 같은 종목·세션의 지난 정상본을 덮지 않는다 — 원천이 «없음»이라 답하면 예전처럼 비운다(flowIntegrity2 고정)', () => {
    const s = src('src/app/[locale]/app-view/flow/page.tsx');
    assert.match(s, /options\/trades\?t=\$\{ticker\.toUpperCase\(\)\}`, 8000\)/);
    assert.match(s, /prev\.ticker === whaleNext\.ticker && prev\.session === whaleNext\.session && prev\.meta != null/);
    assert.match(s, /&& !whaleAnswered;/);
    assert.match(s, /prev\.etDay === whaleNext\.etDay/);   // 같은 ET 날짜까지만(금요일 REG 화면 → 월요일 REG 복귀)
});

(async () => {
    for (const [name, fn] of queue) { await fn(); n++; console.log(`  ✓ ${name}`); }
    console.log(`\n  ${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
