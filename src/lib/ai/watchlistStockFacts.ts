import { rowSpot, formatLevelPrice } from '@/lib/optionLevelGate';
import { cashSessionPhaseAt, etDateOf, etMinutesOf, isNonTradingDay, sessionCloseMinutes } from '@/lib/marketCalendar';
import { lastClosedSessionDate, etWallTimeToMs, shiftDate } from '@/lib/marketSession';
import type { LineFacts } from './watchlistLine';
import type { AiLineLocale } from '@/lib/app/watchlistAiLine';

export const STOCK_CONTRACT_VERSION = 3;
export type StockSession = 'pre' | 'reg' | 'post' | 'closed' | 'reference';
export const STOCK_SESSION_LABELS: Record<StockSession, Record<AiLineLocale, string>> = {
    pre: { ko: '장전', en: 'pre-market', ja: '寄り前' },
    reg: { ko: '정규장', en: 'regular session', ja: '通常取引' },
    post: { ko: '시간외', en: 'after-hours', ja: '時間外' },
    closed: { ko: '직전 종가', en: 'last close', ja: '直近終値' },
    reference: { ko: '기준가', en: 'reference quote', ja: '基準値' },
};
export interface StockQuoteFact {
    subject: string;
    /** 기록용(저장본). 모델에게는 주지 않는다 — 36시간 저장되는 글에 «지금 가격»을 박으면 몇 분 뒤 틀린 숫자가 된다(행 위에 실시간 가격이 이미 있다). */
    price: number;
    changePct: number | null;
    session: StockSession;
    comparisonBasis: 'previous-regular-close' | 'regular-close' | 'unknown';
    sessionDate: string | null;
    /** 배치 행은 원시세 관측 시각을 제공하지 않는다. 입력 수집 시각을 관측 시각으로 둔갑시키지 않는다. */
    observedAt: null;
    inputAsOf: string;
}
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export function buildStockQuote(ticker: string, rt: any, nowMs: number): StockQuoteFact {
    const raw = String(rt.session || '').toLowerCase();
    const extended = (raw === 'pre' || raw === 'post') && finite(rt.extendedPrice) && rt.extendedPrice > 0;
    const session: StockSession = extended ? raw as 'pre' | 'post'
        : raw === 'reg' || raw === 'regular' ? 'reg' : ['pre', 'post', 'closed'].includes(raw) ? 'closed' : 'reference';
    const change = extended ? rt.extendedChangePct : rt.changePct;
    const missing = !extended && Array.isArray(rt.missingFields) && rt.missingFields.includes('changePct');
    return {
        subject: ticker, price: rowSpot(rt)!, changePct: !missing && finite(change) ? Number(change.toFixed(2)) : null,
        session, comparisonBasis: session === 'reference' ? 'unknown' : extended ? 'regular-close' : 'previous-regular-close',
        sessionDate: session === 'reference' ? null : session === 'closed' ? lastClosedSessionDate(nowMs) : etDateOf(nowMs),
        observedAt: null, inputAsOf: new Date(nowMs).toISOString(),
    };
}

const POST_END_MIN = 20 * 60;
const REG_OPEN_MIN = 9 * 60 + 30;
/** 다음 정규장 개장(ET) — 그 시점이 거래일 09:30 전이면 그날, 아니면 다음 거래일. */
function nextRegularOpenMs(ms: number): number {
    let d = etDateOf(ms);
    if (isNonTradingDay(d) || etMinutesOf(ms) >= REG_OPEN_MIN) d = shiftDate(d, 1);
    for (let i = 0; i < 12 && isNonTradingDay(d); i++) d = shiftDate(d, 1);
    return etWallTimeToMs(d, REG_OPEN_MIN);
}

/**
 * 세션 표현(«NVDA 장전 …»)이 참인 마지막 시각 — 저장 시각(atMs) 기준.
 *   pre  → 그날 09:30 ET · reg → 그날 정규장 마감(조기 폐장 13:00) · post → 그날 20:00 ET
 *   closed(직전 종가) → 다음 정규장 개장 · reference(세션 미상) → 30분
 * 관문 10241926 ②: 08:00 ET 장전 저장본이 12:00 ET 에도 «장전»으로 나갔다 — 세션이 바뀌면 해석을 내리고 다시 만든다.
 */
export function quoteSessionValidUntil(q: QuoteSessionRef, atMs: number): number {
    // 기준 시각 = 시세를 «수집한» 시각(저장 시각보다 이르면 그쪽) — 09:29:58 에 수집한 «직전 종가» 행을 09:30:02 에 저장해도
    //   기한은 09:30(오늘 개장)이다(관문 10242158 ②: 저장 시각으로 세면 다음 날 개장까지 살아 정오에도 «직전 종가»가 나갔다)
    const base = quoteBaseMs(q, atMs);
    const d = etDateOf(base);
    switch (q.session) {
        case 'pre': return etWallTimeToMs(d, REG_OPEN_MIN);
        case 'reg': return etWallTimeToMs(d, sessionCloseMinutes(d));
        case 'post': return etWallTimeToMs(d, POST_END_MIN);
        // «직전 종가»는 정규장 시간에 수집한 행이면 거짓(시세 원천의 세션 전환 지연) — 바로 만료(관문 10242207 ②)
        case 'closed': return cashSessionPhaseAt(base) === 'regular' ? base : nextRegularOpenMs(base);
        default: return base + 30 * 60_000;
    }
}
type QuoteSessionRef = Pick<StockQuoteFact, 'session'> & { inputAsOf?: string };
function quoteBaseMs(q: QuoteSessionRef, atMs: number): number {
    const input = Date.parse(q.inputAsOf ?? '');
    return Number.isFinite(input) ? Math.min(input, atMs) : atMs;
}

/** 저장본의 세션이 «지금»도 맞나 — 저장 시각부터 그 세션 끝 전까지만. 세션이 안 맞는 저장본은 해석을 내보내지 않는다. */
export function quoteSessionLive(q: QuoteSessionRef | null | undefined, atMs: number, nowMs: number): boolean {
    if (!q || !Number.isFinite(atMs)) return false;
    return nowMs >= quoteBaseMs(q, atMs) - 60_000 && nowMs < quoteSessionValidUntil(q, atMs);
}

/** 새 공급사 호출 없이, 지도 한 벌과 이미 수집한 종목 근거만 묶는다. 가격·등락 숫자는 싣지 않는다(위 StockQuoteFact.price 참고). */
export function stockFactsOf(f: LineFacts) {
    return {
        contractVersion: STOCK_CONTRACT_VERSION, subject: f.ticker,
        quote: { subject: f.ticker, session: f.quote.session, sessionLabel: STOCK_SESSION_LABELS[f.quote.session], sessionDate: f.quote.sessionDate, note: 'The app row shows the live price and % change. Do not write them.' },
        levels: f.order.map(id => ({ id, subject: f.ticker, price: formatLevelPrice(f.lv[id]), side: f.sides[id], chainDate: f.chain, expiry: f.expiry })),
        offExchange: f.darkPool ? { ...f.darkPool, subject: f.ticker, basis: 'FINRA off-exchange share; not net buying' } : null,
        impliedMove: f.implied ? { ...f.implied, subject: f.ticker, basis: 'ATM straddle; not a forecast' } : null,
        topEvidence: f.topLine || null,
        reportsAndEvents: (f.contextText || '').split('\n').filter(Boolean),
    };
}
