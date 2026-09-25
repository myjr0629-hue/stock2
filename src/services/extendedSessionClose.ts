/**
 * 시간외 «종가» 정본 — 프리마켓 종가(PRE CLOSE) · 애프터마켓 종가(POST CLOSE)
 *
 * ══════════════════════════════════════════════════════════════════════
 * [2026-09-25 실측 · COST · 정규장 11:37 ET]
 *   커맨드 화면 «PRE CLOSE $916.26 +2.21%». 진짜 프리마켓 종가는 $887.53(−1.00%, 나스닥).
 *   916.26 은 «정규장 분봉»이었다.
 *     fetchTruePreMarket 이 Polygon 식으로 `/range/1/minute/{epoch ms}/{epoch ms}` 를 보냈는데
 *     Intrinio 어댑터는 from/to 를 «날짜»로만 읽는다(addDays 가 숫자를 못 읽어 그대로 넘긴다).
 *     Intrinio 는 쓸 수 없는 날짜를 버리고 «오늘 최신 분봉»을 줬고, sort=desc&limit=1 이
 *     그걸 «09:29 종가»로 집었다. 그 값이 pm_true_close(24h)·flow:extended(24h) 에 앉아
 *     두 문(/api/live/ticker · /api/live/quotes)으로 퍼졌다.
 *   같은 화면의 POST $898.04 는 «어제» 애프터마켓 마지막 체결이었다(last-good 병합이 되살렸다).
 *
 * [정의]  나스닥 «Pre-Market / After-Hours Consolidated Last Trade» 와 같은 것:
 *   그날 통합 체결 테이프(SIP)에서 Form T(시간외) 표시가 붙은 «마지막» 체결.
 *   · 단주(odd lot) 포함 — 나스닥 SPY $768.61 은 1주 체결이었다.
 *   · 09:30:00 을 조금 넘겨 «늦게 보고된» Form T 도 포함 — NVDA 09:30:01.440 $225.41.
 *     «09:30 이전 시각»으로 자르면 11종목 중 7종목이 나스닥과 달랐다(NVDA 225.13·TSLA 384.39…).
 *   · U(순서 어긋난 늦은 보고)는 제외.
 *   실측 2026-09-25: 창 [04:00, 09:30:02] 에서 11/11 종목이 나스닥 값과 1센트까지 일치.
 *   애프터마켓도 같은 정의 — 9/24 COST $898 · NVDA $223.82 · KO $88.20 일치.
 *   (스냅샷 last_price 는 Cboe 거래소만 보는 피드라 898.04 · 223.80 · 88.17 로 어긋난다.)
 *
 * [확정 시각]  피드는 15분 지연이다(delayed_sip, 실측 901초).
 *   창 끝 + 15분 + 여유가 지나야 종가가 «확정»된다: 프리 09:47 ET · 애프터 20:17 ET.
 *   그 전에는 null 을 준다 — 그럴듯한 가짜보다 «값 없음»이 낫다(화면은 블록을 숨긴다).
 *
 * [비용]  확정 뒤 종목·날짜당 한 번(대개 1콜, 대형주 ~1MB). 결과는 날짜 키로 5일 보관한다.
 *   실측 1페이지(5,000행)로 SPY·QQQ·NVDA·TSLA·AAPL·AMD·COST·KO 전부 판정됐다.
 * ══════════════════════════════════════════════════════════════════════
 */
import { after } from 'next/server';
import { getFromCache, mgetFromCache, setInCache } from './redisClient';
import { getLastExtendedTradeIntrinio, hasIntrinioKey } from './intrinioClient';
import { etDateOf, etMinutesOf, isNonTradingDay } from '@/lib/marketCalendar';

/**
 * 응답을 보낸 뒤에 마저 돌린다(next/server after). 요청 밖(스크립트·크론 러너)에서 불리면
 * after 가 던지므로 그냥 흘려보낸다 — 어느 쪽이든 결과는 Redis 에 저장된다.
 */
