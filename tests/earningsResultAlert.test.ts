// 실적 결과 알림 — 발송 단계 하나·채점표와 같은 기준·끝난 기록만·잠금 없으면 0·dry 무발송·정정은 로그만
// (관문 11010757·11011001·11011010·11041319 회귀 시험)
import assert from 'node:assert/strict';
import {
  resultEligibility, resultCopy, resultPath, resultValueFingerprint, runEarningsResultStep, RESULT_KEYS, RESULT_STABLE_MS,
  type ResultStepDeps, type ResultStepOpts, type StrictRead,
} from '../src/lib/signals/earningsResult';
import { actualsKey } from '../src/lib/earnings/earningsActuals';
import { aggregateScorecard, scorecardPairOf } from '../src/lib/earnings/earningsScorecard';
import { signalTapPath } from '../src/lib/app/signalTap';
import { devKey } from '../src/lib/signals/plan';
import type { ConfirmedEarnings } from '../src/lib/earningsConfirmed';
import { FakeStore, FakeSender, IOS_TOKEN, IOS_TOKEN2, AND_TOKEN, T } from './_signalsFixtures';

let passed = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// JPM 장전(BMO) 2026-10-13 — 기준 세션 10-12 · 반응 10-13 · 일봉 확정 10-13 16:30 ET(20:30Z) · 재확인 정착 22:30Z
const D = '2026-10-13';
const entry = (ticker: string, hour: 'bmo' | 'amc' = 'bmo', date = D): ConfirmedEarnings => ({ ticker, date, hour, sourceKind: 'company-pr', sourceUrl: 'https://example.com', announcedOn: '2026-10-01', verifiedAt: '2026-10-01T12:00:00Z', quote: '' });
const WRITTEN = Date.parse('2026-10-13T23:00:00Z');
const SEND = T('2026-10-14', 7, 20);                       // 11:20Z — 아침 크론 · 마지막 쓰기 뒤 12시간 20분
function raw(ticker = 'JPM', exp = 4.3, act = 2.1, over: { e?: Record<string, unknown>; a?: Record<string, unknown>; at?: number } = {}): any {
  return {
    v: 1, ticker, date: D, hour: 'bmo', at: over.at ?? WRITTEN,
    // 현재 실적 서비스(earningsActualsService ②-expected)가 저장하는 모양 그대로 — firstExpiry 같은 별도 필드는 없다(관문 11041319)
    expected: { pct: exp, expiry: '2026-10-16', session: '2026-10-12', basis: 'eod', method: 'weekly', strike: 100, straddle: exp, spot: 100,
      capturedAt: Date.parse('2026-10-12T20:30:00Z'), src: 'page', ...over.e },
    actual: { pct: act, baseDate: '2026-10-12', reactDate: D, baseClose: 100, reactClose: 100 * (1 + act / 100), src: 'intrinio-daily', check: 'fmp', at: WRITTEN, ...over.a },
  };
}
const reason = (r: ReturnType<typeof resultEligibility>) => (r.ok ? 'ok' : r.reason);

/** EC2 엄격 읽기 흉내 — 키별 값, 호출마다 바꿀 수 있다 */
class FakeRecords {
  m = new Map<string, unknown>();
  calls = 0;
  fail: ((call: number, key: string) => boolean) | null = null;
  /** n 번째 호출부터 값을 바꾼다 */
  swap: { fromCall: number; key: string; value: unknown } | null = null;
  read = async (keys: string[]): Promise<StrictRead[]> => {
    this.calls++;
    if (this.swap && this.calls >= this.swap.fromCall) this.m.set(this.swap.key, this.swap.value);
    return keys.map((k) => (this.fail?.(this.calls, k) ? { ok: false, value: null } : { ok: true, value: this.m.has(k) ? JSON.parse(JSON.stringify(this.m.get(k))) : null }));
  };
  put(r: any) { this.m.set(actualsKey(r.ticker, r.date), r); }
}
function setup(records: any[] = [raw()], devices: Array<[string, Record<string, unknown>]> = [[IOS_TOKEN, { watchlist: { t: ['JPM'] }, tz: 'Asia/Seoul' }]]) {
  const store = new FakeStore(), sender = new FakeSender(), recs = new FakeRecords(), logs: string[] = [];
  store.m.set('push:sig:mode', 'live');
  for (const [tok, rec] of devices) store.addDevice(tok, rec);
  for (const r of records) recs.put(r);
  const deps: ResultStepDeps = { store, sender, readStrict: recs.read, log: (m) => logs.push(m), storeTimeoutMs: 50 };
  const opts = (now: number, o: Partial<ResultStepOpts> = {}): ResultStepOpts => ({ list: [entry('JPM'), entry('C')], runLockAcquired: true, lockDeadline: now + 30_000, envMode: null, ...o });
  const run = (now: number, o: Partial<ResultStepOpts> = {}) => runEarningsResultStep({ ...deps, clock: () => now }, opts(now, o));
  return { store, sender, recs, logs, deps, opts, run };
}

