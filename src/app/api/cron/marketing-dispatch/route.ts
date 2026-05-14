// ============================================================================
// /api/cron/marketing-dispatch ???�합 마�????�동???�론
// 모든 ?�랫??× 모든 ?�맷???�나???�드?�인?�로 관�?
// 
// ?��?줄별 ?�출:
//   ?action=morning    ??06:30 KST: X tweet + Bluesky + IG Story
//   ?action=morning_ig ??08:00 KST: IG Carousel
//   ?action=midday     ??11:00 KST: X tweet + Bluesky + IG Story + Pinterest
//   ?action=education  ??14:00 KST: X Thread + Pinterest
//   ?action=edu_bsky   ??17:00 KST: Bluesky education + Pinterest
//   ?action=pulse      ??05:30+1 KST: X tweet + Bluesky + IG Story + Pinterest
//   ?action=pulse_ig   ??07:00+1 KST: IG Carousel
//   ?action=event      ???�시�? ?�벤??즉시 멀?�플?�폼 발송
//
// DRY_RUN 기본: true
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // IG 캐러?� 6??캡처??충분???�간

import {
  dispatchTweet,
  dispatchThread,
  dispatchCarousel,
  dispatchStory,
  dispatchPin,
  dispatchPost,
  generateCarouselAltTexts,
  type DispatchResult,
  type ThreadSlide,
} from '@/lib/marketing/bufferMultiClient';
import { getChannels, truncateForPlatform, buildUtm } from '@/lib/marketing/bufferClient';
import { getHashtags, buildInstagramFooter, getPinterestSEO, type ContentType, type Lang } from '@/lib/marketing/hashtagEngine';
import { captureTemplate, captureStoryImage, type FormatType, type TemplateType } from '@/lib/marketing/screenshotService';
import type { ContentOutput } from '@/lib/marketing/contentEngines';
import { buildRealtimeText, captureRealtimeOG, captureMarketCloseOG, captureMarketCloseIG, fetchLiveMarketData } from '@/lib/marketing/realtimeContent';
import { dispatchTelegram, formatForTelegram } from '@/lib/marketing/telegramClient';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
type Action = 'morning' | 'morning_ig' | 'midday' | 'education' | 'education_ig' | 'edu_bsky' | 'pulse' | 'pulse_ig' | 'event' | 'spotlight' | 'briefing_thread' | 'premarket_bsky' | 'premarket_threads' | 'intraday_bsky' | 'close_bsky' | 'close_threads' | 'structure_bsky' | 'insight_threads' | 'afterhours_bsky' | 'afterhours_threads' | 'asia_recap' | 'asia_insight' | 'market_open' | 'weekly_recap' | 'trending_spotlight' | 'spacex_spotlight' | 'market_close_asia';
type Region = 'en' | 'asia' | 'all'; // en=EN only, asia=KO+JP, all=both

function getLangsForRegion(region: Region): Lang[] {
  switch (region) {
    case 'en':   return ['en'];
    case 'asia': return ['ko', 'ja'];
    case 'all':  return ['en', 'ko', 'ja'];
  }
}

// M7 ticker → company name for OG templates
const COMPANY_MAP: Record<string, string> = {
  NVDA: 'NVIDIA Corp', TSLA: 'Tesla Inc', AAPL: 'Apple Inc',
  MSFT: 'Microsoft Corp', GOOGL: 'Alphabet Inc', META: 'Meta Platforms',
  AMZN: 'Amazon.com Inc', SPY: 'SPDR S&P 500 ETF', QQQ: 'Invesco QQQ Trust',
};

