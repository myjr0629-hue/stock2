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
  { id: '6a06eff0090476fb99216fba', name: 'signumhq_kor',      service: 'instagram', tier: 2, lang: 'ko' },
  { id: '6a06f0ac090476fb99217454', name: 'signumhq_kor',      service: 'threads',   tier: 2, lang: 'ko' },
  { id: '69ca84bbaf47dacb696d9d0f', name: 'SIGNUM HQ',        service: 'bluesky',   tier: 2, lang: 'en' },
  { id: '69ca9432af47dacb696deb5c', name: 'Pinterest',          service: 'pinterest', tier: 2, lang: 'en' },

  // --- Tier 3: Future expansion ---
  { id: '69ca78a7af47dacb696d6446', name: 'SignumHQ_JP',       service: 'twitter',   tier: 3, lang: 'ja' },
  { id: '6a06f2cb090476fb99217ed3', name: 'signumhq_jpn',       service: 'instagram', tier: 3, lang: 'ja' },
  { id: '6a06f344090476fb992180db', name: 'signumhq_jpn',       service: 'threads',   tier: 3, lang: 'ja' },
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
  // --- EN: SEC/FTC compliance ---
  [/\bBullish\b/gi,       'Call-side activity concentrated'],
  [/\bBearish\b/gi,       'Put-side activity elevated'],
  [/\bexpect\b/gi,        'historically associated with'],
  [/\bwill go up\b/gi,    'often coincides with upward moves'],
  [/\bwill drop\b/gi,     'often coincides with downward pressure'],
  [/\bCALLED IT\b/gi,     ''],
  [/\bguarantee[ds]?\b/gi, ''],
  [/\bprofit[s]?\b/gi,    'return'],
  [/\bsure thing\b/gi,    ''],
  [/\b100%\s*(chance|certain|guaranteed|sure)\b/gi, 'historically'],
  // --- KO: 자본시장법 compliance ---
  [/\b적중\b/g,           ''],
  [/\b매수\b/g,           ''],
  [/\b매도\b/g,           ''],
  [/\b확실\b/g,           ''],
  [/\b수익\b/g,           '성과'],
  [/\b추천\b/g,           ''],
  [/\b반드시\b/g,         ''],
  [/\b대박\b/g,           ''],
  // --- JA: 金商法 compliance ---
  [/絶対/g,               ''],
  [/儲かる/g,             ''],
  [/推奨/g,               ''],
  [/必ず/g,               ''],
  [/確実/g,               ''],
];

