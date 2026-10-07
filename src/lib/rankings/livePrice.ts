// ============================================================================
// 구조 랭킹(감마플립 근접·맥스페인 이격도)의 «현재가» — 정규장 중에는 실시간 시세.
//
// 출발점(2026-10-07 22:41 KST = 09:41 ET 장중 실측): 이 두 랭킹의 행 가격이 09:05 ET 장전 스냅샷 가격이었다
//   (NVDA $240.18 — 실시간은 $238.5). 가격은 structure-build 크론이 구운 조각(structure:part:v2:*)의 px 인데,
//   크론은 09:05·11:05·13:05·15:05·17:05 ET 에만 돌아 장중 내내 최대 2시간 묵은 값이었다.
//
// 원칙(대표 지시): 구조 «레벨»(플립·맥스페인 값)은 스냅샷 그대로 둔다 — 레벨은 체인에서 계산한 구조 한 벌이다.
//   «현재가» 칸만 실시간으로 바꾼다. 그러면 가격과 레벨이 어긋나지 않도록 «이격 %»와 «순위»도 같은 가격으로 다시 잰다
//   (가격만 바꾸고 이격 %를 두면 한 행 안의 $238.5 → $245 가 +2.0% 라고 말하는 모순이 된다 — 238.5 → 245 는 −2.7%).
//
// 이 파일은 «순수 + 주입» — 벤더를 직접 부르지 않는다(tests/rankingLivePrice.test.ts 가 가짜 시세로 고정한다).
// ============================================================================

/** 시세를 다시 매길 후보 수(랭킹당). 스냅샷 순위 상위 N 안에서 실시간 순위가 다시 정해진다 */
export const LIVE_POOL_SIZE = 15;
/** 시세를 «기다려서» 받을 때의 최대 시간 — 넘으면 스냅샷 가격 그대로 나간다(랭킹은 시세 때문에 느려지지 않는다) */
export const LIVE_QUOTE_TIMEOUT_MS = 1500;
/** 공유 시세 사본이 «신선»한 나이 — 이 안이면 벤더를 부르지 않는다 */
export const LIVE_QUOTE_FRESH_MS = 30_000;
/** 이보다 오래되지 않은 사본은 «먼저 주고 뒤에서 갱신». 넘으면 요청 안에서 기다려 받는다 */
export const LIVE_QUOTE_STALE_OK_MS = 3 * 60_000;
/** 공유 시세 사본 Redis TTL(초) — 사본 나이는 at 으로 따로 잰다 */
export const LIVE_QUOTE_TTL_SEC = 10 * 60;

/** 구조 랭킹 id → 계산 규칙. route.ts 의 `bound`·`direction` 과 «같아야 한다» (갈라지면 두 곳이 다른 답을 준다) */
export const STRUCT_LIVE_RULES: Record<string, { bound: number; proximity: boolean }> = {
    'maxpain-gap': { bound: 0.35, proximity: false },   // 먼 순
    'gamma-flip': { bound: 0.25, proximity: true },     // 가까운 순
};

/**
 * 폴리곤 스냅샷 한 종목 → 정규장 «현재가». /api/live/quotes 의 정규장 분기와 같은 순서(마지막 체결 → 오늘 바 종가 → 전일 종가).
 * 0·NaN 이면 0 (= 쓸 수 없음).
 */
export function livePriceOfSnapshot(S: any): number {
    const p = Number(S?.lastTrade?.p) || Number(S?.day?.c) || Number(S?.prevDay?.c) || 0;
    return Number.isFinite(p) && p > 0 ? p : 0;
}

/** 배치 시세 응답 { tickers: [...] } → { 티커: 가격 } */
export function pricesFromBatch(batch: any): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of (Array.isArray(batch?.tickers) ? batch.tickers : [])) {
        const p = livePriceOfSnapshot(s);
        if (s?.ticker && p > 0) out[String(s.ticker)] = p;
    }
    return out;
}

/** 배치 한 번으로 시세를 받는다(시간 제한). 실패·시간 초과·빈 응답이면 빈 객체. 절대 던지지 않는다 */
export async function fetchLivePrices(
    tickers: string[],
    fetchBatch: (tickers: string[]) => Promise<any>,
    opts: { timeoutMs?: number } = {},
): Promise<Record<string, number>> {
    const list = [...new Set(tickers.filter(Boolean))].sort();
    if (!list.length) return {};
    try {
        const batch = await Promise.race([
            fetchBatch(list),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), opts.timeoutMs ?? LIVE_QUOTE_TIMEOUT_MS)),
        ]);
        return pricesFromBatch(batch);
    } catch {
        return {};
    }
}

