// src/lib/price/extendedLive.ts
// ============================================================================
// ★ [2026-10-12] 시간외(PRE·POST) 칸의 «지금 값» — 한 곳의 계산(서버 /api/live/quotes · 앱 useLivePrice · 목록 liveQuote · calcPriceDisplay)
//
// 대표 10/12 17:09 KST(04:09 ET) «PRE-MARKET 이라고 나오는데 가격은 변동이 없다» · «15분 지나니까 pre 작동»
//   원인(실측): 우리 Intrinio 구독은 REST·웹소켓 «둘 다 15분 지연»이다 — WS 체결의 수신−체결 = 900~901초,
//   REST source = cboe_one_delayed. 그래서 04:00~04:15 ET 엔 «오늘 프리 체결»이 하나도 없어 화면이 금요일 POST 값을
//   «POST (CLOSED)»로 이었고, 04:15 뒤에도 15분 전 값이었다.
//   수리: 실시간 원천(FMP aftermarket-trade · 수신−체결 10~30초)을 더하고, 후보들 중 «오늘 그 세션 창 안의 가장 새로운 체결»을 고른다.
//     후보 = 가격 허브 틱(ts·src 를 싣는다 — 허브가 실측 지연으로 live/delayed 를 정한다) · 시세 요청 값(extendedTime·extendedSrc)
//     · 서버에선 FMP 체결(live)과 Intrinio 스냅샷 체결(delayed)
//   규칙
//     · 프리(04:00~09:30 ET)·애프터(16:00~20:00 ET) 세션에서만 고른다 — 정규장·마감은 손대지 않는다(PRE CLOSE 잠정값 규칙 10/5 그대로)
//     · 체결 시각이 «오늘(ET) 그 세션 창 안»인 후보만 · 가장 새로운 체결 · 같으면 live 원천 · 체결 시각 없는 허브 틱은 쓰지 않는다
//     · 지연 원천이 이기면 src 'delayed' — 화면은 칸을 유지하고 «체결 시각 ET · 15분 지연»을 단다(숨기지 않는다)
//     · 후보가 없으면 price 0 — 부르는 쪽이 직전 확정값을 «날짜를 붙여»(POST 10/9) 잇는다(extCarryLabel)
// ============================================================================

import { etDateOf, etMinutesOf } from '@/lib/marketCalendar';

export type ExtSrc = 'live' | 'delayed';
export type ExtKind = 'pre' | 'post';

export interface ExtCandidateIn {
    price?: number | null;
    /** 체결 시각 — epoch ms 또는 ISO */
    ts?: number | string | null;
    /** 'live' 만 실시간으로 본다 — 그 밖(없음 포함)은 지연 */
    src?: string | null;
    /** 어디서 왔나(시험·로그용) */
    origin?: string;
}

export interface ExtLiveResult {
    /** 프리·애프터 세션이라 이 규칙이 적용됐다(false 면 부르는 쪽의 기존 규칙) */
    applies: boolean;
    kind: ExtKind | null;
    /** 0 = 오늘 이 세션 체결 없음 */
    price: number;
    timeMs: number | null;
    src: ExtSrc | null;
    origin: string | null;
}

/** 세션 이름(서버 'pre'|'regular'|'post'|'closed' · 화면 'PRE'|'REG'|'POST'|'CLOSED') → 시간외 종류 */
export function extKindOf(session: string | null | undefined): ExtKind | null {
    const v = String(session || '').toLowerCase();
    if (v === 'pre' || v === 'premarket' || v === 'pre-market') return 'pre';
    if (v === 'post' || v === 'afterhours' || v === 'after-hours') return 'post';
    return null;
}

