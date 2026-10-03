// ============================================================================
// 옵션 레벨 «공급사 체인 지연» 판정 — 순수 함수만(네트워크·캐시·DOM 없음). 시험: tests/levelsSupplierDelay.test.ts
// ----------------------------------------------------------------------------
// [사례 — 10/1 대표 제보] «내 종목» SNDK 지도가 «레벨 갱신 대기»로만 가려졌다. 공급사(Intrinio)가 SNDK 옵션 EOD 를
//   9/25 뒤 며칠 보내지 않았다(date=9/28·9/29 질의 0행 · 같은 시각 MU 는 9/29 670계약 · 40종목 중 SNDK 만).
//   우리 수집·가드·캐시는 정상이었고 가림도 맞았다(9/25 값은 나스닥 9/29 와 달랐다). 틀린 것은 «이유 없는 가림» —
//   오지 않을 갱신을 약속하는 글자라 앱 버그처럼 보였다. 10/3 자연 복구(chainDate 10/1).
//
// [규칙] 가리는 기준은 화면과 같은 함수 하나 — isTooStaleLevels(기대 판본보다 2거래일 이상 늦음, ET 달력·휴장 포함).
//   서버(structureService)가 같은 함수로 «왜 가리는가»를 판정해 API 에 싣고(levelsStaleReason·levelsStaleAsOf),
//   화면·위젯은 그 이유를 글자로 보인다. 이유는 둘이다:
//     'supplier-delay' — ① 지금 너무 오래됐다 ② «받을 때»도 이미 너무 오래됐다(우리가 늦게 받은 게 아니라 공급사가 옛 체인을 줬다)
//                        ③ 다른 종목은 최신 세션이다(공급사 최신 체인 날짜 refChainDate 가 너무 오래되지 않았고 이 종목보다 뒤)
//     'stale'          — 그 밖: 전 종목이 늦음(우리 쪽·공급사 전체 — 대표 10/1 «전 종목 지연 = 우리 쪽 문제») ·
//                        우리가 아직 다시 받지 않음(받을 땐 멀쩡했다) · 기준(refChainDate)을 모름
//     null             — 가리지 않는다(너무 오래되지 않았다) · 날짜를 모른다
//   refChainDate = 저장된 판본들이 본 «가장 늦은 체인 날짜»(공급사가 다른 종목에 이미 내보낸 세션 — structureService 가
//   판본을 저장할 때 앞으로만 민다). 한 종목의 늦음은 그 날짜를 끌어내리지 못하고, 전 종목이 멈추면 그 날짜도 같이 늙는다.
// ============================================================================

import { fmtMD, isTooStaleLevels } from '@/lib/app/watchlistInsights';

export type LevelsStaleReason = 'supplier-delay' | 'stale';

const YMD = /^\d{4}-\d{2}-\d{2}/;
const ymd = (d: unknown): string | null => (typeof d === 'string' && YMD.test(d) ? d.slice(0, 10) : null);

export interface StaleInput {
  /** 이 종목 레벨이 계산된 체인의 EOD 날짜(판본 chainDate) */
  chainDate?: string | null;
  /** 그 체인을 공급사에서 «받은» 시각(ms) — chainFetchedAt */
  fetchedAt?: number | null;
  /** 다른 종목이 이미 받은 가장 늦은 체인 날짜(공급사 최신 세션) */
  refChainDate?: string | null;
}

/** 레벨을 가리는 까닭(위 규칙). 가리지 않으면 null. */
export function levelsStaleReason(x: StaleInput, nowMs: number): LevelsStaleReason | null {
  const d = ymd(x.chainDate);
  if (!d || !isTooStaleLevels(d, nowMs)) return null;
  const ref = ymd(x.refChainDate);
  const f = Number(x.fetchedAt);
  // 받은 시각이 지금보다 뒤(시계 어긋남)면 증거로 쓰지 않는다 — 1분 여유
  const fetchedStale = Number.isFinite(f) && f > 0 && f <= nowMs + 60_000 && isTooStaleLevels(d, f);
  if (fetchedStale && ref && ref > d && !isTooStaleLevels(ref, nowMs)) return 'supplier-delay';
  return 'stale';
}

