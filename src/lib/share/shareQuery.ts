import { headers } from 'next/headers';

// ============================================================================
// 서버 쪽 «이 요청이 공유 링크로 왔나» (2026-09-29 공유 루프)
//
// 페이지는 searchParams 를 직접 받지만, 레이아웃(UC·WIM — 페이지가 'use client' 라 메타데이터를
// 레이아웃이 낸다)은 쿼리를 못 받는다. 미들웨어가 요청 URL 을 `x-url` 헤더로 넘겨 주므로
// (src/middleware.ts, next-intl 이 요청 헤더를 그대로 전달) 그것을 읽는다.
// 이 앱은 [locale] 레이아웃이 이미 headers() 를 읽어 전 경로가 동적 렌더다 — 여기서 읽어도
// 캐시 성격은 바뀌지 않는다.
// ============================================================================

export type ShareQuery = {
  fromShare: boolean;
  via: string | null;
  get: (k: string) => string | null;
};

const NONE: ShareQuery = { fromShare: false, via: null, get: () => null };

export async function readShareQuery(): Promise<ShareQuery> {
  try {
    const raw = (await headers()).get('x-url');
    if (!raw) return NONE;
    const sp = new URL(raw).searchParams;
    if (sp.get('from') !== 'share') return NONE;
    return { fromShare: true, via: sp.get('via'), get: (k) => sp.get(k) };
  } catch {
    return NONE;
  }
}

/** 공유 링크의 티커 파라미터 — 형식이 아니면 버린다(메타 제목에 그대로 들어가므로). */
export function cleanTicker(v: string | null | undefined): string | null {
  const t = (v || '').toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(t) ? t : null;
}
