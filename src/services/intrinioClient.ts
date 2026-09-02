/**
 * Intrinio API 클라이언트 + Massive(Polygon) 응답 형태 어댑터
 *
 * [배경] 2026-08-29 Massive 계정이 약관 위반으로 차단됨 (시세 403).
 * Intrinio Startup Plan(Display+Commercial 권한)으로 이관.
 *
 * [설계] 소비처 30여 파일을 건드리지 않기 위해, Intrinio 응답을
 * Massive 응답 스키마로 변환해서 돌려준다. massiveClient.fetchMassive()가
 * 엔드포인트를 보고 이 모듈로 라우팅한다.
 *
 * [주의] 뉴스(/v2/reference/news)는 Massive 유지 — 2026-09-23 해지까지.
 * 정본 문서: .agent/INTRINIO_MIGRATION.md / INTRINIO_MIGRATION_WORKLOG.md
 */

const INTRINIO_API_KEY = process.env.INTRINIO_API_KEY || "";
const INTRINIO_BASE = process.env.INTRINIO_BASE_URL || "https://api-v2.intrinio.com";

export function hasIntrinioKey(): boolean {
    return !!INTRINIO_API_KEY;
}

// ─────────────────────────────────────────────────────────────
// 저수준 호출
// ─────────────────────────────────────────────────────────────

