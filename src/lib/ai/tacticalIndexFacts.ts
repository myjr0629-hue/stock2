import type { MarketIndexBasis, IndexObservation } from '@/lib/marketIndexBasis';
import { cashSessionPhaseAt } from '@/lib/marketCalendar';
import { isCashCloseReferenceAt } from '@/lib/futuresCashClose';
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
/** REG는 현물 우선. 직접 전달된 indexFacts에도 같은 선택 규칙을 적용한다. */
export function sessionIndexFacts(facts: IndexFact[], session: TacticalSession): IndexFact[] {
    return session === 'REG' && facts.some(f => f.kind === 'spot') ? facts.filter(f => f.kind === 'spot') : facts;
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
                // 실제 마감 부근 관측만 사용. 날짜·3분 허용 오차를 공통 계산기와 동일하게 검사한다.
                if (!isCashCloseReferenceAt(p.cashCloseReferenceAt, expectedCashDate)
                    || ref > Date.parse(p.asOf || '') || ref > nowMs) continue;
                add(id, p, p.sinceCashClosePct, { ko: `${expectedCashDate} 정규장 마감 시점의 같은 선물 가격 대비`, en: `vs same futures at ${expectedCashDate} cash close`, ja: `${expectedCashDate}通常取引終了時の同じ先物価格比` });
            } else {
                add(id, p, p.changePct, { ko: '직전 정규장 마감 무렵(정산) 대비', en: 'vs prior settlement near previous cash close', ja: '前回通常取引終了頃の清算値比' });
            }
        }
    };
    if (session === 'PRE') { futures(); cash(); } else { cash(); futures(); }
    return sessionIndexFacts(facts, session);
}

/**
 * ★2026-10-28 T2 장후(POST) Tactical 의 «종가 이후 선물» 사실.
 *   10/27 실측: 기준 키 yahoo:cash-close:nq|es 는 16:10 ET 무렵 EC2·Upstash 둘 다 저장됐지만, 가디언 스냅샷은 세션 전환 직후(16:01 ET)
 *   한 번 계산된 뒤 EC2 워커가 도장만 새로 찍어 다시 써서 장후 내내(그리고 그 글을 이어 쓰는 야간 저장 판정까지) «종가 이후 변화 미확인»으로 굳었다.
 *   야후 선물은 약 10분 지연이라 장후 첫 계산 때는 기준이 있을 수 없다 → «글을 만들 때 선물 사실이 없었는데 지금은 있다»면 다시 만든다.
 */
export function hasFuturesSinceCloseFact(b: MarketIndexBasis | null | undefined, nowMs: number): boolean {
    return !!b && tacticalSessionAt(nowMs) === 'POST' && buildIndexFacts(b, 'POST', nowMs).some(f => f.kind === 'futures');
}
/** Tactical 프롬프트의 INDEX_FACTS 에 선물 사실이 있었나(생성 재료 기록용). */
export function promptHasFuturesFacts(prompt: string | null | undefined): boolean {
    const line = prompt?.match(/^INDEX_FACTS: (.*)$/m)?.[1];
    if (!line) return false;
    try { return (JSON.parse(line) as Array<{ kind?: string }>).some(f => f?.kind === 'futures'); } catch { return false; }
}
/** 장후 스냅샷 재계산 최소 간격 — 선물 사실이 없는 글을 다시 만들 때(재생성 실패·선물 휴식 중 포함) 모델 호출을 5분에 한 번 이하로. */
export const POST_TACTICAL_RETRY_MS = 5 * 60_000;
/** 지금 선물 사실을 읽어 볼 가치가 있나(입출력 전 값싼 판정): POST 이고, 글이 선물 사실 없이 만들어졌고, 스냅샷 계산 뒤 5분이 지났다. 글 정보가 없는 옛 스냅샷도 대상. */
export function postTacticalMayLackFutures(c: { tacticalFutures?: boolean; timestamp?: string } | null | undefined, session: string | null | undefined, nowMs: number): boolean {
    if (!c || session !== 'POST' || c.tacticalFutures === true) return false;
    const at = c.timestamp ? Date.parse(c.timestamp) : NaN;
    return !Number.isFinite(at) || nowMs - at >= POST_TACTICAL_RETRY_MS;
}
