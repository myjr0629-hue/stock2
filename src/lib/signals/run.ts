/**
 * 이상 신호 실행기 — 의존성 주입(저장소·읽기·AI·발송)으로 만든 순수한 흐름. 시험: tests/signals.run.test.ts
 *
 *   1) 모드(off | dry | live — 레디스 push:sig:mode 한 키, 없으면 dry) · 겹침 잠금
 *   2) 신호를 받을 수 있는 기기 읽기(푸시 토큰 레코드의 내 종목 사본)
 *   3) 저장본으로 탐지 — 구조 판본(레벨 교차·맥스페인) · 마감 뒤: 다크풀(FINRA)·OI(옵션 EOD 묶음)·실적 D-1(회사 공지)
 *   4) 기기별 선택 — 켜진 종류만 · 이미 보낸 (종목·신호·회차) 제외 · 재발송 금지 창 · 하루 상한 · 한 실행 상한
 *   5) AI 한 줄(신호당 한 번, 3개 언어 — 캐시 공유) → 본문 조립
 *   6) 장부를 «먼저» 잡고(SET NX) 보낸다 — 실패한 기기는 장부를 되돌린다. 푸시 겹침 금지 창에서는 보내지 않는다.
 *   7) 통계 push:stats:signal:{ET날짜} · 마지막 실행 요약 wlsig:last
 * 드라이런(preview)은 아무것도 쓰지 않는다 — 읽고 계산해 «누가 무엇을 받을지»만 돌려준다.
 */
import { etLastClosedSessionDate } from '@/lib/marketCalendar';
import {
    copyAllLocales, pushCopyOf, tapPathOf, type SignalPushCopy,
} from './copy';
import {
    detectCross, detectDarkPool, detectEarningsD1, detectMaxPain, detectOiSurge, freshestStored, obsFromStored, obsIsRegular, obsUsable,
    type DarkRow, type EarnEntry, type OptionsEodTicker,
} from './detect';
import { etDateOf, etMinutesOf, isTradingDate, nextTradingDate, tradingSessionsInclusive } from './calendar';
import {
    byPriority, candidatesFor, chooseForDevice, cooldownSec, deviceFromRecord, inPushBlackout, inQuietHours, signalId, SIG_KEYS, SIG_KV,
} from './plan';
import {
    ENABLED_EVENTS, EVENT_FUNNEL_SRC, SIG_CFG,
    type DetectedSignal, type Loc, type LocText, type LevelObs, type Platform, type SignalDevice, type SignalEvent, type TickerState,
} from './types';

// ── 의존성 ───────────────────────────────────────────────────────────────────

/** Upstash — 푸시 토큰·모드·장부(중복·상한). 값은 문자열(JSON)·숫자 */
export interface SigStore {
    smembers(key: string): Promise<string[]>;
    mget(keys: string[]): Promise<unknown[]>;
    get(key: string): Promise<unknown>;
    /** 없을 때만 쓴다 — 쓰면 true */
    setNx(key: string, value: string, exSec: number): Promise<boolean>;
    set(key: string, value: string, exSec?: number): Promise<void>;
    incr(key: string, exSec: number): Promise<number>;
    decr(key: string): Promise<number>;
    del(keys: string[]): Promise<void>;
    srem(key: string, members: string[]): Promise<void>;
}

/** EC2 레디스 — 종목별 상태·AI 캐시·통계(키마다 TTL) */
export interface SigKv {
    get<T>(key: string): Promise<T | null>;
    mget<T>(keys: string[]): Promise<Array<T | null>>;
    set(key: string, value: unknown, ttlSec: number): Promise<void>;
}

export interface OptionsBundle { date?: string; prevDate?: string; tickers?: Record<string, OptionsEodTicker> }

export interface SigReaders {
    /** structure:v2:{T} 와 lastgood 중 더 최근 것 */
    structure(tickers: string[]): Promise<Map<string, { data?: any; timestamp?: number } | null>>;
    maxPainStats(ticker: string, today: string): Promise<{ p90: number; n: number } | null>;
    darkRows(tickers: string[]): Promise<{ ok: boolean; rows: Map<string, DarkRow> }>;
    optionsBundle(): Promise<OptionsBundle | null>;
    /** 회사가 공지한 발표일이 date 인 항목 중 tickers 에 있는 것 */
    earningsOn(date: string, tickers: string[]): Promise<EarnEntry[]>;
    implied(entries: EarnEntry[], today: string): Promise<Map<string, { pct: number | null; expiry: string | null }>>;
    isEtf(t: string): boolean;
}

