// ElastiCache 실측 — `node scripts/elasticache-metrics.js [일수=14]`
// 클러스터 목록 + 일별 Evictions·CurrItems·메모리%·적중/미스·GET/SET·CPU (CloudWatch, 추측 금지)
const fs = require('fs');
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }
const { ElastiCacheClient, DescribeCacheClustersCommand } = require('@aws-sdk/client-elasticache');
const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const region = process.env.AWS_REGION || 'us-east-1';
(async () => {
    const days = parseInt(process.argv[2] || '14', 10);
    const ec = new ElastiCacheClient({ region });
    const { CacheClusters } = await ec.send(new DescribeCacheClustersCommand({ ShowCacheNodeInfo: true }));
    for (const c of CacheClusters) console.log(`클러스터 ${c.CacheClusterId} · ${c.CacheNodeType} · ${c.Engine} ${c.EngineVersion} · 노드 ${c.NumCacheNodes} · ${c.CacheClusterStatus} · 파라미터그룹 ${c.CacheParameterGroup?.CacheParameterGroupName}`);
    const cw = new CloudWatchClient({ region });
    const metrics = [['Evictions', 'Sum'], ['CurrItems', 'Maximum'], ['DatabaseMemoryUsagePercentage', 'Maximum'], ['BytesUsedForCache', 'Maximum'], ['CacheHits', 'Sum'], ['CacheMisses', 'Sum'], ['GetTypeCmds', 'Sum'], ['SetTypeCmds', 'Sum'], ['EngineCPUUtilization', 'Maximum'], ['NetworkBytesOut', 'Sum'], ['CurrConnections', 'Maximum']];
    const end = new Date(); const start = new Date(end.getTime() - days * 86400 * 1000);
    for (const c of CacheClusters) {
        const q = metrics.map(([m, stat], i) => ({ Id: `m${i}`, MetricStat: { Metric: { Namespace: 'AWS/ElastiCache', MetricName: m, Dimensions: [{ Name: 'CacheClusterId', Value: c.CacheClusterId }] }, Period: 86400, Stat: stat } }));
        const r = await cw.send(new GetMetricDataCommand({ MetricDataQueries: q, StartTime: start, EndTime: end, ScanBy: 'TimestampAscending' }));
        const byDay = {};
        for (const res of r.MetricDataResults) { const [m] = metrics[parseInt(res.Id.slice(1), 10)]; res.Timestamps.forEach((t, i) => { const d = new Date(t).toISOString().slice(0, 10); (byDay[d] ||= {})[m] = res.Values[i]; }); }
        console.log(`\n[${c.CacheClusterId}] 일별 (UTC) — 최근 ${days}일`);
        console.log('날짜        Evict  CurrItems  Mem%   MB    Hits       Misses     GET        SET        CPU%  NetOutMB Conn');
        for (const d of Object.keys(byDay).sort()) { const v = byDay[d]; const f = (x, w, dp = 0) => String(x == null ? '-' : Number(x).toFixed(dp)).padStart(w);
            console.log(`${d} ${f(v.Evictions, 6)} ${f(v.CurrItems, 10)} ${f(v.DatabaseMemoryUsagePercentage, 5, 1)} ${f(v.BytesUsedForCache / 1048576, 5)} ${f(v.CacheHits, 10)} ${f(v.CacheMisses, 10)} ${f(v.GetTypeCmds, 10)} ${f(v.SetTypeCmds, 10)} ${f(v.EngineCPUUtilization, 5, 1)} ${f(v.NetworkBytesOut / 1048576, 8)} ${f(v.CurrConnections, 4)}`); }
    }
})().catch((e) => { console.error('실패:', e.name, e.message); process.exit(1); });
