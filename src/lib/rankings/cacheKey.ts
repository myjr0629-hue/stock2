// ============================================================================
// 랭킹 캐시 키 — 한 곳에서만 정한다.
//
//   생산자: /api/ranking (cron/app-warm 이 run=all·days 30·top 5 로 5~20분마다 굽는다)
//   소비자: services/aiqContextService(AI 사실 입력의 순위 칸) · scripts/ai-quality-55/harness
//
// ⚠️ [2026-10-19] 판본을 v9→v10 으로 올렸을 때 소비자 쪽 문자열 복제(옛 판본 all:30:5 키)가
//    그대로 남아, 병합 12시간 뒤(v9 저장 TTL 만료) AI 사실의 순위 칸이 조용히 비게 될 뻔했다.
//    판본은 여기서만 올리고, 모두 이 모듈에서 가져다 쓴다(이 파일은 import 0 — 어디서나 가볍게 읽힌다).
//
// 판본 이력은 api/ranking/route.ts 의 CACHE 주석에 있다.
// ============================================================================

// v13: deviation 평소는 완결 EOD·동일 premiumBasis, 오늘 부분 자료는 partial로 운반한다.
export const RANKING_CACHE_VERSION = 'v13';

/** /api/ranking 이 저장하는 키 */
export const rankingCacheKey = (run: string, days: number, top: number): string =>
    `ranking:${RANKING_CACHE_VERSION}:${run}:${days}:${top}`;

/** app-warm 이 굽는 기본 사본(run=all · days 30 · top 5) — route.ts 의 days·top 기본값과 같아야 한다 */
export const RANKING_DEFAULT_DAYS = 30;
export const RANKING_DEFAULT_TOP = 5;
export const RANKING_ALL_DEFAULT_KEY = rankingCacheKey('all', RANKING_DEFAULT_DAYS, RANKING_DEFAULT_TOP);
