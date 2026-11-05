// 실적 결과 알림 — 발송 단계 하나·채점표와 같은 기준·끝난 기록만·잠금 없으면 0·dry 무발송·정정은 로그만
// (관문 11010757·11011001·11011010·11041319 회귀 시험)
import assert from 'node:assert/strict';
import {
  resultEligibility, resultCopy, resultPath, resultValueFingerprint, runEarningsResultStep, resultEnvMode, RESULT_KEYS, RESULT_STABLE_MS, CLAIM_TTL_SEC, SEAL_TIMEOUT_MS,
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
/**
 * 운영 Upstash 클라이언트처럼 읽는 가짜 저장소 — @upstash/redis 의 automaticDeserialization(parseRecursive)과 같은 규칙:
 * 문자열을 JSON.parse 해 보고, 되면 그 값(객체·숫자 등, 숫자는 문자열과 표기가 같을 때만), 안 되면 문자열 그대로(관문 11041431 #1).
 */
const upstashParse = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  try { const p = JSON.parse(v); return typeof p === 'number' && p.toString() !== v ? v : p; } catch { return v; }
};
class UpstashLikeStore extends FakeStore {
  /** ms 수명(PX)이 붙은 키의 만료 시각 — 실제 시계 기준, 읽고 쓸 때 지나 있으면 없는 키(Redis 의 게으른 만료와 같다) */
  exp = new Map<string, number>();
  sweep(k: string) { const e = this.exp.get(k); if (e != null && Date.now() >= e) { this.m.delete(k); this.exp.delete(k); } }
  /** 만료를 반영한 «지금 있는가» */
  live(k: string) { this.sweep(k); return this.m.has(k); }
  async mget(keys: string[]) { keys.forEach((k) => this.sweep(k)); return (await super.mget(keys)).map(upstashParse); }
  async get(k: string) { this.sweep(k); return upstashParse(await super.get(k)); }
  async setNx(k: string, v: string, ex: number) { this.sweep(k); const ok = await super.setNx(k, v, ex); if (ok) this.exp.delete(k); return ok; }
  async del(keys: string[]) { keys.forEach((k) => this.exp.delete(k)); return super.del(keys); }
  /** 운영 SET_IF_EQ_LUA 와 같은 규칙 — 값이 글자 그대로 expect 일 때만 바꾸고 수명(EX 초 · PX ms) */
  async setIfEq(k: string, expect: string, v: string, ttl: { ex: number } | { px: number }) {
    this.sweep(k);
    if (!this.m.has(k) || this.m.get(k) !== expect) return false;
    this.m.set(k, v);
    if ('ex' in ttl) { this.ttl.set(k, ttl.ex); this.exp.delete(k); } else this.exp.set(k, Date.now() + ttl.px);
    this.writes.push(`setifeq:${k}`); return true;
  }
  /** 운영 DEL_IF_EQ_LUA 와 같은 규칙 — 값이 expects 중 하나일 때만 지운다 */
  async delIfEq(k: string, expects: string[]) { this.sweep(k); if (this.m.has(k) && expects.includes(String(this.m.get(k)))) await this.del([k]); }
}
function setup(records: any[] = [raw()], devices: Array<[string, Record<string, unknown>]> = [[IOS_TOKEN, { watchlist: { t: ['JPM'] }, tz: 'Asia/Seoul' }]]) {
  const store = new UpstashLikeStore(), sender = new FakeSender(), recs = new FakeRecords(), logs: string[] = [];
  store.m.set(RESULT_KEYS.mode, 'live');                    // 이 알림 전용 스위치(신호 스위치와 따로)
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
t('1 · FMP 대조 없는(Intrinio 단독) 행은 채점표엔 있어도 알리지 않는다 — 채점표 check 필드 그대로(관문 11041435 #1 · 코디네이터 11/4)', () => {
  const single = raw('JPM', 4.3, 2.1, { a: { check: null } });
  assert.equal(aggregateScorecard('2026-10-12', [single], SEND).rows[0]?.check, 'intrinio_only', '채점표 표시는 그대로');
  assert.equal(reason(resultEligibility(entry('JPM'), single, SEND)), 'actual_unconfirmed');
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
t('4 · 보낼 수 있게 되기 전의 값 갱신(임시 종가 → 확정 뒤 재확인)은 정정이 아니다 — 안정되면 새 값으로 한 번 보낸다(관문 11041428 #2)', async () => {
  const early = Date.parse('2026-10-13T21:00:00Z');                    // 일봉 확정 뒤 · 재확인 전 임시 종가
  const s = setup([raw('JPM', 4.3, 2.1, { a: { at: early }, at: early })]);
  const r1 = await s.run(SEND);
  assert.equal(r1.sent, 0); assert.ok(r1.skipped.some((x) => x.reason === 'actual_unsettled'));
  assert.equal(s.store.m.has(RESULT_KEYS.fp('JPM', D)), false, '보낼 수 없는 값에는 지문을 남기지 않는다');
  s.recs.put(raw('JPM', 4.3, 1.9, { a: { reactClose: 101.9 } }));      // 서비스 ③-0 이 확정 종가로 고쳐 썼다(WRITTEN 시각)
  const r2 = await s.run(SEND + 600_000);
  assert.deepEqual(r2.corrected, []); assert.equal(r2.sent, 1);
  assert.equal(s.sender.items[0].body, '옵션 예상 ±4.3% → 실제 +1.9% (범위 안)', '바뀐 뒤의 확정값으로');
  assert.equal(s.logs.filter((m) => m.includes('정정됨')).length, 0);
});
t('4 · 보낼 수 있는 상태에서 지문을 남긴 뒤 값이 바뀌면 정정 — 그 발표는 영원히 보내지 않는다(로그 한 번)', async () => {
  const s = setup();
  s.store.m.set(RESULT_KEYS.mode, 'dry');                               // dry 회차가 지문만 남긴다
  const r1 = await s.run(SEND);
  assert.equal(r1.sent, 0); assert.ok(s.store.m.has(RESULT_KEYS.fp('JPM', D)));
  s.store.m.set(RESULT_KEYS.mode, 'live');
  s.recs.put(raw('JPM', 4.3, 1.9, { a: { reactClose: 101.9 } }));
  const r2 = await s.run(SEND + 3_600_000);
  assert.deepEqual(r2.corrected, ['JPM|2026-10-13']); assert.equal(r2.sent, 0);
  const r3 = await s.run(SEND + 2 * 86400_000);
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
t('4 · 기기 하루 상한은 기존 규칙 그대로 — 넘으면 자리·상한을 돌려주고 보내지 않는다', async () => {
  const s = setup();
  s.store.m.set(`push:sig:cap:2026-10-14:${devKey(IOS_TOKEN)}`, 3);
  assert.equal((await s.run(SEND)).sent, 0);
  assert.equal(s.store.m.has(`push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`), false);
  assert.equal(Number(s.store.m.get(`push:sig:cap:2026-10-14:${devKey(IOS_TOKEN)}`)), 3);
});

t('4 · 운영 Upstash 읽기(JSON 자동 해석)에서도 지문이 «쓴 그대로» 돌아온다 — 안정 결과가 실제로 발송된다(관문 11041431 #1)', async () => {
  const s = setup();
  assert.equal((await s.run(SEND)).sent, 1);
  const fp = await s.store.get(RESULT_KEYS.fp('JPM', D));
  assert.equal(typeof fp, 'string'); assert.ok(String(fp).startsWith('fp1:'));
  assert.equal(fp, resultValueFingerprint(raw()));
  const again = await s.run(SEND + 1_800_000);
  assert.equal(again.sent, 0); assert.deepEqual(again.corrected, [], '같은 값은 정정이 아니다'); assert.deepEqual(again.skipped, []);
});
t('4 · 기기 자리는 선점·재확인 동안 짧게(10분) — 보내기 직전에만 120일로 굳힌다(관문 11041431 #2 · 11041441 #2)', async () => {
  const s = setup();
  const key = `push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`;
  const atVerify: Array<[unknown, number | undefined]> = [], atSend: Array<[unknown, number | undefined]> = [];
  const read = s.recs.read;
  const deps = { ...s.deps, readStrict: async (keys: string[]) => { if (s.recs.calls >= 1) atVerify.push([s.store.m.get(key), s.store.ttl.get(key)]); return read(keys); } };
  const orig = s.sender.send.bind(s.sender);
  s.sender.send = async (items: any) => { atSend.push([s.store.m.get(key), s.store.ttl.get(key)]); return orig(items); };
  assert.equal((await runEarningsResultStep({ ...deps, clock: () => SEND }, s.opts(SEND))).sent, 1);
  assert.match(String(atVerify[0][0]), /^claim:/); assert.equal(atVerify[0][1], CLAIM_TTL_SEC, '재확인 동안은 선점 수명');
  assert.match(String(atSend[0][0]), /^sent:/); assert.equal(atSend[0][1], 120 * 86400, '보내는 순간엔 이미 120일 장부');
  // 보내기 전 중단 흉내 — 선점만 남은 자리: 살아 있으면 건드리지 않고, 만료(10분) 뒤 다음 회차가 보낸다
  const k = setup();
  k.store.m.set(key, `claim:${SEND}`); k.store.ttl.set(key, CLAIM_TTL_SEC);
  assert.equal((await k.run(SEND + 60_000)).sent, 0, '선점이 살아 있으면 건드리지 않는다');
  k.store.m.delete(key);
  assert.equal((await k.run(SEND + 30 * 60_000)).sent, 1);
});
t('4 · 발송 결과를 모르면(발송 함수가 던짐) 장부를 그대로 둬 다시 보내지 않는다 — 중복 0 우선', async () => {
  const s = setup();
  s.sender.send = async () => { throw new Error('function killed mid-send'); };
  const r1 = await s.run(SEND);
  assert.equal(r1.sent, 0); assert.ok(r1.skipped.some((x) => x.reason === 'send_unknown_kept'));
  assert.match(String(s.store.m.get(`push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`)), /^sent:/);
  const s2 = new FakeSender(); s.deps.sender = s2;
  assert.equal((await runEarningsResultStep({ ...s.deps, sender: s2, clock: () => SEND + 1_800_000 }, s.opts(SEND + 1_800_000))).sent, 0);
  assert.equal(s2.calls, 0, '같은 기기에 다시 보내지 않는다');
});
t('4 · 보내기 직전 굳히기(SET XX)가 실패하면 그 기기는 보내지 않고 자리·상한을 돌려준다 → 다음 회차가 보낸다', async () => {
  const s = setup();
  const orig = s.store.setIfEq.bind(s.store);
  let down = true;
  s.store.setIfEq = async (k, e, v, ttl) => { if (down && v.startsWith('sent:')) throw new Error('down'); return orig(k, e, v, ttl); };
  const r1 = await s.run(SEND);
  assert.equal(r1.sent, 0); assert.equal(s.sender.calls, 0);
  assert.equal(s.store.m.has(`push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`), false, '자리 반환');
  assert.equal(Number(s.store.m.get(`push:sig:cap:2026-10-14:${devKey(IOS_TOKEN)}`)), 0, '하루 상한 반환');
  s.store.setIfEq = orig; down = false;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 1);
});
t('4 · 굳히기가 시간 초과 뒤 «늦게» 도착해도 지운 자리를 되살리지 못한다(XX) — 다음 회차가 보낸다(관문 11041444 #2)', async () => {
  const s = setup();
  const key = `push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`;
  const orig = s.store.setIfEq.bind(s.store);
  let late: (() => Promise<boolean>) | null = null;
  s.store.setIfEq = (k, e, v, ttl) => { if (!v.startsWith('sent:')) return orig(k, e, v, ttl); late = () => orig(k, e, v, ttl); return new Promise<boolean>(() => {}); };   // 굳히기 응답 없음
  const r1 = await s.run(SEND);
  assert.equal(r1.sent, 0); assert.equal(s.sender.calls, 0);
  assert.equal(s.store.m.has(key), false, '시간 초과 → 자리 지움');
  assert.equal(await late!(), false, '늦은 쓰기는 이 회차 무장 값일 때만 쓰므로 아무것도 쓰지 않는다');
  assert.equal(s.store.m.has(key), false);
  s.store.setIfEq = orig;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 1);
});
t('4 · 한 번 시도한 발송은 공급사 결과가 fail 이어도 다시 보내지 않는다(응답 유실 = 이미 닿았을 수 있음, 관문 11041444 #1)', async () => {
  const s = setup();
  s.sender.failIds = () => 'fail';
  const r1 = await s.run(SEND);
  assert.equal(r1.sent, 0); assert.ok(r1.skipped.some((x) => x.reason === 'send_fail_kept'));
  assert.match(String(s.store.m.get(`push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`)), /^sent:/);
  s.sender.failIds = null;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 0); assert.equal(s.sender.calls, 1, '재발송 없음');
});
t('4 · dead 토큰은 기존처럼 목록에서 지운다(재발송 없음)', async () => {
  const s = setup();
  s.sender.failIds = () => 'dead';
  await s.run(SEND);
  assert.equal(s.store.sets.get('push:token_list')?.has(IOS_TOKEN), false);
});
t('4 · 굳히기가 늦어 마감을 넘기면 보내지 않고 자리·상한을 돌려준다(관문 11041444 #3)', async () => {
  const s = setup();
  let t = SEND;
  const orig = s.store.setIfEq.bind(s.store);
  s.store.setIfEq = async (k, e, v, ttl) => { if (v.startsWith('sent:')) t = SEND + 30_000; return orig(k, e, v, ttl); };   // 굳히는 사이 마감
  const r = await runEarningsResultStep({ ...s.deps, clock: () => t }, s.opts(SEND, { lockDeadline: SEND + 30_000 }));
  assert.equal(r.sent, 0); assert.equal(s.sender.calls, 0); assert.ok(r.skipped.some((x) => x.reason === 'lock_expiring'));
  assert.equal(s.store.m.has(`push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`), false);
  assert.equal(Number(s.store.m.get(`push:sig:cap:2026-10-14:${devKey(IOS_TOKEN)}`)), 0);
  s.store.setIfEq = orig;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 1);
});

t('4 · 지문을 남긴 발표의 기록이 통째로 지워지면 정정 — 같은 값으로 복구돼도 다시 보내지 않는다(관문 11041448 #2)', async () => {
  const s = setup([raw()], [[IOS_TOKEN, { watchlist: { t: ['JPM'] }, tz: 'Asia/Seoul' }], [AND_TOKEN, { locale: 'en', watchlist: { t: ['C'] } }]]);
  assert.equal((await s.run(SEND)).sent, 1);
  s.recs.m.delete(actualsKey('JPM', D));                                 // 기록 통째 삭제
  const r2 = await s.run(SEND + 1_800_000);
  assert.deepEqual(r2.corrected, ['JPM|2026-10-13']);
  assert.ok(s.logs.some((m) => m.includes('정정됨 JPM')));
  s.recs.put(raw());                                                     // 같은 값으로 복구
  s.store.addDevice(IOS_TOKEN2, { watchlist: { t: ['JPM'] } });          // 아직 받지 않은 기기
  const r3 = await s.run(SEND + 3_600_000);
  assert.equal(r3.sent, 0); assert.deepEqual(r3.corrected, ['JPM|2026-10-13']); assert.equal(s.sender.items.length, 1);
});
t('4 · 지문이 없는 발표의 «기록 없음»은 정정이 아니다(아직 안 생긴 기록)', async () => {
  const s = setup([]);
  const r = await s.run(SEND);
  assert.deepEqual(r.corrected, []); assert.equal(s.store.m.has(RESULT_KEYS.corrected('JPM', D)), false);
  s.recs.put(raw());
  assert.equal((await s.run(SEND + 600_000)).sent, 1);
});
t('4 · 허용된 손실 창(≤300ms) 최소화 — 플랫폼마다 굳히고 곧바로 그 플랫폼을 보낸다(iOS 발송 순간 안드 자리는 아직 선점 상태, 코디네이터 11/4)', async () => {
  const s = setup([raw()], [[IOS_TOKEN, { watchlist: { t: ['JPM'] }, tz: 'Asia/Seoul' }], [AND_TOKEN, { locale: 'en', watchlist: { t: ['JPM'] } }]]);
  const iosKey = `push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`, andKey = `push:sig:result:${devKey(AND_TOKEN)}:JPM:${D}`;
  const seen: Array<{ platforms: string[]; ios: string; and: string }> = [];
  const orig = s.sender.send.bind(s.sender);
  s.sender.send = async (items: any[]) => { seen.push({ platforms: items.map((x) => x.platform), ios: String(s.store.m.get(iosKey)), and: String(s.store.m.get(andKey)) }); return orig(items); };
  assert.equal((await s.run(SEND)).sent, 2);
  assert.equal(seen.length, 2, '플랫폼마다 따로 발송');
  assert.deepEqual(seen[0].platforms, ['ios']); assert.match(seen[0].ios, /^sent:/); assert.match(seen[0].and, /^claim:/, 'iOS 발송 순간 안드는 아직 굳히지 않았다');
  assert.deepEqual(seen[1].platforms, ['android']); assert.match(seen[1].and, /^sent:/);
});
t('4 · 허용된 손실 밖 — iOS 발송 뒤 마감이 오면 안드는 시도 전이므로 자리를 돌려주고 다음 회차가 안드만 보낸다(iOS 중복 없음)', async () => {
  const s = setup([raw()], [[IOS_TOKEN, { watchlist: { t: ['JPM'] }, tz: 'Asia/Seoul' }], [AND_TOKEN, { locale: 'en', watchlist: { t: ['JPM'] } }]]);
  let t = SEND;
  const orig = s.sender.send.bind(s.sender);
  s.sender.send = async (items: any[]) => { const r = await orig(items); t = SEND + 30_000; return r; };   // iOS 발송 직후 마감
  const r1 = await runEarningsResultStep({ ...s.deps, clock: () => t }, s.opts(SEND, { lockDeadline: SEND + 30_000 }));
  assert.equal(r1.sent, 1); assert.deepEqual(s.sender.items.map((x) => x.platform), ['ios']);
  assert.equal(s.store.m.has(`push:sig:result:${devKey(AND_TOKEN)}:JPM:${D}`), false, '안드 자리 반환');
  s.sender.send = orig;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 1);
  assert.deepEqual(s.sender.items.map((x) => x.platform), ['ios', 'android'], 'iOS 중복 없음');
});

