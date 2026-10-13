/**
 * 이상 신호 탐지 — 순수 함수(네트워크·시계·저장소 없음). 입력 = 저장본에서 읽은 값 + 직전 상태 + 문맥(now).
 *
 * 규칙표(이전 브랜치 feat/watchlist-alerts 의 규칙을 «저장본만 있는 세계»로 옮겼다)
 *   call_wall_break / put_floor_break / gamma_flip_cross
 *       구조 판본(structure:v2:{T}, 정의 게이트 통과분)의 관측 두 개 이상 — 앞 관측에서 레벨의 한쪽에 있었고(무장), 정규장 안 관측의 가격이
 *       레벨을 여유폭(0.3%) 너머로 넘었다. 구조 굽기가 하루 5번(프리·정규장 3번·마감 뒤)이라 «분 단위»가 아니다 — 본문에 관측 시각을 밝힌다.
 *   maxpain_divergence
 *       만기 3거래일 안(오늘 포함) · |가격 − Max Pain| ÷ Max Pain 이 «이 종목 자신의 최근 20거래일 괴리 상위 10%» 경계와 1% 중 큰 값 이상
 *       (경계는 signum-flow-history 의 structure-build 행으로 — 표본 30개 미만이면 말하지 않는다).
 *   darkpool_spike  (아침 — FINRA 가 전 세션 자료를 22:00 ET 쯤 적재한 뒤)
 *       FINRA 마지막 세션 자료: 장외 거래량 ÷ 20일 평균 ≥ 1.8 · 자기 20일 백분위 ≥ 90 · 장외 50만 주 이상. 개별 종목만(ETF 제외 — 헤지 배관).
 *   oi_surge  (아침 — 옵션 EOD 묶음은 D 밤 02:20 ET 쯤 만들어지고 «마지막으로 끝난 세션»의 묶음일 때만)
 *       옵션 EOD 묶음의 확정 미결제약정 증가: 만기 안 지난 계약들의 신규 명목 합 ≥ $50M · 가장 큰 계약이 ≥ 1,500계약 늘고 · 그 미결제약정이 3배 이상(또는 새로 생김). 개별 종목만.
 *       레코드 D 는 D−1 마감 포지션을 담는다 — 본문에 «열린 세션»(prevDate)을 밝힌다.
 *   earnings_d1
 *       회사가 공지한 발표일(CONFIRMED_EARNINGS)이 «다음 거래일» — 마감 뒤 실행에서 하루 1회.
 *
 * 원칙: 틀린 알림보다 안 보내는 것이 낫다 — 자료가 낡았거나 정의를 어기거나 날짜가 맞지 않으면 그 신호는 «건너뛴다»(notes 에 까닭).
 */
import { levelsFromStructure } from '@/lib/optionLevelGate';
import {
    calendarDaysBetween, etDateOf, etMinutesOf, inRegularSession, isDateStr, isTradingDate, nextTradingDate, prevTradingDate, tradingSessionsInclusive,
} from './calendar';
import {
    SIG_CFG,
    type Arm, type CrossKind, type DetectedSignal, type DarkSigFacts, type EarnD1Facts, type LevelObs, type MaxPainFacts, type OiFacts,
    type SignalEvent, type TickerState, type WallFacts,
} from './types';

const pos = (x: unknown): number | null => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
};
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export interface DetectCtx {
    now: number;
    cfg?: Partial<typeof SIG_CFG>;
}
const cfgOf = (ctx: DetectCtx): typeof SIG_CFG => ({ ...SIG_CFG, ...(ctx.cfg ?? {}) });

// ═══════════════════════════════════════════════════════════════════════════
// 구조 판본 → 관측
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 저장된 구조 판본({ data, timestamp }) → 관측. 정의 게이트(lib/optionLevelGate.levelsFromStructure — 화면·랭킹과 같은 문)를 통과한 레벨만 담는다.
 * 계산 실패·옵션 없음(options_status≠OK)·기준가 없음·시각 없음은 null.
 */
