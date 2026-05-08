// [Admin] System Health Check API — 관리자 전용 인프라 헬스체크
// 모든 체크는 READ-ONLY. 기존 기능에 영향 없음.
// 2026-05-04: Users, Calendar, Data Integrity, Score Accuracy 섹션 추가
import { NextRequest, NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// 주요 대형 종목 샘플 — 이 종목들이 캐시에 있으면 Lambda가 작동 중
const SAMPLE_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'AMD', 'MSFT', 'META', 'AMZN', 'GOOG', 'SPY', 'QQQ',
  'BA', 'JPM', 'V', 'DIS', 'NFLX', 'COIN', 'PLTR', 'SOFI', 'RIVN', 'ARM'];

interface CacheCheckResult {
  ticker: string;
  exists: boolean;
  age?: number;       // seconds since last update
  source?: string;
}

async function checkCacheKeys(prefix: string, tickers: string[]): Promise<{ results: CacheCheckResult[], hitRate: number, avgAge: number, hitCount: number }> {
  const results: CacheCheckResult[] = [];
  let hits = 0;
  let totalAge = 0;
  let ageCount = 0;

  for (const ticker of tickers) {
    const key = `${prefix}${ticker}`;
    try {
      const data = await getFromCache<any>(key);
      if (data) {
        const ts = data.timestamp || data._ts || data.updatedAt;
        const age = ts ? Math.round((Date.now() - (typeof ts === 'number' ? ts : new Date(ts).getTime())) / 1000) : undefined;
        hits++;
        if (age !== undefined && age > 0) { totalAge += age; ageCount++; }
        results.push({ ticker, exists: true, age, source: data._source || data.source || undefined });
      } else {
        results.push({ ticker, exists: false });
      }
    } catch {
      results.push({ ticker, exists: false });
    }
  }

  return {
    results,
    hitRate: Math.round((hits / tickers.length) * 100),
    avgAge: ageCount > 0 ? Math.round(totalAge / ageCount) : -1,
    hitCount: hits,
  };
}

