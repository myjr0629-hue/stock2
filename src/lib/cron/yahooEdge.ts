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
 * 하는 일: 5분마다 기준 심볼 3종(NQ=F·CL=F·^SOX)을 «DNS 기본»과 «아시아 접속점들»에 물어 더 신선한 곳을 고른다(어느 심볼도 더 늙지 않을 때만).
 *   이후 query1.finance.yahoo.com 요청만 그 접속점으로 보낸다(TLS 인증서·SNI 는 그대로 query1.finance.yahoo.com — 주소가 바뀌어도
 *   야후가 아니면 TLS 가 실패하고 기본 fetch 로 돌아간다). 시간이 같으면(장 마감·주말) DNS 기본을 유지한다.
 *   고정 접속점이 실패(네트워크·TLS·3초 초과·4xx/5xx·차트 본문 없음)하면 그 요청은 새 5초 제한으로 기본 fetch 에 다시 보내고,
 *   연속 3번 실패하면 다음 점검까지 DNS 기본으로 돌아간다 → 기존 동작보다 나빠지지 않는다. 점검은 수집 요청을 기다리게 하지 않는다(뒤에서).
 * 호출량: 수집 호출 수 불변 + 점검 5분마다 9회(3심볼×3접속점, 분당 1.8회).
 */
import https from 'node:https';

export const YAHOO_HOST = 'query1.finance.yahoo.com';
/** 아시아 접속점 — 10/31 실측 신선(야후 기본 지연만). 바뀌면 TLS 실패 → 기본 fetch 로 돌아간다. */
export const YAHOO_ALT_EDGES: readonly string[] = ['180.222.109.252', '180.222.119.247'];
export const EDGE_PROBE_EVERY_MS = 5 * 60_000;
export const PINNED_TIMEOUT_MS = 3000;
const FALLBACK_TIMEOUT_MS = 5000;
export const MAX_CONSECUTIVE_FAILS = 3;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

type FetchLike = (url: string, init?: any) => Promise<any>;
/** 고정 IP 로 보내는 최소 fetch — 접속점 ip 가 null 이면 쓰지 않는다. */
export type PinnedFetch = (ip: string, url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface EdgeState {
    edge: string | null;          // null = DNS 기본
    checkedAt: number;
    lastProbe: Record<string, (number | null)[]> | null;   // 접속점 → 기준 심볼별 regularMarketTime(초) (실패 null)
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
 * 접속점 점검: 기준 심볼 3종(NQ=F·CL=F·^SOX — 10/30 실측에서 미국 접속점이 가장 늙었던 선물·유가·지수)의 regularMarketTime 을
 * 접속점마다 받아, 대안이 «모든 심볼에서 기본보다 60초 넘게 뒤지지 않고» «합계로 60초 넘게 신선»할 때만 고른다(관문 10310524 #2).
 * 동률·장 마감·대안 실패면 DNS 기본(null) — 지금과 같은 동작.
 */
export const PROBE_SYMBOLS: readonly string[] = ['NQ%3DF', 'CL%3DF', '%5ESOX'];
const probeUrl = (sym: string) => `https://${YAHOO_HOST}/v8/finance/chart/${sym}?interval=1m&range=1d`;
export async function probeEdges(baseFetch: FetchLike, pinned: PinnedFetch, alts: readonly string[] = YAHOO_ALT_EDGES): Promise<{ edge: string | null; times: Record<string, (number | null)[]> }> {
    const init = () => ({ headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) });
    const edges: (string | null)[] = [null, ...alts];
    const rows = await Promise.all(edges.map((ip) => Promise.all(PROBE_SYMBOLS.map((sym) => probeTime(() =>
        ip == null ? baseFetch(probeUrl(sym), { ...init(), cache: 'no-store' }) : pinned(ip, probeUrl(sym), init()))))));
    const times: Record<string, (number | null)[]> = {};
    edges.forEach((ip, i) => { times[ip ?? 'dns'] = rows[i]; });
    const base = rows[0];
    let edge: string | null = null; let bestGain = 60 * PROBE_SYMBOLS.length;   // 평균 60초 넘게 신선할 때만
    alts.forEach((ip, k) => {
        const alt = rows[k + 1];
        if (alt.some((t) => t == null)) return;                                   // 한 심볼이라도 실패한 대안은 쓰지 않는다
        let gain = 0; let worse = false;
        alt.forEach((t, j) => { const b = base[j] ?? 0; gain += (t as number) - b; if ((t as number) < b - 60) worse = true; });
        if (!worse && gain > bestGain) { bestGain = gain; edge = ip; }
    });
    return { edge, times };
}

/** 차트 응답이 수집 함수가 쓸 수 있는 모양인가 — 1분봉은 meta.regularMarketPrice, 일봉은 timestamp 배열(관문 10310522: meta:{} 200), 일봉은 종가. */
export function chartBodyUsable(url: string, data: any): boolean {
    const r0 = data?.chart?.result?.[0];
    if (!r0?.meta) return false;
    if (/[?&]interval=1d\b/.test(url)) {
        // 일봉: 쓸 수 있는 종가가 하나라도 있어야 한다(관문 10310524 #1 — timestamp 만 있고 종가 null 이면 직전 종가 복구 실패)
        const closes = r0?.indicators?.quote?.[0]?.close;
        return Array.isArray(r0.timestamp) && r0.timestamp.length > 0 && Array.isArray(closes) && closes.some((c: any) => typeof c === 'number' && c > 0.01);
    }
    return typeof r0.meta.regularMarketPrice === 'number' && r0.meta.regularMarketPrice > 0;
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

    let consecutiveFails = 0;
    const edgeFetch = async (input: any, init?: any): Promise<any> => {
        const url = typeof input === 'string' ? input : String(input?.url ?? input);
        let host = '';
        try { host = new URL(url).hostname; } catch { /* 상대 주소 등 — 그대로 */ }
        if (host !== YAHOO_HOST) return baseFetch(input, init);
        void refresh();   // 점검은 뒤에서 — 수집 요청(호출자의 5초 제한)을 기다리게 하지 않는다. 첫 회차는 DNS 기본.
        const ip = state.edge;
        if (!ip) return baseFetch(input, init);
        try {
            // 고정 접속점엔 호출자 signal 대신 자체 3초 제한 — 만료된 signal 이 아래 재시도까지 죽이지 않게(관문 10310520 #1)
            const { signal: _callerSignal, ...rest } = init || {};
            const res = await pinned(ip, url, { ...rest, signal: AbortSignal.timeout(PINNED_TIMEOUT_MS) });
            if (res.ok) {
                const data = await res.json();
                // 200 이어도 차트 본문이 없으면 실패로 보고 기본 경로로(관문 10310520 #2)
                if (!url.includes('/v8/finance/chart/') || chartBodyUsable(url, data)) {
                    consecutiveFails = 0;
                    return { ok: true, status: res.status, json: async () => data };
                }
            }
        } catch { /* 아래 기본 fetch 로 */ }
        state.pinnedFails++;
        if (++consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
            // 연속 실패 — 다음 점검(5분)까지 DNS 기본으로 돌아간다(회차마다 3초씩 잃지 않게)
            opts.log?.(`[yahoo-edge] 접속점 ${ip} 연속 실패 ${consecutiveFails} — 다음 점검까지 dns`);
            state.edge = null; consecutiveFails = 0;
        }
        return baseFetch(input, { ...(init || {}), signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS) });
    };
    return { fetch: edgeFetch, state, refresh };
}
