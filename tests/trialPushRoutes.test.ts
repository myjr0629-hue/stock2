/** Offline: npx tsx tests/trialPushRoutes.test.ts — 보고 API · D-2 크론을 메모리 Redis·가짜 발송기로 끝까지(네트워크·공급사 호출 없음) */
import assert from 'node:assert/strict';
import Module from 'node:module';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

// ── 메모리 Redis(쓰는 명령만) ──
const kv = new Map<string, string>();
const zs = new Map<string, Map<string, number>>();
const fake = {
  get: async (k: string) => (kv.has(k) ? kv.get(k)! : null),
  set: async (k: string, v: string, o?: { nx?: boolean; ex?: number }) => { if (o?.nx && kv.has(k)) return null; kv.set(k, String(v)); return 'OK'; },
  del: async (...ks: string[]) => { ks.forEach((k) => kv.delete(k)); return ks.length; },
  mget: async (...ks: string[]) => ks.map((k) => (kv.has(k) ? kv.get(k)! : null)),
  incr: async (k: string) => { const n = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(n)); return n; },
  expire: async () => 1,
  // 쓰는 Lua 하나(옛 토큰의 주인이 이 고객이면 지운다)만 흉내
  eval: async (script: string, keys: string[], args: string[]) => {
    if (/ZADD/.test(script)) {   // 확인된 기록 쓰기 — 주인 · 기록 · 고객→토큰 · 대상
      kv.set(keys[0], args[0]); kv.set(keys[1], args[1]); kv.set(keys[3], args[5]);
      const z = zs.get(keys[2]) ?? zs.set(keys[2], new Map()).get(keys[2])!;
      if (args[4] === '1') z.set(args[5], Number(args[3])); else z.delete(args[5]);
      return 1;
    }
    assert.match(script, /redis.call\('GET', KEYS\[1\]\) == ARGV\[1\]/);
    if (kv.get(keys[0]) !== args[0]) return 0;
    zs.get(keys[1])?.delete(args[1]); kv.delete(keys[2]); kv.delete(keys[0]); return 1;
  },
  zadd: async (k: string, m: { score: number; member: string }) => { (zs.get(k) ?? zs.set(k, new Map()).get(k)!).set(m.member, m.score); return 1; },
  zrem: async (k: string, member: string) => { zs.get(k)?.delete(member); return 1; },
  zremrangebyscore: async (k: string, min: number, max: number) => { const z = zs.get(k); if (z) for (const [m, s] of z) if (s >= min && s <= max) z.delete(m); return 0; },
  zrange: async (k: string, min: number, max: number, o: { offset?: number; count?: number }) => {
    const all = [...(zs.get(k) ?? new Map()).entries()].filter(([, s]) => s >= min && s <= max).sort((a, b) => a[1] - b[1]).map(([m]) => m);
    return all.slice(o.offset ?? 0, (o.offset ?? 0) + (o.count ?? all.length));
  },
};
const pipeline = () => { const ops: Array<() => Promise<unknown>> = []; const p = { incr: (k: string) => { ops.push(() => fake.incr(k)); return p; }, expire: (_k: string, _t: number) => { ops.push(async () => 1); return p; }, exec: async () => { const out = []; for (const o of ops) out.push(await o()); return out; } }; return p; };
mock('@upstash/redis', { Redis: { fromEnv: () => ({ ...fake, pipeline }) } });
// ── 가짜 RevenueCat(GET /v1/subscribers/{id}) — 고객 ID → 응답 ──
process.env.NEXT_PUBLIC_RC_IOS_KEY = 'appl_test'; process.env.NEXT_PUBLIC_RC_ANDROID_KEY = 'goog_test';
const rc = new Map<string, unknown>();
let rcDown = false;
const rcCalls: string[] = [];
(globalThis as any).fetch = async (url: string) => {
  const id = decodeURIComponent(String(url).split('/subscribers/')[1] ?? '');
  rcCalls.push(id);
  if (rcDown) return { ok: false, status: 503, json: async () => ({}) };
  const body = rc.get(id) ?? { subscriber: { entitlements: {}, subscriptions: {} } };
  return { ok: true, status: 200, json: async () => body };
};
const rcTrial = (expiresAt: number, off = true, store = 'app_store') => ({ subscriber: {
  entitlements: { pro: { product_identifier: 'com.signumhq.app.pro.monthly', expires_date: new Date(expiresAt).toISOString(), purchase_date: new Date(expiresAt - 30 * 86400_000).toISOString() } },
  subscriptions: { 'com.signumhq.app.pro.monthly': { period_type: 'trial', store, expires_date: new Date(expiresAt).toISOString(), unsubscribe_detected_at: off ? new Date(expiresAt - 29 * 86400_000).toISOString() : null, billing_issues_detected_at: null, ownership_type: 'PURCHASED' } },
} });
const uidOf = (t: string) => '$RCAnonymousID:' + t.charCodeAt(0).toString(16).padStart(2, '0').repeat(16);
const sent: any[] = [];
let outcome: 'ok' | 'fail' | 'dead' = 'ok';
mock('../src/lib/push/sendSignal', { sendSignalPushes: async (items: any[]) => { sent.push(...items); return new Map(items.map((i) => [i.id, outcome])); } });

