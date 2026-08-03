// ============================================================================
// sigmaEngine — 종목별 «평소와 다름»의 잣대(σ)를 만든다.
// ----------------------------------------------------------------------------
// 왜 σ인가 (2026-08-03 실측, .agent/BREAKING_ALERT_PLAN.md §2):
//   고정 % 임계는 못 쓴다. 같은 날 30분 창에서 0.5% 이상 움직인 횟수가
//     SPY 1회 · QQQ 2회 · NVDA 7회 · SOXL 12회
//   였다. 같은 잣대인데 종목마다 12배 차이가 난다 = 레버리지 ETF는 하루 종일
//   울리고 지수는 영영 안 울린다. 그래서 «그 종목의 평소 변동성» 대비로 잰다.
//
//   또한 SPY 일간 ±0.5%는 최근 250거래일 중 121일(48%)이다. 중앙값이 0.48%.
//   즉 0.5%는 «평범한 하루»지 속보가 아니다.
//
// √시간 규칙: 일간 변동성 σ_d 를 창 길이 W분으로 환산하면
//   σ_W = σ_d × √(W / 390)      (390 = 정규장 1일 분)
// 랜덤워크 가정이라 완벽하진 않지만, 종목 간 «스케일 정규화»가 목적이므로 충분하다.
// ============================================================================

import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive } from '@/services/massiveClient';

/** 정규장 1일 = 390분 */
export const REGULAR_MINUTES = 390;

/** σ 캐시는 하루 단위. 장중에 다시 계산하지 않는다(비용·일관성). */
const SIGMA_TTL = 26 * 60 * 60;
const sigmaKey = (symbol: string, dateET: string) => `breaking:sigma:v1:${symbol}:${dateET}`;

export interface SigmaProfile {
  symbol: string;
  /** 일간 로그수익률 표준편차 (%) */
  daily: number;
  /** 표본 일수 */
  samples: number;
  /** 20일 평균 일거래량 — 거래량 확인 게이트에 쓴다 */
  avgVolume: number;
  dateET: string;
}

/** 창 길이(분)에 해당하는 σ(%)를 돌려준다. */
export function sigmaForWindow(profile: SigmaProfile, windowMinutes: number): number {
  return profile.daily * Math.sqrt(windowMinutes / REGULAR_MINUTES);
}

export function etDate(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * 1년 일봉으로 σ 프로파일을 만든다. 당일 캐시.
 * 표본이 부족하면 null — 신규 상장·데이터 결손 종목에서 엉터리 임계가 나오는 걸 막는다.
 */
export async function getSigmaProfile(symbol: string): Promise<SigmaProfile | null> {
  const dateET = etDate();
  const key = sigmaKey(symbol, dateET);

  const cached = await getFromCache<SigmaProfile>(key);
  if (cached) return cached;

  const to = dateET;
  const from = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);

  let results: Array<{ c: number; v: number }> = [];
  try {
    const aggs = await fetchMassive(
      `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`,
      { adjusted: 'true', sort: 'asc', limit: '5000' },
    );
    results = Array.isArray(aggs?.results) ? aggs.results : [];
  } catch {
    return null;
  }

  // 최근 250거래일만. 그 이상은 «지금의 변동성»과 무관하다.
  const bars = results.slice(-251);
  if (bars.length < 60) return null;   // 표본 부족 — 임계를 만들지 않는다

  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p0 = bars[i - 1].c, p1 = bars[i].c;
    if (!p0 || !p1 || p0 <= 0) continue;
    rets.push(((p1 - p0) / p0) * 100);
  }
  if (rets.length < 60) return null;

  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const daily = Math.sqrt(variance);

  const volBars = bars.slice(-20).map((b) => b.v || 0).filter((v) => v > 0);
  const avgVolume = volBars.length ? volBars.reduce((a, b) => a + b, 0) / volBars.length : 0;

  // σ가 비정상이면 버린다. 0이면 모든 움직임이 ∞σ가 되어 전 종목이 발동한다.
  if (!Number.isFinite(daily) || daily <= 0.01 || daily > 40) return null;

  const profile: SigmaProfile = { symbol, daily, samples: rets.length, avgVolume, dateET };
  await setInCache(key, profile, SIGMA_TTL);
  return profile;
}
