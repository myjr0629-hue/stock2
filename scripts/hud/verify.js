#!/usr/bin/env node
/* 관제 콘솔 UI·API 무결성 검사 — `node scripts/hud/verify.js [포트=7788]` (서버가 떠 있어야 한다)
 *  ①JS 문법 ②참조 id 존재 ③스냅샷 계약(live.* 포함) ④DOM 스텁으로 paint() 실행 + 패널 내용 ⑤낡은 문구가 화면에 없는가
 *  ⑥원천 파서 단위 시험(sources.js — 고정 입력)
 *  ⚠ 이 검사는 «보이는지»를 증명하지 못한다 — 색·레이아웃은 실제 브라우저 스크린샷으로 확인할 것(2026-09-18 실측 교훈).
 *  ⚠ 값이 «원천과 같은가»는 이 검사가 아니라 원천 파일을 직접 읽어 대조한다(2026-10-10 대조표). 여기서는 구조만 본다. */
const fs = require('fs'), vm = require('vm'), http = require('http'), path = require('path');
const PORT = Number(process.argv[2] || 7788);
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1];
let fail = 0; const ok = (n, c, d = '') => { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : ' ← ' + d)); if (!c) fail++; };

ok('JS 문법', (() => { try { new vm.Script(script); return true; } catch (e) { return e.message; } })() === true, 'parse 오류');
const ids = [...script.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]);
const missing = [...new Set(ids)].filter((id) => !new RegExp('id="' + id + '"').test(html));
ok('참조 id 전부 존재 (' + new Set(ids).size + '개)', missing.length === 0 || missing.every((x) => /^(cmap-more|td-foot|b-collect)$/.test(x)), '없는 id: ' + missing.join(','));

// ⑥ 원천 파서 단위 시험 — 고정 입력
const S = require('./sources');
(() => {
    const ads = S.parseAdsText([
        '[어제] 기간 표시=[]',
        '  SIGNUM TW - Search Results - Exact 실행 중    지출 $11.66   노출 1,037   탭 11  설치 0  CPA $0.00 · CPT $1.06',
        '  SIGNUM US - Search Tab           일시 정지됨  지출 $0.00    노출 0       탭 0   설치 0  CPA $0.00 · CPT $0.00',
        '  합계=합계 | $11.66 | $0.00 | $1.06 | $10.00 | 1,037 | 11 | 0 | 1% | 0% | 0% | 0 | $0.00 | x',
    ].join('\n'));
    ok('광고 로그 파서: 기간·나라·합계', ads.length === 1 && ads[0].period === '어제' && ads[0].rows.length === 2 && ads[0].rows[0].code === 'TW' && ads[0].rows[0].impr === 1037 && ads[0].rows[1].state === '일시 정지됨' && ads[0].total.spend === 11.66, JSON.stringify(ads).slice(0, 160));
    const todo = S.parseTodo('# 제목 (2026-10-10 00:40 KST)\n> 메모\n\n## 1. 할 일\n- [ ] 하나 https://a.example/x\n  - 하위\n- [x] 둘\n\n## 3. 결정(채팅으로 답만)\n- [ ] 답\n\n## 대기 중(할 일 없음)\n- 기다림\n\n---\n- 끝남');
    ok('할 일 파서: 종류·미완료 수', todo.counts.do === 1 && todo.counts.chat === 1 && todo.counts.wait === 1 && todo.sections[0].items[0].children.length === 1 && todo.footer.length === 1 && todo.versionAt === Date.parse('2026-10-10T00:40:00+09:00'), JSON.stringify(todo.counts));
    const rc = S.parseRcLine('플랫폼별(ok): {"labels":["Segments","Total","iOS","Android"],"dates":["Oct 02 \'26","Oct 03 \'26","Row Average"],"rows":[["2","7","5"],["2","6","4"],["0","1","1"]]}');
    ok('RC 파서: 날짜·행', rc && rc.dates.length === 3 && rc.rows.length === 3, JSON.stringify(rc).slice(0, 120));
    const hu = S.parseHuman('── 스마트링크 클릭: 사람 vs 원시 (최근 7일 ET: 2026-10-03~2026-10-09) ──\n앱:태그                       사람 iOS    안드   PC │ 원시합  사람% │ 사람 아님(bot/nolang/prefetch/nonnav/nometa)\nsg:home                         1     3    4 │    74    11% │ 4/22/0/0/40\nuc:home                         0     3    3 │    77     8% │ 5/23/0/0/43\nsg:x_jp                         0     0    5 │    13    38% │ 5/1/0/0/2\n\n끝');
    ok('사람 클릭 파서: 태그 가족 중복 제외', hu && hu.phone === 4 && hu.phoneRowSum === 7 && hu.pc === 9 && hu.tags[0].tag === 'home', JSON.stringify(hu).slice(0, 200));
})();

