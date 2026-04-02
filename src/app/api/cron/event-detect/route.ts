// ============================================================================
// /api/cron/event-detect — 이벤트 자동 감지 + Buffer 발송
// 5분마다 실행: GEX 플립, VIX 급등, 8-K 속보 감지
// 감지 시 → contentEngines.generateEventSpike() → Redis → buffer-dispatch 호출
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { generateEventSpike } from '@/lib/marketing/contentEngines';
import { generateAIEventSpike } from '@/lib/marketing/aiContentEngine';
import type { EventData, MarketData } from '@/lib/marketing/contentEngines';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const COOLDOWN_MS = 30 * 60 * 1000; // 30분 쿨다운
const MAX_DAILY_EVENTS = 3;          // 하루 최대 이벤트 알림 수
const DEDUP_TTL = 86400;             // 24시간 중복 방지
const VIX_THRESHOLD = 15;            // VIX 변동률 %

// M7 + 고관심 종목
const TRACKED_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'];

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
  const dateKey = new Date().toISOString().split('T')[0];

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
        checked: { gex: !!gexEvent, vix: !!vixEvent, sec: secEvents.length },
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
    const vixRaw = await safeGet('market:realtime:VIX');
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchMarketContext(): Promise<Partial<MarketData>> {
  try {
    const [spyRaw, qqqRaw, vixRaw, gexRaw] = await Promise.all([
      safeGet('market:realtime:SPY'),
      safeGet('market:realtime:QQQ'),
      safeGet('market:realtime:VIX'),
      safeGet('analysis:gex:regime'),
    ]);

    return {
      spy: extractNum(spyRaw, 'changePercent') || 0,
      qqq: extractNum(qqqRaw, 'changePercent') || 0,
      vix: extractNum(vixRaw, 'price') || 18,
      gexRegime: parseGexRegime(gexRaw) || 'neutral',
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
