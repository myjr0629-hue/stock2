// import YahooFinance from 'yahoo-finance2'; // Lazy import instead

import { StockData, OptionData, Range, GemsTicker, Tier01Data, MacroData, NewsItem, analyzeGemsTicker } from "@/services/stockTypes";

export type { StockData, OptionData, Range, GemsTicker, Tier01Data, MacroData, NewsItem };
export { analyzeGemsTicker };

// --- CONFIGURATION ---
import { fetchMassive, RunBudget, StatusUpdate, setStatusCallback } from './massiveClient';

// [S-56.4.5c] Legacy compatibility - these constants are used in getMarketStatus_LEGACY
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const MASSIVE_BASE_URL = process.env.MASSIVE_BASE_URL || "https://api.polygon.io";

// [S-56.4.5c] Concurrency constants for legacy functions
const REPORT_CONCURRENCY = 2;
const SPOT_CONCURRENCY = 5;
const FIXED_DELAY_MS = 200;

// const DISABLE_OPTIONS_IN_DEV = process.env.NODE_ENV !== "production"; // [S-17] Force Unblock for Demo

// --- S-28: Global status callback (Moved to massiveClient, re-exported or used via import) ---
export type { StatusUpdate };

// [S-56.4.5c] Local notifyStatus helper (no-op if callback not set)
function notifyStatus(update: StatusUpdate & { progress?: { pagesFetchedCurrent?: number } }) {
  // Callback is managed via setStatusCallback in massiveClient
  // This is a no-op wrapper for compatibility
}
// [S-56.4.5c] EcoEvent interface for economic calendar
interface EcoEvent {
  date: string;
  country: string;
  impact: string;
  title: string;
  forecast?: string;
}

export async function getEconomicEvents(): Promise<any[]> {
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data: EcoEvent[] = await res.json();
    const important = data.filter(d => d.country === "USD" && (d.impact === "High" || d.impact === "Medium"));
    return important.map(e => {
      const dateObj = new Date(e.date);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return {
        date: `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${days[dateObj.getDay()]})`,
        timeEt: dateObj.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }),
        timeKst: dateObj.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }),
        event: e.title,
        eventKo: translateToKorean(e.title),
        forecast: e.forecast || "-",
        impact: e.impact.toLowerCase()
      };
    }).slice(0, 10);
  } catch (e) { return []; }
}

