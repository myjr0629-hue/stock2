import { getFromCache, setInCache } from '@/services/redisClient';
import { atmStraddleImpliedMove, eodQuoteRows, impliedMoveFields, type ImpliedMove } from '@/lib/impliedMove';
import { etDateOf, isNonTradingDay, optionExpirationFloor } from '@/lib/marketCalendar';
import { readEodCloses } from '@/services/eodSnapshot';
import { ImpliedDeadlineError, withinImpliedDeadline } from '@/lib/earnings/impliedDeadline';
import { bgStore } from '@/lib/intrinioBackground';

const DAY = 86400_000;
// v2 rejects values produced from the old last-trade-close fallback.
const PREFIX = 'earnings:monthly-probe:v2';

/** A candidate only: no value is produced unless the supplier returns this actual expiry. */
export function monthlyExpiryAfter(after: string, sameDay: boolean): string {
  const month = new Date(`${after.slice(0, 7)}-01T12:00:00Z`);
  for (let i = 0; i < 2; i++) {
    const first = new Date(month);
    first.setUTCMonth(first.getUTCMonth() + i);
    const offset = (5 - first.getUTCDay() + 7) % 7;
    let expiry = new Date(first.getTime() + (offset + 14) * DAY).toISOString().slice(0, 10);
    while (isNonTradingDay(expiry)) expiry = new Date(Date.parse(`${expiry}T12:00:00Z`) - DAY).toISOString().slice(0, 10);
    if (sameDay ? expiry >= after : expiry > after) return expiry;
  }
  throw new Error('monthly expiry out of range');
}

/** Ordinary readers only read this small dated observation. Only the pack refresh may probe. */
export async function earningsMonthlyMove(
  ticker: string, after: string, sameDay: boolean, structure: any, probe: boolean, deadlineMs?: number,
): Promise<ImpliedMove | null> {
  const today = etDateOf(Date.now());
  // Limit new supplier work to nearby announcements. Distant events keep their real last-good.
  const distance = (Date.parse(`${after}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY;
  if (distance < 0 || distance > 45) return null;
  const expiry = monthlyExpiryAfter(after, sameDay);
  if (expiry < optionExpirationFloor()) return null;
  const key = `${PREFIX}:${ticker}:${expiry}`;
  const cached = await withinImpliedDeadline(() => getFromCache<{ im: ImpliedMove | null; checkedAt: number }>(key), deadlineMs).catch((error) => { if (error instanceof ImpliedDeadlineError) throw error; return null; });
  const stored = cached?.im ?? null;
  const valid = (im: ImpliedMove | null): im is ImpliedMove => {
    const f = impliedMoveFields(im);
    const age = f.impliedMoveSession ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${f.impliedMoveSession}T00:00:00Z`)) / DAY : Infinity;
    return f.impliedMovePct != null && im?.expiry === expiry && age >= 0 && age <= 5;
  };
  if (!probe || (cached && Date.now() - cached.checkedAt < 3600_000)) return valid(stored) ? stored : null;
  if (deadlineMs != null && Date.now() >= deadlineMs) return valid(stored) ? stored : null;
  // [관문 10200755 ②] 이 갱신 흐름이 429(또는 시간 초과)로 닫혔으면 새 조회를 시작하지 않는다 — 직전 정상값만.
  const bg = bgStore.getStore();
  if (bg?.tripped) return valid(stored) ? stored : null;
  const closes = await withinImpliedDeadline(() => readEodCloses(), deadlineMs).catch((error) => { if (error instanceof ImpliedDeadlineError) throw error; return null; });
  const spot = Number(structure?.underlyingPrice) > 0 ? Number(structure.underlyingPrice) : closes?.rows.get(ticker)?.c;
  if (!(typeof spot === 'number' && spot > 0)) return valid(stored) ? stored : null;
  const save = async (im: ImpliedMove | null) => {
    // A timed-out probe is not an observed failure; do not extend the hourly cache.
    await withinImpliedDeadline(() => setInCache(key, { im, checkedAt: Date.now() }, 36 * 3600), deadlineMs).catch(() => false);
    return im;
  };
  const previous = () => valid(stored) ? stored : null;
  try {
    const { getOptionChainSnapshotIntrinio } = await import('@/services/intrinioClient');
    // Existing adapter + ATM-straddle definition; no separate vendor/conversion pipeline.
    const saw429Before = bg?.saw429 ?? 0;
    const response = await withinImpliedDeadline(() => getOptionChainSnapshotIntrinio(ticker, { expiration: expiry, underlyingPrice: spot }), deadlineMs);
    // 조회 중 429 를 받았거나 관문이 닫혔으면 응답이 일부(페이지·그릭스 누락)일 수 있다 — 값을 만들지 않고, «확인함»으로 저장도 하지 않는다.
    if (bg && (bg.tripped || bg.saw429 > saw429Before)) return previous();
    const rows = (response?.results || []).filter((c: any) => c?.details?.expiration_date === expiry);
    const dates = [...new Set<string>(rows.map((c: any) => c?._intrinio?.date).filter((d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))];
    if (dates.length !== 1) return save(previous());
    const close = closes?.date === dates[0] ? closes.rows.get(ticker)?.c : null;
    const denominator = close && close > 0 ? close : null;
    if (!denominator) return save(previous());
    // 같은 규칙(lib/impliedMove.eodQuoteRows) — 저장 체인 경로(impliedMoveService)와 한 정의.
    const eodRows = eodQuoteRows(rows);
    const im = atmStraddleImpliedMove(eodRows, denominator, { expiry, chainDate: dates[0] });
    if (!valid(im)) return save(previous());
    return save(im);
  } catch (error) {
    if (error instanceof ImpliedDeadlineError) { if (bg) bg.tripped = true; throw error; }
    // 429·관문 닫힘은 «관측된 실패»가 아니다 — 1시간 재사용 저장으로 늘리지 않는다.
    if (bg?.tripped || (error as any)?.status === 429) return previous();
    return save(previous());
  }
}
