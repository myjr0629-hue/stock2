// ============================================================================
// «회사가 공지한 실적 발표일» 확인 목록 + 캘린더 출구 덮기 (2026-10-08)
//
// ★ 왜 있나 — 실적 캘린더 원천(FMP stable/earnings-calendar)은 «확정/추정» 구분이 없다.
//   · 필드는 symbol·date·epsActual·epsEstimated·revenueActual·revenueEstimated·lastUpdated 뿐이다.
//     lastUpdated 는 하루 한 번 전 행에 같은 날짜로 찍혀(10/7 실측: 대형주 32종목 전부 2026-10-07) 신호가 못 된다.
//   · FMP 의 «확정 일정» 엔드포인트는 우리 요금제 밖이다(10/8 실측: stable/earning-calendar-confirmed·earnings-calendar-confirmed 404,
//     api/v3·v4/earning-calendar-confirmed 403 «Legacy Endpoint … 2025-08-31 이전 가입자만»).
//   · Finnhub 도 구분 필드가 없고 틀린다(TSLA 10/20 — 회사 공지는 10/21).
//   그래서 회사가 날짜를 공지해도 FMP 가 며칠 늦게 따라오거나(Tesla: 10/2 공지 → FMP 는 10/7 에야 10/21 로, 그 사이 추정 10/28 이 6시간 캐시에 남았다),
//   끝까지 추정에 머문다(10/7 실측: AAPL 10/29 → 회사 공지 11/2 · INTC 10/22 → 10/29 · NEE 10/27 → 10/21 · DD 11/5 → 11/3 —
//   AAPL·INTC 는 FMP 와 Finnhub 가 «같은 틀린 날짜»라 두 벤더 대조로는 못 잡는다).
//
// ★ 방식 — 회사가 공지한 날짜를 이 파일에 근거(URL)·확인 시각과 함께 적고, 캘린더를 내보내는 «출구»에서 FMP 행을 덮는다.
//   · 덮을 곳은 services/earningsCalendarService.getMarketEarningsCalendar 한 곳 — Command·Intel·웹 티커·랭킹·내 종목·실적 캘린더가 모두 이 출구를 읽는다.
//     캐시 키·TTL·벤더 호출은 그대로다(출구에서만 입히므로 6시간 캐시에 남은 옛 값도 배포 즉시 고쳐진다).
//   · 목록에 없는 종목·목록의 날짜가 지난 항목은 건드리지 않는다(FMP 값 그대로).
//   · «확정이 아닌 날짜»는 숨기지 않는다 — 행은 그대로 두고 dateStatus:'est' 표식만 단다(화면은 «예정» 작은 칩). 표식은 «우리가 확인해서 아직
//     공지가 없다고 본 종목»(PENDING_EARNINGS)에만 달고 until 이 지나면 저절로 사라진다(목록을 안 고쳐도 틀린 표식이 남지 않게).
//   · 근거 없는 날짜는 넣지 않는다 — sourceUrl 은 회사 공지 원문(8-K·보도자료·IR 페이지) 또는 그 사본, quote 는 원문에서 그대로 옮긴 문장.
//
// ★ 갱신 — 회사가 날짜를 공지하면 CONFIRMED_EARNINGS 에 한 줄 추가, 공지 전 종목은 PENDING_EARNINGS. 날짜가 지난 항목은 그대로 둬도 된다(출구가 무시).
//   근거가 아직 열리는지는 `node scripts/check-earnings-confirmed.mjs`(원문을 열어 quote 를 찾는다), 운영 캘린더와의 어긋남은 같은 스크립트의 --live.
//
// 순수 함수만 둔다(서버·시험 공용). 비밀값 금지 — 이 저장소는 공개다.
// ============================================================================

import { daysBetweenYmd } from './marketCalendar';
import { normalizeDateStatus, type DateStatus } from './earningsDateStatus';

export { normalizeDateStatus, type DateStatus };

/** 'amc' 장 마감 후 · 'bmo' 장 시작 전 · '' 공지에 구분이 없음(그땐 FMP/Finnhub 가 채운 시각을 그대로 둔다) */
export type ConfirmedHour = 'amc' | 'bmo' | '';
export type ConfirmedSourceKind =
  | 'sec-8k'       // SEC 제출 문서(8-K 와 첨부)
  | 'company-pr'   // 회사 보도자료(Business Wire·PR Newswire·GlobeNewswire — 회사 IR 사이트 사본 포함)
  | 'ir-site'      // 회사 IR 페이지·이벤트 목록
  | 'ir-feed'      // 회사 IR 사이트의 이벤트·보도자료 피드(Q4 IR 플랫폼 JSON)
  | 'news-citing-ir'; // 회사 IR 공지를 인용한 보도(IR 원문이 기계 판독 불가일 때 — 근거가 한 단계 약하다)

