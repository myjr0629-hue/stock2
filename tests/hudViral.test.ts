/**
 * 바이럴 루프 계측 읽기 — scripts/mkt-viral.js(바이럴 계수 k) + 관제(HUD) 한 줄 (2026-10-14, 브랜치 feat/viral-loop)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/hudViral.test.ts
 *
 * 고정하는 것: ET 날짜 산술(서머타임 경계에서도 하루가 겹치거나 빠지지 않음) · 읽는 키가 계약대로(번호 배정은 표면 «all», 선물 open 은 카드 열람이 아님) ·
 *   표면별 합산(선물 3입구 → gift) · k = 매칭 ÷ 서로 다른 초대자(분모 0 이면 null — 0 으로 지어내지 않는다) · 여러 날 기간 k(같은 초대자는 한 번) ·
 *   못 읽은 키는 null + 하한 경고(0 으로 채우지 않음, 초대자 수를 못 읽으면 기간 k 비움) · 대표용 한 줄 · parseViral(JSON 마지막 줄만, 전부 못 읽음/모양 다름은 null) ·
 *   초대 id 가 출력·JSON 어디에도 안 나감 · 코드 연결(collect --viral·화면 새 줄만 추가·읽기 전용) · 오프라인 실패 경로(종료 코드 1 + err JSON).
 * 값은 전부 «시험용 가짜»다. 초대 id·번호·토큰의 진짜 값은 쓰지 않는다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const V = require(path.join(root, 'scripts/mkt-viral.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SRC = require(path.join(root, 'scripts/hud/sources.js'));

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const D1 = '2026-10-13', D2 = '2026-10-12', D3 = '2026-10-11';
/** 가짜 레디스: 없는 키는 null(= 0), unread 에 든 키는 undefined(= 못 읽음) */
const mkGet = (store: Record<string, unknown>, unread: (k: string) => boolean = () => false) => (k: string) => (unread(k) ? undefined : (k in store ? store[k] : null));
const FAKE_IDS_1 = ['fakeinv-aaaa', 'fakeinv-bbbb', 'fakeinv-cccc'];
const FAKE_IDS_2 = ['fakeinv-bbbb', 'fakeinv-dddd'];

/** D1: 공유 카드 2종 + 선물, 3명이 공유, 매칭 2 */
const store1: Record<string, unknown> = {
    [`share:tap:sh_pick:ios:${D1}`]: 3, [`share:tap:sh_pick:web:${D1}`]: 1,
    [`share:sent:sh_pick:ios:${D1}`]: 2, [`share:open:sh_pick:ios:${D1}`]: 4, [`share:open:sh_pick:na:${D1}`]: 1,
    [`share:tap:sh_line:android:${D1}`]: 1, [`share:sent:sh_line:android:${D1}`]: 1, [`share:open:sh_line:android:${D1}`]: 2,
    // 선물 3입구는 gift 묶음으로 합산 — gift_pop 의 open(= 1회 안내를 띄움)은 카드 열람이 아니다
    [`share:tap:gift_set:ios:${D1}`]: 1, [`share:tap:gift_dash:ios:${D1}`]: 2, [`share:tap:gift_pop:android:${D1}`]: 4,
    [`share:sent:gift_dash:ios:${D1}`]: 1, [`share:sent:gift_pop:android:${D1}`]: 1,
    [`share:open:gift_pop:ios:${D1}`]: 99,
    [`clk:sg:share_pick:${D1}`]: { 'ios|human': 3, 'android|human': 1, 'desktop|human': 2, 'ios|bot': 40 },
    [`clk:sg:gift:${D1}`]: '{"ios|human":1,"desktop|human":1}',                       // 문자열 JSON 으로 와도 읽는다
    [`clk:coupon:gift:${D1}`]: { 'ios|view:human': 2, 'ios|tap:apply': 1, 'android|view:nometa': 7 },
    [`share:arrive:all:ios:${D1}`]: 3, [`share:arrive:all:android:${D1}`]: 1,
    [`share:match:sh_pick:ios:${D1}`]: 1, [`share:match:gift:android:${D1}`]: 1,
    [`share:credit:sh_pick:ios:${D1}`]: 1,
    [`share:mint:all:ios:${D1}`]: 1, [`share:mint:all:android:${D1}`]: 2,
    [`share:senders:${D1}`]: FAKE_IDS_1,
};

