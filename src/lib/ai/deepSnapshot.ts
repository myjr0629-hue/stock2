/**
 * Command AI 딥 분석 «재료(snapshot)»와 GEX 30일 통계 — 순수 함수 (2026-10-12 앱 화면에서 옮김)
 *
 * 왜 옮겼나: 딥 분석 예열(/api/cron/ai-warm)을 되살리려면 서버가 «앱 화면과 똑같은 재료»를 만들어야 한다.
 *   9/10 첫 예열은 빈 재료로 불러 «데이터 부재» 글이 캐시에 앉았다(그 사고로 예열을 꺼 두었다 — ai-warm 머리말).
 *   화면(app-view/cmd)과 예열이 이 파일의 같은 함수를 쓰므로 재료 모양이 갈라지지 않는다. 화면의 동작은 예전과 같다(옮기기만 했다).
 */
import { earningsDaysOrNull } from '@/lib/earningsDate';
import { selectVwap, vwapDistancePct } from '@/lib/vwap';
import { netPremiumOf } from '@/lib/premiumFlow';

export interface DeepSnapshotInput {
  ticker: string;
  /** 화면 표시 가격(실시간) — 없으면 data.price */
  price: number;
  /** 화면 표시 등락률(%) */
  priceChange: number;
  /** 'PRE' | 'REG' | 'POST' | 'CLOSED' */
  session: string;
  /** /api/command/unified 응답 */
  unified: any;
  /** /api/live/ticker 응답(rawTickerData) — 순프리미엄만 쓴다 */
  rawTickerData: any;
  /** /api/command/insider 의 insider */
  insider: any;
  /** /api/live/technicals 응답(오류면 null) */
  technicals: any;
  /** /api/market/macro 의 creditSpread */
  creditSpread: any;
}

/** 앱 Command 화면이 딥 분석에 보내는 재료 — 신뢰 레이어 경로(trustLayer 1 · materialPhase complete) */
export function buildDeepSnapshot(x: DeepSnapshotInput) {
  const u = x.unified || {};
  const s = u.structure || {};
  const vol = u.volatility || {};
  const sma = u.sma || {};
  const fund = u.fundamentals || {};
  const anal = u.analyst || {};
  const sqz = u.squeeze || {};
  const earn = u.earnings || {};
  const insiderData = x.insider;
  const techData = x.technicals;
  const vwap = selectVwap(x.rawTickerData?.vwap, u._dynamoPrice?.vwap);
  const distance = vwapDistancePct(x.price, vwap);
  return {
    // ★ [2026-10-07 앱 강화 T5] 서버가 «재료 완결 게이트·자리표·낡음 검사» 경로를 쓰는 표식과 완결 여부
    trustLayer: 1,
    materialPhase: 'complete',
    ticker: x.ticker,
    price: x.price,
    priceChange: x.priceChange,
    session: x.session,
    signalCore: { direction: 'NEUTRAL', conviction: 'MIXED', condition: 'TREND', conclusion: '', bullCount: 0, bearCount: 0, bullSignals: '', bearSignals: '' },
    contextScore: { value: u.alpha?.score || 0, grade: u.alpha?.grade || 'C' },
    smartFlow: { value: u.smartFlow || 0, trend: u.smartFlow >= 60 ? 'INFLOW' : 'NEUTRAL' },
    sma: { cross: sma.cross || 'NONE', sma50: sma.sma50 || 0, sma200: sma.sma200 || 0, trendPhase: sma.phase || 'UNKNOWN' },
    vwap,
    vwapDistance: distance !== null ? `${distance.toFixed(1)}%` : 'N/A',
    conviction: { score: u.alpha?.score || 50, grade: u.alpha?.grade || 'C' },
    structure: {
      netGex: s.netGex || 0, gammaFlipLevel: s.gammaFlipLevel || 0,
      squeezeRisk: vol.squeezeRisk || 'LOW', squeezeScore: vol.squeezeScore || 0,
      pcRatio: s.pcRatio || 0, callWall: s.levels?.callWall || 0,
      putFloor: s.levels?.putFloor || 0, maxPain: s.maxPain || 0,
      gammaConcentration: 0, gammaConcentrationLabel: 'NORMAL',
    },
    // ★ [2026-10-19 N4] 못 쟀으면 null(자리표 NET_PREM 에 안 들어간다) — 예전 `?? 0` 은 결측을 «순 프리미엄 0»으로 AI 에 넘겼다. 관측된 0 은 0.
    flow: { netPremium: netPremiumOf(x.rawTickerData?.flow) },
    fundamental: { score: fund.score || 0, grade: fund.grade || '-', pe: fund.breakdown?.pe?.value || 0, fcfMargin: 0 },
    analyst: { score: anal.bullishPct || 0, buyPct: anal.bullishPct || 0 },
    // [2026-08-29] 다크풀은 현재 피드에 값이 없다 — 0 을 보내면 AI 가 사실로 서술한다
    institutional: { insiderNet30d: insiderData?.net30d ?? null, insiderBuy: insiderData?.buyCount ?? null, insiderSell: insiderData?.sellCount ?? null, activity: insiderData?.sentiment || 'N/A' },
    // [2026-08-30] 새 지표를 AI 에도 넘긴다 — 화면에만 있고 분석에 없으면 반쪽이다
    technicals: techData ? { adx: techData.adx, obv: techData.obv, bb: techData.bb, atr: techData.atr, volPremium: techData.volPremium } : null,
    creditSpread: x.creditSpread ?? null,
    volatility: { regime: vol.regime || 'CALM', regimeScore: vol.regimeScore || 0, gexLong: 0 },
    squeeze: { status: sqz.status || 'NORMAL', siPercent: sqz.siPercent || 0 },
    earnings: { daysUntil: earningsDaysOrNull(earn.daysUntilEarnings), date: earn.nextEarningsDate || '', estimatedEps: earn.epsEstimate || 0 },   // 0 = 실적 당일 · 음수 = 지난 실적 · null = 모름(9/30: 예전 `|| 999` 는 당일을 «999일 뒤»로 AI 에 보냈다)
    relatedTickers: u.related?.topRelated?.map((r: any) => r.ticker) || [],
  };
}

