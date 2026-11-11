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
  zadd: async (k: string, m: { score: number; member: string }) => { (zs.get(k) ?? zs.set(k, new Map()).get(k)!).set(m.member, m.score); return 1; },
  zrem: async (k: string, member: string) => { zs.get(k)?.delete(member); return 1; },
  zremrangebyscore: async (k: string, min: number, max: number) => { const z = zs.get(k); if (z) for (const [m, s] of z) if (s >= min && s <= max) z.delete(m); return 0; },
  zrange: async (k: string, min: number, max: number, o: { offset?: number; count?: number }) => {
    const all = [...(zs.get(k) ?? new Map()).entries()].filter(([, s]) => s >= min && s <= max).sort((a, b) => a[1] - b[1]).map(([m]) => m);
    return all.slice(o.offset ?? 0, (o.offset ?? 0) + (o.count ?? all.length));
  },
};
mock('@upstash/redis', { Redis: { fromEnv: () => fake } });
const sent: any[] = [];
let outcome: 'ok' | 'fail' | 'dead' = 'ok';
mock('../src/lib/push/sendSignal', { sendSignalPushes: async (items: any[]) => { sent.push(...items); return new Map(items.map((i) => [i.id, outcome])); } });

const H = 3600_000;
const tokA = 'a'.repeat(64), tokB = 'b'.repeat(64), tokC = 'c'.repeat(64);
const reg = (t: string, extra: Record<string, unknown> = {}) => kv.set(`push:tokens:${t}`, JSON.stringify({ token: t, platform: 'ios', app: 'signum', locale: 'ko', preferences: { enabled: true, morning: true, closing: true }, tz: 'UTC', ...extra }));

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
    const body = (t: string, c: Record<string, unknown> = {}) => ({ token: t, platform: 'ios', locale: 'ko', expiresAt: T + 40 * H, willRenew: false, periodType: 'TRIAL', store: 'APP_STORE', ...c });
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
    const tokD = 'd'.repeat(64); reg(tokD);
    await post(body(tokD)); kv.delete(`push:trial:rl:${tokD}`);
    assert.ok(zs.get('push:trial:due')!.has(tokD));
    await post(body(tokD, { willRenew: true })); kv.delete(`push:trial:rl:${tokD}`);
    assert.equal(zs.get('push:trial:due')!.has(tokD), false);
    await post(body(tokD)); kv.delete(`push:trial:rl:${tokD}`);
    r = await post({ token: tokD, clear: true }); assert.equal(r.body.stored, true);
    assert.equal(zs.get('push:trial:due')!.has(tokD), false); assert.equal(kv.has(`push:trial:${tokD}`), false);
    // 일시 실패 → 자리를 놓아 다음 회차에 다시 · 하루 시도 상한
    const tokE = 'e'.repeat(64); reg(tokE);
    await post(body(tokE));
    { const rec = JSON.parse(kv.get(`push:trial:${tokE}`)!); rec.at = T - 7 * H; kv.set(`push:trial:${tokE}`, JSON.stringify(rec)); }
    outcome = 'fail';
    res = await run(); assert.equal(res.failed, 1); assert.equal(kv.has(`push:trial:sent:${tokE}`), false);
    outcome = 'ok';
    res = await run(); assert.equal(res.sent, 1);
    const dayKey = [...kv.keys()].find((k) => k.startsWith('push:trial:day:'))!;
    assert.equal(Number(kv.get(dayKey)), 4, '하루 시도 수 = 2 + 실패 1 + 재시도 1');
    kv.set(dayKey, '300');
    const tokF = 'f'.repeat(64); reg(tokF);
    await post(body(tokF));
    { const rec = JSON.parse(kv.get(`push:trial:${tokF}`)!); rec.at = T - 7 * H; kv.set(`push:trial:${tokF}`, JSON.stringify(rec)); }
    res = await run(); assert.equal(res.sent, 0); assert.equal(res.skipped.day_cap, 1); assert.equal(kv.has(`push:trial:sent:${tokF}`), false, '상한이면 자리를 놓는다');
    // 통계
    assert.ok([...kv.keys()].some((k) => k.startsWith('push:stats:trial:')));
    console.log('trialPushRoutes: report API and D-2 cron end-to-end (memory Redis) passed');
  } finally { Date.now = realNow; }
}
main().catch((e) => { console.error(e); process.exit(1); });
