/** 미호출 선점 해제의 실제 Upstash REST 명령을 검사한다. 외부 통신 없음. */
import assert from 'node:assert/strict';
process.env.UPSTASH_REDIS_REST_URL = 'https://fixture.upstash.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fixture-placeholder';
const values = new Map<string, string>();
let calls = 0;
(globalThis as any).fetch = async (url: any, init: any) => {
    assert.equal(new URL(String(url)).hostname, 'fixture.upstash.invalid');
    const body = JSON.parse(init.body);
    const pipeline = Array.isArray(body[0]);
    const [command, script, keyCount, key, owner] = pipeline ? body[0] : body;
    assert.equal(command.toLowerCase(), 'eval'); // 별도 GET→DEL 경합을 허용하지 않는다.
    assert.equal(keyCount, 1);
    assert.equal(script, 'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end');
    calls++;
    const match = values.get(key) === owner;
    if (match) values.delete(key);
    return new Response(JSON.stringify(pipeline ? [{ result: match ? 1 : 0 }] : { result: match ? 1 : 0 }), { status: 200 });
};
(async () => {
    const meter = await import('../src/lib/intrinioMeter');
    meter.__resetMeterRedisForTest();
    values.set('claim', 'owner-a');
    await meter.releaseMeterClaim('claim', 'owner-a');
    assert.equal(values.has('claim'), false);
    console.log('  ✓ 자기 선점은 EVAL 1회로 해제');
    values.set('claim', 'owner-b');
    await meter.releaseMeterClaim('claim', 'owner-a');
    assert.equal(values.get('claim'), 'owner-b');
    console.log('  ✓ 만료 후 다른 요청이 얻은 선점은 보존');
    await meter.releaseMeterClaim('absent', 'owner-a');
    assert.equal(values.has('absent'), false);
    assert.equal(calls, 3);
    console.log('  ✓ 없는 선점 해제는 무효');
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    meter.__resetMeterRedisForTest();
    await meter.releaseMeterClaim('claim', 'owner-b');
    assert.equal(calls, 3);
    console.log('  ✓ 저장소 설정 없음은 외부 호출 0회');
    console.log('4 passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
