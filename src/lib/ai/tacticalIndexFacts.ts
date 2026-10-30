import { tacticalFuturesDirection } from './tacticalFuturesRules';
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
/**
 * 장후 생성 재료용 지수 기준 합치기 — 지금 다시 읽은 값(fresh)을 칸별로 쓰되, 그 칸이 결측(price 없음)이면 코어 값을 지킨다.
 * 선물은 «종가 이후 기준이 붙은» 쪽을 먼저(코어는 기준 저장 전 값일 수 있다). 둘 다 없으면 null.
 */
export function mergePostIndexBasis(core: MarketIndexBasis | null | undefined, fresh: MarketIndexBasis | null | undefined): MarketIndexBasis | null {
    if (!core || !fresh) return fresh ?? core ?? null;
    const pick = <T extends IndexObservation>(a: T, b: T): T => (a?.price != null ? a : b);
    const pickFut = <T extends MarketIndexBasis['futures']['nq']>(f: T, c: T): T =>
        f?.price != null && f.cashCloseReferenceAt ? f : c?.price != null && c.cashCloseReferenceAt ? c : pick(f, c);
    return { v: 1,
        cash: { nasdaq: pick(fresh.cash.nasdaq, core.cash.nasdaq), ndx: pick(fresh.cash.ndx, core.cash.ndx), spx: pick(fresh.cash.spx, core.cash.spx) },
        futures: { nq: pickFut(fresh.futures.nq, core.futures.nq), es: pickFut(fresh.futures.es, core.futures.es) } };
}

/** POST 추가 재생성: pp 차이·최소 간격·ET 세션당 모든 언어 합산 생성 시도 상한. */
export const POST_TACTICAL_DRIFT_PP = 0.3;
export const POST_TACTICAL_REFRESH_MS = 30 * 60_000;
/** 생성 시도 단위, 공급사 사다리 내부 전환은 기존 일반 생성 정책. */
export const POST_TACTICAL_DRIFT_MAX_REGEN_ATTEMPTS = 8;
export type TacticalFuturesPct = Partial<Record<'nq' | 'es', number>>;
export interface PostTacticalFuturesState {
    tacticalFutures?: boolean;
    tacticalFuturesPct?: TacticalFuturesPct;
    tacticalFuturesCheckedAt?: string;
    timestamp?: string;
}
/** INDEX_FACTS 생성 재료만 기록한다. 현재 값으로 기존 글의 생성 기준을 덮지 않는다. */
export function promptFuturesPct(prompt: string | null | undefined): TacticalFuturesPct | undefined {
    const line = prompt?.match(/^INDEX_FACTS: (.*)$/m)?.[1];
    try {
        const facts: IndexFact[] = JSON.parse(line || 'null');
        if (!Array.isArray(facts)) return undefined;
        const pct: TacticalFuturesPct = {};
        for (const f of facts) {
            if (f?.kind === 'futures' && (f.id === 'nq' || f.id === 'es') && typeof f.chgPct === 'number' && Number.isFinite(f.chgPct)) pct[f.id] = f.chgPct;
        }
        return Object.keys(pct).length ? pct : undefined;
    } catch { return undefined; }
}
export function tacticalFuturesDrifted(generated: TacticalFuturesPct | undefined, current: TacticalFuturesPct | undefined): boolean {
    return (['nq', 'es'] as const).some(id => {
        const before = generated?.[id], now = current?.[id];
        if (typeof before !== 'number' || !Number.isFinite(before) || typeof now !== 'number' || !Number.isFinite(now)) return false;
        // 부동소수 뺄셈 오차로 정확히 0.3pp인 차이를 놓치지 않는다.
        return Math.abs(now - before) + Number.EPSILON >= POST_TACTICAL_DRIFT_PP || tacticalFuturesDirection(before) !== tacticalFuturesDirection(now);
    });
}
/** 값을 읽기 전 값싼 판정. 옛 스냅샷과 POST 외 세션은 기존 동작 유지. */
export function postTacticalMayDriftFutures(c: PostTacticalFuturesState | null | undefined, session: string | null | undefined, nowMs: number): boolean {
    if (!c || session !== 'POST' || c.tacticalFutures !== true || !c.tacticalFuturesPct) return false;
    const at = Date.parse(c.tacticalFuturesCheckedAt || c.timestamp || '');
    return Number.isFinite(at) && nowMs - at >= POST_TACTICAL_REFRESH_MS;
}
export function postTacticalNeedsDriftRefresh(c: PostTacticalFuturesState | null | undefined, session: string | null | undefined, nowMs: number, current: TacticalFuturesPct | undefined): boolean {
    return postTacticalMayDriftFutures(c, session, nowMs) && tacticalFuturesDrifted(c?.tacticalFuturesPct, current);
}