// ── 요구 1 — 끝난 기록(FMP 대조 · 확정 뒤 재확인 · 6시간 안정 · 직전 재읽기 동일)만 ────────────────────────────
t('1 · 기준 기록은 보낼 수 있다(영수증 판정·값 그대로)', () => {
  const r = resultEligibility(entry('JPM'), raw(), SEND);
  assert.ok(r.ok); assert.deepEqual(r.alert, { ticker: 'JPM', date: D, expected: 4.3, actual: 2.1, beyond: false });
});
t('1 · FMP 대조 없는(check null) 실제값은 보내지 않는다 — 관문 11011001 #1', () => {
  assert.equal(reason(resultEligibility(entry('JPM'), raw('JPM', 4.3, 2.1, { a: { check: null } }), SEND)), 'actual_unconfirmed');
});
t('1 · 확정 뒤 재확인(정착) 전 actual 은 보내지 않는다 — 관문 11010757 #1', () => {
  const early = Date.parse('2026-10-13T21:00:00Z');   // 일봉 확정(20:30Z) 뒤 · 정착(22:30Z) 전 — 서비스 ③-0 이 아직 다시 읽는다
  assert.equal(reason(resultEligibility(entry('JPM'), raw('JPM', 4.3, 2.1, { a: { at: early }, at: early }), SEND)), 'actual_unsettled');
});
t('1 · 마지막 쓰기 뒤 6시간 미만이면 보내지 않는다(기록 at · actual at · expected capturedAt 모두)', () => {
  assert.equal(reason(resultEligibility(entry('JPM'), raw('JPM', 4.3, 2.1, { at: SEND - RESULT_STABLE_MS + 60_000 }), SEND)), 'unstable');
  assert.equal(reason(resultEligibility(entry('JPM'), raw('JPM', 4.3, 2.1, { at: SEND - RESULT_STABLE_MS }), SEND)), 'ok');
  assert.equal(reason(resultEligibility(entry('JPM'), raw('JPM', 4.3, 2.1, { at: SEND + 1 }), SEND)), 'unstable', '미래 시각은 믿지 않는다');
  assert.equal(reason(resultEligibility(entry('JPM'), raw(), WRITTEN + RESULT_STABLE_MS - 1)), 'unstable');
});
t('1 · 일봉 확정 뒤 4일이 지난 결과는 보내지 않는다(배포 첫 회차의 지난 결과 쏟아짐 방지)', () => {
  assert.equal(reason(resultEligibility(entry('JPM'), raw(), Date.parse('2026-10-18T00:00:00Z'))), 'too_old');
});
t('1 · 발송 직전 재읽기 값이 첫 읽기와 다르면 보내지 않고, 그 발표는 정정으로 막힌다 — 관문 11011001 #2', async () => {
  const s = setup();
  s.recs.swap = { fromCall: 2, key: actualsKey('JPM', D), value: raw('JPM', 4.3, 2.4) };
  const r1 = await s.run(SEND);
  assert.equal(r1.sent, 0); assert.equal(s.sender.items.length, 0);
  assert.equal(s.store.m.has(`push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`), false, '선점한 기기 장부 자리는 돌려준다');
  const r2 = await s.run(SEND + 600_000);
  assert.equal(r2.sent, 0); assert.deepEqual(r2.corrected, ['JPM|2026-10-13']);
  assert.ok(s.logs.some((m) => m.includes('정정됨 JPM 2026-10-13')));
});
t('1 · 발송 직전 재읽기를 확인 못 하면(EC2 불가) 보내지 않고 다음 회차에 다시 본다', async () => {
  const s = setup();
  s.recs.fail = (call) => call === 2;
  assert.equal((await s.run(SEND)).sent, 0);
  s.recs.fail = null;
  assert.equal((await s.run(SEND + 600_000)).sent, 1);
});
t('1 · 첫 읽기를 확인 못 한 발표는 장부도 쓰지 않고 건너뛴다', async () => {
  const s = setup();
  s.recs.fail = () => true;
  const r = await s.run(SEND);
  assert.equal(r.sent, 0); assert.deepEqual(r.skipped.map((x) => x.reason), ['read_failed', 'read_failed']);
  assert.equal(s.store.m.has(RESULT_KEYS.fp('JPM', D)), false);
});