export function obsFromStored(ticker: string, stored: { data?: any; timestamp?: number } | null | undefined): LevelObs | null {
    const d = stored?.data;
    if (!d || d.options_status !== 'OK') return null;
    const ts = Number(stored?.timestamp);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    const lv = levelsFromStructure(d);
    if (!lv) return null;
    const spot = pos(lv.levelsSpot);
    if (spot == null) return null;
    return {
        ticker: ticker.toUpperCase(),
        asOfMs: ts,
        session: typeof d.session === 'string' ? d.session : 'CLOSED',
        spot,
        expiry: isDateStr(lv.levelsExpiration) ? lv.levelsExpiration : null,
        chainDate: isDateStr(lv.levelsChainDate) ? lv.levelsChainDate : null,
        callWall: pos(lv.callWall),
        putFloor: pos(lv.putFloor),
        gammaFlip: pos(lv.gammaFlipLevel),
        gammaFlipType: typeof d.gammaFlipType === 'string' ? d.gammaFlipType : null,
        gexConfidence: typeof d.gexConfidence === 'string' ? d.gexConfidence : null,
        maxPain: pos(lv.maxPain),
    };
}

/** 같은 종목의 판본 둘(현재 키·lastgood) 중 더 최근 것 */
export function freshestStored(...cands: Array<{ data?: any; timestamp?: number } | null | undefined>): { data?: any; timestamp?: number } | null {
    const ok = cands.filter((c): c is { data?: any; timestamp?: number } => !!c && !!c.data && Number.isFinite(Number(c.timestamp)));
    if (!ok.length) return null;
    return ok.sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];
}

/** 관측이 «지금 쓸 만한가» — 낡음·미래·휴장일·체인 날짜·만기. 쓸 수 없으면 까닭 */
export function obsUsable(obs: LevelObs, ctx: DetectCtx): { ok: true } | { ok: false; reason: string } {
    const cfg = cfgOf(ctx);
    if (ctx.now - obs.asOfMs > cfg.obsMaxAgeMs) return { ok: false, reason: 'stale_obs' };
    if (obs.asOfMs - ctx.now > 120_000) return { ok: false, reason: 'future_obs' };
    const day = etDateOf(obs.asOfMs);
    if (!isTradingDate(day)) return { ok: false, reason: 'non_trading_day' };
    if (obs.expiry && obs.expiry < day) return { ok: false, reason: 'expired_chain' };
    if (obs.chainDate && obs.chainDate < prevTradingDate(day)) return { ok: false, reason: 'stale_chain' };
    return { ok: true };
}

/** 정규장 안에서 계산된 관측인가(시각이 정규장 안 + 판본의 세션 표식 REG) */
export function obsIsRegular(obs: LevelObs): boolean {
    return obs.session === 'REG' && inRegularSession(obs.asOfMs);
}
/** 프리마켓 관측(무장에만 쓴다) */
function obsIsPre(obs: LevelObs): boolean {
    const day = etDateOf(obs.asOfMs);
    return obs.session === 'PRE' && isTradingDate(day) && etMinutesOf(obs.asOfMs) < 9 * 60 + 30;
}

// ═══════════════════════════════════════════════════════════════════════════
// 레벨 교차(콜월·풋플로어·감마플립) — 무장 → 확정
// ═══════════════════════════════════════════════════════════════════════════

const CROSS_EVENT: Record<CrossKind, SignalEvent> = {
    callWall: 'call_wall_break',
    putFloor: 'put_floor_break',
    gammaFlip: 'gamma_flip_cross',
};

/** 현재 가격이 레벨의 «교차 전» 쪽에 있으면 그 무장 방향 */
export function armSide(kind: CrossKind, level: number, price: number): Arm['side'] | null {
    if (kind === 'callWall') return price < level ? 'below' : null;
    if (kind === 'putFloor') return price > level ? 'above' : null;
    if (price < level) return 'below';
    if (price > level) return 'above';
    return null;
}

