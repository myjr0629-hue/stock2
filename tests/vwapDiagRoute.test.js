// 실제 라우트와 기존 인증을 메모리에서 실행. 환경파일·외부 호출 없음.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function load(file, mocks, env) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, { exports, URL, Date, process: { env }, require: id => {
        assert.ok(Object.hasOwn(mocks, id), `모형 없는 의존성: ${id}`); return mocks[id];
    } });
    return exports;
}

function harness(env = { NODE_ENV: 'production', CRON_SECRET: 'test-only-auth' }, fail = false) {
    let reads = 0;
    const auth = load('src/lib/ai/adminAuth.ts', { crypto: require('node:crypto') }, env);
    const route = load('src/app/api/internal/vwap-diag/route.ts', {
        'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
        '@/lib/ai/adminAuth': auth,
        '@/lib/marketCalendar': { etDateOf: () => '2026-10-23' },
        '@/services/realtimeSessionVwap': { readRealtimeSessionVwapDiagnostics: async (ticker, date) => {
            reads++;
            if (fail) throw Error('원천 오류 내용 노출 금지');
            return { ticker, date, fmpKeyPresent: true, observationState: 'not_observed' };
        } },
    }, env);
    return { reads: () => reads, get: (query = '?t=ibm', headers = {}) => route.GET({
        url: `http://offline/api/internal/vwap-diag${query}`, headers: new Headers(headers),
    }) };
}

for (const [label, env, query, headers] of [
    ['운영 인증 미설정', { NODE_ENV: 'production' }, '?t=IBM', {}],
    ['인증 누락', undefined, '?t=IBM', {}],
    ['잘못된 인증', undefined, '?t=IBM', { authorization: 'Bearer test-only-wrong' }],
    ['쿼리 인증 불허', undefined, '?t=IBM&secret=test-only-auth', {}],
]) test(`내부 진단 인증: ${label}`, async () => {
    const h = harness(env);
    const response = await h.get(query, headers);
    assert.equal(response.status, 401); assert.equal(h.reads(), 0);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
});

for (const header of [{ authorization: 'Bearer test-only-auth' }, { 'x-cron-secret': 'test-only-auth' }]) {
    test(`기존 관리자 헤더 인증·종목 정규화·비밀 미반환: ${Object.keys(header)[0]}`, async () => {
        const h = harness();
        const response = await h.get('?t=ibm', header);
        assert.equal(response.status, 200); assert.equal(h.reads(), 1);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        const text = await response.text();
        assert.equal(JSON.parse(text).ticker, 'IBM');
        assert.ok(!text.includes('test-only-auth')); assert.ok(!text.includes('CRON_SECRET'));
    });
}

test('잘못된 종목은 저장소 조회 전에 거절하며 입력을 반사하지 않음', async () => {
    for (const query of ['', '?t=IBM%2Fbad', '?t=ABCDEFGHIJKLMNOP', '?t=%3Cscript%3E']) {
        const h = harness();
        const response = await h.get(query, { 'x-cron-secret': 'test-only-auth' });
        assert.equal(response.status, 400); assert.equal(h.reads(), 0);
        assert.deepEqual(await response.json(), { error: 'Invalid ticker' });
    }
});

test('진단 예외도 오류 객체 없이 고정된 503 응답', async () => {
    const h = harness(undefined, true);
    const response = await h.get('?t=IBM', { 'x-cron-secret': 'test-only-auth' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Diagnostic unavailable' });
});