const TWO_IOS: Array<[string, Record<string, unknown>]> = [[IOS_TOKEN, { watchlist: { t: ['JPM'] }, tz: 'Asia/Seoul' }], [IOS_TOKEN2, { watchlist: { t: ['JPM'] } }]];
const slowKeyOf = (tok: string) => `push:sig:result:${devKey(tok)}:JPM:${D}`;
const ms = (n: number) => new Promise((res) => setTimeout(res, n));
/** 그 키의 굳히기만 늦게 — 도착(서버 적용) 시각과 응답 방식을 고른다. hang 이면 응답이 오지 않는다 */
function slowSeal(s: ReturnType<typeof setup>, key: string, arriveMs: number, reply: 'ok' | 'throw' | 'hang' = 'ok') {
  const orig = s.store.setIfEq.bind(s.store);
  const st = { applied: null as boolean | null };
  s.store.setIfEq = (k, expect, v, ttl) => {
    if (k !== key || !v.startsWith('sent:')) return orig(k, expect, v, ttl);   // 굳히기만 늦게(무장은 그대로)
    return new Promise<boolean>((res, rej) => setTimeout(async () => {
      st.applied = await orig(k, expect, v, ttl);                         // 서버엔 이 시각에 적용(또는 무장 자리가 없어 무효)
      if (reply === 'ok') res(st.applied); else if (reply === 'throw') rej(new Error('response lost'));
    }, arriveMs));
  };
  return { st, restore: () => { s.store.setIfEq = orig; } };
}
t('4 · 허용된 손실 창 ≤ 300ms — 300ms 안에 굳은 기기는 곧바로 보내고, 지평(무장 600ms) 뒤에 도착한 굳히기는 자리가 사라져 무효(관문 11041451 #1)', async () => {
  const s = setup([raw()], TWO_IOS);
  const slowKey = slowKeyOf(IOS_TOKEN2);
  const slow = slowSeal(s, slowKey, 900);                                // 900ms 뒤 도착 — 무장 지평(600ms) 밖
  let sealedAt = 0; const sendAt: number[] = [];
  const fast = s.store.setIfEq;
  s.store.setIfEq = async (k, e, v, ttl) => { const r = await fast(k, e, v, ttl); if (k !== slowKey && v.startsWith('sent:')) sealedAt = Date.now(); return r; };
  const origSend = s.sender.send.bind(s.sender);
  s.sender.send = async (items: any) => { sendAt.push(Date.now()); return origSend(items); };
  const r1 = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 2500, clock: () => SEND }, s.opts(SEND));
  const waited = sendAt[0] - sealedAt;
  assert.equal(r1.sent, 1); assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN], '300ms 안에 굳은 기기만');
  assert.ok(waited >= SEAL_TIMEOUT_MS - 20 && waited < SEAL_TIMEOUT_MS + 150, `굳힌 기기가 발송 호출까지 기다린 시간 ${waited}ms ≈ 300ms 상한`);
  assert.equal(s.store.live(slowKey), false, '늦은 기기 자리 반환');
  assert.equal(Number(s.store.m.get(`push:sig:cap:2026-10-14:${devKey(IOS_TOKEN2)}`)), 0, '늦은 기기 상한 반환');
  await ms(700);
  assert.equal(slow.st.applied, false, '지평 뒤 도착한 굳히기는 무장 자리가 사라져 쓰지 못한다'); assert.equal(s.store.live(slowKey), false);
  s.store.setIfEq = fast; slow.restore(); s.sender.send = origSend;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 1);
  assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN, IOS_TOKEN2], '다음 회차가 늦은 기기만, 중복 없음');
});
t('4 · 공유 일일 상한 증가가 시간 초과·오류여도 항상 되돌린다 — 기존 신호 상한을 소모하지 않는다(lib/signals/run.ts 규칙, 관문 11041451 #2)', async () => {
  for (const mode of ['slow', 'throw'] as const) {
    const s = setup();
    const capKey = `push:sig:cap:2026-10-14:${devKey(IOS_TOKEN)}`;
    const orig = s.store.incr.bind(s.store);
    s.store.incr = async (k: string, ex: number) => {
      if (mode === 'throw') throw new Error('down');
      const n = await orig(k, ex);                                        // 서버엔 반영됐는데
      await new Promise((res) => setTimeout(res, 120));                   // 응답이 상한(storeTimeoutMs 50ms)보다 늦다
      return n;
    };
    const r = await s.run(SEND);
    assert.equal(r.sent, 0, mode); assert.equal(s.sender.calls, 0, mode);
    await new Promise((res) => setTimeout(res, 150));                     // 늦은 응답까지 끝난 뒤
    assert.ok(Number(s.store.m.get(capKey) ?? 0) <= 0, `${mode}: 상한이 소모되지 않았다(${s.store.m.get(capKey)})`);
    assert.equal(s.store.m.has(`push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`), false, `${mode}: 자리 반환`);
    s.store.incr = orig;
    assert.equal((await s.run(SEND + 1_800_000)).sent, 1, `${mode}: 다음 회차 발송`);
  }
});

