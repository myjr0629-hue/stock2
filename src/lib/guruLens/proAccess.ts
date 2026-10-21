/**
 * 대가 렌즈 4~10위(PRO) — 서버 판정.
 *
 * 왜 이 모양인가(2026-10-21 운영 세션 직접 수리):
 *   · 저장소의 다른 PRO 게이트(내 종목 한도·알림 등)는 전부 앱 안 RevenueCat SDK 판정뿐이고 서버 판정은 없다.
 *     유일한 서버 판정 설계(feat/watchlist-alerts)는 운영에 없는 REVENUECAT_SECRET_API_KEY·DynamoDB 표에 기대므로
 *     그대로 쓰면 운영의 실제 PRO(체험 51·유료 13) 전원이 잠긴다.
 *   · 그래서 앱 SDK 와 같은 공개 키(NEXT_PUBLIC_RC_*, 이미 앱 번들에 실려 있다)로 같은 엔드포인트
 *     GET /v1/subscribers/{id} 를 읽는다. 두 앱(App Store·Play)은 한 프로젝트라 어느 키든 권한이 같다(실측).
 *   · 판정은 Redis(인스턴스 공유)에 남긴다 — 양성은 권한 만료와 6시간 중 이른 쪽까지, 음성은 60초.
 *     새 인스턴스·익명 폭주와 무관하게 확인된 PRO 는 저장된 양성으로 바로 통과한다(공급사·예산을 거치지 않는다).
 *   · 처음 보는 ID 만 IP·ID 예산(10분)을 먼저 쓰고, 그걸 통과한 요청만 전체 예산을 쓴다(한 IP 가 전체를 못 태운다).
 *     같은 ID 동시 요청은 인스턴스 안에서 1회로 합친다. 확인된 양성은 인스턴스 메모리에도 둔다(Redis 장애 대비).
 *   · 공급사 응답은 본문까지 하나의 시간 제한 안에서 읽는다.
 *   · 공급사 «장애»(설정 없음·401/403·5xx·시간 초과·통신 실패)는 PRO 를 잠그지 않는다 — 공격자가 만들 수 없는
 *     상태이고, 장애 때 실제 구독자를 잠그는 것이 더 큰 손해다. 예산 초과·429·명시적 비활성은 잠근다.
 *   ⚠ v1 GET 은 없는 ID 를 «만든다» — 형식 검증과 예산을 통과한 처음 보는 ID 만 공급사에 간다.
 */
import crypto from 'node:crypto';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';

export const RC_UID_RE = /^\$RCAnonymousID:[0-9a-f]{32}$|^[A-Za-z0-9._:-]{8,100}$/;
export const POSITIVE_MAX_SEC = 6 * 3600;
export const NEGATIVE_SEC = 60;
/** 공급사 장애 중 허용 판정의 짧은 저장 — 장애가 이어져도 같은 PRO 가 ID 예산을 다 써 잠기지 않게. */
export const UNAVAILABLE_ALLOW_SEC = 120;
export const WINDOW_SEC = 600;
export const LIMIT_PER_IP = 20;
export const LIMIT_PER_ID = 6;
export const LIMIT_GLOBAL = 300;
export const PROVIDER_TIMEOUT_MS = 4000;
export const STORE_TIMEOUT_MS = 1500;

export type ProAccessVia = 'invalid' | 'cache' | 'denied' | 'limited' | 'provider' | 'provider_unavailable';
export interface ProAccessDecision { pro: boolean; via: ProAccessVia }

/** Redis 최소 표면 — 시험은 메모리 구현을 넣는다. */
export interface ProAccessStore {
    get(key: string): Promise<unknown>;
    set(key: string, value: string, ttlSec: number): Promise<unknown>;
    /** 각 키를 1 증가시키고 증가 후 값을 돌려준다(창 키에 TTL). */
    incr(keys: string[], ttlSec: number): Promise<number[]>;
}

export interface ProAccessDeps {
    store: ProAccessStore | null;
    keys: { ios?: string; android?: string };
    fetchImpl?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
    storeTimeoutMs?: number;
}
export interface ProAccessContext { ip: string | null }