export function applyCompliance(text: string): string {
  let result = text;
  for (const [pattern, replacement] of COMPLIANCE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Disclaimer (전 플랫폼 면책 의무화 — 2026-04-27)
// ---------------------------------------------------------------------------
export const DISCLAIMER = {
  en: 'Not financial advice. Data-driven context only.',
  ko: '*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.',
  ja: '*投資助言ではありません。データ分析の参考資料です。',
} as const;

// ---------------------------------------------------------------------------
// CTA templates (8종 다양화 — 2026-04-27)
// Phase 3-2: CTA 피로도 감소 + 전환율 극대화
// ---------------------------------------------------------------------------
export const CTA = {
  liveStructure: (utm: string) =>
    `📊 See live market structure → signumhq.com/dashboard?${utm}`,
  trackLevels: (utm: string) =>
    `🎯 Track key levels → signumhq.com/flow?${utm}`,
  fullReport: (utm: string) =>
    `📋 Read AI report → signumhq.com/intel-guardian?${utm}`,
  institutionalView: (utm: string) =>
    `🏦 This is what institutions are positioning for → signumhq.com/dashboard?${utm}`,
  darkPoolTrack: (utm: string) =>
    `🌊 Track dark pool activity in real time → signumhq.com/flow?${utm}`,
  freeAlert: (utm: string) =>
    `🔔 Get structural alerts before the crowd → signumhq.com?${utm}`,
  educationDeep: (utm: string) =>
    `📖 Go deeper on this metric → signumhq.com/how-it-works?${utm}`,
  freeDashboard: (utm: string) =>
    `⚡ Free institutional dashboard → signumhq.com?${utm}`,
} as const;

export const CTA_KO = {
  liveStructure: (utm: string) =>
    `📊 실시간 시장 구조 분석 → signumhq.com/dashboard?${utm}`,
  trackLevels: (utm: string) =>
    `🎯 핵심 레벨 추적 → signumhq.com/flow?${utm}`,
  fullReport: (utm: string) =>
    `📋 AI 리포트 전문 → signumhq.com/intel-guardian?${utm}`,
  institutionalView: (utm: string) =>
    `🏦 기관이 지금 주시하는 포지션 → signumhq.com/dashboard?${utm}`,
  darkPoolTrack: (utm: string) =>
    `🌊 다크풀 실시간 추적 → signumhq.com/flow?${utm}`,
  freeAlert: (utm: string) =>
    `🔔 시장 구조 변화 알림 받기 → signumhq.com?${utm}`,
  educationDeep: (utm: string) =>
    `📖 이 지표 더 깊이 알아보기 → signumhq.com/how-it-works?${utm}`,
  freeDashboard: (utm: string) =>
    `⚡ 무료 기관급 대시보드 → signumhq.com?${utm}`,
} as const;

export const CTA_JA = {
  liveStructure: (utm: string) =>
    `📊 リアルタイム市場構造 → signumhq.com/dashboard?${utm}`,
  trackLevels: (utm: string) =>
    `🎯 キーレベル追跡 → signumhq.com/flow?${utm}`,
  fullReport: (utm: string) =>
    `📋 AIレポート全文 → signumhq.com/intel-guardian?${utm}`,
  institutionalView: (utm: string) =>
    `🏦 機関投資家が注目するポジション → signumhq.com/dashboard?${utm}`,
  darkPoolTrack: (utm: string) =>
    `🌊 ダークプールをリアルタイムで追跡 → signumhq.com/flow?${utm}`,
  freeAlert: (utm: string) =>
    `🔔 構造変化アラートを受け取る → signumhq.com?${utm}`,
  educationDeep: (utm: string) =>
    `📖 この指標をさらに詳しく → signumhq.com/how-it-works?${utm}`,
  freeDashboard: (utm: string) =>
    `⚡ 無料の機関級ダッシュボード → signumhq.com?${utm}`,
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
 * Instagram metadata for Buffer's new GraphQL schema
 */
export interface InstagramMeta {
  type: 'post' | 'story' | 'reel';
  shouldShareToFeed: boolean;
}

/**
 * Pinterest Pin metadata (boardServiceId required on create!)
 */
export interface PinterestMeta {
  title: string;           // Pin title (SEO)
  url?: string;            // Destination link
  boardServiceId: string;  // Required! Get from channel metadata query
}

/**
 * Create a post on Buffer — NEW SCHEMA (2026-04 Migration)
 * 
 * Buffer API Breaking Change:
 *   - postCreate → createPost
 *   - PostCreateInput → CreatePostInput
 *   - channelIds: [String] → channelId: String (singular)
 *   - content: { text, media } → text + assets: { images: [{ url }] }
 *   - saveToDraft: Boolean (official field)
 *   - metadata: { instagram: { type, shouldShareToFeed } } (required for IG)
 *   - metadata: { pinterest: { title, url, boardServiceId } } (required for Pinterest!)
 * 
 * @param dryRun If true, logs instead of actually calling API
 */
export async function createPost(opts: {
  channelIds: string[];
  text: string;
  mediaUrl?: string;
  scheduledAt?: string; // ISO 8601
  dryRun?: boolean;
  draft?: boolean;
  instagramMeta?: InstagramMeta;
  pinterestMeta?: PinterestMeta;
}): Promise<{ success: boolean; postId?: string; dryRun?: boolean; error?: string }> {
  const { channelIds, text, mediaUrl, scheduledAt, dryRun = true, draft = false, instagramMeta, pinterestMeta } = opts;

  if (dryRun) {
    console.log(`[BufferClient] DRY_RUN createPost:
  channels: ${channelIds.length}
  text: ${text.substring(0, 100)}...
  media: ${mediaUrl || 'none'}
  scheduled: ${scheduledAt || 'now'}
  draft: ${draft}
  igMeta: ${instagramMeta ? JSON.stringify(instagramMeta) : 'none'}
  pinMeta: ${pinterestMeta ? JSON.stringify(pinterestMeta) : 'none'}`);
    return { success: true, dryRun: true };
  }

  // New schema uses single channelId — loop through each channel
  const results: { success: boolean; postId?: string; error?: string }[] = [];

  for (const channelId of channelIds) {
    try {
      // Publish immediately: set dueAt to 30s from now so Buffer fires it right away
      const publishAt = scheduledAt || new Date(Date.now() + 30_000).toISOString();
      const input: Record<string, any> = {
        channelId,
        text: text || '',
        schedulingType: 'automatic',
        mode: 'customScheduled',
        dueAt: publishAt,
      };

      // Image assets (new schema structure)
      if (mediaUrl) {
        input.assets = { images: [{ url: mediaUrl }] };
      }

      // Draft support (official Buffer field)
      if (draft) {
        input.saveToDraft = true;
      }

      // Instagram-specific metadata (required for IG posts/stories/reels)
      if (instagramMeta) {
        input.metadata = {
          instagram: {
            type: instagramMeta.type,
            shouldShareToFeed: instagramMeta.shouldShareToFeed,
          },
        };
      }

      // Pinterest-specific metadata (boardServiceId REQUIRED on create!)
      if (pinterestMeta) {
        input.metadata = {
          ...(input.metadata || {}),
          pinterest: {
            title: pinterestMeta.title,
            ...(pinterestMeta.url ? { url: pinterestMeta.url } : {}),
            boardServiceId: pinterestMeta.boardServiceId,
          },
        };
      }

      const data = await bufferGraphQL(`
        mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) {
            ... on PostActionSuccess { post { id } }
            ... on NotFoundError { message }
            ... on UnauthorizedError { message }
            ... on UnexpectedError { message }
            ... on RestProxyError { message code }
            ... on LimitReachedError { message }
            ... on InvalidInputError { message }
          }
        }
      `, { input });

      const result = data.createPost;
      if (result?.post?.id) {
        results.push({ success: true, postId: result.post.id });
      } else {
        const errMsg = result?.message || 'Unknown error';
        console.error(`[BufferClient] createPost failed for channel ${channelId}:`, errMsg);
        results.push({ success: false, error: errMsg });
      }

      // Rate limit protection: 300ms delay between channels
      if (channelIds.length > 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err: any) {
      console.error(`[BufferClient] createPost exception for channel ${channelId}:`, err.message);
      results.push({ success: false, error: err.message });
    }
  }

  // Return first successful result, or first error
  const success = results.find(r => r.success);
  if (success) return success;
  return results[0] || { success: false, error: 'No channels provided' };
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
