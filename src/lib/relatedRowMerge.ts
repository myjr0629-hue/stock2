/**
 * 연관 종목(RELATED PEERS) 행 병합·실시간 분모 — 웹(LiveTickerDashboard)·앱(MobileCmdOverview) 공용 순수 함수. 시계는 인자로만, I/O 0.
 *
 * [정의 — 10/26 GOOGL 321.11 −0.96% 사고 뒤]
 *   정규장 중엔 실시간, 정규장 밖(PRE·POST·CLOSED·주말·휴장)엔 «가장 최근 정규장» 공식 종가와 그 전 정규장 대비 등락.
 *   행마다 기준 정규장 날짜를 들고 다닌다 — 공식 행 = closeSession(stalePriceRepair 가 붙인다), 스냅샷·실시간 행 = session(공급사 본장 날짜).
 *   병합 순서는 «요청 시각»이 아니라 그 날짜로 정한다:
 *     · 정규장 밖(목표 = 직전 끝난 정규장 S*): S* 공식 행 > 더 최근 기준 날짜 > 같은 날짜면 공식 행
 *     · 정규장 중(오늘 D): 더 최근 기준 날짜 > 같은 날짜면 실시간 행
 *     · 순위가 같을 때만 원천 시각(asOf)으로 늦게 도착한 옛 응답을 거절한다(관문 1010 — 부호 역전)
 *   이긴 행의 가격·등락·분모·기준을 한 묶음으로 쓴다(서로 다른 기준의 값을 섞지 않는다).
 *   · 가격 0 실패 행은 이전 행 전체 유지(ABSOLUTE FIX V2)
 *   · 가격이 있고 분모(또는 공식 표식)가 있는 0% 는 정상 보합(관문 1305 ②) — 분모·표식 없는 0 만 «모름»으로 본다(옛 규칙)
 */
import { cashSessionPhaseAt, etDateOf, etLastClosedSessionDate, prevTradingDate } from './marketCalendar';

interface RelatedRow {
    price: number;
    change: number;
    prevClose?: number;
    asOf?: number | null;
    session?: string | null;
    closeSession?: string | null;
}

const validAsOf = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
const ymd = (value: unknown): string =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
const priced = (row: RelatedRow | null | undefined): row is RelatedRow => !!row && Number(row.price) > 0;

/** 그 시각의 연관 행 문맥 — 정규장이면 오늘(D), 아니면 직전 끝난 정규장(S*). 달력이 정본(휴장·조기 폐장 포함). */
export function relatedSessionContext(nowMs: number): { regular: boolean; date: string } {
    const regular = cashSessionPhaseAt(nowMs) === 'regular';
    return { regular, date: regular ? etDateOf(nowMs) : etLastClosedSessionDate(nowMs) };
}

/** 행의 기준 정규장 날짜 — 공식 행은 closeSession, 그 밖은 session. 모르면 '' */
function basisDate(row: RelatedRow): string {
    return ymd(row.closeSession) || ymd(row.session);
}

/** 사전식 비교용 순위(클수록 우선). 가격 0 실패 행은 null */
function rank(row: RelatedRow | null | undefined, ctx: { regular: boolean; date: string }): [number, string, number] | null {
    if (!priced(row)) return null;
    const official = !!ymd(row.closeSession);
    const date = basisDate(row);
    if (ctx.regular) return [0, date, official ? 0 : 1];
    return [official && row.closeSession === ctx.date ? 1 : 0, date, official ? 1 : 0];
}

function compareRank(a: [number, string, number], b: [number, string, number]): number {
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return a[2] - b[2];
}

function keepOld<T extends RelatedRow>(oldItem: T, newItem: T): T {
    return {
        ...newItem,
        price: oldItem.price,
        change: oldItem.change,
        prevClose: oldItem.prevClose,
        asOf: oldItem.asOf,
        session: oldItem.session,
        closeSession: oldItem.closeSession,
    };
}

export function mergeRelatedRow<T extends RelatedRow>(oldItem: T | null | undefined, newItem: T, nowMs: number): T {
    const ctx = relatedSessionContext(nowMs);
    const oldRank = rank(oldItem, ctx);
    if (!oldItem || !oldRank) return newItem;
    const newRank = rank(newItem, ctx);
    // 가격 0 실패 행 — 이전 행의 가격·등락·분모·시각·기준을 그대로 지킨다(시각이 없어도 비교 기준을 잃지 않는다, 관문 1010).
    if (!newRank) return keepOld(oldItem, newItem);
    const order = compareRank(newRank, oldRank);
    if (order < 0) return keepOld(oldItem, newItem);
    // 같은 기준 — 두 원천 시각이 모두 있을 때만 비교한다(한쪽이 없으면 기존 도착 순서·분모 보충, 관문 10250519).
    if (order === 0 && validAsOf(oldItem.asOf) && validAsOf(newItem.asOf) && newItem.asOf < oldItem.asOf) return keepOld(oldItem, newItem);
    const sameBasis = !basisDate(oldItem) || !basisDate(newItem) || basisDate(oldItem) === basisDate(newItem);
    // 분모·공식 표식 없는 0 은 «등락 모름»(수확본·분모 없는 스냅샷) — 같은 기준의 이전 등락을 유지(옛 V2 규칙).
    const unknownChange = newItem.change === 0 && !(Number(newItem.prevClose) > 0) && !ymd(newItem.closeSession);
    return {
        ...newItem,
        change: unknownChange && sameBasis ? oldItem.change : newItem.change,
        // 분모 보충은 같은 기준(또는 기준 모름)일 때만 — 다른 정규장의 분모를 섞지 않는다.
        prevClose: newItem.prevClose || (sameBasis ? oldItem.prevClose : newItem.prevClose),
    };
}

/**
 * 정규장 중 실시간(WebSocket) 가격의 등락 분모 — «오늘 D 의 직전 정규장 종가».
 *   · 공식 행(closeSession = D 직전 거래일) → 그 공식 종가(행 가격). PRE 에 받은 행이 REG 로 넘어가도 분모가 맞다(관문 1305 ①)
 *   · D 의 실시간 행 → 그 행의 prevClose(공급사 전일 종가)
 *   · 기준 날짜 없는 옛 행 → prevClose(기존 동작)
 *   · 그 밖(기준이 오래된 행) → 0 = 분모 모름(화면은 기존 무분모 경로)
 */
export function relatedLivePrevClose(row: RelatedRow | null | undefined, nowMs: number): number {
    if (!row) return 0;
    const today = etDateOf(nowMs);
    const close = ymd(row.closeSession);
    if (close) return close === prevTradingDate(today) && Number(row.price) > 0 ? row.price : 0;
    const session = ymd(row.session);
    if (session && session !== today) return 0;
    return Number(row.prevClose) > 0 ? Number(row.prevClose) : 0;
}