export interface ConfirmedEarnings {
  ticker: string;
  /** 회사가 공지한 «결과 발표일» — 미국 동부(ET) 날짜 */
  date: string;
  hour: ConfirmedHour;
  sourceKind: ConfirmedSourceKind;
  /** 공지 원문(또는 그 사본) 주소 — https 만 */
  sourceUrl: string;
  /** sourceUrl 이 사람용 페이지라 기계가 못 읽을 때(스크립트 렌더·봇 차단) 원문을 읽을 수 있는 주소(IR 피드 등). 없으면 sourceUrl */
  checkUrl?: string;
  /** 회사가 공지한 날(YYYY-MM-DD). 모르면 '' */
  announcedOn: string;
  /** 우리가 원문을 열어 확인한 시각(ISO·UTC) */
  verifiedAt: string;
  /** 원문에서 그대로 옮긴 문장(날짜가 들어 있는 부분) — scripts/check-earnings-confirmed.mjs 가 원문에서 이 글자를 찾는다 */
  quote: string;
  /** 사람이 읽는 메모(근거의 한계 등) */
  note?: string;
}

/** «확인했으나 회사가 아직 공지하지 않음» — 화면에 «예정» 표식만 단다(날짜는 FMP 그대로) */
export interface PendingEarnings {
  ticker: string;
  checkedAt: string;
  /** 이 날짜(ET, 포함)까지만 표식을 단다 — 지나면 표식이 사라진다 */
  until: string;
  note?: string;
}

/**
 * 회사가 공지한 일정 — 2026-10-07 확인(운영 세션 요청: 대형주 30 + 실측에서 FMP 가 틀린 종목).
 * 티커 알파벳순으로 둔다(찾기 쉽게).
 */
