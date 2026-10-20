/**
 * NB1(2026-10-20) — «OI · 35일 전 만기» 체인 합산 대체 + Flow OPI 결측(null) 처리. 무네트워크.
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx","resolveJsonModule":true}' tests/oiNear35.test.ts
 *
 *   · 관문 10200109 ②(35일 안 7만기 중 6만기만 → P/C 1.5→0) ③(10/16 콜 + 8/28 풋 → P/C 2.09) · 10200204 ②(OI −200 합산 → P/C −1)
 *     · 10200222 ①(풋 OI "" → 0 → P/C 0 → OPI 95) ②(OPI 복구 뒤 AI 재시도) — 이 범위의 재현 입력 전부
 *   · SPY 실측(레코드 10/16, 35일 창 13만기): 앱 체인 8만기만으로는 값을 내지 않고, 13만기 전부면 콜 1,566,004 · 풋 4,812,696 · P/C 3.07 · OI 기준일 10/15
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
const realFetch = global.fetch;
(global as any).fetch = async () => { throw new Error('Unexpected network access'); };

import { strictOi, sumChainOi35, validStoredOi35, oi35WindowEnd, type ChainOiRow } from '../src/lib/app/oiNear35';
import { measuredOiPcr, opiFromOiPcr, opiScoreOf, opiSigned, opiExtreme, opiGaugeStatus, pickOiPcr, pickOiPcrReading, OI_PCR_KEEP_ROUNDS, newerReading } from '../src/lib/app/flowOpi';
import { oiPcrAllExpiries, oiRowHasQuantities } from '../src/lib/app/intelOptionsBasis';
import { buildChainOi35, readOi35Fallback, readChainOi35, readPrevChainOi35, CHAIN_OI35_KEY, CHAIN_OI35_PREV_KEY, CHAIN_OI35_NEG_KEY, chainRowOf, _resetOi35Memo, type ChainBuildDeps } from '../src/services/oiNear35Fallback';

const EDT = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 4, mi);
const NOW = EDT(2026, 10, 19, 10, 10);   // 10/19(월) 장중 — 공급사 최신 EOD 레코드 10/16(금)
const queue: Array<[string, () => unknown]> = [];
const t = (name: string, fn: () => unknown) => queue.push([name, fn]);

const row = (type: string, expiration: string, oi: unknown, date: unknown = '2026-10-16'): ChainOiRow => ({ type, expiration, oi, date });

// ━━━ 결측 판정 ━━━
t('strictOi / measuredOiPcr: 빈 문자열·공백·null·음수·NaN = 결측(null) · 숫자 0 = 0 · 숫자 문자열은 숫자', () => {
    for (const v of ['', '  ', null, undefined, -1, -200, NaN, Infinity, 'abc', '-3', {}, []]) {
        assert.equal(strictOi(v), null, String(v));
        assert.equal(measuredOiPcr(v), null, String(v));
    }
    assert.equal(strictOi(0), 0);
    assert.equal(strictOi('120'), 120);
    assert.equal(measuredOiPcr(0), 0);
    assert.equal(measuredOiPcr('0.73'), 0.73);
});

// ━━━ 체인 합산 ━━━
const EXP7 = ['2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20', '2026-10-21', '2026-10-28'];
t('관문 10200109 ②: 35일 안 7만기 중 6만기만 있으면(앱 체인 상한) 값을 내지 않는다 — P/C 1.5 → 0 재현 입력', () => {
    const rows: ChainOiRow[] = [];
    for (const e of EXP7.slice(0, 6)) { rows.push(row('call', e, 100)); rows.push(row('put', e, 0)); }
    const r = sumChainOi35(rows, EXP7, '2026-10-19');
    assert.equal(r.ok, false);
    assert.match((r as any).reason, /^coverage:1\/7$/);
    // 7만기 전부(7번째 만기에 풋 OI 900)면 그때만 값 — 1.5 가 그대로
    rows.push(row('call', EXP7[6], 0)); rows.push(row('put', EXP7[6], 900));
    const ok = sumChainOi35(rows, EXP7, '2026-10-19');
    assert.equal(ok.ok, true);
    assert.equal((ok as any).value.pcr, 1.5);
});
t('관문 10200109 ③: 서로 다른 날짜의 OI(10/16 콜 + 8/28 풋)는 섞지 않는다 · 날짜 없는 계약도 거부', () => {
    const mixed = [row('call', '2026-10-23', 1000, '2026-10-16'), row('put', '2026-10-23', 2090, '2026-08-28')];
    assert.deepEqual(sumChainOi35(mixed, ['2026-10-23'], '2026-10-19'), { ok: false, reason: 'dates:2' });
    const undated = [row('call', '2026-10-23', 1000, '2026-10-16'), row('put', '2026-10-23', 2090, null)];
    assert.deepEqual(sumChainOi35(undated, ['2026-10-23'], '2026-10-19'), { ok: false, reason: 'undated' });
});
t('관문 10200204 ②: 음수 OI(−200)는 합산하지 않는다 — 결측 계약이 있으면 값 없음(P/C −1 재현 입력)', () => {
    const rows = [row('call', '2026-10-23', 100), row('put', '2026-10-23', 100), row('put', '2026-10-23', -200)];
    const r = sumChainOi35(rows, ['2026-10-23'], '2026-10-19');
    assert.equal(r.ok, false);
    assert.match((r as any).reason, /^missing-oi:2026-10-23:1\/3$/);
});
t('관문 10200222 ①: 풋 OI "" 는 0 이 아니다 — P/C 0(→ OPI 95)이 나오지 않는다', () => {
    const rows = [row('call', '2026-10-23', 100), row('put', '2026-10-23', '')];
    const r = sumChainOi35(rows, ['2026-10-23'], '2026-10-19');
    assert.equal(r.ok, false);
    assert.match((r as any).reason, /^missing-oi:2026-10-23:1\/2$/);
    // 풋이 실제로 0 이어도(측정된 0) 한쪽 합계 0 이면 P/C 0·극단값이라 내지 않는다(0 계약 방어)
    assert.deepEqual(sumChainOi35([row('call', '2026-10-23', 100), row('put', '2026-10-23', 0)], ['2026-10-23'], '2026-10-19'), { ok: false, reason: 'zero-side' });
});
t('범위: 창(오늘 ET ~ +35일) 밖 만기는 세지 않는다 — 전 만기 합계로 메우지 않는다', () => {
    assert.equal(oi35WindowEnd('2026-10-19'), '2026-11-23');
    const rows = [row('call', '2026-10-23', 100), row('put', '2026-10-23', 50), row('put', '2026-12-18', 99999), row('call', '2026-10-16', 99999)];
    const r = sumChainOi35(rows, ['2026-10-16', '2026-10-23', '2026-12-18'], '2026-10-19');
    assert.equal(r.ok, true);
    assert.equal((r as any).value.callOI, 100);
    assert.equal((r as any).value.putOI, 50);
    assert.equal((r as any).value.pcr, 0.5);
    assert.equal((r as any).value.expiries, 1);
});

// ━━━ SPY 실측(레코드 10/16) ━━━
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/spy-oi35-2026-10-16.json'), 'utf8'));
/**
 * 픽스처(행사가별 콜·풋 OI) → 공급사 EOD 체인 행 모양.
 *   asRecorded=true: 레코드 10/16 그대로 — 10/29(그날 상장) 만기 298계약 중 238계약 OI null(OCC 미공표).
 *   기본(false): 그 238계약이 0 으로 공표된 판(합계는 같다 — 측정된 60계약 OI 4,438 만 있다) — 계산·저장·읽기 경로 시험용.
 */
