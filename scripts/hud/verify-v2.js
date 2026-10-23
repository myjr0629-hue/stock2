#!/usr/bin/env node
'use strict';
// 외부 서비스·계정·운영 파일 없이 임시 홈과 저장소에서 실행한다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

let checks = 0;
let failures = 0;
let localTransport = null;
function check(name, condition) {
    checks++;
    if (!condition) failures++;
    console.log(`${condition ? '✓' : '✗'} ${name}`);
}
function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
    return file;
}
function request(port, route) {
    if (localTransport && localTransport.port === port) return localTransport.request(route);
    return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: route, timeout: 30000 }, res => {
            let body = '';
            res.setEncoding('utf8').on('data', chunk => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
        });
        req.on('timeout', () => req.destroy(new Error('응답 시간 초과')));
        req.on('error', reject);
    });
}
async function unusedPort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}
async function startServer(tmp) {
    let port, useIpc = false;
    try { port = await unusedPort(); } catch (error) {
        if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
        port = 17788; useIpc = true;
        console.log('확인 한계 · 샌드박스 포트 바인드 차단, 동일 HTTP 처리기를 IPC로 검사');
    }
    const home = path.join(tmp, 'home');
    const root = path.join(tmp, 'repo');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(root, { recursive: true });
    const env = {
        ...process.env,
        HOME: home, HUD_ROOT: root, HUD_PORT: String(port), HUD_NO_COLLECT: '1',
        HUD_WORK: path.join(home, 'Documents/signum-work'), HUD_EGO_IO: path.join(home, 'signum-ego-io'),
        HUD_TODO_FILE: path.join(home, 'todo.md'), HUD_PARTICIPATION: path.join(home, 'participation.md'),
        HUD_AI_CREDIT: path.join(home, 'credit.json'), HUD_GADS: path.join(home, 'gads.json'),
        HUD_INTEGRITY: path.join(home, 'integrity/latest.json'), HUD_ASC: path.join(home, 'asc.json'),
        HUD_REFRESH_STATE: path.join(home, 'refresh.json'), HUD_REFRESH_SCHEDULE: path.join(__dirname, 'refresh-schedule.json'),
    };
    const child = spawn(process.execPath, [path.join(__dirname, useIpc ? 'verify-v2-server.js' : 'server.js')], { cwd: root, env, stdio: useIpc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'] });
    if (useIpc) {
        let nextId = 0;
        const pending = new Map();
        child.on('message', message => { if (pending.has(message.id)) { const done = pending.get(message.id); pending.delete(message.id); done(message); } });
        localTransport = { port, request(route) { return new Promise(resolve => { const id = ++nextId; pending.set(id, resolve); child.send({ id, path: route }); }); } };
    }
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('시험 서버 기동 시간 초과')); }, 15000);
        child.on('error', err => { clearTimeout(timer); reject(err); });
        child.on('exit', code => { clearTimeout(timer); reject(new Error(`시험 서버 조기 종료: ${code}`)); });
        child.stdout.setEncoding('utf8').on('data', data => { if (String(data).includes('http://127.0.0.1:')) { clearTimeout(timer); resolve(); } });
        // 원천 내용이나 실행 인자를 출력하지 않는다.
        child.stderr.resume();
    });
    return { child, port, root, useIpc };
}

async function serverChecks(port) {
    const result = await request(port, '/api/snapshot');
    check('스냅샷 HTTP 처리 결과 200', result.status === 200);
    const snapshot = JSON.parse(result.body);
    const legacy = ['now', 'state', 'usage', 'marketing', 'brief', 'slot', 'live', 'collector', 'metrics', 'otel', 'git', 'events', 'server'];
    check('기존 최상위 API 필드 보존', legacy.every(key => Object.hasOwn(snapshot, key)));
    check('기존 실측 API 필드 보존', ['rcOverview', 'redeemSummary', 'google', 'ads', 'installs', 'todo', 'runner', 'participation', 'refresh', 'asc', 'aiCredit', 'integrity'].every(key => Object.hasOwn(snapshot.live, key)));
    const fields = ['agents', 'harness', 'credits', 'publishing', 'todos', 'mail', 'integrity', 'platforms', 'work', 'performance'];
    check('새 대시보드 API 필드 존재', fields.every(key => snapshot.v2 && Object.hasOwn(snapshot.v2, key)));
    check('시험 중 자동 수집기 정지', snapshot.collector.running === false && snapshot.collector.startedAt === null);
    const page = await request(port, '/');
    check('화면 응답 200', page.status === 200 && /text\/html/.test(page.headers['content-type']));
    const diagram = await request(port, '/harness.js');
    check('하네스 렌더러 응답 200', diagram.status === 200 && diagram.body.includes('renderHarness'));
    const costs = await request(port, '/costs.js');
    check('비용 렌더러 응답 200', costs.status === 200 && costs.body.includes('HUDCosts'));
    return snapshot;
}