export interface AiLineResult { text: LocText | null; reason: string; cached: boolean; ms: number }
export interface SigAi { line(sig: DetectedSignal, todayEt: string): Promise<AiLineResult> }

export interface SendItem {
    id: string; token: string; platform: Platform; title: string; body: string; data: Record<string, string>; quiet: boolean; thread: string;
}
export type SendOutcome = 'ok' | 'fail' | 'dead';
export interface SigSender { send(items: SendItem[]): Promise<Map<string, SendOutcome>> }

export interface SigDeps { store: SigStore; kv: SigKv; readers: SigReaders; ai: SigAi | null; sender: SigSender | null }

// ── 옵션·결과 ─────────────────────────────────────────────────────────────────

export type SigMode = 'off' | 'dry' | 'live';
/** structure = 레벨 교차·맥스페인(장중) · data = 다크풀·OI(전 세션 자료가 도착한 아침) · earn = 실적 D-1(마감 뒤) · daily = data+earn · auto = 지금 ET 시각으로 */
export type SigPhase = 'structure' | 'data' | 'earn' | 'daily' | 'auto' | 'all';

export interface RunOpts {
    now: number;
    /** 요청된 실행: preview = 아무것도 쓰지 않는 드라이런 API · cron = 예약 실행(모드가 live 일 때만 보낸다) */
    kind: 'preview' | 'cron';
    phase: SigPhase;
    /** 환경변수 등 바깥에서 정한 모드(off 가 우선) */
    envMode?: SigMode | null;
    /** 가짜 기기(드라이런 표본) — only 면 실제 기기를 읽지 않는다 */
    sim?: { tickers: string[]; locale?: Loc; platform?: Platform; tz?: string | null; only?: boolean } | null;
    /** AI 를 부른다(미리보기에서만 선택 — cron live 는 늘 부른다) */
    ai?: boolean;
    /** 한 실행에서 AI 에게 쓸 시간(ms) */
    aiBudgetMs?: number;
    cfg?: Partial<typeof SIG_CFG>;
}

export interface SignalReport {
    status: 'off' | 'locked' | 'ok' | 'no-devices' | 'blackout';
    mode: SigMode;
    kind: RunOpts['kind'];
    phases: { structure: boolean; data: boolean; earn: boolean };
    etDate: string;
    at: string;
    devices: { eligible: number; tickers: number; sim: boolean };
    notes: string[];
    signals: Array<{ id: string; ticker: string; event: SignalEvent; key: string; enabled: boolean; asOf: string; score: number; recipients: number; ai?: { ok: boolean; reason: string; cached: boolean } }>;
    plan: Array<{ dev: string; platform: Platform; locale: Loc; tickers: number; quiet: boolean; chosen: string[]; skipped: Array<{ id: string; why: string }>; copy?: SignalPushCopy[] }>;
    samples: Array<{ id: string; ko: SignalPushCopy; en: SignalPushCopy; ja: SignalPushCopy }>;
    sent?: { items: number; ok: number; fail: number; dead: number; claimLost: number };
}

const ST_TTL = 36 * 3600;

function resolveMode(redisVal: unknown, envMode: SigMode | null | undefined): SigMode {
    if (envMode === 'off') return 'off';
    const v = typeof redisVal === 'string' ? redisVal.trim().toLowerCase() : '';
    if (v === 'off') return 'off';
    if (envMode === 'live' || v === 'live') return 'live';
    return 'dry';
}

async function loadDevices(store: SigStore): Promise<SignalDevice[]> {
    const tokens = (await store.smembers('push:token_list')) || [];
    const out: SignalDevice[] = [];
    for (let i = 0; i < tokens.length; i += 100) {
        const chunk = tokens.slice(i, i + 100);
        const recs = await store.mget(chunk.map((t) => `push:tokens:${t}`));
        chunk.forEach((t, j) => {
            const d = deviceFromRecord(t, recs?.[j]);
            if (d) out.push(d);
        });
    }
    return out;
}

