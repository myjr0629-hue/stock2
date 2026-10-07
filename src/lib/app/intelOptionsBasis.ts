/**
 * 앱 Intel 의 옵션 지표(GEX · P/C) «기준» — 한 곳 (2026-10-07, 앱 강화 정확성 2차)
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────────────────────────────
 *   같은 «PCR·GEX» 숫자가 생산자·만기 범위·시각에 따라 달랐다(운영 실측):
 *     · 미결제약정 P/C — 분석 캐시/구조 = «주간 만기 1개»(W) · 수집 Lambda(DynamoDB gex) = «35일 이내 전 만기 합계»(T). NVDA 1.06 · 0.78 · 0.84.
 *     · Intel 섹터 응답은 분석 캐시(W, 마감 후 구조 빌드 시각)가 살아 있는 동안 W, 그날(ET) 자정에 분석 캐시가 «다른 거래일»로 만료되면 DynamoDB(T)로 바뀌었다
 *       → 한국 시각 13시(ET 00시)를 지나면 섹터 전체의 GEX 부호가 뒤집혔다(10/7 physical_ai 7종목 숏 → 롱).
 *   결정(운영 세션 10/7): 화면의 «P/C(미결제약정)» = 수집 Lambda DynamoDB gex 최신 행(35일 이내 전체 만기 합계) 하나. 주간 만기 1개 값은 «주간 만기 P/C» 로 이름을 나눈다.
 *   앱 Intel 의 GEX 도 같은 최신 행(Command 의 DynamoDB 경로와 같은 값)으로 읽는다 — 한 카드의 두 숫자가 서로 다른 만기 범위가 되지 않게.
 *   알파 점수 입력(배치 pcr)은 바꾸지 않는다 — 이 모듈은 «화면 표시»만 정한다.
 *
 * ── P/C 색 문턱: 앱 전체 하나 ─────────────────────────────────────────────────────────────────────
 *   예전엔 카드마다 달랐다 — 섹터 게이지 0.95/1.05 · 종목 상세 0.8/1.1 · 섹터 리포트·종목 표 0.7/1.2. 같은 1.00 이 어떤 카드에선 초록, 다른 카드에선 노랑이었다.
 *   이제 Flow 화면의 점수·카드가 쓰는 문턱(lib/putCall.pcLean)과 같다: 0.75 이하 = 콜 우위(초록) · 1.3 이상 = 풋 우위(빨강) · 사이 = 균형.
 *   근거: ① 앱에 문턱 체계가 둘이면 같은 값이 탭마다 다른 색이 된다 ② 개별 종목의 미결제약정은 콜이 풋보다 많은 게 보통이라(중앙값 0.8 안팎) 1.0 을 기준선으로 쓰면
 *   «균형»이 사실상 없다 ③ Flow 의 P/C 점수(≥2.0·≥1.3·≤0.5·≤0.75)가 이미 이 구간을 쓴다.
 *
 * 순수 함수 — 시험 tests/intelOptionsBasis.test.ts.
 */
import { pcLean } from '@/lib/putCall';
import { etTradingDateOf, etLastClosedSessionDate } from '@/lib/marketCalendar';

export const PCR_CALL_MAX = 0.75;
export const PCR_PUT_MIN = 1.3;

export type PcrTone = 'call' | 'balanced' | 'put';

/** P/C → 우위 구간. 값이 없으면 null(색·판정 없음). 문턱은 lib/putCall.pcLean 한 곳. */
export function pcrTone(pc: number | null | undefined): PcrTone | null {
    const lean = pcLean(pc);
    if (lean == null) return null;
    return lean === 'strongCall' || lean === 'call' ? 'call' : lean === 'strongPut' || lean === 'put' ? 'put' : 'balanced';
}

export const PCR_TONE_COLOR = { call: '#10b981', balanced: '#e2e8f0', put: '#ef4444', unknown: '#94a3b8' } as const;

/** 값 → 글자색(없으면 muted). 모든 PCR 칸이 이 함수 하나를 쓴다. */
export function pcrColor(pc: number | null | undefined): string {
    const tone = pcrTone(pc);
    return tone ? PCR_TONE_COLOR[tone] : PCR_TONE_COLOR.unknown;
}