/** ISO·epoch ms → ms (못 읽으면 0) */
export function toMs(v: number | string | null | undefined): number {
    if (v === null || v === undefined || v === '') return 0;
    const ms = typeof v === 'number' ? v : Date.parse(String(v));
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

/** 체결 시각이 «그 날(ET) 그 세션 창» 안인가 — 프리 04:00~09:30 · 애프터 16:00~20:00 (서버 isTradeInExtSession 과 같은 창) */
export function inExtWindow(ms: number, dayET: string, kind: ExtKind): boolean {
    if (!(ms > 0) || etDateOf(ms) !== dayET) return false;
    const m = etMinutesOf(ms);
    return kind === 'pre' ? m >= 240 && m < 570 : m >= 960 && m < 1200;
}

/**
 * 후보들 중 «오늘 그 세션 창 안의 가장 새로운 체결». 같은 시각이면 live 원천, 그다음 앞선 후보.
 *   session: 지금 세션 · todayET: 오늘(ET) 'YYYY-MM-DD'
 */
export function pickExtendedLive(input: {
    session: string | null | undefined;
    todayET: string;
    candidates: readonly (ExtCandidateIn | null | undefined)[];
}): ExtLiveResult {
    const kind = extKindOf(input.session);
    if (!kind) return { applies: false, kind: null, price: 0, timeMs: null, src: null, origin: null };
    let best: { price: number; ms: number; src: ExtSrc; origin: string | null } | null = null;
    for (const c of input.candidates) {
        if (!c) continue;
        const price = Number(c.price);
        const ms = toMs(c.ts ?? null);
        if (!(price > 0) || !inExtWindow(ms, input.todayET, kind)) continue;
        const src: ExtSrc = c.src === 'live' ? 'live' : 'delayed';
        if (!best || ms > best.ms || (ms === best.ms && src === 'live' && best.src !== 'live')) {
            best = { price, ms, src, origin: c.origin ?? null };
        }
    }
    if (!best) return { applies: true, kind, price: 0, timeMs: null, src: null, origin: null };
    return { applies: true, kind, price: best.price, timeMs: best.ms, src: best.src, origin: best.origin };
}

/**
 * 앱 한 종목 — 가격 허브 틱 + 시세 요청(/api/live/quotes) 시간외 값.
 *   허브 틱은 체결 시각(ts)이 있을 때만 후보다(옛 허브의 시각 없는 틱은 «어제 애프터 체결»일 수 있다 — 9/25 함정).
 *   시세 요청 값은 extendedTime 이 체결 시각 · extendedSrc 가 없으면 지연(Intrinio)으로 본다.
 */
export function pickExtendedForApp(input: {
    session: string | null | undefined;
    todayET: string;
    ws?: { price?: number | null; tradeTs?: number | null; src?: string | null } | null;
    rest?: { extendedPrice?: number | null; extendedTime?: string | number | null; extendedSrc?: string | null; extendedKind?: string | null } | null;
}): ExtLiveResult {
    const ws = input.ws && Number(input.ws.tradeTs) > 0
        ? { price: input.ws.price, ts: Number(input.ws.tradeTs), src: input.ws.src, origin: 'ws' }
        : null;
    const rest = input.rest && input.rest.extendedKind !== 'close'
        ? { price: input.rest.extendedPrice, ts: input.rest.extendedTime ?? null, src: input.rest.extendedSrc, origin: 'rest' }
        : null;
    return pickExtendedLive({ session: input.session, todayET: input.todayET, candidates: [rest, ws] });
}

/** 'YYYY-MM-DD' → 'M/D' (못 읽으면 null) */
export function mdOf(ymd: string | null | undefined): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
    return m ? `${Number(m[2])}/${Number(m[3])}` : null;
}

/** 직전 확정값을 잇는 칸의 라벨 — «POST 10/9» (날짜를 모르면 옛 라벨 «POST (CLOSED)») */
export function extCarryLabel(base: 'POST' | 'PRE', ymd: string | null | undefined): string {
    const md = mdOf(ymd);
    return md ? `${base} ${md}` : `${base} (CLOSED)`;
}

/** 지연 원천 표식 — «04:09 ET · 15분 지연» (시각을 모르면 «15분 지연»만) */
export function extDelayedText(hhmm: string | null | undefined, locale: string | null | undefined): string {
    const note = locale === 'ko' ? '15분 지연' : locale === 'ja' ? '15分遅延' : '15-min delayed';
    return hhmm ? `${hhmm} ET · ${note}` : note;
}
