/**
 * Command AI 딥 분석 재료와 GEX 30일 통계. 날짜가 확인된 정상 재료만 메모리에 보관한다.
 *
 * 왜 옮겼나: 딥 분석 예열(/api/cron/ai-warm)을 되살리려면 서버가 «앱 화면과 똑같은 재료»를 만들어야 한다.
 *   9/10 첫 예열은 빈 재료로 불러 «데이터 부재» 글이 캐시에 앉았다(그 사고로 예열을 꺼 두었다 — ai-warm 머리말).
 *   앱·웹·모바일·예열이 같은 관측 판정과 재료 조립 함수를 쓴다. 화면 라벨과 표시 방식은 바꾸지 않는다.
 */
import { earningsDaysOrNull } from '@/lib/earningsDate';
import { computeUnifiedVolatilityRegime } from '@/lib/metrics/volatilityRegime';
import { selectVwap, vwapDistancePct } from '@/lib/vwap';
import { netPremiumOf } from '@/lib/premiumFlow';
import { commandScores } from '@/lib/commandScores';
import { compareSourceTime, isFailedSection, observationTime } from '@/lib/metrics/observation';
import { commandConvictionRaw, retainConvictionInputs, type ConvictionSnapshot } from '@/lib/commandConviction';
import { resolveCommandVolatilityObservation, type CommandVolatilityObservation } from '@/lib/commandVolatilityObservation';

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
  /** 화면이 공용 판본 선택(lib/metrics/observation)으로 고른 변동성 입력 {structure, volatility}.
   *  생략(undefined)이면 unified 를 그대로 쓴다(예열 경로). null = 고를 판본 없음(결측). */
  volatilityData?: { structure: any; volatility: any } | null;
  /** volatilityData 판본의 원천 시각·이월 여부(공용 선택 결과). 이월이면 AI 재료 sources 에 원천 날짜로 남긴다. */
  volatilitySource?: { sourceAsOf: string | null; carried?: boolean } | null;
  /** 카드가 공용 규칙(이월 포함)으로 고른 확신도 입력 — 주면 AI 확신도 = 카드 확신도. */
  convictionInputs?: import('@/lib/commandConviction').ConvictionInputs;
  /** /api/live/ticker 응답(rawTickerData) — 순프리미엄·VWAP */
  rawTickerData: any;
  /** /api/command/insider 의 insider */
  insider: any;
  /** /api/live/technicals 응답(오류면 null) */
  technicals: any;
  /** /api/market/macro 의 creditSpread */
  creditSpread: any;
}

type Source = { asOf: string; historical: boolean };
/** asOf = display form (ISO); order = the source time at its own precision (a date-only value stays a day). */
type SavedField = { value: number | string; asOf: string | null; order: string | null };
// Process/session-local only. No Redis, localStorage or external writes. Bounded by ticker.
const lastGood = new Map<string, Map<string, SavedField>>();
// Conviction inputs selected by the same function as every card (lib/commandConviction retainConvictionInputs).
const lastConviction = new Map<string, ConvictionSnapshot>();
// Volatility edition selected by the same function as every VOL REGIME card (resolveCommandVolatilityObservation).
const lastVolatility = new Map<string, CommandVolatilityObservation>();
function remember<T>(map: Map<string, T>, key: string, value: T) {
  if (!key) return;
  map.delete(key); map.set(key, value);
  if (map.size > 100) map.delete(map.keys().next().value!);
}
const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const positive = (v: unknown): number | null => { const n = finite(v); return n !== null && n > 0 ? n : null; };
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() && !['N/A', 'UNKNOWN', '-'].includes(v) ? v : null;
function sourceDate(v: unknown): string | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const ms = typeof v === 'number' ? v : Date.parse(v);
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) && ms > 0 ? date.toISOString() : null;
}

