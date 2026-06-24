// ============================================================================
// Marketing V2 — Image Pool
// OG 이미지를 공통 풀에 캡처/저장. 어떤 플랫폼이든 필요한 포맷만 가져다 씀.
// ============================================================================

import { ImageFormat, IMAGE_DIMENSIONS, ContentSlot } from './types';

const EC2_CAPTURE_URL = process.env.EC2_CAPTURE_URL || 'https://ws.signumhq.com';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';

// ── Template 경로 매핑 ──
const TEMPLATE_ROUTES: Record<string, string> = {
  morning:         '/templates/og/morning',
  'morning-pin':   '/templates/og/morning-pin',
  'morning-ig':    '/templates/og/morning-ig',
  pulse:           '/templates/og/pulse',
  'market-close':     '/templates/og/market-close',
  'market-close-pin': '/templates/og/market-close-pin',
  'market-close-ig':  '/templates/og/market-close-ig',
  'pulse-pin':        '/templates/og/pulse-pin',
  ticker:          '/templates/og/spotlight',
  'spacex-ipo':    '/templates/og/spacex-ipo',
  event:           '/templates/og/event',
  education:       '/templates/og/education',
  'education-pin': '/templates/og/education-pin',
  'education-carousel': '/templates/og/education-carousel',
  story:           '/marketing/templates/story',
};

// ── 슬롯별 필요한 이미지 포맷 정의 ──
// 각 슬롯에서 어떤 포맷이 필요한지 여기서 선언
const SLOT_IMAGE_MAP: Record<ContentSlot, { template: string; formats: ImageFormat[] }> = {
  morning:   { template: 'morning',         formats: ['tweet', 'og', 'pin', 'story', 'square'] },
  close:     { template: 'market-close',    formats: ['tweet', 'og', 'pin', 'square'] },
  spacex:    { template: 'spacex-ipo',      formats: ['tweet', 'og', 'pin'] },
  education: { template: 'education',       formats: ['og', 'carousel', 'pin'] },
  pulse:     { template: 'pulse',           formats: ['tweet', 'og', 'pin'] },
  spotlight: { template: 'ticker',          formats: ['tweet', 'og'] },
  event:     { template: 'event',           formats: ['tweet', 'og'] },
};

// Pin 포맷은 별도 세로 전용 템플릿 사용
const PIN_TEMPLATE_OVERRIDE: Partial<Record<string, string>> = {
  'market-close': 'market-close-pin',
  'education':    'education-pin',
  'pulse':        'pulse-pin',
  'morning':      'morning-pin',
};

// Square 포맷은 별도 IG 싱글 전용 템플릿 사용
const SQUARE_TEMPLATE_OVERRIDE: Partial<Record<string, string>> = {
  'morning': 'morning-ig',
  'market-close': 'market-close-ig',
};

// ── Supabase upload ──
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

