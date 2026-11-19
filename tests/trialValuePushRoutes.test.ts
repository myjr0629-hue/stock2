/** Offline: npx tsx tests/trialValuePushRoutes.test.ts — 체험 중 가치 알림(3일째·6일째)을 보고 API → 크론까지 메모리 Redis·가짜 RC·가짜 발송기로 끝까지 (2026-11-19) */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { MEMORY_IMPL } from '../src/lib/push/trialPushLua';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

// ── 메모리 Redis(쓰는 명령만 — tests/trialPushRoutes 와 같은 흉내) ──
const kv = new Map<string, string>();
const zs = new Map<string, Map<string, number>>();
const fake = {
  get: async (k: string) => (kv.has(k) ? kv.get(k)! : null),
  set: async (k: string, v: string, o?: { nx?: boolean; ex?: number }) => { if (o?.nx && kv.has(k)) return null; kv.set(k, String(v)); return 'OK'; },
  del: async (...ks: string[]) => { ks.forEach((k) => kv.delete(k)); return ks.length; },
  mget: async (...ks: string[]) => ks.map((k) => (kv.has(k) ? kv.get(k)! : null)),
  incr: async (k: string) => { const n = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(n)); return n; },
  expire: async () => 1,
  eval: async (script: string, keys: string[], args: string[]) => {
    const impl = MEMORY_IMPL.get(script);
    assert.ok(impl, 'unknown Lua script');
    return impl!({ kv, zs }, keys, args);
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
process.env.NEXT_PUBLIC_RC_IOS_KEY = 'appl_test'; process.env.NEXT_PUBLIC_RC_ANDROID_KEY = 'goog_test';
const rc = new Map<string, unknown>();
let rcDown = false;
const rcCalls: string[] = [];
let onRc: ((id: string) => void) | null = null;
(globalThis as any).fetch = async (url: string) => {
  const id = decodeURIComponent(String(url).split('/subscribers/')[1] ?? '');
  rcCalls.push(id);
  onRc?.(id);
  if (rcDown) return { ok: false, status: 503, json: async () => ({}) };
  const body = rc.get(id) ?? { subscriber: { entitlements: {}, subscriptions: {} } };
  return { ok: true, status: 200, json: async () => body };
};
const H = 3600_000, D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();
/** RC 체험 — 시작·만료·갱신 끔 여부 */
const rcTrial = (startedAt: number, expiresAt: number, off = false, store = 'app_store') => ({ subscriber: {
  entitlements: { pro: { product_identifier: 'com.signumhq.app.pro.monthly', expires_date: iso(expiresAt), purchase_date: iso(startedAt) } },
  subscriptions: { 'com.signumhq.app.pro.monthly': { period_type: 'trial', store, purchase_date: iso(startedAt), expires_date: iso(expiresAt), unsubscribe_detected_at: off ? iso(startedAt + H) : null, billing_issues_detected_at: null, ownership_type: 'PURCHASED' } },
} });
const uidOf = (t: string) => '$RCAnonymousID:' + t.charCodeAt(0).toString(16).padStart(2, '0').repeat(16);
const sent: any[] = [];
mock('../src/lib/push/sendSignal', { sendSignalPushes: async (items: any[]) => { sent.push(...items); return new Map(items.map((i) => [i.id, 'ok'])); } });
const reg = (t: string, extra: Record<string, unknown> = {}) => kv.set(`push:tokens:${t}`, JSON.stringify({ token: t, platform: 'ios', app: 'signum', locale: 'ko', preferences: { enabled: true, morning: true, closing: true }, tz: 'UTC', notifPerm: true, ...extra }));

async function main() {
  const report = (await import('../src/app/api/push/trial/route')).POST;
  const cron = (await import('../src/app/api/cron/trial-push/route')).GET;
  const { TRIAL_VALUE_ZSET, TRIAL_VALUE_OFF_KEY, TRIAL_PUSH_LAST_UID_KEY, TRIAL_VALUE_SENT_UID_KEY } = await import('../src/lib/push/trialValuePush');
  const { trialUidHash } = await import('../src/lib/push/trialVerify');
  const post = async (body: unknown) => { const r = await report(new Request('http://x/api/push/trial', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) as never); return { status: r.status, body: await r.json() }; };
  const run = async (q = '') => { const r = await cron(new Request(`http://x/api/cron/trial-push${q}`)); return r.json(); };
  const realNow = Date.now;
  const base = new Date(); base.setUTCHours(12, 0, 0, 0);
  const T = base.getTime();
  Date.now = () => T;
  const fresh = (t: string) => kv.delete(`push:trial:rl:${t}`);
  const age = (t: string) => { const rec = JSON.parse(kv.get(`push:trial:${t}`)!); rec.at = T - 7 * H; kv.set(`push:trial:${t}`, JSON.stringify(rec)); };
  const body = (t: string, c: Record<string, unknown> = {}) => ({ token: t, rcUid: uidOf(t), platform: 'ios', locale: 'ko', expiresAt: T + 4 * D, willRenew: true, periodType: 'TRIAL', store: 'APP_STORE', ...c });
  try {
    // (1) 갱신 켠 7일 체험(3일째)을 RC 고객 ID 와 함께 보고 → 확인된 기록 · 가치 목록에 들어가고 D-2 목록엔 없다
    const tokA = 'a'.repeat(64); reg(tokA, { watchlist: { t: ['NVDA'], at: iso(T) } });
    rc.set(uidOf(tokA), rcTrial(T - 2.5 * D, T + 4.5 * D));
    let r = await post(body(tokA));
    assert.equal(r.status, 200); assert.equal(r.body.stored, true); assert.equal(r.body.due, false); assert.equal(r.body.verified, true);
    const recA = JSON.parse(kv.get(`push:trial:${tokA}`)!);
    assert.equal(recA.verified, true); assert.equal(recA.startedAt, T - 2.5 * D, 'RC 시작 시각'); assert.equal(recA.expiresAt, T + 4.5 * D, 'RC 만료 시각(기기 값 아님)');
    assert.equal(zs.get(TRIAL_VALUE_ZSET)!.get(tokA), T + 4.5 * D);
    assert.equal(zs.get('push:trial:due')?.has(tokA) ?? false, false, '갱신 켬 → D-2 대상 아님');
    // 방금 열었다 → 미룸
    let d = await run('?dry=1');
    assert.equal(d.value.on, true); assert.equal(d.value.send, 0); assert.equal(d.value.skipped.recent_open, 1);
    age(tokA);
    d = await run('?dry=1');
    assert.equal(d.value.send, 1); assert.equal(d.valuePreview[0].step, 'd3'); assert.equal(d.valuePreview[0].variant, 'd3'); assert.equal(d.valuePreview[0].dayOfTrial, 3);
    assert.match(d.valuePreview[0].title, /^NVDA,/);
    assert.equal(sent.length, 0, '드라이런은 보내지 않는다'); assert.equal([...kv.keys()].some((k) => k.startsWith('push:trial:v:')), false, '드라이런은 표식을 안 쓴다');
    // 실제 회차 → 1통(type trial_value · v d3 · 내 종목 화면)
    let res = await run();
    assert.equal(res.value.sent, 1); assert.equal(res.value.sentByStep.d3, 1); assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].data, { type: 'trial_value', v: 'd3', path: '/app-view/watchlist' });
    assert.equal(sent[0].thread, 'trial_value');
    // 다음 회차 → 다시 안 보낸다
    res = await run(); assert.equal(res.value.sent, 0); assert.equal(sent.length, 1);
    const statsKey = [...kv.keys()].find((k) => k.startsWith('push:stats:trial:'))!;
    assert.equal(JSON.parse(kv.get(statsKey)!).v_sent_d3, 1);

    // (2) 6일째(남은 36시간) — 갱신 켬이면 가치 알림(장 마감 리포트) · 3일째 표식과 별개
    {
      const tokB = 'b'.repeat(64); reg(tokB);
      rc.set(uidOf(tokB), rcTrial(T - 5.5 * D, T + 1.5 * D));
      r = await post(body(tokB)); assert.equal(r.body.verified, true); age(tokB);
      const before = sent.length;
      res = await run();
      const got = sent.slice(before);
      assert.equal(got.length, 1); assert.equal(got[0].data.v, 'd6'); assert.equal(got[0].data.path, '/app-view/intel?tab=report'); assert.equal(got[0].title, '미국 장 마감 리포트');
    }

    // (3) 갱신 끈 7일 체험 6일째(남은 36시간) → D-2 사실 알림만, 가치 알림은 양보(같은 날 두 통 금지)
    {
      const tokC = 'c'.repeat(64); reg(tokC);
      rc.set(uidOf(tokC), rcTrial(T - 5.5 * D, T + 1.5 * D, true));
      r = await post(body(tokC, { willRenew: false })); assert.equal(r.body.due, true); age(tokC);
      assert.ok(zs.get(TRIAL_VALUE_ZSET)!.has(tokC), '갱신 끈 체험도 가치 목록에(3일째용)');
      const before = sent.length;
      res = await run();
      const got = sent.slice(before);
      assert.deepEqual(got.map((x) => x.data.type), ['trial_end'], 'D-2 한 통만');
      assert.equal(res.value.skipped.d2_overlap, 1);
      assert.ok(kv.has(TRIAL_PUSH_LAST_UID_KEY(trialUidHash(uidOf(tokC)))), 'D-2 도 «최근 체험 알림» 표식을 남긴다');
    }

    // (3b) 가치 알림을 20시간 안에 받은 고객은 D-2 도 다음 회차로(하루 두 통 금지 — 관문 11192141 ②)
    {
      const tokD = 'd'.repeat(64); reg(tokD);
      rc.set(uidOf(tokD), rcTrial(T - 5.5 * D, T + 1.5 * D, true));
      r = await post(body(tokD, { willRenew: false })); assert.equal(r.body.due, true); age(tokD);
      kv.set(TRIAL_PUSH_LAST_UID_KEY(trialUidHash(uidOf(tokD))), '1');
      const before = sent.length;
      res = await run();
      assert.equal(sent.slice(before).some((x) => x.token === tokD), false, '최근 체험 알림 → D-2 미룸');
      assert.ok((res.skipped.recent_push ?? 0) >= 1);
      kv.delete(TRIAL_PUSH_LAST_UID_KEY(trialUidHash(uidOf(tokD))));
      res = await run();
      assert.deepEqual(sent.slice(before).filter((x) => x.token === tokD).map((x) => x.data.type), ['trial_end'], '표식이 풀리면 D-2 를 보낸다');
    }

    // (3c) 겹친 회차 흉내: D-2 후보로 고른 «뒤»(자리 잡기 직전)에 다른 회차가 가치 알림 표식을 세웠다 → D-2 자리 잡기가 원자적으로 막는다(관문 11192147)
    {
      const { CLAIM_GAP_LUA, MEMORY_IMPL: MI } = await import('../src/lib/push/trialPushLua');
      const { TRIAL_PUSH_UID_KEY, TRIAL_PUSH_OWNER_KEY } = await import('../src/lib/push/trialVerify');
      const tokZ = 'z'.repeat(64), uh = trialUidHash(uidOf(tokZ));
      kv.set(TRIAL_PUSH_UID_KEY(uh), 't:' + tokZ); kv.set(TRIAL_PUSH_OWNER_KEY(tokZ), uh); kv.set(TRIAL_PUSH_LAST_UID_KEY(uh), '1');
      const keys = ['zs1', 'zs2', TRIAL_PUSH_UID_KEY(uh), TRIAL_PUSH_OWNER_KEY(tokZ), TRIAL_PUSH_LAST_UID_KEY(uh)];
      assert.equal(MI.get(CLAIM_GAP_LUA)!({ kv, zs }, keys, ['t:' + tokZ, '1', '60', uh, '60']), -2);
      assert.equal(kv.has('zs1') || kv.has('zs2'), false, '막히면 보냄 표식을 세우지 않는다');
      kv.delete(TRIAL_PUSH_LAST_UID_KEY(uh));
      assert.equal(MI.get(CLAIM_GAP_LUA)!({ kv, zs }, keys, ['t:' + tokZ, '1', '60', uh, '60']), 1);
      assert.ok(kv.has(TRIAL_PUSH_LAST_UID_KEY(uh)), '잡으면 최근 표식도 세운다');
      assert.equal(MI.get(CLAIM_GAP_LUA)!({ kv, zs }, keys, ['t:' + tokZ, '1', '60', uh, '60']), 0, '두 번째는 이미 보냄');
    }

    // (4) 1개월 코드 체험(30일): 3일째엔 안 가고 7일째에 간다 · 최근 체험 알림(20시간) 있으면 미룸
    {
      const tokE = 'e'.repeat(64); reg(tokE, { platform: 'android', notifPerm: undefined }); // 안드: 권한 보고 없으면 보낸다
      rc.set(uidOf(tokE), rcTrial(T - 2.5 * D, T + 27.5 * D, false, 'play_store'));
      r = await post(body(tokE, { platform: 'android', store: 'PLAY_STORE' })); assert.equal(r.body.verified, true); age(tokE);
      d = await run('?dry=1'); assert.equal(d.valuePreview.some((p: any) => p.platform === 'android'), false, '코드 체험 3일째는 창 밖');
      rc.set(uidOf(tokE), rcTrial(T - 6.5 * D, T + 23.5 * D, false, 'play_store')); fresh(tokE);
      r = await post(body(tokE, { platform: 'android', store: 'PLAY_STORE' })); age(tokE);
      kv.set(TRIAL_PUSH_LAST_UID_KEY(trialUidHash(uidOf(tokE))), '1');
      d = await run('?dry=1'); assert.equal(d.valuePreview.some((p: any) => p.platform === 'android'), false, '최근 체험 알림 → 미룸');
      kv.delete(TRIAL_PUSH_LAST_UID_KEY(trialUidHash(uidOf(tokE))));
      const before = sent.length;
      res = await run();
      const got = sent.slice(before);
      assert.equal(got.length, 1); assert.equal(got[0].platform, 'android'); assert.equal(got[0].data.v, 'd3b', '내 종목 없음 → AI 브리핑');
      assert.ok(kv.has(TRIAL_VALUE_SENT_UID_KEY('d3', trialUidHash(uidOf(tokE)))));
    }

    // (5) iOS 권한 «허용» 보고 없는 기기 → 안 보냄(4.5.4) · 알림 끔 → 안 보냄
    {
      const tokF = 'f'.repeat(64), tokG = 'g'.repeat(64);
      reg(tokF, { notifPerm: undefined }); reg(tokG, { preferences: { enabled: false } });
      for (const t of [tokF, tokG]) { rc.set(uidOf(t), rcTrial(T - 2.5 * D, T + 4.5 * D)); r = await post(body(t)); age(t); }
      d = await run('?dry=1');
      assert.equal(d.value.skipped.no_permission, 1); assert.equal(d.value.skipped.muted, 1); assert.equal(d.value.send, 0);
    }

    // (6) 한 고객이 토큰을 바꿨다 → 지금 토큰에만 · 옛 토큰은 걷는다
    {
      const tokH = 'h'.repeat(64), tokI = 'i'.repeat(64); reg(tokH); reg(tokI);
      rc.set(uidOf(tokH), rcTrial(T - 2.5 * D, T + 4.5 * D));
      r = await post(body(tokH)); age(tokH);
      r = await post({ ...body(tokI), rcUid: uidOf(tokH) }); age(tokI);
      // 옛 토큰 정리가 실패한 흉내 — H 의 기록·주인을 되살린다
      const recI = JSON.parse(kv.get(`push:trial:${tokI}`)!);
      kv.set(`push:trial:${tokH}`, JSON.stringify({ ...recI, token: tokH })); kv.set(`push:trial:owner:${tokH}`, trialUidHash(uidOf(tokH)));
      const before = sent.length;
      res = await run();
      assert.deepEqual(sent.slice(before).map((x) => x.token), [tokI], '고객의 지금 토큰에만');
      assert.equal(zs.get(TRIAL_VALUE_ZSET)!.has(tokH), false, '옛 토큰은 가치 목록에서 걷는다');
    }

    // (7) 끄기 스위치 — ?valueOff=1 이면 가치 알림이 돌지 않는다(D-2 는 그대로) · ?valueOff=0 으로 다시 · ?value=0 은 한 회차만
    {
      let s = await run('?valueOff=1'); assert.equal(s.valueOff, true); assert.equal(kv.get(TRIAL_VALUE_OFF_KEY), '1');
      const tokJ = 'j'.repeat(64); reg(tokJ);
      rc.set(uidOf(tokJ), rcTrial(T - 2.5 * D, T + 4.5 * D));
      r = await post(body(tokJ)); age(tokJ);
      d = await run('?dry=1'); assert.equal(d.value.on, false);
      res = await run(); assert.equal(res.value.on, false); assert.equal(sent.some((x) => x.token === tokJ), false);
      kv.set(TRIAL_VALUE_OFF_KEY, 1 as unknown as string);   // Upstash 가 숫자로 돌려줘도 꺼짐
      res = await run(); assert.equal(res.value.on, false);
      s = await run('?valueOff=0'); assert.equal(s.valueOff, false); assert.equal(kv.has(TRIAL_VALUE_OFF_KEY), false);
      d = await run('?dry=1&value=0'); assert.equal(d.value.on, false);
      res = await run(); assert.equal(res.value.on, true); assert.ok(sent.some((x) => x.token === tokJ), '켜면 다시 보낸다');
    }

    // (8) 갱신 켬 보고: RC 장애·잠금이어도 D-2 대상에서는 뺀다(빼는 보고는 확인과 무관) · stored:false 로 다음 진입에 다시
    {
      const tokK = 'k'.repeat(64); reg(tokK);
      rc.set(uidOf(tokK), rcTrial(T - 5 * D, T + 2 * D - H, true));
      r = await post(body(tokK, { willRenew: false })); assert.equal(r.body.due, true); fresh(tokK);
      // RC 를 부르는 «순간»에는 이미 D-2 대상에서 빠져 있어야 한다(RC 응답을 기다리는 사이 크론이 옛 대상에 보내지 않게 — 관문 11192141 ①)
      let dueAtRc: boolean | null = null;
      onRc = () => { dueAtRc = zs.get('push:trial:due')!.has(tokK); };
      r = await post(body(tokK, { willRenew: true })); onRc = null;
      assert.equal(dueAtRc, false, 'RC 호출 전에 뺐다'); assert.equal(r.body.verified, true); fresh(tokK);
      r = await post(body(tokK, { willRenew: false })); assert.equal(r.body.due, true); fresh(tokK);
      rcDown = true;
      r = await post(body(tokK, { willRenew: true }));
      assert.equal(r.status, 200); assert.equal(r.body.stored, false); assert.equal(r.body.due, false);
      assert.equal(zs.get('push:trial:due')!.has(tokK), false, 'RC 장애여도 빠진다');
      assert.equal(JSON.parse(kv.get(`push:trial:${tokK}`)!).verified, undefined, '확인 안 된 기록 → 가치 알림도 안 감');
      rcDown = false; fresh(tokK);
      r = await post(body(tokK, { willRenew: false })); assert.equal(r.body.due, true); fresh(tokK);
      kv.set(`push:trial:uidlock:${trialUidHash(uidOf(tokK))}`, 'other');
      r = await post(body(tokK, { willRenew: true }));
      assert.equal(r.status, 200); assert.equal(r.body.stored, false); assert.equal(zs.get('push:trial:due')!.has(tokK), false, '잠금 중이어도 빠진다');
      kv.delete(`push:trial:uidlock:${trialUidHash(uidOf(tokK))}`); fresh(tokK);
      // RC 가 «갱신 끔»이라 해도 기기가 «갱신 켬»이면 D-2 대상에 넣지 않는다(예전과 같은 결과)
      r = await post(body(tokK, { willRenew: true })); assert.equal(r.body.verified, true); assert.equal(r.body.due, false);
      assert.equal(JSON.parse(kv.get(`push:trial:${tokK}`)!).willRenew, true);
      // 고객 ID 없는 갱신 켬 보고(옛 앱) → 예전처럼 확인 없이 빼고 stored:true
      fresh(tokK); const n = rcCalls.length;
      r = await post({ ...body(tokK), rcUid: undefined }); assert.equal(r.body.stored, true); assert.equal(rcCalls.length, n, 'ID 없으면 RC 를 부르지 않는다');
    }

    // (9) 지난 만료는 목록에서 걷힌다 · 확인 안 된 기록은 목록에 있어도 안 보낸다
    {
      zs.get(TRIAL_VALUE_ZSET)!.set('old'.padEnd(64, 'o'), T - 1);
      const tokL = 'l'.repeat(64); reg(tokL);
      kv.set(`push:trial:${tokL}`, JSON.stringify({ token: tokL, platform: 'ios', locale: 'ko', expiresAt: T + 4.5 * D, startedAt: T - 2.5 * D, willRenew: true, periodType: 'TRIAL', store: 'APP_STORE', at: T - 7 * H }));
      zs.get(TRIAL_VALUE_ZSET)!.set(tokL, T + 4.5 * D);
      d = await run('?dry=1'); assert.ok((d.value.skipped.unverified ?? 0) >= 1);
      res = await run();
      assert.equal(zs.get(TRIAL_VALUE_ZSET)!.has('old'.padEnd(64, 'o')), false);
      assert.equal(sent.some((x) => x.token === tokL), false);
    }
    console.log('trialValuePushRoutes: report API → value pushes (d3/d6, code trial, D-2 overlap, kill switch, superseded) passed');
  } finally { Date.now = realNow; }
}
main().catch((e) => { console.error(e); process.exit(1); });