/** 공유 시세 사본 — at: 받은 시각(ms) · asked: 그때 요청한 티커(시세가 없던 종목 포함 — «이미 물어봤다») */
export interface QuoteEntry { at: number; asked: string[]; prices: Record<string, number> }

export interface QuoteDeps {
    fetchBatch: (tickers: string[]) => Promise<any>;
    read: () => Promise<QuoteEntry | null>;
    write: (entry: QuoteEntry, ttlSec: number) => Promise<void>;
    /** 응답 뒤 작업 예약. 예약했으면 true */
    background?: (job: () => Promise<void>) => boolean;
    lock?: () => Promise<boolean>;
    unlock?: () => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
}

const validEntry = (e: any): e is QuoteEntry =>
    !!e && Number.isFinite(e.at) && Array.isArray(e.asked) && !!e.prices && typeof e.prices === 'object';

async function refreshQuotes(need: string[], deps: QuoteDeps, now: () => number): Promise<QuoteEntry | null> {
    const prices = await fetchLivePrices(need, deps.fetchBatch, { timeoutMs: deps.timeoutMs });
    if (!Object.keys(prices).length) return null;       // 빈 응답으로 멀쩡한 사본을 덮지 않는다
    const entry: QuoteEntry = { at: now(), asked: [...new Set(need)].sort(), prices };
    try { await deps.write(entry, LIVE_QUOTE_TTL_SEC); } catch { /* 저장 실패는 이번 응답에 영향 없음 */ }
    return entry;
}

/**
 * 후보 티커의 실시간 시세 — «사용자를 기다리게 하지 않는다».
 *   · 공유 사본(Redis)이 신선(30초)하면 그대로 · 3분 안이면 먼저 쓰고 갱신은 응답 뒤로 · 그보다 낡았거나 후보를 못 덮으면 기다려 받는다(1.5초 제한)
 *   · 어떤 경우에도 던지지 않는다 — 시세를 못 받으면 빈 객체(= 스냅샷 가격 유지)
 * 반환 at: 가격이 «받아진 시각»(ms) — 응답의 priceAsOf 가 된다.
 */
export async function getLiveQuotes(tickers: string[], deps: QuoteDeps): Promise<{ prices: Record<string, number>; at: number | null }> {
    const now = deps.now ?? Date.now;
    const need = [...new Set(tickers.filter(Boolean))];
    if (!need.length) return { prices: {}, at: null };
    let entry: QuoteEntry | null = null;
    try { const e = await deps.read(); entry = validEntry(e) ? e : null; } catch { entry = null; }
    const covers = !!entry && need.every((t) => entry!.asked.includes(t));
    const age = entry ? now() - entry.at : Infinity;
    if (entry && covers && age >= -5000 && age <= LIVE_QUOTE_FRESH_MS) return { prices: entry.prices, at: entry.at };
    if (entry && covers && age >= -5000 && age <= LIVE_QUOTE_STALE_OK_MS) {
        // 먼저 주고, 갱신은 응답 뒤에서(잠금으로 중복 방지). 예약할 수 없으면 이번엔 사본 그대로
        if (deps.background) {
            deps.background(async () => {
                if (deps.lock && !(await deps.lock().catch(() => true))) return;
                try { await refreshQuotes(need, deps, now); } catch { /* 사본 유지 */ }
                finally { try { await deps.unlock?.(); } catch { /* 만료로 풀린다 */ } }
            });
        }
        return { prices: entry.prices, at: entry.at };
    }
    const fresh = await refreshQuotes(need, deps, now);
    if (fresh) return { prices: fresh.prices, at: fresh.at };
    return { prices: {}, at: null };
}

export interface LivePriceMeta { applied: boolean; asOf?: string; quoted?: number; rows?: number; reason?: string }

/**
 * 구조 랭킹 블록의 행 가격을 실시간으로 다시 매긴다 (순수 함수 — 입력을 바꾸지 않는다).
 *   · 후보 = 표시 행(items) + 스냅샷 순위 상위 풀(_pool) — 스냅샷 순위 밖이던 종목이 실시간으로 올라올 수 있다
 *   · 시세가 있는 행: price = 실시간 · gapPct·rank = 실시간 가격 기준으로 다시(레벨은 그대로) · 범위 밖(계산 오류 의심)이면 뺀다
 *   · 시세가 없는 행: 스냅샷 값 그대로(priceSource 'snapshot')
 *   · 다시 정렬해 top 개만. _pool 은 응답에서 걷는다.
 * quotes 가 비면(장애) 표시 행은 스냅샷 그대로 나간다.
 */
