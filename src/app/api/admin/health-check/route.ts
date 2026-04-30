// [Admin] System Health Check API — 관리자 전용 인프라 헬스체크
// 모든 체크는 READ-ONLY. 기존 기능에 영향 없음.
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
  extra?: Record<string, any>;
}

async function checkCacheKeys(prefix: string, tickers: string[]): Promise<{ results: CacheCheckResult[], hitRate: number, avgAge: number }> {
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
        if (age !== undefined) { totalAge += age; ageCount++; }
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
  };
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email') || '';
  if (!ADMIN_EMAILS.includes(email.toLowerCase())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    // ═══ 1. LAMBDA PIPELINE STATUS ═══
    // Lambda 상태는 Redis 데이터 신선도로 추론 (CloudWatch SDK 불필요)

    // signum-harvest → cache:command:unified:* 와 cache:analysis:*
    const commandCache = await checkCacheKeys('cache:command:unified:', SAMPLE_TICKERS);
    const analysisCache = await checkCacheKeys('cache:analysis:', SAMPLE_TICKERS);

    // signum-flow-harvest → cache:flow:unified:* 와 polygon:snapshot:probe:*
    const flowCache = await checkCacheKeys('cache:flow:unified:', SAMPLE_TICKERS);
    const probeCache = await checkCacheKeys('polygon:snapshot:probe:', SAMPLE_TICKERS);

    // flow-harvest lock 상태
    const flowLock = await getFromCache<any>('flow-harvest:lock');

    // ═══ 2. CONTENT PIPELINE ═══
    // 모닝 브리핑
    const briefingKo = await getFromCache<any>('guardian:morning_briefing:ko');
    const briefingEn = await getFromCache<any>('guardian:morning_briefing:en');
    const briefingLegacy = await getFromCache<any>('guardian:morning_briefing');

    // Cross-Sector Brief
    const today = new Date().toISOString().split('T')[0];
    const crossSectorKo = await getFromCache<any>(`cross-sector:brief:ko:${today}`);
    const crossSectorEn = await getFromCache<any>(`cross-sector:brief:en:${today}`);
    // Try yesterday if today not found
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const crossSectorKoYesterday = !crossSectorKo ? await getFromCache<any>(`cross-sector:brief:ko:${yesterday}`) : null;
    const crossSectorEnYesterday = !crossSectorEn ? await getFromCache<any>(`cross-sector:brief:en:${yesterday}`) : null;

    // Marketing content
    const morningContent = await getFromCache<any>(`marketing:morning:${today}`);
    const pulseContent = await getFromCache<any>(`marketing:pulse:${today}`);

    // ═══ 3. MARKET DATA PIPELINE ═══
    // RLSI (market regime)
    const rlsi = await getFromCache<any>('rlsi:latest');

    // VIX
    const vix = await getFromCache<any>('vix:last_known_good');

    // EC2 Proxy health (implied from data existence)
    // If we got any cache hits above, EC2 Proxy is working

    // ═══ 4. PER-PAGE DATA INTEGRITY ═══
    // Dashboard needs: cache:command:unified
    // Command needs: chart data (checked via command cache)
    // Flow needs: cache:flow:unified + polygon:snapshot:probe
    // Intel/Guardian needs: morning briefing + cross-sector
    // Watchlist needs: cache:analysis

    // ═══ 5. REPORTS ═══
    const reportTypes = ['pre', 'open', 'eod', 'draft', 'final'] as const;
    const reports: Record<string, any> = {};
    for (const type of reportTypes) {
      const data = await getFromCache<any>(`report:${type}:${today}`);
      const dataYesterday = !data ? await getFromCache<any>(`report:${type}:${yesterday}`) : null;
      reports[type] = {
        exists: !!(data || dataYesterday),
        date: data ? today : (dataYesterday ? yesterday : null),
      };
    }

    // ═══ BUILD RESPONSE ═══
    const elapsed = Date.now() - start;

    // Calculate overall health — flow:unified는 TTL 5분이라 Lambda 13분 처리 중 대부분 만료되므로 probe로 판정
    const lambdaHealth = commandCache.hitRate >= 80 && (probeCache.hitRate >= 10 || flowCache.hitRate > 0 || !!flowLock);
    const contentHealth = !!(briefingKo || briefingEn || briefingLegacy);
    const cacheHealth = commandCache.hitRate >= 80;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      elapsed: elapsed + 'ms',
      overall: lambdaHealth && cacheHealth ? 'HEALTHY' : 'DEGRADED',

      lambda: {
        signumHarvest: {
          status: commandCache.hitRate >= 80 ? 'RUNNING' : commandCache.hitRate >= 50 ? 'DEGRADED' : 'DOWN',
          evidence: `cache:command:unified ${commandCache.hitRate}% hit (${commandCache.results.filter(r => r.exists).length}/${SAMPLE_TICKERS.length})`,
          avgDataAge: commandCache.avgAge >= 0 ? commandCache.avgAge + 's' : 'N/A',
          details: commandCache.results,
        },
        signumFlowHarvest: {
          // flow:unified TTL=5분, Lambda 처리시간=13분 → 대부분 만료 정상. probe가 있으면 Lambda 작동 중
          status: (probeCache.hitRate >= 10 || flowCache.hitRate > 0 || !!flowLock) ? 'RUNNING' : probeCache.hitRate > 0 ? 'PARTIAL' : 'DOWN',
          evidence: `cache:flow:unified ${flowCache.hitRate}% hit (${flowCache.results.filter(r => r.exists).length}/${SAMPLE_TICKERS.length})`,
          probeEvidence: `polygon:snapshot:probe ${probeCache.hitRate}% hit (${probeCache.results.filter(r => r.exists).length}/${SAMPLE_TICKERS.length})`,
          avgDataAge: flowCache.avgAge >= 0 ? flowCache.avgAge + 's' : 'N/A',
          lockActive: !!flowLock,
          lockValue: flowLock ? String(flowLock) : null,
          details: flowCache.results,
          probeDetails: probeCache.results,
        },
      },

      cache: {
        commandUnified: { hitRate: commandCache.hitRate, count: commandCache.results.filter(r => r.exists).length, total: SAMPLE_TICKERS.length, avgAge: commandCache.avgAge },
        analysisCache: { hitRate: analysisCache.hitRate, count: analysisCache.results.filter(r => r.exists).length, total: SAMPLE_TICKERS.length, avgAge: analysisCache.avgAge },
        flowUnified: { hitRate: flowCache.hitRate, count: flowCache.results.filter(r => r.exists).length, total: SAMPLE_TICKERS.length, avgAge: flowCache.avgAge },
        snapshotProbe: { hitRate: probeCache.hitRate, count: probeCache.results.filter(r => r.exists).length, total: SAMPLE_TICKERS.length, avgAge: probeCache.avgAge },
      },

      content: {
        morningBriefing: {
          ko: briefingKo ? { exists: true, date: briefingKo.date || briefingKo.generatedAt || 'unknown' } : { exists: false },
          en: briefingEn ? { exists: true, date: briefingEn.date || briefingEn.generatedAt || 'unknown' } : { exists: false },
          legacy: !!briefingLegacy,
        },
        crossSectorBrief: {
          ko: { exists: !!(crossSectorKo || crossSectorKoYesterday), date: crossSectorKo ? today : (crossSectorKoYesterday ? yesterday : null) },
          en: { exists: !!(crossSectorEn || crossSectorEnYesterday), date: crossSectorEn ? today : (crossSectorEnYesterday ? yesterday : null) },
        },
        marketing: {
          morning: { exists: !!morningContent, date: morningContent ? today : null },
          pulse: { exists: !!pulseContent, date: pulseContent ? today : null },
        },
        reports,
      },

      marketData: {
        rlsi: rlsi ? { exists: true, value: rlsi.value || rlsi.rlsi, regime: rlsi.regime || rlsi.label, updatedAt: rlsi.updatedAt || rlsi._ts } : { exists: false },
        vix: vix ? { exists: true, value: typeof vix === 'number' ? vix : vix.value } : { exists: false },
      },

      pages: {
        dashboard: { status: commandCache.hitRate >= 80 ? 'OK' : 'DEGRADED', dependency: 'cache:command:unified' },
        command: { status: commandCache.hitRate >= 80 ? 'OK' : 'DEGRADED', dependency: 'cache:command:unified + chart API' },
        flow: { status: (probeCache.hitRate >= 10 || flowCache.hitRate > 0 || !!flowLock) ? 'OK' : 'DEGRADED', dependency: 'cache:flow:unified + polygon:snapshot:probe' },
        intel: { status: contentHealth ? 'OK' : 'DEGRADED', dependency: 'guardian:morning_briefing + cross-sector:brief' },
        watchlist: { status: analysisCache.hitRate >= 80 ? 'OK' : 'DEGRADED', dependency: 'cache:analysis' },
      },

      _sampleTickers: SAMPLE_TICKERS,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
