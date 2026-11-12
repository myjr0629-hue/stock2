// ============================================================================
// PRO 가격 레벨 알림 — 평가·발송 실행기(의존성 주입 · 순수 흐름). 시험: tests/proAlerts.run.test.ts
//   1) 모드(off | live — Upstash push:pro-alerts:v1:mode · 환경변수 PRO_ALERTS_MODE=off 우선) · 정규장만 · 겹침 잠금
//   2) 기록 색인 → 활성 레벨이 있는 기기 · 푸시 토큰 레코드로 마스터 알림·시스템 권한 확인(무료 신호와 같은 규칙)
//   3) 종목 합집합의 정규장 가격(가격 허브 우선 · 빠진 종목만 Intrinio · 실행·하루 상한) → 종목별 직전 관측과 교차 판정
//   4) 기기별: 이미 보낸 (id, rev) 제외 · PRO 확인(캐시 만료면 RC 재확인 · 실행 상한) · 하루 상한(PRO 전용 키) · 한 실행 상한
//   5) 장부를 «먼저» 잡고(SET NX) 보낸다 — 확정 실패·죽은 토큰만 장부·상한을 되돌린다
// 무료 신호의 키(push:sig:*)·크론·상한은 읽지도 쓰지도 않는다.
// 미리보기(preview)는 아무것도 쓰지 않는다(발송 0 · RC 재확인 0 · 공급사 호출은 허브만).
// ============================================================================
import { cashSessionPhaseAt, etDateOf } from '@/lib/marketCalendar';
import { inPushBlackout, inQuietHours } from '@/lib/signals/plan';
import { parseRecord } from '@/lib/push/prefs';
import {
    PA_CFG, PA_KEYS, activeLevels, crossed, pushCopy, shouldStoreObs,
    type ProAlertRecord, type StoredLevel, type TickerObs,
} from './core';
import type { ProVerdict } from './rcVerify';

export interface PaStore {
    smembers(key: string): Promise<string[]>;
    mget(keys: string[]): Promise<unknown[]>;
    get(key: string): Promise<unknown>;
    setNx(key: string, value: string, exSec: number): Promise<boolean>;
    set(key: string, value: string, exSec?: number): Promise<void>;
    incr(key: string, exSec: number): Promise<number>;
    decr(key: string): Promise<number>;
    del(keys: string[]): Promise<void>;
    srem(key: string, members: string[]): Promise<void>;
}
export interface PriceRead { prices: Map<string, { p: number; at: number }>; hub: number; vendor: number; missing: number; vendorCalls: number }
export interface PaPrices { read(tickers: string[], now: number, opts: { allowVendor: boolean }): Promise<PriceRead> }
export interface PaSendItem { id: string; token: string; platform: 'ios' | 'android'; title: string; body: string; data: Record<string, string>; quiet: boolean; thread: string }
export type PaOutcome = 'ok' | 'fail' | 'dead';
export interface PaDeps {
    store: PaStore;
    prices: PaPrices;
    sender: { send(items: PaSendItem[]): Promise<Map<string, PaOutcome>> } | null;
    /** RC 재확인(발송 때 캐시가 만료된 기기) — 원문 ID 를 꺼낼 수 없으면 null */
    reverify: ((rec: ProAlertRecord) => Promise<ProVerdict | null>) | null;
}
export interface PaRunOpts {
    now: number;
    kind: 'preview' | 'cron';
    envMode?: 'off' | 'live' | null;
    /** 미리보기에서 장 시간 검사를 건너뛴다 */
    force?: boolean;
    maxReverifyPerRun?: number;
}
export interface PaReport {
    status: 'off' | 'closed' | 'blackout' | 'locked' | 'no-devices' | 'ok';
    kind: PaRunOpts['kind'];
    etDate: string;
    at: string;
    devices: { indexed: number; active: number; eligible: number };
    levels: number;
    tickers: number;
    price?: Omit<PriceRead, 'prices'>;
    crossings: Array<{ dev: string; t: string; id: string; dir: string; px: number; prev: number; cur: number; why?: string }>;
    sent?: { items: number; ok: number; fail: number; dead: number; claimLost: number; capped: number; notPro: number; unverified: number };
    notes: string[];
}

const chunked = <T,>(xs: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < xs.length; i += n) o.push(xs.slice(i, i + n)); return o; };

function resolveMode(redisVal: unknown, env: 'off' | 'live' | null | undefined): 'off' | 'live' {
    if (env === 'off') return 'off';
    return typeof redisVal === 'string' && redisVal.trim().toLowerCase() === 'off' ? 'off' : 'live';
}