async function callIntrinio(
    path: string,
    params: Record<string, string> = {},
    fetchOptions?: RequestInit,
    timeoutMs = 12000
): Promise<any> {
    if (!INTRINIO_API_KEY) {
        throw new Error("ENV_MISSING: INTRINIO_API_KEY가 설정되지 않았습니다");
    }

    const qs = new URLSearchParams({ ...params, api_key: INTRINIO_API_KEY });
    const url = `${INTRINIO_BASE}/${path.replace(/^\//, "")}?${qs.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            ...(fetchOptions || { cache: "no-store" as RequestCache }),
        });
        if (!res.ok) {
            throw new Error(`Intrinio API Status: ${res.status} (${path})`);
        }
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

const num = (v: any): number | null =>
    v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);

/** ISO 문자열 → epoch ms. Massive lastTrade.t 는 ns 이지만 소비처가 ms 로 다루므로 ms 로 통일. */
const toMs = (iso: any): number => {
    if (!iso) return 0;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? 0 : t;
};

/** YYYY-MM-DD → epoch ms (UTC 자정) */
const dateToMs = (d: string): number => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return Number.isNaN(t) ? 0 : t;
};

/** YYYY-MM-DD 에 n일 더한 YYYY-MM-DD */
function addDays(d: string, n: number): string {
    const t = Date.parse(`${d}T00:00:00Z`);
    if (Number.isNaN(t)) return d;
    return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────
// CSV 파서 (RFC 4180)
//
// [왜 필요한가] Intrinio 벌크 CSV 는 회사명에 쉼표가 있으면 따옴표로 감싼다.
//   예) sec_bzqdQX,com_yRvDxy,"Argan, Inc.",0000100591,AGX,...
//   실측: 119,458행 정상 / 542행이 따옴표+쉼표 포함.
//   단순 split(",") 을 쓰면 그 행들의 컬럼이 한 칸씩 밀려서
//   DATE 자리에 EXCH_TICKER("AGX:UN")가 들어온다. 문자열 비교상
//   "AGX:UN" > "2026-08-27" 이므로 **단 한 행이 최신 거래일 판정을 통째로 오염**시킨다.
//   (실제로 이 버그로 latest 가 "ARLP:UW" 가 되어 종목 수가 1개로 떨어졌다.)
// ─────────────────────────────────────────────────────────────

/** CSV 한 줄을 필드 배열로 파싱. 따옴표 안의 쉼표/줄바꿈, 이스케이프된 따옴표("")를 처리. */
export function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    const len = line.length;
    let i = 0;

    while (i <= len) {
        if (i === len) { out.push(""); break; }

        let field = "";
        if (line.charCodeAt(i) === 34 /* " */) {
            i++; // 여는 따옴표 소비
            let buf = "";
            while (i < len) {
                const ch = line.charCodeAt(i);
                if (ch === 34) {
                    if (i + 1 < len && line.charCodeAt(i + 1) === 34) { buf += '"'; i += 2; continue; }
                    i++; break; // 닫는 따옴표
                }
                buf += line[i]; i++;
            }
            field = buf;
            while (i < len && line.charCodeAt(i) !== 44 /* , */) i++; // 닫는 따옴표 뒤 잔여 무시
        } else {
            const next = line.indexOf(",", i);
            if (next === -1) { field = line.slice(i); i = len; out.push(field.trim()); break; }
            field = line.slice(i, next);
            i = next;
        }

        out.push(field.trim());
        if (i < len && line.charCodeAt(i) === 44) { i++; if (i === len) { out.push(""); break; } }
        else if (i >= len) break;
    }
    return out;
}

/** 헤더 → 컬럼 인덱스 맵 (대문자 정규화) */
function csvHeaderIndex(headerLine: string): Map<string, number> {
    const cols = parseCsvLine(headerLine);
    const m = new Map<string, number>();
    cols.forEach((c, i) => m.set(c.toUpperCase(), i));
    return m;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Massive OHLCV 바 형태 */
interface MassiveBar {
    o: number; h: number; l: number; c: number; v: number; vw: number;
}

function bar(o: any, h: any, l: any, c: any, v: any, vw?: any): MassiveBar {
    const close = num(c) ?? 0;
    return {
        o: num(o) ?? 0,
        h: num(h) ?? 0,
        l: num(l) ?? 0,
        c: close,
        v: num(v) ?? 0,
        // Intrinio 는 일봉 VWAP 을 주지 않음 → (h+l+c)/3 typical price 로 근사.
        // 소비처(live/ticker)는 S.day.vw 를 "VWAP" 표시에만 사용.
        //
        // ⚠️ [2026-08-31 수정] 고가·저가가 없을 때 «지어내면» 안 된다.
        //   `num(h)!` 는 null 을 0 으로 강제하므로 (0+0+c)/3 = **종가의 1/3** 이 나온다.
        //   프리마켓에는 «오늘» 고저가가 아직 없어서 매일 아침 이 값이 나갔다.
        //   실측(월요일 프리마켓, 프로덕션 5종목 전부):
        //     TSLA vwap 116.25 (종가 348.75 ÷ 3) · NVDA 72.5167 (217.55 ÷ 3)
        //     화면에는 「VWAP $116.25 · 상회 +205%」로 표시됐다.
        //   → 계산할 수 없으면 **0 을 돌려준다.** 소비처가
        //     `S.day?.vw || S.prevDay?.vw` 로 «전일 실제 봉»에 폴백하게 두는 것이
        //     그럴듯한 가짜 숫자보다 언제나 낫다.
        vw: num(vw) ?? ((close > 0 && num(h) && num(l))
            ? Math.round(((num(h)! + num(l)! + close) / 3) * 10000) / 10000
            : 0),
    };
}

// ─────────────────────────────────────────────────────────────
// 1) 개별 종목 스냅샷
//    Massive: /v2/snapshot/locale/us/markets/stocks/tickers/{T}
//    → { status, ticker: { ticker, day, prevDay, lastTrade, min, todaysChange, todaysChangePerc, updated } }
// ─────────────────────────────────────────────────────────────

/** ISO 시각 → ET 기준 YYYY-MM-DD */
function etDateOf(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const p = (n: number) => String(n).padStart(2, "0");
    return `${et.getFullYear()}-${p(et.getMonth() + 1)}-${p(et.getDate())}`;
}

/** 현재 ET 세션 — 주말/시간대까지 본다 */
function etSessionNow(): "PRE" | "REG" | "POST" | "CLOSED" {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    if (et.getDay() === 0 || et.getDay() === 6) return "CLOSED";
    const m = et.getHours() * 60 + et.getMinutes();
    if (m >= 240 && m < 570) return "PRE";      // 04:00–09:30
    if (m >= 570 && m < 960) return "REG";      // 09:30–16:00
    if (m >= 960 && m < 1200) return "POST";    // 16:00–20:00
    return "CLOSED";
}

/**
 * 정규장 종가 / 전일 종가 판정 — **순수 함수** (테스트 가능)
 *
 * ══════════════════════════════════════════════════════════════════════
 * [무엇이 틀렸었나]  `eod_close_price` 를 «전일 종가»로 썼다. 아니다.
 *   실측(2026-08-29 토, NVDA):
 *     eod_close_price 217.55 · eod_close_date "2026-08-28"  ← **금요일 종가**
 *     일봉 8/28 c=217.55 · 8/27 c=227.98
 *   즉 «가장 최근 **완료된** 정규장의 종가»다. 그걸 전일로 쓰면 금요일 종가끼리
 *   빼게 되어 등락률이 0 에 수렴한다. 실제 앱 표시(프로덕션 실측):
 *     NVDA  실제 −4.57% → 표시 +0.01%
 *     GOOGL 실제 +1.74% → 표시 +0.04%
 *     TSLA  실제 −1.71% → 표시 +0.01%
 *   두 번째 폴백이 `bars[0].close`(= 같은 값)이라 방어도 되지 않았다.
 *
 * [올바른 규칙]  추측하지 않고 **날짜로** 판정한다.
 *   · 정규장 밖        → 마지막 완료 세션이 곧 「본장」.  bars[0] vs bars[1]
 *   · 정규장 중        → 오늘 봉은 아직 완료가 아니다.  실시간 vs bars[0]
 *   · 마감 직후(게시 전) → 방금 끝난 정규장 체결이 «오늘»이면 그것으로 메운다
 *                        (월요일 프리마켓과 구분하려고 체결 시각의 ET 날짜를 본다)
 *
 * ⚠️ 이 함수는 네트워크를 타지 않는다. 주말에는 REG/PRE 분기를 실화면으로
 *    검증할 수 없으므로 `scripts/test-session-prices.js` 가 유일한 방어선이다.
 */
export interface SessionPriceInput {
    /** securities/{t}/prices 의 stock_prices — **최신순** */
    bars: Array<{ date?: string; close?: number | string | null }>;
    session: "PRE" | "REG" | "POST" | "CLOSED";
    /** 현재 ET 거래일 (주말이면 직전 금요일) */
    todayEt: string;
    eodClosePrice: number | null;
    eodCloseDate: string;
    /** 정규장 마지막 체결가 (시간외 제외) */
    regularLastPrice: number | null;
    regularLastTime: string | null;
}

export interface SessionPriceResult {
    regularClose: number | null;
    prevClose: number | null;
    /** 「본장」이 어느 날짜의 세션인지 */
    regularDate: string;
    /** 어느 분기를 탔는지 — 진단용 */
    basis: "bars" | "live-intraday" | "post-before-publish" | "eod-only" | "none";
}

export function resolveSessionPrices(i: SessionPriceInput): SessionPriceResult {
    const n = (v: any): number | null => {
        const x = Number(v);
        return Number.isFinite(x) && x !== 0 ? x : null;
    };
    const b0 = i.bars?.[0] || null;
    const b1 = i.bars?.[1] || null;
    const d0 = String(b0?.date || "");

    // 기본: 일봉 두 개가 정답이다 (공식 종가)
    let regularClose = n(b0?.close) ?? i.eodClosePrice ?? null;
    let prevClose = n(b1?.close) ?? null;
    let regularDate = d0 || i.eodCloseDate || "";
    let basis: SessionPriceResult["basis"] = b0 ? "bars" : i.eodClosePrice != null ? "eod-only" : "none";

    if (i.session === "REG") {
        // 진행 중 — 오늘 봉은 «완료»가 아니다. 실시간이 오늘, 마지막 완료 봉이 전일.
        if (d0 && d0 === i.todayEt) {
            // 벤더가 진행 중 봉을 이미 올린 경우: 그 자리를 실시간으로, 전일은 bars[1]
            regularClose = i.regularLastPrice ?? regularClose;
        } else {
            regularClose = i.regularLastPrice ?? regularClose;
            prevClose = n(b0?.close) ?? i.eodClosePrice ?? prevClose;
        }
        regularDate = i.todayEt;
        basis = "live-intraday";
    } else if (d0 && d0 < i.todayEt) {
        // 정규장 밖인데 오늘 봉이 아직 없다(마감 직후 게시 지연).
        // «방금 끝난 정규장» 체결이 오늘 것일 때만 메운다 —
        // 월요일 프리마켓(마지막 체결이 금요일)과 반드시 구분해야 한다.
        const regTradeDate = etDateOf(i.regularLastTime);
        if (regTradeDate === i.todayEt && i.regularLastPrice != null) {
            prevClose = n(b0?.close) ?? prevClose;
            regularClose = i.regularLastPrice;
            regularDate = i.todayEt;
            basis = "post-before-publish";
        }
    }

    return { regularClose, prevClose, regularDate, basis };
}

export async function getTickerSnapshot(ticker: string): Promise<any> {
    const sym = ticker.toUpperCase();

    const [rt, hist] = await Promise.all([
        callIntrinio(`securities/${sym}/prices/realtime`).catch(() => null),
        callIntrinio(`securities/${sym}/prices`, { page_size: "3" }).catch(() => null),
    ]);

    const bars: any[] = hist?.stock_prices || [];   // 최신순
    const todayBar = bars[0] || null;
    const prevBar = bars[1] || null;

    if (!rt && !todayBar) {
        return { status: "NOT_FOUND", ticker: null };
    }

    const session = etSessionNow();
    const resolved = resolveSessionPrices({
        bars,
        session,
        todayEt: currentEtTradingDate(),
        eodClosePrice: num(rt?.eod_close_price),
        eodCloseDate: String(rt?.eod_close_date || ""),
        regularLastPrice: num(rt?.normal_market_hours_last_price) ?? num(rt?.qualified_last_price) ?? null,
        regularLastTime: rt?.normal_market_hours_last_time ?? null,
    });
    const { regularClose, prevClose, regularDate } = resolved;

    // 마지막 체결(시간외 포함)
    const last = num(rt?.last_price) ?? regularClose ?? prevClose ?? 0;

    // 등락률은 **정규장 기준** (마지막 완료 정규장 종가 vs 그 직전 종가)
    const change = regularClose != null && prevClose ? regularClose - prevClose : 0;
    const changePerc = prevClose ? (change / prevClose) * 100 : 0;

    // ── 시간외 판정 ───────────────────────────────────────────────
    // 정규장 마지막 체결보다 뒤에 찍힌 체결이 있으면 시간외 거래가 있었다는 뜻
    const regularTime = toMs(rt?.normal_market_hours_last_time);
    const lastTime = toMs(rt?.last_time);
    const hasExtendedTrade = lastTime > 0 && regularTime > 0 && lastTime > regularTime + 60_000;
    const extendedPrice = hasExtendedTrade ? num(rt?.last_price) : null;
    // 시간외 등락률은 **본장 종가 대비**다 (전일 종가가 아니다)
    const extendedChangePct =
        extendedPrice != null && regularClose ? ((extendedPrice - regularClose) / regularClose) * 100 : null;

    // 당일 바: OHLC 는 당일 값, close 는 **정규장 종가**
    const dayBar = bar(
        rt?.open_price,
        rt?.high_price,
        rt?.low_price,
        regularClose,
        rt?.market_volume ?? rt?.exchange_volume ?? 0
    );

    // preMarket/afterHours 필드 채우기용 (세션은 위에서 이미 판정했다)
    const isPreSession = session === "PRE";
    const isPostSession = session === "POST" || session === "CLOSED";

    // 전일 바 — close 는 위에서 날짜로 판정한 prevClose 를 그대로 쓴다.
    // ⚠️ 예전에는 `bars.find(b => b.close === prevClose)` 로 원본 행을 되찾았는데,
    //   prevClose 자체가 틀려 있었으므로(오늘 종가) 오늘 봉을 «전일»로 집어왔다.
    //   이제는 인덱스로 고른다 — 값 비교로 행을 찾지 않는다.
    const prevSrc = bars.find((b: any) => num(b?.close) === prevClose && String(b?.date || "") !== regularDate)
        || prevBar
        || null;
    const prevDayBar = prevSrc
        ? bar(prevSrc.open, prevSrc.high, prevSrc.low, prevClose ?? 0, prevSrc.volume)
        : bar(0, 0, 0, prevClose ?? 0, 0);

    return {
        status: "OK",
        request_id: `intrinio-${sym}-${Date.now()}`,
        ticker: {
            ticker: sym,
            todaysChange: Math.round(change * 10000) / 10000,
            todaysChangePerc: Math.round(changePerc * 10000) / 10000,
            updated: toMs(rt?.updated_on || rt?.last_time) * 1e6, // Massive 는 ns
            // ── 다크풀 대체 지표 (Massive 에 없던 것) ──────────────
            // NBBO 호가에서 스프레드 → 유동성 점수. 측정 불가면 null.
            spreadPct: (() => {
                const sp = spreadPctOf(num(rt?.bid_price), num(rt?.ask_price));
                return sp == null ? null : Math.round(sp * 10000) / 10000;
            })(),
            liquidityScore: liquidityScoreFromSpread(spreadPctOf(num(rt?.bid_price), num(rt?.ask_price))),
            bidSize: num(rt?.bid_size),
            askSize: num(rt?.ask_size),
            day: dayBar,
            prevDay: prevDayBar,
            // Massive 스냅샷과 동일한 시간외 필드.
            // 소비처(live/ticker)가 S.preMarket / S.afterHours 를 읽는다.
            preMarket: isPreSession && extendedPrice ? extendedPrice : undefined,
            afterHours: isPostSession && extendedPrice ? extendedPrice : undefined,
            lastTrade: {
                p: last ?? 0,
                s: num(rt?.last_size) ?? 0,
                t: toMs(rt?.last_time) * 1e6,
                c: [],
            },
            lastQuote: {
                P: num(rt?.ask_price) ?? 0,
                S: num(rt?.ask_size) ?? 0,
                p: num(rt?.bid_price) ?? 0,
                s: num(rt?.bid_size) ?? 0,
                t: toMs(rt?.bid_time) * 1e6,
            },
            min: {
                ...dayBar,
                t: toMs(rt?.last_time),
                n: 0,
            },
            // 세션 분리용 (Intrinio 고유 — Massive 에는 없던 정보)
            _intrinio: {
                source: rt?.source ?? null,
                eodClosePrice: num(rt?.eod_close_price),
                eodCloseDate: rt?.eod_close_date ?? null,
                regularLastPrice: num(rt?.normal_market_hours_last_price),
                regularLastTime: rt?.normal_market_hours_last_time ?? null,
                extendedPrice,
                extendedChangePct: extendedChangePct == null ? null : Math.round(extendedChangePct * 10000) / 10000,
                hasExtendedTrade,
                session,
                // 「본장」이 어느 날짜의 세션인지 — 소비처가 신선도를 판단할 수 있게
                regularDate,
                regularClose,
                prevClose,
                marketCenterCode: rt?.market_center_code ?? null,
                isDarkpool: rt?.is_darkpool ?? null,
            },
        },
    };
}

// ─────────────────────────────────────────────────────────────
// 2) 일봉 집계
//    Massive: /v2/aggs/ticker/{T}/range/1/day/{from}/{to}
//    → { ticker, results: [{ t,o,h,l,c,v,vw,n }], resultsCount, status }
// ─────────────────────────────────────────────────────────────

export async function getDailyAggregates(
    ticker: string,
    from: string,
    to: string,
    opts: { sort?: "asc" | "desc"; limit?: number } = {}
): Promise<any> {
    const sym = ticker.toUpperCase();
    const limit = Math.min(opts.limit ?? 5000, 10000);

    const data = await callIntrinio(`securities/${sym}/prices`, {
        start_date: from,
        end_date: to,
        frequency: "daily",
        page_size: String(Math.min(limit, 10000)),
    });

    const rows: any[] = data?.stock_prices || [];
    // Intrinio 는 최신순(desc) 반환
    const ordered = opts.sort === "desc" ? rows : [...rows].reverse();

    const results = ordered.slice(0, limit).map((r) => ({
        t: dateToMs(r.date),
        o: num(r.open) ?? 0,
        h: num(r.high) ?? 0,
        l: num(r.low) ?? 0,
        c: num(r.close) ?? 0,
        v: num(r.volume) ?? 0,
        vw: num(r.close) != null
            ? Math.round((((num(r.high) ?? 0) + (num(r.low) ?? 0) + (num(r.close) ?? 0)) / 3) * 10000) / 10000
            : 0,
        n: 0,
    }));

    return {
        ticker: sym,
        queryCount: results.length,
        resultsCount: results.length,
        adjusted: true,
        results,
        status: "OK",
        request_id: `intrinio-aggs-${sym}`,
    };
}

// ─────────────────────────────────────────────────────────────
// 2-b) 분봉/시간봉 집계
//    Massive: /v2/aggs/ticker/{T}/range/{mult}/{minute|hour}/{from}/{to}
//    Intrinio: securities/{t}/prices/intervals?interval_size=5m
//              → { intervals: [{ time, close_time, open, high, low, close,
//                                volume, average, trade_count, bid_*, ask_* }] }
//    지원 interval_size: 1m 5m 15m 30m 60m(=1h)
// ─────────────────────────────────────────────────────────────

/** Massive (mult, span) → Intrinio interval_size. 미지원이면 null */
function toIntrinioInterval(mult: number, span: string): string | null {
    const s = span.toLowerCase();
    if (s === "hour") return mult === 1 ? "60m" : null;
    if (s !== "minute") return null;
    if ([1, 5, 15, 30, 60].includes(mult)) return `${mult}m`;
    // 근사: 지원 크기 중 가장 가까운 하위 값으로 내린다 (봉이 더 촘촘한 쪽이 안전)
    if (mult < 5) return "1m";
    if (mult < 15) return "5m";
    if (mult < 30) return "15m";
    if (mult < 60) return "30m";
    return "60m";
}

export async function getIntradayAggregates(
    ticker: string,
    mult: number,
    span: string,
    from: string,
    to: string,
    opts: { sort?: "asc" | "desc"; limit?: number } = {}
): Promise<any | undefined> {
    const interval = toIntrinioInterval(mult, span);
    if (!interval) return undefined;

    const sym = ticker.toUpperCase();
    const limit = Math.min(opts.limit ?? 1000, 1000);

    // ⚠️ Intrinio intervals 의 실측 제약 두 가지 (2026-08-29 확인)
    //   1) end_date 는 **배타적(exclusive)**. from==to 로 보내면 빈 배열이 온다.
    //      → Massive 의 inclusive 의미를 맞추려면 +1일 해야 한다.
    //   2) page_size 상한은 **1000** (넘기면 400 "Max page size for this endpoint is 1000").
    const endExclusive = addDays(to, 1);

    const data = await callIntrinio(`securities/${sym}/prices/intervals`, {
        interval_size: interval,
        start_date: from,
        end_date: endExclusive,
        page_size: String(Math.min(Math.max(limit, 100), 1000)),
    });

    const rows: any[] = data?.intervals || [];
    // Intrinio 는 최신순(desc) 반환
    const ordered = opts.sort === "desc" ? rows : [...rows].reverse();

    const results = ordered.slice(0, limit).map((r) => ({
        t: toMs(r.time),
        o: num(r.open) ?? 0,
        h: num(r.high) ?? 0,
        l: num(r.low) ?? 0,
        c: num(r.close) ?? 0,
        v: num(r.volume) ?? 0,
        // average = 해당 구간 평균가 → Massive vw 대응
        vw: num(r.average) ?? num(r.close) ?? 0,
        n: num(r.trade_count) ?? 0,
    }));

    // ── 시간외(PRE/POST) 봉 병합 ─────────────────────────────────
    // Intrinio intervals 는 **정규장만** 준다(실측: 390봉, PRE 0 / POST 0).
    // EC2 `intrinio-ext-bars` 서비스가 기록해 둔 시간외 봉을 여기서 합쳐,
    // 1D 차트의 PRE/본장/POST 구분이 살아 있게 한다.
    const merged = await mergeExtendedBars(sym, from, to, results);

    return {
        ticker: sym,
        queryCount: merged.length,
        resultsCount: merged.length,
        adjusted: true,
        results: opts.sort === "desc" ? [...merged].reverse() : merged,
        status: "OK",
        request_id: `intrinio-intraday-${sym}-${interval}`,
    };
}

// ─────────────────────────────────────────────────────────────
// 시간외 봉 (EC2 기록기 산출물)
// ─────────────────────────────────────────────────────────────

const EXT_BARS_KEY = (d: string) => `intrinio:extbars:${d}`;
const EXT_TTL_MS = 60_000;
let _extCache: { at: number; date: string; bars: Record<string, number[][]> } | null = null;

/** ET 분(minute-of-day) + 날짜 → epoch ms. DST 를 실제 오프셋으로 계산한다. */
function etMinuteToMs(date: string, minute: number): number {
    const h = String(Math.floor(minute / 60)).padStart(2, "0");
    const m = String(minute % 60).padStart(2, "0");
    // 해당 날짜의 ET 오프셋을 UTC 로 역산 (EDT -4 / EST -5 자동 처리)
    const probe = Date.parse(`${date}T12:00:00Z`);
    if (Number.isNaN(probe)) return 0;
    const etNoon = new Date(new Date(probe).toLocaleString("en-US", { timeZone: "America/New_York" }));
    // ⚠️ 부호 주의: UTC 정오가 ET 08시면 ET 는 UTC 보다 **4시간 뒤**이므로
    //    ISO 오프셋은 «-04:00» 이다. 이 부호를 뒤집으면 POST 봉이 정규장 시간대로
    //    계산돼 기존 봉과 충돌하고 조용히 버려진다(2026-08-29 실제 발생).
    const behindHours = 12 - etNoon.getHours();      // EDT=4, EST=5
    const sign = behindHours > 0 ? "-" : "+";
    const oh = String(Math.abs(behindHours)).padStart(2, "0");
    const t = Date.parse(`${date}T${h}:${m}:00${sign}${oh}:00`);
    return Number.isNaN(t) ? 0 : t;
}

async function loadExtBars(date: string): Promise<Record<string, number[][]>> {
    if (_extCache && _extCache.date === date && Date.now() - _extCache.at < EXT_TTL_MS) {
        return _extCache.bars;
    }
    const proxy = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
    const key = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || "signum-redis-proxy-2026";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
        const res = await fetch(`${proxy}/get?key=${encodeURIComponent(EXT_BARS_KEY(date))}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: controller.signal,
            cache: "no-store",
        });
        if (!res.ok) return {};
        const raw = await res.json();
        const val = typeof raw?.result === "string" ? safeJson(raw.result) : raw?.result;
        const bars = val?.bars && typeof val.bars === "object" ? val.bars : {};
        _extCache = { at: Date.now(), date, bars };
        return bars;
    } catch {
        return {};
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 정규장 봉 배열에 시간외 봉을 시간순으로 합친다.
 * 기록된 날짜가 조회 구간(from~to) 안에 있을 때만 합치고,
 * 이미 같은 시각의 봉이 있으면 정규장 값을 우선한다(중복 방지).
 */
async function mergeExtendedBars(
    sym: string, from: string, to: string, results: any[]
): Promise<any[]> {
    // 조회 구간이 하루 이상이어도 «오늘/마지막 날»만 시간외를 붙인다
    // (그 이전 날짜는 기록기가 돌기 전이라 데이터가 없다)
    //
    // ⚠️ 호출부(getStockChartData)는 from/to 를 **UTC 날짜**로 만드는데
    //    기록기는 **ET 날짜**로 키를 만든다. 20:00 ET(=00:00 UTC)를 넘기면
    //    두 날짜가 하루 갈려서 조회가 통째로 빗나간다(실측: POST 봉 사라짐).
    //    그래서 ET 거래일도 후보에 넣는다.
    const dates = [currentEtTradingDate(), to, from]
        .filter((d, i, a) => ISO_DATE.test(d) && a.indexOf(d) === i);
    if (!dates.length) return results;

    const have = new Set(results.map((r) => r.t));
    const extra: any[] = [];

    for (const date of dates) {
        const bars = await loadExtBars(date);
        const rows = bars?.[sym];
        if (!Array.isArray(rows) || !rows.length) continue;
        for (const row of rows) {
            // [etMinute, o, h, l, c, v]
            if (!Array.isArray(row) || row.length < 6) continue;
            const t = etMinuteToMs(date, Number(row[0]));
            if (!t || have.has(t)) continue;
            const c = Number(row[4]) || 0;
            if (!(c > 0)) continue;
            have.add(t);
            extra.push({
                t,
                o: Number(row[1]) || c,
                h: Number(row[2]) || c,
                l: Number(row[3]) || c,
                c,
                v: Number(row[5]) || 0,
                vw: c,
                n: 0,
                _ext: true,   // 시간외 기록물 표식 (진단용)
            });
        }
    }

    if (!extra.length) return results;
    return [...results, ...extra].sort((a, b) => a.t - b.t);
}

// ─────────────────────────────────────────────────────────────
// 3) 옵션 체인 스냅샷
//    Massive: /v3/snapshot/options/{T}
//    → { results: [{ details, greeks, open_interest, implied_volatility, day, last_quote, underlying_asset }] }
//
//    Intrinio: options/expirations/{T}/eod → 만기 목록
//              options/chain/{T}/{exp}/eod → 만기별 체인 (OI + IV + Greeks)
// ─────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════
// 만기 선택 — Lambda 어댑터(scripts/lambda-flow-harvest/intrinio-adapter.js)와
// **같은 규칙이어야 한다.** 갈라지면 앱과 수집기가 다른 만기를 보고,
// 「맥스페인 220」이 어디서 나온 값인지 알 수 없게 된다.
//
// 주간 = 오늘부터 다가오는 금요일까지 구간의 **마지막 만기**
//        → 정상 주 금요일 / 금요일 휴장 주 목요일 / SPY 매일만기도 그 주 금요일
// 월물 = 15~21일 창의 **금요일**(표준 월물). 없으면 창의 마지막 만기.
//
// ★ 「첫 금요일」로 고르면 안 된다(실측): SPY/QQQ 는 매일 만기라 첫 금요일이
//   2번째이고, NVDA/TSLA 는 월·수 만기가 섞여 있으며, 금요일이 휴장이면
//   그 주를 통째로 건너뛴다.
// ★ 월물을 찾을 때 달을 더하기 전에 **일(day)을 1로** 놓아야 한다.
//   31일에 setMonth(+1) 을 하면 「11월 31일」이 없어 12월로 넘어가
//   그 달 월물이 통째로 빠진다(10-31 에 11-20 을 건너뛰고 12-18 을 골랐다).
// 0~35 DTE — 기존 설계의 창.
export const DTE_WINDOW_DAYS = 35;
const _dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();

export function pickWeeklyExpiration(exps: string[], today: string): string {
    const t = new Date(today + 'T12:00:00Z');
    const fri = new Date(t.getTime() + (((5 - t.getUTCDay() + 7) % 7)) * 86400000)
        .toISOString().slice(0, 10);
    const inWeek = exps.filter((e) => e >= today && e <= fri);
    return inWeek.length ? inWeek[inWeek.length - 1] : (exps.find((e) => e >= today) || '');
}

export function pickMonthlyExpiration(exps: string[], today: string): string {
    const y0 = Number(today.slice(0, 4));
    const m0 = Number(today.slice(5, 7)) - 1;
    for (let m = 0; m < 3; m++) {
        const base = new Date(Date.UTC(y0, m0 + m, 1));
        const ym = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}`;
        const win = exps.filter((e) => {
            const d = Number(e.slice(8, 10));
            return e >= today && e.slice(0, 7) === ym && d >= 15 && d <= 21;
        });
        if (!win.length) continue;
        return win.find((e) => _dow(e) === 5) || win[win.length - 1];
    }
    return '';
}
// ══════════════════════════════════════════════════════════════════════

export interface OptionChainOptions {
    /** 더 넓게 필요할 때만. 기본은 주간+월물 2개다. */
    maxExpirations?: number;
    /** 특정 만기만 */
    expiration?: string;
    /** 기초자산 현재가 (응답의 underlying_asset.price 채우기용) */
    underlyingPrice?: number;
}

/**
 * 실시간 그릭스 (OptionsEdge / FMV) — Lambda 어댑터와 **같은 규칙**이어야 한다.
 *
 * [2026-09-02 전수조사로 발견] 접근 권한이 있는데 안 쓰고 있었다.
 *   `options/chain/{t}/{exp}/eod` 는 장중에도 전일 종가를 준다(실측 date=전일).
 *   플랜에 포함된 **OptionsEdge (FMV Real-Time)** 의 이 엔드포인트가
 *   실시간 IV·델타·감마·세타·베가 + synthetic_price 를 준다(유효율 100%).
 *
 *   실측 효과(NVDA 본장 중): 넷감마 9,828(전일) → 23,246(실시간), **136.5% 차이**.
 *   지금까지 GEX 가 실제의 절반도 안 되는 값으로 나가고 있었다.
 *
 *   ★ OI 는 이 피드에 없다. EOD 체인 것이 정답이다(OCC 야간 정산 = 하루 단위).
 */
export async function getRealtimeGreeksIntrinio(
    sym: string,
    opts: { start?: string; end?: string } = {}
): Promise<{ greeks: Map<string, any>; calls: number }> {
    const out = new Map<string, any>();
    let page: string | null = null;
    let calls = 0;
    const MAX_PAGES = 14;
    do {
        const q: Record<string, any> = { page_size: 250 };
        if (opts.start) q.expiration_start_date = opts.start;
        if (opts.end) q.expiration_end_date = opts.end;
        if (page) q.next_page = page;
        const j: any = await callIntrinio(`options/greeks/by_ticker/${sym}/realtime`, q).catch(() => null);
        calls++;
        if (!j) break;
        for (const c of j.contracts || []) {
            const code = c.option?.code;
            if (code) out.set(code, c.greeks || {});
        }
        page = j.next_page || null;
    } while (page && calls < MAX_PAGES);
    return { greeks: out, calls };
}

export async function getOptionChainSnapshotIntrinio(
    ticker: string,
    opts: OptionChainOptions = {}
): Promise<any> {
    const sym = ticker.toUpperCase();

    let expirations: string[] = [];
    if (opts.expiration) {
        expirations = [opts.expiration];
    } else {
        const today = new Date().toISOString().slice(0, 10);
        // ⚠️ `after` 는 **배타적**이다(실측). after=오늘 을 주면 그날 만기가 빠져,
        //    만기일 당일 장중에 그날 만기를 건너뛰고 다음 주를 본다.
        //    하루 앞을 주고 우리가 `>= today` 로 자른다.
        const yday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
        const expData = await callIntrinio(`options/expirations/${sym}/eod`, { after: yday }).catch(() => null);
        const all: string[] = (expData?.expirations || []).filter((e: string) => e >= today).sort();
        // 기존 설계 = 0~35 DTE **날짜 창**(FlowRadar L371 이 그 범위로 OI 지표를 만든다).
        // 개수로 자르면 종목마다 덮는 기간이 달라진다(실측 SPY 8일 · MRVL 35일).
        // 주간+월물 2개로 줄이는 것도 검토했으나 0~35 DTE 총 OI 의 67~78% 밖에
        // 안 돼(SPY 67%) GEX·DEX·OPI 합계가 틀어진다 — 기존 창을 유지한다.
        const limit = new Date(Date.parse(today + 'T00:00:00Z') + DTE_WINDOW_DAYS * 86400000)
            .toISOString().slice(0, 10);
        expirations = all.filter((e) => e <= limit);
        if (!expirations.length && all.length) expirations = [all[0]];
        const want = opts.maxExpirations ?? 0;
        if (want > 0 && expirations.length > want) {
            // 개수를 줄여야 할 때도 주간·월물은 반드시 남긴다.
            const must = [pickWeeklyExpiration(expirations, today), pickMonthlyExpiration(expirations, today)]
                .filter(Boolean);
            const rest = expirations.filter((e) => !must.includes(e));
            expirations = [...new Set([...must, ...rest])].slice(0, want).sort();
        }
    }

    if (!expirations.length) {
        return { results: [], status: "OK", count: 0, request_id: `intrinio-chain-${sym}` };
    }

    let underlying = opts.underlyingPrice ?? 0;
    if (!underlying) {
        const rt = await callIntrinio(`securities/${sym}/prices/realtime`).catch(() => null);
        underlying = num(rt?.last_price) ?? num(rt?.eod_close_price) ?? 0;
    }

    const chains = await Promise.all(
        expirations.map((exp) =>
            callIntrinio(`options/chain/${sym}/${exp}/eod`).catch(() => null)
        )
    );

    // 실시간 그릭스를 같은 계약에 덮어쓴다. OI·행사가·만기는 EOD 것을 그대로.
    let rtGreeks: Map<string, any> | null = null;
    if (process.env.INTRINIO_REALTIME_GREEKS !== "0" && expirations.length) {
        const r = await getRealtimeGreeksIntrinio(sym, {
            start: expirations[0], end: expirations[expirations.length - 1],
        }).catch(() => null);
        if (r && r.greeks.size) rtGreeks = r.greeks;
    }

    const results: any[] = [];
    let rtHits = 0;
    for (const ch of chains) {
        for (const row of ch?.chain || []) {
            const o = row.option || {};
            const p = row.prices || {};
            const rt = rtGreeks ? rtGreeks.get(o.code) : null;
            if (rt) rtHits++;
            const type = String(o.type || "").toLowerCase();

            results.push({
                details: {
                    ticker: `O:${o.code || ""}`,
                    contract_type: type === "put" ? "put" : "call",
                    exercise_style: p.exercise_style === "E" ? "european" : "american",
                    expiration_date: o.expiration || null,
                    shares_per_contract: 100,
                    strike_price: num(o.strike) ?? 0,
                },
                greeks: {
                    delta: num(rt?.delta) ?? num(p.delta) ?? 0,
                    gamma: num(rt?.gamma) ?? num(p.gamma) ?? 0,
                    theta: num(rt?.theta) ?? num(p.theta) ?? 0,
                    vega: num(rt?.vega) ?? num(p.vega) ?? 0,
                },
                implied_volatility: num(rt?.implied_volatility) ?? num(p.implied_volatility) ?? 0,
                // ★ OI 는 실시간 피드에 없다. EOD 것이 정답이다(OCC 야간 정산).
                open_interest: num(p.open_interest) ?? 0,
                break_even_price:
                    type === "put"
                        ? (num(o.strike) ?? 0) - (num(p.close) ?? 0)
                        : (num(o.strike) ?? 0) + (num(p.close) ?? 0),
                day: {
                    open: num(p.open) ?? 0,
                    high: num(p.high) ?? 0,
                    low: num(p.low) ?? 0,
                    close: num(p.close) ?? 0,
                    last: num(p.close) ?? 0,
                    volume: num(p.volume) ?? 0,
                    vwap: num(p.mark) ?? num(p.close) ?? 0,
                    change: 0,
                    change_percent: 0,
                    previous_close: 0,
                },
                last_quote: {
                    bid: num(p.close_bid) ?? 0,
                    bid_size: num(p.close_bid_size) ?? 0,
                    ask: num(p.close_ask) ?? 0,
                    ask_size: num(p.close_ask_size) ?? 0,
                    // 실시간 FMV(합성가격)가 있으면 그것이 중간값이다 — 전일 종가보다 맞다.
                    midpoint:
                        num(rt?.synthetic_price) ??
                        num(p.mark) ??
                        ((num(p.close_bid) ?? 0) + (num(p.close_ask) ?? 0)) / 2,
                    last_updated: dateToMs(p.date) * 1e6,
                },
                underlying_asset: {
                    ticker: sym,
                    price: underlying,
                    change_to_breakeven: 0,
                    last_updated: Date.now() * 1e6,
                    timeframe: "DELAYED",
                },
                _intrinio: { code: o.code, date: p.date },
                // 이 계약의 그릭스가 실시간으로 덮였는지 — 하류가 라벨을 정확히 붙일 근거
                _rtGreeks: !!rt,
            });
        }
    }

    return {
        results,
        status: "OK",
        count: results.length,
        request_id: `intrinio-chain-${sym}`,
    };
}

// ─────────────────────────────────────────────────────────────
// 4) 기술지표
//    Massive: /v1/indicators/{ind}/{T}
//    → { results: { values: [{ timestamp, value }] }, status }
// ─────────────────────────────────────────────────────────────

const TECHNICAL_VALUE_KEY: Record<string, string> = {
    rsi: "rsi",
    sma: "sma",
    macd: "macd_line",
    adx: "adx",
    atr: "atr",
    cci: "cci",
    mfi: "mfi",
    obv: "obv",
    vwap: "vwap",
    trix: "trix",
    ao: "ao",
    sr: "sr",
};

export async function getTechnicalIndicator(
    indicator: string,
    ticker: string,
    params: Record<string, string> = {}
): Promise<any> {
    const sym = ticker.toUpperCase();
    const ind = indicator.toLowerCase();

    const q: Record<string, string> = { page_size: params.limit || "100" };
    if (params.window) q.period = params.window;
    if (params.timespan) q.frequency = params.timespan === "day" ? "daily" : params.timespan;

    const data = await callIntrinio(`securities/${sym}/prices/technicals/${ind}`, q);
    const rows: any[] = data?.technicals || [];
    const key = TECHNICAL_VALUE_KEY[ind] || ind;

    const values = rows.map((r) => ({
        timestamp: toMs(r.date_time),
        value: num(r[key]) ?? num(r.value) ?? 0,
        ...(ind === "macd"
            ? {
                  signal: num(r.signal_line) ?? 0,
                  histogram: num(r.macd_histogram) ?? 0,
              }
            : {}),
    }));

    return {
        results: { values, underlying: { url: "" } },
        status: "OK",
        request_id: `intrinio-tech-${ind}-${sym}`,
        // Massive 형태로 눌러 담으면 adx 의 di_pos/di_neg, bb 의 3개 밴드 같은
        // **다지표 필드가 통째로 사라진다.** 원본을 같이 실어 보낸다
        // (advancedTechnicals 가 이걸 쓴다).
        _rows: rows,
    };
}

/**
 * 하이일드 신용 스프레드 (BofA US High Yield Master II OAS) — 위험 레짐
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 이걸 붙이나]  현재 매크로 축은 NQ·VIX·US10Y·DXY·TLT·GLD 로 **전부
 *   주식 아니면 금리**다. 신용시장은 빠져 있었다. HY OAS 는 «위험자산에
 *   요구되는 추가 수익률»이라 위험선호/회피를 가장 직접적으로 말하고,
 *   주식보다 먼저 움직이는 경우가 관찰된다.
 *
 * [실측]  `indices/economic/$BAMLH0A0HYM2/historical_data/level` → 200
 *   2026-08-27 2.63 · 08-26 2.67 · 08-25 2.70   (영업일 +1 지연은 정상)
 *   ⚠️ 이 계열은 그동안 «갱신 느림»으로 분류해 안 쓰고 있었다 — 오판이었다.
 *
 * [해석]  절대 수준보다 **방향**이 중요하다. 스프레드 «확대» = 위험회피.
 *   주가가 오르는데 스프레드가 벌어지면 그 상승은 신용시장이 확인해 주지 않는
 *   것이라 다이버전스 경고가 된다.
 */
const HY_OAS_SYMBOL = "$BAMLH0A0HYM2";

export interface CreditSpread {
    value: number;
    date: string;
    /** 20영업일 전 대비 변화 (%p) */
    change20d: number | null;
    /** 최근 1년 분포 백분위 (높을수록 스프레드가 벌어진 상태) */
    percentile: number | null;
    /** TIGHTENING = 위험선호 · WIDENING = 위험회피 */
    regime: "TIGHTENING" | "STABLE" | "WIDENING";
}

export async function getCreditSpread(): Promise<CreditSpread | null> {
    try {
        const data = await callIntrinio(
            `indices/economic/${encodeURIComponent(HY_OAS_SYMBOL)}/historical_data/level`,
            { page_size: "260" }
        );
        const rows: any[] = data?.historical_data || [];
        const series = rows
            .map((r) => ({ date: String(r.date || ""), v: Number(r.value) }))
            .filter((r) => r.date && Number.isFinite(r.v));
        if (series.length < 5) return null;

        // API 는 최신순
        const cur = series[0];
        const prior = series[Math.min(20, series.length - 1)];
        const change20d = prior ? Math.round((cur.v - prior.v) * 1000) / 1000 : null;

        const vals = series.map((r) => r.v).sort((a, b) => a - b);
        const below = vals.filter((v) => v < cur.v).length;
        const percentile = vals.length >= 60 ? Math.round((below / vals.length) * 100) : null;

        // 0.05%p 미만 변화는 잡음으로 본다 (일간 변동폭 실측이 0.01~0.04 수준)
        const regime: CreditSpread["regime"] =
            change20d == null || Math.abs(change20d) < 0.05 ? "STABLE"
                : change20d > 0 ? "WIDENING" : "TIGHTENING";

        return { value: cur.v, date: cur.date, change20d, percentile, regime };
    } catch {
        return null;
    }
}

/** 20거래일 종가 시계열 — 이미 Redis 에 적재된 것을 읽는다 (API 콜 0) */
export async function getCloseHistory(
    ticker: string
): Promise<{ dates: string[]; closes: number[] } | null> {
    const hist = await loadEodHistory();
    if (!hist) return null;
    const row = (hist as any).closes?.[ticker.toUpperCase()];
    if (!Array.isArray(row) || row.length < 5) return null;
    const closes = row.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0);
    return closes.length >= 5 ? { dates: (hist as any).dates || [], closes } : null;
}

// ─────────────────────────────────────────────────────────────
// 5) 티커 레퍼런스
//    Massive: /v3/reference/tickers/{T} → { results: {...} }
// ─────────────────────────────────────────────────────────────

export async function getTickerDetails(ticker: string): Promise<any> {
    const sym = ticker.toUpperCase();
    const c = await callIntrinio(`companies/${sym}`);

    return {
        status: "OK",
        request_id: `intrinio-ref-${sym}`,
        results: {
            ticker: sym,
            name: c?.name ?? c?.legal_name ?? sym,
            market: "stocks",
            locale: "us",
            primary_exchange: c?.stock_exchange ?? null,
            type: "CS",
            active: true,
            currency_name: "usd",
            cik: c?.cik ?? null,
            description: c?.short_description ?? c?.long_description ?? null,
            sic_code: c?.sic ?? null,
            sic_description: c?.industry_category ?? null,
            homepage_url: c?.business_address ? null : (c?.web_site ?? null),
            total_employees: num(c?.employees),
            list_date: c?.first_stock_price_date ?? null,
            share_class_shares_outstanding: null,
            weighted_shares_outstanding: null,
        },
    };
}

// ─────────────────────────────────────────────────────────────
// 6) 전체 시장 스냅샷 / 상승·하락 상위
//    Massive: /v2/snapshot/locale/us/markets/stocks/tickers
//             /v2/snapshot/locale/us/markets/stocks/{gainers|losers}
//    → { status, tickers: [...] }
//
//    Intrinio: securities/snapshots → S3 CSV (전 종목 EOD)
// ─────────────────────────────────────────────────────────────

/**
 * [설계] Intrinio 에는 Massive 의 grouped-aggs(전 종목 일봉) 대응이 REST 로 없다.
 * 대신 두 소스를 쓴다.
 *
 *  A) `securities/snapshots`  — S3 CSV(약 0.5MB, 15분 갱신)
 *     컬럼: SYMBOL, TRADE PRICE, TRADE SIZE, TOTAL TRADE VOLUME, LAST TRADE TIMESTAMP,
 *           TRADE HIGH PRICE, TRADE LOW PRICE, ASK PRICE, ASK SIZE, LAST ASK TIMESTAMP,
 *           BID PRICE, BID SIZE, LAST BID TIMESTAMP, INTRINIO ID
 *     → 현재가/당일 고저/거래량. **전일 종가·시가가 없어 등락률 계산 불가.**
 *
 *  B) `bulk_downloads/links` → "US Stock Prices" ZIP(약 3.5MB → 26MB CSV, 일간 갱신)
 *     컬럼: TICKER, DATE, OPEN, HIGH, LOW, CLOSE, VOLUME, CHANGE, PERCENT_CHANGE,
 *           FIFTY_TWO_WEEK_HIGH/LOW ...
 *     → **등락률이 이미 계산되어 있음.** movers/전 종목 일봉의 정본.
 *
 * 장중 실시간성이 필요하면 A 의 현재가로 B 의 종가를 덮어쓴다.
 */

export interface EodRow { ticker: string; date: string; o: number; h: number; l: number; c: number; v: number; chg: number; chgPct: number; }

let _eodCache: { at: number; date: string; prevDate: string; rows: Map<string, EodRow> } | null = null;
let _snapCache: { at: number; rows: Map<string, { last: number; high: number; low: number; vol: number; bid?: number; ask?: number }> } | null = null;
const EOD_TTL_MS = 30 * 60 * 1000;       // 30m (Redis 재조회 주기)
/** 호가 미드를 «가격»으로 받아들일 최대 스프레드(%). 넘으면 시장이 없는 것으로 본다. */
const MAX_QUOTE_SPREAD_PCT = 1;
const SNAP_TTL_MS = 5 * 60 * 1000;       // 5m

/**
 * Redis 키 — Lambda(`signum-intrinio-eod`)가 하루 1회 채운다.
 * 전 종목을 티커별 키로 쪼개지 않고 **단일 키 1개**에 압축 저장한다.
 * (Upstash 는 요청당 과금 → 호출 수를 1회로 고정. 실제 저장소는 ElastiCache.)
 */
export const EOD_SNAPSHOT_KEY = "intrinio:eod:snapshot";
/** 다일치 종가 행렬 (EC2 적재기가 같이 채운다) — 17거래일 grouped 를 요구하는 소비처용 */
export const EOD_HISTORY_KEY = "intrinio:eod:history";

/**
 * B) 벌크 EOD — **EC2 ElastiCache 우선, Upstash 는 폴백**
 *
 * [왜 이 구조인가]
 *  1. Intrinio 벌크는 **27개 ZIP 으로 분할**(총 약 95MB, 약 27,000 종목).
 *     Vercel 서버리스가 매 요청마다 받는 것은 불가능 → Lambda 가 하루 1회 수집.
 *  2. 저장소는 **ElastiCache**(VPC 내부, ~2ms, 추가 비용 $0).
 *     Upstash 는 요청당 과금이므로 폴백으로만 쓰고, 그마저 **단일 키 1회 조회**로 고정한다.
 *     (기존 flow-accumulator 가 검증한 경로와 동일 — INFRASTRUCTURE_MAP §4.7)
 *  3. 프로세스 메모리에 30분 캐시 → 실제 Redis 호출은 인스턴스당 시간당 2회 수준.
 *
 * 비어 있으면 빈 Map 을 반환한다. 호출부는 유니버스 폴백으로 동작해야 한다.
 */
async function loadBulkEod(): Promise<{ date: string; prevDate: string; rows: Map<string, EodRow> }> {
    if (_eodCache && Date.now() - _eodCache.at < EOD_TTL_MS) {
        return { date: _eodCache.date, prevDate: _eodCache.prevDate, rows: _eodCache.rows };
    }

    const payload = (await readEodFromElastiCache()) ?? (await readEodFromUpstash());
    if (!payload?.date || !Array.isArray(payload.rows)) {
        return { date: "", prevDate: "", rows: new Map() };
    }

    const rows = new Map<string, EodRow>();
    for (const r of payload.rows) {
        // 저장 포맷: [ticker, o, h, l, c, v, chg, chgPct] — JSON 크기 최소화
        if (!Array.isArray(r) || r.length < 8) continue;
        const [ticker, o, h, l, c, v, chg, chgPct] = r;
        if (typeof ticker !== "string" || !(Number(c) > 0)) continue;
        rows.set(ticker, {
            ticker, date: payload.date,
            o: Number(o) || 0, h: Number(h) || 0, l: Number(l) || 0,
            c: Number(c), v: Number(v) || 0,
            chg: Number(chg) || 0, chgPct: Number(chgPct) || 0,
        });
    }

    // ── 벤더 벌크가 T+1 이라 최신 세션이 빠져 있으면 우리 캡처로 메운다 ★ ──
    //
    // 2026-08-29(토) 실측: 벌크 최신 거래일 2026-08-27 → **금요일 장이 통째로 없었다.**
    // 그러면 EOD 가 전부 stale 로 판정되고, 시간외 호가는 스프레드 게이트에
    // 13,064 중 1,212 만 통과해 Market Breadth 가 0↑0↓, 가디언 섹터 16개 중
    // 9개가 구성종목 0개가 된다. 즉 **금요일 마감 후 30시간 넘게** 시장 지표가 비었다.
    //
    // scripts/intrinio-session-close.js 가 15:57 ET 에 우리 계정으로 직접 찍어 둔
    // 종가를 여기서 «최신 거래일»로 얹는다. 벌크가 따라잡으면 자동으로 무시된다
    // (sc.date <= payload.date 가 되므로).
    let outDate = payload.date;
    let outPrevDate = payload.prevDate || "";
    try {
        const sc = await readSessionClose();
        if (sc?.date && sc.date > payload.date && sc.rows) {
            let merged = 0;
            for (const [sym, v] of Object.entries(sc.rows)) {
                const close = Number((v as any[])[0]);
                const vol = Number((v as any[])[1]) || 0;
                if (!(close > 0)) continue;
                const prev = rows.get(sym);
                // 직전 종가는 벌크의 최신 종가다 (없으면 등락을 만들지 않는다)
                const prevClose = prev?.c ?? 0;
                rows.set(sym, {
                    ticker: sym, date: sc.date,
                    o: prev?.o ?? 0, h: prev?.h ?? 0, l: prev?.l ?? 0,
                    c: close, v: vol,
                    chg: prevClose > 0 ? close - prevClose : 0,
                    chgPct: prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0,
                });
                merged++;
            }
            if (merged > 0) {
                outPrevDate = payload.date;   // 벌크의 최신일이 이제 «전일»이 된다
                outDate = sc.date;
                console.log(`[Intrinio] 세션종가 병합: ${sc.date} ${merged}종목 (벌크 ${payload.date} 위에)`);
            }
        }
    } catch { /* 캡처가 없으면 기존 동작 그대로 — 폴백이 화면을 더 나쁘게 만들면 안 된다 */ }

    _eodCache = { at: Date.now(), date: outDate, prevDate: outPrevDate, rows };
    return { date: outDate, prevDate: outPrevDate, rows };
}

/** 우리가 직접 찍은 세션 종가 (scripts/intrinio-session-close.js) */
async function readSessionClose(): Promise<{ date: string; rows: Record<string, number[]> } | null> {
    const proxy = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
    const key = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || "signum-redis-proxy-2026";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
        const res = await fetch(`${proxy}/get?key=intrinio:eod:sessionclose`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: controller.signal,
            cache: "no-store",
        });
        if (!res.ok) return null;
        const raw = await res.json();
        const val = raw?.result;
        const parsed = typeof val === "string" ? safeJson(val) : val;
        return parsed?.date && parsed?.rows ? parsed : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

interface EodPayload { date: string; prevDate?: string; rows: any[][]; _ts?: number }

/** 1순위: EC2 Redis Proxy → ElastiCache (비용 $0) */
async function readEodFromElastiCache(): Promise<EodPayload | null> {
    const proxy = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
    const key = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || "signum-redis-proxy-2026";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
        const res = await fetch(`${proxy}/get?key=${encodeURIComponent(EOD_SNAPSHOT_KEY)}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: controller.signal,
            cache: "no-store",
        });
        if (!res.ok) return null;
        const raw = await res.json();
        const val = raw?.result;
        const parsed = typeof val === "string" ? safeJson(val) : val;
        return parsed?.date ? (parsed as EodPayload) : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** 2순위 폴백: Upstash (단일 키 1회 조회) */