export function applyLivePrices(
    results: Record<string, any> | undefined,
    quotes: Record<string, number>,
    o: { top: number; asOf: string },
): { results: Record<string, any> | undefined; meta: LivePriceMeta } {
    if (!results) return { results, meta: { applied: false, reason: 'no results' } };
    const out: Record<string, any> = { ...results };
    let quoted = 0, rows = 0;
    for (const id of Object.keys(STRUCT_LIVE_RULES)) {
        const block = results[id];
        if (!block || !Array.isArray(block.items)) continue;
        const { _pool, ...rest } = block;
        const rule = STRUCT_LIVE_RULES[id];
        const seen = new Set<string>();
        const base: any[] = [];
        for (const r of [...block.items, ...(Array.isArray(_pool) ? _pool : [])]) {
            if (!r?.ticker || seen.has(r.ticker)) continue;
            seen.add(r.ticker); base.push(r);
        }
        const next = base.map((r) => {
            const live = Number(quotes[r.ticker]);
            const level = Number(r.level);
            if (!(live > 0) || !(level > 0)) return { ...r, priceSource: 'snapshot' };
            const gap = (live - level) / live;
            // 실시간 가격에서도 «정의상 없음»(계산 오류 의심) 범위를 지킨다 — build 와 같은 한계
            if (Math.abs(gap) > rule.bound) return null;
            quoted++;
            return {
                ...r,
                snapPrice: r.price,
                price: live,
                gapPct: Math.round(gap * 1000) / 10,
                rank: rule.proximity ? -Math.abs(gap) : Math.abs(gap),
                priceSource: 'live',
                priceAsOf: o.asOf,
            };
        }).filter((r): r is NonNullable<typeof r> => r !== null);
        next.sort((a, b) => b.rank - a.rank);
        const items = next.slice(0, o.top);
        rows += items.length;
        out[id] = { ...rest, available: items.length > 0, items };
    }
    return { results: out, meta: quoted > 0 ? { applied: true, asOf: o.asOf, quoted, rows } : { applied: false, reason: 'no live quotes' } };
}

/** 응답에서 내부용 _pool 만 걷는다(장외·시세 실패에도 풀이 밖으로 새지 않게) */
export function stripPools(results: Record<string, any> | undefined): Record<string, any> | undefined {
    if (!results) return results;
    let changed = false;
    const out: Record<string, any> = {};
    for (const [id, b] of Object.entries(results)) {
        if (b && typeof b === 'object' && '_pool' in b) { const { _pool, ...rest } = b; out[id] = rest; changed = true; }
        else out[id] = b;
    }
    return changed ? out : results;
}

/** 후보 티커 — 시세를 받을 대상(표시 행 + 풀) */
export function liveCandidateTickers(results: Record<string, any> | undefined): string[] {
    const set = new Set<string>();
    for (const id of Object.keys(STRUCT_LIVE_RULES)) {
        const b = results?.[id];
        if (!b) continue;
        for (const r of [...(b.items || []), ...(Array.isArray(b._pool) ? b._pool : [])]) if (r?.ticker) set.add(r.ticker);
    }
    return [...set];
}

/**
 * 서빙 단계 한 번에: 정규장 중이면 시세를 받아 다시 매기고, 아니면 스냅샷 그대로. 어느 쪽이든 _pool 은 걷는다.
 * payload 는 바꾸지 않고 새 객체를 돌려준다.
 */
export async function withLivePrices(
    payload: any,
    o: { regularOpen: boolean; top: number; quotes: QuoteDeps },
): Promise<any> {
    if (!payload || typeof payload !== 'object' || !payload.results) return payload;
    if (!o.regularOpen) return { ...payload, results: stripPools(payload.results), livePrice: { applied: false, reason: 'not regular session' } };
    const tickers = liveCandidateTickers(payload.results);
    if (!tickers.length) return { ...payload, results: stripPools(payload.results), livePrice: { applied: false, reason: 'no structure rows' } };
    const { prices, at } = await getLiveQuotes(tickers, o.quotes);
    const asOf = new Date(at ?? (o.quotes.now ?? Date.now)()).toISOString();
    const { results, meta } = applyLivePrices(payload.results, prices, { top: o.top, asOf });
    return { ...payload, results: stripPools(results), livePrice: meta };
}