// ── 요구 2 — 고르는 기준 = 채점표(scorecardPairOf) 하나 · 새 기준 없음 ─────────────────────────────────────
/** 채점표가 그 기록을 받아들이는가(같은 주 집계에 행으로 들어가는가) */
const inScorecard = (r: unknown, now = SEND) => aggregateScorecard('2026-10-12', [r], now).rows.length === 1;
t('2 · 현재 서비스가 저장하는 기록(firstExpiry 없음)은 대상 — 관문 11041319 #1(발송 대상 0) 회귀', () => {
  const r = raw();
  assert.equal('firstExpiry' in r.expected, false);
  assert.ok(inScorecard(r)); assert.equal(reason(resultEligibility(entry('JPM'), r, SEND)), 'ok');
});
t('2 · 채점표가 받아들이는 기록 = 대상 · 받아들이지 않는 기록 = 제외(같은 함수, 같은 판정)', () => {
  const noExp = raw(); noExp.expected = null;
  const noAct = raw(); noAct.actual = null;
  const cases: Array<[string, any, boolean]> = [
    ['기준', raw(), true],
    ['실제 0% 도 쌍', raw('JPM', 4.3, 0, { a: { reactClose: 100 } }), true],
    ['범위 밖', raw('JPM', 3, -4.5), true],
    ['사후 보강 src(eod-chain)도 채점표가 받으면 대상', raw('JPM', 4.3, 2.1, { e: { src: 'eod-chain' } }), true],
    ['장전인데 예상 세션이 발표일(사후 관측)', raw('JPM', 4.3, 2.1, { e: { session: D } }), false],
    ['예상 없음', noExp, false],
    ['실제 없음', noAct, false],
    ['예상 % 와 보존한 ATM 값이 충돌(weekly · straddlePct 다름)', raw('JPM', 4.3, 2.1, { e: { straddlePct: 5.1 } }), false],
    ['method 없는 옛 기록 · 원금액 비율과 일치', raw('JPM', 4.3, 2.1, { e: { method: undefined } }), true],
    ['method 없는 옛 기록 · 원금액 비율과 불일치', raw('JPM', 4.3, 2.1, { e: { method: undefined, straddle: 5.1 } }), false],
    ['method null(정의 불명)', raw('JPM', 4.3, 2.1, { e: { method: null } }), false],
    ['반응 세션 불일치(baseDate)', raw('JPM', 4.3, 2.1, { a: { baseDate: '2026-10-09' } }), false],
    ['반응 세션 불일치(reactDate)', raw('JPM', 4.3, 2.1, { a: { reactDate: '2026-10-14' } }), false],
    ['비현실적 등락(분할 오염)', raw('JPM', 4.3, 80, { a: { reactClose: 180 } }), false],
    ['관측 시각이 미래', raw('JPM', 4.3, 2.1, { e: { capturedAt: SEND + 1 } }), false],
  ];
  for (const [name, r, want] of cases) {
    assert.equal(inScorecard(r), want, `채점표 ${name}`);
    assert.equal(scorecardPairOf(r, SEND) != null, want, `scorecardPairOf ${name}`);
    const got = resultEligibility(entry('JPM'), r, SEND);
    assert.equal(got.ok, want, `알림 ${name}: ${reason(got)}`);
    if (!want) assert.equal(reason(got), 'not_scorecard_pair', name);
    if (got.ok) {
      const row = aggregateScorecard('2026-10-12', [r], SEND).rows[0];
      assert.deepEqual(got.alert, { ticker: row.ticker, date: row.date, expected: row.expectedPct, actual: row.actualPct, beyond: row.beyond }, `${name}: 숫자·범위 판정은 채점표 행 그대로`);
    }
  }
});
t('2 · 다른 종목·날짜·발표 구분의 기록은 대상이 아니다', () => {
  assert.equal(reason(resultEligibility(entry('C'), raw(), SEND)), 'record_mismatch');
  assert.equal(reason(resultEligibility(entry('JPM', 'amc'), raw(), SEND)), 'record_mismatch');
  assert.equal(reason(resultEligibility({ ...entry('JPM'), hour: '' as any }, raw(), SEND)), 'no_hour');
  assert.equal(reason(resultEligibility(entry('JPM'), null, SEND)), 'no_record');
});

