/**
 * 이상 신호 발송 계획 — 순수 함수(저장소·네트워크·시계 없음): 기기 읽기·키 이름·조용한 시간·푸시 겹침 금지·기기별 선택.
 * 시험: tests/signals.plan.test.ts
 */
import { createHash } from 'node:crypto';
import { wantsPush, parseRecord } from '@/lib/push/prefs';
import { calendarDaysBetween } from './calendar';
import { sanitizeTickers, sanitizeTz } from './sanitize';
import {
    ENABLED_EVENTS, EVENT_COOLDOWN_SEC, EVENT_PRIORITY, SIG_CFG,
    type DetectedSignal, type Loc, type Platform, type SignalDevice, type SignalEvent,
} from './types';

// ── 키(Upstash push:sig:* — 푸시 토큰과 같은 저장소·같은 접두사. 토큰 자체는 키에 넣지 않는다) ───────────────────────────────
export const SIG_KEYS = {
    /** 'off' | 'dry' | 'live' — 없으면 dry. 끄는 스위치(키 하나) */
    mode: 'push:sig:mode',
    lock: 'push:sig:lock',
    sent: (dev: string, ticker: string, event: SignalEvent, key: string) => `push:sig:s:${dev}:${ticker}:${event}:${key}`,
    cool: (dev: string, ticker: string, event: SignalEvent) => `push:sig:c:${dev}:${ticker}:${event}`,
    cap: (etDate: string, dev: string) => `push:sig:cap:${etDate}:${dev}`,
} as const;

/** EC2(kv) 키 — 접두사 wlsig: 는 Upstash 복제 목록에 없어 EC2 에만 쓴다(Upstash 명령 0). 모두 TTL 을 단다 */
export const SIG_KV = {
    arm: (t: string) => `wlsig:arm:${t}`,
    ai: (event: SignalEvent, t: string, key: string) => `wlsig:ai:${event}:${t}:${key}`,
    aiDay: (etDate: string) => `wlsig:n:${etDate}`,
    mps: (t: string, etDate: string) => `wlsig:mps:${t}:${etDate}`,
    last: 'wlsig:last',
    stats: (etDate: string) => `push:stats:signal:${etDate}`,
} as const;

/** 토큰 → 짧은 기기 키(12자). 키 이름·로그·드라이런 출력에만 쓴다 */
export function devKey(token: string): string {
    return createHash('sha256').update(String(token)).digest('hex').slice(0, 12);
}

export { sanitizeTickers, sanitizeTz };

// ── 기기 ──────────────────────────────────────────────────────────────────────

export interface TokenRecordLike {
    locale?: string;
    platform?: string;
    app?: string;
    preferences?: any;
    watchlist?: { t?: unknown; at?: string } | null;
    tz?: string;
    notifPerm?: boolean;
}

/**
 * 푸시 토큰 레코드 → 신호를 받을 수 있는 기기(아니면 null).
 *   받는 조건: SIGNUM 앱 · 종목이 하나 이상 · 설정(마스터 «알림» + «내 종목 이상 신호»)이 꺼지지 않음 · 마지막 앱 실행 때 시스템 알림 권한이 «꺼짐»으로 보고되지 않음.
 *   값이 없는 옛 레코드는 신호 설정이 «켜짐»으로 본다(기본값 켜짐) — 단 종목이 없으면 어차피 보낼 것이 없다.
 */
export function deviceFromRecord(token: string, raw: unknown): SignalDevice | null {
    const rec = parseRecord<TokenRecordLike>(raw);
    if (!rec || (rec.app && rec.app !== 'signum')) return null;
    if (!wantsPush(rec, 'signals')) return null;
    if (rec.notifPerm === false) return null;
    const tickers = sanitizeTickers(rec.watchlist?.t);
    if (!tickers || !tickers.length) return null;
    const locale: Loc = rec.locale === 'ko' || rec.locale === 'ja' ? rec.locale : 'en';
    // iOS = raw APNs hex token (no colon); Android = FCM token (has a colon) — send.ts planPush 와 같은 판정
    const platform: Platform = rec.platform === 'ios' || !token.includes(':') ? 'ios' : 'android';
    return { token, dev: devKey(token), platform, locale, tickers, tz: sanitizeTz(rec.tz) };
}

// ── 조용한 시간 · 겹침 금지 ─────────────────────────────────────────────────────

/** tz 의 «지금» 분(00:00 = 0). tz 가 잘못됐으면 null. (Node 의 hour12:false 는 자정을 24 로 주므로 h23 + 접기) */
export function localMinutes(tz: string, nowMs: number): number | null {
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(nowMs));
        let h = Number(parts.find((p) => p.type === 'hour')?.value);
        const m = Number(parts.find((p) => p.type === 'minute')?.value);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        if (h === 24) h = 0;
        return h * 60 + m;
    } catch { return null; }
}