export const CONFIRMED_EARNINGS: ConfirmedEarnings[] = [
  {
    ticker: 'AAPL', date: '2026-11-02', hour: 'amc', sourceKind: 'news-citing-ir', announcedOn: '2026-10-06', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.macrumors.com/2026/10/06/apple-q4-2026-earnings-nov-2/',
    quote: 'Apple plans to announce its earnings for the fourth fiscal quarter of 2026 on Monday, November 2',
    note: 'Apple IR 페이지(investor.apple.com)의 공지를 MacRumors·iClarified(10/6)가 인용 — IR 페이지는 스크립트 렌더라 기계 판독 불가. 결과 1:30pm PT(=4:30pm ET)·통화 2:00pm PT. Wall Street Horizon CONFIRMED 11/02. FMP·Finnhub 는 추정 10/29.',
  },
  {
    ticker: 'ABBV', date: '2026-10-30', hour: 'bmo', sourceKind: 'company-pr', announcedOn: '2026-10-01', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.prnewswire.com/news-releases/abbvie-to-host-third-quarter-2026-earnings-conference-call-302895088.html',
    checkUrl: 'https://finance.yahoo.com/markets/stocks/articles/abbvie-host-third-quarter-2026-120000298.html',
    quote: 'will announce its third-quarter 2026 financial results on Friday, October 30, 2026, before the market opens',
    note: 'PR Newswire 2026-10-01.',
  },
  {
    ticker: 'AMD', date: '2026-11-03', hour: 'amc', sourceKind: 'company-pr', announcedOn: '2026-10-06', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://ir.amd.com/news-events/press-releases/detail/1300/amd-to-report-fiscal-third-quarter-2026-financial-results',
    quote: 'will report fiscal third quarter 2026 financial results on Tuesday, Nov. 3, 2026, after the market close',
  },
  {
    ticker: 'BAC', date: '2026-10-14', hour: 'bmo', sourceKind: 'company-pr', announcedOn: '2026-09-30', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://newsroom.bankofamerica.com/content/newsroom/press-releases/2026/09/bank-of-america-to-report-third-quarter-2026-financial-results-a.html',
    quote: 'will report its third quarter 2026 financial results on Wednesday, October 14',
  },
  {
    ticker: 'COST', date: '2026-12-10', hour: 'amc', sourceKind: 'ir-feed', announcedOn: '', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://investor.costco.com/events-and-presentations',
    checkUrl: 'https://investor.costco.com/feed/Event.svc/GetEventList?LanguageId=1&bodyType=0&eventDateFilter=1&pageSize=15&pageNumber=0&tagList=&includeTags=true&year=-1&excludeSelection=1',
    quote: '12/10/2026 13:15:00',
    note: 'Costco IR 이벤트 피드의 예정 이벤트: «Q1 2027 Earnings Results» 12/10/2026 13:15 PT · «Q1 2027 Earnings Call» 14:00 PT. 13:15 PT = 4:15pm ET.',
  },
  {
    ticker: 'CVX', date: '2026-10-30', hour: '', sourceKind: 'company-pr', announcedOn: '2026-10-01', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.businesswire.com/news/home/20261001514491/en/',
    checkUrl: 'https://finance.yahoo.com/energy/articles/advisory-chevron-corporation-3q-2026-113000941.html',
    quote: 'will hold its quarterly earnings conference call on Friday, October 30, 2026 at 11:00 a.m. ET',
    note: 'Business Wire 2026-10-01. 공지에 결과 발표 시각 구분이 없어 hour 는 비워 둔다.',
  },
  {
    ticker: 'DD', date: '2026-11-03', hour: 'bmo', sourceKind: 'company-pr', announcedOn: '2026-10-06', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.prnewswire.com/news-releases/dupont-schedules-third-quarter-2026-earnings-conference-call-302898734.html',
    checkUrl: 'https://finance.yahoo.com/markets/stocks/articles/dupont-schedules-third-quarter-2026-110000725.html',
    quote: 'will release its third quarter 2026 financial results at 6:00 a.m. ET on Tuesday, November 3, 2026',
    note: 'PR Newswire 2026-10-06. FMP 는 11/05 (틀림).',
  },
  {
    ticker: 'GOOGL', date: '2026-10-28', hour: 'amc', sourceKind: 'ir-feed', announcedOn: '2026-10-06', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://abc.xyz/investor/news/news-details/2026/Alphabet-Announces-Date-of-Third-Quarter-2026-Financial-Results-Conference-Call-2026-8tpGZsLS6v/default.aspx',
    checkUrl: 'https://abc.xyz/feed/PressRelease.svc/GetPressReleaseList?LanguageId=1&bodyType=1&pressReleaseDateFilter=3&categoryId=1cb807d2-208f-4bc3-9133-6a9ad45ac3b0&pageSize=13&pageNumber=0&tagList=&includeTags=true&year=2026&excludeSelection=1',
    quote: 'will hold its quarterly conference call to discuss third quarter 2026 financial results on Wednesday, October 28, at 1:30pm Pacific Time (4:30pm Eastern Time)',
    note: 'Alphabet IR 피드(abc.xyz/feed/PressRelease.svc) 원문. 통화가 4:30pm ET 라 결과는 장 마감 후.',
  },
  {
    ticker: 'IBM', date: '2026-10-21', hour: 'amc', sourceKind: 'company-pr', announcedOn: '2026-10-07', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.prnewswire.com/news-releases/ibm-to-announce-third-quarter-2026-financial-results-302901258.html',
    checkUrl: 'https://www.stocktitan.net/news/IBM/ibm-to-announce-third-quarter-2026-financial-k0gd0wetptx6.html',
    quote: 'will hold its quarterly conference call to discuss its third-quarter 2026 financial results on Wednesday, October 21, 2026 at 5:00 p.m. ET',
    note: 'PR Newswire 2026-10-07.',
  },
  {
    ticker: 'INTC', date: '2026-10-29', hour: 'amc', sourceKind: 'company-pr', announcedOn: '2026-10-06', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.intc.com/news-events/press-releases/detail/1782/intel-to-report-third-quarter-2026-financial-results',
    quote: 'will report third-quarter financial results on Thursday, October 29, 2026, promptly after close of market',
    note: 'Business Wire 2026-10-06 (Intel IR). FMP·Finnhub 는 추정 10/22 (틀림).',
  },
  {
    ticker: 'JNJ', date: '2026-10-13', hour: 'bmo', sourceKind: 'company-pr', announcedOn: '2026-08-31', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.businesswire.com/news/home/20260831627428/en/',
    checkUrl: 'https://finance.yahoo.com/healthcare/articles/johnson-johnson-host-investor-conference-210800104.html',
    quote: 'on Tuesday, October 13',
    note: 'Business Wire 2026-08-31(jnj.com 보도자료와 동일). 결과 보도자료는 통화 당일 약 6:45am ET.',
  },
  {
    ticker: 'JPM', date: '2026-10-13', hour: 'bmo', sourceKind: 'company-pr', announcedOn: '2026-09-17', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.businesswire.com/news/home/20260917326544/en/',
    checkUrl: 'https://finance.yahoo.com/markets/stocks/articles/jpmorganchase-host-third-quarter-2026-202200151.html',
    quote: 'third-quarter 2026 financial results on Tuesday, October 13, 2026 at 8:30 a.m. (ET)',
    note: 'Business Wire 2026-09-17. 결과는 약 7:00am ET.',
  },
  {
    ticker: 'LRCX', date: '2026-10-21', hour: 'amc', sourceKind: 'company-pr', announcedOn: '2026-09-30', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.prnewswire.com/news-releases/lam-research-corporation-announces-september-quarter-financial-conference-call-302894849.html',
    checkUrl: 'https://finance.yahoo.com/markets/stocks/articles/lam-research-corporation-announces-september-200500804.html',
    quote: 'on Wednesday, October 21, 2026, beginning at 2:00 p.m. Pacific Daylight Time (5:00 p.m. Eastern Daylight Time)',
    note: 'PR Newswire 2026-09-30.',
  },
  {
    ticker: 'NEE', date: '2026-10-21', hour: 'bmo', sourceKind: 'company-pr', announcedOn: '2026-10-07', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.prnewswire.com/news-releases/nextera-energy-announces-date-for-release-of-third-quarter-2026-financial-results-302900429.html',
    checkUrl: 'https://www.stocktitan.net/news/NEE/next-era-energy-announces-date-for-release-of-third-quarter-2026-tp8pitlkt97o.html',
    quote: 'before the opening of the New York Stock Exchange on Wednesday, Oct. 21, 2026',
    note: 'PR Newswire 2026-10-07. FMP 는 10/27 (틀림).',
  },
  {
    ticker: 'NFLX', date: '2026-10-20', hour: 'amc', sourceKind: 'company-pr', announcedOn: '2026-09-14', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.prnewswire.com/news-releases/netflix-to-announce-third-quarter-2026-financial-results-302873060.html',
    quote: 'on Tuesday October 20th, 2026, at approximately 1:01 p.m. Pacific Time',
    note: 'PR Newswire 2026-09-14(Netflix IR PDF 와 동일). 1:01pm PT(=4:01pm ET) 게시.',
  },
  {
    ticker: 'TSLA', date: '2026-10-21', hour: 'amc', sourceKind: 'sec-8k', announcedOn: '2026-10-02', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/exhibit991111111.htm',
    quote: 'Tesla will post its financial results for the third quarter of 2026 after market close on Wednesday, October 21, 2026',
    note: 'SEC 8-K(Item 2.02) 첨부 99.1, 2026-10-02. 웹캐스트 5:30pm ET.',
  },
  {
    ticker: 'TSM', date: '2026-10-15', hour: 'bmo', sourceKind: 'ir-site', announcedOn: '', verifiedAt: '2026-10-07T16:15:00Z',
    sourceUrl: 'https://investor.tsmc.com/english/quarterly-results/teleconference',
    quote: 'Thursday, October 15, 2026',
    note: 'TSMC IR «Third Quarter 2026 Earnings Conference»: 10/15 02:00–03:30 ET (대만 14:00). Wall Street Horizon CONFIRMED 10/15 Before Market.',
  },
  {
    ticker: 'WMT', date: '2026-11-19', hour: 'bmo', sourceKind: 'ir-site', announcedOn: '', verifiedAt: '2026-10-07T16:55:00Z',
    sourceUrl: 'https://corporate.walmart.com/news/events/fy2027-q3-earnings-release',
    quote: 'FY2027 Q3 Earnings Release Nov. 19, 2026 | 7:00 a.m. US/Central',
  },
];

