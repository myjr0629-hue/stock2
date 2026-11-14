/**
 * 관리자 «공지 푸시»(/api/admin/announce, 2026-11-14) — 탭 목적지 검증 (순수 함수 · 서버·앱 둘 다 쓴다).
 * 서버가 준 값을 그대로 믿지 않는다: 닫힌 목록의 앱 안 경로와 «정확히 같을 때만» 쓴다(쿼리·다른 경로·바깥 주소는 버린다).
 */
export const ANNOUNCE_PATHS = ['/app-view/watchlist', '/app-view/dash', '/app-view/settings', '/app-view/earnings'] as const;
export type AnnouncePath = (typeof ANNOUNCE_PATHS)[number];

/** 푸시 데이터 type 값 — app-view/layout.tsx 의 탭 처리와 같아야 한다 */
export const ANNOUNCE_PUSH_TYPE = 'announce';

export function announceTapPath(raw: unknown): AnnouncePath | null {
  return typeof raw === 'string' && (ANNOUNCE_PATHS as readonly string[]).includes(raw) ? (raw as AnnouncePath) : null;
}
