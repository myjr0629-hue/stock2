// ============================================================================
// lastSession — reconstruct the last completed regular trading session
// ----------------------------------------------------------------------------
// WHY: On a market HOLIDAY (a weekday the market is closed, e.g. US Independence
// Day observed), Polygon's live snapshot has an EMPTY day bar: `day.c === 0`,
// `afterHours.p` is null, `lastTrade.p`/`min.c` are 0. `prevDay.c` holds the last
// real session's regular close but there is no field for the session BEFORE it,
// so change% can't be derived and after-hours is gone.
//
// On weekends this doesn't happen (the snapshot keeps Friday's bar), which is why
// only holidays (and holiday-adjacent weekends) break. Price paths branch only on
// `session === 'closed'`, treating a holiday like a weekend — so the weekend
// fallbacks silently collapse to `prevClose` (change 0.00%, POST mirrors regular).
//
// This helper rebuilds the last session from DURABLE Polygon history:
//   - daily aggregates (desc) → last two real session closes → regular close + change%
//   - the last session's open-close → its after-hours close → POST price + change%
// so the app always shows the last session's data, holiday or not.
//
// Only call this for tickers whose snapshot day bar is empty on a CLOSED session
// (i.e. `session === 'closed' && !snap.day.c`), so normal regular/pre/post/weekend
// behavior is never touched.
// ============================================================================

import { fetchMassive, CACHE_POLICY } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';

// 직전 «완료된» 세션의 종가는 다음 개장까지 변하지 않는다. 그런데도 티커마다
// 벤더 호출 2회(일봉 + open-close)를 매 요청마다 했다. 휴장일 아침처럼 요청이
// 몰리면 쿼터에 걸려 «조용히 누락»되고, 누락된 티커는 호출부의 깨진 폴백으로
// 되돌아간다 — 2026-09-07 실측: 운영에서 8종목 중 5종목이 그렇게 틀렸다.
// (프리뷰에선 22/22 맞았다. 부하가 없었기 때문이다.)
const LS_TTL = 6 * 3600;
// 키에 날짜를 넣는다 — 캐시가 «날짜를 건너» 남으면 어제 세션을 오늘로 내보낸다.
const lsKey = (t: string, day: string) => `lastsession:v1:${day}:${t}`;

export interface LastSessionData {
  /** last completed regular session close (e.g. Thursday's close) */
  regClose: number;
  /** the session-before close, baseline for the regular change% (e.g. Wednesday) */
  prevClose: number;
  /** (regClose - prevClose) / prevClose * 100 */
  changePct: number;
  /** last session's after-hours close (0 if none / same as regClose) */
  postPrice: number;
  /** (postPrice - regClose) / regClose * 100 (0 when no post) */
  postChangePct: number;
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Reconstruct the last completed trading session for the given tickers.
 * Returns a map keyed by ticker; a ticker is omitted if history is unavailable
 * (caller keeps its existing fallback for those).
 */
export async function reconstructLastSession(
  tickers: string[],
): Promise<Record<string, LastSessionData>> {
  const out: Record<string, LastSessionData> = {};
  if (!tickers.length) return out;

  const to = utcDate(Date.now());
  const from = utcDate(Date.now() - 30 * 86_400_000); // 30d window → always ≥2 sessions

  const missing: string[] = [];

  await Promise.all(
    tickers.map(async (t) => {
      try {
        // ① 캐시 — 직전 세션 종가는 다음 개장까지 불변이다
        const cached = await getFromCache<LastSessionData>(lsKey(t, to)).catch(() => null);
        if (cached && cached.regClose > 0 && cached.prevClose > 0) {
          out[t] = cached;
          return;
        }

        const pullAggs = () =>
          fetchMassive(
            `/v2/aggs/ticker/${t}/range/1/day/${from}/${to}`,
            { adjusted: 'true', sort: 'desc', limit: '3' },
            false,
            undefined,
            CACHE_POLICY.LIVE,
          ).catch(() => null);

        // ② 한 번은 다시 물어본다. 쿼터/일시 실패로 «조용히 누락»되면
        //    호출부가 깨진 폴백으로 되돌아가 전 종목이 보합으로 나간다.
        let aggs = await pullAggs();
        if (!(aggs?.results?.length >= 2)) aggs = await pullAggs();

        const rs: Array<{ c?: number; t?: number }> = aggs?.results || [];
        if (rs.length < 2) { missing.push(t); return; }

        const regClose = rs[0]?.c || 0;
        const prevClose = rs[1]?.c || 0;
        if (!(regClose > 0 && prevClose > 0)) { missing.push(t); return; }

        const changePct = ((regClose - prevClose) / prevClose) * 100;

        // Last session's after-hours from its daily open-close bar.
        let postPrice = 0;
        let postChangePct = 0;
        const lastTs = rs[0]?.t;
        if (lastTs) {
          const oc = await fetchMassive(
            `/v1/open-close/${t}/${utcDate(lastTs)}`,
            { adjusted: 'true' },
            false,
            undefined,
            CACHE_POLICY.LIVE,
          ).catch(() => null);
          const ah = oc?.afterHours || 0;
          // require a real, distinct after-hours print (avoid mirroring the close)
          if (ah > 0 && Math.abs(ah - regClose) / regClose > 0.0001) {
            postPrice = ah;
            postChangePct = ((ah - regClose) / regClose) * 100;
          }
        }

        out[t] = { regClose, prevClose, changePct, postPrice, postChangePct };
        setInCache(lsKey(t, to), out[t], LS_TTL).catch(() => { });
      } catch {
        missing.push(t);
      }
    }),
  );

  // 누락은 «조용히» 넘어가면 안 된다 — 그 티커는 호출부에서 보합으로 나간다.
  if (missing.length) {
    console.warn(`[lastSession] 직전 세션 복원 실패 ${missing.length}종목: ${missing.join(',')}`);
  }

  return out;
}
