/**
 * 내 종목 이상 신호 — 기기 읽기 · 선호(토글) · 등록 사본 · 조용한 시간 · 푸시 겹침 금지 · 기기별 선택(상한·재발송 금지) 시험 (2026-10-13)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/signals.plan.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mergeRegistration, mergePrefs, sanitizePrefs, wantsPush, DEFAULT_PREFS } from '../src/lib/push/prefs';
import { sanitizeTickers, sanitizeTz } from '../src/lib/signals/sanitize';
import {
  byPriority, candidatesFor, chooseForDevice, deviceFromRecord, devKey, inPushBlackout, inQuietHours, localMinutes, SIG_KEYS, SIG_KV, signalId,
} from '../src/lib/signals/plan';
import { needsSync, tickersFingerprint } from '../src/lib/app/signalSync';
import { ENABLED_EVENTS, EVENT_PRIORITY, SIG_CFG, type DetectedSignal, type SignalEvent } from '../src/lib/signals/types';
import { T } from './_signalsFixtures';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const NOW = '2026-10-13T00:00:00.000Z';
const ROOT = path.join(__dirname, '..');

console.log('━━━ 1. 입력 정리 ━━━');
t('종목 목록 — 대문자·모양 검사·중복 제거·상한 100 · 배열이 아니면 null(= 보내지 않았다)', () => {
  assert.deepEqual(sanitizeTickers(['nvda', ' AMD ', 'NVDA', 'BRK.B', 'BF-B', '1ABC', 'TOOLONGTICKER1', '', null, 5, 'A B']), ['NVDA', 'AMD', 'BRK.B', 'BF-B']);
  assert.equal(sanitizeTickers(undefined), null); assert.equal(sanitizeTickers('NVDA'), null); assert.deepEqual(sanitizeTickers([]), []);
  const many = Array.from({ length: 150 }, (_, i) => `T${i}`);
  assert.equal(sanitizeTickers(many)!.length, 100);
});
t('시간대 — IANA 이름만', () => {
  assert.equal(sanitizeTz('Asia/Seoul'), 'Asia/Seoul'); assert.equal(sanitizeTz('America/New_York'), 'America/New_York');
  assert.equal(sanitizeTz('Mars/Olympus'), null); assert.equal(sanitizeTz('<script>'), null); assert.equal(sanitizeTz(5), null); assert.equal(sanitizeTz('x'.repeat(100)), null);
});

console.log('━━━ 2. 등록 POST 병합 — 내 종목 사본 ━━━');
t('종목을 보내면 사본이 붙고, 보내지 않으면 기존 사본을 지킨다(옛 앱·언어 변경 재등록)', () => {
  const first = mergeRegistration(null, { token: 'tok', platform: 'ios', locale: 'ko', app: 'signum', tickers: ['nvda', 'AMD'], tz: 'Asia/Seoul', notifPerm: true }, NOW);
  assert.deepEqual(first.watchlist, { t: ['NVDA', 'AMD'], at: NOW }); assert.equal(first.tz, 'Asia/Seoul'); assert.equal(first.notifPerm, true);
  const lang = mergeRegistration(first, { token: 'tok', platform: 'ios', locale: 'ja', app: 'signum' }, '2026-10-13T01:00:00.000Z');
  assert.deepEqual(lang.watchlist, first.watchlist, '목록을 안 보냈으니 그대로'); assert.equal(lang.tz, 'Asia/Seoul'); assert.equal(lang.notifPerm, true); assert.equal(lang.locale, 'ja');
});
t('빈 목록 = 사본 삭제 · 새 목록은 통째로 바뀐다', () => {
  const a = mergeRegistration(null, { token: 'tok', app: 'signum', tickers: ['NVDA'] }, NOW);
  const b = mergeRegistration(a, { token: 'tok', app: 'signum', tickers: [] }, NOW);
  assert.equal('watchlist' in b, false);
  const c = mergeRegistration(a, { token: 'tok', app: 'signum', tickers: ['TSLA'] }, '2026-10-13T02:00:00.000Z');
  assert.deepEqual(c.watchlist, { t: ['TSLA'], at: '2026-10-13T02:00:00.000Z' });
});
t('알림 권한 꺼짐 보고(notifPerm:false) — 사본·선호·createdAt 은 그대로', () => {
  const a = mergeRegistration(null, { token: 'tok', platform: 'ios', locale: 'en', app: 'signum', tickers: ['NVDA'], notifPerm: true, preferences: { morning: false } }, NOW);
  const b = mergeRegistration(a, { token: 'tok', app: 'signum', notifPerm: false }, '2026-10-13T03:00:00.000Z');
  assert.equal(b.notifPerm, false); assert.deepEqual(b.watchlist, a.watchlist); assert.equal(b.preferences!.morning, false); assert.equal(b.createdAt, NOW);
});
t('기존 계약 불변 — 신호 칸이 없는 기본 선호는 예전 세 칸 그대로', () => {
  assert.deepEqual(mergePrefs(null, null), { enabled: true, morning: true, closing: true });
  assert.deepEqual(DEFAULT_PREFS, { enabled: true, morning: true, closing: true });
  const fresh = mergeRegistration(null, { token: 'tok', app: 'signum' }, NOW);
  assert.deepEqual(fresh.preferences, { enabled: true, morning: true, closing: true });
  assert.equal('watchlist' in fresh, false);
});

console.log('━━━ 3. 선호 — 설정의 «내 종목 이상 신호» 토글 ━━━');
t('signals 칸 — 한 번 값이 오가면 생기고, 없으면 켜짐', () => {
  assert.deepEqual(sanitizePrefs({ signals: false, extra: 1 }), { signals: false });
  assert.equal(wantsPush({ preferences: { enabled: true, morning: true, closing: true } }, 'signals'), true, '값이 없으면 켜짐');
  assert.equal(wantsPush({ preferences: { signals: false } }, 'signals'), false);
  assert.equal(wantsPush({ preferences: { enabled: false } }, 'signals'), false, '마스터 «알림»을 끄면 신호도 끈다');
  assert.equal(wantsPush({ preferences: { signals: false } }, 'morning'), true, '신호를 꺼도 모닝·마감은 그대로');
  assert.equal(wantsPush({ preferences: { morning: false } }, 'signals'), true, '모닝을 꺼도 신호는 그대로');
  const m = mergePrefs({ morning: false }, { signals: false });
  assert.deepEqual(m, { enabled: true, morning: false, closing: true, signals: false });
  assert.deepEqual(mergePrefs(m, { enabled: false }), { enabled: false, morning: false, closing: true, signals: false }, '다른 칸을 바꿔도 signals 는 유지');
});

console.log('━━━ 4. 신호를 받을 수 있는 기기 ━━━');
const IOS = 'a'.repeat(64), AND = 'dQw4w9WgXcQ:APA91bHexample';
const rec = (o: Record<string, unknown> = {}) => JSON.stringify({ token: 'x', platform: 'ios', locale: 'ko', app: 'signum', watchlist: { t: ['NVDA', 'AMD'], at: NOW }, tz: 'Asia/Seoul', preferences: { enabled: true, morning: true, closing: true }, ...o });
t('종목이 있고 설정·권한이 꺼지지 않았으면 기기가 된다(기본값 켜짐)', () => {
  const d = deviceFromRecord(IOS, rec())!;
  assert.deepEqual(d.tickers, ['NVDA', 'AMD']); assert.equal(d.platform, 'ios'); assert.equal(d.locale, 'ko'); assert.equal(d.tz, 'Asia/Seoul'); assert.equal(d.dev, devKey(IOS)); assert.equal(d.dev.length, 12);
  assert.equal(deviceFromRecord(AND, rec({ platform: 'android' }))!.platform, 'android');
  assert.equal(deviceFromRecord(IOS, rec({ locale: 'fr' }))!.locale, 'en', '모르는 언어는 영어');
});
t('빠지는 경우 — 종목 없음 · 신호 끔 · 마스터 끔 · 시스템 알림 권한 꺼짐 · WIM 앱 · 깨진 레코드', () => {
  assert.equal(deviceFromRecord(IOS, rec({ watchlist: undefined })), null);
  assert.equal(deviceFromRecord(IOS, rec({ watchlist: { t: [], at: NOW } })), null);
  assert.equal(deviceFromRecord(IOS, rec({ preferences: { signals: false } })), null);
  assert.equal(deviceFromRecord(IOS, rec({ preferences: { enabled: false } })), null);
  assert.equal(deviceFromRecord(IOS, rec({ notifPerm: false })), null, '시스템 알림 권한이 없으면 보내지 않는다');
  assert.equal(deviceFromRecord(IOS, rec({ notifPerm: true }))!.dev, devKey(IOS));
  assert.equal(deviceFromRecord(IOS, rec({ app: 'wim' })), null);
  assert.equal(deviceFromRecord(IOS, '{broken'), null); assert.equal(deviceFromRecord(IOS, null), null);
});
t('토큰 레코드가 객체(Upstash 자동 역직렬화)여도 문자열이어도 같다', () => {
  assert.ok(deviceFromRecord(IOS, JSON.parse(rec()))); assert.ok(deviceFromRecord(IOS, rec()));
});

console.log('━━━ 5. 조용한 시간 · 푸시 겹침 금지 ━━━');
t('기기 현지 23:00~07:00 은 조용히 — 자정 넘김 · 경계 · 시간대 모름은 조용히(안전)', () => {
  const kst = (h: number, m = 0) => Date.UTC(2026, 9, 13, h - 9, m);        // 서울 h:m
  assert.equal(localMinutes('Asia/Seoul', kst(23, 30)), 23 * 60 + 30);
  assert.equal(localMinutes('Asia/Seoul', Date.UTC(2026, 9, 13, 15, 0)), 0, '자정은 0 (Node 가 24 로 주는 것 접기)');
  assert.equal(inQuietHours('Asia/Seoul', kst(23, 0)), true); assert.equal(inQuietHours('Asia/Seoul', kst(2, 0)), true); assert.equal(inQuietHours('Asia/Seoul', kst(6, 59)), true);
  assert.equal(inQuietHours('Asia/Seoul', kst(7, 0)), false); assert.equal(inQuietHours('Asia/Seoul', kst(12, 0)), false); assert.equal(inQuietHours('Asia/Seoul', kst(22, 59)), false);
  assert.equal(inQuietHours(null, kst(12, 0)), true); assert.equal(inQuietHours('Not/AZone', kst(12, 0)), true);
  assert.equal(inQuietHours('America/New_York', Date.UTC(2026, 9, 13, 15, 5)), false, '뉴욕 11:05 는 조용한 시간이 아니다');
});
t('모닝(12:10·13:10Z)·마감(22:00·22:20·22:40Z) 푸시와 겹치지 않는다 — 우리 크론 시각은 전부 밖', () => {
  const u = (hh: number, mm: number) => Date.UTC(2026, 9, 13, hh, mm);
  for (const [h, m] of [[12, 10], [12, 30], [13, 10], [13, 30], [22, 0], [22, 20], [22, 40], [22, 54], [21, 55]]) assert.equal(inPushBlackout(u(h, m)), true, `${h}:${m}`);
  for (const [h, m] of [[12, 4], [12, 35], [13, 4], [13, 35], [21, 54], [22, 55], [15, 25], [17, 25], [19, 25], [23, 10], [0, 40]]) assert.equal(inPushBlackout(u(h, m)), false, `${h}:${m}`);
  // vercel.json 의 신호 크론 시각이 전부 겹침 금지 창 밖인지(시간 늘리다 겹치게 되는 것을 막는다)
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const sig = vj.crons.filter((c: any) => c.path === '/api/cron/signal-alerts');
  assert.equal(sig.length, 4);
  for (const c of sig) {
    const [min, hours] = c.schedule.split(' ');
    for (const h of hours.split(',')) assert.equal(inPushBlackout(u(Number(h), Number(min))), false, `${c.schedule}`);
  }
});

console.log('━━━ 6. 기기별 선택 — 켜진 종류 · 재발송 금지 · 하루 상한 ━━━');
const sig = (ticker: string, event: SignalEvent, key: string, score = 1): DetectedSignal => ({ ticker, event, key, facts: {} as any, asOfMs: 0, asOfDate: '2026-10-13', score });
t('후보 — 기기 종목에 있는 것만 · 켜진 종류만(풋플로어·감마플립은 탐지만) · 우선순위 순', () => {
  const all = [sig('NVDA', 'darkpool_spike', 'k'), sig('NVDA', 'earnings_d1', 'k'), sig('NVDA', 'put_floor_break', 'k'), sig('NVDA', 'call_wall_break', 'k'), sig('TSLA', 'call_wall_break', 'k'), sig('NVDA', 'oi_surge', 'k')];
  const c = candidatesFor({ tickers: ['NVDA'] }, all);
  assert.deepEqual(c.map((s) => s.event), ['earnings_d1', 'call_wall_break', 'oi_surge', 'darkpool_spike']);
  assert.ok(!ENABLED_EVENTS.includes('put_floor_break') && !ENABLED_EVENTS.includes('gamma_flip_cross'));
  assert.equal(EVENT_PRIORITY.length, 7);
  assert.equal(byPriority(sig('A', 'oi_surge', 'k', 5), sig('B', 'oi_surge', 'k', 9)) > 0, true, '같은 종류면 점수 큰 순');
});
t('이미 보낸 것 · 재발송 금지 창 안의 같은 종목·같은 신호는 건너뛴다', () => {
  const c = [sig('NVDA', 'call_wall_break', '2026-10-13:up'), sig('NVDA', 'darkpool_spike', '2026-10-12'), sig('AMD', 'oi_surge', '2026-10-09')];
  const r = chooseForDevice(c, { sent: new Set(['NVDA:call_wall_break:2026-10-13:up']), cooled: new Set(['NVDA:darkpool_spike']), used: 0 });
  assert.deepEqual(r.chosen.map(signalId), ['AMD:oi_surge:2026-10-09']);
  assert.deepEqual(r.skipped.map((s) => s.why), ['sent', 'cooldown']);
});
t('하루 3통 · 한 실행 2통 — 넘으면 상한', () => {
  const c = ['A', 'B', 'C', 'D'].map((x) => sig(x, 'oi_surge', 'k'));
  const r0 = chooseForDevice(c, { sent: new Set(), cooled: new Set(), used: 0 });
  assert.equal(r0.chosen.length, SIG_CFG.perRunPerDevice); assert.equal(r0.chosen.length, 2); assert.ok(r0.skipped.every((s) => s.why === 'run-limit'));
  const r1 = chooseForDevice(c, { sent: new Set(), cooled: new Set(), used: 2 });
  assert.equal(r1.chosen.length, 1, '오늘 이미 2통 → 1통만'); assert.equal(r1.skipped[0].why, 'cap');
  const r2 = chooseForDevice(c, { sent: new Set(), cooled: new Set(), used: 3 });
  assert.equal(r2.chosen.length, 0); assert.ok(r2.skipped.every((s) => s.why === 'cap'));
  assert.equal(SIG_CFG.deviceDailyCap, 3);
});
t('키 이름 — 토큰 자체는 키에 넣지 않는다 · EC2 키는 wlsig:/push:stats: 접두사', () => {
  const dev = devKey(IOS);
  for (const k of [SIG_KEYS.sent(dev, 'NVDA', 'oi_surge', '2026-10-09'), SIG_KEYS.cool(dev, 'NVDA', 'oi_surge'), SIG_KEYS.cap('2026-10-13', dev)]) { assert.ok(k.startsWith('push:sig:')); assert.ok(!k.includes(IOS)); }
  assert.equal(SIG_KEYS.mode, 'push:sig:mode');
  assert.ok(SIG_KV.arm('NVDA').startsWith('wlsig:') && SIG_KV.ai('oi_surge', 'NVDA', 'k').startsWith('wlsig:') && SIG_KV.mps('NVDA', '2026-10-13').startsWith('wlsig:'));
  assert.equal(SIG_KV.stats('2026-10-13'), 'push:stats:signal:2026-10-13');
  assert.notEqual(devKey(IOS), devKey('b'.repeat(64)));
});

console.log('━━━ 7. 클라이언트 동기화 판정 ━━━');
t('같은 내용·같은 토큰·같은 날이면 보내지 않는다 · 하나라도 달라지면 보낸다', () => {
  const h = tickersFingerprint(['NVDA', 'AMD']);
  assert.equal(needsSync({ h, d: '2026-10-13', tok: 'a' }, h, 'a', '2026-10-13'), false);
  assert.equal(needsSync({ h, d: '2026-10-13', tok: 'a' }, tickersFingerprint(['NVDA']), 'a', '2026-10-13'), true);
  assert.equal(needsSync({ h, d: '2026-10-13', tok: 'a' }, h, 'b', '2026-10-13'), true, '토큰이 바뀜');
  assert.equal(needsSync({ h, d: '2026-10-12', tok: 'a' }, h, 'a', '2026-10-13'), true, '하루 한 번은 다시');
  assert.equal(needsSync(null, h, 'a', '2026-10-13'), true);
  assert.notEqual(tickersFingerprint(['A', 'B']), tickersFingerprint(['B', 'A']));
});

console.log(`\n${n}개 통과`);
