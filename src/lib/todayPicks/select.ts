/**
 * «✦ AI 오늘 볼 것» — 선별 규칙(순수 함수만: 네트워크·Redis·시계 없음). 시험: tests/todayPicks.test.ts
 *
 * 원칙
 *   · 재료는 저장소에 «이미 있는 값»뿐이다(옵션 EOD 묶음 · FINRA 장외 · 구조 레벨 판본 · 회사 공지 실적 일정 + 옵션 예상 변동). 새 공급사 호출 0.
 *   · AI 는 고르지 않는다 — 규칙이 고르고 AI 는 한 줄 해설만 쓴다(여기엔 AI 없음).
 *   · 개별 종목만(ETF 제외 — 지수·섹터 ETF 의 신규 포지션은 대부분 헤지 배관이라 «오늘 볼 종목»이 아니다).
 *   · 같은 종류 안에서만 점수를 견준다. 종류마다 한 개씩 먼저 세우고(다양성), 모자라면 2위 중 가장 센 것으로 채운다. 억지로 채우지 않는다.
 *   · 날짜를 단다 — 모든 후보는 asOf(자료의 날짜)를 들고 다닌다. 화면은 «M/D 기준»을 쓴다.
 */
import type { Cand, DarkFacts, EarnFacts, GammaFacts, PickKind, WhaleFacts } from './types';