t('etDates — 최신→과거, 서머타임 경계에서도 겹치거나 빠지지 않는다', () => {
    assert.deepEqual(V.etDates(3, Date.UTC(2026, 9, 14, 12)), ['2026-10-14', '2026-10-13', '2026-10-12']);
    assert.deepEqual(V.etDates(3, Date.UTC(2026, 9, 14, 3)), ['2026-10-13', '2026-10-12', '2026-10-11']);          // UTC 3시 = 아직 ET 전날 밤
    assert.deepEqual(V.etDates(4, Date.UTC(2026, 10, 2, 12)), ['2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30']);   // 가을 전환(11/1)
    assert.deepEqual(V.etDates(3, Date.UTC(2026, 2, 9, 3)), ['2026-03-08', '2026-03-07', '2026-03-06']);            // 봄 전환(3/8) 직후 ET 밤
    const many = V.etDates(14, Date.UTC(2026, 10, 3, 5));
    assert.equal(new Set(many).size, 14);
});

t('kOf — 분모 0·없음은 null(0 으로 지어내지 않는다), 분자 0 은 진짜 0', () => {
    assert.equal(V.kOf(5, 0), null);
    assert.equal(V.kOf(0, 0), null);
    assert.equal(V.kOf(null, 3), null);
    assert.equal(V.kOf(3, null), null);
    assert.equal(V.kOf(0, 3), 0);
    assert.equal(V.kOf(3, 2), 1.5);
});

t('dayKeys — 계약 그대로(번호 배정은 표면 all · 선물 open 은 읽지 않음 · 접두사 분리)', () => {
    const keys: string[] = V.dayKeys(D1, V.REAL_NS);
    assert.equal(new Set(keys).size, keys.length, '중복 키 없음');
    for (const k of [
        `share:tap:sh_pick:ios:${D1}`, `share:sent:sh_earn:na:${D1}`, `share:open:sh_line:web:${D1}`,
        `share:tap:gift_pop:android:${D1}`, `share:sent:gift_set:web:${D1}`,
        `clk:sg:share_pick:${D1}`, `clk:sg:share_line:${D1}`, `clk:sg:share_earn:${D1}`, `clk:sg:gift:${D1}`, `clk:coupon:gift:${D1}`,
        `share:arrive:all:ios:${D1}`, `share:arrive:all:android:${D1}`,
        `share:match:sh_earn:android:${D1}`, `share:match:gift:ios:${D1}`, `share:credit:sh_pick:ios:${D1}`,
        `share:mint:all:ios:${D1}`, `share:mint:all:android:${D1}`, `share:senders:${D1}`,
    ]) assert.ok(keys.includes(k), '읽어야 하는 키: ' + k);
    assert.ok(!keys.some((k) => /^share:mint:(sh_|gift)/.test(k)), '번호 배정을 표면별로 읽지 않는다');
    assert.ok(!keys.some((k) => /^share:open:gift_/.test(k)), '선물 open(= 안내 띄움)은 카드 열람이 아니라 읽지 않는다');
    const probe: string[] = V.dayKeys(D1, V.PROBE_NS);
    assert.ok(probe.every((k) => k.startsWith('share:probe:') || k.startsWith('clkp:')), '--probe 는 시험 접두사만');
    assert.equal(probe.length, keys.length);
    assert.ok(!keys.some((k) => k.includes('probe')));
});

