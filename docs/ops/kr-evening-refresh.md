# 한국 저녁 생성 보강 (fix/kr-evening-refresh)

근거: 운영 보고서 `ux-1019/REPORT.md` §0-2 2위·§B-1. 확인된 원인은 조기 크론 부재와 today-picks의 07:30 ET 이전 시간 창 차단이다. 섹터 AI 입력에는 뉴스·선물·옵션 날짜가 없었다.

## 바꾼 파일

- `vercel.json`
- `src/app/api/cron/today-picks/route.ts`
- `src/app/api/cron/sector-headlines/route.ts`
- `src/services/todayPicksService.ts`
- `src/services/preMarketContext.ts`
- `src/lib/todayPicks/types.ts`
- `src/lib/ai/preMarketContext.ts`
- `src/lib/marketCalendar.ts`
- `src/lib/marketSession.ts`
- `src/stores/dashboardStore.ts`
- `src/app/api/live/quotes/route.ts`
- `tests/todayPicks.test.ts`
- `tests/krEveningRefresh.test.ts`
- `tests/krEveningQuoteContract.test.ts`
- `docs/ops/kr-evening-refresh.md`

## 시각과 슬롯

`vercel.json`은 엄격한 JSON이라 주석을 넣지 않았다. UTC 고정 근거 주석은 두 크론 라우트와 `todayPicksService.inWindow`에 있다.

| 생성 | UTC (월~금) | KST | EDT | 11/1 종료 후 EST |
|---|---|---|---|---|
| 오늘 볼 것 조기판 `pre` | 08:30 | 17:30 | 04:30 PRE | 03:30 CLOSED |
| 섹터 한 줄 첫 회 | 08:40 | 17:40 | 04:40 PRE | 03:40 CLOSED |
| 섹터 한 줄 두 번째 | 10:40 | 19:40 | 06:40 PRE | 05:40 PRE |

미국 프리는 04:00 ET부터다. EST 조기판을 PRE로 표시하지 않고 선물·뉴스와 날짜가 붙은 직전 정규장 값을 사용한다. 기존 아침·마감 크론은 유지했다. 21:00 KST의 today-picks는 EDT 08:00에 `am`으로 실행된다. EST 07:00은 기존 창 밖이라 건너뛰고, 기존 22:00 KST(08:00 EST) 크론이 `am`을 만든다.

## 재료와 비용

- 선택된 오늘 볼 것 최대 5종목은 기존 `/api/live/quotes`를 읽는다. 선물은 `yahoo:nq`·`yahoo:spx`, 뉴스는 `guardian:news:digest:v2`의 최근 24시간 항목을 읽는다. 선물 생존 판정은 기존 `buildBackdrop`을 재사용한다. 뉴스·선물을 다시 생성하지 않는다.
- 프리 시세는 `extendedMissing !== true`, `extendedLabel=PRE`, 당일 `extendedDate`, 양수 `extendedPrice`, 유효한 등락률을 함께 확인한다. 실제 0% 체결은 가격·날짜를 보존하고, 미체결·오류는 `extendedMissing=true`로 구분한다. 섹터 평균은 PRE·POST 각각 REG와 섞지 않으며 해당 세션 표본 부족 시 날짜가 붙은 REG 한 벌을 사용한다. 보합은 하락 종목 수에 넣지 않는다.
- 옵션은 기존 EOD/lastgood 원천과 실제 날짜를 보존한다. EOD 레코드 날짜와 신규 포지션이 열린 `prevDate`는 별개다. 오래된 묶음을 직전 거래일 것으로 재명명하지 않는다. 섹터 옵션 OI는 표본 수를 함께 넣고 없는 값은 null이다.
- 추가 섹터 호출은 기존 `withFreshTier`를 사용한다. Haiku 5.5 크레딧 월 상한·차단 시 AWS로 넘어가지 않는다. today-picks는 기존 크레딧 전용 처리와 일 60회 기본 호출 상한을 유지한다.
- 같은 날짜·같은 슬롯·같은 자료의 today-picks는 추가 AI 호출이 없다. 조기판이 아침판을 막지 않도록 `pre`와 `am`을 구분한다. 섹터는 같은 프리 슬롯 중복을 건너뛰며 기존 배경 잠금을 재사용한다.
- 주말·휴장 생성은 직접 호출과 today-picks force/dry에서도 차단한다. 추가 크론 모두 평일이다. 화면 라벨·문구·배치는 수정하지 않았다.

## 공유 함수 호출자와 영향