// --- S-38: Universe Expansion Helpers ---
export async function getUniverseCandidates(budget?: RunBudget): Promise<string[]> {
  const UNIVERSE_LIMIT = parseInt(process.env.UNIVERSE_LIMIT || "200");
  // [S-40] Expanded static leaders for better coverage
  const STATIC_LEADERS = [
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META', 'AMZN', 'GOOGL', 'GOOG', 'NFLX',
    'COIN', 'MSTR', 'PLTR', 'AVGO', 'SMCI', 'ARM', 'SQ', 'PYPL', 'CRM', 'ORCL',
    'INTC', 'QCOM', 'MU', 'AMAT', 'LRCX', 'KLAC', 'ASML', 'TSM', 'SNOW', 'NET',
    'DDOG', 'ZS', 'CRWD', 'PANW', 'OKTA', 'MDB', 'SHOP', 'SE', 'UBER', 'LYFT',
    'ABNB', 'DASH', 'RBLX', 'U', 'SNAP', 'PINS', 'SPOT', 'SQ', 'ROKU', 'ZM'
  ];

  console.log(`[S-40] Building Universe (Limit: ${UNIVERSE_LIMIT})...`);
  const symbols = new Set<string>();

  try {
    // A) Gainers
    const gainersRes = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/gainers`, {}, true, budget);
    (gainersRes?.tickers || []).forEach((t: any) => symbols.add(t.ticker));
    console.log(`[S-40] Added ${gainersRes?.tickers?.length || 0} Gainers.`);

    // B) Losers (for balance)
    const losersRes = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/losers`, {}, true, budget);
    (losersRes?.tickers || []).forEach((t: any) => symbols.add(t.ticker));
    console.log(`[S-40] Added ${losersRes?.tickers?.length || 0} Losers.`);

    // C) Full Snapshot with Volume Filter (use prevDay.v for after-hours)
    const fullSnap = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers`, { limit: '500' }, true, budget);
    const snapshotTickers = (fullSnap?.tickers || [])
      .filter((t: any) => {
        const price = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0;
        // [S-40] Use prevDay.v as fallback for after-hours when day.v=0
        const vol = t.day?.v || t.prevDay?.v || 0;
        return price > 5 && vol > 500000;
      })
      .sort((a: any, b: any) => {
        // Sort by dollar volume (price * volume)
        const aVol = (a.day?.v || a.prevDay?.v || 0) * (a.lastTrade?.p || a.prevDay?.c || 0);
        const bVol = (b.day?.v || b.prevDay?.v || 0) * (b.lastTrade?.p || b.prevDay?.c || 0);
        return bVol - aVol;
      })
      .slice(0, 200);

    snapshotTickers.forEach((t: any) => symbols.add(t.ticker));
    console.log(`[S-40] After Volume/Price Filter: ${snapshotTickers.length} from snapshot, Total: ${symbols.size}`);

    // D) Grouped Daily Aggregates (previous trading day) for more candidates
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    // Skip weekends
    if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 2);
    if (yesterday.getDay() === 6) yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      const grouped = await fetchMassive(`/v2/aggs/grouped/locale/us/market/stocks/${dateStr}`, {}, true, budget);
      const topByDollarVol = (grouped?.results || [])
        .filter((r: any) => r.c > 5 && r.v > 500000) // price > $5, vol > 500k
        .map((r: any) => ({ ticker: r.T, dollarVol: r.c * r.v }))
        .sort((a: any, b: any) => b.dollarVol - a.dollarVol)
        .slice(0, 150);

      topByDollarVol.forEach((t: any) => symbols.add(t.ticker));
      console.log(`[S-40] Added ${topByDollarVol.length} from Grouped Aggs (${dateStr}). Total: ${symbols.size}`);
    } catch (e: any) {
      console.warn(`[S-40] Grouped aggs failed: ${e.message}`);
    }

    // E) Fallback Leaders if still low
    if (symbols.size < 100) {
      STATIC_LEADERS.forEach(s => symbols.add(s));
      console.log(`[S-40] Injected Fallback Leaders. Total: ${symbols.size}`);
    }

  } catch (e: any) {
    console.warn(`[S-40] Universe fetch partially failed: ${e.message}. Using backup leaders.`);
    STATIC_LEADERS.forEach(s => symbols.add(s));
  }

  console.log(`[S-40] Universe Candidates Final Count: ${symbols.size}`);
  return Array.from(symbols).slice(0, UNIVERSE_LIMIT);
}





// --- UTILS: FULL DICTIONARY & SENTIMENT ---
function translateToKorean(text: string): string {
  if (!text) return "";
  let translated = text;
  const phrases: Record<string, string> = {
    "Q1 Earnings": "1분기 실적", "Year-Over-Year": "전년 대비", "Market Close": "장 마감", "After Hours": "장 마감 후",
    "Interest Rate": "금리", "Unemployment Rate": "실업률", "CPI y/y": "소비자물가지수(YoY)", "Non-Farm": "비농업 고용"
  };
  const dict: Record<string, string> = {
    "Surge": "급등", "Soar": "폭등", "Plunge": "급락", "Revenue": "매출", "Earnings": "실적", "Guidance": "가이던스",
    "Bullish": "낙관", "Bearish": "비관", "Momentum": "모멘텀", "Volatility": "변동성", "Beat": "상회", "Miss": "하회"
  };
  Object.keys(phrases).forEach(k => { translated = translated.replace(new RegExp(k, 'gi'), phrases[k]); });
  Object.keys(dict).forEach(k => { translated = translated.replace(new RegExp(`\\b${k}\\b`, 'gi'), dict[k]); });
  return translated;
}

function analyzeSentiment(title: string): 'positive' | 'negative' | 'neutral' {
  const text = title.toLowerCase();
  if (['surge', 'soar', 'jump', 'beat', 'up'].some(w => text.includes(w))) return 'positive';
  if (['plunge', 'drop', 'miss', 'down', 'fail'].some(w => text.includes(w))) return 'negative';
  return 'neutral';
}

// --- ENGINE 2: TECHNICAL RSI (Polygon Official) ---
// --- ENGINE 2: TECHNICAL RSI (Polygon Official + Robust Fallback) ---
async function getTechnicalRSI(symbol: string, budget?: RunBudget): Promise<number | null> {
  try {
    // 1. Try Native Massive Indicator API
    const res = await fetchMassive(`/v1/indicators/rsi/${symbol}`, { timespan: 'day', window: '14', limit: '1' }, true, budget);
    if (res?.results?.values?.[0]) return res.results.values[0].value;
  } catch (e) {
    console.warn(`[RSI] Native API failed for ${symbol}, trying Aggs Calc fallback.`);
  }

  // 2. Fallback: Manual Calc from Aggs (30 days)
  try {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0];
    const aggs = await fetchMassive(`/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`, { limit: '50', sort: 'desc' }, true, budget);

    // Logic from marketDaySSOT (re-implemented here for isolation or reuse import)
    // Need approx 15+ candles
    const closes = (aggs?.results || []).map((r: any) => r.c).reverse(); // asc order needed
    if (closes.length > 14) {
      // Simple RSI Calc
      // ... (reuse calculation or import?)
      // Let's import calculateRSI from marketDaySSOT to avoid code dupe, but user said "don't calculate".
      // But requested fallback IS manual calc.
      const { calculateRSI } = await import('./marketDaySSOT');
      return calculateRSI(closes);
    }
  } catch (e) { }

  return null; // Don't return 50. Return null so UI shows '--'.
}

// --- ENGINE 3: OPTIONS, MAX PAIN & GEX (OI Integrity + Retry) ---
async function getPolygonOptionsChain(symbol: string, presetSpot?: number, budget?: RunBudget, useCache: boolean = true) {

  let allResults: any[] = [];
  let targetExpiry: string = "-";
  let spot = presetSpot || 0;

  try {
    // 1) Spot Price
    if (!spot) {
      const spotRes = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`, {}, useCache, budget);
      const t = spotRes?.ticker;
      spot = t?.lastTrade?.p || t?.min?.c || t?.day?.c || t?.prevDay?.c || 0;
    }

    // 2) Initial Fetch: Get ALL contracts within 14 days (Near-Term Focus)
    const todayStr = new Date().toISOString().split('T')[0];
    const d = new Date();
    d.setDate(d.getDate() + 14);
    const limitStr = d.toISOString().split('T')[0];

    const initialSnap = await fetchMassive(`/v3/snapshot/options/${symbol}`, {
      limit: '250',
      'expiration_date.gte': todayStr,
      'expiration_date.lte': limitStr, // [S-FOCUSED] 14-Day Limit
      sort: 'open_interest', // Get highest OI first to prioritize major contracts
      order: 'desc'
    }, useCache, budget);

    if (!initialSnap?.results?.length) {
      console.warn(`[Massive] No options snapshot found for ${symbol} (14d window)`);
      return { contracts: [], expiry: "14D_AGG", spot: spot || 0 };
    }

    // Capture "Dominant Expiry" for display (the one with most results or soonest)
    const dominantExpiry = initialSnap.results[0].expiration_date || "-";
    console.log(`[Massive] ${symbol} 14-Day Scan. Results: ${initialSnap.results.length} (Partial)`);

    // 3) Deep Scan via Pagination (bounded)
    allResults = [...initialSnap.results];
    let nextUrl = initialSnap.next_url;
    let pagesFetched = 1;
    const MAX_PAGES = 8; // Increased depth for broader window

    while (nextUrl && pagesFetched < MAX_PAGES) {
      console.log(`[Massive] Fetching page ${pagesFetched + 1} for ${symbol}...`);
      notifyStatus({ progress: { currentTicker: symbol, pagesFetchedCurrent: pagesFetched + 1 } });
      const nextSnap = await fetchMassive(nextUrl, {}, useCache, budget);
      if (nextSnap?.results?.length) {
        allResults = [...allResults, ...nextSnap.results];
        nextUrl = nextSnap.next_url;
        pagesFetched++;
      } else {
        break;
      }
    }

    // 4) Filter contracts + map
    // ✅ Use ALL fetched contracts in the 14-day window
    const contracts = allResults
      .map((c: any) => {
        const oi = Number(c.open_interest); // official OI
        return {
          strike_price: c.details?.strike_price || c.strike_price || 0,
          contract_type: (c.details?.contract_type || c.contract_type || c.details?.type || "call").toLowerCase(),
          open_interest: Number.isFinite(oi) ? oi : 0,
          greeks: c.greeks || { gamma: 0 },
          expiry: c.details?.expiration_date || c.expiration_date // Keep track of specific expiry
        };
      });

    console.log(`[Massive] ${symbol} Valid Contracts (14d): ${contracts.length}`);
    return { contracts, expiry: `Aggregated (<14d)`, spot: spot || 0 };
  } catch (e) {
    console.error(`[Massive Pagination Protocol Error] ${symbol}:`, (e as any).details || e);
    // [Critical Fix] Graceful Degradation: Return what we have (Page 1 is better than nothing)
    // Map existing results same as success path
    if (allResults.length > 0) {
      const contracts = allResults
        .filter((c: any) => (c.details?.expiration_date === targetExpiry || c.expiration_date === targetExpiry))
        .map((c: any) => {
          const oi = Number(c.open_interest);
          return {
            strike_price: c.details?.strike_price || c.strike_price || 0,
            contract_type: (c.details?.contract_type || c.contract_type || c.details?.type || "call").toLowerCase(),
            open_interest: Number.isFinite(oi) ? oi : 0,
            greeks: c.greeks || { gamma: 0 }
          };
        });
      return { contracts, expiry: targetExpiry, spot: spot || 0 };
    }
    return { contracts: [], expiry: "-", spot: 0 };
  }
}

