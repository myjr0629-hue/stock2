/**
 * 알림 실행기 — 크론 한 번 = 이 함수 한 번. 모든 바깥 의존(저장소·자료·발송·PRO 확인·시계)은 주입받는다(시험 가능).
 *
 * 한 번의 흐름:
 *   ① 지금이 어느 단계인가(ET 시각·거래일) → 할 일이 없으면 저장소도 건드리지 않고 끝.
 *   ② 구독 종목 색인(IDX) → 직전 스냅샷(P#) 일괄 읽기.
 *   ③ 자료: 5분 봉(레벨 근처 종목 우선·상한) → 레벨(구조 서비스, 근처·낡은 것만 갱신) → 단계별 자료.
 *   ④ 탐지(detect.ts, 순수) → 중복 억제(종목+이벤트+회차, 조건부 쓰기) → 종목 구독자 조회.
 *   ⑤ 기기별: PRO 만료 재확인 → 한 종목 여러 건은 한 통 → 3종목 이상이면 요약 한 통 → 하루 상한(원자적) →
 *      조용한 시간이면 무음 → 같은 내용끼리 묶어 발송(push/send.ts).
 *   ⑥ 스냅샷 저장·단계 완료 표식.
 *
 * 드라이런(기본): ④의 조건부 쓰기·⑤의 상한 소모·발송·⑥ 저장을 하지 않는다 — 읽기만 하고 «무엇을 보냈을지»를 돌려준다.
 */
import { deviceHashOf, type AlertStore } from './store';
import { detectTicker, trustLevels, type DetectConfig, type DetectPhases, type DetectContext } from './detect';
import { etClock, nextTradingDate, prevTradingDate, tradingSessionsInclusive } from './calendar';
import { formatBundle, formatTickerGroup, type AlertCopy } from './messages';
import { inQuietHours } from './quiet';
import type { ProVerifier } from './revenuecat';
import type {
    AlertEventId, AlertLocale, AlertPlatform, Bar5, DarkPoolInput, DetectedEvent, EarningsInput, LevelSet, MaxPainStats,
    TickerRecipient, TickerSnapshot, WhaleInput,
} from './types';

// ═══════════════════════════════════════════════════════════════════
// 주입 인터페이스
// ═══════════════════════════════════════════════════════════════════

/** 시간 예산 — 제공자는 마감이 지나면 새 호출을 시작하지 않는다 */
export interface Budget {
    deadline: number;
}

export interface LevelsResult {
    levels: LevelSet | null;
    /** 구조가 아는 만기 목록(실적 뒤 만기 고르기용) */
    expirations: string[];
}

export interface AlertDataProvider {
    getBars(tickers: string[], session: string, nowMs: number, budget: Budget): Promise<Record<string, Bar5 | null>>;
    getLevels(tickers: string[], spots: Record<string, number>, nowMs: number, budget: Budget): Promise<Record<string, LevelsResult>>;
    getMaxPainStats(tickers: string[], session: string, budget: Budget): Promise<Record<string, MaxPainStats | null>>;
    getDarkPool(tickers: string[]): Promise<Record<string, DarkPoolInput | null>>;
    getWhales(tickers: string[]): Promise<Record<string, WhaleInput | null>>;
    getEarnings(
        tickers: string[], date: string,
        hint: { spots: Record<string, number>; expirations: Record<string, string[]> },
        budget: Budget,
    ): Promise<Record<string, EarningsInput | null>>;
}

export type AlertLevel = 'time-sensitive' | 'active' | 'passive';

/** 같은 내용의 푸시 한 묶음(토큰 여럿) */
export interface AlertPush {
    platform: AlertPlatform;
    tokens: string[];
    title: string;
    body: string;
    /** apns-collapse-id · android tag — 티커(요약은 'wl-summary') */
    collapseId: string;
    data: Record<string, string>;
    level: AlertLevel;
    /** 조용한 시간 — 소리 없이 */
    silent: boolean;
    /** 보관 시간(초) — 이 뒤에는 기기에 늦게 도착시키지 않는다 */
    ttlSec: number;
}

