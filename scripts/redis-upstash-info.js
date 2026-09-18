// Upstash INFO 실측 스냅샷 — `node scripts/redis-upstash-info.js [라벨]` → /tmp/redis-info-<라벨>.json
// (명령 수·적중/미스·키 수·메모리·네트워크 바이트 — 전후 비교용, 추측 금지)
const fs = require('fs');
for (const f of ['.env.local', '.env', '.env.production', '/tmp/vercel-prod.env']) {
    if (!fs.existsSync(f)) continue;
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }
}
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (!url || !token) { console.error('Upstash 자격 없음 — `npx vercel env pull /tmp/vercel-prod.env --environment=production` 뒤 재실행'); process.exit(2); }
(async () => {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(['INFO']) });
    const txt = (await r.json()).result || '';
    const kv = {}; for (const line of txt.split('\n')) { const m = line.trim().match(/^([a-z_0-9]+):(.*)$/); if (m) kv[m[1]] = m[2]; }
    const pick = ['total_commands_processed', 'total_reads_processed', 'total_writes_processed', 'keyspace_hits', 'keyspace_misses', 'total_keys', 'expired_keys', 'evicted_keys', 'used_memory_human', 'total_data_size_human', 'max_data_size_human', 'maxmemory_policy', 'instantaneous_ops_per_sec', 'max_ops_per_sec', 'redis_mode', 'cluster_enabled', 'local_member', 'primary_member', 'all_members', 'db0'];
    const out = { ts: new Date().toISOString(), epoch: Date.now() };
    for (const k of pick) out[k] = kv[k];
    const label = process.argv[2] || 'now';
    fs.writeFileSync(`/tmp/redis-info-${label}.json`, JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
})();