async function readEodFromUpstash(): Promise<EodPayload | null> {
    try {
        if (!process.env.UPSTASH_REDIS_REST_URL) return null;
        const { Redis } = await import("@upstash/redis");
        const redis = Redis.fromEnv();
        const val = await redis.get<any>(EOD_SNAPSHOT_KEY);
        const parsed = typeof val === "string" ? safeJson(val) : val;
        return parsed?.date ? (parsed as EodPayload) : null;
    } catch (e) {
        console.warn("[Intrinio] Upstash EOD 폴백 실패:", (e as any)?.message || e);
        return null;
    }
}

interface EodHistory { dates: string[]; closes: Record<string, number[]> }
let _histCache: { at: number; data: EodHistory | null } | null = null;

/** 20거래일 종가 행렬을 ElastiCache 에서 읽는다 (30분 메모리 캐시) */
async function loadEodHistory(): Promise<EodHistory | null> {
    if (_histCache && Date.now() - _histCache.at < EOD_TTL_MS) return _histCache.data;
    const proxy = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
    const key = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || "signum-redis-proxy-2026";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${proxy}/get?key=${encodeURIComponent(EOD_HISTORY_KEY)}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: controller.signal,
            cache: "no-store",
        });
        if (!res.ok) return null;
        const raw = await res.json();
        const val = typeof raw?.result === "string" ? safeJson(raw.result) : raw?.result;
        const data = Array.isArray(val?.dates) && val?.closes ? (val as EodHistory) : null;
        _histCache = { at: Date.now(), data };
        return data;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function safeJson(s: string): any {
    try { return JSON.parse(s); } catch { return null; }
}

