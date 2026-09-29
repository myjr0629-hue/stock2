/**
 * /api/app/watchlist/alerts 의 처리 로직 — 라우트와 분리해 시험이 메모리 저장소·가짜 RevenueCat 으로 그대로 돌린다.
 *
 * 계약(UI 브랜치와 동일):
 *   POST   { rcAppUserId, platform:'ios'|'android', deviceToken, locale:'ko'|'en'|'ja',
 *            tickers:[{ t, events:[...] }], quiet:{ start:'HH:MM', end:'HH:MM', tz } | null, dailyCap }
 *          → 200 {ok:true} | 402 {error:'not_pro'} | 400 {error:'<검증 코드>'}
 *   DELETE { rcAppUserId, deviceToken } → 200 {ok:true}
 * 그 밖의 응답(앱은 «실패 → 나중에 다시»로 처리): 429 rate_limited · 503 store_unavailable / verify_unavailable /
 *   verify_unconfigured · 500 store_error.
 */
import crypto from 'node:crypto';
import { deviceHashOf, type AlertStore } from './store';
import { ProVerifyError, type ProVerifier } from './revenuecat';
import { validateDeleteBody, validateSubscriptionBody } from './validate';
import { MAX_BODY_BYTES, type StoredDevice } from './types';

export interface AlertsApiDeps {
    store: AlertStore | null;
    verifyPro: ProVerifier;
    now?: () => number;
    log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface ApiResult {
    status: number;
    body: Record<string, unknown>;
}

/** 요청 수 제한(10분 창). 알림 설정은 사람이 가끔 바꾸는 것이라 넉넉해도 이 정도면 충분하다. */
export const RATE_WINDOW_SEC = 600;
export const RATE_LIMIT_PER_IP = 30;
export const RATE_LIMIT_PER_DEVICE = 12;

const err = (status: number, error: string): ApiResult => ({ status, body: { error } });

export function hashIp(ip: string | null): string {
    return crypto.createHash('sha256').update('sg-wl-ip:' + (ip || 'unknown')).digest('hex').slice(0, 16);
}

/** x-forwarded-for 첫 값(Vercel 이 채운다) → x-real-ip → null */
export function clientIpFrom(headers: { get(name: string): string | null }): string | null {
    const xff = headers.get('x-forwarded-for');
    if (xff) {
        const first = xff.split(',')[0]?.trim();
        if (first) return first;
    }
    return headers.get('x-real-ip')?.trim() || null;
}

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
    if (Buffer.byteLength(raw || '', 'utf8') > MAX_BODY_BYTES) return { ok: false, error: 'body_too_large' };
    try {
        return { ok: true, value: JSON.parse(raw) };
    } catch {
        return { ok: false, error: 'invalid_json' };
    }
}

async function rateLimited(store: AlertStore, ip: string | null, deviceHash: string, nowMs: number): Promise<boolean> {
    const okIp = await store.rateHit(`ip:${hashIp(ip)}`, RATE_WINDOW_SEC, RATE_LIMIT_PER_IP, nowMs);
    if (!okIp) return true;
    const okDev = await store.rateHit(`dev:${deviceHash}`, RATE_WINDOW_SEC, RATE_LIMIT_PER_DEVICE, nowMs);
    return !okDev;
}

export async function handleAlertsPost(rawBody: string, ip: string | null, deps: AlertsApiDeps): Promise<ApiResult> {
    const now = (deps.now ?? Date.now)();
    const log = deps.log ?? (() => { });
    const parsed = parseJson(rawBody);
    if (!parsed.ok) return err(400, parsed.error);
    const v = validateSubscriptionBody(parsed.value);
    if (!v.ok) return err(400, v.error);
    const input = v.value;
    const { store } = deps;
    if (!store) return err(503, 'store_unavailable');

    const deviceHash = deviceHashOf(input.deviceToken);
    try {
        if (await rateLimited(store, ip, deviceHash, now)) return err(429, 'rate_limited');
    } catch (e: any) {
        log('[alerts] rate check failed', { name: e?.name });
        return err(503, 'store_unavailable');
    }

    let pro;
    try {
        pro = await deps.verifyPro(input.rcAppUserId);
    } catch (e: any) {
        if (e instanceof ProVerifyError && e.code === 'unconfigured') return err(503, 'verify_unconfigured');
        log('[alerts] PRO verify failed', { msg: e?.message });
        return err(503, 'verify_unavailable');
    }
    if (!pro.active) {
        // 권한이 없는 기기의 사본은 남기지 않는다(구독이 끝난 뒤 앱이 다시 보낸 경우 — 발송이 멈추게)
        await store.deleteSubscription(deviceHash).catch(() => { });
        return err(402, 'not_pro');
    }

    try {
        if (!input.tickers.length) {
            // 켠 종목이 하나도 없으면 사본을 둘 이유가 없다(= 끈 것과 같다)
            await store.deleteSubscription(deviceHash);
            return { status: 200, body: { ok: true } };
        }
        const dev: StoredDevice = {
            deviceHash,
            rcAppUserId: input.rcAppUserId,
            platform: input.platform,
            token: input.deviceToken,
            locale: input.locale,
            tickers: input.tickers,
            quiet: input.quiet,
            dailyCap: input.dailyCap,
            proUntil: pro.expiresAtMs,
            updatedAt: now,
        };
        await store.putSubscription(dev, now);
        return { status: 200, body: { ok: true } };
    } catch (e: any) {
        log('[alerts] store write failed', { name: e?.name, msg: e?.message });
        if (e?.name === 'ResourceNotFoundException') return err(503, 'store_unavailable');
        return err(500, 'store_error');
    }
}

export async function handleAlertsDelete(rawBody: string, ip: string | null, deps: AlertsApiDeps): Promise<ApiResult> {
    const now = (deps.now ?? Date.now)();
    const log = deps.log ?? (() => { });
    const parsed = parseJson(rawBody);
    if (!parsed.ok) return err(400, parsed.error);
    const v = validateDeleteBody(parsed.value);
    if (!v.ok) return err(400, v.error);
    const { store } = deps;
    if (!store) return err(503, 'store_unavailable');
    const deviceHash = deviceHashOf(v.value.deviceToken);
    try {
        if (await rateLimited(store, ip, deviceHash, now)) return err(429, 'rate_limited');
        // 끄기는 PRO 여부와 상관없이 언제나 된다. 사본이 없어도 200(이미 꺼진 상태 = 요청한 결과).
        await store.deleteSubscription(deviceHash);
        return { status: 200, body: { ok: true } };
    } catch (e: any) {
        log('[alerts] delete failed', { name: e?.name, msg: e?.message });
        if (e?.name === 'ResourceNotFoundException') return err(503, 'store_unavailable');
        return err(500, 'store_error');
    }
}
