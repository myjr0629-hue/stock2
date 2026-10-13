/**
 * 내 종목 이상 신호 — 실행기 전체 시험(가짜 저장소·읽기·발송) (2026-10-13)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/signals.run.test.ts
 *
 * 지키는 것
 *   · 안전: 끄는 스위치(off) 즉시 정지 · 기본 모드는 dry(보내지 않음) · 드라이런 API 는 아무것도 쓰지 않음 · 겹침 잠금 · 푸시 겹침 금지 창에서는 보내지 않음
 *   · 상한: 기기당 하루 3통 · 한 실행 2통 · 같은 (종목·신호·회차)는 다시 안 보냄 · 재발송 금지 창
 *   · 실패 복구: 발송 실패하면 장부(중복·상한)를 되돌려 다음 실행이 다시 보낸다 · 죽은 토큰 정리
 *   · 권한: 신호 토글 끔 · 마스터 끔 · 시스템 알림 권한 꺼짐 · 종목 없음 → 받지 않음
 *   · 공급사 호출 0: 소스에 벤더 클라이언트 import 없음
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runSignals, type AiLineResult, type SigAi } from '../src/lib/signals/run';
import { SIG_KEYS, SIG_KV, devKey } from '../src/lib/signals/plan';
import type { DetectedSignal } from '../src/lib/signals/types';
import { AND_TOKEN, FakeKv, FakeSender, FakeStore, IOS_TOKEN, IOS_TOKEN2, T, deps, fakeReaders, structDoc } from './_signalsFixtures';

let n = 0;
const t = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const DAY = '2026-10-13';
const ROOT = path.join(__dirname, '..');
const NOW = T(DAY, 11, 25);          // 화 11:25 ET (정규장) = 서울 00:25 (조용한 시간)
const mkStore = () => {
  const s = new FakeStore();
  s.addDevice(IOS_TOKEN, { locale: 'ko', tz: 'Asia/Seoul', watchlist: { t: ['NVDA', 'AMD', 'MU', 'NFLX'], at: 'x' }, preferences: { enabled: true, morning: true, closing: true } });
  s.addDevice(AND_TOKEN, { locale: 'en', tz: 'America/New_York', watchlist: { t: ['NVDA'], at: 'x' } });
  return s;
};
/** NVDA: 09:05 프리마켓에 Call Wall 250 아래(249)에서 무장 → 11:05 정규장 251.2 */
const crossFixtures = () => ({
  structure: { NVDA: structDoc({ at: T(DAY, 11, 5), session: 'REG', price: 251.2, cw: 260, pf: 230, mp: 240, expiry: '2026-10-16' }) },
});
const armedKv = () => {
  const kv = new FakeKv();
  kv.m.set(SIG_KV.arm('NVDA'), { asOfMs: T(DAY, 9, 5), day: DAY, spot: 249, arms: { callWall: { level: 250, side: 'below', asOfMs: T(DAY, 9, 5), day: DAY } } });
  return kv;
};
const run = (d: ReturnType<typeof deps>, o: Partial<Parameters<typeof runSignals>[1]> = {}) =>
  runSignals(d, { now: NOW, kind: 'cron', phase: 'auto', ...o } as Parameters<typeof runSignals>[1]);
const setMode = (s: FakeStore, m: string) => s.m.set(SIG_KEYS.mode, m);

