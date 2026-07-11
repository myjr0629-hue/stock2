// ============================================================================
// Marketing V2 — Channel Registry
// Buffer 채널 ID를 한 곳에서 관리. enabled 토글로 즉시 활성/비활성.
// 새 계정 추가 = 여기에 1줄 추가.
// ============================================================================

import { Channel, Platform, Lang } from './types';

const CHANNELS: Channel[] = [
  // ══ 2026-07-11 전면 리셋 (.agent/LAUNCH_PROMOTION_PLAN.md §4-6.5) ══
  // 옛 13채널 스프레이 은퇴 (X 동일문 다계정 정책 집행이 도달 0의 원인으로 판명).
  // Buffer = 초안+예약 전용, 발행은 항상 사람. 아래 목록 = Buffer API 실측(2026-07-11)과 일치.

  // ── X (Twitter) — 새 플래그십 @signumhq (2026-07-11 개설, Premium+) ──
  { id: '6a518928404834462892924a', name: 'signumhq', platform: 'twitter', lang: 'en', enabled: true },

  // ── X (ja) — 계정 개설 시 추가 (en/ja 쌍은 번역·현지화 작성만 — X 정책 명시 허용) ──

  // ── Bluesky (구 플릿에서 유일하게 유지 — 깨끗한 계정) ──
  { id: '69ca84bbaf47dacb696d9d0f', name: 'SIGNUM HQ', platform: 'bluesky', lang: 'en', enabled: true },

  // ── 영상 페이즈 대기 (Buffer에 연결돼 있으나 디스패치 대상 아님; Platform 타입 밖) ──
  // youtube 'SIGNUM HQ' id: 69ca9615af47dacb696df427
  // tiktok  'signumhq'  id: 69ca95e7af47dacb696df35a
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