/** API 에 싣는 한 쌍 — 이유가 있을 때만 기준일(체인 날짜)을 싣는다. */
export function staleFields(x: StaleInput, nowMs: number): { levelsStaleReason: LevelsStaleReason | null; levelsStaleAsOf: string | null } {
  const reason = levelsStaleReason(x, nowMs);
  return { levelsStaleReason: reason, levelsStaleAsOf: reason ? ymd(x.chainDate) : null };
}

/**
 * 판본의 체인을 공급사에서 받은 시각 — 수집기·온디맨드 프로브로 계산했으면 그 프로브를 쓴 시각(debug.probeTs),
 * 벤더에서 직접 받았으면 판본을 만든 시각(저장 시각). 모르면 null(증거로 쓰지 않는다 → 'stale').
 */
export function chainFetchedAt(data: any, storedAt?: number | null): number | null {
  const dbg = data?.debug;
  if (dbg?.chainSource === 'lambda-probe') {
    const p = Number(dbg.probeTs);
    return p > 0 ? p : null;
  }
  const a = Number(storedAt ?? data?.levelsAsOf);
  return a > 0 ? a : null;
}

// ── 기록(EC2 Redis 전용 — redisClient EC2_ONLY_PREFIXES 의 levels: · Upstash 에 쓰지 않는다) ──────────────

/** 공급사 최신 체인 날짜(판본 저장 때 앞으로만 민다) — { date, seenAt, ticker } */
export const VENDOR_EOD_KEY = 'levels:vendor-eod:v1';
export const VENDOR_EOD_TTL_SEC = 14 * 86400;
/** 공급사 체인 지연 감지 기록 — ET 날짜별 한 키: { [ticker]: { asOf, ref, firstSeen, lastSeen, fetchedAt } } */
export const supplierDelayKey = (etDate: string) => `levels:supplier-delay:${etDate}`;
export const SUPPLIER_DELAY_TTL_SEC = 14 * 86400;

export type SupplierDelayEntry = { asOf: string; ref: string | null; firstSeen: number; lastSeen: number; fetchedAt: number | null };

/** 그날 기록에 한 종목을 더한다(순수 — 기존 기록을 바꾸지 않고 새 객체). 같은 종목·같은 기준일이면 lastSeen 만 민다. */
export function mergeSupplierDelay(
  prev: Record<string, SupplierDelayEntry> | null | undefined,
  ticker: string, e: { asOf: string; ref: string | null; at: number; fetchedAt: number | null },
): Record<string, SupplierDelayEntry> {
  const out: Record<string, SupplierDelayEntry> = { ...(prev && typeof prev === 'object' ? prev : {}) };
  const cur = out[ticker];
  out[ticker] = cur && cur.asOf === e.asOf
    ? { ...cur, ref: e.ref, lastSeen: e.at, fetchedAt: e.fetchedAt ?? cur.fetchedAt }
    : { asOf: e.asOf, ref: e.ref, firstSeen: e.at, lastSeen: e.at, fetchedAt: e.fetchedAt };
  return out;
}

const ET_HM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** 운영 로그 한 줄 — «[levels] 공급사 체인 지연 SNDK · 9/25 기준 (공급사 최신 9/29 · 받은 시각 9/30 10:01 ET)» */
export function supplierDelayLogLine(ticker: string, asOf: string, ref: string | null, fetchedAt: number | null): string {
  const got = fetchedAt ? ET_HM.format(new Date(fetchedAt)).replace(',', '').replace(/\b24:/, '00:') : '?';
  return `[levels] 공급사 체인 지연 ${ticker} · ${fmtMD(asOf)} 기준 (공급사 최신 ${ref ? fmtMD(ref) : '?'} · 받은 시각 ${got} ET)`;
}