export interface GexStats {
  percentile: number; streakDays: number; streakMultiple: number; avgRegimeDuration: number;
  callWallAccuracy: number | null; cwStreakAccuracy: number | null;
  flipEvents: Array<{ from: string; to: string; timestamp: any; price: any }>;
  latestRegime: string; totalDays: number;
}

/** /api/history?type=gex&days=30 의 data → 딥 분석 GEX 30일 통계(정규장 마지막 기록 하루 1개). 하루치가 2개 미만이면 null. */
export function computeGexStats(raw: any[]): GexStats | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const dayMap = new Map<string, any[]>();
  raw.forEach((d: any) => {
    const dt = new Date(d.timestamp);
    const et = new Date(dt.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    if (et.getDay() === 0 || et.getDay() === 6) return;
    const tm = et.getHours() * 60 + et.getMinutes();
    if (tm < 570 || tm > 960) return;
    const k = `${et.getFullYear()}-${String(et.getMonth()+1).padStart(2,'0')}-${String(et.getDate()).padStart(2,'0')}`;
    if (!dayMap.has(k)) dayMap.set(k, []);
    dayMap.get(k)!.push(d);
  });
  const cd = [...dayMap.keys()].sort().map(k => dayMap.get(k)!.at(-1)!);
  if (cd.length < 2) return null;
  const latest = cd[cd.length - 1];
  const vals = cd.map((d: any) => d.gex);
  const sorted = [...vals].sort((a: number, b: number) => a - b);
  const pctIdx = sorted.findIndex((v: number) => v >= latest.gex);
  const pct = Math.round((pctIdx / sorted.length) * 100);
  let streak = 0;
  for (let i = cd.length - 1; i >= 0; i--) { if (cd[i].gammaRegime === latest.gammaRegime) streak++; else break; }
  const sDays = new Set(cd.slice(cd.length - streak).map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size;
  const durs: number[] = []; let rs2 = 0;
  for (let i = 1; i < cd.length; i++) {
    if (cd[i].gammaRegime !== cd[rs2].gammaRegime) {
      if (cd[rs2].gammaRegime === latest.gammaRegime) durs.push(new Set(cd.slice(rs2, i).map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size);
      rs2 = i;
    }
  }
  if (cd[rs2].gammaRegime === latest.gammaRegime) durs.push(new Set(cd.slice(rs2).map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size);
  const avg = durs.length > 0 ? parseFloat((durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(1)) : 0;
  let cwR = 0, cwT = 0, cwSR = 0, cwST = 0;
  cd.forEach((d: any) => { if (d.callWall && d.price && d.callWall > 0 && d.callWall < d.price * 5) { cwT++; if (d.price < d.callWall) cwR++; } });
  for (let i = cd.length - 1; i >= Math.max(0, cd.length - streak); i--) { const d = cd[i]; if (d.callWall && d.price && d.callWall > 0 && d.callWall < d.price * 5) { cwST++; if (d.price < d.callWall) cwSR++; } }
  const flips: any[] = [];
  for (let i = 1; i < cd.length; i++) { if (cd[i].gammaRegime !== cd[i-1].gammaRegime && cd[i-1].gammaRegime) flips.push({ from: cd[i-1].gammaRegime, to: cd[i].gammaRegime, timestamp: cd[i].timestamp, price: cd[i].price }); }
  return {
    percentile: pct, streakDays: sDays, streakMultiple: avg > 0 ? parseFloat((sDays / avg).toFixed(1)) : 0,
    avgRegimeDuration: avg, callWallAccuracy: cwT > 0 ? Math.round((cwR / cwT) * 100) : null,
    cwStreakAccuracy: cwST > 0 ? Math.round((cwSR / cwST) * 100) : null,
    flipEvents: flips, latestRegime: latest.gammaRegime,
    totalDays: new Set(cd.map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size,
  };
}
