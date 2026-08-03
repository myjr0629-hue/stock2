// ============================================================================
// detectMove — 급변동(SPIKE)과 «반전»(REVERSAL)을 잡는다.
// ----------------------------------------------------------------------------
// 대표 지적(2026-08-03): "사람들은 «하락하다 급상승 / 상승하다 급하락» 같은
// 특이한 경우에 반드시 관심을 가진다."  맞다. 그리고 이건 단순 급변동보다
// «드물고» «해석 가치가 높다» — 방향이 바뀌었다는 건 뭔가 새 정보가 들어왔다는 뜻이다.
// 그래서 REVERSAL은 별도 타입으로 두고, 임계를 조금 낮추되 우선순위를 높인다.
//
// 두 가지를 본다:
//   SPIKE     : 최근 W분 이동이 |x| ≥ K·σ_W
//   REVERSAL  : 직전 구간이 한 방향으로 의미 있게 움직인 뒤,
//               최근 W분이 «반대 방향»으로 의미 있게 움직였다
//
// 게이트(전부 AND) — .agent/BREAKING_ALERT_PLAN.md §2
//   ① σ 임계  ② 거래량 확인  ③ 정규장 한정  ④ 쿨다운  ⑤ 일일 상한
// ③이 중요하다: 프리/애프터는 유동성이 얇아 같은 σ 잣대가 왜곡된다.
// ============================================================================

import { fetchMassive } from '@/services/massiveClient';
import { getSigmaProfile, sigmaForWindow, etDate, type SigmaProfile } from './sigmaEngine';

// ── 튜닝 파라미터 — 전부 §2 실측 근거 ──────────────────────────────────────
export const TUNING = {
  /** 급변동 판정 창 (분) */
  WINDOW: 30,
  /** SPIKE 임계 — 8/3 실측에서 종목당 하루 1~2회로 수렴한 값 */
  SPIKE_SIGMA: 2.5,
  /** REVERSAL 되돌림 구간 임계 — 반전은 더 드물어 낮춰도 소음이 되지 않는다 */
  REVERSAL_SIGMA: 1.8,
  /** REVERSAL 직전 다리(leg) 임계 — "원래 그 방향으로 가고 있었다"의 최소 조건 */
  REVERSAL_PRIOR_SIGMA: 1.8,
  /** 직전 다리를 보는 창 (분) */
  PRIOR_WINDOW: 60,
  /** 거래량 확인 배수 — 얇은 호가로 튄 가격을 거른다 */
  VOLUME_MULT: 1.5,
} as const;

const REG_OPEN = 9 * 60 + 30;   // 09:30 ET
const REG_CLOSE = 16 * 60;      // 16:00 ET

export type BreakingKind = 'SPIKE' | 'REVERSAL';

export interface MoveSignal {
  symbol: string;
  kind: BreakingKind;
  /** 최근 창의 변화율 (%) */
  changePct: number;
  /** σ 배수 — 종목 간 비교 가능한 «놀라움의 크기» */
  sigmaMult: number;
  /** REVERSAL일 때: 직전 다리의 변화율 (%) */
  priorPct?: number;
  /** 거래량 배수 (같은 창 거래량 ÷ 평소 동시간대) */
  volumeMult: number;
  price: number;
  /** 당일 시가 대비 누적 변화율 — 카드/알림에 쓸 "오늘 얼마" */
  dayChangePct: number;
  atET: string;
  atISO: string;
  /** 정렬용 — REVERSAL 우선, 그다음 σ 크기 */
  priority: number;
}

interface Bar { t: number; c: number; v: number; o: number }

function etHM(ms: number): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(ms));
  const h = +(p.find((x) => x.type === 'hour')?.value ?? '0');
  const m = +(p.find((x) => x.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

function etStamp(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms));
}

// ── 실시간 끝점 ─────────────────────────────────────────────────────────────
// [FIX 2026-08-03 · 실측] 분봉 집계는 **13~15분 지연**된다(폴리곤 집계 티어).
// 프로드 실측: 현재 17:14:24 UTC / 분봉 최신 17:01:00 → 13.4분 지연.
// 반면 스냅샷(실시간 시세)은 지연 0이었다(17:14:26, 즉 초 단위 일치).
// 15분 늦게 뜨는 «속보»는 속보가 아니다. 그래서 창의 «끝점»만 실시간가로 바꾼다.
//   · 시작점(30분 전)은 분봉에서 — 과거라 지연이 무관하다
//   · 끝점은 스냅샷 — 지금 값
// 거래량은 분봉 그대로 둔다(지연돼도 «평소 대비 몇 배»의 판단은 유지된다).
export interface LiveTick { price: number; atMs: number }

