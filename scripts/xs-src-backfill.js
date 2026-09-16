#!/usr/bin/env node
// ============================================================================
// xs-src-backfill — seed the XS source adapter's own `_SRC_` cache rows
// (market cap + 200-session close ring) for the whole live universe in one go.
//
// Why: the daily Lambda caps its Intrinio usage (400 market caps + 300 SMA
// seeds per run, paced at 300/min) so it never competes with the flow-harvest
// shards. Cold, that would take ~7 runs to reach full SMA coverage. Run this
// once from a laptop while the market is closed (flow-harvest idles, the
// 2,000/min contract is free) and the first Lambda run is already steady-state.
//
// Writes ONLY {ticker, date:'_SRC_'} rows in signum-xs-history (own store).
// Nothing else is touched — no scores, no state, no Redis.
//
// Run:  node scripts/xs-src-backfill.js            (rate 900/min by default here)
//       XS_INTRINIO_RATE_PER_MIN=300 node scripts/xs-src-backfill.js
// Credentials: AWS from .env.local; INTRINIO/UPSTASH pulled from the signum-xs
// Lambda env via the SDK (ACCESS-RUNBOOK: keys live in Lambda env, not locally).
// ============================================================================
const fs = require('fs');
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.XS_INTRINIO_RATE_PER_MIN) process.env.XS_INTRINIO_RATE_PER_MIN = '900';

const { LambdaClient, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const REGION = 'us-east-1';
const TABLE = 'signum-xs-history';
const MCAP_MIN = 3e8;

(async () => {
    const creds = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
    const cfg = await new LambdaClient({ region: REGION, credentials: creds }).send(new GetFunctionConfigurationCommand({ FunctionName: 'signum-xs' }));
    for (const k of ['INTRINIO_API_KEY', 'INTRINIO_BASE_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
        if (!process.env[k] && cfg.Environment?.Variables?.[k]) process.env[k] = cfg.Environment.Variables[k];
    }
    // the adapter reads its env at require time — load it only now
    const { buildSourceSnapshots } = require('./lambda-xs/source-adapter');
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION, credentials: creds }), { marshallOptions: { removeUndefinedValues: true } });

    const today = new Date().toISOString().slice(0, 10);
    const t0 = Date.now();
    const src = await buildSourceSnapshots({ ddb, table: TABLE, today, staleCutoff: Date.now() - 4 * 86400000, mcapMin: MCAP_MIN, seedAll: true });
    console.log(`[backfill] snapshots ${src.snaps.size} · coverage ${JSON.stringify(src.coverage)} · rows to write ${src.srcWrites.length}`);

    let written = 0;
    for (let i = 0; i < src.srcWrites.length; i += 25) {
        let req = { RequestItems: { [TABLE]: src.srcWrites.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) } };
        for (let attempt = 0; attempt < 6; attempt++) {
            const res = await ddb.send(new BatchWriteCommand(req));
            const un = res.UnprocessedItems?.[TABLE];
            written += req.RequestItems[TABLE].length - (un?.length || 0);
            if (!un || !un.length) break;
            req = { RequestItems: { [TABLE]: un } };
            await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
    }
    console.log(`[backfill] wrote ${written} _SRC_ rows in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})().catch((e) => { console.error('[backfill] FAILED:', e); process.exit(1); });
