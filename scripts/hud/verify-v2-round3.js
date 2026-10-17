'use strict';
// 합성 파일·화면만 사용한다. 운영 계정·판독기에는 연결하지 않는다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const SRC = require('./sources');
const V = require('./v2-sources');
const H = require('./v2-harness');
const now = Date.parse('2026-10-17T03:30:00Z');
function fixture(fn) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-round3-'));
    const o = { home, root: home, work: path.join(home, 'work'), now, run: () => '' };
    const write = (name, value) => { const file = path.join(home, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return file; };
    try { return fn(o, write); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
function screen(s) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), nodes = {};
    for (const m of html.matchAll(/id="([^"]+)"/g)) nodes[m[1]] = { innerHTML: '', textContent: '', dataset: {}, addEventListener() {}, setAttribute() {}, classList: { toggle() {} } };
    const c = { document: { querySelector: s => nodes[s.slice(1)], querySelectorAll: () => [], addEventListener() {} }, location: { hash: '' }, history: { replaceState() {} }, URL, Date, Intl, setInterval() {}, addEventListener() {}, HUDHarness: H, fetch: () => new Promise(() => {}) };
    c.window = c; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(__dirname, 'v2-costs.js'), 'utf8'), c);
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if (!/src=/.test(m[1])) vm.runInContext(m[2], c);
    c.s = { now: new Date(now).toISOString(), ...s }; vm.runInContext('for (const fn of Object.values(RENDERERS)) fn(s)', c);
    return nodes;
}
const good = '읽음: 2026-10-17T03:00:00Z\n플랫폼별: ' + JSON.stringify({ dates: ["Oct 17 '26"], labels: ['Total', 'iOS', 'Android'], rows: [['3'], ['2'], ['1']] });
test('A① 과거 날짜 배열 복구 파싱 예외를 파일 단위 격리하고 최신 정상값 유지', () => fixture((o, w) => {
    w('work/2026-10-17/report/rc.log', good);
    w('work/2026-10-15/report/rc.log', '플랫폼별: {"dates":["Oct 15 \'26",BROKEN],"labels":["Total"],"rows":[["3","4"]]');
    const installs = SRC.loadInstalls({ work: o.work, now });
    assert.equal(installs.days[0].total, 3); assert.equal(installs.days[0].ios, 2);
    assert.equal(installs.historyDays.length, 1);
}));
test('A② 구글 광고 지출·설치·설치당 비용 및 원천 시각 복원', () => {
    const html = screen({ live: { google: { state: 'ok', meta: { country: '일본', platform: '안드로이드', budgetKrwPerDay: 7000 }, read: { spendKrw: 3456, installs: 12, cpiKrw: 288, day: '2026-10-16', at: now, ageMs: 0 } } } })['credits-content'].innerHTML;
    for (const text of ['구글 광고', '지출 · 원', '설치당 비용 · 원', '3,456', '>12<', '>288<', '2026-10-16', '12:30']) assert.ok(html.includes(text), text);
    const missing = screen({ live: { google: { state: 'pending' } } })['credits-content'].innerHTML;
    assert.match(missing, /구글 광고[\s\S]*판독 대기/);
});
const modes = { bootstrap: '초기 가동', measuring: '속도 측정 중', 'on-pace': '목표 속도 유지', raising: '신선도 단계 올림', lowering: '신선도 단계 내림', endgame: '기간 말 속도 조절', landing: '남은 예산 보호 · 증가분 정지', done: '목표 도달 · 증가분 정지', 'credit-off': '크레딧 불가 · 증가분 정지' };
test('A③ 실제 PacingMode 9개 전부 한국어로 표시', () => {
    for (const [mode, label] of Object.entries(modes)) {
        const html = screen({ live: { aiCredit: { mode } } })['credits-content'].innerHTML;
        assert.ok(html.includes('<strong>' + label + '</strong>'), mode);
    }
    const unknown = screen({ live: { aiCredit: { mode: '<unknown>' } } })['credits-content'].innerHTML;
    assert.match(unknown, /모드<\/span><strong>판독 대기/); assert.ok(!unknown.includes('<unknown>'));
});
test('B 리딤 카드에 애플 집계 6·30·집계일·판독 시각, 장부 8과 별도 표시', () => {
    const html = screen({ v2: { performance: { redeem: { ledger: true, confirmedUsed: 8, platforms: { ios: { confirmedUsed: 8 } } } } }, live: { asc: { state: 'ok', latestDay: '2026-10-15', offerStarts: 6, offerStarts30: 30, file: '애플 시험 원천', readAt: now } } })['dashboard-content'].innerHTML;
    for (const text of ['애플 집계 · 집계일 2026-10-15', '오퍼 코드 사용 시작 <b>6</b>', '최근 30일 오퍼 코드 사용 시작 <b>30</b>', '장부 사용 확인과 별도 집계', '애플 시험 원천', '아이폰 확인 <b>8</b>']) assert.ok(html.includes(text), text);
    const empty = screen({ live: { asc: { offerStarts: null, offerStarts30: null } } })['dashboard-content'].innerHTML;
    assert.match(empty, /오퍼 코드 사용 시작 <b>판독 대기<\/b>/);
    const zero = screen({ live: { asc: { offerStarts: 0, offerStarts30: 0 } } })['dashboard-content'].innerHTML;
    assert.match(zero, /오퍼 코드 사용 시작 <b>0<\/b>/);
});
test('B 자동 회차마다 리딤 1회, 실패·예외에도 기존 세 판독과 시각표 유지', async () => {
    const { auto } = require('./refresh');
    const schedule = { rc: ['12:30'], ads: ['12:30'], asc: ['12:30'], windowMin: 120, retryAfterMin: 25 };
    for (const failed of ['fail', 'throw']) {
        const calls = [];
        const code = await auto({ schedule, at: now, getState: () => ({}), logger() {}, run: async (job, options) => { calls.push({ job, options }); if (job === 'redeem') { if (failed === 'throw') throw Error('합성 실패'); return { status: 'fail' }; } return { status: 'ok' }; } });
        assert.equal(code, 1); assert.deepEqual(calls.map(c => c.job), ['redeem', 'rc', 'ads', 'asc']);
        for (const c of calls.slice(1)) assert.equal(c.options.slot, now);
    }
    let count = 0;
    const options = { schedule, at: now, logger() {}, getState: () => ({ rc: { lastOkAt: now }, ads: { lastOkAt: now }, asc: { lastOkAt: now } }), run: async job => { assert.equal(job, 'redeem'); count++; return { status: 'ok' }; } };
    assert.equal(await auto(options), 0); assert.equal(await auto(options), 0); assert.equal(count, 2);
});
test('B 실제 자동 경로는 임시 집계기를 --count만 호출하고 출력 본문을 숨김', () => fixture((o, w) => {
    const { execFileSync } = require('node:child_process');
    const argsFile = w('args.jsonl', '');
    const script = text => 'import sys, json\nwith open(' + JSON.stringify(argsFile) + ', "a") as f: f.write(json.dumps(sys.argv[1:]) + "\\n")\nprint(' + JSON.stringify(text) + ')\n';
    w('work/redeem/alloc-onetime.py', script('배포(장부) 385장 · 오늘 2장 · 댓글로 사용 확인 8장 · 남은 615장 / 1000'));
    const play = w('work/redeem/alloc-play-onetime.py', script('안드로이드 게시용 남은 56장 · 오늘(2026-10-17) 배분 1장 · 서버 풀 100장(건드리지 않음)'));
    const schedule = w('schedule.json', { rc: [], ads: [], asc: [], retryAfterMin: 25, windowMin: 120 });
    const output = path.join(o.home, 'redeem-summary.json');
    const env = { ...process.env, HOME: o.home, HUD_WORK: o.work, HUD_EGO_IO: o.home, HUD_REDEEM_SUMMARY: output, HUD_REFRESH_STATE: path.join(o.home, 'state.json'), HUD_REFRESH_SCHEDULE: schedule };
    const run = () => execFileSync(process.execPath, [path.join(__dirname, 'refresh.js'), 'auto'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const logs = run(); let j = JSON.parse(fs.readFileSync(output));
    assert.equal(j.platforms.ios.distributed, 385); assert.equal(j.platforms.ios.confirmedUsed, 8); assert.equal(j.platforms.ios.remaining, 615); assert.equal(j.platforms.android.remaining, 56);
    assert.ok(!logs.includes('배포(장부)')); assert.deepEqual(fs.readFileSync(argsFile, 'utf8').trim().split('\n').map(JSON.parse), [['--count'], ['--count']]);
    fs.writeFileSync(play, 'raise RuntimeError("합성 비공개 출력")');
    assert.throws(run, e => e.status === 1 && !String(e.stdout).includes('합성 비공개 출력') && !String(e.stderr).includes('합성 비공개 출력'));
    j = JSON.parse(fs.readFileSync(output)); assert.equal(j.platforms.ios.remaining, 615); assert.equal(j.platforms.android.remaining, null);
    assert.equal(JSON.parse(fs.readFileSync(path.join(o.home, 'state.json'))).redeem.status, 'fail');
}));
test('A① 최신 파일 손상은 정상 과거값 유지·손상된 체험 행도 파일 단위 격리', () => fixture((o, w) => {
    w('work/2026-10-16/report/rc.log', good.replace('2026-10-17T03', '2026-10-16T03'));
    w('work/2026-10-17/report/rc.log', good + '\n신규체험(ok): {"dates":[BROKEN],"labels":["Total"],"rows":[["3","4"]]');
    const installs = SRC.loadInstalls({ work: o.work, now }); assert.equal(installs.readAt, Date.parse('2026-10-16T03:00:00Z')); assert.equal(installs.days[0].total, 3);
}));
test('C 단일 가로 흐름도·25노드·모든 화살표·모바일 여섯 묶음과 집계 배지', () => {
    const g = H.loadHarness({ work: { processed: 12, passed: 3, held: 1 }, evidence: { ego: { status: 'fail', at: now } } });
    const html = H.renderHarness(g), svgs = [...html.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)].map(m => m[0]);
    assert.equal(svgs.length, 2); assert.match(svgs[0], /class="harness-wide"/); assert.match(svgs[1], /class="harness-mobile"/);
    for (const svg of svgs) {
        assert.equal((svg.match(/data-harness-node=/g) || []).length, 25); assert.equal((svg.match(/data-harness-edge=/g) || []).length, g.edges.length);
        assert.equal((svg.match(/marker-end=/g) || []).length, g.edges.length); assert.ok(!svg.includes('undefined'));
        for (const text of ['오늘 처리 12건', '통과 3건 · 보류 1건', '10-17 12:30 한국']) assert.ok(svg.includes(text), text);
    }
    for (const label of ['운영 지휘', '클로드 작업', '코덱스 검증·반영', '모델 없는 예약 게시', '상주 감시', '밤 검토·결과 저장']) assert.ok(svgs[1].includes(label));
    assert.ok(H.renderHarness(H.loadHarness()).includes('오늘 처리 판독 대기'));
    assert.equal(g.nodes.find(n => n.id === 'ego').status, 'fail');
    // 가로 화면: 노드끼리 겹치지 않고 연결선은 다른 노드 내부를 지나지 않는다.
    const rects = [...svgs[0].matchAll(/data-harness-node="([^"]+)"[\s\S]*?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(m => ({ id: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }));
    for (const a of rects) for (const b of rects) if (a.id < b.id) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, a.id + ':' + b.id);
    for (const m of svgs[0].matchAll(/data-harness-edge="([^"]+)" d="([^"]+)"/g)) {
        let x, y;
        for (const c of m[2].matchAll(/([MHV])([\d.]+)(?: ([\d.]+))?/g)) {
            const nx = c[1] === 'V' ? x : +c[2], ny = c[1] === 'H' ? y : c[1] === 'V' ? +c[2] : +c[3];
            if (c[1] !== 'M') for (const r of rects) {
                const hit = x === nx ? x > r.x && x < r.x + r.w && Math.max(y, ny) > r.y && Math.min(y, ny) < r.y + r.h : y > r.y && y < r.y + r.h && Math.max(x, nx) > r.x && Math.min(x, nx) < r.x + r.w;
                assert.ok(!hit, m[1] + ' 선이 ' + r.id + ' 내부를 통과');
            }
            x = nx; y = ny;
        }
    }
});
test('C 실제 v2 작업 집계를 하네스 배지에 연결하고 미측정 null 유지', () => fixture((o, w) => {
    w('work/codex/queue/QUEUE-LOG.tsv', '10-17 12:00\tDONE sample\n10-17 12:01\tSTART sample');
    const passed = w('work/codex/out/gate-pass.md', '병합 가능\n'); const held = w('work/codex/out/gate-hold.md', '보류\n');
    for (const file of [passed, held]) fs.utimesSync(file, now / 1000, now / 1000);
    const v = V.loadV2(o); assert.equal(v.harness.today.processed, 1); assert.equal(v.harness.today.passed, 1); assert.equal(v.harness.today.held, 1);
    assert.equal(v.harness.today.source, v.work.source); assert.equal(H.loadHarness().today.processed, null);
}));
test('A·B 손상 과거 로그가 있어도 실제 스냅샷 처리기 200·다른 실측 필드 보존', async () => {
    const { fork } = require('node:child_process');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-round3-api-'));
    const file = (name, value) => { const p = path.join(home, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value)); return p; };
    file('work/2026-10-17/report/rc.log', good);
    file('work/2026-10-15/report/rc.log', '플랫폼별: {"dates":[BROKEN],"labels":["Total"],"rows":[["3","4"]]');
    const google = file('google.json', { at: now, day: '2026-10-16', spendKrw: 3456, installs: 12 });
    const apple = file('asc.json', { ok: true, readAt: now, days: ['2026-10-15'], latestDay: '2026-10-15', bySource: { units: [] }, offers: { daily: [6], total: 30 } });
    const summary = file('redeem.json', { schemaVersion: 1, basis: 'ledger_comment_confirmation', readAt: new Date(now).toISOString(), platforms: { ios: { distributed: 385, confirmedUsed: 8, remaining: 615 }, android: { remaining: 56 } } });
    const empty = path.join(home, 'missing.json');
    const env = { ...process.env, HOME: home, HUD_ROOT: home, HUD_NO_COLLECT: '1', HUD_WORK: path.join(home, 'work'), HUD_EGO_IO: home, HUD_REDEEM_SUMMARY: summary, HUD_GADS: google, HUD_ASC: apple, HUD_REFRESH_STATE: empty, HUD_TODO_FILE: empty, HUD_PARTICIPATION: empty, HUD_AI_CREDIT: empty, HUD_INTEGRITY: empty, HUD_RC_OVERVIEW: empty };
    const child = fork(path.join(__dirname, 'verify-v2-server.js'), [], { env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    try {
        const message = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('스냅샷 시험 시간 초과')), 15000);
            child.once('error', e => { clearTimeout(timer); reject(e); });
            child.on('message', m => { if (m.ready) child.send({ id: 1, path: '/api/snapshot' }); if (m.id === 1) { clearTimeout(timer); resolve(m); } });
        });
        assert.equal(message.status, 200); const s = JSON.parse(message.body);
        assert.ok(!s.live.error); assert.equal(s.live.installs.days[0].total, 3);
        assert.equal(s.live.google.read.spendKrw, 3456); assert.equal(s.live.asc.offerStarts, 6); assert.equal(s.live.asc.offerStarts30, 30);
        assert.equal(s.live.redeemSummary.platforms.ios.confirmedUsed, 8); assert.ok(s.v2.harness.today);
        const ui = screen(s); assert.match(ui['credits-content'].innerHTML, /3,456/); assert.match(ui['dashboard-content'].innerHTML, /오퍼 코드 사용 시작 <b>6<\/b>/);
    } finally {
        child.kill(); await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
        fs.rmSync(home, { recursive: true, force: true });
    }
});
