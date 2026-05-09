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
  og:       { width: 1200, height: 630 },
  story:    { width: 1080, height: 1920 },
  carousel: { width: 1080, height: 1080 },
  pin:      { width: 1000, height: 1500 },
  square:   { width: 1080, height: 1080 },
};

const BUCKET_NAME = 'marketing-assets';
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://signumhq.com';

// ── Types ──
export type TemplateType = 'pulse' | 'event' | 'ticker' | 'morning' | 'education';
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
function buildTemplateUrl(req: CaptureRequest): string {
  const base = req.baseUrl || BASE_URL;
  const url = new URL(`/marketing/templates/${req.template}`, base);
  
  // Inject all data params
  for (const [key, value] of Object.entries(req.data)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set('format', req.format);
  
  return url.toString();
}

// ── Screenshot Capture (EC2 Puppeteer Worker) ──

// EC2 캡처 워커: 52.23.98.13:3100 (PM2: capture-worker)
// Pre-warmed Chromium — Cold Start 0초, 메모리/시간 제한 없음
const EC2_CAPTURE_URL = process.env.EC2_CAPTURE_URL || 'http://52.23.98.13:3100';

/**
 * Primary: EC2 Puppeteer Worker
 * 우리 EC2에서 직접 캡처 — 외부 서비스 의존 0, 추가 비용 $0
 */
async function captureViaEC2(
  templateUrl: string,
  format: FormatType
): Promise<Uint8Array | null> {
  const { width, height } = FORMATS[format] || FORMATS.tweet;
  
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
      signal: AbortSignal.timeout(30000),
    });
    
    if (!res.ok) {
      console.error(`[ScreenshotService] EC2 capture failed: ${res.status} ${res.statusText}`);
      return null;
    }
    
    const buffer = new Uint8Array(await res.arrayBuffer());
    
    if (buffer.length < 1000) {
      console.error(`[ScreenshotService] EC2: image too small (${buffer.length} bytes)`);
      return null;
    }
    
    console.log(`[ScreenshotService] EC2 Puppeteer: captured ${(buffer.length / 1024).toFixed(0)}KB`);
    return buffer;
  } catch (err: any) {
    console.error(`[ScreenshotService] EC2 error: ${err.message}`);
    return null;
  }
}

/**
 * Fallback: Use existing Satori OG endpoint
 * 기존 인프라 — CSS 제한 있으나 항상 작동
 */
async function captureViaSatoriOG(
  req: CaptureRequest
): Promise<Uint8Array | null> {
  try {
    const ogUrl = new URL('/api/og/market', BASE_URL);
    
    // Map template data to OG params
    if (req.data.spy) ogUrl.searchParams.set('spy', String(req.data.spy));
    if (req.data.vix) ogUrl.searchParams.set('vix', String(req.data.vix));
    if (req.data.gex) ogUrl.searchParams.set('gex', String(req.data.gex));
    if (req.data.dp) ogUrl.searchParams.set('dp', String(req.data.dp));
    ogUrl.searchParams.set('format', req.format);
    
    const res = await fetch(ogUrl.toString(), {
      signal: AbortSignal.timeout(15000),
    });
    
    if (!res.ok) return null;
    
    const buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.length < 1000) return null;
    
    console.log(`[ScreenshotService] Satori fallback: ${(buffer.length / 1024).toFixed(0)}KB`);
    return buffer;
  } catch {
    return null;
  }
}

// ── Main Capture Function ──

/**
 * Capture a marketing template and upload to Supabase Storage.
 * Tries providers in order: Self-hosted Puppeteer → Satori fallback
 * 
 * @returns CDN URL of the uploaded image, or null on failure
 */
export async function captureTemplate(req: CaptureRequest): Promise<CaptureResult | null> {
  const templateUrl = buildTemplateUrl(req);
  console.log(`[ScreenshotService] Capturing: ${req.template}/${req.format} → ${templateUrl}`);
  
  // Try capture providers in order
  let buffer: Uint8Array | null = null;
  let provider = 'none';
  
  // Provider 1: EC2 Puppeteer Worker (52.23.98.13:3100)
  buffer = await captureViaEC2(templateUrl, req.format);
  if (buffer) provider = 'ec2-puppeteer';
  
  // Provider 2: Satori OG fallback (기존 인프라, 항상 작동)
  if (!buffer) {
    buffer = await captureViaSatoriOG(req);
    if (buffer) provider = 'satori-fallback';
  }
  
  if (!buffer || buffer.length < 500) {
    console.error(`[ScreenshotService] All providers failed for ${req.template}/${req.format}`);
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
  
  const results = await captureAllFormats('pulse', data, ['tweet', 'og', 'story', 'carousel', 'pin', 'square']);
  
  // Return cdnUrl map
  const urls: Record<string, string | null> = {};
  for (const [format, result] of Object.entries(results)) {
    urls[format] = result?.cdnUrl || null;
  }
  return urls;
}

/**
 * Capture a Ticker Spotlight image.
 * Called by marketing-dispatch for individual stock highlights.
 */
export async function captureTickerSpotlight(params: {
  ticker: string;
  price: number;
  change: number;
  gex: string;
  dp: number;
  maxpain: number;
  iv: number;
  volume?: string;
  marketCap?: string;
}): Promise<{ tweet: string | null; story: string | null }> {
  const data: Record<string, string | number> = {
    t: params.ticker,
    price: params.price,
    change: params.change,
    gex: params.gex,
    dp: params.dp,
    maxpain: params.maxpain,
    iv: params.iv,
    vol: params.volume || '',
    cap: params.marketCap || '',
  };
  
  const tweet = await captureTemplate({ template: 'ticker', format: 'tweet', data });
  const story = await captureTemplate({ template: 'ticker', format: 'story', data });
  
  return {
    tweet: tweet?.cdnUrl || null,
    story: story?.cdnUrl || null,
  };
}
