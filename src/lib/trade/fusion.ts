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

/** Deterministic 5-band verdict from score decile + structure + MEASURED calibration.
 *  Calibration only moves the label once its sample is reliable (>=15 daily labels);
 *  a reliably-NEGATIVE top-decile measurement voids the rank premium instead of
 *  letting the label claim an edge the engine's own data contradicts. */
export type VerdictBand = 'STRONG_EDGE' | 'EDGE' | 'NEUTRAL' | 'AGAINST' | 'STRONG_AGAINST' | 'NO_DATA';
export const CALIB_MIN_DAYS = 15;

export function verdictLabel(
  score: number | null,
  s: StructRead,
  expect?: { decile: number; adjF3: number; days: number } | null,
): VerdictBand {
  if (score == null) return 'NO_DATA';
  let pts = 0;
  const dec = Math.floor(score / 10);
  if (dec >= 9) pts += 3; else if (dec >= 8) pts += 2; else if (dec >= 6) pts += 1;
  else if (dec <= 2) pts -= 2; else if (dec <= 4) pts -= 1;
  if (expect && expect.days >= CALIB_MIN_DAYS) {
    if (expect.adjF3 >= 0.3) pts += 2; else if (expect.adjF3 > 0) pts += 1;
    else if (expect.adjF3 <= -0.3) pts -= 2; else if (expect.adjF3 < 0) pts -= 1;
    if (expect.adjF3 <= 0 && dec >= 8 && pts > 0) pts = 0; // rank premium unvalidated
  }
  if (s.maxPainGapPct != null && s.maxPainGapPct > 12) pts -= 1; // far above pin
  if (s.maxPainGapPct != null && s.maxPainGapPct < -8) pts += 1; // far below pin
  if (s.flipSide === 'below') pts -= 1;
  if (pts >= 4) return 'STRONG_EDGE';
  if (pts >= 2) return 'EDGE';
  if (pts <= -3) return 'STRONG_AGAINST';
  if (pts <= -2) return 'AGAINST';
  return 'NEUTRAL';
}

/** Decisive holding stance — operator-private console, engine-derived, no hedging. */
export function stanceFrom(label: VerdictBand, plPct: number | null): { t: string; cls: 'pos' | 'neg' | 'mid' } {
  switch (label) {
    case 'STRONG_EDGE': return { t: '보유 유지 — 엔진 강한 우위', cls: 'pos' };
    case 'EDGE': return { t: '보유 유지 — 엔진 우위', cls: 'pos' };
    case 'AGAINST':
      return { t: plPct != null && plPct < 0 ? '축소 검토 — 열위 + 손실, 반등 근거 없음' : '축소 검토 — 엔진 열위', cls: 'neg' };
    case 'STRONG_AGAINST':
      return { t: '청산 우선 검토 — 강한 열위', cls: 'neg' };
    case 'NO_DATA': return { t: '판단 보류 — 엔진 데이터 없음', cls: 'mid' };
    default:
      return { t: plPct != null && plPct < 0 ? '중립 — 손절선(조건주문) 점검' : '중립 — 이익 보호선 점검', cls: 'mid' };
  }
}
