/**
 * PRO 판정 — 서버에서 RevenueCat REST v1 로 직접 확인한다(앱이 보낸 «나는 PRO» 를 믿지 않는다).
 *
 *   GET https://api.revenuecat.com/v1/subscribers/{app_user_id}
 *   Authorization: Bearer <REVENUECAT_SECRET_API_KEY>   ← 서버 비밀키(sk_…). 공개 SDK 키(NEXT_PUBLIC_RC_*)가 아니다.
 *
 * 권한 이름은 앱과 같은 정본(src/config/iap.ts PRO_ENTITLEMENT_ID = 'pro')을 쓴다.
 * ⚠️ v1 GET 은 없는 사용자를 «만든다»(RevenueCat 문서) — 그래서 ID 형식 검증과 요청 수 제한을 먼저 통과한 요청만 여기에 온다.
 */
import { PRO_ENTITLEMENT_ID } from '@/config/iap';

export interface ProStatus {
    active: boolean;
    /** 권한 만료(ms, 유예기간 포함). null = 만료 없음(평생) 또는 비활성 */
    expiresAtMs: number | null;
}

export class ProVerifyError extends Error {
    constructor(public readonly code: 'unconfigured' | 'unavailable', message?: string) {
        super(message ?? code);
        this.name = 'ProVerifyError';
    }
}

export type ProVerifier = (rcAppUserId: string) => Promise<ProStatus>;

const parseMs = (v: unknown): number | null => {
    if (typeof v !== 'string' || !v) return null;
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
};

/**
 * 순수 함수 — v1 subscriber 응답에서 권한 활성 여부.
 * v1 의 entitlements 에는 «만료된 권한도» 들어 있다 → 날짜로 판정한다.
 *   expires_date = null → 평생 권한(활성)
 *   expires_date > now 또는 grace_period_expires_date > now → 활성
 */
export function proStatusFromSubscriber(json: any, nowMs: number, entitlementId: string = PRO_ENTITLEMENT_ID): ProStatus {
    const ent = json?.subscriber?.entitlements?.[entitlementId];
    if (!ent || typeof ent !== 'object') return { active: false, expiresAtMs: null };
    if (ent.expires_date === null || ent.expires_date === undefined) {
        // 구매 기록이 있는 평생 권한만 활성으로 본다(빈 객체를 활성으로 읽지 않는다)
        return ent.purchase_date ? { active: true, expiresAtMs: null } : { active: false, expiresAtMs: null };
    }
    const exp = parseMs(ent.expires_date);
    const grace = parseMs(ent.grace_period_expires_date);
    const until = Math.max(exp ?? 0, grace ?? 0);
    return until > nowMs ? { active: true, expiresAtMs: until } : { active: false, expiresAtMs: null };
}

export interface RevenueCatVerifierOptions {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
    /** 활성 판정 캐시(인스턴스 메모리) — 기본 5분(만료가 더 이르면 그때까지) */
    positiveTtlMs?: number;
    /** 비활성 판정 캐시 — 방금 결제한 사람이 오래 막히지 않게 짧게(30초) */
    negativeTtlMs?: number;
    timeoutMs?: number;
}

export function createRevenueCatVerifier(opts: RevenueCatVerifierOptions = {}): ProVerifier {
    const apiKey = opts.apiKey ?? process.env.REVENUECAT_SECRET_API_KEY ?? '';
    const fetchImpl = opts.fetchImpl ?? fetch;
    const now = opts.now ?? Date.now;
    const posTtl = opts.positiveTtlMs ?? 5 * 60 * 1000;
    const negTtl = opts.negativeTtlMs ?? 30 * 1000;
    const timeoutMs = opts.timeoutMs ?? 6000;
    const cache = new Map<string, { status: ProStatus; until: number }>();

    return async (rcAppUserId: string): Promise<ProStatus> => {
        if (!apiKey) throw new ProVerifyError('unconfigured', 'REVENUECAT_SECRET_API_KEY is not set');
        const t = now();
        const hit = cache.get(rcAppUserId);
        if (hit && hit.until > t) return hit.status;

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        let res: Response;
        try {
            res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcAppUserId)}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
                signal: ctrl.signal,
                cache: 'no-store',
            });
        } catch (e: any) {
            throw new ProVerifyError('unavailable', `revenuecat fetch failed: ${e?.name || e}`);
        } finally {
            clearTimeout(timer);
        }
        if (res.status === 404) {
            const status = { active: false, expiresAtMs: null };
            cache.set(rcAppUserId, { status, until: t + negTtl });
            return status;
        }
        if (!res.ok) throw new ProVerifyError('unavailable', `revenuecat http ${res.status}`);
        const json = await res.json().catch(() => null);
        if (!json) throw new ProVerifyError('unavailable', 'revenuecat bad json');
        const status = proStatusFromSubscriber(json, t);
        const until = status.active
            ? Math.min(t + posTtl, status.expiresAtMs ?? Number.POSITIVE_INFINITY)
            : t + negTtl;
        if (cache.size > 5000) cache.clear();
        cache.set(rcAppUserId, { status, until });
        return status;
    };
}