t('4 · 관문 11042212 #1 재현 — 빠진 기기의 반환(del)이 멈춰도 먼저 굳은 기기는 기다리지 않고 300ms 상한 안에 보낸다', async () => {
  const s = setup([raw()], TWO_IOS);
  const slowKey = slowKeyOf(IOS_TOKEN2);
  const slow = slowSeal(s, slowKey, 5_000, 'hang');                      // 빠진 기기의 굳히기는 응답이 오지 않는다
  const del = s.store.delIfEq.bind(s.store);
  s.store.delIfEq = (k, ex) => (k === slowKey ? new Promise<void>(() => {}) : del(k, ex));   // 그 기기의 반환은 영영 끝나지 않는다
  let sealedAt = 0, sentAt = 0;
  const fast = s.store.setIfEq;
  s.store.setIfEq = async (k, e, v, ttl) => { const r = await fast(k, e, v, ttl); if (k !== slowKey && v.startsWith('sent:')) sealedAt = Date.now(); return r; };
  const origSend = s.sender.send.bind(s.sender);
  s.sender.send = async (items: any) => { if (!sentAt) sentAt = Date.now(); return origSend(items); };
  const t0 = Date.now();
  const r1 = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 2500, clock: () => SEND }, s.opts(SEND));
  assert.equal(r1.sent, 1); assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN]);
  assert.ok(sentAt - sealedAt < SEAL_TIMEOUT_MS + 150, `굳힌 기기 → 발송 호출 ${sentAt - sealedAt}ms(반환을 기다리지 않는다)`);
  assert.ok(Date.now() - t0 < 4_000, `단계 전체도 시간 상한 안에 끝난다(${Date.now() - t0}ms)`);
  assert.equal(s.store.live(slowKey), false, '빠진 기기는 무장 자리라 저절로 사라진다(장부 0)');
  s.store.setIfEq = fast; slow.restore(); s.store.delIfEq = del;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 1);
  assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN, IOS_TOKEN2], '다음 회차가 빠진 기기만, 중복 없음');
});
t('4 · 관문 11042212 #1 — 굳힌 뒤 보내기 직전에 마감을 다시 본다: 넘었으면 보내지 않고 굳은 자리를 되돌려 다음 회차가 한 번만 보낸다', async () => {
  const s = setup([raw()]);
  let now = SEND;
  const setIfEq = s.store.setIfEq.bind(s.store);
  s.store.setIfEq = async (k, e, v, ttl) => { const r = await setIfEq(k, e, v, ttl); if (v.startsWith('sent:')) now = SEND + 30_000; return r; };   // 굳히는 사이 마감(멈춘 이벤트 루프 흉내)
  const r1 = await runEarningsResultStep({ ...s.deps, clock: () => now }, s.opts(SEND, { lockDeadline: SEND + 30_000 }));
  assert.equal(r1.sent, 0); assert.equal(s.sender.calls, 0, '마감 뒤엔 발송 호출 0');
  assert.equal(s.store.live(slowKeyOf(IOS_TOKEN)), false, '굳은 120일 장부를 되돌렸다(시도 없는 장부 0)');
  assert.ok(r1.skipped.some((x) => x.reason === 'lock_expiring'));
  s.store.setIfEq = setIfEq;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 1); assert.equal(s.sender.items.length, 1);
});
t('4 · 관문 11042212 #2 재현 — 300ms 를 넘겨 굳은 기기의 삭제가 실패해도, 늦은 굳힘이 지평 안이면 같은 회차에 보낸다(시도 없는 120일 장부 0 · 중복 0)', async () => {
  const s = setup([raw()], TWO_IOS);
  const slowKey = slowKeyOf(IOS_TOKEN2);
  const slow = slowSeal(s, slowKey, 450);                                // 300ms 상한 뒤 · 지평(600ms) 안에 도착해 성공
  const del = s.store.delIfEq.bind(s.store);
  s.store.delIfEq = async (k, ex) => { if (k === slowKey) throw new Error('delete failed'); return del(k, ex); };
  const r1 = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 2500, clock: () => SEND }, s.opts(SEND));
  assert.equal(slow.st.applied, true, '늦은 굳히기는 서버에 적용됐다');
  assert.equal(r1.sent, 2); assert.deepEqual(s.sender.items.map((x) => x.token).sort(), [IOS_TOKEN, IOS_TOKEN2].sort(), '늦게 굳은 기기도 보냈다');
  assert.equal(s.sender.calls, 2, '먼저 굳은 기기와 따로 — 기다리지 않았다');
  assert.match(String(s.store.m.get(slowKey)), /^sent:/);
  slow.restore(); s.store.delIfEq = del;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 0, '다음 회차 중복 0'); assert.equal(s.sender.items.length, 2);
});
t('4 · 관문 11042212 #2 — 굳히기 응답이 오류로 끝나고(서버엔 적용) 삭제도 실패하면, 지평 뒤 읽어서 굳힘을 확인하고 보낸다', async () => {
  const s = setup([raw()], TWO_IOS);
  const slowKey = slowKeyOf(IOS_TOKEN2);
  const slow = slowSeal(s, slowKey, 350, 'throw');                       // 적용됐지만 응답은 오류
  const del = s.store.delIfEq.bind(s.store);
  s.store.delIfEq = async (k, ex) => { if (k === slowKey) throw new Error('delete failed'); return del(k, ex); };
  const r1 = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 2500, clock: () => SEND }, s.opts(SEND));
  assert.equal(slow.st.applied, true);
  assert.equal(r1.sent, 2, '읽어서 확인한 굳힘도 보낸다');
  slow.restore(); s.store.delIfEq = del;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 0, '중복 0');
});
t('4 · 관문 11042212 #2 — 삭제가 실패해도 지평 뒤 도착한 굳히기는 무장 자리가 사라져 쓰지 못한다 → 장부 0, 다음 회차가 보낸다', async () => {
  const s = setup([raw()], TWO_IOS);
  const slowKey = slowKeyOf(IOS_TOKEN2);
  const slow = slowSeal(s, slowKey, 900);
  const del = s.store.delIfEq.bind(s.store);
  s.store.delIfEq = async (k, ex) => { if (k === slowKey) throw new Error('delete failed'); return del(k, ex); };
  const r1 = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 2500, clock: () => SEND }, s.opts(SEND));
  assert.equal(r1.sent, 1);
  assert.ok(!r1.skipped.some((x) => x.reason === 'seal_unknown'), '지평 뒤 읽기로 «안 굳음» 확정');
  await ms(700);
  assert.equal(slow.st.applied, false, '늦은 굳히기 무효'); assert.equal(s.store.live(slowKey), false, '시도 없는 120일 장부 0');
  slow.restore(); s.store.delIfEq = del;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 1);
  assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN, IOS_TOKEN2], '빠진 기기만, 중복 없음');
});
t('4 · 관문 11051018·11051020 재현 — 지평 뒤 확정 읽기는 묶음 한 번(MGET): 첫 읽기가 멈춰도 다시 읽은 «즉시» 확인된 기기 전부를 발송 호출 1회로 보낸다', async () => {
  const devs = manyDevices(12);
  const s = setup([raw()], devs);
  const setIfEq = s.store.setIfEq.bind(s.store), mget = s.store.mget.bind(s.store);
  // 모든 기기의 굳히기는 서버에 적용됐지만 응답은 오류
  s.store.setIfEq = async (k, e, v, ttl) => { const r = await setIfEq(k, e, v, ttl); if (v.startsWith('sent:')) throw new Error('response lost'); return r; };
  let sealReads = 0, readOkAt = 0;
  s.store.mget = async (keys: string[]) => {
    if (!keys.every((k) => k.startsWith('push:sig:result:') && !k.includes(':fp:') && !k.includes(':corr:'))) return mget(keys);
    if (++sealReads === 1) return new Promise<unknown[]>(() => {});   // 첫 확정 읽기는 시간 초과
    const v = await mget(keys); readOkAt = Date.now(); return v;
  };
  const calls: Array<{ n: number; at: number }> = [];
  const origSend = s.sender.send.bind(s.sender);
  s.sender.send = async (items: any) => { calls.push({ n: items.length, at: Date.now() }); return origSend(items); };
  const r1 = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 2500, clock: () => SEND }, s.opts(SEND));
  assert.equal(r1.sent, 12, JSON.stringify(r1.skipped.slice(0, 3)));
  assert.deepEqual(calls.map((c) => c.n), [12], '읽어서 확인한 기기 전부를 발송 호출 1회로(공급사 연결 1개)');
  assert.equal(sealReads, 2, '묶음 읽기 2회(기기마다 따로 읽지 않는다)');
  assert.ok(calls[0].at - readOkAt < 50, `확인 → 발송 ${calls[0].at - readOkAt}ms`);
  s.store.setIfEq = setIfEq; s.store.mget = mget; s.sender.send = origSend;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 0, '다음 회차 중복 0');
});
t('4 · 저장소가 끝까지 답하지 않으면(굳히기 오류·읽기 실패·삭제 실패) 반환 완료로 치지 않고 seal_unknown 으로 보고한다 · 보내지 않는다(중복 0)', async () => {
  const s = setup([raw()], TWO_IOS);
  const slowKey = slowKeyOf(IOS_TOKEN2);
  const slow = slowSeal(s, slowKey, 350, 'throw');
  const del = s.store.delIfEq.bind(s.store), mget = s.store.mget.bind(s.store);
  s.store.delIfEq = async (k, ex) => { if (k === slowKey) throw new Error('delete failed'); return del(k, ex); };
  s.store.mget = async (keys: string[]) => { if (keys.includes(slowKey)) throw new Error('read failed'); return mget(keys); };
  const r1 = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 2500, clock: () => SEND }, s.opts(SEND));
  assert.equal(r1.sent, 1); assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN]);
  assert.ok(r1.skipped.some((x) => x.reason === 'seal_unknown' && x.key.startsWith(devKey(IOS_TOKEN2))), JSON.stringify(r1.skipped));
  slow.restore(); s.store.delIfEq = del; s.store.mget = mget;
});
t('4 · 관문 11051012 #1 재현 — 한 기기의 무장이 응답 없고 그 기기 삭제가 두 번 시간 초과돼도, 무장한 정상 기기는 수명(600ms) 안에 굳혀 보낸다', async () => {
  const s = setup([raw()], TWO_IOS);
  const slowKey = slowKeyOf(IOS_TOKEN2);
  const setIfEq = s.store.setIfEq.bind(s.store), del = s.store.delIfEq.bind(s.store);
  s.store.setIfEq = (k, e, v, ttl) => (k === slowKey && v.startsWith('arm:') ? new Promise<boolean>(() => {}) : setIfEq(k, e, v, ttl));   // 무장 응답 없음
  s.store.delIfEq = (k, ex) => (k === slowKey ? new Promise<void>(() => {}) : del(k, ex));                                              // 삭제도 매번 시간 초과
  const r1 = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 2500, clock: () => SEND }, s.opts(SEND));
  assert.equal(r1.sent, 1, JSON.stringify(r1.skipped)); assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN], '정상 기기는 굳혀 보냈다');
  assert.match(String(s.store.m.get(slowKeyOf(IOS_TOKEN))), /^sent:/);
  s.store.setIfEq = setIfEq; s.store.delIfEq = del;
  s.store.m.delete(slowKey);                                             // 선점 수명(10분) 경과 흉내
  assert.equal((await s.run(SEND + 1_800_000)).sent, 1);
  assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN, IOS_TOKEN2], '다음 회차가 빠진 기기만, 중복 없음');
});
t('4 · 관문 11051012 #2 재현 — 이전 회차의 지연된 굳히기·무장·지우기는 다음 회차가 다시 잡은 자리·장부를 덮거나 지우지 못한다(회차 표식 비교)', async () => {
  const s = setup([raw()], TWO_IOS);
  const slowKey = slowKeyOf(IOS_TOKEN2);
  const setIfEq = s.store.setIfEq.bind(s.store), del = s.store.delIfEq.bind(s.store);
  const stale: Array<() => Promise<unknown>> = [];
  // 1회차: 빠진 기기의 굳히기·무장 재시도·지우기가 모두 «나중에 도착»하도록 붙잡아 둔다(응답 없음)
  s.store.setIfEq = (k, e, v, ttl) => {
    if (k === slowKey && v.startsWith('sent:')) { stale.push(() => setIfEq(k, e, v, ttl), () => setIfEq(k, e.replace(/^arm:/, 'claim:'), e, { px: 600_000 })); return new Promise<boolean>(() => {}); }
    return setIfEq(k, e, v, ttl);
  };
  s.store.delIfEq = (k, ex) => { if (k === slowKey) { stale.push(() => del(k, ex)); return new Promise<void>(() => {}); } return del(k, ex); };
  const r1 = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 2500, clock: () => SEND }, s.opts(SEND));
  assert.equal(r1.sent, 1);
  s.store.setIfEq = setIfEq; s.store.delIfEq = del;
  assert.equal(s.store.live(slowKey), false, '1회차 무장 자리는 저절로 사라졌다');
  // 2회차: 빠진 기기를 다시 잡은 «직후» 1회차의 지연 요청이 모두 도착
  const setNx = s.store.setNx.bind(s.store);
  let landed: unknown[] = [];
  s.store.setNx = async (k, v, ex) => { const ok = await setNx(k, v, ex); if (ok && k === slowKey) landed = await Promise.all(stale.map((f) => f())); return ok; };
  const r2 = await s.run(SEND + 1_800_000);
  assert.deepEqual(landed.slice(0, 2), [false, false], '지연된 굳히기·무장은 값이 달라 쓰지 못한다');
  assert.equal(r2.sent, 1); assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN, IOS_TOKEN2]);
  const v2 = String(s.store.m.get(slowKey));
  assert.match(v2, /^sent:/);
  // 2회차가 보낸 뒤 1회차의 지연된 지우기가 또 도착해도 2회차 장부는 그대로 → 3회차 중복 0
  await Promise.all(stale.filter((_, i) => i >= 2).map((f) => f()));
  assert.equal(String(s.store.m.get(slowKey)), v2, '지연된 지우기는 다른 회차 장부를 지우지 못한다');
  s.store.setNx = setNx;
  assert.equal((await s.run(SEND + 3_600_000)).sent, 0); assert.equal(s.sender.items.length, 2);
});
// ── 야간 검토 20261105 #2 · 관문 11060111·11060355 — 반환(decr·자리 지우기)은 뒤에서, 같은 기기의 상한 판정은 장부(owed)로 ──────────
const capOf = (tok: string) => `push:sig:cap:2026-10-14:${devKey(tok)}`;
const TWO_TICKERS: Array<[string, Record<string, unknown>]> = [[IOS_TOKEN, { watchlist: { t: ['JPM', 'C'] }, tz: 'Asia/Seoul' }]];
t('4 · 야간 검토 #2 — 상한 처리 실패 기기의 반환이 2초 걸려도 정상 기기 발송은 그 반환을 기다리지 않는다', async () => {
  const s = setup([raw()], TWO_IOS);
  const badKey = slowKeyOf(IOS_TOKEN2), badCap = capOf(IOS_TOKEN2);
  const incr = s.store.incr.bind(s.store), decr = s.store.decr.bind(s.store), del = s.store.delIfEq.bind(s.store);
  s.store.incr = async (k, ex) => (k === badCap ? new Promise<number>(() => {}) : incr(k, ex));   // 빠진 기기의 증가는 응답 없음(시간 초과)
  let refundAt = 0, refundDone = 0;
  s.store.decr = async (k) => { if (k === badCap) { refundAt = Date.now(); await ms(2000); refundDone = Date.now(); } return decr(k); };
  s.store.delIfEq = async (k, ex) => { if (k === badKey) await ms(2000); return del(k, ex); };
  let sendAt = 0;
  const send = s.sender.send.bind(s.sender);
  s.sender.send = async (items) => { sendAt = Date.now(); return send(items); };
  const t0 = Date.now();
  const r = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 300, clock: () => SEND }, s.opts(SEND));
  assert.equal(r.sent, 1); assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN]);
  assert.ok(refundAt > 0 && sendAt - refundAt < 300, `반환 시작 → 발송 ${sendAt - refundAt}ms`);
  assert.ok(sendAt - t0 < 1000, `발송까지 ${sendAt - t0}ms`);
  assert.equal(refundDone, 0, '발송·단계는 2초 반환을 기다리지 않았다(반환 하나는 시간 상한 안에서만 기다림)');
  await ms(2100);
  assert.equal(s.store.live(badKey), false, '빠진 기기 자리는 늦게라도 돌려준다 → 다음 회차 재시도');
});
t('4 · 재확인 탈락 기기의 자리 반환이 2초 걸려도 다른 기기 발송은 기다리지 않는다', async () => {
  const s = setup([raw(), raw('C', 3, 4)], [[IOS_TOKEN, { watchlist: { t: ['JPM'] }, tz: 'Asia/Seoul' }], [IOS_TOKEN2, { watchlist: { t: ['C'] } }]]);
  s.recs.swap = { fromCall: 2, key: actualsKey('C', D), value: raw('C', 3, 4.5) };   // 재확인에서 C 만 탈락
  const cKey = `push:sig:result:${devKey(IOS_TOKEN2)}:C:${D}`;
  const del = s.store.delIfEq.bind(s.store);
  let delStart = 0;
  s.store.delIfEq = async (k, ex) => { if (k === cKey) { delStart = delStart || Date.now(); await ms(2000); } return del(k, ex); };
  let sendAt = 0;
  const send = s.sender.send.bind(s.sender);
  s.sender.send = async (items) => { sendAt = Date.now(); return send(items); };
  const r = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 300, clock: () => SEND }, s.opts(SEND));
  assert.equal(r.sent, 1); assert.deepEqual(s.sender.items.map((x) => x.token), [IOS_TOKEN]);
  assert.ok(delStart > 0 && sendAt - delStart < 100, `탈락 기기 반환 시작 → 다른 기기 발송 ${sendAt - delStart}ms`);
});
t('4 · 관문 11060111 재현 — 2/3 · 두 종목 · 첫 incr 시간 초과(서버엔 반영)·반환 2초 지연이어도 같은 기기 두 번째 종목은 보낸다 · 상한은 3 으로 끝난다', async () => {
  const s = setup([raw(), raw('C', 3, 4)], TWO_TICKERS);
  const cap = capOf(IOS_TOKEN);
  s.store.m.set(cap, 2);
  const incr = s.store.incr.bind(s.store), decr = s.store.decr.bind(s.store);
  let first = true;
  const order: string[] = [];
  s.store.incr = async (k, ex) => {
    if (k === cap) order.push('incr');
    const n = await incr(k, ex);                                                  // 서버엔 반영
    if (k === cap && first) { first = false; return new Promise<number>(() => {}); }   // 응답만 시간 초과
    return n;
  };
  s.store.decr = async (k) => { if (k === cap) { order.push('decr'); await ms(2000); } return decr(k); };
  const r = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 100, clock: () => SEND }, s.opts(SEND));
  assert.equal(r.sent, 1, JSON.stringify(r.skipped));
  assert.deepEqual(s.sender.items.map((x) => x.data.t), ['C'], '두 번째 종목은 보낸다(카운터 4 − 되돌릴 1 = 3 ≤ 3)');
  assert.deepEqual(order, ['incr', 'incr', 'decr'], '되돌리기는 그 기기의 선점이 끝난 뒤에만(루프 도중 decr 0)');
  assert.equal(Number(s.store.m.get(cap)), 4, '반환은 아직 도착 전(단계는 2초 반환을 기다리지 않았다)');
  await ms(2100);
  assert.equal(Number(s.store.m.get(cap)), 3, '늦은 반환이 들어오면 2 + 보낸 1 = 3');
  assert.equal((await s.run(SEND + 1_800_000)).sent, 0, '다음 회차 중복 0');
});
t('4 · 관문 11060355 재현 — 반환이 300ms 를 넘어 끝내 응답이 없어도 같은 기기 후속 종목은 빠지지 않는다', async () => {
  const s = setup([raw(), raw('C', 3, 4)], TWO_TICKERS);
  const cap = capOf(IOS_TOKEN);
  s.store.m.set(cap, 2);
  const incr = s.store.incr.bind(s.store);
  let first = true, decrCalls = 0;
  s.store.incr = async (k, ex) => {
    const n = await incr(k, ex);
    if (k === cap && first) { first = false; return new Promise<number>(() => {}); }
    return n;
  };
  s.store.decr = (k) => { if (k === cap) decrCalls++; return new Promise<number>(() => {}); };   // 반환 응답 없음
  const r = await runEarningsResultStep({ ...s.deps, storeTimeoutMs: 300, clock: () => SEND }, s.opts(SEND));
  assert.equal(r.sent, 1, JSON.stringify(r.skipped)); assert.deepEqual(s.sender.items.map((x) => x.data.t), ['C']);
  assert.equal(decrCalls, 1, '되돌리기는 1회(시간 초과된 첫 증가분)');
});
t('4 · 장부 보정은 상한을 넘기지 않는다 — 3/3 이면 두 종목 모두 건너뛰고 · 2/3 이면 하나만 보낸 뒤 상한은 3 으로 돌아온다', async () => {
  for (const [start, want] of [[3, []], [2, ['JPM']]] as const) {
    const s = setup([raw(), raw('C', 3, 4)], TWO_TICKERS);
    s.store.m.set(capOf(IOS_TOKEN), start);
    const r = await s.run(SEND);
    assert.deepEqual(s.sender.items.map((x) => x.data.t), want, `시작 ${start}/3`); assert.equal(r.sent, want.length);
    assert.equal(Number(s.store.m.get(capOf(IOS_TOKEN))), 3, `시작 ${start}/3 → 끝 3`);
    assert.equal(s.store.m.has(`push:sig:result:${devKey(IOS_TOKEN)}:C:${D}`), false, '거절한 자리는 돌려준다');
  }
});
t('4 · 굳힌 직후 마감이 지나면 발송하지 않고 장부를 되돌려 다음 회차에 보낸다(발송 직전 마감 재확인)', async () => {
  const s = setup();
  let now = SEND;
  const set = s.store.setIfEq.bind(s.store);
  s.store.setIfEq = async (k, expect, value, ttl) => {
    const ok = await set(k, expect, value, ttl);
    if (ok && value.startsWith('sent:')) now = SEND + 30_000;                   // 굳힘이 확인된 순간 마감이 지났다
    return ok;
  };
  const r = await runEarningsResultStep({ ...s.deps, clock: () => now }, s.opts(SEND));
  assert.equal(r.sent, 0); assert.equal(s.sender.calls, 0, '마감 뒤엔 발송 호출 0');
  assert.equal(s.store.live(slowKeyOf(IOS_TOKEN)), false, '굳힌 120일 장부는 되돌렸다');
  assert.equal(Number(s.store.m.get(capOf(IOS_TOKEN))), 0, '하루 상한도 되돌렸다');
  s.store.setIfEq = set;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 1, '다음 회차가 보낸다');
});
t('4 · 재확인 탈락 자리도 발송 전에 반환된다', async () => {
  const s = setup([raw(), raw('C', 3, 4)], [[IOS_TOKEN, { watchlist: { t: ['JPM', 'C'] }, tz: 'Asia/Seoul' }]]);
  s.recs.swap = { fromCall: 2, key: actualsKey('C', D), value: raw('C', 3, 4.5) };   // 재확인에서 C 만 값이 바뀐다
  const cKey = `push:sig:result:${devKey(IOS_TOKEN)}:C:${D}`;
  let cAtSend: boolean | null = null;
  const origSend = s.sender.send.bind(s.sender);
  s.sender.send = async (items: any) => { cAtSend = s.store.m.has(cKey); return origSend(items); };
  const r = await s.run(SEND);
  assert.equal(r.sent, 1); assert.deepEqual(s.sender.items.map((x) => x.data.t), ['JPM']);
  assert.equal(cAtSend, false, '탈락한 C 자리는 발송 호출 전에 이미 반환');
});