// ── 요구 3 — 잠금이 없거나 잠금 저장소가 불가·시간 초과면 아무것도 하지 않는다 ─────────────────────────────
t('3 · 실적 크론 잠금을 못 얻은 회차(busy·unavailable)는 읽기·쓰기·발송 0 — 관문 11011001 #2 · 11011010 #2', async () => {
  const s = setup();
  const r = await s.run(SEND, { runLockAcquired: false });
  assert.equal(r.status, 'no_run_lock'); assert.equal(s.recs.calls, 0); assert.deepEqual(s.store.writes, []); assert.equal(s.sender.calls, 0);
});
t('3 · 발송 잠금 저장소가 던지거나 시간 초과면 아무것도 하지 않는다', async () => {
  for (const mode of ['throw', 'hang', 'busy'] as const) {
    const s = setup();
    s.store.setNx = mode === 'throw' ? async () => { throw new Error('upstash down'); }
      : mode === 'hang' ? () => new Promise<boolean>(() => {}) : async () => false;
    const r = await s.run(SEND);
    assert.equal(r.status, 'send_lock_unavailable', mode); assert.equal(s.recs.calls, 0, mode); assert.equal(s.sender.calls, 0, mode);
  }
  const s = setup();
  s.store.get = async () => { throw new Error('upstash down'); };
  assert.equal((await s.run(SEND)).status, 'store_unavailable');
  assert.equal(s.recs.calls, 0);
});
t('3 · 잠금 마감이 지났으면 시작하지 않는다 · 모드 off 면 0', async () => {
  const s = setup();
  assert.equal((await s.run(SEND, { lockDeadline: SEND })).status, 'lock_expiring');
  assert.equal((await s.run(SEND, { envMode: 'off' })).status, 'off');
  s.store.m.set('push:sig:mode', 'off');
  assert.equal((await s.run(SEND, { envMode: 'live' })).status, 'off');
  assert.equal(s.recs.calls, 0); assert.equal(s.sender.calls, 0);
});
t('3 · 장부 저장소가 단계 중간에 불가하면 발송하지 않는다', async () => {
  const s = setup();
  const orig = s.store.mget.bind(s.store);
  s.store.mget = async (keys: string[]) => { if (keys.some((k) => k.startsWith('push:sig:result:fp:'))) throw new Error('down'); return orig(keys); };
  const r = await s.run(SEND);
  assert.equal(r.status, 'store_unavailable'); assert.equal(s.sender.calls, 0);
});