// ---------------------------------------------------------------------------
// GET Handler
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
  const draft = searchParams.get('draft') === 'true'; // Posts go to Buffer Drafts tab
  const action = (searchParams.get('action') || 'pulse') as Action;
  const region = (searchParams.get('region') || 'all') as Region;
  // [FIX] Use ET date to match daily-content's dateKey (generated at 20:30 UTC = same ET market date)
  // Without this, morning dispatch at 10:30 UTC next day would use a different dateKey
  const etDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
  const dateKey = searchParams.get('date') || etDateStr;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const langs = getLangsForRegion(region);

  try {
    const results: DispatchResult[] = [];

    // ═══════════════════════════════════════════════════════════════
    // PLATFORM OPTIMIZATION MATRIX — 2026-05-13
    // Each action ONLY posts to platforms with highest ROI.
    // Prevents algorithmic penalties from over-posting.
    // ═══════════════════════════════════════════════════════════════
    // Target per channel/day: X 5/acct, Bsky 4, Threads 3/acct, Pin 7, IG unlimited(story)
    const PLATFORM_ALLOW: Record<string, Set<string>> = {
      morning:            new Set(['instagram', 'pinterest', 'telegram']),         // + Telegram
      morning_ig:         new Set(['instagram']),                                  // Threads removed (IG carousel is the star here)
      midday:             new Set(['instagram', 'pinterest', 'telegram']),         // + Telegram
      education:          new Set(['twitter', 'threads', 'pinterest', 'telegram']),// + Telegram
      education_ig:       new Set(['instagram']),                                  // IG Carousel only (5 slides × 3 langs)
      edu_bsky:           new Set(['bluesky', 'pinterest', 'telegram']),           // + Telegram
      pulse:              new Set(['twitter', 'instagram', 'pinterest', 'telegram']), // + Telegram
      spotlight:          new Set(['twitter', 'bluesky', 'pinterest', 'telegram']),// + Telegram
      briefing_thread:    new Set(['twitter', 'telegram']),                        // + Telegram
      premarket_threads:  new Set(['threads', 'pinterest', 'telegram']),           // + Telegram
      asia_recap:         new Set(['threads']),                                    // KO/JA only → Telegram 제외
      asia_insight:       new Set(['threads']),                                    // KO/JA only → Telegram 제외
      spacex_spotlight:   new Set(['twitter', 'threads', 'bluesky', 'pinterest', 'telegram']), // + Telegram
      trending_spotlight: new Set([]),                                              // DISABLED
      weekly_recap:       new Set(['twitter', 'threads', 'telegram']),             // + Telegram
      market_close_asia:  new Set(['twitter', 'threads', 'bluesky', 'pinterest', 'telegram']), // All platforms
    };

    /** Platform-filtered channel lookup — returns [] if action should NOT post to that service */
    const getFilteredChannels = (opts?: Parameters<typeof getChannels>[0]) => {
      const svc = opts?.service;
      const allowed = PLATFORM_ALLOW[action];
      if (svc && allowed && !allowed.has(svc)) return [] as ReturnType<typeof getChannels>;
      return getChannels(opts);
    };

    switch (action) {
      // ========================================
      // MORNING BRIEF — 06:30 ET (KST 19:30)
      // LIVE pre-market data + Guardian AI verdict
      // Guardian-grade: RLSI + Regime + Sector + AI Insight
      // ========================================
      case 'morning': {
        // Fetch LIVE market data + Guardian AI verdicts (same source as website)
        const mkt = await fetchLiveMarketData();
        const sd = mkt.spyChg >= 0 ? '+' : '';
        const vd = mkt.vixChg >= 0 ? '+' : '';
        const dp = mkt.dp > 0 ? `${mkt.dp.toFixed(1)}%` : 'N/A';
        const G = mkt.gex.toUpperCase();

        // Fetch RLSI + Guardian AI context for depth
        let rlsiScore = 50;
        let rlsiLevel = 'NORMAL';
        let regime = 'NEUTRAL';
        let rotationDir = '';
        try {
          const rlsiRaw = await getFromCache('rlsi:current').catch(() => null);
          if (rlsiRaw) rlsiScore = typeof rlsiRaw === 'number' ? rlsiRaw : parseInt(String(rlsiRaw), 10) || 50;
          const snapshotRaw = await getFromCache('guardian:snapshot:en').catch(() => null);
          if (snapshotRaw) {
            const snap = typeof snapshotRaw === 'string' ? JSON.parse(snapshotRaw) : snapshotRaw;
            rlsiLevel = snap?.rlsi?.level || (rlsiScore >= 65 ? 'OPTIMAL' : rlsiScore >= 40 ? 'NORMAL' : 'DANGER');
            regime = snap?.tripleA?.regime || 'NEUTRAL';
            rotationDir = snap?.rotationIntensity?.direction || '';
          }
        } catch {}

        const rlsiLabel = rlsiScore >= 65 ? 'GREEN' : rlsiScore >= 40 ? 'YELLOW' : 'RED';

        // Build Guardian-grade morning briefing text per language
        for (const lang of langs) {
          const verdict = mkt.verdicts?.[lang];
          const tactical = verdict?.tactical || mkt.tacticalInsight || '';
          const reality = verdict?.reality || mkt.realityInsight || '';
          const ctaUrl = buildCtaUrl(lang, 'intel-guardian', 'morning');

          // Truncate AI insight to fit platform char limits
          const aiBlock = tactical
            ? (tactical.length > 250 ? tactical.slice(0, 247) + '...' : tactical)
            : '';

          // === Language-specific Guardian-grade morning briefing ===
          let morningText = '';
          if (lang === 'ko') {
            const gexKo = mkt.gex === 'positive' ? '딜러 변동성 억제 구간 → 가격 안정화 압력'
              : mkt.gex === 'negative' ? '딜러 변동성 증폭 구간 → 급변동 리스크 상승'
              : '중립 전환 구간 → 방향성 관망';
            const regimeKo = regime === 'BULL' ? '강세 환경 (Alpha Seek)'
              : regime === 'BEAR' ? '약세 환경 (Defense Mode)' : '방향성 부재 (Monitor)';
            morningText = [
              `📊 SIGNUM 모닝 브리핑`,
              `${mkt.date} Pre-Market Structure Check`,
              '',
              `━━━ 시장 구조 ━━━`,
              `▸ S&P 500: ${sd}${mkt.spyChg.toFixed(2)}% ($${mkt.spy.toFixed(2)})`,
              `▸ VIX: ${mkt.vix.toFixed(1)} (${vd}${mkt.vixChg.toFixed(1)}%) — ${mkt.vixChg > 0 ? '변동성 확대 중' : '변동성 축소 중'}`,
              `▸ GEX: ${G} — ${gexKo}`,
              `▸ 다크풀 활동: ${dp}`,
              '',
              `━━━ RLSI 시장 건강도 ━━━`,
              `▸ RLSI: ${rlsiScore}/100 [${rlsiLabel}]`,
              `▸ 시장 레짐: ${regimeKo}`,
              rotationDir ? `▸ 자금 흐름: ${rotationDir === 'RISK_ON' ? '성장주 유입 (Risk-On)' : rotationDir === 'RISK_OFF' ? '방어주 유입 (Risk-Off)' : '순환매 진행 중'}` : '',
              '',
              aiBlock ? `━━━ AI 구조 분석 ━━━` : '',
              aiBlock || '',
              '',
              `📊 전체 분석 보기 → ${ctaUrl}`,
              '',
              '*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.',
            ].filter(Boolean).join('\n');
          } else if (lang === 'ja') {
            const gexJa = mkt.gex === 'positive' ? 'ディーラーのボラ抑制ゾーン → 価格安定化圧力'
              : mkt.gex === 'negative' ? 'ディーラーのボラ増幅ゾーン → 急変動リスク上昇'
              : '中立遷移ゾーン → 方向性待ち';
            const regimeJa = regime === 'BULL' ? '強気環境 (Alpha Seek)'
              : regime === 'BEAR' ? '弱気環境 (Defense Mode)' : '方向性不在 (Monitor)';
            morningText = [
              `📊 SIGNUM モーニングブリーフィング`,
              `${mkt.date} Pre-Market Structure Check`,
              '',
              `━━━ 市場構造 ━━━`,
              `▸ S&P 500: ${sd}${mkt.spyChg.toFixed(2)}% ($${mkt.spy.toFixed(2)})`,
              `▸ VIX: ${mkt.vix.toFixed(1)} (${vd}${mkt.vixChg.toFixed(1)}%) — ${mkt.vixChg > 0 ? 'ボラティリティ拡大中' : 'ボラティリティ縮小中'}`,
              `▸ GEX: ${G} — ${gexJa}`,
              `▸ ダークプール: ${dp}`,
              '',
              `━━━ RLSI 市場健全度 ━━━`,
              `▸ RLSI: ${rlsiScore}/100 [${rlsiLabel}]`,
              `▸ レジーム: ${regimeJa}`,
              rotationDir ? `▸ 資金フロー: ${rotationDir === 'RISK_ON' ? 'グロース流入 (Risk-On)' : rotationDir === 'RISK_OFF' ? 'ディフェンシブ流入 (Risk-Off)' : 'ローテーション中'}` : '',
              '',
              aiBlock ? `━━━ AI構造分析 ━━━` : '',
              aiBlock || '',
              '',
              `📊 詳細分析 → ${ctaUrl}`,
              '',
              '*投資助言ではありません。データ分析の参考資料です。',
            ].filter(Boolean).join('\n');
          } else {
            const gexEn = mkt.gex === 'positive' ? 'Dealer suppression → price stabilization pressure'
              : mkt.gex === 'negative' ? 'Dealer amplification → elevated move risk'
              : 'Neutral transition → directionless';
            const regimeEn = regime === 'BULL' ? 'Bullish (Alpha Seek)'
              : regime === 'BEAR' ? 'Bearish (Defense Mode)' : 'Neutral (Monitor)';
            morningText = [
              `📊 SIGNUM Morning Briefing`,
              `${mkt.date} Pre-Market Structure Check`,
              '',
              `━━━ Market Structure ━━━`,
              `▸ S&P 500: ${sd}${mkt.spyChg.toFixed(2)}% ($${mkt.spy.toFixed(2)})`,
              `▸ VIX: ${mkt.vix.toFixed(1)} (${vd}${mkt.vixChg.toFixed(1)}%) — ${mkt.vixChg > 0 ? 'volatility expanding' : 'volatility compressing'}`,
              `▸ GEX: ${G} — ${gexEn}`,
              `▸ Dark Pool Activity: ${dp}`,
              '',
              `━━━ RLSI Health Index ━━━`,
              `▸ RLSI: ${rlsiScore}/100 [${rlsiLabel}]`,
              `▸ Market Regime: ${regimeEn}`,
              rotationDir ? `▸ Capital Flow: ${rotationDir === 'RISK_ON' ? 'Growth inflow (Risk-On)' : rotationDir === 'RISK_OFF' ? 'Defensive rotation (Risk-Off)' : 'Sector rotation in progress'}` : '',
              '',
              aiBlock ? `━━━ AI Structure Analysis ━━━` : '',
              aiBlock || '',
              '',
              `📊 Full analysis → ${ctaUrl}`,
              '',
              '*Observation only — not financial advice.',
            ].filter(Boolean).join('\n');
          }

          // Capture realtime OG image (same data as Guardian page)
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'tweet', dryRun);

          // IG Story
          const igChMorning = getFilteredChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igChMorning) {
            const storyParams = {
              spy: String(mkt.spyChg), vix: String(mkt.vix),
              gex: mkt.gex, dp: String(mkt.dp),
              date: mkt.date,
            };
            let storyUrl: string | null = null;
            if (dryRun) {
              const previewUrl = new URL(`${baseUrl}/marketing/templates/story`);
              Object.entries(storyParams).forEach(([k, v]) => previewUrl.searchParams.set(k, v));
              storyUrl = previewUrl.toString();
            } else {
              try { storyUrl = await captureStoryImage(storyParams); } catch {}
            }
            if (storyUrl) {
              const r = await dispatchStory({ channelId: igChMorning.id, imageUrl: storyUrl, dryRun, draft });
              results.push(r);
            }
          }

          // === Platform-specific text (char limits: X=280, Bsky=300, Threads=500) ===
          // X Tweet (280 char max — tight data + hook)
          const twitterCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'morning', lang });
            const xText = lang === 'ko'
              ? `📊 모닝 브리핑\nSPY ${sd}${mkt.spyChg.toFixed(2)}% | VIX ${mkt.vix.toFixed(1)} | GEX ${G}\nRLSI ${rlsiScore}/100 [${rlsiLabel}] | DP ${dp}\n${regime === 'BULL' ? '▸ 강세 환경' : regime === 'BEAR' ? '▸ 약세 환경' : '▸ 관망 구간'}`
              : lang === 'ja'
              ? `📊 モーニングブリーフィング\nSPY ${sd}${mkt.spyChg.toFixed(2)}% | VIX ${mkt.vix.toFixed(1)} | GEX ${G}\nRLSI ${rlsiScore}/100 [${rlsiLabel}] | DP ${dp}\n${regime === 'BULL' ? '▸ 強気環境' : regime === 'BEAR' ? '▸ 弱気環境' : '▸ 様子見'}`
              : `📊 Morning Briefing\nSPY ${sd}${mkt.spyChg.toFixed(2)}% | VIX ${mkt.vix.toFixed(1)} | GEX ${G}\nRLSI ${rlsiScore}/100 [${rlsiLabel}] | DP ${dp}\n${regime === 'BULL' ? '▸ Bullish regime' : regime === 'BEAR' ? '▸ Bearish regime' : '▸ Neutral — monitoring'}`;
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateWithTags(xText, tags, 'twitter'),
              imageUrl: ogImage,
              dryRun, draft,
            });
            results.push(r);
          }

          // Bluesky (300 char max — data + one-line AI insight)
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'morning', lang });
            const bskyInsight = aiBlock.length > 80 ? aiBlock.slice(0, 77) + '...' : aiBlock;
            const bskyText = lang === 'ko'
              ? `📊 모닝 브리핑 | ${mkt.date}\nSPY ${sd}${mkt.spyChg.toFixed(2)}% | VIX ${mkt.vix.toFixed(1)} | GEX ${G}\nRLSI ${rlsiScore}/100 | DP ${dp}\n${bskyInsight || '프리마켓 구조 분석 데이터 업데이트.'}`
              : lang === 'ja'
              ? `📊 モーニング | ${mkt.date}\nSPY ${sd}${mkt.spyChg.toFixed(2)}% | VIX ${mkt.vix.toFixed(1)} | GEX ${G}\nRLSI ${rlsiScore}/100 | DP ${dp}\n${bskyInsight || '構造データ更新中。'}`
              : `📊 Morning Briefing | ${mkt.date}\nSPY ${sd}${mkt.spyChg.toFixed(2)}% | VIX ${mkt.vix.toFixed(1)} | GEX ${G}\nRLSI ${rlsiScore}/100 | DP ${dp}\n${bskyInsight || 'Pre-market structure data updated.'}`;
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(bskyText, `\n\n${tags}`, 'bluesky'),
              imageUrl: ogImage,
              dryRun, draft,
            });
            results.push(r);
          }

          // Threads (500 char — use full morningText, truncateWithTags handles limit)
          const threadsCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (threadsCh) {
            const tags = getHashtags({ platform: 'threads', contentType: 'morning', lang });
            const r = await dispatchPost({
              channelId: threadsCh.id,
              text: truncateWithTags(morningText, tags, 'threads'),
              imageUrl: ogImage,
              dryRun, draft,
            });
            results.push(r);
          }
        }

        // Pinterest (EN only, SEO)
        const pinChMorn = getFilteredChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinChMorn) {
          const seo = getPinterestSEO({ contentType: 'morning', date: dateKey });
          const pinOg = await captureRealtimeOG(baseUrl, mkt, 'pin', dryRun);
          const r = await dispatchPin({
            channelId: pinChMorn.id,
            imageUrl: pinOg,
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/intel-guardian?${buildUtm('pinterest', 'morning')}`,
            dryRun, draft,
          });
          results.push(r);
        }

        // Telegram (EN — Guardian-grade, no char limit)
        if (PLATFORM_ALLOW[action]?.has('telegram')) {
          const gexEnTg = mkt.gex === 'positive' ? 'Dealer suppression → price stabilization'
            : mkt.gex === 'negative' ? 'Dealer amplification → elevated risk'
            : 'Neutral transition → directionless';
          const regimeEnTg = regime === 'BULL' ? 'Bullish (Alpha Seek)'
            : regime === 'BEAR' ? 'Bearish (Defense Mode)' : 'Neutral (Monitor)';
          const tgTactical = mkt.verdicts?.en?.tactical || mkt.tacticalInsight || '';
          const tgReality = mkt.verdicts?.en?.reality || mkt.realityInsight || '';
          const tgMorning = [
            `📊 SIGNUM Morning Briefing`,
            `${mkt.date} | Pre-Market Structure`,
            '',
            `━━━ Market Structure ━━━`,
            `▸ S&P 500: ${sd}${mkt.spyChg.toFixed(2)}% ($${mkt.spy.toFixed(2)})`,
            `▸ VIX: ${mkt.vix.toFixed(1)} (${vd}${mkt.vixChg.toFixed(1)}%) — ${mkt.vixChg > 0 ? 'volatility expanding' : 'volatility compressing'}`,
            `▸ GEX: ${G} — ${gexEnTg}`,
            `▸ Dark Pool: ${dp}`,
            '',
            `━━━ RLSI Health ━━━`,
            `▸ Score: ${rlsiScore}/100 [${rlsiLabel}]`,
            `▸ Regime: ${regimeEnTg}`,
            rotationDir ? `▸ Flow: ${rotationDir === 'RISK_ON' ? 'Growth inflow' : rotationDir === 'RISK_OFF' ? 'Defensive rotation' : 'Sector rotation'}` : '',
            '',
            tgTactical ? `━━━ AI Tactical Analysis ━━━` : '',
            tgTactical || '',
            tgReality ? '' : '',
            tgReality ? `━━━ Reality Check ━━━` : '',
            tgReality || '',
            '',
            '*Observation only — not financial advice.',
          ].filter(Boolean).join('\n');
          const tgText = formatForTelegram(tgMorning, { channelLink: `${baseUrl}/intel-guardian?${buildUtm('telegram', 'morning')}`, contentType: 'morning' });
          const tgOg = await captureRealtimeOG(baseUrl, mkt, 'tweet', dryRun);
          const r = await dispatchTelegram({ text: tgText, imageUrl: tgOg, dryRun });
          results.push({ success: r.success, format: 'post', channel: 'telegram', service: 'telegram', lang: 'en', textPreview: 'telegram', postId: String(r.messageId || '') } as DispatchResult);
        }
        break;
      }

      // ========================================
      // MORNING IG CAROUSEL — LIVE DATA
      // Uses fetchLiveMarketData() for real-time accuracy
      // ========================================
      case 'morning_ig': {
        // Fetch LIVE market data (same as morning action)
        const mktIg = await fetchLiveMarketData('en');
        console.log(`[Cron/MorningIG] Live data: SPY ${mktIg.spyChg.toFixed(2)}% | VIX ${mktIg.vix.toFixed(1)} | GEX ${mktIg.gex} | DP ${mktIg.dp.toFixed(1)}%`);

        // Fetch QQQ change from Redis (for carousel slide 2 — NASDAQ)
        let qqqChg = 0;
        try {
          const qqqRaw = await getFromCache('yahoo:nq').catch(() => null)
            || await getFromCache('yahoo:idx:ndx').catch(() => null);
          if (qqqRaw) {
            const qqqData = typeof qqqRaw === 'string' ? JSON.parse(qqqRaw) : qqqRaw;
            qqqChg = qqqData?.changePercent ?? qqqData?.changePct ?? 0;
          }
        } catch { /* optional */ }

        for (const lang of langs) {
          const igCh = getFilteredChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            // Build carousel params from LIVE data
            const carouselData: Record<string, string | number> = {
              spy: mktIg.spyChg,
              qqq: qqqChg,
              vix: mktIg.vix,
              gex: mktIg.gex,
              dp: mktIg.dp,
              date: mktIg.date,
            };

            // Capture 6 carousel slides via EC2
            const carouselUrls: string[] = [];
            if (dryRun) {
              for (let slide = 1; slide <= 6; slide++) {
                const url = new URL(`${baseUrl}/templates/og/carousel`);
                Object.entries(carouselData).forEach(([k, v]) => url.searchParams.set(k, String(v)));
                url.searchParams.set('slide', String(slide));
                url.searchParams.set('format', 'carousel');
                carouselUrls.push(url.toString());
              }
            } else {
              for (let slide = 1; slide <= 6; slide++) {
                for (let attempt = 0; attempt < 2; attempt++) {
                  try {
                    const result = await captureTemplate({
                      template: 'carousel',
                      format: 'carousel',
                      data: { ...carouselData, slide },
                    });
                    if (result?.cdnUrl) { carouselUrls.push(result.cdnUrl); break; }
                  } catch (err: any) {
                    console.warn(`[MorningIG] Carousel slide ${slide} attempt ${attempt + 1} failed: ${err.message}`);
                  }
                  if (attempt === 0) await new Promise(r => setTimeout(r, 500));
                }
                await new Promise(r => setTimeout(r, 300));
              }
            }

            console.log(`[MorningIG] Captured ${carouselUrls.length}/6 carousel slides`);

            if (carouselUrls.length > 0) {
              // Build Guardian-grade caption from live data
              const sd = mktIg.spyChg >= 0 ? '+' : '';
              const G = mktIg.gex.toUpperCase();
              const dp = mktIg.dp > 0 ? `${mktIg.dp.toFixed(1)}%` : 'N/A';
              const caption = lang === 'ko'
                ? `📊 실시간 구조 분석 | ${mktIg.date}\n\nSPY ${sd}${mktIg.spyChg.toFixed(2)}% | VIX ${mktIg.vix.toFixed(1)} | GEX ${G}\n다크풀: ${dp}\n\n기관의 포지셔닝을 데이터로 확인하세요.`
                : lang === 'ja'
                ? `📊 リアルタイム構造分析 | ${mktIg.date}\n\nSPY ${sd}${mktIg.spyChg.toFixed(2)}% | VIX ${mktIg.vix.toFixed(1)} | GEX ${G}\nダークプール: ${dp}\n\n機関のポジショニングをデータで確認。`
                : `📊 Live Structure Analysis | ${mktIg.date}\n\nSPY ${sd}${mktIg.spyChg.toFixed(2)}% | VIX ${mktIg.vix.toFixed(1)} | GEX ${G}\nDark Pool: ${dp}\n\nSee what institutions are doing — before the market tells you.`;

              const r = await dispatchCarousel({
                channelId: igCh.id,
                caption: truncateForPlatform(`${caption}${buildInstagramFooter(lang, 'morning')}`, 'instagram'),
                imageUrls: carouselUrls,
                altTexts: generateCarouselAltTexts(carouselUrls.length, lang),
                dryRun,
                draft,
              });
              results.push(r);
            } else {
              console.error(`[MorningIG] All carousel slides failed — skipping IG post for ${lang}`);
            }
          }
        }
        break;
      }

      // ========================================
      // MIDDAY COMMENTARY ??11:00 KST
      // X tweet + Bluesky + IG Story + Pinterest
      // ========================================
      case 'midday': {
        // Midday uses pulse content ??try today, then previous trading day
        let content = await loadContent('pulse', dateKey);
        if (!content) {
          const prevKey = getPreviousTradingDayKey();
          content = await loadContent('pulse', prevKey);
          if (!content) return noContent('pulse', `${dateKey} (also tried ${prevKey})`);
        }

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'midday');

          // Pre-capture OG image (reused across X + Bluesky)
          const ogImage = await captureImageForDispatch(baseUrl, content, lang, 'tweet', 'pulse', dryRun);

          // X Tweet
          const twitterCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'midday', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateWithTags(lc.platformText?.twitter || lc.text, tags, 'twitter'),
              imageUrl: ogImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'midday', lang });
            const footer = `\n\n${ctaUrl}\n\n${tags}`;
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(lc.platformText?.bluesky || lc.text, footer, 'bluesky'),
              imageUrl: ogImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // IG Story (1080×1920) ??dedicated story template
          const igChMidday = getFilteredChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igChMidday) {
            const storyUrl = await captureStoryForDispatch(baseUrl, content, lang, dryRun);
            if (storyUrl) {
              const r = await dispatchStory({
                channelId: igChMidday.id,
                imageUrl: storyUrl,
                dryRun,
                draft,
              });
              results.push(r);
            }
          }

          // Threads
          const thChMidday = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (thChMidday) {
            const tags = getHashtags({ platform: 'threads', contentType: 'midday', lang });
            const r = await dispatchPost({
              channelId: thChMidday.id,
              text: truncateWithTags(lc.platformText?.threads || lc.text, tags, 'threads'),
              imageUrl: ogImage,
              dryRun,
              draft,
            });
            results.push(r);
          }
        }

        // Pinterest (EN only)
        const pinCh = getFilteredChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinCh) {
          const seo = getPinterestSEO({ contentType: 'pulse', date: dateKey });
          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'pulse', dryRun),
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/intel-guardian?${buildUtm('pinterest', 'midday')}`,
            dryRun,

            draft,
          });
          results.push(r);
        }

        // Telegram (EN midday pulse)
        if (PLATFORM_ALLOW[action]?.has('telegram') && content.en?.text) {
          const tgText = formatForTelegram(content.en.text, { channelLink: `${baseUrl}/intel-guardian?${buildUtm('telegram', 'midday')}`, contentType: 'midday' });
          const ogForTg = await captureImageForDispatch(baseUrl, content, 'en', 'tweet', 'pulse', dryRun);
          const r = await dispatchTelegram({ text: tgText, imageUrl: ogForTg, dryRun });
          results.push({ success: r.success, format: 'post', channel: 'telegram', service: 'telegram', lang: 'en', textPreview: 'telegram', postId: String(r.messageId || '') } as DispatchResult);
        }
        break;
      }

      // ========================================
      // EDUCATION THREAD ??14:00 KST
      // X Thread + Pinterest
      // ========================================
      case 'education': {
        const content = await loadContent('education', dateKey);
        if (!content) return noContent('education', dateKey);

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'education');
          const twitterCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];

          if (twitterCh) {
            // Pre-capture education OG image
            const eduOgImage = await captureImageForDispatch(baseUrl, content, lang, 'tweet', 'education', dryRun);
            // Single tweet (not thread) — chain tweets are done manually
            const xTags = getHashtags({ platform: 'twitter', contentType: 'education', lang, tickers: ['SPY', 'QQQ'] });
            const xBody = lc.platformText?.threads || lc.text;
            const xFooter = `\n\n${ctaUrl}\n\n${xTags}`;
            const xText = truncateWithTags(xBody, `${ctaUrl}\n\n${xTags}`, 'twitter');
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: xText,
              imageUrl: eduOgImage,
              dryRun,
              draft,
            });
            results.push(r);
          }

          // Threads (conversational education reformat)
          const thChEdu = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (thChEdu) {
            const eduImage = await captureImageForDispatch(baseUrl, content, lang, 'og', 'education', dryRun);
            const tags = getHashtags({ platform: 'threads', contentType: 'education', lang });
            const r = await dispatchPost({
              channelId: thChEdu.id,
              text: truncateWithTags(lc.platformText?.threads || lc.text, tags, 'threads'),
              imageUrl: eduImage,
              dryRun,
              draft,
            });
            results.push(r);
          }

          // IG Story (1080x1920) — Education story template
          const igChEdu = getFilteredChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igChEdu && !dryRun) {
            try {
              const { captureEducationStory } = await import('@/lib/marketing/screenshotService');
              const topicId = (content as any)?.topicId || 'gex';
              const storyUrl = await captureEducationStory({ topic: topicId });
              if (storyUrl) {
                const r = await dispatchStory({ channelId: igChEdu.id, imageUrl: storyUrl, dryRun, draft });
                results.push(r);
              }
            } catch (err: any) {
              console.warn(`[Education] Story capture failed: ${err.message}`);
            }
          }
        }

        // Pinterest (EN only) — reuse EN education OG image (no extra EC2 call)
        const pinCh = getFilteredChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinCh) {
          const eduTopics = ['gex', 'dark_pool', 'iv_percentile', 'pcr', 'max_pain'];
          const topicIdx = new Date().getDate() % eduTopics.length;
          const pinTopic = eduTopics[topicIdx];
          const seo = getPinterestSEO({ contentType: 'education', educationTopic: pinTopic });

          // Reuse EN OG image already captured above (no extra EC2 call needed)
          const pinImage = await captureImageForDispatch(baseUrl, content, 'en', 'og', 'education', dryRun);

          const pinLink = `${baseUrl}/how-it-works?${buildUtm('pinterest', 'education')}`;
          const pinOverhead = seo.title.length + pinLink.length + 4;
          const maxDesc = 500 - pinOverhead;
          const pinDesc = seo.description.length > maxDesc
            ? seo.description.substring(0, maxDesc - 3) + '...'
            : seo.description;

          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: pinImage,
            title: seo.title,
            description: pinDesc,
            link: pinLink,
            dryRun,
            draft,
          });
          results.push(r);
        }

        // Telegram (EN education)
        if (PLATFORM_ALLOW[action]?.has('telegram') && content.en?.text) {
          const tgText = formatForTelegram(content.en.platformText?.threads || content.en.text, { channelLink: `${baseUrl}/how-it-works?${buildUtm('telegram', 'education')}`, contentType: 'education' });
          const ogForTg = await captureImageForDispatch(baseUrl, content, 'en', 'tweet', 'education', dryRun);
          const r = await dispatchTelegram({ text: tgText, imageUrl: ogForTg, dryRun });
          results.push({ success: r.success, format: 'post', channel: 'telegram', service: 'telegram', lang: 'en', textPreview: 'telegram', postId: String(r.messageId || '') } as DispatchResult);
        }
        break;
      }

      // ========================================
      // EDUCATION IG CAROUSEL — KST 09:30
      // 5 slides × 3 langs = 15 captures (separate cron to avoid EC2 contention)
      // ========================================
      case 'education_ig': {
        const eduTopics = ['gex', 'dark_pool', 'iv_percentile', 'pcr', 'max_pain'];
        const topicIdx = new Date().getDate() % eduTopics.length;
        const topic = eduTopics[topicIdx];

        for (const lang of langs) {
          const igCh = getFilteredChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (!igCh) continue;

          // Capture 5 slides
          const slideUrls: string[] = [];
          for (let slide = 1; slide <= 5; slide++) {
            if (dryRun) {
              slideUrls.push(`${baseUrl}/templates/og/education-carousel?topic=${topic}&lang=${lang}&slide=${slide}`);
            } else {
              try {
                const result = await captureTemplate({
                  template: 'education-carousel' as any,
                  format: 'carousel',
                  data: { topic, lang, slide },
                });
                if (result?.cdnUrl) slideUrls.push(result.cdnUrl);
              } catch (err: any) {
                console.warn(`[EduIG] Slide ${slide} capture failed: ${err.message}`);
              }
              // Rate limit between captures (EC2 load management)
              await new Promise(r => setTimeout(r, 1500));
            }
          }

          if (slideUrls.length === 0) {
            console.warn(`[EduIG] No slides captured for ${lang}, skipping`);
            continue;
          }

          // Build IG caption
          const caption = lang === 'ko'
            ? `📚 옵션 구조 교육 시리즈\n\n오늘의 주제: ${topic.toUpperCase().replace('_', ' ')}\n\n기관이 보는 시장 구조를 이해하세요.\n\n📊 signumhq.com\n\n#옵션구조 #주식투자 #GEX #다크풀 #signumhq`
            : lang === 'ja'
            ? `📚 オプション構造教育シリーズ\n\n今日のトピック: ${topic.toUpperCase().replace('_', ' ')}\n\n機関が見る市場構造を理解しましょう。\n\n📊 signumhq.com\n\n#オプション構造 #株式投資 #GEX #signumhq`
            : `📚 Options Structure Education\n\nToday's topic: ${topic.toUpperCase().replace('_', ' ')}\n\nUnderstand the market structure that institutions see.\n\n📊 signumhq.com\n\n#optionsflow #stockmarket #GEX #darkpool #signumhq`;

          const r = await dispatchCarousel({
            channelId: igCh.id,
            caption,
            imageUrls: slideUrls,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // EDUCATION BLUESKY ??17:00 KST
      // Bluesky + Pinterest
      // ========================================
      case 'edu_bsky': {
        const content = await loadContent('education', dateKey);
        if (!content) return noContent('education', dateKey);

        for (const lang of langs.filter(l => region === 'asia' ? true : l === 'en')) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'education');
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'education', lang });
            const eduImage = await captureImageForDispatch(baseUrl, content, lang, 'og', 'education', dryRun);
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(lc.platformText?.bluesky || lc.text, `\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
              imageUrl: eduImage,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }

        // Additional Pinterest pin (different topic variant)
        const pinCh = getFilteredChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinCh) {
          const eduTopics = ['gex', 'dark_pool', 'iv_percentile', 'pcr', 'max_pain'];
          const topicIdx = (new Date().getDate() + 1) % eduTopics.length; // +1 offset from education dispatch
          const pinTopic = eduTopics[topicIdx];
          const seo = getPinterestSEO({ contentType: 'education', educationTopic: pinTopic });

          let pinImage = '';
          if (!dryRun) {
            for (let att = 0; att < 3 && !pinImage; att++) {
              try {
                const r = await captureTemplate({ template: 'education_pin', format: 'pin', data: { topic: pinTopic } });
                if (r?.cdnUrl) pinImage = r.cdnUrl;
              } catch (e: any) {
                console.warn(`[EduBsky] Pin attempt ${att + 1}/3: ${e.message}`);
              }
              if (!pinImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
            if (!pinImage) {
              console.warn('[EduBsky] Pin failed 3x, falling back to generic education');
              try { pinImage = await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'education', false); } catch {}
            }
          } else {
            pinImage = await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'education', dryRun);
          }

          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: pinImage,
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/how-it-works?${buildUtm('pinterest', 'education')}`,
            dryRun,
            draft,
          });
          results.push(r);
        }

        // Telegram (EN education variant)
        if (PLATFORM_ALLOW[action]?.has('telegram') && content.en?.text) {
          const tgText = formatForTelegram(content.en.platformText?.threads || content.en.text, { channelLink: `${baseUrl}/how-it-works?${buildUtm('telegram', 'education')}`, contentType: 'education' });
          const ogForTg = await captureImageForDispatch(baseUrl, content, 'en', 'tweet', 'education', dryRun);
          const r = await dispatchTelegram({ text: tgText, imageUrl: ogForTg, dryRun });
          results.push({ success: r.success, format: 'post', channel: 'telegram', service: 'telegram', lang: 'en', textPreview: 'telegram', postId: String(r.messageId || '') } as DispatchResult);
        }
        break;
      }

      // ========================================
      // MARKET PULSE ??05:30+1 KST
      // X tweet + Bluesky + IG Story + Pinterest
      // ========================================
      case 'pulse': {
        const content = await loadContent('pulse', dateKey);
        if (!content) return noContent('pulse', dateKey);

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'pulse');

          // Pre-capture OG image (reused across X + Bluesky)
          const ogImage = await captureImageForDispatch(baseUrl, content, lang, 'tweet', 'pulse', dryRun);

          // X Tweet + auto-reply
          const twitterCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'pulse', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateWithTags(lc.platformText?.twitter || lc.text, tags, 'twitter'),
              imageUrl: ogImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'pulse', lang });
            const footer = `\n\n${ctaUrl}\n\n${tags}`;
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(lc.platformText?.bluesky || lc.text, footer, 'bluesky'),
              imageUrl: ogImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // IG Story (1080×1920) ??dedicated story template
          const igChPulse = getFilteredChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igChPulse) {
            const storyUrl = await captureStoryForDispatch(baseUrl, content, lang, dryRun);
            if (storyUrl) {
              const r = await dispatchStory({
                channelId: igChPulse.id,
                imageUrl: storyUrl,
                dryRun,
                draft,
              });
              results.push(r);
            }
          }
        }

        // Pinterest (EN only)
        const pinCh = getFilteredChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinCh) {
          const seo = getPinterestSEO({ contentType: 'pulse', date: dateKey });
          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'pulse', dryRun),
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/intel-guardian?${buildUtm('pinterest', 'pulse')}`,
            dryRun,

            draft,
          });
          results.push(r);
        }

        // Telegram (EN pulse summary)
        if (PLATFORM_ALLOW[action]?.has('telegram') && content.en?.text) {
          const tgText = formatForTelegram(content.en.text, { channelLink: `${baseUrl}/intel-guardian?${buildUtm('telegram', 'pulse')}`, contentType: 'pulse' });
          const ogForTg = await captureImageForDispatch(baseUrl, content, 'en', 'tweet', 'pulse', dryRun);
          const r = await dispatchTelegram({ text: tgText, imageUrl: ogForTg, dryRun });
          results.push({ success: r.success, format: 'post', channel: 'telegram', service: 'telegram', lang: 'en', textPreview: 'telegram', postId: String(r.messageId || '') } as DispatchResult);
        }
        break;
      }

      // ========================================
      // PULSE IG CAROUSEL ??07:00+1 KST
      // ========================================
      case 'pulse_ig': {
        const content = await loadContent('pulse', dateKey);
        if (!content) return noContent('pulse', dateKey);

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const igCh = getFilteredChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            const caption = lc.platformText?.instagram || lc.text;
            const carouselUrls = await captureCarouselForDispatch(baseUrl, content, lang, dryRun);

            const r = await dispatchCarousel({
              channelId: igCh.id,
              caption: truncateForPlatform(`${caption}${buildInstagramFooter(lang, 'pulse')}`, 'instagram'),
              imageUrls: carouselUrls,
              altTexts: generateCarouselAltTexts(carouselUrls.length, lang),
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Threads
          const threadsCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (threadsCh) {
            const tags = getHashtags({ platform: 'threads', contentType: 'pulse', lang });
            const threadsImage = await captureImageForDispatch(baseUrl, content, lang, 'og', 'pulse', dryRun);
            const r = await dispatchPost({
              channelId: threadsCh.id,
              text: truncateWithTags(lc.platformText?.threads || lc.text, tags, 'threads'),
              imageUrl: threadsImage,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }
        break;
      }

      // ========================================
      // EVENT ???�시�?즉시 발송
      // ========================================
      case 'event': {
        const content = await loadContent('event', dateKey);
        if (!content) return noContent('event', dateKey);

        // Load pre-captured event alert images (from screenshotService via event-detect)
        let capturedImages: { tweet?: string; story?: string } = {};
        try {
          const imagesRaw = await getFromCache(`marketing:event:images:${dateKey}`);
          if (imagesRaw) capturedImages = JSON.parse(String(imagesRaw));
        } catch { /* non-fatal */ }

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'event');
          // Prefer captured image ??fallback to existing OG
          const tweetImage = capturedImages.tweet || lc.imageUrl;

          // X Tweet (즉시)
          const twitterCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'event', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateWithTags(lc.platformText?.twitter || lc.text, tags, 'twitter'),
              imageUrl: tweetImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky (즉시)
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'event', lang });
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(lc.platformText?.bluesky || lc.text, `\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
              imageUrl: tweetImage,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }
        break;
      }

      case 'spotlight': {
        // Phase 4-3: Ticker Spotlight 게릴???�스??
        const { generateTickerSpotlight, getRandomSpotlightTicker } = await import('@/lib/marketing/contentEngines');
        const { fetchTradeData } = await import('@/services/realtimeMetricsService');
        const { captureTickerSpotlight } = await import('@/lib/marketing/screenshotService');

        const ticker = searchParams.get('ticker') || await (async () => {
          // Prevent duplicate: check which tickers were already posted today
          const usedRaw = await getFromCache(`marketing:spotlight:used:${dateKey}`).catch(() => null);
          const usedTickers: string[] = usedRaw ? JSON.parse(String(usedRaw)) : [];
          let picked = getRandomSpotlightTicker();
          let attempts = 0;
          while (usedTickers.includes(picked) && attempts < 5) {
            picked = getRandomSpotlightTicker();
            attempts++;
          }
          // Record this ticker as used today
          usedTickers.push(picked);
          await setInCache(`marketing:spotlight:used:${dateKey}`, JSON.stringify(usedTickers), 86400);
          return picked;
        })();
        const tradeData = await fetchTradeData(ticker).catch(() => null);

        const spotlightContent = generateTickerSpotlight({
          ticker,
          darkPoolPct: tradeData?.darkPoolPercent,
          buyPct: tradeData?.buyPct,
          sellPct: tradeData?.sellPct,
          blockTrades: tradeData?.blockTrades,
        });

        // Save for logging
        await setInCache(`marketing:spotlight:${dateKey}:${ticker}`, JSON.stringify(spotlightContent), 86400);

        
        // [V6.0+] Pre-capture premium images via EC2 Puppeteer -> Supabase CDN
        let spotlightImages = { tweet: null as string | null, og: null as string | null };
        if (!dryRun) {
          try {
            spotlightImages = await captureTickerSpotlight({
              ticker,
              dp: tradeData?.darkPoolPercent ?? 0,
              buy: tradeData?.buyPct ?? 50,
              sell: tradeData?.sellPct ?? 50,
              blocks: tradeData?.blockTrades ?? 0,
              position: tradeData?.darkPoolPercent != null ? Math.min(Math.round(tradeData.darkPoolPercent * 2.5), 100) : 50,
              sector: '',
            });
          } catch (err: any) {
            console.warn(`[Spotlight] Capture failed: ${err.message}`);
          }
        }
for (const lang of langs) {
          const lc = spotlightContent[lang];
          if (!lc?.text) continue;

          const tickerCashtag = `$${ticker}`;
          const xTags = `${tickerCashtag} $SPY #DarkPool`;

          // X tweet
          const xCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (xCh) {
            const r = await dispatchTweet({
              channelId: xCh.id,
              text: truncateWithTags(lc.text, xTags, 'twitter'),
              imageUrl: spotlightImages.tweet || lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'spotlight', lang, tickers: [ticker] });
            const ctaUrl = buildCtaUrl(lang, 'command', 'spotlight');
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(lc.text, `\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
              imageUrl: spotlightImages.tweet || lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Threads
          const thCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (thCh) {
            const r = await dispatchPost({
              channelId: thCh.id,
              text: truncateWithTags(lc.text, `${tickerCashtag} #InstitutionalFlow`, 'threads'),
              imageUrl: spotlightImages.tweet || lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // IG Story (1080x1920) — Spotlight story template
          const igChSpot = getFilteredChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igChSpot && !dryRun) {
            try {
              const { captureSpotlightStory } = await import('@/lib/marketing/screenshotService');
              const storyUrl = await captureSpotlightStory({
                ticker,
                dp: tradeData?.darkPoolPercent,
                smartFlow: tradeData?.buyPct,
                gex: 'neutral',
                insight: spotlightContent.en?.text?.split('\n')[0] || '',
              });
              if (storyUrl) {
                const r = await dispatchStory({ channelId: igChSpot.id, imageUrl: storyUrl, dryRun, draft });
                results.push(r);
              }
            } catch (err: any) {
              console.warn(`[Spotlight] Story capture failed: ${err.message}`);
            }
          }
        }

        // Pinterest (EN only)
        const pinChSpot = getFilteredChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinChSpot) {
          const seo = getPinterestSEO({ contentType: 'spotlight' });
          const r = await dispatchPin({
            channelId: pinChSpot.id,
            imageUrl: spotlightImages.og || spotlightImages.tweet || spotlightContent.en?.imageUrl || '',
            title: `${ticker} Dark Pool & Institutional Flow Spotlight`,
            description: seo.description,
            link: `${baseUrl}/intel-guardian?${buildUtm('pinterest', 'spotlight')}&ticker=${ticker}`,
            dryRun,

            draft,
          });
          results.push(r);
        }

        // Telegram (EN spotlight)
        if (PLATFORM_ALLOW[action]?.has('telegram') && spotlightContent.en?.text) {
          const tgText = formatForTelegram(spotlightContent.en.text, { channelLink: `${baseUrl}/intel-guardian?${buildUtm('telegram', 'spotlight')}&ticker=${ticker}`, contentType: 'spotlight' });
          const r = await dispatchTelegram({ text: tgText, imageUrl: spotlightImages.tweet || spotlightContent.en?.imageUrl || '', dryRun });
          results.push({ success: r.success, format: 'post', channel: 'telegram', service: 'telegram', lang: 'en', textPreview: 'telegram', postId: String(r.messageId || '') } as DispatchResult);
        }
        break;
      }

      // ========================================
      // PRE-MARKET BLUESKY ??08:30 ET
      // Real-time structure snapshot (FOMO)
      // ========================================
      case 'premarket_bsky': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (!bskyCh) continue;
          const text = buildRealtimeText('premarket', 'bluesky', lang, mkt);
          const tags = getHashtags({ platform: 'bluesky', contentType: 'premarket', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'tweet', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, `\n\n${buildCtaUrl(lang, 'command', 'premarket')}\n\n${tags}`, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // PRE-MARKET THREADS ??08:35 ET
      // Conversational pre-market (engagement)
      // ========================================
      case 'premarket_threads': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const thCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('premarket', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'premarket', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }

        // Pinterest (EN only)
        const pinChPM = getFilteredChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinChPM) {
          const seo = getPinterestSEO({ contentType: 'premarket', date: dateKey });
          const pmOg = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPin({
            channelId: pinChPM.id,
            imageUrl: pmOg,
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/intel-guardian?${buildUtm('pinterest', 'premarket')}`,
            dryRun, draft,
          });
          results.push(r);
        }

        // Telegram (EN premarket)
        if (PLATFORM_ALLOW[action]?.has('telegram')) {
          const tgText = formatForTelegram(buildRealtimeText('premarket', 'threads', 'en', mkt), { channelLink: `${baseUrl}/intel-guardian?${buildUtm('telegram', 'premarket')}`, contentType: 'premarket' });
          const tgOg = await captureRealtimeOG(baseUrl, mkt, 'tweet', dryRun);
          const r = await dispatchTelegram({ text: tgText, imageUrl: tgOg, dryRun });
          results.push({ success: r.success, format: 'post', channel: 'telegram', service: 'telegram', lang: 'en', textPreview: 'telegram', postId: String(r.messageId || '') } as DispatchResult);
        }
        break;
      }

      // ========================================
      // INTRADAY BLUESKY ??14:00 ET
      // Live session structure update (urgency)
      // ========================================
      case 'intraday_bsky': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (!bskyCh) continue;
          const text = buildRealtimeText('intraday', 'bluesky', lang, mkt);
          const tags = getHashtags({ platform: 'bluesky', contentType: 'intraday', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'tweet', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, `\n\n${buildCtaUrl(lang, 'flow', 'intraday')}\n\n${tags}`, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // CLOSE BLUESKY ??16:10 ET
      // Post-close summary (FOMO next-day)
      // ========================================
      case 'close_bsky': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (!bskyCh) continue;
          const text = buildRealtimeText('close', 'bluesky', lang, mkt);
          const tags = getHashtags({ platform: 'bluesky', contentType: 'close', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'tweet', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, `\n\n${buildCtaUrl(lang, 'command', 'close')}\n\n${tags}`, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // CLOSE THREADS ??16:15 ET
      // Conversational close recap (engagement)
      // ========================================
      case 'close_threads': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const thCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('close', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'close', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // STRUCTURE BSKY — 10:30 ET
      // Bluesky EN only — Mid-morning institutional analysis
      // ========================================
      case 'structure_bsky': {
        const mkt = await fetchLiveMarketData();
        const bskyCh = getFilteredChannels({ tier: 'all', lang: 'en', service: 'bluesky' })[0];
        if (bskyCh) {
          const text = buildRealtimeText('structure', 'bluesky', 'en', mkt);
          const ctaUrl = buildCtaUrl('en', 'command', 'structure');
          const tags = getHashtags({ platform: 'bluesky', contentType: 'intraday', lang: 'en' });
          const footer = `\n\n${ctaUrl}\n\n${tags}`;
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, footer, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // INSIGHT THREADS — 10:45 ET
      // Threads EN/KO/JA — Data insight engagement
      // ========================================
      case 'insight_threads': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const thCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('structure', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'intraday', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }

        // Pinterest (EN only)
        const pinChInsight = getFilteredChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinChInsight) {
          const seo = getPinterestSEO({ contentType: 'intraday', date: dateKey });
          const insightOg = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPin({
            channelId: pinChInsight.id,
            imageUrl: insightOg,
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/intel-guardian?${buildUtm('pinterest', 'insight')}`,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // AFTERHOURS BSKY — 18:30 ET
      // Bluesky EN only — Session debrief
      // ========================================
      case 'afterhours_bsky': {
        const mkt = await fetchLiveMarketData();
        const bskyCh = getFilteredChannels({ tier: 'all', lang: 'en', service: 'bluesky' })[0];
        if (bskyCh) {
          const text = buildRealtimeText('afterhours', 'bluesky', 'en', mkt);
          const ctaUrl = buildCtaUrl('en', 'guardian', 'afterhours');
          const tags = getHashtags({ platform: 'bluesky', contentType: 'close', lang: 'en' });
          const footer = `\n\n${ctaUrl}\n\n${tags}`;
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, footer, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // AFTERHOURS THREADS — 18:15 ET
      // Threads EN/KO/JA — Session recap engagement
      // ========================================
      case 'afterhours_threads': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const thCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('afterhours', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'close', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // ASIA RECAP — UTC 02:30 (KST 11:30 / ET 22:30)
      // Threads KO/JA only — Overnight US session recap
      // ========================================
      case 'asia_recap': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          if (lang === 'en') continue; // Asia-only
          const thCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('recap', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'pulse', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // ASIA INSIGHT — UTC 05:00 (KST 14:00 / ET 01:00)
      // Threads KO/JA only — Afternoon data insight
      // ========================================
      case 'asia_insight': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          if (lang === 'en') continue; // Asia-only
          const thCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('asia_insight', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'education', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }


      // ========================================
      // MARKET OPEN — UTC 13:30 (KST 22:30 / ET 09:30)
      // Threads KO/JA + Bluesky EN
      // ========================================
      case 'market_open': {
        const mkt = await fetchLiveMarketData();
        // Threads KO/JA
        for (const lang of langs) {
          if (lang === 'en') continue;
          const thCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('market_open', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'intraday', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        // Bluesky EN
        const bskyCh = getFilteredChannels({ tier: 'all', lang: 'en', service: 'bluesky' })[0];
        if (bskyCh) {
          const text = buildRealtimeText('market_open', 'bluesky', 'en', mkt);
          const ctaUrl = buildCtaUrl('en', 'command', 'market_open');
          const tags = getHashtags({ platform: 'bluesky', contentType: 'intraday', lang: 'en' });
          const footer = `\n\n${ctaUrl}\n\n${tags}`;
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, footer, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        // Pinterest
        const pinChOpen = getFilteredChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinChOpen) {
          const seo = getPinterestSEO({ contentType: 'intraday', date: dateKey });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPin({
            channelId: pinChOpen.id,
            imageUrl: ogImage,
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/intel-guardian?${buildUtm('pinterest', 'market_open')}`,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // SPACEX SPOTLIGHT — $TSLA Proxy × SpaceX IPO Analysis
      // Special event-driven dispatch (manual or scheduled)
      // ========================================
      case 'spacex_spotlight': {
        // Fetch REAL $TSLA data from proven sources (same as 'spotlight' action)
        const { fetchTradeData: fetchTslaTrade } = await import('@/services/realtimeMetricsService');
        const { getStockDataLight: getTslaLight } = await import('@/services/marketDataLight');
        
        // Parallel fetch: trade data (DP%) + stock data (price/change)
        const [tslaTradeData, tslaStockData] = await Promise.all([
          fetchTslaTrade('TSLA').catch(() => null),
          getTslaLight('TSLA').catch(() => null),
        ]);
        
        const tslaPrice = tslaStockData?.price || 0;
        const tslaChange = tslaStockData?.changePercent || 0;
        let tslaDp = tslaTradeData?.darkPoolPercent || 0;
        // Off-hours fallback: read last cached TSLA DP
        if (tslaDp === 0) {
          try {
            const dpC = await getFromCache('marketing:dp:latest:TSLA').catch(() => null);
            if (dpC) tslaDp = parseFloat(String(dpC)) || 0;
          } catch {}
        }
        // Always cache latest TSLA DP for off-hours use
        if (tslaDp > 0) {
          await setInCache('marketing:dp:latest:TSLA', String(tslaDp), 86400);
        }
        // WhaleIndex & GEX from DynamoDB analysis cache (same key as watchlist)
        const tslaAnalysisRaw = await getFromCache(`cache:analysis:TSLA`).catch(() => null);
        const tslaAnalysis = tslaAnalysisRaw ? (typeof tslaAnalysisRaw === 'string' ? JSON.parse(tslaAnalysisRaw) : tslaAnalysisRaw) : {};
        const tslaWhale = tslaAnalysis?.whaleIndex ?? tslaAnalysis?.smartFlow ?? 50;
        const tslaGex = (tslaAnalysis?.gexRegime ?? tslaAnalysis?.gex ?? 'neutral').toLowerCase();
        const tslaPremium = tslaAnalysis?.netPremium ?? '';

        // === NEWS: Guardian News Pulse (pre-analyzed) → callBedrock reformat ===
        let spacexHeadline = '';
        let newsSourceContext = ''; // Raw analysis from pulse for AI reformat
        const aiAnalysisMap: Record<string, string> = {};

        // Step 1: Check Guardian News Pulse for SpaceX/TSLA related items
        try {
          const pulseRaw = await getFromCache('guardian:news:digest').catch(() => null);
          if (pulseRaw) {
            const pulse = typeof pulseRaw === 'string' ? JSON.parse(pulseRaw) : pulseRaw;
            const items = pulse?.items || [];
            const match = items.find((it: any) =>
              /spacex|starship|starlink|musk.*space|tsla|tesla/i.test(
                `${it.headline} ${it.summaryEN} ${it.analysisEN}`
              )
            );
            if (match) {
              spacexHeadline = match.headline || '';
              newsSourceContext = `Headline: ${match.headline}\nSummary: ${match.summaryEN}\nAnalysis: ${match.analysisEN}\nImpact: ${match.impact}`;
              console.log(`[SpaceX] ✅ News Pulse match: "${spacexHeadline}"`);
            }
          }
        } catch { /* pulse read optional */ }

        // Step 2: Fallback — Polygon TSLA ticker news
        if (!spacexHeadline) {
          try {
            const { fetchMassive: fetchPolygonNews } = await import('@/services/massiveClient');
            const newsData = await fetchPolygonNews('/v2/reference/news', { ticker: 'TSLA', limit: '5' }, true);
            const articles = (newsData?.results || []).filter((a: any) => a.title);
            const spxMatch = articles.find((a: any) => /spacex|ipo|starship|starlink|musk.*space/i.test(a.title));
            const picked = spxMatch || articles[0];
            if (picked) {
              spacexHeadline = picked.title;
              newsSourceContext = `Headline: ${picked.title}\nDescription: ${picked.description || ''}`;
            }
          } catch { /* news fetch optional */ }
        }

        const changeFmt = `${tslaChange >= 0 ? '+' : ''}${tslaChange.toFixed(2)}%`;
        const changeDir = tslaChange >= 0 ? 'up' : 'down';
        const dpSignal = tslaDp >= 40 ? 'elevated' : 'normal';
        const flowSignal = tslaWhale >= 65 ? 'accumulation' : tslaWhale <= 35 ? 'distribution' : 'neutral';

        // Step 3: Reformat news + TSLA data into SpaceX post via callBedrock (cached 24h)
        if (newsSourceContext) {
          try {
            const aiCacheKey = `marketing:spacex_ai:${dateKey}`;
            const cachedAi = await getFromCache(aiCacheKey).catch(() => null);
            if (cachedAi) {
              const parsed = typeof cachedAi === 'string' ? JSON.parse(cachedAi) : cachedAi;
              Object.assign(aiAnalysisMap, parsed);
            } else {
              const { callBedrock, MODELS } = await import('@/services/bedrockClient');
              const dataCtx = `TSLA: $${Number(tslaPrice).toFixed(2)} (${changeFmt}), Dark Pool: ${tslaDp.toFixed(1)}%, Smart Flow: ${tslaWhale}/100, GEX: ${tslaGex}`;
              const result = await callBedrock({
                modelId: MODELS.HAIKU_35,
                system: 'You are an institutional market structure analyst at SIGNUM HQ. Write OBSERVATION ONLY — never predict or advise.',
                userPrompt: `Based on this news and $TSLA data, write a 2-sentence SpaceX × $TSLA proxy analysis for social media. Connect the news to institutional positioning data. Be specific with numbers.\n\nNews:\n${newsSourceContext}\n\nTSLA data: ${dataCtx}\n\nOutput JSON: {"en":"...English...", "ko":"...한국어...", "ja":"...日本語..."}\nEach: exactly 2 sentences, observation only, no advice. Each language must sound native.`,
                maxTokens: 500,
                temperature: 0.4,
                timeoutMs: 20000,
                jsonPrefill: true,
                label: 'SpaceX-Reformat',
              });
              try {
                const parsed = JSON.parse(result.text);
                if (parsed.en) aiAnalysisMap.en = parsed.en;
                if (parsed.ko) aiAnalysisMap.ko = parsed.ko;
                if (parsed.ja) aiAnalysisMap.ja = parsed.ja;
              } catch { aiAnalysisMap.en = result.text.replace(/[{}"\n]/g, '').trim(); }
              if (Object.keys(aiAnalysisMap).length > 0) {
                await setInCache(aiCacheKey, JSON.stringify(aiAnalysisMap), 86400);
              }
              console.log(`[SpaceX] ✅ AI reformat done (${result.elapsedMs}ms)`);
            }
          } catch (e: any) { console.warn(`[SpaceX] AI reformat skipped: ${e.message}`); }
        }

        for (const lang of langs) {
          const aiInsight = aiAnalysisMap[lang] || aiAnalysisMap.en || '';
          // Dynamic 5-Layer content: Hook → Data → AI Analysis → Implication → CTA
          const textMap: Record<string, string> = {
            en: [
              spacexHeadline
                ? `🚀 SpaceX × $TSLA Proxy Update\n📰 ${spacexHeadline}`
                : `🚀 SpaceX IPO × $TSLA Proxy — Daily Structure Check`,
              '',
              `📊 $TSLA ${changeFmt} ($${Number(tslaPrice).toFixed(2)})`,
              `▸ Dark Pool: ${tslaDp > 0 ? `${tslaDp.toFixed(1)}%` : 'N/A'}${dpSignal === 'elevated' ? ' ⚡ Institutional activity elevated' : ''}`,
              `▸ Smart Flow: ${tslaWhale}/100 (${flowSignal === 'accumulation' ? '📈 Accumulation' : flowSignal === 'distribution' ? '📉 Distribution' : '➡️ Neutral'})`,
              `▸ GEX: ${tslaGex.toUpperCase()}`,
              '',
              aiInsight || `$TSLA remains the primary public proxy for SpaceX exposure. ${changeDir === 'down' ? 'Institutional positioning during pullbacks often reveals conviction.' : 'Momentum aligns with institutional flow direction.'}`,
              '',
              `*Observation only — not financial advice.`,
            ].join('\n'),
            ko: [
              spacexHeadline
                ? `🚀 SpaceX × $TSLA 프록시 업데이트\n📰 ${spacexHeadline}`
                : `🚀 SpaceX IPO × $TSLA 프록시 — 일일 구조 분석`,
              '',
              `📊 $TSLA ${changeFmt} ($${Number(tslaPrice).toFixed(2)})`,
              `▸ 다크풀: ${tslaDp > 0 ? `${tslaDp.toFixed(1)}%` : 'N/A'}${dpSignal === 'elevated' ? ' ⚡ 기관 활동 활발' : ''}`,
              `▸ 스마트 플로우: ${tslaWhale}/100 (${flowSignal === 'accumulation' ? '📈 매집' : flowSignal === 'distribution' ? '📉 분산' : '➡️ 중립'})`,
              `▸ GEX: ${tslaGex.toUpperCase()}`,
              '',
              aiInsight || `$TSLA는 SpaceX 노출의 유일한 공개 프록시입니다. ${changeDir === 'down' ? '하락 구간에서의 기관 포지셔닝은 확신 수준을 보여줍니다.' : '모멘텀이 기관 흐름 방향과 일치합니다.'}`,
              '',
              `*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.`,
            ].join('\n'),
            ja: [
              spacexHeadline
                ? `🚀 SpaceX × $TSLA プロキシ更新\n📰 ${spacexHeadline}`
                : `🚀 SpaceX IPO × $TSLA プロキシ — デイリー構造分析`,
              '',
              `📊 $TSLA ${changeFmt} ($${Number(tslaPrice).toFixed(2)})`,
              `▸ ダークプール: ${tslaDp > 0 ? `${tslaDp.toFixed(1)}%` : 'N/A'}${dpSignal === 'elevated' ? ' ⚡ 機関活動活発' : ''}`,
              `▸ スマートフロー: ${tslaWhale}/100 (${flowSignal === 'accumulation' ? '📈 集積' : flowSignal === 'distribution' ? '📉 分配' : '➡️ 中立'})`,
              `▸ GEX: ${tslaGex.toUpperCase()}`,
              '',
              aiInsight || `$TSLAはSpaceXエクスポージャーの唯一の公開プロキシです。${changeDir === 'down' ? '下落時の機関ポジショニングは確信度を示します。' : 'モメンタムが機関フロー方向と一致。'}`,
              '',
              `*投資助言ではありません。データ分析の参考資料です。`,
            ].join('\n'),
          };
          const text = textMap[lang] || textMap.en;
          const ctaUrl = buildCtaUrl(lang, 'command', 'spacex_ipo');

          // Capture OG with real TSLA data
          let ogImage = '';
          if (!dryRun) {
            const premFmt = typeof tslaPremium === 'number' ? `${tslaPremium >= 0 ? '+' : ''}$${Math.abs(tslaPremium / 1e6).toFixed(1)}M` : String(tslaPremium || '');
            const ogData = {
              dp: tslaDp, whale: String(tslaWhale), gex: tslaGex,
              price: String(tslaPrice), change: tslaChange, premium: premFmt, date: dateKey,
            };
            for (let att = 0; att < 3 && !ogImage; att++) {
              try {
                const r = await captureTemplate({ template: 'spacex_ipo', format: 'tweet', data: ogData });
                if (r?.cdnUrl) ogImage = r.cdnUrl;
              } catch (e: any) { console.warn(`[SpaceX] OG attempt ${att + 1}: ${e.message}`); }
              if (!ogImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
          }

          // X Thread (4 slides)
          const twitterCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'spacex', lang, tickers: ['TSLA'] });
            const lines = text.split('\n').filter(l => l.trim());
            const slides: { text: string; imageUrl?: string }[] = [];
            // Slide 1: Hook + image
            slides.push({ text: `${tags}\n\n${lines.slice(0, 2).join('\n')}`, imageUrl: ogImage || undefined });
            // Slide 2: Data
            slides.push({ text: lines.slice(2, 6).join('\n') });
            // Slide 3: Meaning
            slides.push({ text: lines.slice(6, 9).join('\n') });
            // Slide 4: CTA
            slides.push({ text: `📊 ${lang === 'ko' ? '$TSLA 기관 구조 실시간 추적' : lang === 'ja' ? '$TSLA 機関構造リアルタイム追跡' : 'Track $TSLA institutional structure live'} → ${ctaUrl}\n\n${lines[lines.length - 1]}` });
            const r = await dispatchThread({ channelId: twitterCh.id, slides, dryRun, draft });
            results.push(r);
          }

          // Bsky
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'spacex', lang, tickers: ['TSLA'] });
            const r = await dispatchPost({ channelId: bskyCh.id, text: truncateWithTags(text, tags, 'bluesky'), imageUrl: ogImage, dryRun, draft });
            results.push(r);
          }

          // Threads
          const threadsCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (threadsCh) {
            const tags = getHashtags({ platform: 'threads', contentType: 'spacex', lang, tickers: ['TSLA'] });
            const r = await dispatchPost({ channelId: threadsCh.id, text: truncateWithTags(text, tags, 'threads'), imageUrl: ogImage, dryRun, draft });
            results.push(r);
          }
        }

        // Pinterest pin
        const pinCh = getFilteredChannels({ tier: 'all', lang: 'en', service: 'pinterest' })[0];
        if (pinCh) {
          let pinImage = '';
          if (!dryRun) {
            for (let att = 0; att < 3 && !pinImage; att++) {
              try {
                const r = await captureTemplate({ template: 'spacex_ipo', format: 'pin', data: { dp: tslaDp, whale: String(tslaWhale), gex: tslaGex, date: dateKey } });
                if (r?.cdnUrl) pinImage = r.cdnUrl;
              } catch {}
              if (!pinImage && att < 2) await new Promise(r => setTimeout(r, 3000));
            }
          }
          const pinSeo = getPinterestSEO({ contentType: 'spacex', date: dateKey, spyChange: tslaChange, gexRegime: tslaGex });
          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: pinImage,
            title: pinSeo.title || `SpaceX IPO 2026: What $TSLA Dark Pool Data Reveals — DP ${tslaDp > 0 ? tslaDp.toFixed(1) + '%' : 'N/A'}, Smart Flow ${tslaWhale}/100`,
            description: `${pinSeo.description}`,
            link: `${baseUrl}/intel-guardian?${buildUtm('pinterest', 'spacex_ipo')}`,
            dryRun, draft,
          });
          results.push(r);
        }

        // Telegram (EN SpaceX)
        if (PLATFORM_ALLOW[action]?.has('telegram')) {
          const tgSpaceXText = [
            spacexHeadline ? `🚀 SpaceX × $TSLA Proxy Update\n📰 ${spacexHeadline}` : `🚀 SpaceX IPO × $TSLA Proxy — Daily Structure Check`,
            '',
            `📊 $TSLA ${changeFmt} ($${Number(tslaPrice).toFixed(2)})`,
            `▸ Dark Pool: ${tslaDp > 0 ? `${tslaDp.toFixed(1)}%` : 'N/A'}`,
            `▸ Smart Flow: ${tslaWhale}/100`,
            `▸ GEX: ${tslaGex.toUpperCase()}`,
            '',
            aiAnalysisMap.en || 'Institutional positioning data updated.',
            '',
            '*Observation only — not financial advice.',
          ].join('\n');
          const tgText = formatForTelegram(tgSpaceXText, { channelLink: `${baseUrl}/intel-guardian?${buildUtm('telegram', 'spacex')}`, contentType: 'spacex' });
          // Capture a fresh OG for Telegram (tweet format)
          let tgOgImage = '';
          if (!dryRun) {
            try {
              const ogR = await captureTemplate({ template: 'spacex_ipo', format: 'tweet', data: { dp: tslaDp, whale: String(tslaWhale), gex: tslaGex, date: dateKey } });
              if (ogR?.cdnUrl) tgOgImage = ogR.cdnUrl;
            } catch {}
          }
          const r = await dispatchTelegram({ text: tgText, imageUrl: tgOgImage, dryRun });
          results.push({ success: r.success, format: 'post', channel: 'telegram', service: 'telegram', lang: 'en', textPreview: 'telegram', postId: String(r.messageId || '') } as DispatchResult);
        }
        break;
      }

      // ========================================
      // MARKET CLOSE ASIA — KST 08:00
      // 7-metric dashboard: S&P500, NASDAQ, DOW, VIX, DP, GEX, FGI
      // market-close OG template + Guardian AI close text
      // Platforms: X, Bluesky, Threads, Pinterest, Telegram
      // ========================================
      case 'market_close_asia': {
        const mkt = await fetchLiveMarketData();
        const sd = mkt.spyChg >= 0 ? '+' : '';
        const nd = mkt.qqqChg >= 0 ? '+' : '';
        const dd = mkt.diaChg >= 0 ? '+' : '';

        for (const lang of langs) {
          const ctaUrl = buildCtaUrl(lang, 'intel-guardian', 'market_close');
          const verdict = mkt.verdicts?.[lang];
          const rawTactical = verdict?.tactical || mkt.tacticalInsight || '';
          // Clean AI text for marketing: strip tags, ETF symbols, IFS scores, noise warnings
          const cleanTactical = cleanForMarketing(rawTactical);
          const fgiRound = Math.round(mkt.fgi);

          // Capture OG image once per lang, reuse across all platforms
          const ogImage = await captureMarketCloseOG(baseUrl, mkt, 'tweet', dryRun);

          // ── X (Tweet) — max 280 weighted chars ──
          // Build complete tweet directly, measure with Twitter weighted count, trim AI to fit
          const xCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (xCh) {
            const xTags = getHashtags({ platform: 'twitter', contentType: 'close', lang, tickers: ['SPY', 'QQQ'] });
            let xBase = '';
            if (lang === 'ko') {
              xBase = `🏁 미국 장마감\n\nS&P ${sd}${mkt.spyChg.toFixed(2)}% | NQ ${nd}${mkt.qqqChg.toFixed(2)}% | DOW ${dd}${mkt.diaChg.toFixed(2)}%\nVIX ${mkt.vix.toFixed(1)} | F&G ${fgiRound}`;
            } else if (lang === 'ja') {
              xBase = `🏁 米国市場クローズ\n\nS&P ${sd}${mkt.spyChg.toFixed(2)}% | NQ ${nd}${mkt.qqqChg.toFixed(2)}% | DOW ${dd}${mkt.diaChg.toFixed(2)}%\nVIX ${mkt.vix.toFixed(1)} | F&G ${fgiRound}`;
            } else {
              xBase = `🏁 US Market Close\n\nS&P ${sd}${mkt.spyChg.toFixed(2)}% | NQ ${nd}${mkt.qqqChg.toFixed(2)}% | DOW ${dd}${mkt.diaChg.toFixed(2)}%\nVIX ${mkt.vix.toFixed(1)} | F&G ${fgiRound}`;
            }
            const xFooter = `\n\n${ctaUrl}\n\n${xTags}`;
            // Measure frame (base + footer) to know AI budget
            const frameWeighted = twitterWeightedLength(xBase + xFooter);
            const aiRoom = 280 - frameWeighted - 4; // -4 for \n\n before AI + safety

            let xFinalText: string;
            if (aiRoom > 40 && cleanTactical.length > 0) {
              // Binary search for max chars that fit, then cut at sentence boundary
              let lo = 0, hi = cleanTactical.length;
              while (lo < hi) {
                const mid = Math.floor((lo + hi + 1) / 2);
                if (twitterWeightedLength(cleanTactical.slice(0, mid)) <= aiRoom) lo = mid;
                else hi = mid - 1;
              }
              // Cut at complete sentence within the allowed slice
              const trimmedAi = truncateToSentence(cleanTactical, lo);
              xFinalText = `${xBase}\n\n${trimmedAi}${xFooter}`;
            } else {
              xFinalText = `${xBase}${xFooter}`;
            }
            // Final safety: if STILL over 280 (shouldn't happen), remove AI
            if (twitterWeightedLength(xFinalText) > 280) {
              xFinalText = `${xBase}${xFooter}`;
            }
            const r = await dispatchTweet({
              channelId: xCh.id,
              text: xFinalText,
              imageUrl: ogImage,
              dryRun, draft,
            });
            results.push(r);
          }




          // ── Bluesky — max 300 chars ──
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const bsText = buildRealtimeText('close', 'bluesky', lang, mkt);
            const bsTags = getHashtags({ platform: 'bluesky', contentType: 'close', lang, tickers: ['SPY', 'QQQ'] });
            const bsOg = await captureMarketCloseOG(baseUrl, mkt, 'og', dryRun);
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(bsText, `\n\n${ctaUrl}\n\n${bsTags}`, 'bluesky'),
              imageUrl: bsOg,
              dryRun, draft,
            });
            results.push(r);
          }

          // ── Threads — max 500 chars ──
          const thCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (thCh) {
            const thText = buildRealtimeText('close', 'threads', lang, mkt);
            const thTags = getHashtags({ platform: 'threads', contentType: 'close', lang, tickers: ['SPY', 'QQQ'] });
            const thOg = await captureMarketCloseOG(baseUrl, mkt, 'og', dryRun);
            const r = await dispatchPost({
              channelId: thCh.id,
              text: truncateWithTags(thText, `\n${thTags}`, 'threads'),
              imageUrl: thOg,
              dryRun, draft,
            });
            results.push(r);
          }

          // ── Pinterest — SEO pin ──
          const pinCh = getFilteredChannels({ tier: 'all', lang, service: 'pinterest' })[0];
          if (pinCh) {
            const pinSeo = getPinterestSEO({ contentType: 'close' });
            const pinTitle = lang === 'ko' ? `미국 장마감 브리핑 | S&P ${sd}${mkt.spyChg.toFixed(2)}%`
              : lang === 'ja' ? `米国市場クローズ | S&P ${sd}${mkt.spyChg.toFixed(2)}%`
              : `US Market Close | S&P ${sd}${mkt.spyChg.toFixed(2)}%`;
            const pinHashtags = getHashtags({ platform: 'pinterest', contentType: 'close', lang });
            const pinDesc = `${pinTitle}\nNASDAQ ${nd}${mkt.qqqChg.toFixed(2)}% | DOW ${dd}${mkt.diaChg.toFixed(2)}%\nVIX: ${mkt.vix.toFixed(1)} | Fear & Greed: ${mkt.fgi}\n\n${pinHashtags}`;
            const pinOg = await captureMarketCloseOG(baseUrl, mkt, 'og', dryRun);
            const r = await dispatchPin({
              channelId: pinCh.id,
              title: pinTitle,
              description: pinDesc,
              link: ctaUrl,
              imageUrl: pinOg,
              dryRun, draft,
            });
            results.push(r);
          }

          // ── Instagram Story — image-only ──
          // Reuse the OG image already captured for X tweet
          const igCh = getFilteredChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh && ogImage) {
            const r = await dispatchStory({
              channelId: igCh.id,
              imageUrl: ogImage,
              dryRun, draft,
            });
            results.push(r);
          }

          // ── Instagram Feed — 1080×1080 single image post (KO/JA only) ──
          // Asia 장마감 시점에 KO/JA IG 피드 싱글 이미지 (EN은 #8 US Close에서 발행)
          if (igCh && (lang === 'ko' || lang === 'ja')) {
            const igFeedImage = await captureMarketCloseIG(baseUrl, mkt, dryRun);
            if (igFeedImage) {
              const igCaption = lang === 'ko'
                ? `🏁 미국 장마감 | ${mkt.date}\n\nS&P 500: ${sd}${mkt.spyChg.toFixed(2)}%\nNASDAQ: ${nd}${mkt.qqqChg.toFixed(2)}%\nDOW: ${dd}${mkt.diaChg.toFixed(2)}%\n\nVIX: ${mkt.vix.toFixed(1)} | 다크풀: ${mkt.dp > 0 ? mkt.dp.toFixed(1) + '%' : 'N/A'}\nGEX: ${mkt.gex.toUpperCase()} | 공포탐욕: ${Math.round(mkt.fgi)}\n\n📊 데이터 분석 참고 자료입니다\n\n#주식 #옵션플로우 #장마감 #SPY #VIX #signumhq`
                : `🏁 米国市場クローズ | ${mkt.date}\n\nS&P 500: ${sd}${mkt.spyChg.toFixed(2)}%\nNASDAQ: ${nd}${mkt.qqqChg.toFixed(2)}%\nDOW: ${dd}${mkt.diaChg.toFixed(2)}%\n\nVIX: ${mkt.vix.toFixed(1)} | DP: ${mkt.dp > 0 ? mkt.dp.toFixed(1) + '%' : 'N/A'}\nGEX: ${mkt.gex.toUpperCase()} | F&G: ${Math.round(mkt.fgi)}\n\n📊 投資助言ではありません\n\n#株式 #オプション #マーケット #SPY #VIX #signumhq`;
              const r = await dispatchCarousel({
                channelId: igCh.id,
                caption: igCaption,
                imageUrls: [igFeedImage],
                dryRun, draft,
              });
              results.push({ ...r, format: 'post' as any });
            }
          }
        }

        // ── Telegram (EN only) ──
        const tgAllowed = PLATFORM_ALLOW[action]?.has('telegram');
        if (tgAllowed) {
          const tgText = formatForTelegram(`🏁 US Market Close\n\nS&P 500: ${sd}${mkt.spyChg.toFixed(2)}%\nNASDAQ: ${nd}${mkt.qqqChg.toFixed(2)}%\nDOW: ${dd}${mkt.diaChg.toFixed(2)}%\n\nVIX: ${mkt.vix.toFixed(1)} | DP: ${mkt.dp > 0 ? mkt.dp.toFixed(1) + '%' : 'N/A'}\nFear & Greed: ${mkt.fgi} (${mkt.fgiLabel})\nGEX: ${mkt.gex.toUpperCase()}\n\n${buildCtaUrl('en', 'intel-guardian', 'market_close')}`);
          let tgOg = '';
          if (!dryRun) {
            try {
              const ogR = await captureMarketCloseOG(baseUrl, mkt, 'tweet', false);
              if (ogR) tgOg = ogR;
            } catch {}
          }
          const r = await dispatchTelegram({ text: tgText, imageUrl: tgOg, dryRun });
          results.push({ success: r.success, format: 'post', channel: 'telegram', service: 'telegram', lang: 'en', textPreview: 'telegram', postId: String(r.messageId || '') } as DispatchResult);
        }
        break;
      }

      // ========================================
      // WEEKLY RECAP — 주말 주간 요약 Thread
      // Saturday 10:00 ET = Sunday 00:00 KST
      // ========================================
      case 'weekly_recap': {
        // Build weekly recap from Redis cached data
        const weeklyKey = `guardian:weekly_recap`;
        const weeklyRaw = await getFromCache(weeklyKey).catch(() => null);

        // Fallback: build from available data if no dedicated weekly recap
        const mktData = await fetchLiveMarketData();
        const rlsiRaw = await getFromCache('rlsi:current').catch(() => null);
        const rlsiVal = typeof rlsiRaw === 'string' ? parseInt(rlsiRaw, 10) : (typeof rlsiRaw === 'number' ? rlsiRaw : 50);

        // Get top movers from spotlight dedup set
        const spotlightHistory = await getFromCache('marketing:spotlight:weekly_tickers').catch(() => null);
        const weekTickers = spotlightHistory ? (typeof spotlightHistory === 'string' ? JSON.parse(spotlightHistory) : spotlightHistory) : [];

        const hookIdx = new Date().getDate() % 3;
        const weekDateRange = (() => {
          const now = new Date();
          const fri = new Date(now); fri.setDate(now.getDate() - (now.getDay() === 0 ? 2 : 1));
          const mon = new Date(fri); mon.setDate(fri.getDate() - 4);
          return `${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${fri.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        })();

        for (const lang of langs) {
          const slides: { text: string; imageUrl?: string }[] = [];

          // Slide 1: Weekly hook
          const weeklyHooks: Record<string, string[]> = {
            en: [
              `📊 Weekly Structural Review — ${weekDateRange}\n\nEvery week, we distill 7 institutional data sources into one clarity report.\nHere's what the structure revealed:`,
              `📊 Week in Review — ${weekDateRange}\n\nPrice tells you what happened.\nStructure tells you why.\nOur weekly institutional analysis:`,
              `📊 Weekly Intelligence — ${weekDateRange}\n\nWhat did smart money do this week?\nOur AI analyzed dark pool, GEX, and flow data across M7:`,
            ],
            ko: [
              `📊 주간 구조 리뷰 — ${weekDateRange}\n\n매주 7개 기관 데이터를 하나의 인사이트로 압축합니다.\n이번 주 구조가 보여준 것:`,
              `📊 주간 리뷰 — ${weekDateRange}\n\n가격은 일어난 일을 말합니다.\n구조는 왜 일어났는지를 말합니다.\n이번 주 기관 분석:`,
              `📊 주간 인텔리전스 — ${weekDateRange}\n\n이번 주 스마트머니는 무엇을 했을까?\nM7 다크풀, GEX, 플로우 AI 분석:`,
            ],
            ja: [
              `📊 週間構造レビュー — ${weekDateRange}\n\n毎週7つの機関データを1つの洞察に凝縮します。\n今週の構造が示したもの:`,
              `📊 週間レビュー — ${weekDateRange}\n\n価格は何が起きたかを語ります。\n構造はなぜ起きたかを語ります。\n今週の機関分析:`,
              `📊 週間インテリジェンス — ${weekDateRange}\n\n今週スマートマネーは何をしたのか？\nM7ダークプール・GEX・フローのAI分析:`,
            ],
          };
          slides.push({ text: (weeklyHooks[lang] || weeklyHooks.en)[hookIdx] });

          // Slide 2: Key metrics summary
          const G = mktData.gex.toUpperCase();
          const riskLabel = rlsiVal >= 70 ? (lang === 'ko' ? '저위험' : lang === 'ja' ? '低リスク' : 'LOW RISK')
            : rlsiVal >= 50 ? (lang === 'ko' ? '보통' : lang === 'ja' ? '通常' : 'MODERATE')
            : (lang === 'ko' ? '주의' : lang === 'ja' ? '注意' : 'ELEVATED');
          const metricsText = lang === 'ko'
            ? `▸ RLSI: ${rlsiVal}/100 — ${riskLabel}\n▸ GEX 레짐: ${G}\n▸ VIX: ${mktData.vix.toFixed(1)}\n▸ 다크풀 DP%: ${mktData.dp.toFixed(1)}%`
            : lang === 'ja'
            ? `▸ RLSI: ${rlsiVal}/100 — ${riskLabel}\n▸ GEXレジーム: ${G}\n▸ VIX: ${mktData.vix.toFixed(1)}\n▸ ダークプール DP%: ${mktData.dp.toFixed(1)}%`
            : `▸ RLSI: ${rlsiVal}/100 — ${riskLabel}\n▸ GEX Regime: ${G}\n▸ VIX: ${mktData.vix.toFixed(1)}\n▸ Dark Pool DP%: ${mktData.dp.toFixed(1)}%`;
          slides.push({ text: metricsText });

          // Slide 3: CTA
          const ctaUrl = buildCtaUrl(lang, 'command', 'weekly_recap');
          const ctaText = lang === 'ko'
            ? `가격만 보면 반쪽입니다.\n구조를 봐야 전체가 보입니다.\n\n📊 실시간 구조 분석 → ${ctaUrl}\n\n*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.`
            : lang === 'ja'
            ? `価格だけでは半分です。\n構造を見れば全体が見えます。\n\n📊 リアルタイム構造分析 → ${ctaUrl}\n\n*投資助言ではありません。データ分析の参考資料です。`
            : `Price is half the story.\nStructure reveals the full picture.\n\n📊 Live structure → ${ctaUrl}\n\nObservation only — not financial advice.`;
          slides.push({ text: ctaText });

          // Capture OG for slide 1
          let ogImage = '';
          if (!dryRun) {
            for (let att = 0; att < 3 && !ogImage; att++) {
              try {
                const r = await captureTemplate({ template: 'briefing', format: 'tweet', data: { spy: mktData.spyChg, vix: mktData.vix, gex: mktData.gex, rlsi: rlsiVal, date: weekDateRange } });
                if (r?.cdnUrl) ogImage = r.cdnUrl;
              } catch (e: any) { console.warn(`[WeeklyRecap] OG attempt ${att + 1}: ${e.message}`); }
              if (!ogImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
          }
          if (ogImage) slides[0].imageUrl = ogImage;

          // X Thread
          const twitterCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'pulse', lang });
            slides[0].text = `${tags}\n\n${slides[0].text}`;
            const r = await dispatchThread({ channelId: twitterCh.id, slides, dryRun, draft });
            results.push(r);
          }

          // Bsky Thread
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'pulse', lang });
            slides[0].text = slides[0].text.includes('#') ? slides[0].text : `${tags}\n\n${slides[0].text}`;
            const r = await dispatchThread({ channelId: bskyCh.id, slides, dryRun, draft });
            results.push(r);
          }
        }

        // Telegram (EN weekly recap)
        if (PLATFORM_ALLOW[action]?.has('telegram')) {
          const tgWeekly = [
            `📊 Weekly Structural Review — ${weekDateRange}`,
            '',
            `▸ GEX Regime: ${mktData.gex.toUpperCase()}`,
            `▸ VIX: ${mktData.vix.toFixed(1)}`,
            `▸ Dark Pool: ${mktData.dp.toFixed(1)}%`,
            `▸ RLSI: ${rlsiVal}/100`,
            '',
            'Structure reveals the full picture.',
            '',
            '*Observation only — not financial advice.',
          ].join('\n');
          const tgText = formatForTelegram(tgWeekly, { channelLink: `${baseUrl}/intel-guardian?${buildUtm('telegram', 'weekly')}`, contentType: 'weekly' });
          const r = await dispatchTelegram({ text: tgText, dryRun });
          results.push({ success: r.success, format: 'post', channel: 'telegram', service: 'telegram', lang: 'en', textPreview: 'telegram', postId: String(r.messageId || '') } as DispatchResult);
        }
        break;
      }

      // ========================================
      // TRENDING SPOTLIGHT — $캐시태그 트렌딩 종목 자동 감지
      // Weekdays: intraday시간대에 추가 발행
      // ========================================
      case 'trending_spotlight': {
        // Fetch all M7 + top tickers and find the biggest mover
        const TRENDING_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ'];
        let bestTicker = '';
        let bestAbsChange = 0;
        let bestData: any = null;

        for (const t of TRENDING_TICKERS) {
          try {
            const raw = await getFromCache(`ticker:${t}`).catch(() => null);
            if (!raw) continue;
            const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const absChg = Math.abs(d?.changePercent ?? d?.changePct ?? 0);
            if (absChg > bestAbsChange) {
              bestAbsChange = absChg;
              bestTicker = t;
              bestData = d;
            }
          } catch { /* skip */ }
        }

        // Only post if there's meaningful movement (> 1.5%)
        if (!bestTicker || bestAbsChange < 1.5 || !bestData) {
          console.log(`[TrendingSpotlight] No significant mover (best: ${bestTicker} ${bestAbsChange.toFixed(2)}%). Skipping.`);
          return NextResponse.json({ success: true, action, results: [], note: 'No trending ticker above threshold' });
        }

        // Check dedup: don't post same ticker twice in a day
        const dedupKey = `marketing:trending:${dateKey}`;
        const alreadyPosted = await getFromCache(dedupKey).catch(() => null);
        const postedSet: string[] = alreadyPosted ? (typeof alreadyPosted === 'string' ? JSON.parse(alreadyPosted) : alreadyPosted) : [];
        if (postedSet.includes(bestTicker)) {
          console.log(`[TrendingSpotlight] ${bestTicker} already posted today. Skipping.`);
          return NextResponse.json({ success: true, action, results: [], note: `${bestTicker} already posted` });
        }

        // Build trending spotlight post (reuse spotlight content pattern)
        const ticker = bestTicker;
        const price = bestData?.price ?? bestData?.last ?? 0;
        const change = bestData?.changePercent ?? bestData?.changePct ?? 0;
        const changeFmt = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        const dp = bestData?.darkPoolPercent ?? bestData?.dp ?? 0;
        const whaleIdx = bestData?.whaleIndex ?? bestData?.smartFlow ?? 50;
        const gex = bestData?.gexRegime ?? bestData?.gex ?? 'neutral';

        for (const lang of langs) {
          const text = lang === 'ko'
            ? `🔥 $${ticker} ${changeFmt} — 오늘 가장 큰 움직임\n\n▸ 다크풀: ${dp}%\n▸ 스마트 플로우: ${whaleIdx}/100\n▸ GEX: ${gex.toUpperCase()}\n\n대부분이 가격만 봅니다. 구조를 보면 다른 이야기가 보입니다.\n\n*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.`
            : lang === 'ja'
            ? `🔥 $${ticker} ${changeFmt} — 本日最大の動き\n\n▸ ダークプール: ${dp}%\n▸ スマートフロー: ${whaleIdx}/100\n▸ GEX: ${gex.toUpperCase()}\n\n価格だけでは半分です。構造を見れば全体が見えます。\n\n*投資助言ではありません。データ分析の参考資料です。`
            : `🔥 $${ticker} ${changeFmt} — Biggest move today\n\n▸ Dark Pool: ${dp}%\n▸ Smart Flow: ${whaleIdx}/100\n▸ GEX: ${gex.toUpperCase()}\n\nEveryone sees the price move. The structure tells a different story.\n\nObservation only — not financial advice.`;

          // Capture OG
          let ogImage = '';
          if (!dryRun) {
            const spotlightParams = { t: ticker, price: String(price), change, dp, whale: String(whaleIdx), gex: gex.toLowerCase(), date: dateKey };
            for (let att = 0; att < 3 && !ogImage; att++) {
              try {
                const r = await captureTemplate({ template: 'ticker', format: 'tweet', data: spotlightParams });
                if (r?.cdnUrl) ogImage = r.cdnUrl;
              } catch (e: any) { console.warn(`[TrendingSpotlight] OG attempt ${att + 1}: ${e.message}`); }
              if (!ogImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
          }

          // X Tweet
          const twitterCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'spotlight', lang, tickers: [ticker] });
            const r = await dispatchTweet({ channelId: twitterCh.id, text: truncateWithTags(text, tags, 'twitter'), imageUrl: ogImage, dryRun, draft });
            results.push(r);
          }

          // Bsky
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'spotlight', lang, tickers: [ticker] });
            const r = await dispatchPost({ channelId: bskyCh.id, text: truncateWithTags(text, tags, 'bluesky'), imageUrl: ogImage, dryRun, draft });
            results.push(r);
          }

          // Threads
          const threadsCh = getFilteredChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (threadsCh) {
            const tags = getHashtags({ platform: 'threads', contentType: 'spotlight', lang, tickers: [ticker] });
            const r = await dispatchPost({ channelId: threadsCh.id, text: truncateWithTags(text, tags, 'threads'), imageUrl: ogImage, dryRun, draft });
            results.push(r);
          }
        }

        // Mark as posted today
        if (!dryRun) {
          postedSet.push(bestTicker);
          await setInCache(dedupKey, JSON.stringify(postedSet), 86400).catch(() => {});
          // Also track for weekly recap
          const weeklyKey = 'marketing:spotlight:weekly_tickers';
          const weeklyRaw = await getFromCache(weeklyKey).catch(() => null);
          const weeklyArr: string[] = weeklyRaw ? (typeof weeklyRaw === 'string' ? JSON.parse(weeklyRaw) : weeklyRaw) : [];
          if (!weeklyArr.includes(bestTicker)) weeklyArr.push(bestTicker);
          await setInCache(weeklyKey, JSON.stringify(weeklyArr), 7 * 86400).catch(() => {});
        }
        break;
      }

      // ========================================
      // BRIEFING THREAD — Guardian AI Morning Briefing → X/Bsky Thread
      // Asia: KST 08:00 / EN: ET 07:00
      // ========================================
      case 'briefing_thread': {
        for (const lang of langs) {
          // Load Guardian briefing from Redis
          const briefingKey = `guardian:morning_briefing:${lang}`;
          const briefingRaw = await getFromCache(briefingKey).catch(() => null);
          if (!briefingRaw) {
            console.warn(`[Dispatch] No briefing found for ${lang}`);
            continue;
          }
          const briefing = typeof briefingRaw === 'string' ? JSON.parse(briefingRaw) : briefingRaw;
          const briefingText = briefing.briefing || briefing.text || '';
          if (!briefingText || briefingText.length < 50) continue;

          // Split into Thread slides (2-3 sentences each)
          const sentences = briefingText.match(/[^.!?]+[.!?]+/g) || [briefingText];
          const slides: ThreadSlide[] = [];
          const ctaUrl = buildCtaUrl(lang, 'guardian', 'briefing');

          // Slide 1: FOMO Hook + first 2 sentences (differentiation-first)
          const hookIdx = new Date().getDay() % 3;
          const hooks: Record<string, string[]> = {
            en: [
              `🌅 Morning Briefing — AI × 7 Data Sources\n\nWhat did institutions position for overnight?\nHere's what our AI found analyzing RLSI, GEX, and dark pool data:\n`,
              `🌅 Morning Briefing\n\nEvery morning, our AI reads 7 institutional data feeds that most retail traders never see.\nToday's structure:\n`,
              `🌅 Morning Briefing\n\nPrice tells you what happened yesterday.\nStructure tells you what's coming.\nHere's today's institutional read:\n`,
            ],
            ko: [
              `🌅 모닝 브리핑 — AI × 7개 데이터 소스\n\n밤새 기관은 어디에 포지셔닝했을까?\nRLSI, GEX, 다크풀을 종합한 AI 분석:\n`,
              `🌅 모닝 브리핑\n\n매일 아침, AI가 일반 투자자가 볼 수 없는 7개 기관 데이터를 분석합니다.\n오늘의 구조:\n`,
              `🌅 모닝 브리핑\n\n가격은 어제를 말합니다.\n구조는 내일을 보여줍니다.\n오늘의 기관 분석:\n`,
            ],
            ja: [
              `🌅 モーニングブリーフィング — AI × 7データソース\n\n一晩で機関はどこにポジションを取ったのか？\nRLSI・GEX・ダークプールのAI分析:\n`,
              `🌅 モーニングブリーフィング\n\n毎朝、AIが個人投資家が見ることのない7つの機関データを分析します。\n本日の構造:\n`,
              `🌅 モーニングブリーフィング\n\n価格は昨日を語ります。\n構造は明日を見せます。\n本日の機関分析:\n`,
            ],
          };
          const slide1Text = `${(hooks[lang] || hooks.en)[hookIdx]}${sentences.slice(0, 2).join(' ').trim()}`;
          slides.push({ text: slide1Text });

          // Slide 2: Middle sentences (news & catalysts)
          if (sentences.length > 2) {
            const midSentences = sentences.slice(2, Math.min(5, sentences.length));
            slides.push({ text: midSentences.join(' ').trim() });
          }

          // Slide 3: Risk assessment + CTA
          if (sentences.length > 5) {
            const endSentences = sentences.slice(5);
            const ctaLine = lang === 'ko' ? '\n\n전체 분석 확인' : lang === 'ja' ? '\n\n詳細分析はこちら' : '\n\nFull analysis';
            slides.push({ text: `${endSentences.join(' ').trim()}${ctaLine}: ${ctaUrl}` });
          } else if (slides.length > 0) {
            // Add CTA to last slide
            slides[slides.length - 1].text += `\n\n${ctaUrl}`;
          }

          // Capture Briefing OG with RLSI chart (aggressive retry + fallback)
          const mktData = await fetchLiveMarketData();
          let ogImage = '';
          if (!dryRun) {
            const rlsiRaw = await getFromCache('rlsi:current').catch(() => null);
            const rlsiHistRaw = await getFromCache('rlsi:history:5d').catch(() => null);
            const rlsiVal = typeof rlsiRaw === 'string' ? parseInt(rlsiRaw, 10) : (typeof rlsiRaw === 'number' ? rlsiRaw : 50);
            const rlsiHist = typeof rlsiHistRaw === 'string' ? rlsiHistRaw : `${rlsiVal-6},${rlsiVal-2},${rlsiVal+1},${rlsiVal-3},${rlsiVal}`;
            const briefingData = {
              spy: mktData.spyChg, vix: mktData.vix, gex: mktData.gex,
              rlsi: rlsiVal, rlsi_hist: rlsiHist,
              date: mktData.date, preview: briefingText.substring(0, 200),
            };
            // 3 attempts with escalating backoff
            for (let att = 0; att < 3 && !ogImage; att++) {
              try {
                const r = await captureTemplate({ template: 'briefing', format: 'tweet', data: briefingData });
                if (r?.cdnUrl) ogImage = r.cdnUrl;
              } catch (e: any) {
                console.warn(`[Dispatch] Briefing OG attempt ${att + 1}/3: ${e.message}`);
              }
              if (!ogImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
            // Fallback: pulse OG (still better than no image)
            if (!ogImage) {
              console.warn('[Dispatch] Briefing OG failed 3x, falling back to pulse OG');
              try {
                const fb = await captureTemplate({ template: 'pulse', format: 'tweet', data: { spy: mktData.spyChg, vix: mktData.vix, gex: mktData.gex, date: mktData.date } });
                if (fb?.cdnUrl) ogImage = fb.cdnUrl;
              } catch {}
            }
          }
          if (ogImage) slides[0].imageUrl = ogImage;

          // X Thread
          const twitterCh = getFilteredChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'briefing', lang });
            // Add $cashtags to first slide
            slides[0].text = `${tags}\n\n${slides[0].text}`;
            const r = await dispatchThread({
              channelId: twitterCh.id,
              slides,
              dryRun, draft,
            });
            results.push(r);
          }

          // Bluesky Thread
          const bskyCh = getFilteredChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'briefing', lang });
            const bskySlides = slides.map((s, i) => ({
              ...s,
              text: i === 0 ? `${tags}\n\n${s.text}` : s.text,
            }));
            const r = await dispatchThread({
              channelId: bskyCh.id,
              slides: bskySlides,
              dryRun, draft,
            });
            results.push(r);
          }
        }
        break;
      }

      // ========================================
      // [REMOVED] SPOTLIGHT v2 — Dead Code (2026-05-13)
      // Reason: Duplicate case 'spotlight' — JS executes first match only (Line 732).
      //         This v2 read from stockData:${ticker} Redis key which has 0 writers,
      //         so data was always null/N/A. Active v1 uses fetchTradeData() live API.
      //         v2 had better text (hook rotation) — merge into v1's contentEngines later.
      // ========================================
      /* DEAD CODE REMOVED — case 'spotlight' already handled at Line 732 */
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Log dispatch results
    const logKey = `marketing:dispatch:v2:${dateKey}:${action}`;
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const dispatchLog = {
      timestamp: new Date().toISOString(),
      dryRun,

      draft,
      action,
      totalChannels: results.length,
      successful: successCount,
      failed: failCount,
      results,
    };
    await setInCache(logKey, JSON.stringify(dispatchLog), 86400 * 7);

    // ── AUTO-RETRY: If ALL dispatches failed, retry inline after 30s delay ──
    // Vercel Serverless doesn't support setTimeout after response, so retry inline.
    const retryCount = parseInt(searchParams.get('_retry') || '0', 10);
    if (results.length > 0 && successCount === 0 && !dryRun && retryCount < 2) {
      const retryKey = `marketing:retry:${dateKey}:${action}:${retryCount + 1}`;
      const alreadyRetried = await getFromCache(retryKey).catch(() => null);
      if (!alreadyRetried) {
        await setInCache(retryKey, 'scheduled', 3600); // 1hr dedup
        console.log(`[Cron/MarketingDispatch] ⚠️ ALL ${failCount} dispatches failed for "${action}". Inline retry #${retryCount + 1} in 30s...`);
        await new Promise(r => setTimeout(r, 30000)); // 30s backoff (EC2 warm-up)
        const retryUrl = new URL(request.url);
        retryUrl.searchParams.set('_retry', String(retryCount + 1));
        try {
          const retryRes = await fetch(retryUrl.toString(), {
            headers: authHeader ? { authorization: authHeader } : {},
            signal: AbortSignal.timeout(90000),
          });
          const retryData = await retryRes.json().catch(() => null);
          console.log(`[Cron/MarketingDispatch] 🔄 Retry #${retryCount + 1} result:`, retryData?.summary || 'unknown');
          return NextResponse.json({
            success: true,
            action,
            retryCount: retryCount + 1,
            originalFailure: { totalDispatched: results.length, failed: failCount },
            retryResult: retryData,
          });
        } catch (retryErr: any) {
          console.error(`[Cron/MarketingDispatch] Retry #${retryCount + 1} failed: ${retryErr.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dryRun,

      draft,
      action,
      retryCount,
      summary: {
        totalDispatched: results.length,
        successful: successCount,
        failed: failCount,
        autoRetryScheduled: false,
      },
      results,
    });
  } catch (err: any) {
    console.error('[Cron/MarketingDispatch] Error:', err);

    // ── AUTO-RETRY on uncaught error ──
    const retryCount = parseInt(searchParams.get('_retry') || '0', 10);
    if (!dryRun && retryCount < 2) {
      const retryKey = `marketing:retry:error:${dateKey}:${action}:${retryCount + 1}`;
      const alreadyRetried = await getFromCache(retryKey).catch(() => null);
      if (!alreadyRetried) {
        await setInCache(retryKey, 'scheduled', 3600).catch(() => {});
        console.log(`[Cron/MarketingDispatch] ⚠️ Uncaught error for "${action}". Inline retry #${retryCount + 1} in 30s...`);
        await new Promise(r => setTimeout(r, 30000));
        const retryUrl = new URL(request.url);
        retryUrl.searchParams.set('_retry', String(retryCount + 1));
        try {
          const retryRes = await fetch(retryUrl.toString(), {
            headers: request.headers.get('authorization') ? { authorization: request.headers.get('authorization')! } : {},
            signal: AbortSignal.timeout(90000),
          });
          const retryData = await retryRes.json().catch(() => null);
          return NextResponse.json({
            success: retryData?.success || false,
            action,
            retryCount: retryCount + 1,
            originalError: err.message,
            retryResult: retryData,
          });
        } catch {}
      }
    }

    return NextResponse.json({ success: false, error: err.message, retryExhausted: retryCount >= 2 }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadContent(type: string, dateKey: string): Promise<ContentOutput | null> {
  const key = `marketing:${type}:${dateKey}`;
  const cached = await getFromCache(key).catch(() => null);
  if (!cached) return null;
  const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
  return parsed as ContentOutput;
}

// Previous trading day: Mon?�Fri, Tue-Fri?�prev day, Sat/Sun?�Fri
function getPreviousTradingDayKey(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun,1=Mon,...
  const daysBack = day === 1 ? 3 : day === 0 ? 2 : 1; // Mon??(Fri), Sun??(Fri)
  et.setDate(et.getDate() - daysBack);
  return et.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function noContent(type: string, dateKey: string) {
  return NextResponse.json({
    success: false,
    error: `No content at marketing:${type}:${dateKey}. Run /api/cron/daily-content first.`,
  }, { status: 404 });
}

function buildCtaUrl(lang: Lang, page: string, campaign: string): string {
  // www.signumhq.com auto-redirects to correct locale via middleware
  return `https://www.signumhq.com/intel-guardian`;
}

/**
 * Clean AI text for marketing — strip institutional details not suitable for social media.
 * Removes: bracket tags, ETF symbols, IFS scores, noise warnings, sector tickers.
 */
function cleanForMarketing(text: string): string {
  let t = text;
  // 1. Strip bracket tags [현황] [해석] [Status] etc.
  t = t.replace(/\[[^\]]+\]\s*/g, '');
  // 2. Strip parenthetical IFS scores: (반도체 IFS +50, 기술 IFS +36)
  t = t.replace(/\([^)]*IFS\s*[+-]?\d+[^)]*\)/g, '');
  // 3. Strip parenthetical ETF symbols: (SMH, XLK), (XLC, XLY 등), (XLE, AI_PWR 등)
  t = t.replace(/\([^)]*\b(?:SMH|XLK|XLC|XLY|XLE|XLF|XLV|XLI|XLB|XLP|XLU|XLRE|IWM|AI_PWR)\b[^)]*\)/g, '');
  // 4. Strip standalone IFS references: IFS +50, IFS -20
  t = t.replace(/\bIFS\s*[+-]?\d+/g, '');
  // 5. Strip standalone ETF/sector codes: "AI_PWR는 당일 -1." → remove entire phrase
  t = t.replace(/\b(?:AI_PWR|SMH|XLK|XLC|XLY|XLE|XLF|XLV|XLI|XLB|XLP|XLU|XLRE|IWM)[^\n.。]*[.。]?/g, '');
  // 6. Strip noise warning phrases (ko/ja/en)
  t = t.replace(/,?\s*노이즈\s*경고[^.。]*[.。]?/g, '.');
  t = t.replace(/,?\s*ノイズ警告[^.。]*[.。]?/g, '.');
  t = t.replace(/,?\s*noise\s*warning[^.]*\.?/gi, '.');
  // 7. Strip stealth signal phrases: (스텔스 매집 신호: ...)
  t = t.replace(/\([^)]*스텔스[^)]*\)/g, '');
  t = t.replace(/\([^)]*ステルス[^)]*\)/g, '');
  t = t.replace(/\([^)]*stealth[^)]*\)/gi, '');
  // 8. Strip "다만" / "ただし" and everything after (greedy — avoids decimal point confusion)
  t = t.replace(/\s*다만\s+.*$/gm, '');
  t = t.replace(/\s*ただし\s+.*$/gm, '');
  t = t.replace(/\s*However,?\s+.*$/gim, '');
  // 9. Clean up artifacts: double spaces, orphaned commas/periods, whitespace before punctuation
  t = t.replace(/,\s*,/g, ',');
  t = t.replace(/\.\s*\./g, '.');
  t = t.replace(/,\s*\./g, '.');
  t = t.replace(/\s{2,}/g, ' ');
  t = t.replace(/\s+([,.。])/g, '$1');
  return t.trim();
}

