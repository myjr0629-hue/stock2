# P1 시각·가격 정의 수리 검증 (7차)

## 결과 요약 · 해소한 지적

시작 HEAD `eb75a841c`, 브랜치 `fix/p1-time-basis`, 시작 시 미커밋 변경 없음. 최신 관문 `gate-fix_p1-time-basis-10172138.md`와 지정 지시서 `task-p1-time-basis-6.md` 전문을 먼저 읽었다. 이전 관문 `10170802`, `10171204`, `10171459`, `10171627`, `10171953`, 최초 지시서와 감사 보고서 ⑧·상세 부록 목록도 확인했다.

최신 관문 문장 인용:

> “반일장의 유효 POST 체결 누락”
>
> “13시 조기폐장일인 **2026-11-27**, 16:16:30 ET 조회에서 마지막 POST 체결이 **16:00:00.000 또는 .500의 $103**이면, 기존은 $103을 반환하지만 현재는 **SSR `null`·quotes API `0`**입니다.”
>
> “실제 마감시각과 무관하게 16시 첫 1초를 정규장으로 제외하기 때문입니다. 어댑터의 `hasExtendedTrade=true`도 무시됩니다. 16:00:01 대조군은 정상입니다.”

- 원인: `extendedSessionClose.ts`의 `isTradeInExtSession`이 POST 시작을 960분으로 고정하고, 그 분의 첫 1초를 항상 제외했다. 어댑터의 13:00 마감 판정과 소비자의 16:00 고정 판정이 달랐다.
- 제품 수정 전 시험: 실제 어댑터 → SSR, 실제 어댑터 → quotes GET에서 .000·.500 각각 실패했다(`null !== 103`, `0 !== 103`). `hasExtendedTrade=true`와 원천시각은 통과한 뒤 소비자 가격 비교에서 실패했다. 16:00:01 두 대조군과 기존 34개는 통과했다. 반일장 3일의 13:00:01도 각각 실패해 **36통과·7실패**였다. `/tmp/signum-p1-time-basis-7-red.log`.
- 수정: 기존 `marketCalendar.sessionCloseMinutes(date)`를 사용해 POST 시작과 마감 첫 1초 제외를 같은 날짜의 실제 마감에 맞췄다. 일반장 16:00:00.xxx와 반일장 13:00:00.xxx는 제외하고, 반일장 16:00:00.xxx는 허용한다.
- 수정 후: .000·.500·01.000 모두 SSR POST $103, quotes 30/31/100종목 POST $103과 원천시각·`trade/cboe_one_delayed`를 확인했다. quotes 정규장 가격 $102와 POST 라벨은 유지했다. **43/43 통과**, `/tmp/signum-p1-time-basis-7-green.log`.
- 반일장 `2026-11-27`, `2026-12-24`, `2027-11-26`: 12:59:59.999 및 13:00:00.000/.500/.999 제외, 13:00:01·13:00:30·16:00:00.000/.500 허용을 확인했다. 다른 날짜·PRE 오분류도 거부한다. 이 경계 시험의 조회 시각은 16:16:30 ET다.

모든 재현은 생산 모듈에 합성 입력과 I/O 대역을 넣은 오프라인 시험이다. 실공급사·실소켓·운영 발생 빈도를 측정한 결과는 아니다. `scripts/lib/us-market-calendar.js`의 거래일 판정과 ET→UTC 변환을 시험에 사용했다. 이 스크립트의 `lastUsClose`는 반일장도 보수적으로 16:00으로 보는 기존 정책이므로, 13:00 표는 앱의 기존 `EARLY_CLOSE_DATES/sessionCloseMinutes`를 사용했다. 새 달력이나 휴장표는 만들지 않았다.

이전 관문 회귀는 삭제·기대값 변경 없이 유지했다.

| 이전 관문 문장 인용 | 유지한 시험 |
|---|---|
| “지연 체결의 세션 오판정.” | 09:25 체결을 09:40 수신해도 원천시각 유지, 정규장 허브 덧입히기 거부 |
| “CSV 미드를 현재 시간외 체결로 전달.” | 정규장 CSV를 16:01에 읽어도 POST로 만들지 않음 |
| “프리마켓 무버가 전일 종가로 돌아감.” | Provider → 실제 Movers의 $105/+5%와 PRE-MKT 유지 |
| “저장된 정규장 체결을 EOD로 오표기.” | 저장본 $102의 체결 시각·basis 유지, 게시된 EOD만 EOD로 판정 |
| “정규장 호가가 PRE 값으로 반환됨.” | 09:29:59 bid + 09:30:01 ask는 정규장 미드 |
| “정규장 체결에 SIP 출처가 남음.” | SIP 덧입히기 → 저장본 → 정규장 폴백에서 Cboe/Edge 출처 보존 |
| “정규장 마감 체결이 POST 가격으로 재분류됨.” | 일반장 16:00:00.000/.999 및 false 메타데이터는 SSR POST에서 제외 |
| “유효한 마감 직후 POST 체결이 SSR에서 누락됨.” | 일반장 16:00:01·16:00:30·16:01:01의 실제 어댑터 → SSR POST $103 유지 |

