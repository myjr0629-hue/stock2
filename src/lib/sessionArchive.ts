/**
 * 완료 세션 보관 — 거래일별 «그날 정규장의 확정본»을 저장하고, 장 마감·주말·휴일에 거래소 달력으로 직전 완료 세션을 읽는다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 왜 만들었나 (2026-10-19, 감사 묶음 3 — ~/Documents/signum-work/2026-10-19/SESSION-MATRIX-CODEX.md)
 *
 *   «직전 정규장 값»이 키 하나의 TTL(36h·72h)에만 기대고 있었다.
 *     · 금요일 16:00 → 월요일 04:00 = 60시간 → breadth(36h)는 일요일 새벽에 사라진다.
 *     · 월요일 휴일 → 화요일 PRE = 84시간 → 레벨 판본(72h)도 사라진다.
 *   사라지면 화면은 «—»(또는 중립 기본값)였다. 대표 10/19: «장이 끝나도 직전장 데이터가 완벽하게 나와야 한다.»
 *
 * [규칙]
 *   · 키 = session:<kind>:<SYMBOL|ALL>:<YYYY-MM-DD>  — 날짜는 «그 값의 원천 정규장 날짜»(체인이면 EOD 날짜).
 *   · TTL = 8일(지터 ±10% 뒤에도 7일 이상) — 주말+연휴(최장 4일 공백)를 넉넉히 덮는다. «다음 세션까지»로 잡지 않는다.
 *   · 읽기 = 거래소 달력(lib/marketCalendar)의 «마지막으로 끝난 정규장»(조기 폐장 13:00 반영) 날짜의 키.
 *     값과 함께 원천 날짜(sourceSessionDate)를 돌려준다 — 화면은 기존 «날짜 · 마감 기준» 표식을 그대로 쓴다.
 *   · 없으면 null(결측). 0·50 같은 대체값을 만들지 않는다.
 *   · 날짜별 키라 «이전 세션의 늦은 저장»이 새 세션 값을 덮을 수 없다. 같은 날짜 안에서도
 *     관측 시각이 더 이른 값·확정본(final) 위의 잠정본은 저장하지 않는다(decideArchiveWrite).
 *   · 새 공급사 호출 0 — 이미 계산·조회한 값을 저장만 한다. 저장은 EC2 Redis(session: 접두사는 Upstash 복제 대상 아님 —
 *     EC2 쓰기가 실패했을 때만 기존 정책대로 Upstash 가 받는다). 키당 인스턴스 쓰기 간격 상한(minIntervalMs)으로 쓰기 수를 묶는다.
 *
 * 원천 표식 모양은 묶음 4 의 공용 타입(src/lib/sourceStamp.ts — fix/b4-source-stamp)과 같게 맞췄다:
 *   { sourceSessionDate, observedAt, receivedAt, basis } — 병합 때 그 타입으로 바꿔 끼우면 된다.
 * ══════════════════════════════════════════════════════════════════════
 */
import { getFromCache, mgetFromCache, setInCache } from '@/services/redisClient';
import { etDateOf, etMinutesOf, isNonTradingDay, prevTradingDate, sessionCloseMinutes } from '@/lib/marketCalendar';

export type SessionArchiveKind = 'breadth' | 'vwap' | 'levels' | 'whale';

/** 원천 표식 — src/lib/sourceStamp.ts(묶음 4)와 같은 모양. 보관본에서 읽은 값은 basis 'last-session'. */
export type SessionArchiveStamp = {
    sourceSessionDate: string;
    /** 값이 관측(계산)된 시각 ms — 모르면 null */
    observedAt: number | null;
    /** 이 응답이 보관본을 읽은 시각 ms */
    receivedAt: number;
    basis: 'last-session';
};

export type SessionArchiveEntry<T> = {
    v: 1;
    kind: SessionArchiveKind;
    scope: string;
    sessionDate: string;
    observedAt: number;
    savedAt: number;
    /** 그 세션 정규장 마감 «뒤» 관측 = 확정본 */
    final: boolean;
    value: T;
};

export const SESSION_ARCHIVE_PREFIX = 'session:';
/** 8일 — setInCache 지터(±10%) 뒤에도 7.2일 이상 남는다(주말·연휴 커버). */
export const SESSION_ARCHIVE_TTL_SEC = 8 * 24 * 60 * 60;
/** 같은 키를 한 인스턴스가 다시 쓰는 최소 간격(잠정본) — 확정본 전환은 간격과 무관하게 한 번 쓴다. */
export const SESSION_ARCHIVE_MIN_INTERVAL_MS = 5 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const OPEN_MIN = 9 * 60 + 30;

export function sessionArchiveKey(kind: SessionArchiveKind, scope: string, sessionDate: string): string {
    return `${SESSION_ARCHIVE_PREFIX}${kind}:${String(scope || 'ALL').toUpperCase()}:${sessionDate}`;
}

