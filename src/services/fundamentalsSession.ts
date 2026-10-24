/**
 * [T12 · 감사 10/23 M1] 재무(P/E·시총·점수) — 앱(직접 재무 API)과 웹(command/unified)이 «같은 원천의 가장 늦게 읽은 값»을 보여 주게 한다.
 *
 * [사고] 10/25(토) 운영: NVDA /api/live/fundamentals pe 26.4·시총 5.084T(10/23 종가 210.96 기준) vs /api/command/unified
 *   pe 26.5·시총 5.114T(10/22 종가 212.21 기준 — unified 캐시 40시간 묵음). 두 값 모두 같은 원천(공급사 marketcap ÷ TTM 순이익)인데
 *   «언제 읽었나»가 달랐다. unified 캐시는 «값이 있으면 usable»이라 세션이 바뀌어도 fundamentals 를 다시 안 받는다.
 *   웹 종목 화면은 unified 의 fundamentals 만, 앱 cmd 는 직접 재무 API 를 먼저 쓴다 → 같은 종목 두 화면 두 값.
 *
 * [규칙 — 최소 범위(관문 10250533·10250551 뒤 축소)]
 *   ① 직접 재무 API 가 공급사 경로로 얻은 정상 결과(시총 있음·NO_DATA 아님)에 «읽은 시각» `_sourceFetchedAt`(ms)을 함께 저장한다.
 *      «어느 세션 종가 기준인가»는 주장하지 않는다 — 공급사 어댑터의 1시간 공유 캐시 적중도 «새 조회»로 보이므로 세션 표식은 거짓일 수 있다(관문 10250551 ①).
 *      DynamoDB 수확본·빈 결과는 표식 없음(관문 10250533 ①②). 값을 다시 계산하지 않는다(반올림 역산 0). 재조회 주기(SWR 6시간)·저장 규칙은 예전 그대로.
 *   ② 표시 경로(command/unified 출구·종목 SSR)는 저장된 재무 SWR 항목을 «읽기만» 해서, 그 항목이 unified 사본보다 «늦게 읽은» 것이면
 *      (사본에 표식이 없거나 더 이른 시각) 값·점수 필드를 그 값으로 — 더 늦게 읽은 사본은 그대로(역행 0 — 관문 10250551 ②).
 *   ③ 웹만 보는 종목도 갱신 기회 — 저장 항목이 없거나 6시간이 지났으면 unified 출구가 응답 뒤 직접 API 를 한 번(인스턴스 안 종목당 10분) — 그 API 의
 *      예전 규칙(만료면 원천 재조회)대로. 새 원천 호출 규칙은 만들지 않는다.
 *   ⛔ 화면 라벨·문구·점수 기준 불변 · unified 출구는 벤더 0·쓰기 0.
 *   남은 것(별도 과제): 공급사 시총 자체가 몇 시간 늦을 수 있음(SWR 6시간 + 어댑터 1시간) · 공식 종가 확정 뒤 강제 재조회는 인스턴스 간 공유 잠금이 필요.
 */
import { getFromCache } from '@/services/redisClient';

export const FUNDAMENTALS_SWR_KEY = (ticker: string) => `swr:fundamentals:v4:${String(ticker).toUpperCase()}`;
export const SOURCE_FETCHED_AT = '_sourceFetchedAt' as const;

export const sourceFetchedAt = (data: any): number | null => {
    const v = data?.[SOURCE_FETCHED_AT];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
};

// ② 출구에서 덮는 필드 — 원천 결과의 값·점수 «그대로»(null 도 그대로: 적자 전환 P/E null 을 옛 양수로 남기지 않는다)
const VALUATION_KEYS = ['score', 'grade', 'breakdown', 'pe', 'de', 'roe', 'revenueGrowth', 'netMargin', 'fcfYield', 'pb', 'ps', 'marketCap', '_incomeMetricsVersion', SOURCE_FETCHED_AT] as const;

const SWR_MEMO_MS = 15_000;   // 직접 API 가 막 갱신한 항목을 오래 놓치지 않게 짧게(관문 10250551 ②)
const swrMemo = new Map<string, { at: number; value: any }>();
export function _resetFundamentalsMemoForTest(): void { swrMemo.clear(); }

