// ============================================================================
// /api/admin/marketing-status — 마케팅 파이프라인 전체 상태 API
// Redis에서 콘텐츠/발송/이벤트/영상 관련 모든 키를 조회하여 실시간 상태 반환
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

async function safeGet(key: string): Promise<any> {
  try { return await getFromCache(key); }
  catch { return null; }
}

function parseRedis(raw: any): any {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

// ── Full Cron Schedule — MUST match vercel.json exactly ──
// vercel.json → cron schedule 1:1 매핑. 여기에 없으면 vercel에도 없음.
// region: ALL = EN+KO+JA, EN = 영어만, ASIA = KO+JA
const CRON_SCHEDULE = [
  // ═══ Content Generation (4개) ═══
  { utc: '15:30', et: '11:30', kst: '00:30+1', action: 'daily-content-pulse-intraday', label: 'Pulse 콘텐츠 생성 (장중 Midday용)', type: 'content', region: 'ALL', days: 'Mon-Fri' },
  { utc: '20:25', et: '16:25', kst: '05:25+1', action: 'daily-content-pulse', label: 'Pulse 콘텐츠 생성 (장마감 확정)', type: 'content', region: 'ALL', days: 'Mon-Fri' },
  { utc: '20:40', et: '16:40', kst: '05:40+1', action: 'daily-content-morning', label: 'Morning 콘텐츠 생성 (장마감후)', type: 'content', region: 'ALL', days: 'Mon-Fri' },
  { utc: '23:30', et: '19:30', kst: '08:30+1', action: 'daily-content-edu', label: 'Education 콘텐츠 생성', type: 'content', region: 'ALL', days: 'Mon-Sun' },
  // ═══ DISPATCH — 20개 (vercel.json 1:1 매칭, PLATFORM_ALLOW 반영) ═══
  // --- Asia Session (KST 07:30~14:30) ---
  { utc: '22:30', et: '18:30', kst: '07:30+1', action: 'midday', label: 'Midday → IG Story+Pinterest+Telegram', type: 'dispatch', region: 'ASIA', days: 'Mon-Fri' },
  { utc: '23:00', et: '19:00', kst: '08:00+1', action: 'briefing_thread', label: 'Briefing Thread → X Thread', type: 'dispatch', region: 'ASIA', days: 'Mon-Fri' },
  { utc: '23:30', et: '19:30', kst: '08:30+1', action: 'pulse', label: 'Pulse → X+IG Story+Pinterest+Telegram', type: 'dispatch', region: 'ASIA', days: 'Mon-Fri' },
  { utc: '00:00', et: '20:00', kst: '09:00', action: 'education', label: '📚 Education → X Thread+Threads+Pinterest+Telegram', type: 'dispatch', region: 'ALL', days: 'Mon-Sun' },
  { utc: '01:00', et: '21:00', kst: '10:00', action: 'spotlight', label: 'Spotlight → X+Bluesky+Pinterest+Telegram', type: 'dispatch', region: 'ASIA', days: 'Mon-Fri' },
  { utc: '02:00', et: '22:00', kst: '11:00', action: 'edu_bsky', label: '📚 Education → Bluesky+Pinterest', type: 'dispatch', region: 'EN', days: 'Mon-Sun' },
  { utc: '02:30', et: '22:30', kst: '11:30', action: 'asia_recap', label: 'US Session Recap → Threads(KO/JA)', type: 'dispatch', region: 'ASIA', days: 'Tue-Sat' },
  { utc: '04:00', et: '00:00', kst: '13:00', action: 'asia_insight', label: 'Asia Insight → Threads(KO/JA)', type: 'dispatch', region: 'ASIA', days: 'Mon-Fri' },
  { utc: '05:30', et: '01:30', kst: '14:30', action: 'spacex_spotlight', label: '🚀 SpaceX × $TSLA → X+Threads+Bsky+Pinterest+Telegram', type: 'dispatch', region: 'ASIA', days: 'Mon-Sun' },
  // --- US Pre-Market → Close (KST 19:30~05:35) ---
  { utc: '10:30', et: '06:30', kst: '19:30', action: 'morning', label: 'Morning Brief → IG Story+Pinterest+Telegram', type: 'dispatch', region: 'ALL', days: 'Mon-Fri' },
  { utc: '10:35', et: '06:35', kst: '19:35', action: 'morning_ig', label: 'Morning → IG Carousel', type: 'dispatch', region: 'EN', days: 'Mon-Fri' },
  { utc: '10:38', et: '06:38', kst: '19:38', action: 'morning_ig', label: 'Morning → IG Carousel(KO/JA)', type: 'dispatch', region: 'ASIA', days: 'Mon-Fri' },
  { utc: '11:00', et: '07:00', kst: '20:00', action: 'briefing_thread', label: 'Briefing Thread → X Thread(EN)', type: 'dispatch', region: 'EN', days: 'Mon-Fri' },
  { utc: '12:35', et: '08:35', kst: '21:35', action: 'premarket_threads', label: 'Pre-Market → Threads+Pinterest+Telegram', type: 'dispatch', region: 'ALL', days: 'Mon-Fri' },
  { utc: '14:00', et: '10:00', kst: '23:00', action: 'spotlight', label: 'Spotlight → X+Bluesky+Pinterest+Telegram', type: 'dispatch', region: 'EN', days: 'Mon-Fri' },
  { utc: '15:00', et: '11:00', kst: '00:00+1', action: 'trending_spotlight', label: '🚫 Trending Spotlight (DISABLED)', type: 'dispatch', region: 'ALL', days: 'Mon-Fri' },
  { utc: '16:00', et: '12:00', kst: '01:00+1', action: 'midday', label: 'Midday → IG Story+Pinterest+Telegram', type: 'dispatch', region: 'EN', days: 'Mon-Fri' },
  { utc: '17:00', et: '13:00', kst: '02:00+1', action: 'spacex_spotlight', label: '🚀 SpaceX × $TSLA → X+Threads+Bsky+Pinterest+Telegram', type: 'dispatch', region: 'EN', days: 'Mon-Sun' },
  { utc: '20:35', et: '16:35', kst: '05:35+1', action: 'pulse', label: 'Pulse → X+IG Story+Pinterest+Telegram', type: 'dispatch', region: 'EN', days: 'Mon-Fri' },
  // --- Weekend ---
  { utc: '14:00', et: '10:00', kst: '23:00', action: 'weekly_recap', label: '📊 주간 요약 Thread → X+Threads', type: 'dispatch', region: 'ALL', days: 'Sat' },
  // ═══ Event Detection & Video ═══
  { utc: '*/5 13-21', et: '09:00~17:00 5분', kst: '22:00~06:00 5분', action: 'event-detect', label: '이벤트 감지 (GEX/VIX/8-K/Sweep/DP/Insider/Fear)', type: 'event', region: 'ALL', days: 'Mon-Fri' },
  { utc: '21:00', et: '17:00', kst: '06:00+1', action: 'render-video', label: 'Remotion 영상 렌더링 (dry_run)', type: 'video', region: 'ALL', days: 'Mon-Fri' },
];


export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email') || '';
  if (!ADMIN_EMAILS.includes(email.toLowerCase())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const now = new Date();
  const dateKey = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  // Yesterday's date key (ET timezone)
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayKey = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  try {
    // ══════════════════════════════════════════
    // 1. CONTENT STATUS — 오늘 콘텐츠 존재 여부
    // ══════════════════════════════════════════
    const [pulseRaw, morningRaw, educationRaw, pulseImgRaw] = await Promise.all([
      safeGet(`marketing:pulse:${dateKey}`),
      safeGet(`marketing:morning:${dateKey}`),
      safeGet(`marketing:education:${dateKey}`),
      safeGet(`marketing:pulse:images:${dateKey}`),
    ]);

    const pulse = parseRedis(pulseRaw);
    const morning = parseRedis(morningRaw);
    const education = parseRedis(educationRaw);
    const pulseImages = parseRedis(pulseImgRaw);

    const content = {
      pulse: {
        exists: !!pulse,
        engine: pulse?._engine || (pulse?.en?.text ? 'ai' : null),
        preview: pulse?.en?.text?.substring(0, 150) || null,
        previewKo: pulse?.ko?.text?.substring(0, 150) || null,
        imageUrl: pulse?.en?.imageUrl || null,
        capturedImages: pulseImages ? Object.keys(pulseImages).filter(k => pulseImages[k]).length : 0,
      },
      morning: {
        exists: !!morning,
        engine: morning?._engine || (morning?.en?.text ? 'ai' : null),
        preview: morning?.en?.text?.substring(0, 150) || null,
        previewKo: morning?.ko?.text?.substring(0, 150) || null,
      },
      education: {
        exists: !!education,
        engine: education?._engine || (education?.en?.text ? 'template' : null),
        preview: education?.en?.text?.substring(0, 150) || null,
        previewKo: education?.ko?.text?.substring(0, 150) || null,
      },
    };

    // ══════════════════════════════════════════
    // 2. DISPATCH LOG — 최근 발송 기록
    // ══════════════════════════════════════════
    const ACTIONS = [
      'morning', 'morning_ig', 'midday', 'education', 'edu_bsky', 'pulse', 'pulse_ig', 'event',
      'spotlight', 'briefing_thread', 'premarket_threads', 'asia_recap',
      'asia_insight', 'trending_spotlight', 'spacex_spotlight', 'weekly_recap',
    ];
    const dispatchResults: any[] = [];

    // Check today and yesterday
    for (const day of [dateKey, yesterdayKey]) {
      for (const action of ACTIONS) {
        const logRaw = await safeGet(`marketing:dispatch:v2:${day}:${action}`);
        const log = parseRedis(logRaw);
        if (log) {
          dispatchResults.push({
            date: day,
            action,
            timestamp: log.timestamp,
            dryRun: log.dryRun,
            draft: log.draft,
            totalChannels: log.totalChannels,
            successful: log.successful,
            failed: log.failed,
            results: log.results?.map((r: any) => ({
              platform: r.platform || r.service,
              lang: r.lang,
              success: r.success,
              error: r.error,
            })),
          });
        }
      }
    }

    // Also check legacy dispatch format
    for (const day of [dateKey, yesterdayKey]) {
      for (const ct of ['pulse', 'morning', 'education', 'event']) {
        const legRaw = await safeGet(`marketing:dispatch:${day}:${ct}`);
        const leg = parseRedis(legRaw);
        if (leg && !dispatchResults.find(d => d.date === day && d.action === ct)) {
          dispatchResults.push({
            date: day,
            action: ct,
            timestamp: leg.timestamp,
            dryRun: leg.dryRun,
            totalChannels: leg.totalChannels,
            successful: leg.successful,
            failed: leg.failed,
            _source: 'legacy',
          });
        }
      }
    }

    // Sort by timestamp desc
    dispatchResults.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    // ══════════════════════════════════════════
    // 3. EVENT DETECTION STATUS
    // ══════════════════════════════════════════
    const [eventCountRaw, eventLastTimeRaw, eventContentRaw, eventImagesRaw] = await Promise.all([
      safeGet(`marketing:event:count:${dateKey}`),
      safeGet('marketing:event:last_time'),
      safeGet(`marketing:event:${dateKey}`),
      safeGet(`marketing:event:images:${dateKey}`),
    ]);

    const dailyEventCount = eventCountRaw ? parseInt(String(eventCountRaw)) : 0;
    const lastEventTime = eventLastTimeRaw ? parseInt(String(eventLastTimeRaw)) : 0;
    const cooldownMs = 30 * 60 * 1000;
    const cooldownRemaining = lastEventTime > 0 ? Math.max(0, cooldownMs - (Date.now() - lastEventTime)) : 0;
    const eventContent = parseRedis(eventContentRaw);
    const eventImages = parseRedis(eventImagesRaw);

    // Check dedup keys for today's events
    const TRACKED_TYPES = ['gex_shift', 'unusual_volume', 'whale', 'sec_8k', 'insider_trade'];
    const SAMPLE_TICKERS = ['AAPL', 'NVDA', 'TSLA', 'SPY', 'GOOGL'];
    const sentEvents: string[] = [];
    for (const type of TRACKED_TYPES) {
      for (const ticker of SAMPLE_TICKERS) {
        const sent = await safeGet(`marketing:event:sent:${type}:${ticker}:${dateKey}`);
        if (sent) sentEvents.push(`${type}:${ticker}`);
      }
    }

    const events = {
      dailyCount: dailyEventCount,
      maxDaily: 3,
      cooldownRemainingMin: Math.ceil(cooldownRemaining / 60000),
      cooldownActive: cooldownRemaining > 0,
      lastEventTime: lastEventTime > 0 ? new Date(lastEventTime).toISOString() : null,
      todayContent: eventContent ? {
        exists: true,
        preview: eventContent.en?.text?.substring(0, 120) || null,
      } : { exists: false },
      capturedImages: eventImages ? {
        tweet: !!eventImages.tweet,
        story: !!eventImages.story,
      } : null,
      sentToday: sentEvents,
    };

    // ══════════════════════════════════════════
    // 4. VIDEO RENDERING STATUS
    // ══════════════════════════════════════════
    const videoRaw = await safeGet(`marketing:video:${dateKey}`);
    const videoYesterdayRaw = await safeGet(`marketing:video:${yesterdayKey}`);
    const videoData = parseRedis(videoRaw) || parseRedis(videoYesterdayRaw);

    const video = videoData ? {
      exists: true,
      date: videoRaw ? dateKey : yesterdayKey,
      timestamp: videoData.timestamp,
      dryRun: videoData.dryRun,
      types: videoData.types,
      langs: videoData.langs,
      results: Object.entries(videoData.results || {}).map(([key, val]: [string, any]) => ({
        key,
        status: val.status,
        compositionId: val.compositionId,
        narrationPreview: val.narrationPreview,
        bgm: val.bgm,
        outputUrl: val.outputUrl || null,
      })),
    } : { exists: false };

    // ══════════════════════════════════════════
    // 5. SPOTLIGHT STATUS
    // ══════════════════════════════════════════
    const spotlightKeys: any[] = [];
    for (const ticker of ['AAPL', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META', 'MSFT']) {
      const raw = await safeGet(`marketing:spotlight:${dateKey}:${ticker}`);
      if (raw) {
        const parsed = parseRedis(raw);
        spotlightKeys.push({
          ticker,
          exists: true,
          preview: parsed?.en?.text?.substring(0, 100) || null,
        });
      }
    }

    // ══════════════════════════════════════════
    // 6. SCHEDULE TIMELINE — 현재 시간 기준 상태
    // ══════════════════════════════════════════
    const utcHour = now.getUTCHours();
    const utcMin = now.getUTCMinutes();
    const utcTotal = utcHour * 60 + utcMin;
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
    const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    function isDayApplicable(days: string): boolean {
      // Handle ranges: "Mon-Fri", "Tue-Sun", "Tue-Sat"
      if (days.includes('-') && !days.includes(',')) {
        const [startStr, endStr] = days.split('-');
        const start = DAY_MAP[startStr] ?? 1;
        const end = DAY_MAP[endStr] ?? 5;
        if (start <= end) return dayOfWeek >= start && dayOfWeek <= end;
        // Wrap-around: Tue-Sun = 2,3,4,5,6,0
        return dayOfWeek >= start || dayOfWeek <= end;
      }
      // Handle lists: "Mon,Wed,Fri"
      if (days.includes(',')) {
        return days.split(',').some(d => DAY_MAP[d.trim()] === dayOfWeek);
      }
      // Single day: "Sat"
      return DAY_MAP[days] === dayOfWeek;
    }
    const schedule = CRON_SCHEDULE.map(s => {
      // Parse UTC time
      let schedMin = -1;
      if (s.utc.includes('*/')) {
        schedMin = -1; // recurring
      } else {
        const parts = s.utc.split(':');
        schedMin = parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
      }

      // Check if applicable today
      const applicableToday = isDayApplicable(s.days);

      // Status determination
      let status: 'DONE' | 'NEXT' | 'PENDING' | 'SKIPPED' | 'RECURRING';
      if (!applicableToday) {
        status = 'SKIPPED';
      } else if (schedMin === -1) {
        status = 'RECURRING';
      } else if (utcTotal > schedMin + 5) {
        status = 'DONE';
      } else if (utcTotal >= schedMin - 5 && utcTotal <= schedMin + 5) {
        status = 'NEXT';
      } else {
        status = 'PENDING';
      }

      // Check if dispatch log exists for this action today
      const hasLog = dispatchResults.some(d => d.date === dateKey && d.action === s.action);

      return {
        ...s,
        status,
        hasLog,
        dryRun: s.action === 'render-video', // Only render-video stays dry_run
      };
    });

    // ══════════════════════════════════════════
    // 7. OVERALL HEALTH
    // ══════════════════════════════════════════
    const contentReady = content.pulse.exists || content.morning.exists;
    const dispatchActive = dispatchResults.length > 0;
    const allDryRun = dispatchResults.every(d => d.dryRun !== false);

    const overall = {
      status: contentReady ? 'OK' : 'DEGRADED',
      contentGeneration: contentReady ? 'OK' : 'EMPTY',
      dispatching: dispatchActive ? (allDryRun ? 'DRY_RUN' : 'LIVE') : 'NO_DATA',
      eventDetection: events.dailyCount > 0 ? 'ACTIVE' : 'IDLE',
      videoRendering: video.exists ? 'OK' : 'IDLE',
      dryRunMode: allDryRun,
    };

    return NextResponse.json({
      overall,
      content,
      schedule,
      dispatches: dispatchResults,
      events,
      video,
      spotlights: spotlightKeys,
      timestamp: now.toISOString(),
      elapsed: `${Date.now() - start}ms`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