## 바꾼 파일

- `src/services/extendedSessionClose.ts:395`: 스냅샷 시간외 판정의 POST 시작·마감 첫 1초에 기존 날짜별 마감시각을 적용했다.
- `tests/priceTimeBasis.test.ts:145`: 최신 관문 4개 실패 사례, 정상 대조 2개, 반일장 3일 경계 시험을 추가했다.
- 이 검증 문서.

화면 파일·라벨·문구·배치·CSS를 바꾸지 않았다. `WINDOW`, `FINAL_AT_MIN`, `isExtCloseFinal`, Form T 확정 종가 계산·선점·warm 로직, 정규장 종가 선택, 공급사 호출·폴링·캐시 TTL은 그대로다. `sessionCloseMinutes` 자체도 수정하지 않았다.

영어 커밋 메시지: `/tmp/signum-p1-time-basis-7-commit.txt` — `Respect early-close dates when classifying extended-session trades`. 커밋은 생성하지 않았다.

## 공유 함수 호출자 · 같은 필드 소비 경로

`rg`와 전체 추적 코드의 `git grep`으로 검색했다. 후자는 JS/TS/TSX/MJS/CJS/Python을 포함해 별도 Lambda·보관본도 찾는다. 호출자 검색 112행·17파일, 필드 검색 1,475행·201파일이며 주석·시험·동명 옵션 필드·보관본도 포함한다. 전수 검색과 각 외부 직접 호출부의 조건을 확인했으며, 검색된 모든 화면을 실행했다는 뜻은 아니다.

- `/tmp/signum-p1-time-basis-7-callers-all.txt`
- `/tmp/signum-p1-time-basis-7-field-consumers-all.txt`
- `/tmp/signum-p1-time-basis-7-shared-entrypoints.txt`
- `/tmp/signum-p1-time-basis-7-transitive-consumers.txt`
- `/tmp/signum-p1-time-basis-7-duplicate-adapters.txt`

| 외부 직접 호출 파일 | 영향 · 시험 |
|---|---|
| `marketDataLight.ts` | POST/closed의 스냅샷 후보 허용. 최신 입력의 실제 SSR 함수 시험. ticker/page → LiveTickerDashboard, marketing-v2, daily-content 전달 경로 확인 |
| `live/quotes/route.ts` | POST/closed의 `extendedPrice/Time/Basis/Source` 후보 허용. 실제 GET 30/31/100종목, 이전 PRE·종가·허브 회귀 실행 |
| `live/ticker/route.ts` | POST 및 closed의 `postPrice/Date/Kind/Time` 후보 허용. 호출부 확인, extStaleRoute·extTransition·preCloseCarryAcrossOpen 회귀. 신규 반일장 입력의 전체 ticker GET은 미실행 |
| `intel/fast/route.ts` | POST/closed 가격·정규장 대비 등락률 후보 허용. 호출부 및 Intel 소비 경로 확인, 신규 반일장 전체 라우트는 미실행 |
| `watchlistBatchService.ts` | 경량 폴백의 시간외 등락률, 묶음 POST/closed 가격 후보 허용. watchlistData 49개 회귀, 신규 반일장 서비스 전체는 미실행 |
| `portfolioBatchService.ts` | 묶음 POST/closed 후보 허용. portfolio/page·portfolio/batch 경로 및 분기 확인, 신규 반일장 서비스 전체는 미실행 |
| `stockApi.ts` | getStockData의 POST 후보·시간외 등락률 허용. stock API·actions·watchlist/portfolio analyze·top3Enrichment 경로 확인. extTransition의 차트/PRE 회귀; 신규 반일장 전체 함수는 미실행 |
| `centralDataHub.ts` | POST/closed 후보 허용. tickerOverview·live/ticker·Intel 경로 확인, 신규 반일장 허브 전체는 미실행 |
| `structureService.ts` | POST의 `extended.postPrice/postChangePct` 후보 허용. getStructureData 소비 경로 확인, 신규 반일장 구조 서비스 전체는 미실행 |
| `undercurrent/price/route.ts` | PRE 판정만 호출하므로 동작 불변. 호출부 확인 |