function calculateGemsGreeks(contracts: any[], spot: number) {
  // No contracts
  if (!contracts || contracts.length === 0) {
    return {
      maxPain: null,
      totalGex: null,
      mmPos: "FAIL",
      edge: "Options Unavailable",
      comment: "[OI] Options: None found. Price-only decision authority.",
      strikes: [],
      putCallRatio: null,
      options_status: "NO_OPTIONS" as any,
      options_grade: "N/A",
      options_reason: "Target expiry contracts not found"
    };
  }

  // OI integrity check
  const totalOI = contracts.reduce((acc: number, c: any) => acc + (Number(c.open_interest) || 0), 0);
  const options_status = totalOI > 0 ? "OK" : "PENDING";
  // ✅ A 금지(2소스 교차 없으므로). 여기서는 B/C만.
  const options_grade = totalOI > 5000 ? "B" : "C";

  // ✅ Pending => do NOT return fake numbers
  if (options_status === "PENDING") {
    // If total OI is zero, it's effectively NO_OPTIONS for this expiry
    return {
      maxPain: null,
      totalGex: null,
      mmPos: "FAIL",
      edge: "Options Inactive",
      comment: "[OI] Options: Inactive (Zero OI). Price-only decision authority.",
      strikes: [],
      putCallRatio: null,
      options_status: "NO_OPTIONS" as any,
      options_grade: "C",
      options_reason: "Official OI field is zero"
    };
  }

  const strikes = Array.from(new Set(contracts.map((c: any) => c.strike_price))).sort((a: any, b: any) => a - b);

  // Max Pain
  let minLoss = Infinity;
  let maxPain = strikes[0];

  strikes.forEach((K: number) => {
    let loss = 0;
    contracts.forEach((c: any) => {
      const OI = Number(c.open_interest) || 0;
      const Strike = Number(c.strike_price) || 0;
      if (c.contract_type === 'call') loss += OI * Math.max(0, K - Strike);
      else loss += OI * Math.max(0, Strike - K);
    });
    if (loss < minLoss) {
      minLoss = loss;
      maxPain = K;
    }
  });

  // Net GEX & 0DTE GEX
  let totalGex = 0;
  let gexZeroDte = 0;

  // [S-45] 0DTE Logic: "Today" in NY Time
  const todayNY = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const todayDate = new Date(todayNY).toISOString().split('T')[0];

  contracts.forEach((c: any) => {
    const gamma = c.greeks?.gamma || 0;
    const OI = Number(c.open_interest) || 0;
    const val = (gamma * OI * 100);
    const flow = c.contract_type === 'call' ? val : -val;

    totalGex += flow;

    // 0DTE Check: Expiry matches today or tomorrow (handling timezones loosely for "Near Term")
    // Note: c.expiration_date is YYYY-MM-DD
    if (c.expiration_date <= todayDate) {
      gexZeroDte += flow;
    }
  });

  const gexZeroDteRatio = totalGex !== 0 ? Math.abs(gexZeroDte / totalGex) : 0;

  const mmPos = totalGex > 0 ? "Dealer Long Gamma" : "Dealer Short Gamma";
  const edge = totalGex > 0 ? "Range-friendly (Vol Crush)" : "Breakout/Risk (Vol Expand)";

  // Put/Call Ratio
  const totalCallsOI = contracts.filter((c: any) => c.contract_type === 'call')
    .reduce((acc: number, c: any) => acc + (Number(c.open_interest) || 0), 0);

  const totalPutsOI = contracts.filter((c: any) => c.contract_type === 'put')
    .reduce((acc: number, c: any) => acc + (Number(c.open_interest) || 0), 0);
  const putCallRatio = totalCallsOI > 0 ? (totalPutsOI / totalCallsOI) : null;

  const comment = `[Options] NetGEX ${totalGex > 0 ? "+" : ""}${(totalGex / 1000000).toFixed(1)}M. 0DTE Impact: ${(gexZeroDteRatio * 100).toFixed(0)}%. MaxPain $${Number(maxPain).toFixed(2)}.`;

  return {
    maxPain,
    totalGex,
    gexZeroDte,
    gexZeroDteRatio,
    mmPos,
    edge,
    comment,
    strikes,
    putCallRatio,
    options_status,
    options_grade,
    options_reason: options_status === "OK" ? "OK" : "PENDING_OI_DELAYED"
  };
}