/** v1 subscriber 응답의 권한 — 만료된 권한도 들어 있으므로 날짜로 판정한다. */
export function proUntilFromSubscriber(json: any, nowMs: number): { active: boolean; untilMs: number | null } {
    const ent = json?.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID];
    if (!ent || typeof ent !== 'object') return { active: false, untilMs: null };
    if (ent.expires_date === null || ent.expires_date === undefined)
        return ent.purchase_date ? { active: true, untilMs: null } : { active: false, untilMs: null };
    const ms = (v: unknown) => (typeof v === 'string' && v ? Date.parse(v) : NaN);
    const until = Math.max(ms(ent.expires_date) || 0, ms(ent.grace_period_expires_date) || 0);
    return until > nowMs ? { active: true, untilMs: until } : { active: false, untilMs: null };
}

export function clientIpFrom(headers: { get(name: string): string | null }): string | null {
    const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    return first || headers.get('x-real-ip')?.trim() || null;
}

const hash = (v: string) => crypto.createHash('sha256').update(v).digest('hex').slice(0, 32);

/** 시간 안에 끝나지 않으면 undefined — 저장소가 느려도 요청을 붙잡지 않는다. */
async function within<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([p, new Promise<undefined>(r => { timer = setTimeout(() => r(undefined), ms); })]);
    } finally { clearTimeout(timer); }
}

export function createGuruProAccess(deps: ProAccessDeps) {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const now = deps.now ?? Date.now;
    const timeoutMs = deps.timeoutMs ?? PROVIDER_TIMEOUT_MS;
    const storeMs = deps.storeTimeoutMs ?? STORE_TIMEOUT_MS;
    const inflight = new Map<string, Promise<ProAccessDecision>>();
    // 저장소를 못 쓸 때만 쓰는 인스턴스 안 예산(창 키 → 횟수).
    const local = new Map<string, number>();
    // 확인된 양성의 인스턴스 사본(만료 시각) — Redis 장애·지연에도 기존 PRO 를 다시 예산에 태우지 않는다.
    const localPro = new Map<string, number>();

    const posKey = (h: string) => `gl:pro:v1:${h}`;

    async function readVerdict(h: string): Promise<'pro' | 'no' | null> {
        if (!deps.store) return null;
        try {
            const v = await within(deps.store.get(posKey(h)), storeMs);
            if (v === 1 || v === '1') return 'pro';
            if (v === 0 || v === '0') return 'no';
        } catch { /* 저장소 장애 — 공급사 경로로 */ }
        return null;
    }
    async function writeVerdict(h: string, pro: boolean, ttlSec: number) {
        if (pro && ttlSec >= 1) {
            if (localPro.size >= 5000) localPro.delete(localPro.keys().next().value!);
            localPro.set(h, now() + Math.floor(ttlSec) * 1000);
        } else localPro.delete(h);
        if (!deps.store || ttlSec < 1) return;
        try { await within(deps.store.set(posKey(h), pro ? '1' : '0', Math.floor(ttlSec)), storeMs); } catch { /* 다음 요청이 다시 확인 */ }
    }
    async function count(keys: string[], w: number): Promise<number[]> {
        let counts: number[] | undefined;
        if (deps.store) {
            try { counts = await within(deps.store.incr(keys, WINDOW_SEC * 2), storeMs); } catch { counts = undefined; }
        }
        if (counts && counts.length === keys.length && counts.every(n => Number.isFinite(n))) return counts;
        for (const k of local.keys()) if (!k.endsWith(`:${w}`)) local.delete(k);
        return keys.map(k => { const n = (local.get(k) ?? 0) + 1; local.set(k, n); return n; });
    }
    async function withinBudget(h: string, ip: string | null): Promise<boolean> {
        const w = Math.floor(now() / 1000 / WINDOW_SEC);
        // IP·ID 예산을 넘은 요청은 전체 예산을 쓰지 않는다.
        const [byIp, byId] = await count([`gl:rl:v1:ip:${hash('ip:' + (ip || 'unknown'))}:${w}`, `gl:rl:v1:id:${h}:${w}`], w);
        if (byIp > LIMIT_PER_IP || byId > LIMIT_PER_ID) return false;
        const [all] = await count([`gl:rl:v1:all:${w}`], w);
        return all <= LIMIT_GLOBAL;
    }
    async function ask(uid: string): Promise<{ kind: 'active'; untilMs: number | null } | { kind: 'inactive' | 'limited' | 'unavailable' }> {
        const key = deps.keys.ios || deps.keys.android;
        if (!key) return { kind: 'unavailable' };
        const platform = key === deps.keys.ios ? 'ios' : 'android';
        const ctrl = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<{ kind: 'unavailable' }>(resolve => {
            timer = setTimeout(() => { ctrl.abort(); resolve({ kind: 'unavailable' }); }, timeoutMs);
        });
        const read = (async () => {
            try {
                const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
                    method: 'GET', cache: 'no-store', signal: ctrl.signal,
                    headers: { Authorization: `Bearer ${key}`, 'X-Platform': platform, Accept: 'application/json' },
                });
                if (res.status === 400 || res.status === 404) return { kind: 'inactive' as const };
                if (res.status === 429) return { kind: 'limited' as const };
                if (!res.ok) return { kind: 'unavailable' as const };
                const json = await res.json(); // 본문도 같은 시간 제한 안
                if (!json || typeof json !== 'object' || !('subscriber' in json)) return { kind: 'unavailable' as const };
                const s = proUntilFromSubscriber(json, now());
                return s.active ? { kind: 'active' as const, untilMs: s.untilMs } : { kind: 'inactive' as const };
            } catch { return { kind: 'unavailable' as const }; }
        })();
        try { return await Promise.race([read, deadline]); } finally { clearTimeout(timer); }
    }

    async function decide(uid: string, h: string, ctx: ProAccessContext): Promise<ProAccessDecision> {
        if (!(await withinBudget(h, ctx.ip))) return { pro: false, via: 'limited' };
        const r = await ask(uid);
        if (r.kind === 'active') {
            const left = r.untilMs === null ? POSITIVE_MAX_SEC : (r.untilMs - now()) / 1000;
            await writeVerdict(h, true, Math.min(POSITIVE_MAX_SEC, left));
            return { pro: true, via: 'provider' };
        }
        if (r.kind === 'inactive') { await writeVerdict(h, false, NEGATIVE_SEC); return { pro: false, via: 'denied' }; }
        if (r.kind === 'limited') return { pro: false, via: 'limited' };
        await writeVerdict(h, true, UNAVAILABLE_ALLOW_SEC);
        return { pro: true, via: 'provider_unavailable' };
    }

    return async function resolve(uid: string | null, ctx: ProAccessContext): Promise<ProAccessDecision> {
        if (!uid || !RC_UID_RE.test(uid)) return { pro: false, via: 'invalid' };
        const h = hash('uid:' + uid);
        const mine = localPro.get(h);
        if (mine !== undefined) { if (mine > now()) return { pro: true, via: 'cache' }; localPro.delete(h); }
        const verdict = await readVerdict(h);
        if (verdict === 'pro') return { pro: true, via: 'cache' };
        if (verdict === 'no') return { pro: false, via: 'denied' };
        const running = inflight.get(h);
        if (running) return running;
        const p = decide(uid, h, ctx).finally(() => inflight.delete(h));
        inflight.set(h, p);
        return p;
    };
}

