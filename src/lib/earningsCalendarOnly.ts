// ============================================================================
// «캘린더 표시 전용» 대형주 회사 공지 일정 (2026-10-31 · TRACKER T40)
//
// ★ 왜 — 앱 실적 캘린더·웹 실적 주간은 공통 유니버스(섹터 맵 + 인텔 10섹터, 167종목) 밖 종목을 버린다.
//   그래서 SHOP(11/3 장전) 같은 대형주 발표가 두 화면에서 빠졌다(조사: codex/out/earnings-cal-shop-missing-1031.md).
//
// ★ 범위 — 이 목록은 «두 화면의 표시»에만 쓴다:
//   · 앱 실적 캘린더: /api/market/earnings-calendar?scope=calendar 응답에만 행을 덧붙인다(scope 없는 호출 = 기존 응답 그대로).
//   · 웹 실적 주간: getEarningsWeek({ calendarOnly: true }) — 실적 주간 페이지·메타·OG 만. 공유 랜딩·SEO 티커(readOnly 기본 호출)는 그대로.
//   · 공통 유니버스·CONFIRMED_EARNINGS 는 바꾸지 않는다 — 종목 상세·Command·랭킹·공유 랜딩·영수증(실제 반응) 크론·
//     AI 브리프·오늘 볼 것·알림은 이 목록을 읽지 않는다(공급사 호출·AI 비용 증가 0).
//   · 행에는 날짜·장전/장후(+ 저장본에 있으면 예상 변동폭)만 — 다른 칸은 비워 둔다(화면 기존 «—» 규칙).
//   · 캘린더 캐시(market:earnings-calendar:v4) 형식·키는 그대로다. 출구에서 덧붙이므로 옛 캐시에도 배포 즉시 보이고,
//     덧붙이기가 실패하면 기존 응답 그대로다.
//
// ★ 갱신 — 공통 목록(earningsConfirmed.ts)과 같은 근거 규칙(회사 공지 원문 URL·원문 문장·확인 시각). 지난 항목은 출구가 무시한다.
//   공통 유니버스에 들어온 종목은 여기서 지운다(남아 있어도 출구가 건너뛴다 — 공통 경로가 다룬다).
// 순수 함수만 둔다(서버·시험 공용). 비밀값 금지.
// ============================================================================

import { applyConfirmedEarnings, type ConfirmedEarnings, type OverlayRow } from './earningsConfirmed';
import { selectWeekEntries } from './earningsWeek';

/** 티커 알파벳순. 확인: 2026-10-31 04:2x UTC 원문 직접 GET 200(ET 는 IR PDF 403 → Business Wire 사본 200). */
export const CALENDAR_ONLY_EARNINGS: ConfirmedEarnings[] = [
  {
    ticker: 'APO', date: '2026-11-03', hour: 'bmo', callEtTime: '08:30', sourceKind: 'company-pr', announcedOn: '2026-09-29', verifiedAt: '2026-10-31T04:21:00Z',
    sourceUrl: 'https://ir.apollo.com/news-events/press-releases/detail/652/apollo-to-announce-third-quarter-2026-financial-results-on',
    quote: 'on Tuesday, November 3, 2026, before the opening of trading on the New York Stock Exchange',
  },
  {
    ticker: 'ET', date: '2026-11-03', hour: 'bmo', callEtTime: '09:00', sourceKind: 'company-pr', announcedOn: '2026-10-01', verifiedAt: '2026-10-31T04:25:00Z',
    sourceUrl: 'https://ir.energytransfer.com/node/52586/pdf',
    checkUrl: 'https://finviz.com/news/397949/energy-transfer-announces-third-quarter-2026-earnings-release-and-earnings-call-timing',
    quote: 'plans to release earnings for the third quarter of 2026 on Tuesday, November 3, 2026, before the market opens',
    note: 'Business Wire 2026-10-01. IR PDF 는 봇 차단(403) — checkUrl 은 같은 Business Wire 원문 사본.',
  },
  {
    ticker: 'MET', date: '2026-11-04', hour: 'amc', sourceKind: 'company-pr', announcedOn: '2026-10-07', verifiedAt: '2026-10-31T04:25:00Z',
    sourceUrl: 'https://www.metlife.com/about-us/newsroom/2026/october/metlife-to-announce-third-quarter-2026-results/',
    quote: 'will release its third quarter 2026 financial results on Wednesday, November 4, 2026, after the market closes',
    note: '실적 통화는 11/5 09:00 ET(발표 시각 아님).',
  },
  {
    ticker: 'SHOP', date: '2026-11-03', hour: 'bmo', callEtTime: '08:30', sourceKind: 'company-pr', announcedOn: '2026-10-06', verifiedAt: '2026-10-31T04:21:00Z',
    sourceUrl: 'https://www.shopify.com/news/shopify-q3-2026-financial-advisory',
    quote: 'before markets open on Tuesday, November 3, 2026',
  },
  {
    ticker: 'TRI', date: '2026-11-03', hour: '', callEtTime: '08:30', sourceKind: 'company-pr', announcedOn: '2026-09-29', verifiedAt: '2026-10-31T04:21:00Z',
    sourceUrl: 'https://www.thomsonreuters.com/en/press-releases/2026/september/thomson-reuters-third-quarter-2026-earnings-announcement-and-webcast-scheduled-for-november-3-2026',
    quote: 'its third-quarter 2026 earnings will be issued via news release on Tuesday, November 3, 2026',
    note: '공지에 결과 공개의 장전/장후 구분이 없다(08:30 은 통화 시각) — hour 는 비워 둔다.',
  },
];

