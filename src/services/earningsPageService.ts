// ============================================================================
// 종목별 실적 페이지(/[locale]/earnings/*)·사이트맵이 읽는 «저장본 묶음» 한 벌 (2026-11-12)
//
// ⛔ 부작용 없음: 공급사(FMP·Intrinio·Finnhub) 호출 0 · AI 0 · Redis 쓰기 0 · 캘린더/묶음 재생성 0.
//   · 실적 캘린더: 6시간 저장본 → 없으면 마지막 정상본(:last-good)만 읽는다. getMarketEarningsCalendar 는 미스 때 FMP 를 다시 부르므로 쓰지 않는다.
//     회사 공지 덮기(withConfirmedDates)는 순수 함수라 그대로 입힌다(화면들과 같은 날짜).
//   · 예상 변동폭: 실적 묶음(earnings:implied:v1) GET 1회 — 낡아도 다시 만들지 않는다(실적 캘린더 API 가 만든다).
//   · 채점: 지난 회사 공지 (종목, 발표일) 키 MGET(50키씩) — 채점표 API 와 같은 키·파서.
//   인스턴스 메모 5분 + 동시 요청 하나로 합치기 → 페이지가 수백 개여도 저장소 읽기는 인스턴스당 5분에 몇 번뿐.
// ============================================================================

import { getFromCache, mgetFromCacheStrict } from '@/services/redisClient';
import { EARNINGS_CALENDAR_CACHE_KEY, EARNINGS_CALENDAR_LAST_GOOD_KEY, withConfirmedDates, type EarningsCalendarPayload } from '@/services/earningsCalendarService';
import { readImpliedPack } from '@/services/earningsImpliedService';
import { impliedRowKey, type ImpliedCell } from '@/lib/earnings/earningsImplied';
import { actualsKey, parseRecord } from '@/lib/earnings/earningsActuals';
import { emptySnapshot, nextByTicker, pastConfirmedEntries, type EarningsPageSnapshot } from '@/lib/seo/earningsPage';

const MEMO_MS = 5 * 60_000;
/** 읽기 실패가 섞인 묶음은 짧게만 기억한다(곧 다시 읽게) */
const PARTIAL_MEMO_MS = 30_000;
const MGET_CHUNK = 50;
/** 페이지가 매달리지 않게 — 넘으면 빈 묶음(→ noindex·«지금 읽지 못함») */
export const EARNINGS_PAGE_READ_TIMEOUT_MS = 4000;

let memo: { at: number; ttl: number; snap: EarningsPageSnapshot } | null = null;
let inFlight: Promise<EarningsPageSnapshot> | null = null;

export function _resetEarningsPageMemo(): void { memo = null; inFlight = null; }

async function readCalendar(): Promise<EarningsCalendarPayload | null> {
  const ok = (p: any): p is EarningsCalendarPayload => Boolean(p && p.ok === true && Array.isArray(p.rows));
  const cur = await getFromCache<EarningsCalendarPayload>(EARNINGS_CALENDAR_CACHE_KEY).catch(() => null);
  if (ok(cur) && cur.rows.length) return cur;
  const last = await getFromCache<EarningsCalendarPayload>(EARNINGS_CALENDAR_LAST_GOOD_KEY).catch(() => null);
  return ok(last) && last.rows.length ? last : null;
}

async function readRecords(nowMs: number): Promise<{ ok: boolean; records: Record<string, unknown[]> }> {
  const entries = pastConfirmedEntries(nowMs);
  const records: Record<string, unknown[]> = {};
  let ok = true;
  for (let i = 0; i < entries.length; i += MGET_CHUNK) {
    const part = entries.slice(i, i + MGET_CHUNK);
    try {
      const values = await mgetFromCacheStrict<unknown>(part.map((e) => actualsKey(e.ticker, e.date)));
      part.forEach((e, j) => {
        const v = values[j];
        // 채점표 API(readEarningsScorecard)와 같은 조건 — 기록의 종목·발표일·장전/장후가 지금의 회사 공지와 같을 때만
        const r = parseRecord(v);
        if (!r || r.ticker !== e.ticker || r.date !== e.date || r.hour !== e.hour) return;
        (records[e.ticker] ||= []).push(v);
      });
    } catch {
      ok = false;
    }
  }
  return { ok, records };
}

async function build(nowMs: number): Promise<EarningsPageSnapshot> {
  const snap = emptySnapshot(nowMs);
  const [cal, pack, rec] = await Promise.all([
    readCalendar().catch(() => null),
    readImpliedPack().catch(() => null),
    readRecords(nowMs).catch(() => ({ ok: false, records: {} })),
  ]);
  if (cal) {
    let rows = cal.rows;
    try { rows = withConfirmedDates(cal).rows; } catch { /* 덮기 실패 — 원천 그대로 */ }
    snap.calendarOk = true;
    snap.calendarAt = typeof cal.generatedAt === 'string' ? cal.generatedAt : null;
    snap.next = nextByTicker(rows, nowMs);
  }
  if (pack) {
    snap.packAt = pack.at ?? null;
    snap.packDay = pack.day ?? null;
    const cells: Record<string, ImpliedCell> = {};
    for (const r of Object.values(snap.next)) {
      const k = impliedRowKey(r.ticker, r.date);
      if (pack.cells[k]) cells[k] = pack.cells[k];
    }
    snap.cells = cells;
  }
  snap.recordsOk = rec.ok;
  snap.records = rec.records;
  return snap;
}

/** 묶음 한 벌 — 메모(5분) → 진행 중인 읽기 합류 → 새로 읽기(상한 4초). 던지지 않는다. */
export async function readEarningsPageSnapshot(nowMs: number = Date.now()): Promise<EarningsPageSnapshot> {
  if (memo && nowMs - memo.at >= 0 && nowMs - memo.at < memo.ttl) return memo.snap;
  if (!inFlight) {
    inFlight = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const snap = await Promise.race([
          build(nowMs),
          new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), EARNINGS_PAGE_READ_TIMEOUT_MS); }),
        ]);
        if (!snap) return memo?.snap ?? emptySnapshot(nowMs);
        const complete = snap.calendarOk && snap.recordsOk && snap.packAt != null;
        memo = { at: nowMs, ttl: complete ? MEMO_MS : PARTIAL_MEMO_MS, snap };
        return snap;
      } catch {
        return memo?.snap ?? emptySnapshot(nowMs);
      } finally {
        if (timer) clearTimeout(timer);
        inFlight = null;
      }
    })();
  }
  return inFlight;
}
