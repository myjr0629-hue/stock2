/** Offline: npx tsx tests/announcePush.test.ts — 관리자 공지 푸시(lib/push/announce · lib/app/announceTap · 라우트 인증) */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANN_CLAIM_LUA, ANN_DEV_CLAIM_LUA, ANN_KEYS, announceDevice, parseAnnounceRequest, runAnnounce,
  type AnnounceRequest, type AnnounceStore,
} from '../src/lib/push/announce';
import { announceTapPath, ANNOUNCE_PATHS } from '../src/lib/app/announceTap';
import { FUNNEL_SRCS, isFunnelSrc } from '../src/lib/app/funnelSchema';

// ── 메모리 저장소(두 Lua 를 흉내) ─────────────────────────────────────────────
function memStore() {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const lists = new Map<string, string[]>();
  const calls: string[] = [];
  const ttls = new Map<string, number>();
  const store: AnnounceStore = {
    smembers: async (k) => [...(sets.get(k) ?? [])],
    mget: async (keys) => keys.map((k) => { const v = kv.get(k); if (v == null) return null; try { return JSON.parse(v); } catch { return v; } }),
    eval: async (script, keys, args) => {
      calls.push('eval');
      if (script === ANN_CLAIM_LUA) {
        const v = kv.get(keys[0]);
        if (v === args[0]) return 'ok';
        if (v != null) return 'dup';
        const d = kv.get(keys[1]);
        if (d != null && d !== args[0]) return 'day';
        kv.set(keys[0], args[0]); kv.set(keys[1], args[0]);
        return 'ok';
      }
      if (script === ANN_DEV_CLAIM_LUA) return keys.map((k) => { const v = kv.get(k); if (v === args[0]) return 1; if (v != null) return 0; kv.set(k, args[0]); return 1; });
      throw new Error('unknown script');
    },
    set: async (k, v, ttl) => { calls.push('set'); kv.set(k, v); ttls.set(k, ttl); },
    lpush: async (k, v) => { calls.push('lpush'); lists.set(k, [v, ...(lists.get(k) ?? [])]); },
    srem: async (k, ms) => { calls.push('srem'); for (const m of ms) sets.get(k)?.delete(m); },
    del: async (ks) => { calls.push('del'); for (const k of ks) kv.delete(k); },
  };
  return { kv, sets, lists, calls, ttls, store };
}

const IOS = (n: number) => n.toString(16).padStart(64, 'a');
const AND = (n: number) => `fcm${n}:APA91b${n}`;
function seed(m: ReturnType<typeof memStore>, devs: Array<[string, Record<string, unknown> | null]>) {
  const set = new Set<string>();
  for (const [t, rec] of devs) { set.add(t); if (rec) m.kv.set(ANN_KEYS.token(t), JSON.stringify(rec)); }
  m.sets.set(ANN_KEYS.tokens, set);
}
const BASE = (o: Record<string, unknown> = {}) => ({ app: 'signum', createdAt: '2026-10-01T00:00:00Z', preferences: { enabled: true, morning: true, closing: true }, ...o });

const COPY = {
  ko: { title: '새 기능', body: '내 종목 가격 알림 · 친구 초대하면 나도 PRO 1개월' },
  ja: { title: '新機能', body: '新機能：マイ銘柄の価格アラート・友だち招待で自分もPRO 1か月' },
  en: { title: 'New', body: 'New: price alerts for your watchlist · invite a friend, get 1 month of PRO' },
};
// 2026-11-14 01:45Z = 모닝·마감 발송 창 밖(inPushBlackout false)
const NOW = Date.parse('2026-11-14T01:45:00Z');
const reqOf = (o: Record<string, unknown> = {}): AnnounceRequest => {
  const p = parseAnnounceRequest({ id: 'feat-1114', copy: COPY, path: '/app-view/watchlist', dry: false, ...o });
  assert.ok(p.ok, JSON.stringify(p));
  return (p as { ok: true; req: AnnounceRequest }).req;
};

