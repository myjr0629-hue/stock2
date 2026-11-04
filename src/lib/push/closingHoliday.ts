// 마감 푸시 «휴장 관문» — 시장 달력(lib/marketCalendar)이 정본이다.
//
// [2026-11-05 서머타임 종료 감사] 예전 관문은 «오늘 SPY 일봉이 공급사에 있나»로 휴장을 추측했다.
//   EDT 때 첫 마감 푸시(22:00 UTC)는 18:00 ET 라 일봉이 이미 있었지만, EST(11/1~)에는 17:00 ET 라 아직 없다 →
//   11/2·11/3 둘 다 22:00 UTC 회차가 «no SPY session bar (market holiday)»로 건너뛰고 22:20 UTC(07:20 KST)에야 나갔다.
//   공급사 게시 지연이 조금만 더 길면 22:40 회차까지 놓쳐 그날 마감 푸시가 0 이 된다.
//   → 휴장은 값으로 추측하지 않는다: 주말·휴장(US_MARKET_HOLIDAYS)이면 건너뛰고, 거래일이면 아래 관문(스냅샷 완료 표식 + 오늘 브리프)만 본다.
import { isNonTradingDay } from '@/lib/marketCalendar';

/** 오늘(ET 'YYYY-MM-DD')이 마감 푸시를 보내면 안 되는 날이면 사유, 아니면 null */
export function closingPushHolidayReason(todayET: string): 'market-holiday' | null {
    return isNonTradingDay(todayET) ? 'market-holiday' : null;
}