t('assembleDay — 표면별 합산·사람 클릭만·선물 3입구 합·번호 배정 all', () => {
    const d = V.assembleDay(D1, mkGet(store1));
    assert.equal(d.surfaces.sh_pick.tap, 4);
    assert.equal(d.surfaces.sh_pick.sent, 2);
    assert.equal(d.surfaces.sh_pick.open, 5);
    assert.deepEqual([d.surfaces.sh_pick.clkIos, d.surfaces.sh_pick.clkAndroid, d.surfaces.sh_pick.clkDesktop, d.surfaces.sh_pick.clk], [3, 1, 2, 6], '봇(ios|bot)은 안 센다');
    assert.equal(d.surfaces.sh_line.open, 2);
    assert.equal(d.surfaces.gift.tap, 7, 'gift_set 1 + gift_dash 2 + gift_pop 4');
    assert.equal(d.surfaces.gift.sent, 2);
    assert.equal(d.surfaces.gift.open, null, '선물에는 카드 페이지가 없다');
    assert.equal(d.surfaces.gift.clk, 2, '문자열 JSON 도 읽는다');
    assert.equal(d.surfaces.gift.coupon, 2, 'view:human 만');
    assert.equal(d.surfaces.sh_earn.tap, 0, '읽었는데 키가 없으면 0');
    assert.equal(d.tap, 4 + 1 + 7);
    assert.equal(d.sent, 2 + 1 + 2);
    assert.equal(d.open, 5 + 2 + 0, '카드 열람 합계에 선물 안내(99)가 섞이지 않는다');
    assert.equal(d.clk, 6 + 2);
    assert.equal(d.arrive, 4); assert.equal(d.arriveIos, 3); assert.equal(d.arriveAndroid, 1);
    assert.equal(d.match, 2); assert.equal(d.credit, 1);
    assert.equal(d.mint, 3, 'share:mint:all:* 의 합');
    assert.equal(d.senders, 3);
    assert.equal(d.k, 2 / 3);
    assert.equal(d.kLower, false);
    assert.equal(d.miss, 0);
});

t('assembleDay — 활동이 없는 날: 모두 0, k 는 null(분모 0)', () => {
    const d = V.assembleDay(D3, mkGet({}));
    assert.equal(d.tap, 0); assert.equal(d.match, 0); assert.equal(d.senders, 0);
    assert.equal(d.k, null);
    assert.equal(d.miss, 0);
});

t('assembleDay — 매칭은 있는데 그날 공유한 초대자가 0 이면 k 는 null(0 으로 나누지 않는다)', () => {
    const d = V.assembleDay(D2, mkGet({ [`share:match:sh_line:ios:${D2}`]: 2 }));
    assert.equal(d.match, 2); assert.equal(d.senders, 0); assert.equal(d.k, null);
});

t('assembleDay — 못 읽은 키는 null 이고 0 으로 채우지 않는다 · 하한 표시', () => {
    // 초대자 목록을 못 읽음 → 분모 모름 → k null
    const noDen = V.assembleDay(D1, mkGet(store1, (k) => k === `share:senders:${D1}`));
    assert.equal(noDen.senders, null); assert.equal(noDen.k, null); assert.equal(noDen.miss, 1);
    // 매칭 키 일부를 못 읽음 → 읽은 것만 합산(하한) + kLower
    const partial = V.assembleDay(D1, mkGet(store1, (k) => k === `share:match:gift:android:${D1}`));
    assert.equal(partial.match, 1); assert.equal(partial.k, 1 / 3); assert.equal(partial.kLower, true); assert.equal(partial.miss, 1);
    // 매칭 키를 전부 못 읽음 → match null → k null
    const noNum = V.assembleDay(D1, mkGet(store1, (k) => k.startsWith('share:match:')));
    assert.equal(noNum.match, null); assert.equal(noNum.k, null);
    // 클릭 키 하나만 못 읽음 → 그 표면 클릭은 null(0 아님)
    const noClk = V.assembleDay(D1, mkGet(store1, (k) => k === `clk:sg:gift:${D1}`));
    assert.equal(noClk.surfaces.gift.clk, null); assert.equal(noClk.surfaces.gift.clkIos, null);
    assert.equal(noClk.clk, 6, '합계는 읽은 칸만(하한)');
    // 전부 못 읽음
    const none = V.assembleDay(D1, () => undefined);
    assert.equal(none.tap, null); assert.equal(none.senders, null); assert.equal(none.k, null); assert.equal(none.miss, none.keys);
});

