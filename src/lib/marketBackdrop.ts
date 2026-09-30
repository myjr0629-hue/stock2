/**
 * «지금 시장» 배경 — 지수·선물·10년물을 «세션 꼬리표»와 함께 한 벌로 만든다(순수 함수).
 *
 * 입력은 캐시에 있는 원자료(야후 지수·선물 시세, 대시보드와 같은 10년물 통일본)이고, 출력은
 *   · mode       — 카드가 무엇으로 시작해야 하나: 'cash-live'(정규장) · 'futures'(개장 전·주말 밤, 선물 거래 중)
 *                  · 'cash-closed'(마감 뒤·주말·휴장, 선물도 닫힘)
 *   · cash       — 현물 지수 값 + 그 값이 속한 정규장 날짜(sessionDate) + 살아 있는가(live)
 *   · futures    — 선물이 «실제로» 움직이고 있을 때만 값(달력으로 열림 + 값이 20분 안에 바뀜)
 *   · us10y      — 대시보드(/api/market/macro)와 같은 통일본 + 그 값의 날짜 + bp 변화
 * 를 준다. AI 프롬프트의 FACTS·결정적 문장·출력 검사(시간 꼬리표)도 여기서 만든다.
 *
 * 설계 원칙: 모델 출력은 믿지 않고 검사한다(src/lib/newsYearGuard.ts 와 같은 교리).
 *   «오늘/지금»을 쓸 수 있는 숫자는 LIVE 꼬리표가 붙은 것뿐이다.
 */
import {
    etClock, etDateOfIso, cashPhase, lastClosedSessionDate, isEquityFuturesOpen, prevTradingDate,
    weekdayName, type CashPhase, type SessionLoc,
} from './marketSession';

export interface RawQuote {
    price?: number | null;
    changePct?: number | null;
    /** 벤더가 준 «마지막 체결 시각»(야후 regularMarketTime) */
    marketTime?: string | null;
    /** 값이 마지막으로 «실제로 바뀐» 시각(market-feed 크론이 기록) — 선물 생존 판정의 근거 */
    lastChangeAt?: string | null;
}

/** macroHubProvider 의 factors.us10y(통일본) + 곡선 날짜 */
export interface RawUs10y {
    level: number | null;
    /** ^TNX 기준 전일 종가 대비 변화(%p). 곡선 값을 쓸 때도 같은 세션이면 유효 */
    chgAbs?: number | null;
    /** '^TNX' = 야후 실시간, 'UST:10Y'/'FED:10Y' = 재무부 곡선(일간) */
    symbolUsed?: string | null;
    /** ^TNX 의 마지막 체결 시각 (곡선으로 갈아끼운 뒤에도 TNX 의 것이 남아 있다) */
    marketTime?: string | null;
    /** 재무부 곡선의 날짜 */
    curveDate?: string | null;
    source?: string | null;
}

export interface BackdropInputs {
    nowMs: number;
    nasdaq: RawQuote | null;
    dow: RawQuote | null;
    spx: RawQuote | null;
    /** NQ=F (나스닥100 선물) */
    nq: RawQuote | null;
    /** ES=F (S&P 500 선물) */
    es: RawQuote | null;
    us10y: RawUs10y | null;
}

export type BackdropMode = 'cash-live' | 'futures' | 'cash-closed';
export interface IndexPoint { level: number; changePct: number | null }

export interface MarketBackdrop {
    v: 1;
    clock: { date: string; minutes: number; weekday: number; phase: CashPhase; iso: string };
    /** 달력만으로 정해지는 열쇠 — 이게 바뀌면 이전에 쓴 문장을 그대로 내보내지 않는다 */
    calKey: string;
    mode: BackdropMode;
    cash: { sessionDate: string; live: boolean; nasdaq: IndexPoint | null; dow: IndexPoint | null; spx: IndexPoint | null };
    futures: { live: boolean; asOf: string | null; nq: IndexPoint | null; es: IndexPoint | null };
    us10y: { level: number; changeBp: number | null; sessionDate: string | null; live: boolean; source: string | null } | null;
}

/** 선물 값이 «살아 있다»고 볼 최대 정지 시간 (크론 1분 주기, 새벽의 한산함 감안) */
const FUT_FRESH_MS = 20 * 60_000;

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