/** 여러 종목의 실시간가를 스냅샷 1콜로 받는다. */
export async function fetchLiveTicks(symbols: string[]): Promise<Record<string, LiveTick>> {
  const out: Record<string, LiveTick> = {};
  try {
    const res = await fetchMassive(
      `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbols.join(',')}`,
      {}, false, undefined, { cache: 'no-store' as RequestCache },
    );
    for (const t of (res?.tickers ?? [])) {
      // 정규장 체결가 우선. lastTrade.p 가 가장 신선하다.
      const price = t?.lastTrade?.p ?? t?.day?.c ?? t?.min?.c;
      const atMs = t?.lastTrade?.t ? Math.round(t.lastTrade.t / 1e6) : Date.now();
      if (t?.ticker && typeof price === 'number' && price > 0) {
        out[t.ticker] = { price, atMs };
      }
    }
  } catch { /* 스냅샷 실패 시 분봉 끝점으로 폴백 — 지연될 뿐 오작동은 아니다 */ }
  return out;
}

/** 주어진 시각에 가장 가까운(그 이하) 봉의 인덱스. 없으면 0. */
function nearestBarIndex(bars: Bar[], targetMs: number): number {
  let lo = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].t <= targetMs) { lo = i; break; }
  }
  return lo;
}

/** 정규장 분봉만. 프리/애프터는 σ 잣대가 왜곡된다(§2 게이트 ③). */
async function fetchRegularBars(symbol: string): Promise<Bar[]> {
  const today = etDate();
  try {
    const aggs = await fetchMassive(
      `/v2/aggs/ticker/${symbol}/range/1/minute/${today}/${today}`,
      { adjusted: 'true', sort: 'asc', limit: '50000' },
      false, undefined, { cache: 'no-store' as RequestCache },
    );
    const rows: Bar[] = Array.isArray(aggs?.results) ? aggs.results : [];
    return rows.filter((b) => {
      if (typeof b.t !== 'number' || !b.c) return false;
      const hm = etHM(b.t);
      return hm >= REG_OPEN && hm < REG_CLOSE;
    });
  } catch {
    return [];
  }
}

/**
 * 한 종목에서 지금 시점의 신호를 판정한다.
 * 신호가 없으면 null. 하나의 종목은 최대 하나의 신호만 낸다(REVERSAL 우선).
 */
export async function detectForSymbol(
  symbol: string,
  profile?: SigmaProfile | null,
  live?: LiveTick | null,
): Promise<MoveSignal | null> {
  const sigma = profile ?? await getSigmaProfile(symbol);
  if (!sigma) return null;

  const bars = await fetchRegularBars(symbol);
  const W = TUNING.WINDOW;
  const P = TUNING.PRIOR_WINDOW;
  // 반전을 보려면 직전 다리까지 필요하다. 개장 직후엔 판정하지 않는다.
  if (bars.length < W + 10) return null;

  // 끝점 — 실시간가가 있으면 그걸 쓴다(집계 13~15분 지연 회피).
  const lastBar = bars[bars.length - 1];
  const nowMs = live?.atMs ?? lastBar.t;
  const last: Bar = live
    ? { t: live.atMs, c: live.price, v: lastBar.v, o: lastBar.o }
    : lastBar;

  // 시작점 — «지금으로부터 W분 전»에 가장 가까운 봉. 분봉 인덱스로 세면
  // 집계 지연만큼 창이 뒤로 밀려 실제로는 45분 구간을 재게 된다.
  const headIdx = nearestBarIndex(bars, nowMs - W * 60_000);
  const head = bars[headIdx];
  if (!head?.c || !last?.c) return null;

  const changePct = ((last.c - head.c) / head.c) * 100;
  const sigW = sigmaForWindow(sigma, W);
  if (sigW <= 0) return null;
  const sigmaMult = Math.abs(changePct) / sigW;

  // ── 거래량 확인 ─────────────────────────────────────────────────────────
  // 최근 창의 분당 평균 거래량 vs 20일 평균 일거래량을 분당으로 환산한 값.
  const winBars = bars.slice(headIdx);
  const winVol = winBars.length
    ? winBars.reduce((a, b) => a + (b.v || 0), 0) / winBars.length : 0;
  const baselinePerMin = sigma.avgVolume / 390;
  const volumeMult = baselinePerMin > 0 ? winVol / baselinePerMin : 0;

  const dayOpen = bars[0].o || bars[0].c;
  const dayChangePct = dayOpen ? ((last.c - dayOpen) / dayOpen) * 100 : 0;

  const base = {
    symbol,
    changePct,
    sigmaMult,
    volumeMult,
    price: last.c,
    dayChangePct,
    atET: etStamp(nowMs),
    atISO: new Date(nowMs).toISOString(),
  };

  // ── ① REVERSAL 먼저 본다 (더 드물고 해석 가치가 높다) ──────────────────
  // 직전 다리: 최근 창이 시작되기 «전» P분 동안의 이동.
  const priorHeadIdx = nearestBarIndex(bars, nowMs - (W + P) * 60_000);
  if (priorHeadIdx > 0 && priorHeadIdx < headIdx) {
    const priorHead = bars[priorHeadIdx];
    const priorPct = priorHead?.c ? ((head.c - priorHead.c) / priorHead.c) * 100 : 0;
    const sigP = sigmaForWindow(sigma, P);
    const priorMult = sigP > 0 ? Math.abs(priorPct) / sigP : 0;

    const opposite = Math.sign(priorPct) !== 0 && Math.sign(changePct) !== 0
      && Math.sign(priorPct) !== Math.sign(changePct);

    if (
      opposite
      && priorMult >= TUNING.REVERSAL_PRIOR_SIGMA
      && sigmaMult >= TUNING.REVERSAL_SIGMA
      && volumeMult >= TUNING.VOLUME_MULT
    ) {
      return {
        ...base,
        kind: 'REVERSAL',
        priorPct,
        // 반전은 항상 같은 크기의 급변동보다 위로 올린다
        priority: 1000 + sigmaMult * 10 + priorMult,
      };
    }
  }

  // ── ② SPIKE ─────────────────────────────────────────────────────────────
  if (sigmaMult >= TUNING.SPIKE_SIGMA && volumeMult >= TUNING.VOLUME_MULT) {
    return { ...base, kind: 'SPIKE', priority: sigmaMult * 10 };
  }

  return null;
}

