// ============================================================================
// «마지막 정상값 즉시 + 뒤에서 갱신»(SWR) 에 쓰는 배경 갱신 잠금.
//
// 왜 (2026-10-07 앱 성능 실측): 앱 화면 3곳의 «첫 숫자»가 사용자 요청 안에서 무거운 계산을 기다렸다 —
//   랭킹 /api/ranking 캐시 10분(미스 7~13초) · 대시 무버 /api/market/movers 캐시 60초(미스 8~9초) ·
//   인텔 /api/intel/fast 응답 캐시 없음(섹터당 0.7~4.5초 × 10).
//   트래픽이 얇은 앱이라 사용자 대부분이 «캐시가 식은 뒤 첫 사람»이 된다.
//   → 정상본을 길게 두고, 식었으면 «정상본을 먼저 주고 갱신은 응답 뒤(after)» 로 돌린다.
//
// 이 잠금은 «같은 갱신이 동시에 여러 번 도는 것»을 줄이려는 것이다 — 원자적이지 않다(get → set).
//   둘이 동시에 잡아도 낭비일 뿐 오답이 아니다. 잠금 읽기·쓰기가 실패해도 갱신은 진행한다(잠금이 갱신을 막지 않는다).
//   키 이름은 perf: 로 시작 — Upstash 복제 목록(redisClient REPLICATE_PREFIXES)에 없어 EC2 에만 쓴다.
// ============================================================================
import { getFromCache, setInCache, deleteFromCache } from '@/services/redisClient';

/** 배경 갱신 권리를 얻으면 true. ttlSec 안에 이미 누가 잡았으면 false. */
export async function tryBackgroundLock(key: string, ttlSec: number): Promise<boolean> {
    try {
        const at = await getFromCache<number>(key);
        if (typeof at === 'number' && Date.now() - at < ttlSec * 1000) return false;
        await setInCache(key, Date.now(), ttlSec);
        return true;
    } catch {
        return true;   // 잠금 저장소가 죽어도 갱신은 한다
    }
}

export async function releaseBackgroundLock(key: string): Promise<void> {
    try { await deleteFromCache(key); } catch { /* 만료로 풀린다 */ }
}

/** 나이(ms)를 «초»로 — 응답 메타용 */
export function ageSec(ms: number): number {
    return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : -1;
}
