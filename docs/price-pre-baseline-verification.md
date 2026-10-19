# PRE 본장 기준·UC 조기 폐장 시각 검증

## 결과 요약

- 기존 지정 브랜치 `fix/price-pre-baseline`에서 재작업했다. HEAD는 `4d30066cd18f9ee16811bbf258cee6fb9554c0c1`, 로컬 `origin/main`과 merge-base는 `1b31b0a894206b52accaa05b8569dd86463809a7`이다. 이번 작업에서 커밋·fetch·push·병합·배포·운영 쓰기는 하지 않았다.
- 관문 `gate-fix_price-pre-baseline-10200438.md` 재현: 저장 기준가 100·구조 가격 99·일봉 종가 100을 실제 unified 생성식 → 저장소 초기화 두 곳 → 모바일 표시식 3곳에 입력하면 기존 HEAD는 표시 99가 됐다. 수정 전 신규 16건 모두 실패, 기존 재생 31건 통과를 확인했다.
- 원인: 두 PRE 초기화가 구조 가격 `underlyingPrice`를 날짜 비교 없이 `prevRegularClose`에 넣었다. 구조 가격은 종가 관측 날짜가 없어 종가 후보에서 제외했다. 명시적 일봉 종가 `regularCloseToday`와 실제 일봉 날짜를 전달하고, 보관 종가는 양쪽 날짜가 확인되고 후보 날짜가 더 새로울 때만 교체한다. 동일일·과거일·날짜 불명은 기존 가격·날짜·일간 등락을 유지한다. 보관 종가가 전혀 없으면 일봉 종가로 초기화한다.
- 일봉 어댑터 `intrinioClient.getDailyAggregates`는 날짜를 UTC 자정 epoch로 만든다. 이 날짜 라벨을 ET로 변환하면 하루 밀리므로 UTC 날짜를 보존한다. 응답 수신일·현재일로 채우지 않는다. 옛 Redis 항목에 날짜가 없어도 추가 조회를 발생시키지 않는다.
- 처음 분리한 두 수정은 유지한다: PRE WS는 오래된 `regularCloseToday` 대신 직전 본장 가격을 기준으로 계산하고, SSR 본장 일간 등락을 보존한다. UC 배경·캐시 열쇠는 `marketCalendar.cashSessionPhaseAt`을 사용하고 FACTS는 `sessionCloseMinutes`의 실제 마감 시각을 사용한다. 조기 폐장 3일은 13:00 ET다.
- 화면 파일·고정 라벨·번역·칸 표시 방식은 변경하지 않았다. 다른 화면의 가격 채택 경로는 수정하지 않았다.

## 바꾼 파일

origin/main 대비 범위:

| 파일 | 변경 |
| --- | --- |
| `src/stores/dashboardStore.ts` | PRE unified 초기화 두 곳을 같은 종가 날짜 비교에 연결. `prevRegularCloseDate` 보관. SSR·폴링이 기준가를 덮으면 제공된 날짜 또는 null로 함께 갱신해 옛 날짜가 새 값에 붙지 않게 함. 기존 PRE WS 수리 유지 |
| `src/app/api/dashboard/unified/route.ts` | 기존 일봉 조회·메모리·Redis 항목에 실제 날짜 보존. 두 PRE 응답 경로에만 `regularCloseDate` 전달. 호출 횟수·TTL·다른 세션의 가격 선택은 유지 |
| `src/lib/marketCalendar.ts` | 조기 폐장을 반영하는 현물 구간 판정 `cashSessionPhaseAt` |
| `src/lib/marketBackdrop.ts` | UC 배경·캐시 열쇠를 달력 판정에 연결하고 FACTS에 날짜별 마감 시각 사용 |
| `tests/pricePreBaseline.replay.test.ts` | 관문 회귀, 날짜 신구·동일·결측, 실제 두 unified 생성식·저장소·모바일 표시식 재생 |
| `tests/fixtures/price-pre-baseline/quotes-2310.json`, `README.md` | 기존 저장 REG 사본 5종목의 가격 필드와 출처 |
| 이 문서 | 원인·공유 호출처·실행 기록 |

공유 함수 호출처와 영향:

- `seedUnifiedPrice`는 저장소 `fetchDashboardData`, `fetchSingleTicker` 두 곳에서만 호출한다. PRE는 위 날짜 비교를 사용한다. REG·POST·CLOSED 초기화 계산은 기존과 같다.
- 저장소 가격 작업 호출자는 `DashboardClient`, `MobileDashboardPage`, `MobileDashboardClient`다. `MobileDashboardShell`의 헤더·서랍과 `MobileMetricsTab`은 같은 저장 가격을 읽는다. `MobileHoldingCard`, `MobileCommandPage`, `WatchlistClientPage`, `PortfolioClientPage`는 종목 선택·추가 등 저장소 관리 기능을 사용하며 별도 가격 경로는 변경하지 않았다.
- `getDailyChangeBatch` 직접 호출은 `buildResponseFromResults`, `buildResponseFromAnalysisCache` 두 곳이다. 두 경로를 실제 함수로 재생하고 PRE의 날짜 전달·빈 저장소 초기화 및 REG·POST·CLOSED 기존 가격 필드와 PRE 메타데이터 부재를 검증한다. 알파·저장·벤더 의존성은 메모리 대역이다.
- `cashSessionPhaseAt` 직접 호출은 `marketBackdrop.calendarKey`, `buildBackdrop` 두 곳이다. 다른 `marketSession.cashPhase` 호출처는 이번 변경에 포함하지 않았다.
- `buildBackdrop` 직접 호출은 `marketBackdropLoader.loadBackdrop`, `preMarketContext`, `/api/market/now`·`/api/undercurrent/macro`의 시뮬레이션이다. `loadBackdrop`은 위 두 API에서 사용한다. `factsBlock`은 UC macro AI 입력, `calendarKey`는 같은 API의 캐시 검증에 쓰인다. 정상일·휴일·주말과 조기 폐장 경계·가격 자료 날짜 보존을 검증한다.

## 돌린 시험과 결과

- 수정 전 HEAD: 신규 관문·날짜 재생 **16건 실패**, 기존 **31건 통과**. 실제 오류 재현이며 과거 기록의 통과 수를 재사용하지 않았다.
- 1차 수정 후: 원본 reg-snapshots 지정 재생 **47/47 통과**.
- 최종 재생: **55/55 통과**, 종료 코드 0. 원본 `/Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots/quotes-2310.json`을 지정했다. 일봉 UTC 날짜, 두 실제 응답 경로의 PRE 초기화, REG·POST·CLOSED 계약도 포함한다.
- 전체 tsc: **오류 0개**, 종료 코드 0. 이번 재작업에서 한 번 실행했으며 이후 생산 소스 변경은 없다. `/tmp/signum-pre-baseline-tsc.log`는 0바이트다.
- 기존 회귀: `marketCalendar.session.test.ts` **37/37**, `marketBackdrop.session.test.ts` **71/71**, `dashCloseRoll.test.ts` **통과**. 각각 종료 코드 0.
- 추가 `krEveningQuoteContract.test.ts`: 첫 실행은 `@/lib/marketSession` 별칭 해석 실패로 시작 중단. `/tmp/signum-pre-baseline-alias.cjs`의 실행기 경로 매핑을 적용한 재실행은 **7/7 통과**, 종료 코드 0. 생산 소스·기존 시험 파일은 수정하지 않았다.
- 잠금이 다른 작업공간에 점유된 동안 대기했고 우회하지 않았다. 최종 재생 뒤 tsc와 기존 회귀를 공용 잠금 아래 순차 실행했다.
- origin/main 대비 변경 파일은 위 표의 8개다. 이번 재작업의 미커밋 변경은 저장소·unified API·재생 시험·이 문서 4개다.
- PRE·POST·조기 폐장 경계와 관문 입력은 합성 재생이다. REG 5종목 입력만 실제 저장 API 사본이다. 공식 종가·실기기 측정이라고 주장하지 않는다.
- 테스트는 실제 저장소 작업·생산 함수·모바일 계산식 3곳을 실행한다. 브라우저·운영 피드·Redis·DB·환경 파일은 읽거나 연결하지 않는다.
- 무거운 명령과 회귀 묶음은 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 순차 실행한다.

재생 명령:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/ts-node/dist/bin.js --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' tests/pricePreBaseline.replay.test.ts --snapshots-dir=/Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots
```

전체 타입 검사 명령(이번 재작업에서 한 번, 실제로는 아래 잠금 안의 순차 실행기에 포함):

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false
```

실제 순차 실행 명령은 `/usr/bin/lockf -k /tmp/signum-heavy.lock python3 /tmp/signum-pre-baseline-recheck.py`다. 로그는 `/tmp/signum-pre-baseline-{tsc,marketCalendar.session,marketBackdrop.session,dashCloseRoll}.log`와 `/tmp/signum-pre-baseline-krEveningQuoteContract-retry.log`에 있다.

## 남은 위험

- 기존 보관 기준가 또는 새 일봉의 날짜가 없으면 신구를 확정할 수 없어 초기화에서 기존 기준가를 보존한다. 다음 정상 quotes는 기존 경로대로 갱신한다. 날짜를 현재 시각으로 만들어 채우지 않는다.
- 운영 피드·브라우저·실기기·실제 AI 생성 출력은 미검증이다. UC 출력 검사에 별도 16시 문장 검출은 추가하지 않았다.
- 원격 서버의 최신 main과 로컬 origin/main의 일치 여부는 미확인이다.