// ── 문턱(실측 2026-10-12 운영 저장본으로 정했다 — 보고서 IMPL-8 «선별 규칙») ─────────────────────────────────────────
/** 고래: 종목의 신규 명목 합 ≥ $100M · 가장 큰 계약이 ≥ 2,000계약 늘고 · 미결제약정이 2배 이상(또는 새로 생김) */
export const WHALE_MIN_NOTIONAL = 100e6;
export const WHALE_MIN_ADDED = 2000;
export const WHALE_MIN_JUMP = 2;
/** 다크풀: 장외 거래량이 20일 평균의 1.5배 이상 · 자기 백분위 90 이상 · 장외 100만 주 이상 */
export const DARK_MIN_RATIO = 1.5;
export const DARK_MIN_PCTILE = 90;
export const DARK_MIN_VOLUME = 1_000_000;
/** 옵션 총 미결제약정 40만 계약 이상(= 옵션 투자자가 아는 종목 — 모르는 소형주가 맨 앞에 서지 않게). 묶음의 callOI+putOI */
export const DARK_MIN_OI = 400_000;
/** 감마 플립 ±1.0% · Max Pain ±0.6% · 총 미결제약정 50만 계약 이상(얇은 종목 제외) · 만기는 오늘~6일 안(이번 주) */
export const GAMMA_MAX_DIST_FLIP = 1.0;
export const GAMMA_MAX_DIST_MP = 0.6;
export const GAMMA_MIN_OI = 500_000;
export const GAMMA_EXPIRY_DAYS = 6;
/** 이 거리(%) 아래면 «같은 가격» */
export const AT_LEVEL_PCT = 0.05;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const isYmd = (x: unknown): x is string => typeof x === 'string' && YMD.test(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const posn = (x: unknown): number | null => { const n = num(x); return n != null && n > 0 ? n : null; };

/** 'YYYY-MM-DD' + n일 (달력) */
export function addDays(ymd: string, n: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const weekday = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };

/** from 날짜부터 평일(토·일 제외) n개 — 휴장일은 모른다(실적 일정 창을 잡는 데만 쓴다) */
export function nextWeekdays(from: string, n: number): string[] {
    const out: string[] = [];
    let d = from;
    for (let i = 0; i < 14 && out.length < n; i++, d = addDays(d, 1)) {
        const w = weekday(d);
        if (w !== 0 && w !== 6) out.push(d);
    }
    return out;
}

// ── 고래: 확정 신규 포지션(미결제약정 증가) ───────────────────────────────────────────────────────────────────────────

export interface OptionsEodBundle {
    date?: string;
    prevDate?: string;
    tickers?: Record<string, { callOI?: number; putOI?: number; top?: Array<{ k?: number; e?: string; t?: string; oi?: number; d?: number | null }> }>;
}

/**
 * 묶음 한 벌 → 고래 후보(점수 = 신규 명목 합, 큰 순).
 * 'd' 는 그 계약 미결제약정의 증가분(확정) — 줄어든 것(청산)은 보지 않는다. 증가분이 열린 세션은 묶음의 prevDate 다
 * (레코드 D 의 미결제약정은 D−1 마감 포지션 — services/institutionalFlow.openingSessionOf 와 같은 판정).
 */
export function whaleCandidates(bundle: OptionsEodBundle | null | undefined, o: { lastClosed: string; isEtf: (t: string) => boolean }): Cand<WhaleFacts>[] {
    const openedOn = bundle?.prevDate;
    const tickers = bundle?.tickers;
    if (!isYmd(openedOn) || !tickers) return [];
    const out: Cand<WhaleFacts>[] = [];
    for (const [sym, v] of Object.entries(tickers)) {
        if (!/^[A-Z][A-Z0-9.]{0,6}$/.test(sym) || o.isEtf(sym)) continue;
        let notional = 0, callN = 0;
        let best: WhaleFacts['best'] | null = null;
        for (const c of v?.top || []) {
            const d = num(c?.d), k = posn(c?.k), oi = num(c?.oi), e = c?.e;
            if (d == null || !(d > 0) || k == null || oi == null || !isYmd(e) || e <= o.lastClosed) continue;   // 늘어난 것 · 아직 만기 안 지난 것만
            const n = d * 100 * k;
            notional += n;
            if (c.t === 'C') callN += n;
            if (!best || n > best.notional) best = { type: c.t === 'C' ? 'call' : 'put', strike: k, expiry: e, added: d, oi, notional: n };
        }
        if (!best || notional < WHALE_MIN_NOTIONAL || best.added < WHALE_MIN_ADDED) continue;
        const before = best.oi - best.added;
        const jump = before > 0 ? best.oi / before : null;
        if (jump != null && jump < WHALE_MIN_JUMP) continue;   // 이미 크던 계약이 조금 는 것은 «새 포지션»이 아니다
        out.push({
            id: `whale:${sym}`, kind: 'whale', ticker: sym, asOf: openedOn, score: notional,
            facts: { kind: 'whale', openedOn, notional, callPct: Math.round((callN / notional) * 1000) / 10, best, jump: jump != null ? Math.round(jump * 10) / 10 : null },
        });
    }
    return out.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
}

// ── 다크풀: 장외 거래량이 평소(20일)보다 급증 ─────────────────────────────────────────────────────────────────────────

/** services/darkPool.getDarkPoolBatchChecked 의 행(DarkPoolTicker) 중 선별에 쓰는 칸 */
export interface DarkRowIn {
    ticker: string;
    /** 장외 체결 비중 % */
    pct: number | null;
    /** 장외 거래량(주) */
    volume: number | null;
    /** 오늘 장외 거래량 ÷ 20일 평균 */
    volRatio: number | null;
    /** 장외 «물량»의 자기 20일 백분위 */
    volP: number | null;
    /** 이 행의 관측일(이월된 행은 더 이른 날짜) */
    date: string | null;
    marketAvg: number | null;
    /** 옵션 총 미결제약정(계약) — 모르면 null(문턱을 못 넘는다) */
    oi?: number | null;
}

export function darkCandidates(rows: readonly DarkRowIn[], o: { isEtf: (t: string) => boolean }): Cand<DarkFacts>[] {
    // 가장 늦은 관측일 — 그날 거래가 없어 옛 값이 이월된 행(date 가 더 이름)은 «오늘 것»이 아니다
    const latest = rows.reduce<string | null>((m, r) => (isYmd(r.date) && (!m || r.date > m) ? r.date : m), null);
    if (!latest) return [];
    const out: Cand<DarkFacts>[] = [];
    for (const r of rows) {
        if (r.date !== latest || o.isEtf(r.ticker)) continue;
        const pct = posn(r.pct), ratio = posn(r.volRatio), vol = posn(r.volume), p = num(r.volP);
        if (pct == null || pct >= 100 || ratio == null || vol == null) continue;
        if (ratio < DARK_MIN_RATIO || vol < DARK_MIN_VOLUME || (p != null && p < DARK_MIN_PCTILE) || !((r.oi ?? 0) >= DARK_MIN_OI)) continue;
        const avg = posn(r.marketAvg);
        out.push({
            id: `darkpool:${r.ticker}`, kind: 'darkpool', ticker: r.ticker, asOf: latest, score: ratio,
            facts: { kind: 'darkpool', date: latest, pct: Math.round(pct * 10) / 10, ratio: Math.round(ratio * 10) / 10, volume: vol, marketAvg: avg != null ? Math.round(avg * 10) / 10 : null },
        });
    }
    return out.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
}

// ── 감마 플립·Max Pain 근접(이번 주 만기) ────────────────────────────────────────────────────────────────────────────

/** 구조 판본에서 읽은 한 종목(lib/ai/crossSectorLevels.indexLevelRowFromStored 의 행 + 총 미결제약정) */
export interface LevelRowIn {
    ticker: string;
    spot: number;
    expiration: string | null;
    chainDate: string | null;
    maxPain: number | null;
    gammaFlip: number | null;
    /** 총 미결제약정(콜+풋 계약) — 묶음의 callOI+putOI */
    oi: number;
}

export function gammaCandidates(rows: readonly LevelRowIn[], o: { todayEt: string; isEtf: (t: string) => boolean }): Cand<GammaFacts>[] {
    // 체인 날짜가 섞여 있으면 «가장 늦은 날짜(20종목 이상이 공유)»만 쓴다 — 어제 판본과 오늘 판본을 같은 줄에 세우지 않는다
    const byDate = new Map<string, number>();
    for (const r of rows) if (isYmd(r.chainDate)) byDate.set(r.chainDate, (byDate.get(r.chainDate) || 0) + 1);
    const dates = [...byDate.keys()].sort();
    const dominant = [...dates].reverse().find((d) => (byDate.get(d) || 0) >= 20) ?? dates[dates.length - 1] ?? null;
    if (!dominant || dominant < addDays(o.todayEt, -4)) return [];
    const maxExpiry = addDays(o.todayEt, GAMMA_EXPIRY_DAYS);
    const out: Cand<GammaFacts>[] = [];
    for (const r of rows) {
        if (o.isEtf(r.ticker) || r.chainDate !== dominant || !isYmd(r.expiration) || r.expiration < o.todayEt || r.expiration > maxExpiry) continue;
        if (!(r.spot > 0) || !(r.oi >= GAMMA_MIN_OI)) continue;
        const opts: Array<{ level: GammaFacts['level']; price: number | null; max: number; pen: number }> = [
            { level: 'gammaFlip', price: posn(r.gammaFlip), max: GAMMA_MAX_DIST_FLIP, pen: 0 },
            { level: 'maxPain', price: posn(r.maxPain), max: GAMMA_MAX_DIST_MP, pen: 0.15 },
        ];
        let best: Cand<GammaFacts> | null = null;
        for (const x of opts) {
            if (x.price == null) continue;
            const dist = (Math.abs(r.spot - x.price) / r.spot) * 100;
            if (dist > x.max) continue;
            const score = Math.log10(r.oi) - 1.5 * dist - x.pen;       // 유동성이 크고 레벨에 붙을수록 높다(감마 플립이 약간 우대)
            if (best && score <= best.score) continue;
            const side: GammaFacts['side'] = dist < AT_LEVEL_PCT ? 'at' : r.spot > x.price ? 'a' : 'b';
            best = {
                id: `gamma:${r.ticker}`, kind: 'gamma', ticker: r.ticker, asOf: dominant, score,
                facts: { kind: 'gamma', level: x.level, chainDate: dominant, expiry: r.expiration, spot: r.spot, levelPrice: x.price, distPct: Math.round(dist * 100) / 100, side },
            };
        }
        if (best) out.push(best);
    }
    return out.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
}

// ── 실적 임박 + 옵션이 반영한 변동폭 ──────────────────────────────────────────────────────────────────────────────

export interface EarnRowIn {
    ticker: string;
    date: string;
    hour: 'bmo' | 'amc' | '';
    etTime?: string | null;
    impliedPct: number | null;
    impliedExpiry: string | null;
    session: string | null;
    /** 발표가 끝났나(phaseOf === 'done') — 호출자가 시계로 판정해 넘긴다 */
    done: boolean;
}

/**
 * 회사가 공지한 발표 중 «아직 안 끝난» 것 — 앞으로 평일 n일(dates) 안. 점수 = 발표가 이른 날일수록 높고, 같은 날이면 옵션 예상 변동이 큰 순.
 */
export function earningsCandidates(rows: readonly EarnRowIn[], o: { dates: readonly string[]; isEtf?: (t: string) => boolean }): Cand<EarnFacts>[] {
    const out: Cand<EarnFacts>[] = [];
    for (const r of rows) {
        const di = o.dates.indexOf(r.date);
        const pct = posn(r.impliedPct);
        if (di < 0 || r.done || pct == null || !isYmd(r.impliedExpiry)) continue;
        out.push({
            id: `earnings:${r.ticker}`, kind: 'earnings', ticker: r.ticker, asOf: isYmd(r.session) ? r.session : r.date, score: (o.dates.length - di) * 100 + pct,
            facts: { kind: 'earnings', date: r.date, hour: r.hour, etTime: r.etTime ?? null, impliedPct: Math.round(pct * 10) / 10, impliedExpiry: r.impliedExpiry, session: isYmd(r.session) ? r.session : null },
        });
    }
    return out.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
}

// ── 조립 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PrevPick { kind: PickKind; ticker: string; asOf: string }
export interface AssembleIn {
    whale: Cand<WhaleFacts>[];
    darkpool: Cand<DarkFacts>[];
    gamma: Cand<GammaFacts>[];
    earnings: Cand<EarnFacts>[];
}

/** 화면·푸시에서 1번이 되는 순서 — 발표가 가까운 실적(오늘·내일) → 고래 → 다크풀 → 감마 */
const BASE_ORDER: PickKind[] = ['whale', 'earnings', 'darkpool', 'gamma'];

/**
 * 종류마다 1개(같은 종목은 한 번만) → 모자라면 종류 우선순위(고래 → 실적 → 다크풀 → 감마)대로(적게 뽑힌 종류 먼저) 그 종류의 다음 후보로 채움(1위 점수의 절반 미만이면 안 채움).
 * 직전 문서가 같은 종류·같은 종목·같은 자료 날짜를 이미 보였으면 다음 후보로 넘긴다(자료가 그대로인데 같은 카드를 또 보이지 않는다 · 대안이 없으면 그대로).
 * 채울 때 원하는 종목이 «대안이 있는 다른 종류의 항목»과 겹치면 그쪽을 대안으로 바꾼다(예: 고래 2위 AMZN 이 감마 1위와 겹치면 감마를 그다음 종목으로).
 */
export function assemble(c: AssembleIn, o: { prev?: readonly PrevPick[]; max?: number; earlyEarnDates?: readonly string[] } = {}): Cand[] {
    const max = o.max ?? 5;
    const prev = new Set((o.prev || []).map((p) => `${p.kind}|${p.ticker}|${p.asOf}`));
    const pools: Record<PickKind, Cand[]> = { whale: c.whale, darkpool: c.darkpool, gamma: c.gamma, earnings: c.earnings };
    // 직전에 보인 (종류·종목·날짜)는 뒤로 — 대안이 없으면 그대로 앞에 남는다
    const ordered = (kind: PickKind): Cand[] => {
        const fresh = pools[kind].filter((x) => !prev.has(`${x.kind}|${x.ticker}|${x.asOf}`));
        const seen = pools[kind].filter((x) => prev.has(`${x.kind}|${x.ticker}|${x.asOf}`));
        return [...fresh, ...seen];
    };
    const sel: Cand[] = [];
    const ownerOf = (ticker: string): Cand | undefined => sel.find((x) => x.ticker === ticker);

    const pickNext = (kind: PickKind, allowSwap: boolean): Cand | null => {
        for (const x of ordered(kind)) {
            if (sel.some((s) => s.id === x.id)) continue;
            const owner = ownerOf(x.ticker);
            if (!owner) return x;
            if (!allowSwap || owner.kind === kind) continue;
            const rep = ordered(owner.kind).find((r) => !sel.some((s) => s.ticker === r.ticker) && r.ticker !== x.ticker);
            if (rep) { sel[sel.indexOf(owner)] = rep; return x; }
        }
        return null;
    };

    // 1) 종류마다 1개
    for (const kind of BASE_ORDER) { const x = pickNext(kind, false); if (x) sel.push(x); }
    // 2) 부족하면 «적게 뽑힌 종류부터(같으면 우선순위)» 다음 후보 — 1위 점수의 절반 이상일 때만(약한 항목으로 채우지 않는다)
    while (sel.length < max) {
        let more: Cand | null = null;
        const kinds = [...BASE_ORDER].sort((a, b) => sel.filter((p) => p.kind === a).length - sel.filter((p) => p.kind === b).length || BASE_ORDER.indexOf(a) - BASE_ORDER.indexOf(b));
        for (const kind of kinds) {
            const top = pools[kind][0];
            if (!top) continue;
            const snapshot = [...sel];
            const x = pickNext(kind, true);
            if (x && (top.score <= 0 || x.score / top.score >= 0.5)) { more = x; break; }
            sel.splice(0, sel.length, ...snapshot);   // 기준 미달이면 바꾼 것을 되돌린다
        }
        if (!more) break;
        sel.push(more);
    }
    // 3) 순서 — 발표가 오늘·내일(earlyEarnDates)인 실적을 맨 앞, 나머지는 BASE_ORDER 종류순(같은 종류 안에선 뽑힌 순)
    const early = new Set(o.earlyEarnDates || []);
    const rank = (x: Cand): number => (x.kind === 'earnings' && early.has((x.facts as EarnFacts).date) ? -1 : BASE_ORDER.indexOf(x.kind));
    return sel
        .map((x, i) => ({ x, i }))
        .sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i)
        .map((e) => e.x);
}
