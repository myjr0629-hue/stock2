#!/usr/bin/env node
'use strict';
// 고정 입력만 사용한다. 운영 원천·브라우저·외부 서비스에 접근하지 않는다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const H = require('./v2-harness');
let count = 0;
function test(name, fn) { fn(); count++; console.log('통과 · ' + name); }
const at = '2026-10-17T03:00:00.000Z';
const get = (graph, id) => graph.nodes.find((n) => n.id === id);

test('없는 원천: 모든 노드는 대기이고 마지막 동작은 없음', () => {
    for (const value of [undefined, null, {}, { agents: { items: '깨짐' } }]) {
        const graph = H.loadHarness(value);
        assert.equal(graph.nodes.length, 25);
        assert(graph.nodes.every((n) => n.status === 'pending' && n.lastAt === null));
        assert.equal(graph.status, 'pending');
    }
});
test('에이전트 실측: 실행·실패·판독 대기와 실제 마지막 시각', () => {
    const graph = H.loadHarness({ readAt: at, agents: { items: [
        { id: 'coordinator', status: 'running', lastAt: at, source: '샘플 전사' },
        { id: 'queue-runner', status: 'stopped', lastAt: at },
        { id: 'day-sched2', status: 'unknown', readAt: at },
        { id: 'claude-subagent-1', status: 'completed', lastAt: '2026-10-17T02:00:00Z' },
        { id: 'claude-subagent-2', status: 'failed', lastAt: at },
    ] } });
    assert.equal(get(graph, 'coordinator').status, 'ok');
    assert.equal(get(graph, 'coordinator').lastAt, at);
    assert.equal(get(graph, 'codex-queue').status, 'fail');
    assert.equal(get(graph, 'claude-subagents').status, 'fail');
    assert.equal(get(graph, 'day-sched2').lastAt, null);
    assert.equal(get(graph, 'launchd').status, 'pending');
    assert.deepEqual(graph.sources, ['샘플 전사']);
});
test('도구 설치·부모 실행·병합 기록은 자식 작업 및 배포 성공 증거가 아님', () => {
    const graph = H.loadHarness({ agents: { rows: [
        { id: 'codex', status: 'ok', model: 'gpt-6.1-sol', lastAt: at },
        { id: 'day-sched2', status: 'running', lastAt: at },
    ] }, merges: [{ at, title: '샘플 병합' }] });
    for (const id of ['codex-write', 'codex-read', 'merge-deploy', 'channel-x', 'publish-ledger']) {
        assert.equal(get(graph, id).status, 'pending');
        assert.equal(get(graph, id).lastAt, null);
    }
    const mixed = H.loadHarness({ agents: { items: [{ id: 'codex', model: 'gpt-6.1-sol · gpt-6-astra', status: 'running', lastAt: at }] } });
    assert.equal(get(mixed, 'codex-write').status, 'pending');
    assert.equal(get(mixed, 'codex-read').status, 'pending');
});
test('게시·무결성 원천: 마지막 작업시각을 보존하고 현재 채널 상태를 추정하지 않음', () => {
    const graph = H.loadHarness({ publishing: { state: 'ok', source: '샘플 게시 원장', items: [
        { channel: 'x_post', at }, { channel: 'medium_us', at: '2026-10-16T03:00:00Z' },
    ] }, integrity: { source: '샘플 무결성', latest: { at: Date.parse(at), state: 'fail', errors: 1 } } });
    assert.equal(get(graph, 'channel-x').lastAt, at);
    assert.equal(get(graph, 'channel-x').status, 'pending');
    assert.equal(get(graph, 'channel-bluesky').lastAt, null);
    assert.equal(get(graph, 'publish-ledger').status, 'ok');
    assert.equal(get(graph, 'integrity-results').status, 'fail');
    assert.equal(get(graph, 'integrity-results').lastAt, at);
});
test('명시적 실행 모델·관문 결과·노드별 원천을 결합', () => {
    const graph = H.loadHarness({ agents: { items: [{ id: 'codex', status: 'running', model: 'gpt-6.1-sol', lastAt: at }] },
        gates: [{ status: 'passed', at }], deployment: { status: 'failed', at },
        evidence: { gmail: { status: 'completed', at, source: '샘플 메일 피드' },
            launchd: { status: 'unknown', at: '잘못된 시각' }, 'unknown-node': { status: 'ok', at } } });
    assert.equal(get(graph, 'codex-write').status, 'ok');
    assert.equal(get(graph, 'codex-read').status, 'pending');
    assert.equal(get(graph, 'gate').status, 'ok');
    assert.equal(get(graph, 'merge-deploy').status, 'fail');
    assert.equal(get(graph, 'gmail').status, 'ok');
    assert.equal(get(graph, 'launchd').lastAt, null);
    assert.equal(graph.nodes.length, 25);
});
test('구조 연결: 운영 지휘·다섯 채널·세 감시·네 보관처', () => {
    const graph = H.loadHarness();
    const edge = (from, to) => graph.edges.some((e) => e.from === from && e.to === to);
    for (const id of ['claude-subagents', 'codex-queue', 'day-sched2', 'launchd', 'daily-runner']) assert(edge('coordinator', id));
    assert.equal(graph.edges.filter((e) => e.from === 'day-sched2' && e.to.startsWith('channel-')).length, 5);
    assert.equal(graph.edges.filter((e) => e.from === 'launchd').length, 3);
    assert.equal(graph.edges.filter((e) => e.from === 'daily-runner').length, 4);
    assert(edge('day-sched2', 'publish-ledger'));
    assert(edge('codex-read', 'codex-out'));
    assert(edge('integrity-watch', 'integrity-results'));
    assert(edge('hud-refresh', 'hud-results'));
    for (const e of graph.edges) assert(get(graph, e.from) && get(graph, e.to));
});
test('SVG: 모든 노드·세 상태·한국 시각과 모바일 단일열', () => {
    const graph = H.loadHarness({ evidence: { coordinator: { status: 'ok', at }, ego: { status: 'fail', at } } });
    const html = H.renderHarness(graph);
    for (const n of graph.nodes) assert(html.includes('data-harness-node="' + n.id + '"'));
    assert.equal((html.match(/<svg /g) || []).length, 2);
    assert.equal((html.match(/role="img"/g) || []).length, 2);
    assert(html.includes('10-17 12:00 한국'));
    for (const color of ['#238454', '#b77a0a', '#cc4141']) assert(html.includes(color));
    assert(html.includes('@media(max-width:640px)'));
    assert(html.includes('grid-template-columns:minmax(0,1fr)'));
    assert(!/<script|https?:\/\//i.test(html.replace(/xmlns="http:\/\/www.w3.org\/2000\/svg"/g, '')));
});
test('SVG 주입 차단·잘못된 구조에도 렌더링 지속', () => {
    const html = H.renderHarness({ nodes: [{ id: 'coordinator', label: '<script>실행</script>', detail: '\" onload=\"실행', status: '<오류>', lastAt: '<시각>' }] });
    assert(!html.includes('<script>'));
    assert(html.includes('&lt;script&gt;실행&lt;/script&gt;'));
    assert(html.includes('&quot; onload=&quot;실행'));
    for (const value of [null, { nodes: null }, { nodes: [{ id: { toString: null }, label: {} }] }]) assert(H.renderHarness(value).includes('<svg'));
    assert.doesNotThrow(() => H.loadHarness({ readAt: { toString: null }, evidence: { ego: { at: { toString: null } } } }));
});
test('브라우저 전역과 CommonJS는 동일 순수 계약', () => {
    const code = fs.readFileSync(path.join(__dirname, 'v2-harness.js'), 'utf8');
    const sandbox = {};
    vm.createContext(sandbox);
    new vm.Script(code).runInContext(sandbox, { timeout: 1000 });
    assert.equal(typeof sandbox.HUDHarness.loadHarness, 'function');
    assert.equal(typeof sandbox.HUDHarness.renderHarness, 'function');
    assert.equal(JSON.stringify(sandbox.HUDHarness.loadHarness({ readAt: at })), JSON.stringify(H.loadHarness({ readAt: at })));
});
console.log('하네스 시험 ' + count + '개 통과');
