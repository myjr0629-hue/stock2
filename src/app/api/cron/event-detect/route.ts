// ============================================================================
// /api/cron/event-detect — 이벤트 자동 감지 + Buffer 발송
// 5분마다 실행: GEX 플립, VIX 급등, 8-K 속보 감지
// 감지 시 → contentEngines.generateEventSpike() → Redis → buffer-dispatch 호출
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { generateEventSpike } from '@/lib/marketing/contentEngines';
import { generateAIEventSpike } from '@/lib/marketing/aiContentEngine';
import { captureEventAlert } from '@/lib/marketing/screenshotService';
import type { EventData, MarketData } from '@/lib/marketing/contentEngines';
import { fetchForm4, buildInsiderSummary } from '@/services/insiderService';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const COOLDOWN_MS = 30 * 60 * 1000; // 30분 쿨다운
const MAX_DAILY_EVENTS = 3;          // 하루 최대 이벤트 알림 수
const DEDUP_TTL = 86400;             // 24시간 중복 방지
const VIX_THRESHOLD = 15;            // VIX 변동률 %

// M7 + Physical AI + Sector Leaders (Top 30)
const TRACKED_TICKERS = [
  // M7
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA',
  // Physical AI / Semiconductor
  'AMD', 'AVGO', 'ARM', 'PLTR', 'SMCI',
  // Cloud / SaaS
  'CRM', 'SNOW', 'NET', 'CRWD',
  // Fintech / Payments
  'COIN', 'SQ', 'PYPL',
  // Biotech / Pharma
  'LLY', 'MRNA', 'ABBV',
  // Industrial / Energy
  'BA', 'LMT', 'XOM',
  // Consumer / Media
  'DIS', 'NFLX', 'SHOP', 'UBER', 'RIVN',
];

