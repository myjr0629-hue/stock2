// ============================================================================
// breaking/types — 속보 공용 타입·캐시 키
// ----------------------------------------------------------------------------
// route 파일(app/api/**/route.ts)은 Next.js가 export 심볼을 제한한다
// (GET/POST/runtime/dynamic/... 만 허용). 그래서 타입과 키는 여기 둔다.
// ============================================================================

import type { MoveSignal } from './detectMove';
import type { Locale, WhyContext } from './whyBuilder';

export interface BreakingItem {
  id: string;
  signal: MoveSignal;
  /** 언어별 조립 결과 */
  copy: Record<Locale, { headline: string; why: string }>;
  context: Record<Locale, WhyContext>;
  createdAt: string;
  /** 섀도에서 잡힌 건지, 실제 발송된 건지 */
  mode: 'shadow' | 'live';
}

export interface BreakingHeartbeat {
  atISO: string;
  mode: 'shadow' | 'live';
  scanned: number;
  regularSession: boolean;
}

/** 앱이 읽는 «오늘의 속보» 목록 */
export const FEED_KEY = (d: string) => `breaking:feed:v1:${d}`;
/** 섀도 모드 관측 로그 — 임계 튜닝 근거 */
export const SHADOW_KEY = (d: string) => `breaking:shadow:v1:${d}`;
/** 생존 신호 — «돌았다»만. 신호 내용은 없다. */
export const HEARTBEAT_KEY = 'breaking:heartbeat:v1';
export const DAY_KEY = (d: string) => `breaking:day:v1:${d}`;
export const SPIKE_KEY = (d: string) => `breaking:dayspike:v1:${d}`;
export const LASTPUB_KEY = (d: string) => `breaking:lastpub:v1:${d}`;
export const COOL_KEY = (sym: string) => `breaking:cool:v1:${sym}`;
