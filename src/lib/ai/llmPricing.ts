/**
 * 크레딧 우선 사다리 — 단가·월 주기 (순수 함수, tests/llmLadder.test.ts 가 고정한다).
 *
 * 단가 출처: platform.claude.com/docs/en/about-claude/pricing (2026-10-10 확인)
 *   Haiku 5.5  프롬프트 ≤100K : 입력 $0.10 · 캐시쓰기(5분) $0.125 · 캐시읽기 $0.01 · 출력 $0.50  (/백만 토큰)
 *   Haiku 5.5  프롬프트  >100K : 입력 $0.50 · 캐시쓰기 $0.625 · 캐시읽기 $0.05 · 출력 $2.50
 *   Haiku 4.5                  : 입력 $1 · 출력 $5 (비교·기준선 환산용)
 *   «프롬프트 길이»는 입력 + 캐시 읽기 + 캐시 쓰기를 모두 센다(요청 단위).
 *
 * 크레딧(Max 구독 월 API 크레딧)은 매월 6일에 새로 들어온다(대표 캡처: 다음 갱신 11/6) — 결제 주기 끝에 소멸, 이월 없음.
 */

export interface TokenUsage {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
}

export const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

/** 월 연성 한도(USD) — 콘솔 잔액 $200 의 95%. 이 값에 이르면 그달은 직접 API(①)를 건너뛴다. */
export const LEDGER_CAP_USD = 190;
/** 크레딧 갱신일(매월, UTC 기준 그날 00시부터 새 주기) */
export const CREDIT_RENEW_DAY = 6;

interface Price { input: number; output: number; cacheWrite: number; cacheRead: number }
const HAIKU55_LOW: Price = { input: 0.10, output: 0.50, cacheWrite: 0.125, cacheRead: 0.01 };
const HAIKU55_LONG: Price = { input: 0.50, output: 2.50, cacheWrite: 0.625, cacheRead: 0.05 };
const HAIKU45: Price = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.10 };
const NOVA_LITE: Price = { input: 0.06, output: 0.24, cacheWrite: 0, cacheRead: 0 };

export type PriceModel = 'haiku-5.5' | 'haiku-4.5' | 'nova-lite';

/** 한 호출의 비용(USD). 알 수 없는 usage 는 0 으로 본다. */
export function costOf(usage: Partial<TokenUsage> | null | undefined, model: PriceModel): number {
    if (!usage) return 0;
    const u = { ...ZERO_USAGE, ...usage };
    let p: Price;
    if (model === 'haiku-5.5') {
        const prompt = u.input + u.cacheRead + u.cacheWrite;
        p = prompt > 100_000 ? HAIKU55_LONG : HAIKU55_LOW;
    } else if (model === 'nova-lite') p = NOVA_LITE;
    else p = HAIKU45;
    const usd = (u.input * p.input + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead + u.output * p.output) / 1_000_000;
    return Number.isFinite(usd) ? usd : 0;
}

/**
 * 크레딧 주기 id — 매월 6일(UTC)부터 다음 달 5일까지가 한 주기. 6일 이전이면 «지난달 주기».
 * 예: 2026-10-10 → '2026-10', 2026-11-05 → '2026-10', 2026-11-06 → '2026-11'.
 */
export function periodId(now: Date = new Date()): string {
    let y = now.getUTCFullYear();
    let m = now.getUTCMonth() + 1;
    if (now.getUTCDate() < CREDIT_RENEW_DAY) {
        m -= 1;
        if (m === 0) { m = 12; y -= 1; }
    }
    return `${y}-${String(m).padStart(2, '0')}`;
}

/** 다음 갱신 시각(UTC) — 서킷 브레이커 «소진» 상태를 이 시각까지만 유지하는 데 쓴다. */
export function nextRenewal(now: Date = new Date()): Date {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const thisMonth = new Date(Date.UTC(y, m, CREDIT_RENEW_DAY));
    return now.getTime() < thisMonth.getTime() ? thisMonth : new Date(Date.UTC(y, m + 1, CREDIT_RENEW_DAY));
}

/** 이 달 누적액이 한도에 닿았는가 */
export function overCap(spentUsd: number, cap: number = LEDGER_CAP_USD): boolean {
    return Number.isFinite(spentUsd) && spentUsd >= cap;
}