/** ② unified 의 fundamentals 사본을 저장된 재무 SWR 항목(더 늦게 읽은 것)으로 맞춘다 — 바꿀 것이 없으면 같은 객체. 읽기만(벤더 0·쓰기 0). */
export async function alignFundamentalsToSource<T = any>(fundamentals: T, ticker: string | null | undefined, nowMs: number = Date.now(), budgetMs = 800): Promise<T> {
    const T = String(ticker || '').toUpperCase();
    if (!T || !fundamentals || typeof fundamentals !== 'object') return fundamentals;
    let entry: any;
    const hit = swrMemo.get(T);
    if (hit && nowMs - hit.at >= 0 && nowMs - hit.at < SWR_MEMO_MS) entry = hit.value;
    else {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const read = getFromCache<any>(FUNDAMENTALS_SWR_KEY(T)).catch(() => undefined);
        entry = await Promise.race([read, new Promise<undefined>((r) => { timer = setTimeout(() => r(undefined), budgetMs); })]);
        if (timer) clearTimeout(timer);
        if (entry === undefined) return fundamentals;   // 못 읽음 — 기억하지 않고 그대로
        if (swrMemo.size > 2000) swrMemo.clear();
        swrMemo.set(T, { at: nowMs, value: entry ?? null });
    }
    const src = entry?.data;
    const srcAt = sourceFetchedAt(src);
    if (srcAt == null || src?._incomeMetricsVersion !== 1 || (src?.ticker && String(src.ticker).toUpperCase() !== T)) return fundamentals;
    const mine = sourceFetchedAt(fundamentals);
    if (mine != null && mine >= srcAt) return fundamentals;   // unified 사본이 같거나 더 늦게 읽은 값 — 그대로(역행 0)
    const out: any = { ...(fundamentals as any) };
    let changed = false;
    for (const k of VALUATION_KEYS) {
        const v = k in src ? src[k] : null;
        if (JSON.stringify(out[k] ?? null) !== JSON.stringify(v ?? null)) { out[k] = v ?? null; changed = true; }
    }
    // 이름·섹터 등 원천 결과에 없는 회사 정보는 unified 사본 그대로(값이 있을 때만 채운다)
    for (const k of ['name', 'sector']) if ((out[k] == null || out[k] === T) && src[k] != null && src[k] !== out[k]) { out[k] = src[k]; changed = true; }
    return changed ? (out as T) : fundamentals;
}

// ③ 웹(unified 만 읽는 화면)도 갱신 기회 — 저장된 직접 재무 API 항목이 없거나 SWR 신선 기간(6시간)이 지났으면
//   unified 출구가 응답 «뒤»(after) 직접 재무 API 를 한 번 부른다. 재조회 여부·저장은 그 API 의 예전 규칙대로. 인스턴스 안 종목당 10분에 한 번만.
const SWR_FRESH_MS = 21600 * 1000;
const KICK_RETRY_MS = 10 * 60_000;
const kicked = new Map<string, number>();
export function _resetKickForTest(): void { kicked.clear(); }

/** 방금 alignFundamentalsToSource 가 읽은(메모) 항목 기준 — 직접 재무 API 를 응답 뒤 한 번 불러야 하나 */
export function shouldKickSourceRecheck(ticker: string | null | undefined, nowMs: number = Date.now()): boolean {
    const T = String(ticker || '').toUpperCase();
    if (!T) return false;
    const hit = swrMemo.get(T);
    if (!hit || !(nowMs - hit.at >= 0 && nowMs - hit.at < SWR_MEMO_MS)) return false;   // 못 읽은 상태로는 판단하지 않는다
    const ts = Number(hit.value?.timestamp);
    if (hit.value?.data && Number.isFinite(ts) && nowMs - ts >= 0 && nowMs - ts <= SWR_FRESH_MS) return false;   // 신선한 항목 — 부를 일 없음
    const last = kicked.get(T);
    if (last != null && nowMs - last >= 0 && nowMs - last < KICK_RETRY_MS) return false;
    if (kicked.size > 5000) kicked.clear();
    kicked.set(T, nowMs);
    return true;
}
