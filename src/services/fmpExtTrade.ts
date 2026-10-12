// src/services/fmpExtTrade.ts
// ============================================================================
// ★ [2026-10-12] 시간외(프리·애프터) «실시간» 체결 — FMP stable/aftermarket-trade
//
// 왜: 우리 Intrinio 구독은 REST·웹소켓 모두 «15분 지연»이다(10/12 04:24 ET 실측: WS 체결의 수신−체결 = 900~901초,
//     REST source = cboe_one_delayed). 그래서 04:00~04:15·16:00~16:15 ET 에 시간외 칸이 비거나 15분 전 값이었다.
//     FMP aftermarket-trade 는 같은 시각 수신−체결 10~30초(실시간)였다 — 이미 쓰는 FMP 키로 된다.
//
// 한도: FMP Starter 분당 300콜(뉴스·가디언 등과 공유 — 9/23 429 사고). 묶음 엔드포인트(batch-aftermarket-*)는 우리 플랜에서 402.
//   → 종목당 1콜이므로 «캐시 + 인스턴스당 분당 상한»으로 묶는다.
//      · 값 캐시: 인스턴스 메모리 4초 · Redis(fmpx:, EC2 전용 — Upstash 쓰기 0) 30초
//      · 부르는 쪽이 fetch 를 허락할 때만 벤더를 부른다(종목 화면 1~3종목 요청·허브) — 목록 요청은 캐시만 읽는다
//      · 인스턴스당 분당 FMP_EXT_BUDGET_PER_MIN(기본 60)콜을 넘기면 캐시만 쓴다(지연 원천으로 떨어진다)
// ============================================================================

import { mgetFromCache, setInCache } from './redisClient';

export interface FmpExtTrade {
    /** 체결가 */
    price: number;
    /** 체결 시각(epoch ms) */
    ts: number;
    /** 우리가 받은 시각(epoch ms) */
    at: number;
}

const FMP_BASE = 'https://financialmodelingprep.com/stable/aftermarket-trade';
/** 이보다 새로 받은 값이면 다시 묻지 않는다 */
export const FMP_EXT_FRESH_MS = 4_000;
const REDIS_TTL_S = 30;
const FETCH_TIMEOUT_MS = 2_500;
const KEY = (t: string) => `fmpx:${t}`;

const MEM = new Map<string, FmpExtTrade>();

/**
 * ★ 스위치 — EXT_LIVE_FMP=1 일 때만 켠다(기본 꺼짐).
 *   FMP 이용약관 2.2.2 «Data Display»: 별도 계약 없이 여러 사람이 쓰는 앱에 FMP 데이터를 보여 줄 수 없다.
 *   계약(대표 결정) 전엔 꺼 두고, 켜면 코드 배포 없이 실시간이 된다(Vercel 환경변수 + 허브 .env).
 */
export function fmpExtEnabled(): boolean {
    return process.env.EXT_LIVE_FMP === '1';
}
let budgetMinute = 0;
let budgetUsed = 0;

function budgetPerMin(): number {
    const n = Number(process.env.FMP_EXT_BUDGET_PER_MIN);
    return Number.isFinite(n) && n >= 0 ? n : 60;
}

/** 인스턴스 분당 상한 안에서 n 콜을 쓸 수 있는 만큼 돌려준다 */
function takeBudget(n: number, now: number): number {
    const minute = Math.floor(now / 60_000);
    if (minute !== budgetMinute) { budgetMinute = minute; budgetUsed = 0; }
    const room = Math.max(0, budgetPerMin() - budgetUsed);
    const got = Math.min(room, n);
    budgetUsed += got;
    return got;
}

/** 응답 한 줄 → 체결(못 읽으면 null). 순수 함수 — 시험한다 */
export function parseFmpExtTrade(row: unknown, at: number): FmpExtTrade | null {
    const r = row as { price?: unknown; timestamp?: unknown } | null;
    const price = Number(r?.price);
    let ts = Number(r?.timestamp);
    if (!(price > 0) || !Number.isFinite(ts) || ts <= 0) return null;
    if (ts < 1e11) ts *= 1000;          // 초 단위로 오면 ms 로
    return { price, ts: Math.round(ts), at };
}

async function fetchOne(ticker: string, key: string): Promise<FmpExtTrade | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(`${FMP_BASE}?symbol=${encodeURIComponent(ticker)}&apikey=${key}`, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) return null;
        const j = await res.json();
        return parseFmpExtTrade(Array.isArray(j) ? j[0] : null, Date.now());
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 종목들의 FMP 시간외 마지막 체결. 없으면 그 종목 키가 없다.
 *   maxFetch: 이번 호출에서 벤더를 부를 수 있는 최대 종목 수(0 = 캐시만)
 * 세션 판정(오늘 프리·애프터 창 안인가)은 부르는 쪽이 한다 — 여기선 «받은 그대로».
 */
export async function getFmpExtTrades(tickers: readonly string[], opts: { maxFetch: number }): Promise<Record<string, FmpExtTrade>> {
    const out: Record<string, FmpExtTrade> = {};
    if (!fmpExtEnabled()) return out;
    const now = Date.now();
    const list = [...new Set(tickers.map((t) => String(t || '').toUpperCase()).filter(Boolean))];
    if (list.length === 0) return out;

    // ① 인스턴스 메모리
    const needShared: string[] = [];
    for (const t of list) {
        const m = MEM.get(t);
        if (m) out[t] = m;
        if (!m || now - m.at > FMP_EXT_FRESH_MS) needShared.push(t);
    }
    // ② 공유 캐시(EC2 Redis) — 다른 인스턴스·허브가 방금 받은 값
    const stale: string[] = [];
    if (needShared.length > 0) {
        let vals: (FmpExtTrade | null)[] = [];
        try { vals = await mgetFromCache<FmpExtTrade>(needShared.map(KEY)); } catch { vals = []; }
        needShared.forEach((t, i) => {
            const v = vals[i];
            if (v && v.price > 0 && v.ts > 0 && (!out[t] || v.at > out[t].at)) {
                out[t] = v;
                MEM.set(t, v);
            }
            const cur = out[t];
            if (!cur || now - cur.at > FMP_EXT_FRESH_MS) stale.push(t);
        });
    }
    // ③ 벤더 — 허락된 만큼만, 분당 상한 안에서
    const apiKey = process.env.FMP_API_KEY || '';
    const want = Math.min(stale.length, Math.max(0, opts.maxFetch | 0));
    if (!apiKey || want === 0) return out;
    const n = takeBudget(want, now);
    if (n === 0) return out;
    const pick = stale.slice(0, n);
    const got = await Promise.all(pick.map((t) => fetchOne(t, apiKey)));
    const writes: Promise<unknown>[] = [];
    pick.forEach((t, i) => {
        const v = got[i];
        if (!v) return;
        out[t] = v;
        MEM.set(t, v);
        writes.push(setInCache(KEY(t), v, REDIS_TTL_S).catch(() => false));
    });
    if (MEM.size > 3000) MEM.clear();
    await Promise.all(writes);
    return out;
}
