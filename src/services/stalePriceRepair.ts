/**
 * 감사 10/23 M7 — 마감 뒤 만든 섹터 스냅샷의 가격을 그 세션의 «공식» 종가로 맞추는 읽기 (M1·M9 는 별도 재설계).
 *
 * 읽기는 이미 적재된 EOD(벌크·20거래일 종가 행렬)뿐이다 — 벤더 API 콜 0. 15:57 세션 캡처는 쓰지 않는다.
 * 필요한 종가가 없으면 null — 호출자는 저장값을 그대로 쓴다(빈칸을 만들지 않는다).
 */
import { peekOfficialSessionClose } from './intrinioClient';
import { etDateOf, etMinutesOf, isNonTradingDay, prevTradingDate, sessionCloseMinutes } from '@/lib/marketCalendar';

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
