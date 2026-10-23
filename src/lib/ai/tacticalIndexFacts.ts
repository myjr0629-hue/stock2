import type { MarketIndexBasis, IndexObservation } from '@/lib/marketIndexBasis';
import { sessionCloseMinutes, cashSessionPhaseAt } from '@/lib/marketCalendar';
import { etClock, lastClosedSessionDate, isEquityFuturesOpen } from '@/lib/marketSession';

export type TacticalLocale = 'ko' | 'en' | 'ja';
export type TacticalSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';
type Labels = Record<TacticalLocale, string>;
export interface IndexFact {
    id: 'nasdaq' | 'spx' | 'nq' | 'es';
    name: Labels;
    kind: 'spot' | 'futures';
    basis: Labels;
    chgPct: number;
    asOfET: string;
    sessionDate: string | null;
}
export const INDEX_NAMES: Record<IndexFact['id'], Labels> = {
    nasdaq: { ko: '나스닥 종합(현물)', en: 'Nasdaq Composite (spot)', ja: 'ナスダック総合(現物)' },
    spx: { ko: 'S&P500(현물)', en: 'S&P 500 (spot)', ja: 'S&P500(現物)' },
    nq: { ko: '나스닥100 선물', en: 'Nasdaq 100 futures', ja: 'ナスダック100先物' },
    es: { ko: 'S&P500 선물', en: 'S&P 500 futures', ja: 'S&P500先物' },
};
export function tacticalSessionAt(nowMs: number): TacticalSession {
    const phase = cashSessionPhaseAt(nowMs);
    if (phase === 'regular') return 'REG';
    if (phase === 'after-close') return etClock(nowMs).minutes < 1200 ? 'POST' : 'CLOSED';
    return phase === 'pre-open' && etClock(nowMs).minutes >= 240 ? 'PRE' : 'CLOSED';
}
/** Tactical 전용 어댑터. 화면·공통 숫자·수집기를 바꾸지 않는다. */
export function buildIndexFacts(b: MarketIndexBasis | undefined, session: TacticalSession, nowMs: number): IndexFact[] {
    if (!b) return [];
    const facts: IndexFact[] = [];
    const today = etClock(nowMs).date;
    const expectedCashDate = session === 'REG' || cashSessionPhaseAt(nowMs) === 'after-close' ? today : lastClosedSessionDate(nowMs);
    const add = (id: IndexFact['id'], p: IndexObservation, chg: number | null, basis: Labels) => {
        const at = p.asOf ? Date.parse(p.asOf) : NaN;
        if (p.price == null || chg == null || !Number.isFinite(chg) || !Number.isFinite(at) || at > nowMs) return;
        const c = etClock(at);
        facts.push({ id, name: INDEX_NAMES[id], kind: id === 'nq' || id === 'es' ? 'futures' : 'spot', basis, chgPct: chg,
            asOfET: `${c.date} ${String(Math.floor(c.minutes / 60)).padStart(2, '0')}:${String(c.minutes % 60).padStart(2, '0')} ET`, sessionDate: p.sessionDate });
    };
    const cash = () => {
        for (const id of ['nasdaq', 'spx'] as const) {
            const p = b.cash?.[id];
            if (!p) continue;
            if (p.sessionDate !== expectedCashDate || (session === 'REG' && (!p.live || !p.asOf || nowMs - Date.parse(p.asOf) > 20 * 60_000))) continue;
            const date = p.sessionDate;
            add(id, p, p.changePct, { ko: `${date} 정규장: 전 거래일 종가 대비`, en: `${date} cash session vs previous trading close`, ja: `${date}通常取引: 前営業日終値比` });
        }
    };
    const futures = () => {
        if (!isEquityFuturesOpen(nowMs)) return;
        for (const id of ['nq', 'es'] as const) {
            const p = b.futures?.[id];
            if (!p) continue;
            // 공통 수집기의 live는 원관측·마지막 가격 변화 모두 20분 이내여야 참이다. 시각만 전진한 정체 피드는 현재 사실에서 제외한다.
            if (!p.live || p.price == null || !Number.isFinite(p.price) || p.price <= 0 || !p.asOf || nowMs - Date.parse(p.asOf) > 20 * 60_000) continue;
            if (session === 'POST' || session === 'CLOSED') {
                const ref = p.cashCloseReferenceAt ? Date.parse(p.cashCloseReferenceAt) : NaN;
                // 실제 같은 마감 기준 관측이 있을 때만 사용. 부모 수집기는 현재 이 값을 주지 않는다.
                if (!Number.isFinite(ref) || etClock(ref).date !== expectedCashDate || etClock(ref).minutes !== sessionCloseMinutes(expectedCashDate)
                    || ref > Date.parse(p.asOf || '') || ref > nowMs) continue;
                add(id, p, p.sinceCashClosePct, { ko: `${expectedCashDate} 정규장 마감 시점의 같은 선물 가격 대비`, en: `vs same futures at ${expectedCashDate} cash close`, ja: `${expectedCashDate}通常取引終了時の同じ先物価格比` });
            } else {
                add(id, p, p.changePct, { ko: '직전 정규장 마감 무렵(정산) 대비', en: 'vs prior settlement near previous cash close', ja: '前回通常取引終了頃の清算値比' });
            }
        }
    };
    if (session === 'PRE') { futures(); cash(); } else { cash(); futures(); }
    return facts;
}
