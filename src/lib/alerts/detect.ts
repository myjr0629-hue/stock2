/**
 * 알림 탐지 — 순수 함수(네트워크·시계·저장소 없음). 입력 = 직전 스냅샷 + 현재 스냅샷 + 문맥.
 *
 * 기획 §6-1 판정(초안 그대로):
 *   콜월 돌파·풋플로어 이탈·감마플립 교차 = 5분 봉 «종가» 확정, 되돌림 방지 여유 0.2%
 *   만기 주간 맥스페인 괴리 = 만기 3거래일 이내 & |가격 − 맥스페인| ≥ 자기 20일 괴리 상위 10%
 *   장외 비중 급변 = FINRA 일간 장외 비중 ≥ 자기 20일 평균 + 2σ (장 마감 뒤 1회, 날짜 게이트 뒤)
 *   고래 신규 포지션 = 플로우 화면 «NEW POSITION DETECTED» 와 같은 규칙(아침 1회)
 *   실적 D-1 = 다음 거래일이 실적일(하루 1회)
 *
 * 기획 §8 데이터 신뢰 게이트 — 레벨이 정의를 어기거나 낡았으면 «그 이벤트를 건너뛴다»(보내지 않는 것이 틀린 알림보다 낫다):
 *   정의: 콜월 ∈ (S, 1.2S] · 풋플로어 ∈ [0.8S, S) · 감마플립 |K−S| ≤ 0.15S · 맥스페인 |K−S| ≤ 0.35S
 *        (S = 그 레벨을 계산한 현물. structureService 의 선택 범위·fix/levels-one-door-gate 의 게이트와 같은 부등호)
 *   신선도: 계산 45분 이내 · 만기 ≥ 오늘 · (구조가 chainDate 를 실으면) 미결제약정 EOD ≥ 직전 거래일 ·
 *          계산 현물과 현재 종가 차이 5% 이내
 *   감마플립은 EXACT(누적 GEX 부호 교차)만 — NEAR_ZERO 는 근사값이라 «교차»를 말할 수 없다.
 */
import { tradingSessionsInclusive } from './calendar';
import type {
    AlertEventId, Arm, CrossKind, DarkPoolInput, DetectedEvent, LevelSet, TickerSnapshot, WhaleContract,
} from './types';

export const DETECT_DEFAULTS = {
    /** 되돌림 방지 여유(0.2%) */
    crossBuffer: 0.002,
    /** 레벨은 계산 뒤 이 시간까지만 믿는다(장중) */
    levelMaxAgeMs: 45 * 60_000,
    /** 무장(반대편에서 레벨을 본 기억)은 이 시간까지만 유효 */
    armMaxAgeMs: 45 * 60_000,
    /** 봉이 끝난 뒤 이 시간이 지나면 «지금 일어난 일»이 아니다 */
    barMaxAgeMs: 12 * 60_000,
    /** 직전 봉과 이만큼 넘게 벌어지면(결측) 튐 검사를 하지 않는다 */
    barGapMaxMs: 20 * 60_000,
    /** 레벨 계산 현물과 현재 종가가 이보다 멀면 그 레벨 세트를 쓰지 않는다 */
    spotDriftMax: 0.05,
    /** 5분 사이 종가가 이보다 크게 뛰면 틱 오류로 본다 */
    maxJump: 0.2,
    bands: { callWallMax: 1.2, putFloorMin: 0.8, gammaFlip: 0.15, maxPain: 0.35 },
    gammaFlipTypes: ['EXACT'] as string[],
    maxPainSessions: 3,
    maxPainMinObs: 30,
    darkPoolSigma: 2,
    darkPoolMinN: 15,
    darkPoolWindow: 20,
    /** FINRA 분모 수리(9/09, 19afc90ad) 이전 비중은 기준선에 넣지 않는다 */
    darkPoolMinBaselineDate: '2026-09-09',
    /** flow 화면 uoaAlert 와 같은 기준(app-view/flow/page.tsx NOTIONAL_MIN·OI_MIN) */
    whaleNotionalMin: 10_000_000,
    whaleOiMin: 10_000,
};
export type DetectConfig = typeof DETECT_DEFAULTS;

