// ============================================================================
// 실적일 표식 — 'confirmed' 회사가 공지한 날짜 · 'est' 확인했으나 공지 전 · 없음 = 모름
//   서버·클라이언트 공용의 아주 작은 모듈(데이터 목록은 earningsConfirmed.ts — 클라이언트 번들에 끌려오지 않게 따로 둔다).
// ============================================================================

export type DateStatus = 'confirmed' | 'est';

/** 화면·API 에서 쓰는 값만 받는다 — 모르는 값은 null */
export function normalizeDateStatus(v: unknown): DateStatus | null {
  return v === 'confirmed' || v === 'est' ? v : null;
}