function vendorRows(exp: string, asRecorded = false): any[] {
    const x = FX.expiries[exp];
    const out: any[] = [];
    let missLeft = asRecorded ? (x.oiMissing || 0) : 0;
    x.strikes.forEach((k: number, i: number) => {
        for (const [type, oi] of [['call', x.callsOI[i]], ['put', x.putsOI[i]]] as const) {
            const asNull = missLeft > 0 && oi === 0;
            if (asNull) missLeft--;
            out.push({ option: { type, expiration: exp, strike: k }, prices: { open_interest: asNull ? null : oi, date: FX.recordDate } });
        }
    });
    return out;
}
const IN_HAND_8 = FX.listed.slice(0, 8);   // 앱 체인(allExpiryChain) 상한 8만기 — 10/19~10/28
t('SPY: 앱 체인 8만기(10/19~10/28)만으로는 35일 값이 아니다 → 값 없음(일부 만기 합계로 메우지 않는다)', () => {
    const rows = IN_HAND_8.flatMap((e: string) => vendorRows(e).map(chainRowOf));
    const r = sumChainOi35(rows, FX.listed, FX.anchor);
    assert.equal(r.ok, false);
    assert.equal((r as any).reason, 'coverage:5/13');
});
function spyDeps(over: Partial<ChainBuildDeps> = {}): Partial<ChainBuildDeps> {
    const fetched: string[] = [];
    return {
        listExpirations: async () => [...FX.listed, '2026-12-18', '2027-01-15'],
        fetchExpiry: async (_t, e) => { fetched.push(e); return FX.expiries[e] ? { rows: vendorRows(e), missing: false, truncated: false } : { rows: [], missing: true, truncated: false }; },
        setNxEx: async () => true,
        user429: async () => 'no',
        getCache: async (k) => (store.has(k) ? store.get(k) : null),
        setCache: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
        now: () => NOW,
        ...over,
        // 시험에서 몇 만기를 불렀는지 보려고
        ...({ _fetched: fetched } as any),
    };
}
t('SPY: 35일 창 13만기 전부 → 콜 1,566,004 · 풋 4,812,696 · P/C 3.07 · 레코드 10/16 · OI 기준일 10/15 · 저장', async () => {
    store.clear();
    const deps = spyDeps();
    const r = await buildChainOi35('SPY', deps);
    assert.equal(r.reason, 'built');
    assert.equal(r.value!.callOI, 1_566_004);
    assert.equal(r.value!.putOI, 4_812_696);
    assert.equal(r.value!.pcr, 3.07);
    assert.equal(r.value!.recordDate, '2026-10-16');
    assert.equal(r.value!.oiDate, '2026-10-15');
    assert.equal(r.value!.basis, 'oi_near_expiries_35d_chain');
    assert.deepEqual((deps as any)._fetched.sort(), [...FX.listed].sort());   // 창 밖(12/18·1/15)은 부르지 않는다
    const saved: any = store.get(CHAIN_OI35_KEY('SPY'));
    assert.equal(saved.anchor, '2026-10-19');
    assert.equal(saved.missingOi, 0);
    // OPI: P/C 3.07 → 10(눈금 하한) — 0.0 이 아니라 실측 P/C 의 값
    assert.equal(opiFromOiPcr(r.value!.pcr), 10);
});
t('계산 관문: 잠금 중·실패 쉼·사용자 429 직후면 공급사를 부르지 않는다 · 만기 하나라도 비거나 잘리면 저장하지 않고 15분 쉼', async () => {
    store.clear();
    let calls = 0;
    const counting = (over: Partial<ChainBuildDeps>) => spyDeps({ listExpirations: async () => { calls++; return FX.listed; }, ...over });
    assert.equal((await buildChainOi35('SPY', counting({ setNxEx: async () => false }))).reason, 'locked');
    assert.equal((await buildChainOi35('SPY', counting({ user429: async () => 'yes' }))).reason, 'user-429');
    assert.equal(calls, 0);
    const trunc = await buildChainOi35('SPY', counting({ fetchExpiry: async (_t, e) => ({ rows: vendorRows(e), missing: false, truncated: e === '2026-11-20' }) }));
    assert.equal(trunc.value, null);
    assert.match(trunc.reason, /^expiry:2026-11-20:truncated$/);
    assert.equal(store.has(CHAIN_OI35_KEY('SPY')), false);
    assert.ok(store.has(CHAIN_OI35_NEG_KEY('SPY')));
    assert.equal((await buildChainOi35('SPY', counting({}))).reason, 'resting');
    store.clear();
    assert.equal((await buildChainOi35('SPY', counting({ listExpirations: async () => null }))).reason, 'expirations-failed');
});