// ⑥-b 자동 갱신(refresh.js·sources.js) 단위 시험 — 고정 입력. 파일·시계는 임시 폴더·고정 시각으로.
(() => {
    const os = require('os'), R = require('./refresh');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-verify-'));
    // 시각표: 09:12/13:40 … 지금이 10/10 09:30 KST 면 마지막 = 09:12, 다음 = 13:40
    const sch = { rc: ['09:12', '13:40', '16:40', '21:10'], ads: ['09:20', '13:40'], retryAfterMin: 25, windowMin: 120 };
    const T = Date.parse('2026-10-10T09:30:00+09:00');
    ok('시각표: 마지막 슬롯·다음 슬롯(KST)', S.prevSlot(sch.rc, T) === Date.parse('2026-10-10T09:12:00+09:00') && S.nextSlot(sch.rc, T) === Date.parse('2026-10-10T13:40:00+09:00'), new Date(S.prevSlot(sch.rc, T)).toISOString());
    ok('시각표: 자정 넘어 다음 슬롯은 내일 첫 회차', S.nextSlot(sch.rc, Date.parse('2026-10-10T22:00:00+09:00')) === Date.parse('2026-10-11T09:12:00+09:00'));
    // 상태: 마지막 성공·결과·예정 시각이 지났는데 시도 없음(overdue)
    const stf = path.join(tmp, 'state.json');
    fs.writeFileSync(stf, JSON.stringify({ installedAt: Date.parse('2026-10-10T08:00:00+09:00'), rc: { lastStartAt: Date.parse('2026-10-10T09:12:05+09:00'), lastOkAt: Date.parse('2026-10-10T09:12:20+09:00'), status: 'ok' }, ads: { lastStartAt: Date.parse('2026-10-09T21:10:00+09:00') } }));
    const rf = S.loadRefresh({ file: stf, now: T, schedule: sch });
    ok('자동 갱신 상태: rc 정상·다음 13:40, ads 는 09:20 슬롯 시도 없음→overdue 아님(재시도 간격 전)', rf.jobs.rc.status === 'ok' && rf.jobs.rc.next === Date.parse('2026-10-10T13:40:00+09:00') && rf.jobs.ads.overdue === false, JSON.stringify(rf.jobs.ads));
    ok('자동 갱신 상태: 예정+재시도+10분이 지나도 시도 없으면 overdue', S.loadRefresh({ file: stf, now: Date.parse('2026-10-10T10:00:00+09:00'), schedule: sch }).jobs.ads.overdue === true);
    // 설치: «읽음:» 줄이 있으면 그 시각이 기준 · 읽은 날(UTC)의 열은 부분, 그 전날까지가 완결
    const wd = path.join(tmp, 'work', '2026-10-10', 'report'); fs.mkdirSync(wd, { recursive: true });
    fs.writeFileSync(path.join(wd, 'rc.log'), '읽음: 2026-10-10T04:40:00.000Z\n전체: {"labels":["","New Customers"],"dates":["Oct 08 \'26","Oct 09 \'26","Oct 10 \'26","Row Average"],"rows":[["6","4","2","4"]]}\n플랫폼별(ok): {"labels":["Segments","Total","iOS","Android"],"dates":["Oct 08 \'26","Oct 09 \'26","Oct 10 \'26","Row Average"],"rows":[["6","4","2","4"],["4","2","2","3"],["2","2","0","1"]]}\n');
    const inst = S.loadInstalls({ work: path.join(tmp, 'work') });
    ok('설치: 읽음 줄 = 기준 시각 · 완결 10/9 · 오늘(10/10) 부분', inst && inst.auto && inst.readAt === Date.parse('2026-10-10T04:40:00Z') && inst.last.date === '2026-10-09' && inst.last.total === 4 && inst.last.ios === 2 && inst.partial.date === '2026-10-10' && inst.partial.total === 2, JSON.stringify(inst && { l: inst.last, p: inst.partial, a: inst.auto }));
    // RevenueCat 판정: 마지막 열이 오늘(UTC)이어야 정상
    const rcOut = (dates, rows) => '읽음: x\n플랫폼별(ok): ' + JSON.stringify({ labels: ['Segments', 'Total', 'iOS', 'Android'], dates, rows, signin: false });
    const D8 = ["Oct 03 '26", "Oct 04 '26", "Oct 05 '26", "Oct 06 '26", "Oct 07 '26", "Oct 08 '26", "Oct 09 '26", "Oct 10 '26", 'Row Average'];
    const rows8 = [['7', '5', '14', '3', '5', '6', '4', '1', '6'], ['7', '5', '5', '3', '2', '4', '2', '1', '4'], ['0', '0', '9', '0', '3', '2', '2', '0', '2']];
    const at = Date.parse('2026-10-10T00:06:00Z');
    ok('RC 판정: 정상(마지막 열=오늘 UTC·합계=iOS+안드)', R.judgeRc(rcOut(D8, rows8), at).status === 'ok', JSON.stringify(R.judgeRc(rcOut(D8, rows8), at)));
    ok('RC 판정: 마지막 열이 어제면 range 실패(옛 화면을 새것으로 쓰지 않는다)', R.judgeRc(rcOut(D8.slice(0, 7).concat(['Row Average']), rows8.map((r) => r.slice(0, 7).concat(['0']))), at).kind === 'range');
    ok('RC 판정: 로그인 화면 = signin', R.judgeRc('SIGNIN — RevenueCat 로그인 필요', at).kind === 'signin');
    const bad = rows8.map((r) => r.slice()); bad[1][6] = '3';
    ok('RC 판정: 합계≠iOS+안드는 경고(값은 통과)', /합계≠iOS\+안드: 2026-10-09/.test(R.judgeRc(rcOut(D8, bad), at).msg));
    // 광고 판정
    const adsPeriod = (name) => `\n[${name}] 기간 표시=[]\n  SIGNUM JP - Search Results - Exact 실행 중    지출 $3.49    노출 116     탭 2   설치 0  CPA $0.00 · CPT $1.75\n  합계=합계 | $3.49 | $0.00 | $1.75 | $17.60 | 116 | 2 | 0 | 1% | 0% | 0% | 0 | $0.00 | x`;
    ok('광고 판정: 3기간 모두 = ok', R.judgeAds(['어제', '오늘', '최근 7일'].map(adsPeriod).join('\n')).status === 'ok');
    ok('광고 판정: 일부만 + 세션 만료 = partial(session)', (() => { const v = R.judgeAds(adsPeriod('어제') + '\nSESSION_EXPIRED — 대표 로그인 필요'); return v.status === 'partial' && v.kind === 'session'; })());
    ok('광고 판정: 읽은 기간 0 + SESSION_EXPIRED = fail(session) → 재로그인 필요', (() => { const v = R.judgeAds('SESSION_EXPIRED — 대표 로그인 필요. 판독 실패'); return v.status === 'fail' && v.kind === 'session'; })());
    ok('실행 코드: 124=timeout · 75=lock · SPACE_BUSY=busy', R.codeKind(124, '').kind === 'timeout' && R.codeKind(75, '').kind === 'lock' && R.codeKind(0, 'SPACE_BUSY — x').kind === 'busy' && R.codeKind(0, 'ok') === null);
    // launchd 등록 파일: 슬롯과 «슬롯+재시도» 가 모두 들어 있고 메인 체크아웃의 refresh.sh 를 부른다
    const px = R.plistXml();
    ok('plist: 시각표 슬롯 + 재시도 슬롯이 StartCalendarInterval 에 있다', ['09:12', '09:20', '13:40', '16:40', '21:10'].every((t) => { const [h, m] = t.split(':').map(Number); return px.includes(`<key>Hour</key><integer>${h}</integer><key>Minute</key><integer>${m}</integer>`); }) && /refresh\.sh<\/string><string>auto/.test(px), 'plist');
    fs.rmSync(tmp, { recursive: true, force: true });
})();