export interface DetectPhases {
    intraday: boolean;
    maxPain: boolean;
    darkPool: boolean;
    whale: boolean;
    earnings: boolean;
}

export interface DetectContext {
    now: number;
    /** 오늘 ET 거래일 */
    session: string;
    /** 직전 거래일(오늘 장중 레벨의 미결제약정이 속한 세션) */
    prevSession: string;
    /** 다음 거래일(실적 D-1 판정) */
    nextSession: string;
    phases: DetectPhases;
    config?: Partial<DetectConfig>;
}

export type LevelKind = 'callWall' | 'putFloor' | 'gammaFlip' | 'maxPain';

export interface DetectResult {
    events: DetectedEvent[];
    /** 다음 스냅샷에 실을 무장 상태 */
    arms: Partial<Record<CrossKind, Arm>>;
    /** 건너뛴 이유(진단·드라이런 보고용) */
    notes: string[];
}

const pos = (x: unknown): number | null => {
    const n = typeof x === 'number' ? x : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
};

function cfgOf(ctx: DetectContext): DetectConfig {
    return { ...DETECT_DEFAULTS, ...(ctx.config ?? {}), bands: { ...DETECT_DEFAULTS.bands, ...(ctx.config?.bands ?? {}) } };
}

// ═══════════════════════════════════════════════════════════════════
// 데이터 신뢰 게이트
// ═══════════════════════════════════════════════════════════════════

/** 정의 검사 — S 는 그 레벨을 계산한 현물. 경계값은 부동소수 오차를 흡수한다. */
export function levelDefinitionOk(kind: LevelKind, level: number | null | undefined, spot: number | null | undefined, bands = DETECT_DEFAULTS.bands): boolean {
    const k = pos(level), s = pos(spot);
    if (k == null || s == null) return false;
    const eps = s * 1e-9;
    switch (kind) {
        case 'callWall': return k > s && k <= s * bands.callWallMax + eps;
        case 'putFloor': return k < s && k >= s * bands.putFloorMin - eps;
        case 'gammaFlip': return Math.abs(k - s) <= s * bands.gammaFlip + eps;
        case 'maxPain': return Math.abs(k - s) <= s * bands.maxPain + eps;
    }
}

export interface TrustedLevels {
    usable: Partial<Record<LevelKind, number>>;
    reasons: string[];
}

/**
 * 레벨 세트를 «지금(atMs) 가격 refPrice 에서» 써도 되는가.
 * 세트 전체가 낡았으면 전부 빼고, 개별 레벨이 정의를 어기면 그 레벨만 뺀다.
 */
export function trustLevels(
    lv: LevelSet | null | undefined,
    refPrice: number | null,
    atMs: number,
    ctx: Pick<DetectContext, 'session' | 'prevSession'>,
    cfg: DetectConfig = DETECT_DEFAULTS,
): TrustedLevels {
    const reasons: string[] = [];
    if (!lv) return { usable: {}, reasons: ['no_levels'] };
    const asOf = typeof lv.asOf === 'number' && Number.isFinite(lv.asOf) ? lv.asOf : null;
    if (asOf == null) reasons.push('no_asof');
    else if (atMs - asOf > cfg.levelMaxAgeMs) reasons.push('stale_levels');
    else if (asOf - atMs > 60_000) reasons.push('future_asof');
    if (!lv.expiration || lv.expiration < ctx.session) reasons.push('expired_chain');
    if (lv.chainDate && lv.chainDate < ctx.prevSession) reasons.push('stale_chain');
    const s0 = pos(lv.spot);
    if (s0 == null) reasons.push('no_spot');
    const ref = pos(refPrice);
    if (s0 != null && ref != null && Math.abs(s0 / ref - 1) > cfg.spotDriftMax) reasons.push('spot_drift');
    if (reasons.length) return { usable: {}, reasons };

    const usable: Partial<Record<LevelKind, number>> = {};
    const check = (kind: LevelKind, v: number | null) => {
        if (v == null) return;
        if (levelDefinitionOk(kind, v, s0, cfg.bands)) usable[kind] = v;
        else reasons.push(`bad_${kind}`);
    };
    check('callWall', pos(lv.callWall));
    check('putFloor', pos(lv.putFloor));
    const gf = pos(lv.gammaFlip);
    if (gf != null) {
        if (!lv.gammaFlipType || !cfg.gammaFlipTypes.includes(lv.gammaFlipType)) reasons.push('gamma_flip_not_exact');
        else if (lv.gexConfidence === 'LOW') reasons.push('gamma_low_confidence');
        else check('gammaFlip', gf);
    }
    check('maxPain', pos(lv.maxPain));
    return { usable, reasons };
}

