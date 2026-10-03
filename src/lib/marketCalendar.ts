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

/**
 * 'YYYY-MM-DD' 두 달력 날짜 사이의 날 수(to − from) — 타임존을 거치지 않는다. 모양이 틀리면 null.
 * 화면의 «D-n»은 이것과 etDateOf(지금)로 센다: 기기 날짜(한국은 미국 장중 내내 하루 앞선다)·UTC 날짜(ET 20:00 부터 다음 날)로 세지 않는다.
 */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number | null {
    const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(fromYmd || ""), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(toYmd || "");
    if (!a || !b) return null;
    return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86_400_000);
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
 * 'YYYY-MM-DD' 바로 앞의 거래일 (주말·휴장을 건너뛴다).
 * 화 9/8 → 금 9/4 (월 9/7 노동절) · 토 9/26 → 금 9/25.
 * (64 fix/afterclose-session 과 ㊺ 가 같은 함수를 따로 추가했다 — 통합 때 하나로.)
 */
export function prevTradingDate(dateStr: string): string {
    let s = shiftDay(dateStr, -1);
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

/**
 * 그 시점에 화면이 보여주는 «정규장»의 날짜 — 시간외 값(PRE CLOSE·POST)을 어느 날 것으로
 * 골라야 하는지의 기준이다.
 *   · 거래일 09:30 ET 이후(정규장·애프터·마감 뒤) → 오늘
 *   · 거래일 09:30 ET 이전(자정~프리마켓)·주말·휴장  → 직전 거래일
 * ⚠️ etTradingDateOf 와 다르다: 화요일 03:00 ET 는 «속한 거래일»로는 화요일이지만
 *    화면이 보여주는 정규장은 월요일 것이다. 여기서 틀리면 어제 값이 오늘 자리에 앉는다.
 */
export function shownRegularSessionDate(ms: number = Date.now()): string {
    const today = etDateOf(ms);
    if (!isNonTradingDay(today) && etMinutesOf(ms) >= 570) return today;
    return prevTradingDate(today);
}

// ══════════════════════════════════════════════════════════════════════
// 정규장 마감 시각 — 평소 16:00 ET · 조기 폐장일 13:00 ET.
//
//   [2026-10-03] 표를 lib/app/watchlistInsights 에서 «그대로» 옮겨 왔다(값·함수 동일 — 그쪽은 다시 내보내기만 한다).
//   옵션 만기 판정(isOptionExpiredAt)이 서버 라우트와 화면에서 같은 표를 써야 해서다.
//   ⚠️ 위의 기존 함수(etLastClosedSessionDate 등)는 바꾸지 않았다 — 여전히 16:00 기준이다(호출자 전부에 번진다).
// ══════════════════════════════════════════════════════════════════════

/**
 * 조기 폐장(13:00 ET) — NYSE 공표 일정. 매년 갱신한다(위 휴장표와 같은 주기).
 *   2026: 11/27(추수감사절 다음 날) · 12/24(성탄 전날). 7/2 는 정상 마감(7/3 이 독립기념일 대체 휴장).
 *   2027: 11/26. 12/24 는 성탄 대체 휴장이라 없고, 7/2(금)도 정상 마감(7/5 대체 휴장).
 */
export const EARLY_CLOSE_DATES: ReadonlySet<string> = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

/** 그날 정규장이 끝나는 시각(ET 자정 기준 분) — 평소 16:00(960) · 조기 폐장 13:00(780) */
export const sessionCloseMinutes = (d: string): number => (EARLY_CLOSE_DATES.has(d) ? 13 * 60 : 16 * 60);

/**
 * 옵션 계약이 그 시점에 «이미 만기됐나» — 만기일 E 의 계약은 E 정규장 마감(16:00 ET · 조기 폐장일 13:00)에 사라진다.
 *   ET 날짜 < E → 살아 있음 · = E → 마감 시각 전까지 살아 있음 · > E → 만기.
 *   E 가 주말·휴장이면(실제론 거래소가 직전 거래일로 앞당겨 공표해 없다) 그 앞 마지막 거래일 마감에 끝난 것으로 본다.
 *   날짜 모양('YYYY-MM-DD…')이 아니면 판단하지 않는다(false — 모르는 것을 지우지 않는다).
 *
 * [2026-10-03] 예전 판정은 «E < 오늘(ET)»이라 오늘 만기를 자정까지 살려 뒀다. 옵션 EOD 묶음 D 는 D 장 마감 «뒤»에
 *   나오므로(저녁 API·다음 날 벌크) 그 묶음의 D 만기 계약은 처음 뜰 때 이미 만기였는데, 미국 저녁(=한국 아침) 내내
 *   «신규 포지션»에 섞였다가 ET 자정(한국 13:00)에 빠졌다 — 같은 묶음의 칩 숫자·방향이 시각에 따라 바뀌었다.
 *   만기 지난 계약을 «신규 포지션»에서 빼는 곳(options-eod 라우트 → 내 종목 칩·UC 큰손·Flow · Flow 화면 폴백)은 전부
 *   이 규칙 하나(아래 optionExpiryJudge)로 판정한다. 시험: tests/optionExpiry.test.ts
 *   ⚠️ 기관 신규 포지션 서비스(services/institutionalFlow → 옵션 흐름 SEO 페이지·대시 카드·마케팅 입력)는 쓰지 않는다 —
 *   «그 세션에 새로 열린 전체 양»(만기 지난 계약 포함)을 보여 주고 문장도 «was opened / 새로 열렸고»다.
 *   «아직 살아 있는 포지션» vs «열린 전체» 정의 통일은 별도 결정(운영 주체 10/3).
 */
export function isOptionExpiredAt(expiration: unknown, ms: number = Date.now()): boolean {
    return optionExpiryJudge(ms)(expiration);
}

/**
 * 같은 시각으로 계약 여러 개를 판정하는 판정기 — 규칙은 isOptionExpiredAt 과 같다(그쪽이 이것을 부른다).
 * ET 날짜·시각을 한 번만 읽고 만기일별 답을 기억한다: etDateOf·etMinutesOf 는 toLocaleString 이라 계약마다 부르면
 * 묶음 4,500계약에 약 180ms 가 든다(10/3 실측 — 예전 문자열 비교는 0.2ms). 묶음을 훑는 곳은 이것을 쓴다.
 */
export function optionExpiryJudge(ms: number = Date.now()): (expiration: unknown) => boolean {
    const today = etDateOf(ms);
    const afterTodayClose = etMinutesOf(ms) >= sessionCloseMinutes(today);
    const memo = new Map<string, boolean>();
    return (expiration: unknown): boolean => {
        if (typeof expiration !== "string") return false;
        const m = /^(\d{4}-\d{2}-\d{2})/.exec(expiration);
        if (!m) return false;
        let v = memo.get(m[1]);
        if (v === undefined) {
            // 만기일이 주말·휴장이면 그 앞 마지막 거래일 마감이 끝 · 그 거래일이 오늘이면 오늘 마감(16:00 · 조기 폐장 13:00) 뒤부터 만기
            const lastSession = isNonTradingDay(m[1]) ? prevTradingDate(m[1]) : m[1];
            v = lastSession !== today ? lastSession < today : afterTodayClose;
            memo.set(m[1], v);
        }
        return v;
    };
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
