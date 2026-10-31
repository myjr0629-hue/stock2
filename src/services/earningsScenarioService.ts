import { unstable_cache } from 'next/cache';
import { mgetFromCache } from '@/services/redisClient';
import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { etDateOf } from '@/lib/marketCalendar';
import { SCENARIO_TICKERS, buildRow, decode, eventFor, firstExpiry, rawChainKey, rawExpirationsKey, recent, selectFive } from '@/lib/earningsScenario/snapshot';

/** 기존 어댑터는 공급사 GET 뒤 Redis에 쓴다. 이 경로는 GET만 수행한다. 인증 URL·오류 원문은 출력하지 않는다. */
function readOnlyVendor() {
  let stopped = false, calls = 0;
  const deadline = Date.now() + 8000;
  return async (path: string, query: Record<string, string> = {}) => {
    const key = process.env.INTRINIO_API_KEY;
    if (!key || stopped || calls >= SCENARIO_TICKERS.length * 2 || Date.now() >= deadline) return null;
    calls++;
    try {
      const url = new URL(`https://api-v2.intrinio.com/${path}`);
      for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
      url.searchParams.set('api_key', key);
      const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(Math.max(1, Math.min(4000, deadline - Date.now()))) });
      if (res.status === 429 || res.status === 401 || res.status === 403) stopped = true;
      return res.ok ? decode(await res.json()) : null;
    } catch { return null; }
  };
}
async function limitedMap<T, R>(items: readonly T[], run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (next < items.length) { const i = next++; result[i] = await run(items[i], i); }
  }));
  return result;
}

/** 적재본 우선·원본 결측 시 제한된 공급사 GET. AI·운영 쓰기·공유 갱신 없음. */
export async function loadScenarioSnapshot() {
  const now = Date.now();
  const vendor = readOnlyVendor();
  // 당일 발표·미확정 종목은 후보에서 제외하되 확정 종목의 자료 결측은 그대로 표시한다.
  const today = etDateOf(now);
  const events = SCENARIO_TICKERS.flatMap(t => {
    const event = eventFor(t, CONFIRMED_EARNINGS, today);
    return event ? [event] : [];
  });
  // getOptionChainSnapshotIntrinio 기본 목록 조회와 같은 공개 키(UTC 어제).
  const afterDay = new Date(now - 86400_000).toISOString().slice(0, 10);
  const keys = ['intrinio:eod:snapshot', 'earnings:implied:v1',
    ...events.map(e => rawExpirationsKey(e.ticker, afterDay))];
  const values = await mgetFromCache<unknown>(keys).catch(() => []);
  const [eod, implied] = values.slice(0, 2).map(decode);
  if (!eod || !recent(eod.date, now)) return { readAt: new Date(now).toISOString(),
    rows: selectFive(events.map(e => buildRow(e.ticker, e, null, null, eod, implied, now))) };
  const expiries = await limitedMap(events, async (e, i) => {
    const observed = firstExpiry(decode(values[i + 2]), e);
    if (observed) return observed;
    // 35일 체인 창 밖의 실적도 공급사의 실제 전체 만기 목록으로 판단한다.
    const after = e.hour === 'bmo' ? new Date(Date.parse(`${e.date}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10) : e.date;
    const list = await vendor(`options/expirations/${e.ticker}/eod`, { after });
    return firstExpiry(list, e);
  });
  const requests = expiries.flatMap((e, i) => e ? [{ i, keys: [rawChainKey(events[i].ticker, e), rawChainKey(events[i].ticker, e, eod.date)] }] : []);
  const raw = await mgetFromCache<unknown>(requests.flatMap(r => r.keys)).catch(() => []);
  const chains = await limitedMap(requests, async (r, j) => {
    const cached = [decode(raw[j * 2]), decode(raw[j * 2 + 1])].find(c => c && Array.isArray(c.chain)
      && c.chain.some((row: { prices?: { date?: unknown } }) => row?.prices?.date === eod.date));
    if (cached) return cached;
    // 옵션 최신판은 주식 EOD보다 먼저 올라온다. 현물과 같은 실제 날짜를 요청해 혼합 세션을 피한다.
    return vendor(`options/chain/${events[r.i].ticker}/${expiries[r.i]}/eod`, { date: eod.date });
  });
  const byIndex = new Map(requests.map((r, j) => [r.i, chains[j]]));
  const rows = events.map((e, i) => buildRow(e.ticker, e, expiries[i], byIndex.get(i) ?? null, eod, implied, now));
  return { readAt: new Date(now).toISOString(), rows: selectFive(rows) };
}
let inFlight: ReturnType<typeof loadScenarioSnapshot> | null = null;
async function coalesced() {
  if (!inFlight) inFlight = loadScenarioSnapshot().finally(() => { inFlight = null; });
  return inFlight;
}
export const scenarioSnapshot = unstable_cache(coalesced, ['earnings-scenario-v2'], { revalidate: 300 });