function point(q: RawQuote | null): IndexPoint | null {
    const level = num(q?.price);
    return level == null ? null : { level, changePct: num(q?.changePct) };
}

/**
 * 달력 열쇠: ET 날짜 · 현물 구간 · (현물이 오늘 세션이 아닐 때만) 선물 개장 여부.
 * 이 열쇠가 바뀌면 그 전에 쓴 문장은 틀릴 수 있다(«today»가 어제가 되고, 선물이 닫히고…).
 */
export function calendarKey(nowMs: number): string {
    const c = etClock(nowMs);
    const phase = cashPhase(c);
    const futMatters = phase === 'pre-open' || phase === 'closed-day';
    return `${c.date}|${phase}${futMatters ? (isEquityFuturesOpen(nowMs) ? '|F' : '|-') : ''}`;
}

export function buildBackdrop(inp: BackdropInputs): MarketBackdrop {
    const c = etClock(inp.nowMs);
    const phase = cashPhase(c);

    // ── 현물: 그 값이 속한 정규장 날짜 ─────────────────────────────────────
    // 달력이 정본이다. 정규장·마감 뒤엔 오늘, 그 밖(개장 전·주말·휴장)엔 마지막으로 끝난 세션.
    // 벤더 시각은 «더 오래됐을 때»만 믿는다(피드가 멈춘 경우). 더 «새로울» 수는 없다 —
    // 개장 전인데 오늘 날짜를 달고 오면 벤더가 시각만 전진시킨 것이다(yahooFinanceHub 주석 참조).
    const expected = phase === 'regular' || phase === 'after-close' ? c.date : lastClosedSessionDate(inp.nowMs);
    const vendorDates = [inp.nasdaq, inp.dow]
        .map((q) => etDateOfIso(q?.marketTime))
        .filter((d): d is string => !!d)
        .sort();
    const oldest = vendorDates[0] || null;
    const sessionDate = oldest && oldest < expected ? oldest : expected;
    const cashLive = phase === 'regular' && sessionDate === c.date;

    // ── 선물: 달력으로 열려 있고, 값이 실제로 바뀌고 있을 때만 ──────────────
    const futOpen = isEquityFuturesOpen(inp.nowMs);
    const fresh = (q: RawQuote | null) => {
        const t = q?.lastChangeAt ? Date.parse(q.lastChangeAt) : NaN;
        return Number.isFinite(t) && inp.nowMs - t <= FUT_FRESH_MS;
    };
    const nq = futOpen && fresh(inp.nq) ? point(inp.nq) : null;
    const es = futOpen && fresh(inp.es) ? point(inp.es) : null;
    const futLive = !!(nq || es);
    const asOfs = [inp.nq, inp.es].filter((q) => fresh(q)).map((q) => q!.lastChangeAt!).sort();
    const futAsOf = futLive ? asOfs[asOfs.length - 1] || null : null;

    // ── 카드가 무엇으로 시작하나 ────────────────────────────────────────────
    const mode: BackdropMode = cashLive ? 'cash-live'
        : sessionDate < c.date && futLive ? 'futures'
        : 'cash-closed';

    // ── 10년물: 대시보드와 같은 통일본. 그 값의 날짜를 같이 싣는다 ─────────
    let us10y: MarketBackdrop['us10y'] = null;
    const lvl = num(inp.us10y?.level);
    if (inp.us10y && lvl != null) {
        const fromTnx = inp.us10y.symbolUsed === '^TNX';
        const tnxDate = etDateOfIso(inp.us10y.marketTime);
        const curveDate = inp.us10y.curveDate || null;
        const valueDate = fromTnx ? tnxDate : (curveDate || tnxDate);
        // 변화량은 ^TNX 의 전일 대비다. 곡선 값을 헤드라인으로 쓸 땐 «같은 세션»일 때만 유효하다.
        const chg = num(inp.us10y.chgAbs);
        const sameSession = fromTnx || (!!tnxDate && !!curveDate && tnxDate === curveDate);
        us10y = {
            level: Math.round(lvl * 1000) / 1000,
            changeBp: chg != null && sameSession ? Math.round(chg * 1000) / 10 : null,
            sessionDate: valueDate,
            live: fromTnx && valueDate === c.date,
            source: inp.us10y.source || inp.us10y.symbolUsed || null,
        };
    }

    return {
        v: 1,
        clock: { date: c.date, minutes: c.minutes, weekday: c.weekday, phase, iso: new Date(inp.nowMs).toISOString() },
        calKey: calendarKey(inp.nowMs),
        mode,
        cash: { sessionDate, live: cashLive, nasdaq: point(inp.nasdaq), dow: point(inp.dow), spx: point(inp.spx) },
        futures: { live: futLive, asOf: futAsOf, nq, es },
        us10y,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// AI 프롬프트용 FACTS — 숫자마다 시간 꼬리표를 붙인다(모델은 영어로 읽고 목표 언어로 쓴다)
// ═══════════════════════════════════════════════════════════════════════════

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const signed = (x: number, d = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
const fmtLevel = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 2 });

export interface ExtraFacts {
    fed?: { noChange: number | null; hike: number | null; ease: number | null; daysUntilFomc: number | null; asOf: string | null } | null;
    fearGreed?: { score: number | null; rating: string | null } | null;
}

export function factsBlock(b: MarketBackdrop, extra: ExtraFacts = {}): string {
    const day = (d: string) => weekdayName(d, 'en');
    const now = `${day(b.clock.date)} ${b.clock.date}, ${hhmm(b.clock.minutes)} ET`;
    const last = b.cash.sessionDate;
    const lines: string[] = [];

    let status: string;
    if (b.clock.phase === 'regular') status = 'US stock market (cash session): OPEN, trading LIVE now.';
    else if (b.clock.phase === 'pre-open') status = `US stock market (cash session): NOT OPEN YET today (opens 09:30 ET). Last completed session: ${day(last)} ${last}.`;
    else if (b.clock.phase === 'after-close') status = `US stock market (cash session): CLOSED for the day at 16:00 ET — today's session (${day(last)}) is complete.`;
    else status = `US stock market: CLOSED today (${b.clock.weekday === 0 || b.clock.weekday === 6 ? 'weekend' : 'market holiday'}). Last completed session: ${day(last)} ${last}.`;
    status += b.futures.live ? ' Stock-index futures: trading LIVE now.' : ' Stock-index futures: not trading now.';

    const cashTag = b.cash.live ? `[LIVE ${hhmm(b.clock.minutes)} ET]`
        : last === b.clock.date ? `[today's close, ${last}]`
        : `[${day(last)}'s close, ${last} — NOT today]`;
    const cashWhen = b.cash.live ? 'today so far' : last === b.clock.date ? 'on the day' : `on ${day(last)}`;
    if (b.futures.live) {
        const tag = `[LIVE ${hhmm(b.clock.minutes)} ET]`;
        if (b.futures.es?.changePct != null) lines.push(`- ${tag} S&P 500 futures ${signed(b.futures.es.changePct)}% vs the prior settlement`);
        if (b.futures.nq?.changePct != null) lines.push(`- ${tag} Nasdaq-100 futures ${signed(b.futures.nq.changePct)}% vs the prior settlement`);
    }
    if (b.cash.nasdaq) lines.push(`- ${cashTag} NASDAQ Composite ${fmtLevel(b.cash.nasdaq.level)}${b.cash.nasdaq.changePct != null ? ` (${signed(b.cash.nasdaq.changePct)}% ${cashWhen})` : ''}`);
    if (b.cash.dow) lines.push(`- ${cashTag} Dow ${fmtLevel(b.cash.dow.level)}${b.cash.dow.changePct != null ? ` (${signed(b.cash.dow.changePct)}% ${cashWhen})` : ''}`);
    if (b.us10y) {
        const y = b.us10y;
        const prev = y.sessionDate ? prevTradingDate(y.sessionDate) : null;
        const chg = y.changeBp != null && prev ? ` (${signed(y.changeBp, 1)}bp vs ${day(prev)}'s close)` : '';
        const tag = y.live ? `[LIVE ${hhmm(b.clock.minutes)} ET]`
            : y.sessionDate === b.clock.date ? `[today, ${y.sessionDate}]`
            : y.sessionDate ? `[${day(y.sessionDate)}'s close, ${y.sessionDate} — NOT today]` : '[date unknown]';
        lines.push(`- ${tag} US 10-year Treasury yield ${y.level.toFixed(2)}%${chg}`);
    }
    const f = extra.fed;
    if (f && (f.noChange != null || f.hike != null)) {
        const asOf = f.asOf ? `as of ${f.asOf.slice(0, 16).replace('T', ' ')} UTC` : 'latest';
        const parts = [f.noChange != null ? `${f.noChange}% hold` : null, f.hike != null ? `${f.hike}% hike` : null, f.ease != null ? `${f.ease}% cut` : null].filter(Boolean).join(', ');
        lines.push(`- [${asOf}] FedWatch odds for the next FOMC: ${parts}${f.daysUntilFomc != null ? `; next FOMC in ${f.daysUntilFomc} days` : ''}`);
    }
    if (extra.fearGreed?.score != null) lines.push(`- [latest] CNN Fear & Greed ${Math.round(extra.fearGreed.score)}${extra.fearGreed.rating ? ` (${extra.fearGreed.rating})` : ''}`);

    return `CLOCK: ${now}. ${status}\nFACTS (every number carries its time label — keep it when you use the number):\n${lines.join('\n')}`;
}

export const TIME_RULES = `TIME DISCIPLINE (a wrong day is a factual error — this outranks style):
- Use "today", "now", "this morning", "currently" (or the same words in the output language) ONLY for numbers labeled LIVE.
- A number labeled with a past session (e.g. "Friday's close — NOT today") must be written with that day's NAME ("on Friday", "at Friday's close"). NEVER present it as today's move or the current trend.
- If the cash market is not open and futures are LIVE, START with the futures, then give the last session by its day name.
- If nothing is LIVE (weekend, holiday, overnight with futures closed), say the market is closed and describe the last session by its day name.
- For a session that has already closed — even today's — prefer the day's name ("stocks ended Monday lower").
- The [square-bracket] labels are for you: never print them (no "(LIVE)", no "NOT today"); say the time in words ("as of 08:56 ET", "at Friday's close").
- Clock times: copy them in 24-hour form with "ET" exactly as given ("12:33 ET") — never convert to AM/PM (오전/오후, 午前/午後) or to another time zone.`;

// ═══════════════════════════════════════════════════════════════════════════
// 결정적 문장 — AI 가 실패하거나 시간 검사를 두 번 못 넘으면 이걸 쓴다(틀린 문장보다 이게 낫다)
// ═══════════════════════════════════════════════════════════════════════════

const abs2 = (x: number) => Math.abs(x).toFixed(2);

export function backdropText(b: MarketBackdrop, loc: SessionLoc): string | null {
    const wd = (d: string) => weekdayName(d, loc);
    const out: string[] = [];
    const n = b.cash.nasdaq?.changePct ?? null;
    const d = b.cash.dow?.changePct ?? null;
    const es = b.futures.es?.changePct ?? null;
    const nq = b.futures.nq?.changePct ?? null;
    const last = b.cash.sessionDate;
    const sameDay = last === b.clock.date;
    const xs = [n, d].filter((x): x is number => x != null);
    const trend = !xs.length ? null : xs.every((x) => x > 0) ? 'up' : xs.every((x) => x < 0) ? 'down' : 'mixed';
    const y = b.us10y;
    const yPrev = y?.sessionDate ? prevTradingDate(y.sessionDate) : null;
    const yToday = !!y && (y.live || y.sessionDate === b.clock.date);

    if (loc === 'en') {
        const mv = (x: number) => (x >= 0 ? `up ${abs2(x)}%` : `down ${abs2(x)}%`);
        // «A is up 1% and B is down 2%» — 둘 중 하나만 있으면 그것만
        const both = (a: number | null, an: string, c: number | null, cn: string, verb: string) =>
            a != null && c != null ? `${an} ${verb} ${mv(a)} and ${cn} ${mv(c)}`
                : a != null ? `${an} ${verb} ${mv(a)}` : c != null ? `${cn} ${verb} ${mv(c)}` : '';
        if (b.mode === 'futures') {
            const f = es != null && nq != null ? `S&P 500 futures are ${mv(es)} and Nasdaq-100 futures are ${mv(nq)}`
                : es != null ? `S&P 500 futures are ${mv(es)}` : nq != null ? `Nasdaq-100 futures are ${mv(nq)}` : '';
            if (f) out.push(`Before the open, ${f}.`);
            const cs = both(n, 'the Nasdaq', d, 'the Dow', 'closed');
            if (cs) out.push(`On ${wd(last)}, ${cs}.`);
        } else if (b.mode === 'cash-live') {
            const cs = both(n, 'the Nasdaq', d, 'the Dow', 'is');
            if (cs) out.push(`Stocks are ${trend === 'up' ? 'higher' : trend === 'down' ? 'lower' : 'mixed'} today: ${cs}.`);
        } else {
            const cs = both(n, 'the Nasdaq', d, 'the Dow', 'closed');
            if (cs) out.push(sameDay
                ? `Stocks ended ${wd(last)} ${trend === 'up' ? 'higher' : trend === 'down' ? 'lower' : 'mixed'}: ${cs}.`
                : `U.S. markets are closed. On ${wd(last)}, ${cs}.`);
        }
        if (y && yToday) {
            const bp = y.changeBp == null || !yPrev ? '' : y.changeBp === 0 ? `, unchanged from ${wd(yPrev)}'s close`
                : `, ${y.changeBp > 0 ? 'up' : 'down'} ${Math.abs(y.changeBp)}bp from ${wd(yPrev)}'s close`;
            out.push(`The 10-year Treasury yield is ${y.level.toFixed(2)}%${bp}.`);
        } else if (y?.sessionDate) out.push(`The 10-year Treasury yield closed ${wd(y.sessionDate)} at ${y.level.toFixed(2)}%.`);
    } else if (loc === 'ko') {
        const mv = (x: number) => `${abs2(x)}% ${x >= 0 ? '상승' : '하락'}`;
        const cs = [n != null ? `나스닥 ${mv(n)}` : null, d != null ? `다우 ${mv(d)}` : null].filter(Boolean).join(', ');
        const tk = trend === 'up' ? '상승' : trend === 'down' ? '하락' : '혼조';
        if (b.mode === 'futures') {
            const f = [es != null ? `S&P 500 선물은 ${mv(es)}` : null, nq != null ? `나스닥100 선물은 ${mv(nq)}` : null].filter(Boolean).join(', ');
            if (f) out.push(`개장 전 선물 시장에서 ${f} 중입니다.`);
            if (cs) out.push(`${wd(last)} 종가 기준 ${cs}.`);
        } else if (b.mode === 'cash-live') {
            if (cs) out.push(`오늘 미국 증시는 ${tk}세입니다: ${cs}.`);
        } else if (cs) {
            out.push(sameDay ? `${wd(last)} 미국 증시는 ${tk} 마감했습니다: ${cs}.` : `지금은 미국 증시 휴장 중입니다. ${wd(last)} 종가 기준 ${cs}.`);
        }
        if (y && yToday) {
            const bp = y.changeBp == null || !yPrev ? '' : y.changeBp === 0 ? ` ${wd(yPrev)} 종가와 같습니다`
                : ` ${wd(yPrev)} 종가보다 ${Math.abs(y.changeBp)}bp ${y.changeBp > 0 ? '높습니다' : '낮습니다'}`;
            out.push(bp ? `미 10년물 금리는 ${y.level.toFixed(2)}%로${bp}.` : `미 10년물 금리는 ${y.level.toFixed(2)}%입니다.`);
        } else if (y?.sessionDate) out.push(`미 10년물 금리는 ${wd(y.sessionDate)} ${y.level.toFixed(2)}%로 마감했습니다.`);
    } else {
        const mv = (x: number) => `${abs2(x)}%${x >= 0 ? '高' : '安'}`;
        const tj = trend === 'up' ? '上昇' : trend === 'down' ? '下落' : 'まちまち';
        if (b.mode === 'futures') {
            const f = [es != null ? `S&P500先物が${mv(es)}` : null, nq != null ? `ナスダック100先物が${mv(nq)}` : null].filter(Boolean).join('、');
            if (f) out.push(`寄り付き前の先物は、${f}。`);
            const cs = [n != null ? `ナスダックが${mv(n)}` : null, d != null ? `ダウが${mv(d)}` : null].filter(Boolean).join('、');
            if (cs) out.push(`${wd(last)}の終値は${cs}でした。`);
        } else if (b.mode === 'cash-live') {
            const cs = [n != null ? `ナスダック${mv(n)}` : null, d != null ? `ダウ${mv(d)}` : null].filter(Boolean).join('、');
            if (cs) out.push(`今日の米国株は${tj}: ${cs}。`);
        } else {
            const cs = sameDay
                ? [n != null ? `ナスダック${mv(n)}` : null, d != null ? `ダウ${mv(d)}` : null].filter(Boolean).join('、')
                : [n != null ? `ナスダックが${mv(n)}` : null, d != null ? `ダウが${mv(d)}` : null].filter(Boolean).join('、');
            if (cs) out.push(sameDay ? `${wd(last)}の米国株は${tj}で引けました: ${cs}。` : `米国市場は休場中です。${wd(last)}の終値は${cs}でした。`);
        }
        if (y && yToday) {
            const bp = y.changeBp == null || !yPrev ? '' : y.changeBp === 0 ? `、${wd(yPrev)}終値と同水準`
                : `、${wd(yPrev)}終値比${Math.abs(y.changeBp)}bp${y.changeBp > 0 ? '上昇' : '低下'}`;
            out.push(`米10年債利回りは${y.level.toFixed(2)}%${bp}。`);
        } else if (y?.sessionDate) out.push(`米10年債利回りは${wd(y.sessionDate)}に${y.level.toFixed(2)}%で引けました。`);
    }
    // 일본어는 문장 사이에 띄어쓰기를 하지 않는다
    return out.length ? out.join(loc === 'ja' ? '' : ' ') : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 출력 검사 — «지난 세션 숫자를 오늘/지금이라고 부른 문장»을 잡는다
// ═══════════════════════════════════════════════════════════════════════════

const NOW_RE: Record<SessionLoc, RegExp> = {
    en: /\b(today|today's|tonight|this morning|right now|now|currently|so far)\b/i,
    ko: /오늘|금일|현재|지금/,
    ja: /今日|本日|現在|いま|今朝|足元/,
};
const CASH_RE: Record<SessionLoc, RegExp> = {
    en: /\b(stocks?|equities|wall street|nasdaq|dow|s&p)\b/i,
    ko: /나스닥|다우|S&P|증시|주식|주가|뉴욕/,
    ja: /ナスダック|ダウ|S&P|株|NY市場|米国市場/,
};
const FUT_RE: Record<SessionLoc, RegExp> = { en: /futures/i, ko: /선물/, ja: /先物/ };
const TENY_RE: Record<SessionLoc, RegExp> = { en: /10-?year|\b10y\b|treasur/i, ko: /10년물|국채/, ja: /10年債|国債/ };
const PAST_RE: Record<SessionLoc, RegExp> = {
    en: /last session|previous session|prior session|last week|week's close/i,
    ko: /지난 거래일|직전 거래일|지난주|전 거래일/,
    ja: /前営業日|先週/,
};

function sentences(text: string): string[] {
    return text.split(/(?<=[.!?])\s+|(?<=[。！？])/).map((s) => s.trim()).filter(Boolean);
}

/**
 * 시간 꼬리표 위반을 찾는다. 위반이면 문제 문장을, 아니면 null.
 * 대상: 현물 지수 값이 «오늘 것이 아닌데» 오늘/지금이라고 쓴 문장, 10년물도 같다.
 * 그 세션의 요일 이름(또는 «지난 거래일» 류)이 같은 문장에 있으면 통과.
 */
export function timeLabelViolation(text: string | null | undefined, b: MarketBackdrop, loc: SessionLoc): string | null {
    if (!text) return null;
    const cashPast = b.cash.sessionDate !== b.clock.date;
    const tenyPast = !!b.us10y && !b.us10y.live && !!b.us10y.sessionDate && b.us10y.sessionDate !== b.clock.date;
    if (!cashPast && !tenyPast) return null;
    const dayWords = (date: string) => [loc === 'ja' ? weekdayName(date, loc).replace(/日$/, '') : weekdayName(date, loc)];
    const has = (s: string, words: string[]) => words.some((w) => s.toLowerCase().includes(w.toLowerCase()));
    for (const s of sentences(text)) {
        if (!NOW_RE[loc].test(s) || PAST_RE[loc].test(s)) continue;
        if (cashPast && CASH_RE[loc].test(s) && !FUT_RE[loc].test(s) && !has(s, dayWords(b.cash.sessionDate))) return s;
        if (tenyPast && TENY_RE[loc].test(s) && !has(s, dayWords(b.us10y!.sessionDate!))) return s;
    }
    return null;
}