// ---------------------------------------------------------------------------
// GET Handler
// ?secret=xxx — CRON_SECRET 인증
// ?dry_run=true|false (default: true)
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');

  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
    const isParamValid = secretParam === cronSecret;
    if (!isHeaderValid && !isParamValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const dryRun = searchParams.get('dry_run') !== 'false';
  const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  try {
    // Check daily limit
    const dailyCountRaw = await safeGet(`marketing:event:count:${dateKey}`);
    const dailyCount = dailyCountRaw ? parseInt(String(dailyCountRaw)) : 0;
    if (dailyCount >= MAX_DAILY_EVENTS) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `Daily limit reached (${MAX_DAILY_EVENTS})`,
      });
    }

    // Check cooldown
    const lastEventTime = await safeGet('marketing:event:last_time');
    if (lastEventTime) {
      const elapsed = Date.now() - parseInt(String(lastEventTime));
      if (elapsed < COOLDOWN_MS) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Cooldown active (${Math.ceil((COOLDOWN_MS - elapsed) / 60000)}min remaining)`,
        });
      }
    }

    // Detect events
    const events: EventData[] = [];
    const marketData = await fetchMarketContext();

    // 1. GEX Flip detection
    const gexEvent = await detectGexFlip();
    if (gexEvent) events.push(gexEvent);

    // 2. VIX Spike detection
    const vixEvent = await detectVixSpike();
    if (vixEvent) events.push(vixEvent);

    // 3. SEC 8-K detection (M7 종목)
    const secEvents = await detectSec8K();
    events.push(...secEvents);

    // 4. ITM Sweep detection (Phase 4-1)
    const sweepEvents = await detectITMSweep();
    events.push(...sweepEvents);

    // 5. Dark Pool Spike detection (Phase 4-2)
    const dpEvent = await detectDarkPoolSpike();
    if (dpEvent) events.push(dpEvent);

    // 6. Insider Trading detection (V5.2 — SEC Form 4)
    const insiderEvents = await detectInsiderTrade();
    events.push(...insiderEvents);

    // 7. Fear Resolution Phase detection (V6.0 — N-Dimensional Deep Analysis)
    // 근거: QQQ↓ + VIXY↓ → T+3 적중률 89.7% (1,095개 조합 × 27,864쌍 실증)
    const fearEvent = await detectFearResolution(marketData);
    if (fearEvent) events.push(fearEvent);

    // Filter out already-sent events (dedup)
    const newEvents: EventData[] = [];
    for (const ev of events) {
      const dedupKey = `marketing:event:sent:${ev.type}:${ev.ticker}:${dateKey}`;
      const alreadySent = await safeGet(dedupKey);
      if (!alreadySent) {
        newEvents.push(ev);
      }
    }

    if (newEvents.length === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'No new events detected',
        checked: { gex: !!gexEvent, vix: !!vixEvent, sec: secEvents.length, sweep: sweepEvents.length, dp: !!dpEvent, insider: insiderEvents.length, fearResolution: !!fearEvent },
      });
    }

    // Process first event only (one at a time)
    const event = newEvents[0];
    let content;
    try {
      content = await generateAIEventSpike(event, marketData);
    } catch (err: any) {
      console.warn('[EventDetect] AI event failed, using template:', err.message);
      content = generateEventSpike(event, marketData);
    }

    // Save to Redis for buffer-dispatch
    const contentKey = `marketing:event:${dateKey}`;
    await setInCache(contentKey, JSON.stringify(content), 86400);

    // Capture event alert images (HTML template → PNG → Supabase CDN)
    let eventImages: { tweet: string | null; story: string | null } = { tweet: null, story: null };
    try {
      // event.type already matches screenshotService types
      const captureType = (
        event.type === 'level_break' ? 'gex_shift' :
        event.type
      ) as 'gex_shift' | 'unusual_volume' | 'whale' | 'sec_8k' | 'insider_trade' | 'fear_resolution';
      eventImages = await captureEventAlert({
        type: captureType,
        ticker: event.ticker,
        event: event.details || event.type,
        detail: content.en?.text?.substring(0, 100) || '',
        spy: marketData.spy || 0,
        vix: marketData.vix || 0,
        // dp(다크풀)는 은퇴 — 0 을 넘기면 이미지에 「0%」가 찍힌다
      });
      console.log(`[EventDetect] 📸 Captured: tweet=${!!eventImages.tweet}, story=${!!eventImages.story}`);
    } catch (err: any) {
      console.warn('[EventDetect] Image capture failed (non-fatal):', err.message);
    }

    // Save image URLs to Redis for dispatch
    if (eventImages.tweet || eventImages.story) {
      await setInCache(`marketing:event:images:${dateKey}`, JSON.stringify(eventImages), 86400);
    }

    // Mark as sent (dedup)
    const dedupKey = `marketing:event:sent:${event.type}:${event.ticker}:${dateKey}`;
    await setInCache(dedupKey, '1', DEDUP_TTL);

    // Update cooldown + daily count
    await setInCache('marketing:event:last_time', String(Date.now()), COOLDOWN_MS / 1000);
    await setInCache(`marketing:event:count:${dateKey}`, String(dailyCount + 1), 86400);

    // Trigger multi-platform dispatch (new marketing-dispatch route)
    if (!dryRun) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
      const dispatchUrl = `${baseUrl}/api/cron/marketing-dispatch?action=event&dry_run=false&date=${dateKey}&secret=${cronSecret || ''}`;
      try {
        await fetch(dispatchUrl, { method: 'GET' });
      } catch (e) {
        console.error('[EventDetect] Failed to trigger dispatch:', e);
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      event: {
        type: event.type,
        ticker: event.ticker,
        details: event.details,
      },
      dailyCount: dailyCount + 1,
      content: {
        en: content.en.text.substring(0, 100) + '...',
        ko: content.ko.text.substring(0, 100) + '...',
      },
    });
  } catch (err: any) {
    console.error('[Cron/EventDetect] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Detection Functions
// ---------------------------------------------------------------------------

async function detectGexFlip(): Promise<EventData | null> {
  try {
    const currentRaw = await safeGet('analysis:gex:regime');
    const previousRaw = await safeGet('marketing:event:gex:previous');

    const current = parseGexRegime(currentRaw);
    const previous = parseGexRegime(previousRaw);

    // Save current as previous for next check
    if (current) {
      await setInCache('marketing:event:gex:previous', current, 86400);
    }

    if (!current || !previous || current === previous) return null;

    // Only trigger on significant flips
    const isSignificant =
      (previous === 'positive' && current === 'negative') ||
      (previous === 'negative' && current === 'positive');

    if (!isSignificant) return null;

    return {
      ticker: 'SPY',
      type: 'gex_shift',
      details: `GEX flipped from ${previous.toUpperCase()} to ${current.toUpperCase()}. Dealer hedging behavior has shifted.`,
    };
  } catch {
    return null;
  }
}

async function detectVixSpike(): Promise<EventData | null> {
  try {
    const vixRaw = await safeGet('yahoo:vix');
    if (!vixRaw) return null;

    const vixData = typeof vixRaw === 'string' ? JSON.parse(vixRaw) : vixRaw;
    const changePct = vixData?.changePercent ?? vixData?.changePct;

    if (changePct == null || Math.abs(changePct) < VIX_THRESHOLD) return null;

    const direction = changePct > 0 ? 'surged' : 'dropped';
    const vixValue = vixData?.price ?? vixData?.last ?? vixData?.value;

    return {
      ticker: 'VIX',
      type: 'unusual_volume',
      details: `VIX ${direction} ${Math.abs(changePct).toFixed(1)}% to ${vixValue?.toFixed(1) || 'N/A'}. Hedging demand ${changePct > 0 ? 'elevated' : 'declining'}.`,
    };
  } catch {
    return null;
  }
}

async function detectSec8K(): Promise<EventData[]> {
  const events: EventData[] = [];
  try {
    for (const ticker of TRACKED_TICKERS) {
      const cacheKey = `sec:8k:${ticker}:latest`;
      const cached = await safeGet(cacheKey);
      if (!cached) continue;

      const filing = typeof cached === 'string' ? JSON.parse(cached) : cached;
      if (!filing?.title) continue;

      // Check if this filing is new (filed within last hour)
      const filingDate = new Date(filing.filing_date || filing.filedAt || '');
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (filingDate < hourAgo) continue;

      events.push({
        ticker,
        type: 'sec_8k',
        details: `SEC 8-K: ${filing.title || filing.description || 'New filing detected'}`,
      });
    }
  } catch {
    // Silent fail
  }
  return events;
}

// Phase 4-1: ITM Sweep Detection
// Reads unusual options flow from EC2 Redis accumulator
async function detectITMSweep(): Promise<EventData[]> {
  const events: EventData[] = [];
  const SWEEP_THRESHOLD = 5_000_000; // $5M+ premium
  try {
    for (const ticker of TRACKED_TICKERS) {
      const cacheKey = `options:flow:unusual:${ticker}`;
      const cached = await safeGet(cacheKey);
      if (!cached) continue;

      const flows = typeof cached === 'string' ? JSON.parse(cached) : cached;
      const sweeps = Array.isArray(flows) ? flows : flows?.trades || flows?.sweeps || [];

      for (const sweep of sweeps) {
        const premium = sweep.premium || sweep.value || sweep.total || 0;
        if (premium < SWEEP_THRESHOLD) continue;

        // Check freshness (within last 10 min)
        const ts = new Date(sweep.timestamp || sweep.time || '');
        if (Date.now() - ts.getTime() > 10 * 60 * 1000) continue;

        const side = sweep.side || sweep.type || (sweep.putCall === 'C' ? 'Call' : 'Put');
        const strike = sweep.strike ? `$${sweep.strike}` : '';
        const exp = sweep.expiration || sweep.exp || '';

        events.push({
          ticker,
          type: 'whale',
          details: `$${(premium / 1e6).toFixed(1)}M ${side} sweep detected ${strike ? `at ${strike}` : ''} ${exp ? `exp ${exp}` : ''}`.trim(),
          premium,
          value: premium,
        });
        break; // One sweep per ticker max
      }
    }
  } catch {
    // Silent — flow data may not always be available
  }
  return events;
}

// Phase 4-2: Dark Pool Spike Detection
// Triggers when SPY or QQQ dark pool ratio exceeds 50%
async function detectDarkPoolSpike(): Promise<EventData | null> {
  const DP_THRESHOLD = 50; // 50%+ triggers alert
  try {
    const { fetchTradeData } = await import('@/services/realtimeMetricsService');

    for (const ticker of ['SPY', 'QQQ']) {
      const tradeData = await fetchTradeData(ticker);
      if (!tradeData || tradeData.darkPoolPercent < DP_THRESHOLD) continue;

      // Check if already alerted today
      const dpKey = `marketing:event:dp_spike:${ticker}`;
      const prev = await safeGet(dpKey);
      if (prev) continue;

      // Mark as seen
      await setInCache(dpKey, String(tradeData.darkPoolPercent), 86400);

      const direction = tradeData.buyPct > tradeData.sellPct ? 'buy-side dominant' : 'sell-side dominant';

      return {
        ticker,
        type: 'unusual_volume',
        details: `Dark pool activity hit ${tradeData.darkPoolPercent.toFixed(1)}% of total volume (${direction}). Institutional positioning shift detected.`,
        value: tradeData.darkPoolPercent,
      };
    }
  } catch {
    // fetchTradeData may timeout
  }
  return null;
}

// Phase 6: Insider Trading Detection (SEC Form 4)
// Detects significant C-Suite trades ($1M+) or cluster buying (3+ insiders)
async function detectInsiderTrade(): Promise<EventData[]> {
  const events: EventData[] = [];
  const INSIDER_THRESHOLD = 1_000_000; // $1M+ single trade
  const CLUSTER_MIN = 3;               // 3+ insiders buying = cluster

  // Only check top 15 tickers per cycle to avoid timeout (rotate daily)
  const dayOfWeek = new Date().getDay(); // 0-6
  const tickersPerCycle = 15;
  const startIdx = (dayOfWeek * tickersPerCycle) % TRACKED_TICKERS.length;
  const tickersToCheck = [
    ...TRACKED_TICKERS.slice(startIdx, startIdx + tickersPerCycle),
    ...TRACKED_TICKERS.slice(0, Math.max(0, startIdx + tickersPerCycle - TRACKED_TICKERS.length)),
  ].slice(0, tickersPerCycle);

  for (const ticker of tickersToCheck) {
    try {
      // Check dedup first (avoid redundant API calls)
      const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const dedupKey = `marketing:event:sent:insider_trade:${ticker}:${dateKey}`;
      const alreadySent = await safeGet(dedupKey);
      if (alreadySent) continue;

      const transactions = await fetchForm4(ticker, 10);
      if (transactions.length === 0) continue;

      const summary = buildInsiderSummary(transactions);
      if (!summary.latest) continue;

      // Check filing freshness: only within last 24 hours
      const filingDate = new Date(summary.latest.date);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (filingDate < oneDayAgo) continue;

      const latest = summary.latest;
      const isCsuite = /CEO|CFO|COO|CTO|President/i.test(latest.title);
      const isLargeTrade = latest.value >= INSIDER_THRESHOLD;
      const isClusterBuy = summary.buyCount >= CLUSTER_MIN;

      // Trigger conditions:
      // 1. C-Suite + $1M+ trade (buy or sell)
      // 2. Cluster buying (3+ insiders buying, any amount)
      // 3. Any insider $5M+ trade
      if ((isCsuite && isLargeTrade) || isClusterBuy || latest.value >= 5_000_000) {
        const action = latest.code === 'P' ? 'purchase' : 'disposition';
        const valueStr = latest.value >= 1e9
          ? `$${(latest.value / 1e9).toFixed(1)}B`
          : `$${(latest.value / 1e6).toFixed(1)}M`;
        const is10b5 = latest.is10b5 ? ' (10b5-1 pre-planned)' : '';

        let detail: string;
        if (isClusterBuy && !isCsuite) {
          detail = `SEC Form 4: ${summary.buyCount} insiders reported purchases within 30 days. Net insider buying: ${valueStr}. Cluster activity observed.`;
        } else {
          detail = `SEC Form 4: ${latest.title} ${latest.name} reported ${valueStr} share ${action}${is10b5}. Filed ${latest.date}.`;
        }

        events.push({
          ticker,
          type: 'insider_trade',
          details: detail,
          value: latest.value,
        });
      }
    } catch {
      // Silent — Polygon API may rate-limit
    }
  }
  return events;
}

// Phase 7: Fear Resolution Phase Detection (V6.0 — N-Dimensional Deep Analysis)
// QQQ↓ + VIXY↓ = "시장은 빠졌지만 공포는 줄었다" = 기관 바닥 확인 후 매수 국면
// 1,095개 조합 × 5개 시간축 × 27,864쌍 분석: T+3 적중률 89.7%, T+10: 94.9% (avg +11.26%)
async function detectFearResolution(marketData: Partial<MarketData>): Promise<EventData | null> {
  try {
    // QQQ change
    const qqqChg = marketData.qqq ?? 0;
    if (qqqChg >= -0.5) return null; // QQQ must be down 0.5%+

    // VIXY / VIX change
    const vixyRaw = await safeGet('yahoo:vix'); // VIXY not tracked, use VIX
    const vixRaw = await safeGet('yahoo:vix');
    let vixChgPct: number | null = null;

    if (vixyRaw) {
      const vixyData = typeof vixyRaw === 'string' ? JSON.parse(vixyRaw) : vixyRaw;
      vixChgPct = vixyData?.changePercent ?? vixyData?.changePct ?? null;
    }
    if (vixChgPct === null && vixRaw) {
      const vixData = typeof vixRaw === 'string' ? JSON.parse(vixRaw) : vixRaw;
      vixChgPct = vixData?.changePercent ?? vixData?.changePct ?? null;
    }

    if (vixChgPct === null || vixChgPct >= -2) return null; // VIX/VIXY must be down 2%+

    // Both conditions met = Fear Resolution Phase
    return {
      ticker: 'MARKET',
      type: 'unusual_volume',
      details: `⚡ Fear Resolution Phase 감지 — QQQ ${qqqChg.toFixed(1)}% 하락 중 VIX ${vixChgPct.toFixed(1)}% 하락. 2년 실증: T+3 적중률 89.7% (n=39). 기관 바닥 확인 후 매수 국면 진입 가능성.`,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchMarketContext(): Promise<Partial<MarketData>> {
  try {
    const [spyRaw, qqqRaw, vixRaw, gexRaw] = await Promise.all([
      safeGet('yahoo:idx:spx'),
      safeGet('yahoo:idx:nasdaq'),
      safeGet('yahoo:vix'),
      safeGet('analysis:gex:regime'),
    ]);

    // Dark Pool — live fetch for OG image dp param
    let darkPool: number | undefined;
    try {
      const { fetchTradeData } = await import('@/services/realtimeMetricsService');
      const tradeData = await fetchTradeData('SPY');
      if (tradeData && tradeData.darkPoolPercent > 0) {
        darkPool = tradeData.darkPoolPercent;
        // Always cache latest DP for off-hours dispatch usage
        await setInCache('marketing:dp:latest:SPY', String(darkPool), 86400);
      }
    } catch { /* optional */ }

    return {
      spy: extractNum(spyRaw, 'changePercent') || 0,
      qqq: extractNum(qqqRaw, 'changePercent') || 0,
      vix: extractNum(vixRaw, 'price') || 18,
      gexRegime: parseGexRegime(gexRaw) || 'neutral',
      darkPool,
    };
  } catch {
    return { spy: 0, qqq: 0, vix: 18, gexRegime: 'neutral' };
  }
}

function parseGexRegime(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return parsed?.regime ?? parsed?.gexRegime ?? data;
    } catch {
      return data;
    }
  }
  return data?.regime ?? data?.gexRegime ?? null;
}

async function safeGet(key: string): Promise<any> {
  try { return await getFromCache(key); }
  catch { return null; }
}

function extractNum(data: any, field: string): number | null {
  if (!data) return null;
  const p = typeof data === 'string' ? JSON.parse(data) : data;
  return p?.[field] ?? null;
}
