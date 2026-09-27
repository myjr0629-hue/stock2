/**
 * 미국 증시 달력 — «단 하나의» 정본.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 왜 파일로 뺐는가
 *
 *   휴장 목록이 intrinioClient 안에 module-private 로 갇혀 있었다.
 *   그래서 다른 서비스가 「오늘 휴장인가」를 물을 수 없었고, 각자
 *   «값»으로 추측하게 됐다. 그 결과가 2026-09-09 의 버그다:
 *
 *     옵션 EOD 수집기가 9/7(노동절) 파일을 받아 정상 스냅샷을 덮었다.
 *     휴장이라 미결제약정 증감이 전부 0 → 신규진입 종목 0개 →
 *     `getInstitutionalFlowSummary()` 가 null → **무료로 열어둔 게이트
 *     카드 한 장이 통째로 비었다.** 200 OK 였고 에러도 없었다.
 *
 *   같은 교훈을 이미 두 번 배웠다(휴장일 전 종목 보합 · 프리마켓 기준선).
 *   **휴장은 값으로 추측하지 않는다. 달력이 정본이다.**
 * ══════════════════════════════════════════════════════════════════════
 */

/** 미국 증시 휴장일 (NYSE/NASDAQ). 매년 갱신할 것. */
export const US_MARKET_HOLIDAYS = new Set([
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
    "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

/** 'YYYY-MM-DD' 가 휴장일인가 */
export function isUsMarketHoliday(dateStr: string | null | undefined): boolean {
    return !!dateStr && US_MARKET_HOLIDAYS.has(dateStr);
}

/**
 * 'YYYY-MM-DD' 가 «거래가 일어나지 않는 날»인가 (주말 + 휴장).
 * 날짜 문자열만 보고 판정하므로 타임존 변환을 하지 않는다 —
 * `new Date('2026-09-07')` 는 UTC 자정이라 ET 로 바꾸면 하루가 밀린다.
 */
export function isNonTradingDay(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return false;
    if (US_MARKET_HOLIDAYS.has(dateStr)) return true;
    // UTC 로 만들어 요일만 본다 (로컬 타임존 영향 제거)
    const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    return dow === 0 || dow === 6;
}

// ══════════════════════════════════════════════════════════════════════
// «언제의 값인가» — 캐시가 낡았는지 판정할 때 쓴다.
//
//   [2026-09-09 실측] cache:analysis:* 가 전 종목 24~35시간 전 값이었다.
//   TTL 이 3일인데 «적중하면 다시 계산하지 않는» 구조라, 설계가 전제한
//   「2분마다 도는 크론」이 없자 **TTL 이 곧 갱신 주기**가 돼 버렸다.
//   나이를 시간으로만 재면 주말·휴장에 멀쩡한 직전 세션 값까지 버린다.
//   → «그 값이 어느 거래일의 것인가»로 판정한다. 여기서도 달력이 정본이다.
// ══════════════════════════════════════════════════════════════════════

function etParts(ms: number): Date {
    return new Date(new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York" }));
}

/** 그 시점의 ET 달력 날짜 (YYYY-MM-DD) */
export function etDateOf(ms: number): string {
    const d = etParts(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 그 시점의 ET 자정 기준 분 (00:00 = 0, 16:00 = 960) */
export function etMinutesOf(ms: number): number {
    const d = etParts(ms);
    return d.getHours() * 60 + d.getMinutes();
}

function shiftDay(dateStr: string, delta: number): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return dateStr;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + delta));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 그 시점이 «속한 거래일». 주말·휴장이면 직전 거래일로 걸어 내려간다.
 * 금요일 15:00 에 만든 값은 토·일 내내 여전히 «금요일의 값»이므로 유효하다.
 */
export function etTradingDateOf(ms: number = Date.now()): string {
    let s = etDateOf(ms);
    for (let i = 0; i < 10 && isNonTradingDay(s); i++) s = shiftDay(s, -1);
    return s;
}

/**
 * 그 시점에 «마지막으로 끝난» 정규장 날짜. 정규장이 끝나기(16:00 ET) 전이면 그날은 아직
 * 끝나지 않았다 → 토·일·휴장·평일 새벽 모두 직전 거래일(토 → 금, 노동절 다음 날 새벽 → 금).
 * 화면이 장 마감 중에 «9/25(금) 마감 기준»처럼 as-of 를 말할 때 쓴다.
 * (etTradingDateOf 와 다르다 — 그건 «그 시점이 속한 거래일»이라 평일 새벽엔 오늘을 준다.)
 */
export function etLastClosedSessionDate(ms: number = Date.now()): string {
    let s = etDateOf(ms);
    if (isNonTradingDay(s) || etMinutesOf(ms) < 16 * 60) s = shiftDay(s, -1);
    for (let i = 0; i < 10 && isNonTradingDay(s); i++) s = shiftDay(s, -1);
    return s;
}

// ══════════════════════════════════════════════════════════════════════
// CME 글로벡스(지수·금·원유 선물) 세션 — «지금 선물이 거래되는가».
//
//   [2026-09-26 토] 대시 지수 안내가 «지금 움직이는 건 선물뿐»이라고 했다. 토요일엔
//   선물도 닫혀 있다. 안내문이 세션을 안 보고 «정규장·프리·애프터가 아니면» 으로 떨어졌다.
//   규칙: 일 18:00 ET 개장 · 평일 17:00–18:00 ET 일일 휴식 · 금 17:00 ET 주말 마감 · 토 휴장.
//   휴장일엔 13:00 ET(금 13:45)에 멈췄다가 18:00 ET 에 다음 거래일 세션을 연다.
//   (대시의 isCmeGlobexActive 를 옮겨 온 것 — 규칙은 그대로다.)
//
//   ⚠️ ET 시각은 etDateOf/etMinutesOf 로 읽는다. Intl 의 hour12:false 는 구형 V8
//   (Node 20 실측)에서 hourCycle h24 라 자정을 «24시»로 준다 → 대시의 옛 시계로는
//   토 00:30 이 «일 24:30»(= 선물 열림)이 된다. 현행 Chrome 146·Safari 는 h23 이라 정상.
// ══════════════════════════════════════════════════════════════════════

export type CmeProduct = "equity" | "gold" | "oil";

/** 그 시점의 ET 요일 (0=일 … 6=토). 날짜 문자열에서 계산해 로컬 타임존 영향이 없다. */
export function etWeekdayOf(ms: number): number {
    const [y, m, d] = etDateOf(ms).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 그 시점에 CME 글로벡스 세션이 열려 있는가. isHoliday 기본값은 달력(그날이 휴장인가). */
export function isCmeGlobexOpenAt(
    ms: number,
    kind: CmeProduct = "equity",
    isHoliday: boolean = isUsMarketHoliday(etDateOf(ms)),
): boolean {
    const day = etWeekdayOf(ms);
    const t = etMinutesOf(ms) / 60;
    if (day === 6) return false;
    if (day === 0) return t >= 18;
    if (isHoliday) {
        const haltTime = kind === "gold" ? 13.75 : 13;
        return t < haltTime || t >= 18;
    }
    if (day === 5) return t < 17;
    return t < 17 || t >= 18;
}
