import { etMinutesOf, sessionCloseMinutes } from '@/lib/marketCalendar';

export const DAY_MS = 86_400_000;
export type OptionSide = 'call' | 'put';
export type Contract = {
  code: string; side: OptionSide; strike: number; expiry: string; session: string;
  price: number; iv: number; delta: number; gamma: number; theta: number; vega: number;
};
export type ScenarioRow = {
  ticker: string; earnings: string | null; hour: string; session: string | null;
  spot: number | null; expiry: string | null; years: number | null;
  movePct: number | null; moveSession: string | null; moveMethod: string | null;
  defaultIvPp: number | null; defaultDays: number; call: Contract | null; put: Contract | null;
};
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const positive = (v: unknown): v is number => finite(v) && v > 0;
export const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

/** 해당 세션의 실제 ET 정규장 마감. DST·조기 폐장은 기존 달력을 읽는다. */
export function closeAt(day: string): number {
  const noon = Date.parse(`${day}T12:00:00Z`);
  return noon + (sessionCloseMinutes(day) - etMinutesOf(noon)) * 60_000;
}

/** 표준정규 누적분포: Abramowitz–Stegun 26.2.17, 최대 절대오차 약 7.5e-8. */
function normalCdf(x: number): number {
  const a = Math.abs(x), t = 1 / (1 + 0.2316419 * a);
  const tail = Math.exp(-a * a / 2) / Math.sqrt(2 * Math.PI) * t
    * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

/** 유럽형 BS. 배당 0, 연복리 금리, ACT/365. 무효 입력·결측은 null. */
export function blackScholes(side: OptionSide, spot: number, strike: number, years: number, iv: number, rate: number): number | null {
  if (!['call', 'put'].includes(side) || !positive(spot) || !positive(strike) || !finite(years) || years < 0
    || !finite(iv) || iv < 0 || !finite(rate)) return null;
  if (years === 0) return Math.max(0, side === 'call' ? spot - strike : strike - spot);
  const discounted = strike * Math.exp(-rate * years);
  if (iv === 0) return Math.max(0, side === 'call' ? spot - discounted : discounted - spot);
  const scale = iv * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + iv * iv / 2) * years) / scale, d2 = d1 - scale;
  return Math.max(0, side === 'call' ? spot * normalCdf(d1) - discounted * normalCdf(d2)
    : discounted * normalCdf(-d2) - spot * normalCdf(-d1));
}

export function usableContract(c: Contract | null): c is Contract {
  return !!c && ['call', 'put'].includes(c.side) && positive(c.strike) && positive(c.price) && positive(c.iv)
    && isDay(c.expiry) && isDay(c.session) && c.session < c.expiry
    && [c.delta, c.gamma, c.theta, c.vega].every(finite) && c.gamma >= 0 && c.vega >= 0;
}

/** 예상 변동의 분산을 제거하는 교육용 가정. 기존 IV 분산의 최대 95%만 제거한다. 예측값 아님. */
export function defaultIvChange(iv: number, movePct: number, years: number): number | null {
  if (!positive(iv) || !positive(movePct) || !positive(years)) return null;
  return (Math.sqrt(iv * iv - Math.min(iv * iv * 0.95, (movePct / 100) ** 2 / years)) - iv) * 100;
}

export const ASSUMED_RATE = 0.04;
export function scenario(c: Contract | null, spot: number | null, years: number | null,
  stockPct: number, ivPp: number, elapsedDays: number) {
  if (!usableContract(c) || !positive(spot) || !positive(years) || ![stockPct, ivPp, elapsedDays].every(finite)
    || stockPct < -30 || stockPct > 30 || ivPp > 100 || elapsedDays < 0 || elapsedDays > years * 365 + 1e-9) return null;
  const nextSpot = spot * (1 + stockPct / 100), nextIv = Math.max(0.01, c.iv + ivPp / 100);
  const remaining = Math.max(0, years - elapsedDays / 365);
  const base = blackScholes(c.side, spot, c.strike, years, c.iv, ASSUMED_RATE)!;
  const direction = blackScholes(c.side, nextSpot, c.strike, years, c.iv, ASSUMED_RATE)!;
  const volatility = blackScholes(c.side, nextSpot, c.strike, years, nextIv, ASSUMED_RATE)!;
  const final = blackScholes(c.side, nextSpot, c.strike, remaining, nextIv, ASSUMED_RATE)!;
  return { base, final, nextSpot, nextIv, remaining, direction: (direction - base) * 100,
    volatility: (volatility - direction) * 100, time: (final - volatility) * 100,
    total: (final - base) * 100, basis: (base - c.price) * 100, pnl: (final - c.price) * 100 };
}
