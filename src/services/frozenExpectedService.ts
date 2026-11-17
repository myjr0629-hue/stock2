// ============================================================================
// «발표 전 예상 변동폭» 고정값 — 읽기·적어 두기 (2026-11-18 · 규칙은 lib/earnings/frozenExpected.ts)
//
// 읽기(readFrozenExpected): 고정 시각(기준 세션 마감)이 지난 발표만.
//   ① 고정 기록 mget 1회(EC2 우선) → ② 없거나 src≠flash 이고 발표 6일 안이면 Upstash 발표 알림 키(ev·exp) mget 1회
//   (인스턴스 기억 2분 — 같은 빈 키를 요청마다 읽지 않는다) → ③ 실적 반응 기록 mget 1회 → ④ 묶음 칸 «발표 전 세션» 예비(표시 전용).
//   persist 면 ②에서 찾은 값을 고정 기록으로 적는다(다음부터 ①에서 끝난다 · Upstash 키 수명 3~5일이 지나도 숫자가 바뀌지 않게).
//   공급사 호출 0 · AI 0. 실패는 조용히 «없음»(지금 화면 규칙으로 돌아간다).
// 적기(persistPackFreezes): 묶음 갱신이 고정 시각 뒤 첫 갱신에서 «마감 직전 묶음»의 칸을 고정 기록(src pack)으로 — 기록이 없을 때만.
// ============================================================================

import { Redis } from '@upstash/redis';
import { mgetFromCache, setInCache } from '@/services/redisClient';
import { actualsKey } from '@/lib/earnings/earningsActuals';
import { impliedRowKey, type ImpliedPack } from '@/lib/earnings/earningsImplied';
import {
  FROZEN_EXPECTED_TTL_SEC, freezeMsOf, frozenExpectedKey, frozenFromActuals, frozenFromPackFallback, frozenFromPrevPack, isFrozenTime,
  packFirstExpiry, parseFrozenExpected, type FrozenEvent, type FrozenExpected,
} from '@/lib/earnings/frozenExpected';
import { frozenFromFlashKeys } from '@/lib/earnings/frozenExpectedFlash';
import { FLASH_KEYS, type FlashEntry } from '@/lib/signals/earningsFlash';
import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';

/** 발표 알림 키(ev 3일 · exp 5일)를 볼 기간 — 고정 시각 뒤 */
const FLASH_LOOKBACK_MS = 6 * 86400_000;
const FLASH_MEMO_MS = 2 * 60_000;
const MGET_CHUNK = 50;

let upstash: Redis | null | undefined;
function upstashClient(): Redis | null {
  if (upstash !== undefined) return upstash;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  upstash = url && token ? new Redis({ url, token, retry: { retries: 0 } }) : null;
  return upstash;
}
/** 시험용 */
export function _setFrozenUpstash(client: { mget: (...keys: string[]) => Promise<unknown[]> } | null): void {
  upstash = client as unknown as Redis | null;
  flashMemo.clear();
}

/** 인스턴스 기억 — 키 → { 값(없으면 null), 만료 } */
const flashMemo = new Map<string, { v: FrozenExpected | null; until: number }>();

const confirmedTime = new Map<string, string>();
for (const c of CONFIRMED_EARNINGS) if (c.etTime) confirmedTime.set(impliedRowKey(c.ticker, c.date), c.etTime);
/** 회사 공지 발표 시각(ET) — 확인 목록(회사 공지)의 같은 (종목, 날짜) 시각만. 캘린더 행의 공급사 시각은 옛 날짜 값일 수 있어 쓰지 않는다(관문 11/13). */
export const etTimeOf = (e: { ticker: string; date: string }): string | null => confirmedTime.get(impliedRowKey(e.ticker, e.date)) ?? null;

