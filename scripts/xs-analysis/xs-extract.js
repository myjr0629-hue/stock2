require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
(async () => {
  const t0 = Date.now();
  // 1) XS rows 2026-07-06..2026-08-31 (dated rows only)
  let lastKey, rows = [], pages = 0, states = 0;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: 'signum-xs-history', FilterExpression: '#d BETWEEN :a AND :b', ExpressionAttributeNames: { '#d': 'date', '#c': 'close', '#r': 'raw' }, ExpressionAttributeValues: { ':a': '2026-07-06', ':b': '2026-08-31' }, ProjectionExpression: 'ticker, #d, xsScore, #c, mcap, z, #r, res, ver', ExclusiveStartKey: lastKey }));
    for (const it of r.Items || []) { if (it.ticker === '_REPORT_' || it.ticker === '_WEIGHTS_') continue; rows.push({ t: it.ticker, d: it.date, xs: it.xsScore, c: it.close, m: it.mcap, z: it.z, raw: it.raw, res: it.res, v: it.ver }); }
    lastKey = r.LastEvaluatedKey; pages++;
  } while (lastKey);
  // patch: projection alias for close
  fs.writeFileSync('/tmp/ego/xs-data.json', JSON.stringify(rows));
  const dates = [...new Set(rows.map(x => x.d))].sort();
  console.log('XS rows', rows.length, 'pages', pages, 'dates', dates.length, dates[0], '→', dates[dates.length - 1], 'tickers', new Set(rows.map(x => x.t)).size, 'withClose', rows.filter(x => x.c > 0).length, 'withZ', rows.filter(x => x.z).length, (Date.now() - t0) / 1000 + 's');
  // 2) V8 alphaScore rows same window from signum-alpha-history
  let lk2, v8 = [], p2 = 0;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: 'signum-alpha-history', FilterExpression: '#d BETWEEN :a AND :b', ExpressionAttributeNames: { '#d': 'date', '#c': 'close' }, ExpressionAttributeValues: { ':a': '2026-07-06', ':b': '2026-09-04' }, ProjectionExpression: 'ticker, #d, alphaScore, #c, engineVersion', ExclusiveStartKey: lk2 }));
    for (const it of r.Items || []) { if (typeof it.date !== 'string' || it.date.includes(':')) continue; v8.push({ t: it.ticker, d: it.date, a: it.alphaScore, c: it.close, v: it.engineVersion || '' }); }
    lk2 = r.LastEvaluatedKey; p2++;
  } while (lk2);
  fs.writeFileSync('/tmp/ego/v8-data.json', JSON.stringify(v8));
  const d2 = [...new Set(v8.map(x => x.d))].sort();
  console.log('V8 rows', v8.length, 'pages', p2, 'dates', d2.length, d2[0], '→', d2[d2.length - 1], 'withScore', v8.filter(x => typeof x.a === 'number').length, 'withClose', v8.filter(x => x.c > 0).length, 'versions', JSON.stringify(Object.entries(v8.reduce((m, x) => (m[x.v] = (m[x.v] || 0) + 1, m), {})).slice(0, 6)), (Date.now() - t0) / 1000 + 's');
})().catch(e => console.log('ERR', e.name, e.message.slice(0, 160)));
