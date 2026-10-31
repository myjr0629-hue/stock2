import { getFromCache, setInCache } from '@/services/redisClient';
import { atmStraddleImpliedMove, eodQuoteRows, impliedMoveFields, type ImpliedMove } from '@/lib/impliedMove';
import { etDateOf, etLastClosedSessionDate, optionExpirationFloor } from '@/lib/marketCalendar';
import { readEodCloses } from '@/services/eodSnapshot';
import { ImpliedDeadlineError, withinImpliedDeadline } from '@/lib/earnings/impliedDeadline';
import { bgStore } from '@/lib/intrinioBackground';
import { expiryMethod, splitMonthlyEvent, type EarningsMove } from '@/lib/earnings/eventMove';
import { earningsObservationKey } from '@/lib/earnings/earningsImplied';
export { monthlyExpiryAfter } from '@/lib/earnings/eventMove';

const DAY = 86400_000;
// v3: actual expiry list + event-date/timing key; v2 monthly-only values cannot suppress weekly collection.
//   키 모양은 lib/earnings/earningsImplied.earningsObservationKey 한 곳(일반 경로도 같은 관측을 읽는다 — T26).

/** Ordinary readers only read this dated observation. Only the background pack refresh may collect. */
export async function earningsMonthlyMove(
  ticker: string, after: string, sameDay: boolean, structure: any, probe: boolean, deadlineMs?: number,
  // 실적 영수증 전용(earningsActualsService) — 화면 호출자는 넘기지 않는다(기본값 = 기존 동작 그대로).
  //   pastDays: 발표일이 지난 뒤에도 그 발표의 관측을 읽는다 · save:false: 조회 결과를 공유 관측 키에 쓰지 않는다(화면이 읽는 키 불변).
  receipt: { pastDays?: number; save?: boolean; onFirstExpiry?: (expiry: string | null) => void } = {},
): Promise<EarningsMove | null> {
  const today = etDateOf(Date.now());
  const distance = (Date.parse(`${after}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY;
  if (distance < -Math.max(0, receipt.pastDays ?? 0) || distance > 45) return null;
  const key = earningsObservationKey(ticker, after, sameDay);
  const cached = await withinImpliedDeadline(() => getFromCache<{ im: EarningsMove | null; checkedAt: number }>(key), deadlineMs)
    .catch(error => { if (error instanceof ImpliedDeadlineError) throw error; return null; });
  const stored = cached?.im ?? null;
  const knownFirst = (Array.isArray(structure?.availableExpirations) ? structure.availableExpirations : [])
    .filter((e: unknown): e is string => typeof e === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e) && e >= optionExpirationFloor() && (sameDay ? e >= after : e > after)).sort()[0];
  const valid = (im: ImpliedMove | null, requirePost = true): im is ImpliedMove => {
    const f = impliedMoveFields(im);
    const age = f.impliedMoveSession ? (Date.parse(today) - Date.parse(f.impliedMoveSession)) / DAY : Infinity;
    return f.impliedMovePct != null && !!im?.expiry && im.expiry >= optionExpirationFloor()
      && (!requirePost || ((sameDay ? im.expiry >= after : im.expiry > after) && (!knownFirst || im.expiry <= knownFirst))) && age >= 0 && age <= 5;
  };
  const previous = () => valid(stored) ? stored : null;
  // EOD 체인은 세션마다 한 번 바뀐다 — 마지막으로 끝난 정규장 세션의 관측이 이미 있으면 다시 조회하지 않는다
  // (운영 검토 10/20: 모든 행 매시 재조회 = 공급사 호출 약 12배). 값이 없거나 옛 세션이면 기존처럼 1시간 간격.
  const storedSession = valid(stored) ? impliedMoveFields(stored).impliedMoveSession : null;
  const current = !!storedSession && storedSession >= etLastClosedSessionDate();
  if (!probe || current || (cached && (!stored || valid(stored)) && Date.now() - cached.checkedAt < 3600_000)) return previous();
  const bg = bgStore.getStore();
  const closed = () => !!bg?.tripped || (deadlineMs != null && Date.now() >= deadlineMs);
  if (closed()) return previous();
  const closes = await withinImpliedDeadline(() => readEodCloses(), deadlineMs)
    .catch(error => { if (error instanceof ImpliedDeadlineError) throw error; return null; });
  const spot = Number(structure?.underlyingPrice) > 0 ? Number(structure.underlyingPrice) : closes?.rows.get(ticker)?.c;
  if (!(typeof spot === 'number' && Number.isFinite(spot) && spot > 0)) return previous();
  const save = async (im: EarningsMove | null) => {
    if (closed()) return previous();
    if (receipt.save === false) return im;
    await withinImpliedDeadline(() => setInCache(key, { im, checkedAt: Date.now() }, 36 * 3600), deadlineMs).catch(() => false);
    return im;
  };
  try {
    const { getOptionChainSnapshotIntrinio, getOptionExpirationsEodIntrinio } = await import('@/services/intrinioClient');
    if (closed()) return previous();
    const yesterday = new Date(Date.parse(today) - DAY).toISOString().slice(0, 10);
    const actual = await withinImpliedDeadline(() => getOptionExpirationsEodIntrinio(ticker, yesterday), deadlineMs);
    if (closed()) return previous();
    if (!actual) return save(previous());
    const expiries = [...new Set(actual.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e) && e >= optionExpirationFloor()))].sort();
    const eligible = expiries.filter(e => sameDay ? e >= after : e > after);
    const first = eligible[0];
    receipt.onFirstExpiry?.(first ?? null);
    if (!first) return save(null);
    const fetchExpiry = async (expiry: string): Promise<{ im: ImpliedMove; rows: any[] } | null> => {
      if (closed()) return null;
      const saw429 = bg?.saw429 ?? 0;
      const response = await withinImpliedDeadline(() => getOptionChainSnapshotIntrinio(ticker, { expiration: expiry, underlyingPrice: spot }), deadlineMs);
      if (closed() || (bg && bg.saw429 > saw429)) return null;
      if (!response || response.partial || response.vendorFailed || response.expirationsMissing?.length || response.expirationsTruncated?.length) return null;
      const rows = (response.results || []).filter((c: any) => c?.details?.expiration_date === expiry);
      const dates = [...new Set<string>(rows.map((c: any) => c?._intrinio?.date).filter((d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))];
      if (dates.length !== 1 || rows.some((c: any) => c?._intrinio?.date !== dates[0])) return null;
      const close = closes?.date === dates[0] ? closes.rows.get(ticker)?.c : null;
      if (!(typeof close === 'number' && Number.isFinite(close) && close > 0)) return null;
      const im = atmStraddleImpliedMove(eodQuoteRows(rows), close, { expiry, chainDate: dates[0] });
      return valid(im, false) ? { im, rows } : null;
    };
    // A missing quote on the first expiry must not select a later contract.
    const post = await fetchExpiry(first);
    if (closed()) return previous();
    if (!post) return save(stored?.expiry === first ? previous() : null);
    if (expiryMethod(first) === 'weekly') return save({ ...post.im, method: 'weekly' });
    // A monthly nearest expiry on a weekly-listed ticker is already the first event expiry.
    // Missing weekly quotes never proves that the ticker has no weekly expiries.
    if (expiries.some(e => expiryMethod(e) === 'weekly')) return save({ ...post.im, method: 'monthly' });
    const preExpiry = expiries.filter(e => sameDay ? e < after : e <= after).pop();
    const pre = preExpiry ? await fetchExpiry(preExpiry) : null;
    if (closed()) return previous();
    return save(pre ? splitMonthlyEvent(post.im, post.rows, pre.rows, after, sameDay) : { ...post.im, method: 'monthly' });
  } catch (error) {
    if (error instanceof ImpliedDeadlineError) { if (bg) bg.tripped = true; throw error; }
    if (bg?.tripped || (error as any)?.status === 429) return previous();
    return save(previous());
  }
}
