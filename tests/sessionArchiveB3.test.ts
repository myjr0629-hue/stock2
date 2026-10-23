/**
 * 완료 세션 보관 2차(B3 나머지, 2026-10-19 fix/session-archive) — 무네트워크
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx","resolveJsonModule":true}' tests/sessionArchiveB3.test.ts
 *
 *   · D11 공매도 칸: 벤더 값 없으면 FINRA 적재본(같은 보고) — 숫자·날짜·출처 · 둘 다 없으면 결측
 *   · D26 전술 인사이트: 장외에 12시간 저장본이 사라져도 마지막 완료 세션 글(검사 통과분) · 장 전 글은 그날 키로 저장하지 않음
 *   · D06 옵션 EOD 유니버스: 앱 고정 종목 전부 + TSLA·WTFC · D16 가까운 만기 35일 합계 · oi-pcr 대체(같은 범위만)
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
let dynamoRow: any = null;
const dyPath = require.resolve('../src/lib/aws/dynamoDataProvider');
require.cache[dyPath] = { id: dyPath, filename: dyPath, loaded: true, exports: { getLatestGex: async () => dynamoRow } } as unknown as Module;

import { shortVolFields } from '../src/lib/shortVolume';
import { saveSessionArchive, _resetSessionArchiveMemo, readSessionArchive } from '../src/lib/sessionArchive';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const M = require('../scripts/intrinio-options-eod.js');
import { APP_WARM_FIXED } from '../src/lib/appWarmTickers';

const EDT = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 4, mi);
const queue: Array<[string, () => unknown]> = [];
const t = (name: string, fn: () => unknown) => queue.push([name, fn]);

// ━━━ D11 ━━━
t('D11 벤더 공매도 값이 있으면 그대로(출처 vendor)', () => {
    assert.deepEqual(shortVolFields({ percent: 42.3, volume: 1000 }, 2400, { shortPct: 39.8, volume: 5e6, date: '2026-10-16' }),
        { shortVolPct: 42.3, shortVol: 1000, shortTotalVol: 2400, shortVolSource: 'vendor', shortVolDate: null });
});
t('D11 벤더 없음 → FINRA 적재본: 비중 39.8% · 공매도 수량 = 보고 수량 × 비중 · 날짜 10/16', () => {
    assert.deepEqual(shortVolFields(null, null, { shortPct: 39.8, volume: 12_500_000, date: '2026-10-16' }),
        { shortVolPct: 39.8, shortVol: 4_975_000, shortTotalVol: 12_500_000, shortVolSource: 'FINRA', shortVolDate: '2026-10-16' });
});
t('D11 실제 0% 는 0 으로 · 둘 다 없으면 결측(null) · 100 넘는 비중은 거부', () => {
    assert.equal(shortVolFields(null, null, { shortPct: 0, volume: 100, date: '2026-10-16' }).shortVolPct, 0);
    assert.deepEqual(shortVolFields(null, null, null), { shortVolPct: null, shortVol: null, shortTotalVol: null, shortVolSource: null, shortVolDate: null });
    assert.equal(shortVolFields(null, null, { shortPct: 140, volume: 1 }).shortVolPct, null);
});
t('D11 배선: live/ticker 의 flow 칸이 shortVolFields(벤더, 벤더 전체, finraDp)', () => {
    const s = fs.readFileSync(path.join(__dirname, '../src/app/api/live/ticker/route.ts'), 'utf8');
    assert.match(s, /\.\.\.shortVolFields\(MASSIVE_TICKS_ON \? metricsData\?\.shortVolume : null, metricsData\?\.shortVolume\?\.totalVolume \?\? null, finraDp\)/);
    assert.equal(/^export function shortVolFields/m.test(s), false);   // 라우트 파일은 라우트 외 내보내기 금지
});

// ━━━ D26 ━━━
const TEXT = '대형 기술주 쪽으로 자금이 몰렸고 방어 업종은 상대적으로 약했습니다. 시장 폭은 좁은 편이었습니다. 지수와 종목 사이의 온도 차가 컸습니다.';
t('D26 장외(일요일) — 12시간 저장본 없음 + 금요일 보관본 → 안내 문구 대신 그 글', async () => {
    store.clear(); _resetSessionArchiveMemo();
    await saveSessionArchive('insight', 'reality_ko', '2026-10-16', { text: TEXT, basis: null }, { observedAt: EDT(2026, 10, 16, 17), nowMs: EDT(2026, 10, 16, 17) });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const N = require('../src/services/guardian/intelligenceNode');
    const realNow = Date.now;
    (Date as any).now = () => EDT(2026, 10, 18, 21);
    N._setMarketClockForTest(() => new Date(EDT(2026, 10, 18, 21)));
    try {
        const old = await N.IntelligenceNode.recoverInsight('reality', 'ko', { translate: false, nums: null });
        assert.equal(old, TEXT, '첫 v3 배포는 v2 세션 보관본을 복구용으로 읽어 안내 문구를 막는다');
        await saveSessionArchive('insight', 'reality_v3_ko', '2026-10-16', { text: TEXT, basis: null }, { observedAt: EDT(2026, 10, 16, 17), nowMs: EDT(2026, 10, 16, 17) });
        const out = await N.IntelligenceNode.recoverInsight('reality', 'ko', { translate: false, nums: null });
        assert.equal(out, TEXT);
        assert.equal(out.includes('장외 시간'), false);
        // 보관본이 없는 언어는 예전처럼 안내 문구(결측을 지어내지 않는다)
        const ja = await N.IntelligenceNode.recoverInsight('reality', 'ja', { translate: false, nums: null });
        assert.match(ja, /場外時間/);
        // 한국어 복구 뒤 영어 요청 — 복구 글이 번역 원천이 되지 않는다(모델 호출 0): AWS 키가 있어도 번역 경로가 원천을 못 찾는다
        process.env.AWS_ACCESS_KEY_ID = 'test-not-used';
        try {
            const en = await N.IntelligenceNode.recoverInsight('reality', 'en', { nums: null });
            assert.match(en, /Off-hours/);
        } finally { delete process.env.AWS_ACCESS_KEY_ID; }
        // 금요일 보관본이 없고 목요일 것만 있으면 결측(안내 문구) — 목요일 글을 «직전 세션»으로 내지 않는다
        store.clear(); _resetSessionArchiveMemo();
        await saveSessionArchive('insight', 'reality_v3_ko', '2026-10-15', { text: TEXT, basis: null }, { observedAt: EDT(2026, 10, 15, 17), nowMs: EDT(2026, 10, 15, 17) });
        const thu = await N.IntelligenceNode.recoverInsight('reality', 'ko', { translate: false, nums: null });
        assert.match(thu, /장외 시간/);
    } finally { (Date as any).now = realNow; N._setMarketClockForTest(null); }
});
t('D26 장 전(09:30 ET 전) 글은 그날 키로 저장하지 않는다 · 정규장 뒤 글은 저장', async () => {
    store.clear(); _resetSessionArchiveMemo();
    assert.equal(await saveSessionArchive('insight', 'gamma_en', '2026-10-19', { text: 'x' }, { nowMs: EDT(2026, 10, 19, 6), observedAt: EDT(2026, 10, 19, 6) }), 'skip-future');
    assert.equal(await saveSessionArchive('insight', 'gamma_en', '2026-10-19', { text: 'x' }, { nowMs: EDT(2026, 10, 19, 17), observedAt: EDT(2026, 10, 19, 17) }), 'write');
    assert.equal((await readSessionArchive<any>('insight', 'gamma_en', { nowMs: EDT(2026, 10, 19, 21) }))?.stamp.sourceSessionDate, '2026-10-19');
});
t('D26 배선: 저장본 쓰기마다 보관(Upstash 유무와 별개, 장외 쓰기 제외) · Tactical 복구는 생성 실패·장외에서 번역(모델 호출)보다 먼저 · 복구 글은 메모리에 안 올림 · 그 날짜만', () => {
    const s = fs.readFileSync(path.join(__dirname, '../src/services/guardian/intelligenceNode.ts'), 'utf8');
    const w = s.indexOf('async function writeStoredInsight');
    assert.ok(s.indexOf('await archiveInsight(type, locale, text, basis, session);', w) < s.indexOf('const redis = getRedis();', w));
    const r = s.indexOf('static async recoverInsightOut');
    const archiveCall = s.indexOf('archivedInsight(type, locale, opts.nums, opts.tacticalPrompts,', r);
    const translateCall = s.indexOf('translatedInsight(type, locale, opts.nums, opts.tacticalPrompts)', r);
    assert.ok(archiveCall > r && translateCall > archiveCall);
    assert.match(s, /if \(arch\) return \{ tpl: arch\.tpl, basis: arch\.basis, recovery: arch\.recovery \};/);   // 메모리에 올리지 않는다(번역 원천이 되지 않게)
    assert.match(s, /\{ lookback: 0 \}/);
    const ai = s.indexOf('async function archiveInsight');
    assert.ok(s.indexOf('if (isOffHours()) return;', ai) > ai && s.indexOf('if (isOffHours()) return;', ai) < s.indexOf('saveSessionArchive(', ai));
});

// ━━━ D06 · D16 ━━━
t('D06 고정 유니버스 ⊇ 앱 고정 종목 전부 + TSLA·WTFC·FITB', () => {
    const pin = new Set(M.PINNED_UNIVERSE);
    const miss = APP_WARM_FIXED.filter((x: string) => !pin.has(x));
    assert.deepEqual(miss, []);
    for (const x of ['TSLA', 'WTFC', 'FITB']) assert.ok(pin.has(x), x);
});
t('D16 가까운 만기 35일 합계: 파일 날짜 < 만기 ≤ +35일만 · 전 만기 합계는 그대로', () => {
    assert.equal(M.nearExpCutoff('2026-10-16'), '2026-11-20');
    const A = M.createAggregator({}, { trackOi: false, fileDate: '2026-10-16' });
    const row = (exp: string, isCall: boolean, oi: number) => ({ sym: 'WTFC', contract: `${exp}${isCall}`, oi, vol: 1, isCall, gamma: 0, strike: 100, iv: 0, delta: 0, exp });
    A.add(row('2026-10-16', true, 999));   // 그날 만기(이미 끝남) — 35일 합계 제외
    A.add(row('2026-10-23', true, 100));
    A.add(row('2026-11-20', false, 60));   // 경계 포함
    A.add(row('2026-12-18', false, 500));  // 35일 밖
    const v = M.finalizeTickers(A.agg).WTFC;
    assert.equal(v.callOI, 1099);
    assert.equal(v.putOI, 560);
    assert.equal(v.callOI35, 100);
    assert.equal(v.putOI35, 60);
    assert.equal(v.pcrOI35, 0.6);
    // 파일 날짜를 모르면 필드 자체가 없다(결측)
    const B = M.createAggregator({}, { trackOi: false });
    B.add(row('2026-10-23', true, 100));
    assert.equal(M.finalizeTickers(B.agg).WTFC.callOI35, undefined);
});
t('D16 oi-pcr: 수집 행이 멈췄으면(8/28) 옵션 EOD 의 35일 합계로 · 기준(basis)·EOD 날짜 표기 · 35일 합계가 없으면 예전처럼 결측', async () => {
    store.clear();
    dynamoRow = { timestamp: Date.UTC(2026, 7, 28), totalCallOI: 10, totalPutOI: 10, pcr: 1 };
    store.set('intrinio:options:eod', { date: '2026-10-16', tickers: { WTFC: { callOI: 9000, putOI: 9000, pcrOI: 1, callOI35: 1000, putOI35: 659 }, FITB: { callOI: 1, putOI: 1, pcrOI: 1 } } });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const route = require('../src/app/api/app/oi-pcr/route');
    const realNow = Date.now; (Date as any).now = () => EDT(2026, 10, 19, 10);
    const j = await (await route.GET(new Request('http://x/api/app/oi-pcr?t=WTFC'))).json();
    assert.equal(j.pcr, 0.66);
    assert.equal(j.callOI, 1000);
    assert.equal(j.putOI, 659);
    assert.equal(j.basis, 'oi_near_expiries_35d_eod');
    assert.equal(j.eodDate, '2026-10-16');
    assert.notEqual(j.asOf, Date.UTC(2026, 7, 28));   // 멈춘 수집 행 시각이 아니라 EOD 세션 마감 시각
    const f = await (await route.GET(new Request('http://x/api/app/oi-pcr?t=FITB'))).json();
    assert.equal(f.pcr, null);           // 전 만기 pcrOI 로 메우지 않는다
    assert.equal(f.callOI, null);
    assert.equal(f.stale, true);
    (Date as any).now = realNow;
});
t('D16 oi-pcr: 묶음 판이 두 세션 넘게 낡았으면(10/15 판을 10/21 에) 대체하지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const route = require('../src/app/api/app/oi-pcr/route');
    const realNow = Date.now; (Date as any).now = () => EDT(2026, 10, 21, 10) + 10 * 60 * 1000;   // 인스턴스 기억(5분)도 지나게
    try {
        store.set('intrinio:options:eod', { date: '2026-10-15', tickers: { WTFC: { callOI35: 1000, putOI35: 659 } } });
        const j = await (await route.GET(new Request('http://x/api/app/oi-pcr?t=WTFC'))).json();
        assert.equal(j.pcr, null);
        assert.equal(j.stale, true);
    } finally { (Date as any).now = realNow; }
});
t('스퀴즈 확률: FINRA 로 채운 공매도 비중은 입력으로 쓰지 않는다(비중이 확률 칸에 나가지 않게)', () => {
    const s = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/flow/page.tsx'), 'utf8');
    assert.match(s, /const shortForSqueeze = tickerData\?\.flow\?\.shortVolSource === 'FINRA' \? '—' : shortPct;/);
    assert.match(s, /const sp = parseFloat\(shortForSqueeze\);/);
});

(async () => {
    let n = 0;
    for (const [name, fn] of queue) { await fn(); n++; console.log(`  ✓ ${name}`); }
    console.log(`\n  ${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