export interface AlertSendResult {
    sent: number;
    failed: number;
    /** 영구히 죽은 토큰(삭제 대상) */
    deadTokens: string[];
}

export interface AlertSender {
    send(pushes: AlertPush[]): Promise<AlertSendResult>;
}

export interface RunDeps {
    store: AlertStore;
    provider: AlertDataProvider;
    sender: AlertSender | null;
    verifyPro?: ProVerifier;
    now?: () => number;
    log?: (msg: string, extra?: unknown) => void;
}

export interface RunOptions {
    dryRun: boolean;
    /** 수동 점검용 — 시각과 상관없이 이 단계들을 돈다 */
    phases?: Partial<DetectPhases>;
    /** 수동 점검용 — 이 종목만 */
    tickers?: string[];
    maxTickers?: number;
    timeBudgetMs?: number;
    maxBarFetch?: number;
    maxLevelRefresh?: number;
    /** 거래일이 아니어도 돈다(수동 점검) */
    ignoreCalendar?: boolean;
    /** 종목별 게이트 판정까지 보고에 싣는다 */
    verbose?: boolean;
    /** 탐지 기준 일부 덮어쓰기(예: 벤더 5분 봉 지연을 실측한 뒤 barMaxAgeMs 조정) */
    detectConfig?: Partial<DetectConfig>;
}

export interface RunReport {
    at: string;
    dryRun: boolean;
    session: string;
    etMinutes: number;
    phases: DetectPhases;
    skipped?: string;
    tickers: number;
    barsFetched: number;
    /** 받은 5분 봉의 나이(봉 끝 → 지금, 초) — 벤더 지연 실측용(드라이런으로 먼저 본다) */
    barAgeSec: { p50: number | null; max: number | null };
    levelsRefreshed: number;
    events: Array<{ ticker: string; event: AlertEventId; sessionKey: string; recipients: number; status: string }>;
    notifications: Array<{ device: string; platform: AlertPlatform; locale: AlertLocale; title: string; body: string; level: AlertLevel; silent: boolean; status: string }>;
    sent: number;
    failed: number;
    pruned: number;
    notes?: Record<string, string[]>;
    errors: string[];
    ms: number;
}

// ═══════════════════════════════════════════════════════════════════
// 시간표(ET) — 크론은 5분마다 부르고, 무엇을 할지는 여기서 정한다
// ═══════════════════════════════════════════════════════════════════
const HM = (h: number, m: number) => h * 60 + m;
export const PHASE_WINDOWS = {
    /** 첫 5분 봉(9:30~9:35)을 9:35 에 무장, 9:40 부터 비교 · 마지막 봉(15:55~16:00)은 16:00~16:05 에 */
    intraday: [HM(9, 35), HM(16, 5)] as const,
    /** 고래: 옵션 EOD 적재(≈04:30 ET) 뒤 개장 전 한 번 */
    whale: [HM(9, 0), HM(9, 30)] as const,
    /** 실적 D-1: 개장 1시간 뒤(옵션 호가가 자리 잡은 뒤) 하루 한 번 */
    earnings: [HM(10, 30), HM(11, 0)] as const,
    /** 맥스페인 괴리: 하루 두 번 */
    maxPain: [[HM(10, 30), HM(10, 50)], [HM(14, 30), HM(14, 50)]] as const,
    /** 장외 비중: FINRA 적재(≈17:45 ET) 뒤 */
    darkPool: [HM(18, 0), HM(20, 0)] as const,
};

const inWin = (m: number, w: readonly [number, number]) => m >= w[0] && m < w[1];

export interface PhaseClock {
    session: string;
    prevSession: string;
    nextSession: string;
    minutes: number;
    tradingDay: boolean;
    phases: DetectPhases;
    maxPainSlot: 'am' | 'pm' | null;
}