async function run() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'signum-hud-v2-'));
    let server;
    try {
        await loaderChecks(tmp);
        server = await startServer(tmp);
        const snapshot = await serverChecks(server.port);
        screenChecks(snapshot);
        const harness = spawn(process.execPath, [path.join(__dirname, 'verify-v2-harness.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
        harness.stdout.resume(); harness.stderr.resume();
        check('하네스 독립 시험 9개', await new Promise(resolve => harness.on('close', resolve)) === 0);
        const legacy = spawn(process.execPath, [path.join(__dirname, 'verify.js'), String(server.port)], {
            env: { ...process.env, HUD_VERIFY_FROM_V2: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        legacy.stdout.setEncoding('utf8').on('data', data => { output += data; });
        legacy.stderr.setEncoding('utf8').on('data', data => { output += data; });
        const code = await new Promise(resolve => legacy.on('close', resolve));
        check('기존 판독기·시각표·설치·광고 회귀 시험', code === 0);
        if (code === 0) console.log(output.trim().split('\n').pop());
        if (code !== 0) console.log(output.split('\n').filter(line => /✗/.test(line)).join('\n'));
    } finally {
        if (server) {
            server.child.kill('SIGTERM');
            await new Promise(resolve => { if (server.child.exitCode !== null) return resolve(); server.child.once('close', resolve); });
        }
        localTransport = null;
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`\n대시보드 검사 ${checks}건 · 실패 ${failures}건`);
    return failures === 0;
}

// 각 로더 입력 계약과 화면 렌더 진입점은 아래에서 검증한다.
function loaderChecks(tmp) {
    const S = require('./sources');
    const home = path.join(tmp, 'fixtures');
    const work = path.join(home, 'Documents/signum-work');
    const root = path.join(home, 'repo');
    const now = Date.parse('2026-10-17T03:30:00Z');
    const unavailable = () => { throw new Error('시험 명령 불가'); };
    const o = { home, work, root, now, run: unavailable };
    const missing = path.join(home, 'missing.json');
    const broken = write(path.join(home, 'broken.json'), '{깨진 파일');
    const fileLoaders = ['loadCredits', 'loadMail', 'loadPublishing', 'loadIntegrityV2', 'loadPlatforms', 'loadPerformance'];
    for (const key of fileLoaders) {
        check(`${key}: 파일 없음은 판독 대기`, S[key]({ ...o, file: missing }).state === 'pending');
        check(`${key}: 깨진 파일은 판독 대기`, S[key]({ ...o, file: broken }).state === 'pending');
    }
    const creditsFile = write(path.join(work, 'hud/feeds/credits.json'), {
        readAt: now - 60000,
        claude: { weeklyPct: 35, fiveHourPct: 0, resetsAt: '2026-10-19T00:00:00Z', extraSpentUsd: 2, extraLimitUsd: 10 },
        codex: { weeklyTokens: 2345, weeklyTasks: 3, weeklyPct: 12, daily: [{ date: '2026-10-17', tokens: 0 }] },
    });
    const credits = S.loadCredits({ ...o, file: creditsFile });
    check('크레딧: 주간·5시간·추가 사용량·일별 토큰', credits.state === 'ok' && credits.claude.weeklyPct === 35 && credits.claude.fiveHourPct === 0 && credits.claude.extraSpentUsd === 2 && credits.codex.daily[0].tokens === 0);
    check('크레딧: 실측 시각 보존', credits.readAt === now - 60000 && !!credits.source);
    const partial = write(path.join(home, 'partial.json'), { claude: { weeklyPct: '30' }, codex: {} });
    check('크레딧: 문자열·누락 숫자를 0으로 만들지 않음', S.loadCredits({ ...o, file: partial }).claude.weeklyPct === null && S.loadCredits({ ...o, file: partial }).codex.weeklyTokens === null);
    const mailFile = write(path.join(work, 'hud/feeds/mail.json'), { items: [
        { date: '2026-10-16', from: '스토어', summary: '심사 대기', action: '확인', kind: '스토어' },
        { date: '2026-10-17', from: '운영', summary: '정상', action: '없음', kind: '운영' },
    ] });
    const mail = S.loadMail({ ...o, file: mailFile });
    check('메일: 최신순·분류·조치 필드', mail.items[0].date === '2026-10-17' && mail.items[0].kind === '운영' && mail.items[1].action === '확인');
    const todoFile = write(path.join(home, 'todos.md'), '# 대표 할 일\n## 2026-10-15 이전 작업\n- [ ] 이전 작업 상세\n## 2026-10-17 최신 작업\n- [ ] 최신 작업 상세\n- [x] 완료된 항목\n## 완료\n- [x] 끝난 작업\n');
    const todos = S.loadTodos({ ...o, file: todoFile });
    check('대표 할 일: 최신순과 항목별 날짜 보존', todos.items.length === 2 && todos.items[0].date === '2026-10-17' && todos.items[1].date === '2026-10-15');
    check('대표 할 일: 완료 항목 제외', !JSON.stringify(todos).includes('완료된 항목') && !JSON.stringify(todos).includes('끝난 작업'));
    check('대표 할 일: 파일 없음은 판독 대기', S.loadTodos({ ...o, file: missing }).state === 'pending');
    check('대표 할 일: 잘못된 마크다운은 판독 대기', S.loadTodos({ ...o, file: broken }).state === 'pending');
    const ledgerFile = write(path.join(home, 'ledger.json'), [
        { ch: 'naver_blog', at: '2026-10-16T16:00:00Z', url: 'https://example.org/korean-post' },
        { ch: 'note_jp', at: '2026-10-17T01:00:00Z', url: 'https://example.org/japanese-post' },
        { ch: 'x_us', at: '2026-10-17T02:00:00Z', url: 'https://example.org/american-post' },
        { ch: 'bluesky', at: '2026-10-17T03:00:00Z', url: 'https://example.org/global-post' },
        { ch: 'diff_kit', at: '2026-10-17T03:00:00Z', url: 'https://example.org/internal' },
        { ch: 'note_jp', at: '2026-09-01T03:00:00Z', url: 'https://example.org/old' },
        { ch: 'store', at: '2026-10-17T03:00:00Z', url: 'https://apps.apple.com/app/id0' },
    ]);
    const publishing = S.loadPublishing({ ...o, file: ledgerFile });
    check('게시: 최근 14일과 4개 지역 전수 칸', publishing.dates.length === 14 && publishing.cells.length === 56 && publishing.items.length === 4);
    check('게시: 한국 날짜 경계와 지역 매핑', publishing.items[0].date === '2026-10-17' && publishing.items.map(r => r.region).join(',') === '한국,일본,미국,글로벌');
    check('게시: 정상 빈 원장은 0, 누락 원장은 null', S.loadPublishing({ ...o, file: write(path.join(home, 'empty.json'), []) }).cells[0].count === 0 && S.loadPublishing({ ...o, file: missing }).cells[0].count === null);
    check('공개 주소: 인증·파일·실행 주소 제외', S.publicUrl('javascript:alert(1)') === null && S.publicUrl('file:///tmp/a') === null && S.publicUrl('https://example.org/reset/123') === null);
    check('공개 주소: 검색 인자와 해시 제외', S.publicUrl('https://example.org/post?private=sample#value') === 'https://example.org/post');
    check('공개 주소: 네이버 게시물 경로 인자 보존', S.publicUrl('https://blog.naver.com/PostView.naver?blogId=sample&logNo=123&private=sample') === 'https://blog.naver.com/PostView.naver?blogId=sample&logNo=123');
    const latest = write(path.join(home, 'integrity/latest.json'), { at: now - 1000, ok: 39, errors: 1, delays: 2, symbols: 40 });
    const history = write(path.join(home, 'integrity/history.jsonl'), JSON.stringify({ at: now - 1000, ok: 39, errors: 1, delays: 2 }) + '\n{깨짐\n');
    const outDir = path.join(home, 'out');
    const gate = write(path.join(outDir, 'gate-fixture.md'), '# PASS · 통과\n후속 본문');
    fs.utimesSync(gate, new Date(now), new Date(now));
    const integrity = S.loadIntegrityV2({ ...o, file: latest, historyFile: history, outDir, run: () => '2026-10-17T10:00:00+09:00\tMerge fixture' });
    check('무결성: 오류 상태·이력 손상 행 격리·관문 첫 줄', integrity.latest.state === 'fail' && integrity.history.length === 1 && integrity.history[0].delays === 2 && integrity.gates[0].status === 'passed' && !integrity.gates[0].title.includes('본문'));
    check('무결성: 운영 병합 제목·시각', integrity.merges.length === 1 && integrity.merges[0].title === 'Merge fixture');
    check('무결성: 판독 40분 초과는 지연', S.loadIntegrityV2({ ...o, file: latest, now: now + 41 * 60000 }).latest.state === 'pending');
    const planFile = write(path.join(home, 'plan.md'), '| 번호 | 플랫폼 | 상태 | 언어 | 링크 |\n| P01 | Naver Blog | 활성 | KO | https://example.org/naver |\n| P02 | note | 게이트 | JA | https://example.org/note |\n| P03 | App Store | 활성 | EN | https://example.org/store |\n| P04 | Apple Ads | 정지 | EN | https://example.org/ads |\n');
    const channelsFile = write(path.join(home, 'channels.json'), [{ id: 'naver_blog', name: 'Naver Blog', profile: 'https://example.org/naver', enabled: true }, { id: 'bluesky', name: '블루스카이', enabled: false }]);
    const platforms = S.loadPlatforms({ ...o, file: planFile, channelsFile, publishing });
    check('플랫폼: 대장 전수와 추가 채널, 6지역', platforms.items.length === 5 && platforms.groups.length === 6 && platforms.items.some(r => r.region === '광고') && platforms.items.some(r => r.region === '스토어'));
    check('플랫폼: 활성·게이트·정지 모두 표시', ['활성', '게이트', '정지'].every(state => platforms.items.some(r => r.status === state)));
    const queueLog = write(path.join(home, 'queue/QUEUE-LOG.tsv'), '10-17 10:00\tstart fixture.task\n10-17 10:05\tdone fixture rc=0\n10-16 10:05\tdone old rc=0\n');
    const workData = S.loadWork({ ...o, file: queueLog, integrity, publishing });
    check('작업: 실행기 실제 날짜·소문자 완료 형식', workData.processed === 1);
    check('작업: 오늘 관문·병합·게시·플랫폼 수', workData.passed === 1 && workData.held === 0 && workData.merges === 1 && workData.posts === 4 && workData.platformCount === 4);
    check('작업: 로그 누락은 0으로 만들지 않음', S.loadWork({ ...o, file: missing }).processed === null);
    check('작업: 잘못된 로그는 판독 대기', S.loadWork({ ...o, file: broken }).state === 'pending' && S.loadWork({ ...o, file: broken }).processed === null);
    const days = Array.from({ length: 15 }, (_, index) => ({ date: `2026-10-${String(index + 3).padStart(2, '0')}`, partial: index === 14, real: { total: index, ios: index, android: 0 }, trials: 99 }));
    const installs = { utcToday: '2026-10-17', days, file: '시험 설치 원천', readAt: now - 1000 };
    const performance = S.loadPerformance({ ...o, file: missing, installs });
    check('성과: 정확히 직전 완결 7일 평균', performance.installs.avg7 === 10 && performance.installs.yesterday.total === 13 && performance.installs.today.total === 14);
    check('성과: 신규체험을 확정 리딤·유료로 오인하지 않음', performance.redeem.today === null && performance.paid.active === null && performance.registrations.total === null);
    check('성과: 7일 중 하루 누락은 판독 대기', S.loadPerformance({ ...o, file: missing, installs: { ...installs, days: days.filter(r => r.date !== '2026-10-10') } }).installs.avg7 === null);
    check('성과: 자정 뒤 오래된 오늘은 null', S.loadPerformance({ ...o, installs, now: now + 86400000 }).installs.today === null);
    const performanceFile = write(path.join(home, 'performance.json'), { registrations: { total: 44, week: 7 }, paid: { active: 0, trials: 3, conversion: 25 }, redeem: { today: 0, week: 2, remaining: 8 } });
    const measured = S.loadPerformance({ ...o, file: performanceFile });
    check('성과: 실측 0과 누락 null 구분', measured.paid.active === 0 && measured.redeem.today === 0 && measured.registrations.total === 44);
    const queueRoot = path.join(home, 'agents/queue');
    write(path.join(queueRoot, 'running/fixture.task'), 'fixture|isolated|write|0');
    fs.mkdirSync(path.join(queueRoot, 'todo'), { recursive: true });
    const agents = S.loadAgents({ ...o, queueRoot, run: (file, args) => {
        if (args[0] === '--version') return 'codex-cli 1.2.3';
        if (file.endsWith('PlistBuddy')) return '2.3.4';
        if (file.endsWith('pgrep')) return '123\n';
        if (file.endsWith('launchctl')) return '123\t0\tcom.signumhq.hud-refresh\n-\t1\tcom.signumhq.integrity-watch';
        return '';
    }, session: { file: 'fixture-session.jsonl', lastTs: new Date(now - 1000).toISOString() } });
    check('에이전트: 모델·버전·대기열', agents.items.find(r => r.id === 'coordinator').model === 'claude-opus-5-5' && agents.items.find(r => r.id === 'codex').version === '1.2.3' && agents.queue.running.length === 1 && agents.queue.todo.length === 0);
    check('에이전트: 프로세스 생존과 상주 실패 구분', agents.items.find(r => r.id === 'day-sched2').status === 'running' && agents.items.find(r => r.id === 'integrity-watch').status === 'fail');
    const unavailableAgents = S.loadAgents(o);
    check('에이전트: 명령 실패도 개별 판독 대기', unavailableAgents.items.every(r => r.status === 'pending') && unavailableAgents.items.find(r => r.id === 'codex').version === null);
    check('에이전트: 대기열 원천 누락을 빈 배열로 만들지 않음', unavailableAgents.queue.running === null && unavailableAgents.queue.todo === null);
    write(creditsFile, '{깨짐');
    const isolated = S.loadV2(o);
    check('스냅샷: 깨진 크레딧이 정상 메일에 영향 없음', isolated.credits.state === 'pending' && isolated.mail.state === 'ok' && isolated.mail.items.length === 2);
}
function screenChecks(snapshot) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(match => !/\bsrc\s*=/.test(match[1])).map(match => match[2]);
    check('화면: 한국어 문서·모바일 뷰포트', /<html lang="ko">/.test(html) && /name="viewport"/.test(html));
    check('화면: 외부 스크립트·스타일·CDN 없음', !/<(?:script|link)[^>]+(?:src|href)=["'](?:https?:)?\/\//i.test(html) && !/@import|url\(["']?https?:/i.test(html));
    check('화면: 밝은 배경·고정 메뉴·KPI 4열·모바일 규칙', /color-scheme" content="light/.test(html) && /position:fixed/.test(html) && /repeat\(4,minmax\(0,1fr\)\)/.test(html) && /@media\(max-width:590px\)/.test(html));
    check('화면: 기존 제어만 복원하고 수집·외부 쓰기는 없음', scripts.join('\n').includes("fetch('/api/control'") && !/\/api\/collect|fetch\(['"]https?:/.test(scripts.join('\n')));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    check('화면: 정적 식별자 중복 없음', ids.length === new Set(ids).size);
    function element() {
        return { innerHTML: '', textContent: '', hidden: false, disabled: false, className: '', dataset: {}, attributes: {}, style: {}, addEventListener() {}, setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; }, querySelector() { return null; }, querySelectorAll() { return []; } };
    }
    const nodes = Object.fromEntries(ids.map(id => [id, element()]));
    const menus = [...html.matchAll(/data-view="([^"]+)"/g)].map(match => Object.assign(element(), { dataset: { view: match[1] } }));
    check('화면: 명세의 메뉴 9개', menus.length === 9);
    const context = {
        document: { addEventListener() {}, querySelector(selector) { if (!selector.startsWith('#')) return null; if (!nodes[selector.slice(1)]) throw new Error('없는 정적 식별자'); return nodes[selector.slice(1)]; }, querySelectorAll(selector) { return selector === '[data-view]' ? menus : []; } },
        location: { hash: '' }, history: { replaceState() {} }, URL, Date, Intl,
        setInterval() {}, setTimeout() {}, addEventListener() {},
        fetch: () => new Promise(() => {}),
        HUDHarness: require('./v2-harness'),
    };
    context.window = context;
    vm.createContext(context);
    new vm.Script(fs.readFileSync(path.join(__dirname, 'v2-costs.js'), 'utf8')).runInContext(context);
    for (const script of scripts) new vm.Script(script).runInContext(context, { timeout: 2000 });
    check('화면: 인라인 문법·초기화 실행', !!context.HUDV2 && typeof context.HUDV2.paint === 'function');
    const render = data => {
        context.__snapshot = data;
        // paint의 항목 격리 catch에 가려진 오류도 직접 호출로 검출한다.
        vm.runInContext('for (const render of Object.values(RENDERERS)) render(__snapshot); HUDV2.paint(__snapshot);', context, { timeout: 3000 });
        return Object.values(nodes).map(node => node.innerHTML).join('\n');
    };
    const empty = render(snapshot);
    check('화면: 모든 항목 누락에서도 9화면 렌더', empty.includes('판독 대기') && !/undefined|NaN|Infinity/.test(empty));
    const now = Date.parse('2026-10-17T03:30:00Z');
    const sample = {
        ...snapshot, now: new Date(now).toISOString(),
        brief: { installs: { date: '2026-10-17', readAt: now, file: '시험 설치', today: { total: 12, ios: 10, android: 2 }, yesterday: { total: 7 }, pct: 12, days: [{ date: '2026-10-17', total: 12, ios: 10, android: 2 }] }, health: [], ads: {}, asc: { state: 'ok', readAt: now, latestDay: '2026-10-16', sources: [{ label: '웹', units: 3 }, { label: '검색', units: 2 }] } },
        v2: {
            performance: { source: '시험 성과', readAt: now, installs: { avg7: 6 }, registrations: { total: 44, week: 7 }, paid: { active: 0, trials: 3, conversion: 25 }, redeem: { today: 0, week: 2, remaining: 8 } },
            agents: { state: 'ok', source: '시험 에이전트', readAt: now, items: [{ id: 'codex', name: '코덱스', model: 'gpt-6.1-sol · gpt-6-astra', version: '1.2.3', status: 'running' }, { id: 'day-sched2', name: '예약 게시기', status: 'running' }], queue: { running: [{ id: '시험 작업' }], todo: [], readAt: now } },
            credits: { state: 'ok', source: '시험 크레딧', readAt: now, claude: { weeklyPct: 35, fiveHourPct: 0 }, codex: { weeklyTokens: 2000, weeklyTasks: 3, weeklyPct: 20, daily: [{ date: '2026-10-17', tokens: 200 }] } },
            harness: require('./v2-harness').loadHarness({ readAt: now }),
            publishing: { state: 'ok', source: '시험 게시', readAt: now, dates: ['2026-10-17'], regions: ['한국', '일본', '미국', '글로벌'], items: [{ date: '2026-10-17', region: '일본', channel: '노트', at: now, url: 'https://example.org/public-post' }] },
            todos: { state: 'ok', source: '시험 할 일', readAt: now, items: [{ date: '2026-10-17', title: '확인할 일', detail: '<img src=x onerror=alert(1)>' }] },
            mail: { state: 'ok', source: '시험 메일', readAt: now, items: [{ date: '2026-10-17', from: '스토어', summary: '심사 결과', action: '확인', kind: '스토어' }] },
            integrity: { state: 'ok', readAt: now, latest: { state: 'fail', at: now, ok: 39, errors: 1, delays: 2 }, history: [{ at: now, ok: 39, errors: 1, delays: 2 }], gates: [{ title: '보류 사유', status: 'held', at: now }], gatesReadAt: now, merges: null, mergesReadAt: null },
            platforms: { state: 'ok', readAt: now, groups: [{ region: '일본', items: [{ name: '노트', status: '게이트', lastPostAt: now, url: 'https://example.org/platform' }] }] },
            work: { readAt: now, processed: 2, passed: 1, held: 1, merges: 0, posts: 1, platformCount: 1 },
        },
    };
    const rendered = render(sample);
    check('화면: 실측 0·기간별 KPI 12개·숫자 원천', (nodes['dashboard-content'].innerHTML.match(/class="kpi-title"/g) || []).length === 12 && nodes['dashboard-content'].innerHTML.includes('>0<') && nodes['dashboard-content'].innerHTML.includes('읽은 시각'));
    check('화면: 모델과 CLI 버전 동시 표시', nodes['agents-content'].innerHTML.includes('gpt-6.1-sol') && nodes['agents-content'].innerHTML.includes('1.2.3'));
    check('화면: 인라인 막대·도넛·진행 링', rendered.includes('<svg') && (nodes['credits-content'].innerHTML.match(/<svg/g) || []).length >= 3 && nodes['dashboard-content'].innerHTML.includes('<circle'));
    check('화면: 게시 링크·지역·날짜 펼치기', nodes['publications-content'].innerHTML.includes('https://example.org/public-post') && nodes['publications-content'].innerHTML.includes('<details>') && nodes['publications-content'].innerHTML.includes('일본'));
    check('화면: 외부 데이터 HTML 이스케이프', !nodes['todos-content'].innerHTML.includes('<img') && nodes['todos-content'].innerHTML.includes('&lt;img'));
    check('화면: 메일 조치·무결성 보류·플랫폼 상태', nodes['mail-content'].innerHTML.includes('조치') && nodes['integrity-content'].innerHTML.includes('보류') && nodes['platforms-content'].innerHTML.includes('게이트'));
    check('화면: 병합 판독 실패를 기록 없음으로 단정하지 않음', !nodes['integrity-content'].innerHTML.includes('최근 7일 병합 기록이 없습니다'));
    const brokenSnapshot = JSON.parse(JSON.stringify(sample));
    brokenSnapshot.v2.publishing = { state: 'pending', readAt: now, dates: ['2026-10-17'], items: [] };
    brokenSnapshot.v2.platforms = { state: 'pending', readAt: now, groups: [{ region: '일본', items: [] }] };
    render(brokenSnapshot);
    check('화면: 깨진 게시 원천을 0건으로 표시하지 않음', nodes['publications-content'].innerHTML.includes('판독 대기') && !nodes['publications-content'].innerHTML.includes('<td>0</td>'));
    check('화면: 깨진 플랫폼 원천을 0개로 표시하지 않음', nodes['platforms-content'].innerHTML.includes('판독 대기') && !nodes['platforms-content'].innerHTML.includes('0개'));
    for (const menu of menus) context.HUDV2.setView(menu.dataset.view);
    check('화면: 메뉴 전환 시 선택 화면만 표시', Object.keys(nodes).filter(id => id.startsWith('view-') && !nodes[id].hidden).join() === 'view-platforms');
}

module.exports = { run, serverChecks, check };
if (require.main === module) run().then(ok => { process.exitCode = ok ? 0 : 1; }).catch(error => {
    console.error('✗ 대시보드 시험 실행 오류 · ' + error.name);
    console.error(String(error.stack).split('\n').slice(1, 5).join('\n')); process.exitCode = 1;
});