// ── 요구 5 — 이 알림 전용 스위치(EARNINGS_RESULT_ALERT_MODE · Redis push:sig:result:mode), 없으면 dry ──────────────────
t('5 · 전용 스위치가 없으면(dry 기본) 대상은 세지만 보내지 않는다 — 신호 스위치가 live 여도(병합 즉시 발송 없음)', async () => {
  const s = setup();
  s.store.m.delete(RESULT_KEYS.mode);
  s.store.m.set('push:sig:mode', 'live');                                // «내 종목 이상 신호»는 live
  for (const signalEnvMode of [null, 'live'] as const) {
    const r = await s.run(SEND, { envMode: null, signalEnvMode });
    assert.equal(r.status, 'observed'); assert.deepEqual(r.candidates, ['JPM|2026-10-13']);
    assert.equal(r.sent, 0);
  }
  assert.equal(s.sender.calls, 0); assert.equal(s.sender.items.length, 0);
  assert.equal(s.store.m.has(`push:sig:result:${devKey(IOS_TOKEN)}:JPM:${D}`), false, 'dry 는 기기 장부를 쓰지 않는다');
  assert.equal(s.store.m.has(`push:sig:cap:2026-10-14:${devKey(IOS_TOKEN)}`), false, 'dry 는 하루 상한을 쓰지 않는다');
});
t('5 · 전용 환경값·Redis 의 dry 는 무발송 · 전용 live 만 켠다 · 신호 스위치 off(비상 끄기)는 따른다', async () => {
  const s = setup();
  s.store.m.set(RESULT_KEYS.mode, 'dry');
  assert.equal((await s.run(SEND, { envMode: 'dry' })).sent, 0); assert.equal(s.sender.calls, 0);
  assert.equal((await s.run(SEND, { envMode: null })).sent, 0);
  s.store.m.set('push:sig:mode', 'off');
  assert.equal((await s.run(SEND, { envMode: 'live' })).status, 'off', '신호 Redis off');
  s.store.m.delete('push:sig:mode');
  assert.equal((await s.run(SEND, { envMode: 'live', signalEnvMode: 'off' })).status, 'off', '신호 환경 off');
  assert.equal((await s.run(SEND, { envMode: 'off' })).status, 'off');
  s.store.m.set(RESULT_KEYS.mode, 'off');
  assert.equal((await s.run(SEND, { envMode: 'live' })).status, 'off', '전용 Redis off 가 이긴다');
  s.store.m.delete(RESULT_KEYS.mode);
  assert.equal((await s.run(SEND + 60_000, { envMode: 'live' })).sent, 1, '전용 환경 live');
  const r = setup(); r.store.m.set(RESULT_KEYS.mode, 'live');
  assert.equal((await r.run(SEND, { envMode: null })).sent, 1, '전용 Redis live');
});
t('5 · resultEnvMode — EARNINGS_RESULT_ALERT_MODE 만 읽는다(WL_SIGNALS_MODE 무시)', () => {
  assert.equal(resultEnvMode({}), null);
  assert.equal(resultEnvMode({ WL_SIGNALS_MODE: 'live' }), null);
  assert.equal(resultEnvMode({ EARNINGS_RESULT_ALERT_MODE: ' LIVE ' }), 'live');
  assert.equal(resultEnvMode({ EARNINGS_RESULT_ALERT_MODE: 'dry' }), 'dry');
  assert.equal(resultEnvMode({ EARNINGS_RESULT_ALERT_MODE: 'yes' }), null);
});

