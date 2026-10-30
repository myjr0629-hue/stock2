/**
 * 야후 «가장 신선한 접속점(edge)» 고르기 — EC2 시세 수집기(cron-market-feed) 전용.
 *
 * ★ [2026-10-31] 원인 실측(같은 시각 같은 URL, curl --resolve 로 접속점만 바꿔 비교):
 *   · EC2(us-east-1)의 DNS 는 query1.finance.yahoo.com → 미국 접속점(69.147.92.12)을 준다.
 *     그 접속점의 1분봉 차트 응답은 NQ=F 3,219초·CL=F 7,118초·^SOX meta 4,918초 늙었다(10/30 16:2x ET, 장중).
 *   · 같은 요청을 아시아 접속점(180.222.109.252·180.222.119.247)으로 보내면 NQ=F·CL=F 약 600초(야후 기본 10분 지연),
 *     ^SOX meta 1~4초 — 맥에서도 EC2 에서도 똑같다(=클라이언트 IP 가 아니라 «접속점» 문제).
 *   → 앱 /api/market/macro 의 NQ 선물·유가·SOX·VIX 가 15~117분 늙었던 원인(AUDIT 10/31 «중간 3»).
 *
 * 하는 일: 5분마다 기준 심볼(NQ=F) 하나를 «DNS 기본»과 «아시아 접속점들»에 물어 regularMarketTime 이 가장 최신인 곳을 고른다.
 *   이후 query1.finance.yahoo.com 요청만 그 접속점으로 보낸다(TLS 인증서·SNI 는 그대로 query1.finance.yahoo.com — 주소가 바뀌어도
 *   야후가 아니면 TLS 가 실패하고 기본 fetch 로 돌아간다). 시간이 같으면(장 마감·주말) DNS 기본을 유지한다.
 *   고정 접속점이 실패(네트워크·TLS·4xx/5xx)하면 그 요청은 즉시 기본 fetch 로 다시 보낸다 → 기존 동작보다 나빠지지 않는다.
 * 호출량: 수집 호출 수 불변 + 점검 5분마다 3회(분당 0.6회).
 */
import https from 'node:https';

export const YAHOO_HOST = 'query1.finance.yahoo.com';
/** 아시아 접속점 — 10/31 실측 신선(야후 기본 지연만). 바뀌면 TLS 실패 → 기본 fetch 로 돌아간다. */
export const YAHOO_ALT_EDGES: readonly string[] = ['180.222.109.252', '180.222.119.247'];
export const EDGE_PROBE_EVERY_MS = 5 * 60_000;
const PROBE_URL = `https://${YAHOO_HOST}/v8/finance/chart/NQ%3DF?interval=1m&range=1d`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

type FetchLike = (url: string, init?: any) => Promise<any>;
/** 고정 IP 로 보내는 최소 fetch — 접속점 ip 가 null 이면 쓰지 않는다. */
export type PinnedFetch = (ip: string, url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface EdgeState {
    edge: string | null;          // null = DNS 기본
    checkedAt: number;
    lastProbe: Record<string, number | null> | null;   // 접속점 → regularMarketTime(초) (실패 null)
    pinnedFails: number;
}

/** node:https 로 query1 을 특정 IP 에 붙여 보낸다(SNI·인증서 검증은 호스트 이름 그대로). */
export const httpsPinnedFetch: PinnedFetch = (ip, url, init = {}) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers: Record<string, string> = {};
    const h = init.headers || {};
    for (const k of Object.keys(h)) headers[k] = String(h[k]);
    const req = https.request({
        host: u.hostname, servername: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET', headers,
        lookup: ((_host: string, opts: any, cb: any) => {
            if (typeof opts === 'function') { cb = opts; opts = {}; }
            if (opts && opts.all) cb(null, [{ address: ip, family: 4 }]);
            else cb(null, ip, 4);
        }) as any,
    }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode || 0;
            resolve({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body) });
        });
        res.on('error', reject);
    });
    const signal: AbortSignal | undefined = init.signal;
    const onAbort = () => req.destroy(new Error('aborted'));
    if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
});