// ━━━ 저장본 읽기 · 순서 ━━━
t('읽기 순서(운영 결정 10/20): 오늘 체인 합산 → 직전 정상 저장본(+기준일) → EOD 35일 → null · 어제 창·옛 레코드 오늘 저장본은 쓰지 않는다', async () => {
    store.clear(); _resetOi35Memo();
    const realNow = Date.now; (Date as any).now = () => NOW;
    try {
        await buildChainOi35('SPY', spyDeps());
        store.set('intrinio:options:eod', { date: '2026-10-16', tickers: { SPY: { callOI35: 1000, putOI35: 2000 } } });
        const chain = await readOi35Fallback('SPY', NOW);
        assert.equal(chain!.basis, 'oi_near_expiries_35d_chain');   // EOD 가 있어도 오늘 체인 합산이 먼저
        assert.equal(chain!.pcr, 3.07);
        assert.equal(chain!.oiDate, '2026-10-15');
        assert.ok(store.has(CHAIN_OI35_PREV_KEY('SPY')));   // 성공본은 직전 정상 저장본으로도 남는다
        store.delete(CHAIN_OI35_KEY('SPY')); store.delete(CHAIN_OI35_PREV_KEY('SPY')); _resetOi35Memo();
        const eod = await readOi35Fallback('SPY', NOW);
        assert.equal(eod!.basis, 'oi_near_expiries_35d_eod');
        assert.equal(eod!.pcr, 2);
        assert.equal(eod!.oiDate, '2026-10-15');
        // 저장본 검사
        const v: any = store.get(CHAIN_OI35_KEY('SPY'));
        assert.equal(validStoredOi35({ ...v, anchor: '2026-10-16' }, '2026-10-19', '2026-10-15'), null);
        assert.equal(validStoredOi35({ ...v, recordDate: '2026-10-08' }, '2026-10-19', '2026-10-15'), null);
        assert.equal(validStoredOi35({ ...v, putOI: '' }, '2026-10-19', '2026-10-15'), null);
        assert.equal(await readChainOi35('SPY', EDT(2026, 10, 20, 10)), null);   // 다음 날엔 창이 바뀌었으니 다시 계산할 대상
        store.delete('intrinio:options:eod'); _resetOi35Memo();
        assert.equal(await readOi35Fallback('SPY', NOW), null);   // 아무것도 없으면 null(«—»)
    } finally { (Date as any).now = realNow; }
});

t('oi-pcr: 수집 행에 OI 합계가 없고(SPY 장중) EOD 35일도 없으면 체인 저장본 — 기준(basis)·레코드 날짜·OI 기준일(D−1)', async () => {
    store.clear(); _resetOi35Memo();
    const realNow = Date.now; (Date as any).now = () => NOW;
    try {
        dynamoRow = { timestamp: NOW - 3600_000, pcr: null };   // 신선한 행, OI 합계 없음(10/19 23:10 KST SPY 실측 모양)
        store.set('intrinio:options:eod', { date: '2026-10-16', tickers: { SPY: { callOI: 5973153, putOI: 13672707, pcrOI: 2.289, callOI35: null, putOI35: null } } });
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const route = require('../src/app/api/app/oi-pcr/route');
        const before = await (await route.GET(new Request('http://x/api/app/oi-pcr?t=SPY'))).json();
        assert.equal(before.pcr, null);   // 저장본이 아직 없다(계산 잠금은 시험 환경에서 못 잡는다) → 전 만기 pcrOI 2.289 로 메우지 않는다
        await buildChainOi35('SPY', spyDeps());
        const j = await (await route.GET(new Request('http://x/api/app/oi-pcr?t=SPY'))).json();
        assert.equal(j.pcr, 3.07);
        assert.equal(j.callOI, 1_566_004);
        assert.equal(j.putOI, 4_812_696);
        assert.equal(j.basis, 'oi_near_expiries_35d_chain');
        assert.equal(j.eodDate, '2026-10-16');
        assert.equal(j.oiDate, '2026-10-15');
        assert.equal(j.stale, false);
        // 정상 종목(수집 행에 OI 합계가 있다)은 예전 그대로 — 대체를 보지 않는다
        dynamoRow = { timestamp: NOW - 3600_000, pcr: 0.73, totalCallOI: 521250, totalPutOI: 410259, totalContracts: 812 };
        const n = await (await route.GET(new Request('http://x/api/app/oi-pcr?t=NVDA'))).json();
        assert.equal(n.pcr, 0.73);
        assert.equal(n.basis, 'oi_all_expiries_35d');
    } finally { (Date as any).now = realNow; dynamoRow = null; }
});