function fakeSend(result: (token: string) => 'ok' | 'fail' | 'dead' = () => 'ok') {
  const sent: any[] = [];
  return {
    sent,
    send: async (items: any[]) => { sent.push(...items); return new Map(items.map((i) => [i.id, result(i.token)])); },
  };
}

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) { await fn(); n++; console.log('ok', name); }

async function main() {
  // ── 요청 해석 ──
  await t('parse: dry 기본값 = 드라이런(명시적 false 일 때만 발송)', () => {
    const p = parseAnnounceRequest({ id: 'feat-1114', copy: { en: COPY.en }, path: '/app-view/watchlist' });
    assert.ok(p.ok && p.req.dry === true);
    const q = parseAnnounceRequest({ id: 'feat-1114', copy: { en: COPY.en }, path: '/app-view/watchlist', dry: 'false' });
    assert.ok(q.ok && q.req.dry === true);
  });
  await t('parse: 틀린 값은 400(en 필수·경로 닫힌 목록·ID 모양·길이·평생 금지·모르는 언어·플랫폼)', () => {
    const bad = [
      null, [], { id: 'x', copy: COPY, path: '/app-view/watchlist' },
      { id: 'feat-1114', copy: { ko: COPY.ko }, path: '/app-view/watchlist' },
      { id: 'feat-1114', copy: COPY, path: 'https://evil.example/' },
      { id: 'feat-1114', copy: COPY, path: '/app-view/watchlist?x=1' },
      { id: 'feat-1114', copy: { ...COPY, en: { title: 'x'.repeat(61), body: 'b' } }, path: '/app-view/watchlist' },
      { id: 'feat-1114', copy: { ...COPY, en: { title: 'New', body: 'lifetime PRO' } }, path: '/app-view/watchlist' },
      { id: 'feat-1114', copy: { ...COPY, ko: { title: '새 기능', body: '평생 무료' } }, path: '/app-view/watchlist' },
      { id: 'feat-1114', copy: { ...COPY, de: COPY.en }, path: '/app-view/watchlist' },
      { id: 'feat-1114', copy: { ...COPY, en: { title: 'a\nb', body: 'b' } }, path: '/app-view/watchlist' },
      { id: 'feat-1114', copy: COPY, path: '/app-view/watchlist', platforms: ['web'] },
      { id: 'feat-1114', copy: COPY, path: '/app-view/watchlist', platforms: [] },
      { id: 'Feat 1114', copy: COPY, path: '/app-view/watchlist' },
    ];
    for (const b of bad) assert.equal(parseAnnounceRequest(b).ok, false, JSON.stringify(b));
  });
  await t('tap: 닫힌 목록만', () => {
    for (const p of ANNOUNCE_PATHS) assert.equal(announceTapPath(p), p);
    for (const p of ['/app-view/watchlist?x', '//evil', '/app-view/paywall', 'https://x', 1, null]) assert.equal(announceTapPath(p), null);
  });
  await t('funnel: push_announce 가 닫힌 목록에 있다', () => {
    assert.ok(isFunnelSrc('push_announce') && (FUNNEL_SRCS as readonly string[]).includes('push_announce'));
  });

  // ── 기기 선택 ──
  await t('device: 마스터 끔·권한 없음·레코드 없음·다른 앱·플랫폼 제외는 뺀다 · 개별 토글(모닝 끔)은 받는다', () => {
    assert.equal(announceDevice(IOS(1), null, ['ios', 'android']), 'noRecord');
    assert.equal(announceDevice(IOS(1), BASE({ app: 'wim' }), ['ios', 'android']), 'otherApp');
    assert.equal(announceDevice(IOS(1), BASE({ preferences: { enabled: false } }), ['ios', 'android']), 'optedOut');
    assert.equal(announceDevice(IOS(1), BASE({ notifPerm: false }), ['ios', 'android']), 'noPerm');
    assert.equal(announceDevice(IOS(1), BASE(), ['android']), 'platform');
    const d = announceDevice(IOS(1), BASE({ preferences: { enabled: true, morning: false, closing: false, signals: false } }), ['ios', 'android']);
    assert.ok(typeof d === 'object' && d.platform === 'ios');
    const a = announceDevice(AND(1), BASE({ platform: 'android', locale: 'ja' }), ['ios', 'android']);
    assert.ok(typeof a === 'object' && a.platform === 'android' && a.locale === 'ja');
  });

  // ── 드라이런 ──
  await t('dry: 발송 0 · 자리·기록 0 · 언어 분포', async () => {
    const m = memStore();
    seed(m, [
      [IOS(1), BASE({ platform: 'ios', locale: 'ko', tz: 'Asia/Seoul' })],
      [IOS(2), BASE({ platform: 'ios', locale: 'ja', tz: 'Asia/Tokyo' })],
      [IOS(3), BASE({ platform: 'ios', locale: 'de' })],
      [AND(4), BASE({ platform: 'android', locale: 'en', tz: 'America/New_York' })],
      [AND(5), BASE({ platform: 'android', preferences: { enabled: false } })],
      [IOS(6), null],
    ]);
    const f = fakeSend();
    const r = await runAnnounce(reqOf({ dry: true }), { store: m.store, send: f.send, now: () => NOW });
    assert.equal(r.dry, true); assert.equal(r.status, 200);
    assert.equal(f.sent.length, 0);
    assert.deepEqual(m.calls, []);   // eval·set·lpush·srem·del 전부 0
    assert.equal(r.targets, 4);
    assert.deepEqual(r.split, { ios: { ko: 1, ja: 1, en: 1 }, android: { ko: 0, ja: 0, en: 1 } });
    assert.equal(r.skipped.optedOut, 1); assert.equal(r.skipped.noRecord, 1);
    assert.equal(r.wouldBlock, null);
    assert.equal(r.quiet, 1);   // 시간대 없는 기기(de)만 조용히 — 서울·도쿄 10:45, 뉴욕 20:45 는 소리 있음
  });

  // ── 발송 ──
  await t('send: 언어별 문구·딥링크·결과 집계·죽은 토큰 정리·기록', async () => {
    const m = memStore();
    seed(m, [
      [IOS(1), BASE({ platform: 'ios', locale: 'ko', tz: 'Asia/Seoul' })],
      [IOS(2), BASE({ platform: 'ios', locale: 'ja', tz: 'Asia/Tokyo' })],
      [IOS(3), BASE({ platform: 'ios', locale: 'fr', tz: 'Europe/Paris' })],
      [AND(4), BASE({ platform: 'android', locale: 'ko', tz: 'Asia/Seoul' })],
      [AND(5), BASE({ platform: 'android', locale: 'en', tz: 'America/New_York' })],
    ]);
    const f = fakeSend((tok) => (tok === AND(5) ? 'dead' : tok === IOS(3) ? 'fail' : 'ok'));
    const r = await runAnnounce(reqOf(), { store: m.store, send: f.send, now: () => NOW });
    assert.equal(r.status, 200); assert.equal(r.dry, false);
    assert.equal(r.targets, 5); assert.equal(r.sent, 3); assert.equal(r.fail, 2); assert.equal(r.dead, 1);
    const by = new Map(f.sent.map((i) => [i.token, i]));
    assert.equal(by.get(IOS(1)).body, COPY.ko.body); assert.equal(by.get(IOS(1)).title, '새 기능');
    assert.equal(by.get(IOS(2)).body, COPY.ja.body);
    assert.equal(by.get(IOS(3)).body, COPY.en.body);   // fr → en
    assert.equal(by.get(AND(4)).body, COPY.ko.body);
    for (const i of f.sent) {
      assert.equal(i.data.type, 'announce'); assert.equal(i.data.path, '/app-view/watchlist'); assert.equal(i.data.src, 'push_announce');
      for (const v of Object.values(i.data)) assert.equal(typeof v, 'string');
    }
    assert.equal(by.get(IOS(1)).quiet, false);   // 서울 10:45
    assert.equal(by.get(AND(5)).quiet, false);   // 뉴욕 20:45
    assert.equal(by.get(IOS(3)).quiet, true);    // 파리 02:45 → 소리 없이
    assert.ok(!m.sets.get(ANN_KEYS.tokens)!.has(AND(5)));   // 죽은 토큰 정리
    assert.ok(!m.kv.has(ANN_KEYS.token(AND(5))));
    assert.ok(m.sets.get(ANN_KEYS.tokens)!.has(IOS(3)));    // 실패(fail)는 지우지 않는다
    const log = JSON.parse(m.kv.get(ANN_KEYS.log('feat-1114'))!);
    assert.equal(log.state, 'done'); assert.equal(log.sent, 3); assert.equal(log.fail, 2); assert.equal(log.targets, 5);
    assert.equal(JSON.parse(m.kv.get(ANN_KEYS.claim('feat-1114'))!).state, 'done');
    assert.equal(m.lists.get(ANN_KEYS.index)!.length, 1);
    assert.deepEqual(r.sentSplit, { ios: { ko: 1, ja: 1, en: 0 }, android: { ko: 1, ja: 0, en: 0 } });
  });

  await t('dup: 같은 ID 두 번째는 409 · 발송 0 (동시 두 요청도 하나만)', async () => {
    const m = memStore();
    seed(m, [[IOS(1), BASE({ platform: 'ios', locale: 'ko', tz: 'Asia/Seoul' })], [AND(2), BASE({ platform: 'android', locale: 'ko', tz: 'Asia/Seoul' })]]);
    const f = fakeSend();
    const [a, b] = await Promise.all([
      runAnnounce(reqOf(), { store: m.store, send: f.send, now: () => NOW }),
      runAnnounce(reqOf(), { store: m.store, send: f.send, now: () => NOW }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal(f.sent.length, 2);   // 기기마다 정확히 한 통
    assert.equal(new Set(f.sent.map((i) => i.token)).size, 2);
    const c = await runAnnounce(reqOf(), { store: m.store, send: f.send, now: () => NOW + 3 * 864e5 });
    assert.equal(c.status, 409); assert.equal(c.reason, 'duplicate'); assert.equal(f.sent.length, 2);
    const d = await runAnnounce(reqOf({ dry: true }), { store: m.store, send: f.send, now: () => NOW });
    assert.equal(d.wouldBlock, 'duplicate');
  });

  await t('cap: 24시간 안 다른 공지 = 429 · 발송 0', async () => {
    const m = memStore();
    seed(m, [[IOS(1), BASE({ platform: 'ios', locale: 'ko', tz: 'Asia/Seoul' })]]);
    const f = fakeSend();
    assert.equal((await runAnnounce(reqOf(), { store: m.store, send: f.send, now: () => NOW })).status, 200);
    const r = await runAnnounce(reqOf({ id: 'feat-1114b' }), { store: m.store, send: f.send, now: () => NOW + 3600e3 });
    assert.equal(r.status, 429); assert.equal(r.reason, 'daily_cap'); assert.equal(f.sent.length, 1);
    assert.ok(!m.kv.has(ANN_KEYS.claim('feat-1114b')));   // 막힌 ID 는 자리를 남기지 않는다(내일 같은 ID 로 다시 가능)
  });

  await t('cap: 기기당 7일 1회 — 다음 공지(24시간 뒤)에도 이미 받은 기기는 건너뛴다', async () => {
    const m = memStore();
    seed(m, [[IOS(1), BASE({ platform: 'ios', locale: 'ko', tz: 'Asia/Seoul' })]]);
    const f = fakeSend();
    await runAnnounce(reqOf({ platforms: ['ios'] }), { store: m.store, send: f.send, now: () => NOW });
    m.kv.delete(ANN_KEYS.last);   // 24시간 지남(메모리 저장소엔 TTL 이 없어 직접 지운다)
    m.sets.get(ANN_KEYS.tokens)!.add(AND(2)); m.kv.set(ANN_KEYS.token(AND(2)), JSON.stringify(BASE({ platform: 'android', locale: 'ja', tz: 'Asia/Tokyo' })));
    const r = await runAnnounce(reqOf({ id: 'feat-1115' }), { store: m.store, send: f.send, now: () => NOW + 25 * 3600e3 });
    assert.equal(r.status, 200); assert.equal(r.skipped.weeklyCap, 1); assert.equal(r.targets, 1);
    assert.deepEqual(f.sent.map((i) => i.token), [IOS(1), AND(2)]);
  });

  await t('platforms: 안드만 보내면 iOS 기기는 자리를 잡지 않는다(나중에 iOS 공지를 받을 수 있다)', async () => {
    const m = memStore();
    seed(m, [[IOS(1), BASE({ platform: 'ios', locale: 'ko', tz: 'Asia/Seoul' })], [AND(2), BASE({ platform: 'android', locale: 'ko', tz: 'Asia/Seoul' })]]);
    const f = fakeSend();
    const r = await runAnnounce(reqOf({ platforms: ['android'] }), { store: m.store, send: f.send, now: () => NOW });
    assert.equal(r.targets, 1); assert.equal(r.skipped.platform, 1);
    assert.deepEqual(f.sent.map((i) => i.token), [AND(2)]);
    const iosDev = [...m.kv.keys()].filter((k) => k.startsWith('push:announce:dev:'));
    assert.equal(iosDev.length, 1);
  });

  await t('blackout: 모닝·마감 발송 창(12:05~12:35Z)에는 409 · 발송 0 · 자리 0', async () => {
    const m = memStore();
    seed(m, [[IOS(1), BASE({ platform: 'ios', locale: 'ko' })]]);
    const f = fakeSend();
    const r = await runAnnounce(reqOf(), { store: m.store, send: f.send, now: () => Date.parse('2026-11-14T12:10:00Z') });
    assert.equal(r.status, 409); assert.equal(r.reason, 'blackout'); assert.equal(f.sent.length, 0); assert.deepEqual(m.calls, []);
  });

  await t('send 예외: 발송기가 던져도 전부 fail 로 세고 자리는 유지(중복 없음)', async () => {
    const m = memStore();
    seed(m, [[IOS(1), BASE({ platform: 'ios', locale: 'ko', tz: 'Asia/Seoul' })]]);
    const r = await runAnnounce(reqOf(), { store: m.store, send: async () => { throw new Error('x'); }, now: () => NOW });
    assert.equal(r.sent, 0); assert.equal(r.fail, 1); assert.equal(r.dead, 0);
    assert.equal((await runAnnounce(reqOf(), { store: m.store, send: fakeSend().send, now: () => NOW })).status, 409);
  });

  await t('retry: Lua 응답 유실 뒤 같은 실행 번호로 다시 불러도 자기 자리 — 발송이 빠지지 않는다', async () => {
    const m = memStore();
    seed(m, [[IOS(1), BASE({ platform: 'ios', locale: 'ko', tz: 'Asia/Seoul' })], [AND(2), BASE({ platform: 'android', locale: 'ko', tz: 'Asia/Seoul' })]]);
    // 첫 eval 은 Redis 에서 실행된 뒤 응답이 유실 → 클라이언트가 같은 호출을 한 번 더(Upstash 기본 재시도 흉내)
    const orig = m.store.eval;
    m.store.eval = async (sc, k, a) => { await orig(sc, k, a); return orig(sc, k, a); };
    const f = fakeSend();
    const r = await runAnnounce(reqOf(), { store: m.store, send: f.send, now: () => NOW, nonce: 'run-1' });
    assert.equal(r.status, 200); assert.equal(r.targets, 2); assert.equal(r.skipped.weeklyCap, 0); assert.equal(f.sent.length, 2);
    // 다른 실행(다른 번호)은 여전히 막힌다
    m.store.eval = orig;
    assert.equal((await runAnnounce(reqOf(), { store: m.store, send: f.send, now: () => NOW, nonce: 'run-2' })).status, 409);
    assert.equal(m.ttls.get(ANN_KEYS.claim('feat-1114')), 0);   // 같은 ID 자리는 만료 없음
  });

  await t('budget: 시간 예산이 끝나면 새 묶음을 시작하지 않는다 — 남은 기기는 자리도 안 잡는다(partial)', async () => {
    const m = memStore();
    const devs: Array<[string, Record<string, unknown>]> = [];
    for (let i = 1; i <= 450; i++) devs.push([AND(i), BASE({ platform: 'android', locale: 'en', tz: 'America/New_York' })]);
    seed(m, devs);
    let tick = 0;
    const f = { sent: [] as any[], send: async (items: any[]) => { f.sent.push(...items); tick += 36_000; return new Map(items.map((i: any) => [i.id, 'ok' as const])); } };
    const r = await runAnnounce(reqOf(), { store: m.store, send: f.send, now: () => NOW, clock: () => tick });
    assert.equal(f.sent.length, 200);                      // 한 묶음 = 200(동시 요청 상한)
    assert.equal(r.targets, 200); assert.equal(r.deferred, 250);
    assert.equal([...m.kv.keys()].filter((k) => k.startsWith('push:announce:dev:')).length, 200);
    assert.equal(JSON.parse(m.kv.get(ANN_KEYS.log('feat-1114'))!).state, 'partial');
  });

  await t('dry: 상한 판정은 «적격 기기 전체» 기준 — 실제 발송의 413 과 같다', async () => {
    const m = memStore();
    const devs: Array<[string, Record<string, unknown>]> = [];
    for (let i = 1; i <= 5001; i++) devs.push([AND(i), BASE({ platform: 'android', locale: 'en' })]);
    seed(m, devs);
    m.kv.set('push:announce:dev:' + (await import('../src/lib/signals/plan')).devKey(AND(1)), 'x');
    const r = await runAnnounce(reqOf({ dry: true }), { store: m.store, send: fakeSend().send, now: () => NOW });
    assert.equal(r.wouldBlock, 'too_many_targets');
    const s2 = await runAnnounce(reqOf(), { store: m.store, send: fakeSend().send, now: () => NOW });
    assert.equal(s2.status, 413);
  });

  // ── 라우트 계약(정적) ──
  await t('route: Bearer 헤더만 · 비밀 없으면 닫힘 · 쿼리 비밀 없음', () => {
    const src = readFileSync(new URL('../src/app/api/admin/announce/route.ts', import.meta.url), 'utf8');
    assert.ok(/if \(!secret\) return false;/.test(src));
    assert.ok(!/searchParams\.get\('secret'\)/.test(src));
    assert.ok(!/x-cron-secret/.test(src.replace(/^\/\/.*$/gm, '')));
    assert.ok(/status: 401/.test(src));
  });
  await t('layout: announce 탭 → 닫힌 목록 경로 · 계측 push_announce', () => {
    const src = readFileSync(new URL('../src/app/[locale]/app-view/layout.tsx', import.meta.url), 'utf8');
    assert.ok(src.includes("type === ANNOUNCE_PUSH_TYPE ? announceTapPath(action?.notification?.data?.path) : null"));
    assert.ok(src.includes("src: 'push_announce'"));
  });

  console.log(`\n${n} passed`);
}
main().catch((e) => { console.error(e); process.exit(1); });
