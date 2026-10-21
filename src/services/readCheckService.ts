import { unstable_cache } from 'next/cache';
import { mgetFromCache } from '@/services/redisClient';
import { getDarkPoolBatchChecked } from '@/services/darkPool';
import { insiderKey } from '@/lib/guruLens/badges';
import { READ_CHECK_TICKERS, recentDay, usable, type Facts, type InsiderFact, type ReadRow } from '@/lib/readCheck/rules';

export const READ_CHECK_CACHE_SECONDS = 300;
type RawFiling = { filing_date?: unknown; filing_url?: unknown; transactions?: Array<{
  transaction_date?: unknown; transaction_type_code?: unknown; amount_of_shares?: unknown; derivative_transaction?: unknown;
}> };
type RawInsider = { transaction_filings?: RawFiling[] };
type RawOptions = { date?: unknown; tickers?: Record<string, { callVol?: unknown; putVol?: unknown }> };

const filingLink = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && ['www.sec.gov', 'sec.gov'].includes(u.hostname)
      && u.pathname.startsWith('/Archives/') && !u.username && !u.password && !u.search && !u.hash ? u.href : null;
  } catch { return null; }
};

/** command/insider와 동일한 Intrinio 응답 캐시. 이 공급사는 계획거래 여부 미제공 → false로 바꾸지 않는다. */
export function insiderFromCache(raw: RawInsider | null, now: number): InsiderFact | null {
  const out: InsiderFact[] = [];
  for (const f of Array.isArray(raw?.transaction_filings) ? raw.transaction_filings : []) {
    if (!f || !recentDay(f.filing_date, now, 90)) continue;
    for (const t of Array.isArray(f.transactions) ? f.transactions : []) {
      if (!t || !recentDay(t.transaction_date, now, 90) || typeof t.transaction_type_code !== 'string'
        || typeof t.amount_of_shares !== 'number') continue;
      const fact: InsiderFact = { date: f.filing_date, transactionDate: t.transaction_date,
        code: t.transaction_type_code, shares: t.amount_of_shares, plan: null,
        derivative: typeof t.derivative_transaction === 'boolean' ? t.derivative_transaction : null,
        filingUrl: filingLink(f.filing_url) };
      if (usable('insider', { options: null, darkPool: null, insider: fact })) out.push(fact);
    }
  }
  // 최신 거래 우선. 같은 거래일에는 실제 비파생 S 거래를 먼저 제시한다.
  return out.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)
    || Number(b.code === 'S' && b.derivative === false) - Number(a.code === 'S' && a.derivative === false))[0] ?? null;
}

/** 공급사 호출·재수집·운영 쓰기 없음. options-eod / dark-pool / command/insider의 동일 적재본을 읽는다. */
export async function loadReadCheckSnapshot() {
  const now = Date.now();
  const [cached, dark] = await Promise.allSettled([
    mgetFromCache<unknown>(['intrinio:options:eod', ...READ_CHECK_TICKERS.map(insiderKey)]),
    getDarkPoolBatchChecked([...READ_CHECK_TICKERS], { requireVolume: true }),
  ]);
  const values = cached.status === 'fulfilled' ? cached.value : [];
  const options = values[0] as RawOptions | null;
  const darkRows = dark.status === 'fulfilled' && dark.value.ok ? dark.value.map : {};
  const rows: ReadRow[] = READ_CHECK_TICKERS.map((ticker, i) => {
    const o = options?.tickers?.[ticker], d = darkRows[ticker];
    const facts: Facts = {
      // stale 묶음은 다른 날짜이므로 사용하지 않고 현재 판의 다른 대형주로 대체한다.
      options: o && recentDay(options?.date, now, 7)
        ? { date: options.date, callVol: o.callVol as number, putVol: o.putVol as number } : null,
      darkPool: d && recentDay(d.date, now, 7) ? { date: d.date, pct: d.pct, volume: d.volume } : null,
      insider: insiderFromCache(values[i + 1] as RawInsider | null, now),
    };
    for (const kind of ['options', 'darkPool', 'insider'] as const) if (!usable(kind, facts)) facts[kind] = null;
    return { ticker, ...facts };
  });
  return { readAt: new Date(now).toISOString(), rows };
}

/** 언어·검색·답안과 무관한 한 캐시. 서버 인스턴스의 동시 미스도 하나의 읽기로 합친다. */
let inFlight: ReturnType<typeof loadReadCheckSnapshot> | null = null;
async function coalescedSnapshot() {
  if (!inFlight) inFlight = loadReadCheckSnapshot().finally(() => { inFlight = null; });
  return inFlight;
}
export const readCheckSnapshot = unstable_cache(coalescedSnapshot, ['read-check-snapshot-v2'], { revalidate: READ_CHECK_CACHE_SECONDS });
