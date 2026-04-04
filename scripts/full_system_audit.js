// ═══════════════════════════════════════════════════════════════════
// SIGNUM HQ 전수 실사 스크립트 — Redis + DynamoDB + API 실데이터 비교
// ═══════════════════════════════════════════════════════════════════
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config({ path: '.env.local' });

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1', credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }}),
  { marshallOptions: { removeUndefinedValues: true } }
);

// Redis via Upstash REST
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    if (data.result) return JSON.parse(data.result);
    return null;
  } catch { return null; }
}

async function redisKeys(pattern) {
  try {
    const res = await fetch(`${REDIS_URL}/keys/${encodeURIComponent(pattern)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    return data.result || [];
  } catch { return []; }
}

const TICKERS = ['TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN'];
const output = [];
function log(msg) { output.push(msg); console.log(msg); }

async function main() {
  log('═══════════════════════════════════════════════════════════');
  log('SIGNUM HQ 전수 실사 — ' + new Date().toISOString());
  log('═══════════════════════════════════════════════════════════');

  // ─── 1. Redis 키 현황 ───
  log('\n═══ 1. REDIS 키 패턴별 현황 ═══');
  const patterns = [
    'cache:analysis:*',
    'cache:command:unified:*',
    'cache:command:overview:*',
    'cache:flow:unified:*',
    'guardian:morning_briefing:*',
    'guardian:snapshot:*',
    'macro:*',
    'yahoo:*',
  ];
  for (const p of patterns) {
    const keys = await redisKeys(p);
    log(`${p.padEnd(35)} → ${keys.length} keys`);
    if (keys.length > 0 && keys.length <= 5) {
      log(`  samples: ${keys.join(', ')}`);
    }
  }

  // ─── 2. TSLA 3-Way 비교: Redis analysis vs Redis command vs DynamoDB ───
  log('\n═══ 2. TSLA 3-WAY 데이터 비교 ═══');
  
  // 2a. Redis cache:analysis:TSLA (warm-analysis가 쓴 것)
  const analysisData = await redisGet('cache:analysis:TSLA');
  log('\n--- cache:analysis:TSLA (warm-analysis → Dashboard/Watchlist용) ---');
  if (analysisData) {
    log(`  timestamp: ${analysisData.timestamp} (${new Date(analysisData.timestamp).toISOString()})`);
    log(`  age: ${Math.round((Date.now() - analysisData.timestamp) / 60000)}분 전`);
    log(`  expiration: ${analysisData.expiration}`);
    log(`  netGex: ${analysisData.gex} (${analysisData.gexM}M)`);
    log(`  maxPain: ${analysisData.maxPain}`);
    log(`  callWall: ${analysisData.callWall}`);
    log(`  putFloor: ${analysisData.putFloor}`);
    log(`  gammaFlipLevel: ${analysisData.gammaFlipLevel}`);
    log(`  pcr: ${analysisData.pcr}`);
    log(`  iv: ${analysisData.iv}`);
    log(`  squeezeScore: ${analysisData.squeezeScore}`);
    log(`  whaleIndex: ${analysisData.whaleIndex}`);
    log(`  darkPoolPct: ${analysisData.darkPoolPct}`);
    log(`  netPremium: ${analysisData.netPremium}`);
    log(`  ivSkew: ${analysisData.ivSkew}`);
    log(`  impliedMovePct: ${analysisData.impliedMovePct}`);
    log(`  rsi: ${analysisData.rsi}`);
    log(`  relVol: ${analysisData.relVol}`);
    log(`  alpha.score: ${analysisData.alphaSnapshot?.score}`);
    log(`  alpha.grade: ${analysisData.alphaSnapshot?.grade}`);
  } else {
    log('  ❌ 데이터 없음! (warm-analysis 작동 안 함)');
  }

  // 2b. Redis cache:command:unified:TSLA (warm-command가 DynamoDB에서 복사한 것)
  const commandData = await redisGet('cache:command:unified:TSLA');
  log('\n--- cache:command:unified:TSLA (Lambda→DynamoDB→warm-command→Command용) ---');
  if (commandData) {
    const s = commandData.structure || commandData.data?.structure;
    log(`  timestamp: ${commandData.timestamp} (${new Date(commandData.timestamp).toISOString()})`);
    log(`  age: ${Math.round((Date.now() - commandData.timestamp) / 60000)}분 전`);
    log(`  top-keys: ${Object.keys(commandData).sort().join(', ')}`);
    if (s) {
      log(`  structure.expiration: ${s.expiration}`);
      log(`  structure.netGex: ${s.netGex}`);
      log(`  structure.maxPain: ${s.maxPain}`);
      log(`  structure.callWall: ${s.callWall || 'N/A (check levels)'}`);
      log(`  structure.putFloor: ${s.putFloor || 'N/A (check levels)'}`);
      log(`  structure.gammaFlipLevel: ${s.gammaFlipLevel}`);
      log(`  structure.levels: ${JSON.stringify(s.levels)}`);
      log(`  structure.pcRatio: ${s.pcRatio}`);
      log(`  structure.atmIv: ${s.atmIv}`);
    }
    if (commandData.squeeze) log(`  squeeze: ${JSON.stringify(commandData.squeeze).substring(0,100)}`);
    if (commandData.volatility) {
      const v = commandData.volatility;
      log(`  volatility.regime: ${v.regime} (score: ${v.regimeScore})`);
      log(`  volatility.flipLevel: ${v.flipLevel}`);
    }
  } else {
    log('  ❌ 데이터 없음!');
  }

  // 2c. DynamoDB signum-unified-cache TSLA
  const dynamoRes = await client.send(new GetCommand({
    TableName: 'signum-unified-cache', Key: { pk: 'TSLA' }
  }));
  log('\n--- DynamoDB signum-unified-cache TSLA (Lambda v7 원본) ---');
  if (dynamoRes.Item) {
    const d = dynamoRes.Item;
    log(`  updatedAt: ${d.updatedAt}`);
    log(`  age: ${Math.round((Date.now() - d.timestamp) / 60000)}분 전`);
    log(`  version: ${d.version}`);
    log(`  fieldCount: ${d.fieldCount}`);
    const s = d.data?.structure;
    if (s) {
      log(`  data.structure.expiration: ${s.expiration}`);
      log(`  data.structure.netGex: ${s.netGex}`);
      log(`  data.structure.maxPain: ${s.maxPain}`);
      log(`  data.structure.underlyingPrice: ${s.underlyingPrice}`);
      log(`  data.structure.gammaFlipLevel: ${s.gammaFlipLevel}`);
      log(`  data.structure.pcRatio: ${s.pcRatio}`);
      log(`  data.structure.totalCallOI: ${s.totalCallOI}`);
      log(`  data.structure.totalPutOI: ${s.totalPutOI}`);
      log(`  data.structure.levels: ${JSON.stringify(s.levels)}`);
      log(`  data.structure.options_status: ${s.options_status}`);
    }
    // Check all data sub-fields
    if (d.data) {
      const subFields = Object.keys(d.data).sort();
      log(`  data sub-fields: ${subFields.join(', ')}`);
      for (const f of ['analyst','fundamentals','earnings','sma','related','squeeze','institutional','volatility']) {
        const v = d.data[f];
        if (v) log(`  data.${f}: EXISTS (${Object.keys(v).length} keys)`);
        else log(`  data.${f}: MISSING`);
      }
    }
  }

  // ─── 3. Redis cache:flow:unified 확인 ───
  log('\n═══ 3. FLOW 데이터 확인 ═══');
  const flowData = await redisGet('cache:flow:unified:TSLA');
  if (flowData) {
    log(`flow Redis TSLA: EXISTS`);
    log(`  keys: ${Object.keys(flowData).join(', ')}`);
    log(`  age: ${Math.round((Date.now() - flowData.timestamp) / 60000)}분 전`);
    log(`  _source: ${flowData._source}`);
  } else {
    log('flow Redis TSLA: ❌ 없음 (warm-flow 비활성 확인)');
  }

  // ─── 4. 7종목 cache:analysis 존재 여부 + 나이 ───
  log('\n═══ 4. 주요 7종목 cache:analysis 상태 ═══');
  for (const t of TICKERS) {
    const d = await redisGet(`cache:analysis:${t}`);
    if (d) {
      const ageMin = Math.round((Date.now() - d.timestamp) / 60000);
      log(`${t.padEnd(6)}: ✅ age=${ageMin}min exp=${d.expiration||'NULL'} GEX=${d.gexM}M CW=${d.callWall||'NULL'} PF=${d.putFloor||'NULL'} MP=${d.maxPain} SQ=${d.squeezeScore} IV=${d.iv}`);
    } else {
      log(`${t.padEnd(6)}: ❌ 없음`);
    }
  }

  // ─── 5. 7종목 cache:command:unified 상태 ───
  log('\n═══ 5. 주요 7종목 cache:command:unified 상태 ═══');
  for (const t of TICKERS) {
    const d = await redisGet(`cache:command:unified:${t}`);
    if (d) {
      const ageMin = Math.round((Date.now() - d.timestamp) / 60000);
      const s = d.structure || d.data?.structure;
      log(`${t.padEnd(6)}: ✅ age=${ageMin}min exp=${s?.expiration||'NULL'} GEX=${s?.netGex ? (s.netGex/1e6).toFixed(1)+'M' : 'N/A'} levels=${JSON.stringify(s?.levels||{})} MP=${s?.maxPain}`);
    } else {
      log(`${t.padEnd(6)}: ❌ 없음`);
    }
  }

  // ─── 6. DynamoDB 7종목 확인 ───
  log('\n═══ 6. DynamoDB 7종목 unified-cache 상태 ═══');
  for (const t of TICKERS) {
    const res = await client.send(new GetCommand({
      TableName: 'signum-unified-cache', Key: { pk: t }
    }));
    if (res.Item) {
      const s = res.Item.data?.structure;
      const ageMin = Math.round((Date.now() - res.Item.timestamp) / 60000);
      log(`${t.padEnd(6)}: ✅ age=${ageMin}min exp=${s?.expiration||'NULL'} GEX=${s?.netGex?(s.netGex/1e6).toFixed(1)+'M':'N/A'} levels=${JSON.stringify(s?.levels||{})} MP=${s?.maxPain}`);
    } else {
      log(`${t.padEnd(6)}: ❌ 없음`);
    }
  }

  // ─── 7. cache:analysis 총 종목 수 ───
  log('\n═══ 7. cache:analysis 총 커버리지 ═══');
  const allAnalysis = await redisKeys('cache:analysis:*');
  log(`cache:analysis:* : ${allAnalysis.length}종목 캐시됨`);
  
  const allCommand = await redisKeys('cache:command:unified:*');
  log(`cache:command:unified:* : ${allCommand.length}종목 캐시됨`);

  const allFlow = await redisKeys('cache:flow:unified:*');
  log(`cache:flow:unified:* : ${allFlow.length}종목 캐시됨`);

  // ─── 8. 프로덕션 API 호출 테스트 ───
  log('\n═══ 8. 프로덕션 API 응답 확인 ═══');
  const PROD = 'https://signumhq.com';
  const apis = [
    '/api/dashboard/unified?ticker=TSLA',
    '/api/command/unified?ticker=TSLA',
    '/api/live/ticker?t=TSLA',
    '/api/live/options/structure?ticker=TSLA',
  ];
  for (const api of apis) {
    try {
      const start = Date.now();
      const res = await fetch(`${PROD}${api}`, { 
        headers: { 'User-Agent': 'SIGNUM-AUDIT/1.0' },
        signal: AbortSignal.timeout(15000)
      });
      const ms = Date.now() - start;
      if (res.ok) {
        const data = await res.json();
        const keys = Object.keys(data).slice(0, 8).join(',');
        log(`${api.padEnd(50)} → ${res.status} ${ms}ms keys=[${keys}]`);
        
        // structure 관련 데이터 추출
        if (api.includes('structure')) {
          log(`  structureService 직접응답:`);
          log(`    expiration: ${data.expiration}`);
          log(`    netGex: ${data.netGex}`);
          log(`    maxPain: ${data.maxPain}`);
          log(`    callWall: ${data.callWall || data.levels?.callWall}`);
          log(`    putFloor: ${data.putFloor || data.levels?.putFloor}`);
          log(`    gammaFlipLevel: ${data.gammaFlipLevel}`);
          log(`    pcRatio: ${data.pcRatio}`);
          log(`    atmIv: ${data.atmIv}`);
          log(`    squeezeScore: ${data.squeezeScore}`);
          log(`    levels: ${JSON.stringify(data.levels)}`);
        }
        if (api.includes('dashboard/unified')) {
          log(`  dashboard 응답 structure 관련:`);
          log(`    expiration: ${data.expiration}`);
          log(`    gex: ${data.gex} (${data.gexM}M)`);
          log(`    maxPain: ${data.maxPain}`);
          log(`    callWall: ${data.callWall}`);
          log(`    putFloor: ${data.putFloor}`);
        }
        if (api.includes('command/unified')) {
          const cs = data.structure;
          if (cs) {
            log(`  command structure:`);
            log(`    expiration: ${cs.expiration}`);
            log(`    netGex: ${cs.netGex}`);
            log(`    maxPain: ${cs.maxPain}`);
            log(`    levels: ${JSON.stringify(cs.levels)}`);
            log(`    gammaFlipLevel: ${cs.gammaFlipLevel}`);
          }
        }
      } else {
        log(`${api.padEnd(50)} → ${res.status} ${ms}ms ❌`);
      }
    } catch (e) {
      log(`${api.padEnd(50)} → ERROR: ${e.message}`);
    }
  }

  // ─── 9. Universe 파일 크기 비교 ───
  log('\n═══ 9. Universe 파일 비교 ═══');
  const fs = require('fs');
  const path = require('path');
  const universeFiles = ['stock_universe_us300.json', 'universe_500.json', 'stock_universe_us800.json'];
  for (const f of universeFiles) {
    const fp = path.join(process.cwd(), 'data', f);
    if (fs.existsSync(fp)) {
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      log(`${f.padEnd(30)} → ${data.symbols?.length || 0} tickers`);
    } else {
      log(`${f.padEnd(30)} → 파일 없음`);
    }
  }
  // lib/universe.ts
  const uniTs = fs.readFileSync(path.join(process.cwd(), 'src/lib/universe.ts'), 'utf-8');
  const uniCount = (uniTs.match(/"/g) || []).length / 2;
  log(`lib/universe.ts UNIVERSE_500    → ~${Math.round(uniCount)} tickers (warm-command 사용)`);

  // Lambda v7 GEX_TICKERS count
  const lambdaCode = fs.readFileSync(path.join(process.cwd(), 'scripts/deploy-lambda-v7.js'), 'utf-8');
  const gexMatch = lambdaCode.match(/const GEX_TICKERS = \[([\s\S]*?)\];/);
  if (gexMatch) {
    const gexCount = (gexMatch[1].match(/'/g) || []).length / 2;
    log(`Lambda GEX_TICKERS             → ~${Math.round(gexCount)} tickers (GEX 계산 대상)`);
  }

  // ─── 10. DynamoDB unified-cache 전체 스캔 (구조 필드 존재율) ───
  log('\n═══ 10. DynamoDB unified-cache 전체 구조 분석 ═══');
  let hasStructure = 0, hasExpiration = 0, hasVolatility = 0, hasSqueeze = 0;
  let totalItems = 0;
  let lastKey = undefined;
  do {
    const params = {
      TableName: 'signum-unified-cache',
      ProjectionExpression: 'pk, #d',
      ExpressionAttributeNames: { '#d': 'data' },
      Limit: 100,
    };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await client.send(new ScanCommand(params));
    for (const item of res.Items || []) {
      if (item.pk?.includes(':overview')) continue; // overview records 제외
      totalItems++;
      const s = item.data?.structure;
      if (s && Object.keys(s).length > 0) hasStructure++;
      if (s?.expiration) hasExpiration++;
      if (item.data?.volatility) hasVolatility++;
      if (item.data?.squeeze) hasSqueeze++;
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  log(`총 레코드 (overview 제외): ${totalItems}`);
  log(`structure 있음: ${hasStructure}/${totalItems} (${Math.round(hasStructure/totalItems*100)}%)`);
  log(`expiration 있음: ${hasExpiration}/${totalItems} (${Math.round(hasExpiration/totalItems*100)}%)`);
  log(`volatility 있음: ${hasVolatility}/${totalItems} (${Math.round(hasVolatility/totalItems*100)}%)`);
  log(`squeeze 있음: ${hasSqueeze}/${totalItems} (${Math.round(hasSqueeze/totalItems*100)}%)`);

  // Save output
  fs.writeFileSync('scripts/full_audit_result.txt', output.join('\n'), 'utf-8');
  log('\n✅ 결과 저장: scripts/full_audit_result.txt');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
