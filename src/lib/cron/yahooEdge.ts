/**
 * 야후 «심볼별 더 신선한 응답 고르기» — EC2 시세 수집기(cron-market-feed) 전용.
 *
 * ★ [2026-10-31] 원인 실측(같은 시각 같은 URL, curl --resolve 로 접속점만 바꿔 비교):
 *   · EC2(us-east-1)의 DNS 는 query1.finance.yahoo.com → 미국 접속점(69.147.92.12)을 준다.
 *     그 접속점의 1분봉 차트 응답은 NQ=F 3,219초·CL=F 7,118초·^SOX meta 4,918초 늙었다(10/30 16:2x ET, 장중).
 *   · 같은 요청을 아시아 접속점(180.222.109.252·180.222.119.247)으로 보내면 NQ=F·CL=F 약 600초(야후 기본 10분 지연),
 *     ^SOX meta 1~4초 — 맥에서도 EC2 에서도 똑같다(=클라이언트 IP 가 아니라 «접속점» 문제).
 *   → 앱 /api/market/macro 의 NQ 선물·유가·SOX 가 15~43분+ 늙었던 원인(AUDIT 10/31 «중간 3»).
 *
 * 설계(관문 10310534 지적 3건 반영 — «접속점 하나를 전 심볼에 적용»을 버렸다):
 *   · 차트 요청(/v8/finance/chart/) 하나마다 «DNS 기본»과 «대안 접속점 1곳»에 동시에 묻고, 그 요청(=그 심볼)에만 더 나은 쪽을 쓴다(1분봉만).
 *     - 1분봉 채택 규칙(관문 10310610 뒤 단순화 — 하나라도 판정 불가면 DNS = 기존 경로):
 *         대안 regularMarketTime − DNS regularMarketTime ≥ 60초
 *         && 대안 가격 유한·양수
 *         && 대안 직전 종가(수집 함수와 같은 식 previousClose ?? chartPreviousClose)가 DNS 직전 종가와 상대 0.1% 이내
 *         && 대안 응답의 심볼·통화·거래소(meta.symbol·currency·exchangeName)가 DNS 와 일치.
 *       마지막 1분봉 시각은 판정에 쓰지 않는다(수집 함수는 이 심볼들의 봉이 아니라 meta 가격을 저장 — 관문 10310610 #1).
 *       DNS 요청 실패(네트워크·4xx/5xx·본문 오류)·체결 시각/직전 종가/식별 필드 없음이면 판정 불가 → DNS 결과 그대로(기존 경로와 같은 성공·실패).
 *       (DNS 가 가격만 비고 시각·직전 종가·식별 필드가 있으면 규칙대로 비교 — 수집 함수는 가격 없는 DNS 를 어차피 버린다.)
 *       직전 종가 일치를 요구해 대안의 다른 세션 직전 종가로 등락률이 틀어지지 않게 한다(관문 10310610 #2).
 *     - 일봉(직전 종가 복구)·실제 지수(^IXIC·^DJI·^GSPC — 1분봉·일봉 보정)는 대안을 쓰지 않고 기존 경로 그대로(관문 10310534 #3·10310545 #1·#2).
 *     - DNS 요청이 실패하면 대안이 멀쩡해도 DNS 결과를 그대로 돌려준다(직전 종가 대조 불가 — 기존 경로와 같은 실패, 수집 함수가 null 처리).
 *   · 심볼마다 따로 판정하므로 NQ·유가·SOX 로 고른 접속점이 VIX·지수에 번지지 않는다(관문 #2).
 * 호출량·차단 위험·회차 지연(관문 10310542 #2·#3):
 *   · 수집 함수는 심볼을 «순서대로» 부른다 → 동시 요청은 최대 DNS 1 + 대안 1. 대안 동시 상한 ALT_MAX_INFLIGHT(넘으면 대안 생략 = 기존 경로).
 *   · 요청당 최대 2회(DNS·대안 각 1). 대안이 연속 3번 이기지 못한 심볼은 5분에 한 번만 대안에 묻는다 → 평상시(장 마감·DNS 정상)
 *     대안 호출은 심볼당 5분 1회, DNS 가 늙은 심볼만 매 회차 2회. 추정: 기존 분당 약 40요청 → 약 44~52(늙은 심볼 0~3개).
 *   · DNS 가 끝난 뒤 대안은 1.5초까지만 기다린다(넘으면 DNS 결과·늦음 1회로 셈) — 회차당 추가 지연 상한 ≈ 대안 질의 수 × 1.5초.
 *     EC2 실측 대안 응답 0.9~1.4초(새 연결)·keep-alive 재사용 시 왕복 1회.
 *   · 대안은 자체 3초 제한(접속점별 keep-alive 에이전트), 연속 3회 실패·늦음이면 그 대안 5분 쉼, 대안 429 면 그 대안 15분 쉼,
 *     DNS 429 면 대안 전체 15분 쉼(같은 IP 로 요청을 더 얹지 않음) → 전부 쉬면 DNS 만(기존과 동일).
 *   · TLS 인증서·SNI 는 그대로 query1.finance.yahoo.com — 주소가 야후가 아니면 TLS 가 실패하고 DNS 결과만 쓴다.
 */