export function phaseClock(nowMs: number): PhaseClock {
    const c = etClock(nowMs);
    const slot = inWin(c.minutes, PHASE_WINDOWS.maxPain[0]) ? 'am' : inWin(c.minutes, PHASE_WINDOWS.maxPain[1]) ? 'pm' : null;
    const on = c.tradingDay;
    return {
        session: c.date,
        prevSession: prevTradingDate(c.date),
        nextSession: nextTradingDate(c.date),
        minutes: c.minutes,
        tradingDay: c.tradingDay,
        maxPainSlot: on ? slot : null,
        phases: {
            intraday: on && inWin(c.minutes, PHASE_WINDOWS.intraday),
            whale: on && inWin(c.minutes, PHASE_WINDOWS.whale),
            earnings: on && inWin(c.minutes, PHASE_WINDOWS.earnings),
            maxPain: on && slot !== null,
            darkPool: on && inWin(c.minutes, PHASE_WINDOWS.darkPool),
        },
    };
}

// ═══════════════════════════════════════════════════════════════════
// 한도·상수
// ═══════════════════════════════════════════════════════════════════
export const RUN_DEFAULTS = {
    /** 안전 상한 — 실제 부하는 봉·레벨 상한이 정한다(종목이 많으면 근처 우선 + 오래된 순 순환) */
    maxTickers: 2000,
    timeBudgetMs: 45_000,
    /** 한 번에 받을 5분 봉 상한(벤더 1콜/종목 — 관측 한도 분당 ~500콜의 1/3 이하) */
    maxBarFetch: 150,
    /** 한 번에 갱신할 레벨 상한(구조 계산은 무겁다) */
    maxLevelRefresh: 40,
    /** 레벨이 이보다 오래됐으면 갱신 대상(신뢰 게이트 45분보다 짧게 — 한 번 놓쳐도 게이트 안) */
    levelRefreshMs: 25 * 60_000,
    /** 이 거리 안이면 «근처» — 봉·레벨을 매번 받는다 */
    nearPct: 0.03,
    /** 기기 하나에 한 번에 이만큼 이상 종목이면 요약 한 통으로 */
    bundleMin: 3,
    /** «지금 일어난 일»은 15분 뒤엔 배달하지 않는다(기획 §7 보관 5~15분) */
    ttlTimeSensitiveSec: 15 * 60,
    ttlDefaultSec: 2 * 3600,
    markerTtlSec: 3 * 86400,
};

export function alertDeepLinkPath(ticker: string | null): string {
    return ticker ? `/app-view/flow?t=${encodeURIComponent(ticker)}&from=alert` : '/app-view/dash?from=alert';
}

// ═══════════════════════════════════════════════════════════════════
// 도우미
// ═══════════════════════════════════════════════════════════════════

/** 직전 종가가 무장·신뢰 레벨에 얼마나 가까운가(가까울수록 작다). 봉이 없으면 0(먼저 받아야 한다). */
export function nearness(prev: TickerSnapshot | undefined, session: string, prevSession: string, nowMs: number): number {
    const close = prev?.bar?.close;
    if (!prev || !(close && close > 0) || prev.bar?.session !== session) return 0;
    const levels: number[] = [];
    for (const a of Object.values(prev.arms ?? {})) if (a && a.level > 0) levels.push(a.level);
    const t = trustLevels(prev.levels, close, nowMs, { session, prevSession });
    for (const k of ['callWall', 'putFloor', 'gammaFlip'] as const) {
        const v = t.usable[k];
        if (v) levels.push(v);
    }
    if (!levels.length) return Number.POSITIVE_INFINITY;
    return Math.min(...levels.map((l) => Math.abs(close / l - 1)));
}

async function mapLimit<T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
            const x = items[i++];
            await fn(x);
        }
    });
    await Promise.all(workers);
}

const levelOf = (evs: DetectedEvent[]): AlertLevel => (evs.some((e) => e.timeSensitive) ? 'time-sensitive' : 'active');

