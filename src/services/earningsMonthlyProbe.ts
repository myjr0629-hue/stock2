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

/**
 * 그 발표의 «마감 관측» + 발표 직후 첫 만기(first).
 *   first = 공급사 만기 목록에서 확인한 첫 만기(BMO = 발표일 포함, AMC·미정 = 다음 날부터). 목록을 못 봤으면 null(모름).
 *   [10/31 첫 만기 통일] 값(im)은 그 첫 만기의 관측만 — 뒤 월물로 대체하지 않는다. 첫 만기 조회가 실패하면
 *   «이미 확인된 그 첫 만기 값»(저장본)을 그대로 두고(마지막 정상값 유지), 한 번도 못 구했으면 null.
 */
export interface EarningsObservation { im: EarningsMove | null; first: string | null }

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Ordinary readers only read this dated observation. Only the background pack refresh may collect. */
export async function earningsMonthlyMove(
  ticker: string, after: string, sameDay: boolean, structure: any, probe: boolean, deadlineMs?: number,
  receipt: { pastDays?: number; save?: boolean } = {},
): Promise<EarningsMove | null> {
  return (await earningsEventObservation(ticker, after, sameDay, structure, probe, deadlineMs, receipt)).im;
}

export async function earningsEventObservation(
  ticker: string, after: string, sameDay: boolean, structure: any, probe: boolean, deadlineMs?: number,
  // 실적 영수증 전용(earningsActualsService) — 화면 호출자는 넘기지 않는다(기본값 = 기존 동작 그대로).
  //   pastDays: 발표일이 지난 뒤에도 그 발표의 관측을 읽는다 · save:false: 조회 결과를 공유 관측 키에 쓰지 않는다(화면이 읽는 키 불변).
  receipt: { pastDays?: number; save?: boolean } = {},
): Promise<EarningsObservation> {
  const today = etDateOf(Date.now());
  const distance = (Date.parse(`${after}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY;
  if (distance < -Math.max(0, receipt.pastDays ?? 0) || distance > 45) return { im: null, first: null };
  const key = earningsObservationKey(ticker, after, sameDay);
  const cached = await withinImpliedDeadline(() => getFromCache<{ im: EarningsMove | null; checkedAt: number; first?: string | null }>(key), deadlineMs)
    .catch(error => { if (error instanceof ImpliedDeadlineError) throw error; return null; });
  const stored = cached?.im ?? null;
  const valid = (im: ImpliedMove | null, requirePost = true): im is ImpliedMove => {
    const f = impliedMoveFields(im);
    const age = f.impliedMoveSession ? (Date.parse(today) - Date.parse(f.impliedMoveSession)) / DAY : Infinity;
    return f.impliedMovePct != null && !!im?.expiry && im.expiry >= optionExpirationFloor()
      && (!requirePost || (sameDay ? im.expiry >= after : im.expiry > after)) && age >= 0 && age <= 5;
  };
  // 저장 때 확인한 첫 만기. 옛 저장본(first 없음)은 만든 규칙으로 판단한다 — weekly·event-split 은 «첫 만기 조회 성공»으로만
  //   저장됐다. monthly 는 «첫 만기가 월물»일 수도, «첫 만기 실패 뒤 월물 대체»일 수도 있어 모름(null) — 그 값은 내지 않는다.
  let first: string | null = typeof cached?.first === 'string' && ISO.test(cached.first) ? cached.first
    : valid(stored) && (stored as EarningsMove).method !== 'monthly' ? stored.expiry : null;
  // 첫 만기를 알면 그 만기의 저장본만 «이전 값»이다(뒤 만기 저장본은 이어 쓰지 않는다).
  const previous = () => valid(stored) && (!first || stored.expiry === first) ? stored : null;
  // 내보내는 값은 «첫 만기로 확인된 관측»뿐 — 첫 만기를 모르는 옛 월물 저장본은 값으로 내지 않는다(관문 10311136 ①).
  const out = (im: EarningsMove | null): EarningsObservation => ({ im: im && first && im.expiry === first ? im : null, first });
  // EOD 체인은 세션마다 한 번 바뀐다 — 마지막으로 끝난 정규장 세션의 관측이 이미 있으면 다시 조회하지 않는다
  // (운영 검토 10/20: 모든 행 매시 재조회 = 공급사 호출 약 12배). 값이 없거나 옛 세션이면 기존처럼 1시간 간격.
  //   첫 만기를 모르는 옛 저장본은 «최신»으로 보지 않는다 — 다음 갱신이 만기 목록을 한 번 확인한다.
  const storedSession = previous() && first ? impliedMoveFields(stored).impliedMoveSession : null;
  const current = !!storedSession && storedSession >= etLastClosedSessionDate();
  if (!probe || current || (cached && Date.now() - cached.checkedAt < 3600_000)) return out(previous());
  const bg = bgStore.getStore();
  const closed = () => !!bg?.tripped || (deadlineMs != null && Date.now() >= deadlineMs);
  if (closed()) return out(previous());
  const closes = await withinImpliedDeadline(() => readEodCloses(), deadlineMs)
    .catch(error => { if (error instanceof ImpliedDeadlineError) throw error; return null; });
  const spot = Number(structure?.underlyingPrice) > 0 ? Number(structure.underlyingPrice) : closes?.rows.get(ticker)?.c;
  if (!(typeof spot === 'number' && Number.isFinite(spot) && spot > 0)) return out(previous());
  const save = async (im: EarningsMove | null): Promise<EarningsObservation> => {
    if (closed()) return out(previous());
    if (receipt.save === false) return out(im);
    await withinImpliedDeadline(() => setInCache(key, { im, checkedAt: Date.now(), first }, 36 * 3600), deadlineMs).catch(() => false);
    return out(im);
  };
  try {
    const { getOptionChainSnapshotIntrinio, getOptionExpirationsEodIntrinio } = await import('@/services/intrinioClient');
    if (closed()) return out(previous());
    const yesterday = new Date(Date.parse(today) - DAY).toISOString().slice(0, 10);
    const actual = await withinImpliedDeadline(() => getOptionExpirationsEodIntrinio(ticker, yesterday), deadlineMs);
    if (closed()) return out(previous());
    if (!actual) return save(previous());
    const expiries = [...new Set(actual.filter(e => ISO.test(e) && e >= optionExpirationFloor()))].sort();
    const eligible = expiries.filter(e => sameDay ? e >= after : e > after);
    const head = eligible[0];
    if (!head) return save(previous());
    first = head;
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
    // 첫 만기 하나만 — 호가가 모자라도 뒤 월물로 대체하지 않는다. 그 첫 만기의 이미 확인된 값이 있으면 그대로 둔다.
    const post = await fetchExpiry(head);
    if (closed()) return out(previous());
    if (!post) return save(previous());
    if (expiryMethod(head) === 'weekly') return save({ ...post.im, method: 'weekly' });
    // A monthly nearest expiry on a weekly-listed ticker is already the first event expiry.
    // Missing weekly quotes never proves that the ticker has no weekly expiries.
    if (expiries.some(e => expiryMethod(e) === 'weekly')) return save({ ...post.im, method: 'monthly' });
    const preExpiry = expiries.filter(e => sameDay ? e < after : e <= after).pop();
    const pre = preExpiry ? await fetchExpiry(preExpiry) : null;
    if (closed()) return out(previous());
    return save(pre ? splitMonthlyEvent(post.im, post.rows, pre.rows, after, sameDay) : { ...post.im, method: 'monthly' });
  } catch (error) {
    if (error instanceof ImpliedDeadlineError) { if (bg) bg.tripped = true; throw error; }
    if (bg?.tripped || (error as any)?.status === 429) return out(previous());
    return save(previous());
  }
}