export function runAfterResponse(p: Promise<unknown> | null | undefined): void {
    if (!p) return;
    const safe = p.catch(() => null);
    try { after(() => safe); } catch { void safe; }
}

export type ExtSessionKind = 'pre' | 'post';

export interface ExtSessionClose {
    kind: ExtSessionKind;
    /** 그 시간외 세션이 속한 거래일 (ET, YYYY-MM-DD) */
    date: string;
    price: number;
    /** 마지막 Form T 체결 시각 (ISO, UTC) */
    time: string;
    /** 실제 피드 (utp_delayed · cta_a_delayed · cta_b_delayed …) */
    source: string;
}

/** 창 [시작, 끝] (ET). 끝은 늦게 보고되는 Form T 를 담으려고 몇 초 넘긴다(실측 최대 +1.6초). */
const WINDOW: Record<ExtSessionKind, [string, string]> = {
    pre: ['04:00:00', '09:30:03'],
    post: ['16:00:00', '20:00:03'],
};
/** 창 끝 + 15분 지연 + 여유 → «확정» 시각 (ET 분) */
const FINAL_AT_MIN: Record<ExtSessionKind, number> = {
    pre: 9 * 60 + 47,     // 09:47
    post: 20 * 60 + 17,   // 20:17
};
/** 1페이지에 창 끝에서 Form T 까지 담기는 크기(개장 직후는 초당 ~1,500건). 애프터는 한산하다. */
const PAGE: Record<ExtSessionKind, { pageSize: number; maxPages: number }> = {
    pre: { pageSize: 5000, maxPages: 3 },
    post: { pageSize: 500, maxPages: 3 },
};

const KEY_PREFIX = 'ext:close:v1:';
const TTL_FOUND = 5 * 24 * 3600;     // 주말·연휴를 건너뛸 만큼
const TTL_NONE = 30 * 60;            // 그날 시간외 체결이 없음 — 예산 초과의 빈 응답일 수도 있어 짧게
const ERROR_COOLDOWN_MS = 60_000;    // 벤더 실패 뒤 같은 질문을 1분간 다시 하지 않는다

const keyOf = (kind: ExtSessionKind, sym: string, date: string) => `${KEY_PREFIX}${kind}:${sym}:${date}`;

type Stored = { p: number; t: string; src: string } | { none: true };

const _inflight = new Map<string, Promise<ExtSessionClose | null>>();
const _errorUntil = new Map<string, number>();

/** 그 날짜의 시간외 종가가 «확정»됐는가 — 지난 거래일이면 늘 확정, 오늘이면 확정 시각 이후. */
export function isExtCloseFinal(date: string, kind: ExtSessionKind, nowMs: number = Date.now()): boolean {
    const today = etDateOf(nowMs);
    if (date < today) return true;
    if (date > today) return false;
    return etMinutesOf(nowMs) >= FINAL_AT_MIN[kind];
}

function fromStored(kind: ExtSessionKind, date: string, v: Stored | null | undefined): ExtSessionClose | null | undefined {
    if (!v || typeof v !== 'object') return undefined;          // 캐시 없음
    if ('none' in v) return null;                               // 확인 결과 «없음»
    const p = Number((v as any).p);
    if (!(p > 0)) return undefined;
    return { kind, date, price: p, time: String((v as any).t || ''), source: String((v as any).src || '') };
}

/**
 * 저장된 값만 본다(벤더 호출 없음). 2~15초 폴링 경로(/api/live/quotes)용.
 *   반환 배열의 각 칸: 값 · null(그날 시간외 체결 없음) · undefined(아직 계산 전)
 */
