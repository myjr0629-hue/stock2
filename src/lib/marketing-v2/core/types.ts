// ============================================================================
// Marketing V2 — Core Types
// 모든 마케팅 모듈이 공유하는 타입 정의
// ============================================================================

// ── Languages ──
export type Lang = 'en' | 'ko' | 'ja';
export const ALL_LANGS: Lang[] = ['en', 'ko', 'ja'];

// ── Platform identifiers ──
export type Platform = 'twitter' | 'threads' | 'bluesky' | 'instagram' | 'pinterest' | 'telegram';
export const ALL_PLATFORMS: Platform[] = ['twitter', 'threads', 'bluesky', 'instagram', 'pinterest', 'telegram'];

// ── Content slot (what kind of content) ──
export type ContentSlot = 'morning' | 'close' | 'spacex' | 'education' | 'pulse' | 'spotlight' | 'event';

// ── Image format ──
export type ImageFormat = 'tweet' | 'og' | 'story' | 'carousel' | 'pin' | 'square';

export const IMAGE_DIMENSIONS: Record<ImageFormat, { width: number; height: number }> = {
  tweet:    { width: 1200, height: 675 },   // 16:9  → X, Bluesky, Telegram
  og:       { width: 1200, height: 675 },   // ~16:9 → Threads, 일반 공유
  story:    { width: 1080, height: 1920 },  // 9:16  → IG Story
  carousel: { width: 1080, height: 1080 },  // 1:1   → IG Feed
  pin:      { width: 1000, height: 1500 },  // 2:3   → Pinterest
  square:   { width: 1080, height: 1080 },  // 1:1   → 범용
};

// ── Content Package (Redis에 저장되는 단일 콘텐츠 묶음) ──
export interface ContentPackage {
  slot: ContentSlot;
  date: string;                    // YYYY-MM-DD (ET 기준)
  preparedAt: string;              // ISO 8601

  // OG 이미지 풀 — 플랫폼이 필요한 포맷을 골라 씀
  images: Partial<Record<ImageFormat, string>>;   // CDN URL

  // IG 캐러셀 멀티 슬라이드 (여러 장 스와이프)
  carouselSlides?: string[];                       // CDN URL[]

  // 텍스트 — 언어별 구조화된 블록
  text: Partial<Record<Lang, TextBlock>>;

  // 원본 메트릭 (각 prepare가 넣는 raw 데이터)
  metrics: Record<string, any>;

  // 해시태그 — 플랫폼 × 언어별 미리 생성
  hashtags: Partial<Record<Lang, Partial<Record<Platform, string>>>>;
}

export interface TextBlock {
  headline: string;         // 짧은 제목 (1줄)
  data: string;             // 데이터 라인 (SPY +0.77% | VIX 17.3 ...)
  insight: string;          // AI 분석 1~2문장
  full: string;             // 풀 텍스트 (Telegram/Threads용)
  disclaimer: string;       // 면책조항
  cta: string;              // CTA 링크 (signumhq.com/...)
  ctaFull: string;          // CTA 풀 URL (https://...)
}

// ── Platform이 최종적으로 발송하는 단위 ──
export interface FormattedPost {
  channelId: string;
  text: string;
  imageUrl?: string;
  lang: Lang;
  platform: Platform;
}

// ── Dispatch result ──
export interface SendResult {
  success: boolean;
  platform: Platform;
  lang: Lang;
  channelId: string;
  postId?: string;
  error?: string;
  dryRun?: boolean;
}

// ── Channel definition ──
export interface Channel {
  id: string;
  name: string;
  platform: Platform;
  lang: Lang;
  enabled: boolean;
}

// ── Prepare options ──
export interface PrepareOptions {
  slot: ContentSlot;
  date?: string;             // override date
  dryRun?: boolean;
}

// ── Send options ──
export interface SendOptions {
  platform: Platform;
  slot: ContentSlot;
  date?: string;
  dryRun?: boolean;
  draft?: boolean;
  lang?: Lang;               // 특정 언어만 발송 시
}