// ━━━ 관문 10200328 재현 입력 ━━━
t('관문 10200328 ①: EOD 묶음 callOI35=100·putOI35=null/"" 은 결측 — P/C 0(→ OPI 95)이 아니라 다음 대체(체인 저장본 3.07)', async () => {
    for (const bad of [null, '', '  ', -5, 0]) {
        store.clear(); _resetOi35Memo();
        await buildChainOi35('SPY', spyDeps());
        store.set('intrinio:options:eod', { date: '2026-10-16', tickers: { SPY: { callOI35: 100, putOI35: bad } } });
        const r = await readOi35Fallback('SPY', NOW);
        assert.equal(r!.basis, 'oi_near_expiries_35d_chain', String(bad));
        assert.equal(r!.pcr, 3.07, String(bad));
        _resetOi35Memo();
        store.set('intrinio:options:eod', { date: '2026-10-16', tickers: { SPY: { callOI35: bad, putOI35: 100 } } });
        assert.equal((await readOi35Fallback('SPY', NOW))!.basis, 'oi_near_expiries_35d_chain', String(bad));
    }
});
t('관문 10200328 ②: ET 20:10(UTC 다음 날)에도 만기 목록은 «ET 어제 이후»로 받는다 — ET 오늘 만기(10/19)를 빼고 12만기로 통과하지 않는다', async () => {
    store.clear();
    const eve = EDT(2026, 10, 19, 20, 10);
    assert.equal(new Date(eve).toISOString().slice(0, 10), '2026-10-20');   // UTC 는 이미 다음 날
    let asked = '';
    const r = await buildChainOi35('SPY', spyDeps({
        now: () => eve,
        // 공급사 after 는 배타적 — 받은 날짜 «다음» 만기만 준다
        listExpirations: async (_t, after) => { asked = after; return FX.listed.filter((e: string) => e > after); },
    }));
    assert.equal(asked, '2026-10-18');
    assert.equal(r.reason, 'built');
    assert.equal(r.value!.callOI, 1_566_004);   // 10/19 만기(콜 94,121·풋 295,806) 포함 13만기
    assert.equal(r.value!.putOI, 4_812_696);
    assert.equal((store.get(CHAIN_OI35_KEY('SPY')) as any).expiries, 13);
});
t('관문 10200328 ③: OPI 결측 요청이 날아가는 중 OPI 가 복구되면 새 요청이 나가고, 늦게 온 422 가 그것을 지우지 않는다(실제 효과 코드 실행)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ts = require('typescript');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vm = require('node:vm');
    const src = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/flow/page.tsx'), 'utf8');
    const ast = ts.createSourceFile('page.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let effect = '';
    const visit = (n: any) => {
        if (!effect && ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.getText(ast).includes('/api/flow/ai-analysis')) effect = n.arguments[0].getText(ast);
        ts.forEachChild(n, visit);
    };
    visit(ast);
    assert.ok(effect, 'AI effect');
    const js = ts.transpileModule(`(${effect})`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const keyRef = { current: '' };
    const state: any = { aiFlow: null, risk: false };
    const pending: Array<{ body: any; resolve: (r: any) => void }> = [];
    const fetchMock = (_u: string, init: any) => new Promise((resolve) => pending.push({ body: JSON.parse(init.body), resolve }));
    const runEffect = (opiKnown: boolean, opiValue: number | null) => vm.runInNewContext(js, {
        ticker: 'SPY', aiReady: true, effectiveSession: 'REG', locale: 'ko', opiKnown,
        aiFlowKeyRef: keyRef, aiPayloadRef: { current: { factors: { opi: { value: opiValue } } } },
        setAiFlow: (v: any) => { state.aiFlow = v; }, setRiskExpanded: (v: any) => { state.risk = v; },
        fetch: fetchMock, JSON, console,
    })();
    const settle = async () => { for (let i = 0; i < 10; i++) await new Promise<void>((r) => setImmediate(r)); };
    runEffect(false, null);                       // ① OPI 결측 회차 — 요청 1(재료 미완결)
    assert.equal(pending.length, 1);
    runEffect(true, 10);                          // ② 응답 전에 OPI 복구 — 요청 2 가 나가야 한다
    assert.equal(pending.length, 2);
    assert.equal(pending[1].body.flowData.factors.opi.value, 10);
    pending[0].resolve({ ok: false, status: 422, json: async () => ({ error: 'material_incomplete' }) });   // ③ 늦게 온 422
    await settle();
    assert.equal(keyRef.current, 'SPY:REG:ko:opi');  // 새 요청의 키는 그대로
    pending[1].resolve({ ok: true, json: async () => ({ structuralThesis: { ko: '글' } }) });
    await settle();
    assert.deepEqual(state.aiFlow, { structuralThesis: { ko: '글' } });
    runEffect(true, 10);                          // 같은 키 — 다시 부르지 않는다
    assert.equal(pending.length, 2);
    // 늦게 온 옛 요청의 «성공» 글이 새 글을 덮지 않는다
    keyRef.current = ''; state.aiFlow = null; pending.length = 0;
    runEffect(false, null); runEffect(true, 10);
    pending[1].resolve({ ok: true, json: async () => ({ structuralThesis: { ko: '새 글' } }) });
    await settle();
    pending[0].resolve({ ok: true, json: async () => ({ structuralThesis: { ko: '옛 글' } }) });
    await settle();
    assert.deepEqual(state.aiFlow, { structuralThesis: { ko: '새 글' } });
});

t('관문 10200339 ①: OPI 입력은 «가장 최근 회차»의 측정값 — 옛 flow 0.73 이 새 대체 3.07 을 막지 않는다 · 같은 회차면 live/ticker · 약 10분 넘은 직전 값은 버린다', () => {
    // 1회차 flow 0.73 → 2회차 flow 결측(덮지 않음)·oi-pcr 대체 3.07
    assert.equal(pickOiPcr({ pcr: 0.73, round: 1 }, { pcr: 3.07, round: 2 }, 2), 3.07);
    assert.equal(opiFromOiPcr(pickOiPcr({ pcr: 0.73, round: 1 }, { pcr: 3.07, round: 2 }, 2)), 10);
    // 같은 회차 둘 다 있으면 live/ticker
    assert.equal(pickOiPcr({ pcr: 0.73, round: 2 }, { pcr: 0.79, round: 2 }, 2), 0.73);
    // 두 쪽 다 이번 회차에 결측 → 직전 측정값(10분 안)
    assert.equal(pickOiPcr({ pcr: 0.73, round: 3 }, null, 5), 0.73);
    assert.equal(pickOiPcr({ pcr: 0.73, round: 3 }, null, 3 + OI_PCR_KEEP_ROUNDS + 1), null);
    // 결측 표식은 값이 아니다
    assert.equal(pickOiPcr({ pcr: null, round: 5 }, { pcr: '' as any, round: 5 }, 5), null);
    assert.equal(pickOiPcr(null, undefined, 1), null);
});
t('관문 10200339 ②·잔존 위험: 행 «수량» 규칙 하나 — 콜 0·풋 100 은 행이 정본(P/C 없음, 대체로 덮지 않음) · 콜 100·풋 null 은 P/C 0 이 아니라 결측 → 대체', async () => {
    assert.equal(oiPcrAllExpiries({ pcr: null, totalCallOI: 100, totalPutOI: null }), null);   // 예전: Number(null)=0 → P/C 0 → OPI 95
    assert.equal(oiPcrAllExpiries({ totalCallOI: 100, totalPutOI: '' }), null);
    assert.equal(oiPcrAllExpiries({ totalCallOI: 0, totalPutOI: 100 }), null);
    assert.equal(oiPcrAllExpiries({ pcr: 0.94, totalCallOI: 329180, totalPutOI: 307802 }), 0.94);
    assert.equal(oiRowHasQuantities({ totalCallOI: 0, totalPutOI: 100 }), true);
    assert.equal(oiRowHasQuantities({ totalCallOI: 100, totalPutOI: null }), false);
    assert.equal(oiRowHasQuantities({ pcr: 0.73 }), false);
    store.clear(); _resetOi35Memo();
    const realNow = Date.now; (Date as any).now = () => NOW;
    try {
        await buildChainOi35('SPY', spyDeps());
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const route = require('../src/app/api/app/oi-pcr/route');
        dynamoRow = { timestamp: NOW - 3600_000, pcr: null, totalCallOI: 0, totalPutOI: 100 };
        const keep = await (await route.GET(new Request('http://x/api/app/oi-pcr?t=SPY'))).json();
        assert.equal(keep.basis, 'oi_all_expiries_35d');
        assert.equal(keep.pcr, null);
        assert.equal(keep.callOI, 0);
        assert.equal(keep.putOI, 100);
        dynamoRow = { timestamp: NOW - 3600_000, pcr: null, totalCallOI: 100, totalPutOI: null };
        const fb = await (await route.GET(new Request('http://x/api/app/oi-pcr?t=SPY'))).json();
        assert.equal(fb.basis, 'oi_near_expiries_35d_chain');
        assert.equal(fb.pcr, 3.07);
    } finally { (Date as any).now = realNow; dynamoRow = null; }
});

t('관문 10200353: 새로 상장된 만기가 아닌 곳의 결측은 한 계약이라도 거부 — 풋 2,550 하나가 null 이면 P/C 3.00 → 0.45(OPI 10 → 78)로 뒤집히던 입력', () => {
    const rows: ChainOiRow[] = [];
    for (let i = 0; i < 10; i++) rows.push(row('call', '2026-10-23', 100));
    for (let i = 0; i < 9; i++) rows.push(row('put', '2026-10-23', 50));
    rows.push(row('put', '2026-10-23', 2550));
    const full = sumChainOi35(rows, ['2026-10-23'], '2026-10-19');
    assert.equal((full as any).value.pcr, 3);
    rows[rows.length - 1] = row('put', '2026-10-23', null);
    const r = sumChainOi35(rows, ['2026-10-23'], '2026-10-19');
    assert.equal(r.ok, false);
    assert.equal((r as any).reason, 'missing-oi:2026-10-23:1/20');
});
t('관문 10200410: 만기 «전체» 결측(결측률 100%)은 새 상장으로 통과하지 않는다 — P/C 3.00 → 0.50 으로 뒤집히던 입력 · SPY 11/20 전체 결측도 거부', () => {
    const rows: ChainOiRow[] = [];
    for (let i = 0; i < 10; i++) { rows.push(row('call', '2026-10-23', 100)); rows.push(row('put', '2026-10-23', 50)); }
    rows.push(row('call', '2026-10-30', 0)); rows.push(row('put', '2026-10-30', 2500));
    assert.equal((sumChainOi35(rows, ['2026-10-23', '2026-10-30'], '2026-10-19') as any).value.pcr, 3);
    const gone = rows.map((r) => (r.expiration === '2026-10-30' ? { ...r, oi: null } : r));
    const r = sumChainOi35(gone, ['2026-10-23', '2026-10-30'], '2026-10-19');
    assert.equal(r.ok, false);
    assert.equal((r as any).reason, 'missing-oi:2026-10-30:2/2');
    const spy = FX.listed.flatMap((e: string) => vendorRows(e).map(chainRowOf)).map((x: any) => (x.expiration === '2026-11-20' ? { ...x, oi: null } : x));
    const s2 = sumChainOi35(spy, FX.listed, FX.anchor);
    assert.equal(s2.ok, false);
    assert.equal((s2 as any).reason, 'missing-oi:2026-11-20:442/442');
});
t('SPY 레코드 10/16 그대로(10/29 그날 상장 238/298 결측)는 체인 대체가 값을 내지 않는다 → EOD 35일이 있으면 그것, 없으면 null(«—», 0 아님)', async () => {
    const recorded = FX.listed.flatMap((e: string) => vendorRows(e, true).map(chainRowOf));
    const r = sumChainOi35(recorded, FX.listed, FX.anchor);
    assert.equal(r.ok, false);
    assert.equal((r as any).reason, 'missing-oi:2026-10-29:238/298');
    store.clear(); _resetOi35Memo();
    const built = await buildChainOi35('SPY', spyDeps({ fetchExpiry: async (_t, e) => ({ rows: vendorRows(e, true), missing: false, truncated: false }) }));
    assert.equal(built.value, null);
    assert.equal(built.reason, 'missing-oi:2026-10-29:238/298');
    assert.equal(store.has(CHAIN_OI35_KEY('SPY')), false);
    assert.equal(await readOi35Fallback('SPY', NOW), null);
    assert.equal(opiFromOiPcr(null), null);
    _resetOi35Memo();
    store.set('intrinio:options:eod', { date: '2026-10-16', tickers: { SPY: { callOI35: 1000, putOI35: 2000 } } });
    assert.equal((await readOi35Fallback('SPY', NOW))!.basis, 'oi_near_expiries_35d_eod');
});
t('관문 10200509 ①·운영 결정(10/20): 결측 계약이 한 건이라도 있으면 체인 합산을 쓰지 않는다 — 100계약 중 풋 2,510 하나 null 이면 P/C 3.00 → 0.49 로 뒤집히던 입력', () => {
    const rows: ChainOiRow[] = [];
    for (let i = 0; i < 50; i++) rows.push(row('call', '2026-10-23', 100));
    for (let i = 0; i < 49; i++) rows.push(row('put', '2026-10-23', 50));
    rows.push(row('put', '2026-10-23', 2550));
    assert.equal((sumChainOi35(rows, ['2026-10-23'], '2026-10-19') as any).value.pcr, 1);
    const big: ChainOiRow[] = [];
    for (let i = 0; i < 99; i++) big.push(row(i < 50 ? 'call' : 'put', '2026-10-23', i < 50 ? 100 : 50));
    big.push(row('put', '2026-10-23', 12510));   // 콜 5,000 · 풋 2,450+12,510 = P/C 2.99
    assert.equal((sumChainOi35(big, ['2026-10-23'], '2026-10-19') as any).value.pcr, 2.99);
    big[99] = row('put', '2026-10-23', null);     // 1% 결측
    const r = sumChainOi35(big, ['2026-10-23'], '2026-10-19');
    assert.equal(r.ok, false);
    assert.equal((r as any).reason, 'missing-oi:2026-10-23:1/100');
    // SPY 11/20(442계약)에서 OI 0 인 행사가 하나만 결측이어도 거부(새 행사가인지 큰 계약 결측인지 가를 수 없다)
    let left = 1;
    const one = FX.listed.flatMap((e: string) => vendorRows(e).map(chainRowOf)).map((x: any) => (x.expiration === '2026-11-20' && x.oi === 0 && left-- > 0 ? { ...x, oi: null } : x));
    const s1 = sumChainOi35(one, FX.listed, FX.anchor);
    assert.equal(s1.ok, false);
    assert.equal((s1 as any).reason, 'missing-oi:2026-11-20:1/442');
});
t('관문 10200509 ①: 오늘 합산이 결측으로 거부되면 직전 정상 저장본(10/16 창·레코드 10/15)을 기준일과 함께 쓴다 → 없으면 EOD 35일 → 없으면 null', async () => {
    store.clear(); _resetOi35Memo();
    // 어제(10/16 금, 레코드 10/15) 정상 합산이 남아 있다
    const fri = EDT(2026, 10, 16, 12);
    const y = await buildChainOi35('SPY', spyDeps({ now: () => fri, listExpirations: async () => ['2026-10-16', '2026-10-23'],
        fetchExpiry: async (_t, e) => ({ rows: [{ option: { type: 'call', expiration: e }, prices: { open_interest: 400, date: '2026-10-15' } }, { option: { type: 'put', expiration: e }, prices: { open_interest: 1000, date: '2026-10-15' } }], missing: false, truncated: false }) }));
    assert.equal(y.reason, 'built');
    store.delete(CHAIN_OI35_KEY('SPY'));
    // 오늘(10/19) 합산은 레코드 그대로(10/29 결측 238)라 거부
    const today = await buildChainOi35('SPY', spyDeps({ fetchExpiry: async (_t, e) => ({ rows: vendorRows(e, true), missing: false, truncated: false }) }));
    assert.equal(today.value, null);
    assert.equal(today.reason, 'missing-oi:2026-10-29:238/298');
    store.set('intrinio:options:eod', { date: '2026-10-16', tickers: { SPY: { callOI35: 1000, putOI35: 2000 } } });
    const prev = await readOi35Fallback('SPY', NOW);
    assert.equal(prev!.basis, 'oi_near_expiries_35d_chain_prev');
    assert.equal(prev!.pcr, 2.5);
    assert.equal(prev!.recordDate, '2026-10-15');
    assert.equal(prev!.oiDate, '2026-10-14');
    assert.equal((await readPrevChainOi35('SPY', EDT(2026, 10, 21, 10))), null);   // 창 기준일 5일 전 → 너무 옛것
    store.delete(CHAIN_OI35_PREV_KEY('SPY')); _resetOi35Memo();
    assert.equal((await readOi35Fallback('SPY', NOW))!.basis, 'oi_near_expiries_35d_eod');
});
t('관문 10200508: 늦게 도착한 이전 회차 응답(1회차 oi-pcr 0.73)은 2회차 값(3.07)을 덮지 않는다 — OPI 10 유지', () => {
    let oiAll: any = null;
    const set = (next: any) => { oiAll = newerReading(oiAll, next); };
    set({ callOI: 1_566_004, putOI: 4_812_696, pcr: 3.07, round: 2 });   // 2회차(재시도) 먼저 도착
    set({ callOI: 521_250, putOI: 410_259, pcr: 0.73, round: 1 });       // 1회차 응답이 4초 뒤 도착
    assert.equal(oiAll.pcr, 3.07);
    assert.equal(opiFromOiPcr(pickOiPcr(null, oiAll, 2)), 10);
    set({ callOI: 1, putOI: 2, pcr: 2, round: 3 });                     // 더 새 회차는 반영
    assert.equal(oiAll.pcr, 2);
    let flow: any = null;
    flow = newerReading(flow, { pcr: 3.07, round: 2 });
    flow = newerReading(flow, { pcr: 0.73, round: 1 });
    assert.equal(flow.pcr, 3.07);
});

t('관문 10200509 ②: 합산 도중 사용자 429 가 나면 나머지 만기를 부르지 않고 저장하지 않는다', async () => {
    store.clear();
    let fetched = 0, checks = 0;
    const r = await buildChainOi35('SPY', spyDeps({
        fetchExpiry: async (_t, e) => { fetched++; return { rows: vendorRows(e), missing: false, truncated: false }; },
        user429: async () => (++checks >= 3 ? 'yes' : 'no'),   // 시작·첫 묶음 검사 통과 → 첫 2만기 조회 뒤 429
    }));
    assert.equal(r.reason, 'user-429');
    assert.equal(fetched, 2);
    assert.equal(store.has(CHAIN_OI35_KEY('SPY')), false);
});

t('관문 10200520 ③: 만기 목록을 기다리는 동안 429 가 나면 첫 묶음도 부르지 않는다', async () => {
    store.clear();
    let fetched = 0, checks = 0;
    const r = await buildChainOi35('SPY', spyDeps({
        fetchExpiry: async (_t, e) => { fetched++; return { rows: vendorRows(e), missing: false, truncated: false }; },
        user429: async () => (++checks >= 2 ? 'yes' : 'no'),   // 시작 검사 통과 → 목록 조회 뒤 429
    }));
    assert.equal(r.reason, 'user-429');
    assert.equal(fetched, 0);
    assert.equal(store.has(CHAIN_OI35_KEY('SPY')), false);
});
t('관문 10200520 ①·10200529·10200537 ①: OPI 입력은 live/ticker 한 곳 — 서버가 행 → 오늘 체인 → 직전 저장본 → EOD 순서로 낸 값을 회차대로(옛값이 새 값을 막지 않는다)', async () => {
    const f = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/flow/page.tsx'), 'utf8');
    assert.match(f, /const opiPick = pickOiPcrReading\(flowOiPcr, null, oiRound\);/);
    // 1회차 수집 행 0.73 → 2회차 live/ticker 가 오늘 체인 3.07 → 3.07(OPI 10)
    let flow: any = null;
    flow = newerReading(flow, { pcr: 0.73, round: 1, prev: false, oiDate: null });
    flow = newerReading(flow, { pcr: 3.07, round: 2, prev: false, oiDate: '2026-10-15' });
    assert.equal(opiFromOiPcr(pickOiPcrReading(flow, null, 2)?.pcr), 10);
    // 그 회차에 live/ticker 가 결측이면 직전 측정값(약 10분 안)
    assert.equal(pickOiPcrReading({ pcr: 0.73, round: 1 }, null, 3)?.pcr, 0.73);
    // 서버 순서: 오늘 체인이 있으면 직전 저장본·EOD 보다 먼저(같은 함수를 live/ticker·oi-pcr 가 쓴다)
    store.clear(); _resetOi35Memo();
    await buildChainOi35('SPY', spyDeps());
    store.set(CHAIN_OI35_PREV_KEY('SPY'), { ...(store.get(CHAIN_OI35_KEY('SPY')) as any), anchor: '2026-10-16', callOI: 1000, putOI: 730 });
    store.set('intrinio:options:eod', { date: '2026-10-16', tickers: { SPY: { callOI35: 1000, putOI35: 730 } } });
    assert.equal((await readOi35Fallback('SPY', NOW))!.pcr, 3.07);
    // 직전 저장본만 남으면 그것(+기준일), EOD 보다 먼저
    store.delete(CHAIN_OI35_KEY('SPY')); _resetOi35Memo();
    const p = await readOi35Fallback('SPY', NOW);
    assert.equal(p!.basis, 'oi_near_expiries_35d_chain_prev');
    assert.equal(p!.pcr, 0.73);
});
t('관문 10200520 ②: 직전 저장본으로 낸 OPI 는 화면에 OI 기준일 표식(«M/D(요일) 마감 기준») — basis·oiDate 를 상태에 보존', () => {
    const f = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/flow/page.tsx'), 'utf8');
    assert.match(f, /prev: j\.basis === OI_PCR_PREV_BASIS, oiDate: typeof j\.oiDate === 'string' \? j\.oiDate : null/);
    assert.match(f, /prev: flow\.oiPcrBasis === OI_PCR_PREV_BASIS, oiDate: typeof flow\.oiPcrDate === 'string' \? flow\.oiPcrDate : null/);
    assert.match(f, /const opiPrevOiDate: string \| null = opi != null && opiPick\?\.prev \? \(opiPick\.oiDate \?\? null\) : null;/);
    assert.match(f, /\{opiPrevOiDate && \([\s\S]{0,300}closeLabelOr\(opiPrevOiDate,/);
    // 라벨 OPI SCORE 는 그대로
    assert.ok(f.includes('OPI SCORE'));
});

t('관문 10200537 ③: 마지막 묶음 중 429 가 났으면 합산을 저장하지 않는다', async () => {
    store.clear();
    let fetched = 0, checks = 0;
    const two = ['2026-10-23', '2026-10-30'];
    const r = await buildChainOi35('SPY', spyDeps({
        listExpirations: async () => two,
        fetchExpiry: async (_t, e) => { fetched++; return { rows: [{ option: { type: 'call', expiration: e }, prices: { open_interest: 100, date: '2026-10-16' } }, { option: { type: 'put', expiration: e }, prices: { open_interest: 50, date: '2026-10-16' } }], missing: false, truncated: false }; },
        user429: async () => (++checks >= 3 ? 'yes' : 'no'),   // 시작·첫 묶음 전 통과 → 마지막(유일) 묶음 뒤 429
    }));
    assert.equal(fetched, 2);
    assert.equal(r.reason, 'user-429');
    assert.equal(store.has(CHAIN_OI35_KEY('SPY')), false);
    assert.equal(store.has(CHAIN_OI35_PREV_KEY('SPY')), false);
});
t('관문 10200537 ②: C/P 카드 OI 칸이 직전 저장본 수량이면 그 OI 기준일 표식', () => {
    const f = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/flow/page.tsx'), 'utf8');
    assert.match(f, /\{oiAll\?\.prev && oiAll\.oiDate && \([\s\S]{0,300}closeLabelOr\(oiAll\.oiDate,/);
    assert.ok(f.includes("'OI · 35일 전 만기'"));   // 라벨 그대로
});

// ━━━ 직전 세션 조건(장 마감 뒤·주말·두 세션 넘게 낡은 레코드) ━━━
const tinyDeps = (nowMs: number, exps: string[], date: string): Partial<ChainBuildDeps> => ({
    listExpirations: async () => exps,
    fetchExpiry: async (_t, e) => ({ rows: [{ option: { type: 'call', expiration: e }, prices: { open_interest: 300, date } }, { option: { type: 'put', expiration: e }, prices: { open_interest: 150, date } }], missing: false, truncated: false }),
    setNxEx: async () => true, user429: async () => 'no',
    getCache: async (k) => (store.has(k) ? store.get(k) : null),
    setCache: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    now: () => nowMs,
});
t('직전 세션: 월 20:00 ET(마감 뒤, 새 레코드 전) 레코드 10/16 그대로 · 토요일 낮엔 금 레코드(10/23)로 창 10/24~11/28 · 일요일엔 창이 바뀌어 다시 계산 대상', async () => {
    store.clear();
    const monEve = EDT(2026, 10, 19, 20);
    const a = await buildChainOi35('SPY', tinyDeps(monEve, ['2026-10-20', '2026-10-23'], '2026-10-16'));
    assert.equal(a.reason, 'built');
    assert.equal(a.value!.oiDate, '2026-10-15');
    assert.equal(a.value!.pcr, 0.5);
    store.clear();
    const sat = EDT(2026, 10, 24, 12);
    const b = await buildChainOi35('SPY', tinyDeps(sat, ['2026-10-23', '2026-10-26', '2026-11-27', '2026-11-30'], '2026-10-23'));
    assert.equal(b.reason, 'built');
    const saved: any = store.get(CHAIN_OI35_KEY('SPY'));
    assert.equal(saved.anchor, '2026-10-24');
    assert.equal(saved.windowEnd, '2026-11-28');
    assert.equal(saved.expiries, 2);                 // 10/23(지난 만기)·11/30(창 밖) 제외
    assert.equal(b.value!.oiDate, '2026-10-22');     // 레코드 10/23 의 OI = 10/22 마감
    assert.equal((await readChainOi35('SPY', sat + 3600_000))!.pcr, 0.5);
    assert.equal(await readChainOi35('SPY', EDT(2026, 10, 25, 12)), null);
});
t('직전 세션: 두 세션 넘게 낡은 레코드(10/16 을 10/21 화 장중에)는 저장하지 않는다 — «지금 값»처럼 주지 않는다', async () => {
    store.clear();
    const r = await buildChainOi35('SPY', tinyDeps(EDT(2026, 10, 21, 10), ['2026-10-23'], '2026-10-16'));
    assert.equal(r.value, null);
    assert.equal(r.reason, 'record-old');
    assert.equal(store.has(CHAIN_OI35_KEY('SPY')), false);
});

t('nightly-20261020 높음 1: 수집기 → EOD 대체 → oi-pcr/Flow에서 결측 1건을 P/C 0.50·OPI 75로 만들지 않는다', async () => {
    const collector = require('../scripts/intrinio-options-eod.js');
    const saved = (extraOi: unknown) => {
        const a = collector.createAggregator(null, { fileDate: '2026-10-16' });
        [
            { type: 'call', oi: 100 }, { type: 'put', oi: 50 }, { type: 'put', oi: extraOi },
        ].forEach(({ type, oi }, i) => a.add(collector.mapApiRow('SPY', {
            option: { code: `SPY261023${type === 'call' ? 'C' : 'P'}${String(100000 + i).padStart(8, '0')}`, type, ticker: 'SPY', expiration: '2026-10-23' },
            price: { date: '2026-10-16', open_interest: oi, volume: 0 },
        })));
        return JSON.parse(JSON.stringify(collector.finalizeTickers(a.agg).SPY));
    };
    const realNow = Date.now; (Date as any).now = () => NOW;
    try {
        dynamoRow = null;
        const route = require('../src/app/api/app/oi-pcr/route');
        for (const extra of [null, 250, 0]) {
            store.clear(); _resetOi35Memo();
            const v = saved(extra);
            store.set('intrinio:options:eod', { date: '2026-10-16', tickers: { SPY: v } });
            const rows = [row('call', '2026-10-23', 100), row('put', '2026-10-23', 50), row('put', '2026-10-23', extra)];
            assert.equal(sumChainOi35(rows, ['2026-10-23'], '2026-10-19').ok, extra != null);
            const fallback = await readOi35Fallback('SPY', NOW);
            const card = await (await route.GET(new Request('http://x/api/app/oi-pcr?t=SPY'))).json();
            if (extra == null) {
                assert.equal(v.putOI35Missing, 1); assert.equal(v.oi35Complete, false);
                assert.equal(fallback, null); assert.equal(card.pcr, null);
                assert.equal(opiFromOiPcr(fallback?.pcr), null);
                assert.equal(opiGaugeStatus(opiFromOiPcr(card.pcr)), '—');
            } else {
                const pcr = extra === 250 ? 3 : 0.5;
                assert.equal(v.oi35Complete, true); assert.equal(v.putOI35Missing, 0);
                assert.equal(fallback!.pcr, pcr); assert.equal(card.pcr, pcr);
                assert.equal(opiFromOiPcr(fallback!.pcr), extra === 250 ? 10 : 75);
                assert.equal(fallback!.recordDate, '2026-10-16'); assert.equal(fallback!.oiDate, '2026-10-15');
            }
        }
        // stale 경로도 같은 검사. 부분 메타데이터·불완전 표식은 우회 불가.
        for (const meta of [
            { callOI35Missing: 1, putOI35Missing: 0, oi35Complete: true },
            { callOI35Missing: 0, putOI35Missing: 1 },
            { callOI35Missing: 0, putOI35Missing: 0, oi35Complete: false },
            { callOI35Missing: 0 }, { oi35Complete: true },
            { callOI35Missing: null, putOI35Missing: 0 },
        ]) {
            store.clear(); _resetOi35Memo();
            store.set('intrinio:options:eod', { date: '2026-10-19', tickers: {}, stale: { SPY: { date: '2026-10-16', callOI35: 100, putOI35: 50, ...meta } } });
            assert.equal(await readOi35Fallback('SPY', NOW), null);
        }
        // 기존 저장본은 완전성 미상으로 채택하되, 기준일·레코드 날짜·basis 그대로.
        for (const stale of [false, true]) {
            store.clear(); _resetOi35Memo();
            const old = { callOI35: 100, putOI35: 50 };
            store.set('intrinio:options:eod', stale
                ? { date: '2026-10-19', stale: { SPY: { ...old, date: '2026-10-16' } } }
                : { date: '2026-10-16', tickers: { SPY: old } });
            const v = await readOi35Fallback('SPY', NOW);
            assert.equal(v!.pcr, 0.5); assert.equal(v!.recordDate, '2026-10-16');
            assert.equal(v!.oiDate, '2026-10-15'); assert.equal(v!.basis, 'oi_near_expiries_35d_eod');
        }
    } finally { (Date as any).now = realNow; dynamoRow = null; }
});

// ━━━ Flow OPI ━━━
t('OPI: 결측(null·"")은 null — 0.0 BEARISH 가 아니다 · 숫자 0 은 실측(95) · 식은 예전 그대로(NVDA 0.73 → 64)', () => {
    const old = (p: any) => Math.max(10, Math.min(95, Math.round(100 - p * 50)));
    assert.equal(opiFromOiPcr(null), null);
    assert.equal(opiFromOiPcr(undefined), null);
    assert.equal(opiFromOiPcr(''), null);       // 옛 식: "" * 50 = 0 → 95(허위 강한 상방)
    assert.equal(old(''), 95);
    assert.equal(opiFromOiPcr(0), 95);
    for (const p of [0.73, 0.77, 0.67, 1.79, 3.07, 1.1]) assert.equal(opiFromOiPcr(p), old(p), String(p));
    assert.equal(opiFromOiPcr(0.73), 64);
});
t('OPI 결측이면 종합 점수 몫 0 · 방향 빌리는 요인(스퀴즈·UOA·0DTE) 0 · 확신도 극단 아님 · 판정 «—»', () => {
    assert.equal(opiScoreOf(null), 0);
    assert.equal(opiSigned(null, 15, 'squeeze'), 0);
    assert.equal(opiSigned(null, 5, 'uoa'), 0);
    assert.equal(opiSigned(null, 3, 'zdte'), 0);
    assert.equal(opiExtreme(null), false);
    assert.equal(opiGaugeStatus(null), '—');
    // 옛 화면(opi=0): 몫 −25, 부호 전부 하방, 극단(HIGH CONVICTION), BEARISH
    assert.equal(opiScoreOf(0), -25);
    assert.equal(opiSigned(0, 15, 'squeeze'), -15);
    assert.equal(opiExtreme(0), true);
    assert.equal(opiGaugeStatus(0), 'BEARISH');
    // 값이 있으면 예전과 같다
    assert.equal(opiScoreOf(64), 7);
    assert.equal(opiSigned(64, 15, 'squeeze'), 15);
    assert.equal(opiSigned(50, 15, 'squeeze'), -15);
    assert.equal(opiSigned(50, 5, 'uoa'), 5);
    assert.equal(opiGaugeStatus(64), 'BULLISH');
});
t('Flow 배선: OPI 는 파생값(useState(0) 없음) · 종목 전환 때 비움 · 결측 회차엔 직전 값 · OPI 칸만 «—» · AI 는 OPI 복구 때 다시 부른다', () => {
    const f = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/flow/page.tsx'), 'utf8');
    assert.equal(/const \[opi, setOpi\] = useState\(0\)/.test(f), false);
    assert.match(f, /const opiPick = pickOiPcrReading\(flowOiPcr, null, oiRound\);\n\s+const opi: number \| null = opiFromOiPcr\(opiPick\?\.pcr\);/);
    assert.match(f, /setOiAll\(null\);\n\s+setFlowOiPcr\(null\);\n\s+setOiRound\(0\);/);
    assert.match(f, /const measuredPcr = measuredOiPcr\(flow\.oiPcr\);\n\s+if \(measuredPcr != null\) setFlowOiPcr\(\(prev\) => newerReading\(prev, \{ pcr: measuredPcr, round, prev: /);
    assert.match(f, /setOiAll\(\(prev\) => newerReading\(prev, \{ callOI: j\.callOI, putOI: j\.putOI, pcr: measuredOiPcr\(j\.pcr\), round, prev: /);
    assert.match(f, /\{opi == null \? '—' : opi\.toFixed\(1\)\}/);
    assert.match(f, /\{ label: 'OPI', value: opi == null \? '—' : signed\(Math\.round\(opiScore\)\) \}/);
    assert.match(f, /\}, \[ticker, effectiveSession, locale, aiReady, opiKnown\]\);/);
    assert.match(f, /const convictionLabel = Math\.abs\(compositeScore\) >= 45 \|\| opiExtreme\(opi\)/);
    // 라벨 문구는 그대로
    for (const label of ["opiGauge: '옵션 압박 지수 (OPI)'", 'OPI SCORE', "flowCopy.highConviction"]) assert.ok(f.includes(label), label);
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