export async function peekExtendedSessionCloses(
    symbols: string[], date: string, kind: ExtSessionKind,
): Promise<(ExtSessionClose | null | undefined)[]> {
    if (!symbols.length || !date || !isExtCloseFinal(date, kind)) return symbols.map(() => undefined);
    try {
        const vals = await mgetFromCache<Stored>(symbols.map((s) => keyOf(kind, s.toUpperCase(), date)));
        return symbols.map((_, i) => fromStored(kind, date, vals[i]));
    } catch {
        return symbols.map(() => undefined);
    }
}

/**
 * 그 날짜의 시간외 종가. 확정 전·휴장일·실패는 null.
 *   저장된 값이 있으면 벤더를 부르지 않는다. 같은 인스턴스의 동시 질문은 하나로 합친다.
 */
export async function getExtendedSessionClose(
    symbol: string, date: string, kind: ExtSessionKind,
): Promise<ExtSessionClose | null> {
    const sym = String(symbol || '').toUpperCase();
    if (!sym || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNonTradingDay(date)) return null;
    if (!isExtCloseFinal(date, kind)) return null;

    const key = keyOf(kind, sym, date);
    try {
        const hit = fromStored(kind, date, await getFromCache<Stored>(key));
        if (hit !== undefined) return hit;
    } catch { /* Redis 가 없어도 벤더로 진행한다 */ }

    if (!hasIntrinioKey()) return null;
    if ((_errorUntil.get(key) || 0) > Date.now()) return null;

    const running = _inflight.get(key);
    if (running) return running;

    const run = (async (): Promise<ExtSessionClose | null> => {
        try {
            // 확정 시각(09:47·20:17) 직후엔 여러 인스턴스가 같은 종목을 동시에 묻는다(대형주 페이지 ~1MB).
            // 짧은 «선점» 표식으로 대부분의 중복을 막는다(원자적이진 않다 — 드물게 두 번 계산해도 결과는 같다).
            const claimKey = `${key}:claim`;
            const claimed = await getFromCache<number>(claimKey).catch(() => null);
            if (claimed) {
                for (let i = 0; i < 5; i++) {
                    await new Promise((r) => setTimeout(r, 500));
                    const v = fromStored(kind, date, await getFromCache<Stored>(key).catch(() => null));
                    if (v !== undefined) return v;
                }
                return null;   // 다른 인스턴스가 곧 저장한다 — 다음 요청이 읽는다
            }
            await setInCache(claimKey, Date.now(), 20).catch(() => { });

            const [start, end] = WINDOW[kind];
            const tr = await getLastExtendedTradeIntrinio(sym, date, start, end, PAGE[kind]);
            if (tr === undefined) return null;                    // 페이지 상한 — 판정 보류(저장 안 함)
            if (tr === null) {
                setInCache<Stored>(key, { none: true }, TTL_NONE).catch(() => { });
                return null;
            }
            setInCache<Stored>(key, { p: tr.price, t: tr.time, src: tr.source }, TTL_FOUND).catch(() => { });
            return { kind, date, price: tr.price, time: tr.time, source: tr.source };
        } catch (e: any) {
            _errorUntil.set(key, Date.now() + ERROR_COOLDOWN_MS);
            if (_errorUntil.size > 2000) _errorUntil.clear();
            console.warn(`[extClose] ${kind} ${sym} ${date} 실패: ${String(e?.message || e).slice(0, 140)}`);
            return null;
        }
    })();

    _inflight.set(key, run);
    try {
        return await run;
    } finally {
        _inflight.delete(key);
    }
}

/**
 * 배치 경로(섹터 목록 등)용 — 저장된 값은 즉시 주고, 아직 없는 종목은 «뒤에서» 최대 warmMax 개만
 * 계산해 둔다(다음 요청이 읽는다). 목록 화면이 종목 수만큼 벤더를 기다리지 않게 한다.
 *   반환 warm 은 라우트가 next/server 의 after() 에 넘긴다.
 */
