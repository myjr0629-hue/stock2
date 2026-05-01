// [Admin] System Health Check API — 관리자 전용 인프라 헬스체크
// 모든 체크는 READ-ONLY. 기존 기능에 영향 없음.
// 2026-05-01: 실제 Redis 키 패턴 검증 완료 후 정밀 수정
import { NextRequest, NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';

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

// ET 현재 시간 계산
function getETInfo() {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
  const etHour = parseInt(etStr.split(' ')[1]?.split(':')[0] || '0');
  const etMin = parseInt(etStr.split(' ')[1]?.split(':')[1] || '0');
  const dayOfWeek = new Date(etStr).getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isMarketHours = !isWeekend && etHour >= 9 && (etHour < 16 || (etHour === 9 && etMin >= 30));
  const isPreMarket = !isWeekend && etHour >= 4 && etHour < 9;
  const isPostMarket = !isWeekend && etHour >= 16 && etHour < 20;
  return { etHour, isWeekend, isMarketHours, isPreMarket, isPostMarket };
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

    // ═══ 2. CONTENT PIPELINE — 실제 존재하는 키만 체크 ═══
    
    // 모닝 브리핑: EC2 Guardian Worker → ElastiCache 직접 저장 (ioredis)
    // Upstash에 없으므로 ElastiCache Proxy로 직접 체크
    const briefingKo = await checkElastiCache('guardian:morning_briefing:ko');
    const briefingEn = await checkElastiCache('guardian:morning_briefing:en');
    const briefingLegacy = await checkElastiCache('guardian:morning_briefing');

    // 크로스 섹터 브리프: Lambda cross-sector → 키 패턴 = postmarket:cross-brief-v3:{날짜}
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const crossSectorToday = await checkElastiCache(`postmarket:cross-brief-v3:${today}`);
    const crossSectorYesterday = !crossSectorToday ? await checkElastiCache(`postmarket:cross-brief-v3:${yesterday}`) : null;

    // 마케팅 콘텐츠: Vercel daily-content cron → Upstash Redis
    const morningContent = await getFromCache<any>(`marketing:morning:${today}`) || await getFromCache<any>(`marketing:morning:${yesterday}`);
    const pulseContent = await getFromCache<any>(`marketing:pulse:${today}`) || await getFromCache<any>(`marketing:pulse:${yesterday}`);

    // ═══ 3. 시장 데이터 — ElastiCache + Upstash 양쪽 체크 ═══
    // EC2 Guardian Worker가 ElastiCache에 쓰는 키들
    const vixData = await checkElastiCache('yahoo:vix');
    const spxData = await checkElastiCache('yahoo:spx');
    const fng = await checkElastiCache('market:fear_greed');

    // RLSI: signum-harvest Lambda → Redis (TTL 3일)
    const rlsi = await getFromCache<any>('rlsi:latest') || await checkElastiCache('rlsi:latest');

    // ═══ 4. 상태 판정 ═══
    const elapsed = Date.now() - start;

    // Lambda 판정
    const harvestOk = commandCache.hitRate >= 80;
    // flow-harvest: probe가 있거나 lock이 활성이면 RUNNING
    const flowOk = probeCache.hitCount > 0 || flowCache.hitCount > 0 || !!flowLock;
    // 장외 시간에는 flow TTL 만료 정상 → flowOk를 강제 판정 안 함
    const flowStatus = flowOk ? 'RUNNING' : (et.isMarketHours ? 'DOWN' : 'IDLE');

    // 모닝 브리핑: 생성 시점(4:00 AM ET) 이후 24시간 내이면 EXISTS 여야 정상
    const briefingExists = !!(briefingKo || briefingEn || briefingLegacy);
    const briefingStatus = briefingExists ? 'OK' : (et.isPreMarket || et.isMarketHours ? 'MISSING' : 'PENDING');

    // 크로스 섹터: 장 마감 후(~21:50 ET) 생성. 다음날 장 마감까지 유효
    const crossSectorExists = !!(crossSectorToday || crossSectorYesterday);

    // Overall: 핵심 파이프라인(harvest + flow)이 모두 정상이면 HEALTHY
    const overall = harvestOk && (flowOk || !et.isMarketHours) ? 'HEALTHY' : 'DEGRADED';

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      elapsed: elapsed + 'ms',
      overall,
      et: {
        isMarketHours: et.isMarketHours,
        isPreMarket: et.isPreMarket,
        isPostMarket: et.isPostMarket,
        isWeekend: et.isWeekend,
      },

      lambda: {
        signumHarvest: {
          status: harvestOk ? 'RUNNING' : commandCache.hitRate >= 50 ? 'DEGRADED' : 'DOWN',
          evidence: `cache:command:unified ${commandCache.hitCount}/${SAMPLE_TICKERS.length} hit (${commandCache.hitRate}%)`,
          avgDataAge: commandCache.avgAge >= 0 ? commandCache.avgAge + 's' : 'N/A',
          details: commandCache.results,
        },
        signumFlowHarvest: {
          status: flowStatus,
          evidence: `cache:flow:unified ${flowCache.hitCount}/${SAMPLE_TICKERS.length} hit (${flowCache.hitRate}%)`,
          probeEvidence: `polygon:snapshot:probe ${probeCache.hitCount}/${SAMPLE_TICKERS.length} hit (${probeCache.hitRate}%)`,
          avgDataAge: flowCache.avgAge >= 0 ? flowCache.avgAge + 's' : (probeCache.avgAge >= 0 ? probeCache.avgAge + 's (probe)' : 'N/A'),
          lockActive: !!flowLock,
          lockValue: flowLock ? String(flowLock) : null,
          note: 'flow:unified TTL=5분, probe TTL=10분. Lambda 처리시간 13분이므로 대부분 만료 정상. probe 1개라도 있으면 Lambda 작동 중.',
          details: flowCache.results,
          probeDetails: probeCache.results,
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

      marketData: {
        vix: vixData ? { exists: true, value: vixData.price, changePct: vixData.changePct?.toFixed(2) + '%' } : { exists: false, note: 'yahoo:vix (EC2 Guardian → ElastiCache)' },
        spx: spxData ? { exists: true, value: spxData.price, changePct: spxData.changePct?.toFixed(2) + '%' } : { exists: false },
        rlsi: rlsi ? { exists: true, value: rlsi.value || rlsi.rlsi, regime: rlsi.regime || rlsi.label } : { exists: false, note: 'signum-harvest Lambda → Redis (TTL 3일)' },
        fearGreed: fng ? { exists: true, value: fng.value || fng.score } : { exists: false },
      },

      pages: {
        dashboard: { status: harvestOk ? 'OK' : 'DEGRADED', dependency: 'cache:command:unified (signum-harvest)' },
        command: { status: harvestOk ? 'OK' : 'DEGRADED', dependency: 'cache:command:unified + chart API' },
        flow: {
          status: (flowOk || !et.isMarketHours) ? 'OK' : 'DEGRADED',
          dependency: 'cache:flow:unified + polygon:snapshot:probe (signum-flow-harvest)',
        },
        intel: { status: crossSectorExists ? 'OK' : 'DEGRADED', dependency: 'postmarket:cross-brief-v3 (Lambda cross-sector)' },
        guardian: { status: briefingExists ? 'OK' : (et.isMarketHours ? 'DEGRADED' : 'PENDING'), dependency: 'guardian:morning_briefing (EC2 Worker)' },
        watchlist: { status: analysisCache.hitRate >= 80 ? 'OK' : 'DEGRADED', dependency: 'cache:analysis (signum-harvest)' },
      },

      _sampleTickers: SAMPLE_TICKERS,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