- `inWindow`: today-picks 크론만 호출. UTC 조기 창을 추가하고 휴장 여부를 확인한다.
- `slotOf`: `runPicks`가 호출. `pre` 슬롯 키가 새로 생기며 기존 `am`·`pm` 키는 유지된다.
- `writeWhy`: `runPicks`가 호출. 선택적 배경 인자를 추가했으며 기존 숫자·날짜·조언 출구 검사는 그대로다. 직접 시험 호출은 기존 인자만으로도 동작한다.
- 새 `sessionQuote`: 섹터 생성과 today-picks 프리 시세 읽기가 호출한다. 새 `preMarketPrompt`·`readPreMarketContext`: 두 생성 경로가 호출한다. `generationSession`: 두 문서의 생성 메타에 사용한다.
- `TodayPicksDoc` 읽기: `readPicks` → 읽기 API·웹 today·OG·초대 랜딩·마감 푸시, `buildView` → 앱 카드·전체 보기·웹·OG. 필수 기존 필드를 보존하고 새 메타는 선택적이다. UI는 기존 `pickedAt`과 항목별 `asOf`를 계속 사용한다.
- 섹터 읽기: `/api/intel/snapshot`의 `overlayAiHeadline`이 같은 날짜·120분 이내 문서를 채택하고 `headlineSession`을 그대로 전달한다. 기존 응답 필드와 TTL은 유지한다.

## 검증

