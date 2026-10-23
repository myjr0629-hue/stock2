/**
 * 캐시가 들고 있는 «가격 파생값»을 최신 공식 종가로 맞춘다 — 감사 10/23 M7·M9 (M1 재무 밸류에이션은 별도 재설계).
 *
 * 모든 읽기는 이미 적재된 EOD(벌크·20거래일 종가 행렬)뿐이다 — 벤더 API 콜 0. 15:57 세션 캡처는 쓰지 않는다.
 * 필요한 종가가 없으면 원래 값을 그대로 돌려준다(빈칸을 만들지 않는다).
 */
import { peekLatestCloseRow, peekOfficialSessionClose } from './intrinioClient';
import { etDateOf, etLastClosedSessionDate, etMinutesOf, isNonTradingDay, prevTradingDate, sessionCloseMinutes } from '@/lib/marketCalendar';

/**
 * 최신 «끝난» 정규장의 공식 종가 — 15:57 캡처(provisional)는 쓰지 않는다. 최신 행이 캡처이거나 아직 안 끝난 날짜면
 * 마지막으로 끝난 정규장의 공식 종가(벌크·20거래일 행렬)를 대신 찾는다. 없으면 null(원래 값 그대로).
 */
async function latestClosedRow(ticker: string, nowMs = Date.now()) {
    const lastClosed = etLastClosedSessionDate(nowMs);
    const row = await peekLatestCloseRow(ticker);
    if (row && row.close > 0 && !row.provisional && row.date <= lastClosed) return row;
    const o = await peekOfficialSessionClose(ticker, lastClosed, prevTradingDate(lastClosed));
    return o ? { date: lastClosed, close: o.close, prevClose: o.prevClose, provisional: false } : null;
}

/**
 * [M9] unified 캐시의 연관 종목 가격·등락 — 최신 «끝난» 정규장 D 의 종가로 바꾸는 것은 그 행이 D 이전 세션 값일 때만이다.
 *   · 행의 직전 종가 = D 종가(공식이면 반 센트 · 캡처면 0.3 % 안) → D 다음 세션 값일 수 있다(장중 보충·보합일 포함) → 그대로
 *   · 행의 직전 종가 = D 전일 종가(반 센트)뿐 → D 세션 값(장중 가격) → D 종가로
 *   · 둘 다 아니면 판본이 D 마감 전에 만들어졌을 때만
 * EOD 가 최신 끝난 정규장을 아직 못 따라왔으면 아무것도 바꾸지 않는다.
 */
export async function repriceRelated(related: any, cachedAtMs: number): Promise<any> {
    try {
        const list = related?.topRelated;
        if (!Array.isArray(list) || !list.length) return related;
        let changed = false;
        const next = await Promise.all(list.map(async (item: any) => {
            if (!item || typeof item.ticker !== 'string') return item;
            const row = await latestClosedRow(item.ticker).catch(() => null);
            if (!row || row.prevClose === null || row.date !== etLastClosedSessionDate(Date.now())) return item;
            const pc = Number(item.prevClose);
            const ok = Number.isFinite(pc) && pc > 0;
            const isNextSession = ok && (row.provisional ? Math.abs(pc - row.close) / row.close <= 0.003 : Math.abs(pc - row.close) < 0.005);
            const isSameSession = ok && Math.abs(pc - row.prevClose) < 0.005;
            // 다음 세션 값일 수 있으면(두 종가가 같은 보합일 포함) 최신 행을 보존한다 — 덮지 않는다.
            if (isNextSession) return item;
            if (!isSameSession && !(sessionCloseMs(row.date) > cachedAtMs)) return item;
            changed = true;
            return {
                ...item,
                price: Math.round(row.close * 100) / 100,
                prevClose: row.prevClose,
                change: Math.round(((row.close - row.prevClose) / row.prevClose) * 10000) / 100,
            };
        }));
        return changed ? { ...related, topRelated: next } : related;
    } catch { return related; }
}

/**
 * [M9] command/unified 의 모든 출구 공통 — 판본(data)의 연관 종목 가격·등락만 맞춘다. 바뀐 게 없으면 data 그대로.
 */
export async function repriceCachedDerived(data: any, _ticker?: string | null): Promise<any> {
    if (!data || typeof data !== 'object' || !data.related) return data;
    try {
        const related = await repriceRelated(data.related, Number(data.timestamp));
        return related === data.related ? data : { ...data, related };
    } catch { return data; }
}

/** 'YYYY-MM-DD' 정규장 마감 시각(ms) — ET 오프셋은 그날 정오의 오프셋으로 정한다. */
function sessionCloseMs(date: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    if (!m) return Number.POSITIVE_INFINITY;
    const noonUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
    const etNoonMin = etMinutesOf(noonUtc);           // 12:00 UTC 의 ET 분 (EDT 480 · EST 420)
    const offsetMin = 12 * 60 - etNoonMin;            // UTC − ET
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) + (sessionCloseMinutes(date) + offsetMin) * 60_000;
}

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