// ═══════════════════════════════════════════════════════════════════
// 5분 종가 교차(무장 → 확정)
// ═══════════════════════════════════════════════════════════════════

/** 현재 가격이 레벨의 «교차 전» 쪽에 있으면 그 무장 방향 */
export function armSide(kind: CrossKind, level: number, close: number): Arm['side'] | null {
    if (kind === 'callWall') return close < level ? 'below' : null;
    if (kind === 'putFloor') return close > level ? 'above' : null;
    if (close < level) return 'below';
    if (close > level) return 'above';
    return null;
}

/** 무장된 레벨을 5분 종가가 여유폭 너머로 확정했는가 */
export function crossDirection(kind: CrossKind, arm: Arm, close: number, buffer: number): 'up' | 'down' | null {
    const up = arm.side === 'below' && close >= arm.level * (1 + buffer);
    const down = arm.side === 'above' && close <= arm.level * (1 - buffer);
    if (kind === 'callWall') return up ? 'up' : null;
    if (kind === 'putFloor') return down ? 'down' : null;
    return up ? 'up' : down ? 'down' : null;
}

/** 레벨을 넘었지만 아직 여유폭 안(확정 대기) — 이 동안은 기존 무장을 새 레벨로 바꾸지 않는다 */
function pendingConfirmation(arm: Arm, close: number, buffer: number): boolean {
    return arm.side === 'below'
        ? close >= arm.level && close < arm.level * (1 + buffer)
        : close <= arm.level && close > arm.level * (1 - buffer);
}

const CROSS_EVENT: Record<CrossKind, AlertEventId> = {
    callWall: 'call_wall_break',
    putFloor: 'put_floor_break',
    gammaFlip: 'gamma_flip_cross',
};

// ═══════════════════════════════════════════════════════════════════
// 분포 도구
// ═══════════════════════════════════════════════════════════════════

/** 최근접 순위 백분위(p ∈ (0,1]) — 표본이 작아도 «실제 관측값» 하나를 돌려준다 */
export function percentile(values: number[], p: number): number | null {
    const xs = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!xs.length) return null;
    const rank = Math.min(xs.length, Math.max(1, Math.ceil(p * xs.length)));
    return xs[rank - 1];
}

/**
 * 맥스페인 괴리 분포 — 구조 굽기(structure-build)가 남긴 이력 행(같은 getStructureData 정의)에서.
 * 한 행 = 한 관측(|가격 − 맥스페인| / 맥스페인). 최근 20거래일만, 오늘 행은 뺀다.
 */