export async function getOptionsData(symbol: string, presetSpot?: number, budget?: RunBudget, useCache: boolean = true): Promise<OptionData> {


  // [S-17] Options Block REMOVED by User Request (Unlimited API)
  /*
  if (DISABLE_OPTIONS_IN_DEV && process.env.ALLOW_MASSIVE_FOR_SNAPSHOT !== "1") {
    return {
      expirationDate: "-",
      currentPrice: presetSpot || 0,
      maxPain: 0,
      strikes: [],
      callsOI: [],
      putsOI: [],
      putCallRatio: undefined,
      gems: {
        mmPos: "PENDING",
        edge: "DEV: Options disabled",
        gex: 0,
        comment: "개발 서버 안정화: 옵션 API 호출 비활성화"
      },
      options_status: "PENDING",
      options_grade: "C",
      options_reason: "DEV server: options calls disabled"
    } as any;
  }
  */

  // [S-38D] Options-Eligibility Gate (Just-In-Time)
  // Step 1: Probe presence of ANY contracts for this ticker
  const probeSnap = await fetchMassive(`/v3/snapshot/options/${symbol}`, { limit: '10' }, useCache, budget);

  if (!probeSnap || !probeSnap.results || probeSnap.results.length === 0) {
    console.warn(`[S-38D] Eligibility Gate: NO_OPTIONS_LISTED for ${symbol}`);
    return {
      expirationDate: "-",
      currentPrice: presetSpot || 0,
      maxPain: null,
      strikes: [],
      callsOI: [],
      putsOI: [],
      putCallRatio: null,
      gems: { mmPos: "FAIL", edge: "Ineligible", gex: null, comment: "[S-38D] No listed options found. Removing from options pipeline." },
      options_status: "NO_OPTIONS" as any,
      options_grade: "N/A",
      options_reason: "NO_OPTIONS_LISTED"
    } as any;
  }

  // ✅ Retry: 5 tries (20/40/60/80)
  const MAX_OI_RETRIES = 5;
  let attempt = 0;

  let analytics: any = null;
  let chainData: any = null;

  while (attempt < MAX_OI_RETRIES) {
    chainData = await getPolygonOptionsChain(symbol, presetSpot, budget, useCache);
    const spotNum = chainData.spot || 0;
    analytics = calculateGemsGreeks(chainData.contracts, spotNum);

    if (analytics.options_status === "OK" || analytics.options_status === "NO_OPTIONS") break;

    attempt++;
    if (attempt < MAX_OI_RETRIES) {
      const waitMs = 20000 * attempt;
      console.log(`[OI Retry] ${symbol} OI PENDING. Retrying in ${waitMs / 1000}s (Attempt ${attempt}/${MAX_OI_RETRIES})`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  // [Phase 20] Verification Log
  if (analytics && analytics.totalGex !== null) {
    console.log(`[Alpha] Option Wall: ${symbol} GEX=${analytics.totalGex.toFixed(0)} MP=${analytics.maxPain}`);
  }

  const spotNum = chainData?.spot || 0;

  // ✅ Pending => return NO fake options numbers
  if (!analytics || analytics.options_status !== "OK") {
    // If we exhausted retries, it's a FAIL, not PENDING forever
    const finalStatus = "FAILED"; // Was "PENDING"

    return {
      expirationDate: chainData?.expiry || "-",
      currentPrice: spotNum,
      maxPain: null,
      strikes: [],
      callsOI: [],
      putsOI: [],
      putCallRatio: null,
      gems: { mmPos: "FAIL", edge: "Options Unavailable", gex: null, comment: "[OI] Options: Failed to fetch data. Price-only decision authority." },
      options_status: finalStatus,
      options_grade: "C",
      options_reason: analytics?.options_reason || "DATA_FETCH_FAILED"
    } as any;
  }

  // UI strike range ±15%
  const chartStrikes = (analytics.strikes || []).filter((s: number) => s >= spotNum * 0.85 && s <= spotNum * 1.15);

  return {
    expirationDate: chainData.expiry,
    currentPrice: spotNum,
    maxPain: analytics.maxPain,
    strikes: chartStrikes,
    callsOI: chartStrikes.map((s: number) => chainData.contracts.find((c: any) => c.strike_price === s && c.contract_type === 'call')?.open_interest || 0),
    putsOI: chartStrikes.map((s: number) => chainData.contracts.find((c: any) => c.strike_price === s && c.contract_type === 'put')?.open_interest || 0),
    putCallRatio: analytics.putCallRatio,
    gems: { mmPos: analytics.mmPos, edge: analytics.edge, gex: analytics.totalGex, comment: analytics.comment },
    options_status: analytics.options_status,
    options_grade: analytics.options_grade,
    options_reason: analytics.options_reason
  } as any;
}

export async function getTier01Data(forceReportMode = false, universeSymbols?: string[]): Promise<Tier01Data> {
  // Detector: if we have ALLOW_MASSIVE_FOR_SNAPSHOT, we are in a report run
  const isReportRun = forceReportMode || process.env.ALLOW_MASSIVE_FOR_SNAPSHOT === '1';
  const budget: RunBudget | undefined = isReportRun ? { current: 0, cap: 2000 } : undefined; // Increased budget for S-38


  const presetSymbols = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META', 'AMZN', 'GOOGL', 'NFLX', 'COIN', 'MSTR', 'PLTR'];
  const symbols = universeSymbols || presetSymbols;

  // A) Plan: universeCount, plannedRequests, concurrency, delayMs
  console.log(`[S-16] Plan: universeCount=${symbols.length}, plannedRequests=${symbols.length + 1}, concurrency=${isReportRun ? REPORT_CONCURRENCY : SPOT_CONCURRENCY}, delayMs=${FIXED_DELAY_MS}`);

  const startTime = Date.now();
  let okCount = 0;
  let failCount = 0;
  const failCodes: Record<string, number> = {};
  let firstFail: any = null;

  try {
    // Stage 1: Light Scan (Prices Only)
    // Polygon supports up to ~250 symbols in one CSV list
    const snapRes = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers`, { tickers: symbols.join(',') }, true, budget);
    if (!snapRes) {
      throw new Error("OPTIONS_UNAVAILABLE: Snapshot baseline failed");
    }
    const allTickers = snapRes?.tickers || [];
    const tickersRaw = allTickers.filter((t: any) => symbols.includes(t.ticker));
    console.log(`[S-16] Stage 1: snapRes tickers: ${allTickers.length}, Matched: ${tickersRaw.length}`);
    okCount++;

    // Stage 1.5: Pre-Score and Rank to find Top K
    const preliminaryTickers = tickersRaw.map((t: any) => analyzeGemsTicker(t, "Neutral"));
    const rankedTickers = preliminaryTickers.sort((a: any, b: any) => b.alphaScore - a.alphaScore);

    // Select Top K for Heavy Options Analysis
    const TOP_K = parseInt(process.env.TOP_K || "60");
    const heavySymbols = rankedTickers.slice(0, TOP_K).map((t: any) => t.symbol);

    console.log(`[S-38] Stage 1 Complete. Universe: ${tickersRaw.length}, Heavy Top-K: ${heavySymbols.length}`);

    // [S-55.7] Load Yesterday's Report for Diff
    const { getYesterdayReport } = await import('../lib/storage/reportStore');
    const { generateReportDiff } = await import('./reportDiff');
    const prevReport = await getYesterdayReport("tier01"); // Assume "tier01" is the type
    const missingTickers: string[] = [];

    // Stage 2: Heavy Options collection
    const finalTickers: GemsTicker[] = [];

    for (let i = 0; i < tickersRaw.length; i++) {
      const t = tickersRaw[i];
      const isHeavy = heavySymbols.includes(t.ticker);

      try {
        notifyStatus({
          progress: {
            currentTicker: t.ticker,
            tickersDone: i,
            totalTickers: tickersRaw.length,
            pagesFetchedCurrent: 0
          },
          lastError: undefined
        });

        if (!isHeavy) {
          // Fast Path: skip heavy options, use light analytic
          finalTickers.push(analyzeGemsTicker(t, "Neutral"));
          continue;
        }

        const spot = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0;

        // Bounded execution: 60s per ticker
        const [opts, historyMetrics] = await Promise.race([
          Promise.all([
            getOptionsData(t.ticker, spot, budget),
            (async () => {
              try {
                const to = new Date().toISOString().split('T')[0];
                const from = new Date(Date.now() - 40 * 86400000).toISOString().split('T')[0];
                const aggs = await getAggregates(t.ticker, 1, 'day', from, to, budget);
                if (!aggs || aggs.length < 5) return undefined;
                const cNow = aggs[aggs.length - 1].close;
                const c1W = aggs[aggs.length - 5]?.close || cNow;
                const c1M = aggs[0]?.close || cNow;
                return { change1W: ((cNow - c1W) / c1W) * 100, change1M: ((cNow - c1M) / c1M) * 100 };
              } catch { return undefined; }
            })()
          ]),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT_TICKER_OPTIONS")), 60000))
        ]) as [any, any];

        // [S-21] In Report Mode, we STILL collect the ticker even if options are PENDING
        finalTickers.push(analyzeGemsTicker(t, "Neutral", opts, isReportRun, historyMetrics));

        if (opts.options_status === "OK") {
          okCount++;
        } else {
          failCount++;
          if (opts.options_status) {
            failCodes[opts.options_status as string] = (failCodes[opts.options_status as string] || 0) + 1;
            if (opts.options_status === 'FAILED') missingTickers.push(t.ticker);
          }
        }
      } catch (e: any) {
        failCount++;
        const code = e.message?.includes("429") ? "429" : e.message?.includes("timeout") ? "TIMEOUT" : "ERR";
        failCodes[code] = (failCodes[code] || 0) + 1;

        // Critical Logic: Capture missing tickers for ReportDiff
        missingTickers.push(t.ticker);

        if (!firstFail) {
          firstFail = {
            ticker: t.ticker,
            status: code,
            retryCount: 5,
            elapsed: Date.now() - startTime
          };
        }

        // UI Path / Non-aborting Report Path: Fallback to price-only for this ticker
        finalTickers.push(analyzeGemsTicker(t, "Neutral"));
      }
    }

    const sortedFinal = finalTickers.sort((a, b) => b.alphaScore - a.alphaScore).map((t, i) => ({ ...t, rank: i + 1 }));

    // [S-55.7] Generate Report Diff
    const partialCurrReport = { tickers: sortedFinal, swapSignal: {}, marketSentiment: {} } as Tier01Data;
    const reportDiff = generateReportDiff(prevReport, partialCurrReport, missingTickers);

    // B) Result: okCount, failCount, failCodes summary
    console.log(`[S-16/21] Result: okCount=${okCount}, failCount=${failCount}, failCodes=${JSON.stringify(failCodes)}`);

    return {
      tickers: sortedFinal,
      swapSignal: {
        action: "MAINTAIN",
        reason: "GEMS V8.1 Deterministic Scan Complete.",
        scoreDiff: sortedFinal.length > 1 ? sortedFinal[0].alphaScore - sortedFinal[1].alphaScore : 0.00,
        strategy: "Maintain core positions based on PulseScore momentum."
      },
      marketSentiment: { fearGreed: 74, sentiment: "Greed" },
      reportDiff: reportDiff
    };
  } catch (e: any) {
    // B) Result (Fail case)
    console.log(`[S-16] Result: okCount=${okCount}, failCount=${failCount}, failCodes=${JSON.stringify(failCodes)}`);

    // C) FirstFail: ticker, httpStatus/timeout, retryCount, elapsed
    if (firstFail) {
      console.log(`[S-16] FirstFail: ticker=${firstFail.ticker}, status=${firstFail.status}, retryCount=${firstFail.retryCount}, elapsed=${firstFail.elapsed}ms`);
    } else {
      console.log(`[S-16] FirstFail: Critical start failure. ${e.message}`);
    }

    console.error("GEMS DATA ERROR:", e.message);
    if (isReportRun) throw e; // Maintain S-15 Abort Contract

    // UI Fallback: Return what we have (even empty tickers) to avoid complete break
    return {
      tickers: [],
      swapSignal: { action: "ERROR", reason: e.message, scoreDiff: 0, strategy: "N/A" },
      marketSentiment: { fearGreed: 50 }
    };
  }
}

// --- ENGINE 5: MACRO, CHART, NEWS, MOVERS ---
// --- ENGINE 5: MACRO, CHART, NEWS, MOVERS ---
export async function getMacroData(): Promise<MacroData> {
  // [S-48.2] Yahoo Removed. Using SSOT if possible or Safe Default.
  // Ideally this should use getMacroSnapshotSSOT() but to avoid circular deps with macroHubProvider (if any),
  // we return safe defaults or let the UI use the macroHubProvider directly (which it does).
  // This function might be deprecated.
  return { us10y: 4.2, us10yChange: 0, vix: 16, vixChange: 0, regime: "Neutral" };
}

export async function getStockData(symbol: string, range: Range = "1d"): Promise<StockData> {

  // [S-48.2] Yahoo Index Bypass REMOVED.
  // All symbols proceed to Standard Provider (Polygon/Massive).

  const [snapRes, history, rsi] = await Promise.all([
    fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`),
    getStockChartData(symbol, range),
    getTechnicalRSI(symbol)
  ]);

  const t = snapRes?.ticker;
  if (!t) throw new Error(`Ticker '${symbol}' not found (Data Unavailable).`);

  // Session Detection (ET) - [S-52.2.3] Use reliable timezone utility
  const { getETNow } = await import('@/services/timezoneUtils');
  const et = getETNow();
  const etTime = et.hour + et.minute / 60;

  // [S-55.5] Quote Freshness Logic
  const lastUpdateNanos = t?.lastTrade?.t || t?.updated || (Date.now() * 1000000);
  const lastUpdateMs = Math.floor(lastUpdateNanos / 1000000);
  const nowMs = Date.now();
  const ageSec = Math.floor((nowMs - lastUpdateMs) / 1000);

  const quoteDate = new Date(lastUpdateMs);
  const asOfET = quoteDate.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).replace(',', '') + " ET";

  const isClosedWrapper = et.isWeekend || (etTime < 4 || etTime >= 20);
  const isStale = !isClosedWrapper && ageSec > 60;
  const freshnessStatus = isClosedWrapper ? "시장 종료" : (isStale ? "지연" : "실시간");

  const freshness = {
    asOfET,
    asOfISO: quoteDate.toISOString(),
    ageSec,
    isStale,
    source: 'realtime' as const,
    message: freshnessStatus
  };

  let session: 'pre' | 'reg' | 'post' = 'reg';

  if (et.isWeekend) {
    session = 'reg';
  } else {
    if (etTime >= 4 && etTime < 9.5) session = 'pre';
    else if (etTime >= 16 && etTime < 20) session = 'post';
    else if (etTime >= 9.5 && etTime < 16) session = 'reg';
    else session = (etTime >= 20 || etTime < 4) ? 'post' : 'reg';
  }

  // Base Reference (Regular Close)
  const prevClose = t?.prevDay?.c || 0;
  const todayClose = t?.day?.c || prevClose;

  // [Phase 23] Session-Aware Change Base:
  // - Pre-Market: Change vs prevClose (yesterday's close)
  // - Regular: Change vs prevClose (yesterday's close)  
  // - Post-Market: Change vs todayClose (same-day regular close)
  let changeBase = prevClose; // Default for pre/regular
  if (session === 'post') {
    changeBase = todayClose; // Post uses today's close as base
  }

  // regPrice = the regular session price to display
  const regPrice = (session === 'pre') ? prevClose : todayClose;

  // Latest Spot (Real-time current price)
  const latestPrice = t?.lastTrade?.p || t?.min?.c || t?.day?.c || t?.prevDay?.c || 0;

  // [Phase 23] Extended Hours Logic
  const isExtended = session !== 'reg';
  const extPrice = isExtended ? latestPrice : undefined;
  const extChange = isExtended ? (latestPrice - changeBase) : undefined;
  const extChangePercent = isExtended ? (changeBase !== 0 ? ((latestPrice - changeBase) / changeBase) * 100 : 0) : undefined;

  // Regular Session Change (always vs prevClose)
  const regChange = t?.todaysChange || (todayClose - prevClose);
  const regChangePercent = t?.todaysChangePerc || (prevClose !== 0 ? ((todayClose - prevClose) / prevClose) * 100 : 0);

  // [Phase 23] 3-Day Return (Trading Days Only)
  // Fetch 10 calendar days to ensure we get 3+ trading days
  let return3d = 0;
  let prevChangePercent = 0; // [Phase 56]
  try {
    const dailyHist = await getAggregates(symbol, 1, 'day',
      new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
      new Date().toISOString().split('T')[0]
    );
    // Use last 4 trading candles (today + 3 previous trading days)
    if (dailyHist.length >= 4) {
      // Get exactly 3 trading days back from the most recent candle
      const recentCandles = dailyHist.slice(-4);
      const price3dAgo = recentCandles[0].close; // 3 trading days ago
      const currentClose = recentCandles[recentCandles.length - 1].close; // Most recent
      return3d = ((currentClose - price3dAgo) / price3dAgo) * 100;
    }
    // [Phase 56] Previous Trading Day Change (for Pre-market static display)
    if (dailyHist.length >= 2) {
      // Logic: If last candle is Today (partial), ignore it.
      // Get last COMPLETED candle.
      const todayDate = new Date().toISOString().split('T')[0];
      const lastCandle = dailyHist[dailyHist.length - 1];
      const lastDate = lastCandle.date.split('T')[0];

      let targetIndex = dailyHist.length - 1;
      if (lastDate === todayDate && dailyHist.length >= 3) {
        targetIndex = dailyHist.length - 2; // Move back one if today is present
      }

      if (targetIndex >= 1) {
        const yesterdayNode = dailyHist[targetIndex];
        const dayBeforeNode = dailyHist[targetIndex - 1];
        if (dayBeforeNode.close > 0) {
          prevChangePercent = ((yesterdayNode.close - dayBeforeNode.close) / dayBeforeNode.close) * 100;
        }
      }
    }
  } catch (e) { }

  return {
    symbol, name: symbol, price: latestPrice,
    change: isExtended ? (extChange || 0) : (regChange || 0),
    changePercent: isExtended ? (extChangePercent || 0) : (regChangePercent || 0),
    prevChangePercent, // [Phase 56]
    dayHigh: t?.day?.h, dayLow: t?.day?.l, volume: t?.day?.v, marketCap: 0,
    currency: "USD", history, rsi: rsi ?? undefined, return3d,
    extPrice, extChange, extChangePercent, session,
    vwap: t?.day?.vw,
    regPrice, regChange, regChangePercent,
    freshness // [S-55.5]
  };
}