- `tests/todayPicks.test.ts`: 46개 통과. EDT/EST 17:30·21:00 슬롯, 금요일→월요일 날짜 교체, 같은 슬롯 0콜, 아침판 별도 생성, 주말 차단, 기존 가드·읽기·푸시·표시 계약 포함.
- `tests/krEveningRefresh.test.ts`: 관문 수정 후 13개 통과. 크론 JSON, PRE 날짜/결측/실제 0%, EDT/EST 두 섹터 슬롯과 기존 아침 생성, 크레딧 차단 보존, 혼합 평균 방지, 오래된 선물·뉴스 배제, 주말 0콜 포함.
- 외부 시세·Redis·AI는 전부 모의했다. 운영 API·운영 데이터 쓰기·브라우저·커밋·push·병합·배포는 실행하지 않았다.
- 전체 TypeScript 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false` — 관문 수정 후 1회 실행, 종료 코드 0(진단 없음).

## 남은 확인

실제 크론 실행과 모델 문장·실제 비용은 배포 후 운영 세션에서 확인해야 한다. 이 작업에서 AI 비용을 실측하지 않았다. 기존 호출 상한/배경 잠금은 get→set 방식이어서 엄밀한 원자적 비용 예약은 아니며 변경하지 않았다. 재료 결측·크레딧 차단 시 기존 규칙 해설 또는 이전 문서를 보존한다.

## 1차 관문 보류 수정

근거: `gate-fix_kr-evening-refresh-10192055.md`. 수정 전 새 재현 시험 4개가 모두 실패했다. 실제 시세 라우트에서 PRE 체결가 100과 정규장 종가 100이 같으면 `extendedPrice=0`, 날짜 null로 직렬화되어 월요일 PRE 0%가 금요일 REG -3%로 대체됐다. 또한 직전 마감일 판정 두 곳이 16:00 ET 고정이라 11/27 13:05 ET POST 미체결의 당일 REG를 11/25로 잘못 표기했다.

- 시세 라우트는 가격이 같은 체결도 보존하고 `extendedMissing`을 추가했다. PRE 입력 함수는 명시적 결측을 우선 제외한다. 기존 필드는 유지한다.
- `marketCalendar.etLastClosedSessionDate`가 기존 `sessionCloseMinutes`의 13:00 조기 폐장을 반영한다. `marketSession.lastClosedSessionDate`는 달력 정본에 위임한다.
- 생성 세션 메타도 조기 폐장·휴장 달력을 반영한다. 고정 화면 문구·레이아웃 파일은 수정하지 않았다.
- `tests/krEveningQuoteContract.test.ts`: 실제 시세 라우트 응답 → 섹터 입력 함수·오늘 볼 것 로더 연결, PRE/POST 실측 0%, 미체결·전일 체결·오류 missing, 명시적 결측 우선, 11/27 13:05 ET, 조기 마감 경계·휴장·주말·정상 마감·DST를 검증한다. 수정 후 5/5 통과.
- `tests/krEveningRefresh.test.ts`에 10개 섹터가 모두 PRE 0%일 때 평균 0·상승 0·하락 0·보합=표본 수를 유지하는 시험을 추가했다.

### 공유 기준일 함수의 전체 운영 호출자

`src` 전체 참조 검색 기준이며, 아래 파일 외 참조는 정의·설명 주석·시험이다.

| 함수 | 직접 호출 파일 | 영향 |
|---|---|---|
| 달력 정본 | `src/lib/marketSession.ts` | 아래 래퍼 호출자와 같은 달력을 공유 |
| 달력 정본 | `src/app/api/live/quotes/route.ts` | 조기 마감 뒤 벌크 EOD 종가 보정의 기대 날짜가 당일로 이동 |
| 달력 정본 | `src/lib/signals/run.ts` | 마감 뒤 신규 포지션 신호의 기준일 |
| 달력 정본 | `src/lib/structureWarmPlan.ts` | 공급사 기대 EOD 날짜; 기존 실행 창 유지 |
| 달력 정본 | `src/lib/app/intelOptionsBasis.ts` | 옵션 행의 이전 세션 여부 판정 |
| 달력 정본 | `src/app/[locale]/flow/[ticker]/page.tsx`, `src/app/api/undercurrent/ticker/route.ts` | SEO 사본 가격의 기준일 판정 |
| 달력 정본 | `src/app/[locale]/app-view/intel/page.tsx` | 기존 마감 문구에 넣는 날짜 값 |
| 래퍼 | `src/lib/ai/preMarketContext.ts`, `src/services/preMarketContext.ts`, `src/app/api/cron/sector-headlines/route.ts` | PRE/POST 폴백 가격과 옵션 배경의 직전 정규장 날짜 |
| 래퍼 | `src/services/todayPicksService.ts` | 선별 재료의 직전 정규장 기준일 |
| 래퍼 | `src/lib/newPositionBasis.ts`, `src/services/institutionalFlow.ts` | 신규 포지션 추정 세션·만기 계약 제외 기준 |
| 래퍼 | `src/lib/marketBackdrop.ts` | 장 전·휴장 배경의 마지막 정규장 날짜 |
| 래퍼 | `src/app/[locale]/wim/page.tsx`, `src/app/api/wim/today/route.ts` | WIM 마지막 마감 세션 키 |

일반 거래일의 16:00 경계와 휴장·주말 규칙은 같다. 변경되는 구간은 조기 폐장일 13:00~16:00 ET다. 실제 EOD 데이터의 날짜를 바꾸지 않고 기대 기준일만 달력과 맞춘다. `cashPhase` 등 다른 세션 판정은 이 수정에서 바꾸지 않았다.

### 시세 API 소비처 영향

직접 호출자는 `src/services/preMarketContext.ts`, `src/app/api/cron/{sector-headlines,structure-build,signum-warm}/route.ts`, `src/hooks/{useLivePrice,useIntelSharedData,useOnePipe}.ts`, `src/utils/liveQuote.ts`, `src/stores/dashboardStore.ts`, `src/components/mobile/MobileWatchlistSwipeBar.tsx`, `src/app/[locale]/{dashboard,app-view/dash}/page.tsx`, `src/app/api/dashboard/unified/route.ts`다. `useLiveQuotes`는 `liveQuote`를 통해 간접 사용한다.

정규장 가격·등락·기준선 필드는 유지한다. 시간외 실측가가 정규장 가격과 같은 경우에만 기존 0 센티널 대신 실제 양수 가격·날짜·체결 메타를 전달한다. 시간외 가격을 쓰는 소비처는 실제 보합을 받으며, 정규장 가격만 쓰는 구조 빌드·모바일 바 등은 영향이 없다. 새 missing 필드는 추가 계약이므로 기존 소비처가 없어도 호환된다. UI 문구·라벨·표시 코드는 수정하지 않았다.

### 관문 수정 후 최종 검증

| 시험 파일 | 결과 | 확인 범위 |
|---|---|---|
| `tests/krEveningQuoteContract.test.ts` | 5/5 | 두 보류 입력의 수정 전 실패 재현 → 수정 후 통과, 실제 API 계약·두 AI 입력 경로·13개 달력 경계 |
| `tests/krEveningRefresh.test.ts` | 13/13 | 섹터 PRE 보합 집계·DST·주말·동일 슬롯·비용 차단 |
| `tests/todayPicks.test.ts` | 46/46 | 17:30·21:00 EDT/EST 슬롯·금요일판 교체·가드·기존 표시 계약 |
| `tests/marketCalendar.session.test.ts` | 37/37 | 달력 정본의 기존 마감·휴장·주말·선물 경계 |
| `tests/marketBackdrop.session.test.ts` | 71/71 | 래퍼·배경 세션과 날짜·선물 신선도 |
| `tests/quotesBulkClose.test.ts` | 9/9 | 시세 API 벌크·소량 요청의 기존 PRE/REG/CLOSED 종가 보정 |
| `tests/newPositionEstimate.test.ts` | 30/30 | 신규 포지션 기준 함수·기관 서비스·추정/확정 전환 |
| `tests/signals.run.test.ts` | 23/23 | 기준일을 쓰는 신호 실행기의 모의 저장·발송·상한 회귀 |

8개 파일의 234개 검사 통과. 재현 파일 외 7개 시험은 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 감싼 단일 묶음에서 순차 실행했다. 전체 tsc도 같은 잠금으로 1회 실행해 진단 없이 종료 코드 0이다. `git diff --check` 통과. UI 파일 변경 없음. 운영 실행·실제 AI 비용은 미확인이며, 커밋·push·병합·배포·운영 쓰기 없음.

1차 관문 수정 파일은 `src/app/api/live/quotes/route.ts`, `src/app/api/cron/sector-headlines/route.ts`, `src/lib/ai/preMarketContext.ts`, `src/lib/marketCalendar.ts`, `src/lib/marketSession.ts`, `tests/krEveningQuoteContract.test.ts`, `tests/krEveningRefresh.test.ts`, 이 보고서의 총 8개다. 기존 커밋의 `vercel.json` 조기 크론과 비용 가드는 유지했다.

## 2차 관문 보류 수정

근거: `gate-fix_kr-evening-refresh-10192207.md`의 두 재현 입력을 기존 시험에 추가한 뒤 수정했다.

- 원인: 섹터 집계의 세션 필터가 `preOpen`에만 적용됐다. POST +1% 한 종목과 REG -5% 여섯 종목을 POST 평균 -4.14%로 계산했다. POST에도 세션·날짜 필터를 적용했다. 해당 세션 실측이 절반 미만이면 섹터 전체를 직전 정규장 값으로 계산하며, 절반 이상이면 그 세션 실측 종목만 집계한다. `priceBasis`·`priceDate`를 함께 전달한다. 보합은 missing 여부와 별개다.
- 원인: 대시보드 `initializeStore`가 API의 PRE 실측 등락률을 버리고 `previousClose`(D-2)로 재계산했다. 표시 계산도 D-2를 받았으며 다음 폴링이 이를 다시 저장했다. API 실측 등락률(0 포함)을 우선 사용한다. 등락률 필드가 없는 레거시 응답만 PRE 중 `price`(D-1), 정규장 중 PRE CLOSE는 `previousClose`로 계산한다. 명시적 `extendedMissing=true`를 초기화·폴링 모두 우선한다.
- PRE 표시 계산용 `prevRegularClose`는 초기화·폴링에서 D-1 종가로 유지한다. 정규장 등락 계산용 `prevClose`의 D-2는 별도로 보존하며 REG·POST 기준선은 유지한다. 공용 `calcPriceDisplay`·`computeOnePipe`는 수정하지 않았다.
- `initializeStore`·`fetchPriceOnly`의 화면 직접 호출자는 `src/app/[locale]/dashboard/DashboardClient.tsx`, `src/app/[locale]/dashboard/MobileDashboardPage.tsx`, `src/components/mobile/MobileDashboardClient.tsx`의 총 3곳이다. 저장소의 `fetchDashboardData`도 최초 자료 적재 때 `fetchPriceOnly`를 호출한다. 모두 같은 입력 계약을 사용한다. 화면 문구·라벨·표시 컴포넌트는 변경하지 않았다. API → 실제 저장소 초기화 → `DashboardClient`와 같은 `calcPriceDisplay` 입력 → 실제 `computeOnePipe`를 쓰는 폴링까지 연결해 PRE 보합을 검증한다.
- 섹터 생성의 외부 호출자는 `vercel.json`뿐이다. 공유 `sessionQuote`·달력·비용 함수는 이번 수정에서 변경하지 않았다. 기존 조기 크론·상한·주말 차단을 유지한다.

이번 수정 파일: `src/app/api/cron/sector-headlines/route.ts`, `src/stores/dashboardStore.ts`, `tests/krEveningRefresh.test.ts`, `tests/krEveningQuoteContract.test.ts`, 이 보고서의 총 5개.

### 이번 실행의 검증 결과

| 시험 파일 | 이번 실행 결과 | 확인 범위 |
|---|---|---|
| `tests/krEveningRefresh.test.ts` | 16/16 | 기존 PRE·DST·주말·비용 가드 + POST 1/4/7종목 실측의 세션 분리·보합 |
| `tests/krEveningQuoteContract.test.ts` | 7/7 | 두 차례 관문 입력 전부, 실제 API → 저장소 초기화 → 표시 계산 → 폴링, 조기 폐장·missing·0 구분 |
| `tests/todayPicks.test.ts` | 46/46 | 17:30·21:00 EDT/EST 슬롯·금요일판 교체·동일 슬롯·주말·기존 상한/표시 계약 |

합계 69/69 통과. 세 파일은 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 순차 실행됐으며 외부 시세·Redis·AI는 모의했다. 전체 tsc는 같은 잠금으로 `node node_modules/typescript/bin/tsc --noEmit --incremental false`를 1회 실행해 진단 없이 종료 코드 0이다. `git diff --check`도 통과했다. 위 234개는 이전 관문 수정 때의 기록이다.

운영 생성 문장·실제 비용은 미확인이다. 이번 작업에서 화면 라벨·문구·배치 변경, 커밋·push·병합·배포·운영 데이터 쓰기는 하지 않았다.
