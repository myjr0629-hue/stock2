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
): Promise<MoveSignal | null> {
  const sigma = profile ?? await getSigmaProfile(symbol);
  if (!sigma) return null;

  const bars = await fetchRegularBars(symbol);
  const W = TUNING.WINDOW;
  const P = TUNING.PRIOR_WINDOW;
  // 반전을 보려면 직전 다리까지 필요하다. 개장 직후엔 판정하지 않는다.
  if (bars.length < W + 10) return null;

  const last = bars[bars.length - 1];
  const head = bars[bars.length - 1 - W];
  if (!head?.c || !last?.c) return null;

  const changePct = ((last.c - head.c) / head.c) * 100;
  const sigW = sigmaForWindow(sigma, W);
  if (sigW <= 0) return null;
  const sigmaMult = Math.abs(changePct) / sigW;

  // ── 거래량 확인 ─────────────────────────────────────────────────────────
  // 최근 창의 분당 평균 거래량 vs 20일 평균 일거래량을 분당으로 환산한 값.
  const winVol = bars.slice(-W).reduce((a, b) => a + (b.v || 0), 0) / W;
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
    atET: etStamp(last.t),
    atISO: new Date(last.t).toISOString(),
  };

  // ── ① REVERSAL 먼저 본다 (더 드물고 해석 가치가 높다) ──────────────────
  // 직전 다리: 최근 창이 시작되기 «전» P분 동안의 이동.
  const priorHeadIdx = bars.length - 1 - W - P;
  if (priorHeadIdx >= 0) {
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

/** 정규장 중인지 — 크론이 장외에 헛도는 걸 막는다. */
export function isRegularSessionNow(now: Date = new Date()): boolean {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' })
    .format(now);
  if (wd === 'Sat' || wd === 'Sun') return false;
  const hm = etHM(now.getTime());
  // 개장 15분은 건너뛴다 — 시가 갭이 전부 «급변동»으로 잡힌다.
  return hm >= REG_OPEN + 15 && hm < REG_CLOSE;
}
