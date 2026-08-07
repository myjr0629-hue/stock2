import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';
import { getXsReport } from '@/lib/trade/fusion';
import { getFromCache, setInCache } from '@/services/redisClient';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// REAL-TRADING PORTFOLIO PLAN (preview layer, prereg §2.6-2.7):
// capital → slot = capital/30 (identical to the paper twin's sizing, so the
// verified track stays the measurement basis) → today's deployment = engine
// top-10 ∩ eligibility. Eligibility is a fill-safety rail, NOT an alpha
// filter (measured cohort: median $633M daily volume, p10 $60M):
//   price ≥ $5 · live spread ≤ 50bps · mcap ≥ $500M · quote available.
// An ineligible slot stays CASH that day (never reallocated — keeps the
// paper/real twin comparable).
const MIN_PRICE = 5;
const MAX_SPREAD_BPS = 50;
const MIN_MCAP = 5e8;
const SLOTS = 30;

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

interface PlanRow {
  rank: number; symbol: string; score: number;
  px: number | null; spreadBps: number | null; mcap: number | null;
  eligible: boolean; reasons: string[]; amount: number;
}

export async function GET(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;

  const capQ = num(req.nextUrl.searchParams.get('capital'));
  const cfg = await getFromCache<{ capital?: number }>('trade:auto:config').catch(() => null);
  const capital = capQ ?? num(cfg?.capital) ?? 1000;

  const rep = await getXsReport();
  const top = (rep?.top10 ?? []).map((s: string, i: number) => {
    const [sym, sc] = String(s).split(':');
    return { rank: i + 1, symbol: sym, score: num(sc) ?? 0 };
  }).filter((x) => x.symbol);
  if (!top.length) return NextResponse.json({ ok: false, error: '엔진 리포트 대기 (cache:xs:report 없음)' });

  const cacheKey = `trade:plan:${rep?.date}:${Math.round(capital)}`;
  const cached = await getFromCache<object>(cacheKey).catch(() => null);
  if (cached) return NextResponse.json({ ok: true, cached: true, ...cached });

  // 1 batched price call for all symbols, then per-symbol orderbook (spread)
  const priceRes = await callToss({ path: '/api/v1/prices', query: { symbols: top.map((t) => t.symbol).join(',') } });
  const pxMap = new Map<string, number | null>();
  for (const r of ((priceRes.data as { result?: { symbol?: string; lastPrice?: string }[] })?.result ?? [])) {
    if (r.symbol) pxMap.set(r.symbol, num(r.lastPrice));
  }

  const slot = Math.floor((capital / SLOTS) * 100) / 100;
  const rows: PlanRow[] = [];
  for (const t of top) {
    const px = pxMap.get(t.symbol) ?? null;
    let spreadBps: number | null = null;
    try {
      const book = await callToss({ path: '/api/v1/orderbook', query: { symbol: t.symbol } });
      const ob = (book.data as { result?: { asks?: { price?: string }[]; bids?: { price?: string }[] } })?.result;
      const a1 = num(ob?.asks?.[0]?.price), b1 = num(ob?.bids?.[0]?.price);
      if (a1 != null && b1 != null && a1 > 0 && b1 > 0) spreadBps = ((a1 - b1) / ((a1 + b1) / 2)) * 10000;
    } catch { /* spread unknown */ }
    let mcap: number | null = null;
    try {
      const g = await ddb.send(new GetCommand({ TableName: 'signum-unified-cache', Key: { pk: t.symbol } }));
      const d = typeof g.Item?.data === 'string' ? JSON.parse(g.Item.data) : g.Item?.data;
      mcap = num(d?.fundamentals?.marketCap);
    } catch { /* mcap unknown */ }

    const reasons: string[] = [];
    if (px == null) reasons.push('시세 없음');
    else if (px < MIN_PRICE) reasons.push(`가격 $${px} < $${MIN_PRICE}`);
    if (spreadBps == null) reasons.push('호가 없음');
    else if (spreadBps > MAX_SPREAD_BPS) reasons.push(`스프레드 ${spreadBps.toFixed(0)}bps > ${MAX_SPREAD_BPS}`);
    if (mcap != null && mcap < MIN_MCAP) reasons.push(`시총 $${(mcap / 1e6).toFixed(0)}M < $500M`);

    rows.push({
      ...t, px, spreadBps: spreadBps != null ? Math.round(spreadBps * 10) / 10 : null, mcap,
      eligible: reasons.length === 0, reasons, amount: reasons.length === 0 ? slot : 0,
    });
    await new Promise((r) => setTimeout(r, 120));
  }

  const deploy = rows.reduce((s, r) => s + r.amount, 0);
  const plan = {
    date: rep?.date ?? null, capital, slot, slots: SLOTS, rows,
    totals: {
      deployToday: Math.round(deploy * 100) / 100,
      reservedD1D2: Math.round(slot * 20 * 100) / 100, // tomorrow + day-after cohorts
      cashBuffer: Math.round((capital - deploy - slot * 20) * 100) / 100,
    },
    mechanics: '금액 지정 시장가 매수 · 정규장 전용 · 3거래일 보유 후 청산 · -2% 데이스톱/-3% 주간킬 동일 적용 (사전등록 R1-R5)',
  };
  await setInCache(cacheKey, plan, 300).catch(() => {});
  return NextResponse.json({ ok: true, ...plan });
}
