// ============================================================================
// [T51 · 2026-11-06] 섹터 스냅샷 «저장» 전용 종가 선택 — 다른 화면의 가격 판정(resolveSessionPrices)과 무관하다.
//
// 11/6 실측(signum-work/2026-11-06/sector-close/RESULT.md): 실시간 close_price 는 3단계 —
//   ① 마감 직후(~16:13 ET) 직전 거래일 공식 종가 ② 16:15~16:28 ET 잠정값(±0.116%) ③ 16:31 ET 표본부터 21/21 공식 일봉과 동일.
// 그래서 마감 + 40분(16:40 ET · 조기 폐장 13:40 ET) 이후에만 쓰고, 날짜·전일 종가·2% 한도를 확인한다.
// close_price == 전일 종가(①의 상태)면 쓰지 않고 기존 값을 유지한다(held_prev_close 로 집계).
// 크론(vercel.json)은 21:42Z~22:00Z — EST 16:42 ET · EDT 17:42 ET, 두 계절 모두 이 창 안이다.
// ============================================================================

import { etDateOf, etMinutesOf, isNonTradingDay, prevTradingDate, sessionCloseMinutes } from '@/lib/marketCalendar';

export interface RealtimeCloseFields {
    close_price?: unknown;
    normal_market_hours_last_price?: unknown;
    normal_market_hours_last_time?: unknown;
    eod_close_price?: unknown;
    eod_close_date?: unknown;
}

export interface SnapshotPriceInput {
    /** 실시간 응답(없으면 null) */
    rt: RealtimeCloseFields | null | undefined;
    /** 지금(ms) */
    nowMs: number;
    /** 기존 경로가 준 값 */
    price: number | null;
    changePct: number | null;
}

export interface SnapshotPriceResult {
    price: number | null;
    changePct: number | null;
    basis: 'rt_close_price' | 'current';
    heldPrevClose?: boolean;
}

/** 경매가와 정규장 마지막 체결이 이 비율보다 벌어지면 응답 이상으로 보고 쓰지 않는다. */
export const CLOSE_PRICE_SANITY = 0.02;

const pos = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
};

/** 마감 뒤 close_price 를 믿기 전 기다리는 분(11/6 전환 상한 16:31 ET + 여유 9분). */
export const CLOSE_PRICE_SETTLE_MIN = 40;

/** 지금(ET) 거래일이고 그날 마감 + 40분 이후인가 — 아니면 실시간 종가를 조회도·사용도 하지 않는다. */
export function snapshotCloseWindowOpen(nowMs: number): boolean {
    const today = etDateOf(nowMs);
    return !isNonTradingDay(today) && etMinutesOf(nowMs) >= sessionCloseMinutes(today) + CLOSE_PRICE_SETTLE_MIN;
}

/**
 * 스냅샷 저장(POST) 허용 — 운영(production)에서 CRON_SECRET 이 있으면 «Authorization: Bearer <CRON_SECRET>» 만.
 * 크론 라우트들(/api/cron/*)과 같은 규칙. 비밀값이 없거나 운영이 아니면(로컬 시험) 허용.
 */
export function snapshotPostAuthorized(authHeader: string | null, cronSecret: string | undefined, nodeEnv: string | undefined): boolean {
    if (nodeEnv !== 'production' || !cronSecret) return true;
    return authHeader === `Bearer ${cronSecret}`;
}

export function pickSnapshotClose(i: SnapshotPriceInput): SnapshotPriceResult {
    const current: SnapshotPriceResult = { price: i.price, changePct: i.changePct, basis: 'current' };
    const rt = i.rt;
    if (!rt) return current;

    const today = etDateOf(i.nowMs);
    if (!snapshotCloseWindowOpen(i.nowMs)) return current;

    const lastTimeMs = typeof rt.normal_market_hours_last_time === 'string' ? Date.parse(rt.normal_market_hours_last_time) : NaN;
    if (!Number.isFinite(lastTimeMs) || etDateOf(lastTimeMs) !== today) return current;

    const close = pos(rt.close_price);
    const regLast = pos(rt.normal_market_hours_last_price);
    if (close == null || regLast == null) return current;
    const prev = pos(rt.eod_close_price);
    const prevDate = typeof rt.eod_close_date === 'string' ? rt.eod_close_date.slice(0, 10) : '';
    if (prev == null || prevDate !== prevTradingDate(today)) return current;
    if (close === prev) return { ...current, heldPrevClose: true };
    if (Math.abs(close / regLast - 1) > CLOSE_PRICE_SANITY) return current;

    return { price: close, changePct: ((close - prev) / prev) * 100, basis: 'rt_close_price' };
}