const twoDays = () => {
    const store2: Record<string, unknown> = {
        [`share:sent:sh_earn:android:${D2}`]: 2, [`share:open:sh_earn:ios:${D2}`]: 1,
        [`clk:sg:share_earn:${D2}`]: { 'android|human': 2 },
        [`share:arrive:all:android:${D2}`]: 1, [`share:match:sh_earn:android:${D2}`]: 1,
        [`share:senders:${D2}`]: FAKE_IDS_2,
    };
    const all = { ...store1, ...store2 };
    return [V.assembleDay(D1, mkGet(all)), V.assembleDay(D2, mkGet(all))];
};

t('summarize — 여러 날: 같은 초대자는 기간에 한 번, 일별 합은 따로 · 기간 k · 전환율', () => {
    const [a, b] = twoDays();
    const s = V.summarize([a, b]);
    assert.equal(s.total.sendersUnique, 4, 'bbbb 는 이틀 모두 공유했어도 한 명');
    assert.equal(s.total.sendersDaySum, 5);
    assert.equal(s.total.match, 3);
    assert.equal(s.total.k, 3 / 4);
    assert.equal(s.total.sent, a.sent + b.sent);
    assert.equal(s.total.clk, a.clk + b.clk);
    assert.equal(s.total.mint, 3);
    assert.deepEqual(s.surfaces.map((x: { id: string }) => x.id), ['sh_pick', 'sh_line', 'sh_earn', 'gift']);
    assert.equal(s.surfaces[2].sent, 2);
    assert.equal(s.surfaces[3].open, null);
    assert.equal(s.conv.sentToClick, s.total.clk / s.total.sent);
    assert.equal(s.conv.clickToMatch, 3 / (s.total.clkIos + s.total.clkAndroid), '클릭→매칭은 PC 를 뺀 폰 클릭이 분모');
    assert.equal(s.conv.matchToCredit, 1 / 3);
    assert.equal(s.unread, 0);
});

t('summarize — 초대자 수를 못 읽은 날이 있으면 기간 k 를 비운다(낮게 센 분모로 부풀리지 않음)', () => {
    const all = { ...store1 };
    const a = V.assembleDay(D1, mkGet(all));
    const b = V.assembleDay(D2, mkGet(all, (k) => k === `share:senders:${D2}`));
    const s = V.summarize([a, b]);
    assert.equal(s.total.sendersUnread, 1);
    assert.equal(s.total.k, null);
    assert.equal(s.total.sendersUnique, 3, '읽은 날의 합은 하한으로 남긴다');
    assert.equal(s.unread, 1);
    const js = V.toJson([a, b], s, { at: 1, probe: false });
    assert.match(js.err, /1개를 못 읽음/); assert.match(js.err, /하한/); assert.match(js.err, /기간 k 는 비운다/);
});

t('summarize — 전부 0: k null, 전환율도 null(0 으로 지어내지 않음)', () => {
    const s = V.summarize([V.assembleDay(D1, mkGet({})), V.assembleDay(D2, mkGet({}))]);
    assert.equal(s.total.k, null); assert.equal(s.total.sendersUnique, 0);
    assert.deepEqual(s.conv, { sentToClick: null, clickToMatch: null, matchToCredit: null });
});

t('headline — 대표용 한 줄 (k·초대자·공유·카드 열람·앱 클릭·설치 매칭·보상)', () => {
    const [a, b] = twoDays();
    const line = V.headline(V.summarize([a, b]));
    assert.equal(line, `바이럴 k 0.75 · 초대자 4명 → 공유 ${a.sent + b.sent} → 카드 열람 ${a.open + b.open} → 앱 클릭 ${a.clk + b.clk} → 설치 매칭 3 → 보상 1`);
    assert.equal(V.headline(V.summarize([V.assembleDay(D3, mkGet({}))])), '바이럴 k — · 초대자 0명 → 공유 0 → 카드 열람 0 → 앱 클릭 0 → 설치 매칭 0 → 보상 0');
    assert.match(V.headline(V.summarize([V.assembleDay(D1, () => undefined)])), /^바이럴 k — · 초대자 –명 → 공유 –/, '못 읽은 칸은 «–»');
});