/** 무장된 레벨을 가격이 여유폭 너머로 확정했는가 */
export function crossDirection(kind: CrossKind, arm: Arm, price: number, buffer: number): 'up' | 'down' | null {
    const up = arm.side === 'below' && price >= arm.level * (1 + buffer);
    const down = arm.side === 'above' && price <= arm.level * (1 - buffer);
    if (kind === 'callWall') return up ? 'up' : null;
    if (kind === 'putFloor') return down ? 'down' : null;
    return up ? 'up' : down ? 'down' : null;
}

/** 레벨을 넘었지만 아직 여유폭 안(확정 대기) — 이 동안은 기존 무장을 새 레벨로 바꾸지 않는다 */
function pendingConfirmation(arm: Arm, price: number, buffer: number): boolean {
    return arm.side === 'below'
        ? price >= arm.level && price < arm.level * (1 + buffer)
        : price <= arm.level && price > arm.level * (1 - buffer);
}

export interface CrossResult {
    events: DetectedSignal[];
    /** 저장할 새 상태(null = 저장하지 않는다: 새 관측이 아니거나 쓸 수 없다) */
    state: TickerState | null;
    notes: string[];
}

/** 이 관측에서 믿을 수 있는 레벨(종류별) — 감마플립은 EXACT·신뢰도 LOW 아님만 */
function trustedLevel(obs: LevelObs, kind: CrossKind, cfg: typeof SIG_CFG): number | null {
    if (kind === 'callWall') return obs.callWall;
    if (kind === 'putFloor') return obs.putFloor;
    if (obs.gammaFlip == null) return null;
    if (!obs.gammaFlipType || !cfg.gammaFlipTypes.includes(obs.gammaFlipType)) return null;
    if (obs.gexConfidence === 'LOW') return null;
    return obs.gammaFlip;
}

/**
 * 종목 하나의 레벨 교차 탐지. prev = 직전에 저장한 상태, obs = 지금 저장본의 관측.
 * 같은 관측을 두 번 보지 않는다(prev.asOfMs ≥ obs.asOfMs 면 새 관측이 아니다).
 */
export function detectCross(prev: TickerState | null, obs: LevelObs, ctx: DetectCtx): CrossResult {
    const cfg = cfgOf(ctx);
    const notes: string[] = [];
    const u = obsUsable(obs, ctx);
    if (!u.ok) return { events: [], state: null, notes: [u.reason] };
    const day = etDateOf(obs.asOfMs);
    const regular = obsIsRegular(obs);
    const pre = obsIsPre(obs);
    if (!regular && !pre) return { events: [], state: null, notes: ['obs_not_pre_or_regular'] };
    if (prev && prev.asOfMs >= obs.asOfMs) return { events: [], state: null, notes: ['seen'] };

    // 이어받을 상태: 같은 거래일의 것만
    const base = prev && prev.day === day ? prev : null;
    if (base && Math.abs(obs.spot / base.spot - 1) > cfg.maxJump) return { events: [], state: null, notes: ['obs_jump'] };

    const events: DetectedSignal[] = [];
    const arms: Partial<Record<CrossKind, Arm>> = {};
    const valid = (a: Arm | undefined): a is Arm =>
        !!a && a.day === day && pos(a.level) != null && obs.asOfMs - a.asOfMs <= cfg.armMaxGapMs && obs.asOfMs > a.asOfMs;
    const b = cfg.crossBuffer;

    for (const k of ['callWall', 'putFloor', 'gammaFlip'] as CrossKind[]) {
        const old = base?.arms[k];
        let carried: Arm | undefined = valid(old) ? old : undefined;
        if (carried && regular) {
            const dir = crossDirection(k, carried, obs.spot, b);
            if (dir) {
                const facts: WallFacts = {
                    kind: 'wall', level: k, levelPrice: carried.level, price: obs.spot, direction: dir,
                    distPct: (obs.spot / carried.level - 1) * 100, expiry: obs.expiry ?? '', chainDate: obs.chainDate, asOfMs: obs.asOfMs,
                };
                events.push({
                    ticker: obs.ticker, event: CROSS_EVENT[k], key: `${day}:${dir}`, facts, asOfMs: obs.asOfMs, asOfDate: day,
                    score: Math.abs(facts.distPct),
                });
                carried = undefined;   // 확정 — 같은 레벨로 다시 무장하지 않는다
            }
        }
        const L = trustedLevel(obs, k, cfg);
        if (carried && pendingConfirmation(carried, obs.spot, b)) {
            arms[k] = carried;       // 확정 대기 — 구조가 벽을 다시 골라도 «보던 벽»을 놓치지 않는다
        } else if (L != null) {
            const side = armSide(k, L, obs.spot);
            if (side) arms[k] = { level: L, side, asOfMs: obs.asOfMs, day };
        } else if (old && !carried) {
            // 신뢰 레벨이 없고 확정도 아님 — 무장을 버린다
        }
    }
    if (!events.length && !Object.keys(arms).length) notes.push('no_trusted_level');
    return { events, state: { asOfMs: obs.asOfMs, day, spot: obs.spot, arms }, notes };
}

