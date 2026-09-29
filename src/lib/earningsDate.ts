// ============================================================================
// «다음 실적일» 고르기 — 같은 종목의 실적일은 모든 화면에서 하나다(대표 원칙 «같은 지표는 같이 사용», 2026-09-30)
//
// ★ 규칙(여기 한 곳): FMP 실적 캘린더의 날짜를 쓴다. FMP 에 그 종목의 «오늘(ET) 이후» 행이 없을 때만 Finnhub 날짜.
//   발표 시각(bmo/amc)·분기·EPS 는 Finnhub 행의 «날짜가 FMP 와 같을 때만» 보탠다 — 다른 분기의 값이 섞이지 않게.
//
//   쓰는 곳: Command(/api/live/earnings · /api/command/unified 출구) · 실적 캘린더 · 내 종목 칩 · Intel · 웹 티커 SSR · 랭킹.
//   예전엔 Command·Intel 은 Finnhub(종목당), 캘린더·내 종목 칩은 FMP(시장 전체)였다 — NKE 가 한쪽은 12/16, 한쪽은 10/1.
//
// ★ 근거(실측 2026-09-29, scratchpad earn-audit/comparison.md): 51종목 중 회사 공식 발표(IR·보도자료·SEC)로 확정된 29종목
//     FMP 28/29(96.6%) · Finnhub 23/29(79.3%). 둘이 다른 7건 중 FMP 가 맞은 게 6건.
//     Finnhub 틀린 유형: 분기 건너뜀(NKE 10/1 → 12/16) · 추정일 +7일(TMO·RTX) · 하루(GE) · ADR 행 없음(TSM·ASML)
//     FMP 틀린 유형: 공지 당일 미반영 1건(KO — 9/29 공지 10/27, 캐시엔 추정 10/20)
//     발표 시각은 FMP 에 없다 — Finnhub 시각은 20건 중 19건 맞았다(NEM 은 bmo 로 왔지만 공식은 amc).
//   «확정 여부» 필드는 두 벤더 모두 주지 않는다(FMP stable: symbol·date·eps·revenue·lastUpdated / Finnhub: date·hour·quarter·
//   year·eps·revenue) — 그래서 «확정 표시를 보고 고르는» 규칙은 지금 원천으로는 만들 수 없고, 맞은 비율이 높은 쪽 하나를 쓴다.
//
// 순수 함수만 둔다(서버·클라이언트 공용). 캘린더를 읽고 캐시하는 것은 services/earningsCalendarService.ts.
// ============================================================================

import { daysBetweenYmd, etDateOf } from './marketCalendar';

export type EarningsDateSource = 'fmp' | 'finnhub';

/** 원천 한 행(모양은 느슨하게 받는다 — FMP 캘린더 행 · Finnhub 행 · DynamoDB 수확본) */
export interface EarningsCandidate {
  date?: string | null;
  hour?: string | null;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  quarter?: number | null;
  year?: number | null;
}

export interface NextEarnings {
  /** YYYY-MM-DD — 미국 날짜 */
  date: string;
  /** 'bmo' | 'amc' | 'dmh' | '' (모름) */
  hour: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  quarter: number | null;
  year: number | null;
  /** 날짜를 준 원천 */
  source: EarningsDateSource;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD…' → 'YYYY-MM-DD' · 아니면 null */
export function ymdOf(v: unknown): string | null {
  const s = String(v ?? '').slice(0, 10);
  return YMD.test(s) ? s : null;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 발표 시각 — Finnhub 은 bmo/amc/dmh, FMP(v3)는 'before market open' 같은 문장으로도 온다. 모르면 '' */
export function normalizeEarningsHour(v: unknown): string {
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return '';
  if (s === 'bmo' || s === 'amc' || s === 'dmh') return s;
  if (/after/.test(s)) return 'amc';
  if (/before/.test(s)) return 'bmo';
  if (/during/.test(s)) return 'dmh';
  return '';
}

/** 오늘(ET) 이후 행들 — 날짜 글자로 견준다(서버·기기 시간대와 무관) · 같은 날짜는 한 번만 · 이른 순 */
function upcomingFrom(list: EarningsCandidate[] | null | undefined, todayET: string): Array<{ row: EarningsCandidate; date: string }> {
  const byDate = new Map<string, EarningsCandidate>();
  for (const row of list || []) {
    const d = ymdOf(row?.date);
    if (!d || d < todayET || byDate.has(d)) continue;
    byDate.set(d, row);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, row]) => ({ row, date }));
}

/**
 * 목록용 — 한 종목의 다가오는 실적 «전부»(섹터 실적 캘린더처럼 여러 분기를 보이는 화면). 규칙은 pickNextEarnings 와 같다:
 *   FMP 에 오늘(ET) 이후 행이 있으면 FMP 행들(같은 날짜의 Finnhub 행으로만 시각·분기·EPS 보충), 없으면 Finnhub 행들.
 *   첫 행 = pickNextEarnings.
 */
