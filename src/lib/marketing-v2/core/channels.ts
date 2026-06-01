// ============================================================================
// Marketing V2 — Channel Registry
// Buffer 채널 ID를 한 곳에서 관리. enabled 토글로 즉시 활성/비활성.
// 새 계정 추가 = 여기에 1줄 추가.
// ============================================================================

import { Channel, Platform, Lang } from './types';

const CHANNELS: Channel[] = [
  // ── X (Twitter) — 재차단 방지: 3슬롯 제한 + 5~45분 지터 + 다국어 30분 시차 ──
  { id: '69a92ae13f3b94a121198602', name: 'SignumHQ',          platform: 'twitter',   lang: 'en', enabled: true },
  { id: '69ca785caf47dacb696d62f3', name: 'SignumHQ_KR',       platform: 'twitter',   lang: 'ko', enabled: true },
  { id: '69ca78a7af47dacb696d6446', name: 'SignumHQ_JP',       platform: 'twitter',   lang: 'ja', enabled: true },

  // ── Instagram ──
  { id: '69ca6aa3af47dacb696d24c0', name: 'signumhq_official', platform: 'instagram', lang: 'en', enabled: true },
  { id: '6a06eff0090476fb99216fba', name: 'signumhq_kor',       platform: 'instagram', lang: 'ko', enabled: false }, // 정지 상태 (2026-05-16)
  { id: '6a06f2cb090476fb99217ed3', name: 'signumhq_jpn',      platform: 'instagram', lang: 'ja', enabled: false }, // 정지 상태 (2026-05-16)

  // ── Threads ──
  { id: '69ca6b08af47dacb696d263d', name: 'signumhq_official', platform: 'threads',   lang: 'en', enabled: true },
  { id: '6a06f0ac090476fb99217454', name: 'signumhq_kor',       platform: 'threads',   lang: 'ko', enabled: false }, // 정지 상태 (2026-06-01)
  { id: '6a06f344090476fb992180db', name: 'signumhq_jpn',      platform: 'threads',   lang: 'ja', enabled: true },

  // ── Bluesky ──
  { id: '69ca84bbaf47dacb696d9d0f', name: 'SIGNUM HQ',         platform: 'bluesky',   lang: 'en', enabled: true },

  // ── Pinterest ──
  { id: '69ca9432af47dacb696deb5c', name: 'Pinterest',          platform: 'pinterest', lang: 'en', enabled: true },

  // ── TikTok / YouTube (미사용) ──
  // { id: '69ca95e7af47dacb696df35a', name: 'signumhq',         platform: 'tiktok',    lang: 'en', enabled: false },
  // { id: '69ca9615af47dacb696df427', name: 'SIGNUM HQ',        platform: 'youtube',   lang: 'en', enabled: false },
];

// Telegram은 Buffer 외 직접 API — 마케팅 채널 아님 (사용자 직접 알림 전용)
export const TELEGRAM_CONFIG = {
  enabled: false,  // 2026-05-15: 마케팅 dispatch 제외, 사용자 직접 알림 채널로 전환
  lang: 'en' as Lang,
  channelId: process.env.TELEGRAM_CHANNEL_ID || '',
};

// ── Query helpers ──

/** 특정 플랫폼 + 언어의 활성 채널 가져오기 */
export function getChannel(platform: Platform, lang: Lang): Channel | undefined {
  return CHANNELS.find(c => c.platform === platform && c.lang === lang && c.enabled);
}

/** 특정 플랫폼의 모든 활성 채널 */
export function getChannelsByPlatform(platform: Platform): Channel[] {
  return CHANNELS.filter(c => c.platform === platform && c.enabled);
}

/** 특정 언어의 모든 활성 채널 */
export function getChannelsByLang(lang: Lang): Channel[] {
  return CHANNELS.filter(c => c.lang === lang && c.enabled);
}

/** 전체 활성 채널 */
export function getAllActiveChannels(): Channel[] {
  return CHANNELS.filter(c => c.enabled);
}

/** 활성 상태 요약 (디버깅/로그용) */
export function getChannelSummary(): string {
  const active = CHANNELS.filter(c => c.enabled);
  const disabled = CHANNELS.filter(c => !c.enabled);
  return `Active: ${active.length} (${active.map(c => `${c.platform}/${c.lang}`).join(', ')}) | Disabled: ${disabled.length}`;
}