모듈 내부 `rememberProvisionalPreClose` 및 `pickRegularPreClose`의 snapshot/recalled 경로는 PRE만 호출하므로 불변이다. extTransition·preCloseCarryAcrossOpen에서 기억/재호출·확정 우선순위를 확인했다. `scripts/test-extended-session-close.ts`는 진단용 호출자이며 실행하지 않았다.

같은 필드의 전달 경로도 검색했다. quotes → useLivePrice/useLiveQuotes·dashboardStore·Intel batch, ticker → usePriceDisplay/calcPriceDisplay·Command/Flow, SSR → LiveTickerDashboard, watchlist/portfolio batch → 목록 hook·페이지로 전달된다. `lastTrade.p/t`와 어댑터 `hasExtendedTrade/preMarket/afterHours`의 생산 코드는 이번에 수정하지 않았다. snapshot을 직접 읽는 Intel 섹터·dashboard/unified·unifiedPriceService·macroHubProvider·엔진·rankings·관련 가격/옵션 API와 보관본도 필드 검색에 포함했다. 공유 함수를 호출하지 않는 독립 판정 경로에는 이번 효과를 주장하지 않는다.

## 돌린 시험과 결과

회귀 묶음은 순차 실행했다. 실패 확인·통과 확인·14파일 회귀·전체 타입 검사에 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`을 적용했다. 최소 환경과 preload로 `.env*` 읽기·실제 fetch/HTTP/socket을 차단했다. Redis는 메모리 대역이다. 전체 타입 검사는 한 번만 실행했고 빌드는 실행하지 않았다.

| 시험 | 결과 |
|---|---|
| priceTimeBasis | 수정 전 36통과·7실패 → 수정 후 43/43 통과 |
| hubLiveOverlay / quotesBulkClose / regularRealtimeOverlay | 23 / 9 / 10개 통과 |
| extStaleSnapshot / extStaleRoute | 21 / 6개 통과 |
| extTransition / preCloseCarryAcrossOpen | 34 / 3개 통과 |
| priceHardeningComparison | 83개 비교 행 통과 |
| extendedSipOverlay / extendedSipClaim | 22 / 4개 통과 |
| watchlistData / marketCalendar.session / extWsTrust | 49 / 37 / 12개 통과 |
| extCloseStarvation | 25개 통과: 확정·선점·warm·오류/미확정 캐시 계약 유지 |
| node --check scripts/lib/us-market-calendar.js / git diff --check | 통과 |
| 전체 tsc --noEmit --incremental false --pretty false | 실패 1건: `src/remotion/kit/scripts.ts:5004`의 기존 `./scripts-jpweek` 모듈 누락. 변경 파일 진단 없음 |

회귀 14파일 모두 exit 0: `/tmp/signum-p1-time-basis-7-results.json`, 개별 `-<시험명>.log`. 실행기 `/tmp/signum-p1-time-basis-7-regressions.py`, I/O 차단 `/tmp/signum-p1-time-basis-7-offline.cjs`, 타입 검사 `/tmp/signum-p1-time-basis-7-tsc.log`. 시작 HEAD에도 같은 import가 있고 해당 모듈이 없음을 `git show`·`git ls-tree`로 확인했다.

## 남은 위험

- 신규 반일장 입력의 통합 실행은 SSR와 quotes이며, 나머지 직접 호출자는 코드 추적과 기존 회귀로 확인했다. 운영·브라우저·실소켓은 미검증이다.
- 반일장 시험은 **원천 체결의 13:00 경계**를 조회 시각 16:16:30에 검증했다. SSR의 기존 벽시계 세션 분류는 여전히 16:00/20:00 기준이다. 반일장 13~16시 조회의 세션·모든 서비스의 세션 전환 및 17시 종료 체계 전체를 수정·검증한 결과가 아니다. 스냅샷 helper의 기존 상한 20:00과 확정 종가 창/확정시각도 유지했다.
- 별도 Lambda 어댑터 **5개**(`harvest_lambda`, `scripts/lambda-flow-harvest`, `lambda-harvest`, `lambda-shared`, `lambda-xs`)에 `regularTime + 60000` 조건이 남아 있다. 이전 기록의 4개에 더해 루트 `harvest_lambda`도 확인했다. 변경·배포하지 않았다.
- 기존 SSR/라우트 캐시는 SWR 갱신·TTL 만료까지 이전 결과를 줄 수 있다. 운영 캐시를 수정하지 않았다. 기존 `.p` 접근 등 독립 소비 경로 문제도 이번 범위에서 수정하지 않았다.
- 전체 타입 검사는 기존 모듈 누락으로 통과하지 못했다. push·main 병합·배포·운영 쓰기·브라우저 접근·환경파일 읽기는 하지 않았다.