/**
 * 벌크 ZIP 27개를 직접 받아 파싱한다. **Lambda/EC2 전용** — Vercel 에서 호출 금지.
 * `scripts/lambda-intrinio-eod` 가 이 함수를 참조 구현으로 삼는다.
 */
export async function fetchBulkEodDirect(
    opts: { tickerFilter?: Set<string>; maxFiles?: number } = {}
): Promise<{ date: string; rows: Map<string, EodRow> }> {
    const meta = await callIntrinio("bulk_downloads/links", {}, undefined, 60000);
    const item = (meta?.bulk_downloads || []).find((b: any) =>
        String(b?.name || "").includes("Stock Prices")
    );
    const links: any[] = item?.links || [];
    if (!links.length) return { date: "", rows: new Map() };

    const targets = opts.maxFiles ? links.slice(0, opts.maxFiles) : links;
    const all = new Map<string, EodRow>();
    let latest = "";

    // 순차 처리 — 메모리 피크를 낮춘다 (파일당 26MB CSV)
    for (const link of targets) {
        try {
            const res = await fetch(link.url, { cache: "no-store" });
            if (!res.ok) continue;
            const csv = await unzipSingleEntry(Buffer.from(await res.arrayBuffer()));
            if (!csv) continue;
            const part = parseBulkCsv(csv, opts.tickerFilter);
            if (part.date > latest) latest = part.date;
            for (const [k, v] of part.rows) all.set(k, v);
        } catch (e) {
            console.warn(`[Intrinio] 벌크 파일 실패: ${link.name}`, (e as any)?.message);
        }
    }

    // 파일마다 최신일이 다를 수 있으므로 최종 latest 로 재필터
    const rows = new Map<string, EodRow>();
    for (const [k, v] of all) if (v.date === latest) rows.set(k, v);

    return { date: latest, rows };
}

/** 벌크 CSV 한 덩어리 파싱 (최신 거래일 행만) */
export function parseBulkCsv(
    csv: string,
    tickerFilter?: Set<string>
): { date: string; rows: Map<string, EodRow> } {
    const lines = csv.split("\n");
    if (lines.length < 2) return { date: "", rows: new Map() };

    const H = csvHeaderIndex(lines[0]);
    const iT = H.get("TICKER") ?? -1, iD = H.get("DATE") ?? -1,
        iO = H.get("OPEN") ?? -1, iH = H.get("HIGH") ?? -1, iL = H.get("LOW") ?? -1,
        iC = H.get("CLOSE") ?? -1, iV = H.get("VOLUME") ?? -1,
        iCh = H.get("CHANGE") ?? -1, iPc = H.get("PERCENT_CHANGE") ?? -1;
    if (iT < 0 || iD < 0 || iC < 0) return { date: "", rows: new Map() };

    const maxIx = Math.max(iT, iD, iO, iH, iL, iC, iV, iCh, iPc);

    // 1패스: 파싱 + 최신 거래일 판정.
    // 날짜는 ISO 형식 검증을 통과한 값만 후보로 삼는다(밀린 행 방어).
    const parsed: string[][] = [];
    let latest = "";
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.length < 10) continue;
        const cols = parseCsvLine(line);
        if (cols.length <= maxIx) continue;
        const date = cols[iD];
        if (!ISO_DATE.test(date)) continue;
        parsed.push(cols);
        if (date > latest) latest = date;
    }

    // 2패스: 최신 거래일 행만 수집
    const rows = new Map<string, EodRow>();
    for (const cols of parsed) {
        if (cols[iD] !== latest) continue;
        const ticker = cols[iT].toUpperCase();
        if (!ticker || rows.has(ticker)) continue;
        if (tickerFilter && !tickerFilter.has(ticker)) continue;
        const c = Number(cols[iC]);
        if (!Number.isFinite(c) || c <= 0) continue;
        rows.set(ticker, {
            ticker, date: latest,
            o: Number(cols[iO]) || 0,
            h: Number(cols[iH]) || 0,
            l: Number(cols[iL]) || 0,
            c,
            v: Number(cols[iV]) || 0,
            chg: Number(cols[iCh]) || 0,
            // Intrinio PERCENT_CHANGE 는 소수(0.0168 = 1.68%)
            chgPct: (Number(cols[iPc]) || 0) * 100,
        });
    }

    return { date: latest, rows };
}

/** ZIP 단일 엔트리 해제 (Node zlib inflateRaw, deflate/stored 지원) */
async function unzipSingleEntry(buf: Buffer): Promise<string | null> {
    try {
        const zlib = await import("zlib");
        // Local File Header: PK\x03\x04
        if (buf.readUInt32LE(0) !== 0x04034b50) return null;
        const method = buf.readUInt16LE(8);
        const nameLen = buf.readUInt16LE(26);
        const extraLen = buf.readUInt16LE(28);
        const start = 30 + nameLen + extraLen;

        // Central Directory 에서 압축 크기 확보 (streaming 헤더는 0 일 수 있음)
        let compSize = buf.readUInt32LE(18);
        if (!compSize) {
            const cdIdx = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
            if (cdIdx > 0) compSize = buf.readUInt32LE(cdIdx + 20);
        }
        const body = compSize ? buf.subarray(start, start + compSize) : buf.subarray(start);

        if (method === 0) return body.toString("utf8");
        return await new Promise<string>((resolve, reject) => {
            zlib.inflateRaw(body, (err, out) =>
                err ? reject(err) : resolve(out.toString("utf8"))
            );
        });
    } catch {
        return null;
    }
}

/** A) 실시간 스냅샷 CSV — 현재가/고저/거래량 */
async function loadRealtimeSnapshot(): Promise<Map<string, { last: number; high: number; low: number; vol: number; bid?: number; ask?: number }>> {
    if (_snapCache && Date.now() - _snapCache.at < SNAP_TTL_MS) return _snapCache.rows;

    const meta = await callIntrinio("securities/snapshots");
    const file = meta?.snapshots?.[0]?.files?.[0];
    const rows = new Map<string, { last: number; high: number; low: number; vol: number; bid?: number; ask?: number }>();
    if (!file?.url) return rows;

    const res = await fetch(file.url, { cache: "no-store" });
    if (!res.ok) return rows;

    let text: string;
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw[0] === 0x1f && raw[1] === 0x8b) {
        const zlib = await import("zlib");
        text = await new Promise<string>((resolve, reject) =>
            zlib.gunzip(raw, (e, out) => (e ? reject(e) : resolve(out.toString("utf8"))))
        );
    } else {
        text = raw.toString("utf8");
    }

    const lines = text.split("\n");
    if (lines.length < 2) return rows;

    const H = csvHeaderIndex(lines[0]);
    const iS = H.get("SYMBOL") ?? -1,
        iP = H.get("TRADE PRICE") ?? -1,
        iV = H.get("TOTAL TRADE VOLUME") ?? -1,
        iH = H.get("TRADE HIGH PRICE") ?? -1,
        iL = H.get("TRADE LOW PRICE") ?? -1,
        iA = H.get("ASK PRICE") ?? -1,
        iB = H.get("BID PRICE") ?? -1;
    if (iS < 0) return rows;
    const maxIx = Math.max(iS, iP, iV, iH, iL, iA, iB);

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const cols = parseCsvLine(line);
        if (cols.length <= maxIx) continue;
        const sym = cols[iS].toUpperCase();
        if (!sym) continue;

        // ⚠️ Startup 플랜에서는 TRADE PRICE / HIGH / LOW / TIMESTAMP 가 **전부 빈 칸**이다.
        //    (체결 데이터는 상위 라이선스, 이 CSV 는 NBBO 호가만 채워 준다.)
        //    2026-08-29 실측:
        //      NVDA,,,194772757,,,,217.910,1,…,217.900,196,…   ← trade 열 공백, ask/bid 존재
        //    `last = TRADE PRICE` 로만 읽으면 항상 0 → 전 종목이 장중에도 EOD 종가에
        //    고정되고, Market Breadth 가 «어제 등락»을 오늘로 표시한다.
        //    → 체결가가 없으면 **호가 미드**로 대체한다 (실측 미드 217.905 vs 실제 217.91).
        const trade = Number(cols[iP]) || 0;
        const ask = iA >= 0 ? Number(cols[iA]) || 0 : 0;
        const bid = iB >= 0 ? Number(cols[iB]) || 0 : 0;

        // ⚠️ 미드는 **스프레드가 좁을 때만** 가격의 대용이 된다.
        //    2026-08-29 시간외 실측 (13,064종목):
        //      NVDA  bid 217.90 / ask 217.92 → 0.01%   ← 신뢰 가능
        //      EBMT  bid  22.56 / ask  43.95 → 64.3%   ← 미드 33.25 는 무의미
        //      BEPI  bid  15.92 / ask  31.70 → 66.3%   ← 미드 23.81 은 무의미
        //    분포: ≤1% 1,212종목 / >20% 5,002종목.
        //    게이트 없이 미드를 쓰면 movers 상위가 «가짜 급등» 으로 뒤덮인다
        //    (실제로 EBMT +48%, BEPI +49% 가 상위에 올라왔다).
        const midRaw = ask > 0 && bid > 0 ? (ask + bid) / 2 : 0;
        const spreadPct = midRaw > 0 ? ((ask - bid) / midRaw) * 100 : Infinity;
        const mid = midRaw > 0 && spreadPct >= 0 && spreadPct <= MAX_QUOTE_SPREAD_PCT ? midRaw : 0;

        rows.set(sym, {
            last: trade > 0 ? trade : mid,
            high: Number(cols[iH]) || 0,
            low: Number(cols[iL]) || 0,
            vol: Number(cols[iV]) || 0,
            bid, ask,
        });
    }

    _snapCache = { at: Date.now(), rows };
    return rows;
}

/** EOD + 실시간 스냅샷 병합 → Massive 스냅샷 티커 배열 */
/**
 * 현재 미국장 «거래일»(ET). 주말이면 직전 금요일.
 * 벌크 EOD 가 T+1 로 하루 늦게 게시되므로, 이 날짜와 비교해
 * EOD 종가가 «오늘 종가»인지 «전일 종가»인지를 판정해야 한다.
 */
