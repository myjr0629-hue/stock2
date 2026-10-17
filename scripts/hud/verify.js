#!/usr/bin/env node
/* 관제 v2 검증. 기본 실행은 임시 서버·원천을 사용하는 통합 검사다.
 * HUD_VERIFY_FROM_V2=1 은 통합 검사에서 기존 판독기 단위 시험만 호출한다. */
'use strict';
if (!process.env.HUD_VERIFY_FROM_V2) {
    require('./verify-v2').run().then(ok => { process.exitCode = ok ? 0 : 1; }).catch(() => {
        console.error('✗ 대시보드 시험 실행 오류'); process.exitCode = 1;
    });
} else {
const fs = require('fs'), path = require('path');
let fail = 0, count = 0;
const ok = (name, condition) => { count++; console.log((condition ? '✓ ' : '✗ ') + name); if (!condition) fail++; };
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

// ⑥-c 데이터 무결성 한 줄(loadIntegrity) — 파일 없음/정상/오류/멈춤 판정
(() => {
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-integrity-'));
    const f = path.join(tmp, 'latest.json');
    const T = Date.parse('2026-10-13T12:00:00Z');
    ok('무결성: 파일 없음 → none', S.loadIntegrity({ file: f, now: T }).state === 'none');
    fs.writeFileSync(f, JSON.stringify({ at: T - 5 * 60e3, line: '데이터 무결성: 정상 40 / 오류 0', ok: 40, symbols: 40, errors: 0, errorSymbols: 0, errorList: [] }));
    ok('무결성: 5분 전 · 오류 0 → ok', S.loadIntegrity({ file: f, now: T }).state === 'ok');
    fs.writeFileSync(f, JSON.stringify({ at: T - 5 * 60e3, line: 'x', ok: 38, symbols: 40, errors: 2, errorSymbols: 2, errorList: [{ sym: 'MSTR', door: 'screen:flow', code: 'CLOSE_PRICE', field: 'displayPrice', msg: '종가 아님' }] }));
    const e = S.loadIntegrity({ file: f, now: T });
    ok('무결성: 오류 있음 → err · 목록 보존', e.state === 'err' && e.errorList.length === 1 && e.errorList[0].sym === 'MSTR', JSON.stringify(e).slice(0, 120));
    ok('무결성: 41분 전 → stale(오류가 있어도 멈춤 의심이 먼저)', S.loadIntegrity({ file: f, now: T + 36 * 60e3 }).state === 'stale');
    fs.writeFileSync(f, '{깨짐');
    ok('무결성: 깨진 파일 → broken', S.loadIntegrity({ file: f, now: T }).state === 'broken');
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
    // App Store 분석(asc) 판정 — ego 출력의 마지막 «ASC_DATA {json}» 줄이 본체. 로그인·공간 점유·소스 비어 있음·부분 실패를 가린다.
    const ascOut = (o) => '[3s] 공간 0\nASC_DATA ' + JSON.stringify(o);
    const ascOk = { ok: true, days: ['2026-10-11', '2026-10-12', '2026-10-13'], latestDay: '2026-10-12', yesterdayUtc: '2026-10-12', total: { units: [1, 24, 0] },
        bySource: { units: [{ key: 'WebRef', title: '웹 추천 방문', tot: 10, v: [0, 10, 0] }, { key: 'Search', title: 'App Store 검색', tot: 6, v: [0, 6, 0] }, { key: 'Other', title: 'App Store 탐색', tot: 7, v: [0, 7, 0] }] }, fails: [] };
    const va = R.judgeAsc(ascOut(ascOk));
    ok('ASC 판정: 정상 = ok · 요약에 UTC 날짜·합계·소스별(웹 10·탐색 7·검색 6)', va.status === 'ok' && /UTC 10-12 첫 다운로드 24 \(웹 10·탐색 7·검색 6\)/.test(va.msg) && va.data && va.data.latestDay === '2026-10-12', JSON.stringify(va).slice(0, 200));
    ok('ASC 판정: 일부 호출 실패 = partial(원천 파일은 쓴다)', R.judgeAsc(ascOut(Object.assign({}, ascOk, { fails: ['cpp_list: 500'] }))).status === 'partial');
    ok('ASC 판정: SIGNIN(줄·JSON 둘 다) = fail(signin) → 재로그인 필요 · 재시도 안 함 종류', R.judgeAsc('SIGNIN — App Store Connect 로그인 화면').kind === 'signin' && R.judgeAsc(ascOut({ ok: false, error: 'SIGNIN' })).kind === 'signin');
    ok('ASC 판정: SPACE_BUSY = busy(대표 브라우저를 되찾지 않는다)', R.judgeAsc(ascOut({ ok: false, error: 'SPACE_BUSY' })).status === 'busy');
    ok('ASC 판정: 소스 시계열 실패 = fail(옛 정상 파일을 덮지 않는다) · ASC_DATA 줄 없음 = parse', R.judgeAsc(ascOut({ ok: false, error: 'SOURCE_EMPTY — x' })).status === 'fail' && R.judgeAsc('[3s] 공간 0').kind === 'parse');
    ok('ASC 판정: 화면 가로채기 실패(NO_HEADERS) = page', R.judgeAsc(ascOut({ ok: false, error: 'NO_HEADERS — 분석 API 요청 가로채기 실패' })).kind === 'page');
    // launchd 등록 파일: 슬롯과 «슬롯+재시도» 가 모두 들어 있고 메인 체크아웃의 refresh.sh 를 부른다
    const px = R.plistXml();
    ok('plist: 시각표 슬롯 + 재시도 슬롯이 StartCalendarInterval 에 있다', ['09:12', '09:20', '13:40', '16:40', '21:10'].every((t) => { const [h, m] = t.split(':').map(Number); return px.includes(`<key>Hour</key><integer>${h}</integer><key>Minute</key><integer>${m}</integer>`); }) && /refresh\.sh<\/string><string>auto/.test(px), 'plist');
    ok('plist: App Store 분석 09:40·17:40 + 재시도 10:05·18:05 가 들어 있다', ['09:40', '10:05', '17:40', '18:05'].every((t) => { const [h, m] = t.split(':').map(Number); return px.includes(`<key>Hour</key><integer>${h}</integer><key>Minute</key><integer>${m}</integer>`); }));
    ok('시각표: asc = [09:40, 17:40] · RevenueCat(:02·:17·:32·:47)·광고 슬롯과 겹치지 않는다(ego 잠금)', JSON.stringify(S.loadSchedule().asc) === '["09:40","17:40"]' && S.loadSchedule().asc.every((t) => !S.loadSchedule().rc.includes(t) && !S.loadSchedule().ads.includes(t)), JSON.stringify(S.loadSchedule().asc));
    fs.rmSync(tmp, { recursive: true, force: true });
})();

// ⑥-c «한눈에» 첫 화면 단위 시험(2026-10-12) — 하루 기준·시험 고객·광고 완결·공개 글·신규 체험. 고정 입력·고정 시각.
(() => {
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-brief-'));
    const wd = path.join(tmp, 'work', '2026-10-12', 'report'); fs.mkdirSync(wd, { recursive: true });
    const D = '"dates":["Oct 05 \'26","Oct 11 \'26","Oct 12 \'26","Row Average"]';
    fs.writeFileSync(path.join(wd, 'rc.log'), '읽음: 2026-10-12T13:00:00.000Z\n'
        + '플랫폼별(ok): {"labels":["Segments","Total","iOS","Android"],' + D + ',"rows":[["14","2","20","12"],["5","1","18","8"],["9","1","2","4"]]}\n'
        + '신규체험(ok): {"labels":["","New Trials"],' + D + ',"rows":[["0","0","8","3"]]}\n');
    const I = S.loadInstalls({ work: path.join(tmp, 'work') });
    ok('설치: 시험 고객은 «원본 − 시험 = 실제»(10/5 안드 9 중 7 시험 → 실제 2)', I && I.days[0].test === 7 && I.days[0].real.android === 2 && I.days[0].real.total === 7 && I.days[0].total === 14, JSON.stringify(I && I.days[0]));
    ok('설치: 신규 체험(코드 사용) 열을 날짜별로 읽는다', I && I.trialsRead && I.days[2].trials === 8 && I.days[1].trials === 0, JSON.stringify(I && I.days.map((d) => d.trials)));
    const B = S.buildBrief({ installs: I, now: Date.parse('2026-10-12T13:30:00Z') });
    ok('첫 화면 설치: 오늘 = UTC 하루 진행분(20) · 아이폰 18 · 안드 2 · 목표 100 의 20%', B.installs.state === 'ok' && B.installs.today.total === 20 && B.installs.today.ios === 18 && B.installs.today.android === 2 && B.installs.pct === 20 && B.installs.goal === 100, JSON.stringify(B.installs.today));
    ok('첫 화면 설치: 하루 경과·남은 시간(UTC 00:00 기준 13.5시간)', Math.abs(B.installs.elapsedMs - 13.5 * 3600e3) < 1000 && Math.abs(B.installs.leftMs - 10.5 * 3600e3) < 1000);
    ok('첫 화면 설치: 어제 완결(2) · 완결일 합은 시험 제외(14−7+2=9, 원본 16)', B.installs.yesterday && B.installs.yesterday.total === 2 && B.installs.week7.total === 9 && B.installs.weekRaw === 16 && B.installs.stale === false, JSON.stringify(B.installs.week7));
    ok('첫 화면 코드 사용: 오늘 8 · 신규의 40%', B.codes.state === 'ok' && B.codes.today === 8 && B.codes.pctOfInstalls === 40, JSON.stringify(B.codes));
    const Bp = S.buildBrief({ installs: I, now: Date.parse('2026-10-13T00:05:00Z') });
    ok('UTC 자정 직후: 옛 판독을 «오늘»로 쓰지 않는다(pending) · 어제 열은 완결이 아니라 부분', Bp.installs.state === 'pending' && Bp.installs.today === null && Bp.installs.yesterday === null && Bp.installs.yesterdayPartial && Bp.installs.yesterdayPartial.total === 20, JSON.stringify([Bp.installs.state, Bp.installs.yesterdayPartial]));
    ok('UTC 자정 직후: 코드 사용도 오늘 값을 지어내지 않는다', Bp.codes.today === null, JSON.stringify(Bp.codes));
    const Bs = S.buildBrief({ installs: I, now: Date.parse('2026-10-12T14:30:00Z') });
    ok('판독이 40분을 넘으면 stale', Bs.installs.stale === true && Bs.health[0].state === 'stale');
    const Bf = S.buildBrief({ installs: I, now: Date.parse('2026-10-12T13:30:00Z'), refresh: { jobs: { rc: { lastFailAt: Date.parse('2026-10-12T13:20:00Z'), lastOkAt: Date.parse('2026-10-12T13:00:00Z'), kind: 'signin', msg: 'x', streak: 1 } } } });
    ok('판독 실패(로그인 필요)는 fail 로 표시 · 옛 값에 새 값 표식을 달지 않는다', Bf.installs.fail && Bf.installs.fail.login === true && Bf.health[0].state === 'fail');
    // App Store 분석(ASC) — 파일 없음/정상/어제 집계 전/로그인 만료
    const af = path.join(tmp, 'hud-asc.json');
    ok('ASC: 파일 없음 → none(지어내지 않는다)', S.loadAsc({ file: af }).state === 'none');
    const days = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
    const ser = (a) => a.concat(Array(days.length - a.length).fill(0));
    fs.writeFileSync(af, JSON.stringify({ ok: true, readAt: Date.parse('2026-10-14T00:40:00Z'), at: 0, days, latestDay: '2026-10-12', yesterdayUtc: '2026-10-13', total: { units: ser([3, 4, 3, 0, 5, 2, 0, 1, 24]) },
        bySource: { units: [{ key: 'Search', title: 'App Store 검색', tot: 6, v: ser([0, 0, 0, 0, 0, 0, 0, 0, 6]) }, { key: 'WebRef', title: '웹 추천 방문', tot: 10, v: ser([0, 0, 0, 0, 0, 0, 0, 0, 10]) }, { key: 'Other', title: 'App Store 탐색', tot: 7, v: ser([0, 0, 0, 0, 0, 0, 0, 0, 7]) }, { key: 'AppRef', title: '앱 추천 방문', tot: 1, v: ser([0, 0, 0, 0, 0, 0, 0, 0, 1]) }],
            pageViewUnique: [{ key: 'WebRef', title: '', tot: 21, v: ser([0, 0, 0, 0, 0, 0, 0, 0, 21]) }], impressions: [] },
        byStore: { units: [{ key: '143441', title: '미국', tot: 5, v: ser([0, 0, 0, 0, 0, 0, 0, 0, 5]) }, { key: '143466', title: '대한민국', tot: 18, v: ser([0, 0, 0, 0, 0, 0, 0, 0, 18]) }] },
        campaigns: { units: [{ key: 'clien', title: 'clien', tot: 7, v: ser([0, 0, 0, 0, 0, 0, 0, 0, 7]) }], pageViewUnique: [{ key: 'clien', tot: 11, v: ser([0, 0, 0, 0, 0, 0, 0, 0, 11]) }], impressions: [] },
        offers: { total: 10, daily: ser([0, 0, 0, 0, 0, 0, 0, 0, 10]) }, domainReferrer: { d30: { meetsThreshold: false, rows: [] } }, ppo: [], cpp: [], fails: [] }));
    const AS = S.loadAsc({ file: af, now: Date.parse('2026-10-14T01:00:00Z') });
    ok('ASC: 가장 최근 집계일 10/12 의 합 24 · 소스 큰 순(웹 10·탐색 7·검색 6·앱 1) · 국가 한국 18 먼저', AS.state === 'ok' && AS.latestDay === '2026-10-12' && AS.total === 24 && AS.sources.map((x) => x.label + x.units).join() === '웹 추천10,탐색7,검색6,앱 추천1' && AS.countries[0].name === '대한민국' && AS.countries[0].units === 18, JSON.stringify(AS.sources));
    ok('ASC: 캠페인 clien 7 · 오퍼 시작 10 · 직전 7일 평균 · 웹 도메인 안 보임 표시', AS.campaigns[0].id === 'clien' && AS.campaigns[0].units === 7 && AS.offerStarts === 10 && AS.prev7 === 2.1 && AS.domainsHidden === true, JSON.stringify([AS.campaigns, AS.offerStarts, AS.prev7]));
    ok('ASC: 어제(UTC 10/13)가 아직 집계 전이면 ready=false(어제인 척하지 않는다) · 집계됐으면 true', AS.ready === false && AS.wantDay === '2026-10-13' && S.loadAsc({ file: af, now: Date.parse('2026-10-13T10:00:00Z') }).ready === true);
    ok('ASC: 18시간 넘으면 stale', S.loadAsc({ file: af, now: Date.parse('2026-10-14T19:00:00Z') }).stale === true && AS.stale === false);
    const Ba = S.buildBrief({ installs: I, asc: AS, now: Date.parse('2026-10-14T01:00:00Z'), refresh: { schedule: { asc: ['09:40', '17:40'] }, jobs: { asc: { lastFailAt: Date.parse('2026-10-14T00:50:00Z'), lastOkAt: Date.parse('2026-10-13T08:40:00Z'), kind: 'signin', msg: 'x', streak: 1, next: 1 } } } });
    ok('ASC 판독 실패(로그인 필요) = fail(login) · 마지막 정상 값은 그대로 · 원천 상태줄에 «App Store 분석» fail', Ba.asc.fail && Ba.asc.fail.login === true && Ba.asc.state === 'ok' && Ba.asc.total === 24 && Ba.health.some((h) => h.label === 'App Store 분석' && h.state === 'fail'), JSON.stringify(Ba.health.map((h) => [h.label, h.state])));
    ok('ASC: 판독 파일이 없으면 brief.asc 는 none · 실패도 없음', S.buildBrief({ installs: I, asc: S.loadAsc({ file: path.join(tmp, 'zz.json') }), now: Date.parse('2026-10-14T01:00:00Z') }).asc.state === 'none');
    // 광고: 뉴욕 어제 «완결» 은 뉴욕 자정 + 3시간 뒤에 읽어야 한다(콘솔이 최근 3시간을 반영 못 함)
    const mkAds = (iso) => { const root = fs.mkdtempSync(path.join(tmp, 'ads-')); const dd = path.join(root, '2026-10-12'); fs.mkdirSync(dd);
        const f = path.join(dd, 'ads-periods-1341.log'); fs.writeFileSync(f, ['[어제] 기간 표시=[]', '  SIGNUM JP - Search Results - Exact 실행 중    지출 $5.19    노출 358     탭 4   설치 0  CPA $0.00 · CPT $1.30', '  합계=합계 | $5.19 | $0.00 | $1.30 | $13.98 | 358 | 4 | 0 | 1% | 0% | 0% | 0 | $0.00 | x'].join('\n'));
        const t = new Date(iso); fs.utimesSync(f, t, t); return S.loadAds({ egoRoot: root, daysBack: 400 }); };
    const early = mkAds('2026-10-12T04:41:00Z'), late = mkAds('2026-10-12T07:30:00Z');
    ok('광고 어제: 뉴욕 00:41 에 읽으면 «완결 아님»(약 2.3시간 미반영)', early.yesterday && early.yesterday.complete === false && Math.abs(early.yesterday.missingH - 2.3) < 0.06, JSON.stringify(early.yesterday && [early.yesterday.complete, early.yesterday.missingH]));
    ok('광고 어제: 뉴욕 03:30 에 읽으면 완결', late.yesterday && late.yesterday.complete === true && late.yesterday.missingH === 0);
    ok('뉴욕 자정(한국 시각): 10/12 = UTC 04:00(한국 13:00) · 11/2 = UTC 05:00(한국 14:00)', S.nyMidnightMs('2026-10-12') === Date.parse('2026-10-12T04:00:00Z') && S.nyMidnightMs('2026-11-02') === Date.parse('2026-11-02T05:00:00Z'));
    // 게시: 내부 기록은 글이 아니다
    ok('공개 글 판정: 글 O · 스토어 문구 교체·로컬 문서·색인 요청 X', S.isPublicPost({ ch: 'x_post', url: 'https://x.com/a/status/1' }) && !S.isPublicPost({ ch: 'diff_kit_1012', url: 'file:///Users/x/a.md' }) && !S.isPublicPost({ ch: 'diff_kit_1012', url: 'https://apps.apple.com/kr/app/id1' }) && !S.isPublicPost({ ch: 'indexnow', url: 'https://x' }));
    const Bm = S.buildBrief({ installs: I, now: Date.parse('2026-10-12T13:30:00Z'), marketing: { today: '2026-10-12', todayCount: 3, todayPublic: 1, todayByPublic: { x_post: 1 }, yesterdayCount: 4, yesterdayPublic: 4, todayRows: [{ ch: 'x_post', url: 'https://x.com/a', at: '2026-10-12T05:00:00Z' }, { ch: 'diff_kit_1012', url: 'file:///a.md', at: '2026-10-12T06:00:00Z' }] } });
    ok('첫 화면 게시: 외부 공개분만(장부 3건 중 1건) · 최근 글에 내부 기록이 없다', Bm.posts.count === 1 && Bm.posts.ledgerCount === 3 && Bm.posts.recent.length === 1 && Bm.posts.recent[0].ch === 'x_post', JSON.stringify(Bm.posts));
    // 구글 광고: 판독기 없으면 «준비 중», 파일이 있으면 숫자
    ok('구글 광고: 판독 파일이 없으면 pending(지어내지 않는다)', S.loadGoogleAds({ file: path.join(tmp, 'none.json') }).state === 'pending');
    const gf = path.join(tmp, 'g.json'); fs.writeFileSync(gf, JSON.stringify({ at: Date.parse('2026-10-12T13:00:00Z'), day: '2026-10-12', spendKrw: 7000, installs: 2, clicks: 30, impressions: 900 }));
    const G = S.loadGoogleAds({ file: gf, now: Date.parse('2026-10-12T13:10:00Z') });
    ok('구글 광고: 지출 ₩7,000 · 설치 2 → 설치당 ₩3,500', G.state === 'ok' && G.read.cpiKrw === 3500, JSON.stringify(G.read));
    // 할 일: 제목 줄만 5개
    const td = S.parseTodo('# 제목 (2026-10-12 22:00 KST)\n\n## 0. 첫째 — 설명 [링크](https://a.example)\n- 세부\n\n## 1. 둘째\n- [ ] x\n\n## 2. 셋째\n- [ ] y\n\n## 3. 넷째\n- [ ] z\n\n## 4. 다섯째\n- [ ] w\n\n## 5. 여섯째\n- [ ] v\n\n## 대기 중(할 일 없음)\n- 기다림\n');
    const Bt = S.buildBrief({ installs: I, todo: Object.assign(td, { at: 1, fileAt: 1 }), now: Date.parse('2026-10-12T13:30:00Z') });
    ok('첫 화면 할 일: 제목 줄만 5개 · 마크다운 링크는 글자만', Bt.todo.items.length === 5 && Bt.todo.total === 6 && Bt.todo.items[0].h === '0. 첫째 — 설명 링크', JSON.stringify(Bt.todo.items[0]));
    fs.rmSync(tmp, { recursive: true, force: true });
})();


console.log(`기존 판독기 단위 검사 ${count}건 · 실패 ${fail}건`);
process.exitCode = fail ? 1 : 0;
}