// ═══════════════════════════════════════════════════════════════════════════
// 맥스페인 이탈
// ═══════════════════════════════════════════════════════════════════════════

/** 최근접 순위 백분위(p ∈ (0,1]) — 표본이 작아도 «실제 관측값» 하나를 돌려준다 */
export function percentile(values: number[], p: number): number | null {
    const xs = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!xs.length) return null;
    const rank = Math.min(xs.length, Math.max(1, Math.ceil(p * xs.length)));
    return xs[rank - 1];
}

/**
 * 괴리 분포 — structure-build 이력 행(같은 getStructureData 정의로 하루 5번 굽는 행)에서.
 * 한 행 = 한 관측(|가격 − 맥스페인| ÷ 맥스페인). 최근 20거래일만, 오늘 행은 뺀다.
 */
export function maxPainDivergenceP90(
    rows: Array<{ session: string; price: number | null; maxPain: number | null }>,
    today: string,
    windowSessions = SIG_CFG.maxPainWindowSessions,
): { p90: number; n: number } | null {
    const sessions = Array.from(new Set(rows.map((r) => r.session).filter((s) => s && s < today))).sort();
    const keep = new Set(sessions.slice(-windowSessions));
    const obs: number[] = [];
    for (const r of rows) {
        if (!keep.has(r.session)) continue;
        const px = pos(r.price), mp = pos(r.maxPain);
        if (px == null || mp == null) continue;
        obs.push(Math.abs(px - mp) / mp);
    }
    const p90 = percentile(obs, 0.9);
    return p90 == null ? null : { p90, n: obs.length };
}