async function probeTime(get: () => Promise<any>): Promise<number | null> {
    try {
        const res = await get();
        if (!res?.ok) return null;
        const t = (await res.json())?.chart?.result?.[0]?.meta?.regularMarketTime;
        return typeof t === 'number' && t > 0 ? t : null;
    } catch { return null; }
}

/**
 * 접속점 점검: 가장 최신 regularMarketTime 을 준 곳을 고른다. 동률이면 DNS 기본(null) — 지금과 같은 동작.
 * 대안이 기본보다 «60초 넘게» 신선할 때만 바꾼다(체결 시각 흔들림으로 오가지 않게).
 */
export async function probeEdges(baseFetch: FetchLike, pinned: PinnedFetch, alts: readonly string[] = YAHOO_ALT_EDGES): Promise<{ edge: string | null; times: Record<string, number | null> }> {
    const init = { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) };
    const [base, ...altTimes] = await Promise.all([
        probeTime(() => baseFetch(PROBE_URL, { ...init, cache: 'no-store' })),
        ...alts.map((ip) => probeTime(() => pinned(ip, PROBE_URL, init))),
    ]);
    const times: Record<string, number | null> = { dns: base };
    alts.forEach((ip, i) => { times[ip] = altTimes[i]; });
    let edge: string | null = null; let best = -Infinity;
    alts.forEach((ip, i) => { const t = altTimes[i]; if (t != null && t > best) { best = t; edge = ip; } });
    if (edge == null || best <= (base ?? 0) + 60) edge = null;   // 기본보다 60초 넘게 신선할 때만 바꾼다
    return { edge, times };
}

/**
 * 기본 fetch 를 감싼다: query1.finance.yahoo.com 요청만 고른 접속점으로. 그 외 주소·접속점 미선택은 기본 fetch 그대로.
 * 고정 접속점이 실패하거나 ok 가 아니면 같은 요청을 기본 fetch 로 다시 보낸다.
 */
export function createEdgeFetch(baseFetch: FetchLike, opts: { pinned?: PinnedFetch; now?: () => number; alts?: readonly string[]; log?: (m: string) => void } = {}) {
    const pinned = opts.pinned ?? httpsPinnedFetch;
    const now = opts.now ?? Date.now;
    const alts = opts.alts ?? YAHOO_ALT_EDGES;
    const state: EdgeState = { edge: null, checkedAt: Number.NEGATIVE_INFINITY, lastProbe: null, pinnedFails: 0 };
    let probing: Promise<void> | null = null;

    async function refresh(): Promise<void> {
        if (now() - state.checkedAt < EDGE_PROBE_EVERY_MS) return;
        if (!probing) {
            probing = (async () => {
                try {
                    const r = await probeEdges(baseFetch, pinned, alts);
                    if (r.edge !== state.edge) opts.log?.(`[yahoo-edge] 접속점 ${state.edge ?? 'dns'} → ${r.edge ?? 'dns'} ${JSON.stringify(r.times)}`);
                    state.edge = r.edge; state.lastProbe = r.times;
                } catch { /* 점검 실패 — 기존 선택 유지 */ }
                state.checkedAt = now();
                probing = null;
            })();
        }
        await probing;
    }

    const edgeFetch = async (input: any, init?: any): Promise<any> => {
        const url = typeof input === 'string' ? input : String(input?.url ?? input);
        let host = '';
        try { host = new URL(url).hostname; } catch { /* 상대 주소 등 — 그대로 */ }
        if (host !== YAHOO_HOST) return baseFetch(input, init);
        await refresh();
        const ip = state.edge;
        if (!ip) return baseFetch(input, init);
        try {
            const res = await pinned(ip, url, init);
            if (res.ok) return res;
        } catch { /* 아래 기본 fetch 로 */ }
        state.pinnedFails++;
        return baseFetch(input, init);
    };
    return { fetch: edgeFetch, state, refresh };
}