t('toJson → parseViral — 마지막 JSON 줄만 읽는다 · 모양이 같다 · 초대 id 는 어디에도 없다', () => {
    const [a, b] = twoDays();
    const days = [a, b];
    const js = V.toJson(days, V.summarize(days), { at: 1234567890123, probe: false });
    assert.equal(js.kind, 'viral'); assert.equal(js.at, 1234567890123); assert.equal(js.err, null);
    assert.equal(js.today.date, D1); assert.equal(js.today.k, 2 / 3);
    assert.equal(js.yesterday.date, D2);
    assert.equal(js.etFrom, D2); assert.equal(js.etTo, D1);
    const text = ['바이럴 루프 · 최근 2일', '한 줄: 어쩌고', '{"not":"viral"}', JSON.stringify(js)].join('\n') + '\n';
    for (const id of [...FAKE_IDS_1, ...FAKE_IDS_2]) assert.ok(!text.includes(id), '초대 id 가 출력에 새지 않는다');
    const p = SRC.parseViral(text);
    assert.ok(p);
    assert.equal(p.days, 2); assert.equal(p.total.k, 3 / 4); assert.equal(p.total.sendersUnique, 4);
    assert.equal(p.today.k, 2 / 3); assert.equal(p.daily.length, 2); assert.equal(p.daily[0].date, D1);
    assert.equal(p.surfaces.length, 4); assert.equal(p.surfaces[3].open, null);
    assert.equal(p.conv.matchToCredit, 1 / 3);
    assert.equal(p.warn, null);
    assert.equal(p.line, js.line);
    assert.equal(p.unread, 0);
});

t('parseViral — 하한 경고는 warn 으로 싣고, 못 읽은 칸은 null 로 둔다', () => {
    const a = V.assembleDay(D1, mkGet(store1, (k) => k === `share:senders:${D1}`));
    const js = V.toJson([a], V.summarize([a]), { at: 1, probe: false });
    const p = SRC.parseViral(JSON.stringify(js));
    assert.ok(p);
    assert.match(p.warn, /못 읽음/);
    assert.equal(p.total.sendersUnique, null);
    assert.equal(p.total.k, null);
    assert.equal(p.today.k, null);
    assert.equal(p.total.match, 2);
});

t('parseViral — 전부 못 읽음·모양 다름·빈 입력은 null (수집기가 이전 값을 남긴다)', () => {
    const a = V.assembleDay(D1, () => undefined);
    const js = V.toJson([a], V.summarize([a]), { at: 1, probe: false });
    assert.equal(js.unread, js.keys);
    assert.equal(SRC.parseViral(JSON.stringify(js)), null, '키 전부 못 읽음');
    assert.equal(SRC.parseViral(''), null);
    assert.equal(SRC.parseViral(null), null);
    assert.equal(SRC.parseViral('표만 있고 JSON 이 없다\n한 줄: 바이럴 k —'), null);
    assert.equal(SRC.parseViral('{"kind":"gift","total":{},"daily":[{}]}'), null);
    assert.equal(SRC.parseViral('{"kind":"viral","total":{},"daily":[]}'), null);
    assert.equal(SRC.parseViral('{"kind":"viral","v":1,"err":"실행 실패: x"}'), null, '실행 실패 JSON');
    assert.equal(SRC.parseViral('{깨진 json'), null);
});