function currentEtTradingDate(): string {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    // 04:00 ET 이전은 아직 전 거래일로 취급 (프리마켓 시작 전)
    if (et.getHours() < 4) et.setDate(et.getDate() - 1);
    while (et.getDay() === 0 || et.getDay() === 6) et.setDate(et.getDate() - 1);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${et.getFullYear()}-${p(et.getMonth() + 1)}-${p(et.getDate())}`;
}

async function buildMarketTickers(): Promise<any[]> {
    const [{ rows: eod, date: eodDate }, snap] = await Promise.all([
        loadBulkEod(),
        loadRealtimeSnapshot().catch(() => new Map()),
    ]);

    // ⚠️ 하루 어긋남 방어 — 2026-08-29 실측으로 확인한 실제 버그.
    //    벌크 EOD 최신일은 8/27 인데 8/28 장은 이미 끝나 있었다(T+1 게시).
    //    그런데 코드는 항상 `prevClose = c - chg`(= 8/26 종가)로 계산해서
    //    등락률이 **한 세션 어긋난 값**이 되고 있었다.
    //
    //      EOD 날짜 == 현재 거래일  →  c 는 «오늘» 종가  →  prevClose = c - chg
    //      EOD 날짜 <  현재 거래일  →  c 는 «전일» 종가  →  prevClose = c
    const eodIsStale = !!eodDate && eodDate < currentEtTradingDate();

    const out: any[] = [];
    for (const [ticker, e] of eod.entries()) {
        const s = snap.get(ticker);
        const live = s && s.last > 0 ? s.last : null;

        const prevClose = eodIsStale ? e.c : e.c - e.chg;

        // EOD 가 뒤처져 있는데 실시간가도 없으면 «오늘» 값을 만들 수 없다.
        // 이때 e.chgPct(어제 등락)를 쓰면 Market Breadth 가 어제 장을 오늘로
        // 표시한다 — 조용히 틀린 숫자가 가장 위험하므로 그 종목은 버린다.
        if (eodIsStale && !live) continue;

        const last = live ?? e.c;
        const change = prevClose > 0 ? last - prevClose : e.chg;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : e.chgPct;

        out.push({
            ticker,
            todaysChange: Math.round(change * 10000) / 10000,
            todaysChangePerc: Math.round(changePct * 10000) / 10000,
            updated: Date.now() * 1e6,
            day: bar(e.o, s?.high || e.h, s?.low || e.l, last, s?.vol || e.v),
            prevDay: bar(0, 0, 0, prevClose > 0 ? prevClose : e.c, 0),
            lastTrade: { p: last, s: 0, t: Date.now() * 1e6, c: [] },
            min: bar(e.o, s?.high || e.h, s?.low || e.l, last, s?.vol || e.v),
            // 다크풀 대체 — 스프레드 기반 유동성
            spreadPct: (() => {
                const sp = spreadPctOf(s?.bid ?? null, s?.ask ?? null);
                return sp == null ? null : Math.round(sp * 10000) / 10000;
            })(),
            liquidityScore: liquidityScoreFromSpread(spreadPctOf(s?.bid ?? null, s?.ask ?? null)),
            _eodDate: e.date,
        });
    }
    return out;
}

/**
 * 유동성 점수 (0~100) — 다크풀 자리를 대체하는 지표
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 이걸 골랐나]  다크풀은 현재 플랜에 틱이 없어 측정 불가다.
 *   대체 후보를 **전부 실측해서** 골랐다(2026-08-29):
 *
 *   | 후보 | 측정 결과 | 판정 |
 *   |---|---|---|
 *   | 평균 체결 규모 배수 | 0.95~1.17x · 가격 이벤트 미추적 | ✗ 신호 약함 |
 *   | 거래소 점유율 | CV 10~17% · 이벤트 연동 | △ 라벨 오해 위험 |
 *   | **호가 스프레드** | 종목 간 **28배** 차이 (SPY 0.003% ~ AEHR 0.257%) | ✓ 채택 |
 *
 *   스프레드는 트레이딩 데스크가 실제로 보는 지표다. 좁으면 «큰 물량을
 *   가격 충격 없이 소화할 수 있다», 넓으면 «시장이 얇다».
 *   다크풀이 답하려던 «기관이 여기서 편하게 거래할 수 있나»에 직접 답한다.
 *
 * [설계]  스프레드는 자릿수 단위로 벌어지므로 **로그 스케일**로 정규화한다.
 *   0.001% → 100점 · 0.01% → 67 · 0.1% → 33 · 1.0% → 0
 *
 *   실측 대입:
 *     SPY  0.003% → 84   NVDA 0.009% → 68   AAPL 0.012% → 64
 *     COIN 0.085% → 36   AEHR 0.257% → 20
 *
 * [정직성]  스프레드를 못 구하면 **null** 이다. 0 도 50 도 아니다.
 */
export function liquidityScoreFromSpread(spreadPct: number | null): number | null {
    if (spreadPct == null || !Number.isFinite(spreadPct) || spreadPct <= 0) return null;
    const BEST = 0.001;   // 0.001% 이하는 만점
    const WORST = 1.0;    // 1% 이상은 0점
    const clamped = Math.min(Math.max(spreadPct, BEST), WORST);
    const ratio = Math.log10(clamped / BEST) / Math.log10(WORST / BEST);
    return Math.round(Math.max(0, Math.min(100, 100 - ratio * 100)));
}

/**
 * 유동성 점수는 **정규장 지표**다.
 *
 * ⚠️ 2026-08-29 실측: 휴장 중 호가는 벌어진다.
 *      정규장  NVDA 0.009% · AAPL 0.012% · GOOGL 0.011%
 *      휴장중  NVDA 0.064% · AAPL 0.150% · GOOGL 2.009%(→0점)
 *    휴장 중 호가로 «유동성»을 재면 전 종목이 나쁘게 나온다 — 거짓이다.
 *    breadth 와 같은 규칙: 정규장이 아니면 **직전 정규장 판독값**을 쓰고,
 *    그것도 없으면 null 이다.
 *    (직전 정규장 값은 EC2 가 하루 1회 분봉 중앙값으로 적재한다 —
 *     한 시점 호가보다 390봉 중앙값이 «유동성 품질»의 정본에 가깝다)
 */
function isRegularSessionEt(): boolean {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    if (et.getDay() === 0 || et.getDay() === 6) return false;
    const m = et.getHours() * 60 + et.getMinutes();
    return m >= 570 && m < 960;
}

/** EC2 가 적재한 «직전 정규장» 유동성 (종목 → 점수) */
export const LIQUIDITY_KEY = "intrinio:liquidity:lastreg";
let _liqCache: { at: number; rows: Record<string, { s: number; q: number }> } | null = null;

async function loadLastRegLiquidity(): Promise<Record<string, { s: number; q: number }>> {
    if (_liqCache && Date.now() - _liqCache.at < EOD_TTL_MS) return _liqCache.rows;
    const proxy = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
    const key = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || "signum-redis-proxy-2026";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
        const res = await fetch(`${proxy}/get?key=${encodeURIComponent(LIQUIDITY_KEY)}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: controller.signal, cache: "no-store",
        });
        if (!res.ok) return {};
        const raw = await res.json();
        const val = typeof raw?.result === "string" ? safeJson(raw.result) : raw?.result;
        const rows = val?.rows && typeof val.rows === "object" ? val.rows : {};
        _liqCache = { at: Date.now(), rows };
        return rows;
    } catch {
        return {};
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 세션을 고려한 유동성 점수.
 *  정규장 → 실시간 호가로 계산
 *  그 외   → EC2 가 적재한 직전 정규장 중앙값 (없으면 null)
 */
export async function sessionAwareLiquidity(
    ticker: string,
    liveBid: number | null,
    liveAsk: number | null
): Promise<{ liquidityScore: number | null; spreadPct: number | null; asOf: "live" | "lastReg" | null }> {
    if (isRegularSessionEt()) {
        const sp = spreadPctOf(liveBid, liveAsk);
        const sc = liquidityScoreFromSpread(sp);
        if (sc != null) return { liquidityScore: sc, spreadPct: sp == null ? null : Math.round(sp * 10000) / 10000, asOf: "live" };
    }
    const rows = await loadLastRegLiquidity();
    const hit = rows[ticker.toUpperCase()];
    if (hit && Number.isFinite(hit.s)) {
        return { liquidityScore: hit.s, spreadPct: Number.isFinite(hit.q) ? hit.q : null, asOf: "lastReg" };
    }
    return { liquidityScore: null, spreadPct: null, asOf: null };
}

/** bid/ask 에서 스프레드(%) — 둘 다 있어야 한다 */
export function spreadPctOf(bid: number | null, ask: number | null): number | null {
    if (bid == null || ask == null || !(bid > 0) || !(ask > 0) || ask < bid) return null;
    const mid = (bid + ask) / 2;
    if (!(mid > 0)) return null;
    return ((ask - bid) / mid) * 100;
}

/** 개별 realtime 조회로 스냅샷 티커 배열을 만든다 (소수 종목 폴백용) */
async function buildTickersDirect(tickers: string[]): Promise<any[]> {
    // 동시 요청은 나눠서 — 150종목을 한꺼번에 던지면 분당 한도(2,000)를 순간적으로 밀어낸다
    const CHUNK = 25;
    const out: any[] = [];
    for (let i = 0; i < tickers.length; i += CHUNK) {
        const settled = await Promise.allSettled(
            tickers.slice(i, i + CHUNK).map(async (t) => {
                const snap = await getTickerSnapshot(t);
                return snap?.ticker || null;
            })
        );
        for (const r of settled) {
            if (r.status === "fulfilled" && r.value) out.push(r.value);
        }
    }
    return out;
}

/** 다중 종목 스냅샷 폴백 임계치 — 이 이하면 처음부터 개별 조회 (분당 2,000 호출 한도 고려) */
const DIRECT_SNAPSHOT_MAX = 30;

/**
 * «벌크에서 빠진 종목» 개별 보완의 상한.
 *
 * ★ [2026-08-29] 왜 30 이 아니라 따로 크게 두는가
 *   벌크 EOD 는 벤더가 T+1 로 게시한다. 토요일 실측: 벌크 최신 거래일이
 *   **2026-08-27** 이라 금요일 장이 통째로 없었다. 이때 시간외 호가로는
 *   스프레드 1% 게이트를 통과하는 종목이 13,064 중 1,212 뿐이라
 *   나머지는 `eodIsStale && !live` 로 탈락한다.
 *   그 결과 가디언 섹터 16개 중 **9개가 구성종목 0개**(에너지·금융·헬스케어…)
 *   가 되어 change/volume 이 0 으로 표시됐다.
 *
 *   요청 종목이 30을 넘는다는 이유로 보완을 아예 건너뛰고 있었다.
 *   섹터·워치리스트처럼 «명시된 종목 묶음»은 개별 조회로 메우는 게 맞다.
 *   (150종목 × 1콜, 캐시 5분 → 분당 30콜 수준. 한도 2,000/분 대비 무시)
 */
const DIRECT_BACKFILL_MAX = 150;

export async function getFullMarketSnapshotIntrinio(tickers?: string[]): Promise<any> {
    const want = tickers?.length
        ? [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))]
        : null;

    // 소수 종목이면 EOD 캐시를 기다리지 않고 바로 실시간 조회.
    // (Lambda 적재 전이거나 신규 상장 등 EOD 에 없는 종목도 커버)
    if (want && want.length > 0 && want.length <= DIRECT_SNAPSHOT_MAX) {
        const direct = await buildTickersDirect(want);
        if (direct.length) {
            return { status: "OK", count: direct.length, tickers: direct, _source: "intrinio-realtime" };
        }
    }

    const rows = await buildMarketTickers();
    const wantSet = want ? new Set(want) : null;
    let filtered = wantSet ? rows.filter((r) => wantSet.has(r.ticker)) : rows;

    // EOD 에서 못 찾은 종목은 개별 조회로 보완 (상한 DIRECT_BACKFILL_MAX)
    if (wantSet && filtered.length < wantSet.size && wantSet.size <= DIRECT_BACKFILL_MAX) {
        const have = new Set(filtered.map((r) => r.ticker));
        const missing = [...wantSet].filter((t) => !have.has(t));
        if (missing.length) {
            const extra = await buildTickersDirect(missing);
            filtered = [...filtered, ...extra];
            // 보완하고도 못 채운 종목은 «없음»이다 — 조용히 0 으로 만들지 않는다
            if (extra.length < missing.length) {
                console.warn(
                    `[Intrinio] 스냅샷 보완 ${extra.length}/${missing.length} — ` +
                    `미확보: ${missing.filter((t) => !extra.some((e: any) => e.ticker === t)).slice(0, 10).join(",")}`
                );
            }
        }
    }

    return { status: "OK", count: filtered.length, tickers: filtered, _source: "intrinio-eod" };
}

/**
 * Massive: /v3/reference/dividends 대응
 *
 * [발견] `securities/{t}/dividends` 는 404 지만, **`prices/adjustments` 에
 *        배당이 들어 있다**(2026-08-29 실측). 그래서 죽어 있던 배당 기능을
 *        되살릴 수 있다.
 *   AAPL 2026-08-10 $0.27 · MSFT $0.91 · KO $0.53 · JNJ $1.34 · TSLA 무배당
 *   분할도 같은 응답에 있다 (NVDA 2024-06-10 split_ratio 0.1 = 10:1)
 *
 * [한계] Intrinio 는 **배당락일만** 준다. 지급일·기준일·선언일은 없다.
 *        없는 값을 지어내지 않고 null 로 둔다 — 화면이 «미제공»으로 렌더한다.
 *        지급 주기(frequency)는 배당 간격의 중앙값에서 **유도**한다.
 */
export async function getDividendsIntrinio(ticker: string, limit = 16): Promise<any> {
    const sym = ticker.toUpperCase();
    const data = await callIntrinio(`securities/${sym}/prices/adjustments`, {
        page_size: String(Math.min(Math.max(limit * 4, 40), 200)),
    }).catch(() => null);

    const rows: any[] = data?.stock_price_adjustments || [];
    const divs = rows
        .filter((r) => num(r?.dividend) != null && Number(r.dividend) > 0 && ISO_DATE.test(String(r.date)))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    if (!divs.length) {
        return { status: "OK", count: 0, results: [], _source: "intrinio-adjustments" };
    }

    // 지급 주기 유도 — 간격의 중앙값(일) → 연 지급 횟수
    let frequency: number | null = null;
    if (divs.length >= 3) {
        const gaps: number[] = [];
        for (let i = 0; i < Math.min(divs.length - 1, 8); i++) {
            const g = (Date.parse(divs[i].date) - Date.parse(divs[i + 1].date)) / 86400000;
            if (g > 0) gaps.push(g);
        }
        if (gaps.length) {
            gaps.sort((a, b) => a - b);
            const med = gaps[Math.floor(gaps.length / 2)];
            if (med <= 10) frequency = 52;
            else if (med <= 45) frequency = 12;
            else if (med <= 120) frequency = 4;
            else if (med <= 250) frequency = 2;
            else frequency = 1;
        }
    }

    const results = divs.slice(0, limit).map((d) => ({
        cash_amount: Number(d.dividend),
        currency: d.dividend_currency || "USD",
        ex_dividend_date: String(d.date),
        // ⚠️ Intrinio 는 배당락일만 준다. 없는 날짜를 추정해 채우지 않는다.
        pay_date: null,
        record_date: null,
        declaration_date: null,
        frequency,
        dividend_type: "CD",
        ticker: sym,
    }));

    return {
        status: "OK",
        count: results.length,
        results,
        _source: "intrinio-adjustments",
        _note: "pay/record/declaration dates not provided by source",
    };
}

/** Massive: 주식 분할 이력 (같은 adjustments 응답에서) */
export async function getSplitsIntrinio(ticker: string, limit = 10): Promise<any> {
    const sym = ticker.toUpperCase();
    const data = await callIntrinio(`securities/${sym}/prices/adjustments`, { page_size: "200" }).catch(() => null);
    const rows: any[] = data?.stock_price_adjustments || [];
    const results = rows
        .filter((r) => num(r?.split_ratio) != null && Number(r.split_ratio) !== 1 && ISO_DATE.test(String(r.date)))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, limit)
        .map((r) => ({
            execution_date: String(r.date),
            // Intrinio split_ratio 0.1 = 10:1 분할 → Massive 는 split_from/split_to 로 표현
            split_from: 1,
            split_to: Math.round((1 / Number(r.split_ratio)) * 1000) / 1000,
            ticker: sym,
        }));
    return { status: "OK", count: results.length, results, _source: "intrinio-adjustments" };
}

/**
 * Massive: /v3/reference/options/contracts 대응
 *
 * Intrinio 의 `options/{ticker}` 계약 목록은 403(상위 플랜)이다.
 * 그러나 만기 목록 + EOD 체인은 열려 있으므로 **체인에서 계약을 역산**한다.
 * (현재 프로덕션 소비처는 없고 옵션 WS 가 꺼져 있지만, 명시적으로 라우팅해
 *  미래에 누가 이 경로를 쓸 때 죽은 벤더로 나가지 않게 한다)
 */