/** 기기 현지 23:00~07:00 — 이때는 소리·진동 없이(iOS passive · Android 보통 우선순위) 보낸다. 시간대를 모르면 조용히 보내지 않는다(= 소리 있음)가 아니라 «조용히»가 안전하다 */
export function inQuietHours(tz: string | null, nowMs: number, start = 23 * 60, end = 7 * 60): boolean {
    if (!tz) return true;
    const m = localMinutes(tz, nowMs);
    if (m == null) return true;
    return start < end ? m >= start && m < end : m >= start || m < end;
}

/**
 * 모닝·마감 푸시 발송 시각과 겹치지 않게(UTC 기준 — 서머타임과 무관하게 크론 시각표 그대로):
 *   모닝 크론 12:10·13:10 UTC → 12:05~12:35 · 13:05~13:35
 *   마감 크론 22:00·22:20·22:40 UTC (+ 준비 대기) → 21:55~22:55
 * 이 안에서는 신호를 보내지 않는다(다음 실행이 이어받는다 — 신호는 회차 키로 중복을 막는다).
 */
export function inPushBlackout(nowMs: number): boolean {
    const d = new Date(nowMs);
    const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    return (m >= 12 * 60 + 5 && m < 12 * 60 + 35) || (m >= 13 * 60 + 5 && m < 13 * 60 + 35) || (m >= 21 * 60 + 55 && m < 22 * 60 + 55);
}

// ── 기기별 선택 ─────────────────────────────────────────────────────────────────

export function signalId(s: Pick<DetectedSignal, 'ticker' | 'event' | 'key'>): string {
    return `${s.ticker}:${s.event}:${s.key}`;
}

/** 우선순위 — 종류 순서 → 점수 큰 순 → 티커 */
export function byPriority(a: DetectedSignal, b: DetectedSignal): number {
    const pa = EVENT_PRIORITY.indexOf(a.event), pb = EVENT_PRIORITY.indexOf(b.event);
    return pa - pb || b.score - a.score || a.ticker.localeCompare(b.ticker);
}

/** 이 기기가 받을 수 있는 후보(켜진 종류만 · 기기 종목에 있는 것) — 우선순위 순 */
export function candidatesFor(device: Pick<SignalDevice, 'tickers'>, signals: readonly DetectedSignal[], enabled: readonly SignalEvent[] = ENABLED_EVENTS): DetectedSignal[] {
    const mine = new Set(device.tickers);
    return signals.filter((s) => mine.has(s.ticker) && enabled.includes(s.event)).sort(byPriority);
}

export interface ChoiceResult {
    chosen: DetectedSignal[];
    skipped: Array<{ id: string; why: 'sent' | 'cooldown' | 'cap' | 'run-limit' }>;
}

/**
 * 후보 → 이번에 보낼 것. sent = 이미 보낸 (종목·신호·회차) 키 집합, cooled = 재발송 금지 창 안의 (종목·신호) 집합, used = 오늘 이미 보낸 수.
 * 한 실행에서 한 기기에 최대 perRun 통 · 하루 최대 dailyCap 통.
 */
export function chooseForDevice(
    cands: readonly DetectedSignal[],
    state: { sent: ReadonlySet<string>; cooled: ReadonlySet<string>; used: number },
    limits: { dailyCap?: number; perRun?: number } = {},
): ChoiceResult {
    const dailyCap = limits.dailyCap ?? SIG_CFG.deviceDailyCap;
    const perRun = limits.perRun ?? SIG_CFG.perRunPerDevice;
    const chosen: DetectedSignal[] = [];
    const skipped: ChoiceResult['skipped'] = [];
    for (const s of cands) {
        const id = signalId(s);
        if (state.sent.has(id)) { skipped.push({ id, why: 'sent' }); continue; }
        if (state.cooled.has(`${s.ticker}:${s.event}`)) { skipped.push({ id, why: 'cooldown' }); continue; }
        if (state.used + chosen.length >= dailyCap) { skipped.push({ id, why: 'cap' }); continue; }
        if (chosen.length >= perRun) { skipped.push({ id, why: 'run-limit' }); continue; }
        chosen.push(s);
    }
    return { chosen, skipped };
}

export function cooldownSec(event: SignalEvent): number {
    return EVENT_COOLDOWN_SEC[event];
}

/** ms → 그 시각이 며칠 전(ET 달력 기준)인지 — 드라이런 출력용 */
export function ageDays(fromYmd: string, toYmd: string): number {
    return calendarDaysBetween(fromYmd, toYmd);
}