/**
 * σ 게이트를 «건너뛰고» 지금의 실제 움직임을 그대로 신호로 만든다.
 * 검증 전용(=/api/guardian/breaking?preview=1). 크론은 절대 이걸 쓰지 않는다.
 * 목적: 실제 발동은 며칠에 한 번이라 카드 UI를 검증할 수 없는데, 가짜 데이터로
 * 검증하면 «가짜는 언제나 예쁘게 나오므로» 검증이 아니게 된다. 그래서 숫자는
 * 전부 실측으로 두고 «알릴 만큼 크지 않을 뿐»인 상태를 그대로 렌더해 본다.
 */
export async function detectForSymbolRaw(symbol: string): Promise<MoveSignal | null> {
  const sigma = await getSigmaProfile(symbol);
  if (!sigma) return null;
  const bars = await fetchRegularBars(symbol);
  const W = TUNING.WINDOW;
  if (bars.length < W + 2) return null;

  // 프로덕션과 «같은» 끝점 로직을 쓴다 — preview가 다른 경로를 타면 검증이 아니다.
  const ticks = await fetchLiveTicks([symbol]);
  const live = ticks[symbol];
  const lastBar = bars[bars.length - 1];
  const nowMs = live?.atMs ?? lastBar.t;
  const lastC = live?.price ?? lastBar.c;

  const headIdx = nearestBarIndex(bars, nowMs - W * 60_000);
  const head = bars[headIdx];
  if (!head?.c || !lastC) return null;

  const changePct = ((lastC - head.c) / head.c) * 100;
  const sigW = sigmaForWindow(sigma, W);
  const winBars = bars.slice(headIdx);
  const winVol = winBars.length
    ? winBars.reduce((a, b) => a + (b.v || 0), 0) / winBars.length : 0;
  const baselinePerMin = sigma.avgVolume / 390;
  const dayOpen = bars[0].o || bars[0].c;

  const pIdx = nearestBarIndex(bars, nowMs - (W + TUNING.PRIOR_WINDOW) * 60_000);
  const priorPct = pIdx > 0 && pIdx < headIdx && bars[pIdx]?.c
    ? ((head.c - bars[pIdx].c) / bars[pIdx].c) * 100 : undefined;
  const isRev = priorPct != null && priorPct * changePct < 0;

  return {
    symbol,
    kind: isRev ? 'REVERSAL' : 'SPIKE',
    changePct,
    sigmaMult: sigW > 0 ? Math.abs(changePct) / sigW : 0,
    priorPct: isRev ? priorPct : undefined,
    volumeMult: baselinePerMin > 0 ? winVol / baselinePerMin : 0,
    price: lastC,
    dayChangePct: dayOpen ? ((lastC - dayOpen) / dayOpen) * 100 : 0,
    atET: etStamp(nowMs),
    atISO: new Date(nowMs).toISOString(),
    priority: 0,
  };
}

/** 정규장 중인지 — 크론이 장외에 헛도는 걸 막는다. */
export function isRegularSessionNow(now: Date = new Date()): boolean {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' })
    .format(now);
  if (wd === 'Sat' || wd === 'Sun') return false;
  const hm = etHM(now.getTime());
  // 개장 15분은 건너뛴다 — 시가 갭이 전부 «급변동»으로 잡힌다.
  return hm >= REG_OPEN + 15 && hm < REG_CLOSE;
}