export async function getOptionContractsIntrinio(
    underlying: string,
    opts: { expirationGte?: string; limit?: number } = {}
): Promise<any> {
    const sym = underlying.toUpperCase();
    const limit = Math.min(opts.limit ?? 250, 1000);
    const after = opts.expirationGte || new Date().toISOString().slice(0, 10);

    const exp = await callIntrinio(`options/expirations/${sym}/eod`, { after }).catch(() => null);
    const expirations: string[] = ((exp?.expirations as string[]) || []).slice().sort().slice(0, 4);
    if (!expirations.length) return { status: "OK", count: 0, results: [] };

    const chains = await Promise.all(
        expirations.map((e) => callIntrinio(`options/chain/${sym}/${e}/eod`).catch(() => null))
    );

    const results: any[] = [];
    for (const ch of chains) {
        for (const row of (ch?.chain || [])) {
            const o = row.option || {};
            const type = String(o.type || "").toLowerCase();
            results.push({
                ticker: `O:${o.code || ""}`,
                underlying_ticker: sym,
                contract_type: type === "put" ? "put" : "call",
                expiration_date: o.expiration || null,
                strike_price: num(o.strike) ?? 0,
                shares_per_contract: 100,
                exercise_style: "american",
                primary_exchange: "OPRA",
            });
            if (results.length >= limit) break;
        }
        if (results.length >= limit) break;
    }
    return { status: "OK", count: results.length, results, _source: "intrinio-chain-derived" };
}

/**
 * Massive: /v3/reference/tickers (목록) 대응
 * EOD 스냅샷의 유니버스를 그대로 쓴다 — 종목당 호출이 필요 없다.
 */
export async function getTickerListIntrinio(opts: { limit?: number } = {}): Promise<any> {
    const { rows } = await loadBulkEod();
    const limit = Math.min(opts.limit ?? 1000, 5000);
    const results = [...rows.values()]
        .sort((a, b) => b.c * b.v - a.c * a.v)     // 달러거래량 내림차순
        .slice(0, limit)
        .map((e) => ({
            ticker: e.ticker,
            name: e.ticker,
            market: "stocks",
            locale: "us",
            active: true,
            currency_name: "usd",
            type: "CS",
        }));
    return { status: "OK", count: results.length, results, _source: "intrinio-eod-universe" };
}

/**
 * 13F 기관 보유 — Intrinio `securities/{t}/institutional_ownership`
 *
 * [왜 이관하나]  기존 `command/13f` 는 Massive `/stocks/filings/vX/13-F` 를
 *   폴백으로 쓴다. 그 벤더는 죽는다.
 *
 * [오히려 개선]  Intrinio 는 **직전 분기 대비 증감을 계산해서 준다** (실측):
 *   {"owner_name":"ADAMS DIVERSIFIED EQUITY FUND","period_ended":"2026-06-30",
 *    "value":219971472,"amount":760200,"previous_amount":767300,
 *    "amount_change":-7100,"amount_percent_change":-0.009253,
 *    "sole_voting_authority":760200, ...}
 *   기존 구현은 두 분기를 직접 받아 비교해야 했다.
 *
 * [한계]  filing_date 는 주지 않는다(period_ended 만). 지어내지 않고 null.
 */
export async function getInstitutionalOwnershipIntrinio(
    ticker: string,
    limit = 100
): Promise<any[]> {
    const sym = ticker.toUpperCase();
    const data = await callIntrinio(`securities/${sym}/institutional_ownership`, {
        page_size: String(Math.min(Math.max(limit, 10), 500)),
    }).catch(() => null);

    const rows: any[] = data?.ownership || [];
    return rows
        .filter((r) => num(r?.amount) != null && Number(r.amount) > 0)
        .map((r) => {
            const shares = Number(r.amount) || 0;
            const prev = num(r.previous_amount);
            const chg = num(r.amount_change);
            // ⚠️ 신규 편입 판정.
            //    실측에서 JPMORGAN 이 `amount_change: +449,404,578` 인데
            //    `amount_percent_change: 0` 으로 왔다. 직전 보유가 0 이라
            //    비율을 낼 수 없는 경우인데, 그대로 두면 화면에
            //    «전량 매수인데 0% 변화» 라는 모순이 나간다.
            //    → 비율은 null 로 두고 isNew 로 구분한다.
            const isNew = (prev == null || prev === 0) && chg != null && Math.abs(chg - shares) < 1;
            const pctRaw = num(r.amount_percent_change);
            return {
            owner_cik: String(r.owner_cik || ""),
            owner_name: String(r.owner_name || ""),
            period_ended: String(r.period_ended || ""),
            shares,
            market_value: num(r.value) ?? 0,
            previous_shares: isNew ? 0 : prev,
            shares_change: chg,
            isNewPosition: isNew,
            // Intrinio 는 소수(-0.009253 = -0.93%)로 준다.
            // 신규 편입은 비율이 정의되지 않는다 → null (0% 라고 주장하지 않는다)
            shares_change_pct: isNew || pctRaw == null
                ? null
                : Math.round(pctRaw * 100 * 10000) / 10000,
            sole_voting: num(r.sole_voting_authority),
            shared_voting: num(r.shared_voting_authority),
            no_voting: num(r.no_voting_authority),
            // Intrinio 미제공 — 추정하지 않는다
            filing_date: null,
            };
        });
}

/**
 * 내부자 거래 (SEC Form 4) — Intrinio
 *
 * [왜 이관하나]  기존 `insiderService.fetchForm4` 는 Massive
 *   `/stocks/filings/vX/form-4` 를 쓴다. 그 벤더는 죽는다.
 *
 * [오히려 개선]  Intrinio 는 **전역 피드가 실시간(0일전)** 이고
 *   거래별 상세가 완전하다(2026-08-29 실측):
 *     transaction_type_code       A(무상부여) · P(매수) · S(매도) · M(행사) …
 *     acquisition_disposition_code A / D
 *     amount_of_shares · transaction_price · total_shares_owned
 *     officer_title · director / officer / ten_percent_owner 플래그
 *     derivative_transaction      파생(옵션) 거래 여부 ← 실제 매수와 구분 가능
 *
 * [주의]  Intrinio 는 «거래 금액»을 주지 않는다 → shares × price 로 계산한다.
 *         무상부여(A)는 price 가 0 이므로 금액도 0 이다 — 이게 정상이다.
 *         («0 원어치 매수»가 아니라 «대가 없이 받음»이다)
 */
export async function getInsiderFilingsIntrinio(
    ticker: string,
    limit = 30
): Promise<any[]> {
    const sym = ticker.toUpperCase();
    const data = await callIntrinio(`companies/${sym}/insider_transaction_filings`, {
        page_size: String(Math.min(Math.max(limit, 10), 100)),
    }).catch(() => null);

    const filings: any[] = data?.transaction_filings || [];
    const out: any[] = [];

    for (const f of filings) {
        const ownerName = f?.owner?.owner_name || "Unknown";
        for (const t of (f.transactions || [])) {
            const shares = num(t.amount_of_shares) ?? 0;
            const price = num(t.transaction_price) ?? 0;
            const code = String(t.transaction_type_code || "").toUpperCase();

            // ⚠️ 거래 코드가 비어 있고 수량도 0 인 행은 **거래가 아니다.**
            //    Form 4 에는 «현재 보유 신고» 행이 섞여 온다(Table I/II 의 holding rows).
            //    이걸 그대로 세면 화면에 «거래 30건인데 매수 0 · 매도 0» 이라는
            //    모순이 나간다(2026-08-29 앱 실화면에서 확인).
            //    실측: NVDA 30건 중 17건이 이런 행이었다.
            if (!code && shares <= 0) continue;

            out.push({
                date: String(f.filing_date || "").slice(0, 10),
                transactionDate: String(t.transaction_date || f.filing_date || "").slice(0, 10),
                name: ownerName,
                title: t.officer_title
                    || (t.director ? "Director" : t.ten_percent_owner ? "10% Owner" : t.officer ? "Officer" : ""),
                isDirector: !!t.director,
                isOfficer: !!t.officer,
                isTenPctOwner: !!t.ten_percent_owner,
                code,
                shares,
                pricePerShare: price,
                // Intrinio 는 금액을 안 준다 — 주식수 × 단가
                value: Math.round(shares * price),
                acquired: String(t.acquisition_disposition_code || "").toUpperCase() === "A" ? "A" : "D",
                // Intrinio 미제공 — 지어내지 않는다
                is10b5: false,
                sharesAfter: num(t.total_shares_owned) ?? 0,
                filingUrl: String(f.filing_url || ""),
                // Massive 에 없던 것 — 파생(옵션) 거래인지 구분할 수 있다
                isDerivative: !!t.derivative_transaction,
                securityTitle: String(t.security_title || ""),
            });
        }
    }

    // 거래일 최신순
    return out
        .sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate)))
        .slice(0, limit);
}

export async function getMoversIntrinio(direction: "gainers" | "losers"): Promise<any> {
    const rows = await buildMarketTickers();
    // 노이즈 제거: 최소 거래량·가격
    const eligible = rows.filter(
        (r) => (r.day?.v ?? 0) >= 200000 && (r.lastTrade?.p ?? 0) >= 1 && r.todaysChangePerc !== 0
    );
    const sorted = [...eligible].sort((a, b) =>
        direction === "gainers"
            ? b.todaysChangePerc - a.todaysChangePerc
            : a.todaysChangePerc - b.todaysChangePerc
    );
    return { status: "OK", count: Math.min(sorted.length, 50), tickers: sorted.slice(0, 50) };
}

/**
 * Massive: /v2/aggs/grouped/locale/us/market/stocks/{date} 대응
 *
 * ⚠️ 예전 구현은 `_date` 를 **통째로 무시**하고 항상 최신 EOD 를 돌려줬다.
 *    그런데 `/api/market/movers` 는 «서로 다른 두 거래일»을 받아 등락률을 계산한다.
 *    같은 값을 두 번 받으면 prevClose == price → 등락률 전 종목 0% 가 된다.
 *    (2026-08-29 발견 — movers 가 전일 종가에 가짜 등락률을 붙여 내보내고 있었다.)
 *
 *    벌크 EOD 행에는 `chg`(전일 대비)가 들어 있으므로, 직전 거래일 종가는
 *    `c - chg` 로 저장량 증가 없이 복원할 수 있다. 그 두 날짜만 응답하고
 *    나머지 날짜는 빈 결과 → 호출부가 다른 날짜로 재시도하게 둔다.
 */
export async function getGroupedDailyIntrinio(reqDate: string): Promise<any> {
    const { date, prevDate, rows } = await loadBulkEod();
    if (!date) return { status: "OK", adjusted: true, queryCount: 0, resultsCount: 0, results: [] };

    const wantPrev = !!reqDate && !!prevDate && reqDate === prevDate;
    if (reqDate && reqDate !== date && !wantPrev) {
        // 최신 2일이 아니면 20거래일 종가 행렬에서 찾아 본다.
        // (`signum-xs` 는 17거래일치 grouped 를 요구한다 — 벌크 CSV 에 6개월치가
        //  들어 있으므로 적재기가 종가만 따로 모아 둔다)
        const hist = await loadEodHistory();
        const idx = hist?.dates.indexOf(reqDate) ?? -1;
        if (hist && idx >= 0) {
            const results = Object.entries(hist.closes)
                .map(([T, arr]) => ({ T, c: arr[idx] }))
                .filter((r) => r.c > 0)
                .map((r) => ({
                    T: r.T, t: dateToMs(reqDate),
                    // 이력은 종가만 보관한다 — o/h/l 은 종가로 대체(소비처는 c 만 쓴다)
                    o: r.c, h: r.c, l: r.c, c: r.c, v: 0, vw: r.c, n: 0,
                }));
            return {
                status: "OK", adjusted: true,
                queryCount: results.length, resultsCount: results.length,
                results, _eodDate: reqDate, _source: "intrinio-eod-history",
            };
        }
        // 보유하지 않은 날짜 — 빈 결과로 정직하게 응답한다.
        return {
            status: "OK", adjusted: true,
            queryCount: 0, resultsCount: 0, results: [],
            _eodDate: date, _requested: reqDate,
        };
    }

    const results = [...rows.values()].map((e) => {
        const close = wantPrev ? e.c - e.chg : e.c;
        return {
            T: e.ticker,
            t: dateToMs(wantPrev ? prevDate : e.date),
            // 직전 거래일은 종가만 복원 가능 — o/h/l 은 종가로 대체(소비처는 c 만 쓴다)
            o: wantPrev ? close : e.o,
            h: wantPrev ? close : e.h,
            l: wantPrev ? close : e.l,
            c: close,
            v: wantPrev ? 0 : e.v,
            vw: Math.round((wantPrev ? close : (e.h + e.l + e.c) / 3) * 10000) / 10000,
            n: 0,
        };
    }).filter((r) => r.c > 0);

    return {
        status: "OK",
        adjusted: true,
        queryCount: results.length,
        resultsCount: results.length,
        results,
        _eodDate: wantPrev ? prevDate : date,
    };
}

// ─────────────────────────────────────────────────────────────
// 7) 시장 상태 — Intrinio 미제공 → 미국 증시 캘린더 자체 계산
//    Massive: /v1/marketstatus/now
// ─────────────────────────────────────────────────────────────