export function maxPainDivergenceP90(
    rows: Array<{ session: string; price: number | null; maxPain: number | null }>,
    today: string,
    windowSessions = 20,
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

/** 장외 비중 기준선 — date 이전 세션 중 최근 window 개(기준 날짜 이후만). 표본 표준편차. */
export function darkPoolBaseline(
    series: NonNullable<DarkPoolInput['series']>,
    date: string,
    cfg: Pick<DetectConfig, 'darkPoolWindow' | 'darkPoolMinBaselineDate'> = DETECT_DEFAULTS,
): { mean: number; sd: number; n: number } | null {
    const pts: Array<{ d: string; v: number }> = [];
    series.dates.forEach((d, i) => {
        const v = series.pct?.[i];
        if (typeof d === 'string' && d < date && d >= cfg.darkPoolMinBaselineDate && typeof v === 'number' && Number.isFinite(v) && v > 0) {
            pts.push({ d, v });
        }
    });
    pts.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    const xs = pts.slice(-cfg.darkPoolWindow).map((p) => p.v);
    if (xs.length < 2) return null;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
    return { mean, sd: Math.sqrt(variance), n: xs.length };
}

/** flow 화면 «NEW POSITION DETECTED» 와 같은 규칙: 만기 안 지난 ΔOI>0 중 명목 1위, 명목 ≥ $10M 또는 ΔOI ≥ 10,000 */
export function pickWhale(contracts: WhaleContract[], today: string, cfg: Pick<DetectConfig, 'whaleNotionalMin' | 'whaleOiMin'> = DETECT_DEFAULTS): WhaleContract | null {
    let top: WhaleContract | null = null;
    for (const c of contracts || []) {
        if (!(c.oiChange > 0) || !(c.strike > 0) || !c.expiration || c.expiration < today) continue;
        const notional = Number.isFinite(c.notional) && c.notional > 0 ? c.notional : c.oiChange * 100 * c.strike;
        if (!top || notional > top.notional) top = { ...c, notional };
    }
    if (!top) return null;
    return top.notional >= cfg.whaleNotionalMin || top.oiChange >= cfg.whaleOiMin ? top : null;
}

// ═══════════════════════════════════════════════════════════════════
// 종목 하나 탐지
// ═══════════════════════════════════════════════════════════════════

export function detectTicker(prev: TickerSnapshot | null, cur: TickerSnapshot, ctx: DetectContext): DetectResult {
    const cfg = cfgOf(ctx);
    const events: DetectedEvent[] = [];
    const notes: string[] = [];
    const T = cur.ticker;
    const b = cfg.crossBuffer;

    // ── 무장 상태: 오늘 세션·나이 안의 것만 이어받는다 ────────────
    const armValid = (a: Arm | undefined): a is Arm =>
        !!a && a.session === ctx.session && ctx.now - a.armedAt <= cfg.armMaxAgeMs && pos(a.level) != null;
    const prevArms = prev?.arms ?? {};
    const arms: Partial<Record<CrossKind, Arm>> = {};
    for (const k of ['callWall', 'putFloor', 'gammaFlip'] as CrossKind[]) {
        if (armValid(prevArms[k])) arms[k] = prevArms[k];
    }

    // ── 현재 5분 종가(교차·괴리 판정에 쓸 «확정 가격») ────────────
    const bar = cur.bar;
    let close: number | null = null;
    if (!bar) notes.push('no_bar');
    else if (bar.session !== ctx.session) notes.push('bar_other_session');
    else if (ctx.now - bar.endMs > cfg.barMaxAgeMs) notes.push('stale_bar');
    else if (!(bar.close > 0)) notes.push('bad_bar');
    else {
        const pb = prev?.bar;
        const sameSession = pb && pb.session === bar.session && bar.endMs - pb.endMs <= cfg.barGapMaxMs;
        if (sameSession && pb!.close > 0 && Math.abs(bar.close / pb!.close - 1) > cfg.maxJump) notes.push('bar_jump');
        else close = bar.close;
    }
    const newBar = !!(close != null && bar && !(prev?.bar && prev.bar.session === bar.session && prev.bar.endMs >= bar.endMs));

    // ── 1) 교차(장중) ──────────────────────────────────────────
    if (ctx.phases.intraday && close != null) {
        const trusted = trustLevels(cur.levels, close, ctx.now, ctx, cfg);
        if (trusted.reasons.length) notes.push(...trusted.reasons.map((r) => `levels:${r}`));
        for (const k of ['callWall', 'putFloor', 'gammaFlip'] as CrossKind[]) {
            const arm = arms[k];
            // 같은 봉을 두 번 보지 않는다(크론이 봉보다 자주 돌 때)
            if (arm && newBar) {
                const dir = crossDirection(k, arm, close, b);
                if (dir) {
                    events.push({
                        ticker: T,
                        event: CROSS_EVENT[k],
                        sessionKey: ctx.session,
                        timeSensitive: true,
                        facts: {
                            level: arm.level,
                            direction: dir,
                            price: close,
                            // «다음 벽»·맥스페인·풋콜은 현재 신뢰 레벨에서만(없으면 싣지 않는다)
                            nextWall: k === 'callWall' && trusted.usable.callWall && trusted.usable.callWall > arm.level ? trusted.usable.callWall : null,
                            maxPain: trusted.usable.maxPain ?? null,
                            pcr: cur.levels?.pcr ?? null,
                        },
                    });
                    delete arms[k];
                }
            }
            // 다시 무장 — 확정 대기 중인 무장은 지킨다(구조가 벽을 다시 골라도 «사용자가 보던 벽»을 놓치지 않게)
            const keep = arms[k] && pendingConfirmation(arms[k]!, close, b);
            const L = trusted.usable[k];
            if (!keep && L != null && cur.levels?.asOf != null) {
                const side = armSide(k, L, close);
                if (side) arms[k] = { level: L, side, armedAt: ctx.now, session: ctx.session, levelAsOf: cur.levels.asOf };
            }
        }
    }

    // ── 2) 만기 주간 맥스페인 괴리 ─────────────────────────────────
    if (ctx.phases.maxPain) {
        if (close == null) notes.push('maxpain:no_price');
        else {
            const trusted = trustLevels(cur.levels, close, ctx.now, ctx, cfg);
            const mp = trusted.usable.maxPain;
            const exp = cur.levels?.expiration ?? null;
            const left = exp ? tradingSessionsInclusive(ctx.session, exp) : 0;
            const st = cur.maxPainStats;
            if (mp == null) notes.push(`maxpain:${trusted.reasons.join('|') || 'none'}`);
            else if (!(left >= 1 && left <= cfg.maxPainSessions)) notes.push('maxpain:not_expiry_week');
            else if (!st || st.n < cfg.maxPainMinObs || !(st.p90 > 0)) notes.push('maxpain:no_distribution');
            else {
                const div = (close - mp) / mp;
                if (Math.abs(div) >= st.p90) {
                    events.push({
                        ticker: T, event: 'maxpain_divergence', sessionKey: ctx.session, timeSensitive: false,
                        facts: { maxPain: mp, price: close, divergencePct: div * 100, expiration: exp },
                    });
                }
            }
        }
    }

    // ── 3) 장외(다크풀) 비중 급변 — FINRA 날짜 게이트: 오늘 세션 자료만 ─────
    if (ctx.phases.darkPool) {
        const dp = cur.darkPool;
        if (!dp || !dp.series || !(pos(dp.pct) != null)) notes.push('darkpool:none');
        else if (dp.date !== ctx.session) notes.push(`darkpool:date_${dp.date ?? 'null'}`);
        else {
            const base = darkPoolBaseline(dp.series, dp.date, cfg);
            if (!base || base.n < cfg.darkPoolMinN || !(base.sd > 0)) notes.push('darkpool:thin_baseline');
            else {
                const z = (dp.pct! - base.mean) / base.sd;
                if (z >= cfg.darkPoolSigma) {
                    events.push({
                        ticker: T, event: 'darkpool_spike', sessionKey: dp.date, timeSensitive: false,
                        facts: { pct: dp.pct!, mean: base.mean, ratio: dp.pct! / base.mean, sigma: z, date: dp.date },
                    });
                }
            }
        }
    }

    // ── 4) 고래 신규 포지션 — 직전 세션 EOD 미결제약정만 ────────────
    if (ctx.phases.whale) {
        const w = cur.whale;
        if (!w) notes.push('whale:none');
        else if (w.date !== ctx.prevSession) notes.push(`whale:date_${w.date ?? 'null'}`);
        else {
            const top = pickWhale(w.contracts, ctx.session, cfg);
            if (top) {
                events.push({
                    ticker: T, event: 'whale_new', sessionKey: w.date, timeSensitive: false,
                    facts: { contract: top, date: w.date },
                });
            }
        }
    }

    // ── 5) 실적 D-1 ────────────────────────────────────────────
    if (ctx.phases.earnings) {
        const e = cur.earnings;
        if (e && e.date === ctx.nextSession) {
            events.push({
                ticker: T, event: 'earnings_d1', sessionKey: e.date, timeSensitive: false,
                facts: { earningsDate: e.date, timing: e.timing, impliedMovePct: e.impliedMovePct },
            });
        }
    }

    return { events, arms, notes };
}