/** 거래일인가(주말·휴장 아님, 모양 맞음) */
export function isTradingDay(d: unknown): d is string {
    return typeof d === 'string' && ISO_DAY.test(d) && !isNonTradingDay(d);
}

/**
 * 그 시점에 «마지막으로 끝난» 정규장 날짜 — 조기 폐장(13:00 ET)을 반영한다.
 * (marketCalendar.etLastClosedSessionDate 는 16:00 고정이라 호출자 전부에 번지므로 바꾸지 않고, 달력 함수 조합으로 여기서 센다.)
 *   거래일 마감 시각 이후 → 오늘 · 마감 전·주말·휴장 → 직전 거래일.
 */
export function lastCompletedSessionDate(ms: number = Date.now()): string {
    const d = etDateOf(ms);
    if (!isNonTradingDay(d) && etMinutesOf(ms) >= sessionCloseMinutes(d)) return d;
    return prevTradingDate(d);
}

/** 그 시점이 거래소 달력상 정규장 안인가(휴장·조기 폐장 반영) */
export function isInRegularSession(ms: number = Date.now()): boolean {
    const d = etDateOf(ms);
    if (isNonTradingDay(d)) return false;
    const m = etMinutesOf(ms);
    return m >= OPEN_MIN && m < sessionCloseMinutes(d);
}

/** ms 가 그 거래일 정규장 마감 «뒤»인가(확정 판정) — 날짜가 지났으면 당연히 뒤. */
export function isAfterSessionClose(sessionDate: string, ms: number): boolean {
    const d = etDateOf(ms);
    if (d > sessionDate) return true;
    if (d < sessionDate) return false;
    return etMinutesOf(ms) >= sessionCloseMinutes(sessionDate);
}

export type ArchiveWriteDecision = 'write' | 'skip-invalid-date' | 'skip-future' | 'skip-final-exists' | 'skip-older' | 'skip-same';

/**
 * 순수 판정 — 같은 키에 이미 있는 것(existing) 위에 새 값(incoming)을 써도 되는가.
 *   · 날짜가 거래일이 아니거나(휴장 평일에 «REG»로 착각한 계산 등) 아직 열리지 않은 세션이면 쓰지 않는다.
 *   · 확정본 위에 잠정본은 쓰지 않는다 · 관측 시각이 더 이른 값은 쓰지 않는다(느린 요청이 늦게 도착한 경우).
 */
export function decideArchiveWrite(
    existing: Pick<SessionArchiveEntry<unknown>, 'observedAt' | 'final'> | null | undefined,
    incoming: { sessionDate: string; observedAt: number; final: boolean },
    nowMs: number,
): ArchiveWriteDecision {
    if (!isTradingDay(incoming.sessionDate)) return 'skip-invalid-date';
    const today = etDateOf(nowMs);
    if (incoming.sessionDate > today) return 'skip-future';
    if (incoming.sessionDate === today && etMinutesOf(nowMs) < OPEN_MIN) return 'skip-future';
    if (!existing) return 'write';
    if (existing.final && !incoming.final) return 'skip-final-exists';
    const prevObs = Number(existing.observedAt);
    if (Number.isFinite(prevObs) && incoming.observedAt < prevObs) return 'skip-older';
    if (Number.isFinite(prevObs) && incoming.observedAt === prevObs && existing.final === incoming.final) return 'skip-same';
    return 'write';
}

type Memo = { savedAt: number; observedAt: number; final: boolean };
const writeMemo = new Map<string, Memo>();
/** 시험 전용 */
export function _resetSessionArchiveMemo(): void { writeMemo.clear(); }

export type SaveOpts = { observedAt?: number; nowMs?: number; minIntervalMs?: number };

/**
 * 완료(또는 진행 중) 세션 값 저장. 확정 여부는 관측 시각이 그 세션 마감 뒤인지로 정한다.
 * 실패는 조용히 false — 저장이 응답을 막지 않는다(호출자는 await 하거나 after() 에 맡긴다).
 */
