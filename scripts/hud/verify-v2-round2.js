'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const S = require('./v2-sources');
const SRC = require('./sources');
const H = require('./v2-harness');
const now = Date.parse('2026-10-17T03:30:00Z');
function fixture(fn) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-round2-'));
    const o = { home, work: path.join(home, 'work'), root: home, now, run: () => '' };
    const write = (name, value, at = now) => { const file = path.join(home, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); fs.utimesSync(file, at / 1000, at / 1000); return file; };
    try { return fn(o, write); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
function screen() {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), nodes = {}, calls = [];
    const el = () => ({ innerHTML: '', textContent: '', dataset: {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, querySelector() {}, classList: { toggle() {} } });
    for (const m of html.matchAll(/id="([^"]+)"/g)) nodes[m[1]] = el();
    const c = { document: { querySelector: s => nodes[s.slice(1)], querySelectorAll: () => [], addEventListener() {} }, location: { hash: '' }, history: { replaceState() {} }, URL, Date, Intl, setInterval() {}, addEventListener() {}, HUDHarness: H, fetch: (url, options) => { calls.push({ url, options }); return new Promise(() => {}); } };
    c.window = c; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(__dirname, 'v2-costs.js'), 'utf8'), c);
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if (!/src=/.test(m[1])) vm.runInContext(m[2], c);
    return { c, nodes, calls, render: s => { c.s = { now: new Date(now).toISOString(), ...s }; vm.runInContext('for (const fn of Object.values(RENDERERS)) fn(s); HUDV2.paint(s)', c); } };
}
test('A① 병합 가능은 오늘 관문 통과', () => fixture((o, w) => {
    w('work/codex/out/gate-example.md', '병합 가능\n본문');
    const r = S.loadIntegrityV2(o); assert.equal(r.gates[0].status, 'passed'); assert.equal(r.gateSummaryToday.passed, 1);
}));
test('A② 채널 전용 gate를 상태에 반영', () => fixture((o, w) => {
    const file = w('plan.md', ''), channelsFile = w('channels.json', [{ id: 'sample', enabled: true, gate: '대표 확인' }]);
    assert.equal(S.loadPlatforms({ ...o, file, channelsFile }).items[0].status, '게이트');
}));
test('A③ 과거 partial 보존·원천 없는 날짜는 판독 대기', () => {
    const ui = screen(); ui.render({ v2: { performance: { installs: { date: '2026-10-17', days: [{ date: '2026-10-16', ios: 1, android: 2, partial: true }, { date: '2026-10-15', ios: null, android: null }] } } } });
    const html = ui.nodes['dashboard-content'].innerHTML;
    assert.match(html, /2026-10-16<\/td>.*?<td>진행 중<\/td>/); assert.match(html, /2026-10-15<\/td>.*?<td>판독 대기<\/td>/);
});
test('A④ 미완료 제목 보존·명시적 완료만 제외', () => fixture((o, w) => {
    const file = w('todo.md', '# 대표 2026-10-17\n## 미완료\n- [ ] 남은 일\n## ✅ 끝난 일\n내용\n## 작업 (완료)\n내용\n## [x] 닫힌 일\n내용');
    assert.deepEqual(S.loadTodos({ ...o, file }).items.map(r => r.title), ['미완료']);
}));
test('B 운영 조작부·광고 국가 상세·앱 AI 비용 복원', () => {
    const ui = screen(); ui.render({ state: { paused: true, noPublish: true }, live: { ads: { yesterday: { nyDate: '2026-10-16', countries: [{ code: 'JP', spend: 3, impr: 100, taps: 5, installs: 1, cpa: 3 }], total: { spend: 3, impr: 100, taps: 5, installs: 1, cpa: 3 } } }, aiCredit: { spentUsd: 21, targetUsd: 100, capUsd: 120, last24hUsd: 2, level: 3 } } });
    assert.match(ui.nodes['dashboard-content'].innerHTML, /운영 조작/);
    const costs = ui.nodes['credits-content'].innerHTML; for (const label of ['광고 지출 상세', '일본', '노출', '클릭', '설치당 비용', '앱 인공지능 비용', '최근 24시간']) assert.ok(costs.includes(label), label);
    assert.equal(typeof ui.c.control, 'function'); vm.runInContext('control({paused:false})', ui.c);
    const call = ui.calls.find(c => c.url === '/api/control'); assert.equal(call.options.method, 'POST'); assert.equal(call.options.body, '{"paused":false}');
});
test('C RC·리딤 연결·기간·null 의미 보존', () => fixture((o, w) => {
    const rc = { readAt: now, file: '개요 원천', period: '최근 28일', metrics: { 'Active Subscriptions': { value: 3 }, 'Active Trials': { value: 29 }, 'New Customers': { value: 214 }, MRR: { value: 21, display: '$21' }, Revenue: { value: 21, display: '$21' } } };
    const redeem = { readAt: now, file: '장부 집계', total: { remaining: 12, today: 2, confirmedUsed: null }, platforms: { ios: { confirmedUsed: 4, remaining: 5 }, android: { confirmedUsed: null, remaining: 7 } } };
    const perf = S.loadPerformance({ ...o, rcOverview: rc, redeemSummary: redeem });
    assert.equal(perf.paid.active, 3); assert.equal(perf.paid.trials, 29); assert.equal(perf.paid.conversion, null); assert.equal(perf.registrations.overview, 214); assert.equal(perf.registrations.week, null); assert.equal(perf.redeem.remaining, 12); assert.equal(perf.redeem.today, null);
    const ui = screen(); ui.render({ v2: { performance: perf } }); const html = ui.nodes['dashboard-content'].innerHTML;
    for (const text of ['유료 구독 활성', '체험 중', '신규 고객(28일)', '최근 28일', '오늘 배포', '수동 확인']) assert.ok(html.includes(text), text);
    const file = w('performance.json', { paid: { active: 0 } }); assert.equal(S.loadPerformance({ ...o, file, rcOverview: rc }).paid.active, 0);
}));
test('C 개요 로더에서 관측한 기간을 전달', () => fixture((o, w) => {
    const file = w('rc.json', { schemaVersion: 1, readAt: new Date(now).toISOString(), period: 'Last 28 days', metrics: { 'New Customers': { value: 214 } } });
    assert.equal(SRC.loadRcOverview({ file, now }).period, 'Last 28 days');
}));
test('D 가로 SVG 전체 연결·모바일 세로·대기는 전체 실패 아님', () => {
    const g = H.loadHarness({ evidence: { ceo: { status: 'ok', at: now } } }); assert.notEqual(g.status, 'fail');
    const html = H.renderHarness(g); assert.match(html, /harness-wide/); assert.match(html, /harness-mobile/); assert.match(html, /data-harness-edge="ceo:coordinator"/); assert.match(html, /marker-end=/);
});
test('D·E 원천별 동작 시각·프로세스·상주 종료 상태 연결', () => fixture((o, w) => {
    w('Documents/Project/recipt/대표-할일.md', '# 대표'); w('work/hud/feeds/mail.json', { updatedAt: new Date(now - 1000).toISOString(), items: [] });
    w('work/codex/LEDGER.tsv', '10-17 10:00\t10:01\t샘플\twrite\trc=0\tmodel=gpt-6.1-sol\n10-17 10:02\t10:03\t샘플\tread\trc=0\tmodel=gpt-6-astra\n');
    w('work/codex/queue/QUEUE-LOG.tsv', '10-17 12:10\tdone fixture rc=0'); w('work/codex/out/nightly.daily.log', '완료');
    w('signum-ego-io/2026-10-17/pub/day-sched-slots.log', '[2026-10-17 12:20:00] 게시 완료');
    w('signum-ego-io/example.json', '{}'); w('Library/Logs/signum-hud-refresh.log', '완료');
    const transcriptRoot = path.join(o.home, 'transcripts'); w('transcripts/session.jsonl', JSON.stringify({ timestamp: new Date(now - 2000).toISOString(), message: { content: [{ type: 'tool_use', name: 'Agent' }] } }));
    const run = (file) => file.endsWith('pgrep') ? '123' : file.endsWith('launchctl') ? '-\t0\tcom.signumhq.hud-refresh' : file.endsWith('git') ? '2026-10-17T10:10:00+09:00\tMerge sample' : '';
    const r = S.loadV2({ ...o, run, transcriptRoot, session: { file: 'session.jsonl' } });
    const get = id => r.harness.nodes.find(n => n.id === id);
    for (const id of ['ceo', 'claude-subagents', 'ego', 'gmail', 'codex-write', 'codex-read', 'merge-deploy', 'day-sched2', 'daily-runner', 'launchd', 'hud-refresh']) assert.ok(get(id).lastAt, id);
    assert.equal(get('merge-deploy').status, 'pending'); assert.equal(get('ego').status, 'ok');
    assert.ok(r.agents.items.find(r => r.id === 'hud-refresh').lastAt); assert.equal(r.agents.items.find(r => r.id === 'hud-refresh').lastExitStatus, 0);
}));
test('F 지난 rc.log 합산·같은 날짜 최신 판독 우선·partial 유지', () => fixture((o, w) => {
    const chart = (dates, n) => JSON.stringify({ dates: dates.map(d => `Oct ${d.slice(-2)} '26`), labels: ['Total', 'iOS', 'Android'], rows: [dates.map(() => String(n)), dates.map(() => String(n)), dates.map(() => '0')] });
    w('work/2026-10-16/report/rc.log', '읽음: 2026-10-16T03:00:00Z\n플랫폼별: ' + chart(['2026-10-04', '2026-10-16'], 8));
    w('work/2026-10-17/report/rc.log', '읽음: 2026-10-17T03:00:00Z\n플랫폼별: ' + chart(['2026-10-16', '2026-10-17'], 12));
    const installs = SRC.loadInstalls({ work: o.work, now }); const p = S.loadPerformance({ ...o, installs });
    assert.equal(p.installs.days[0].date, '2026-10-04'); assert.equal(p.installs.days[0].ios, 8); assert.equal(p.installs.days.find(r => r.date === '2026-10-16').ios, 12); assert.equal(p.installs.days.at(-1).partial, true);
}));
test('G 본문 날짜·시간 우선·없으면 파일 머리 날짜·최신순', () => fixture((o, w) => {
    const file = w('todos.md', '# 대표 할 일 2026-10-17\n## 나중\n- [ ] (10/17 10시) 확인\n## 먼저\n- [ ] (10/17 12시) 확인\n## 예전\n- [ ] (10/16 15시) 확인\n## 날짜 없음\n- [ ] 확인');
    const r = S.loadTodos({ ...o, file }).items; assert.deepEqual(r.map(x => x.title), ['먼저', '나중', '날짜 없음', '예전']); assert.equal(r.at(-1).date, '2026-10-16');
}));
test('H 메일 제목 subject·아래 요약과 조치', () => {
    const ui = screen(); ui.render({ v2: { mail: { items: [{ subject: '실제 제목', summary: '내용 요약', action: '확인 필요' }] } } });
    assert.match(ui.nodes['mail-content'].innerHTML, /class="mail-summary">실제 제목<\/div>/); assert.match(ui.nodes['mail-content'].innerHTML, /요약 · 내용 요약/); assert.match(ui.nodes['mail-content'].innerHTML, /조치 · 확인 필요/);
});
test('D 큰 세션에서도 마지막 Agent 호출 시각 보존', () => fixture((o, w) => {
    const file = 'transcripts/session.jsonl', at = new Date(now - 2000).toISOString();
    w(file, JSON.stringify({ timestamp: at, message: { content: [{ type: 'tool_use', name: 'Agent' }] } }) + '\n' + (JSON.stringify({ type: 'progress', text: '샘플'.repeat(500) }) + '\n').repeat(1000));
    const options = { ...o, transcriptRoot: path.join(o.home, 'transcripts'), session: { file: 'session.jsonl' } };
    assert.equal(S.loadV2(options).harness.nodes.find(n => n.id === 'claude-subagents').lastAt, at);
}));
test('F 손상된 과거 차트가 정상 최신 설치를 막지 않음', () => fixture((o, w) => {
    w('work/2026-10-15/report/rc.log', '플랫폼별: {"dates":["Oct 15 \'26"],"labels":{},"rows":[["3"]]}');
    w('work/2026-10-17/report/rc.log', '읽음: 2026-10-17T03:00:00Z\n플랫폼별: {"dates":["Oct 17 \'26"],"labels":["Total","iOS","Android"],"rows":[["3"],["2"],["1"]]}');
    assert.equal(SRC.loadInstalls({ work: o.work, now }).days[0].total, 3);
}));