/**
 * Truncate text to a complete sentence within maxLen.
 * Never cuts mid-sentence — finds the last sentence boundary (. 。) before maxLen.
 */
function truncateToSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // Find last sentence-ending punctuation before maxLen
  const sub = text.slice(0, maxLen);
  const lastPeriod = Math.max(sub.lastIndexOf('.'), sub.lastIndexOf('。'), sub.lastIndexOf('다.'));
  if (lastPeriod > maxLen * 0.4) {
    return text.slice(0, lastPeriod + 1);
  }
  // Fallback: cut at last space
  const lastSpace = sub.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.4) {
    return text.slice(0, lastSpace) + '...';
  }
  return sub + '...';
}

/**
 * Twitter-weighted character length.
 * Twitter counts: URLs as 23 chars, CJK/emoji as ~2 chars each.
 */
function twitterWeightedLength(text: string): number {
  // Replace URLs with 23-char placeholder
  let t = text.replace(/https?:\/\/[^\s]+/g, 'x'.repeat(23));
  let count = 0;
  for (const ch of t) {
    const code = ch.codePointAt(0) || 0;
    // CJK Unified Ideographs, Katakana, Hiragana, Korean = 2 chars
    if ((code >= 0x1100 && code <= 0x11FF) ||  // Hangul Jamo
        (code >= 0x2E80 && code <= 0x9FFF) ||  // CJK
        (code >= 0xAC00 && code <= 0xD7AF) ||  // Hangul Syllables
        (code >= 0xF900 && code <= 0xFAFF) ||  // CJK Compat
        (code >= 0xFF00 && code <= 0xFFEF) ||  // Fullwidth
        (code >= 0x3000 && code <= 0x30FF) ||  // CJK Symbols, Katakana
        (code >= 0x31F0 && code <= 0x31FF) ||  // Katakana ext
        (code >= 0x10000))                     // Emoji & supplementary
    {
      count += 2;
    } else {
      count += 1;
    }
  }
  return count;
}