/**
 * ★2026-10-31 T35-B 장중(REG) 정기 재생성 — 개장 직후 글이 장중 내내 굳지 않게.
 *   스냅샷은 EC2 워커가 30초마다 도장만 새로 찍어 장중엔 재계산(=재생성)이 없다(T35). 지수가 −3% 로 밀려도 09:3x 글이 남는다.
 *   조건: 마지막 생성 30분 경과 && (나스닥·S&P 500 변화율이 그 글의 생성 기준 대비 0.5%p 이상 또는 RLSI 5 이상 변화).
 *   상한: ET 날짜(장중 세션)당 «재생성 시도» 8회 — 시도 1회 = 재계산 1회(Tactical 3언어 1호출 + 탈락 시 교정 1호출, 같은 재계산의 순환매·감마 캐시 만료분).
 *   공급사 재시도·사다리 전환은 기존 일반 생성 정책(장후 변동 POST_TACTICAL_DRIFT_MAX_REGEN_ATTEMPTS 와 같은 단위). 한 시도가 ko·en·ja 를 함께 쓰므로 언어별 상한도 8회.
 *   비교 값은 생성 기준(verdict.num.basis.realityInsight)과 지금 스냅샷의 같은 원천(market.nqChangePercent·factors.spx·rlsi.score).
 */
export const REG_TACTICAL_REFRESH_MS = 30 * 60_000;
export const REG_TACTICAL_INDEX_PP = 0.5;
export const REG_TACTICAL_RLSI_PTS = 5;
export const REG_TACTICAL_MAX_REGEN_ATTEMPTS = 8;
/** 예약 거절·실패 뒤 같은 인스턴스가 다시 예약을 묻는 최소 간격(공급사 호출 아님 — 예약 저장소 질의 횟수만 줄인다) */
export const REG_TACTICAL_RETRY_MS = 5 * 60_000;
type RegNums = { NDX_CHG?: number; SPX_CHG?: number; RLSI?: number } | null | undefined;
export interface RegTacticalState {
    timestamp?: string;
    /** 이 스냅샷 장중 글의 생성 시각(정기 재생성·채택이 기록). 없으면 스냅샷 계산 시각 */
    tacticalGeneratedAt?: string;
    rlsi?: { score?: number } | null;
    market?: { nqChangePercent?: number | null; factors?: { spx?: { chgPct?: number | null } | null } | null } | null;
    verdict?: { realityInsight?: unknown; num?: { basis?: { realityInsight?: RegNums } | null } | null } | null;
}
const finiteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 생성 기준 대비 지금 값의 변화 — 한 칸이라도 문턱 이상이면 그 칸 이름들(없으면 빈 배열). 기준이나 지금 값이 없는 칸은 보지 않는다. */
export function regTacticalDrift(basis: RegNums, current: RegNums): string[] {
    if (!basis || !current) return [];
    const out: string[] = [];
    const over = (a: unknown, b: unknown, limit: number) => finiteNum(a) && finiteNum(b) && Math.abs(b - a) + Number.EPSILON >= limit;
    if (over(basis.NDX_CHG, current.NDX_CHG, REG_TACTICAL_INDEX_PP)) out.push('nasdaq');
    if (over(basis.SPX_CHG, current.SPX_CHG, REG_TACTICAL_INDEX_PP)) out.push('spx');
    if (over(basis.RLSI, current.RLSI, REG_TACTICAL_RLSI_PTS)) out.push('rlsi');
    return out;
}
/** 스냅샷의 «지금» 값(생성 기준 basis 와 같은 원천) */
export function regTacticalCurrent(c: RegTacticalState | null | undefined): RegNums {
    if (!c) return null;
    return { NDX_CHG: c.market?.nqChangePercent ?? undefined, SPX_CHG: c.market?.factors?.spx?.chgPct ?? undefined, RLSI: c.rlsi?.score ?? undefined };
}
/** 마지막 생성 시각 — 이 스냅샷이 채택한 글의 생성 시각(tacticalGeneratedAt), 없으면 스냅샷 계산 시각(그때 글은 새로 만들었거나 10분 안 캐시). «본 시각»(tacticalSeenAt)과 분리 — 탈락한 저장본을 본 것만으로 재생성이 밀리지 않게(관문 10310451 ②) */
export function regTacticalGeneratedAt(c: RegTacticalState | null | undefined): number {
    const at = Date.parse(c?.tacticalGeneratedAt || c?.timestamp || '');
    return Number.isFinite(at) ? at : NaN;
}
/**
 * 값싼 판정(입출력 0): REG · 글이 대기 문구가 아님(T35 경로가 따로 맡는다) · 생성 30분 경과 · 지수/RLSI 변화. 예약 질의 간격(5분)은 호출자가 인스턴스 메모리로.
 * isPlaceholder 는 호출자가 넘긴다(모듈 의존 방지).
 */
export function regTacticalNeedsRefresh(c: RegTacticalState | null | undefined, session: string | null | undefined, nowMs: number, isPlaceholder: (t: string) => boolean): string[] {
    if (!c || session !== 'REG') return [];
    const text = c.verdict?.realityInsight;
    if (typeof text !== 'string' || !text || isPlaceholder(text)) return [];
    const gen = regTacticalGeneratedAt(c);
    if (!Number.isFinite(gen) || nowMs - gen < REG_TACTICAL_REFRESH_MS) return [];
    return regTacticalDrift(c.verdict?.num?.basis?.realityInsight, regTacticalCurrent(c));
}
