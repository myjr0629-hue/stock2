// ============================================================================
// Buffer GraphQL API Client
// 13채널 자동 발송을 위한 Buffer API 클라이언트
// Build-only: 코드만 구축, cron 비활성화 상태
// ============================================================================

// ---------------------------------------------------------------------------
// Channel Tier System (전략 피드백 반영)
// Tier 1: 전환·신뢰에 가장 가까운 채널 (X EN, X KR)
// Tier 2: 브랜드 인지도 확장 (IG, Threads, Bluesky)
// Tier 3: 나중에 활성화 (Pinterest, TikTok, YouTube, JP channels)
// ---------------------------------------------------------------------------

export type ChannelTier = 1 | 2 | 3;

export interface BufferChannel {
  id: string;
  name: string;
  service: string;
  tier: ChannelTier;
  lang: 'en' | 'ko' | 'ja';
}

// Verified channel IDs from Buffer API (2026-03-31)
const CHANNEL_MAP: BufferChannel[] = [
  // --- Tier 1: Core conversion channels ---
  { id: '69a92ae13f3b94a121198602', name: 'SignumHQ',       service: 'twitter',   tier: 1, lang: 'en' },
  { id: '69ca785caf47dacb696d62f3', name: 'SignumHQ_KR',    service: 'twitter',   tier: 1, lang: 'ko' },

  // --- Tier 2: Brand awareness ---
  { id: '69ca6aa3af47dacb696d24c0', name: 'signumhq_official', service: 'instagram', tier: 2, lang: 'en' },
  { id: '69ca6b08af47dacb696d263d', name: 'signumhq_official', service: 'threads',   tier: 2, lang: 'en' },
  { id: '69ca7b31af47dacb696d6df6', name: 'signumhq_kr',      service: 'instagram', tier: 2, lang: 'ko' },
  { id: '69ca7b99af47dacb696d6f8d', name: 'signumhq_kr',      service: 'threads',   tier: 2, lang: 'ko' },
  { id: '69ca84bbaf47dacb696d9d0f', name: 'SIGNUM HQ',        service: 'bluesky',   tier: 2, lang: 'en' },

  // --- Tier 3: Future expansion ---
  { id: '69ca78a7af47dacb696d6446', name: 'SignumHQ_JP',       service: 'twitter',   tier: 3, lang: 'ja' },
  { id: '69ca7dbeaf47dacb696d7704', name: 'signumhq_jp',       service: 'instagram', tier: 3, lang: 'ja' },
  { id: '69ca7df5af47dacb696d77ad', name: 'signumhq_jp',       service: 'threads',   tier: 3, lang: 'ja' },
  { id: '69ca9432af47dacb696deb5c', name: 'Pinterest',          service: 'pinterest', tier: 3, lang: 'en' },
  { id: '69ca95e7af47dacb696df35a', name: 'signumhq',           service: 'tiktok',    tier: 3, lang: 'en' },
  { id: '69ca9615af47dacb696df427', name: 'SIGNUM HQ',          service: 'youtube',   tier: 3, lang: 'en' },
];

// ---------------------------------------------------------------------------
// Character limits per platform
// ---------------------------------------------------------------------------
export const CHAR_LIMITS: Record<string, number> = {
  twitter:   280,
  threads:   500,
  instagram: 2200,
  bluesky:   300,
  pinterest: 500,
  tiktok:    2200,
  youtube:   5000,
};

// ---------------------------------------------------------------------------
// Compliance dictionary (기관 리서치 톤)
// ---------------------------------------------------------------------------
export const COMPLIANCE_REPLACEMENTS: [RegExp, string][] = [
  [/\bBullish\b/gi,    'Call-side activity concentrated'],
  [/\bBearish\b/gi,    'Put-side protection increased'],
  [/\bexpect\b/gi,     'historically associated with'],
  [/\bwill go up\b/gi, 'often coincides with upward moves'],
  [/\bwill drop\b/gi,  'often coincides with downward pressure'],
  [/\bCALLED IT\b/gi,  ''],
  [/\b적중\b/g,        ''],
  [/\b매수\b/g,        ''],
  [/\b매도\b/g,        ''],
];

