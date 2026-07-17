// ============================================================================
// FUSION CORE — the SIGNUM×trading data spine. For any symbol, assembles in one
// place everything our engines know: XS score + factor z-vector (signum-xs-
// history), live options structure & flow (signum-unified-cache), and the
// engine's OWN measured calibration (score decile → realized 3-day alpha & hit
// rate). Every number here is from our stores — nothing invented.
// ============================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getFromCache } from '@/services/redisClient';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }));
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// ── unified cache: full options/flow/analyst snapshot ───────────────────────
export interface UnifiedMetrics {
  price: number | null;
  netGex: number | null; maxPain: number | null; gammaFlip: number | null;
  callWall: number | null; putFloor: number | null; pcr: number | null;
  iv: number | null; squeeze: number | null; darkPool: number | null;
  shortVol: number | null; dtc: number | null; blockTrades: number | null;
  bullishPct: number | null; smaDist: number | null; mcap: number | null;
}

export async function getUnifiedMetrics(symbol: string): Promise<UnifiedMetrics | null> {
  try {
    const r = await ddb.send(new GetCommand({ TableName: 'signum-unified-cache', Key: { pk: symbol } }));
    const raw = r.Item?.data;
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!d) return null;
    return {
      price: num(d.structure?.underlyingPrice),
      netGex: num(d.structure?.netGex ?? d.volatility?.gex),
      maxPain: num(d.structure?.maxPain ?? d.gex?.maxPain),
      gammaFlip: num(d.structure?.gammaFlipLevel ?? d.gex?.gammaFlipLevel),
      callWall: num(d.structure?.callWall ?? d.gex?.callWall),
      putFloor: num(d.structure?.putFloor ?? d.gex?.putFloor),
      pcr: num(d.structure?.pcRatio),
      iv: num(d.volatility?.iv),
      squeeze: num(d.volatility?.squeezeScore),
      darkPool: num(d.institutional?.darkPool?.percent),
      shortVol: num(d.squeeze?.shortVolPercent ?? d.institutional?.shortVolume?.percent),
      dtc: num(d.squeeze?.daysToCover),
      blockTrades: num(d.institutional?.blockTrade?.count),
      bullishPct: num(d.analyst?.bullishPct),
      smaDist: num(d.sma?.distance),
      mcap: num(d.fundamentals?.marketCap),
    };
  } catch { return null; }
}

// ── XS engine: latest score + factor z-vector for a symbol ──────────────────
export interface XsRow { score: number | null; date: string | null; z: Record<string, number> | null }

export async function getXsRow(symbol: string): Promise<XsRow> {
  try {
    const r = await ddb.send(new QueryCommand({
      TableName: 'signum-xs-history',
      KeyConditionExpression: 'ticker = :t AND begins_with(#d, :p)',
      ExpressionAttributeNames: { '#d': 'date' },
      ExpressionAttributeValues: { ':t': symbol, ':p': '2' },
      ScanIndexForward: false,
      Limit: 1,
    }));
    const it = r.Items?.[0];
    return { score: num(it?.xsScore), date: (it?.date as string) ?? null, z: (it?.z as Record<string, number>) ?? null };
  } catch { return { score: null, date: null, z: null }; }
}

// ── engine calibration: score decile → MEASURED 3d alpha / hit rate ─────────
export interface XsReport {
  date?: string; labeled?: number;
  calibration?: Record<string, { adjF3: number; hit: number; days: number }>;
  variants?: Record<string, { dayIC?: number | null; rolling: number | null; days: number }>;
  rollingIC?: Record<string, number>;
  weights?: Record<string, number>;
  top10?: string[];
}

export async function getXsReport(): Promise<XsReport | null> {
  return (await getFromCache<XsReport>('cache:xs:report')) ?? null;
}

/** Calibration deciles are ASCENDING by score: index 9 = top decile. */
export function expectFromScore(score: number | null, rep: XsReport | null): { decile: number; adjF3: number; hit: number; days: number } | null {
  if (score == null || !rep?.calibration) return null;
  const dec = Math.max(0, Math.min(9, Math.floor(score / 10)));
  const c = rep.calibration[String(dec)];
  if (!c) return null;
  return { decile: dec, adjF3: c.adjF3, hit: c.hit, days: c.days };
}

// ── structural readout (transparent rules — no black box) ───────────────────
export interface StructRead {
  maxPainGapPct: number | null;   // (price-maxPain)/maxPain
  flipSide: 'above' | 'below' | null; // dealer long/short gamma side
  toCallWallPct: number | null;
  toPutFloorPct: number | null;
  flags: string[];                 // factual flags computed from our data
}

export function readStructure(px: number | null, m: UnifiedMetrics | null): StructRead {
  const out: StructRead = { maxPainGapPct: null, flipSide: null, toCallWallPct: null, toPutFloorPct: null, flags: [] };
  if (!m) return out;
  const p = px ?? m.price;
  if (p == null || p <= 0) return out;
  if (m.maxPain) out.maxPainGapPct = ((p - m.maxPain) / m.maxPain) * 100;
  if (m.gammaFlip) out.flipSide = p >= m.gammaFlip ? 'above' : 'below';
  if (m.callWall) out.toCallWallPct = ((m.callWall - p) / p) * 100;
  if (m.putFloor) out.toPutFloorPct = ((m.putFloor - p) / p) * 100;
  if (out.maxPainGapPct != null && Math.abs(out.maxPainGapPct) >= 10) out.flags.push(`맥스페인 괴리 ${out.maxPainGapPct.toFixed(1)}%`);
  if (out.flipSide === 'below') out.flags.push('감마플립 하단 (딜러 숏감마 — 변동 증폭 구간)');
  if (m.squeeze != null && m.squeeze >= 70) out.flags.push(`스퀴즈 스코어 ${m.squeeze}`);
  if (m.shortVol != null && m.shortVol >= 45) out.flags.push(`숏볼륨 ${m.shortVol}%`);
  if (m.darkPool != null && m.darkPool >= 45) out.flags.push(`다크풀 ${m.darkPool}%`);
  if (m.pcr != null && (m.pcr >= 1.8 || m.pcr <= 0.4)) out.flags.push(`PCR ${m.pcr}`);
  return out;
}

/** Deterministic label from score + structure (rule-based, explainable). */
export function verdictLabel(score: number | null, s: StructRead): 'EDGE' | 'NEUTRAL' | 'AGAINST' | 'NO_DATA' {
  if (score == null) return 'NO_DATA';
  let pts = 0;
  if (score >= 80) pts += 2; else if (score >= 60) pts += 1; else if (score < 30) pts -= 2; else if (score < 50) pts -= 1;
  if (s.maxPainGapPct != null && s.maxPainGapPct > 12) pts -= 1; // far above pin
  if (s.maxPainGapPct != null && s.maxPainGapPct < -8) pts += 1; // far below pin
  if (s.flipSide === 'below') pts -= 1;
  if (pts >= 2) return 'EDGE';
  if (pts <= -2) return 'AGAINST';
  return 'NEUTRAL';
}