(async () => {
  console.log('━━━ 1. 안전 — 끄는 스위치 · 드라이런 · 잠금 ━━━');
  await t('모드 off(레디스 한 키) → 아무것도 읽지도 쓰지도 보내지도 않는다', async () => {
    const s = mkStore(), kv = armedKv(), r = fakeReaders(crossFixtures()), snd = new FakeSender();
    setMode(s, 'off');
    const rep = await run(deps(s, kv, r, snd));
    assert.equal(rep.status, 'off'); assert.equal(rep.mode, 'off');
    assert.deepEqual(r.calls, {}); assert.equal(snd.calls, 0); assert.equal(s.writes.length, 0); assert.equal(kv.writes.length, 0);
  });
  await t('환경변수 off 가 레디스 live 보다 먼저', async () => {
    const s = mkStore(); setMode(s, 'live');
    const rep = await runSignals(deps(s, armedKv(), fakeReaders(crossFixtures()), new FakeSender()), { now: NOW, kind: 'cron', phase: 'auto', envMode: 'off' });
    assert.equal(rep.status, 'off');
  });
  await t('모드 키가 없으면 dry — 탐지·종목 상태 기록은 하되 보내지 않고 장부도 안 만든다', async () => {
    const s = mkStore(), kv = armedKv(), snd = new FakeSender();
    const rep = await run(deps(s, kv, fakeReaders(crossFixtures()), snd));
    assert.equal(rep.mode, 'dry'); assert.equal(snd.calls, 0); assert.equal(rep.sent, undefined);
    assert.equal(rep.signals.filter((x) => x.event === 'call_wall_break').length, 1, '탐지는 했다');
    assert.deepEqual(s.ledgerKeys(), [], '장부(중복·상한) 없음');
    assert.ok(kv.writes.includes(SIG_KV.arm('NVDA')), '종목 상태는 기록(go-live 때 이어지게)');
    assert.ok(kv.writes.includes(SIG_KV.last), '마지막 실행 요약');
    assert.equal(s.m.has(SIG_KEYS.lock), false, '잠금은 풀린다');
  });
  await t('드라이런 API(preview)는 아무것도 쓰지 않는다 — 저장소·EC2·AI·발송 모두 0 · 누가 무엇을 받을지만', async () => {
    const s = mkStore(), kv = armedKv(), snd = new FakeSender();
    setMode(s, 'live');                                                  // live 여도 preview 는 보내지 않는다
    const rep = await run(deps(s, kv, fakeReaders(crossFixtures()), snd), { kind: 'preview' });
    assert.equal(snd.calls, 0); assert.equal(s.writes.length, 0, s.writes.join(',')); assert.equal(kv.writes.length, 0);
    const p = rep.plan.find((x) => x.dev === devKey(IOS_TOKEN))!;
    assert.deepEqual(p.chosen, ['NVDA:call_wall_break:2026-10-13:up']);
    assert.equal(p.quiet, true, '서울 00:25 는 조용한 시간');
    assert.match(p.copy![0].title, /NVDA · Call Wall \$250 돌파/); assert.match(p.copy![0].body, /10\/13 11:05 ET 기준/);
    assert.equal(rep.samples.length, 1); assert.ok(rep.samples[0].en.body.includes('as of 10/13 11:05 ET'));
    for (const d of rep.plan) assert.ok(!JSON.stringify(d).includes(IOS_TOKEN), '토큰이 출력에 없다(짧은 해시만)');
  });
  await t('가짜 기기(sim)로 표본 — only 면 실제 기기는 보지 않는다', async () => {
    const s = mkStore(), rep = await run(deps(s, armedKv(), fakeReaders(crossFixtures()), null), { kind: 'preview', sim: { tickers: ['NVDA'], locale: 'ja', only: true } });
    assert.equal(rep.devices.eligible, 1); assert.equal(rep.plan[0].dev, 'sim000000000'); assert.match(rep.plan[0].copy![0].title, /Call Wall \$250 上抜け/);
  });
  await t('겹침 잠금 — 이미 도는 실행이 있으면 locked', async () => {
    const s = mkStore(); setMode(s, 'live'); s.m.set(SIG_KEYS.lock, '1');
    const rep = await run(deps(s, armedKv(), fakeReaders(crossFixtures()), new FakeSender()));
    assert.equal(rep.status, 'locked');
  });
  await t('푸시 겹침 금지 창(마감 푸시 22:00~22:40Z)에서는 live 여도 보내지 않는다', async () => {
    const s = mkStore(); setMode(s, 'live'); const snd = new FakeSender();
    const now = T(DAY, 18, 10);                                          // 22:10Z
    const rep = await run(deps(s, new FakeKv(), fakeReaders({ earnings: [{ ticker: 'NFLX', date: '2026-10-14', hour: 'amc' }] }), snd), { now });
    assert.equal(rep.status, 'blackout'); assert.equal(snd.calls, 0); assert.deepEqual(s.ledgerKeys(), []);
  });

  console.log('━━━ 2. 보내기 — 문구 · 데이터 · 장부 ━━━');
  await t('live: 콜월 돌파 → 그 종목을 가진 두 기기에 각자 언어로 · 조용한 시간 표식 · 탭 데이터', async () => {
    const s = mkStore(), kv = armedKv(), snd = new FakeSender(); setMode(s, 'live');
    const rep = await run(deps(s, kv, fakeReaders(crossFixtures()), snd));
    assert.equal(rep.status, 'ok'); assert.deepEqual(rep.sent, { items: 2, ok: 2, fail: 0, dead: 0, claimLost: 0 });
    const ko = snd.items.find((i) => i.token === IOS_TOKEN)!, en = snd.items.find((i) => i.token === AND_TOKEN)!;
    assert.equal(ko.title, '⚡ NVDA · Call Wall $250 돌파'); assert.equal(ko.body, '가격 $251.2, Call Wall 위 0.48% · 10/16 만기 · 10/13 11:05 ET 기준');
    assert.equal(en.title, '⚡ NVDA · above Call Wall $250'); assert.equal(en.body, 'Price $251.2, 0.48% above Call Wall · 10/16 expiry · as of 10/13 11:05 ET');
    assert.equal(ko.quiet, true); assert.equal(en.quiet, false);
    assert.deepEqual(ko.data, { type: 'wl_signal', path: '/app-view/flow?t=NVDA&from=sig', ev: 'call_wall_break', t: 'NVDA', src: 'push_sig_wall', locale: 'ko' });
    assert.equal(ko.thread, 'sig-NVDA'); assert.equal(ko.platform, 'ios'); assert.equal(en.platform, 'android');
    // 장부: 보낸 (기기·종목·신호·회차) · 재발송 금지 창 · 하루 상한 카운터
    const dev = devKey(IOS_TOKEN);
    assert.ok(s.m.has(SIG_KEYS.sent(dev, 'NVDA', 'call_wall_break', '2026-10-13:up'))); assert.ok(s.m.has(SIG_KEYS.cool(dev, 'NVDA', 'call_wall_break')));
    assert.equal(s.m.get(SIG_KEYS.cap(DAY, dev)), 1);
    assert.equal(s.ttl.get(SIG_KEYS.sent(dev, 'NVDA', 'call_wall_break', '2026-10-13:up')), 8 * 86400);
    assert.equal(s.ttl.get(SIG_KEYS.cool(dev, 'NVDA', 'call_wall_break')), 86400);
    // 통계(EC2): 종류별·플랫폼별 · 마지막 실행 요약
    const st = kv.m.get(SIG_KV.stats(DAY)) as any;
    assert.equal(st.runs, 1); assert.equal(st.sent, 2); assert.equal(st.byEvent.call_wall_break.sent, 2); assert.equal(st.byPlatform.ios.sent, 1); assert.equal(st.byPlatform.android.sent, 1); assert.equal(st.byLocale.ko.sent, 1);
    assert.equal(st.log[0].ticker, 'NVDA');
    assert.equal(s.m.has(SIG_KEYS.lock), false);
  });
  await t('같은 관측을 다시 돌려도 두 번 보내지 않는다(종목 상태가 «본 관측»을 기억) · 상태를 지워도 장부가 막는다', async () => {
    const s = mkStore(), kv = armedKv(), snd = new FakeSender(); setMode(s, 'live');
    const fx = crossFixtures();
    await run(deps(s, kv, fakeReaders(fx), snd));
    const again = await run(deps(s, kv, fakeReaders(fx), snd), { now: NOW + 5 * 60_000 });
    assert.equal(again.sent, undefined, '새 관측이 없으니 신호도 없다'); assert.equal(snd.items.length, 2);
    // 상태를 되돌려(재시도·중복 크론 상황) 같은 신호가 다시 잡혀도 장부가 막는다
    kv.m.set(SIG_KV.arm('NVDA'), { asOfMs: T(DAY, 9, 5), day: DAY, spot: 249, arms: { callWall: { level: 250, side: 'below', asOfMs: T(DAY, 9, 5), day: DAY } } });
    const dup = await run(deps(s, kv, fakeReaders(fx), snd), { now: NOW + 10 * 60_000 });
    assert.equal(snd.items.length, 2, '재발송 없음'); assert.ok(dup.plan.every((p) => p.chosen.length === 0));
    assert.ok(dup.plan.some((p) => p.skipped.some((x) => x.why === 'sent')));
  });
  await t('발송이 실패하면 장부와 상한을 되돌린다 → 다음 실행이 다시 보낸다', async () => {
    const s = mkStore(), kv = armedKv(), snd = new FakeSender(); setMode(s, 'live');
    snd.failIds = (it) => (it.token === IOS_TOKEN ? 'fail' : null);
    const fx = crossFixtures();
    const rep = await run(deps(s, kv, fakeReaders(fx), snd));
    assert.deepEqual(rep.sent, { items: 2, ok: 1, fail: 1, dead: 0, claimLost: 0 });
    const dev = devKey(IOS_TOKEN);
    assert.equal(s.m.has(SIG_KEYS.sent(dev, 'NVDA', 'call_wall_break', '2026-10-13:up')), false, '실패한 기기의 장부는 지워졌다');
    assert.equal(s.m.has(SIG_KEYS.cool(dev, 'NVDA', 'call_wall_break')), false);
    assert.equal(Number(s.m.get(SIG_KEYS.cap(DAY, dev))), 0, '상한도 되돌렸다');
    assert.ok(s.m.has(SIG_KEYS.sent(devKey(AND_TOKEN), 'NVDA', 'call_wall_break', '2026-10-13:up')), '성공한 기기는 그대로');
    // 다음 실행(같은 신호가 다시 잡히는 상황)이 실패한 기기에만 다시 보낸다
    kv.m.set(SIG_KV.arm('NVDA'), { asOfMs: T(DAY, 9, 5), day: DAY, spot: 249, arms: { callWall: { level: 250, side: 'below', asOfMs: T(DAY, 9, 5), day: DAY } } });
    snd.failIds = null;
    const retry = await run(deps(s, kv, fakeReaders(fx), snd), { now: NOW + 5 * 60_000 });
    assert.deepEqual(retry.sent, { items: 1, ok: 1, fail: 0, dead: 0, claimLost: 0 });
    assert.equal(snd.items[snd.items.length - 1].token, IOS_TOKEN);
  });
  await t('죽은 토큰(영구 소멸)은 기기 목록과 레코드에서 지운다', async () => {
    const s = mkStore(), snd = new FakeSender(); setMode(s, 'live');
    snd.failIds = (it) => (it.token === AND_TOKEN ? 'dead' : null);
    const rep = await run(deps(s, armedKv(), fakeReaders(crossFixtures()), snd));
    assert.equal(rep.sent!.dead, 1);
    assert.equal(s.sets.get('push:token_list')!.has(AND_TOKEN), false); assert.equal(s.m.has(`push:tokens:${AND_TOKEN}`), false);
    assert.equal(s.sets.get('push:token_list')!.has(IOS_TOKEN), true);
  });

  console.log('━━━ 3. 상한 — 하루 3통 · 한 실행 2통 · 재발송 금지 ━━━');
  const MORN = T(DAY, 9, 40);          // 아침 창(전 세션 자료 도착 뒤) 09:40 ET = 13:40Z (모닝 푸시 창 밖)
  const EVEN = T(DAY, 19, 10);         // 마감 뒤 19:10 ET = 23:10Z (마감 푸시 창 밖)
  const dailyFixtures = () => ({
    bundle: { date: '2026-10-12', prevDate: '2026-10-09', tickers: { MU: { callOI: 1e6, putOI: 9e5, top: [{ k: 230, e: '2026-10-16', t: 'C', oi: 18_000, d: 12_500 }] } } },
    dark: { AMD: { ticker: 'AMD', pct: 52.1, volume: 8_400_000, volRatio: 2.44, volP: 96, date: '2026-10-12', marketAvg: 46.2 } },
    earnings: [{ ticker: 'NFLX', date: '2026-10-14', hour: 'amc' as const, etTime: '16:00' }],
    implied: { NFLX: { pct: 6.14, expiry: '2026-10-16' } },
  });
  await t('국면 자동 판정 — 아침(08:30~12:00 ET)은 다크풀·OI · 마감 뒤(16:30~)는 실적 D-1 · 장중은 레벨 교차', async () => {
    const mk = () => { const s = mkStore(); return deps(s, new FakeKv(), fakeReaders(dailyFixtures()), null); };
    assert.deepEqual((await run(mk(), { kind: 'preview', now: MORN })).phases, { structure: true, data: true, earn: false });
    assert.deepEqual((await run(mk(), { kind: 'preview', now: T(DAY, 8, 40) })).phases, { structure: false, data: true, earn: false }, '서머타임 끝난 뒤 13:40Z = 08:40 ET');
    assert.deepEqual((await run(mk(), { kind: 'preview', now: T(DAY, 13, 25) })).phases, { structure: true, data: false, earn: false });
    assert.deepEqual((await run(mk(), { kind: 'preview', now: EVEN })).phases, { structure: false, data: false, earn: true });
    assert.deepEqual((await run(mk(), { kind: 'preview', now: T('2026-10-10', 9, 40) })).phases, { structure: false, data: false, earn: false }, '토요일은 아무것도 안 한다');
  });
  await t('아침 실행 — OI · 다크풀 · 실적 D-1 이 한 기기에 몰리면 한 실행 2통(우선순위: 실적 > OI > 다크풀) · 나머지는 다음 실행', async () => {
    const s = mkStore(), kv = new FakeKv(), snd = new FakeSender(); setMode(s, 'live');
    const fx = dailyFixtures();
    const r1 = await run(deps(s, kv, fakeReaders(fx), snd), { now: MORN, phase: 'daily' });
    assert.deepEqual(r1.phases, { structure: false, data: true, earn: true });
    const mine1 = snd.items.filter((i) => i.token === IOS_TOKEN);
    assert.deepEqual(mine1.map((i) => i.data.ev), ['earnings_d1', 'oi_surge'], '실적 D-1 이 맨 앞');
    assert.match(mine1[0].title, /NFLX · 내일 실적 발표/); assert.match(mine1[0].body, /10\/14\(수\) 장 마감 후 16:00 ET · 옵션 예상 변동 ±6\.1%\(10\/16 만기\)/);
    assert.match(mine1[1].title, /MU · 미결제약정 급증/); assert.equal(mine1[1].data.src, 'push_sig_oi'); assert.match(mine1[1].body, /10\/9 세션/);
    assert.ok(r1.plan.find((p) => p.dev === devKey(IOS_TOKEN))!.skipped.some((x) => x.id.startsWith('AMD:darkpool_spike') && x.why === 'run-limit'));
    // 다음 실행(11:25 ET) — 다크풀이 남은 1통(하루 3통 중)으로 나간다. 이미 보낸 둘은 다시 안 나간다
    await run(deps(s, kv, fakeReaders(fx), snd), { now: T(DAY, 11, 25) });
    const mine2 = snd.items.filter((i) => i.token === IOS_TOKEN);
    assert.deepEqual(mine2.map((i) => i.data.ev), ['earnings_d1', 'oi_surge', 'darkpool_spike']);
    assert.match(mine2[2].body, /FINRA 10\/12/);
    assert.equal(Number(s.m.get(SIG_KEYS.cap(DAY, devKey(IOS_TOKEN)))), 3);
    // 세 번째 — 더 보낼 것이 없다(상한 3통)
    const r3 = await run(deps(s, kv, fakeReaders(fx), snd), { now: T(DAY, 11, 55) });
    assert.equal(snd.items.filter((i) => i.token === IOS_TOKEN).length, 3); assert.equal(r3.sent, undefined);
  });
  await t('저녁 실행(마감 뒤) — 전 세션 자료는 «마지막 마감 세션» 것이 아니라서 다시 보지 않는다(낡은 자료를 새 소식처럼 보내지 않는다)', async () => {
    const s = mkStore(), snd = new FakeSender(); setMode(s, 'live');
    const rep = await run(deps(s, new FakeKv(), fakeReaders(dailyFixtures()), snd), { now: EVEN });      // lastClosed = 10/13, 묶음·FINRA 는 10/12
    assert.deepEqual(rep.phases, { structure: false, data: false, earn: true });
    assert.deepEqual(snd.items.map((i) => i.data.ev), ['earnings_d1']);
    const forced = await run(deps(mkStore(), new FakeKv(), fakeReaders(dailyFixtures()), null), { now: EVEN, kind: 'preview', phase: 'data' });
    assert.equal(forced.signals.length, 0, '강제로 data 국면을 돌려도 날짜가 달라 신호 없음'); assert.ok(forced.notes.some((x) => /bundle 2026-10-12 is not the last closed session 2026-10-13/.test(x)));
  });
  await t('하루 상한(3통)은 날짜가 바뀌면 새로 센다 — 같은 종목·같은 신호는 재발송 금지 창(3일) 안이면 새 회차여도 보내지 않는다', async () => {
    const s = mkStore(), kv = new FakeKv(), snd = new FakeSender(); setMode(s, 'live');
    s.addDevice(IOS_TOKEN2, { locale: 'ja', tz: 'Asia/Tokyo', watchlist: { t: ['A1', 'A2', 'A3', 'A4', 'A5'], at: 'x' } });
    const mkBundle = (date: string, prevDate: string) => ({ date, prevDate, tickers: Object.fromEntries(['A1', 'A2', 'A3', 'A4', 'A5'].map((x, i) => [x, { callOI: 1e6, putOI: 9e5, top: [{ k: 300, e: '2026-10-23', t: 'C', oi: Math.round((30_000 - i * 1000) * 1.2), d: 30_000 - i * 1000 }] }])) });
    const fx1 = { bundle: mkBundle('2026-10-12', '2026-10-09') };
    await run(deps(s, kv, fakeReaders(fx1), snd), { now: MORN });                // 2통
    await run(deps(s, kv, fakeReaders(fx1), snd), { now: T(DAY, 11, 25) });      // 1통(상한 3)
    await run(deps(s, kv, fakeReaders(fx1), snd), { now: T(DAY, 11, 55) });      // 0통
    const tokyo = snd.items.filter((i) => i.token === IOS_TOKEN2);
    assert.equal(tokyo.length, 3, '하루 3통'); assert.deepEqual(tokyo.map((i) => i.data.t), ['A1', 'A2', 'A3'], '점수 큰 순');
    // 다음 날 새 묶음(회차 키가 다름) — 이미 보낸 A1~A3 는 재발송 금지 창 안이라 건너뛰고, 못 받은 A4·A5 가 나간다
    const fx2 = { bundle: mkBundle('2026-10-13', '2026-10-12') };
    const next = await run(deps(s, kv, fakeReaders(fx2), snd), { now: T('2026-10-14', 9, 40) });
    assert.deepEqual(snd.items.filter((i) => i.token === IOS_TOKEN2).map((i) => i.data.t), ['A1', 'A2', 'A3', 'A4', 'A5']);
    const p = next.plan.find((x) => x.dev === devKey(IOS_TOKEN2))!;
    assert.deepEqual(p.skipped.filter((x) => x.why === 'cooldown').map((x) => x.id.split(':')[0]).sort(), ['A1', 'A2', 'A3']);
  });

  console.log('━━━ 4. 받는 기기 — 권한·설정 ━━━');
  await t('신호 끔 · 마스터 끔 · 시스템 알림 권한 꺼짐 · 종목 없음 → 아무것도 받지 않는다', async () => {
    const s = new FakeStore(), snd = new FakeSender(); setMode(s, 'live');
    const wl = { t: ['NVDA'], at: 'x' };
    s.addDevice('1'.repeat(64), { watchlist: wl, preferences: { signals: false } });
    s.addDevice('2'.repeat(64), { watchlist: wl, preferences: { enabled: false } });
    s.addDevice('3'.repeat(64), { watchlist: wl, notifPerm: false });
    s.addDevice('4'.repeat(64), {});
    s.addDevice('5'.repeat(64), { watchlist: wl, app: 'wim' });
    const rep = await run(deps(s, armedKv(), fakeReaders(crossFixtures()), snd));
    assert.equal(rep.status, 'no-devices'); assert.equal(snd.calls, 0); assert.deepEqual(s.ledgerKeys(), []);
  });
  await t('기본값 — 설정을 한 번도 안 만진 기기(선호 객체 없음)도 받는다', async () => {
    const s = new FakeStore(), snd = new FakeSender(); setMode(s, 'live');
    s.sets.set('push:token_list', new Set([IOS_TOKEN]));
    s.m.set(`push:tokens:${IOS_TOKEN}`, JSON.stringify({ token: IOS_TOKEN, platform: 'ios', locale: 'en', watchlist: { t: ['NVDA'], at: 'x' } }));
    const rep = await run(deps(s, armedKv(), fakeReaders(crossFixtures()), snd));
    assert.equal(rep.sent!.ok, 1);
  });

  console.log('━━━ 5. AI 한 줄 ━━━');
  const mkAi = (calls: DetectedSignal[], pick: (s: DetectedSignal) => AiLineResult): SigAi => ({ line: async (s) => { calls.push(s); return pick(s); } });
  const GOOD = { ko: '콜 미결제약정이 가장 몰린 행사가를 가격이 막 넘어선 시점입니다', en: 'The price had just cleared the strike with the most call open interest', ja: 'コール建玉が最も集中する行使価格を、価格が上回った時点です' };
  await t('신호당 한 번만 부르고(두 기기가 같은 신호) 기기 언어로 «✦ 줄» 을 붙인다 · 못 만든 신호는 줄 없이 나간다', async () => {
    const s = mkStore(), snd = new FakeSender(); setMode(s, 'live'); const calls: DetectedSignal[] = [];
    const rep = await run(deps(s, armedKv(), fakeReaders(crossFixtures()), snd, mkAi(calls, () => ({ text: GOOD, reason: 'ai', cached: false, ms: 5 }))));
    assert.equal(calls.length, 1, '두 기기 → AI 한 번');
    const ko = snd.items.find((i) => i.token === IOS_TOKEN)!, en = snd.items.find((i) => i.token === AND_TOKEN)!;
    assert.ok(ko.body.endsWith(`\n✦ ${GOOD.ko}`)); assert.ok(en.body.endsWith(`\n✦ ${GOOD.en}`));
    assert.equal(rep.signals[0].ai!.ok, true);
    const s2 = mkStore(), snd2 = new FakeSender(); setMode(s2, 'live');
    await run(deps(s2, armedKv(), fakeReaders(crossFixtures()), snd2, mkAi([], () => ({ text: null, reason: 'guard:ko:hedge', cached: false, ms: 5 }))));
    assert.ok(snd2.items.length === 2 && snd2.items.every((i) => !i.body.includes('✦')), '가드에 걸리면 줄 없이 규칙 줄만 나간다');
    const st = (await (async () => { const kv = armedKv(); const s3 = mkStore(); setMode(s3, 'live'); await run(deps(s3, kv, fakeReaders(crossFixtures()), new FakeSender(), mkAi([], () => ({ text: GOOD, reason: 'ai', cached: false, ms: 1 })))); return kv.m.get(SIG_KV.stats(DAY)) as any; })());
    assert.deepEqual(st.ai, { lines: 1, withAi: 1 });
  });
  await t('AI 가 예외·시간 초과여도 발송은 막히지 않는다', async () => {
    const s = mkStore(), snd = new FakeSender(); setMode(s, 'live');
    const rep = await run(deps(s, armedKv(), fakeReaders(crossFixtures()), snd, { line: async () => { throw new Error('boom'); } }));
    assert.equal(rep.sent!.ok, 2); assert.ok(snd.items.every((i) => !i.body.includes('✦')));
  });
  await t('드라이런은 ai=1 일 때만 AI 를 부르고, 보낼 후보가 없으면 부르지 않는다', async () => {
    const calls: DetectedSignal[] = [];
    const ai = mkAi(calls, () => ({ text: GOOD, reason: 'ai', cached: false, ms: 1 }));
    await run(deps(mkStore(), armedKv(), fakeReaders(crossFixtures()), null, ai), { kind: 'preview' });
    assert.equal(calls.length, 0);
    const rep = await run(deps(mkStore(), armedKv(), fakeReaders(crossFixtures()), null, ai), { kind: 'preview', ai: true });
    assert.equal(calls.length, 1); assert.ok(rep.plan.find((p) => p.dev === devKey(IOS_TOKEN))!.copy![0].body.includes('✦ 콜'));
    calls.length = 0;
    await run(deps(mkStore(), new FakeKv(), fakeReaders({}), new FakeSender(), ai), { kind: 'cron' });
    assert.equal(calls.length, 0, '신호가 없으면 AI 도 없다');
  });

  console.log('━━━ 6. 구조 — 공급사 호출 0 · 크론 등록 · 인증 ━━━');
  await t('소스에 벤더 클라이언트(Intrinio·Massive·FMP·Polygon)를 부르는 코드가 없다', async () => {
    const files = ['src/services/signalAlertsService.ts', 'src/lib/signals/run.ts', 'src/lib/signals/detect.ts', 'src/lib/signals/plan.ts', 'src/lib/signals/copy.ts', 'src/lib/ai/signalLine.ts', 'src/app/api/cron/signal-alerts/route.ts'];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/from ['"]@\/services\/(intrinio|massive|polygon|fmp|finnhub|alphaEngine|centralDataHub)[A-Za-z]*['"]/i.test(src), `${f}: 벤더 서비스 import`);
      assert.ok(!/fetchMassive|getIntradayAggregates|getOptionChainSnapshot|getStructureData|financialmodelingprep|api\.polygon|api-v2\.intrinio/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), `${f}: 벤더 호출`);
    }
  });
  await t('크론 4개 등록(아침 자료 도착 뒤 · 장중 구조 굽기 직후 · 마감 뒤 · 재시도) · 인증은 CRON_SECRET · 기본 dry', async () => {
    const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const sig = vj.crons.filter((c: any) => c.path === '/api/cron/signal-alerts').map((c: any) => c.schedule);
    assert.deepEqual(sig, ['40 13 * * 1-5', '25 15,17,19 * * 1-5', '10 23 * * 1-5', '40 0 * * 2-6']);
    const route = fs.readFileSync(path.join(ROOT, 'src/app/api/cron/signal-alerts/route.ts'), 'utf8');
    assert.match(route, /CRON_SECRET/); assert.match(route, /if \(!cronSecret\) return false/, '운영에서 비밀값이 없으면 닫는다');
    assert.ok(route.indexOf("searchParams.get('dry') === '1'") < route.indexOf("kind: 'cron'"), '드라이런 분기가 예약 실행보다 먼저');
    assert.match(route, /kind: 'preview'/);
  });
  await t('끄는 법·상태·드라이런 API 가 같은 라우트에 있다(재배포 없이)', async () => {
    const route = fs.readFileSync(path.join(ROOT, 'src/app/api/cron/signal-alerts/route.ts'), 'utf8');
    for (const k of ["searchParams.get('mode')", "searchParams.get('status') === '1'", "searchParams.get('dry') === '1'"]) assert.ok(route.includes(k), k);
    const svc = fs.readFileSync(path.join(ROOT, 'src/services/signalAlertsService.ts'), 'utf8');
    assert.match(svc, /WL_SIGNALS_MODE/); assert.match(svc, /push:sig:mode|SIG_KEYS\.mode/);
  });

  console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
