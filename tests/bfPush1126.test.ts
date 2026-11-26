/** Offline: node -r ./scripts/offline-test-typescript.cjs --test tests/bfPush1126.test.ts — 블프 «앱 밖» 안내 푸시(lib/push/bfPush · promoConsent · 탭 · 설정) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BF_KEYS, BF_PUSH_END, BF_PUSH_TYPE, bfDevKey, bfEndLabel, bfPushContent, bfPushDecision, bfPushEnvOff, bfWaveNow, runBfPush,
  type BfStore, type BfTokenRec,
} from '../src/lib/push/bfPush';
import { promoAllowed, promoDefaultOn, promoShown, promoToast } from '../src/lib/push/promoConsent';
import { mergePrefs, mergeRegistration, sanitizePrefs } from '../src/lib/push/prefs';
import { bfPushEventFor, onDash, BF_PUSH_OPEN_EVENT } from '../src/lib/app/bfPushTap';
import { BF_OPEN_EVENT, BF_VALID_UNTIL } from '../src/lib/app/blackFriday';
import { FUNNEL_SRCS } from '../src/lib/app/funnelSchema';

const H = 3600_000;
const T = (iso: string) => Date.parse(iso);
const rec = (o: Partial<BfTokenRec> = {}): BfTokenRec => ({
  token: 'x'.repeat(64), app: 'signum', platform: 'android', locale: 'en', tz: 'America/New_York',
  preferences: { enabled: true, morning: true, closing: true }, notifPerm: true, lastSeenAt: '2026-11-20T00:00:00Z', ...o,
});
// 11/27 19:37 ET = 11/28 00:37 UTC
const NY_FRI_EVE = T('2026-11-28T00:37:00Z');

test('끝 시각은 앱 블프 판정과 같다', () => {
  assert.equal(BF_PUSH_END, BF_VALID_UNTIL);
});

test('동의 규칙 — iOS·한국은 명시 동의만, 그 밖 안드는 끄지 않았으면', () => {
  assert.equal(promoDefaultOn('ios', 'en', 'America/New_York'), false);
  assert.equal(promoDefaultOn('android', 'en', 'America/New_York'), true);
  assert.equal(promoDefaultOn('android', 'ko', 'America/New_York'), false);
  assert.equal(promoDefaultOn('android', 'en', 'Asia/Seoul'), false);
  assert.equal(promoDefaultOn('android', 'ja', 'Asia/Tokyo'), true);
  assert.equal(promoAllowed({ platform: 'ios', locale: 'ko', preferences: { promo: true } }), true);
  assert.equal(promoAllowed({ platform: 'android', locale: 'en', preferences: { promo: false } }), false);
  assert.equal(promoAllowed(null), false);
  assert.equal(promoShown(undefined, 'ios', 'en', null), false);
  assert.equal(promoShown(true, 'ios', 'en', null), true);
  assert.match(promoToast('ko', true, new Date(2026, 10, 27)), /^2026\.11\.27 혜택·할인 알림 수신에 동의했어요$/);
  assert.match(promoToast('ko', false, new Date(2026, 10, 27)), /동의를 철회/);
});

test('대상 판정', () => {
  assert.deepEqual(bfPushDecision(rec(), NY_FRI_EVE), { send: true, wave: 'a', loc: 'en', tz: 'America/New_York', korea: false, platform: 'android' });
  assert.deepEqual(bfPushDecision(rec({ platform: 'ios' }), NY_FRI_EVE), { send: false, skip: 'no_consent' });
  assert.equal(bfPushDecision(rec({ platform: 'ios', preferences: { promo: true } }), NY_FRI_EVE).send, true);
  assert.deepEqual(bfPushDecision(rec({ locale: 'ko', tz: 'Asia/Seoul' }), T('2026-11-27T10:37:00Z')), { send: false, skip: 'no_consent' });
  const kr = bfPushDecision(rec({ locale: 'ko', tz: 'Asia/Seoul', preferences: { promo: true } }), T('2026-11-27T10:37:00Z'));
  assert.equal(kr.send && kr.korea, true);
  assert.deepEqual(bfPushDecision(rec({ preferences: { enabled: false } }), NY_FRI_EVE), { send: false, skip: 'muted' });
  assert.deepEqual(bfPushDecision(rec({ notifPerm: false }), NY_FRI_EVE), { send: false, skip: 'no_permission' });
  assert.deepEqual(bfPushDecision(rec({ app: 'wim' }), NY_FRI_EVE), { send: false, skip: 'not_signum' });
  assert.deepEqual(bfPushDecision(rec({ platform: 'web' }), NY_FRI_EVE), { send: false, skip: 'platform' });
  assert.deepEqual(bfPushDecision(rec({ lastSeenAt: '2026-04-01T00:00:00Z' }), NY_FRI_EVE), { send: false, skip: 'stale' });
  assert.deepEqual(bfPushDecision(rec({ lastSeenAt: new Date(NY_FRI_EVE - H).toISOString() }), NY_FRI_EVE), { send: false, skip: 'recent_open' });
  assert.deepEqual(bfPushDecision(null, NY_FRI_EVE), { send: false, skip: 'no_record' });
  // 시간대 없음 → 언어로 짐작(en = 뉴욕)
  assert.equal(bfPushDecision(rec({ tz: undefined }), NY_FRI_EVE).send, true);
});

test('회차 창 — 현지 19~20시 · A 11/27~29 · B 12/1 · 끝 30분 전까지', () => {
  assert.equal(bfWaveNow(T('2026-11-27T23:59:00Z'), 'America/New_York'), null);  // 18:59 ET
  assert.equal(bfWaveNow(T('2026-11-27T23:00:00Z'), 'America/New_York'), null);  // 18:00 ET
  assert.equal(bfWaveNow(T('2026-11-28T00:00:00Z'), 'America/New_York'), 'a');  // 19:00 ET
  assert.equal(bfWaveNow(T('2026-11-28T02:00:00Z'), 'America/New_York'), null);  // 21:00 ET
  assert.equal(bfWaveNow(T('2026-11-30T00:30:00Z'), 'America/New_York'), 'a');  // 11/29 19:30 ET
  assert.equal(bfWaveNow(T('2026-12-01T00:30:00Z'), 'America/New_York'), null);  // 11/30 → 회차 없음
  assert.equal(bfWaveNow(T('2026-12-02T00:30:00Z'), 'America/New_York'), 'b');  // 12/1 19:30 ET
  assert.equal(bfWaveNow(T('2026-12-01T10:30:00Z'), 'Asia/Seoul'), 'b');        // 12/1 19:30 KST
  assert.equal(bfWaveNow(T('2026-12-02T06:45:00Z'), 'Pacific/Honolulu'), null);  // 12/1 20:45 HST · 끝 15분 전
  assert.equal(bfWaveNow(T('2026-11-26T10:30:00Z'), 'Asia/Seoul'), null);       // 배포 당일(11/26) 저녁 — 시작 전
  assert.equal(bfWaveNow(T('2026-12-02T11:00:00Z'), 'Asia/Seoul'), null);       // 끝난 뒤
  assert.equal(bfWaveNow(T('2026-11-27T13:37:00Z'), 'Asia/Calcutta'), 'a');     // 19:07 IST
});

test('종료 시각 표기는 기기 시간대 기준', () => {
  assert.equal(bfEndLabel('ko', 'Asia/Seoul'), '12월 2일 오후 4시');
  assert.equal(bfEndLabel('en', 'America/New_York'), 'Dec 2, 2:00 AM');
  assert.equal(bfEndLabel('en', 'Asia/Calcutta'), 'Dec 2, 12:30 PM');
  assert.equal(bfEndLabel('en', 'America/Los_Angeles'), 'Dec 1, 11:00 PM');
  assert.equal(bfEndLabel('ja', 'Asia/Tokyo'), '12月2日 16:00');
});

test('문구 — 이모지·거짓 긴급성·예측 없음 · 한국 수신자는 (광고)+수신거부', () => {
  const EMOJI = /\p{Extended_Pictographic}/u;
  const BANNED = /선착순|마지막 기회|오늘만|무조건|수익|오를|급등|매수|매도|guarantee|last chance|only today|profit|buy now|必ず|儲/i;
  for (const wave of ['a', 'b'] as const) {
    for (const [loc, tz, korea] of [['ko', 'Asia/Seoul', true], ['en', 'America/New_York', false], ['en', 'Asia/Seoul', true], ['ja', 'Asia/Tokyo', false]] as const) {
      const c = bfPushContent(wave, loc, tz, korea);
      assert.ok(!EMOJI.test(c.title + c.body), `${wave}/${loc} 이모지`);
      assert.ok(!BANNED.test(c.title + c.body), `${wave}/${loc} 금지어: ${c.title} ${c.body}`);
      assert.ok(c.title.length <= 60 && c.body.length <= 220, `${wave}/${loc} 길이 ${c.title.length}/${c.body.length}`);
      assert.match(c.body, /50/);
      if (korea) { assert.ok(c.title.startsWith('(광고) '), c.title); assert.match(c.body, /수신거부/); }
      else assert.ok(!c.title.includes('(광고)'));
      // 제목: 글자·숫자·공백·%·(광고)만
      assert.match(c.title.replace('(광고) ', ''), /^[\p{L}\p{N} %]+$/u, c.title);
      assert.ok(!/[₩$¥]\d/.test(c.body), '가격 숫자 없음(스토어프런트마다 다르다)');
    }
  }
  assert.match(bfPushContent('a', 'ko', 'Asia/Seoul', true).body, /미국 주식 앱/);
  assert.match(bfPushContent('a', 'en', 'America/New_York', false).body, /US stock app/);
  assert.match(bfPushContent('a', 'ja', 'Asia/Tokyo', false).body, /米国株アプリ/);
});

function memStore(recs: Record<string, BfTokenRec>, extra: Record<string, string> = {}) {
  const kv = new Map<string, string>(Object.entries(extra));
  for (const [t, r] of Object.entries(recs)) kv.set(BF_KEYS.token(t), JSON.stringify(r));
  const hashes = new Map<string, Record<string, number>>();
  const writes: string[] = [];
  const store: BfStore = {
    smembers: async () => Object.keys(recs),
    mget: async (keys) => keys.map((k) => { const v = kv.get(k); if (v == null) return null; try { return JSON.parse(v); } catch { return v; } }),
    setNx: async (k, v) => { writes.push(k); if (kv.has(k)) return false; kv.set(k, v); return true; },
    incr: async (k) => { writes.push(k); const n = Number(kv.get(k) || 0) + 1; kv.set(k, String(n)); return n; },
    get: async (k) => kv.get(k) ?? null,
    hincr: async (k, f) => { writes.push(k); const h = hashes.get(k) ?? {}; for (const [a, b] of Object.entries(f)) h[a] = (h[a] || 0) + b; hashes.set(k, h); },
  };
  return { store, kv, hashes, writes };
}
const tok = (i: number) => `tok${String(i).padStart(3, '0')}`.padEnd(64, 'a');

test('실행기 — 드라이런은 아무것도 쓰지 않는다 · 회차당 1회 · 20시간 간격 · 끄기', async () => {
  const recs: Record<string, BfTokenRec> = {
    [tok(1)]: rec(), [tok(2)]: rec({ platform: 'ios' }), [tok(3)]: rec({ platform: 'ios', preferences: { promo: true } }),
    [tok(4)]: rec({ locale: 'ko', tz: 'America/New_York' }), [tok(5)]: rec({ locale: 'ja', tz: 'America/New_York' }),
  };
  const sent: string[][] = [];
  const send = async (items: { id: string; title: string }[]) => { sent.push(items.map((i) => i.title)); return new Map(items.map((i) => [i.id, 'ok' as const])); };
  const m = memStore(recs);
  const dry = await runBfPush({ store: m.store, send, now: NY_FRI_EVE, dry: true, envOff: false, etDay: '2026-11-27' });
  assert.equal(dry.eligible, 3);
  assert.deepEqual(dry.skips, { no_consent: 2 });
  assert.equal(m.writes.length, 0);
  assert.equal(sent.length, 0);
  assert.ok(dry.preview && dry.preview.length >= 2);

  const r1 = await runBfPush({ store: m.store, send, now: NY_FRI_EVE, dry: false, envOff: false, etDay: '2026-11-27' });
  assert.equal(r1.sent, 3);
  const r2 = await runBfPush({ store: m.store, send, now: NY_FRI_EVE + 60_000, dry: false, envOff: false, etDay: '2026-11-27' });
  assert.equal(r2.sent, 0);
  assert.equal(r2.skips.sent, 3);
  // 다음 날 저녁(A 창 안)에도 다시 안 간다
  const r3 = await runBfPush({ store: m.store, send, now: NY_FRI_EVE + 24 * H, dry: false, envOff: false, etDay: '2026-11-28' });
  assert.equal(r3.sent, 0);
  assert.ok(m.hashes.get(BF_KEYS.stats('2026-11-27'))?.sent === 3);

  const off = memStore(recs, { [BF_KEYS.off]: '1' });
  assert.equal((await runBfPush({ store: off.store, send, now: NY_FRI_EVE, dry: false, envOff: false, etDay: 'x' })).reason, 'switch_off');
  assert.equal((await runBfPush({ store: m.store, send, now: NY_FRI_EVE, dry: false, envOff: true, etDay: 'x' })).reason, 'env_off');
  assert.equal((await runBfPush({ store: m.store, send, now: BF_PUSH_END, dry: false, envOff: false, etDay: 'x' })).reason, 'outside_period');
  assert.equal((await runBfPush({ store: m.store, send, now: T('2026-11-28T22:37:00Z'), dry: false, envOff: false, etDay: 'x' })).reason, 'blackout');
  assert.equal(bfPushEnvOff({ BF_PUSH: 'off' }), true);
  assert.equal(bfPushEnvOff({}), false);
});

test('실행기 — B 회차는 A 를 받은 기기에도 한 번 더(20시간 지난 뒤) · 하루 상한', async () => {
  const recs: Record<string, BfTokenRec> = { [tok(1)]: rec() };
  const send = async (items: { id: string }[]) => new Map(items.map((i) => [i.id, 'ok' as const]));
  const m = memStore(recs);
  assert.equal((await runBfPush({ store: m.store, send, now: NY_FRI_EVE, dry: false, envOff: false, etDay: 'd1' })).sent, 1);
  // 간격 표식(20시간)은 메모리 저장소에선 만료가 없으니 지워서 흉내
  m.kv.delete(BF_KEYS.gap(bfDevKey(tok(1))));
  assert.equal((await runBfPush({ store: m.store, send, now: T('2026-12-02T00:37:00Z'), dry: false, envOff: false, etDay: 'd2' })).sent, 1);

  const many: Record<string, BfTokenRec> = {};
  for (let i = 0; i < 10; i++) many[tok(i)] = rec();
  const m2 = memStore(many);
  const r = await runBfPush({ store: m2.store, send, now: NY_FRI_EVE, dry: false, envOff: false, etDay: 'd1', maxDay: 4 });
  assert.equal(r.sent, 4);
  assert.equal(r.skips.day_cap, 1);
  const m3 = memStore(many);
  const r2 = await runBfPush({ store: m3.store, send, now: NY_FRI_EVE, dry: false, envOff: false, etDay: 'd1', maxRun: 3 });
  assert.equal(r2.sent, 3);
  // 실패도 자리를 놓지 않는다(중복보다 누락)
  const m4 = memStore({ [tok(1)]: rec() });
  const fail = async (items: { id: string }[]) => new Map(items.map((i) => [i.id, 'fail' as const]));
  assert.equal((await runBfPush({ store: m4.store, send: fail, now: NY_FRI_EVE, dry: false, envOff: false, etDay: 'd1' })).fail, 1);
  assert.equal((await runBfPush({ store: m4.store, send, now: NY_FRI_EVE + 60_000, dry: false, envOff: false, etDay: 'd1' })).sent, 0);
});

test('선호 — promo 는 명시 값만 저장·유지 · 동의 시각 기록', () => {
  assert.deepEqual(sanitizePrefs({ promo: true, x: 1 }), { promo: true });
  assert.equal(mergePrefs({ enabled: true, morning: true, closing: true }, null).promo, undefined);
  assert.equal(mergePrefs({ enabled: true, morning: true, closing: true, promo: true }, { morning: false }).promo, true);
  assert.equal(mergePrefs({ promo: true }, { promo: false }).promo, false);
  const now = '2026-11-27T01:00:00.000Z';
  const a = mergeRegistration(null, { token: 't', app: 'signum', platform: 'ios', preferences: { promo: true } }, now);
  assert.equal(a.preferences?.promo, true);
  assert.equal(a.promoAt, now);
  const b = mergeRegistration(a, { token: 't', app: 'signum', preferences: { promo: true } }, '2026-11-28T00:00:00.000Z');
  assert.equal(b.promoAt, now);       // 같은 값 다시 = 시각 그대로
  const c = mergeRegistration(b, { token: 't', app: 'signum' }, '2026-11-29T00:00:00.000Z');
  assert.equal(c.preferences?.promo, true);
  const d = mergeRegistration(null, { token: 't', app: 'signum', platform: 'android' }, now);
  assert.equal('promoAt' in d, false);
  assert.equal(d.preferences?.promo, undefined);
});

test('탭 — 대시보드 판정·플랫폼별 이벤트 · 앱 배선', () => {
  assert.equal(onDash('/ko/app-view/dash'), true);
  assert.equal(onDash('/en/app-view/dash/'), true);
  assert.equal(onDash('/en/app-view/settings'), false);
  assert.equal(bfPushEventFor('ios'), BF_OPEN_EVENT);
  assert.equal(bfPushEventFor('android'), BF_PUSH_OPEN_EVENT);
  assert.equal(bfPushEventFor('web'), null);
  assert.equal(BF_PUSH_TYPE, 'bf_offer');
  const layout = readFileSync('src/app/[locale]/app-view/layout.tsx', 'utf8');
  assert.match(layout, /type === 'bf_offer'[\s\S]{0,400}handleBfPushTap/);
  const host = readFileSync('src/components/app/AndroidBfHost.tsx', 'utf8');
  assert.match(host, /BF_PUSH_OPEN_EVENT/);
  assert.match(host, /pushRequest=\{pushReq\}/);
  const gate = readFileSync('src/components/app/AndroidBfGate.tsx', 'utf8');
  assert.match(gate, /pushRequest <= lastPush\.current/);
  assert.ok(FUNNEL_SRCS.includes('push_bf' as never));
  assert.ok(FUNNEL_SRCS.includes('promo_on' as never) && FUNNEL_SRCS.includes('promo_off' as never));
  const settings = readFileSync('src/app/[locale]/app-view/settings/page.tsx', 'utf8');
  assert.match(settings, /mounted && promoShown\(prefs\.promo/);
  assert.match(settings, /혜택·할인 알림/);
  const vj = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.ok(vj.crons.some((c: { path: string; schedule: string }) => c.path === '/api/cron/bf-push' && c.schedule === '37 * * * *'));
});
