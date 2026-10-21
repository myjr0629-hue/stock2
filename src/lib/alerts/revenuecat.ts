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
import { createLogoLoader } from '@/lib/logoPolicy';

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

export interface ProVerificationContext {
    /** 익명 실패의 IP별 재조회 억제. 최근 확인한 PRO에는 적용하지 않는다. */
    clientKey?: string;
    /** 캐시·병합 뒤 처음 보는 ID에만 요청 제한을 적용한다. */
    beforeFetch?: () => Promise<boolean>;
}
export type ProVerifier = (rcAppUserId: string, context?: ProVerificationContext) => Promise<ProStatus>;

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
    /** 예산 부족·공급사 장애 시 마지막 양성 판정의 최대 나이. 기본은 양성 TTL과 같다. */
    positiveMaxAgeMs?: number;
    /** 비활성 판정 캐시 — 방금 결제한 사람이 오래 막히지 않게 짧게(30초) */
    negativeTtlMs?: number;
    timeoutMs?: number;
    /** 캐시 적중·동시 병합 뒤 실제 공급사 호출 직전에만 예산을 확인한다. */
    beforeFetch?: (id: string, knownPro: boolean) => Promise<boolean>;
}

export function createRevenueCatVerifier(opts: RevenueCatVerifierOptions = {}): ProVerifier {
    const apiKey = opts.apiKey ?? process.env.REVENUECAT_SECRET_API_KEY ?? '';
    const fetchImpl = opts.fetchImpl ?? fetch;
    const now = opts.now ?? Date.now;
    const posTtl = opts.positiveTtlMs ?? 5 * 60 * 1000;
    const posMaxAge = Math.max(posTtl, opts.positiveMaxAgeMs ?? posTtl);
    const negTtl = opts.negativeTtlMs ?? 30 * 1000;
    const timeoutMs = opts.timeoutMs ?? 6000;
    const positive = new Map<string, { status: ProStatus; until: number; retainUntil: number }>();
    const negative = new Map<string, { until: number; error?: ProVerifyError }>();
    const failedClients = new Map<string, number>();
    // 익명 ID 폭주가 양성 판정을 지우지 않도록 저장 공간도 분리한다.
    function remember<K, V>(map: Map<K, V>, key: K, value: V) {
        map.delete(key);
        if (map.size >= 5000) map.delete(map.keys().next().value!);
        map.set(key, value);
    }
    // 기존 공급사 로더의 ID별 동시 병합·동시 호출 상한을 재사용한다.
    const load = createLogoLoader<ProStatus>();

    const verify = async (rcAppUserId: string, context?: ProVerificationContext): Promise<ProStatus> => {
        if (!apiKey) throw new ProVerifyError('unconfigured', 'REVENUECAT_SECRET_API_KEY is not set');
        const t = now();
        const hit = positive.get(rcAppUserId);
        if (hit && hit.until > t) return hit.status;
        const knownPro = !!hit && hit.retainUntil > t;
        if (!knownPro) positive.delete(rcAppUserId);
        const denial = negative.get(rcAppUserId);
        if (denial && denial.until > t) {
            if (knownPro) return hit.status;
            if (denial.error) throw denial.error;
            return { active: false, expiresAtMs: null };
        }
        if (!knownPro && context?.clientKey && (failedClients.get(context.clientKey) ?? 0) > t)
            throw new ProVerifyError('unavailable');
        const fail = (error: ProVerifyError): ProStatus => {
            remember(negative, rcAppUserId, { until: now() + negTtl, error });
            if (knownPro && hit.retainUntil > now()) return hit.status;
            if (context?.clientKey) remember(failedClients, context.clientKey, now() + negTtl);
            throw error;
        };
        let allowed: boolean;
        try {
            allowed = !((!knownPro && context?.beforeFetch && !await context.beforeFetch()) ||
                (opts.beforeFetch && !await opts.beforeFetch(rcAppUserId, knownPro)));
        } catch { allowed = false; }
        if (!allowed) return fail(new ProVerifyError('unavailable'));

        const ctrl = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const deadline = new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => {
                    ctrl.abort();
                    reject(new ProVerifyError('unavailable'));
                }, timeoutMs);
            });
            const status = await Promise.race([deadline, (async () => {
                const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcAppUserId)}`, {
                    method: 'GET',
                    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
                    signal: ctrl.signal,
                    cache: 'no-store',
                });
                if (res.status === 404) return { active: false, expiresAtMs: null };
                if (!res.ok) throw new ProVerifyError('unavailable');
                const json = await res.json();
                if (!json) throw new ProVerifyError('unavailable');
                return proStatusFromSubscriber(json, now());
            })()]);
            const completed = now();
            negative.delete(rcAppUserId);
            if (status.active) {
                remember(positive, rcAppUserId, { status,
                    until: Math.min(completed + posTtl, status.expiresAtMs ?? Infinity),
                    retainUntil: Math.min(completed + posMaxAge, status.expiresAtMs ?? Infinity) });
            } else {
                positive.delete(rcAppUserId); // 명시적인 권한 철회는 마지막 양성보다 우선한다.
                remember(negative, rcAppUserId, { until: completed + negTtl });
                if (context?.clientKey) remember(failedClients, context.clientKey, completed + negTtl);
            }
            return status;
        } catch {
            return fail(new ProVerifyError('unavailable'));
        } finally {
            clearTimeout(timer);
        }
    };
    return async (id, context) => {
        const hit = positive.get(id);
        if (hit && hit.until > now()) return hit.status;
        const result = await load(id, () => verify(id, context));
        if (!result) {
            if (hit && hit.retainUntil > now()) return hit.status;
            throw new ProVerifyError('unavailable');
        }
        return result;
    };
}