export function detectMaxPain(obs: LevelObs, stats: { p90: number; n: number } | null, ctx: DetectCtx): { event: DetectedSignal | null; notes: string[] } {
    const cfg = cfgOf(ctx);
    const u = obsUsable(obs, ctx);
    if (!u.ok) return { event: null, notes: [`maxpain:${u.reason}`] };
    if (!obsIsRegular(obs)) return { event: null, notes: ['maxpain:not_regular'] };
    const day = etDateOf(obs.asOfMs);
    const mp = obs.maxPain;
    if (mp == null || !obs.expiry) return { event: null, notes: ['maxpain:no_level'] };
    const left = tradingSessionsInclusive(day, obs.expiry);
    if (!(left >= 1 && left <= cfg.maxPainSessions)) return { event: null, notes: ['maxpain:not_expiry_week'] };
    if (!stats || stats.n < cfg.maxPainMinObs || !(stats.p90 > 0)) return { event: null, notes: ['maxpain:no_distribution'] };
    const divPct = ((obs.spot - mp) / mp) * 100;
    const need = Math.max(stats.p90 * 100, cfg.maxPainFloorPct);
    if (Math.abs(divPct) < need) return { event: null, notes: ['maxpain:within_normal'] };
    const facts: MaxPainFacts = {
        kind: 'maxpain', maxPain: mp, price: obs.spot, divPct, p90Pct: stats.p90 * 100, n: stats.n, expiry: obs.expiry, chainDate: obs.chainDate, asOfMs: obs.asOfMs,
    };
    return {
        event: { ticker: obs.ticker, event: 'maxpain_divergence', key: obs.expiry, facts, asOfMs: obs.asOfMs, asOfDate: day, score: Math.abs(divPct) / (stats.p90 * 100) },
        notes: [],
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 다크풀 급증(FINRA)
// ═══════════════════════════════════════════════════════════════════════════

/** services/darkPool.getDarkPoolBatchChecked 의 행 중 판정에 쓰는 칸 */
export interface DarkRow {
    ticker: string;
    pct: number | null;
    volume: number | null;
    volRatio: number | null;
    volP: number | null;
    date: string | null;
    marketAvg: number | null;
}

export function detectDarkPool(row: DarkRow, o: { lastClosed: string; isEtf: boolean; cfg?: Partial<typeof SIG_CFG> }): { event: DetectedSignal | null; notes: string[] } {
    const cfg = { ...SIG_CFG, ...(o.cfg ?? {}) };
    if (o.isEtf) return { event: null, notes: ['darkpool:etf'] };
    // 그날 거래가 없어 옛 값이 이월된 행(date 가 더 이름)·낡은 적재는 «오늘 것»이 아니다
    if (!isDateStr(row.date) || row.date !== o.lastClosed) return { event: null, notes: [`darkpool:date_${row.date ?? 'null'}`] };
    const pct = pos(row.pct), ratio = pos(row.volRatio), vol = pos(row.volume), p = num(row.volP);
    if (pct == null || pct >= 100 || ratio == null || vol == null) return { event: null, notes: ['darkpool:missing'] };
    if (p == null) return { event: null, notes: ['darkpool:no_percentile'] };
    if (ratio < cfg.darkMinRatio || vol < cfg.darkMinVolume || p < cfg.darkMinPctile) return { event: null, notes: ['darkpool:below_threshold'] };
    const avg = pos(row.marketAvg);
    const facts: DarkSigFacts = {
        kind: 'darkpool', date: row.date, pct: Math.round(pct * 10) / 10, ratio: Math.round(ratio * 10) / 10, volume: vol,
        marketAvg: avg != null ? Math.round(avg * 10) / 10 : null,
    };
    return {
        event: { ticker: row.ticker, event: 'darkpool_spike', key: row.date, facts, asOfMs: etNoonMs(row.date), asOfDate: row.date, score: ratio },
        notes: [],
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// OI 급변 — 옵션 EOD 묶음의 확정 미결제약정 증가
// ═══════════════════════════════════════════════════════════════════════════

export interface OptionsEodTicker {
    callOI?: number;
    putOI?: number;
    top?: Array<{ k?: number; e?: string; t?: string; oi?: number; d?: number | null }>;
}
export interface OptionsEodMeta { date?: string; prevDate?: string }

export function detectOiSurge(sym: string, v: OptionsEodTicker | undefined, meta: OptionsEodMeta, o: { lastClosed: string; today: string; isEtf: boolean; cfg?: Partial<typeof SIG_CFG> }): { event: DetectedSignal | null; notes: string[] } {
    const cfg = { ...SIG_CFG, ...(o.cfg ?? {}) };
    if (o.isEtf) return { event: null, notes: ['oi:etf'] };
    const openedOn = meta.prevDate;
    if (!isDateStr(openedOn) || !v) return { event: null, notes: ['oi:no_bundle'] };
    // 묶음은 «마지막으로 끝난 세션»의 것일 때만 — 레코드 D 는 D 밤(약 02:20 ET)에 만들어지고 D−1 마감 포지션을 담는다.
    // 아직 새 묶음이 안 왔거나(수집 지연) 오래된 묶음이면 «지금 일어난 일»이 아니다.
    if (meta.date !== o.lastClosed) return { event: null, notes: [`oi:bundle_${meta.date ?? 'null'}_vs_${o.lastClosed}`] };
    if (!(calendarDaysBetween(openedOn, o.today) >= 0 && calendarDaysBetween(openedOn, o.today) <= 5)) return { event: null, notes: ['oi:opened_too_old'] };
    let notional = 0, callN = 0;
    let best: OiFacts['best'] | null = null;
    for (const c of v.top || []) {
        const d = num(c?.d), k = pos(c?.k), oi = num(c?.oi), e = c?.e;
        if (d == null || !(d > 0) || k == null || oi == null || !isDateStr(e) || e <= o.lastClosed) continue;   // 늘어난 것 · 아직 만기 안 지난 것만
        const n = d * 100 * k;
        notional += n;
        if (c.t === 'C') callN += n;
        if (!best || n > best.notional) best = { type: c.t === 'C' ? 'call' : 'put', strike: k, expiry: e, added: d, oi, notional: n };
    }
    if (!best) return { event: null, notes: ['oi:none'] };
    if (notional < cfg.oiMinNotional || best.added < cfg.oiMinAdded) return { event: null, notes: ['oi:below_threshold'] };
    const before = best.oi - best.added;
    const jump = before > 0 ? best.oi / before : null;
    if (jump != null && jump < cfg.oiMinJump) return { event: null, notes: ['oi:small_relative_jump'] };
    const facts: OiFacts = {
        kind: 'whale', openedOn, notional, callPct: Math.round((callN / notional) * 1000) / 10, best,
        jump: jump != null ? Math.round(jump * 10) / 10 : null,
    };
    return { event: { ticker: sym, event: 'oi_surge', key: openedOn, facts, asOfMs: etNoonMs(openedOn), asOfDate: openedOn, score: notional }, notes: [] };
}

// ═══════════════════════════════════════════════════════════════════════════
// 실적 D-1 — 회사가 공지한 발표일이 «다음 거래일»
// ═══════════════════════════════════════════════════════════════════════════

export interface EarnEntry { ticker: string; date: string; hour: 'bmo' | 'amc' | ''; etTime?: string | null }

export function detectEarningsD1(e: EarnEntry, o: { today: string; implied?: { pct: number | null; expiry: string | null } | null }): { event: DetectedSignal | null; notes: string[] } {
    if (!isDateStr(e.date) || !isTradingDate(o.today)) return { event: null, notes: ['earn:bad_day'] };
    if (e.date !== nextTradingDate(o.today)) return { event: null, notes: ['earn:not_d1'] };
    const im = o.implied && o.implied.pct != null && o.implied.pct > 0 && isDateStr(o.implied.expiry) ? o.implied : null;
    const facts: EarnD1Facts = {
        kind: 'earnings_d1', date: e.date, hour: e.hour, etTime: e.etTime ?? null,
        impliedPct: im ? Math.round(im.pct! * 10) / 10 : null, impliedExpiry: im ? im.expiry : null,
        tomorrow: calendarDaysBetween(o.today, e.date) === 1,
    };
    return { event: { ticker: e.ticker, event: 'earnings_d1', key: e.date, facts, asOfMs: etNoonMs(e.date), asOfDate: e.date, score: facts.impliedPct ?? 0 }, notes: [] };
}

/** 날짜 기준 자료의 «기준 시각»을 그날 ET 정오로 둔다(시각이 없는 자료 — 표시는 날짜만 쓴다) */
function etNoonMs(ymd: string): number {
    const [y, m, d] = ymd.split('-').map(Number);
    // 정오 UTC 기준으로 ET 날짜가 같다(EDT/EST 모두 07~08시) — 날짜 변환용이지 시각 표시용이 아니다
    return Date.UTC(y, m - 1, d, 16, 0, 0);
}