export async function getStockNews(symbol: string, limit: number = 20): Promise<NewsItem[]> {

  // Fetch more than needed to ensure we have enough after filtering
  const res = await fetchMassive(`/v2/reference/news`, { ticker: symbol, limit: String(limit) });

  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const filtered = (res?.results || []).map((n: any) => {
    try {
      const pubDate = new Date(n.published_utc);
      if (isNaN(pubDate.getTime())) return null;

      // Filter: Only within last 48 hours
      if (pubDate < fortyEightHoursAgo) return null;

      const ageHours = Math.floor((now.getTime() - pubDate.getTime()) / (1000 * 60 * 60));

      // Convert to ET (America/New_York)
      // Format: YYYY-MM-DD HH:mm ET
      const etFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const parts = etFormatter.formatToParts(pubDate);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value;
      const publishedAtEt = `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')} ET`;

      return {
        title: translateToKorean(n.title),
        link: n.article_url,
        publisher: n.publisher.name,
        time: n.published_utc,
        publishedAtEt,
        ageHours,
        sentiment: analyzeSentiment(n.title),
        type: 'News' as const
      } as NewsItem;
    } catch (e) {
      return null;
    }
  }).filter((item: NewsItem | null): item is NewsItem => item !== null);

  // Return the 5 most recent
  return filtered
    .sort((a: NewsItem, b: NewsItem) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5);
}

