/**
 * POST·DELETE /api/app/watchlist/alerts 본문 검증 — 순수 함수.
 * 실패는 { ok:false, error:'<코드>' } 로 돌려준다(라우트가 400 으로 내보낸다). 코드는 앱이 분기할 수 있게 고정 문자열.
 */
import {
    ALERT_EVENTS, ALERT_LOCALES, ALERT_PLATFORMS, DAILY_CAP_MAX, DAILY_CAP_MIN, MAX_ALERT_TICKERS,
    type AlertEventId, type AlertLocale, type AlertPlatform, type AlertSubscriptionInput, type QuietHours, type TickerPref,
} from './types';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * RevenueCat 앱 사용자 ID. 앱은 로그인 없이 익명 ID(`$RCAnonymousID:` + 32 hex)를 쓴다(src/services/revenueCat.ts).
 * 사용자 지정 ID(향후 logIn)도 받되 문자 집합·길이를 좁힌다 — 서버가 이 값으로 RevenueCat REST 를 부르기 때문에
 * 경로를 흔드는 문자(`/`·`?`·`#`·공백)는 받지 않는다.
 */
const RC_ANON_RE = /^\$RCAnonymousID:[0-9a-f]{32}$/;
const RC_CUSTOM_RE = /^[A-Za-z0-9._:\-]{8,100}$/;
export function isValidRcAppUserId(v: unknown): v is string {
    return typeof v === 'string' && (RC_ANON_RE.test(v) || RC_CUSTOM_RE.test(v));
}

/**
 * 기기 토큰 형식.
 *   iOS  = APNs 원시 토큰(hex). 지금은 32바이트(64자)지만 애플은 길이를 약속하지 않는다 → 64~200자.
 *   Android = FCM 등록 토큰 «인스턴스ID:본문» (콜론 포함). send.ts 도 콜론 유무로 둘을 가른다.
 */
const APNS_TOKEN_RE = /^[0-9a-fA-F]{64,200}$/;
const FCM_TOKEN_RE = /^[A-Za-z0-9_\-]{8,}:[A-Za-z0-9_\-]{20,}$/;
export function isValidDeviceToken(platform: AlertPlatform, v: unknown): v is string {
    if (typeof v !== 'string' || v.length > 4096) return false;
    return platform === 'ios' ? APNS_TOKEN_RE.test(v) : FCM_TOKEN_RE.test(v);
}

/** 미국 티커: 대문자·숫자와 클래스 구분자(BRK.B·BF-B), 최대 10자 */
const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;
export function normalizeTicker(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim().toUpperCase();
    return TICKER_RE.test(t) ? t : null;
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function isValidTimeZone(tz: unknown): tz is string {
    if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

function parseQuiet(v: unknown): ValidationResult<QuietHours | null> {
    if (v === null || v === undefined) return { ok: true, value: null };
    if (typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'invalid_quiet' };
    const q = v as Record<string, unknown>;
    if (typeof q.start !== 'string' || typeof q.end !== 'string' || !HHMM_RE.test(q.start) || !HHMM_RE.test(q.end)) {
        return { ok: false, error: 'invalid_quiet' };
    }
    if (!isValidTimeZone(q.tz)) return { ok: false, error: 'invalid_quiet' };
    // 시작 = 끝 은 «창 없음»으로 본다(0분짜리 창과 24시간 창이 모호하다 — 조용히 24시간 무음으로 만들지 않는다)
    if (q.start === q.end) return { ok: true, value: null };
    return { ok: true, value: { start: q.start, end: q.end, tz: q.tz } };
}

const EVENT_SET = new Set<string>(ALERT_EVENTS);

function parseTickers(v: unknown): ValidationResult<TickerPref[]> {
    if (!Array.isArray(v)) return { ok: false, error: 'invalid_tickers' };
    if (v.length > MAX_ALERT_TICKERS) return { ok: false, error: 'too_many_tickers' };
    // 같은 티커가 두 번 오면 이벤트를 합친다(순서는 처음 나온 자리)
    const merged = new Map<string, Set<AlertEventId>>();
    for (const item of v) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: 'invalid_tickers' };
        const it = item as Record<string, unknown>;
        const t = normalizeTicker(it.t);
        if (!t) return { ok: false, error: 'invalid_ticker' };
        if (!Array.isArray(it.events)) return { ok: false, error: 'invalid_events' };
        const set = merged.get(t) ?? new Set<AlertEventId>();
        for (const e of it.events) {
            if (typeof e !== 'string' || !EVENT_SET.has(e)) return { ok: false, error: 'unknown_event' };
            set.add(e as AlertEventId);
        }
        merged.set(t, set);
    }
    if (merged.size > MAX_ALERT_TICKERS) return { ok: false, error: 'too_many_tickers' };
    const out: TickerPref[] = [];
    // 이벤트가 하나도 없는 종목은 저장하지 않는다(알림이 갈 수 없는 사본을 두지 않는다)
    for (const [t, set] of merged) {
        if (set.size) out.push({ t, events: ALERT_EVENTS.filter((e) => set.has(e)) });
    }
    return { ok: true, value: out };
}

export function validateSubscriptionBody(body: unknown): ValidationResult<AlertSubscriptionInput> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_body' };
    const b = body as Record<string, unknown>;
    if (!isValidRcAppUserId(b.rcAppUserId)) return { ok: false, error: 'invalid_rc_app_user_id' };
    if (typeof b.platform !== 'string' || !(ALERT_PLATFORMS as readonly string[]).includes(b.platform)) {
        return { ok: false, error: 'invalid_platform' };
    }
    const platform = b.platform as AlertPlatform;
    if (!isValidDeviceToken(platform, b.deviceToken)) return { ok: false, error: 'invalid_device_token' };
    if (typeof b.locale !== 'string' || !(ALERT_LOCALES as readonly string[]).includes(b.locale)) {
        return { ok: false, error: 'invalid_locale' };
    }
    const tickers = parseTickers(b.tickers);
    if (!tickers.ok) return tickers;
    const quiet = parseQuiet(b.quiet);
    if (!quiet.ok) return quiet;
    const cap = b.dailyCap;
    if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < DAILY_CAP_MIN || cap > DAILY_CAP_MAX) {
        return { ok: false, error: 'invalid_daily_cap' };
    }
    return {
        ok: true,
        value: {
            rcAppUserId: b.rcAppUserId as string,
            platform,
            deviceToken: b.deviceToken as string,
            locale: b.locale as AlertLocale,
            tickers: tickers.value,
            quiet: quiet.value,
            dailyCap: cap,
        },
    };
}

export interface DeleteInput {
    rcAppUserId: string;
    deviceToken: string;
}

/** DELETE 는 플랫폼을 받지 않는다 — 토큰은 두 형식 중 하나면 된다. */
export function validateDeleteBody(body: unknown): ValidationResult<DeleteInput> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_body' };
    const b = body as Record<string, unknown>;
    if (!isValidRcAppUserId(b.rcAppUserId)) return { ok: false, error: 'invalid_rc_app_user_id' };
    if (!isValidDeviceToken('ios', b.deviceToken) && !isValidDeviceToken('android', b.deviceToken)) {
        return { ok: false, error: 'invalid_device_token' };
    }
    return { ok: true, value: { rcAppUserId: b.rcAppUserId as string, deviceToken: b.deviceToken as string } };
}