/** 수집 Lambda DynamoDB gex 행의 P/C — row.pcr 우선, 없으면 풋 OI ÷ 콜 OI. 0 이하·비정상은 null(못 쟀다). */
export function oiPcrAllExpiries(row: any): number | null {
    if (!row || typeof row !== 'object') return null;
    const p = Number(row.pcr);
    if (row.pcr != null && Number.isFinite(p) && p > 0) return Math.round(p * 100) / 100;
    const c = Number(row.totalCallOI);
    const u = Number(row.totalPutOI);
    return Number.isFinite(c) && Number.isFinite(u) && c > 0 && u >= 0 ? Math.round((u / c) * 100) / 100 : null;
}

/** 수집 Lambda DynamoDB gex 행의 GEX(달러) — 유한수만. 0 은 «측정된 0» 이 아니라 없는 것으로 보지 않는다(정확히 0 이면 그대로 0). */
export function gexFromRow(row: any): number | null {
    if (!row || typeof row !== 'object' || row.gex == null) return null;
    const g = Number(row.gex);
    return Number.isFinite(g) ? g : null;
}

/**
 * 수집 행이 «아직 쓸 만큼 신선한가» — 행 시각이 5일(주말·3일 연휴 포함) 안이어야 한다.
 * 수집 Lambda 목록에서 빠졌거나 멈춘 종목은 옛 행이 «최신 행»으로 남는다(RGTI: 8/28 행이 10/7 에도 최신) — 그 값을 지금 값처럼 그리지 않는다(null → «—»).
 */
export const OPTIONS_ROW_MAX_AGE_MS = 5 * 24 * 3600_000;
export function isFreshOptionsRow(asOfMs: number | null | undefined, nowMs: number = Date.now()): boolean {
    return typeof asOfMs === 'number' && Number.isFinite(asOfMs) && asOfMs > 0 && nowMs - asOfMs >= -3600_000 && nowMs - asOfMs <= OPTIONS_ROW_MAX_AGE_MS;
}

/** 행 시각(ms) → 그 값이 속한 정규장 날짜(ET 거래일). 시각이 없으면 null. */
export function optionsSessionDate(asOfMs: number | null | undefined): string | null {
    if (typeof asOfMs !== 'number' || !Number.isFinite(asOfMs) || asOfMs <= 0) return null;
    return etTradingDateOf(asOfMs);
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export type OptionsAsOf = { session: string; label: string; isPriorSession: boolean } | null;

/**
 * 옵션 지표(GEX·P/C)의 기준 표기 — «10/6 마감 기준».
 *   · 지금 정규장이 열려 있고 값이 «오늘 세션»의 것이면 표기하지 않는다(null) — 실시간 갱신 값이다.
 *   · 그 밖(장 전·마감 후·휴장·주말)에는 값이 속한 세션의 «마감 기준»을 말한다.
 *   · 값의 세션이 «마지막으로 끝난 세션»보다 앞이면 «이전 세션»임을 덧붙인다(수집이 밀렸거나 개장 직후 아직 새 행이 없을 때).
 * marketOpen = 지금 정규장이 열려 있는가(휴장일 제외).
 */
export function optionsAsOfNote(asOfMs: number | null | undefined, nowMs: number, marketOpen: boolean, locale: string): OptionsAsOf {
    const session = optionsSessionDate(asOfMs);
    if (!session) return null;
    const today = etTradingDateOf(nowMs);
    const lastClosed = etLastClosedSessionDate(nowMs);
    if (marketOpen && session === today) return null;
    const isPriorSession = marketOpen ? session < today : session < lastClosed;
    const m = md(session);
    const base = locale === 'ko' ? `${m} 마감 기준` : locale === 'ja' ? `${m} 引け基準` : `as of ${m} close`;
    const prior = locale === 'ko' ? ' · 이전 세션' : locale === 'ja' ? ' · 前セッション' : ' · prior session';
    return { session, label: isPriorSession ? base + prior : base, isPriorSession };
}

/** 여러 시세 행의 옵션 기준 시각 중 가장 최근 값(없으면 null) */
export function latestOptionsAsOf(rows: Array<{ optionsAsOf?: number | null }>): number | null {
    let best: number | null = null;
    for (const r of rows) {
        const v = r?.optionsAsOf;
        if (typeof v === 'number' && Number.isFinite(v) && v > 0 && (best == null || v > best)) best = v;
    }
    return best;
}
