/**
 * «신선도 증가분» 등급 — 크레딧(Anthropic 직접)으로만 돌고, 크레딧이 안 되면 AWS 로 넘기지 않고 «건너뛴다».
 *
 * 왜 (대표 2026-10-10): 크레딧이 떨어지거나 막혔을 때 «기본 용도»는 예전처럼 AWS 로 넘어가지만,
 *   페이싱 조절기가 더 자주 갱신하려고 만든 «증가분»까지 AWS 로 가면 AWS 소모가 오히려 늘어난다.
 *
 * 쓰는 법: 증가분으로 부르는 쪽(예열 크론·기본 수명보다 이른 재생성)이 `withFreshTier(() => …)` 로 감싼다.
 *   runLadder 는 이 문맥 안에서 ①(Anthropic 크레딧)만 시도하고, 실패·한도·킬 스위치·허용 목록 밖이면
 *   ②(Bedrock 5.5)·③(현행 Bedrock Haiku 4.5)을 부르지 않고 FreshTierSkipped 를 던진다.
 *   호출 지점은 이 예외를 «삼키지 말고» 위로 올려 캐시를 덮어쓰지 않아야 한다(옛 사본 유지).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage<{ fresh: true }>();

export class FreshTierSkipped extends Error {
    constructor(public trail: string[] = []) {
        super(`fresh-tier skipped (credit rung unavailable, no AWS fallback): ${trail.join(',')}`);
        this.name = 'FreshTierSkipped';
    }
}

export const isFreshTierSkipped = (e: unknown): boolean => (e as { name?: string } | null)?.name === 'FreshTierSkipped';

export const inFreshTier = (): boolean => !!als.getStore()?.fresh;

export function withFreshTier<T>(fn: () => Promise<T>): Promise<T> {
    return als.run({ fresh: true }, fn);
}