// ElastiCache EC2 Proxy를 통한 직접 조회 (모닝 브리핑 등 ElastiCache에만 쓰는 데이터)
async function checkElastiCache(key: string): Promise<any> {
  try {
    const proxyUrl = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
    const proxyKey = process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${proxyUrl}/get?key=${encodeURIComponent(key)}`, {
      headers: { 'Authorization': `Bearer ${proxyKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data?.result) {
        return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// NYSE 2026 공휴일 목록
const NYSE_HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
];

// ET 현재 시간 + 세션 + 공휴일 + 다음 장 오픈 ETA
function getETInfo() {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
  const etParts = etStr.split(', ');
  const timeParts = (etParts[1] || '0:0:0').split(':');
  const etHour = parseInt(timeParts[0] || '0');
  const etMin = parseInt(timeParts[1] || '0');
  const etSec = parseInt(timeParts[2] || '0');
  const etDate = new Date(etStr);
  const dayOfWeek = etDate.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const etDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const isHoliday = NYSE_HOLIDAYS_2026.includes(etDateStr);
  const etTimeMin = etHour * 60 + etMin;
  const isMarketHours = !isWeekend && !isHoliday && etTimeMin >= 570 && etTimeMin < 960;
  const isPreMarket = !isWeekend && !isHoliday && etTimeMin >= 240 && etTimeMin < 570;
  const isPostMarket = !isWeekend && !isHoliday && etTimeMin >= 960 && etTimeMin < 1200;
  const session = isMarketHours ? 'REG' : isPreMarket ? 'PRE' : isPostMarket ? 'POST' : 'CLOSED';
  const sessionLabel = isMarketHours ? 'MARKET OPEN (정규장)' : isPreMarket ? 'PRE-MARKET (프리마켓)' : isPostMarket ? 'POST-MARKET (애프터마켓)' : isWeekend ? 'WEEKEND (주말)' : isHoliday ? 'HOLIDAY (공휴일)' : 'CLOSED (장 마감)';
  // 다음 장 오픈 ETA (ET 기준 정밀 계산)
  let nextOpenEta = '';
  if (!isMarketHours) {
    if (isPreMarket) {
      // 오늘 9:30 ET까지 남은 시간
      const minsToOpen = 570 - etTimeMin;
      nextOpenEta = `${Math.floor(minsToOpen / 60)}h ${minsToOpen % 60}m`;
    } else if (!isWeekend && !isHoliday && etTimeMin < 240) {
      // 평일 새벽 0:00~4:00 ET → 같은 날 9:30까지
      const minsToOpen = 570 - etTimeMin;
      nextOpenEta = `${Math.floor(minsToOpen / 60)}h ${minsToOpen % 60}m`;
    } else {
      // POST / CLOSED(야간) / WEEKEND → 다음 영업일 9:30 ET까지
      let daysToAdd = 1;
      if (dayOfWeek === 5 && etTimeMin >= 960) daysToAdd = 3; // 금요일 POST→월요일
      else if (dayOfWeek === 6) daysToAdd = 2; // 토요일→월요일
      else if (dayOfWeek === 0) daysToAdd = 1; // 일요일→월요일
      const minsLeftToday = 1440 - etTimeMin;
      const totalMins = minsLeftToday + (daysToAdd - 1) * 1440 + 570;
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      nextOpenEta = `${h}h ${m}m`;
    }
  }
  return { etHour, etMin, etSec, etDateStr, dayOfWeek, isWeekend, isHoliday, isMarketHours, isPreMarket, isPostMarket, session, sessionLabel, nextOpenEta, etTimeFormatted: `${String(etHour).padStart(2,'0')}:${String(etMin).padStart(2,'0')}:${String(etSec).padStart(2,'0')}` };
}

// Supabase Admin Client (Service Role — READ ONLY)
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email') || '';
  if (!ADMIN_EMAILS.includes(email.toLowerCase())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    const et = getETInfo();

    // ═══ 1. LAMBDA PIPELINE — cache hit로 작동 여부 확인 ═══
    const commandCache = await checkCacheKeys('cache:command:unified:', SAMPLE_TICKERS);
    const analysisCache = await checkCacheKeys('cache:analysis:', SAMPLE_TICKERS);
    const flowCache = await checkCacheKeys('cache:flow:unified:', SAMPLE_TICKERS);
    const probeCache = await checkCacheKeys('polygon:snapshot:probe:', SAMPLE_TICKERS);

    // flow-harvest lock 상태
    const flowLock = await getFromCache<any>('flow-harvest:lock');

    // ═══ 2. EC2 INFRASTRUCTURE ═══
    const proxyUrl = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
    const proxyKey = process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';

    // EC2 Redis Proxy 상태
    let ec2ProxyOk = false;
    let ec2ProxyLatency = -1;
    try {
      const proxyStart = Date.now();
      const pRes = await fetch(`${proxyUrl}/get?key=health-ping`, {
        headers: { 'Authorization': `Bearer ${proxyKey}` },
        signal: AbortSignal.timeout(5000),
      });
      ec2ProxyLatency = Date.now() - proxyStart;
      ec2ProxyOk = pRes.ok || pRes.status === 200;
    } catch { /* timeout or error */ }

    // EC2 Flow Accumulator (rt-metrics) — 다크풀 100% SSOT
    const rtSamples = ['NVDA', 'TSLA', 'AAPL', 'SPY'];
    let rtHits = 0;
    const rtResults: any[] = [];
    for (const t of rtSamples) {
      const v = await checkElastiCache(`rt-metrics:${t}`);
      if (v) {
        rtHits++;
        rtResults.push({ ticker: t, exists: true, source: v._source || '?', dp: v.darkPool?.percentage ?? '?' });
      } else {
        rtResults.push({ ticker: t, exists: false });
      }
    }

    // ═══ 3. CONTENT PIPELINE — 실제 존재하는 키만 체크 ═══

    // 모닝 브리핑: EC2 Guardian Worker → ElastiCache 직접 저장 (ioredis)
    const briefingKo = await checkElastiCache('guardian:morning_briefing:ko');
    const briefingEn = await checkElastiCache('guardian:morning_briefing:en');
    const briefingJa = await checkElastiCache('guardian:morning_briefing:ja');
    const briefingLegacy = await checkElastiCache('guardian:morning_briefing');

    // 크로스 섹터 브리프: Lambda cross-sector → 키 패턴 = postmarket:cross-brief-v3:{날짜}
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const crossSectorToday = await checkElastiCache(`postmarket:cross-brief-v3:${today}`);
    const crossSectorYesterday = !crossSectorToday ? await checkElastiCache(`postmarket:cross-brief-v3:${yesterday}`) : null;

    // 마케팅 콘텐츠: Vercel daily-content cron → Upstash Redis
    const morningContent = await getFromCache<any>(`marketing:morning:${today}`) || await getFromCache<any>(`marketing:morning:${yesterday}`);
    const pulseContent = await getFromCache<any>(`marketing:pulse:${today}`) || await getFromCache<any>(`marketing:pulse:${yesterday}`);

    // ═══ 4. 시장 데이터 — ElastiCache 키 전수 체크 ═══
    const vixData = await checkElastiCache('yahoo:vix');
    const vix3mData = await checkElastiCache('yahoo:vix3m');
    const spxData = await checkElastiCache('yahoo:spx');
    const nqData = await checkElastiCache('yahoo:nq');
    const tnxData = await checkElastiCache('yahoo:tnx');
    const goldData = await checkElastiCache('yahoo:gold');
    const oilData = await checkElastiCache('yahoo:oil');
    const tltData = await checkElastiCache('yahoo:tlt');
    const usdkrwData = await checkElastiCache('yahoo:usdkrw');
    const usdjpyData = await checkElastiCache('yahoo:usdjpy');
    const fng = await checkElastiCache('cnn:feargreed'); // 실제 키는 cnn:feargreed
    const econCal = await checkElastiCache('fmp:econ-calendar');
    const rlsi = await getFromCache<any>('rlsi:latest') || await checkElastiCache('rlsi:latest');

    const marketFeedKeys = [
      { key: 'yahoo:vix', data: vixData, label: 'VIX' },
      { key: 'yahoo:vix3m', data: vix3mData, label: 'VIX3M' },
      { key: 'yahoo:spx', data: spxData, label: 'S&P 500' },
      { key: 'yahoo:nq', data: nqData, label: 'NASDAQ' },
      { key: 'yahoo:tnx', data: tnxData, label: 'US 10Y' },
      { key: 'yahoo:gold', data: goldData, label: 'Gold' },
      { key: 'yahoo:oil', data: oilData, label: 'WTI Oil' },
      { key: 'yahoo:tlt', data: tltData, label: 'TLT' },
      { key: 'yahoo:usdkrw', data: usdkrwData, label: 'USD/KRW' },
      { key: 'yahoo:usdjpy', data: usdjpyData, label: 'USD/JPY' },
      { key: 'cnn:feargreed', data: fng, label: 'Fear & Greed' },
    ];
    const marketFeedHits = marketFeedKeys.filter(m => m.data).length;

    // ═══ 5. signum-fmp 데이터 (command cache 내 analyst/earnings) ═══
    const fmpSample = await checkElastiCache('cache:command:unified:NVDA');
    let fmpRelay = { analyst: false, earnings: false, fundamentals: false };
    if (fmpSample) {
      fmpRelay = {
        analyst: !!(fmpSample.analyst || fmpSample.analystData),
        earnings: !!(fmpSample.earnings || fmpSample.earningsData),
        fundamentals: !!(fmpSample.fundamentals || fmpSample.fundData),
      };
    }

    // ═══ 5.5. ALPHA HISTORY — DynamoDB 저장 무결성 검증 ═══
    let alphaHistory: any = { status: 'UNKNOWN', error: null };
    try {
      const { DynamoDBClient, ScanCommand, QueryCommand } = await import('@aws-sdk/client-dynamodb');
      const dynClient = new DynamoDBClient({ region: 'us-east-1', credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }});

      const etToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const etYesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      // Count records with pagination for today and yesterday
      async function countByDate(date: string) {
        let total = 0, scoreGt0 = 0, scoreEq0 = 0, scoreNull = 0, liveTier = 0, ssrTier = 0;
        let lastKey: any = undefined;
        do {
          const res = await dynClient.send(new ScanCommand({
            TableName: 'signum-alpha-history',
            FilterExpression: '#d = :date',
            ExpressionAttributeNames: { '#d': 'date' },
            ExpressionAttributeValues: { ':date': { S: date } },
            ProjectionExpression: 'ticker, alphaScore, qualityTier',
            ExclusiveStartKey: lastKey,
          }));
          total += res.Count || 0;
          (res.Items || []).forEach(item => {
            const s = parseFloat(item.alphaScore?.N || '0');
            if (!item.alphaScore) scoreNull++;
            else if (s > 0) scoreGt0++;
            else scoreEq0++;
            if (item.qualityTier?.S === 'LIVE') liveTier++;
            if (item.qualityTier?.S === 'SSR_V46') ssrTier++;
          });
          lastKey = res.LastEvaluatedKey;
        } while (lastKey);
        return { total, scoreGt0, scoreEq0, scoreNull, liveTier, ssrTier };
      }

      const [todayStats, yesterdayStats] = await Promise.all([
        countByDate(etToday).catch(() => null),
        countByDate(etYesterday).catch(() => null),
      ]);

      // Sample ticker scores (latest record)
      const alphaSamples: any[] = [];
      for (const t of ['NVDA', 'AAPL', 'META', 'TSLA', 'SPY']) {
        try {
          const res = await dynClient.send(new QueryCommand({
            TableName: 'signum-alpha-history',
            KeyConditionExpression: 'ticker = :t',
            ExpressionAttributeValues: { ':t': { S: t } },
            ScanIndexForward: false, Limit: 1,
          }));
          const item = res.Items?.[0];
          if (item) {
            alphaSamples.push({
              ticker: t,
              date: item.date?.S,
              score: parseFloat(item.alphaScore?.N || '0'),
              tier: item.qualityTier?.S || 'NULL',
              close: parseFloat(item.close?.N || item.price?.N || '0'),
            });
          }
        } catch { /* skip */ }
      }

      const latestStats = todayStats || yesterdayStats;
      const isHealthy = latestStats && latestStats.total >= 900 && latestStats.scoreEq0 === 0 && latestStats.scoreNull === 0;
      alphaHistory = {
        status: isHealthy ? 'HEALTHY' : latestStats ? 'DEGRADED' : 'NO_DATA',
        today: todayStats ? { date: etToday, ...todayStats } : null,
        yesterday: yesterdayStats ? { date: etYesterday, ...yesterdayStats } : null,
        samples: alphaSamples,
        note: isHealthy
          ? `✅ ${latestStats!.total}종목 저장, Score>0: ${latestStats!.scoreGt0}, Score=0: ${latestStats!.scoreEq0} (04-27 수정 이후 무결)`
          : latestStats
            ? `⚠️ ${latestStats.total}종목 (Score=0: ${latestStats.scoreEq0}건, NULL: ${latestStats.scoreNull}건)`
            : '❌ DynamoDB alpha-history 데이터 없음',
        source: 'Lambda signum-harvest Step 1(OHLCV) + Step 6(alphaScore merge write-back) → DynamoDB',
      };
    } catch (e: any) {
      alphaHistory = { status: 'ERROR', error: e.message };
    }

    // ═══ 5.6. USERS & SUBSCRIPTIONS — Supabase Admin ═══
    let users: any = { status: 'UNAVAILABLE' };
    try {
      const sb = getSupabaseAdmin();
      if (sb) {
        // Tier distribution
        const { data: profiles } = await sb.from('user_profiles').select('tier, stripe_subscription_id, created_at');
        const tierCounts: Record<string, number> = { free: 0, pro: 0, elite: 0 };
        let paidCount = 0;
        (profiles || []).forEach((p: any) => {
          if (p.tier && tierCounts[p.tier] !== undefined) tierCounts[p.tier]++;
          if (p.stripe_subscription_id) paidCount++;
        });
        // Total users via auth admin
        const { data: authData } = await sb.auth.admin.listUsers({ perPage: 1, page: 1 });
        const totalUsers = (authData as any)?.total || profiles?.length || 0;
        // Recent signups (7d)
        const { data: recentUsers } = await sb.auth.admin.listUsers({ perPage: 100, page: 1 });
        const now7d = Date.now() - 7 * 86400000;
        const now24h = Date.now() - 86400000;
        const recent7d = (recentUsers?.users || []).filter((u: any) => new Date(u.created_at).getTime() > now7d).length;
        const recent24h = (recentUsers?.users || []).filter((u: any) => new Date(u.created_at).getTime() > now24h).length;
        const active7d = (recentUsers?.users || []).filter((u: any) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() > now7d).length;
        users = {
          status: 'OK',
          totalUsers,
          tierDistribution: tierCounts,
          paidSubscriptions: paidCount,
          recentSignups24h: recent24h,
          recentSignups7d: recent7d,
          activeUsers7d: active7d,
          profileCount: profiles?.length || 0,
        };
      }
    } catch (e: any) {
      users = { status: 'ERROR', error: e.message };
    }

    // ═══ 5.7. DATA INTEGRITY — Field Completeness & Cross-Source ═══
    const INTEGRITY_TICKERS = ['GOOGL', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'AMZN', 'PLTR'];
    const integrityResults: any[] = [];
    let integrityMatches = 0;
    for (const t of INTEGRITY_TICKERS) {
      const analysis = await getFromCache<any>(`cache:analysis:${t}`);
      const command = await getFromCache<any>(`cache:command:unified:${t}`);
      const rtData = await checkElastiCache(`rt-metrics:${t}`);
      // cache:analysis fields
      const aScore = analysis?.alphaSnapshot?.score ?? null;
      const aGrade = analysis?.alphaSnapshot?.grade ?? null;
      const aEngine = analysis?.alphaSnapshot?.engineVersion ?? null;
      const aWhale = analysis?.whaleIndex ?? null;
      const aDarkPool = analysis?.darkPoolPct ?? null;
      const aRsi = analysis?.rsi ?? null;
      const aGex = analysis?.gex ?? null;
      const aPcr = analysis?.pcr ?? null;
      // cache:command:unified fields
      const cHasInst = !!(command?.institutional);
      const cHasEarnings = !!(command?.earnings);
      const cHasAnalyst = !!(command?.analyst);
      const cHasVolatility = !!(command?.volatility);
      // EC2 rt-metrics darkpool cross-check
      const rtDarkPool = rtData?.darkPool?.percentage ?? null;
      // Field completeness check (core analysis fields)
      const coreFields = [aScore, aGrade, aWhale, aDarkPool, aRsi, aGex, aPcr];
      const fieldsFilled = coreFields.filter(f => f !== null && f !== undefined).length;
      const fieldCompleteness = Math.round((fieldsFilled / coreFields.length) * 100);
      // DarkPool cross-source match (analysis vs EC2 rt-metrics)
      const dpMatch = aDarkPool !== null && rtDarkPool !== null ? Math.abs(aDarkPool - rtDarkPool) <= 5 : aDarkPool !== null || rtDarkPool !== null;
      // Consider match if analysis has all core data
      const isHealthy = fieldCompleteness >= 85 && aScore !== null && aScore > 0;
      if (isHealthy) integrityMatches++;
      integrityResults.push({
        ticker: t,
        analysis: { score: aScore, grade: aGrade, engine: aEngine, darkPoolPct: aDarkPool, whaleIndex: aWhale, rsi: aRsi !== null ? +aRsi.toFixed(1) : null, gex: aGex },
        command: { hasInst: cHasInst, hasEarnings: cHasEarnings, hasAnalyst: cHasAnalyst, hasVolatility: cHasVolatility },
        rtMetrics: { darkPoolPct: rtDarkPool },
        fieldCompleteness,
        dpMatch,
        isHealthy,
      });
    }
    const integrityRate = Math.round((integrityMatches / INTEGRITY_TICKERS.length) * 100);
    const dataIntegrity = {
      status: integrityRate >= 90 ? 'CONSISTENT' : integrityRate >= 60 ? 'PARTIAL' : 'DIVERGENT',
      matchRate: integrityRate,
      matches: integrityMatches,
      total: INTEGRITY_TICKERS.length,
      results: integrityResults,
    }

    // ═══ 6. 상태 판정 — 작동 상태 vs 자료 유무 분리 ═══
    const elapsed = Date.now() - start;

    // Flow-harvest: 8:00~21:00 ET 평일에만 실행. 그 외에는 SCHEDULED_IDLE
    const flowRunWindow = !et.isWeekend && et.etHour >= 8 && et.etHour < 21;
    const flowHasData = flowCache.hitCount > 0 || probeCache.hitCount > 0;
    const flowDataAge = flowCache.avgAge >= 0 ? flowCache.avgAge : (probeCache.avgAge >= 0 ? probeCache.avgAge : -1);

    // 작동 상태 (Operational)
    let flowOperational: string;
    if (!!flowLock) flowOperational = 'RUNNING';
    else if (probeCache.hitRate >= 50) flowOperational = 'RUNNING';
    else if (!flowRunWindow) flowOperational = 'SCHEDULED_IDLE';
    else if (flowHasData) flowOperational = 'RUNNING';
    else flowOperational = 'DOWN';

    // 자료 유무 (Data) — Lock ACTIVE이거나 probe 80%+ → 실시간 처리 중 = FRESH
    let flowDataStatus: string;
    if (!!flowLock || probeCache.hitRate >= 80) flowDataStatus = 'FRESH';
    else if (probeCache.hitRate >= 30) flowDataStatus = 'FRESH';
    else if (flowHasData) flowDataStatus = 'STALE';
    else flowDataStatus = 'EMPTY';

    // 상태 설명
    let flowNote: string;
    if (flowOperational === 'SCHEDULED_IDLE' && flowHasData) {
      flowNote = `장외 시간 — Lambda 미실행 (정상). ${probeCache.hitCount}종목 보존 중 (TTL 24~72h)`;
    } else if (flowOperational === 'SCHEDULED_IDLE') {
      flowNote = `장외 시간 — Lambda 미실행 (정상). 캐시 만료됨. 다음 본장(8:00 ET)에 자동 갱신`;
    } else if (flowOperational === 'RUNNING' && !!flowLock) {
      flowNote = `Lambda 실행 중 (Lock ACTIVE). probe ${probeCache.hitCount}/${SAMPLE_TICKERS.length}종목 적재. 빨간 종목은 현재 사이클에서 아직 미처리 (순차 처리 중)`;
    } else if (flowOperational === 'RUNNING') {
      flowNote = `정상 작동. probe ${probeCache.hitCount}/${SAMPLE_TICKERS.length}종목 적재`;
    } else {
      flowNote = `⚠️ 본장 시간인데 데이터 없음 — Lambda 실행 확인 필요`;
    }

    // Harvest: 24/7 rate(15 minutes) — 항상 작동
    // [SMART] 세션별 기대치 조정:
    //   본장(REG): 80%+ 필요 (전 종목 캐시 필수)
    //   프리/포스트: 30%+ 있으면 정상 (Lambda 사이클 진행 중)
    //   장외/주말: 1건이라도 있으면 정상 (TTL 범위 내 보존)
    const harvestDataAge = commandCache.avgAge;
    const harvestDataFresh = harvestDataAge >= 0 && harvestDataAge < 3600;
    const harvestOk = et.isMarketHours
      ? commandCache.hitRate >= 80
      : et.isPreMarket || et.isPostMarket
        ? commandCache.hitRate >= 30 || commandCache.hitCount >= 5
        : commandCache.hitCount > 0; // 장외/주말: 캐시 1건이라도 보존 중이면 OK
    const harvestRealProblem = et.isMarketHours && commandCache.hitRate < 50; // 본장인데 절반 미만 = 진짜 문제

    const briefingExists = !!(briefingKo || briefingEn || briefingJa || briefingLegacy);
    const briefingStatus = briefingExists ? 'OK' : (et.isPreMarket || et.isMarketHours ? 'MISSING' : 'PENDING');

    const crossSectorExists = !!(crossSectorToday || crossSectorYesterday);

    // [SMART] Overall: 진짜 문제가 있을 때만 DEGRADED
    // - 본장 시간: harvest 50% 미만 OR flow DOWN OR EC2 DOWN = 진짜 문제
    // - 장외 시간: EC2 DOWN만 진짜 문제 (나머지는 정상 유휴)
    const hasRealProblem = et.isMarketHours
      ? (harvestRealProblem || flowOperational === 'DOWN' || !ec2ProxyOk)
      : (!ec2ProxyOk || (et.isPreMarket && flowOperational === 'DOWN'));
    const overall = hasRealProblem ? 'DEGRADED' : 'HEALTHY';

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      elapsed: elapsed + 'ms',
      overall,
      et: {
        etHour: et.etHour,
        etMin: et.etMin,
        etTimeFormatted: et.etTimeFormatted,
        etDateStr: et.etDateStr,
        session: et.session,
        sessionLabel: et.sessionLabel,
        isMarketHours: et.isMarketHours,
        isPreMarket: et.isPreMarket,
        isPostMarket: et.isPostMarket,
        isWeekend: et.isWeekend,
        isHoliday: et.isHoliday,
        nextOpenEta: et.nextOpenEta,
        dayOfWeek: et.dayOfWeek,
      },

      users,
      dataIntegrity,

      lambda: {
        signumHarvest: {
          operationalStatus: harvestOk ? 'RUNNING' : harvestRealProblem ? 'DOWN' : commandCache.hitCount > 0 ? 'RUNNING' : 'IDLE',
          dataStatus: harvestDataFresh ? 'FRESH' : commandCache.hitCount > 0 ? 'STALE' : 'EMPTY',
          schedule: 'rate(15 minutes) — 24/7 상시 실행',
          statusNote: harvestOk
            ? `정상 작동. ${commandCache.hitCount}/${SAMPLE_TICKERS.length}종목 캐시 적재 (평균 ${harvestDataAge >= 0 ? Math.round(harvestDataAge / 60) + '분' : 'N/A'})`
            : `⚠️ 캐시 히트율 ${commandCache.hitRate}% — Lambda 확인 필요`,
          evidence: `cache:command:unified ${commandCache.hitCount}/${SAMPLE_TICKERS.length} hit (${commandCache.hitRate}%)`,
          avgDataAge: commandCache.avgAge >= 0 ? commandCache.avgAge + 's' : 'N/A',
          details: commandCache.results,
        },
        signumFlowHarvest: {
          operationalStatus: flowOperational,
          dataStatus: flowDataStatus,
          schedule: '평일 8:00~21:00 ET만 실행 (rate(5 min), 장외 자동 스킵)',
          statusNote: flowNote,
          evidence: `cache:flow:unified ${flowCache.hitCount}/${SAMPLE_TICKERS.length} hit (${flowCache.hitRate}%)`,
          probeEvidence: `polygon:snapshot:probe ${probeCache.hitCount}/${SAMPLE_TICKERS.length} hit (${probeCache.hitRate}%)`,
          avgDataAge: flowDataAge >= 0 ? flowDataAge + 's' : 'N/A',
          lockActive: !!flowLock,
          lockValue: flowLock ? String(flowLock) : null,
          details: flowCache.results,
          probeDetails: probeCache.results,
        },
        signumFmp: {
          operationalStatus: fmpRelay.analyst && fmpRelay.earnings ? 'OK' : 'DEGRADED',
          dataStatus: fmpRelay.analyst ? 'FRESH' : 'EMPTY',
          schedule: 'cron(30 13 ? * MON-FRI *) — 평일 13:30 UTC 1회',
          statusNote: fmpRelay.analyst && fmpRelay.earnings
            ? '정상. analyst/earnings/fundamentals 데이터 캐시 적재됨'
            : '⚠️ analyst 또는 earnings 데이터 누락',
          evidence: `analyst=${fmpRelay.analyst}, earnings=${fmpRelay.earnings}, fundamentals=${fmpRelay.fundamentals}`,
        },
      },

      alphaHistory,

      ec2: {
        redisProxy: {
          status: ec2ProxyOk ? 'OK' : 'DOWN',
          latency: ec2ProxyLatency >= 0 ? ec2ProxyLatency + 'ms' : 'TIMEOUT',
          url: proxyUrl,
        },
        flowAccumulator: {
          status: rtHits >= 3 ? 'RUNNING' : rtHits > 0 ? 'PARTIAL' : 'DOWN',
          evidence: `rt-metrics ${rtHits}/${rtSamples.length} hit`,
          details: rtResults,
          note: '다크풀/블록딜 100% SSOT. EC2 WebSocket → ElastiCache (ioredis, $0)',
        },
      },

      cache: {
        commandUnified: { hitRate: commandCache.hitRate, count: commandCache.hitCount, total: SAMPLE_TICKERS.length, avgAge: commandCache.avgAge },
        analysisCache: { hitRate: analysisCache.hitRate, count: analysisCache.hitCount, total: SAMPLE_TICKERS.length, avgAge: analysisCache.avgAge },
        flowUnified: { hitRate: flowCache.hitRate, count: flowCache.hitCount, total: SAMPLE_TICKERS.length, avgAge: flowCache.avgAge },
        snapshotProbe: { hitRate: probeCache.hitRate, count: probeCache.hitCount, total: SAMPLE_TICKERS.length, avgAge: probeCache.avgAge },
      },

      content: {
        morningBriefing: {
          ko: briefingKo ? { exists: true, date: briefingKo.date || briefingKo.generatedAt } : { exists: false },
          en: briefingEn ? { exists: true, date: briefingEn.date || briefingEn.generatedAt } : { exists: false },
          ja: briefingJa ? { exists: true, date: briefingJa.date || briefingJa.generatedAt } : { exists: false },
          legacy: briefingLegacy ? { exists: true, date: briefingLegacy.date || briefingLegacy.generatedAt } : { exists: false },
          status: briefingStatus,
          source: 'EC2 Guardian Worker → ElastiCache (ioredis)',
        },
        crossSectorBrief: {
          exists: crossSectorExists,
          date: crossSectorToday ? today : (crossSectorYesterday ? yesterday : null),
          key: `postmarket:cross-brief-v3:${today}`,
          source: 'Lambda cross-sector-intel → ElastiCache + Upstash',
        },
        marketing: {
          morning: { exists: !!morningContent },
          pulse: { exists: !!pulseContent },
          source: 'Vercel daily-content cron → Upstash Redis',
        },
      },

      marketFeed: {
        status: marketFeedHits >= 8 ? 'OK' : marketFeedHits >= 5 ? 'PARTIAL' : 'DOWN',
        hitCount: marketFeedHits,
        total: marketFeedKeys.length,
        items: marketFeedKeys.map(m => ({
          key: m.key,
          label: m.label,
          exists: !!m.data,
          value: m.data?.price ?? m.data?.value ?? m.data?.score ?? null,
          changePct: m.data?.changePct != null ? +(m.data.changePct).toFixed(2) : null,
        })),
        econCalendar: { exists: !!econCal },
        rlsi: rlsi ? { exists: true, value: rlsi.value || rlsi.rlsi, regime: rlsi.regime || rlsi.label } : { exists: false },
        source: 'Vercel market-feed cron → ElastiCache (every 2min)',
      },

      // ═══ CHART CACHE — 1D 차트 캐시 모니터링 (TTL 60s 수정 효과 추적) ═══
      chartCache: await (async () => {
        const chartTickers = ['TSLA', 'NVDA', 'AAPL', 'SPY', 'META'];
        const results: any[] = [];
        for (const t of chartTickers) {
          const d = await getFromCache<any>(`chart:${t}:1d`);
          if (d) {
            const ts = d.sessionMaskDebug?.timestamp || d.timestamp;
            const age = ts ? Math.round((Date.now() - new Date(ts).getTime()) / 1000) : null;
            results.push({ ticker: t, exists: true, age, session: d.sessionMaskDebug?.currentSession || '?', points: d.data?.length || 0 });
          } else {
            results.push({ ticker: t, exists: false });
          }
        }
        const hits = results.filter(r => r.exists).length;
        return { hitRate: Math.round((hits / chartTickers.length) * 100), results, ttlConfig: '1D=60s, 5D+=600s', cacheControl: '1D=no-store, 5D+=s-maxage=60' };
      })(),

      pages: {
        dashboard: { status: harvestOk ? 'OK' : harvestRealProblem ? 'DEGRADED' : 'OK', dependency: 'cache:command:unified (signum-harvest)' },
        command: { status: harvestOk ? 'OK' : harvestRealProblem ? 'DEGRADED' : 'OK', dependency: 'cache:command:unified + chart API' },
        flow: {
          status: (flowOperational !== 'DOWN' || !et.isMarketHours) ? 'OK' : 'DEGRADED',
          dependency: 'cache:flow:unified + polygon:snapshot:probe (signum-flow-harvest)',
        },
        intel: { status: crossSectorExists ? 'OK' : (et.isPostMarket ? 'PENDING' : 'OK'), dependency: 'postmarket:cross-brief-v3 (Lambda cross-sector)' },
        guardian: { status: briefingExists ? 'OK' : (et.isMarketHours ? 'DEGRADED' : 'PENDING'), dependency: 'guardian:morning_briefing (EC2 Worker)' },
        watchlist: { status: analysisCache.hitRate >= (et.isMarketHours ? 80 : 30) || analysisCache.hitCount > 0 ? 'OK' : 'DEGRADED', dependency: 'cache:analysis (signum-harvest)' },
      },

      _sampleTickers: SAMPLE_TICKERS,
      _integrityTickers: INTEGRITY_TICKERS,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

