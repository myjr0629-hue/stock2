/**
 * 감사 10/23 M7 — 마감 뒤 만든 섹터 스냅샷의 가격을 그 세션의 «공식» 종가로 맞추는 읽기 · M9(연관 종목 행)도 같은 읽기(T12, 아래).
 *
 * 읽기는 이미 적재된 EOD(벌크·20거래일 종가 행렬)뿐이다 — 벤더 API 콜 0. 15:57 세션 캡처는 쓰지 않는다.
 * 필요한 종가가 없으면 null — 호출자는 저장값을 그대로 쓴다(빈칸을 만들지 않는다).
 */
import { peekOfficialSessionClose } from './intrinioClient';
import { etDateOf, etLastClosedSessionDate, etMinutesOf, isNonTradingDay, prevTradingDate, sessionCloseMinutes } from '@/lib/marketCalendar';

/**
 * [M7] 마감 뒤 만든 섹터 스냅샷의 close_price·change_pct 를 그 세션의 «공식» 종가로 맞춘다.
 * 만들 때(17시대 ET)는 벤더 일봉 게시 전이라 «정규장 마지막 체결»이 종가 자리에 앉는다(MSFT 521.62 ↔ 종가 521.08).
 * 공식 종가가 적재되기 전이거나 스냅샷이 장중에 만들어졌으면 그대로 둔다.
 */
export async function officialCloseForSnapshot(snapshotTsIso: unknown): Promise<null | ((ticker: string) => Promise<{ close: number; prevClose: number } | null>)> {
    const ts = typeof snapshotTsIso === 'string' ? Date.parse(snapshotTsIso) : NaN;
    if (!Number.isFinite(ts)) return null;
    const date = etDateOf(ts);
    if (isNonTradingDay(date) || etMinutesOf(ts) < sessionCloseMinutes(date)) return null;
    const prev = prevTradingDate(date);
    return (ticker: string) => peekOfficialSessionClose(ticker, date, prev).catch(() => null);
}

// ══════════════════════════════════════════════════════════════════════
// [T12 · 감사 10/23 M9] 연관 종목(related.topRelated) 행 — 끝난 세션을 보여 줄 시간엔 «그 세션의 공식 종가 한 쌍»으로.
//
// [사고] 10/25(토) 운영: /api/command/unified?t=NVDA `_source:cache`·`_ageMs` 40시간 — 연관 GOOGL 324.2(−3.15%) = 10/22 세션 값.
//   마지막으로 끝난 정규장은 10/23(GOOGL 공식 종가 320.21, −1.24% · 직접 /api/live/related 321.11 시간외 포함 −0.96%).
//   unified 캐시는 «목록이 있으면 usable»이라 세션이 바뀌어도 related 를 다시 받지 않는다(isFieldUsable).
//   웹 종목 화면(LiveTickerDashboard)은 unified 의 related 를 직접 조회 값 위에 합치고(«prevClose: 새 행 || 옛 행»), prevClose 를 실시간 등락 분모로 쓴다.
//
// [규칙] 화면이 «끝난 세션 S»를 보여 줄 시간(그 세션 마감 뒤 ~ 다음 거래일 04:00 ET 프리마켓 전 · 주말 · 휴장)에만,
//   행마다 peekOfficialSessionClose(종목, S, S 직전 거래일) — M7 과 같은 공식 종가 한 쌍(15:57 캡처 제외) — 이 있으면
//   price = S 종가 · change = S 등락률(직전 거래일 공식 종가 대비) · prevClose = 직전 거래일 공식 종가(직접 API 의 prevDay.c 와 같은 뜻 —
//   원래 분모가 있던 행만)로 바꾸고
//   closeSession = S · asOf = 계산 시각을 싣는다.
//   · 기준 세션을 값과 함께 저장: 직접 API 가 행마다 session(공급사 스냅샷의 본장 날짜 _intrinio.regularDate)·asOf 를 싣는다.
//     session = S 이고 S 마감 뒤에 계산했고 가격이 있는 행은 그대로(직접 API 와 같은 값 — 시간외 체결 포함) — 다르거나 없으면(DynamoDB 수확본·장중 값·옛 캐시·
//     공급사 스냅샷이 아직 전 세션·일봉 폴백) 공식 한 쌍으로 다시 계산한다(읽은 시각으로 기준을 정하지 않는다 — 관문 10250504 ①)
//   · 공식 값이 아직 없거나(마감 직후 게시 전) 못 읽으면 그 행은 그대로(0·보합을 만들지 않는다)
//   · 프리마켓~마감(다음 세션이 살아 있는 구간)에는 손대지 않는다 — 행은 실시간 값이어야 하고, 공식 종가로 메우면 실시간 분모가 틀어진다
//   · GOOG 는 직접 API(/api/live/related SNAPSHOT_ALIAS)와 같이 GOOGL 값을 쓴다
//   · 범위(관문 10250519 뒤 축소): 웹 병합 규칙(LiveTickerDashboard)은 바꾸지 않는다 — 서버가 내는 행만 고친다. 직접 API·unified 출구·종목 SSR 이 같은 함수.
//   ⛔ 벤더 호출 0 · 저장본 쓰기 0(이미 적재된 EOD 읽기) · 1.5초 상한(넘으면 그대로)
// ══════════════════════════════════════════════════════════════════════