export async function saveSessionArchive<T>(
    kind: SessionArchiveKind, scope: string, sessionDate: string, value: T, opts: SaveOpts = {},
): Promise<ArchiveWriteDecision | 'skip-throttled' | 'skip-empty' | 'error'> {
    if (value === null || value === undefined) return 'skip-empty';
    const nowMs = opts.nowMs ?? Date.now();
    const observedAt = Number.isFinite(opts.observedAt) ? Number(opts.observedAt) : nowMs;
    const final = isAfterSessionClose(sessionDate, observedAt);
    const pre = decideArchiveWrite(null, { sessionDate, observedAt, final }, nowMs);
    if (pre !== 'write') return pre;
    const key = sessionArchiveKey(kind, scope, sessionDate);
    const memo = writeMemo.get(key);
    if (memo) {
        if (memo.final && !final) return 'skip-final-exists';
        if (memo.final === final && nowMs - memo.savedAt < (opts.minIntervalMs ?? SESSION_ARCHIVE_MIN_INTERVAL_MS)) return 'skip-throttled';
        if (observedAt < memo.observedAt) return 'skip-older';
    }
    try {
        const existing = await getFromCache<SessionArchiveEntry<T>>(key).catch(() => null);
        const d = decideArchiveWrite(existing && existing.v === 1 ? existing : null, { sessionDate, observedAt, final }, nowMs);
        if (d !== 'write') {
            if (existing) {
                if (writeMemo.size > 5000) writeMemo.clear();
                writeMemo.set(key, { savedAt: nowMs, observedAt: Number(existing.observedAt) || observedAt, final: !!existing.final });
            }
            return d;
        }
        const entry: SessionArchiveEntry<T> = { v: 1, kind, scope: String(scope || 'ALL').toUpperCase(), sessionDate, observedAt, savedAt: nowMs, final, value };
        const ok = await setInCache(key, entry, SESSION_ARCHIVE_TTL_SEC);
        if (!ok) return 'error';
        if (writeMemo.size > 5000) writeMemo.clear();
        writeMemo.set(key, { savedAt: nowMs, observedAt, final });
        return 'write';
    } catch {
        return 'error';
    }
}

export type ArchiveRead<T> = { value: T; stamp: SessionArchiveStamp; final: boolean };

export type ReadOpts = {
    nowMs?: number;
    /** 이 날짜부터 읽는다(기본: 마지막으로 끝난 정규장). 체인 EOD 날짜처럼 원천 날짜를 아는 경우. */
    fromDate?: string;
    /** 그 날짜에 없으면 직전 거래일로 몇 번 더 내려갈지(기본 0 = 그 날짜만). 내려가도 값의 날짜는 stamp 로 정직하게 나간다. */
    lookback?: number;
};

function toRead<T>(e: SessionArchiveEntry<T> | null | undefined, date: string, nowMs: number): ArchiveRead<T> | null {
    if (!e || e.v !== 1 || e.sessionDate !== date || e.value === null || e.value === undefined) return null;
    return {
        value: e.value,
        final: !!e.final,
        stamp: { sourceSessionDate: e.sessionDate, observedAt: Number.isFinite(Number(e.observedAt)) ? Number(e.observedAt) : null, receivedAt: nowMs, basis: 'last-session' },
    };
}

/** 읽을 날짜 목록(최신 → 과거). 시작 날짜가 «끝나지 않은» 세션이면 넣지 않는다. */
export function archiveReadDates(nowMs: number, fromDate?: string, lookback = 0): string[] {
    const last = lastCompletedSessionDate(nowMs);
    let d = fromDate && isTradingDay(fromDate) && fromDate <= last ? fromDate : last;
    const out = [d];
    for (let i = 0; i < Math.max(0, Math.min(5, lookback)); i++) { d = prevTradingDate(d); out.push(d); }
    return out;
}

/** 직전 완료 세션의 보관본 한 종목(또는 ALL). 없으면 null — 결측. */
export async function readSessionArchive<T>(kind: SessionArchiveKind, scope: string, opts: ReadOpts = {}): Promise<ArchiveRead<T> | null> {
    const nowMs = opts.nowMs ?? Date.now();
    const dates = archiveReadDates(nowMs, opts.fromDate, opts.lookback ?? 0);
    try {
        const keys = dates.map((d) => sessionArchiveKey(kind, scope, d));
        const vals = keys.length === 1
            ? [await getFromCache<SessionArchiveEntry<T>>(keys[0])]
            : await mgetFromCache<SessionArchiveEntry<T>>(keys);
        for (let i = 0; i < dates.length; i++) {
            const r = toRead<T>(vals[i], dates[i], nowMs);
            if (r) return r;
        }
    } catch { /* 읽기 실패 = 결측 */ }
    return null;
}

/** 여러 종목을 한 번의 mget 으로(종목 × 날짜). 종목마다 가장 최근 날짜의 보관본 하나. 없는 종목은 결과에 없다. */
export async function readSessionArchiveMany<T>(kind: SessionArchiveKind, scopes: string[], opts: ReadOpts = {}): Promise<Map<string, ArchiveRead<T>>> {
    const nowMs = opts.nowMs ?? Date.now();
    const out = new Map<string, ArchiveRead<T>>();
    const syms = Array.from(new Set((scopes || []).map((s) => String(s || '').toUpperCase()).filter(Boolean)));
    if (!syms.length) return out;
    const dates = archiveReadDates(nowMs, opts.fromDate, opts.lookback ?? 0);
    try {
        const vals = await mgetFromCache<SessionArchiveEntry<T>>(syms.flatMap((s) => dates.map((d) => sessionArchiveKey(kind, s, d))));
        syms.forEach((s, i) => {
            for (let j = 0; j < dates.length; j++) {
                const r = toRead<T>(vals[i * dates.length + j], dates[j], nowMs);
                if (r) { out.set(s, r); break; }
            }
        });
    } catch { /* 결측 */ }
    return out;
}