/** AI material: measured now → dated last good → null. Receipt time is never invented as a source date. */
export function buildDeepSnapshot(x: DeepSnapshotInput) {
  const u = x.unified || {};
  // Shared rule 1: a failed section (error, PENDING/NONE/ERROR/NO_MARKET, validation.isValid=false,
  // dataSource NONE) is not an observation — its 0/LOW placeholders never reach the AI.
  const failed = isFailedSection;
  const s = failed(u.structure) ? {} : u.structure || {};
  const vol = failed(u.volatility) ? {} : u.volatility || {};
  const sma = failed(u.sma) ? {} : u.sma || {};
  const fund = failed(u.fundamentals) ? {} : u.fundamentals || {};
  const anal = failed(u.analyst) ? {} : u.analyst || {};
  const sqz = failed(u.squeeze) ? {} : u.squeeze || {};
  const earn = u.earnings || {};
  const vwap = selectVwap(x.rawTickerData?.vwap, u._dynamoPrice?.vwap);
  const distance = vwapDistancePct(x.price, vwap);
  // AI conviction = the card's conviction: the caller's selected inputs, or the same selection function here
  // (mobile overview, warm path) — never this poll's unselected inputs.
  let convictionInputs = x.convictionInputs;
  if (!convictionInputs) {
    const key = String(x.ticker || '').toUpperCase();
    // The same first-defined VWAP source selectVwap used, raw — an explicit null invalidates (not carried).
    const vwapRaw = [x.rawTickerData?.vwap, u._dynamoPrice?.vwap].find(v => v !== undefined);
    const { raw, dates, invalidated } = commandConvictionRaw(x.unified, x.price, vwapRaw, x.rawTickerData?.flow, { vwap: x.rawTickerData?.vwapDate });
    const snap = retainConvictionInputs(key, raw, dates, lastConviction.get(key), invalidated);
    remember(lastConviction, key, snap);
    convictionInputs = snap.inputs;
  }
  const scores = commandScores({ price: x.price, vwap, unified: { ...u, structure: s, volatility: vol, sma }, rawTickerData: x.rawTickerData, convictionInputs });
  const ticker = String(x.ticker || '').toUpperCase();
  const saved = lastGood.get(ticker) || new Map<string, SavedField>();
  const sources: Record<string, Source> = {};
  const dateOf = (o: any) => sourceDate(o?.asOf ?? o?.sourceDate ?? o?.dataDate ?? o?.date ?? o?.dataFreshness?.chainDate ?? o?.chainDate);
  const orderOf = (o: any) => observationTime(o?.asOf ?? o?.sourceDate ?? o?.dataDate ?? o?.date ?? o?.dataFreshness?.chainDate ?? o?.chainDate);
  // Shared selection rule (lib/metrics/observation): the newer SOURCE time wins (an older observation
  // arriving later never replaces it); unknown times use arrival order; a missing value keeps the
  // previous real value with its own date (null when the source never gave one); measured 0 is a value.
  function field<T extends number | string>(path: string, value: T | null, source: any): T | null {
    const asOf = dateOf(source), order = orderOf(source);
    const prior = saved.get(path);
    const older = value !== null && prior !== undefined && (compareSourceTime(order, prior.order) ?? 0) < 0;
    if (value !== null && !older) {
      saved.set(path, { value, asOf, order });
      if (asOf) sources[path] = { asOf, historical: false };
      return value;
    }
    if (!prior) return null;
    if (prior.asOf) sources[path] = { asOf: prior.asOf, historical: true };
    return prior.value as T;
  }
  const num = (path: string, v: unknown, o: any) => field(path, finite(v), o);
  const pos = (path: string, v: unknown, o: any) => field(path, positive(v), o);
  const str = (path: string, v: unknown, o: any) => field(path, text(v), o);
  const pairedLabel = (path: string, scorePath: string, currentScore: number | null, currentGrade: unknown, source: any): string | null => {
    if (currentScore !== null) {
      const value = text(currentGrade);
      if (value === null) {
        // An undated/older observation cannot erase the grade of the dated
        // last-good score retained in memory.
        const asOf = dateOf(source), score = saved.get(scorePath);
        if (asOf && score?.asOf === asOf && score.value === currentScore) saved.delete(path);
        return null;
      }
      return field(path, value, source);
    }
    const score = saved.get(scorePath), prior = saved.get(path);
    return score && prior && score.asOf === prior.asOf ? field(path, null as string | null, source) : null;
  };
  const alphaScore = num('contextScore.value', u.alpha?.score, u.alpha);
  // The upstream whale formula returns a neutral base even without inputs.
  const hasFlowObservation = scores.netGex !== null || netPremiumOf(x.rawTickerData?.flow) !== null
    || positive(u.institutional?.darkPool?.percent) !== null;
  const flowValue = num('smartFlow.value', hasFlowObservation ? u.smartFlow : null, u);
  // The inputs were already selected by the shared rule (carry, invalidation) — no second carry layer on the score.
  const convictionScore = finite(scores.cScore);
  // Same calculation and the same selected edition as every VOL REGIME card.
  // Without a caller-selected edition (mobile overview, warm path), select it here with the same function —
  // a late older edition (10/16 0/CALM after 10/19 58/LOADED) never replaces the newer one.
  let volatilityData = x.volatilityData;
  let volatilitySource = x.volatilitySource;
  if (volatilityData === undefined) {
    const key = String(x.ticker || '').toUpperCase();
    const obs = resolveCommandVolatilityObservation(key, x.unified, lastVolatility.get(key) ?? null);
    if (obs) remember(lastVolatility, key, obs);
    volatilityData = obs?.data ?? null;
    volatilitySource = obs;
  }
  const regimeCalc = computeUnifiedVolatilityRegime(volatilityData);
  const regimeSource = volatilitySource?.sourceAsOf ? { asOf: volatilitySource.sourceAsOf } : u;
  const regimeScore = num('volatility.regimeScore', regimeCalc.regimeScore, regimeSource);
  // A carried edition (shared rule 3) is a historical observation with its own source date.
  if (regimeScore !== null && volatilitySource?.carried && volatilitySource.sourceAsOf) {
    const asOf = sourceDate(volatilitySource.sourceAsOf);
    if (asOf) sources['volatility.regimeScore'] = { asOf, historical: true };
  }
  const squeezeSource = s.squeezeScore != null ? s : vol;
  const currentSqueeze = finite(s.squeezeScore ?? vol.squeezeScore);
  const squeezeScore = num('structure.squeezeScore', currentSqueeze, squeezeSource);
  const analystCount = positive(anal.totalAnalysts);
  const strongBuy = finite(anal.breakdown?.strongBuy), buy = finite(anal.breakdown?.buy);
  const analystPct = anal.totalAnalysts === 0 ? null : finite(anal.bullishPct)
    ?? (analystCount !== null && strongBuy !== null && buy !== null ? Math.round((strongBuy + buy) / analystCount * 100) : null);
  const peRaw = fund.pe ?? fund.breakdown?.pe?.value;
  const pe = typeof peRaw === 'string' && peRaw.trim() ? Number(peRaw) : peRaw;
  // structureService emits the OI denominator in debug.todayOI, not the two
  // top-level totals. Nonzero concentration is itself evidence; zero needs
  // an observed denominator because the producer also uses it for no OI.
  const oi = positive(s.debug?.todayOI) ?? ((finite(s.totalCallOI) ?? 0) + (finite(s.totalPutOI) ?? 0));
  const measuredConcentration = finite(s.gammaConcentration);
  const currentConcentration = measuredConcentration !== null && (measuredConcentration > 0 || oi > 0)
    ? measuredConcentration : null;
  const concentration = num('structure.gammaConcentration', currentConcentration, s);
  const result = {
    trustLayer: 1,
    materialPhase: 'complete',
    ticker: x.ticker, price: x.price, priceChange: x.priceChange, session: x.session,
    signalCore: null,
    contextScore: { value: alphaScore, grade: alphaScore !== null ? pairedLabel('contextScore.grade', 'contextScore.value', finite(u.alpha?.score), u.alpha?.grade, u.alpha) : null },
    smartFlow: { value: flowValue, trend: flowValue !== null ? (flowValue >= 60 ? 'INFLOW' : 'NEUTRAL') : null },
    sma: { cross: str('sma.cross', sma.cross, sma), sma50: pos('sma.sma50', sma.sma50, sma), sma200: pos('sma.sma200', sma.sma200, sma), trendPhase: str('sma.trendPhase', sma.phase, sma) },
    vwap, vwapDistance: distance !== null ? `${distance.toFixed(1)}%` : 'N/A',
    conviction: { score: convictionScore, grade: convictionScore !== null ? text(scores.cGrade) : null },
    structure: {
      netGex: num('structure.netGex', s.netGex, s), gammaFlipLevel: pos('structure.gammaFlipLevel', s.gammaFlipLevel, s),
      squeezeRisk: squeezeScore !== null ? pairedLabel('structure.squeezeRisk', 'structure.squeezeScore', currentSqueeze, s.squeezeRisk ?? vol.squeezeRisk, squeezeSource) : null, squeezeScore,
      pcRatio: num('structure.pcRatio', finite(s.pcRatio) !== null && s.pcRatio >= 0 ? s.pcRatio : null, s),
      callWall: pos('structure.callWall', s.levels?.callWall, s), putFloor: pos('structure.putFloor', s.levels?.putFloor, s), maxPain: pos('structure.maxPain', s.maxPain, s),
      gammaConcentration: concentration, gammaConcentrationLabel: concentration !== null ? pairedLabel('structure.gammaConcentrationLabel', 'structure.gammaConcentration', currentConcentration, s.gammaConcentrationLabel, s) : null,
    },
    flow: { netPremium: num('flow.netPremium', netPremiumOf(x.rawTickerData?.flow), x.rawTickerData?.flow) },
    fundamental: {
      score: num('fundamental.score', fund.score, fund),
      grade: pairedLabel('fundamental.grade', 'fundamental.score', finite(fund.score), fund.grade, fund),
      pe: num('fundamental.pe', pe, fund), fcfMargin: num('fundamental.fcfMargin', fund.fcfMargin, fund),
    },
    analyst: { score: num('analyst.score', analystPct, anal), buyPct: num('analyst.buyPct', analystPct, anal) },
    institutional: { insiderNet30d: finite(x.insider?.net30d), insiderBuy: finite(x.insider?.buyCount), insiderSell: finite(x.insider?.sellCount), activity: text(x.insider?.sentiment) },
    technicals: x.technicals ? { adx: x.technicals.adx, obv: x.technicals.obv, bb: x.technicals.bb, atr: x.technicals.atr, volPremium: x.technicals.volPremium } : null,
    creditSpread: x.creditSpread ?? null,
    volatility: { regime: regimeScore !== null ? str('volatility.regime', regimeCalc.regimeScore !== null ? regimeCalc.regime : null, regimeSource) : null, regimeScore, gexLong: num('volatility.gexLong', vol.gexLong, vol) },
    squeeze: { status: str('squeeze.status', sqz.status, sqz), siPercent: num('squeeze.siPercent', sqz.siPercent, sqz) },
    earnings: { daysUntil: earningsDaysOrNull(earn.daysUntilEarnings), date: text(earn.nextEarningsDate), estimatedEps: finite(earn.epsEstimate) },
    relatedTickers: u.related?.topRelated?.map((r: any) => r.ticker) || [],
    sources,
  };
  if (ticker && saved.size) {
    lastGood.delete(ticker); lastGood.set(ticker, saved);
    if (lastGood.size > 100) lastGood.delete(lastGood.keys().next().value!);
  }
  return result;
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