/**
 * 확인했으나 회사가 아직 날짜를 공지하지 않은 종목(2026-10-07 확인) — 날짜는 FMP 추정 그대로 두고 «예정» 표식만 단다.
 *   근거: 회사 IR 이벤트 피드·보도자료 목록·IR 캘린더에 3분기(회계 분기) 발표 일정이 아직 없음 + Wall Street Horizon UNCONFIRMED(MSFT·META·AMZN·MU·PLTR).
 *   NVDA: Wall Street Horizon 은 11/17 «CONFIRMED» 이지만 NVIDIA IR 이벤트 피드에 3분기 일정이 없고(작년엔 10/29 에 공지) 항상 수요일(11/18)에 발표해 FMP 와 갈린다 — 회사 공지 전으로 둔다.
 */
export const PENDING_EARNINGS: PendingEarnings[] = [
  { ticker: 'AMZN', checkedAt: '2026-10-07T16:45:00Z', until: '2026-10-22', note: 'IR 피드에 3분기 통화 공지 없음(작년 패턴: 발표 2주 전, 예: 7/16→7/30)' },
  { ticker: 'AVGO', checkedAt: '2026-10-07T16:40:00Z', until: '2026-10-22', note: '4분기 일정 공지 없음(통상 한 달 전)' },
  { ticker: 'DELL', checkedAt: '2026-10-07T16:40:00Z', until: '2026-10-22', note: '3분기 일정 공지 없음' },
  { ticker: 'MA', checkedAt: '2026-10-07T16:45:00Z', until: '2026-10-22', note: 'IR 피드 최신 9/30 — 3분기 통화 공지 없음(7/8→7/30 패턴)' },
  { ticker: 'META', checkedAt: '2026-10-07T16:45:00Z', until: '2026-10-22', note: 'IR 피드 최신 9/10 — «Meta to Announce Third Quarter 2026 Results» 없음(2주 전 패턴: 7/14→7/29)' },
  { ticker: 'MSFT', checkedAt: '2026-10-07T16:45:00Z', until: '2026-10-22', note: 'FY27 Q1 이벤트 페이지 404 · Microsoft Source 피드에 공지 없음(작년 10/8 에 공지)' },
  { ticker: 'MU', checkedAt: '2026-10-07T16:45:00Z', until: '2026-10-22', note: 'IR 피드 최신 9/30 — 회계 1분기 일정 공지 없음' },
  { ticker: 'NVDA', checkedAt: '2026-10-07T16:45:00Z', until: '2026-10-22', note: 'IR 이벤트 피드에 3분기 FY27 일정 없음 · 벤더 불일치(FMP 11/18 · Finnhub·WSH 11/17)' },
  { ticker: 'ORCL', checkedAt: '2026-10-07T16:45:00Z', until: '2026-10-22', note: 'IR 피드 최신 9/12 — 회계 2분기 일정 공지 없음' },
  { ticker: 'PLTR', checkedAt: '2026-10-07T16:45:00Z', until: '2026-10-22', note: 'IR 피드에 3분기 일정 공지 없음' },
  { ticker: 'V', checkedAt: '2026-10-07T16:45:00Z', until: '2026-10-22', note: 'IR 피드 최신 10/5 — 회계 4분기 일정 공지 없음(작년 10/28 발표)' },
  { ticker: 'XOM', checkedAt: '2026-10-07T16:45:00Z', until: '2026-10-22', note: 'IR 캘린더에 3Q 2026 Earnings Call 없음(2분기는 발표 10일 전 공지)' },
];

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const TICKER = /^[A-Z][A-Z0-9.]{0,5}$/;