// Helper: Fetch Aggregates (Chart Data)
async function getAggregates(symbol: string, multiplier: number, timespan: string, from: string, to: string, budget?: RunBudget) {
  const endpoint = `/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`;
  const res = await fetchMassive(endpoint, { limit: '5000', adjust: 'true', sort: 'asc' }, true, budget);
  return (res?.results || []).map((r: any) => ({
    date: new Date(r.t).toISOString(),
    close: r.c
  }));
}

export async function getStockChartData(symbol: string, range: Range = "1d"): Promise<any[]> {
  const now = new Date();
  const to = now.toISOString().split('T')[0];

  try {
    if (range === "1d") {
      const fromDate = new Date();
      fromDate.setDate(now.getDate() - 2);
      const from = fromDate.toISOString().split('T')[0];

      const data = await getAggregates(symbol, 1, 'minute', from, to);

      // [S-53.9] 1D Chart Session Masking - Hard Cut Implementation
      // Sessions: Pre (04:00-09:30), Regular (09:30-16:00), Post (16:00-20:00)
      // CLOSED (20:00-04:00): HARD DROP - no data kept

      // ET formatter with full date info
      const etFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // [S-53.9] SSOT Session Classifier
      const classifyPoint = (date: Date): {
        session: 'PRE' | 'REG' | 'POST' | 'CLOSED',
        etHour: number,
        etMinute: number,
        etDateYYYYMMDD: string,
        etFormatted: string
      } => {
        const parts = etFormatter.formatToParts(date);
        const year = parts.find(p => p.type === 'year')?.value || '2025';
        const month = parts.find(p => p.type === 'month')?.value || '01';
        const day = parts.find(p => p.type === 'day')?.value || '01';
        const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '12', 10);
        const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

        const etDateYYYYMMDD = `${year}-${month}-${day}`;
        const etFormatted = `${month}/${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ET`;
        const etTime = hour + minute / 60;

        // [S-53.9] Hard Cut: Only 04:00-20:00 allowed
        let session: 'PRE' | 'REG' | 'POST' | 'CLOSED';
        if (hour < 4) {
          session = 'CLOSED'; // 00:00-03:59 - HARD DROP
        } else if (etTime >= 4 && etTime < 9.5) {
          session = 'PRE';
        } else if (etTime >= 9.5 && etTime < 16) {
          session = 'REG';
        } else if (etTime >= 16 && etTime < 20) {
          session = 'POST';
        } else {
          session = 'CLOSED'; // 20:00-23:59 - HARD DROP
        }

        return { session, etHour: hour, etMinute: minute, etDateYYYYMMDD, etFormatted };
      };

      // [S-54.2] First pass: find baseDateET from REG sessions
      const regDates = new Set<string>();
      data.forEach((curr: any) => {
        const date = new Date(curr.date);
        const classified = classifyPoint(date);
        if (classified.session === 'REG') {
          regDates.add(classified.etDateYYYYMMDD);
        }
      });

      // [S-54.2] baseDateET = most recent date with REG session
      const sortedRegDates = Array.from(regDates).sort().reverse();
      const baseDateET = sortedRegDates[0] || classifyPoint(new Date()).etDateYYYYMMDD;

      // Debug counters
      let droppedClosedCount = 0;
      let droppedPre4amCount = 0;
      let droppedPost8pmCount = 0;
      let insertedGapsCount = 0;
      let keptCount = 0;
      const boundariesHit: string[] = [];
      let earliestKeptET = '';
      let latestKeptET = '';
      let prevSession: string | null = null;

      const processed = data.reduce((acc: any[], curr: any, idx: number) => {
        const date = new Date(curr.date);
        const classified = classifyPoint(date);

        // [S-54.2] HARD CUT: Drop all CLOSED session data
        if (classified.session === 'CLOSED') {
          if (classified.etHour < 4) {
            droppedPre4amCount++;
          } else {
            droppedPost8pmCount++;
          }
          // [S-65] REMOVED: Null gap injection was causing filled shapes in Recharts.
          // The gradient handles session color transitions without needing null points.
          prevSession = 'CLOSED';
          return acc;
        }

        // Track earliest/latest kept for debug
        if (!earliestKeptET) earliestKeptET = classified.etFormatted;
        latestKeptET = classified.etFormatted;
        keptCount++;

        // Session boundary detection (for null gap insertion)
        if (prevSession && prevSession !== classified.session && prevSession !== 'CLOSED') {
          const boundaryKey = `${prevSession}->${classified.session}`;
          if (!boundariesHit.includes(boundaryKey)) {
            boundariesHit.push(boundaryKey);
          }
          // [S-65] REMOVED: No null gap needed. Gradient handles session color changes.
        }

        // [S-54.2] Add dateET, etMinute, session to each point
        acc.push({
          ...curr,
          dateET: classified.etFormatted,
          etMinute: classified.etHour * 60 + classified.etMinute,
          etDate: classified.etDateYYYYMMDD,
          session: classified.session
        });
        prevSession = classified.session;
        return acc;
      }, []);

      // [S-54.2] Enhanced sessionMaskDebug
      (processed as any).sessionMaskDebug = {
        baseDateET,
        earliestKeptET,
        latestKeptET,
        droppedClosedCount,
        droppedPre4amCount,
        droppedPost8pmCount,
        insertedGapsCount,
        keptCount,
        boundariesHit,
        regDatesFound: sortedRegDates.length,
        buildId: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local'
      };

      console.log(`[S-54.2] Chart Session Mask: kept=${keptCount}, droppedPre4am=${droppedPre4amCount}, droppedPost8pm=${droppedPost8pmCount}, baseDateET=${baseDateET}, earliest=${earliestKeptET}`);

      // [User Fix] During Pre-Market, only show TODAY's data (fresh chart start)
      // Classify current time to check if we're in Pre-Market
      const currentClassified = classifyPoint(new Date());
      let finalProcessed = processed;

      // [S-65] Determine TARGET trading day for 1D chart
      // - During CLOSED session (00:00-04:00 next day): Show PREVIOUS trading day
      // - During PRE/REG/POST: Show current day
      const todayDateET = currentClassified.etDateYYYYMMDD;
      let targetTradingDayET = todayDateET;

      if (currentClassified.session === 'CLOSED' && currentClassified.etHour < 4) {
        // Overnight CLOSED (00:00-03:59): Show previous calendar day
        const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
        const yesterdayClassified = classifyPoint(yesterday);
        targetTradingDayET = yesterdayClassified.etDateYYYYMMDD;
        console.log(`[1D Chart] Overnight CLOSED - showing previous day: ${targetTradingDayET}`);
      }

      // Debug: Log unique dates in processed data
      const uniqueDates = [...new Set(processed.map((p: any) => p.etDate))];
      console.log(`[1D Chart Debug] AvailableDates: ${uniqueDates.join(', ')}, TargetDay: ${targetTradingDayET}, Session: ${currentClassified.session}`);

      finalProcessed = processed.filter((p: any) => p.etDate === targetTradingDayET);
      console.log(`[1D Chart Filter] TargetDay: ${targetTradingDayET}, Filtered: ${finalProcessed.length} from ${processed.length}`);

      // Preserve sessionMaskDebug
      (finalProcessed as any).sessionMaskDebug = (processed as any).sessionMaskDebug;
      (finalProcessed as any).sessionMaskDebug.todayDateET = todayDateET;
      (finalProcessed as any).sessionMaskDebug.currentSession = currentClassified.session;

      // Limit to max points for performance
      if (finalProcessed.length > 1200) return finalProcessed.slice(-1200);
      return finalProcessed;
    }

    let fromDate = new Date();
    const multiplier = 1;
    let timespan = 'day';

    if (range === "1w") {
      fromDate.setDate(now.getDate() - 7);
      timespan = 'hour'; // [HOTFIX] Use Hourly for 5D to avoid straight line
    }
    else if (range === "1m") fromDate.setMonth(now.getMonth() - 1);
    else if (range === "3m") fromDate.setMonth(now.getMonth() - 3);
    else if (range === "6m") fromDate.setMonth(now.getMonth() - 6);
    else if (range === "1y") fromDate.setFullYear(now.getFullYear() - 1);
    else if (range === "ytd") fromDate = new Date(now.getFullYear(), 0, 1);
    else fromDate.setFullYear(now.getFullYear() - 5);

    const from = fromDate.toISOString().split('T')[0];
    return await getAggregates(symbol, multiplier, timespan, from, to);

  } catch (e) {
    console.error(`[Chart Error] ${symbol}:`, e);
    return [];
  }
}