/**
 * Truncate body text while preserving tags/footer.
 * Uses Twitter-weighted counting for Twitter, plain length for others.
 */
function truncateWithTags(body: string, tagsOrFooter: string, service: string): string {
  const LIMITS: Record<string, number> = { twitter: 280, threads: 500, instagram: 2200, bluesky: 300, pinterest: 500 };
  const limit = LIMITS[service] || 280;
  const separator = '\n\n';
  const lenFn = service === 'twitter' ? twitterWeightedLength : (s: string) => s.length;
  const footerLen = lenFn(separator) + lenFn(tagsOrFooter);
  const maxBody = limit - footerLen;
  if (maxBody < 20) {
    return tagsOrFooter.substring(0, limit);
  }
  // Iteratively trim body to fit within weighted limit
  let trimmedBody = body;
  if (lenFn(body) > maxBody) {
    // Binary search for the right slice point
    let lo = 0, hi = body.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (lenFn(body.substring(0, mid)) <= maxBody - 3) lo = mid;
      else hi = mid - 1;
    }
    // Cut at sentence boundary for cleaner truncation
    const rawSlice = body.substring(0, lo);
    const lastSentEnd = Math.max(
      rawSlice.lastIndexOf('. '),
      rawSlice.lastIndexOf('。'),
      rawSlice.lastIndexOf('다. '),
      rawSlice.lastIndexOf('다.\n'),
    );
    if (lastSentEnd > lo * 0.4) {
      // Cut at the end of a complete sentence
      trimmedBody = rawSlice.substring(0, lastSentEnd + 1).trimEnd();
    } else {
      trimmedBody = rawSlice + '...';
    }
  }
  const result = `${trimmedBody}${separator}${tagsOrFooter}`;
  // Safety net
  if (lenFn(result) > limit) {
    let lo = 0, hi = result.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (lenFn(result.substring(0, mid)) <= limit - 3) lo = mid;
      else hi = mid - 1;
    }
    return result.substring(0, lo) + '...';
  }
  return result;
}

