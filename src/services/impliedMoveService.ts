/**
 * ★ [2026-09-29] 예상 변동 «전환기» 읽기 — 구조 사본에 impliedMove 가 아직 없을 때만 쓴다.
 *
 * 구조 서비스는 이제 결과에 impliedMove(주간 만기 ATM 스트래들)를 싣는다(src/lib/impliedMove.ts).
 * 그런데 이 수리 «전에» 계산된 사본은 장외 신선 TTL(72시간)·마지막 정상본(72시간) 동안 그 필드 없이 남는다.
 * 그 사이 화면의 IMP MOVE 가 «—» 로 비지 않게, 같은 체인(수집기 캐시 polygon:snapshot:probe:{T} 의 주간 만기)을
 * «읽기만» 해서 같은 정의로 계산한다. 구조 사본이 새로 계산되면(장중 60초 TTL) 이 경로는 저절로 안 쓰인다.
 *
 * ⛔ 벤더 호출 0 · Redis 쓰기 0. 인스턴스 메모 60초(같은 종목을 한 요청 묶음에서 되풀이해 읽지 않게).
 */
import { getFromCache } from '@/services/redisClient';
import { atmStraddleImpliedMove, type ImpliedMove } from '@/lib/impliedMove';

const MEMO_MS = 60_000;
const memo = new Map<string, { at: number; value: ImpliedMove | null }>();

/** 구조 사본이 «이 수리 전» 것인가 — 계산은 성공했는데 impliedMove 키 자체가 없다 */
export function structureLacksImpliedMove(structure: any): boolean {
    return !!structure && typeof structure === 'object' && structure.options_status === 'OK' && !('impliedMove' in structure);
}

/** 수집기 체인 캐시의 주간 만기로 ATM 스트래들 — 없으면 null */
export async function weeklyImpliedMoveFromProbe(ticker: string, spot: number, expiry?: string | null): Promise<ImpliedMove | null> {
    const T = String(ticker || '').toUpperCase();
    if (!T || !(spot > 0)) return null;
    const key = `${T}:${expiry || 'weekly'}`;
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
    let value: ImpliedMove | null = null;
    try {
        const pc: any = await getFromCache<any>(`polygon:snapshot:probe:${T}`);
        const chain = Array.isArray(pc?.exactResults) && pc.exactResults.length ? pc.exactResults : (Array.isArray(pc?.probeResults) ? pc.probeResults : []);
        const exp = expiry || pc?.weeklyExpiry || null;
        if (chain.length) {
            value = atmStraddleImpliedMove(chain, spot, {
                expiry: exp,
                quotesLive: pc?.greeksSource === 'realtime',
                quotesAt: Number(pc?._ts) || null,
            });
        }
    } catch {
        value = null;
    }
    if (memo.size > 2000) memo.clear();
    memo.set(key, { at: Date.now(), value });
    return value;
}

/** 구조 결과에서 예상 변동 — 전환기엔 수집기 체인으로 채운다 */
export async function impliedMoveOfStructure(ticker: string, structure: any, spot?: number | null): Promise<ImpliedMove | null> {
    if (!structure || typeof structure !== 'object') return null;
    if (!structureLacksImpliedMove(structure)) return structure.impliedMove ?? null;
    const S = Number(spot) > 0 ? Number(spot) : Number(structure.underlyingPrice);
    return weeklyImpliedMoveFromProbe(ticker, S, typeof structure.expiration === 'string' ? structure.expiration : null);
}
