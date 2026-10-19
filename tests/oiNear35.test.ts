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
import { measuredOiPcr, opiFromOiPcr, opiScoreOf, opiSigned, opiExtreme, opiGaugeStatus, pickOiPcr, OI_PCR_KEEP_ROUNDS } from '../src/lib/app/flowOpi';
import { oiPcrAllExpiries, oiRowHasQuantities } from '../src/lib/app/intelOptionsBasis';
import { buildChainOi35, readOi35Fallback, readChainOi35, CHAIN_OI35_KEY, CHAIN_OI35_NEG_KEY, chainRowOf, _resetOi35Memo, type ChainBuildDeps } from '../src/services/oiNear35Fallback';

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
t('관문 10200204 ②: 음수 OI(−200)는 합산하지 않는다 — 결측이 한쪽 10% 를 넘으면 값 없음(P/C −1 재현 입력)', () => {
    const rows = [row('call', '2026-10-23', 100), row('put', '2026-10-23', 100), row('put', '2026-10-23', -200)];
    const r = sumChainOi35(rows, ['2026-10-23'], '2026-10-19');
    assert.equal(r.ok, false);
    assert.match((r as any).reason, /^missing-oi:put:1\/2$/);
});
t('관문 10200222 ①: 풋 OI "" 는 0 이 아니다 — P/C 0(→ OPI 95)이 나오지 않는다', () => {
    const rows = [row('call', '2026-10-23', 100), row('put', '2026-10-23', '')];
    const r = sumChainOi35(rows, ['2026-10-23'], '2026-10-19');
    assert.equal(r.ok, false);
    assert.match((r as any).reason, /^missing-oi:put:1\/1$/);
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
/** 픽스처(행사가별 콜·풋 OI) → 공급사 EOD 체인 행 모양. oiMissing 만큼은 OI null 행(그날 상장 — OCC 미공표)으로 둔다 */
function vendorRows(exp: string): any[] {
    const x = FX.expiries[exp];
    const out: any[] = [];
    let missLeft = x.oiMissing || 0;
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
    assert.equal(saved.missingOi, 238);   // 10/29 그날 상장 계약(OCC OI 미공표) — 5.5%
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
t('읽기 순서: 옵션 EOD 35일 합계가 있으면 그것 → 없으면 체인 저장본 · 어제 창(anchor 10/16)·옛 레코드 저장본은 쓰지 않는다', async () => {
    store.clear(); _resetOi35Memo();
    const realNow = Date.now; (Date as any).now = () => NOW;
    try {
        await buildChainOi35('SPY', spyDeps());
        const chain = await readOi35Fallback('SPY', NOW);
        assert.equal(chain!.basis, 'oi_near_expiries_35d_chain');
        assert.equal(chain!.pcr, 3.07);
        assert.equal(chain!.oiDate, '2026-10-15');
        _resetOi35Memo();
        store.set('intrinio:options:eod', { date: '2026-10-16', tickers: { SPY: { callOI35: 1000, putOI35: 2000 } } });
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
    assert.match(f, /const opi: number \| null = opiFromOiPcr\(pickOiPcr\(flowOiPcr, oiAll, oiRound\)\);/);
    assert.match(f, /setOiAll\(null\);\n\s+setFlowOiPcr\(null\);\n\s+setOiRound\(0\);/);
    assert.match(f, /const measuredPcr = measuredOiPcr\(flow\.oiPcr\);\n\s+if \(measuredPcr != null\) setFlowOiPcr\(\{ pcr: measuredPcr, round \}\);/);
    assert.match(f, /setOiAll\(\{ callOI: j\.callOI, putOI: j\.putOI, pcr: measuredOiPcr\(j\.pcr\), round \}\)/);
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
