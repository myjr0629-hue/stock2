// 실제 원천 조회 함수의 오프라인 시험. 환경 파일·운영 저장소·외부 네트워크 접근 없음.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let now = Date.parse('2026-10-20T21:00:00-04:00');
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
}

function load(file, fetch) {
    const exports = {};
    const context = { exports, process: { env: {} }, Date: FixedDate, AbortController,
        setTimeout, clearTimeout, fetch,
        // 유동성의 최종 스냅샷 조회만 대체한다. 저장본 조회·캐시·실패 관측은 실제 코드를 실행한다.
        liquiditySnapshot: { ticker: {} },
        require: () => ({ isEtf: () => false }),
    };
    const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    } }).outputText;
    vm.runInNewContext(code + (file.includes('intrinioClient')
        ? '\ngetTickerSnapshot = async () => globalThis.liquiditySnapshot;' : ''), context, { filename: file });
    return { api: exports, context };
}

const body = result => ({ ok: true, json: async () => ({ result }) });
const failures = {
    'HTTP 오류': async () => ({ ok: false }),
    '네트워크 예외': async () => { throw new Error('합성 네트워크 실패'); },
    'JSON 오류': async () => ({ ok: true, json: async () => { throw new Error('합성 JSON 실패'); } }),
    '키 미적재': async () => body(null),
    '빈 객체': async () => body({}),
    '깨진 저장값': async () => body('{'),
};
let passed = 0;
const test = async (name, run) => { await run(); console.log(`통과 ${++passed}: ${name}`); };

(async () => {
    for (const [name, failure] of Object.entries(failures)) {
        await test(`유동성 ${name}: 예외 없는 반환에서도 실패 관측, 기존 호출자 반환 동일`, async () => {
            const { api, context } = load('src/services/intrinioClient.ts', failure);
            context.liquiditySnapshot = { ticker: { lastQuote: { p: 99.9, P: 100 } } };
            const legacy = await api.sessionAwareLiquidity('AAPL', null, null);
            let failed = 0;
            const observed = await api.sessionAwareLiquidity('AAPL', null, null, { onReadFailure: () => failed++ });
            assert.ok(failed > 0, '결측 저장값을 먼저 읽은 다른 호출자가 있어도 실패 신호 유지');
            assert.deepEqual(observed, legacy, '원천 실패 뒤 기존 스냅샷 폴백 결과 유지');
            assert.ok(observed.liquidityScore > 0, '폴백 성공이 원천 실패 신호를 지우지 않음');
        });
        await test(`FINRA ${name}: 기존 빈 map과 구별되는 실패 신호`, async () => {
            const { api } = load('src/services/darkPool.ts', failure);
            assert.equal(Object.keys(await api.getDarkPoolBatch(['AAPL'])).length, 0);
            assert.equal((await api.getDarkPoolBatchChecked(['AAPL'])).ok, false);
        });
    }
    await test('원천 복구 뒤 유동성 정상 갱신·정상 결측 종목은 실패 아님', async () => {
        let broken = true;
        const { api } = load('src/services/intrinioClient.ts', async () => broken ? body({})
            : body({ rows: { AAPL: { s: 85, q: 0.1 } } }));
        let failed = 0;
        await api.sessionAwareLiquidity('AAPL', null, null, { onReadFailure: () => failed++ });
        assert.equal(failed, 1);
        broken = false; now += 31 * 60_000;
        const recovered = await api.sessionAwareLiquidity('AAPL', null, null, { onReadFailure: () => failed++ });
        assert.equal(recovered.liquidityScore, 85); assert.equal(failed, 1);
        await api.sessionAwareLiquidity('UNKNOWN', null, null, { onReadFailure: () => failed++ });
        assert.equal(failed, 1);
    });
    await test('FINRA 복구 뒤 기존·checked 정상값과 원천 날짜 동일, 정상 빈 map은 성공', async () => {
        let broken = true;
        const { api } = load('src/services/darkPool.ts', async () => broken ? body(null)
            : body({ date: '2026-10-19', tickers: { AAPL: { pct: 45 } } }));
        assert.equal((await api.getDarkPoolBatchChecked(['AAPL'])).ok, false);
        broken = false;
        const checked = await api.getDarkPoolBatchChecked(['AAPL']);
        assert.equal(checked.ok, true);
        assert.deepEqual(checked.map, await api.getDarkPoolBatch(['AAPL']));
        assert.equal(checked.map.AAPL.pct, 45); assert.equal(checked.map.AAPL.date, '2026-10-19');
        const missing = await api.getDarkPoolBatchChecked(['UNKNOWN']);
        assert.equal(missing.ok, true); assert.equal(Object.keys(missing.map).length, 0);
    });
    console.log(`총 ${passed}개 원천 시험 통과. 운영 I/O 0회.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
