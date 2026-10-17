'use strict';
// 하네스 실시간 표시 시험: 최근 15분 안 동작 노드만 «동작 중»·흐름선, 실패 노드는 흐름 없음.
const assert = require('assert');
const H = require('./v2-harness');
const now = Date.parse('2026-10-17T13:30:00Z');
const iso = (minAgo) => new Date(now - minAgo * 60e3).toISOString();
const html = H.renderHarness({ nowMs: now, nodes: [
    { id: 'coordinator', status: 'ok', lastAt: iso(2) },
    { id: 'codex-queue', status: 'ok', lastAt: iso(5) },
    { id: 'codex-write', status: 'ok', lastAt: iso(40) },
    { id: 'gate', status: 'fail', lastAt: iso(1) },
], today: {} });
assert(html.includes('data-harness-live="coordinator:codex-queue"'), '동작 중 노드로 들어가는 선은 흐른다');
assert(!html.includes('data-harness-live="codex-queue:codex-write"'), '40분 전 노드로는 흐르지 않는다');
assert(!/data-harness-live="[^"]*:gate"/.test(html), '실패 노드로는 흐르지 않는다');
assert(html.includes('지금 동작 중 <b>2</b>곳'), '요약 줄: 동작 중 2곳');
assert(html.includes('실패·멈춤 <b class="hh-bad">1</b>곳'), '요약 줄: 실패 1곳');
assert(html.includes('● 동작 중') && html.includes('2분 전'), '노드에 동작 중·경과 표시');
assert(html.includes('prefers-reduced-motion'), '움직임 줄이기 설정 존중');
console.log('하네스 실시간 시험 7개 통과');