/** 푸시 토큰 레코드 — 무료 신호와 같은 규칙: SIGNUM 앱 · 마스터 알림이 꺼지지 않음 · 시스템 권한이 «꺼짐»으로 보고되지 않음 */
export function tokenAllows(raw: unknown): boolean {
    const rec = parseRecord<{ app?: string; preferences?: any; notifPerm?: boolean }>(raw);
    if (!rec) return false;
    if (rec.app && rec.app !== 'signum') return false;
    if (rec.notifPerm === false) return false;
    const p = rec.preferences;
    if (p && typeof p === 'object' && p.enabled === false) return false;
    return true;
}

export async function runProAlerts(deps: PaDeps, o: PaRunOpts): Promise<PaReport> {
    const now = o.now;
    const etDate = etDateOf(now);
    const preview = o.kind === 'preview';
    const report: PaReport = {
        status: 'ok', kind: o.kind, etDate, at: new Date(now).toISOString(),
        devices: { indexed: 0, active: 0, eligible: 0 }, levels: 0, tickers: 0, crossings: [], notes: [],
    };
    const { store } = deps;

    const mode = resolveMode(await store.get(PA_KEYS.mode).catch(() => null), o.envMode);
    if (mode === 'off' && !preview) { report.status = 'off'; return report; }
    if (!(o.force && preview) && cashSessionPhaseAt(now) !== 'regular') { report.status = 'closed'; return report; }
    if (!preview && inPushBlackout(now)) { report.status = 'blackout'; return report; }
    if (!preview && !(await store.setNx(PA_KEYS.lock, String(now), 240))) { report.status = 'locked'; return report; }

    // ── 기기 ──
    const devs = (await store.smembers(PA_KEYS.idx)) || [];
    report.devices.indexed = devs.length;
    const recs: ProAlertRecord[] = [];
    const gone: string[] = [];
    for (const part of chunked(devs, 100)) {
        const vals = await store.mget(part.map(PA_KEYS.rec));
        part.forEach((d, i) => {
            const r = parseRecord<ProAlertRecord>(vals[i]);
            if (!r || r.v !== 1 || r.dev !== d) { gone.push(d); return; }
            if (activeLevels(r).length) recs.push(r);
        });
    }
    if (gone.length && !preview) await store.srem(PA_KEYS.idx, gone).catch(() => {});
    report.devices.active = recs.length;
    // 토큰 레코드(마스터 알림·권한) — 없거나 꺼졌으면 이번엔 건너뛴다(기록은 30일 TTL 로 사라진다)
    const eligible: ProAlertRecord[] = [];
    for (const part of chunked(recs, 100)) {
        const toks = await store.mget(part.map((r) => `push:tokens:${r.token}`));
        part.forEach((r, i) => { if (tokenAllows(toks[i])) eligible.push(r); });
    }
    report.devices.eligible = eligible.length;
    if (!eligible.length) { report.status = 'no-devices'; return report; }

    // ── 가격 ──
    const count = new Map<string, number>();
    for (const r of eligible) for (const l of activeLevels(r)) { count.set(l.t, (count.get(l.t) ?? 0) + 1); report.levels++; }
    const tickers = [...count.keys()].sort((a, b) => (count.get(b)! - count.get(a)!) || a.localeCompare(b)).slice(0, 500);
    if (count.size > tickers.length) report.notes.push(`tickers-capped:${count.size}`);
    report.tickers = tickers.length;
    const pr = await deps.prices.read(tickers, now, { allowVendor: !preview });
    report.price = { hub: pr.hub, vendor: pr.vendor, missing: pr.missing, vendorCalls: pr.vendorCalls };
    const prevVals = await store.mget(tickers.map(PA_KEYS.tick));
    const prev = new Map<string, TickerObs | null>();
    tickers.forEach((t, i) => prev.set(t, parseRecord<TickerObs>(prevVals[i])));
    const cur = new Map<string, TickerObs>();
    for (const t of tickers) {
        const q = pr.prices.get(t);
        if (q && q.p > 0 && etDateOf(q.at) === etDate && q.at <= now + 60_000) cur.set(t, { p: q.p, at: q.at, d: etDate });
    }

    // ── 교차 ──
    //   지난 실행에서 교차했지만 못 보낸 레벨(한 실행 상한·PRO 확인 불가·발송 실패 — 관문 11121338 ③)은 «대기» 표식으로 30분 동안 다시 시도한다.
    type Cand = { rec: ProAlertRecord; level: StoredLevel; prev: TickerObs; cur: TickerObs; pending?: boolean };
    const cands: Cand[] = [];
    const actives: Array<{ rec: ProAlertRecord; level: StoredLevel }> = [];
    for (const rec of eligible) for (const level of activeLevels(rec)) actives.push({ rec, level });
    const pendVals: unknown[] = [];
    for (const part of chunked(actives, 100)) pendVals.push(...(await store.mget(part.map((a) => PA_KEYS.pend(a.rec.dev, a.level.id, a.level.rev)))));
    actives.forEach(({ rec, level }, i) => {
        const c = cur.get(level.t);
        const p = prev.get(level.t);
        if (c && p && crossed(level, p, c)) { cands.push({ rec, level, prev: p, cur: c }); return; }
        const pend = parseRecord<{ p?: number; at?: number; prev?: number }>(pendVals[i]);
        if (pend && Number(pend.p) > 0 && Number.isFinite(pend.at)) {
            cands.push({ rec, level, prev: { p: Number(pend.prev) || 0, at: 0, d: etDate }, cur: c ?? { p: Number(pend.p), at: Number(pend.at), d: etDate }, pending: true });
        }
    });

    // 종목 상태(직전 관측)를 새 값으로 — 교차 판정 «뒤»에(같은 실행 안에서 쓴 값으로 판정하지 않게)
    if (!preview) {
        const writes = tickers.filter((t) => cur.has(t) && shouldStoreObs(prev.get(t), cur.get(t)!));
        await Promise.all(writes.map((t) => store.set(PA_KEYS.tick(t), JSON.stringify(cur.get(t)), PA_CFG.tickerStateTtlSec).catch(() => {})));
    }
    if (!cands.length) return report;

    // 이미 보낸 (id, rev) 거르기
    const firedVals = await store.mget(cands.map((c) => PA_KEYS.fired(c.rec.dev, c.level.id, c.level.rev)));
    const fresh = cands.filter((_, i) => !firedVals[i]);
    for (const c of cands) report.crossings.push({ dev: c.rec.dev.slice(0, 8), t: c.level.t, id: c.level.id, dir: c.level.dir, px: c.level.px, prev: c.prev.p, cur: c.cur.p, ...(fresh.includes(c) ? (c.pending ? { why: 'pending' } : {}) : { why: 'sent' }) });
    if (preview) return report;
    // 이미 보낸 레벨의 대기 표식은 지운다
    const stale = cands.filter((c, i) => c.pending && firedVals[i]).map((c) => PA_KEYS.pend(c.rec.dev, c.level.id, c.level.rev));
    if (stale.length) await store.del(stale).catch(() => {});
    if (!fresh.length) return report;

    /** 못 보낸 교차 — 30분 동안 다음 실행이 다시 시도한다(처음 교차한 값을 그대로) */
    const markPending = async (c: Cand) => {
        if (c.pending) return;
        await store.set(PA_KEYS.pend(c.rec.dev, c.level.id, c.level.rev), JSON.stringify({ p: c.cur.p, at: c.cur.at, prev: c.prev.p }), PA_CFG.pendingTtlSec).catch(() => {});
    };

    // ── 기기별 선택 · PRO 확인 ──
    //   크론은 기기 기록을 다시 쓰지 않는다(사용자가 그사이 바꾼 설정을 옛 값으로 덮지 않게 — 관문 11121338 ④). PRO 판정은 고객 캐시 키에만.
    const sent = { items: 0, ok: 0, fail: 0, dead: 0, claimLost: 0, capped: 0, notPro: 0, unverified: 0 };
    report.sent = sent;
    const byDev = new Map<string, Cand[]>();
    for (const c of fresh) { const a = byDev.get(c.rec.dev) ?? []; a.push(c); byDev.set(c.rec.dev, a); }
    const devList = [...byDev.keys()];
    const proCache = await store.mget(devList.map((d) => PA_KEYS.pro(byDev.get(d)![0].rec.uidHash)));
    const cacheOf = new Map(devList.map((d, i) => [d, parseRecord<{ until?: number; neg?: number }>(proCache[i])] as const));
    let reverifyLeft = o.maxReverifyPerRun ?? 20;
    const items: PaSendItem[] = [];
    const meta = new Map<string, { claim: string; cap: string; rec: ProAlertRecord; cand: Cand }>();
    for (const [dev, list] of byDev) {
        const rec = list[0].rec;
        const cache = cacheOf.get(dev);
        const proOk = rec.proUntil > now || (cache?.until ?? 0) > now;
        if (!proOk) {
            if ((cache?.neg ?? 0) > now) { sent.notPro += list.length; continue; }
            const v = reverifyLeft > 0 && deps.reverify ? (reverifyLeft--, await deps.reverify(rec).catch(() => null)) : null;
            if (!v || v.kind === 'limited' || v.kind === 'unavailable') { sent.unverified += list.length; for (const c of list) await markPending(c); continue; }
            if (v.kind === 'not_pro') {
                sent.notPro += list.length;
                await store.set(PA_KEYS.pro(rec.uidHash), JSON.stringify({ neg: now + PA_CFG.proNegativeTtlMs }), 120).catch(() => {});
                continue;
            }
            const until = Math.min(v.expiry, now + PA_CFG.proPositiveTtlMs);
            await store.set(PA_KEYS.pro(rec.uidHash), JSON.stringify({ until }), Math.max(60, Math.ceil((until - now) / 1000))).catch(() => {});
        }
        const quiet = inQuietHours(rec.tz, now);
        let taken = 0;
        for (const c of list) {
            if (taken >= PA_CFG.perRunPerDevice) { await markPending(c); continue; }
            const claim = PA_KEYS.fired(dev, c.level.id, c.level.rev);
            // 장부 «잡는 중» — 발송이 확인된 뒤에만 «보냄»(s:'sent')으로 바꾼다(설정 API 는 보냄만 앱에 알린다 — 관문 11121338 ⑤)
            if (!(await store.setNx(claim, JSON.stringify({ at: now, px: c.cur.p, s: 'claim' }), PA_CFG.firedTtlSec))) { sent.claimLost++; continue; }
            const capKey = PA_KEYS.cap(etDate, dev);
            const used = await store.incr(capKey, 2 * 86400);
            if (used > PA_CFG.deviceDailyCap) {
                sent.capped++;
                await store.decr(capKey).catch(() => 0);
                await store.del([claim]).catch(() => {});
                break;   // 오늘 상한 — 이 기기의 나머지 레벨은 다음 교차에(claim·대기 표식을 남기지 않는다)
            }
            taken++;
            const copy = pushCopy(rec.locale, c.level.t, c.level.dir, c.level.px, c.cur.p);
            const id = `${dev}:${c.level.id}:${c.level.rev}`;
            items.push({
                id, token: rec.token, platform: rec.platform, title: copy.title, body: copy.body, quiet, thread: `pa-${c.level.t}`,
                data: { type: 'wl_signal', src: 'push_sig_price', ev: 'price_level', t: c.level.t, lid: c.level.id, rev: String(c.level.rev), path: `/app-view/flow?t=${c.level.t}&from=sig` },
            });
            meta.set(id, { claim, cap: capKey, rec, cand: c });
        }
    }
    if (!items.length || !deps.sender) return report;
    sent.items = items.length;
    const out = await deps.sender.send(items);
    const deadDevs = new Set<string>();
    for (const it of items) {
        const r = out.get(it.id) ?? 'fail';
        const m = meta.get(it.id)!;
        const pendKey = PA_KEYS.pend(m.rec.dev, m.cand.level.id, m.cand.level.rev);
        if (r === 'ok') {
            sent.ok++;
            await store.set(m.claim, JSON.stringify({ at: now, px: m.cand.cur.p, s: 'sent' }), PA_CFG.firedTtlSec).catch(() => {});
            if (m.cand.pending) await store.del([pendKey]).catch(() => {});
            continue;
        }
        await store.del([m.claim]).catch(() => {});
        await store.decr(m.cap).catch(() => 0);
        if (r === 'dead') { sent.dead++; deadDevs.add(m.rec.dev); await store.del([pendKey]).catch(() => {}); }
        else { sent.fail++; await markPending(m.cand); }
    }
    // 죽은 토큰 — 색인에서만 뺀다(기록은 30일 TTL · 같은 토큰으로 새로 저장되면 색인에 다시 들어간다). 그사이 저장된 새 기록을 지우지 않는다(관문 11121338 ④)
    if (deadDevs.size) await store.srem(PA_KEYS.idx, [...deadDevs]).catch(() => {});
    for (let i = 0; i < sent.ok; i++) await store.incr(`${PA_KEYS.stats(etDate)}:ok`, 8 * 86400).catch(() => 0);
    return report;
}