t('parseViral — 숫자가 아닌 값은 null 로 거른다 (문자열을 숫자처럼 믿지 않는다)', () => {
    const a = V.assembleDay(D1, mkGet(store1));
    const js = V.toJson([a], V.summarize([a]), { at: 1, probe: false });
    js.total.sent = '5'; js.total.k = Infinity; js.daily[0].tap = { x: 1 };
    const p = SRC.parseViral(JSON.stringify(js));
    assert.equal(p.total.sent, null); assert.equal(p.total.k, null); assert.equal(p.daily[0].tap, null);
    assert.equal(p.total.match, 2);
});

t('코드 연결 — collect --viral 실패 시 이전 값 보존 · 관제 v2 진입점 · 계측 읽기 전용', () => {
    const collect = fs.readFileSync(path.join(root, 'scripts/hud/collect.js'), 'utf8');
    assert.match(collect, /viral: has\('--viral'\) \|\| LIVE \|\| !A\.length/);
    assert.match(collect, /parseViral\(runCmd\('node scripts\/mkt-viral\.js \d+ --json'/);
    assert.match(collect, /out\.viral = Object\.assign\(j, \{ at: Date\.now\(\), err: null \}\)/);
    assert.match(collect, /out\.viral = Object\.assign\(\{\}, prev\.viral \|\| \{\}, \{ err:/, '실패하면 이전 값 + err');
    assert.match(collect, /touched\.add\('viral'\)/);
    const html = fs.readFileSync(path.join(root, 'scripts/hud/index.html'), 'utf8');
    // 관제 v2가 기존 화면을 대체했다. 읽기 계측 계약과 v2 진입점을 각각 확인한다.
    assert.match(html, /dashboard/);
    assert.match(html, /api\/snapshot/);
    const src = fs.readFileSync(path.join(root, 'scripts/mkt-viral.js'), 'utf8');
    assert.ok(!/method\s*:/i.test(src), '읽기 전용 — 요청 메서드 지정 없음(GET mget 만)');
    assert.ok(!/\/(set|setex|del|incr|hset|lpush|publish)\b/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), '쓰기 명령 경로 없음');
    assert.ok(!/console\.\w+\([^)]*\bKEY\b/.test(src), '프록시 키를 출력하지 않는다');
    assert.equal(typeof SRC.parseViral, 'function');
    assert.match(fs.readFileSync(path.join(root, 'scripts/mkt-gift.js'), 'utf8'), /선물 퍼널 · 최근/, 'mkt-gift 출력은 그대로');
});

t('오프라인 실패 경로 — 전부 못 읽으면 종료 코드 1 + err JSON 마지막 줄, 0 으로 채우지 않는다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hudviral-'));
    const stub = path.join(dir, 'nofetch.js');
    fs.writeFileSync(stub, `
const fs = require('node:fs');
const original = fs.readFileSync;
// 환경 파일을 열지 않고 모의 입력만 전달한다. 실제 자격값·통신은 사용하지 않는다.
fs.readFileSync = function(file, ...args) {
  if (require('node:path').basename(String(file)).startsWith('.env')) return 'EC2_REDIS_PROXY_KEY=offline';
  return original.call(this, file, ...args);
};
global.fetch = async () => { throw new Error('offline'); };
`);
    const r = spawnSync(process.execPath, ['-r', stub, path.join(root, 'scripts/mkt-viral.js'), '1', '--json'], { cwd: root, encoding: 'utf8', timeout: 60000 });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(r.status, 1);
    const last = r.stdout.trim().split('\n').pop() as string;
    const js = JSON.parse(last);
    assert.equal(js.kind, 'viral'); assert.equal(js.unread, js.keys); assert.match(js.err, /못 읽음/);
    assert.equal(js.total.sent, null, '못 읽은 칸은 null');
    assert.equal(js.total.k, null);
    assert.equal(js.line.startsWith('바이럴 k — · 초대자 –명'), true);
    assert.ok(!/Bearer|EC2_REDIS_PROXY_KEY/.test(r.stdout + r.stderr), '키가 출력에 없다');
    assert.equal(SRC.parseViral(r.stdout), null, '수집기는 이 출력을 «실패»로 본다 → 이전 값 유지');
});

console.log(`\nhudViral: ${n} passed`);
