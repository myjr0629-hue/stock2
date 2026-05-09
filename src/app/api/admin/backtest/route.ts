// [Admin] Backtest Analysis API — DynamoDB signum-alpha-history T+3 Forward Return 분석
// READ-ONLY. 관리자 전용.
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// Engine version deployment dates (cutoff dates)
const V60_CUTOFF = '2026-05-08'; // V6.0 Deep Analysis gates (RSI/VWAP/Fear Resolution)
const V52_CUTOFF = '2026-05-06'; // V5.2 SURGE_PENALTY removal
const V50_CUTOFF = '2026-04-19'; // V5.0 LOW_DATA_CAP gate

interface AlphaRecord {
  ticker: string;
  date: string;
  alphaScore: number;
  close: number;
  qualityTier?: string;
  engineVersion?: string;
  changePct?: number;
}

function addBusinessDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, _, i) => a + x[i] * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 1000;
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email') || '';
  if (!ADMIN_EMAILS.includes(email.toLowerCase())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    const { DynamoDBClient, ScanCommand } = await import('@aws-sdk/client-dynamodb');
    const client = new DynamoDBClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    // 전량 스캔 (ProjectionExpression으로 최소 필드만)
    const records: AlphaRecord[] = [];
    let lastKey: any = undefined;
    let scanCount = 0;

    do {
      const res = await client.send(new ScanCommand({
        TableName: 'signum-alpha-history',
        ProjectionExpression: 'ticker, #d, alphaScore, #c, price, qualityTier, engineVersion, changePct',
        ExpressionAttributeNames: { '#d': 'date', '#c': 'close' },
        ExclusiveStartKey: lastKey,
      }));
      scanCount++;

      (res.Items || []).forEach(item => {
        const score = parseFloat(item.alphaScore?.N || '0');
        const close = parseFloat(item.close?.N || item.price?.N || '0');
        const date = item.date?.S || '';
        const ticker = item.ticker?.S || '';
        if (score > 0 && close > 0 && date && ticker) {
          records.push({
            ticker,
            date,
            alphaScore: score,
            close,
            qualityTier: item.qualityTier?.S || '',
            engineVersion: item.engineVersion?.S || '',
            changePct: parseFloat(item.changePct?.N || '0'),
          });
        }
      });

      lastKey = res.LastEvaluatedKey;
    } while (lastKey);

    // 인덱스 구축: ticker → date → record
    const index = new Map<string, Map<string, AlphaRecord>>();
    for (const r of records) {
      if (!index.has(r.ticker)) index.set(r.ticker, new Map());
      index.get(r.ticker)!.set(r.date, r);
    }

    // T+3 Forward Return 계산
    interface PairResult {
      ticker: string;
      date: string;
      score: number;
      close0: number;
      close3: number;
      returnPct: number;
      version: string; // PRE_V50, V50_V51, V52
    }

    const pairs: PairResult[] = [];
    const uniqueTickers = new Set<string>();
    const dateRange = { min: '9999', max: '0000' };

    for (const r of records) {
      const t3Date = addBusinessDays(r.date, 3);
      const tickerMap = index.get(r.ticker);
      if (!tickerMap) continue;
      const t3Record = tickerMap.get(t3Date);
      if (!t3Record || t3Record.close <= 0) continue;

      const ret = ((t3Record.close - r.close) / r.close) * 100;
      // 이상치 필터 (|return| > 30%)
      if (Math.abs(ret) > 30) continue;

      const version = r.date >= V60_CUTOFF ? 'V6.0'
        : r.date >= V52_CUTOFF ? 'V5.2'
        : r.date >= V50_CUTOFF ? 'V5.0-V5.1'
        : 'PRE_V5.0';

      pairs.push({
        ticker: r.ticker,
        date: r.date,
        score: r.alphaScore,
        close0: r.close,
        close3: t3Record.close,
        returnPct: Math.round(ret * 100) / 100,
        version,
      });

      uniqueTickers.add(r.ticker);
      if (r.date < dateRange.min) dateRange.min = r.date;
      if (r.date > dateRange.max) dateRange.max = r.date;
    }

    // Score Band별 분석
    const BANDS = [
      { label: '80-100', min: 80, max: 100 },
      { label: '70-79', min: 70, max: 79 },
      { label: '60-69', min: 60, max: 69 },
      { label: '50-59', min: 50, max: 59 },
      { label: '40-49', min: 40, max: 49 },
      { label: '30-39', min: 30, max: 39 },
      { label: '0-29', min: 0, max: 29 },
    ];

    function analyzeBands(data: PairResult[]) {
      return BANDS.map(band => {
        const inBand = data.filter(p => p.score >= band.min && p.score <= band.max);
        if (inBand.length === 0) return { ...band, count: 0, avgReturn: 0, medianReturn: 0, hitRate: 0, totalReturn: 0 };
        const returns = inBand.map(p => p.returnPct);
        const sorted = [...returns].sort((a, b) => a - b);
        const positive = returns.filter(r => r > 0.25).length;
        return {
          ...band,
          count: inBand.length,
          avgReturn: Math.round((returns.reduce((a, b) => a + b, 0) / returns.length) * 100) / 100,
          medianReturn: Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100,
          hitRate: Math.round((positive / inBand.length) * 1000) / 10,
          totalReturn: Math.round(returns.reduce((a, b) => a + b, 0) * 100) / 100,
        };
      });
    }

    const allBands = analyzeBands(pairs);
    const allScores = pairs.map(p => p.score);
    const allReturns = pairs.map(p => p.returnPct);
    const correlation = pearsonCorrelation(allScores, allReturns);

    // 단조증가 패턴 검증 (avgReturn이 낮은 band→높은 band로 증가하는지)
    const bandAvgs = allBands.filter(b => b.count >= 5).map(b => b.avgReturn);
    let monotonic = true;
    for (let i = 1; i < bandAvgs.length; i++) {
      if (bandAvgs[i] < bandAvgs[i - 1]) { monotonic = false; break; }
    }

    // 버전별 분석
    const versionAnalysis: Record<string, any> = {};
    for (const ver of ['PRE_V5.0', 'V5.0-V5.1', 'V5.2', 'V6.0']) {
      const vPairs = pairs.filter(p => p.version === ver);
      // V5.2+ 는 T+3 쌍이 없어도 카드 표시 (수집 중 상태)
      if (vPairs.length === 0 && !['V5.2', 'V6.0'].includes(ver)) continue;
      if (vPairs.length === 0) {
        // 레코드는 있지만 T+3 쌍이 아직 없는 경우
        const vRecords = records.filter(r => {
          const v = r.date >= V60_CUTOFF ? 'V6.0'
            : r.date >= V52_CUTOFF ? 'V5.2'
            : r.date >= V50_CUTOFF ? 'V5.0-V5.1'
            : 'PRE_V5.0';
          return v === ver;
        });
        versionAnalysis[ver] = {
          totalPairs: 0,
          totalRecords: vRecords.length,
          status: vRecords.length > 0 ? 'COLLECTING' : 'NO_DATA',
          correlation: 0,
          bands: [],
          score70: { count: 0, hitRate: 0, avgReturn: 0 },
          dateRange: {
            min: vRecords.length > 0 ? vRecords.reduce((m, r) => r.date < m ? r.date : m, '9999') : '-',
            max: vRecords.length > 0 ? vRecords.reduce((m, r) => r.date > m ? r.date : m, '0000') : '-',
          },
        };
        continue;
      }
      const vScores = vPairs.map(p => p.score);
      const vReturns = vPairs.map(p => p.returnPct);
      const s70 = vPairs.filter(p => p.score >= 70);
      const s70Hit = s70.filter(p => p.returnPct > 0.25).length;
      versionAnalysis[ver] = {
        totalPairs: vPairs.length,
        status: 'READY',
        correlation: pearsonCorrelation(vScores, vReturns),
        bands: analyzeBands(vPairs),
        score70: {
          count: s70.length,
          hitRate: s70.length > 0 ? Math.round((s70Hit / s70.length) * 1000) / 10 : 0,
          avgReturn: s70.length > 0 ? Math.round((s70.reduce((a, p) => a + p.returnPct, 0) / s70.length) * 100) / 100 : 0,
        },
        dateRange: {
          min: vPairs.reduce((m, p) => p.date < m ? p.date : m, '9999'),
          max: vPairs.reduce((m, p) => p.date > m ? p.date : m, '0000'),
        },
      };
    }

    // Top/Worst performers
    const sortedPairs = [...pairs].sort((a, b) => b.returnPct - a.returnPct);
    const topPerformers = sortedPairs.slice(0, 5).map(p => ({
      ticker: p.ticker, date: p.date, score: p.score, returnPct: p.returnPct
    }));
    const worstPerformers = sortedPairs.slice(-5).reverse().map(p => ({
      ticker: p.ticker, date: p.date, score: p.score, returnPct: p.returnPct
    }));

    // Score 70+ 전체 통계
    const s70All = pairs.filter(p => p.score >= 70);
    const s70AllHit = s70All.filter(p => p.returnPct > 0.25).length;

    const elapsed = Date.now() - start;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      elapsed: elapsed + 'ms',
      scanPages: scanCount,
      summary: {
        totalRecords: records.length,
        totalPairs: pairs.length,
        uniqueTickers: uniqueTickers.size,
        dateRange,
        correlation,
        monotonic,
        score70: {
          count: s70All.length,
          hitRate: s70All.length > 0 ? Math.round((s70AllHit / s70All.length) * 1000) / 10 : 0,
          avgReturn: s70All.length > 0 ? Math.round((s70All.reduce((a, p) => a + p.returnPct, 0) / s70All.length) * 100) / 100 : 0,
        },
      },
      bands: allBands,
      versionAnalysis,
      topPerformers,
      worstPerformers,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