export async function getMarketMovers() {

  const res = await fetchMassive('/v2/snapshot/locale/us/markets/stocks/gainers');
  return {
    gainers: (res?.tickers || []).slice(0, 5).map((t: any) => ({ symbol: t.ticker, price: t.day?.c, changePercent: t.todaysChangePerc })),
    losers: []
  };
}

// [S-41] Market Status API for holiday detection
export interface MarketStatus {
  market: "open" | "closed" | "extended-hours";
  session: "pre" | "regular" | "post" | "closed";
  isHoliday: boolean;
  holidayName?: string;
  nextOpen?: string;
  nextClose?: string;
  serverTime: string;
}

export async function getMarketStatus_LEGACY(): Promise<MarketStatus> {
  try {
    const res = await fetch(`${MASSIVE_BASE_URL}/v1/marketstatus/now?apiKey=${MASSIVE_API_KEY}`, {
      next: { revalidate: 60 }
    });

    if (!res.ok) throw new Error(`Market status API failed: ${res.status}`);

    const data = await res.json();

    // Parse Polygon response
    const stocksStatus = data.exchanges?.nasdaq || data.exchanges?.nyse || data.market || "closed";
    const isOpen = stocksStatus === "open";
    const isExtended = stocksStatus === "extended-hours";

    // Determine session from time if API doesn't provide it
    const now = new Date();
    const etHour = parseInt(now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
    const etMin = parseInt(now.toLocaleString("en-US", { timeZone: "America/New_York", minute: "numeric" }));
    const etTime = etHour * 60 + etMin;

    let session: "pre" | "regular" | "post" | "closed" = "closed";
    if (isOpen) {
      session = "regular";
    } else if (isExtended) {
      if (etTime >= 240 && etTime < 570) session = "pre"; // 4:00 AM - 9:30 AM
      else if (etTime >= 960 && etTime < 1200) session = "post"; // 4:00 PM - 8:00 PM
      else session = "closed";
    } else {
      // Check if it's a market holiday
      if (etTime >= 240 && etTime < 1200) {
        // During normal trading hours but market closed = holiday or weekend
        session = "closed";
      }
    }

    // Check for holiday indicator
    const isHoliday = data.exchanges?.nasdaq === "closed" && data.exchanges?.nyse === "closed" &&
      now.getDay() !== 0 && now.getDay() !== 6; // Not weekend but closed

    return {
      market: isOpen ? "open" : isExtended ? "extended-hours" : "closed",
      session,
      isHoliday,
      holidayName: isHoliday ? (data.holiday || "Market Holiday") : undefined,
      nextOpen: data.nextOpen,
      nextClose: data.nextClose,
      serverTime: data.serverTime || new Date().toISOString()
    };
  } catch (e: any) {
    console.warn(`[S-41] Market status API failed: ${e.message}. Using fallback.`);

    // Fallback: heuristic-based detection
    const now = new Date();
    const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const etDate = new Date(etStr);
    const etHour = etDate.getHours();
    const etMin = etDate.getMinutes();
    const etTime = etHour * 60 + etMin;
    const dayOfWeek = etDate.getDay();

    // Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        market: "closed",
        session: "closed",
        isHoliday: false,
        serverTime: now.toISOString()
      };
    }

    // Known US market holidays (approximate)
    const dateKey = `${etDate.getMonth() + 1}-${etDate.getDate()}`;
    const holidays: Record<string, string> = {
      "1-1": "New Year's Day",
      "7-4": "Independence Day",
      "12-25": "Christmas Day",
      "12-24": "Christmas Eve (Early Close)",
      "11-28": "Thanksgiving Day"
    };

    if (holidays[dateKey]) {
      return {
        market: "closed",
        session: "closed",
        isHoliday: true,
        holidayName: holidays[dateKey],
        serverTime: now.toISOString()
      };
    }

    // Time-based session detection
    let session: "pre" | "regular" | "post" | "closed" = "closed";
    if (etTime >= 240 && etTime < 570) session = "pre";
    else if (etTime >= 570 && etTime < 960) session = "regular";
    else if (etTime >= 960 && etTime < 1200) session = "post";

    return {
      market: session === "regular" ? "open" : session === "closed" ? "closed" : "extended-hours",
      session,
      isHoliday: false,
      serverTime: now.toISOString()
    };
  }
}


// [S-45] SSOT Delegator
export async function getMarketStatus(): Promise<MarketStatus> {
  // Use require to avoid top-level import cycles
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getMarketStatusSSOT } = require('./marketStatusProvider');
  const ssot = await getMarketStatusSSOT();

  return {
    market: ssot.market,
    session: ssot.session,
    isHoliday: ssot.isHoliday,
    holidayName: ssot.holidayName || (ssot.isHoliday ? "Market Holiday" : undefined),
    nextOpen: ssot.nextOpen,
    nextClose: ssot.nextClose,
    serverTime: ssot.serverTime
  };
}