// ── 요구 6 — 기기가 많을 때: 선점 병렬 · 기기마다 마감 검사(관문 11041435 #2) ────────────────────────────────
const manyDevices = (n: number): Array<[string, Record<string, unknown>]> =>
  Array.from({ length: n }, (_, i) => [i.toString(16).padStart(64, '0'), { watchlist: { t: ['JPM'] }, tz: 'Asia/Seoul' }]);
t('6 · 기기 사이 선점은 병렬 — 느린 저장소에서도 묶음 준비가 기기 수 × 왕복이 아니다', async () => {
  const s = setup([raw()], manyDevices(60));
  let inFlight = 0, peak = 0;
  const orig = s.store.setNx.bind(s.store);
  s.store.setNx = async (k: string, v: string, ex: number) => {
    if (!k.startsWith('push:sig:result:') || k.includes(':fp:') || k === RESULT_KEYS.lock) return orig(k, v, ex);
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((res) => setTimeout(res, 20));
    inFlight--; return orig(k, v, ex);
  };
  const t0 = Date.now();
  const r = await s.run(SEND);
  assert.equal(r.sent, 60);
  assert.ok(peak > 1 && peak <= 20, `동시 선점 ${peak}`);
  assert.ok(Date.now() - t0 < 60 * 20, `${Date.now() - t0}ms — 순차(≥1200ms)보다 짧다`);
});
t('6 · 선점 중 마감이 오면 더 잡지 않고, 잡은 자리·하루 상한을 모두 돌려주며 발송 0 · 다음 회차가 다시 본다', async () => {
  const s = setup([raw()], manyDevices(40));
  let t = SEND, claims = 0;
  const orig = s.store.setNx.bind(s.store);
  s.store.setNx = async (k: string, v: string, ex: number) => {
    if (k.startsWith('push:sig:result:') && v.startsWith('claim:') && ++claims === 5) t = SEND + 30_000;   // 다섯 번째 선점 순간 마감
    return orig(k, v, ex);
  };
  const r = await runEarningsResultStep({ ...s.deps, clock: () => t }, s.opts(SEND, { lockDeadline: SEND + 30_000 }));
  assert.equal(r.sent, 0); assert.equal(s.sender.calls, 0);
  assert.ok(r.skipped.some((x) => x.reason === 'lock_expiring'));
  assert.ok(claims < 40, `마감 뒤 더 잡지 않는다(${claims})`);
  assert.deepEqual(s.store.ledgerKeys().filter((k) => /^push:sig:result:[^:]+:JPM:/.test(k) && !k.includes(':fp:')), [], '선점 자리 0');
  assert.ok(s.store.ledgerKeys().filter((k) => k.startsWith('push:sig:cap:')).every((k) => Number(s.store.m.get(k)) === 0), '하루 상한 원상');
  s.store.setNx = orig;
  assert.equal((await s.run(SEND + 1_800_000)).sent, 40);
});

