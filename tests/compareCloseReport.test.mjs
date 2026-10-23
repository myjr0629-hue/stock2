import assert from 'node:assert/strict';
import { options, recentReports, archivedInput, comparisonMarkdown, redisReader, redact, modelRunner } from '../scripts/compare-close-report.mjs';
const DAY = '2026-10-22';
assert.equal(options(['--count', '20', '--runs', '3']).runs, 3);
for (const args of [['--count', '0'], ['--end', '2026-02-30'], ['--runs', '99'], ['--bad']]) assert.throws(() => options(args));
const cash = symbol => ({ symbol, sessionDate: DAY, price: 100, changePct: -2 });
const record = { date: DAY, version: 'v3', brief: { date: DAY, generatedAt: '2026-10-22T21:00:00Z', structured: { marketOverview: { summary: { ko: '한국어', en: 'English', ja: '日本語' } } }, sectorInputs: [{ sessionDate: DAY, sector: 'M7' }, { sessionDate: '2026-10-21', sector: 'OLD' }], reportEvidence: { regularClose: { spx: cash('^GSPC'), nasdaq: cash('^IXIC') }, readings: { vix: { price: 18, changePct: 1, marketTime: '2026-10-23T15:00:00Z' } }, news: [], events: [] } } };
const keys = [];
const records = await recentReports(async key => { keys.push(key); return key === `postmarket:cross-brief-v3:${DAY}` ? JSON.stringify(record.brief) : null; }, { count: 2, days: 2, end: '2026-10-23' });
assert.equal(records.length, 1);
assert.equal(keys.length, 6);
assert.equal(keys.some(k => /latest|yahoo|snapshot/.test(k)), false);
const input = archivedInput(record);
assert.ok(input.prompt.includes('SESSION CONSISTENCY'));
assert.equal(input.evidence.readings.vix, null);
assert.equal(input.prompt.includes('"sector": "OLD"'), false);
assert.equal(archivedInput({ ...record, brief: { ...record.brief, reportEvidence: undefined } }), null);
assert.equal(archivedInput({ ...record, date: '2026-10-23' }), null);
const md = comparisonMarkdown(record, record.brief.structured, 'ok');
for (const loc of ['ko', 'en', 'ja']) assert.ok(md.includes(`| ${loc} |`));
assert.ok(md.includes('한국어') && md.includes('English') && md.includes('日本語'));
assert.equal(redact('test-sentinel-value', { TEST_TOKEN: 'test-sentinel-value' }), '[REDACTED]');
const requests = [];
const read = redisReader({ UPSTASH_REDIS_REST_URL: 'https://example.invalid', UPSTASH_REDIS_REST_READ_ONLY_TOKEN: 'test-value' }, async (url, opts) => { requests.push({ url, opts }); return { ok: true, json: async () => ({ result: null }) }; });
await read(`postmarket:cross-brief-v3:${DAY}`);
assert.equal(requests.length, 1);
assert.ok(requests[0].url.includes('/get/'));
assert.equal(requests[0].opts.method, undefined, 'HTTP 기본 GET');
await assert.rejects(read('arbitrary:key'));
assert.throws(() => redisReader({ UPSTASH_REDIS_REST_URL: 'https://example.invalid', UPSTASH_REDIS_REST_TOKEN: 'write-token' }), '쓰기 토큰으로 대체하지 않음');
console.log('ok - 저장 키 GET만, 결측 재생 거절, 최신 입력 대체 없음, ko/en/ja 표·비밀값 가림');

// Run the real comparison adapter with a fake provider. No SDK/network calls or production writes.
const { default: Module } = await import('node:module');
const originalLoad = Module._load;
const modelReads = [];
let ladderCalls = 0;
Module._load = function(id, ...args) {
    if (id === '../src/lib/ai/llmLadder.ts') return { runLadder: async (req, legacy, deps) => {
        ladderCalls++;
        assert.equal(req.purpose, 'CrossSector');
        await deps.store.get('llm:ladder:off');
        await deps.store.setEx('llm:test', 'local', 60);
        assert.equal(await deps.store.get('llm:test'), 'local');
        await deps.store.incrByFloat('llm:cost:test', 0.1, 60);
        await deps.store.rpush('llm:log:test', 'local', 60);
        return { text: JSON.stringify(record.brief.structured), provider: 'a55', model: 'fake-model', costUsd: 0, trail: ['a55:ok'] };
    } };
    if (id === '../src/services/bedrockClient.ts') return { callBedrock: () => { throw new Error('실모델 호출 금지'); } };
    return originalLoad.call(this, id, ...args);
};
try {
    const generate = await modelRunner(async key => { modelReads.push(key); return null; });
    const result = await generate(input);
    assert.equal(ladderCalls, 1);
    assert.deepEqual(modelReads, ['llm:ladder:off']);
    assert.equal(result.structured.marketOverview.summary.ko, '한국어');
    assert.ok(result.status.includes('guard=false'), '형식 미달 결과도 탈락 사유와 비교표에 남김');
} finally { Module._load = originalLoad; }
console.log('ok - 기존 사다리 어댑터 재사용, 원장·캡처·서킷은 로컬 메모리만 변경');

const proxyRequests = [];
const proxyRead = redisReader({ UPSTASH_REDIS_REST_URL: 'https://upstash.invalid', UPSTASH_REDIS_REST_READ_ONLY_TOKEN: 'test-read', EC2_REDIS_PROXY_URL: 'https://proxy.invalid', EC2_REDIS_PROXY_KEY: 'test-proxy' }, async (url, opts) => { proxyRequests.push({ url, opts }); return { ok: true, json: async () => ({ result: null }) }; });
await proxyRead(`postmarket:cross-brief-v4:${DAY}`);
await proxyRead('llm:ladder:off');
assert.ok(proxyRequests[0].url.startsWith('https://proxy.invalid/get?key='));
assert.ok(proxyRequests[1].url.startsWith('https://upstash.invalid/get/'));
assert.ok(proxyRequests.every(r => r.opts.method === undefined));
console.log('ok - 운영 보고서 EC2 조회·사다리 Upstash 조회 분리, 모두 GET');
