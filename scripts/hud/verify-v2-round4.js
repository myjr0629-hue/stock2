'use strict';
// 식별자 전수와 합성 게시·화면만 검사한다. 운영 원천·계정에 연결하지 않는다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const V = require('./v2-sources');
const { PLAN_CHANNELS, LEDGER_ALIASES, EXCLUDED_LEDGER_CHANNELS } = require('./v2-platform-ids');
const inventory = require('./fixtures/platform-ids-20261017.json');
const now = Date.parse('2026-10-17T03:30:00Z');
function fixture(fn) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-round4-'));
    const write = (name, value) => { const file = path.join(home, name); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return file; };
    try { return fn({ home, now }, write); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
function platforms(o, w, rows, plan = inventory.platforms, channels = inventory.channels) {
    const publishing = V.loadPublishing({ ...o, file: w('ledger.json', rows) });
    return V.loadPlatforms({ ...o, publishing, file: w('plan.md', plan.map(p => `| ${p.id} | ${p.name} | 활성 | EN |`).join('\n')), channelsFile: w('channels.json', channels) });
}
const post = (ch, at = '2026-10-17T01:00:00Z') => ({ ch, at, url: 'https://example.org/public-post' });
test('A note·X 미국·일본 별칭을 연결하고 지역별 최신 시각 중 가장 최근 선택', () => fixture((o, w) => {
    const r = platforms(o, w, [post('note_jp', '2026-10-15T01:00:00Z'), post('x_post'), post('x_jp', '2026-10-16T01:00:00Z')]);
    assert.equal(r.items.find(p => p.id === 'P09').lastPostAt, '2026-10-15T01:00:00Z');
    assert.equal(r.items.find(p => p.id === 'P01').lastPostAt, '2026-10-17T01:00:00Z');
    assert.deepEqual(r.unmatchedLedgerChannels, []);
    const tz = platforms(o, w, [post('note_jp', '2026-10-17T02:00:00Z'), post('note_jp', '2026-10-17T10:00:00+09:00')]);
    assert.equal(tz.items.find(p => p.id === 'P09').lastPostAt, '2026-10-17T02:00:00Z');
}));
test('A 댓글·제품·한글 플랫폼 및 공통 이름 접두어를 명시적으로 구분', () => fixture((o, w) => {
    const expected = { asamo_reply: 'P25', clien: 'P27', clien_comment: 'P27', clien_jp: 'P27', ppomppu: 'P28', ruliweb: 'P32', disquiet_product: 'P33', kojindev: 'P34', quora_en: 'P12', hf_datasets: 'P21', hf_spaces: 'P21', github_pages_finra: 'P13' };
    for (const [ch, id] of Object.entries(expected)) {
        const r = platforms(o, w, [post(ch)]);
        assert.equal(r.items.find(p => p.id === id).lastPostAt, '2026-10-17T01:00:00Z', ch);
    }
    const r = platforms(o, w, [post('x_reply_jp')]);
    assert.equal(r.items.find(p => p.id === 'P01').lastPostAt, '2026-10-17T01:00:00Z');
    assert.equal(r.items.find(p => p.id === 'P09').lastPostAt, null);
}));
test('A 채널 전용 항목도 14일 밖 최근 게시를 보존', () => fixture((o, w) => {
    const r = platforms(o, w, [post('directories', '2026-09-01T00:00:00Z')], [], [{ id: 'directories' }]);
    assert.equal(r.items[0].lastPostAt, '2026-09-01T00:00:00Z');
}));
test('A 실제 원장 78종·채널 163종·플랫폼 173종 전수, 미연결 0과 제외 사유', () => fixture((o, w) => {
    assert.deepEqual([inventory.ledgerChannels.length, inventory.channels.length, inventory.platforms.length], [78, 163, 173]);
    for (const [id, [name, ids]] of Object.entries(PLAN_CHANNELS)) {
        assert.equal(inventory.platforms.find(p => p.id === id)?.name, name, id);
        assert.ok(ids.every(id => inventory.channels.some(c => c.id === id)), id + ' 채널 ID');
    }
    for (const [alias, target] of Object.entries(LEDGER_ALIASES)) {
        assert.ok(inventory.ledgerChannels.includes(alias), alias);
        assert.ok([...inventory.channels, ...inventory.platforms].some(x => x.id === target), target);
    }
    assert.ok(Object.entries(EXCLUDED_LEDGER_CHANNELS).every(([id, reason]) => inventory.ledgerChannels.includes(id) && reason));
    const r = platforms(o, w, inventory.ledgerChannels.map(ch => post(ch)));
    assert.deepEqual(r.unmatchedLedgerChannels, []);
    assert.ok(inventory.platforms.every(p => r.items.some(x => x.id === p.id)));
    const represented = r.items.flatMap(p => p.channelIds || []);
    assert.ok(inventory.channels.every(c => represented.includes(c.id)), '채널 대장 ID 전수 보존');
    assert.equal(new Set(represented).size, represented.length, '한 채널은 한 플랫폼에만 귀속');
    const excluded = r.excludedLedgerChannels;
    assert.ok(excluded.length > 0 && excluded.every(x => x.reason && inventory.ledgerChannels.includes(x.channel)));
    for (const ch of inventory.ledgerChannels.filter(ch => !excluded.some(x => x.channel === ch))) {
        const one = platforms(o, w, [post(ch)]);
        assert.ok(one.items.some(p => p.lastPostAt === '2026-10-17T01:00:00Z'), ch);
    }
}));
test('A 미등록 키는 접두어로 추측 연결하거나 조용히 버리지 않음', () => fixture((o, w) => {
    const r = platforms(o, w, [post('note_unregistered'), post('diff_kit_new')]);
    assert.deepEqual(r.unmatchedLedgerChannels, ['diff_kit_new', 'note_unregistered']);
    assert.equal(r.items.find(p => p.id === 'P09').lastPostAt, null);
}));
function redeemCard(asc, redeem = {}) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), nodes = {};
    for (const m of html.matchAll(/id="([^"]+)"/g)) nodes[m[1]] = { innerHTML: '', textContent: '', dataset: {}, addEventListener() {}, setAttribute() {}, classList: { toggle() {} } };
    const c = { document: { querySelector: s => nodes[s.slice(1)], querySelectorAll: () => [], addEventListener() {} }, location: { hash: '' }, history: { replaceState() {} }, URL, Date, Intl, setInterval() {}, addEventListener() {}, fetch: () => new Promise(() => {}) };
    c.window = c; vm.createContext(c);
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if (!/src=/.test(m[1])) vm.runInContext(m[2], c);
    c.s = { now: new Date(now).toISOString(), live: { asc }, v2: { performance: { redeem } } }; vm.runInContext('renderDashboard(s)', c);
    return nodes['dashboard-content'].innerHTML.match(/<article class="card"><div class="kpi-title">리딤 코드 사용[\s\S]*?<\/article>/)[0];
}
const ledger = { ledger: true, confirmedUsed: null, remaining: 671, platforms: { ios: { confirmedUsed: 8 }, android: { confirmedUsed: null } } };
test('B 큰 숫자 30은 애플 최근 30일, 장부 iOS 8·안드 대기·남은 671 별도 표시', () => {
    const html = redeemCard({ offerStarts30: 30, offerStarts: 6, latestDay: '2026-10-15', file: '애플 시험 원천', readAt: now, stale: true }, ledger);
    assert.match(html, /class="kpi-value">30<\/div>/);
    for (const s of ['애플 오퍼 코드 사용 시작 최근 30일', '장부 사용 확인 iOS <b>8</b> · 안드 <b>판독 대기</b> · 남은 <b>671</b>', '애플 시험 원천', '판독 지연', '2026-10-15']) assert.ok(html.includes(s), s);
});
test('B 애플 실측 0은 장부보다 우선', () => {
    assert.match(redeemCard({ offerStarts30: 0 }, ledger), /class="kpi-value">0<\/div>/);
});
test('B 애플 누락은 확인된 장부 8로 보충하고 부분 확인임을 표시', () => {
    const html = redeemCard({ offerStarts30: null }, ledger);
    assert.match(html, /class="kpi-value">8<\/div>/);
    assert.ok(html.includes('장부 사용 확인 누적 · 확인된 플랫폼'));
});
test('B 장부 실측 0 보존·양쪽 확인값 존재 시 합계·모두 없을 때만 큰 숫자 대기', () => {
    assert.match(redeemCard({}, { ...ledger, platforms: { android: { confirmedUsed: 0 } } }), /class="kpi-value">0<\/div>/);
    assert.match(redeemCard({}, { ...ledger, platforms: { ios: { confirmedUsed: 8 }, android: { confirmedUsed: 2 } } }), /class="kpi-value">10<\/div>/);
    assert.match(redeemCard({}, { ...ledger, platforms: {} }), /class="kpi-value pending">판독 대기<\/div>/);
});