/**
 * Extract data params from content's imageUrl for EC2 capture.
 */
function extractDataParams(content: ContentOutput, lang: Lang, baseUrl: string): Record<string, string | number> {
  const existingUrl = content[lang]?.imageUrl || '';
  const params = new URL(existingUrl, baseUrl).searchParams;
  const data: Record<string, string | number> = {};
  params.forEach((v, k) => { data[k] = v; });
  return data;
}

/**
 * Capture image via EC2 Puppeteer ??Supabase CDN.
 * Uses /templates/og/* HTML templates exclusively.
 * NO Satori fallback ??EC2 Puppeteer is the ONLY image source.
 */
async function captureImageForDispatch(
  baseUrl: string,
  content: ContentOutput,
  lang: Lang,
  format: FormatType,
  template: TemplateType,
  dryRun: boolean,
): Promise<string> {
  const data = extractDataParams(content, lang, baseUrl);

  // dry_run: return template preview URL (Buffer won't fetch it)
  if (dryRun) {
    const previewUrl = new URL(`${baseUrl}/templates/og/${template}`);
    Object.entries(data).forEach(([k, v]) => previewUrl.searchParams.set(k, String(v)));
    previewUrl.searchParams.set('format', format);
    previewUrl.searchParams.set('lang', lang);
    return previewUrl.toString();
  }

  // LIVE: EC2 Puppeteer capture — aggressive retry (4 attempts + emergency)
  const BACKOFF = [2000, 5000, 10000]; // 2s, 5s, 10s between attempts
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await captureTemplate({ template, format, data });
      if (result?.cdnUrl) {
        console.log(`[Dispatch] EC2 capture OK: ${template}/${format}/${lang} ${result.sizeKB}KB (attempt ${attempt + 1})`);
        return result.cdnUrl;
      }
      console.warn(`[Dispatch] EC2 returned null for ${template}/${format}/${lang} (attempt ${attempt + 1})`);
    } catch (err: any) {
      console.warn(`[Dispatch] EC2 capture attempt ${attempt + 1}/4 failed: ${err.message}`);
    }
    if (attempt < 3) {
      const wait = BACKOFF[attempt] || 10000;
      console.log(`[Dispatch] Retrying in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  // Emergency: final attempt after 15s cooldown
  console.warn(`[Dispatch] Emergency retry for ${template}/${format}/${lang} after 15s...`);
  await new Promise(r => setTimeout(r, 15000));
  try {
    const result = await captureTemplate({ template, format, data });
    if (result?.cdnUrl) {
      console.log(`[Dispatch] Emergency capture OK: ${template}/${format}/${lang} ${result.sizeKB}KB`);
      return result.cdnUrl;
    }
  } catch (e: any) {
    console.error(`[Dispatch] Emergency capture also failed: ${e.message}`);
  }

  // Absolute last resort: text-only (5 attempts failed over ~32s)
  console.error(`[Dispatch] ALL 5 capture attempts failed for ${template}/${format}/${lang} - text-only fallback`);
  return '';
}

/**
 * Capture carousel slides via EC2 Puppeteer ??Supabase CDN.
 * NO Satori fallback.
 */
async function captureCarouselForDispatch(
  baseUrl: string,
  content: ContentOutput,
  lang: Lang,
  dryRun: boolean,
): Promise<string[]> {
  const data = extractDataParams(content, lang, baseUrl);

  if (dryRun) {
    return [1, 2, 3, 4, 5, 6].map(slide => {
      const url = new URL(`${baseUrl}/templates/og/carousel`);
      Object.entries(data).forEach(([k, v]) => url.searchParams.set(k, String(v)));
      url.searchParams.set('slide', String(slide));
      url.searchParams.set('format', 'carousel');
      url.searchParams.set('lang', lang);
      return url.toString();
    });
  }

  // LIVE: EC2 capture each slide (resilient ??skip failures, retry once)
  const urls: string[] = [];
  for (let slide = 1; slide <= 6; slide++) {
    let result = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await captureTemplate({
          template: 'carousel',
          format: 'carousel',
          data: { ...data, slide },
        });
        if (result?.cdnUrl) break;
      } catch (err: any) {
        console.warn(`[Dispatch] Carousel slide ${slide} attempt ${attempt + 1} failed: ${err.message}`);
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 500));
    }
    if (result?.cdnUrl) {
      urls.push(result.cdnUrl);
    } else {
      console.warn(`[Dispatch] Carousel slide ${slide} skipped after 2 attempts`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  if (urls.length === 0) {
    throw new Error(`[Dispatch] EC2 carousel capture failed ??all 6 slides failed`);
  }
  if (urls.length < 6) {
    console.warn(`[Dispatch] Carousel partial: ${urls.length}/6 slides captured`);
  }
  return urls;
}


function buildEducationThread(
  lc: ContentOutput['en'],
  lang: Lang,
  ctaUrl: string,
  ogImageUrl: string,
): ThreadSlide[] {
  const text = lc.platformText?.twitter || lc.text;

  // Split into ~4 thread slides
  const sentences = text.split(/[.!?。！？]\s+/).filter(s => s.trim());
  const chunkSize = Math.ceil(sentences.length / 3);

  const slide1Text = sentences.slice(0, chunkSize).join('. ') + '.';
  const slide2Text = sentences.slice(chunkSize, chunkSize * 2).join('. ') + '.';
  const slide3Text = sentences.slice(chunkSize * 2).join('. ') + '.';
  const slide4Text = `${ctaUrl}\n\n?�� RT if this changed how you think about market structure.`;

  return [
    { text: `?�� ${truncateForPlatform(slide1Text, 'twitter')}`, imageUrl: ogImageUrl },
    { text: truncateForPlatform(slide2Text, 'twitter') },
    { text: truncateForPlatform(slide3Text, 'twitter') },
    { text: truncateForPlatform(slide4Text, 'twitter'), imageUrl: ogImageUrl },
  ];
}

/**
 * Capture IG Story image (1080×1920) via dedicated story template.
 * Extracts spy/vix/gex/dp from content's imageUrl params and feeds to captureStoryImage.
 */
async function captureStoryForDispatch(
  baseUrl: string,
  content: ContentOutput,
  lang: Lang,
  dryRun: boolean,
): Promise<string | null> {
  const data = extractDataParams(content, lang, baseUrl);

  // Build story-specific params from existing content data
  const storyParams = {
    spy: data.spy || '0',
    vix: data.vix || '18',
    gex: String(data.gex || 'neutral'),
    dp: data.dp || '0',
    date: data.date as string | undefined,
    insight: data.insight as string | undefined,
  };

  if (dryRun) {
    const previewUrl = new URL(`${baseUrl}/marketing/templates/story`);
    Object.entries(storyParams).forEach(([k, v]) => {
      if (v != null) previewUrl.searchParams.set(k, String(v));
    });
    return previewUrl.toString();
  }

  try {
    const cdnUrl = await captureStoryImage(storyParams);
    if (cdnUrl) {
      console.log(`[Dispatch] ??IG Story captured: ${lang}`);
      return cdnUrl;
    }
    console.warn(`[Dispatch] IG Story capture returned null for ${lang}`);
    return null;
  } catch (err: any) {
    console.error(`[Dispatch] IG Story capture failed: ${err.message}`);
    return null;
  }
}

