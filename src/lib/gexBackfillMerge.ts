/**
 * GEX 이력 «구멍 메우기» — 라이브 수집분 + 벤더 EOD 복원분 병합
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 필요한가]
 *   GEX 이력은 우리가 5분마다 직접 찍어 DynamoDB 에 쌓는다. 그래서
 *   **수집이 멈춘 기간은 통째로 빈다.** 실제로 그랬다(2026-08-29 실측):
 *
 *     NVDA 마지막 포인트 2026-08-19 · SPY 2026-08-10
 *     → 각각 10일 · 19일 구멍. 차트가 «최근 30일»이라고 말하면서
 *       실제로는 3주 전에서 끊긴 선을 그리고 있었다.
 *
 *   벤더 옵션 EOD 벌크에는 그 기간의 감마·미결제약정이 그대로 있다.
 *   같은 산식으로 되돌려 계산해 두었고(`scripts/intrinio-gex-backfill.js`),
 *   여기서 라이브 시계열에 끼워 넣는다.
 *
 * [원칙]
 *   ① 라이브가 있는 날은 **건드리지 않는다.** 복원분은 «없는 날»만 채운다.
 *      (같은 날 두 값이 겹치면 차트가 계단처럼 튄다)
 *   ② 복원 포인트는 `source: "backfill"` 로 표시한다. 화면이 원하면
 *      구분해 그릴 수 있어야 한다 — 5분 스냅샷과 EOD 는 성격이 다르다.
 *   ③ 산식이 라이브와 **동일**해야 한다. 검증 실측(2026-08-30):
 *        NVDA 복원 −116.7M vs 라이브 −116.836M
 *        AAPL 복원  −46.7M vs 라이브  −46.7M
 *        SPY  복원 +160.4M vs 라이브 +160.4M
 *      (스크립트가 `oi>0 && gamma!==0` 로 거르므로 계약 수만 다르다)
 */

/** 복원 저장소의 한 점 */
export interface BackfillPoint {
    date: string;              // YYYY-MM-DD (ET 거래일)
    gex: number;
    expiration: string;
    contracts: number;
    callOI: number;
    putOI: number;
    price: number;
}

/** 병합 결과의 한 점 — 라이브 스키마에 source 만 얹는다 */
export interface MergedGexPoint {
    ticker: string;
    timestamp: number;
    gex: number;
    flipLevel: number | null;
    callWall: number | null;
    putFloor: number | null;
    maxPain: number | null;
    price: number;
    gammaRegime: string;
    source: "live" | "backfill";
    /** 복원분만 — 어느 만기를 기준으로 되돌렸는지 */
    expiration?: string;
    contracts?: number;
}

/** UTC 밀리초 → ET 날짜(YYYY-MM-DD) */
export function etDateOfMs(ms: number): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(ms));
}

/**
 * ET 거래일의 16:00(정규장 마감) 을 UTC 밀리초로.
 *
 * ⚠️ 서머타임을 상수로 박지 않는다. 20:00 UTC 로 가정하면 겨울(EST)에
 *    15:00 ET 가 되어 «마감 전» 시각에 마감 값이 찍힌다. 실제 오프셋을
 *    타임존에서 되읽어 보정한다.
 */
export function etCloseMs(date: string): number {
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) return NaN;
    // 일단 UTC 20:00 으로 두고, 그 순간 ET 가 몇 시인지 물어 차이만큼 민다
    let guess = Date.UTC(y, m - 1, d, 20, 0, 0);
    for (let i = 0; i < 2; i++) {
        const etHour = Number(
            new Intl.DateTimeFormat("en-US", {
                timeZone: "America/New_York", hour: "2-digit", hour12: false,
            }).format(new Date(guess))
        );
        if (etHour === 16) break;
        guess += (16 - etHour) * 3600_000;
    }
    return guess;
}

/** 감마 레짐 라벨 — 라이브와 같은 기준(부호) */
function regimeOf(gex: number): string {
    return gex >= 0 ? "POSITIVE" : "NEGATIVE";
}

/**
 * 라이브 이력에 복원분을 끼워 넣는다.
 *
 * @param live   DynamoDB 에서 읽은 라이브 포인트 (timestamp 오름차순)
 * @param bf     복원 시계열 (없으면 빈 배열)
 * @param sinceMs 창의 시작 — 이보다 오래된 복원분은 넣지 않는다
 */
export function mergeGexHistory(
    ticker: string,
    live: any[],
    bf: BackfillPoint[],
    sinceMs: number
): { data: MergedGexPoint[]; filled: number } {
    const out: MergedGexPoint[] = (live || []).map((p) => ({ ...p, source: "live" as const }));
    // 라이브가 «하루라도» 찍힌 날은 복원하지 않는다
    const liveDays = new Set(out.map((p) => etDateOfMs(Number(p.timestamp))));

    let filled = 0;
    for (const p of bf || []) {
        if (!p?.date || !Number.isFinite(p.gex)) continue;
        if (liveDays.has(p.date)) continue;
        const ts = etCloseMs(p.date);
        if (!Number.isFinite(ts) || ts < sinceMs || ts > Date.now()) continue;
        out.push({
            ticker,
            timestamp: ts,
            gex: p.gex,
            // 복원분은 GEX 만 되돌린다. 플립/월/맥스페인은 라이브 파이프라인의
            // 다른 입력이 있어야 만들 수 있다 — 없는 것을 지어내지 않는다.
            flipLevel: null, callWall: null, putFloor: null, maxPain: null,
            price: p.price,
            gammaRegime: regimeOf(p.gex),
            source: "backfill",
            expiration: p.expiration,
            contracts: p.contracts,
        });
        filled++;
    }

    out.sort((a, b) => a.timestamp - b.timestamp);
    return { data: out, filled };
}
