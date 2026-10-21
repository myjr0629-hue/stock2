/** 공개 진단 전용 순수 규칙. 숫자·결측을 보정하거나 매매 방향을 추론하지 않는다. */
export const READ_CHECK_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD'] as const;
export type ReadTicker = typeof READ_CHECK_TICKERS[number];
export type Kind = 'options' | 'darkPool' | 'insider';
export const KINDS: Kind[] = ['options', 'darkPool', 'insider'];
export type Choice = 'claim' | 'observe' | 'opposite';
export type Verdict = 'insufficient' | 'supported' | 'overreach' | 'premise';
export type OptionFact = { date: string; callVol: number; putVol: number };
export type DarkFact = { date: string; pct: number; volume: number };
export type InsiderFact = {
  date: string; transactionDate: string; code: string; shares: number;
  plan: boolean | null; derivative: boolean | null; filingUrl: string | null;
};
export type Facts = { options: OptionFact | null; darkPool: DarkFact | null; insider: InsiderFact | null };
export type ReadRow = Facts & { ticker: ReadTicker };
export type ReadCase = { kind: Kind; ticker: ReadTicker; requested: ReadTicker; replaced: boolean; facts: Facts };

export function parseTicker(raw: unknown): ReadTicker | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toUpperCase();
  return READ_CHECK_TICKERS.includes(t as ReadTicker) ? t as ReadTicker : null;
}
export function parseChoice(raw: unknown): Choice | null {
  return raw === 'claim' || raw === 'observe' || raw === 'opposite' ? raw : null;
}
export const nonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function validDay(raw: unknown): raw is string {
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
    && Number.isFinite(Date.parse(raw)) && new Date(raw).toISOString().slice(0, 10) === raw;
}
/** EOD는 7일, 내부자 공시는 90일 이내. 주말을 허용하되 오래된 자료를 현재로 제시하지 않는다. */
export function recentDay(raw: unknown, now: number, maxDays: number): raw is string {
  if (!validDay(raw)) return false;
  const age = Date.parse(new Date(now).toISOString().slice(0, 10)) - Date.parse(raw);
  return age >= 0 && age <= maxDays * 86400_000;
}
export function usable(kind: Kind, facts: Facts): boolean {
  if (kind === 'options') {
    const f = facts.options;
    return !!f && validDay(f.date) && nonnegative(f.callVol) && nonnegative(f.putVol)
      && Number.isSafeInteger(f.callVol) && Number.isSafeInteger(f.putVol) && f.callVol + f.putVol > 0;
  }
  if (kind === 'darkPool') {
    const f = facts.darkPool;
    return !!f && validDay(f.date) && nonnegative(f.pct) && f.pct <= 100 && nonnegative(f.volume);
  }
  const f = facts.insider;
  return !!f && validDay(f.date) && validDay(f.transactionDate) && f.transactionDate <= f.date
    && ['P', 'S', 'M', 'F', 'A', 'G', 'C'].includes(f.code) && nonnegative(f.shares) && f.shares > 0
    && (f.plan === null || typeof f.plan === 'boolean') && (f.derivative === null || typeof f.derivative === 'boolean');
}
export function judge(kind: Kind, choice: Choice, facts: Facts): Verdict {
  if (!usable(kind, facts)) return 'insufficient';
  if (choice === 'observe') return 'supported';
  // '콜이 더 많다', '주식을 팔았다'라는 전제부터 관측과 다른 경우도 구분한다.
  if (choice === 'claim' && ((kind === 'options' && facts.options!.callVol <= facts.options!.putVol)
    || (kind === 'insider' && (facts.insider!.code !== 'S' || facts.insider!.derivative === true)))) return 'premise';
  return 'overreach';
}
/** 사례마다 독립 대체. 후보 전체 결측이어도 세 사례와 자료 부족 사유는 남긴다. */
export function selectCases(rows: ReadRow[], requested: ReadTicker | null): ReadCase[] {
  return KINDS.map((kind, i) => {
    const preferred = requested ?? READ_CHECK_TICKERS[i];
    const order = [preferred, ...READ_CHECK_TICKERS.filter(t => t !== preferred)];
    const found = order.map(t => rows.find(r => r.ticker === t)).find(r => r && usable(kind, r));
    return { kind, requested: preferred, ticker: found?.ticker ?? preferred, replaced: !!found && found.ticker !== preferred,
      facts: found ?? { options: null, darkPool: null, insider: null } };
  });
}
