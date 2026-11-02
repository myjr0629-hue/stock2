// ════════════════════════════════════════════════════════════════════════
// ★★ [2026-11-02] 벤더(Intrinio realtime) 시각 복구 — 서머타임 종료 뒤 «2083년» 시각
//
//   실측(11/2 05:19~05:21 ET, 미국 서머타임 종료 다음 거래일 프리마켓):
//     securities/{T}/prices/realtime 의 last_time·bid_time·ask_time·updated_on 이
//     전 종목 «2083-09-02T14:05:08.905Z» 처럼 온다(source cboe_one_delayed·equities_edge 모두).
//     같은 순간 체결 테이프(securities/{T}/trades, delayed_sip)는 정상 «2026-11-02T10:05:59Z».
//     차이 = 정확히 1,793,505,600,000ms = 2026-11-01T04:00:00Z(= 서머타임 종료일 ET 자정, EDT) epoch.
//     빼면 10종목(NVDA·TSLA·AAPL·MU·AMD·PLTR·PGR·KO·BRK.B·SPY) 모두 테이프 마지막 체결과 맞았다
//     (PLTR 10:06:00.394 vs 테이프 10:06:00.393). 금요일 체결(normal_market_hours_last_time)은 정상.
//
//   영향: 마지막 체결이 «2083년 정규장 시각»으로 읽혀 프리마켓 체결이 아니라고 판정 →
//     live/ticker prePrice=null · 화면 PRE 칸 대신 «POST (CLOSED)» · quote.asOfMs 2083년.
//     미래 시각은 «신선도 하한»(역행 방지)도 영구히 막는다.
//
//   규칙: 벤더 시각이 «지금 + 10분»보다 미래면 믿지 않는다.
//     · 알려진 왜곡(서머타임 전환일 ET 자정 epoch 가 더해짐)을 빼서 «지금 이전 14일 안»에 들면 그 값으로 복구
//     · 아니면 0(모름) — 미래 시각을 그대로 두지 않는다(시각 없음 → 호출부가 체결 테이프 등 다른 길로 잇는다)
//   서머타임 경계는 고정 오프셋 없이 America/New_York(Intl)으로 계산한다.
// ════════════════════════════════════════════════════════════════════════

export const VENDOR_FUTURE_TOLERANCE_MS = 10 * 60_000;
const REPAIR_MAX_AGE_MS = 14 * 86_400_000;

const _etFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** ET 벽시계(y-m-d h:m) → epoch ms. 고정 오프셋 없이 Intl 로 그 순간의 오프셋을 구한다. */
export function etWallToMs(y: number, m: number, d: number, hh = 0, mm = 0): number {
    const guess = Date.UTC(y, m - 1, d, hh, mm);
    // 두 번 보정하면 전환 시각 근처를 제외하고 정확하다(자정·장 시각은 전환 시각 02:00 과 겹치지 않는다).
    let t = guess;
    for (let i = 0; i < 2; i++) {
        const p = Object.fromEntries(_etFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
        const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
        t += guess - asUtc;
    }
    return t;
}

/** 그 해 미국 서머타임 시작(3월 둘째 일요일)·종료(11월 첫 일요일) 날짜 */
export function usDstTransitionDates(year: number): { start: [number, number, number]; end: [number, number, number] } {
    const nthSunday = (month: number, n: number) => {
        const dow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
        return 1 + ((7 - dow) % 7) + (n - 1) * 7;
    };
    return { start: [year, 3, nthSunday(3, 2)], end: [year, 11, nthSunday(11, 1)] };
}

/** 관측된 왜곡값 후보 — 서머타임 전환일 ET 자정 epoch(올해·작년). 2026-11-01T04:00Z 가 실측값이다. */
function knownSkews(nowMs: number): number[] {
    const y = new Date(nowMs).getUTCFullYear();
    const out: number[] = [];
    for (const yr of [y, y - 1]) {
        const { start, end } = usDstTransitionDates(yr);
        out.push(etWallToMs(...end), etWallToMs(...start));
    }
    return out;
}

/**
 * 벤더 epoch(ms) 하나를 검사·복구한다(순수 함수).
 *   0·음수 → 0 · 미래가 아니면 그대로 · 미래면 알려진 왜곡을 빼 «지금 이전 14일 ~ 지금+10분»에 들면 복구값, 아니면 0.
 */
export function repairVendorEpochMs(ms: number, nowMs: number = Date.now()): number {
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    if (ms <= nowMs + VENDOR_FUTURE_TOLERANCE_MS) return ms;
    for (const skew of knownSkews(nowMs)) {
        const r = ms - skew;
        if (r <= nowMs + VENDOR_FUTURE_TOLERANCE_MS && r >= nowMs - REPAIR_MAX_AGE_MS) return r;
    }
    return 0;
}

const TIME_KEY = /(_time|_on)$/;

/**
 * Intrinio realtime 응답의 시각 필드(…_time · updated_on)를 검사·복구한 «사본»을 돌려준다(순수 함수).
 *   복구 못 한 미래 시각은 null 로 비운다. 고친 것이 없으면 원본 그대로.
 *   `_timeRepair` 에 몇 개를 고쳤는지/비웠는지 남긴다(진단용).
 */
export function repairIntrinioRealtimeTimes<T>(rt: T, nowMs: number = Date.now()): T {
    if (!rt || typeof rt !== "object") return rt;
    let repaired = 0, cleared = 0;
    const out: any = { ...(rt as any) };
    for (const [k, v] of Object.entries(out)) {
        if (!TIME_KEY.test(k) || typeof v !== "string" || !v) continue;
        const ms = Date.parse(v);
        if (!Number.isFinite(ms)) continue;
        const fixed = repairVendorEpochMs(ms, nowMs);
        if (fixed === ms) continue;
        if (fixed > 0) { out[k] = new Date(fixed).toISOString(); repaired++; }
        else { out[k] = null; cleared++; }
    }
    if (!repaired && !cleared) return rt;
    out._timeRepair = { repaired, cleared };
    return out as T;
}