async function mgetChunked(keys: string[]): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < keys.length; i += MGET_CHUNK) {
    const part = keys.slice(i, i + MGET_CHUNK);
    const vals = await mgetFromCache<unknown>(part).catch(() => part.map(() => null));
    out.push(...(Array.isArray(vals) ? vals : part.map(() => null)));
  }
  return out;
}

function dedupe(events: readonly FrozenEvent[], nowMs: number): FrozenEvent[] {
  const seen = new Set<string>();
  const out: FrozenEvent[] = [];
  for (const e of events) {
    if (!e?.ticker || !isFrozenTime(e, nowMs)) continue;
    const k = impliedRowKey(e.ticker, e.date);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ticker: String(e.ticker).toUpperCase(), date: e.date, hour: e.hour, etTime: etTimeOf(e) });
  }
  return out;
}

/** 고정 기록만(①) — 채점용 기록 덧입히기가 쓴다. 키 «티커|발표일» → 고정값 */
export async function readFrozenRecords(events: readonly FrozenEvent[], nowMs: number = Date.now()): Promise<Map<string, FrozenExpected>> {
  const out = new Map<string, FrozenExpected>();
  try {
    const evs = dedupe(events, nowMs);
    if (!evs.length) return out;
    const vals = await mgetChunked(evs.map((e) => frozenExpectedKey(e.ticker, e.date)));
    evs.forEach((e, i) => { const f = parseFrozenExpected(vals[i], e); if (f) out.set(impliedRowKey(e.ticker, e.date), f); });
  } catch { /* 없음 */ }
  return out;
}

/**
 * 고정 시각이 지난 발표의 고정값. 키 «티커|발표일». 고정 전 발표·시각 미정 발표는 담지 않는다(호출자는 지금 값 그대로).
 *   opts.pack = 이미 읽은 묶음(④ 예비용) · opts.flash = ② Upstash 를 볼까(기본 true) · opts.persist = ②에서 찾은 값을 고정 기록으로 적을까
 */