// ── 요구 4 — 종목×발표일 한 번 · 정정은 로그만 ────────────────────────────────────────────────────────
t('4 · 같은 발표는 기기마다 한 번만(두 번째 회차 0) · 종목을 가진 기기에만', async () => {
  const s = setup([raw(), raw('C', 3, 4)], [
    [IOS_TOKEN, { watchlist: { t: ['JPM'] }, tz: 'Asia/Seoul' }],
    [IOS_TOKEN2, { watchlist: { t: ['C'] }, preferences: { enabled: false } }],
    [AND_TOKEN, { locale: 'en', watchlist: { t: ['JPM', 'C'] }, tz: 'America/New_York' }],
  ]);
  assert.equal((await s.run(SEND)).sent, 3);
  assert.equal((await s.run(SEND + 1_800_000)).sent, 0);
  assert.equal(s.sender.items.length, 3);
  const ko = s.sender.items.find((x) => x.token === IOS_TOKEN)!;
  assert.equal(ko.title, '⚡ JPM 실적'); assert.equal(ko.body, '옵션 예상 ±4.3% → 실제 +2.1% (범위 안)');
  assert.equal(ko.data.path, '/app-view/earnings'); assert.equal(ko.data.type, 'wl_signal'); assert.equal(ko.data.src, 'push_sig_earn');
  assert.equal(s.sender.items.find((x) => x.token === AND_TOKEN && x.data.t === 'C')!.body, 'Implied move ±3.0% → actual +4.0% (Outside range)');
});
t('4 · 안정 전 처음 본 값이 뒤에 바뀌면(정정) 그 발표는 영원히 보내지 않는다', async () => {
  const fresh = raw('JPM', 4.3, 2.1, { at: SEND - 3_600_000 });
  const s = setup([fresh]);
  const r1 = await s.run(SEND);
  assert.equal(r1.sent, 0); assert.ok(r1.skipped.some((x) => x.reason === 'unstable'));
  assert.ok(s.store.m.has(RESULT_KEYS.fp('JPM', D)), '처음 본 값의 지문');
  s.recs.put(raw('JPM', 4.3, 1.9, { a: { reactClose: 101.9 } }));        // 종가 재확인으로 값이 바뀌었다
  const r2 = await s.run(SEND + 3_600_000);
  assert.deepEqual(r2.corrected, ['JPM|2026-10-13']); assert.equal(r2.sent, 0);
  assert.equal(s.logs.filter((m) => m.includes('정정됨')).length, 1);
  const r3 = await s.run(SEND + 2 * 86400_000);                           // 바뀐 값이 아무리 안정돼도
  assert.equal(r3.sent, 0); assert.equal(s.sender.calls, 0);
  assert.equal(s.logs.filter((m) => m.includes('정정됨')).length, 1, '정정 로그는 한 번');
});
t('4 · 보낸 뒤 정정되면 로그만 — 정정 푸시 없음', async () => {
  const s = setup();
  assert.equal((await s.run(SEND)).sent, 1);
  s.recs.put({ ...raw(), actual: null, at: SEND + 60_000 });             // 기록 삭제(공급사 불일치)
  const r = await s.run(SEND + 1_800_000);
  assert.deepEqual(r.corrected, ['JPM|2026-10-13']); assert.equal(s.sender.items.length, 1);
  assert.ok(s.logs.some((m) => m.includes('정정됨 JPM')));
});
t('4 · 정정이 아닌 것 — 같은 값의 재확인(at 갱신)·대조 보강(check null→fmp)은 지문이 같다', async () => {
  assert.equal(resultValueFingerprint(raw('JPM', 4.3, 2.1, { a: { check: null, at: 1 }, at: 1 })), resultValueFingerprint(raw()));
  assert.notEqual(resultValueFingerprint(raw('JPM', 4.3, 2.2)), resultValueFingerprint(raw()));
  assert.notEqual(resultValueFingerprint(raw('JPM', 4.3, 2.1, { e: { capturedAt: 5 } })), resultValueFingerprint(raw()));
  assert.equal(resultValueFingerprint({ ...raw(), actual: null }), null);
  const early = Date.parse('2026-10-13T21:00:00Z');
  const s = setup([raw('JPM', 4.3, 2.1, { a: { check: null, at: early }, at: early })]);
  assert.equal((await s.run(early + 600_000)).sent, 0);
  s.recs.put(raw());                                                     // 대조 보강 + 정착 재확인(값 같음)
  const r = await s.run(SEND);
  assert.equal(r.corrected.length, 0); assert.equal(r.sent, 1);
});
t('4 · 기기 하루 상한·발송 실패 반환은 기존 규칙 그대로', async () => {
  const s = setup();
  s.store.m.set(`push:sig:cap:2026-10-14:${devKey(IOS_TOKEN)}`, 3);
  assert.equal((await s.run(SEND)).sent, 0);
  const f = setup();
  f.sender.failIds = () => 'fail';
  assert.equal((await f.run(SEND)).sent, 0);
  assert.equal(f.store.m.has(`push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`), false);
  f.sender.failIds = null;
  assert.equal((await f.run(SEND + 600_000)).sent, 1);
});

