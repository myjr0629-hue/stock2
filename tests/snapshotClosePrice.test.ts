/**
 * [T51 · 2026-11-06] 섹터 스냅샷 저장 종가 = 오늘 세션 실시간 close_price(공식 종가 경매가) 우선.
 * 시각 고정 오프라인 시험.
 *
 * 실측 근거(11/5·11/6, Intrinio realtime → 공식 일봉 대조):
 *   signum-work/2026-11-06/sector-close/RESULT.md
 * 고정하는 것:
 *   ① 마감 40분 뒤 + 오늘 정규장 체결 + 전일 종가 있음 → close_price 와 그 등락
 *   ② 장중·마감 전·주말/휴장·어제 응답·필드 없음·2% 넘는 이상값·분모 없음 → 기존 값 그대로(빈칸·0 을 만들지 않는다)
 *   ③ 조기 폐장일(13:00 ET) 마감 뒤엔 close_price
 *   ④ 전 화면 가격 판정(resolveSessionPrices)은 close_price 를 보지 않는다 — 저장 경로에만 붙었다
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pickSnapshotClose, CLOSE_PRICE_SANITY, snapshotCloseWindowOpen, snapshotPostAuthorized } from '@/lib/snapshotClosePrice';

const ROOT = path.resolve(__dirname, '..');
// 2026-11-05(목, EST) 16:41 ET = 21:41Z
const AFTER = Date.parse('2026-11-05T21:41:00Z');
// NVDA 11/5 실측: close_price 181.89 · normal_market_hours_last_price 181.60(20:59:59.960Z) · 전일 공식 종가 200.13
const NVDA = { close_price: 181.89, normal_market_hours_last_price: 181.6, normal_market_hours_last_time: '2026-11-05T20:59:59.960Z', eod_close_price: 200.13, eod_close_date: '2026-11-04' };
const CUR = { price: 181.6, changePct: ((181.6 - 200.13) / 200.13) * 100 };

test('① 마감 뒤 오늘 응답이면 close_price 와 그 등락을 저장한다', () => {
    const r = pickSnapshotClose({ rt: NVDA, nowMs: AFTER, ...CUR });
    assert.equal(r.basis, 'rt_close_price');
    assert.equal(r.price, 181.89);
    assert.ok(Math.abs((r.changePct as number) - ((181.89 - 200.13) / 200.13) * 100) < 1e-9);
});

test('① 값이 같은 종목도 출처는 close_price(AAPL 344.28 = 344.28)', () => {
    const r = pickSnapshotClose({
        rt: { close_price: 344.28, normal_market_hours_last_price: 344.28, normal_market_hours_last_time: '2026-11-05T20:59:59.802Z', eod_close_price: 349.51, eod_close_date: '2026-11-04' },
        nowMs: AFTER, price: 344.28, changePct: -1.4964,
    });
    assert.equal(r.basis, 'rt_close_price');
    assert.equal(r.price, 344.28);
});

test('② 마감 전(15:59 ET)·장중이면 기존 값', () => {
    const r = pickSnapshotClose({ rt: NVDA, nowMs: Date.parse('2026-11-05T20:59:00Z'), ...CUR });
    assert.deepEqual(r, { price: CUR.price, changePct: CUR.changePct, basis: 'current' });
});

test('② 정규장 마지막 체결이 어제면(어제 close_price) 기존 값', () => {
    const r = pickSnapshotClose({ rt: { ...NVDA, normal_market_hours_last_time: '2026-11-04T20:59:59.960Z' }, nowMs: AFTER, ...CUR });
    assert.equal(r.basis, 'current');
});

test('② 주말 실행이면 기존 값', () => {
    const r = pickSnapshotClose({ rt: { ...NVDA, normal_market_hours_last_time: '2026-11-07T20:59:59Z' }, nowMs: Date.parse('2026-11-07T21:18:00Z'), ...CUR });
    assert.equal(r.basis, 'current');
});

test('② 응답 없음·close_price 없음/0·정규장 마지막 체결 없음이면 기존 값', () => {
    assert.equal(pickSnapshotClose({ rt: null, nowMs: AFTER, ...CUR }).basis, 'current');
    assert.equal(pickSnapshotClose({ rt: { ...NVDA, close_price: null }, nowMs: AFTER, ...CUR }).basis, 'current');
    assert.equal(pickSnapshotClose({ rt: { ...NVDA, close_price: 0 }, nowMs: AFTER, ...CUR }).basis, 'current');
    assert.equal(pickSnapshotClose({ rt: { ...NVDA, normal_market_hours_last_price: null }, nowMs: AFTER, ...CUR }).basis, 'current');
    assert.equal(pickSnapshotClose({ rt: { ...NVDA, normal_market_hours_last_time: null }, nowMs: AFTER, ...CUR }).basis, 'current');
});

test('② 경매가가 마지막 체결과 2% 넘게 벌어지면 응답 이상으로 보고 기존 값', () => {
    const far = 181.6 * (1 + CLOSE_PRICE_SANITY + 0.001);
    assert.equal(pickSnapshotClose({ rt: { ...NVDA, close_price: far }, nowMs: AFTER, ...CUR }).basis, 'current');
});

test('② 분모(eod_close_price)가 없거나 날짜가 직전 거래일이 아니면 기존 값 통째로(관문 11060644: 이틀 전 종가 분모 금지)', () => {
    assert.deepEqual(pickSnapshotClose({ rt: { ...NVDA, eod_close_price: null }, nowMs: AFTER, price: 181.6, changePct: null }), { price: 181.6, changePct: null, basis: 'current' });
    assert.equal(pickSnapshotClose({ rt: { ...NVDA, eod_close_date: '2026-11-03' }, nowMs: AFTER, ...CUR }).basis, 'current');
    assert.equal(pickSnapshotClose({ rt: { ...NVDA, eod_close_date: '2026-11-05' }, nowMs: AFTER, ...CUR }).basis, 'current');
});

test('③ 조기 폐장일(2026-11-27 13:00 ET) 13:41 ET 엔 close_price', () => {
    const r = pickSnapshotClose({
        rt: { close_price: 100.5, normal_market_hours_last_price: 100.4, normal_market_hours_last_time: '2026-11-27T17:59:59Z', eod_close_price: 100, eod_close_date: '2026-11-25' },
        nowMs: Date.parse('2026-11-27T18:41:00Z'), price: 100.4, changePct: 0.4,
    });
    assert.equal(r.basis, 'rt_close_price');
    assert.equal(r.price, 100.5);
});

test('④ 저장 경로에만 붙었고 전 화면 가격 판정은 close_price 를 보지 않는다', () => {
    const route = fs.readFileSync(path.join(ROOT, 'src/app/api/intel/snapshot/route.ts'), 'utf8');
    assert.match(route, /getRealtimeCloseFields\(s, deadline\)/);
    assert.match(route, /rt: rtCloseMap\[String\(q0\?\.ticker \|\| ''\)\.toUpperCase\(\)\] \?\? null/);
    assert.match(route, /return \{ \.\.\.q0, price: picked\.price, changePct: picked\.changePct, missingFields \}/);
    assert.match(route, /close_price: nz\(q\.price\)/);
    assert.match(route, /tickers: tickerSnapshots/);
    assert.match(route, /saveSnapshot\(sector, snapshotDate, snapshotData\)/);
    assert.match(route, /fast_cache_age_sec: liveData\.meta\.cacheAgeSec/);
    const cron = fs.readFileSync(path.join(ROOT, 'src/app/api/cron/snapshot/route.ts'), 'utf8');
    assert.match(cron, /\/api\/intel\/snapshot`[\s\S]*?method: 'POST'/);
    const client = fs.readFileSync(path.join(ROOT, 'src/services/intrinioClient.ts'), 'utf8');
    const start = client.indexOf('export function resolveSessionPrices(');
    const end = client.indexOf('\n}\n', start);
    assert.ok(start > 0 && end > start);
    assert.doesNotMatch(client.slice(start, end), /(?<![a-z_])close_price/);
    const snap = client.slice(client.indexOf('export async function getTickerSnapshot('), client.indexOf('export async function getDailyAggregates('));
    assert.doesNotMatch(snap, /rt\?\.close_price|rt\.close_price/);
});


test('마감 39분은 보류, 41분은 허용', () => {
    assert.equal(pickSnapshotClose({ rt: NVDA, nowMs: Date.parse('2026-11-05T21:39:00Z'), ...CUR }).basis, 'current');
    assert.equal(pickSnapshotClose({ rt: NVDA, nowMs: AFTER, ...CUR }).basis, 'rt_close_price');
});

test('DST 전환 전후 16:15·16:31·16:39는 거부하고 16:40부터 허용', () => {
    for (const [date, previous, offset] of [
        ['2026-03-06', '2026-03-05', '-05:00'],
        ['2026-03-09', '2026-03-06', '-04:00'],
        ['2026-10-30', '2026-10-29', '-04:00'],
        ['2026-11-02', '2026-10-30', '-05:00'],
    ]) {
        const rt = { close_price: 101, normal_market_hours_last_price: 101, normal_market_hours_last_time: `${date}T15:59:59${offset}`, eod_close_price: 100, eod_close_date: previous };
        for (const minute of ['15', '31', '39']) {
            assert.equal(pickSnapshotClose({ rt, nowMs: Date.parse(`${date}T16:${minute}:00${offset}`), ...CUR }).basis, 'current', `${date} 16:${minute}`);
        }
        assert.equal(pickSnapshotClose({ rt, nowMs: Date.parse(`${date}T16:40:00${offset}`), ...CUR }).basis, 'rt_close_price', date);
    }
});

test('close_price가 전일 종가와 같으면 보류하고 집계한다', () => {
    const r = pickSnapshotClose({ rt: { ...NVDA, close_price: 200.13 }, nowMs: AFTER, ...CUR });
    assert.deepEqual(r, { ...CUR, basis: 'current', heldPrevClose: true });
});

// ── [T51c · 2026-11-07] 11/6(금, EST) flip-watch 실측 고정 — AVGO(공식 일봉 293.69 · 전일 291.53 · 정규장 마지막 체결 293.09)
//    signum-work/2026-11-06/sector-close/out-20261106T2115/2127/2131/2143Z.json
const AVGO_PREV = { eod_close_price: 291.53, eod_close_date: '2026-11-05', normal_market_hours_last_price: 293.09, normal_market_hours_last_time: '2026-11-06T20:59:59.993Z' };
const AVGO_PROVISIONAL = { ...AVGO_PREV, close_price: 293.35 }; // 21:15~21:27Z 잠정값(−0.116%)
const AVGO_OFFICIAL = { ...AVGO_PREV, close_price: 293.69 };    // 21:31:05Z 표본부터 공식 일봉과 동일
const AVGO_CUR = { price: 293.09, changePct: ((293.09 - 291.53) / 291.53) * 100 };

test('T51c 16:15 ET 잠정 close_price(AVGO 293.35)는 거부 — 기존 값 그대로', () => {
    const r = pickSnapshotClose({ rt: AVGO_PROVISIONAL, nowMs: Date.parse('2026-11-06T21:15:27Z'), ...AVGO_CUR });
    assert.deepEqual(r, { ...AVGO_CUR, basis: 'current' });
    assert.equal(snapshotCloseWindowOpen(Date.parse('2026-11-06T21:15:27Z')), false);
});

test('T51c 16:31 ET 에 공식으로 바뀐 close_price(AVGO 293.69)는 첫 스냅샷 회차(21:42Z = 16:42 ET)에 채택 — 등락도 공식 기준', () => {
    const r = pickSnapshotClose({ rt: AVGO_OFFICIAL, nowMs: Date.parse('2026-11-06T21:42:00Z'), ...AVGO_CUR });
    assert.equal(r.basis, 'rt_close_price');
    assert.equal(r.price, 293.69);
    assert.ok(Math.abs((r.changePct as number) - ((293.69 - 291.53) / 291.53) * 100) < 1e-9);
    // 같은 값이라도 16:31 ET 바로 그 시각에는 아직 쓰지 않는다(전환 상한 + 9분 = 마감 + 40분 규칙) — 크론은 그 뒤에만 돈다
    assert.equal(pickSnapshotClose({ rt: AVGO_OFFICIAL, nowMs: Date.parse('2026-11-06T21:31:05Z'), ...AVGO_CUR }).basis, 'current');
    assert.equal(snapshotCloseWindowOpen(Date.parse('2026-11-06T21:40:00Z')), true);
});

test('T51c close_price == 전일 종가(21:09Z 상태: AVGO 291.53 = eod 291.53)면 창 안이어도 거부 + held_prev_close', () => {
    const r = pickSnapshotClose({ rt: { ...AVGO_PREV, close_price: 291.53 }, nowMs: Date.parse('2026-11-06T21:42:00Z'), ...AVGO_CUR });
    assert.deepEqual(r, { ...AVGO_CUR, basis: 'current', heldPrevClose: true });
});

test('T51c 날짜 확인 — 정규장 마지막 체결이 어제 날짜이거나 전일 종가 날짜가 직전 거래일이 아니면 거부', () => {
    const at = Date.parse('2026-11-06T21:42:00Z');
    assert.equal(pickSnapshotClose({ rt: { ...AVGO_OFFICIAL, normal_market_hours_last_time: '2026-11-05T20:59:59.993Z' }, nowMs: at, ...AVGO_CUR }).basis, 'current');
    assert.equal(pickSnapshotClose({ rt: { ...AVGO_OFFICIAL, eod_close_date: '2026-11-04' }, nowMs: at, ...AVGO_CUR }).basis, 'current');
});

test('T51c 서머타임 시작 2027-03-14 경계 — 금 3/12(EST)·월 3/15(EDT) 모두 같은 UTC 크론(21:42Z)에서 채택, 마감 15·31분 뒤엔 거부', () => {
    const cases: Array<[string, string, string, string]> = [
        // [거래일, 직전 거래일, 정규장 마지막 체결(UTC), 오프셋]
        ['2027-03-12', '2027-03-11', '2027-03-12T20:59:59.900Z', '-05:00'],
        ['2027-03-15', '2027-03-12', '2027-03-15T19:59:59.900Z', '-04:00'],
    ];
    for (const [date, prev, lastTime, off] of cases) {
        const rt = { close_price: 101.2, normal_market_hours_last_price: 101.1, normal_market_hours_last_time: lastTime, eod_close_price: 100, eod_close_date: prev };
        const cur = { price: 101.1, changePct: 1.1 };
        for (const m of ['15', '31', '39']) {
            assert.equal(pickSnapshotClose({ rt, nowMs: Date.parse(`${date}T16:${m}:00${off}`), ...cur }).basis, 'current', `${date} 16:${m} ET`);
        }
        const cron = Date.parse(`${date}T21:42:00Z`); // EST 16:42 ET · EDT 17:42 ET
        assert.equal(snapshotCloseWindowOpen(cron), true, date);
        const r = pickSnapshotClose({ rt, nowMs: cron, ...cur });
        assert.equal(r.basis, 'rt_close_price', date);
        assert.equal(r.price, 101.2);
        // 마지막 회차 22:00Z(EDT 18:00 ET)도 같은 거래일 창 안
        assert.equal(pickSnapshotClose({ rt, nowMs: Date.parse(`${date}T22:00:00Z`), ...cur }).basis, 'rt_close_price', `${date} 22:00Z`);
    }
    // 일요일 3/14(전환일, 휴장)는 창이 열리지 않는다
    assert.equal(snapshotCloseWindowOpen(Date.parse('2027-03-14T21:42:00Z')), false);
});

test('T51c 관문 11070756 — 저장 POST 는 운영에서 CRON_SECRET 만, 공급사 조회는 창 안에서만', () => {
    assert.equal(snapshotPostAuthorized(null, 's3cret', 'production'), false);
    assert.equal(snapshotPostAuthorized('Bearer wrong', 's3cret', 'production'), false);
    assert.equal(snapshotPostAuthorized('s3cret', 's3cret', 'production'), false);
    assert.equal(snapshotPostAuthorized('Bearer s3cret', 's3cret', 'production'), true);
    assert.equal(snapshotPostAuthorized(null, undefined, 'production'), true); // 비밀값 미설정(다른 크론 라우트와 같은 규칙)
    assert.equal(snapshotPostAuthorized(null, 's3cret', 'development'), true);
    const route = fs.readFileSync(path.join(ROOT, 'src/app/api/intel/snapshot/route.ts'), 'utf8');
    const post = route.slice(route.indexOf('export async function POST('));
    // 인증이 본문 파싱·내부 조회·공급사 호출보다 먼저
    const auth = post.indexOf('snapshotPostAuthorized(request.headers.get(\'authorization\'), process.env.CRON_SECRET, process.env.NODE_ENV)');
    assert.ok(auth > 0 && auth < post.indexOf('request.json()') && auth < post.indexOf('/api/intel/fast') && auth < post.indexOf('getRealtimeCloseFields'));
    assert.match(post, /if \(snapshotCloseWindowOpen\(now\.getTime\(\)\)\) \{[\s\S]*?getRealtimeCloseFields/);
    assert.match(post, /allowed\.has\(t\)/);
    const cron = fs.readFileSync(path.join(ROOT, 'src/app/api/cron/snapshot/route.ts'), 'utf8');
    assert.match(cron, /Authorization: `Bearer \$\{cronSecret\}`/);
    // 키는 서버 전용 환경변수(클라이언트 번들에 들어가는 NEXT_PUBLIC_ 아님)
    const client = fs.readFileSync(path.join(ROOT, 'src/services/intrinioClient.ts'), 'utf8');
    assert.match(client, /const INTRINIO_API_KEY = process\.env\.INTRINIO_API_KEY/);
    assert.doesNotMatch(client, /NEXT_PUBLIC_INTRINIO/);
});
