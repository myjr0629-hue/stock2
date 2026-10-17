'use strict';
// 합성 rc.log·개요·장부만 읽는다. 브라우저·운영 파일·외부 서비스 접근 없음.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const SRC = require('./sources');
const V = require('./v2-sources');
const now = Date.parse('2026-10-17T11:35:00Z');
function fixture(fn) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-round5-'));
    const o = { home, root: home, work: path.join(home, 'work'), now, run: () => '' };
    const write = (name, value) => { const file = path.join(home, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); fs.utimesSync(file, now / 1000, now / 1000); return file; };
    try { return fn(o, write); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
function screen() {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), nodes = {};
    for (const m of html.matchAll(/id="([^"]+)"/g)) nodes[m[1]] = { innerHTML: '', textContent: '', dataset: {}, addEventListener() {}, setAttribute() {}, classList: { toggle() {} } };
    const c = { document: { querySelector: s => nodes[s.slice(1)], querySelectorAll: () => [], addEventListener() {} }, location: { hash: '' }, history: { replaceState() {} }, URL, Date, Intl, setInterval() {}, addEventListener() {}, fetch: () => new Promise(() => {}) };
    c.window = c; vm.createContext(c);
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if (!/src=/.test(m[1])) vm.runInContext(m[2], c);
    return s => { c.s = { now: new Date(now).toISOString(), ...s }; vm.runInContext('renderDashboard(s)', c); return nodes['dashboard-content'].innerHTML; };
}
const section = (html, period) => html.match(new RegExp('<section[^>]*data-period="' + period + '">([\\s\\S]*?)</section>'))?.[1] || '';
function card(html, title) {
    const result = [...html.matchAll(/<article class="card[^"]*">[\s\S]*?<\/article>/g)].find(m => m[0].includes('class="kpi-title">' + title + '<'));
    assert.ok(result, '카드 있음: ' + title); return result[0];
}
const value = (html, title) => card(html, title).match(/class="kpi-value(?: pending)?">([^<]*)<\/div>/)[1];
function sample(o, w) {
    const dates = Array.from({ length: 14 }, (_, i) => `Oct ${String(i + 4).padStart(2, '0')} '26`);
    const rows = [dates.map(() => '9'), dates.map(() => '7'), dates.map(() => '2')];
    w('work/2026-10-17/report/rc.log', '읽음: ' + new Date(now).toISOString() + '\n플랫폼별: ' + JSON.stringify({ dates, labels: ['Total', 'iOS', 'Android'], rows }) + '\n신규체험(ok): ' + JSON.stringify({ dates, labels: ['Total'], rows: [dates.map(() => '4')] }));
    const overviewFile = w('work/2026-10-17/report/rc-overview.json', { schemaVersion: 1, readAt: new Date(now).toISOString(), period: 'Last 28 days', metrics: Object.fromEntries([['New Customers', 214], ['Active Trials', 29], ['Active Subscriptions', 3], ['MRR', 21], ['Revenue', 45]].map(([k, value]) => [k, { value, display: k === 'MRR' || k === 'Revenue' ? '$' + value : String(value) }])) });
    const redeemFile = w('redeem-summary.json', { schemaVersion: 1, basis: 'ledger_comment_confirmation', readAt: new Date(now).toISOString(), platforms: { ios: { distributed: 385, confirmedUsed: 8, today: 2, remaining: 615 }, android: { distributed: null, confirmedUsed: null, today: 1, remaining: 56 } } });
    const ascFile = w('asc.json', { ok: true, readAt: now, days: ['2026-10-15', '2026-10-17'], latestDay: '2026-10-15', bySource: { units: [{ key: 'Search', v: [3, 1], tot: 15 }] }, offers: { daily: [6, 2], dailyObserved: [true, true], total: 30 } });
    const ledgerFile = w('PUBLISH-LEDGER.json', [
        { ch: 'note_jp', at: '2026-10-16T15:10:00Z', url: 'https://example.org/a' },
        { ch: 'note_jp', at: '2026-10-17T03:00:00Z', url: 'https://example.org/b' },
        { ch: 'x_post', at: '2026-10-17T04:00:00Z', url: 'https://example.org/c' },
        { ch: 'medium', at: '2026-10-16T14:59:59Z', url: 'https://example.org/d' },
        { ch: 'medium', at: '2026-10-03T14:59:59Z', url: 'https://example.org/old' },
        { ch: 'indexnow', at: '2026-10-17T04:00:00Z', url: 'https://example.org/index' },
        { ch: 'x_post', at: '2026-10-17T04:00:00Z', url: 'https://apps.apple.com/app/test' },
    ]);
    const queueLog = w('QUEUE-LOG.tsv', '10-17 20:00\tSTART sample\n10-17 20:05\tDONE sample rc=0\n10-17 20:06\tDONE sample2 rc=0\n10-16 20:06\tDONE old rc=0\n');
    const integrity = { merges: [{ at: '2026-10-17T02:00:00Z' }], mergesReadAt: now, gateSummaryToday: { passed: 1, held: 1 } };
    const installs = SRC.loadInstalls(o), rcOverview = SRC.loadRcOverview({ ...o, file: overviewFile }), redeemSummary = SRC.loadRedeemSummary({ ...o, file: redeemFile }), asc = SRC.loadAsc({ ...o, file: ascFile });
    const performance = V.loadPerformance({ ...o, installs, rcOverview, redeemSummary }), publishing = V.loadPublishing({ ...o, file: ledgerFile }), work = V.loadWork({ ...o, file: queueLog, publishing, integrity });
    return { installs, performance, asc, rcOverview, redeemSummary, ascFile, snapshot: { now: new Date(now).toISOString(), live: { asc, installs, rcOverview, redeemSummary }, brief: SRC.buildBrief({ installs, asc, now }), v2: { performance, publishing, work } } };
}
test('오늘 rc.log 전체·체험 열과 Overview 28일·현재 체험을 분리', () => fixture((o, w) => {
    const x = sample(o, w), html = screen()(x.snapshot), today = section(html, 'today'), history = section(html, 'history');
    assert.equal(x.performance.rcToday.customers, 9); assert.equal(x.performance.rcToday.trials, 4);
    assert.equal(value(today, '오늘 신규 고객'), '9'); assert.equal(value(today, '오늘 체험 시작'), '4');
    assert.equal(value(history, '신규 고객(28일)'), '214'); assert.equal(value(history, '유료 구독 활성'), '3');
    for (const text of ['체험 중 <b>29</b>', '$21', '$45', 'Last 28 days']) assert.ok(history.includes(text), text);
    assert.ok(!today.includes('>214<') && !today.includes('>29<'));
}));
test('설치는 시험 고객 제외·14일 합계·직전 완결 7일 평균·진행 중 표시', () => fixture((o, w) => {
    const x = sample(o, w), html = screen()(x.snapshot);
    const expected = x.installs.historyDays.reduce((n, d) => n + d.real.total, 0);
    assert.equal(x.performance.installs.total14, expected);
    assert.equal(value(section(html, 'history'), '기간 신규 설치'), String(expected));
    assert.equal(value(section(html, 'today'), '오늘 신규 설치'), String(x.installs.historyDays.at(-1).real.total));
    assert.ok(card(html, '오늘 신규 설치').includes('하루 진행 중'));
    assert.ok(card(html, '기간 신규 설치').includes('직전 완결 7일 평균 <b>' + x.performance.installs.avg7 + '</b>'));
    const incomplete = V.loadPerformance({ ...o, installs: { ...x.installs, historyDays: x.installs.historyDays.slice(1) } });
    assert.equal(incomplete.installs.total14, null);
    const shortWeek = V.loadPerformance({ ...o, installs: { ...x.installs, historyDays: x.installs.historyDays.filter(d => d.date !== '2026-10-15') } });
    assert.equal(shortWeek.installs.avg7, null);
}));
test('애플 오늘 열 2·최신 집계일 6·30일 30·장부 배포3·확인 누적8은 별개', () => fixture((o, w) => {
    const x = sample(o, w), html = screen()(x.snapshot), today = section(html, 'today'), history = section(html, 'history');
    assert.equal(value(today, '오늘 리딤 사용'), '2');
    assert.match(card(today, '오늘 리딤 사용'), /장부 오늘 배포 <b>3<\/b>/);
    assert.match(card(today, '오늘 리딤 사용'), /장부 오늘 확인 <b>판독 대기<\/b>/);
    assert.equal(value(history, '리딤 코드 사용'), '30');
    for (const text of ['아이폰 배포 누적 <b>385</b>', '안드로이드 배포 누적 <b>판독 대기</b>', '남은 배포 장수 <b>671</b>', '아이폰 확인 <b>8</b>', '집계일 2026-10-15']) assert.ok(history.includes(text), text);
}));
test('게시 한국 날짜 경계·채널 중복·비공개/스토어/색인 제외·14일 합계', () => fixture((o, w) => {
    const x = sample(o, w), html = screen()(x.snapshot);
    assert.equal(x.snapshot.v2.work.posts, 3); assert.equal(x.snapshot.v2.work.platformCount, 2);
    assert.equal(value(section(html, 'today'), '오늘 게시'), '3');
    assert.match(card(html, '오늘 게시'), /게시 플랫폼 <b>2<\/b>/);
    assert.equal(value(section(html, 'history'), '기간 게시'), '4');
}));
test('코덱스 완료·병합 수와 광고 원화/달러의 뉴욕 오늘 날짜를 보존', () => fixture((o, w) => {
    const { snapshot } = sample(o, w);
    snapshot.live.ads = { today: { nyDate: '2026-10-17', total: { spend: 1.5 }, readAt: now } };
    snapshot.live.google = { read: { day: '2026-10-17', spendKrw: 3456, at: now } };
    const today = section(screen()(snapshot), 'today');
    assert.equal(value(today, '오늘 코덱스 처리'), '2'); assert.match(card(today, '오늘 코덱스 처리'), /운영 병합 <b>1<\/b>/);
    assert.equal(value(today, '오늘 광고 지출'), '1.5'); assert.match(card(today, '오늘 광고 지출'), /3,456<\/b>원/);
    snapshot.live.ads.today.nyDate = '2026-10-16'; snapshot.live.google.read.day = '2026-10-16';
    const old = card(screen()(snapshot), '오늘 광고 지출'); assert.ok(!old.includes('>1.5<') && !old.includes('3,456'));
}));
test('오늘 먼저·전체 기간 다음·12개 카드의 기간 칩·기존 상세/조작/메모 유지', () => fixture((o, w) => {
    const html = screen()(sample(o, w).snapshot), today = section(html, 'today'), history = section(html, 'history');
    assert.ok(html.indexOf('data-period="today"') < html.indexOf('data-period="history"'));
    assert.match(today, /오늘\(10\/17 기준\)/); assert.match(history, /전체 기간/);
    assert.equal((today.match(/period-chip/g) || []).length, 7); assert.equal((history.match(/period-chip/g) || []).length, 5);
    for (const text of ['최근 14일 신규 설치', '설치 출처', '작동 상태', '오늘의 작업', '운영 조작', 'data-control="paused"', 'data-control="noPublish"']) assert.ok(html.includes(text), text);
    const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'); assert.ok(page.includes('id="control-note"') && page.includes('data-control="note"'));
    assert.ok(!/<script[^>]+src="https?:\/\//.test(page));
}));
test('원천 누락은 오늘/기간 모두 대기, 실측 0은 보존', () => fixture((o, w) => {
    const empty = screen()({}), daily = section(empty, 'today'), history = section(empty, 'history');
    for (const title of ['오늘 신규 설치', '오늘 리딤 사용', '오늘 신규 고객', '오늘 체험 시작', '오늘 게시', '오늘 코덱스 처리', '오늘 광고 지출']) assert.equal(value(daily, title), '판독 대기');
    for (const title of ['기간 신규 설치', '리딤 코드 사용', '신규 가입자', '유료 구독 활성', '기간 게시']) assert.equal(value(history, title), '판독 대기');
    assert.ok(!/undefined|NaN|Infinity/.test(empty));
    const { snapshot } = sample(o, w); snapshot.v2.performance.rcToday.customers = 0; snapshot.v2.performance.rcToday.trials = 0; snapshot.live.asc.offerStartsToday = 0;
    const zero = section(screen()(snapshot), 'today');
    for (const title of ['오늘 신규 고객', '오늘 체험 시작', '오늘 리딤 사용']) assert.equal(value(zero, title), '0');
}));
test('오늘 체험 열 없음은 현재 체험29·리딤30으로 보충하지 않음', () => fixture((o, w) => {
    const x = sample(o, w), file = path.join(o.work, '2026-10-17/report/rc.log');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').split('\n').filter(l => !l.startsWith('신규체험')).join('\n'));
    x.snapshot.v2.performance = V.loadPerformance({ ...o, installs: SRC.loadInstalls(o), rcOverview: x.rcOverview });
    assert.equal(value(section(screen()(x.snapshot), 'today'), '오늘 체험 시작'), '판독 대기');
}));
test('원천 기간 미관측은 28일을 만들지 않고 원문 기간과 판독 지연을 보존', () => fixture((o, w) => {
    const { snapshot } = sample(o, w); snapshot.v2.performance.registrations.period = null; snapshot.v2.performance.paid.period = '사용자 지정 기간'; snapshot.v2.performance.paid.stale = true;
    const history = section(screen()(snapshot), 'history'); assert.equal(value(history, '신규 고객'), '214');
    assert.match(card(history, '신규 고객'), /기간 판독 대기/);
    assert.match(card(history, '유료 구독 활성'), /사용자 지정 기간/); assert.match(card(history, '유료 구독 활성'), /판독 지연/);
}));
test('애플 오늘 열 없음·빈칸·null은 대기, 측정된 0만 0', () => fixture((o, w) => {
    const x = sample(o, w), original = JSON.parse(fs.readFileSync(x.ascFile));
    for (const v of [null, '', undefined, 0, '0']) {
        const j = { ...original, offers: { daily: v === undefined ? [6] : [6, v], dailyObserved: [true, v === 0 || v === '0'], total: 30 } };
        fs.writeFileSync(x.ascFile, JSON.stringify(j)); const asc = SRC.loadAsc({ ...o, file: x.ascFile });
        assert.equal(asc.offerStartsToday, v === 0 || v === '0' ? 0 : null); assert.equal(asc.offerStarts, 6); assert.equal(asc.offerStarts30, 30);
    }
}));
test('한국 자정 뒤 UTC 오늘 유지·장부 어제 배포 재사용 금지·뉴욕 오늘 별도', () => fixture((o, w) => {
    const { snapshot } = sample(o, w); snapshot.now = '2026-10-17T15:30:00Z';
    snapshot.live.ads = { today: { nyDate: '2026-10-17', total: { spend: 0 } } };
    const html = screen()(snapshot), today = section(html, 'today'); assert.match(today, /오늘\(10\/18 기준\)/);
    assert.equal(value(today, '오늘 신규 고객'), '9'); assert.equal(value(today, '오늘 리딤 사용'), '2');
    assert.match(card(today, '오늘 리딤 사용'), /장부 오늘 배포 <b>판독 대기<\/b>/);
    assert.equal(value(today, '오늘 게시'), '0'); assert.equal(value(today, '오늘 코덱스 처리'), '판독 대기'); assert.equal(value(today, '오늘 광고 지출'), '0');
}));
test('UTC 자정 뒤 rc.log/애플 어제 값은 오늘 대기·기간 개요는 유지', () => fixture((o, w) => {
    const x = sample(o, w), later = Date.parse('2026-10-18T00:05:00Z');
    const perf = V.loadPerformance({ ...o, now: later, installs: x.installs, rcOverview: x.rcOverview, redeemSummary: x.redeemSummary });
    x.snapshot.now = new Date(later).toISOString(); x.snapshot.v2.performance = perf;
    const html = screen()(x.snapshot), today = section(html, 'today');
    for (const title of ['오늘 신규 설치', '오늘 신규 고객', '오늘 체험 시작', '오늘 리딤 사용']) assert.equal(value(today, title), '판독 대기');
    assert.equal(value(section(html, 'history'), '신규 고객(28일)'), '214');
}));
test('설치 출처 실패 알림은 다음 성공 상태/더 늦은 성공 원천에서 해제', () => fixture((o, w) => {
    const x = sample(o, w), render = screen(), failedAt = now - 1000, refresh = { jobs: { asc: { lastOkAt: now - 3000, lastFailAt: failedAt, kind: 'signin' } } };
    const renderAsc = (asc, refreshState = refresh) => { const brief = SRC.buildBrief({ asc, refresh: refreshState, now }); return { brief, html: render({ brief, live: { asc } }) }; };
    const failed = renderAsc({ ...x.asc, readAt: now - 2000 }); assert.ok(failed.brief.asc.fail); assert.match(failed.html, /설치 출처 판독 실패/);
    const recovered = renderAsc(x.asc); assert.equal(recovered.brief.asc.fail, null); assert.ok(!recovered.html.includes('설치 출처 판독 실패')); assert.ok(!recovered.html.includes('설치 출처 판독 지연'));
    assert.equal(recovered.brief.health.find(x => x.label === 'App Store 분석').state, 'ok');
    const freshState = renderAsc(x.asc, { jobs: { asc: { lastOkAt: now, lastFailAt: failedAt } } }); assert.ok(!freshState.html.includes('설치 출처 판독 실패'));
    const nextFailure = renderAsc(x.asc, { jobs: { asc: { lastOkAt: now, lastFailAt: now + 1 } } }); assert.match(nextFailure.html, /설치 출처 판독 실패/);
    const broken = renderAsc({ ...x.asc, state: 'err' }); assert.match(broken.html, /설치 출처 판독 실패/);
}));

test('실제 애플 판독 블록은 누락/null/비수치/임계값 미달을 0으로 채우지 않음', () => {
    const source = fs.readFileSync(path.join(__dirname, 'asc-read.mjs'), 'utf8');
    const block = source.slice(source.indexOf('    const od = B.offer_day'), source.indexOf('    // CPP —'));
    const run = (rows, meetsThreshold = true) => {
        const R = {}, B = { offer_day: { results: [{ total: 7, meetsThreshold, data: rows }] }, offer_id: { __err: true }, offer_store: { __err: true }, offer_src: { __err: true } };
        vm.runInNewContext(block, { R, B, days: ['2026-10-15', '2026-10-16', '2026-10-17'] }); return JSON.parse(JSON.stringify(R.offers));
    };
    assert.deepEqual(run([{ date: '2026-10-15', value: 0 }, { date: '2026-10-16', value: 7 }]).daily, [0, 7, null]);
    assert.deepEqual(run([{ date: '2026-10-15', value: 0 }]).dailyObserved, [true, false, false]);
    for (const value of [null, '', 'invalid', -1]) assert.equal(run([{ date: '2026-10-17', value }]).daily[2], null);
    assert.deepEqual(run([{ date: '2026-10-17', value: 7 }], false).daily, [null, null, null]);
});
test('관측 표식 없는 구형 애플 0과 임계값 미달은 대기, 양수는 유지', () => fixture((o, w) => {
    const x = sample(o, w), original = JSON.parse(fs.readFileSync(x.ascFile));
    for (const [daily, expected] of [[[6, 0], null], [[6, 2], 2]]) {
        fs.writeFileSync(x.ascFile, JSON.stringify({ ...original, offers: { daily, total: 30 } }));
        assert.equal(SRC.loadAsc({ ...o, file: x.ascFile }).offerStartsToday, expected);
    }
    fs.writeFileSync(x.ascFile, JSON.stringify({ ...original, offers: { ...original.offers, meetsThreshold: false } }));
    assert.equal(SRC.loadAsc({ ...o, file: x.ascFile }).offerStartsToday, null);
}));
test('rc.log 오늘 빈 수량/체험은 대기, 실측0/천단위는 보존', () => fixture((o, w) => {
    for (const [raw, expected] of [['', null], [' ', null], [null, null], ['0', 0], ['1,234', 1234]]) {
        const chart = { dates: ["Oct 17 '26"], labels: ['Total', 'iOS', 'Android'], rows: [[raw], [raw], ['0']] };
        w('work/2026-10-17/report/rc.log', '읽음: ' + new Date(now).toISOString() + '\n플랫폼별: ' + JSON.stringify(chart) + '\n신규체험(ok): ' + JSON.stringify({ dates: chart.dates, rows: [[raw]] }));
        const installs = SRC.loadInstalls(o), perf = V.loadPerformance({ ...o, installs });
        assert.equal(perf.rcToday.customers, expected); assert.equal(perf.rcToday.trials, expected); assert.equal(perf.installs.today.total, expected);
    }
}));