export function applyCompliance(text: string): string {
  let result = text;
  for (const [pattern, replacement] of COMPLIANCE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// CTA templates (통일된 3종)
// ---------------------------------------------------------------------------
export const CTA = {
  liveStructure: (utm: string) =>
    `📊 See live market structure → signumhq.com/command?${utm}`,
  trackLevels: (utm: string) =>
    `🎯 Track key levels → signumhq.com/flow?${utm}`,
  fullReport: (utm: string) =>
    `📋 Read AI report → signumhq.com/guardian?${utm}`,
} as const;

export const CTA_KO = {
  liveStructure: (utm: string) =>
    `📊 실시간 시장 구조 분석 → signumhq.com/command?${utm}`,
  trackLevels: (utm: string) =>
    `🎯 핵심 레벨 추적 → signumhq.com/flow?${utm}`,
  fullReport: (utm: string) =>
    `📋 AI 리포트 전문 → signumhq.com/guardian?${utm}`,
} as const;

export const CTA_JA = {
  liveStructure: (utm: string) =>
    `📊 リアルタイム市場構造 → signumhq.com/command?${utm}`,
  trackLevels: (utm: string) =>
    `🎯 キーレベル追跡 → signumhq.com/flow?${utm}`,
  fullReport: (utm: string) =>
    `📋 AIレポート全文 → signumhq.com/guardian?${utm}`,
} as const;

// ---------------------------------------------------------------------------
// UTM Builder
// ---------------------------------------------------------------------------
export function buildUtm(source: string, campaign: string): string {
  return `utm_source=${source}&utm_medium=social&utm_campaign=${campaign}`;
}

// ---------------------------------------------------------------------------
// Core GraphQL Client
// ---------------------------------------------------------------------------

const BUFFER_API_URL = 'https://api.buffer.com';

async function bufferGraphQL<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) throw new Error('[BufferClient] BUFFER_ACCESS_TOKEN not set');

  const body = JSON.stringify({ query, variables });

  const res = await fetch(BUFFER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`[BufferClient] HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();

  if (json.errors?.length) {
    throw new Error(`[BufferClient] GraphQL Error: ${json.errors[0].message}`);
  }

  return json.data as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get channels filtered by tier
 */
export function getChannels(opts?: {
  tier?: ChannelTier | 'all';
  lang?: 'en' | 'ko' | 'ja';
  service?: string;
}): BufferChannel[] {
  let channels = [...CHANNEL_MAP];

  if (opts?.tier && opts.tier !== 'all') {
    const maxTier = opts.tier;
    channels = channels.filter(c => c.tier <= maxTier);
  }

  if (opts?.lang) {
    channels = channels.filter(c => c.lang === opts.lang);
  }

  if (opts?.service) {
    channels = channels.filter(c => c.service === opts.service);
  }

  return channels;
}

/**
 * Fetch channels from live Buffer API (for verification)
 */
export async function fetchChannelsLive(): Promise<any[]> {
  const orgId = process.env.BUFFER_ORGANIZATION_ID;
  if (!orgId) throw new Error('[BufferClient] BUFFER_ORGANIZATION_ID not set');

  const data = await bufferGraphQL(`{
    channels(input: { organizationId: "${orgId}" }) {
      id
      name
      service
    }
  }`);

  return data.channels;
}

/**
 * Create a post on Buffer (supports scheduling)
 * @param dryRun If true, logs instead of actually calling API
 */
export async function createPost(opts: {
  channelIds: string[];
  text: string;
  mediaUrl?: string;
  scheduledAt?: string; // ISO 8601
  dryRun?: boolean;
}): Promise<{ success: boolean; postId?: string; dryRun?: boolean; error?: string }> {
  const { channelIds, text, mediaUrl, scheduledAt, dryRun = true } = opts;

  if (dryRun) {
    console.log(`[BufferClient] DRY_RUN createPost:
  channels: ${channelIds.length}
  text: ${text.substring(0, 100)}...
  media: ${mediaUrl || 'none'}
  scheduled: ${scheduledAt || 'now'}`);
    return { success: true, dryRun: true };
  }

  const orgId = process.env.BUFFER_ORGANIZATION_ID;
  if (!orgId) throw new Error('[BufferClient] BUFFER_ORGANIZATION_ID not set');

  try {
    // Buffer GraphQL postCreate mutation
    const data = await bufferGraphQL(`
      mutation CreatePost($input: PostCreateInput!) {
        postCreate(input: $input) {
          ... on PostCreateSuccess {
            post {
              id
              status
            }
          }
          ... on CoreError {
            message
          }
        }
      }
    `, {
      input: {
        organizationId: orgId,
        channelIds,
        content: {
          text,
          ...(mediaUrl ? { media: [{ url: mediaUrl }] } : {}),
        },
        ...(scheduledAt ? { scheduledAt } : {}),
      },
    });

    const result = data.postCreate;
    if (result?.post?.id) {
      return { success: true, postId: result.post.id };
    }
    return { success: false, error: result?.message || 'Unknown error' };
  } catch (err: any) {
    console.error('[BufferClient] createPost failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Truncate text to platform character limit
 */
export function truncateForPlatform(text: string, service: string): string {
  const limit = CHAR_LIMITS[service] || 280;
  if (text.length <= limit) return text;
  return text.substring(0, limit - 3) + '...';
}

/**
 * Build channel-optimized posts for a given language
 */
export function buildChannelPosts(
  content: string,
  lang: 'en' | 'ko' | 'ja',
  tier: ChannelTier | 'all' = 1,
  campaign: string = 'pulse'
): { channelId: string; text: string; service: string }[] {
  const channels = getChannels({ tier, lang });
  const ctaMap = lang === 'ko' ? CTA_KO : lang === 'ja' ? CTA_JA : CTA;

  return channels.map(ch => {
    const utm = buildUtm(ch.service, campaign);
    const cta = ctaMap.liveStructure(utm);
    const fullText = `${content}\n\n${cta}`;
    const truncated = truncateForPlatform(fullText, ch.service);
    const compliant = applyCompliance(truncated);

    return {
      channelId: ch.id,
      text: compliant,
      service: ch.service,
    };
  });
}