/** 미국 증시 휴장일 (NYSE/NASDAQ). 필요 시 갱신. */
const US_MARKET_HOLIDAYS = new Set([
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
    "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

export function getMarketStatusIntrinio(): any {
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const y = et.getFullYear();
    const m = String(et.getMonth() + 1).padStart(2, "0");
    const d = String(et.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    const dow = et.getDay();
    const mins = et.getHours() * 60 + et.getMinutes();

    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = US_MARKET_HOLIDAYS.has(dateStr);

    let market: "open" | "closed" | "extended-hours" = "closed";
    if (!isWeekend && !isHoliday) {
        if (mins >= 570 && mins < 960) market = "open";              // 09:30–16:00
        else if ((mins >= 240 && mins < 570) || (mins >= 960 && mins < 1200))
            market = "extended-hours";                                // 04:00–09:30 / 16:00–20:00
    }

    return {
        market,
        serverTime: now.toISOString(),
        earlyAdjournment: false,
        exchanges: { nasdaq: market, nyse: market, otc: market },
        currencies: { fx: "open", crypto: "open" },
        _source: "intrinio-adapter-calendar",
    };
}

// ─────────────────────────────────────────────────────────────
// 8) 특정일 시가/종가
//    Massive: /v1/open-close/{T}/{date}
// ─────────────────────────────────────────────────────────────

export async function getOpenCloseIntrinio(ticker: string, date: string): Promise<any> {
    const sym = ticker.toUpperCase();
    const data = await callIntrinio(`securities/${sym}/prices`, {
        start_date: date,
        end_date: date,
        frequency: "daily",
        page_size: "1",
    });
    const r = data?.stock_prices?.[0];
    if (!r) return { status: "NOT_FOUND", symbol: sym, from: date };

    return {
        status: "OK",
        from: r.date,
        symbol: sym,
        open: num(r.open) ?? 0,
        high: num(r.high) ?? 0,
        low: num(r.low) ?? 0,
        close: num(r.close) ?? 0,
        volume: num(r.volume) ?? 0,
        // ★ [2026-08-29] 예전에는 여기서 이렇게 지어내고 있었다:
        //       afterHours: r.close   ·   preMarket: r.open
        //   Massive `/v1/open-close` 는 시간외/프리마켓을 **따로** 줬지만
        //   Intrinio 일봉에는 그 값이 없다. 정규장 종가·시가를 별칭으로 쓰면
        //   소비처가 그걸 시간외 가격으로 믿는다.
        //   실제로 `/api/live/ticker` 의 postPrice 가 정규장 종가가 되어
        //   **POST 등락률이 항상 0.00%** 였다(NVDA 실측: postPrice 217.55,
        //   실제 시간외 217.86 → +0.14%).
        //   없는 값은 지어내지 않고 null 로 둔다. 소비처는 스냅샷의
        //   afterHours/preMarket(실제 시간외 체결)로 폴백한다.
        afterHours: null,
        preMarket: null,
        _extendedUnavailable: "intrinio-daily-bar-has-no-extended-session",
    };
}

// ════════════════════════════════════════════════════════════════════════
// [2026-08-30] Massive 계정 해지(2026-09-23) 대비 — 남은 8종 이관
//
//   해지일까지 아직 살아 있어서(시세만 403 이었다) 화면에 아무 이상이 없다.
//   그래서 «다 됐다»고 착각하기 쉽다. 아래가 그 마지막 경로들이다.
//   판정기: `node scripts/check-massive-leftovers.js` → UNKNOWN 0 이면 완료.
// ════════════════════════════════════════════════════════════════════════

/** FRED 계열 경제지표 한 계열 — 최신순 [{date, value}] */
export async function getEconomicSeries(
    symbol: string,
    pageSize = 2
): Promise<{ date: string; value: number }[]> {
    try {
        const d = await callIntrinio(
            `indices/economic/${encodeURIComponent(symbol)}/historical_data/level`,
            { page_size: String(pageSize), sort_order: "desc" }
        );
        return (d?.historical_data || [])
            .map((r: any) => ({ date: String(r?.date || ""), value: Number(r?.value) }))
            .filter((r: any) => r.date && Number.isFinite(r.value));
    } catch {
        return [];
    }
}

/**
 * 국채 수익률 곡선 → Massive `/fed/v1/treasury-yields` 모양.
 *
 * Massive 는 만기별 컬럼을 한 행에 담아 줬다. Intrinio 는 만기마다 별도 계열이라
 * 7개를 병렬로 받아 **날짜로 다시 붙인다.**
 * 계열마다 최신일이 다를 수 있으므로(휴일·공표 지연) 날짜를 키로 합치고,
 * 없는 만기는 **null 로 둔다** — 0 으로 채우면 「금리 0%」라는 주장이 된다.
 */
const TREASURY_SERIES: Array<[string, string]> = [
    ["$DGS1MO", "yield_1_month"],
    ["$DGS3MO", "yield_3_month"],
    ["$DGS1", "yield_1_year"],
    ["$DGS2", "yield_2_year"],
    ["$DGS5", "yield_5_year"],
    ["$DGS10", "yield_10_year"],
    ["$DGS30", "yield_30_year"],
];

/**
 * 국채 곡선 «정본» — 미 재무부 원본(EC2 크론이 Redis 에 적재).
 *
 * ══════════════════════════════════════════════════════════════════════
 * FRED(DGS*)는 재무부 par yield 를 받아 게시하므로 **한 단계 늦다.**
 * 벤더 둘 다(Massive·Intrinio) 8/27 에서 멈춰 있었다 — 벤더 문제가 아니라
 * FRED 파이프라인의 구조적 지연이다. 원본을 직접 받으면 그 지연이 사라진다.
 *
 * 실측(2026-08-30, 마지막 거래일 8/28):
 *   재무부 원본  2Y 4.34 · 10Y 4.73 · 2s10s **0.39**   ← 맞는 값
 *   FRED 경유    2Y 4.20 · 10Y 4.67 · 2s10s 0.47       ← 하루 낡음
 *   화면에 떠 있던 값                     2s10s 0.52   ← 날짜를 섞어 만든 값
 *
 * 못 읽으면 null 을 돌려주고 호출부가 FRED 로 폴백한다 — 낡아도 없는 것보단 낫다.
 * 단 **나이 제한**을 둔다. 크론이 멎은 채 몇 주 지난 곡선을 「오늘의 금리」로
 * 내보내면 그게 더 나쁘다.
 */
const TREASURY_CURVE_KEY = "treasury:curve";
const TREASURY_MAX_AGE_DAYS = 7;

/**
 * FMP 국채 곡선 — 재무부 원본과 **값이 정확히 같고 1.1초**다.
 *
 * 재무부 CSV 는 18~20초라 요청 시점에 못 쓴다(그래서 크론으로 Redis 에 넣는다).
 * FMP 는 같은 데이터를 즉시 준다 → 크론과 크론 사이의 공백을 메우는 1순위.
 * 실측 대조(2026-08-30):
 *   FMP   8/28  2Y 4.34 · 10Y 4.73 · 30Y 5.22
 *   재무부 8/28  2Y 4.34 · 10Y 4.73 · 30Y 5.22   ← 전 만기 완전 일치
 */
async function getTreasuryCurveFmp(): Promise<any[] | null> {
    const key = process.env.FMP_API_KEY || "";
    if (!key) return null;
    const from = new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
        const res = await fetch(
            `https://financialmodelingprep.com/stable/treasury-rates?from=${from}&to=${to}&apikey=${key}`,
            { signal: ctrl.signal, cache: "no-store" }
        );
        if (!res.ok) return null;
        const rows = await res.json();
        if (!Array.isArray(rows) || !rows.length) return null;
        const out = rows
            .map((r: any) => ({
                date: String(r?.date || ""),
                yield_1_month: r?.month1 ?? null,
                yield_3_month: r?.month3 ?? null,
                yield_6_month: r?.month6 ?? null,
                yield_1_year: r?.year1 ?? null,
                yield_2_year: r?.year2 ?? null,
                yield_3_year: r?.year3 ?? null,
                yield_5_year: r?.year5 ?? null,
                yield_7_year: r?.year7 ?? null,
                yield_10_year: r?.year10 ?? null,
                yield_20_year: r?.year20 ?? null,
                yield_30_year: r?.year30 ?? null,
            }))
            .filter((r: any) => r.date && Number.isFinite(Number(r.yield_10_year)))
            .sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
        // 상식 게이트 — 이상한 값을 「오늘 금리」로 내보내지 않는다
        if (!out.length || !(out[0].yield_10_year > 0 && out[0].yield_10_year < 20)) return null;
        return out;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export async function getTreasuryCurveOfficial(): Promise<any[] | null> {
    // ① Redis (EC2 크론이 재무부 원본을 적재) — 즉시
    const cached = await readTreasuryCurveFromRedis();
    // ② FMP — 재무부와 값이 같고 1.1초. 캐시가 «더 오래된» 경우에만 부른다
    //    (크론 주기 사이에 새 거래일이 게시되는 구간을 메운다)
    const fmp = await getTreasuryCurveFmp();
    if (fmp && (!cached || fmp[0].date > cached[0].date)) return fmp;
    return cached ?? fmp ?? null;
}

async function readTreasuryCurveFromRedis(): Promise<any[] | null> {
    try {
        const proxy = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
        const key = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || "signum-redis-proxy-2026";
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        try {
            const res = await fetch(`${proxy}/get?key=${encodeURIComponent(TREASURY_CURVE_KEY)}`, {
                headers: { Authorization: `Bearer ${key}` },
                signal: ctrl.signal,
                cache: "no-store",
            });
            if (!res.ok) return null;
            const raw = await res.json();
            const val = typeof raw?.result === "string" ? JSON.parse(raw.result) : raw?.result;
            const rows: any[] = Array.isArray(val?.results) ? val.results : [];
            if (!rows.length) return null;
            const ageDays = (Date.now() - Date.parse(`${rows[0].date}T21:00:00Z`)) / 86400_000;
            if (!(ageDays < TREASURY_MAX_AGE_DAYS)) return null;   // 너무 낡으면 안 쓴다
            return rows;
        } finally {
            clearTimeout(timer);
        }
    } catch {
        return null;
    }
}

export async function getTreasuryYieldsIntrinio(limit = 2): Promise<any> {
    // ① 재무부 원본이 있으면 그것이 정본이다
    const official = await getTreasuryCurveOfficial();
    if (official) {
        const want = Math.max(2, Math.min(limit, 30));
        return { status: "OK", count: Math.min(want, official.length), results: official.slice(0, want), _source: "us-treasury" };
    }
    // ② 없으면 FRED 로 폴백 (하루 낡을 수 있다)
    return await getTreasuryYieldsFred(limit);
}

async function getTreasuryYieldsFred(limit = 2): Promise<any> {
    // 소비처가 [0]과 [1]을 빼서 변화량을 만든다 → 최소 2행이 필요하다.
    const want = Math.max(2, Math.min(limit, 30));
    const series = await Promise.all(
        TREASURY_SERIES.map(([sym]) => getEconomicSeries(sym, want + 3))
    );

    const byDate = new Map<string, any>();
    series.forEach((rows, i) => {
        const field = TREASURY_SERIES[i][1];
        for (const r of rows) {
            if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date });
            byDate.get(r.date)[field] = r.value;
        }
    });

    // 10년물이 없는 날은 쓸모가 없다 — 소비처가 전부 그것부터 본다
    const results = [...byDate.values()]
        .filter((r) => Number.isFinite(r.yield_10_year))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, want)
        .map((r) => {
            for (const [, f] of TREASURY_SERIES) if (!(f in r)) r[f] = null;
            return r;
        });

    return { status: "OK", count: results.length, results, _source: "fred" };
}

/**
 * 물가 → Massive `/fed/v1/inflation` 모양.
 *
 * ⚠️ 호출부(`fedApiClient.getInflationData`)는 `res.cpi` 를 **최상위에서** 읽는데
 *    Massive 는 `results[0].cpi` 를 줬다. 그래서 이 값은 **줄곧 null 이었다**
 *    (2026-08-30 코드 실측 — `source: "FAIL"` 로 떨어진다).
 *    이관하면서 최상위 «와» results 양쪽에 담아, 어느 쪽을 읽어도 맞게 한다.
 *
 *    YoY 는 Massive 가 안 주던 값이다. 12개월 전 지수와 비교해 우리가 만든다.
 */
export async function getInflationIntrinio(): Promise<any> {
    const rows = await getEconomicSeries("$CPIAUCSL", 14);
    if (!rows.length) return { status: "OK", count: 0, results: [] };
    const latest = rows[0];
    // 월간 계열이라 13번째가 «12개월 전»이다
    const yearAgo = rows.length >= 13 ? rows[12] : null;
    const cpiYoY =
        yearAgo && yearAgo.value > 0
            ? Math.round(((latest.value - yearAgo.value) / yearAgo.value) * 1000) / 10
            : null;

    const pceRows = await getEconomicSeries("$PCEPI", 14);
    const pce = pceRows[0]?.value ?? null;
    const pceYearAgo = pceRows.length >= 13 ? pceRows[12] : null;
    const pceYoY =
        pce != null && pceYearAgo && pceYearAgo.value > 0
            ? Math.round(((pce - pceYearAgo.value) / pceYearAgo.value) * 1000) / 10
            : null;

    return {
        status: "OK",
        // 최상위 — 지금 호출부가 읽는 자리
        date: latest.date,
        cpi: latest.value,
        cpiYoY,
        pce,
        pceYoY,
        // results — Massive 원형과 같은 자리
        count: rows.length,
        results: rows.map((r) => ({ date: r.date, cpi: r.value })),
    };
}

/** 기대 인플레이션(5년 브레이크이븐) → `/fed/v1/inflation-expectations` 모양 */
export async function getInflationExpectationsIntrinio(): Promise<any> {
    const rows = await getEconomicSeries("$T5YIE", 5);
    if (!rows.length) return { status: "OK", count: 0, results: [] };
    return {
        status: "OK",
        date: rows[0].date,
        expected: rows[0].value,      // 호출부가 `res.expected` 로 읽는다
        count: rows.length,
        results: rows.map((r) => ({ date: r.date, expected: r.value })),
    };
}

/**
 * 재무 비율 → Massive `/stocks/financials/v1/ratios` 모양.
 *
 * Intrinio 는 계산된 비율을 «데이터 포인트»로 준다. 태그마다 한 콜이라
 * 7콜이지만 소비처가 6시간 캐시를 쓰므로 예산 문제는 없다.
 * 못 받은 값은 **null** 로 둔다(0 으로 채우면 「PER 0」이 된다).
 */
//
// ★ 태그 이름과 «기준»을 실측으로 맞췄다 (2026-08-30, NVDA 기준 Massive 대조):
//     pricetoearnings  27.18 vs 27.24  ✅
//     pricetobook      22.90 vs 22.94  ✅
//     debttoequity     0.146 vs 0.15   ✅
//     marketcap        5.243T vs 5.253T ✅
//     pricetorevenue   17.31 vs 17.34  ✅  ← `pricetosales` 는 없는 태그다(404)
//     freecashflow     54.7B vs 127.0B ❌  ← Intrinio 는 «분기», Massive 는 TTM
//                       → 분기 4개를 더해 127,006,000,000 = **정확히 일치** 확인
//     roe              1.172 vs 0.842  ⚠️  기준이 다르다(아래 주석 참조)
//
const RATIO_TAGS: Array<[string, string]> = [
    ["pricetoearnings", "price_to_earnings"],
    ["debttoequity", "debt_to_equity"],
    ["roe", "return_on_equity"],
    ["pricetobook", "price_to_book"],
    ["pricetorevenue", "price_to_sales"],
    ["marketcap", "market_cap"],
];

async function dataPoint(ticker: string, tag: string): Promise<number | null> {
    try {
        const v = await callIntrinio(`companies/${encodeURIComponent(ticker)}/data_point/${tag}/number`);
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

/**
 * 잉여현금흐름 TTM — 분기 4개를 더한다.
 *
 * ⚠️ Intrinio 의 `freecashflow` 데이터 포인트는 **최신 분기** 값이다.
 *    Massive 는 TTM 을 줬고, 소비처는 이걸 시총으로 나눠 «FCF 수익률 %»를
 *    화면에 쓴다. 기준이 다르면 표시값이 2배 이상 틀어진다.
 *    실측(NVDA): 21.400 + 48.587 + 34.904 + 22.115 = **127.006B**
 *                = Massive 의 127,006,000,000 과 정확히 일치.
 */
/**
 * 「최근 4분기」를 **안전하게** 고른다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * ⚠️ 그냥 앞에서 4개를 자르면 안 된다. 실측(2026-08-30)에서 나온 것들:
 *
 *   ① 순서가 보장되지 않는다 — ONTO 의 3번째 행이 2024 Q4 로 끼어 있었다.
 *   ② **start_date 가 깨진 행이 있다** — ONTO `2024-09-29 ~ 2026-01-03`(461일).
 *      그런데 그 행의 매출은 281M 으로 **정상 분기 수준**이다(동종 218~343M).
 *      즉 기간이 15개월인 게 아니라 start_date 만 틀렸다.
 *      → 기간 «길이»로 거르면 멀쩡한 분기를 버린다. start_date 를 믿지 않는다.
 *   ③ 손익과 현금흐름의 최신 분기가 다를 수 있다 — WOLF 는 현금흐름이
 *      두 분기 뒤처져 있다. 그래서 «각 계열 안에서» 4분기를 고른다.
 *
 * 판정은 **end_date 간격**으로 한다: 연속한 끝날짜가 80~100일 간격이고,
 * 4개가 250~290일을 덮으면 TTM 이다. 못 채우면 **null** — 「대충 더한 값」은
 * TTM 이 아니고, 그걸 PER·FCF수익률로 화면에 쓰면 그럴듯한 거짓이 된다.
 */
function pickTTMQuarters(funds: any[]): any[] | null {
    const DAY = 86400_000;
    const rows = funds
        .map((f) => ({ f, e: Date.parse(String(f?.end_date || "")) }))
        .filter((r) => Number.isFinite(r.e))
        .sort((a, b) => b.e - a.e);

    // 같은 끝날짜가 중복으로 오면 하나만 쓴다
    const uniq: typeof rows = [];
    for (const r of rows) {
        if (uniq.length && Math.abs(uniq[uniq.length - 1].e - r.e) < 5 * DAY) continue;
        uniq.push(r);
    }
    if (uniq.length < 4) return null;

    const picked = [uniq[0]];
    for (const r of uniq.slice(1)) {
        if (picked.length >= 4) break;
        const gap = (picked[picked.length - 1].e - r.e) / DAY;
        if (gap < 80 || gap > 100) continue;      // 분기 간격이 아니면 건너뛴다
        picked.push(r);
    }
    if (picked.length < 4) return null;

    const span = (picked[0].e - picked[3].e) / DAY;
    if (span < 250 || span > 290) return null;    // 3개 간격 ≈ 9개월이어야 한다
    return picked.map((r) => r.f);
}

async function freeCashFlowTTM(ticker: string): Promise<number | null> {
    try {
        const d = await callIntrinio(`companies/${encodeURIComponent(ticker)}/fundamentals`, {
            statement_code: "cash_flow_statement",
            type: "QTR",
            // 이상 기간·중복이 섞여 있으므로 넉넉히 받아 «고른다»
            page_size: "8",
        });
        const funds = pickTTMQuarters(d?.fundamentals || []);
        if (!funds) return null;                    // 정합한 4분기를 못 고르면 TTM 이 아니다
        const parts = await Promise.all(
            funds.map(async (f) => {
                try {
                    const sf = await callIntrinio(`fundamentals/${f.id}/standardized_financials`);
                    const list: any[] = sf?.standardized_financials || [];
                    const tag = (t: string) => {
                        const hit = list.find((x) => x?.data_tag?.tag === t);
                        const n = Number(hit?.value);
                        return Number.isFinite(n) ? n : null;
                    };
                    // ⚠️ `freecashflow` 태그는 **종목마다 있기도 없기도 하다.**
                    //    NVDA 는 있고 SYM·TER 는 없다(실측). 없으면 정의대로 만든다:
                    //      FCF = 영업현금흐름 − 설비투자
                    //    Intrinio 는 capex 를 **음수**로 주므로 «더하면» 뺀 것이 된다.
                    const direct = tag("freecashflow");
                    if (direct != null) return direct;
                    const ocf = tag("netcashfromoperatingactivities");
                    const capex = tag("purchaseofplantpropertyandequipment");
                    return ocf != null && capex != null ? ocf + capex : null;
                } catch { return null; }
            })
        );
        if (parts.some((v) => v == null)) return null;   // 한 분기라도 비면 합계가 거짓이 된다
        return (parts as number[]).reduce((a, b) => a + b, 0);
    } catch {
        return null;
    }
}

/**
 * TTM 순이익 — 분기 4개 합.
 *
 * ★ PER 을 이걸로 «다시» 계산한다. Intrinio 의 `pricetoearnings` 데이터 포인트는
 *   **반올림된 분기 EPS**(SYM 은 0.06)를 쓰기 때문에 이익이 작은 종목에서 크게 틀어진다.
 *   실측(2026-08-30, 시총÷TTM순이익 vs Massive):
 *     SYM   411.3 vs 410.38   (Intrinio 태그는 2937.8 — 7배 오차)
 *     NVDA   27.18 vs 27.24
 *     TER    48.23 vs 48.25
 *   세 종목 모두 Massive 와 일치한다 → 태그 대신 이 계산을 쓴다.
 */
async function netIncomeTTM(ticker: string): Promise<number | null> {
    try {
        const d = await callIntrinio(`companies/${encodeURIComponent(ticker)}/fundamentals`, {
            statement_code: "income_statement",
            type: "QTR",
            page_size: "8",
        });
        const funds = pickTTMQuarters(d?.fundamentals || []);
        if (!funds) return null;
        const parts = await Promise.all(
            funds.map(async (f) => {
                try {
                    const sf = await callIntrinio(`fundamentals/${f.id}/standardized_financials`);
                    const list: any[] = sf?.standardized_financials || [];
                    const hit = list.find((x) => x?.data_tag?.tag === "netincome");
                    const n = Number(hit?.value);
                    return Number.isFinite(n) ? n : null;
                } catch { return null; }
            })
        );
        if (parts.some((v) => v == null)) return null;
        return (parts as number[]).reduce((a, b) => a + b, 0);
    } catch {
        return null;
    }
}

export async function getFinancialRatiosIntrinio(ticker: string): Promise<any> {
    const [vals, fcfTtm, niTtm] = await Promise.all([
        Promise.all(RATIO_TAGS.map(([tag]) => dataPoint(ticker, tag))),
        freeCashFlowTTM(ticker),
        netIncomeTTM(ticker),
    ]);
    const row: Record<string, number | string | null> = { ticker };
    RATIO_TAGS.forEach(([, field], i) => { row[field] = vals[i]; });
    row.free_cash_flow = fcfTtm;

    // PER 은 TTM 기준으로 다시 계산한다(위 netIncomeTTM 주석 참조).
    // 순이익이 0 이하면 PER 은 의미가 없다 → null. (음수 PER 을 표시하면 «싸다»로 읽힌다)
    const mcap = typeof row.market_cap === "number" ? row.market_cap : null;
    if (mcap != null && niTtm != null && niTtm > 0) {
        row.price_to_earnings = Math.round((mcap / niTtm) * 100) / 100;
        row._peBasis = "marketcap/ttmNetIncome";
    } else if (niTtm != null && niTtm <= 0) {
        row.price_to_earnings = null;
        row._peBasis = "negative-earnings";
    }
    // ⚠️ ROE 는 Intrinio 와 Massive 의 «기준»이 다르다(1.172 vs 0.842, NVDA 실측).
    //    Intrinio 쪽이 기말자본 기준으로 보이고 Massive 는 평균자본 기준으로 보인다.
    //    어느 쪽도 «틀린» 값은 아니라 변환하지 않고 그대로 흘린다. 다만 소비처의
    //    점수 구간이 달라질 수 있으므로 기준을 응답에 남긴다.
    row._roeBasis = "intrinio";
    const any = vals.some((v) => v != null) || fcfTtm != null;
    return { status: "OK", count: any ? 1 : 0, results: any ? [row] : [] };
}

/**
 * 분기 손익 → `/stocks/financials/v1/income-statements` 모양.
 * 소비처는 `revenue` 와 `consolidated_net_income_loss` 만 쓴다(순마진·매출성장률).
 */
export async function getIncomeStatementsIntrinio(ticker: string, limit = 5): Promise<any> {
    let funds: any[] = [];
    try {
        const d = await callIntrinio(`companies/${encodeURIComponent(ticker)}/fundamentals`, {
            statement_code: "income_statement",
            type: "QTR",
            page_size: String(Math.max(1, Math.min(limit, 8))),
        });
        funds = d?.fundamentals || [];
    } catch {
        return { status: "OK", count: 0, results: [] };
    }
    if (!funds.length) return { status: "OK", count: 0, results: [] };

    const rows = await Promise.all(
        funds.map(async (f: any) => {
            try {
                const sf = await callIntrinio(`fundamentals/${f.id}/standardized_financials`);
                const list: any[] = sf?.standardized_financials || [];
                const pick = (tag: string) => {
                    const hit = list.find((x) => x?.data_tag?.tag === tag);
                    const n = Number(hit?.value);
                    return Number.isFinite(n) ? n : null;
                };
                return {
                    ticker,
                    period_end: f.end_date || null,
                    fiscal_year: f.fiscal_year ?? null,
                    fiscal_period: f.fiscal_period || null,
                    revenue: pick("totalrevenue"),
                    consolidated_net_income_loss: pick("netincome"),
                };
            } catch {
                return null;
            }
        })
    );
    const results = rows.filter(Boolean);
    return { status: "OK", count: results.length, results };
}

/**
 * 8-K 공시 → `/stocks/filings/8-K/vX/disclosures` 모양.
 *
 * ⚠️ **완전 대체가 아니다.** Massive(Polygon)는 8-K «본문»을 구조화 추출해
 *    `primary_category` · `tertiary_category` · `supporting_text` 를 줬다.
 *    Intrinio 는 메타데이터만 준다(날짜·URL·report_type·earnings_release).
 *    그래서 여기서는 «어떤 공시가 언제 나왔는가»까지만 채우고, 본문이 필요한
 *    AI 요약은 소비처가 텍스트 없음을 보고 알아서 건너뛴다.
 *    카테고리는 우리가 만들 수 있는 만큼만 넣는다(실적 발표 여부).
 *
 * 또 하나: Intrinio filings 는 **정렬돼 오지 않는다**(실측: 2025-02-26 이 첫 행).
 * accepted_date 로 우리가 정렬한다. filing_date 는 null 인 경우가 많다.
 */
/**
 * SEC 8-K Item 코드 → 소비처(disclosures.ts) 분류 체계.
 *
 * ══════════════════════════════════════════════════════════════════════
 * Polygon 은 8-K 본문을 구조화 추출해 `primary_category`/`supporting_text` 를
 * 줬는데 Intrinio 엔 그게 없다. 그런데 **SEC 원본에 Item 코드가 그대로 있다**
 * — 그게 애초에 Polygon 이 분류의 근거로 삼던 것이다.
 *
 * SEC submissions API 실측(2026-08-30, NVDA):
 *   키 불필요 · **0.097초** · `items: "2.02,9.01"` 처럼 코드가 온다
 *   2026-08-26 items=2.02,9.01  ·  2026-08-17 items=1.01,2.03,7.01  ·  5.02 …
 *
 * 벤더를 거치지 않고 «원본»에서 받으므로 오히려 더 정확하다.
 */
const SEC_8K_ITEMS: Record<string, { title: string; primary: string; tertiary: string; high: boolean }> = {
    "1.01": { title: "Entry into a Material Definitive Agreement", primary: "strategic_transactions", tertiary: "material_agreement", high: true },
    "1.02": { title: "Termination of a Material Definitive Agreement", primary: "strategic_transactions", tertiary: "agreement_termination", high: true },
    "1.03": { title: "Bankruptcy or Receivership", primary: "financial_distress", tertiary: "bankruptcy", high: true },
    "2.01": { title: "Completion of Acquisition or Disposition of Assets", primary: "strategic_transactions", tertiary: "acquisition", high: true },
    "2.02": { title: "Results of Operations and Financial Condition", primary: "results_of_operations", tertiary: "earnings", high: false },
    "2.03": { title: "Creation of a Direct Financial Obligation", primary: "financial_obligations", tertiary: "debt_issuance", high: false },
    "2.04": { title: "Triggering Events That Accelerate a Financial Obligation", primary: "financial_distress", tertiary: "acceleration", high: true },
    "2.05": { title: "Costs Associated with Exit or Disposal Activities", primary: "financial_distress", tertiary: "restructuring", high: true },
    "2.06": { title: "Material Impairments", primary: "financial_distress", tertiary: "impairment", high: true },
    "3.01": { title: "Notice of Delisting or Failure to Satisfy a Listing Rule", primary: "financial_distress", tertiary: "delisting", high: true },
    "3.02": { title: "Unregistered Sales of Equity Securities", primary: "capital_structure", tertiary: "equity_issuance", high: false },
    "3.03": { title: "Material Modification to Rights of Security Holders", primary: "capital_structure", tertiary: "rights_modification", high: false },
    "4.01": { title: "Changes in Registrant's Certifying Accountant", primary: "governance", tertiary: "auditor_change", high: true },
    "4.02": { title: "Non-Reliance on Previously Issued Financial Statements", primary: "financial_distress", tertiary: "restatement", high: true },
    "5.01": { title: "Changes in Control of Registrant", primary: "strategic_transactions", tertiary: "control_change", high: true },
    "5.02": { title: "Departure or Election of Directors or Officers", primary: "governance", tertiary: "ceo_cfo_change", high: true },
    "5.03": { title: "Amendments to Articles of Incorporation or Bylaws", primary: "governance", tertiary: "bylaws", high: false },
    "5.07": { title: "Submission of Matters to a Vote of Security Holders", primary: "governance", tertiary: "shareholder_vote", high: false },
    "7.01": { title: "Regulation FD Disclosure", primary: "other_events", tertiary: "reg_fd", high: false },
    "8.01": { title: "Other Events", primary: "other_events", tertiary: "", high: false },
    "9.01": { title: "Financial Statements and Exhibits", primary: "other_events", tertiary: "exhibits", high: false },
};

/** SEC 공식 제출 목록 — 키 불필요, ~100ms. User-Agent 에 연락처가 있어야 한다(SEC 규정) */
async function getSecFilings8K(cik: string): Promise<Map<string, { items: string[]; date: string; doc: string; acc: string }>> {
    const out = new Map<string, { items: string[]; date: string; doc: string; acc: string }>();
    const padded = String(cik || "").replace(/\D/g, "").padStart(10, "0");
    if (padded === "0000000000") return out;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
        const res = await fetch(`https://data.sec.gov/submissions/CIK${padded}.json`, {
            headers: { "User-Agent": "SIGNUM HQ contact@signumhq.com" },
            signal: ctrl.signal,
            cache: "no-store",
        });
        if (!res.ok) return out;
        const d = await res.json();
        const r = d?.filings?.recent;
        if (!r?.form) return out;
        for (let i = 0; i < r.form.length; i++) {
            if (r.form[i] !== "8-K") continue;
            const acc = String(r.accessionNumber[i] || "");
            if (!acc) continue;
            out.set(acc.replace(/-/g, ""), {
                items: String(r.items?.[i] || "").split(",").map((x: string) => x.trim()).filter(Boolean),
                date: String(r.filingDate?.[i] || ""),
                doc: String(r.primaryDocument?.[i] || ""),
                acc,
            });
        }
        return out;
    } catch {
        return out;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * SEC 8-K 원문에서 **본문**을 뽑는다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * Polygon 이 주던 `supporting_text` 의 정체는 결국 이 문서다. 벤더를 잃었지만
 * 원본은 공개돼 있고 **0.089초**에 읽힌다(실측, NVDA 8-K 26KB).
 * 추출 예:
 *   "Item 2.02 Results of Operations and Financial Condition. On August 26,
 *    2026, NVIDIA Corporation ... issued a press release announcing its
 *    results for the quarter ended July 26, 2026 ..."
 *
 * ⚠️ SEC 는 User-Agent 에 연락처를 요구하고 초당 10요청을 넘지 말라고 한다.
 *    우리는 «화면에 실제로 보여줄» 5건 정도만, 병렬로 한 번에 받는다.
 */
async function fetchSec8KText(
    cik: string,
    accessionNoDashes: string,
    primaryDoc: string
): Promise<string> {
    if (!cik || !accessionNoDashes || !primaryDoc) return "";
    const num = String(cik).replace(/\D/g, "").replace(/^0+/, "");
    const url = `https://www.sec.gov/Archives/edgar/data/${num}/${accessionNoDashes}/${primaryDoc}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "SIGNUM HQ contact@signumhq.com" },
            signal: ctrl.signal,
            cache: "no-store",
        });
        if (!res.ok) return "";
        const html = await res.text();
        // 태그를 걷어내고 공백을 정규화한다 (외부 파서 없이)
        let t = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
        t = t.replace(/<[^>]+>/g, " ");
        t = t.replace(/&(nbsp|#160);/gi, " ").replace(/&amp;/gi, "&")
             .replace(/&(lt|gt|quot|#39|apos);/gi, " ");
        t = t.replace(/\s+/g, " ").trim();

        // "Item X.XX" 이후가 실제 내용이다. 없으면 문서 앞부분으로 대체한다.
        const m = /Item\s+\d\.\d{2}[\s\S]{0,1200}/.exec(t);
        const body = (m ? m[0] : t).slice(0, 900).trim();
        // 서식만 남은 껍데기(표지·서명면)는 버린다
        return body.length >= 80 ? body : "";
    } catch {
        return "";
    } finally {
        clearTimeout(timer);
    }
}

export async function getFilings8KIntrinio(
    ticker: string,
    sinceISO?: string,
    limit = 10
): Promise<any> {
    let filings: any[] = [];
    let cik = "";
    try {
        const [d, company] = await Promise.all([
            callIntrinio(`companies/${encodeURIComponent(ticker)}/filings`, {
                report_type: "8-K",
                page_size: String(Math.max(limit, 20)),
            }),
            callIntrinio(`companies/${encodeURIComponent(ticker)}`).catch(() => null),
        ]);
        filings = d?.filings || [];
        cik = String(company?.cik || "");
    } catch {
        return { status: "OK", count: 0, results: [] };
    }

    // SEC 원본에서 Item 코드를 가져와 분류를 «복원»한다 (§SEC_8K_ITEMS 주석)
    const sec = cik ? await getSecFilings8K(cik) : new Map();

    const dateOf = (f: any) =>
        String(f?.filing_date || f?.accepted_date || "").slice(0, 10);

    const results = filings
        .map((f) => ({ f, d: dateOf(f) }))
        .filter((x) => x.d && (!sinceISO || x.d >= sinceISO.slice(0, 10)))
        .sort((a, b) => (a.d < b.d ? 1 : -1))
        .slice(0, limit)
        .map(({ f, d }) => {
            const accKey = String(f.sec_unique_id || "").replace(/\D/g, "");
            const hit = sec.get(accKey);
            const codes = hit?.items || [];
            const known = codes.map((c: string) => SEC_8K_ITEMS[c]).filter(Boolean);

            // 대표 분류 = «고영향» 항목을 우선, 없으면 첫 항목
            const lead = known.find((k: any) => k.high) || known[0] || null;

            return {
                ticker,
                filing_date: d,
                accession_number: f.sec_unique_id || f.id || null,
                // ★ Intrinio 엔 분류가 없다. SEC Item 코드로 복원한다.
                //   코드를 못 얻으면 earnings_release 플래그로 최소한만 채운다.
                primary_category: lead?.primary
                    ?? (f.earnings_release ? "results_of_operations" : "other_events"),
                tertiary_category: lead?.tertiary || null,
                secondary_category: null,
                // 본문은 못 받지만 **무슨 항목의 공시인지**는 말할 수 있다.
                // AI 요약기가 빈 문자열보다 훨씬 나은 재료를 갖게 된다.
                supporting_text: known.length
                    ? known.map((k: any) => k.title).join("; ")
                    : "",
                sec_items: codes,
                // ⚠️ 소비처는 `filing_url` 이라는 이름으로 읽는다(`source_url` 만
                //    내보냈더니 화면 링크가 빈 문자열이 됐다).
                filing_url: f.report_url || f.filing_url || null,
                source_url: f.report_url || f.filing_url || null,
                _textUnavailable: !known.length,
            };
        });

    // ── 본문 보강 — 화면에 보여줄 것만 SEC 원문에서 받아 채운다 ──────
    //   Polygon 의 supporting_text 를 대체한다. 실패해도 분류는 남으므로
    //   «없으면 없는 대로» 진행한다(빈 문자열 + _textUnavailable).
    const enriched = await Promise.all(
        results.map(async (r: any) => {
            const hit = sec.get(String(r.accession_number || "").replace(/\D/g, ""));
            if (!hit?.doc) return r;
            const text = await fetchSec8KText(cik, String(hit.acc || "").replace(/-/g, ""), hit.doc);
            if (!text) return r;
            return { ...r, supporting_text: text, _textUnavailable: false, _textSource: "sec-primary-doc" };
        })
    );

    return { status: "OK", count: enriched.length, results: enriched };
}