export async function peekExtendedSessionClosesAndWarm(
    symbols: string[], date: string, kind: ExtSessionKind, warmMax = 6,
): Promise<{ values: (ExtSessionClose | null | undefined)[]; warm: Promise<unknown> | null }> {
    const values = await peekExtendedSessionCloses(symbols, date, kind);
    const missing = symbols.filter((_, i) => values[i] === undefined);
    if (!missing.length || !isExtCloseFinal(date, kind)) return { values, warm: null };
    const warm = (async () => {
        for (const s of missing.slice(0, Math.max(0, warmMax))) {
            await getExtendedSessionClose(s, date, kind).catch(() => null);
        }
    })();
    return { values, warm };
}

/**
 * 시간 예산 안에서만 기다린다. 넘기면 null 을 주고 계산은 뒤에서 끝나 저장된다
 * (다음 요청이 저장된 값을 읽는다). 사용자 경로에서 무거운 계산을 기다리지 않는다.
 */
export async function getExtendedSessionCloseWithin(
    symbol: string, date: string, kind: ExtSessionKind, budgetMs: number,
): Promise<{ value: ExtSessionClose | null; pending: Promise<unknown> | null }> {
    const p = getExtendedSessionClose(symbol, date, kind);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<'timeout'>((r) => { timer = setTimeout(() => r('timeout'), budgetMs); });
    const res = await Promise.race([p, timeout]);
    if (timer) clearTimeout(timer);
    if (res === 'timeout') return { value: null, pending: p.catch(() => null) };
    return { value: res as ExtSessionClose | null, pending: null };
}

/**
 * ★ 시간외 칸은 «옛 정상값»에서 가져오지 않는다 (/api/live/ticker 의 last-good 병합용).
 *
 *   mergeFreshOverStale 은 null 을 «이번에 못 받은 값»으로 읽고 옛 값을 남긴다.
 *   그런데 정규장의 postPrice null 은 실패가 아니라 «오늘 애프터는 아직 없다»는 답이다.
 *   실측(COST 9/25 11:37 ET): 정규장 응답에 어제 애프터 마지막 체결 $898.04 가
 *   POST +0.17% 로 살아 있었다 — last-good(12h)이 매 요청 다시 저장되며 날을 넘겨 산다.
 *   세션이 바뀌면 뜻이 바뀌는 칸은 «이번 계산»만 쓴다(null 이면 null).
 */
const SESSION_SCOPED: Record<string, string[]> = {
    extended: ['prePrice', 'postPrice', 'preChangePct', 'postChangePct', 'preDate', 'postDate', 'preKind', 'postKind', 'preTime', 'postTime'],
    prices: ['prePrice', 'postPrice'],
    changesFrac: ['PRE', 'POST'],
    changesPct: ['PRE', 'POST'],
};
export function keepSessionScopedFresh(merged: any, fresh: any): any {
    const out: any = { ...merged };
    for (const [obj, keys] of Object.entries(SESSION_SCOPED)) {
        const inner: any = { ...(out[obj] || {}) };
        for (const k of keys) inner[k] = fresh?.[obj]?.[k] ?? null;
        out[obj] = inner;
    }
    return out;
}

/**
 * 스냅샷의 마지막 체결이 «그 날짜의 그 시간외 세션» 체결인가.
 *   지연 피드(15분)라 프리마켓 04:00~04:15 에는 «어제 애프터» 체결이, 애프터 16:00~16:15 에는
 *   «정규장» 체결이 마지막 체결로 온다. 라벨이 아니라 체결 시각으로 가른다.
 *   lastTradeMs: 체결 시각(epoch ms)
 */
export function isTradeInExtSession(lastTradeMs: number, date: string, kind: ExtSessionKind): boolean {
    if (!(lastTradeMs > 0) || !date) return false;
    if (etDateOf(lastTradeMs) !== date) return false;
    const m = etMinutesOf(lastTradeMs);
    return kind === 'pre' ? (m >= 240 && m < 570) : (m >= 960 && m < 1200);
}