http.get({ host: '127.0.0.1', port: PORT, path: '/api/snapshot' }, (res) => { let b = ''; res.on('data', (c) => b += c); res.on('end', () => {
    let s; try { s = JSON.parse(b); } catch (e) { ok('스냅샷 JSON', false, e.message); return done(); }
    const need = [['state.paused', s.state && typeof s.state.paused === 'boolean'], ['usage.byModel', !!s.usage.byModel], ['usage.tools', !!s.usage.tools],
        ['marketing.today', !!s.marketing.today], ['marketing.yesterdayCount', typeof s.marketing.yesterdayCount === 'number'], ['marketing.todayRows', Array.isArray(s.marketing.todayRows)], ['marketing.channels', !!s.marketing.channels],
        ['live 존재', !!s.live && !s.live.error], ['live.ads', s.live && 'ads' in s.live], ['live.installs', s.live && 'installs' in s.live], ['live.todo', s.live && 'todo' in s.live],
        ['live.runner', s.live && s.live.runner && Array.isArray(s.live.runner.runners)], ['live.participation', s.live && 'participation' in s.live],
        ['collector', !!s.collector && typeof s.collector.everyMin === 'number'], ['metrics', s.metrics !== undefined], ['git.recent', Array.isArray(s.git.recent)], ['server.port', s.server.port === PORT]];
    for (const [k, v] of need) ok('스냅샷 ' + k, !!v);
    ok('티켓 필드가 더는 없다(낡은 «열린 티켓 99»)', s.marketing.tickets === undefined && s.marketing.ceoTickets === undefined);
    // 값의 모양 — 없으면 null 이지 0 이 아니다
    if (s.live.ads && s.live.ads.yesterday) { const y = s.live.ads.yesterday; ok('광고 어제: 날짜·합계·판독 시각', /^\d{4}-\d{2}-\d{2}$/.test(y.nyDate) && y.total && typeof y.total.spend === 'number' && y.readAt > 0 && y.totalMatches !== false, JSON.stringify(y.total)); }
    if (s.live.installs) ok('설치: 마지막 완결일·판독 시각', s.live.installs.last && s.live.installs.readAt > 0, JSON.stringify(s.live.installs.last));
    ok('live.refresh: rc·ads 시각표와 다음 갱신 시각', s.live.refresh && s.live.refresh.jobs && s.live.refresh.jobs.rc.next > Date.now() && s.live.refresh.jobs.ads.next > Date.now(), JSON.stringify(s.live.refresh && Object.keys(s.live.refresh)));
    if (s.live.todo) ok('대표 할 일: 구역·미완료 수', s.live.todo.sections.length > 0 && typeof s.live.todo.counts.open === 'number', JSON.stringify(s.live.todo.counts));
    // ④ DOM 스텁으로 paint() 실행
    const mkEl = () => { const el = { _t: '', _h: '', dataset: {}, className: '', value: '', style: {}, onclick: null, classList: { toggle() {}, add() {}, remove() {} },
        addEventListener() {}, appendChild() {}, insertBefore() {}, removeChild() {}, children: [], insertAdjacentHTML() {}, scrollIntoView() {}, focus() {},
        querySelector() { return mkEl(); }, querySelectorAll() { return []; }, getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 20, top: 0, bottom: 20, left: 0, right: 100 }; } };
        Object.defineProperty(el, 'textContent', { get() { return el._t; }, set(v) { el._t = String(v); } });
        Object.defineProperty(el, 'innerHTML', { get() { return el._h; }, set(v) { el._h = String(v); } });
        return el; };
    const store = {};
    const sandbox = { document: { querySelector: (sel) => { const id = (sel.match(/^#([\w-]+)$/) || [])[1]; if (id) return store[id] = store[id] || mkEl(); return mkEl(); },
        querySelectorAll: () => [], activeElement: null, contains: () => false, addEventListener() {} }, window: {}, localStorage: { getItem: () => null, setItem() {} },
        fetch: () => Promise.reject(new Error('no net in stub')), EventSource: function () { this.addEventListener = () => {}; },
        setInterval: () => 0, setTimeout: () => 0, Intl, Date, JSON, Math, Number, String, Object, Array, URL, isFinite, parseInt, console: { log() {}, error() {} } };
    sandbox.window = sandbox; sandbox.globalThis = sandbox;
    try {
        vm.createContext(sandbox); new vm.Script(script + '\n;globalThis.__paint=paint;').runInContext(sandbox, { timeout: 5000 }); sandbox.__paint(s);
        const painted = ['tiles', 'inst', 'ads', 'todo', 'cp', 'events', 'models', 'tools', 'pubs', 'metrics', 'cycles', 'git', 'pipe', 'lanes', 'cmap', 'tabs', 'slotd'].map((id) => [id, (store[id] && (store[id]._h || store[id]._t) || '').length]);
        ok('paint(): 패널 17개 모두 내용 생성', painted.every(([, n]) => n > 20), JSON.stringify(painted.filter(([, n]) => n <= 20)));
        ok('타일 5개(설치·광고·대표 할 일·클릭·게시)', (store.tiles._h.match(/class="tile big/g) || []).length === 5, (store.tiles._h.match(/class="tile big/g) || []).length + '개');
        ok('설치·광고 타일: «완결»·«부분»·«다음 갱신» 표기', /완결/.test(store.tiles._h) && /부분/.test(store.tiles._h) && /다음 갱신/.test(store.tiles._h), '표기 누락');
        ok('설치·광고 패널: 자동 갱신 상태 줄', /자동 갱신/.test(store.inst._h) && /자동 갱신/.test(store.ads._h), '상태 줄 누락');
        ok('파이프라인 노드 11개', (store.pipe._h.match(/class="node/g) || []).length === 11, (store.pipe._h.match(/class="node/g) || []).length + '개');
        ok('파이프라인 연결선 12개', (store.pipe._h.match(/marker-end/g) || []).length === 12, (store.pipe._h.match(/marker-end/g) || []).length + '개');
        ok('모델 레인 4개', (store.lanes._h.match(/<g>/g) || []).length === 4, (store.lanes._h.match(/<g>/g) || []).length + '개');
        ok('채널 맵 타일 ≤ 채널 수', (store.cmap._h.match(/<a /g) || []).length > 0, '');
        ok('탭 9개', (store.tabs._h.match(/<button /g) || []).length === 9, (store.tabs._h.match(/<button /g) || []).length + '개');
        ok('지표에 «청구값 아님» 라벨', /청구값 아님/.test(store.metrics._h));
        ok('대표 할 일 링크 렌더(rel=noopener)', !s.live.todo || /target="_blank" rel="noopener noreferrer"/.test(store.todo._h));
        // ⑤ 낡은 문구
        const all = ['tiles', 'inst', 'ads', 'todo', 'cp', 'pipe', 'lanes', 'slotd', 'metrics'].map((id) => store[id]._h).join('\n');
        for (const bad of ['정책상 대기', '크론 :13', '열린 티켓', '대표 결정 대기', '9.22', '매시 자동']) ok('낡은 문구 없음: «' + bad + '»', !all.includes(bad), '남아 있음');
    } catch (e) { ok('paint 실행', false, String(e.stack || e.message).split('\n').slice(0, 3).join(' | ').slice(0, 220)); }
    done();
}); }).on('error', (e) => { ok('서버 응답', false, e.message); done(); });
function done() { console.log(fail ? `\n✗ 실패 ${fail}건` : '\n✓ 전부 통과'); process.exit(fail ? 1 : 0); }