const H = 3600_000;
const tokA = 'a'.repeat(64), tokB = 'b'.repeat(64), tokC = 'c'.repeat(64);
const reg = (t: string, extra: Record<string, unknown> = {}) => kv.set(`push:tokens:${t}`, JSON.stringify({ token: t, platform: 'ios', app: 'signum', locale: 'ko', preferences: { enabled: true, morning: true, closing: true }, tz: 'UTC', ...extra }));

let i0 = 1;
async function main() {
  const report = (await import('../src/app/api/push/trial/route')).POST;
  const cron = (await import('../src/app/api/cron/trial-push/route')).GET;
  const post = async (body: unknown) => { const r = await report(new Request('http://x/api/push/trial', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) as never); return { status: r.status, body: await r.json() }; };
  const run = async (q = '') => { const r = await cron(new Request(`http://x/api/cron/trial-push${q}`)); return r.json(); };
  // 지금이 UTC 낮(09~21시)이 되도록 시계를 고정
  const realNow = Date.now;
  const base = new Date(); base.setUTCHours(12, 0, 0, 0);
  const T = base.getTime();
  Date.now = () => T;
  try {
    const body = (t: string, c: Record<string, unknown> = {}) => ({ token: t, rcUid: uidOf(t), platform: 'ios', locale: 'ko', expiresAt: T + 40 * H, willRenew: false, periodType: 'TRIAL', store: 'APP_STORE', ...c });
    for (const t of [tokA, tokB, tokC]) rc.set(uidOf(t), rcTrial(T + 40 * H));
    // 등록 안 된 토큰 → 202 stored:false
    let r = await post(body(tokA));
    assert.equal(r.status, 202); assert.equal(r.body.stored, false);
    reg(tokA); reg(tokB); reg(tokC, { preferences: { enabled: false } });
    r = await post(body(tokA)); assert.equal(r.status, 200); assert.equal(r.body.stored, true); assert.equal(r.body.due, true);
    // 5초 안 두 번째 → 429
    r = await post(body(tokA)); assert.equal(r.status, 429); assert.equal(r.body.stored, false);
    r = await post(body(tokB)); assert.equal(r.body.due, true);
    r = await post(body(tokC)); assert.equal(r.body.due, true);
    // 잘못된 값 → 400
    kv.delete(`push:trial:rl:${tokB}`);
    r = await post({ ...body(tokB), expiresAt: 'x' }); assert.equal(r.status, 400);
    // 드라이런 — 방금 보고(최근 6시간 방문)라 아직 안 보낸다
    let d = await run('?dry=1');
    assert.equal(d.send, 0); assert.equal(d.skipped.recent_open, 2); assert.equal(d.skipped.muted, 1);
    // 7시간 뒤로 기록 시각을 돌린다(앱을 안 연 사람)
    for (const t of [tokA, tokB, tokC]) { const rec = JSON.parse(kv.get(`push:trial:${t}`)!); rec.at = T - 7 * H; kv.set(`push:trial:${t}`, JSON.stringify(rec)); }
    d = await run('?dry=1');
    assert.equal(d.send, 2); assert.equal(sent.length, 0, '드라이런은 보내지 않는다');
    assert.match(d.preview[0].title, /PRO 무료 체험이/);
    // 실제 회차 — 2통(알림 끈 C 제외)
    let res = await run();
    assert.equal(res.sent, 2); assert.equal(sent.length, 2);
    assert.deepEqual(sent.map((s) => s.data.type), ['trial_end', 'trial_end']);
    assert.ok(kv.has(`push:trial:sent:${tokA}`));
    // 다음 회차 — 다시 안 보낸다(체험당·토큰당 한 번)
    res = await run();
    assert.equal(res.sent, 0); assert.equal(sent.length, 2);
    // 만료일을 바꿔 다시 보고해도(남용) 25일 표식 때문에 안 간다
    kv.delete(`push:trial:rl:${tokA}`);
    await post(body(tokA, { expiresAt: T + 30 * H }));
    { const rec = JSON.parse(kv.get(`push:trial:${tokA}`)!); rec.at = T - 7 * H; kv.set(`push:trial:${tokA}`, JSON.stringify(rec)); }
    res = await run(); assert.equal(res.sent, 0);
    // 갱신을 다시 켰다 → 대상에서 빠진다 · 해제({clear}) → 기록도 지운다
    const tokD = 'd'.repeat(64); reg(tokD); rc.set(uidOf(tokD), rcTrial(T + 40 * H));
    await post(body(tokD)); kv.delete(`push:trial:rl:${tokD}`);
    assert.ok(zs.get('push:trial:due')!.has(tokD));
    await post(body(tokD, { willRenew: true })); kv.delete(`push:trial:rl:${tokD}`);
    assert.equal(zs.get('push:trial:due')!.has(tokD), false);
    await post(body(tokD)); kv.delete(`push:trial:rl:${tokD}`);
    r = await post({ token: tokD, clear: true }); assert.equal(r.body.stored, true);
    assert.equal(zs.get('push:trial:due')!.has(tokD), false); assert.equal(kv.has(`push:trial:${tokD}`), false);
    // 실패(응답 유실 포함) → 표식을 놓지 않는다(중복보다 누락 — 관문 11110931) · 하루 시도 상한
    const tokE = 'e'.repeat(64); reg(tokE); rc.set(uidOf(tokE), rcTrial(T + 40 * H));
    await post(body(tokE));
    { const rec = JSON.parse(kv.get(`push:trial:${tokE}`)!); rec.at = T - 7 * H; kv.set(`push:trial:${tokE}`, JSON.stringify(rec)); }
    outcome = 'fail';
    res = await run(); assert.equal(res.failed, 1); assert.equal(kv.has(`push:trial:sent:${tokE}`), true);
    outcome = 'ok';
    const before = sent.length;
    res = await run(); assert.equal(res.sent, 0); assert.equal(sent.length, before, '실패한 토큰에 다시 보내지 않는다');
    const dayKey = [...kv.keys()].find((k) => k.startsWith('push:trial:day:'))!;
    assert.equal(Number(kv.get(dayKey)), 3, '하루 시도 수 = 2 + 실패 1');
    kv.set(dayKey, '300');
    const tokF = 'f'.repeat(64); reg(tokF); rc.set(uidOf(tokF), rcTrial(T + 40 * H));
    await post(body(tokF));
    { const rec = JSON.parse(kv.get(`push:trial:${tokF}`)!); rec.at = T - 7 * H; kv.set(`push:trial:${tokF}`, JSON.stringify(rec)); }
    res = await run(); assert.equal(res.sent, 0); assert.equal(res.skipped.day_cap, 1); assert.equal(kv.has(`push:trial:sent:${tokF}`), false, '상한이면 자리를 놓는다');
    // 통계
    assert.ok([...kv.keys()].some((k) => k.startsWith('push:stats:trial:')));

    // ── ★11/12 야간 검토 ②: 대상에 넣는 보고는 RevenueCat 확인 ──
    kv.delete(dayKey);
    const fresh = (t: string) => { kv.delete(`push:trial:rl:${t}`); };
    const ageRec = (t: string) => { const rec = JSON.parse(kv.get(`push:trial:${t}`)!); rec.at = T - 7 * H; kv.set(`push:trial:${t}`, JSON.stringify(rec)); };
    // (1) 가짜: 등록만 한 토큰 + RC 에 체험 없는 고객 → 대상 아님
    const fakes = Array.from({ length: 5 }, (_, i) => `fake${i}`.padEnd(64, 'x'));
    for (const t of fakes) { reg(t); r = await post({ ...body(t), rcUid: `$RCAnonymousID:${String(i0++).padStart(32, '0')}` }); assert.equal(r.status, 200); assert.equal(r.body.due, false); assert.equal(r.body.verified, false); assert.equal(zs.get('push:trial:due')!.has(t), false, '가짜 체험은 대상에 못 들어간다'); }
    // (2) 고객 ID 없음·형식 틀림 → 400 (RC 를 부르지 않는다)
    const tokG = 'g'.repeat(64); reg(tokG);
    const nCalls = rcCalls.length;
    r = await post({ ...body(tokG), rcUid: undefined }); assert.equal(r.status, 400); fresh(tokG);
    r = await post({ ...body(tokG), rcUid: 'bad id!' }); assert.equal(r.status, 400); fresh(tokG);
    assert.equal(rcCalls.length, nCalls);
    // (3) RC 장애 → 503 stored:false(넣지 않음 · 기기가 다음에 다시)
    rc.set(uidOf(tokG), rcTrial(T + 30 * H)); rcDown = true;
    r = await post(body(tokG)); assert.equal(r.status, 503); assert.equal(r.body.stored, false); assert.equal(zs.get('push:trial:due')!.has(tokG), false); fresh(tokG);
    rcDown = false;
    // (4) 기기가 만료 시각을 거짓으로 보내도 RC 값으로 넣는다 · 갱신 켠 RC 체험이면 대상 아님
    r = await post(body(tokG, { expiresAt: T + 13 * H })); assert.equal(r.body.due, true); assert.equal(zs.get('push:trial:due')!.get(tokG), T + 30 * H); fresh(tokG);
    assert.equal(JSON.parse(kv.get(`push:trial:${tokG}`)!).verified, true);
    rc.set(uidOf(tokG), rcTrial(T + 30 * H, false));
    r = await post(body(tokG)); assert.equal(r.body.due, false); assert.equal(zs.get('push:trial:due')!.has(tokG), false); fresh(tokG);
    // (5) 안드 기기가 애플 체험을 보고 → 대상 아님
    rc.set(uidOf(tokG), rcTrial(T + 30 * H));
    r = await post(body(tokG, { platform: 'android' })); assert.equal(r.body.due, false); fresh(tokG);
    // (6) RC 고객 하나 = 토큰 하나 — 같은 고객을 다른 토큰으로 보고하면 옛 토큰이 빠진다
    r = await post(body(tokG)); assert.equal(r.body.due, true); fresh(tokG);
    const tokH = 'h'.repeat(64); reg(tokH);
    r = await post({ ...body(tokH), rcUid: uidOf(tokG) }); assert.equal(r.body.due, true);
    assert.equal(zs.get('push:trial:due')!.has(tokG), false, '옛 토큰은 대상에서 빠진다'); assert.equal(zs.get('push:trial:due')!.has(tokH), true);
    // (6a) 토큰이 다른 고객에게 넘어간 뒤 옛 고객이 새 토큰으로 보고해도, 새 고객의 기록은 지우지 않는다(관문 11121018 ②)
    const tokX = 'x'.repeat(64), tokY = 'y'.repeat(64), uidA = '$RCAnonymousID:' + 'a1'.repeat(16), uidB = '$RCAnonymousID:' + 'b2'.repeat(16);
    reg(tokX); reg(tokY); rc.set(uidA, rcTrial(T + 40 * H)); rc.set(uidB, rcTrial(T + 41 * H));
    r = await post({ ...body(tokX), rcUid: uidA }); assert.equal(r.body.due, true); fresh(tokX);
    r = await post({ ...body(tokX), rcUid: uidB }); assert.equal(r.body.due, true); fresh(tokX);
    r = await post({ ...body(tokY), rcUid: uidA }); assert.equal(r.body.due, true);
    assert.equal(zs.get('push:trial:due')!.get(tokX), T + 41 * H, 'B 의 X 기록이 남는다'); assert.ok(kv.has(`push:trial:${tokX}`));
    assert.equal(zs.get('push:trial:due')!.has(tokY), true);
    // 동시 경합 흉내: A 의 옛 토큰 정리가 «주인 확인»을 하기 직전에 B 가 그 토큰의 주인이 됐다 → A 는 지우지 못한다
    const { TRIAL_PUSH_OWNER_KEY, TRIAL_PUSH_UID_KEY, trialUidHash: uh0 } = await import('../src/lib/push/trialVerify');
    assert.equal(kv.get(TRIAL_PUSH_OWNER_KEY(tokX)), uh0(uidB));
    kv.set(TRIAL_PUSH_UID_KEY(uh0(uidA)), tokX); fresh(tokY);
    r = await post({ ...body(tokY), rcUid: uidA }); assert.equal(r.body.due, true);
    assert.ok(zs.get('push:trial:due')!.has(tokX), '주인이 B 인 X 는 A 가 지우지 못한다');
    // (6b) 같은 RC 고객 보고가 처리 중이면(잠금) 429 — 고객당 한 토큰 규칙을 동시 요청으로 깨지 못한다(관문 11121015 ②)
    const lockKey = [...kv.keys()].find((k) => k.startsWith('push:trial:uidlock:'));
    assert.equal(lockKey, undefined, '끝나면 잠금을 푼다');
    const { trialUidHash } = await import('../src/lib/push/trialVerify');
    kv.set(`push:trial:uidlock:${trialUidHash(uidOf(tokG))}`, 'other');
    const tokK = 'k'.repeat(64); reg(tokK);
    r = await post({ ...body(tokK), rcUid: uidOf(tokG) }); assert.equal(r.status, 429); assert.equal(zs.get('push:trial:due')!.has(tokK), false);
    assert.equal(kv.get(`push:trial:uidlock:${trialUidHash(uidOf(tokG))}`), 'other', '남의 잠금은 지우지 않는다');
    kv.delete(`push:trial:uidlock:${trialUidHash(uidOf(tokG))}`);
    // (7) 갱신 켬 보고(빼기)는 RC 확인 없이 받는다
    const before7 = rcCalls.length; fresh(tokH);
    r = await post(body(tokH, { willRenew: true })); assert.equal(r.body.due, false); assert.equal(rcCalls.length, before7); assert.equal(zs.get('push:trial:due')!.has(tokH), false);
    // (8) 크론: 확인 표식 없는 기록 — 확인 도입(TRIAL_PUSH_VERIFY_SINCE) 뒤 시각이면 안 보낸다 · 그 전(옛 API 의 실제 체험자)은 보낸다
    const { TRIAL_PUSH_VERIFY_SINCE } = await import('../src/lib/push/trialPush');
    const tokI = 'i'.repeat(64), tokJ = 'j'.repeat(64), tokL = 'l'.repeat(64); reg(tokI, { createdAt: '2026-10-01T00:00:00.000Z' }); reg(tokJ, { createdAt: '2026-10-01T00:00:00.000Z' }); reg(tokL, { createdAt: '2026-11-11T06:00:00.000Z' });
    const legacy = (t: string, at: number) => { kv.set(`push:trial:${t}`, JSON.stringify({ token: t, platform: 'ios', locale: 'ko', expiresAt: T + 40 * H, willRenew: false, periodType: 'TRIAL', store: 'APP_STORE', at })); zs.get('push:trial:due')!.set(t, T + 40 * H); };
    legacy(tokI, Math.max(TRIAL_PUSH_VERIFY_SINCE, T - 7 * H) + 1);
    legacy(tokJ, TRIAL_PUSH_VERIFY_SINCE - 7 * H);
    legacy(tokL, TRIAL_PUSH_VERIFY_SINCE - 7 * H);
    const sentBefore = sent.length;
    d = await run('?dry=1');
    assert.ok((d.skipped.unverified ?? 0) >= 1, '확인 뒤에 쓰인 미확인 기록은 건너뛴다');
    res = await run();
    assert.ok(sent.slice(sentBefore).some((x) => x.token === tokJ), '확인 도입 전 기록은 보낸다');
    assert.equal(sent.slice(sentBefore).some((x) => x.token === tokI), false);
    assert.equal(sent.slice(sentBefore).some((x) => x.token === tokL), false, '체험 API 뒤 새로 등록된 토큰의 옛 기록은 보내지 않는다');
    // (9) IP 예산 — 한 IP 가 10분에 30번 넘게 RC 확인을 부르면 429
    let limited = 0;
    for (let i = 0; i < 40; i++) { const t = `ip${i}`.padEnd(64, 'y'); reg(t); const q = await report(new Request('http://x/api/push/trial', { method: 'POST', body: JSON.stringify({ ...body(t), rcUid: `$RCAnonymousID:${String(1000 + i).padStart(32, '0')}` }), headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' } }) as never); if (q.status === 429) limited++; }
    assert.ok(limited >= 9, `IP 예산 초과는 429 (${limited})`);
    console.log('trialPushRoutes: report API and D-2 cron end-to-end (memory Redis) passed');
  } finally { Date.now = realNow; }
}
main().catch((e) => { console.error(e); process.exit(1); });
