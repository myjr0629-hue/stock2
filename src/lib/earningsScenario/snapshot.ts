import { closeAt, DAY_MS, defaultIvChange, finite, isDay, positive, usableContract, type Contract, type ScenarioRow } from './model';

/** 옵션 유동성 높은 대형주 후보. 완전한 5개 우선, 결측도 총 5칸을 유지한다. */
export const SCENARIO_TICKERS = ['AAPL', 'MSFT', 'AMZN', 'META', 'NVDA', 'GOOGL', 'TSLA', 'AMD', 'AVGO', 'NFLX', 'INTC', 'JPM'] as const;
type Obj = Record<string, any>;
export const decode = (v: unknown): Obj | null => {
  try { const x = typeof v === 'string' ? JSON.parse(v) : v; return x && typeof x === 'object' && !Array.isArray(x) ? x as Obj : null; }
  catch { return null; }
};
export const rawChainKey = (t: string, exp: string, date?: string) =>
  `intrinio:resp:v1:options/chain/${t}/${exp}/eod::${JSON.stringify(date ? { date } : {})}`;
export const rawExpirationsKey = (t: string, after: string) => `intrinio:resp:v1:options/expirations/${t}/eod::${JSON.stringify({ after })}`;
export const recent = (date: unknown, now: number): date is string => isDay(date)
  && now >= closeAt(date) && now - closeAt(date) <= 7 * DAY_MS;

export function eventFor(ticker: string, calendar: Obj | null, confirmed: readonly Obj[], today: string): Obj | null {
  const known = confirmed.filter(r => r.ticker === ticker && isDay(r.date) && r.date > today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (known) return known;
  return (Array.isArray(calendar?.rows) ? calendar.rows : []).filter((r: Obj) => r.ticker === ticker && isDay(r.date) && r.date > today)
    .sort((a: Obj, b: Obj) => a.date.localeCompare(b.date))[0] ?? null;
}

/** 공급사의 실제 만기 목록만 사용한다. 일부 만기만 남은 슬림 체인에서 첫 만기를 추정하지 않는다. */
export function firstExpiry(list: Obj | null, event: Obj | null): string | null {
  if (!event || !isDay(event.date) || !list || list.next_page || !Array.isArray(list.expirations)) return null;
  return [...new Set<string>(list.expirations.filter((e: unknown) => isDay(e)
    && (event.hour === 'bmo' ? e >= event.date : e > event.date)))].sort()[0] ?? null;
}

/** 원본 Intrinio EOD 필드만 읽는다. 호환 변환기의 0 대입·실시간 IV 혼합을 통과시키지 않는다. */
export function buildRow(ticker: string, event: Obj | null, expiry: string | null, raw: Obj | null,
  eod: Obj | null, implied: Obj | null, now: number): ScenarioRow {
  const row: ScenarioRow = { ticker, earnings: event?.date ?? null, hour: event?.hour ?? '', session: null,
    spot: null, expiry, years: null, movePct: null, moveSession: null, moveMethod: null,
    defaultIvPp: null, defaultDays: 0, call: null, put: null };
  if (!expiry || !event || !eod || !recent(eod.date, now) || !Array.isArray(eod.rows)) return row;
  const spot = eod.rows.find((r: unknown[]) => Array.isArray(r) && r[0] === ticker)?.[4];
  if (!positive(spot)) return row;
  row.spot = spot; row.session = eod.date;
  row.years = (closeAt(expiry) - closeAt(eod.date)) / DAY_MS / 365;
  if (!positive(row.years) || !raw || raw.next_page || !Array.isArray(raw.chain)) return row;
  const rows = raw.chain.filter((r: Obj) => r?.option?.expiration === expiry && r?.prices?.date === eod.date);
  // 실제 최근접 행사가를 먼저 고른다. 그릭스/가격이 빈 ATM을 다른 행사가로 가리지 않는다.
  const strikes = [...new Set<number>(rows.map((r: Obj) => r.option?.strike).filter(positive))]
    .sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot) || a - b);
  const strike = strikes[0];
  if (!positive(strike) || Math.abs(strike / spot - 1) > 0.05) return row;
  for (const side of ['call', 'put'] as const) {
    const r = rows.find((r: Obj) => r.option?.strike === strike && r.option?.type?.toLowerCase() === side);
    const p = r?.prices, o = r?.option;
    if (!p || !o || typeof o.code !== 'string' || o.code.length > 80) continue;
    // 실제 양쪽 마감 호가. mark·close만으로 체결 가능한 가격을 지어내지 않는다.
    if (!positive(p.close_bid) || !positive(p.close_ask) || p.close_ask < p.close_bid) continue;
    const c: Contract = { code: o.code, side, strike, expiry, session: eod.date,
      price: (p.close_bid + p.close_ask) / 2, iv: p.implied_volatility,
      delta: p.delta, gamma: p.gamma, theta: p.theta, vega: p.vega };
    if (usableContract(c)) row[side] = c;
  }
  const cell = implied?.v === 1 ? implied.cells?.[`${ticker}|${event.date}`] : null;
  if (cell?.e === expiry && cell?.s === eod.date && positive(cell.p) && cell.p < 100 && cell.b === 'eod') {
    row.movePct = cell.p; row.moveSession = cell.s; row.moveMethod = typeof cell.method === 'string' ? cell.method : null;
  }
  if (row.call && row.put) {
    // 묶음이 없으면 같은 운영 정의인 ATM 스트래들/현물을 원본 두 호가에서 계산한다. 결측 보간 없음.
    if (row.movePct === null) {
      row.movePct = (row.call.price + row.put.price) / spot * 100;
      row.moveSession = eod.date; row.moveMethod = 'chain-straddle';
    }
    if (row.movePct < 100) row.defaultIvPp = defaultIvChange((row.call.iv + row.put.iv) / 2, row.movePct, row.years);
  }
  const nextDate = new Date(Date.parse(`${event.date}T12:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  row.defaultDays = Math.min(row.years * 365, Math.max(0, (closeAt(event.hour === 'bmo' ? event.date : nextDate) - closeAt(eod.date)) / DAY_MS));
  return row;
}

export const completeRow = (r: ScenarioRow) => usableContract(r.call) && usableContract(r.put) && finite(r.defaultIvPp);
export function selectFive(rows: ScenarioRow[]): ScenarioRow[] {
  return [...rows.filter(completeRow), ...rows.filter(r => !completeRow(r))].slice(0, 5);
}