/** 연관 종목 행이 «끝난 세션»을 보여 줄 시간이면 그 세션(ET YYYY-MM-DD), 다음 세션이 살아 있는 구간이면 null */
export function relatedCompletedSession(nowMs: number = Date.now()): string | null {
    const today = etDateOf(nowMs);
    const session = etLastClosedSessionDate(nowMs);
    if (!isNonTradingDay(today) && today !== session && etMinutesOf(nowMs) >= 4 * 60) return null;
    return session;
}

/** asOf(ms) 가 그 세션 정규장 마감(평소 16:00 · 조기 폐장 13:00 ET) 뒤인가 */
function computedAfterClose(asOf: unknown, session: string): boolean {
    if (typeof asOf !== 'number' || !Number.isFinite(asOf) || asOf <= 0) return false;
    const d = etDateOf(asOf);
    return d > session || (d === session && etMinutesOf(asOf) >= sessionCloseMinutes(session));
}

const RELATED_PRICE_ALIAS: Record<string, string> = { GOOG: 'GOOGL' };
const round2 = (n: number) => Math.round(n * 100) / 100;

/** related 블록(topRelated 행 배열)을 위 규칙으로 고친 새 객체 — 바꿀 것이 없으면 같은 객체 */
export async function officialCloseRelated<T = any>(related: T, nowMs: number = Date.now(), budgetMs = 1500): Promise<T> {
    const rows: any[] | undefined = (related as any)?.topRelated;
    if (!Array.isArray(rows) || rows.length === 0) return related;
    const session = relatedCompletedSession(nowMs);
    if (!session) return related;
    const prev = prevTradingDate(session);
    // 그대로 두는 행 = 공급사가 말한 본장 날짜가 S 이고, S 마감 «뒤»에 계산했고(장중 값이 아니다), 가격이 있는 행
    const need = (row: any) => !(row?.session === session && Number(row?.price) > 0 && computedAfterClose(row?.asOf, session));
    if (!rows.some(need)) return related;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = Promise.all(rows.map(async (row) => {
        const t = typeof row?.ticker === 'string' ? row.ticker.toUpperCase() : '';
        if (!t || !need(row)) return null;
        return peekOfficialSessionClose(RELATED_PRICE_ALIAS[t] || t, session, prev).catch(() => null);
    }));
    const pairs = await Promise.race([work, new Promise<null>((r) => { timer = setTimeout(() => r(null), budgetMs); })]).catch(() => null);
    if (timer) clearTimeout(timer);
    if (!pairs) return related;
    let changed = false;
    const next = rows.map((row, i) => {
        const p = pairs[i];
        if (!p || !(p.close > 0) || !(p.prevClose > 0)) return row;
        changed = true;
        // prevClose 는 원래 분모가 있던 행만 바꾼다 — 분모 없던 행(수확본)에 새로 넣으면 웹 병합(«새 행 || 옛 행»)이
        //   직접 API 의 더 새 분모를 덮을 수 있다(관문 10250519 ③ 와 같은 경로). 등락률은 공식 한 쌍으로.
        return { ...row, price: round2(p.close), change: round2((p.close - p.prevClose) / p.prevClose * 100),
            prevClose: Number(row?.prevClose) > 0 ? round2(p.prevClose) : row?.prevClose, session, closeSession: session, asOf: nowMs };
    });
    return changed ? ({ ...(related as any), topRelated: next } as T) : related;
}
