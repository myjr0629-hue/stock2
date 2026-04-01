// ============================================================================
// /api/cron/render-video — Remotion 영상 렌더링 오케스트레이터
// Redis 데이터 → TTS → Remotion Lambda → S3 → (나중) YouTube/TikTok
// Build-only: DRY_RUN 기본값, Lambda 미배포, cron 미등록
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import {
  generateNarrationScript,
  synthesizeSpeech,
  selectBgm,
} from '@/lib/marketing/pollyClient';

// ---------------------------------------------------------------------------
// GET Handler
// ?secret=xxx — CRON_SECRET 인증
// ?dry_run=true|false (default: true)
// ?type=pulse|news|event|all (default: pulse)
// ?lang=en|ko|ja|all (default: en)
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  // [Security] CRON_SECRET 검증
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
  const videoType = (searchParams.get('type') || 'pulse') as 'pulse' | 'news' | 'event' | 'all';
  const langParam = (searchParams.get('lang') || 'en') as 'en' | 'ko' | 'ja' | 'all';

  try {
    const dateKey = new Date().toISOString().split('T')[0];
    const langs: ('en' | 'ko' | 'ja')[] = langParam === 'all' ? ['en', 'ko', 'ja'] : [langParam as any];
    const types: ('pulse' | 'news' | 'event')[] = videoType === 'all' ? ['pulse', 'news'] : [videoType as any];

    const results: Record<string, any> = {};

    for (const type of types) {
      for (const lang of langs) {
        const key = `${type}_${lang}`;

        // 1. Fetch market data from Redis
        const marketData = await fetchVideoData(type);

        // 2. Generate TTS narration script
        const narrationScript = generateNarrationScript({ type, lang, data: marketData });

        // 3. Synthesize speech (or DRY_RUN)
        const ttsResult = await synthesizeSpeech({
          text: narrationScript,
          lang,
          dryRun,
        });

        // 4. Select BGM based on market mood
        const bgm = selectBgm({
          gexRegime: marketData.gexRegime || 'neutral',
          videoType: type,
          vix: marketData.vix,
        });

        // 5. Build Remotion render props
        const renderProps = buildRenderProps(type, lang, marketData, ttsResult.audioUrl, bgm.s3Key);

        // 6. Trigger Remotion Lambda render (or DRY_RUN)
        let renderResult: any;
        if (dryRun) {
          console.log(`[RenderVideo] DRY_RUN: Would render ${type}/${lang}`);
          renderResult = {
            dryRun: true,
            compositionId: getCompositionId(type),
            props: renderProps,
            bgm: { name: bgm.name, category: bgm.category, source: bgm.source },
            narrationScript: narrationScript.substring(0, 100) + '...',
          };
        } else {
          // Real render: Generate HTML snapshot frames → upload to S3
          // Uses server-side rendering approach (no Remotion dependency)
          try {
            const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
            const region = process.env.AWS_REGION || 'us-east-1';
            const bucket = process.env.S3_MARKETING_BUCKET || 'signum-marketing';
            const credentials = {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            };

            // Generate video metadata + HTML template
            const htmlContent = generateVideoHTML(type, lang, marketData, ttsResult.audioUrl, bgm);
            const s3Key = `videos/${type}/${lang}/${dateKey}/${Date.now()}.html`;

            const s3 = new S3Client({ region, credentials });
            await s3.send(new PutObjectCommand({
              Bucket: bucket,
              Key: s3Key,
              Body: htmlContent,
              ContentType: 'text/html',
              ACL: 'public-read',
            }));

            // Also save render manifest for EC2 FFmpeg worker
            const manifestKey = `videos/manifest/${dateKey}-${type}-${lang}.json`;
            const manifest = {
              type, lang, dateKey,
              htmlUrl: `https://${bucket}.s3.amazonaws.com/${s3Key}`,
              ttsUrl: ttsResult.audioUrl,
              bgmS3Key: bgm.s3Key,
              props: renderProps,
              status: 'pending_render',
              createdAt: new Date().toISOString(),
            };
            await s3.send(new PutObjectCommand({
              Bucket: bucket,
              Key: manifestKey,
              Body: JSON.stringify(manifest, null, 2),
              ContentType: 'application/json',
            }));

            renderResult = {
              status: 'manifest_uploaded',
              htmlUrl: `https://${bucket}.s3.amazonaws.com/${s3Key}`,
              manifestUrl: `https://${bucket}.s3.amazonaws.com/${manifestKey}`,
              ttsUrl: ttsResult.audioUrl,
              bgm: { name: bgm.name, category: bgm.category },
              narrationPreview: narrationScript.substring(0, 100) + '...',
            };
          } catch (renderErr: any) {
            console.error(`[RenderVideo] Render error: ${renderErr.message}`);
            renderResult = { status: 'error', message: renderErr.message };
          }
        }

        results[key] = renderResult;
      }
    }

    // Log to Redis
    const logKey = `marketing:video:${dateKey}`;
    await setInCache(logKey, JSON.stringify({
      timestamp: new Date().toISOString(),
      dryRun,
      types,
      langs,
      results,
    }), 86400 * 7);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dryRun,
      videoType,
      lang: langParam,
      summary: {
        totalVideos: Object.keys(results).length,
        types,
        langs,
      },
      results,
    });
  } catch (err: any) {
    console.error('[Cron/RenderVideo] Error:', err);
    return NextResponse.json({
      success: false,
      error: err.message,
    }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCompositionId(type: string): string {
  switch (type) {
    case 'pulse': return 'MarketPulse';
    case 'news':  return 'NewsDigest';
    case 'event': return 'EventSpike';
    default:      return 'MarketPulse';
  }
}

function buildRenderProps(
  type: string,
  lang: string,
  data: any,
  narrationUrl: string,
  bgmS3Key: string
): Record<string, any> {
  const s3Base = process.env.S3_MARKETING_BUCKET_URL || 'https://signum-marketing.s3.amazonaws.com';

  const common = {
    lang,
    narrationUrl,
    bgmUrl: `${s3Base}/${bgmS3Key}`,
  };

  switch (type) {
    case 'pulse':
      return {
        ...common,
        spy: data.spy || 0,
        qqq: data.qqq || 0,
        vix: data.vix || 18,
        gexRegime: data.gexRegime || 'neutral',
        darkPool: data.darkPool,
        callWall: data.callWall,
        putFloor: data.putFloor,
      };

    case 'news':
      return {
        ...common,
        headlines: data.headlines || [],
        spy: data.spy || 0,
        vix: data.vix || 18,
      };

    case 'event':
      return {
        ...common,
        ticker: data.ticker || 'SPY',
        eventType: data.eventType || 'whale',
        details: data.details || '',
        premium: data.premium,
        spy: data.spy || 0,
        gexRegime: data.gexRegime || 'neutral',
      };

    default:
      return common;
  }
}

async function fetchVideoData(type: string): Promise<any> {
  try {
    // Reuse data from daily-content cron
    const pulseCache = await getFromCache('marketing:pulse:' + new Date().toISOString().split('T')[0]);
    if (pulseCache) {
      const parsed = typeof pulseCache === 'string' ? JSON.parse(pulseCache) : pulseCache;
      // Extract raw data from content if available
      return parsed._rawData || parsed;
    }

    // Fallback: read raw market data from Redis
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
      gexRegime: typeof gexRaw === 'string' ? gexRaw : (gexRaw?.regime || 'neutral'),
    };
  } catch {
    return { spy: 0, qqq: 0, vix: 18, gexRegime: 'neutral' };
  }
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

// ---------------------------------------------------------------------------
// Video HTML Template Generator — 9:16 Shorts format (1080×1920)
// Creates self-contained animated HTML for Puppeteer/FFmpeg capture
// ---------------------------------------------------------------------------
function generateVideoHTML(
  type: string,
  lang: string,
  data: any,
  ttsUrl: string,
  bgm: any
): string {
  const spy = data.spy || 0;
  const qqq = data.qqq || 0;
  const vix = data.vix || 18;
  const gexRegime = data.gexRegime || 'neutral';
  const isPositive = spy >= 0;

  const titles: Record<string, Record<string, string>> = {
    pulse: { en: 'MARKET PULSE', ko: '마켓 펄스', ja: 'マーケットパルス' },
    news:  { en: 'NEWS DIGEST', ko: '뉴스 다이제스트', ja: 'ニュースダイジェスト' },
    event: { en: 'EVENT ALERT', ko: '이벤트 알림', ja: 'イベントアラート' },
  };

  const labels: Record<string, Record<string, string[]>> = {
    en: { idx: ['S&P 500', 'NASDAQ'], vix: ['VIX'], gex: ['GEX Regime'] },
    ko: { idx: ['S&P 500', '나스닥'], vix: ['VIX'], gex: ['GEX 레짐'] },
    ja: { idx: ['S&P 500', 'ナスダック'], vix: ['VIX'], gex: ['GEXレジーム'] },
  };

  const l = labels[lang] || labels.en;
  const title = titles[type]?.[lang] || titles.pulse.en;

  const bgGrad = isPositive 
    ? 'linear-gradient(135deg, #0a1628 0%, #0d2847 30%, #0f3460 100%)'
    : 'linear-gradient(135deg, #1a0a0a 0%, #2d0c0c 30%, #3d1010 100%)';
  const accent = isPositive ? '#00d4aa' : '#ff4757';
  const arrow = isPositive ? '▲' : '▼';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1080px; height:1920px; background:${bgGrad}; font-family:'Inter','Noto Sans KR','Noto Sans JP',sans-serif; color:#fff; overflow:hidden; }
  .container { padding:80px 60px; height:100%; display:flex; flex-direction:column; justify-content:space-between; }
  .logo { font-size:28px; letter-spacing:8px; color:rgba(255,255,255,0.5); text-transform:uppercase; }
  .title { font-size:72px; font-weight:800; margin:40px 0; letter-spacing:-1px; }
  .title span { color:${accent}; }
  .card { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:24px; padding:48px; margin:20px 0; backdrop-filter:blur(10px); }
  .card-label { font-size:24px; color:rgba(255,255,255,0.5); letter-spacing:2px; text-transform:uppercase; margin-bottom:12px; }
  .card-value { font-size:64px; font-weight:700; }
  .card-change { font-size:36px; color:${accent}; margin-top:8px; }
  .row { display:flex; gap:24px; }
  .row .card { flex:1; }
  .gex-badge { display:inline-block; background:${accent}; color:#000; padding:12px 32px; border-radius:50px; font-size:28px; font-weight:700; text-transform:uppercase; letter-spacing:3px; }
  .vix-value { color:${vix > 25 ? '#ff4757' : vix > 20 ? '#ffa502' : '#00d4aa'}; }
  .footer { text-align:center; }
  .footer .brand { font-size:36px; font-weight:700; letter-spacing:4px; }
  .footer .sub { font-size:22px; color:rgba(255,255,255,0.4); margin-top:8px; }
  .pulse { animation:pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
  .slide-in { animation:slideIn 0.8s ease-out forwards; opacity:0; }
  @keyframes slideIn { to{opacity:1;transform:translateY(0)} from{opacity:0;transform:translateY(30px)} }
</style>
</head>
<body>
<div class="container">
  <div>
    <div class="logo">SIGNUM HQ</div>
    <div class="title slide-in">${title} <span>${arrow}</span></div>
  </div>
  <div>
    <div class="row">
      <div class="card slide-in" style="animation-delay:0.2s">
        <div class="card-label">${l.idx[0]}</div>
        <div class="card-value">${Math.abs(spy).toFixed(2)}%</div>
        <div class="card-change">${arrow} ${isPositive ? 'UP' : 'DOWN'}</div>
      </div>
      <div class="card slide-in" style="animation-delay:0.4s">
        <div class="card-label">${l.idx[1]}</div>
        <div class="card-value">${Math.abs(qqq).toFixed(2)}%</div>
        <div class="card-change">${arrow}</div>
      </div>
    </div>
    <div class="card slide-in" style="animation-delay:0.6s">
      <div class="card-label">${l.vix[0]}</div>
      <div class="card-value vix-value">${vix.toFixed(1)}</div>
    </div>
    <div class="card slide-in" style="animation-delay:0.8s;text-align:center;">
      <div class="card-label">${l.gex[0]}</div>
      <div style="margin-top:16px;"><span class="gex-badge pulse">${gexRegime.toUpperCase()}</span></div>
    </div>
  </div>
  <div class="footer slide-in" style="animation-delay:1s">
    <div class="brand">SIGNUM HQ</div>
    <div class="sub">signumhq.com</div>
  </div>
</div>
</body>
</html>`;
}