t('5 · 발송 금지 시간대(inPushBlackout)엔 live 여도 보내지 않는다 — 기존 규칙', async () => {
  const s = setup();
  const blackout = T('2026-10-14', 9, 31);                          // 정규장 개장 직후(기존 신호 규칙의 금지 창)
  const r = await s.run(blackout);
  assert.equal(r.status, 'observed'); assert.deepEqual(r.candidates, ['JPM|2026-10-13'], '대상이지만');
  assert.equal(s.sender.calls, 0);
});

t('6 · 선점 창이 닫혀도(마감 8초 전) 이미 잡은 기기는 재확인·발송한다 — 회차가 짧아도 매번 일부씩 나가 영구 누락이 없다(관문 11041441 #1)', async () => {
  const s = setup([raw()], manyDevices(40));
  let t = SEND, claims = 0;
  const orig = s.store.setNx.bind(s.store);
  s.store.setNx = async (k: string, v: string, ex: number) => {
    if (k.startsWith('push:sig:result:') && v.startsWith('claim:') && ++claims === 5) t = SEND + 30_000 - 5_000;   // 선점 창 닫힘 · 마감 전
    return orig(k, v, ex);
  };
  const r1 = await runEarningsResultStep({ ...s.deps, clock: () => t }, s.opts(SEND, { lockDeadline: SEND + 30_000 }));
  assert.ok(r1.sent >= 5 && r1.sent < 40, `부분 발송 ${r1.sent}`);
  assert.ok(r1.skipped.some((x) => x.reason === 'lock_expiring'));
  s.store.setNx = orig;
  const r2 = await s.run(SEND + 1_800_000);
  assert.equal(r1.sent + r2.sent, 40, '두 회차 합 = 전체 기기');
  assert.equal(new Set(s.sender.items.map((x) => x.token)).size, 40, '중복 없음'); assert.equal(s.sender.items.length, 40);
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