/** 같은 발표로 보는 날짜 폭(±일) — FMP 추정이 가장 크게 어긋난 것이 7일(INTC·TSLA)이고, 다음 분기는 약 90일 뒤라 겹치지 않는다 */
export const SAME_EVENT_WINDOW_DAYS = 30;

/** 덮을 행의 최소 모양 — 서비스의 EarningsRow 가 이 모양을 만족한다 */
export interface OverlayRow {
  ticker: string;
  date: string;
  hour: string;
}

export interface OverlayResult<R extends OverlayRow> {
  rows: Array<R & { dateStatus?: DateStatus; dateFrom?: string }>;
  /** 날짜를 바꾼 행 */
  repaired: Array<{ ticker: string; from: string; to: string }>;
  /** FMP 에 행이 없어 새로 넣은 종목 */
  added: string[];
  /** 회사 공지로 확정 표식을 단 행 수(날짜가 같아 그대로인 것 포함) */
  confirmed: number;
  /** «예정» 표식을 단 행 수 */
  est: number;
}

function validConfirmed(c: ConfirmedEarnings): boolean {
  return !!c && TICKER.test(String(c.ticker)) && YMD.test(String(c.date)) && (c.hour === 'amc' || c.hour === 'bmo' || c.hour === '');
}

/**
 * 캘린더 행에 회사 공지를 입힌다 — 순수 함수(입력 배열·행을 바꾸지 않는다).
 *   todayET: 미국 동부 시장 날짜(marketCalendar.etDateOf) — 이보다 앞선 공지 항목·만료된 «예정» 은 쓰지 않는다
 *   universe: 주면 그 안의 종목만 넣는다(행이 없을 때 새로 만드는 경우의 안전판)
 */
