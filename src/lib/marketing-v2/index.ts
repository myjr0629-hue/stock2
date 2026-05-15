// ============================================================================
// Marketing V2 — Main Index
// 전체 마케팅 V2 시스템 진입점
// ============================================================================

// Core
export * from './core/types';
export * from './core/channels';
export * from './core/compliance';
export * from './core/store';
export * from './core/images';
export * from './core/hashtags';
export * from './core/data';

// Prepare
export { runPrepare } from './prepare';
export { prepareClose } from './prepare/close';
export { prepareMorning } from './prepare/morning';
export { prepareSpacex } from './prepare/spacex';
export { prepareEducation } from './prepare/education';
export { preparePulse } from './prepare/pulse';
export { prepareSpotlight } from './prepare/spotlight';
export { prepareEvent } from './prepare/event';

// Platforms
export { getAdapter, getAllAdapters } from './platforms';
export { TwitterAdapter } from './platforms/twitter';
export { ThreadsAdapter } from './platforms/threads';
export { BlueskyAdapter } from './platforms/bluesky';
export { InstagramAdapter } from './platforms/instagram';
export { PinterestAdapter } from './platforms/pinterest';
export { TelegramAdapter } from './platforms/telegram';