// ── 요구 5 — 발송 모드 기본 dry(«내 종목 이상 신호» 스위치 공유) ───────────────────────────────────────
t('5 · 모드 키가 없고 환경값도 없으면(dry 기본) 대상은 세지만 보내지 않는다', async () => {
  const s = setup();
  s.store.m.delete('push:sig:mode');
  const r = await s.run(SEND);
  assert.equal(r.status, 'observed'); assert.deepEqual(r.candidates, ['JPM|2026-10-13']);
  assert.equal(r.sent, 0); assert.equal(s.sender.calls, 0); assert.equal(s.sender.items.length, 0);
  assert.equal(s.store.m.has(`push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`), false, 'dry 는 기기 장부를 쓰지 않는다');
  assert.equal(s.store.m.has(`push:sig:cap:2026-10-14:${devKey(IOS_TOKEN)}`), false, 'dry 는 하루 상한을 쓰지 않는다');
});
t('5 · 환경값 dry · 레디스 dry 도 무발송 · 신호 스위치가 live 가 되면 같은 회차 규칙으로 보낸다', async () => {
  const s = setup();
  s.store.m.set('push:sig:mode', 'dry');
  assert.equal((await s.run(SEND, { envMode: 'dry' })).sent, 0); assert.equal(s.sender.calls, 0);
  s.store.m.delete('push:sig:mode');
  assert.equal((await s.run(SEND + 60_000, { envMode: 'live' })).sent, 1);
});
t('5 · 발송 금지 시간대(inPushBlackout)엔 live 여도 보내지 않는다 — 기존 규칙', async () => {
  const s = setup();
  const blackout = T('2026-10-14', 9, 31);                          // 정규장 개장 직후(기존 신호 규칙의 금지 창)
  const r = await s.run(blackout);
  assert.equal(r.status, 'observed'); assert.deepEqual(r.candidates, ['JPM|2026-10-13'], '대상이지만');
  assert.equal(s.sender.calls, 0);
});

// ── 문구·경로 ──────────────────────────────────────────────────────────────────────────────────────
t('문구 세 언어(범위 안/밖 = 영수증·앱 실적 화면 문구) · 탭 경로는 기존 리스너의 닫힌 목록', () => {
  const a = { ticker: 'JPM', date: D, expected: 4.3, actual: 2.1, beyond: false };
  assert.deepEqual(resultCopy(a, 'ko'), { title: '⚡ JPM 실적', body: '옵션 예상 ±4.3% → 실제 +2.1% (범위 안)' });
  assert.deepEqual(resultCopy({ ...a, actual: -5.25, beyond: true }, 'ko'), { title: '⚡ JPM 실적', body: '옵션 예상 ±4.3% → 실제 −5.3% (범위 밖)' });
  assert.deepEqual(resultCopy(a, 'en'), { title: '⚡ JPM earnings', body: 'Implied move ±4.3% → actual +2.1% (Within range)' });
  assert.deepEqual(resultCopy({ ...a, beyond: true, actual: 4.8 }, 'ja'), { title: '⚡ JPM 決算', body: '想定変動幅 ±4.3% → 実際 +4.8%（範囲外）' });
  assert.equal(resultPath(), '/app-view/earnings');
  assert.equal(signalTapPath(resultPath()), '/app-view/earnings');
  assert.equal(signalTapPath('/app-view/earnings?x=1'), null); assert.equal(signalTapPath('https://evil.example/app-view/earnings'), null);
  assert.equal(signalTapPath('/receipts/earnings?week=2026-10-12#receipt-JPM-2026-10-13'), null, '옛 영수증 경로는 더 이상 받지 않는다');
});
t('문구 — 소수 1자리에서 같아 보이는 «범위 밖»은 자릿수를 늘려 모순을 없앤다 · «범위 안»은 화면 표기 그대로', () => {
  assert.equal(resultCopy({ ticker: 'JPM', date: D, expected: 3.6, actual: 3.62, beyond: true }, 'ko').body, '옵션 예상 ±3.60% → 실제 +3.62% (범위 밖)');
  assert.equal(resultCopy({ ticker: 'JPM', date: D, expected: 3.6, actual: -3.6004, beyond: true }, 'ko').body, '옵션 예상 ±3.6000% → 실제 −3.6004% (범위 밖)');
  assert.equal(resultCopy({ ticker: 'JPM', date: D, expected: 3.6, actual: 3.6, beyond: false }, 'ko').body, '옵션 예상 ±3.6% → 실제 +3.6% (범위 안)');
  assert.equal(resultCopy({ ticker: 'JPM', date: D, expected: 3.6, actual: 3.56, beyond: false }, 'ko').body, '옵션 예상 ±3.6% → 실제 +3.6% (범위 안)');
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} 통과`);
})();