const chunked = <T,>(xs: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < xs.length; i += n) o.push(xs.slice(i, i + n)); return o; };

export async function runSignals(deps: SigDeps, o: RunOpts): Promise<SignalReport> {
    const { store, kv, readers } = deps;
    const cfg = { ...SIG_CFG, ...(o.cfg ?? {}) };
    const now = o.now;
    const etDate = etDateOf(now);
    const at = new Date(now).toISOString();
    const preview = o.kind === 'preview';
    const rawMode = await store.get(SIG_KEYS.mode).catch(() => null);
    const mode = resolveMode(rawMode, o.envMode);
    const report: SignalReport = {
        status: 'ok', mode, kind: o.kind, phases: { structure: false, data: false, earn: false }, etDate, at,
        devices: { eligible: 0, tickers: 0, sim: !!o.sim }, notes: [], signals: [], plan: [], samples: [],
    };
    if (mode === 'off') return { ...report, status: 'off' };
    // 실제로 보내는가: cron 이고 모드가 live
    const live = !preview && mode === 'live';

    // ── 겹침 잠금(드라이런 API 는 잠그지 않는다 — 아무것도 쓰지 않으므로) ──
    let locked = false;
    if (!preview) {
        locked = await store.setNx(SIG_KEYS.lock, String(now), 150).catch(() => false);
        if (!locked) return { ...report, status: 'locked' };
    }
    try {
        // ── 국면 ──
        const tradingDay = isTradingDate(etDate);
        const minutes = etMinutesOf(now);
        const afterClose = tradingDay && minutes >= 16 * 60 + 30;
        // 전 세션 자료(다크풀 FINRA 약 22:00 ET · 옵션 EOD 묶음 약 02:20 ET)가 도착한 뒤의 아침 창 — 08:30~12:00 ET
        const dataWindow = tradingDay && minutes >= 8 * 60 + 30 && minutes < 12 * 60;
        const phase = o.phase;
        const doStructure = phase === 'structure' || phase === 'all' || (phase === 'auto' && tradingDay && !afterClose && minutes >= 9 * 60);
        const doData = phase === 'data' || phase === 'daily' || phase === 'all' || (phase === 'auto' && dataWindow);
        const doEarn = phase === 'earn' || phase === 'daily' || phase === 'all' || (phase === 'auto' && afterClose);
        report.phases = { structure: doStructure, data: doData, earn: doEarn };
        if (!tradingDay && phase === 'auto') report.notes.push('non_trading_day');

        // ── 기기 ──
        let devices: SignalDevice[] = o.sim?.only ? [] : await loadDevices(store);
        if (o.sim) {
            const tk = o.sim.tickers.slice(0, cfg.maxTickersPerDevice);
            devices = [...devices, { token: 'SIMULATED', dev: 'sim000000000', platform: o.sim.platform ?? 'ios', locale: o.sim.locale ?? 'ko', tickers: tk, tz: o.sim.tz ?? 'Asia/Seoul' }];
        }
        // 읽을 종목: 기기들이 담은 종목의 합집합 — 많은 기기가 담은 종목부터 상한까지(저장본을 읽는 양을 묶는다)
        const held = new Map<string, number>();
        for (const d of devices) for (const t of d.tickers) held.set(t, (held.get(t) ?? 0) + 1);
        const all0 = Array.from(held.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
        const tickers = all0.slice(0, cfg.maxUnionTickers);
        if (all0.length > tickers.length) report.notes.push(`tickers_capped: ${tickers.length}/${all0.length}`);
        report.devices = { eligible: devices.length, tickers: tickers.length, sim: !!o.sim };
        if (!devices.length || !tickers.length) {
            report.status = 'no-devices';
            if (!preview) await kv.set(SIG_KV.last, summaryOf(report), 3 * 86400).catch(() => {});
            return report;
        }

        // ── 탐지 ──
        const signals: DetectedSignal[] = [];
        const ctx = { now, cfg: o.cfg };

        if (doStructure) {
            const stored = await readers.structure(tickers).catch(() => new Map<string, any>());
            const obsMap = new Map<string, LevelObs>();
            for (const t of tickers) {
                const ob = obsFromStored(t, freshestStored(stored.get(t)));
                if (ob) obsMap.set(t, ob);
            }
            const states = await kv.mget<TickerState>(tickers.map(SIG_KV.arm)).catch(() => tickers.map(() => null));
            const cross = { events: 0, fresh: 0, skippedStale: 0 };
            const mpCands: LevelObs[] = [];
            const writes: Array<Promise<unknown>> = [];
            tickers.forEach((t, i) => {
                const ob = obsMap.get(t);
                if (!ob) return;
                const r = detectCross(states[i], ob, ctx);
                if (r.notes.includes('stale_obs')) cross.skippedStale++;
                for (const e of r.events) { signals.push(e); cross.events++; }
                if (r.state) {
                    cross.fresh++;
                    if (!preview) writes.push(kv.set(SIG_KV.arm(t), r.state, ST_TTL).catch(() => {}));
                }
                // 맥스페인 — 싼 사전 검사를 통과한 종목만 이력(DynamoDB)을 읽는다
                const u = obsUsable(ob, ctx);
                if (u.ok && obsIsRegular(ob) && ob.maxPain != null && ob.expiry) {
                    const left = tradingSessionsInclusive(etDateOf(ob.asOfMs), ob.expiry);
                    const divPct = Math.abs((ob.spot - ob.maxPain) / ob.maxPain) * 100;
                    if (left >= 1 && left <= cfg.maxPainSessions && divPct >= cfg.maxPainFloorPct) mpCands.push(ob);
                }
            });
            await Promise.all(writes);   // 서버리스는 응답 뒤 쓰기를 보장하지 않는다 — 기다린다
            report.notes.push(`structure: obs=${obsMap.size}/${tickers.length} fresh=${cross.fresh} stale=${cross.skippedStale} crossEvents=${cross.events} maxPainCandidates=${mpCands.length}`);
            for (const ob of mpCands.slice(0, 30)) {
                const stats = await readers.maxPainStats(ob.ticker, etDate).catch(() => null);
                const r = detectMaxPain(ob, stats, ctx);
                if (r.event) signals.push(r.event);
            }
        }

        if (doData) {
            const lastClosed = etLastClosedSessionDate(now);
            const nonEtf = tickers.filter((t) => !readers.isEtf(t));
            // 다크풀
            const dark = nonEtf.length ? await readers.darkRows(nonEtf).catch(() => ({ ok: false, rows: new Map<string, DarkRow>() })) : { ok: true, rows: new Map<string, DarkRow>() };
            if (!dark.ok) report.notes.push('darkpool: read_failed');
            let darkN = 0;
            for (const t of nonEtf) {
                const row = dark.rows.get(t);
                if (!row) continue;
                const r = detectDarkPool(row, { lastClosed, isEtf: false, cfg: o.cfg });
                if (r.event) { signals.push(r.event); darkN++; }
            }
            // OI 급변
            const bundle = await readers.optionsBundle().catch(() => null);
            if (!bundle?.tickers) report.notes.push('oi: no_bundle');
            let oiN = 0;
            if (bundle?.tickers) {
                for (const t of nonEtf) {
                    const r = detectOiSurge(t, bundle.tickers[t], { date: bundle.date, prevDate: bundle.prevDate }, { lastClosed, today: etDate, isEtf: false, cfg: o.cfg });
                    if (r.event) { signals.push(r.event); oiN++; }
                }
                if (!oiN && bundle.date !== lastClosed) report.notes.push(`oi: bundle ${bundle.date} is not the last closed session ${lastClosed}`);
            }
            report.notes.push(`data: lastClosed=${lastClosed} dark=${darkN} oi=${oiN}`);
        }

        if (doEarn) {
            // 실적 D-1 — 거래일 마감 뒤 하루 1회(회사 공지 발표일이 «다음 거래일»)
            let earnN = 0;
            if (tradingDay) {
                const d1 = nextTradingDate(etDate);
                const entries = await readers.earningsOn(d1, tickers).catch(() => [] as EarnEntry[]);
                if (entries.length) {
                    const im = await readers.implied(entries, etDate).catch(() => new Map<string, { pct: number | null; expiry: string | null }>());
                    for (const e of entries) {
                        const r = detectEarningsD1(e, { today: etDate, implied: im.get(e.ticker) ?? null });
                        if (r.event) { signals.push(r.event); earnN++; }
                    }
                }
            }
            report.notes.push(`earn: d1=${earnN}`);
        }

        // 같은 id 는 하나만
        const uniq = new Map<string, DetectedSignal>();
        for (const s of signals) if (!uniq.has(signalId(s))) uniq.set(signalId(s), s);
        const all = Array.from(uniq.values()).sort(byPriority);

        // ── 기기별 선택 ──
        const cands = new Map<string, DetectedSignal[]>();
        const sentKeys: string[] = [], coolKeys: string[] = [];
        for (const d of devices) {
            const c = candidatesFor(d, all, ENABLED_EVENTS);
            cands.set(d.dev, c);
            for (const s of c) { sentKeys.push(SIG_KEYS.sent(d.dev, s.ticker, s.event, s.key)); coolKeys.push(SIG_KEYS.cool(d.dev, s.ticker, s.event)); }
        }
        const ledger = new Set<string>();
        const readMany = async (keys: string[]) => {
            const found = new Set<string>();
            for (const part of chunked(keys, 200)) {
                const vals = await store.mget(part).catch(() => part.map(() => null));
                part.forEach((k, i) => { if (vals[i] != null) found.add(k); });
            }
            return found;
        };
        const sentFound = sentKeys.length ? await readMany(sentKeys) : ledger;
        const coolFound = coolKeys.length ? await readMany(coolKeys) : ledger;
        const capVals = await store.mget(devices.map((d) => SIG_KEYS.cap(etDate, d.dev))).catch(() => devices.map(() => null));
        const blackout = inPushBlackout(now);
        if (blackout) report.notes.push('push_blackout');

        interface Pick { device: SignalDevice; sig: DetectedSignal; quiet: boolean }
        const picks: Pick[] = [];
        const recipients = new Map<string, number>();
        devices.forEach((d, idx) => {
            const c = cands.get(d.dev) ?? [];
            const sent = new Set<string>(), cooled = new Set<string>();
            for (const s of c) {
                if (sentFound.has(SIG_KEYS.sent(d.dev, s.ticker, s.event, s.key))) sent.add(signalId(s));
                if (coolFound.has(SIG_KEYS.cool(d.dev, s.ticker, s.event))) cooled.add(`${s.ticker}:${s.event}`);
            }
            const used = Number(capVals[idx]) || 0;
            const ch = chooseForDevice(c, { sent, cooled, used }, { dailyCap: cfg.deviceDailyCap, perRun: cfg.perRunPerDevice });
            const quiet = inQuietHours(d.tz, now);
            for (const s of ch.chosen) { picks.push({ device: d, sig: s, quiet }); recipients.set(signalId(s), (recipients.get(signalId(s)) ?? 0) + 1); }
            report.plan.push({ dev: d.dev, platform: d.platform, locale: d.locale, tickers: d.tickers.length, quiet, chosen: ch.chosen.map(signalId), skipped: ch.skipped });
        });

        // ── AI 한 줄(실제로 나갈 신호만, 신호당 한 번) ──
        const wantAi = !!deps.ai && (live || o.ai === true);
        const aiBy = new Map<string, AiLineResult>();
        if (wantAi) {
            const need = Array.from(new Map(picks.map((p) => [signalId(p.sig), p.sig])).values());
            const deadline = Date.now() + (o.aiBudgetMs ?? 22_000);
            let next = 0;
            const worker = async () => {
                while (next < need.length) {
                    const s = need[next++];
                    if (Date.now() > deadline) { aiBy.set(signalId(s), { text: null, reason: 'budget', cached: false, ms: 0 }); continue; }
                    try { aiBy.set(signalId(s), await withTimeout(deps.ai!.line(s, etDate), Math.max(1000, deadline - Date.now()), { text: null, reason: 'timeout', cached: false, ms: 0 })); }
                    catch { aiBy.set(signalId(s), { text: null, reason: 'error', cached: false, ms: 0 }); }
                }
            };
            await Promise.all(Array.from({ length: Math.min(4, need.length) }, worker));
        }

        for (const s of all) {
            const id = signalId(s);
            const a = aiBy.get(id);
            report.signals.push({
                id, ticker: s.ticker, event: s.event, key: s.key, enabled: ENABLED_EVENTS.includes(s.event), asOf: new Date(s.asOfMs).toISOString(), score: Math.round(s.score * 100) / 100,
                recipients: recipients.get(id) ?? 0, ...(a ? { ai: { ok: !!a.text, reason: a.reason, cached: a.cached } } : {}),
            });
            report.samples.push({ id, ...copyAllLocales(s, a?.text ?? null) });
        }
        // 미리보기: 각 기기가 받을 본문(그 기기 언어)
        if (!live) {
            for (const p of report.plan) {
                const dv = devices.find((d) => d.dev === p.dev)!;
                p.copy = p.chosen.map((id) => pushCopyOf(uniq.get(id)!, dv.locale, aiBy.get(id)?.text?.[dv.locale] ?? null));
            }
        }

        // ── 실제 발송(live) ──
        if (live && picks.length) {
            if (blackout) { report.status = 'blackout'; }
            else if (!deps.sender) { report.notes.push('no_sender'); }
            else {
                const claimed: Array<{ p: Pick; id: string; keys: string[] }> = [];
                let claimLost = 0;
                for (const p of picks) {
                    const sk = SIG_KEYS.sent(p.device.dev, p.sig.ticker, p.sig.event, p.sig.key);
                    const ck = SIG_KEYS.cool(p.device.dev, p.sig.ticker, p.sig.event);
                    const capKey = SIG_KEYS.cap(etDate, p.device.dev);
                    const got = await store.setNx(sk, '1', cfg.dedupeTtlSec).catch(() => false);
                    if (!got) { claimLost++; continue; }
                    const n = await store.incr(capKey, 36 * 3600).catch(() => 999);
                    if (n > cfg.deviceDailyCap) {
                        await store.decr(capKey).catch(() => 0);
                        await store.del([sk]).catch(() => {});
                        claimLost++;
                        continue;
                    }
                    await store.set(ck, '1', cooldownSec(p.sig.event)).catch(() => {});
                    claimed.push({ p, id: `${p.device.dev}|${signalId(p.sig)}`, keys: [sk, ck] });
                }
                const items: SendItem[] = claimed.map((c) => {
                    const ai = aiBy.get(signalId(c.p.sig));
                    const copy = pushCopyOf(c.p.sig, c.p.device.locale, ai?.text?.[c.p.device.locale] ?? null);
                    return {
                        id: c.id, token: c.p.device.token, platform: c.p.device.platform, title: copy.title, body: copy.body, quiet: c.p.quiet,
                        thread: `sig-${c.p.sig.ticker}`,
                        data: { type: 'wl_signal', path: tapPathOf(c.p.sig.ticker), ev: c.p.sig.event, t: c.p.sig.ticker, src: EVENT_FUNNEL_SRC[c.p.sig.event], locale: c.p.device.locale },
                    };
                });
                const outcomes = items.length ? await deps.sender.send(items) : new Map<string, SendOutcome>();
                let ok = 0, fail = 0, dead = 0;
                const deadTokens = new Set<string>();
                for (const c of claimed) {
                    const out = outcomes.get(c.id) ?? 'fail';
                    if (out === 'ok') { ok++; continue; }
                    // 실패 — 장부를 되돌린다(다음 실행이 다시 시도) · 죽은 토큰은 정리
                    if (out === 'dead') { dead++; deadTokens.add(c.p.device.token); } else fail++;
                    await store.del(c.keys).catch(() => {});
                    await store.decr(SIG_KEYS.cap(etDate, c.p.device.dev)).catch(() => 0);
                }
                if (deadTokens.size) {
                    const list = Array.from(deadTokens);
                    await store.srem('push:token_list', list).catch(() => {});
                    await store.del(list.map((t) => `push:tokens:${t}`)).catch(() => {});
                }
                report.sent = { items: items.length, ok, fail, dead, claimLost };
                await writeStats(kv, etDate, now, claimed, outcomes, aiBy, report).catch(() => {});
            }
        }

        if (!preview) await kv.set(SIG_KV.last, summaryOf(report), 3 * 86400).catch(() => {});
        return report;
    } finally {
        if (locked) await store.del([SIG_KEYS.lock]).catch(() => {});
    }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([p, new Promise<T>((r) => { timer = setTimeout(() => r(fallback), ms); })]).finally(() => { if (timer) clearTimeout(timer); });
}

/** wlsig:last — 마지막 실행 요약(모니터링용, 표본 본문 제외) */
function summaryOf(r: SignalReport): unknown {
    return {
        at: r.at, mode: r.mode, status: r.status, phases: r.phases, devices: r.devices, notes: r.notes.slice(0, 12),
        signals: r.signals.map((s) => ({ id: s.id, enabled: s.enabled, recipients: s.recipients, ai: s.ai?.ok ?? null })).slice(0, 60),
        plan: { devices: r.plan.length, withChoice: r.plan.filter((p) => p.chosen.length).length },
        sent: r.sent ?? null,
    };
}

interface StatsDoc {
    day: string; runs: number; lastRunAt: string; items: number; sent: number; fail: number; dead: number; claimLost: number;
    byEvent: Record<string, { devices: number; sent: number }>;
    byPlatform: Record<string, { sent: number; fail: number }>;
    byLocale: Record<string, { sent: number; fail: number }>;
    ai: { lines: number; withAi: number };
    log: Array<{ at: string; ticker: string; event: string; key: string; devices: number; sent: number; ai: boolean }>;
}

async function writeStats(
    kv: SigKv, etDate: string, now: number,
    claimed: Array<{ p: { device: SignalDevice; sig: DetectedSignal }; id: string }>,
    outcomes: Map<string, SendOutcome>, aiBy: Map<string, AiLineResult>, report: SignalReport,
): Promise<void> {
    const prev = await kv.get<StatsDoc>(SIG_KV.stats(etDate)).catch(() => null);
    const doc: StatsDoc = prev && prev.day === etDate ? prev : {
        day: etDate, runs: 0, lastRunAt: '', items: 0, sent: 0, fail: 0, dead: 0, claimLost: 0, byEvent: {}, byPlatform: {}, byLocale: {}, ai: { lines: 0, withAi: 0 }, log: [],
    };
    doc.runs += 1;
    doc.lastRunAt = new Date(now).toISOString();
    doc.items += claimed.length;
    doc.claimLost += report.sent?.claimLost ?? 0;
    const per = new Map<string, { sig: DetectedSignal; devices: number; sent: number }>();
    for (const c of claimed) {
        const out = outcomes.get(c.id) ?? 'fail';
        const ev = (doc.byEvent[c.p.sig.event] ??= { devices: 0, sent: 0 });
        ev.devices += 1;
        const pl = (doc.byPlatform[c.p.device.platform] ??= { sent: 0, fail: 0 });
        const lc = (doc.byLocale[c.p.device.locale] ??= { sent: 0, fail: 0 });
        if (out === 'ok') { doc.sent += 1; ev.sent += 1; pl.sent += 1; lc.sent += 1; } else { doc.fail += out === 'fail' ? 1 : 0; doc.dead += out === 'dead' ? 1 : 0; pl.fail += 1; lc.fail += 1; }
        const id = signalId(c.p.sig);
        const row = per.get(id) ?? { sig: c.p.sig, devices: 0, sent: 0 };
        row.devices += 1; if (out === 'ok') row.sent += 1;
        per.set(id, row);
    }
    for (const [id, row] of per) {
        const a = aiBy.get(id);
        doc.ai.lines += 1; if (a?.text) doc.ai.withAi += 1;
        doc.log.push({ at: doc.lastRunAt, ticker: row.sig.ticker, event: row.sig.event, key: row.sig.key, devices: row.devices, sent: row.sent, ai: !!a?.text });
    }
    doc.log = doc.log.slice(-80);
    await kv.set(SIG_KV.stats(etDate), doc, 60 * 86400);
}

