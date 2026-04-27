// ============================================================================
// Marketing Image Pre-renderer — Supabase Storage Pipeline
// 동적 OG 이미지를 사전 렌더링하여 Supabase Storage에 정적 CDN URL로 업로드
// Buffer 503 타임아웃 문제 완전 해결
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const BUCKET_NAME = 'marketing-assets';

/**
 * Get Supabase client for Storage operations (service role key for upload)
 */
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('[ImagePrerenderer] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(url, key);
}

/**
 * Ensure the marketing-assets bucket exists (creates if not)
 */
async function ensureBucket(): Promise<void> {
  const supabase = getSupabaseAdmin();
  
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET_NAME);
  
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      fileSizeLimit: 5 * 1024 * 1024, // 5MB max
    });
    
    if (error && !error.message?.includes('already exists')) {
      throw new Error(`[ImagePrerenderer] Failed to create bucket: ${error.message}`);
    }
    
    console.log(`[ImagePrerenderer] Created bucket: ${BUCKET_NAME}`);
  }
}

/**
 * Pre-render a dynamic OG image and upload to Supabase Storage.
 * Returns a static CDN URL that Buffer can fetch instantly.
 * 
 * @param dynamicUrl - Full URL to the dynamic OG image (e.g., /api/og/market?spy=1.2&...)
 * @param filename   - Unique filename for storage (e.g., 'pulse_en_tweet_2026-04-28')
 * @returns Static public CDN URL
 */
export async function prerenderAndUpload(
  dynamicUrl: string,
  filename: string
): Promise<string | null> {
  try {
    // Step 1: Fetch the dynamic OG image (server-to-server, no timeout issues)
    const response = await fetch(dynamicUrl, {
      signal: AbortSignal.timeout(30000), // 30s timeout for our own server
    });
    
    if (!response.ok) {
      console.error(`[ImagePrerenderer] Fetch failed: ${response.status} for ${dynamicUrl}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    
    if (buffer.length < 1000) {
      console.error(`[ImagePrerenderer] Image too small (${buffer.length} bytes), likely error`);
      return null;
    }
    
    // Step 2: Ensure bucket exists
    await ensureBucket();
    
    // Step 3: Upload to Supabase Storage
    const supabase = getSupabaseAdmin();
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const storagePath = `og/${filename}.${ext}`;
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true, // Overwrite if exists (daily updates)
        cacheControl: '3600', // 1 hour cache
      });
    
    if (error) {
      console.error(`[ImagePrerenderer] Upload failed: ${error.message}`);
      return null;
    }
    
    // Step 4: Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);
    
    const publicUrl = urlData?.publicUrl;
    
    if (!publicUrl) {
      console.error('[ImagePrerenderer] Failed to get public URL');
      return null;
    }
    
    console.log(`[ImagePrerenderer] ✅ Uploaded: ${storagePath} (${(buffer.length / 1024).toFixed(0)}KB)`);
    return publicUrl;
    
  } catch (err: any) {
    console.error(`[ImagePrerenderer] Error: ${err.message}`);
    return null;
  }
}

/**
 * Pre-render multiple format variants of an OG image.
 * Used by marketing-dispatch to generate all needed sizes at once.
 * 
 * @param baseOgUrl  - Base dynamic OG URL (without format param)
 * @param dateKey    - Date string for filename (e.g., '2026-04-28')
 * @param lang       - Language (en, ko, ja)
 * @param contentType - Content type (pulse, morning, education, etc.)
 * @returns Map of format → static CDN URL
 */
export async function prerenderAllFormats(
  baseOgUrl: string,
  dateKey: string,
  lang: string,
  contentType: string
): Promise<Record<string, string | null>> {
  const formats = ['tweet', 'story', 'pin', 'og', 'carousel'];
  const results: Record<string, string | null> = {};
  
  for (const format of formats) {
    const url = new URL(baseOgUrl);
    url.searchParams.set('format', format);
    
    const filename = `${contentType}_${lang}_${format}_${dateKey}`;
    results[format] = await prerenderAndUpload(url.toString(), filename);
    
    // Small delay to avoid overloading our own Edge function
    await new Promise(r => setTimeout(r, 500));
  }
  
  return results;
}
