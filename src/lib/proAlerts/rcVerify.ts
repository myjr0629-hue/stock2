// ============================================================================
// PRO 알림 — 서버에서 RevenueCat 으로 PRO 확인(기기가 말한 isPro 는 믿지 않는다). 시험: tests/proAlerts.core.test.ts
//   키: 서버 전용 REVENUECAT_SECRET_API_KEY 가 있으면 그것(플랫폼 무관) · 없으면 앱 번들의 공개 키(NEXT_PUBLIC_RC_IOS_KEY/ANDROID)
//       — 체험 보고(lib/push/trialVerify)와 같은 GET /v1/subscribers/{id}. ⚠ v1 GET 은 없는 ID 를 «만든다» → 형식·예산 통과분만.
//   실패 정책(대가 렌즈와 반대 — 닫힘): 장애·429·키 없음 = 'unavailable'(저장 503 · 발송 보류). 확인된 양성만 캐시 기간 동안 쓴다.
//   예산(공급사 호출 전): IP 10분 30 · 고객 10분 10 · 전체 10분 600. Redis 로 셀 수 없으면 부르지 않는다.
// ============================================================================
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';
import { PA_KEYS, RC_UID_RE, paUidHash, proExpiryFromSubscriber } from './core';

export const PA_VERIFY = { windowS: 600, ip: 30, uid: 10, all: 600, timeoutMs: 4000 } as const;

export type ProVerdict =
    | { kind: 'pro'; expiry: number }
    | { kind: 'not_pro' }
    | { kind: 'limited' }
    | { kind: 'unavailable' };

export interface VerifyStore { incr(keys: string[], ttlSec: number): Promise<number[]> }
export interface VerifyDeps {
    store: VerifyStore;
    keys: { secret?: string; ios?: string; android?: string };
    fetchImpl?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
}

const ipHash = (ip: string) => createHash('sha256').update('pa-ip:' + ip).digest('hex').slice(0, 24);

export async function verifyProWithRc(uid: string, platform: 'ios' | 'android', ip: string | null, deps: VerifyDeps): Promise<ProVerdict> {
    if (!RC_UID_RE.test(uid)) return { kind: 'not_pro' };
    const now = (deps.now ?? Date.now)();
    const key = deps.keys.secret || (platform === 'ios' ? deps.keys.ios : deps.keys.android);
    if (!key) return { kind: 'unavailable' };
    const w = Math.floor(now / 1000 / PA_VERIFY.windowS);
    try {
        const c = await deps.store.incr([
            PA_KEYS.vrl('ip', ipHash(ip || 'cron'), w),
            PA_KEYS.vrl('id', paUidHash(uid), w),
            PA_KEYS.vrl('all', 'all', w),
        ], PA_VERIFY.windowS * 2);
        if (c.length !== 3 || !c.every(Number.isFinite)) return { kind: 'unavailable' };
        if ((ip && c[0] > PA_VERIFY.ip) || c[1] > PA_VERIFY.uid || c[2] > PA_VERIFY.all) return { kind: 'limited' };
    } catch { return { kind: 'unavailable' }; }
    const fetchImpl = deps.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<ProVerdict>((resolve) => { timer = setTimeout(() => { ctrl.abort(); resolve({ kind: 'unavailable' }); }, deps.timeoutMs ?? PA_VERIFY.timeoutMs); });
    const read = (async (): Promise<ProVerdict> => {
        try {
            const headers: Record<string, string> = { Authorization: `Bearer ${key}`, Accept: 'application/json' };
            if (!deps.keys.secret) headers['X-Platform'] = platform;
            const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, { method: 'GET', cache: 'no-store', signal: ctrl.signal, headers });
            if (res.status === 400 || res.status === 404) return { kind: 'not_pro' };
            if (res.status === 429) return { kind: 'limited' };
            if (!res.ok) return { kind: 'unavailable' };
            const json = await res.json();
            if (!json || typeof json !== 'object' || !('subscriber' in json)) return { kind: 'unavailable' };
            const exp = proExpiryFromSubscriber(json, PRO_ENTITLEMENT_ID, (deps.now ?? Date.now)());
            return exp == null ? { kind: 'not_pro' } : { kind: 'pro', expiry: exp };
        } catch { return { kind: 'unavailable' }; }
    })();
    try { return await Promise.race([read, deadline]); } finally { clearTimeout(timer); }
}

// ── RC 고객 ID 암호화(발송 때 재확인용) — 서버 비밀(CRON_SECRET)에서 키를 만든다. 비밀이 없으면 저장하지 않는다 ──

function encKey(secret: string): Buffer {
    return createHash('sha256').update('pro-alerts-uidenc:v1:' + secret).digest();
}
export function sealUid(uid: string, secret: string | undefined): string | null {
    if (!secret) return null;
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', encKey(secret), iv);
    const ct = Buffer.concat([c.update(uid, 'utf8'), c.final()]);
    return `g1.${iv.toString('base64url')}.${ct.toString('base64url')}.${c.getAuthTag().toString('base64url')}`;
}
export function openUid(sealed: string | null | undefined, secret: string | undefined): string | null {
    if (!sealed || !secret) return null;
    const m = /^g1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(sealed);
    if (!m) return null;
    try {
        const d = createDecipheriv('aes-256-gcm', encKey(secret), Buffer.from(m[1], 'base64url'));
        d.setAuthTag(Buffer.from(m[3], 'base64url'));
        return Buffer.concat([d.update(Buffer.from(m[2], 'base64url')), d.final()]).toString('utf8');
    } catch { return null; }
}
