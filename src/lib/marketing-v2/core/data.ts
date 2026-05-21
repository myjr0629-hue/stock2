// ============================================================================
// Marketing V2 — Data Collector
// Redis에서 시장 데이터를 수집하는 단일 모듈
// 모든 Prepare가 이 파일만 통해 데이터에 접근
// ============================================================================

import { getFromCache } from '@/services/redisClient';
import { getETNow } from '@/services/timezoneUtils';

// ── Safe cache reader ──
async function safeGet(key: string): Promise<any> {
  try { return await getFromCache(key); } catch { return null; }
}

function parseJSON(data: any): any {
  if (!data) return null;
  if (typeof data === 'string') { try { return JSON.parse(data); } catch { return data; } }
  return data;
}

// ── Market Data (SPY, QQQ, VIX, GEX, DP) ──
export interface MarketSnapshot {
  spy: number;          // S&P 500 change %
  qqq: number;          // NASDAQ change %
  dia: number;          // DOW change %
  vix: number;          // VIX level
  gexRegime: string;    // positive | negative | neutral
  darkPool: number;     // Dark pool %
  fearGreed: number;    // CNN Fear & Greed
  spyPrice: number;     // SPY 현재가
}

export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const { getStockDataLight } = await import('@/services/marketDataLight');

  const [spyStock, qqqStock, diaStock, vixRaw, gexRaw, dpRaw, fgRaw] = await Promise.all([
    getStockDataLight('SPY'),
    getStockDataLight('QQQ'),
    getStockDataLight('DIA'),
    safeGet('yahoo:vix'),
    safeGet('analysis:gex:regime'),
    safeGet('marketing:dp:latest:SPY'),
    safeGet('cnn:feargreed'),
  ]);

  const vixP = parseJSON(vixRaw);
  const gexP = parseJSON(gexRaw);

  let spy = spyStock?.changePercent ?? 0;
  let qqq = qqqStock?.changePercent ?? 0;
  let dia = diaStock?.changePercent ?? 0;
  let spyPrice = spyStock?.price ?? 0;

  let vix = vixP?.price ?? vixP?.value ?? vixP?.last ?? 0;
  let gexRegime = gexP?.regime ?? gexP?.gexRegime ?? (typeof gexP === 'string' ? gexP : 'neutral');
  let darkPool = dpRaw ? parseFloat(String(dpRaw)) || 0 : 0;
  let fearGreed = 0;

  // CNN Fear & Greed
  const fgP = parseJSON(fgRaw);
  if (fgP?.score) fearGreed = fgP.score;
  else if (typeof fgP === 'number') fearGreed = fgP;

  // Fallback: VIX가 0일 때만 안전장치 가동
  if (vix === 0) {
    try {
      const warmRaw = await safeGet('cache:warm-command');
      const warm = parseJSON(warmRaw);
      const vixEntry = warm?.vix ?? warm?.VIX;
      if (vixEntry) {
        vix = typeof vixEntry === 'number' ? vixEntry : (vixEntry?.value ?? vixEntry?.price ?? 0);
      }
    } catch {}
  }
  if (vix === 0) {
    const vixA = parseJSON(await safeGet('cache:analysis:VIX'));
    if (vixA?.price) vix = vixA.price;
    else if (vixA?.value) vix = vixA.value;
  }

  // Live Dark Pool from EC2
  if (darkPool === 0) {
    try {
      const { fetchTradeData } = await import('@/services/realtimeMetricsService');
      const trades = await fetchTradeData('SPY');
      if (trades && trades.darkPoolPercent && trades.darkPoolPercent > 0) darkPool = trades.darkPoolPercent;
    } catch {}
  }

  console.log(`[MktV2/DataCollector] 💎 Polygon SSoT Real-time: SPY=${spy.toFixed(2)}%, QQQ=${qqq.toFixed(2)}%, DIA=${dia.toFixed(2)}%, SPY_Price=$${spyPrice.toFixed(2)}`);

  return { spy, qqq, dia, vix, gexRegime, darkPool, fearGreed, spyPrice };
}

