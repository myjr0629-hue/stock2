/**
 * [T12 · 감사 10/23 M1] 재무(P/E·시총·점수) «세션 기준» — 새 공식 종가가 확정되면 원천을 한 번 다시 읽고, 그 사실을 값과 함께 저장한다.
 *
 * [사고] 10/25(토) 운영: NVDA /api/live/fundamentals pe 26.4·시총 5.084T(10/23 종가 210.96 기준) vs /api/command/unified
 *   pe 26.5·시총 5.114T(10/22 종가 212.21 기준 — unified 캐시 40시간 묵음). 두 값 모두 같은 원천(공급사 marketcap ÷ TTM 순이익)인데
 *   «언제 읽었나»가 달랐다. 재무 SWR 은 저장 시각 6시간으로만 신선도를 판정하고, unified 캐시는 «값이 있으면 usable»이라 다시 안 읽는다.
 *   웹 종목 화면은 unified 의 fundamentals 만, 앱 cmd 는 직접 재무 API 를 먼저 쓴다 → 같은 종목 두 화면 두 값.
 *
 * [규칙 — 최소 범위(관문 10250533 뒤 축소: 강제 재조회·저장 규칙 변경은 뺐다 — 공급사 어댑터가 실패를 빈 응답으로 바꾸고, 인스턴스 간
 *   «종목·세션당 1회»를 보장할 공유 잠금이 없어 별도 과제)]
 *   ① 기준 세션 S = 마지막으로 끝난 정규장 중 그 종목의 «공식» 종가(M7 peekOfficialSessionClose — 15:57 캡처 제외)가 적재된 세션.
 *      공식 값이 아직 없으면 S 없음(마감 시각 도달만으로 확정하지 않는다).
 *   ② 직접 재무 API 가 공급사에서 «방금» 읽은 정상 결과(시총 있음·NO_DATA 아님)에만 `_sourceCheckedAfter = S` 를 함께 저장한다(DynamoDB 수확본·빈 결과는 표식 없음).
 *      값을 다시 계산하지 않는다(반올림된 P/E·FCF 로 분모를 역산하지 않는다 — 과거 관문 지적). 재조회 주기(SWR 6시간)·저장 규칙은 예전 그대로.
 *   ③ 표시 경로(command/unified 출구·종목 SSR)는 저장된 재무 SWR 항목을 «읽기만» 해서, 표식이 unified 사본 이상이면 값·점수 필드를 그 값으로
 *      → 앱(직접 API)·웹(unified) 이 같은 값. 표식 없는 항목은 쓰지 않는다(unified 사본 그대로).
 *   ④ 웹만 보는 종목도 갱신 기회 — 저장 항목이 없거나 6시간이 지났으면 unified 출구가 응답 뒤 직접 API 를 한 번(인스턴스 안 종목당 10분) — 그 API 의
 *      예전 규칙(만료면 원천 재조회)대로. 새 원천 호출 규칙은 만들지 않는다.
 *   ⛔ 화면 라벨·문구·점수 기준 불변 · unified 출구는 벤더 0·쓰기 0.
 */
import { getFromCache } from '@/services/redisClient';
import { peekOfficialSessionClose } from '@/services/intrinioClient';
import { etLastClosedSessionDate, prevTradingDate } from '@/lib/marketCalendar';

export const FUNDAMENTALS_SWR_KEY = (ticker: string) => `swr:fundamentals:v4:${String(ticker).toUpperCase()}`;
export const SOURCE_CHECKED_AFTER = '_sourceCheckedAfter' as const;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** ① 그 종목의 공식 종가가 적재된 마지막 끝난 세션 — 아직이면 null. 상한 안에 못 읽으면 null(=강제 재조회 없음, 기존 6시간 규칙만). */
export async function confirmedCloseSession(ticker: string, nowMs: number = Date.now(), budgetMs = 1500): Promise<string | null> {
    const T = String(ticker || '').toUpperCase();
    if (!T) return null;
    const session = etLastClosedSessionDate(nowMs);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const pair = await Promise.race([
            peekOfficialSessionClose(T, session, prevTradingDate(session)).catch(() => null),
            new Promise<null>((r) => { timer = setTimeout(() => r(null), budgetMs); }),
        ]);
        return pair && pair.close > 0 ? session : null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export const sourceCheckedAfter = (data: any): string | null =>
    typeof data?.[SOURCE_CHECKED_AFTER] === 'string' && ISO.test(data[SOURCE_CHECKED_AFTER]) ? data[SOURCE_CHECKED_AFTER] : null;

// ④ 출구에서 덮는 필드 — 원천 결과의 값·점수 «그대로»(null 도 그대로: 적자 전환 P/E null 을 옛 양수로 남기지 않는다)
const VALUATION_KEYS = ['score', 'grade', 'breakdown', 'pe', 'de', 'roe', 'revenueGrowth', 'netMargin', 'fcfYield', 'pb', 'ps', 'marketCap', '_incomeMetricsVersion', SOURCE_CHECKED_AFTER] as const;

const SWR_MEMO_MS = 60_000;
const swrMemo = new Map<string, { at: number; value: any }>();
export function _resetFundamentalsMemoForTest(): void { swrMemo.clear(); }

/** ④ unified 의 fundamentals 사본을 저장된 재무 SWR 항목(표식 있는 것)으로 맞춘다 — 바꿀 것이 없으면 같은 객체. 읽기만(벤더 0·쓰기 0). */
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
    const srcSession = sourceCheckedAfter(src);
    if (!srcSession || src?._incomeMetricsVersion !== 1 || (src?.ticker && String(src.ticker).toUpperCase() !== T)) return fundamentals;
    const mine = sourceCheckedAfter(fundamentals);
    if (mine && mine > srcSession) return fundamentals;   // unified 사본이 더 새 세션 — 그대로
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

// ⑤(=규칙 ④) 웹(unified 만 읽는 화면)도 갱신 기회 — 저장된 직접 재무 API 항목이 없거나 SWR 신선 기간(6시간)이 지났으면
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
