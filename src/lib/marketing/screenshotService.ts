// ============================================================================
// Screenshot Service — Marketing Template → PNG → Supabase CDN
// HTML 마케팅 템플릿 페이지를 캡처하여 Supabase Storage에 업로드
// Buffer 503 타임아웃 해결 (정적 CDN URL 제공)
//
// 이 서비스 하나가 완성되면 전체 이미지 파이프라인이 작동함:
//   event-detect → screenshotService → Supabase → marketing-dispatch → Buffer → SNS
// ============================================================================

import { createClient } from '@supabase/supabase-js';

// ── Formats ──
const FORMATS: Record<string, { width: number; height: number }> = {
  tweet:    { width: 1200, height: 675 },
  og:       { width: 1200, height: 675 },
  story:    { width: 1080, height: 1920 },
  carousel: { width: 1080, height: 1080 },
  pin:      { width: 1000, height: 1500 },
  square:   { width: 1080, height: 1080 },
};

const BUCKET_NAME = 'marketing-assets';
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://signumhq.com';

// ── Types ──
export type TemplateType = 'pulse' | 'event' | 'ticker' | 'morning' | 'education' | 'carousel' | 'story' | 'story_spotlight' | 'story_event' | 'story_education' | 'education_pin' | 'spacex_ipo' | 'market-close' | 'market-close-ig' | 'education-carousel';
export type FormatType = keyof typeof FORMATS;

export interface CaptureRequest {
  template: TemplateType;
  format: FormatType;
  data: Record<string, string | number>;
  /** Override base URL (e.g., localhost for testing) */
  baseUrl?: string;
}

export interface CaptureResult {
  cdnUrl: string;
  storagePath: string;
  sizeKB: number;
  format: FormatType;
  template: TemplateType;
}

// ── Supabase Client ──
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('[ScreenshotService] Missing Supabase credentials');
  return createClient(url, key);
}

async function ensureBucket(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET_NAME);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      fileSizeLimit: 5 * 1024 * 1024,
    });
    if (error && !error.message?.includes('already exists')) {
      throw new Error(`[ScreenshotService] Bucket creation failed: ${error.message}`);
    }
  }
}

// ── Template URL Builder ──
// Maps template types to the new /templates/og/ pages for EC2 Puppeteer capture
const TEMPLATE_ROUTES: Record<string, string> = {
  pulse:     '/templates/og/pulse',
  ticker:    '/templates/og/spotlight',
  event:     '/templates/og/event',
  morning:   '/templates/og/morning',
  'morning-pin': '/templates/og/morning-pin',
  education: '/templates/og/education',
  carousel:  '/templates/og/carousel',
  story:     '/marketing/templates/story',
  story_spotlight: '/marketing/templates/story/spotlight',
  story_event:     '/marketing/templates/story/event',
  story_education: '/marketing/templates/story/education',
  education_pin: '/templates/og/education-pin',
  spacex_ipo: '/templates/og/spacex-ipo',
  'market-close': '/templates/og/market-close',
  'market-close-ig': '/templates/og/market-close-ig',
  'education-carousel': '/templates/og/education-carousel',
};

