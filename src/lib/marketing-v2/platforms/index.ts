// ============================================================================
// Marketing V2 — Platform Registry
// 모든 어댑터를 한 곳에서 관리. 플랫폼 이름으로 어댑터 조회.
// ============================================================================

import { Platform } from '../core/types';
import { TwitterAdapter } from './twitter';
import { ThreadsAdapter } from './threads';
import { BlueskyAdapter } from './bluesky';
import { InstagramAdapter } from './instagram';
import { PinterestAdapter } from './pinterest';
import { TelegramAdapter } from './telegram';

// 싱글톤 인스턴스
export const twitter = new TwitterAdapter();
export const threads = new ThreadsAdapter();
export const bluesky = new BlueskyAdapter();
export const instagram = new InstagramAdapter();
export const pinterest = new PinterestAdapter();
export const telegram = new TelegramAdapter();

// 이름으로 조회
const ADAPTERS: Record<string, any> = {
  twitter, threads, bluesky, instagram, pinterest, telegram,
};

export function getAdapter(platform: Platform) {
  return ADAPTERS[platform];
}

export function getAllAdapters() {
  return Object.values(ADAPTERS);
}