export function applyConfirmedEarnings<R extends OverlayRow>(
  rows: R[],
  todayET: string,
  opts: { confirmed?: ConfirmedEarnings[]; pending?: PendingEarnings[]; universe?: Set<string> | null } = {},
): OverlayResult<R> {
  const confirmed = opts.confirmed ?? CONFIRMED_EARNINGS;
  const pending = opts.pending ?? PENDING_EARNINGS;
  const universe = opts.universe ?? null;
  const out: Array<(R & { dateStatus?: DateStatus; dateFrom?: string }) | null> = (rows || []).slice();
  const repaired: OverlayResult<R>['repaired'] = [];
  const added: string[] = [];
  const handled = new Set<string>();

  for (const c of confirmed) {
    if (!validConfirmed(c)) continue;
    if (c.date < todayET) continue;                       // 이미 지난 일정 — 실제 발표 뒤의 값은 원천이 안다
    if (universe && !universe.has(c.ticker)) continue;
    handled.add(c.ticker);

    // 같은 종목의 행 중 ±WINDOW 안의 것 = 같은 분기의 같은 발표(FMP 추정/반영 지연)
    const near: Array<{ i: number; abs: number; date: string }> = [];
    for (let i = 0; i < out.length; i++) {
      const r = out[i];
      if (!r || r.ticker !== c.ticker) continue;
      const d = daysBetweenYmd(c.date, r.date);
      if (d == null || Math.abs(d) > SAME_EVENT_WINDOW_DAYS) continue;
      near.push({ i, abs: Math.abs(d), date: r.date });
    }
    if (!near.length) {
      // FMP 에 그 발표 행이 없다 — 회사가 공지한 일정이므로 행을 만든다(숫자 칸은 비워 둔다: 지어내지 않는다)
      out.push({
        ticker: c.ticker, date: c.date, hour: c.hour,
        epsEstimate: null, revenueEstimate: null, quarter: null, year: null,
        dateStatus: 'confirmed',
      } as unknown as R & { dateStatus: DateStatus });
      added.push(c.ticker);
      continue;
    }
    // 가장 가까운 행 하나만 남긴다(같으면 이른 날짜) — 나머지 ±WINDOW 행은 같은 발표의 중복이라 뺀다
    near.sort((a, b) => a.abs - b.abs || a.date.localeCompare(b.date));
    const keep = near[0];
    const r0 = out[keep.i]!;
    const sameDate = r0.date === c.date;
    const next: R & { dateStatus?: DateStatus; dateFrom?: string } = {
      ...r0,
      date: c.date,
      // 날짜가 바뀌면 옛 날짜로 채운 시각(Finnhub)은 이 발표의 것이 아니다 → 회사 공지 시각, 없으면 비운다
      hour: c.hour || (sameDate ? String(r0.hour || '') : ''),
      dateStatus: 'confirmed',
    };
    if (!sameDate) {
      next.dateFrom = (r0 as { dateFrom?: string }).dateFrom ?? r0.date;
      repaired.push({ ticker: c.ticker, from: r0.date, to: c.date });
    }
    out[keep.i] = next;
    for (let k = 1; k < near.length; k++) out[near[k].i] = null;
  }

  // «예정» 표식 — 회사 공지로 덮이지 않은 종목의 «오늘 이후 첫 행»
  let est = 0;
  for (const p of pending) {
    if (!p || !TICKER.test(String(p.ticker)) || handled.has(p.ticker)) continue;
    if (!YMD.test(String(p.until)) || p.until < todayET) continue;       // 만료 — 표식이 저절로 사라진다
    let best = -1;
    for (let i = 0; i < out.length; i++) {
      const r = out[i];
      if (!r || r.ticker !== p.ticker || !YMD.test(String(r.date)) || r.date < todayET) continue;
      if (best < 0 || r.date < out[best]!.date) best = i;
    }
    if (best >= 0) { out[best] = { ...out[best]!, dateStatus: 'est' }; est += 1; }
  }

  const rowsOut = out.filter((r): r is R & { dateStatus?: DateStatus; dateFrom?: string } => r != null);
  rowsOut.sort((a, b) => (a.date === b.date ? a.ticker.localeCompare(b.ticker) : a.date.localeCompare(b.date)));
  const confirmedRows = rowsOut.filter((r) => r.dateStatus === 'confirmed').length;
  return { rows: rowsOut, repaired, added, confirmed: confirmedRows, est };
}