// ═══════════════════════════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════════════════════════
export async function runWatchlistAlerts(deps: RunDeps, opts: RunOptions): Promise<RunReport> {
    const started = Date.now();
    const now = (deps.now ?? Date.now)();
    const log = deps.log ?? (() => { });
    const o = { ...RUN_DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) } as typeof RUN_DEFAULTS & RunOptions;
    const budget: Budget = { deadline: started + (opts.timeBudgetMs ?? RUN_DEFAULTS.timeBudgetMs) };
    const clock = phaseClock(now);
    const manual = !!opts.phases;
    const phases: DetectPhases = manual
        ? { intraday: false, maxPain: false, darkPool: false, whale: false, earnings: false, ...opts.phases }
        : clock.phases;

    const report: RunReport = {
        at: new Date(now).toISOString(), dryRun: opts.dryRun, session: clock.session, etMinutes: clock.minutes,
        phases, tickers: 0, barsFetched: 0, barAgeSec: { p50: null, max: null }, levelsRefreshed: 0, events: [], notifications: [],
        sent: 0, failed: 0, pruned: 0, errors: [], ms: 0,
    };
    const done = () => { report.ms = Date.now() - started; return report; };

    if (!clock.tradingDay && !opts.ignoreCalendar) { report.skipped = 'non_trading_day'; return done(); }
    if (!Object.values(phases).some(Boolean)) { report.skipped = 'no_phase'; return done(); }

    const { store, provider } = deps;

    // ── 하루 한 번짜리 단계는 완료 표식이 있으면 건너뛴다(수동 점검은 표식을 보지 않는다) ──
    const markerKey = {
        whale: `whale:${clock.prevSession}`,
        earnings: `earnings:${clock.session}`,
        darkPool: `darkpool:${clock.session}`,
        maxPain: `maxpain:${clock.session}:${clock.maxPainSlot ?? 'manual'}`,
    };
    if (!manual) {
        for (const k of ['whale', 'earnings', 'darkPool', 'maxPain'] as const) {
            if (phases[k] && (await store.getMarker(markerKey[k]))) phases[k] = false;
        }
        if (!Object.values(phases).some(Boolean)) { report.skipped = 'phases_done'; return done(); }
    }

    // ── 감시할 종목·직전 스냅샷 ──────────────────────────────────
    let tickers = opts.tickers?.length
        ? Array.from(new Set(opts.tickers.map((t) => t.toUpperCase())))
        : await store.listSubscribedTickers();
    tickers = tickers.slice(0, o.maxTickers);
    report.tickers = tickers.length;
    if (!tickers.length) { report.skipped = 'no_subscribers'; return done(); }
    const prev = await store.loadSnapshots(tickers);

    const cur: Record<string, TickerSnapshot> = {};
    for (const t of tickers) {
        const p = prev[t];
        cur[t] = {
            ticker: t, at: now, session: clock.session,
            bar: p?.bar ?? null,
            levels: p?.levels ?? null,
            arms: p?.arms ?? {},
            maxPainStats: p?.maxPainStats ?? null,
            barFetchedAt: p?.barFetchedAt ?? null,
        };
    }
    const spots: Record<string, number> = {};
    const expirations: Record<string, string[]> = {};

    // ── 5분 봉 + 레벨(장중·맥스페인 단계) ─────────────────────────
    const needPrice = phases.intraday || phases.maxPain || phases.earnings;
    if (needPrice) {
        const scored = tickers.map((t) => ({ t, d: nearness(prev[t], clock.session, clock.prevSession, now), at: prev[t]?.barFetchedAt ?? 0 }));
        const near = scored.filter((x) => x.d <= o.nearPct).sort((a, b) => a.d - b.d);
        const far = scored.filter((x) => x.d > o.nearPct).sort((a, b) => a.at - b.at);
        const barList = [...near, ...far].slice(0, o.maxBarFetch).map((x) => x.t);
        try {
            const bars = await provider.getBars(barList, clock.session, now, budget);
            const ages: number[] = [];
            for (const t of barList) {
                const b = bars[t];
                if (b) { cur[t].bar = b; cur[t].barFetchedAt = now; report.barsFetched++; ages.push(Math.round((now - b.endMs) / 1000)); }
            }
            ages.sort((a, b) => a - b);
            if (ages.length) report.barAgeSec = { p50: ages[Math.floor((ages.length - 1) / 2)], max: ages[ages.length - 1] };
        } catch (e: any) {
            report.errors.push(`bars:${e?.message || e}`);
        }
        for (const t of tickers) {
            const b = cur[t].bar;
            if (b && b.session === clock.session && b.close > 0) spots[t] = b.close;
        }

        const dist = (t: string) => nearness(cur[t], clock.session, clock.prevSession, now);
        const expiryWeek = (t: string) => {
            const exp = cur[t].levels?.expiration;
            const left = exp ? tradingSessionsInclusive(clock.session, exp) : 0;
            return left >= 1 && left <= 3;
        };
        const levelList = tickers
            .filter((t) => spots[t] && cur[t].bar?.endMs && cur[t].barFetchedAt === now)
            .filter((t) => {
                const lv = cur[t].levels;
                if (!lv || !lv.asOf || now - lv.asOf > o.levelRefreshMs) return true;
                if (phases.maxPain && expiryWeek(t)) return true;   // 괴리는 «지금» 맥스페인으로
                return dist(t) <= o.nearPct;
            })
            .sort((a, b) => dist(a) - dist(b))
            .slice(0, o.maxLevelRefresh);
        if (levelList.length) {
            try {
                const lv = await provider.getLevels(levelList, spots, now, budget);
                for (const t of levelList) {
                    const r = lv[t];
                    if (!r) continue;
                    if (r.levels) { cur[t].levels = r.levels; report.levelsRefreshed++; }
                    if (r.expirations?.length) expirations[t] = r.expirations;
                }
            } catch (e: any) {
                report.errors.push(`levels:${e?.message || e}`);
            }
        }
    }

    // ── 단계별 자료 ─────────────────────────────────────────────
    let maxPainOk = true;
    if (phases.maxPain) {
        const need = tickers.filter((t) => {
            const exp = cur[t].levels?.expiration;
            const left = exp ? tradingSessionsInclusive(clock.session, exp) : 0;
            return left >= 1 && left <= 3 && cur[t].maxPainStats?.date !== clock.session;
        });
        if (need.length) {
            try {
                const st = await provider.getMaxPainStats(need, clock.session, budget);
                for (const t of need) if (st[t]) cur[t].maxPainStats = st[t];
            } catch (e: any) {
                maxPainOk = false;
                report.errors.push(`maxpain:${e?.message || e}`);
            }
        }
    }
    let darkPoolFresh = false, whaleFresh = false, earningsOk = false;
    if (phases.darkPool) {
        try {
            const dp = await provider.getDarkPool(tickers);
            for (const t of tickers) {
                cur[t].darkPool = dp[t] ?? null;
                if (dp[t]?.date === clock.session) darkPoolFresh = true;
            }
        } catch (e: any) {
            report.errors.push(`darkpool:${e?.message || e}`);
        }
    }
    if (phases.whale) {
        try {
            const w = await provider.getWhales(tickers);
            for (const t of tickers) {
                cur[t].whale = w[t] ?? null;
                if (w[t]?.date === clock.prevSession) whaleFresh = true;
            }
        } catch (e: any) {
            report.errors.push(`whale:${e?.message || e}`);
        }
    }
    if (phases.earnings) {
        try {
            const e = await provider.getEarnings(tickers, clock.nextSession, { spots, expirations }, budget);
            for (const t of tickers) cur[t].earnings = e[t] ?? null;
            earningsOk = true;
        } catch (e: any) {
            report.errors.push(`earnings:${e?.message || e}`);
        }
    }

    // ── 탐지 ───────────────────────────────────────────────────
    const ctx: DetectContext = {
        now, session: clock.session, prevSession: clock.prevSession, nextSession: clock.nextSession, phases,
        config: opts.detectConfig,
    };
    const events: DetectedEvent[] = [];
    const notes: Record<string, string[]> = {};
    for (const t of tickers) {
        const r = detectTicker(prev[t] ?? null, cur[t], ctx);
        cur[t].arms = r.arms;
        events.push(...r.events);
        if (r.notes.length) notes[t] = r.notes;
    }
    if (opts.verbose) report.notes = notes;

    // ── 중복 억제 → 구독자 → 기기별 묶음 ─────────────────────────
    type Pending = { r: TickerRecipient; groups: Map<string, DetectedEvent[]> };
    const byDevice = new Map<string, Pending>();
    const recipientsCache = new Map<string, TickerRecipient[]>();
    for (const ev of events) {
        let status = 'queued';
        try {
            const first = opts.dryRun
                ? !(await store.wasSent(ev.ticker, ev.event, ev.sessionKey))
                : await store.recordSent(ev.ticker, ev.event, ev.sessionKey, now);
            if (!first) {
                report.events.push({ ticker: ev.ticker, event: ev.event, sessionKey: ev.sessionKey, recipients: 0, status: 'already_sent' });
                continue;
            }
            if (!recipientsCache.has(ev.ticker)) recipientsCache.set(ev.ticker, await store.listTokensForTicker(ev.ticker));
            const rs = (recipientsCache.get(ev.ticker) ?? []).filter((r) => r.events.includes(ev.event));
            for (const r of rs) {
                const p = byDevice.get(r.deviceHash) ?? { r, groups: new Map<string, DetectedEvent[]>() };
                const g = p.groups.get(ev.ticker) ?? [];
                g.push(ev);
                p.groups.set(ev.ticker, g);
                byDevice.set(r.deviceHash, p);
            }
            report.events.push({ ticker: ev.ticker, event: ev.event, sessionKey: ev.sessionKey, recipients: rs.length, status });
        } catch (e: any) {
            status = 'error';
            report.errors.push(`dedupe:${ev.ticker}:${ev.event}:${e?.message || e}`);
            report.events.push({ ticker: ev.ticker, event: ev.event, sessionKey: ev.sessionKey, recipients: 0, status });
        }
    }

    // ── 기기별: PRO 재확인 → 문구 → 상한 → 조용한 시간 ─────────────
    const outbox = new Map<string, AlertPush>();
    const plannedCount = new Map<string, number>();
    const devices = Array.from(byDevice.values());
    await mapLimit(devices, 8, async ({ r, groups }) => {
        // PRO 만료가 지났으면 발송 전에 다시 확인한다(유료 기능 — 만료된 기기에 보내지 않는다)
        if (r.proUntil !== null && r.proUntil < now) {
            if (!deps.verifyPro) { report.notifications.push(noteOf(r, 'pro_unverified')); return; }
            try {
                const dev = await store.getDevice(r.deviceHash);
                const st = dev ? await deps.verifyPro(dev.rcAppUserId) : { active: false, expiresAtMs: null };
                if (!st.active) {
                    if (!opts.dryRun) await store.deleteSubscription(r.deviceHash);
                    report.notifications.push(noteOf(r, 'pro_expired'));
                    return;
                }
                if (!opts.dryRun) await store.updateProUntil(r.deviceHash, st.expiresAtMs, now);
            } catch {
                report.notifications.push(noteOf(r, 'pro_check_failed'));
                return;
            }
        }

        const tickerGroups = Array.from(groups.entries());
        const copies: Array<{ copy: AlertCopy; collapseId: string; evs: DetectedEvent[]; ticker: string | null }> =
            tickerGroups.length >= o.bundleMin
                ? [{
                    copy: formatBundle(tickerGroups.map(([, g]) => g), r.locale, clock.session),
                    collapseId: 'wl-summary',
                    evs: tickerGroups.flatMap(([, g]) => g),
                    ticker: null,
                }]
                : tickerGroups.map(([t, g]) => ({ copy: formatTickerGroup(g, r.locale, clock.session), collapseId: t, evs: g, ticker: t }));

        const quiet = inQuietHours(r.quiet, now);
        for (const c of copies) {
            let allowed: boolean;
            try {
                if (opts.dryRun) {
                    const used = (await store.sentCount(r.deviceHash, clock.session)) + (plannedCount.get(r.deviceHash) ?? 0);
                    allowed = used < r.dailyCap;
                    if (allowed) plannedCount.set(r.deviceHash, (plannedCount.get(r.deviceHash) ?? 0) + 1);
                } else {
                    allowed = await store.tryConsumeDaily(r.deviceHash, clock.session, r.dailyCap, now);
                }
            } catch (e: any) {
                report.errors.push(`cap:${e?.message || e}`);
                allowed = false;
            }
            const level: AlertLevel = quiet ? 'passive' : levelOf(c.evs);
            report.notifications.push({
                device: r.deviceHash.slice(0, 8), platform: r.platform, locale: r.locale,
                title: c.copy.title, body: c.copy.body, level, silent: quiet,
                status: allowed ? (opts.dryRun ? 'would_send' : 'queued') : 'daily_cap',
            });
            if (!allowed) continue;
            const ttlSec = c.evs.some((e) => e.timeSensitive) ? o.ttlTimeSensitiveSec : o.ttlDefaultSec;
            const data: Record<string, string> = {
                type: 'watchlist_alert',
                ticker: c.ticker ?? '',
                event: c.ticker ? c.evs.map((e) => e.event).join(',') : 'bundle',
                path: alertDeepLinkPath(c.ticker),
            };
            const key = JSON.stringify([r.platform, c.copy.title, c.copy.body, c.collapseId, data.event, level, quiet, ttlSec]);
            const box = outbox.get(key) ?? {
                platform: r.platform, tokens: [], title: c.copy.title, body: c.copy.body,
                collapseId: c.collapseId, data, level, silent: quiet, ttlSec,
            };
            box.tokens.push(r.token);
            outbox.set(key, box);
        }
    });

    // ── 발송 ───────────────────────────────────────────────────
    const pushes = Array.from(outbox.values());
    if (!opts.dryRun && pushes.length) {
        if (!deps.sender) {
            report.errors.push('sender_unavailable');
        } else {
            try {
                const res = await deps.sender.send(pushes);
                report.sent = res.sent;
                report.failed = res.failed;
                for (const tok of Array.from(new Set(res.deadTokens))) {
                    try { await store.deleteSubscription(deviceHashOf(tok)); report.pruned++; } catch { /* 다음 실행에 다시 */ }
                }
            } catch (e: any) {
                report.errors.push(`send:${e?.message || e}`);
            }
        }
    }

    // ── 상태 저장·완료 표식(드라이런은 쓰지 않는다) ────────────────
    if (!opts.dryRun) {
        try {
            await store.saveSnapshots(Object.values(cur), now);
        } catch (e: any) {
            report.errors.push(`snapshots:${e?.message || e}`);
        }
        if (!manual) {
            const mark = async (k: keyof typeof markerKey, ok: boolean) => {
                if (phases[k] && ok) await store.setMarker(markerKey[k], new Date(now).toISOString(), o.markerTtlSec, now).catch(() => { });
            };
            await mark('darkPool', darkPoolFresh);
            await mark('whale', whaleFresh);
            await mark('earnings', earningsOk);
            await mark('maxPain', maxPainOk);
        }
    }
    if (report.errors.length) log('[watchlist-alerts] errors', report.errors);
    return done();
}

function noteOf(r: TickerRecipient, status: string): RunReport['notifications'][number] {
    return { device: r.deviceHash.slice(0, 8), platform: r.platform, locale: r.locale, title: '', body: '', level: 'active', silent: false, status };
}