export async function readFrozenExpected(
  events: readonly FrozenEvent[],
  nowMs: number = Date.now(),
  opts: { pack?: ImpliedPack | null; flash?: boolean; persist?: boolean; actuals?: boolean } = {},
): Promise<Map<string, FrozenExpected>> {
  const out = new Map<string, FrozenExpected>();
  try {
    const evs = dedupe(events, nowMs);
    if (!evs.length) return out;
    const stored = await readFrozenRecords(evs, nowMs);
    for (const [k, f] of stored) out.set(k, f);
    const fromFlash: FrozenEvent[] = [];

    // ② 발표 알림 키 — 고정 기록이 없거나 flash 가 아닌 발표(6일 안)
    if (opts.flash !== false) {
      const want = evs.filter((e) => out.get(impliedRowKey(e.ticker, e.date))?.src !== 'flash'
        && nowMs - (freezeMsOf(e.date, e.hour) ?? 0) <= FLASH_LOOKBACK_MS);
      const ask: FrozenEvent[] = [];
      for (const e of want) {
        const m = flashMemo.get(impliedRowKey(e.ticker, e.date));
        if (m && m.until > nowMs) { if (m.v) { out.set(impliedRowKey(e.ticker, e.date), m.v); fromFlash.push(e); } } else ask.push(e);
      }
      const client = ask.length ? upstashClient() : null;
      if (client && ask.length) {
        const keys = [...ask.map((e) => FLASH_KEYS.ev(e.ticker, e.date)), ...ask.map((e) => FLASH_KEYS.exp(e.ticker, e.date))];
        const vals = await Promise.race([
          client.mget(...keys).catch(() => null),
          new Promise<null>((res) => setTimeout(() => res(null), 2500)),
        ]) as unknown[] | null;
        if (Array.isArray(vals)) {
          ask.forEach((e, i) => {
            const entry: FlashEntry = { ticker: e.ticker, date: e.date, hour: e.hour as FlashEntry['hour'], etTime: e.etTime ?? null };
            const f = frozenFromFlashKeys(entry, vals[i], vals[ask.length + i]);
            const k = impliedRowKey(e.ticker, e.date);
            flashMemo.set(k, { v: f, until: nowMs + FLASH_MEMO_MS });
            if (!f) return;
            out.set(k, f);
            fromFlash.push(e);
          });
        }
      }
    }

    // ③ 실적 반응 기록의 마감 관측 — 값이 없는 발표는 그 값, 만기를 모르는 고정값은 그 발표의 만기(발표 뒤 첫 만기 — 숫자와 무관)를 빌린다
    const rest = evs.filter((e) => !out.has(impliedRowKey(e.ticker, e.date)) || out.get(impliedRowKey(e.ticker, e.date))!.expiry == null);
    if (rest.length && opts.actuals !== false) {
      const vals = await mgetChunked(rest.map((e) => actualsKey(e.ticker, e.date)));
      rest.forEach((e, i) => {
        const k = impliedRowKey(e.ticker, e.date);
        const a = frozenFromActuals(e, vals[i]);
        if (!a) return;
        const cur = out.get(k);
        if (!cur) out.set(k, a);
        else if (cur.expiry == null && a.expiry) out.set(k, { ...cur, expiry: a.expiry });
      });
    }

    // ④ 표시 전용 예비 — 묶음 칸 중 발표 전 세션 값 · 만기를 모르는 고정값엔 묶음 칸의 «발표 뒤 첫 만기»(f)
    if (opts.pack) {
      for (const e of evs) {
        const k = impliedRowKey(e.ticker, e.date);
        const cur = out.get(k);
        if (!cur) { const p = frozenFromPackFallback(e, opts.pack); if (p) out.set(k, p); continue; }
        if (cur.expiry == null) {
          const first = packFirstExpiry(e, opts.pack);
          if (first) out.set(k, { ...cur, expiry: first });
        }
      }
    }

    // ②에서 찾은 알림 값을 고정 기록으로(만기를 채운 뒤) — 다음부터 ①에서 끝난다
    if (opts.persist && fromFlash.length) {
      const writes = fromFlash.map((e) => {
        const f = out.get(impliedRowKey(e.ticker, e.date));
        return f ? setInCache(frozenExpectedKey(e.ticker, e.date), f, FROZEN_EXPECTED_TTL_SEC).catch(() => false) : Promise.resolve(false);
      });
      await Promise.race([Promise.all(writes), new Promise((res) => setTimeout(res, 1500))]);
    }
  } catch { /* 없음 — 호출자는 지금 규칙 */ }
  return out;
}

/**
 * 묶음 갱신 뒤 — 고정 시각을 막 지난 발표의 «마감 직전 묶음» 칸을 고정 기록(src pack)으로 적는다. 이미 기록이 있으면 쓰지 않는다.
 *   직전 묶음이 고정 시각 전 2시간 안에 만들어진 경우만(그러니 사실상 고정 뒤 첫 갱신 한 번). 돌려주는 값 = 적은 수.
 */
export async function persistPackFreezes(
  rows: ReadonlyArray<{ ticker: string; date: string; hour?: string | null }>,
  prev: ImpliedPack | null | undefined,
  nowMs: number = Date.now(),
): Promise<number> {
  try {
    if (!prev || prev.v !== 1 || !prev.cells) return 0;
    const cands = dedupe(rows, nowMs).map((e) => ({ e, f: frozenFromPrevPack(e, prev) })).filter((x) => x.f);
    if (!cands.length) return 0;
    const have = await mgetChunked(cands.map((x) => frozenExpectedKey(x.e.ticker, x.e.date)));
    let n = 0;
    for (let i = 0; i < cands.length; i++) {
      if (have[i] != null) continue;
      if (await setInCache(frozenExpectedKey(cands[i].e.ticker, cands[i].e.date), cands[i].f, FROZEN_EXPECTED_TTL_SEC).catch(() => false)) n++;
    }
    return n;
  } catch {
    return 0;
  }
}