/** 운영 저장소 — 기존 라우트들과 같은 Upstash(Redis.fromEnv: UPSTASH_* 또는 KV_REST_API_*). */
export async function upstashProAccessStore(): Promise<ProAccessStore | null> {
    try {
        const { Redis } = await import('@upstash/redis');
        const r = Redis.fromEnv();
        return {
            get: k => r.get(k),
            set: (k, v, ttl) => r.set(k, v, { ex: ttl }),
            incr: async (keys, ttl) => {
                const p = r.pipeline();
                for (const k of keys) { p.incr(k); p.expire(k, ttl); }
                const out = (await p.exec()) as unknown[];
                return keys.map((_, i) => Number(out[i * 2]));
            },
        };
    } catch {
        return null;
    }
}

let shared: Promise<ReturnType<typeof createGuruProAccess>> | null = null;
/** 라우트용 — 인스턴스당 하나(동시 병합 공유). */
export async function guruProAccess(uid: string | null, ctx: ProAccessContext): Promise<ProAccessDecision> {
    shared ??= upstashProAccessStore().then(store => createGuruProAccess({
        store,
        keys: { ios: process.env.NEXT_PUBLIC_RC_IOS_KEY, android: process.env.NEXT_PUBLIC_RC_ANDROID_KEY },
    }));
    return (await shared)(uid, ctx);
}
