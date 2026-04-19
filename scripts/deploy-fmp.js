/**
 * Deploy signum-fmp Lambda v1.0
 * 
 * FMP 데이터 전용 Lambda — signum-harvest와 완전 독립
 * 
 * 수집 항목:
 *   - Analyst Grades (grades-consensus)
 *   - Price Target (price-target-consensus)
 *   - Forward Estimates (analyst-estimates) → forwardEps/Revenue
 *   - Earnings Calendar (earnings-calendar) → nextDate/epsEstimate
 *   - Revision 계산 (전일 대비 EPS/Revenue 변동)
 * 
 * 저장:
 *   - DynamoDB signum-pattern-db: ANALYST:{ticker}, EARNINGS:{ticker}
 * 
 * 스케줄:
 *   - EventBridge: 평일 09:30 ET (1일 1회)
 * 
 * Usage: node scripts/deploy-fmp.js
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  AddPermissionCommand,
} = require('@aws-sdk/client-lambda');
const {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
} = require('@aws-sdk/client-eventbridge');

const REGION = 'us-east-1';
const FUNCTION_NAME = 'signum-fmp';
const RULE_NAME = 'signum-fmp-daily';
const FMP_API_KEY = process.env.FMP_API_KEY || '';

if (!FMP_API_KEY) {
  console.error('ERROR: FMP_API_KEY not set in .env.local');
  process.exit(1);
}

// Load universe (same source as signum-harvest)
const universeFile = path.join(__dirname, '..', 'data', 'stock_universe_us800.json');
const universe = JSON.parse(fs.readFileSync(universeFile, 'utf-8')).symbols;
console.log('Universe:', universe.length, 'tickers');

// ── Lambda Handler Code ──
const handlerCode = `
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

const FMP_KEY = process.env.FMP_API_KEY || '';
const UNIVERSE = ${JSON.stringify(universe)};
const TABLE = 'signum-pattern-db';

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs || 15000);
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-FMP/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', (e) => { clearTimeout(to); reject(e); });
  });
}

exports.handler = async (event) => {
  const start = Date.now();
  const forceRun = event?.forceRun || false;
  const today = new Date().toISOString().slice(0, 10);

  // Market hours check (skip weekends + non-market hours unless forceRun)
  if (!forceRun) {
    const now = new Date();
    const day = now.getUTCDay();
    if (day === 0 || day === 6) {
      console.log('Weekend — skipping');
      return { statusCode: 200, body: JSON.stringify({ success: true, skipped: 'weekend' }) };
    }
  }

  if (!FMP_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'FMP_API_KEY not configured' }) };
  }

  console.log('signum-fmp v1.0 — ' + UNIVERSE.length + ' tickers, forceRun=' + forceRun);
  const results = { analyst: 0, earnings: 0, forward: 0 };

  // ═══════════════════════════════════════════
  // Step 1: FMP Analyst Grades + Price Target + Forward Estimates + Earnings Surprise
  // 4 parallel API calls per ticker, batch 5, sleep 3s
  // Rate: 200 req/min (67% of 300 limit)
  // ═══════════════════════════════════════════
  const forwardMap = {};  // ticker → { eps, revenue, year }
  const surpriseMap = {}; // ticker → { actualEps, estimatedEps, surpriseEps, surprisePct, date }

  console.log('Step 1: FMP 4-API collection for ' + UNIVERSE.length + ' tickers...');
  for (let i = 0; i < UNIVERSE.length; i += 5) {
    const batch = UNIVERSE.slice(i, i + 5);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const [gradeData, targetData, forwardData, surpriseData] = await Promise.all([
          httpsGet('https://financialmodelingprep.com/stable/grades-consensus?symbol=' + ticker + '&apikey=' + FMP_KEY, 5000).catch(() => null),
          httpsGet('https://financialmodelingprep.com/stable/price-target-consensus?symbol=' + ticker + '&apikey=' + FMP_KEY, 5000).catch(() => null),
          httpsGet('https://financialmodelingprep.com/stable/analyst-estimates?symbol=' + ticker + '&period=annual&apikey=' + FMP_KEY, 5000).catch(() => null),
          httpsGet('https://financialmodelingprep.com/api/v3/earnings-surprises/' + ticker + '?apikey=' + FMP_KEY, 5000).catch(() => null)
        ]);

        // ── Analyst Grade ──
        const grade = Array.isArray(gradeData) ? gradeData[0] : gradeData;

        // ── Price Target ──
        let priceTarget = null;
        if (Array.isArray(targetData) && targetData.length > 0) {
          const t = targetData[0];
          if (t.targetConsensus && t.targetHigh) {
            priceTarget = { targetHigh: t.targetHigh, targetLow: t.targetLow, targetConsensus: t.targetConsensus };
          }
        }

        // ── Forward Estimates ──
        if (Array.isArray(forwardData)) {
          const currentYearStr = new Date().toISOString().slice(0, 4);
          const nextYearData = [...forwardData].reverse().find(f => f.date && f.date.slice(0, 4) > currentYearStr);
          if (nextYearData && nextYearData.epsAvg !== undefined && nextYearData.revenueAvg) {
            forwardMap[ticker] = { eps: nextYearData.epsAvg, revenue: nextYearData.revenueAvg, year: nextYearData.date.slice(0, 4) };
          }
        }

        // ── Earnings Surprise (most recent quarter) ──
        if (Array.isArray(surpriseData) && surpriseData.length > 0) {
          const s = surpriseData[0];
          if (s.actualEarningResult != null && s.estimatedEarning != null) {
            surpriseMap[ticker] = {
              actualEps: s.actualEarningResult,
              estimatedEps: s.estimatedEarning,
              surpriseEps: Number((s.actualEarningResult - s.estimatedEarning).toFixed(3)),
              surprisePct: s.estimatedEarning !== 0
                ? Number(((s.actualEarningResult - s.estimatedEarning) / Math.abs(s.estimatedEarning) * 100).toFixed(1))
                : 0,
              date: s.date || null
            };
          }
        }

        // ── Save ANALYST record ──
        if (grade && (grade.strongBuy || grade.buy || grade.hold)) {
          const total = (grade.strongBuy || 0) + (grade.buy || 0) + (grade.hold || 0) + (grade.sell || 0) + (grade.strongSell || 0);
          const bullishPct = total > 0 ? Math.round(((grade.strongBuy || 0) + (grade.buy || 0)) / total * 100) : 0;
          let consensus = grade.consensus || 'N/A';
          if (consensus === 'N/A' && total > 0) {
            const ws = ((grade.strongBuy || 0) * 5 + (grade.buy || 0) * 4 + (grade.hold || 0) * 3 + (grade.sell || 0) * 2 + (grade.strongSell || 0)) / total;
            consensus = ws >= 4.3 ? 'STRONG BUY' : ws >= 3.5 ? 'BUY' : ws >= 2.5 ? 'HOLD' : ws >= 1.7 ? 'SELL' : 'STRONG SELL';
          }
          const breakdown = { strongBuy: grade.strongBuy || 0, buy: grade.buy || 0, hold: grade.hold || 0, sell: grade.sell || 0, strongSell: grade.strongSell || 0 };
          await client.send(new PutCommand({
            TableName: TABLE,
            Item: { pattern: 'ANALYST:' + ticker, timestamp: Date.now(), consensus, totalAnalysts: total, bullishPct, breakdown, priceTarget }
          }));
          results.analyst++;
        }
      } catch {}
    }));
    // Sleep 3s per batch (5 tickers × 3 APIs = 15 calls) — 225 req/min safe
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('Step 1 done: analyst=' + results.analyst + '/' + UNIVERSE.length + ', forward=' + Object.keys(forwardMap).length + ', surprise=' + Object.keys(surpriseMap).length);

  // ═══════════════════════════════════════════
  // Step 2: FMP Earnings Calendar (1 API call)
  // ═══════════════════════════════════════════
  const earningsMap = {};
  try {
    const toDate = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    const earningsAll = await httpsGet('https://financialmodelingprep.com/stable/earnings-calendar?from=' + today + '&to=' + toDate + '&apikey=' + FMP_KEY, 15000);
    const earningsArr = Array.isArray(earningsAll) ? earningsAll : [];
    const tickerSet = new Set(UNIVERSE);
    for (const e of earningsArr) {
      if (!tickerSet.has(e.symbol)) continue;
      if (!earningsMap[e.symbol] || new Date(e.date) < new Date(earningsMap[e.symbol].date)) {
        earningsMap[e.symbol] = e;
      }
    }
    console.log('Step 2 done: ' + Object.keys(earningsMap).length + ' tickers with upcoming earnings from ' + earningsArr.length + ' events');
  } catch (e) {
    console.log('Step 2 earnings calendar error: ' + e.message);
  }

  // ═══════════════════════════════════════════
  // Step 3: Save EARNINGS records for ALL tickers with forward data
  // This fixes the 830-ticker forwardEps gap:
  //   - earningsMap tickers: get nextDate + epsEstimate + forwardEps/Revenue
  //   - non-earningsMap tickers: get forwardEps/Revenue only (no nextDate)
  // Revision calculation (▲▼) for both groups
  // ═══════════════════════════════════════════
  console.log('Step 3: Saving EARNINGS records (forward + calendar)...');

  // Collect all tickers that need EARNINGS records
  const earningsTickers = new Set([
    ...Object.keys(earningsMap),
    ...Object.keys(forwardMap)
  ]);

  for (const ticker of earningsTickers) {
    try {
      const fw = forwardMap[ticker] || {};
      const cal = earningsMap[ticker] || null;

      // Skip if no data at all
      if (!fw.eps && !cal) continue;

      // Read previous EARNINGS record for revision calculation
      let revisionEps = null, revisionRev = null;
      let revisionDate = null, revRevisionDate = null;
      try {
        const oldRes = await client.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'pattern = :p',
          ExpressionAttributeValues: { ':p': 'EARNINGS:' + ticker },
          Limit: 1, ScanIndexForward: false
        }));
        const oldData = oldRes.Items?.[0];

        // EPS revision
        if (oldData && fw.eps && oldData.forwardEps && Math.abs(fw.eps - oldData.forwardEps) > 0.001) {
          revisionEps = Number((fw.eps - oldData.forwardEps).toFixed(3));
          revisionDate = today;
        } else if (oldData && oldData.forwardEpsRevision != null && oldData.forwardEpsRevisionDate) {
          const ageDays = (new Date(today).getTime() - new Date(oldData.forwardEpsRevisionDate).getTime()) / 86400000;
          if (ageDays <= 4 && fw.eps === oldData.forwardEps) {
            revisionEps = oldData.forwardEpsRevision;
            revisionDate = oldData.forwardEpsRevisionDate;
          }
        }

        // Revenue revision
        if (oldData && fw.revenue && oldData.forwardRevenue && Math.abs(fw.revenue - oldData.forwardRevenue) > 100000) {
          revisionRev = fw.revenue - oldData.forwardRevenue;
          revRevisionDate = today;
        } else if (oldData && oldData.forwardRevRevision != null && oldData.forwardRevRevisionDate) {
          const revAgeDays = (new Date(today).getTime() - new Date(oldData.forwardRevRevisionDate).getTime()) / 86400000;
          if (revAgeDays <= 4 && fw.revenue === oldData.forwardRevenue) {
            revisionRev = oldData.forwardRevRevision;
            revRevisionDate = oldData.forwardRevRevisionDate;
          }
        }
      } catch {}

      // Build EARNINGS record
      const daysUntil = cal ? Math.ceil((new Date(cal.date).getTime() - new Date(today).getTime()) / 86400000) : null;
      const surp = surpriseMap[ticker] || null;
      const item = {
        pattern: 'EARNINGS:' + ticker,
        timestamp: Date.now(),
        // Earnings calendar fields (null if not in calendar)
        nextDate: cal ? cal.date : null,
        daysUntil: daysUntil,
        epsEstimate: cal ? (cal.epsEstimated || null) : null,
        quarter: null,
        year: null,
        hour: cal ? (cal.time || null) : null,
        // Forward fields (from analyst-estimates)
        forwardEps: fw.eps || null,
        forwardRevenue: fw.revenue || null,
        forwardYear: fw.year || null,
        // Revision fields
        forwardEpsRevision: revisionEps,
        forwardEpsRevisionDate: revisionDate,
        forwardRevRevision: revisionRev,
        forwardRevRevisionDate: revRevisionDate,
        // Earnings Surprise (most recent quarter)
        lastSurprise: surp,
      };

      await client.send(new PutCommand({ TableName: TABLE, Item: item })).catch(() => {});
      results.earnings++;
    } catch {}
  }

  results.forward = Object.keys(forwardMap).length;
  console.log('Step 3 done: earnings=' + results.earnings + ' (calendar=' + Object.keys(earningsMap).length + ', forward=' + results.forward + ')');

  const duration = Math.round((Date.now() - start) / 1000);
  console.log('signum-fmp completed in ' + duration + 's');
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, version: '1.0', duration, results })
  };
};
`;

// ── Write Lambda Package ──
const lambdaDir = path.join(__dirname, 'lambda-fmp');
if (!fs.existsSync(lambdaDir)) fs.mkdirSync(lambdaDir, { recursive: true });
fs.writeFileSync(path.join(lambdaDir, 'index.js'), handlerCode);
fs.writeFileSync(path.join(lambdaDir, 'package.json'), JSON.stringify({
  name: 'signum-fmp-lambda', version: '1.0.0',
  dependencies: { '@aws-sdk/client-dynamodb': '^3.0.0', '@aws-sdk/lib-dynamodb': '^3.0.0' }
}, null, 2));

console.log('Installing deps...');
execSync('npm install --production', { cwd: lambdaDir, stdio: 'pipe' });

const zipPath = path.join(__dirname, 'lambda-fmp.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`powershell -command "Compress-Archive -Path '${lambdaDir}\\\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
const zipSize = Math.round(fs.statSync(zipPath).size / 1024 / 1024 * 10) / 10;
console.log('Zip:', zipSize + 'MB');

async function deploy() {
  const lambda = new LambdaClient({ region: REGION });
  const zipBuffer = fs.readFileSync(zipPath);

  // Check if function exists
  let functionExists = false;
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    functionExists = true;
    console.log('Function exists — updating...');
  } catch {
    console.log('Function does not exist — creating...');
  }

  // Detect role ARN from existing signum-harvest
  let roleArn = '';
  try {
    const existing = await lambda.send(new GetFunctionCommand({ FunctionName: 'signum-harvest' }));
    roleArn = existing.Configuration.Role;
    console.log('Using role from signum-harvest:', roleArn);
  } catch {
    console.error('ERROR: Cannot determine Lambda role.');
    process.exit(1);
  }

  const envVars = {
    NODE_ENV: 'production',
    FMP_API_KEY: FMP_API_KEY,
  };

  if (functionExists) {
    await lambda.send(new UpdateFunctionCodeCommand({
      FunctionName: FUNCTION_NAME,
      ZipFile: zipBuffer,
    }));
    console.log('Lambda code updated');
    await new Promise(r => setTimeout(r, 5000));
    await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: FUNCTION_NAME,
      Timeout: 900,      // 15 minutes
      MemorySize: 512,    // 512MB (lightweight — no Polygon/GEX)
      Environment: { Variables: envVars },
    }));
    console.log('Lambda config updated (900s, 512MB)');
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: FUNCTION_NAME,
      Runtime: 'nodejs20.x',
      Handler: 'index.handler',
      Role: roleArn,
      Code: { ZipFile: zipBuffer },
      Timeout: 900,
      MemorySize: 512,
      Environment: { Variables: envVars },
      Description: 'FMP analyst/earnings/forward data — independent from signum-harvest (daily 09:30 ET)',
    }));
    console.log('Lambda function created: ' + FUNCTION_NAME);
    await new Promise(r => setTimeout(r, 5000));
  }

  // ── EventBridge Schedule: weekdays 09:30 ET = 13:30 UTC ──
  console.log('Setting up EventBridge schedule...');
  const eb = new EventBridgeClient({ region: REGION });

  await eb.send(new PutRuleCommand({
    Name: RULE_NAME,
    ScheduleExpression: 'cron(30 13 ? * MON-FRI *)',
    State: 'ENABLED',
    Description: 'Trigger signum-fmp daily at 09:30 ET (13:30 UTC) on weekdays',
  }));
  console.log('EventBridge rule: ' + RULE_NAME + ' (cron 09:30 ET weekdays)');

  const fnInfo = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
  const lambdaArn = fnInfo.Configuration.FunctionArn;

  await eb.send(new PutTargetsCommand({
    Rule: RULE_NAME,
    Targets: [{ Id: FUNCTION_NAME + '-target', Arn: lambdaArn }],
  }));
  console.log('EventBridge target set: ' + lambdaArn);

  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: FUNCTION_NAME,
      StatementId: 'EventBridgeInvoke',
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
      SourceArn: 'arn:aws:events:' + REGION + ':' + lambdaArn.split(':')[4] + ':rule/' + RULE_NAME,
    }));
    console.log('EventBridge invoke permission added');
  } catch (e) {
    if (e.name === 'ResourceConflictException') {
      console.log('EventBridge permission already exists');
    } else {
      console.warn('Permission warning:', e.message);
    }
  }

  console.log('\n✅ Deploy complete!');
  console.log('  Function: ' + FUNCTION_NAME);
  console.log('  Schedule: ' + RULE_NAME + ' (09:30 ET weekdays)');
  console.log('  Tickers: ' + universe.length);
  console.log('  Timeout: 900s, Memory: 512MB');
}

deploy().catch(e => {
  console.error('Deploy error:', e.message);
  process.exit(1);
});