async function uploadToSupabase(buffer: Buffer, path: string): Promise<string> {
  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from('marketing-assets')
    .upload(path, buffer, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  
  const { data } = supabase.storage.from('marketing-assets').getPublicUrl(path);

  // [2026-06-25] Auto-cleanup: delete assets older than 7 days (Free plan 1GB limit)
  cleanupOldAssets().catch(() => {}); // fire-and-forget, never block upload
  
  return data.publicUrl;
}

// Counter to avoid running cleanup on every single upload (run once per hour max)
let lastCleanupTime = 0;
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

async function cleanupOldAssets() {
  if (Date.now() - lastCleanupTime < CLEANUP_INTERVAL) return;
  lastCleanupTime = Date.now();

  try {
    const supabase = getSupabase();
    const BUCKET = 'marketing-assets';
    const DAYS_TO_KEEP = 7;
    const cutoff = new Date(Date.now() - DAYS_TO_KEEP * 24 * 60 * 60 * 1000);

    const { data: files } = await supabase.storage.from(BUCKET).list('', {
      limit: 1000, sortBy: { column: 'created_at', order: 'asc' }
    });
    if (!files) return;

    const toDelete: string[] = [];
    for (const f of files) {
      if (f.id === null) {
        // folder — list sub-files
        const { data: sub } = await supabase.storage.from(BUCKET).list(f.name, { limit: 2000 });
        if (sub) {
          for (const sf of sub) {
            if (sf.created_at && new Date(sf.created_at) < cutoff) {
              toDelete.push(`${f.name}/${sf.name}`);
            }
          }
        }
      } else if (f.created_at && new Date(f.created_at) < cutoff) {
        toDelete.push(f.name);
      }
    }

    if (toDelete.length === 0) return;

    // Delete in batches of 100
    for (let i = 0; i < toDelete.length; i += 100) {
      await supabase.storage.from(BUCKET).remove(toDelete.slice(i, i + 100));
    }
    console.log(`[Marketing] Auto-cleanup: deleted ${toDelete.length} old assets (>7 days)`);
  } catch (e) {
    // Silent — cleanup failure must never break marketing pipeline
  }
}

// ── EC2 캡처 (1회) ──
async function captureFromEC2(pageUrl: string, width: number, height: number): Promise<Buffer> {
  const res = await fetch(`${EC2_CAPTURE_URL}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: pageUrl,
      width,
      height,
      waitForSelector: '.ready',
      timeout: 15000,
    }),
  });
  if (!res.ok) throw new Error(`EC2 capture failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Public API: 슬롯의 모든 이미지를 한 번에 캡처 ──
export async function captureImagesForSlot(
  slot: ContentSlot,
  data: Record<string, string | number>,
  date: string,
  dryRun = false,
): Promise<Partial<Record<ImageFormat, string>>> {
  const config = SLOT_IMAGE_MAP[slot];
  if (!config) {
    console.warn(`[MktV2/Images] No image config for slot: ${slot}`);
    return {};
  }

  const route = TEMPLATE_ROUTES[config.template];
  if (!route) {
    console.warn(`[MktV2/Images] No template route for: ${config.template}`);
    return {};
  }

  const result: Partial<Record<ImageFormat, string>> = {};
  const timestamp = Date.now();

  for (const format of config.formats) {
    const dim = IMAGE_DIMENSIONS[format];
    
    // Pin/Square 포맷은 별도 전용 템플릿 사용
    let effectiveTemplate = config.template;
    if (format === 'pin' && PIN_TEMPLATE_OVERRIDE[config.template]) {
      effectiveTemplate = PIN_TEMPLATE_OVERRIDE[config.template]!;
    } else if (format === 'square' && SQUARE_TEMPLATE_OVERRIDE[config.template]) {
      effectiveTemplate = SQUARE_TEMPLATE_OVERRIDE[config.template]!;
    }
    const effectiveRoute = TEMPLATE_ROUTES[effectiveTemplate];
    if (!effectiveRoute) continue;

    // Build template URL with data params
    const url = new URL(effectiveRoute, BASE_URL);
    for (const [k, v] of Object.entries(data)) {
      url.searchParams.set(k, String(v));
    }
    url.searchParams.set('format', format);

    if (dryRun) {
      result[format] = url.toString();
      console.log(`[MktV2/Images] DRY_RUN ${slot}/${format}: ${url.toString().substring(0, 80)}...`);
      continue;
    }

    try {
      const buffer = await captureFromEC2(url.toString(), dim.width, dim.height);
      const storagePath = `cards/${slot}_${format}_${date}_${timestamp}.png`;
      const cdnUrl = await uploadToSupabase(buffer, storagePath);
      result[format] = cdnUrl;
      console.log(`[MktV2/Images] ✓ ${slot}/${format} → ${cdnUrl.substring(0, 60)}...`);
    } catch (err: any) {
      console.error(`[MktV2/Images] ✗ ${slot}/${format}: ${err.message}`);
    }
  }

  return result;
}

// ── 커스텀 이미지 캡처 (슬롯 정의 외 용도) ──
export async function captureCustomImage(
  template: string,
  format: ImageFormat,
  data: Record<string, string | number>,
  date: string,
  dryRun = false,
): Promise<string | null> {
  const route = TEMPLATE_ROUTES[template];
  if (!route) return null;

  const dim = IMAGE_DIMENSIONS[format];
  const url = new URL(route, BASE_URL);
  for (const [k, v] of Object.entries(data)) {
    url.searchParams.set(k, String(v));
  }
  url.searchParams.set('format', format);

  if (dryRun) return url.toString();

  try {
    const buffer = await captureFromEC2(url.toString(), dim.width, dim.height);
    const storagePath = `cards/${template}_${format}_${date}_${Date.now()}.png`;
    return await uploadToSupabase(buffer, storagePath);
  } catch (err: any) {
    console.error(`[MktV2/Images] Custom capture failed: ${err.message}`);
    return null;
  }
}