export function upcomingEarningsRows(
  input: { fmp?: EarningsCandidate[] | null; finnhub?: EarningsCandidate[] | null },
  todayET: string,
): NextEarnings[] {
  const fmp = upcomingFrom(input.fmp, todayET);
  if (fmp.length) {
    return fmp.map(({ row, date }) => {
      // 시각·분기·EPS 보충은 «같은 날짜»의 Finnhub 행에서만 — 날짜가 다르면 다른 분기 이야기다
      const same = (input.finnhub || []).find((r) => ymdOf(r?.date) === date) || null;
      return {
        date,
        hour: normalizeEarningsHour(row.hour) || normalizeEarningsHour(same?.hour),
        epsEstimate: numOrNull(row.epsEstimate) ?? numOrNull(same?.epsEstimate),
        epsActual: numOrNull(row.epsActual) ?? numOrNull(same?.epsActual),
        revenueEstimate: numOrNull(row.revenueEstimate) ?? numOrNull(same?.revenueEstimate),
        quarter: numOrNull(row.quarter) ?? numOrNull(same?.quarter),
        year: numOrNull(row.year) ?? numOrNull(same?.year),
        source: 'fmp' as const,
      };
    });
  }
  return upcomingFrom(input.finnhub, todayET).map(({ row, date }) => ({
    date,
    hour: normalizeEarningsHour(row.hour),
    epsEstimate: numOrNull(row.epsEstimate),
    epsActual: numOrNull(row.epsActual),
    revenueEstimate: numOrNull(row.revenueEstimate),
    quarter: numOrNull(row.quarter),
    year: numOrNull(row.year),
    source: 'finnhub' as const,
  }));
}

/**
 * ★ 다음 실적 하나를 고른다 — 모든 화면이 이 함수 하나를 쓴다(= upcomingEarningsRows 의 첫 행).
 *   fmp: 그 종목의 FMP 캘린더 행들 · finnhub: 그 종목의 Finnhub 행들(또는 DynamoDB 수확본 한 행)
 *   todayET: 미국 동부 시장 날짜(marketCalendar.etDateOf) — 그날 실적도 «다가오는» 실적이다
 */
export function pickNextEarnings(
  input: { fmp?: EarningsCandidate[] | null; finnhub?: EarningsCandidate[] | null },
  todayET: string,
): NextEarnings | null {
  return upcomingEarningsRows(input, todayET)[0] ?? null;
}

/** 실적까지 남은 날 — ET 오늘 기준(요청마다 센다 · 캐시에 굳히지 않는다). 날짜 모양이 아니면 null */
export function earningsCountdown(dateStr: string | null | undefined, nowMs: number) {
  const days = daysBetweenYmd(etDateOf(nowMs), String(dateStr ?? '').slice(0, 10));
  if (days == null) return null;
  const daysLabel = days < 0 ? `D+${Math.abs(days)}` : days === 0 ? 'today' : `D-${days}`;
  let color = 'text-slate-400';
  if (days <= 7 && days >= 0) color = 'text-amber-400';
  if (days <= 3 && days >= 0) color = 'text-rose-400';
  if (days < 0) color = 'text-slate-500';
  return { daysUntilEarnings: days, daysLabel, color };
}

/**
 * 이미 만든 실적 카드(Finnhub·DynamoDB 출처 — nextEarningsDate/nextDate·hourLabel/hour·epsEstimate·quarter·year)에
 * 고른 «다음 실적»을 입힌다. 날짜가 바뀌면 그 카드의 시각·분기·EPS 는 다른 분기 것이므로 버린다(pick 이 같은 날짜만 보탠다).
 * 실적일과 무관한 값(lastSurprise·forwardEps 등)은 그대로 둔다.
 *   fmpRows: 그 종목의 FMP 캘린더 행 — null 이면 캘린더를 못 읽은 것(그땐 카드 날짜를 그대로 두고 D-n 만 오늘 기준으로 다시 센다)
 */
export function applyNextEarnings<T extends Record<string, any>>(
  card: T | null | undefined,
  fmpRows: EarningsCandidate[] | null,
  nowMs: number,
): (T & Record<string, any>) | null | undefined {
  const own: Record<string, any> | null = card && typeof card === 'object' ? card : null;
  if (!own) return card;
  const ownDate = ymdOf(own.nextEarningsDate ?? own.nextDate);
  const finnhub: EarningsCandidate[] = ownDate
    ? [{ date: ownDate, hour: own.hourLabel ?? own.hour, epsEstimate: own.epsEstimate, epsActual: own.epsActual, quarter: own.quarter, year: own.year }]
    : [];
  const next = pickNextEarnings({ fmp: fmpRows ?? [], finnhub }, etDateOf(nowMs));
  if (!next) {
    // 고를 것이 없다(둘 다 없거나 지난 날짜뿐) → 날짜는 그대로, D-n·라벨·색만 오늘(ET) 기준으로 다시 센다(저장된 daysUntil 은 담던 날의 값)
    const cd = ownDate ? earningsCountdown(ownDate, nowMs) : null;
    return cd ? ({ ...own, ...cd } as unknown as T) : card;
  }
  const cd = earningsCountdown(next.date, nowMs)!;
  return {
    ...own,
    nextEarningsDate: next.date,
    ...('nextDate' in own ? { nextDate: next.date } : {}),
    daysUntilEarnings: cd.daysUntilEarnings,
    daysLabel: cd.daysLabel,
    color: cd.color,
    hourLabel: next.hour,
    ...('hour' in own ? { hour: next.hour } : {}),
    epsEstimate: next.epsEstimate,
    epsActual: next.epsActual,
    quarter: next.quarter,
    year: next.year,
    hasData: true,
    dateSource: next.source,
  } as unknown as T;
}
