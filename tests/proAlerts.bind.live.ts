/**
 * PRO 가격 알림 기기 묶음 Lua — 실제 Upstash 에서 재현·수리 확인(야간 검토 11/13 ①). 비밀값은 출력하지 않는다.
 *   시험 키 하나(push:pro-alerts:v1:uid:utest-bind-<무작위>, 120초 TTL)만 쓰고 끝나면 지운다. 실사용자 키는 건드리지 않는다.
 * 실행: UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… node -r ts-node/register/transpile-only -r tsconfig-paths/register tests/proAlerts.bind.live.ts
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { PA_BIND_LUA, PA_CFG, PA_KEYS, PA_LIMITS, bindCutoff } from '../src/lib/proAlerts/core';

/** 수리 전 문안(b7d612c30) — 재현용 */
const OLD_LUA = `
if redis.call('ZSCORE', KEYS[1], ARGV[1]) then
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1]); redis.call('EXPIRE', KEYS[1], ARGV[4]); return 1
end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1]); redis.call('EXPIRE', KEYS[1], ARGV[4]); return 1`;

(async () => {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) { console.log('건너뜀 — Upstash 환경변수 없음'); return; }
    const r = new Redis({ url, token });
    const key = PA_KEYS.uidDevs(`utest-bind-${randomBytes(6).toString('hex')}`);
    const now = Date.now();
    const old = now - (PA_CFG.recordTtlSec + 86400) * 1000;   // 31일 전 마지막 저장
    const seed = async () => {
        await r.del(key);
        // 옛 기기 4대(31일 전) + 지금도 쓰는 기기 1대 = 상한 5
        for (let i = 0; i < PA_LIMITS.devicesPerUid - 1; i++) await r.zadd(key, { score: old, member: `dold${i}` });
        await r.zadd(key, { score: now - 60_000, member: 'dlive' });
        await r.expire(key, 120);
    };
    const argv = (dev: string) => [dev, String(now), String(PA_LIMITS.devicesPerUid), '120', String(bindCutoff(now))];
    try {
        await seed();
        // 쓰는 기기 동기화(집합 TTL 갱신) — 옛 문안으로는 새 기기가 계속 막힌다
        assert.equal(Number(await r.eval(OLD_LUA, [key], argv('dlive'))), 1);
        assert.equal(Number(await r.eval(OLD_LUA, [key], argv('dnew'))), 0, '재현: 옛 문안 = 새 기기 거절(device_limit)');
        console.log('  ✓ 재현 — 수리 전: 30일 지난 기기 4대 + 쓰는 기기 1대면 새 기기 거절');

        await seed();
        assert.equal(Number(await r.eval(PA_BIND_LUA, [key], argv('dlive'))), 1);
        assert.equal(await r.zcard(key), 1, '옛 점수 4개를 걷는다');
        assert.equal(Number(await r.eval(PA_BIND_LUA, [key], argv('dnew'))), 1, '새 기기 묶임');
        console.log('  ✓ 수리 — 옛 점수를 걷고 새 기기 묶임');

        // 상한은 그대로 — 살아 있는 기기 5대면 6번째는 거절, 남을 밀어내지 않는다
        await r.del(key);
        for (let i = 0; i < PA_LIMITS.devicesPerUid; i++) await r.zadd(key, { score: now - i * 1000, member: `dl${i}` });
        await r.expire(key, 120);
        assert.equal(Number(await r.eval(PA_BIND_LUA, [key], argv('dsix'))), 0, '살아 있는 5대 → 거절');
        assert.equal(await r.zcard(key), PA_LIMITS.devicesPerUid);
        assert.equal(Number(await r.eval(PA_BIND_LUA, [key], argv('dl3'))), 1, '이미 묶인 기기는 갱신');
        // 경계 — 기준 시각(30일 + 10분 여유) 이하는 걷고, 그보다 1초 늦으면 남긴다
        await r.del(key);
        await r.zadd(key, { score: bindCutoff(now), member: 'dedge' }, { score: bindCutoff(now) + 1000, member: 'dkeep' });
        await r.expire(key, 120);
        await r.eval(PA_BIND_LUA, [key], argv('dkeep'));
        assert.deepEqual((await r.zrange(key, 0, -1)).sort(), ['dkeep']);
        console.log('  ✓ 상한 5대·밀어내기 없음·30일 경계 그대로');
        console.log('\n4개 통과(실제 Upstash Lua)');
    } finally {
        await r.del(key);
    }
})().catch((e) => { console.error(e); process.exit(1); });