import https from 'node:https';

export const YAHOO_HOST = 'query1.finance.yahoo.com';
/** 아시아 접속점 — 10/31 실측 신선(야후 기본 지연만). 바뀌면 TLS 실패 → DNS 결과만 쓴다. */
export const YAHOO_ALT_EDGES: readonly string[] = ['180.222.119.247', '180.222.109.252'];   // EC2 실측 왕복 146ms·199ms 순
export const ALT_TIMEOUT_MS = 3000;
/** 대안을 쓰지 않는 심볼 — 실제 지수는 수집 함수가 1분봉·일봉으로 meta 를 바로잡는다(정규장 봉·직전 거래일 판단을 섞지 않는다) */
export const ALT_EXCLUDED_SYMBOLS: ReadonlySet<string> = new Set(['^IXIC', '^DJI', '^GSPC']);
export const ALT_MAX_INFLIGHT = 2;
export const ALT_FAILS_TO_PAUSE = 3;
export const ALT_PAUSE_MS = 5 * 60_000;
export const ALT_PAUSE_429_MS = 15 * 60_000;

type FetchLike = (url: string, init?: any) => Promise<any>;
export type PinnedFetch = (ip: string, url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

// 접속점마다 keep-alive 에이전트를 따로 둔다 — 호스트 이름이 같아 공용 에이전트를 쓰면 다른 IP 로 연결된 소켓을 재사용할 수 있다.
const agents = new Map<string, https.Agent>();
function agentFor(ip: string): https.Agent {
    let a = agents.get(ip);
    if (!a) { a = new https.Agent({ keepAlive: true, maxSockets: ALT_MAX_INFLIGHT, timeout: 30_000 }); agents.set(ip, a); }
    return a;
}

/** node:https 로 query1 을 특정 IP 에 붙여 보낸다(SNI·인증서 검증은 호스트 이름 그대로). */
export const httpsPinnedFetch: PinnedFetch = (ip, url, init = {}) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers: Record<string, string> = {};
    const h = init.headers || {};
    for (const k of Object.keys(h)) headers[k] = String(h[k]);
    const req = https.request({
        host: u.hostname, servername: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET', headers,
        agent: agentFor(ip),
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

const pos = (v: any, min = 0): v is number => typeof v === 'number' && Number.isFinite(v) && v > min;
const str = (v: any): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export interface MinuteInfo {
    /** 수집 함수가 «가격 없음»으로 버리지 않는 응답(가격 유한·양수) */
    usable: boolean;
    price: number | null;
    time: number | null;
    /** 수집 함수와 같은 식: previousClose ?? chartPreviousClose (0.01 이하·비유한은 null) */
    prev: number | null;
    complete: boolean;
    symbol: string | null;
    currency: string | null;
    exchange: string | null;
}

/** 1분봉 응답 판독: 수집 함수가 쓰는 값(가격·체결 시각·직전 종가)과 식별 필드(심볼·통화·거래소). */
export function minuteInfo(data: any): MinuteInfo {
    const meta = data?.chart?.result?.[0]?.meta;
    const price = pos(meta?.regularMarketPrice) ? meta.regularMarketPrice : null;
    const usable = price != null;
    const time = pos(meta?.regularMarketTime) ? meta.regularMarketTime : null;
    const prevRaw = meta?.previousClose ?? meta?.chartPreviousClose;
    const prev = pos(prevRaw, 0.01) ? prevRaw : null;
    return {
        usable, price, time, prev, complete: usable && time != null && prev != null,
        symbol: str(meta?.symbol), currency: str(meta?.currency), exchange: str(meta?.exchangeName),
    };
}

/** 대안 체결 시각이 DNS 보다 이만큼 이상 새로워야 대안(1분봉 한 칸 이상) */
export const ALT_MIN_GAIN_SEC = 60;
/** 직전 종가 상대 차이 허용 — 0.1%(이내면 일치) */
export const PREV_MATCH_REL = 0.001;
/** 부동소수 경계 오차 여유(상대 1e-9 — 300 vs 300.3 처럼 «정확히 0.1%»가 1e-14 차로 넘치는 것만 흡수, 관문 10310615) */
const PREV_MATCH_EPS = 1e-9;
/** a 가 b 의 상대 0.1% 이내인가(경계 포함) */
export function prevMatches(a: number, b: number): boolean {
    return Math.abs(a - b) <= Math.abs(b) * PREV_MATCH_REL * (1 + PREV_MATCH_EPS);
}

type Got = { kind: 'ok'; status: number; data: any } | { kind: 'bad'; status: number; res: any } | { kind: 'jsonErr'; status: number; err: unknown } | { kind: 'err'; err: unknown };

async function grab(p: () => Promise<any>): Promise<Got> {
    let res: any;
    try { res = await p(); } catch (err) { return { kind: 'err', err }; }
    if (!res?.ok) return { kind: 'bad', status: res?.status ?? 0, res };
    try { return { kind: 'ok', status: res.status, data: await res.json() }; } catch (err) { return { kind: 'jsonErr', status: res.status, err }; }
}

/** 고른 결과를 수집 함수가 쓰는 fetch 응답 모양으로 되돌린다(DNS 결과는 기존과 같은 성공·실패 모양). */
function toResponse(g: Got): any {
    switch (g.kind) {
        case 'ok': { const d = g.data; return { ok: true, status: g.status, json: async () => d }; }
        case 'bad': return g.res;
        case 'jsonErr': { const e = g.err; return { ok: true, status: g.status, json: async () => { throw e; } }; }
        default: throw g.err;
    }
}

export type Pick = 'dns' | 'alt' | 'dns-failed' | 'dns-undecidable' | 'dns-mismatch' | 'dns-alt-invalid' | 'dns-alt-skipped' | 'dns-alt-slow';
/**
 * 1분봉: DNS·대안 결과에서 쓸 쪽을 고른다(순수 함수 — 시험 대상). 'alt' 일 때만 대안, 나머지는 전부 DNS 결과.
 * 규칙은 파일 머리 설명 그대로 — 하나라도 판정 불가면 DNS.
 */
export function pickMinute(dns: Got, alt: Got | null, _nowSec?: number): Pick {
    if (!alt) return 'dns-alt-skipped';
    if (dns.kind !== 'ok') return 'dns-failed';                                 // DNS 요청 실패 → 기존 경로(같은 실패)
    const d = minuteInfo(dns.data);
    const a = alt.kind === 'ok' ? minuteInfo(alt.data) : null;
    if (!a || !a.usable || a.time == null) return 'dns-alt-invalid';
    if (d.time == null || d.prev == null || a.prev == null) return 'dns-undecidable';
    if (!d.symbol || !d.currency || !d.exchange || !a.symbol || !a.currency || !a.exchange) return 'dns-undecidable';
    if (a.symbol !== d.symbol || a.currency !== d.currency || a.exchange !== d.exchange) return 'dns-mismatch';
    if (!prevMatches(a.prev, d.prev)) return 'dns-mismatch';
    return a.time - d.time >= ALT_MIN_GAIN_SEC ? 'alt' : 'dns';
}

/** DNS 가 끝난 뒤 대안을 더 기다리는 상한 — 대안이 느려도 회차(30초 간격, 순차 ~20요청)를 밀지 않게(관문 10310542 #2) */
export const ALT_GRACE_MS = 1500;
/** 대안이 연속 이만큼 «이기지 못한» 심볼은 ALT_RECHECK_MS 마다 한 번만 대안에 묻는다(평상시 호출 증가 억제) */
export const ALT_LOSSES_TO_BACKOFF = 3;
export const ALT_RECHECK_MS = 5 * 60_000;

export interface EdgeState {
    /** 심볼(URL 경로의 심볼 + 봉 간격)별 마지막 판정 — 회차 기록용 */
    picks: Record<string, { via: Pick; dnsT: number | null; altT: number | null; alt: string | null }>;
    /** 대안 접속점별 연속 실패·쉼 */
    alts: Record<string, { fails: number; pausedUntil: number }>;
    /** DNS 쪽 429 를 받으면 대안 전체를 쉰다(같은 IP 로 요청을 더 얹지 않게 — 관문 10310542 #3) */
    allPausedUntil: number;
    /** 심볼별 대안 패배 횟수·마지막 대안 질의 시각 */
    sym: Record<string, { losses: number; lastAltAt: number }>;
    altCalls: number;
    altWins: number;
    altSlow: number;
}

/**
 * 기본 fetch 를 감싼다: query1.finance.yahoo.com 의 차트 요청만 DNS·대안 동시 질의 후 심볼별 판정.
 * 그 외 주소·차트 아닌 요청·대안 전부 쉼/동시 상한이면 기본 fetch 그대로(기존 경로).
 */
export function createEdgeFetch(baseFetch: FetchLike, opts: { pinned?: PinnedFetch; now?: () => number; alts?: readonly string[]; log?: (m: string) => void } = {}) {
    const pinned = opts.pinned ?? httpsPinnedFetch;
    const now = opts.now ?? Date.now;
    const altList = opts.alts ?? YAHOO_ALT_EDGES;
    const state: EdgeState = { picks: {}, alts: {}, allPausedUntil: 0, sym: {}, altCalls: 0, altWins: 0, altSlow: 0 };
    for (const ip of altList) state.alts[ip] = { fails: 0, pausedUntil: 0 };
    let inflight = 0;

    const currentAlt = (): string | null => (state.allPausedUntil > now() ? null : altList.find((ip) => state.alts[ip].pausedUntil <= now()) ?? null);
    function dns429() {
        if (state.allPausedUntil > now()) return;
        state.allPausedUntil = now() + ALT_PAUSE_429_MS;
        opts.log?.(`[yahoo-edge] DNS 429 — 대안 전체 ${ALT_PAUSE_429_MS / 60_000}분 쉼`);
    }
    function pause429(ip: string) {
        const s = state.alts[ip];
        if (s.pausedUntil >= now() + ALT_PAUSE_429_MS - 1000) return;
        s.pausedUntil = now() + ALT_PAUSE_429_MS; s.fails = 0;
        opts.log?.(`[yahoo-edge] 대안 ${ip} 429 — ${ALT_PAUSE_429_MS / 60_000}분 쉼`);
    }
    function noteAlt(ip: string, g: Got, reachable: boolean) {
        const s = state.alts[ip];
        if (g.kind === 'bad' && g.status === 429) return;   // pause429 가 이미 처리
        if (s.pausedUntil > now()) return;                  // 이미 쉬는 중(429 등) — 연속 실패로 덮어쓰지 않는다
        if (reachable) { s.fails = 0; return; }
        if (++s.fails >= ALT_FAILS_TO_PAUSE) {
            s.pausedUntil = now() + ALT_PAUSE_MS; s.fails = 0;
            opts.log?.(`[yahoo-edge] 대안 ${ip} 연속 실패 ${ALT_FAILS_TO_PAUSE} — ${ALT_PAUSE_MS / 60_000}분 쉼`);
        }
    }

    const edgeFetch = async (input: any, init?: any): Promise<any> => {
        const url = typeof input === 'string' ? input : String(input?.url ?? input);
        let u: URL | null = null;
        try { u = new URL(url); } catch { /* 상대 주소 등 — 그대로 */ }
        if (!u || u.hostname !== YAHOO_HOST || !u.pathname.startsWith('/v8/finance/chart/')) return baseFetch(input, init);
        const symbol = decodeURIComponent(u.pathname.slice('/v8/finance/chart/'.length));
        // 1분봉만 대안 대상. 일봉(직전 종가 복구)·실제 지수(1분봉·일봉 보정)는 기존 경로 그대로(관문 10310545 #1·#2)
        if (u.searchParams.get('interval') !== '1m' || ALT_EXCLUDED_SYMBOLS.has(symbol)) {
            // 대안 대상이 아닌 요청이라도 DNS 429 는 대안 전체 쉼에 반영한다(관문 10310548)
            const r = await baseFetch(input, init);
            if (r?.status === 429) dns429();
            return r;
        }
        const key = `${symbol}@1m`;

        const sym = (state.sym[key] ??= { losses: 0, lastAltAt: Number.NEGATIVE_INFINITY });
        const backoff = sym.losses >= ALT_LOSSES_TO_BACKOFF && now() - sym.lastAltAt < ALT_RECHECK_MS;
        const ip = !backoff && inflight < ALT_MAX_INFLIGHT ? currentAlt() : null;
        // 대안에는 호출자 signal 대신 자체 3초 제한 — 대안이 느려도 DNS 경로(호출자 제한)는 그대로
        const { signal: _callerSignal, ...rest } = init || {};
        let altP: Promise<Got> | null = null;
        if (ip) {
            inflight++; state.altCalls++; sym.lastAltAt = now();
            altP = grab(() => pinned(ip, url, { ...rest, signal: AbortSignal.timeout(ALT_TIMEOUT_MS) }))
                // 429 는 대기 상한 뒤 늦게 와도 그 대안을 15분 쉬게 한다(관문 10310545 #3)
                .then((g) => { if (g.kind === 'bad' && g.status === 429) pause429(ip); return g; })
                .finally(() => { inflight--; });
        }
        const dns = await grab(() => baseFetch(input, init));
        if (dns.kind === 'bad' && dns.status === 429) dns429();
        let alt: Got | null = null;
        let slow = false;
        if (altP) {
            // DNS 가 끝난 뒤 대안은 ALT_GRACE_MS 까지만 기다린다(대안 요청은 자체 3초 제한으로 뒤에서 끝난다 — 동시 상한에 계속 잡힌다)
            let timer: ReturnType<typeof setTimeout> | undefined;
            const late = new Promise<'late'>((r) => { timer = setTimeout(() => r('late'), ALT_GRACE_MS); });
            const got = await Promise.race([altP, late]);
            if (timer) clearTimeout(timer);
            if (got === 'late') { slow = true; state.altSlow++; } else alt = got;
        }
        const nowSec = Math.floor(now() / 1000);
        const via: Pick = slow ? 'dns-alt-slow' : pickMinute(dns, alt, nowSec);
        // 연결·상태·본문 실패·늦음만 센다(내용 미비는 심볼 사정 — 대안 전체를 쉬게 하지 않는다)
        if (ip && slow) noteAlt(ip, { kind: 'err', err: new Error('slow') }, false);
        else if (ip && alt) noteAlt(ip, alt, alt.kind === 'ok');
        // 심볼별 패배는 «대안이 응답했는데 이기지 못한» 경우만 센다(연결 실패·늦음은 위 접속점 쉼이 맡는다)
        if (via === 'alt') sym.losses = 0;
        else if (ip && alt && alt.kind === 'ok') sym.losses++;
        const t = (g: Got | null) => (g && g.kind === 'ok' ? minuteInfo(g.data).time : null);
        state.picks[key] = { via, dnsT: t(dns), altT: t(alt), alt: ip };
        if (via === 'alt') { state.altWins++; return toResponse(alt as Got); }
        return toResponse(dns);
    };
    return { fetch: edgeFetch, state };
}
