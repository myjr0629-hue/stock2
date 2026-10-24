import { rowSpot, formatLevelPrice } from '@/lib/optionLevelGate';
import { etDateOf } from '@/lib/marketCalendar';
import { lastClosedSessionDate } from '@/lib/marketSession';
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

/** 새 공급사 호출 없이, 지도 한 벌과 이미 수집한 종목 근거만 묶는다. */
export function stockFactsOf(f: LineFacts) {
    return {
        contractVersion: STOCK_CONTRACT_VERSION, subject: f.ticker, quote: f.quote,
        sessionLabels: STOCK_SESSION_LABELS[f.quote.session],
        levels: f.order.map(id => ({ id, subject: f.ticker, price: formatLevelPrice(f.lv[id]), side: f.sides[id], chainDate: f.chain, expiry: f.expiry })),
        offExchange: f.darkPool ? { ...f.darkPool, subject: f.ticker, basis: 'FINRA off-exchange share; not net buying' } : null,
        impliedMove: f.implied ? { ...f.implied, subject: f.ticker, basis: 'ATM straddle; not a forecast' } : null,
        topEvidence: f.topLine || null,
        reportsAndEvents: (f.contextText || '').split('\n').filter(Boolean),
    };
}
