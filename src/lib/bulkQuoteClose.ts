/**
 * 31개 이상 한 요청(벌크 스냅샷 경로)의 «종가 자리» 값 바로잡기 — 순수 함수.
 *
 * 사고(10/13 실측 · Intel 섹터 화면): 운영 /api/live/quotes 를 31개 이상 한 요청에 보내면(Intel 화면은 섹터 90여 종목을 5초마다 한 요청으로 묻는다)
 *   서버가 종목별 실시간 스냅샷(≤30개, 정확) 대신 벌크 경로(벤더 EOD + NBBO 호가 중간값 캐시)로 간다. 그 경로는 day.c 를
 *   «EOD 종가 대신 지금 호가 중간값»으로 채웠다 → 마감·애프터·프리엔 시간외 호가 중간값이 «정규장 종가» 자리에 앉았다:
 *     NVDA 마감 뒤 price 224.54(시간외 중간값) · 실제 정규장 종가 226.32, 등락 −2.07%(실제 −1.29%) · GOOGL 353.33(실제 352.72) · AMZN 259.625(실제 259.53)
 *   Intel 섹터 화면은 처음 맞게 그렸다가 약 10초 뒤 첫 시세 폴링이 이 값으로 덮어썼다(헤드리스 크롬 실측).
 * 시세 계약(oneNumberFromQuote 주석): 마감·애프터의 price = 오늘 정규장 종가 · 프리의 price = 마지막 정규장 종가(previousClose 는 그 한 세션 앞).
 *   벌크 경로 행에는 EOD 의 종가(_eodClose)·등락(_eodChg)·날짜(_eodDate)가 같이 실려 있다 — 그 날짜가 «마지막으로 끝난 정규장»이면 그 값이 정답이다.
 *   (벤더 호출 0 — 이미 읽은 값만 쓴다. EOD 가 아직 그 세션을 못 따라왔으면 손대지 않는다.)
 * 정규장 중(regular)은 이 함수를 부르지 않는다 — 거기선 호가 중간값이 «지금가»다(5분 캐시 한계는 별개).
 */
export interface BulkSnapshotLike {
    day?: { c?: number } & Record<string, any>;
    prevDay?: { c?: number } & Record<string, any>;
    _eodDate?: string;
    _eodClose?: number;
    _eodChg?: number;
    [k: string]: any;
}

export function correctBulkSnapshot<T extends BulkSnapshotLike | null | undefined>(snapshot: T, lastClosedSession: string): T {
    const S = snapshot as BulkSnapshotLike | null | undefined;
    if (!S || typeof S !== 'object') return snapshot;
    const close = Number(S._eodClose);
    const chg = Number(S._eodChg);
    if (!(close > 0) || !Number.isFinite(chg) || !S._eodDate || S._eodDate !== lastClosedSession) return snapshot;
    const prev = close - chg;
    if (!(prev > 0)) return snapshot;
    return {
        ...S,
        day: { ...(S.day || {}), c: close },
        prevDay: { ...(S.prevDay || {}), c: prev },
        todaysChange: close - prev,
        todaysChangePerc: ((close - prev) / prev) * 100,
        _closeCorrected: true,
    } as unknown as T;
}

/** Provenance for the existing live/quotes regular value. No prices or calculations are changed. */
export function regularQuoteProvenance(snapshot: any, session: string, price: number) {
  const i = snapshot?._intrinio;
  const time = (v: unknown): number => typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) || 0 : 0;
  const date = (v: unknown): string | null => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  if (session === 'regular') {
    return { regularDate: null, regularTime: time(snapshot?.priceTime ?? Number(snapshot?.lastTrade?.t) / 1e6), regularKind: 'live' as const };
  }
  if (snapshot?._closeCorrected && snapshot._eodClose === price) {
    return { regularDate: date(snapshot._eodDate), regularTime: 0, regularKind: 'close' as const };
  }
  if (i?.regularClose === price && date(i.regularDate)) {
    const closed = i.eodCloseDate === i.regularDate && i.eodClosePrice === price;
    return { regularDate: date(i.regularDate), regularTime: closed ? 0 : time(i.regularLastTime), regularKind: closed ? 'close' as const : 'live' as const };
  }
  // Unknown close provenance stays unranked; response timestamps are never measurement timestamps.
  return { regularDate: null, regularTime: 0, regularKind: 'unknown' as const };
}