// ── Guardian AI Verdicts ──
export interface GuardianVerdicts {
  en: string;
  ko: string;
  ja: string;
  briefing: string;
  rlsi: number;
}

export async function fetchGuardianVerdicts(): Promise<GuardianVerdicts> {
  const [enRaw, koRaw, jaRaw, briefRaw, rlsiRaw, mbKo, mbEn, mbJa] = await Promise.all([
    safeGet('guardian:ai_verdict:en'),
    safeGet('guardian:ai_verdict:ko'),
    safeGet('guardian:ai_verdict:ja'),
    safeGet('guardian:briefing:latest'),
    safeGet('rlsi:current'),
    // [FIX 2026-05-18] Fetch guardian morning briefing (generated at 08:00 ET by EC2 guardian-worker)
    // This is the actual narrative analysis — prefer over stale AI verdict for morning dispatch
    safeGet('guardian:morning_briefing:ko'),
    safeGet('guardian:morning_briefing:en'),
    safeGet('guardian:morning_briefing:ja'),
  ]);

  // Guardian AI verdict 구조: { title, description, sentiment, realityInsight }
  // realityInsight = TACTICAL INSIGHT 본문 (핵심 분석)
  // description = Rotation Analysis (보조 분석)
  const parse = (v: any) => {
    if (!v) return '';
    const p = parseJSON(v);
    if (typeof p === 'string') return p.substring(0, 300);
    // realityInsight가 가장 유용한 TACTICAL INSIGHT 텍스트
    const text = p?.realityInsight ?? p?.description ?? p?.text ?? p?.summary ?? p?.verdict ?? '';
    if (typeof text === 'string' && text.length > 0) {
      // Markdown 헤더 제거 (# Market Analysis → 본문만)
      return text.replace(/^#\s+[^\n]+\n+/g, '').trim().substring(0, 300);
    }
    return JSON.stringify(p).substring(0, 300);
  };

  // [FIX 2026-05-18] Morning briefing: prefer guardian-worker's narrative over AI verdict
  // The morning briefing is a full narrative generated at 08:00 ET with news + data context
  const parseBriefing = (raw: any) => {
    if (!raw) return '';
    const p = parseJSON(raw);
    return (p?.briefing ?? p?.text ?? '').substring(0, 450);
  };

  const mbKoText = parseBriefing(mbKo);
  const mbEnText = parseBriefing(mbEn);
  const mbJaText = parseBriefing(mbJa);

  return {
    en: mbEnText || parse(enRaw),
    ko: mbKoText || parse(koRaw),
    ja: mbJaText || parse(jaRaw),
    briefing: parseBriefing(briefRaw) || parse(briefRaw),
    rlsi: typeof rlsiRaw === 'number' ? rlsiRaw : parseFloat(String(rlsiRaw)) || 50,
  };
}

// ── Ticker Data (for SpaceX/Spotlight) ──
export interface TickerSnapshot {
  price: number;
  changePercent: number;
  darkPoolPercent: number;
  smartFlow: number;
  gexRegime: string;
  ivRank: number;
}

export async function fetchTickerData(ticker: string): Promise<TickerSnapshot> {
  const [analysisRaw, dpRaw] = await Promise.all([
    safeGet(`cache:analysis:${ticker}`),
    safeGet(`marketing:dp:latest:${ticker}`),
  ]);

  const analysis = parseJSON(analysisRaw) || {};
  let dp = analysis?.darkPoolPercent ?? 0;
  if (dp === 0 && dpRaw) dp = parseFloat(String(dpRaw)) || 0;

  // Live data
  let price = analysis?.price ?? 0;
  let changePercent = analysis?.changePercent ?? 0;

  try {
    const { getStockDataLight } = await import('@/services/marketDataLight');
    const stock = await getStockDataLight(ticker);
    if (stock?.price) price = stock.price;
    if (stock?.changePercent) changePercent = stock.changePercent;
    if (changePercent === 0 && stock?.prevClose && price > 0) {
      changePercent = ((price - stock.prevClose) / stock.prevClose) * 100;
    }
  } catch {}

  // Live trade data
  if (dp === 0) {
    try {
      const { fetchTradeData } = await import('@/services/realtimeMetricsService');
      const t = await fetchTradeData(ticker);
      if (t && t.darkPoolPercent && t.darkPoolPercent > 0) dp = t.darkPoolPercent;
    } catch {}
  }

  return {
    price,
    changePercent,
    darkPoolPercent: dp,
    smartFlow: analysis?.whaleIndex ?? analysis?.smartFlow ?? 50,
    gexRegime: String(analysis?.gexRegime ?? 'neutral').toLowerCase(),
    ivRank: analysis?.ivRank ?? analysis?.ivPercentile ?? 0,
  };
}

// ── SpaceX News ──
export interface SpaceXNews {
  headline: string;
  en: string;
  ko: string;
  ja: string;
  source: string;
}

export async function fetchSpaceXNews(): Promise<SpaceXNews> {
  let headline = '';
  const news: Record<string, string> = { en: '', ko: '', ja: '' };
  let source = 'generic';

  // 1. Guardian news digest
  try {
    const digestRaw = await safeGet('guardian:news:digest');
    if (digestRaw) {
      const digest = parseJSON(digestRaw);
      const items = digest?.items || [];
      const match = items.find((it: any) =>
        /spacex|starship|starlink|musk.*space|musk.*ipo/i.test(
          `${it.headline} ${it.summaryEN} ${it.analysisEN}`
        )
      );
      if (match) {
        headline = match.headline || '';
        news.en = [match.summaryEN, match.analysisEN].filter(Boolean).join(' ');
        news.ko = [match.summaryKR, match.analysisKR].filter(Boolean).join(' ');
        news.ja = [match.summaryJP, match.analysisJP].filter(Boolean).join(' ');
        source = 'guardian';
      }
    }
  } catch {}

  // 2. Polygon TSLA news
  if (!headline) {
    try {
      const { fetchMassive } = await import('@/services/massiveClient');
      const newsData = await fetchMassive('/v2/reference/news', { ticker: 'TSLA', limit: '10' }, true);
      const articles = (newsData?.results || []).filter((a: any) => a.title);
      const match = articles.find((a: any) =>
        /spacex|ipo|starship|starlink|musk.*space/i.test(a.title)
      );
      if (match) {
        headline = match.title;
        news.en = match.description || match.title;
        source = 'polygon';
      }
    } catch {}
  }

  // 3. Generic fallback
  if (!headline) {
    headline = 'SpaceX IPO preparation continues as institutional interest in space sector grows';
    news.en = 'SpaceX continues IPO preparation with institutional investors closely monitoring valuation developments and potential market impact.';
    source = 'generic';
  }

  // 4. AI Translation for missing KO/JA
  if (news.en && (!news.ko || !news.ja)) {
    try {
      const { callBedrock, MODELS } = await import('@/services/bedrockClient');
      const result = await callBedrock({
        modelId: MODELS.HAIKU_35,
        system: 'You are a SpaceX business analyst. Summarize the given news in Korean and Japanese. Each must be STANDALONE. Output ONLY valid JSON. Observation only, no investment advice.',
        userPrompt: `News: ${news.en}\n\nOutput: {"ko":"한국어 2-3문장","ja":"日本語2-3文"}`,
        maxTokens: 600,
        temperature: 0.2,
        timeoutMs: 20000,
        jsonPrefill: true,
        label: 'MktV2-SpaceX-Translate',
      });
      const koM = result.text.match(/"ko"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const jaM = result.text.match(/"ja"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (koM && !news.ko) news.ko = koM[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
      if (jaM && !news.ja) news.ja = jaM[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
    } catch {}
  }

  if (!news.ko) news.ko = news.en;
  if (!news.ja) news.ja = news.en;

  return { headline, en: news.en, ko: news.ko, ja: news.ja, source };
}