function buildTemplateUrl(req: CaptureRequest): string {
  const base = req.baseUrl || BASE_URL;
  const route = TEMPLATE_ROUTES[req.template] || `/templates/og/${req.template}`;
  const url = new URL(route, base);
  
  // Inject all data params
  for (const [key, value] of Object.entries(req.data)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set('format', req.format);
  
  return url.toString();
}

// ── Screenshot Capture (EC2 Puppeteer Worker) ──

// EC2 캡처 워커: ws.signumhq.com/capture (nginx reverse proxy → 127.0.0.1:3100)
// Pre-warmed Chromium — Cold Start 0초, 메모리/시간 제한 없음
const EC2_CAPTURE_URL = process.env.EC2_CAPTURE_URL || 'https://ws.signumhq.com';

/**
 * Primary: EC2 Puppeteer Worker
 * 우리 EC2에서 직접 캡처 — 외부 서비스 의존 0, 추가 비용 $0
 */
async function captureViaEC2(
  templateUrl: string,
  format: FormatType
): Promise<Uint8Array | null> {
  const { width, height } = FORMATS[format] || FORMATS.tweet;
  const MAX_RETRIES = 2; // total attempts: 1 initial + 1 retry
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${EC2_CAPTURE_URL}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: templateUrl,
          width,
          height,
          delay: 2000,
        }),
        signal: AbortSignal.timeout(20000), // 20s timeout (was 15s)
      });
      
      if (!res.ok) {
        console.error(`[ScreenshotService] EC2 capture failed (attempt ${attempt}/${MAX_RETRIES}): ${res.status} ${res.statusText}`);
        if (attempt < MAX_RETRIES) {
          console.log(`[ScreenshotService] Retrying in 15s...`);
          await new Promise(r => setTimeout(r, 15000));
          continue;
        }
        return null;
      }
      
      const buffer = new Uint8Array(await res.arrayBuffer());
      
      if (buffer.length < 1000) {
        console.error(`[ScreenshotService] EC2: image too small (${buffer.length} bytes), attempt ${attempt}/${MAX_RETRIES}`);
        if (attempt < MAX_RETRIES) {
          console.log(`[ScreenshotService] Retrying in 15s...`);
          await new Promise(r => setTimeout(r, 15000));
          continue;
        }
        return null;
      }
      
      console.log(`[ScreenshotService] EC2 Puppeteer: captured ${(buffer.length / 1024).toFixed(0)}KB (attempt ${attempt})`);
      return buffer;
    } catch (err: any) {
      console.error(`[ScreenshotService] EC2 error (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`);
      if (attempt < MAX_RETRIES) {
        console.log(`[ScreenshotService] Retrying in 15s...`);
        await new Promise(r => setTimeout(r, 15000));
        continue;
      }
      return null;
    }
  }
  return null;
}


// ── Main Capture Function ──

/**
 * Capture a marketing template and upload to Supabase Storage.
 * Uses EC2 Puppeteer worker exclusively for capture.
 * 
 * @returns CDN URL of the uploaded image, or null on failure
 */
export async function captureTemplate(req: CaptureRequest): Promise<CaptureResult | null> {
  const templateUrl = buildTemplateUrl(req);
  console.log(`[ScreenshotService] Capturing: ${req.template}/${req.format} → ${templateUrl}`);
  
  // Try capture providers in order
  let buffer: Uint8Array | null = null;
  let provider = 'none';
  
  // Provider 1: EC2 Puppeteer Worker (52.23.98.13:3100) — ONLY provider
  buffer = await captureViaEC2(templateUrl, req.format);
  if (buffer) provider = 'ec2-puppeteer';
  
  if (!buffer || buffer.length < 500) {
    console.error(`[ScreenshotService] EC2 capture failed for ${req.template}/${req.format}`);
    return null;
  }
  
  // Upload to Supabase Storage
  try {
    await ensureBucket();
    
    const supabase = getSupabaseAdmin();
    const dateKey = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    const storagePath = `cards/${req.template}_${req.format}_${dateKey}_${timestamp}.png`;
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true,
        cacheControl: '3600',
      });
    
    if (error) {
      console.error(`[ScreenshotService] Upload failed: ${error.message}`);
      return null;
    }
    
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);
    
    const cdnUrl = urlData?.publicUrl;
    if (!cdnUrl) {
      console.error('[ScreenshotService] Failed to get public URL');
      return null;
    }
    
    const sizeKB = Math.round(buffer.length / 1024);
    console.log(`[ScreenshotService] ✅ ${req.template}/${req.format} → ${sizeKB}KB via ${provider}`);
    
    return { cdnUrl, storagePath, sizeKB, format: req.format, template: req.template };
  } catch (err: any) {
    console.error(`[ScreenshotService] Upload error: ${err.message}`);
    return null;
  }
}

// ── Batch Capture ──

/**
 * Capture all needed formats for a template at once.
 * Used by daily-content cron for Pulse/Morning pre-rendering.
 */
export async function captureAllFormats(
  template: TemplateType,
  data: Record<string, string | number>,
  formats: FormatType[] = ['tweet', 'og', 'story', 'carousel', 'pin']
): Promise<Record<FormatType, CaptureResult | null>> {
  const results: Record<string, CaptureResult | null> = {};
  
  for (const format of formats) {
    results[format] = await captureTemplate({ template, format, data });
    // Rate limit: 500ms between captures
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`[ScreenshotService] Batch complete: ${template} → ${Object.values(results).filter(Boolean).length}/${formats.length} succeeded`);
  return results;
}

// ── Event-specific Helpers ──

/**
 * Capture an event alert image (GEX flip, VIX spike, etc.)
 * Called by event-detect cron when an event is detected.
 */