/**
 * 표시에 쓸 항목 — 공통 유니버스·공통 공지 목록에 이미 있는 종목은 뺀다(공통 경로가 다룬다 · 중복 행 방지).
 */
export function calendarOnlyEntries(
  common: Set<string>,
  commonConfirmed: readonly ConfirmedEarnings[],
  list: readonly ConfirmedEarnings[] = CALENDAR_ONLY_EARNINGS,
): ConfirmedEarnings[] {
  const confirmedTickers = new Set(commonConfirmed.map((c) => c.ticker));
  return list.filter((c) => c && !common.has(c.ticker) && !confirmedTickers.has(c.ticker));
}

/**
 * 앱 실적 캘린더 — 공통 행(덮기 끝난 것)에 캘린더 전용 행을 덧붙인다. 순수 함수(입력 행을 바꾸지 않는다).
 *   기존 행은 객체째 그대로 둔다(값·순서 규칙 보존). 새 행은 applyConfirmedEarnings 가 «원천에 행이 없을 때» 만드는 모양 그대로
 *   (숫자 칸 null · dateStatus 'confirmed'). 이미 같은 종목 행이 있으면 덧붙이지 않는다.
 *   정렬은 공통 출구와 같은 규칙(날짜 → 티커).
 */
export function withCalendarOnlyRows<R extends OverlayRow>(
  rows: R[],
  todayET: string,
  entries: readonly ConfirmedEarnings[],
): { rows: R[]; added: string[] } {
  const have = new Set((rows || []).map((r) => r?.ticker));
  const todo = entries.filter((c) => !have.has(c.ticker));
  if (!todo.length) return { rows, added: [] };
  const made = applyConfirmedEarnings([] as R[], todayET, { confirmed: todo.slice(), pending: [], universe: null });
  if (!made.added.length) return { rows, added: [] };
  // 기존 행의 상대 순서는 건드리지 않는다 — 새 행만 (날짜 → 티커) 자리에 끼운다.
  const out = (rows || []).slice();
  const after = (a: OverlayRow, b: OverlayRow) => (a.date === b.date ? a.ticker.localeCompare(b.ticker) > 0 : a.date > b.date);
  for (const n of made.rows as R[]) {
    const i = out.findIndex((r) => after(r, n));
    if (i < 0) out.push(n); else out.splice(i, 0, n);
  }
  return { rows: out, added: made.added };
}

/** 웹 실적 주간 — 그 주의 캘린더 전용 항목(정렬은 selectWeekEntries 와 같다) */
export function calendarOnlyWeekEntries(entries: readonly ConfirmedEarnings[], start: string, end: string): ConfirmedEarnings[] {
  return selectWeekEntries(entries, start, end);
}