export async function captureEventAlert(params: {
  type: 'gex_shift' | 'unusual_volume' | 'whale' | 'sec_8k' | 'insider_trade' | 'fear_resolution';
  ticker: string;
  event: string;
  detail?: string;
  spy?: number;
  vix?: number;
  dp?: number;
}): Promise<{ tweet: string | null; story: string | null }> {
  const data: Record<string, string | number> = {
    type: params.type,
    ticker: params.ticker,
    event: params.event,
    detail: params.detail || '',
    spy: params.spy || 0,
    vix: params.vix || 0,
    dp: params.dp || 0,
  };
  
  const tweet = await captureTemplate({ template: 'event', format: 'tweet', data });
  const story = await captureTemplate({ template: 'event', format: 'story', data });
  
  return {
    tweet: tweet?.cdnUrl || null,
    story: story?.cdnUrl || null,
  };
}

/**
 * Capture a daily Market Pulse image (all formats).
 * Called by daily-content cron after market close.
 */
export async function captureDailyPulse(params: {
  spy: number;
  vix: number;
  gex: string;
  dp: number;
  date?: string;
}): Promise<Record<string, string | null>> {
  const data: Record<string, string | number> = {
    spy: params.spy,
    vix: params.vix,
    gex: params.gex,
    dp: params.dp,
    date: params.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
  
  // Standard formats use the pulse template
  const results = await captureAllFormats('pulse', data, ['tweet', 'og', 'carousel', 'pin', 'square']);
  
  // Return cdnUrl map
  const urls: Record<string, string | null> = {};
  for (const [format, result] of Object.entries(results)) {
    urls[format] = result?.cdnUrl || null;
  }

  // Story uses the dedicated story template (1080×1920 premium layout)
  try {
    const storyUrl = await captureStoryImage({
      spy: params.spy,
      vix: params.vix,
      gex: params.gex,
      dp: params.dp,
      date: data.date as string,
    });
    urls.story = storyUrl;
  } catch (err: any) {
    console.warn(`[ScreenshotService] Story pre-capture failed (non-fatal): ${err.message}`);
    urls.story = null;
  }

  return urls;
}

/**
 * Capture a Ticker Spotlight image.
 * Called by marketing-dispatch for individual stock highlights.
 */
export async function captureTickerSpotlight(params: {
  ticker: string;
  dp?: number;
  buy?: number;
  sell?: number;
  blocks?: number;
  position?: number;
  sector?: string;
}): Promise<{ tweet: string | null; og: string | null }> {
  const data: Record<string, string | number> = {
    t: params.ticker,
    dp: params.dp || 0,
    buy: params.buy || 50,
    sell: params.sell || 50,
    blocks: params.blocks || 0,
    position: params.position || 50,
    sector: params.sector || '',
  };
  
  const tweet = await captureTemplate({ template: 'ticker', format: 'tweet', data });
  const og = await captureTemplate({ template: 'ticker', format: 'og', data });
  
  return {
    tweet: tweet?.cdnUrl || null,
    og: og?.cdnUrl || null,
  };
}

/**
 * Capture an IG Story image (1080×1920) via the dedicated story template.
 * Uses /marketing/templates/story which is a premium GPT-designed vertical layout.
 * Called by marketing-dispatch for pulse/morning IG Story posts.
 */
export async function captureStoryImage(params: {
  spy: string | number;
  vix: string | number;
  gex: string;
  dp: string | number;
  date?: string;
  insight?: string;
}): Promise<string | null> {
  const data: Record<string, string | number> = {
    spy: params.spy,
    vix: params.vix,
    gex: params.gex,
    dp: params.dp,
    date: params.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    ...(params.insight && { insight: params.insight }),
  };
  
  const result = await captureTemplate({ template: 'story', format: 'story', data });
  
  if (result?.cdnUrl) {
    console.log(`[ScreenshotService] ✅ Story captured: ${result.sizeKB}KB`);
  }
  
  return result?.cdnUrl || null;
}

/**
 * Capture an Education OG image.
 * Called by marketing-dispatch for concept explainer posts.
 */
export async function captureEducation(params: {
  topic: string;
}): Promise<{ tweet: string | null; og: string | null }> {
  const data: Record<string, string | number> = {
    topic: params.topic,
  };
  
  const tweet = await captureTemplate({ template: 'education', format: 'tweet', data });
  const og = await captureTemplate({ template: 'education', format: 'og', data });
  
  return {
    tweet: tweet?.cdnUrl || null,
    og: og?.cdnUrl || null,
  };
}

/**
 * Capture an Event Alert OG image.
 * Called by marketing-dispatch / event-detect for real-time structural alerts.
 */
export async function captureEvent(params: {
  ticker: string;
  event: string;
  detail?: string;
  spy?: string;
  vix?: string;
  dp?: string;
}): Promise<{ tweet: string | null; og: string | null }> {
  const data: Record<string, string | number> = {
    ticker: params.ticker,
    event: params.event,
    ...(params.detail && { detail: params.detail }),
    ...(params.spy && { spy: params.spy }),
    ...(params.vix && { vix: params.vix }),
    ...(params.dp && { dp: params.dp }),
  };

  const tweet = await captureTemplate({ template: 'event', format: 'tweet', data });
  const og = await captureTemplate({ template: 'event', format: 'og', data });

  return {
    tweet: tweet?.cdnUrl || null,
    og: og?.cdnUrl || null,
  };
}

/**
 * Capture a Morning Briefing OG image.
 * Called by marketing-dispatch for pre-market briefing posts.
 */
export async function captureMorning(params: {
  spy: string;
  vix: string;
  gex: string;
  dp: string;
  insight?: string;
}): Promise<{ tweet: string | null; og: string | null }> {
  const data: Record<string, string | number> = {
    spy: params.spy,
    vix: params.vix,
    gex: params.gex,
    dp: params.dp,
    ...(params.insight && { insight: params.insight }),
  };

  const tweet = await captureTemplate({ template: 'morning', format: 'tweet', data });
  const og = await captureTemplate({ template: 'morning', format: 'og', data });

  return {
    tweet: tweet?.cdnUrl || null,
    og: og?.cdnUrl || null,
  };
}

/**
 * Capture all 6 IG Carousel slides individually (1080×1080 each).
 * Returns array of CDN URLs in order [slide1..slide6].
 */
export async function captureCarousel(params: {
  spy: string;
  qqq: string;
  vix: string;
  gex: string;
  dp: string;
  cw?: string;
}): Promise<(string | null)[]> {
  const urls: (string | null)[] = [];

  for (let slide = 1; slide <= 6; slide++) {
    const data: Record<string, string | number> = {
      slide,
      spy: params.spy,
      qqq: params.qqq,
      vix: params.vix,
      gex: params.gex,
      dp: params.dp,
      ...(params.cw && { cw: params.cw }),
    };

    const result = await captureTemplate({ template: 'carousel', format: 'carousel', data });
    urls.push(result?.cdnUrl || null);
    // Rate limit between slides
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[ScreenshotService] Carousel: ${urls.filter(Boolean).length}/6 slides captured`);
  return urls;
}

/**
 * Capture a Ticker Spotlight IG Story (1080x1920).
 * Called by marketing-dispatch spotlight action.
 */
export async function captureSpotlightStory(params: {
  ticker: string;
  dp?: number;
  smartFlow?: number;
  price?: string;
  change?: number;
  company?: string;
  sector?: string;
  gex?: string;
  callWall?: string;
  putFloor?: string;
  gammaFlip?: string;
  maxPain?: string;
  insight?: string;
}): Promise<string | null> {
  const data: Record<string, string | number> = {
    ticker: params.ticker,
    dp: params.dp ?? 0,
    smartFlow: params.smartFlow ?? 50,
    change: params.change ?? 0,
    gex: params.gex || 'neutral',
  };
  if (params.price) data.price = params.price;
  if (params.company) data.company = params.company;
  if (params.sector) data.sector = params.sector;
  if (params.callWall) data.callWall = params.callWall;
  if (params.putFloor) data.putFloor = params.putFloor;
  if (params.gammaFlip) data.gammaFlip = params.gammaFlip;
  if (params.maxPain) data.maxPain = params.maxPain;
  if (params.insight) data.insight = params.insight;

  const result = await captureTemplate({ template: 'story_spotlight', format: 'story', data });
  if (result?.cdnUrl) {
    console.log('[ScreenshotService] Spotlight Story captured: ' + result.sizeKB + 'KB');
  }
  return result?.cdnUrl || null;
}

/**
 * Capture an Education IG Story (1080x1920).
 * Called by marketing-dispatch education action.
 */
export async function captureEducationStory(params: {
  topic: string;
}): Promise<string | null> {
  const data: Record<string, string | number> = { topic: params.topic };
  const result = await captureTemplate({ template: 'story_education', format: 'story', data });
  if (result?.cdnUrl) {
    console.log('[ScreenshotService] Education Story captured: ' + result.sizeKB + 'KB');
  }
  return result?.cdnUrl || null;
}
