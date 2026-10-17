# P1 시각·가격 정의 수리 검증 (5차)

## 결과 요약 · 해소한 관문 지적

시작 HEAD `1e9abcf64`, 브랜치 `fix/p1-time-basis`. 최신 `gate-fix_p1-time-basis-10171627.md` 전문을 먼저 읽고, 이전 `10170802`, `10171204`, `10171459` 원문도 전부 읽었다. 아래는 실제 생산 모듈에 합성 입력과 I/O 대역을 넣은 오프라인 시험 결과다. 운영 발생 빈도에 관한 실측은 아니다.

최신 관문 인용: **“정규장 마감 체결이 POST 가격으로 재분류됨”**, **“폴백이 정규장 시각을 `lastTrade.t`에 넣으면 … `hasExtendedTrade=false`를 무시하고 POST $102를 반환합니다.”**

- 원인: `intrinioClient.ts`의 정규장 폴백은 가격 $102의 원천시각·basis/source를 올바르게 보존하지만, `marketDataLight.ts`는 시간외 부정 메타데이터를 읽지 않았다. 또한 `isTradeInExtSession`은 분 단위로 16:00 전체를 POST로 분류했다.
- 수정 전: 18:00 ET·조회 실패·1시간 된 저장본·당일 EOD 미게시·16:00:00.000/.999 정규장 $102를 실제 `getTickerSnapshot` → 실제 `getStockDataLight`로 전달하면 POST $102. 이 2개 및 메타데이터/공용 경계 3개, 총 5개 실패를 확인했다. 기존 22개와 유효 POST 대조 1개는 통과했다.
- 수정 후: 정규장 $102의 가격·원천시각·`trade/cboe_one_delayed`를 유지하면서 SSR POST 후보로 선택하지 않는다. 16:00:00.000~16:00:00.999 마감 경매·정규장 체결은 REG이며, 16:00:01부터 POST 후보로 인정한다. 현재 화면 세션 이름과 기존 라벨은 그대로다.
- `hasExtendedTrade=false`는 SSR의 PRE/POST 및 CLOSED 잠정 후보에 적용한다. 메타데이터가 없는 호환 스냅샷과 true인 유효 POST는 유지한다. 별도로 계산된 확정 종가의 우선순위는 유지한다.

실패 로그: `/tmp/signum-p1-time-basis-5-red.log` (23통과·5실패). 수정 직후 `/tmp/signum-p1-time-basis-5-green.log` (28/28). EST·PRE 경계 보강 후 최종 `/tmp/signum-p1-time-basis-5-priceTimeBasis.log` (30/30).

이전 관문 지적의 회귀 시험을 삭제하거나 기대값을 완화하지 않았다.

| 이전 관문 문장 인용 | 유지한 확인 |
|---|---|
| “지연 체결의 세션 오판정.” | SDK 09:25 ET 체결을 09:40에 받아도 원천시각 보존, 정규장 허브 덧입히기 거부 |
| “CSV 미드를 현재 시간외 체결로 전달.” | 정규장 CSV 호가를 16:01에 읽어도 현재 POST로 만들지 않음 |
| “프리마켓 무버가 전일 종가로 돌아감.” | Provider → 실제 Movers $105/+5%, PRE-MKT 유지 |
| “저장된 정규장 체결을 EOD로 오표기.” | 저장본 $102는 trade와 원천시각 유지, 당일 EOD 게시 시에만 EOD 메타데이터 |
| “정규장 호가가 PRE 값으로 반환됨.” | 09:29:59 bid + 09:30:01 ask는 정규장 미드, PRE가 아님; 기억된 PRE $99.50 유지 |
| “정규장 체결에 SIP 출처가 남음.” | SIP 덧입히기 → 직렬화 저장본 → 실패 폴백의 $102는 Cboe 출처; 반복/Edge/구형 저장본 대조 유지 |

## 바꾼 파일

- `src/services/extendedSessionClose.ts`: `isTradeInExtSession`의 스냅샷 POST 후보 판정에서 16:00 첫 1초를 REG로 처리한다. PRE 분기·날짜 조건·20:00 종료는 유지한다.
- `src/services/marketDataLight.ts`: 시간외 스냅샷 후보를 고를 때 `_intrinio.hasExtendedTrade !== false`를 확인한다. 기존 live/ticker 소비자와 같은 계약이다.
- `tests/priceTimeBasis.test.ts`: 실제 SSR 소비자 VM을 추가하고 최신 관문/경계/메타데이터/EST/PRE 시험 8개를 추가했다. 기존 22개 유지.
- 이 문서. 이전 검증 문서 `docs/p1-time-basis-validation.md`는 보존했다.

화면 파일·라벨·문구·CSS는 변경하지 않았다. `resolveSessionPrices`·정규장 종가 선택과 `getExtendedSessionClose`·Form T 조회 창·확정 시각·확정 종가 계산은 변경하지 않았다. 시간외 판정 helper만 같은 파일에서 변경했다. 공급사 호출·폴링·TTL은 불변이다. `.env*` 읽기, 브라우저, 운영 쓰기, push·병합·배포는 실행하지 않았다.

## 공유 함수 호출자와 같은 필드 소비 경로

`rg -n 'isTradeInExtSession' src tests` 및 `rg -n '\blastTrade\b|hasExtendedTrade' src`와 `src scripts tests` 전체 참조 검색으로 확인했다. 로그는 `/tmp/signum-p1-time-basis-5-helper-consumers.txt`, `/tmp/signum-p1-time-basis-5-src-field-consumers.txt` (157행), `/tmp/signum-p1-time-basis-5-consumers.txt`에 있다. 아래는 모든 직접 생산 소비 파일과 영향이다. 파일별 화면을 실구동한 결과는 아니다.

| 공용 helper 호출자 | 영향·검증 |
|---|---|
| `marketDataLight.ts` `_fetchStockDataLight` | SSR PRE/POST/CLOSED 후보. 실제 모듈 VM으로 최신 관문, .000/.999/01, false/true/미제공 메타데이터, 확정 POST 우선순위 시험 |
| `watchlistBatchService.ts` 내부 getStockDataLight·buildBasePrice | PM gate 등락 및 목록의 PRE/POST 잠정 후보. 같은 공용 경계 적용. `watchlistData` 49개 통과; 실제 목록의 새 경계 통합 실행은 하지 않음 |
| `portfolioBatchService.ts` buildBasePrice | 포트폴리오 PRE/POST/CLOSED 잠정 후보. 같은 경계 적용; 확정값 우선순위 그대로. 호출부 코드 확인·공용 경계 시험; 경로 통합 미실행 |
| `stockApi.ts` getStockData | extOk 선택. 정규장 큰 가격·원천시각과 PRE 조건 불변. POST 경계에 공용 판정 적용; 호출부 코드 확인·공용 경계 시험 |
| `structureService.ts` getStructureDataImpl | 구조 데이터의 extended.postPrice 잠정 후보. 구조 session 이름·본장 가격·옵션 계산 불변. 호출부 코드 확인·공용 경계 시험 |
| `centralDataHub.ts` | PRE/POST/CLOSED 후보. 확정 저장값 우선순위 유지; 호출부 코드 확인·공용 경계 시험 |
| `/api/live/ticker` | 이미 snapHasExt 검사 있음. POST/CLOSED 잠정 후보에 공용 경계 적용. `extStaleRoute`, `preCloseCarryAcrossOpen`, `extTransition` 통과 |
| `/api/live/quotes` | POST/CLOSED 잠정 후보에 공용 경계 적용. 실제 GET의 30/31/100종목에서 .000/.999/01 및 POST 라벨 불변 시험. 정규장 허브·PRE 종가 회귀 유지 |
| `/api/intel/fast` | PRE/PRE CLOSE/POST/CLOSED 후보. PRE 쿼리 조건·확정값 우선순위 불변, POST 잠정 후보에 공용 경계 적용. 호출부 코드 확인·공용 경계 시험; 경로 통합 미실행 |
| `/api/undercurrent/price` | PRE 여부만 사용하므로 동작 불변. 호출부 확인·PRE 경계 대조 |
| helper와 같은 파일의 `rememberProvisionalPreClose`, `pickRegularPreClose` | PRE만 호출하므로 불변. `extTransition`, `preCloseCarryAcrossOpen` 회귀 통과 |

`getStockDataLight`의 모든 외부 직접 호출자는 `src/app/[locale]/ticker/page.tsx`, `src/lib/marketing-v2/core/data.ts`의 `fetchMarketSnapshot`/`fetchTickerData`, `src/app/api/cron/daily-content/route.ts`의 TSLA 데이터 조회다. 내부 `_fetchStockDataLight`는 캐시 miss와 SWR 갱신에서 호출된다. `fetchTruePreMarket`은 이 내부 함수 및 `tickerOverview.ts`가 부르며 이번 변경이 없다. watchlist/portfolio의 동명 내부 함수는 별개다.

SSR의 `extended.postPrice`는 `LiveTickerDashboard.tsx`의 SSR fallback으로 전달된다. UI의 조건·라벨은 그대로 두고 잘못 골랐던 시간외 후보만 바로잡았다. REG $102·원천시각을 0으로 되돌리거나 가격을 지우지 않았다. 실제 POST/확정값·기억된 PRE는 유지한다.

`lastTrade.t`를 읽는 추가 경로 `breaking/detectMove.ts`는 이동 감지 시각, `stockApi.ts`의 lastUpdateNanos는 갱신 메타데이터다. 이번에는 생산자 필드를 바꾸지 않아 영향이 없다. Router v3 `last_trade`, massiveClient/stockTypes는 전달 또는 가격 소비다. 나머지 가격/화면 소비 경로도 원천 `lastTrade.p/t` 자체는 변경하지 않는다. scripts의 Lambda 어댑터 동명 함수는 별도 구현이며 이 helper를 호출하지 않는다.

## 돌린 시험과 결과

모든 실행에 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 적용. 최종 회귀 묶음은 한 번 순차 실행했다. `.env*` 읽기 및 실제 외부 fetch/HTTP/socket 연결을 막는 preload와 최소 환경을 사용했다.

| 시험 | 결과 |
|---|---|
| `priceTimeBasis` | 최종 30/30 통과; 기존 22개 + 신규 8개 |
| `hubLiveOverlay` / `quotesBulkClose` / `regularRealtimeOverlay` | 각 23 / 9 / 10개 통과 |
| `extStaleSnapshot` / `extStaleRoute` | 각 21 / 6개 통과 |
| `extTransition` / `preCloseCarryAcrossOpen` | 각 34 / 3개 통과 |
| `priceHardeningComparison` | 83개 비교 행 통과 |
| `extendedSipOverlay` / `extendedSipClaim` | 각 22 / 4개 통과 |
| `watchlistData` / `marketCalendar.session` / `extWsTrust` | 각 49 / 37 / 12개 통과 |
| `node --check scripts/ec2-price-ws.js` / `git diff --check` | 통과 |
| 전체 `tsc --noEmit --incremental false --pretty false` | 1회 실행·실패: `src/remotion/kit/scripts.ts:5004`의 `./scripts-jpweek` 모듈 누락 1건. 변경 파일 진단 없음 |

회귀 14개 파일 모두 exit 0. 목록 `/tmp/signum-p1-time-basis-5-results.json`, 개별 로그 `/tmp/signum-p1-time-basis-5-<시험명>.log`. 전체 타입 검사 결과는 아래 남은 위험에 기록한다.

영어 커밋 메시지: `/tmp/signum-p1-time-basis-5-commit.txt` — `Fix closing-print session classification and SSR extended-trade eligibility`. 커밋은 생성하지 않았다.

## 남은 위험

- 운영·실소켓·브라우저 미검증. 새 경계의 라우트 통합 시험은 live/quotes와 SSR이며 다른 직접 소비자는 코드 추적과 공용 함수 시험으로 확인했다.
- 기존 cache:stockLight:v2 저장 결과는 다음 SWR 갱신/TTL 만료까지 남을 수 있다. 운영 캐시 삭제·TTL 변경은 하지 않았다.
- 같은 필드 전수 검색에서 공용 helper를 사용하지 않는 기존 Intel M7/섹터 API의 `afterHours?.p || latestPrice`/`lastTrade` 폴백도 확인했다. 이들은 원천시각과 무관하게 마지막 값을 시간외 값으로 쓰는 별도 기존 경로다. 이번 생산자 필드는 그대로이며 최신 관문 수리 범위의 SSR/공용 시간 판정 변경과 별개로 남아 있다.
- 반일장/휴장 달력·세션 시계 규칙은 변경하지 않았다. 이번 경계는 지시된 정규장 16:00 마감에 적용했다.
- 전체 타입 검사는 기존 Remotion `./scripts-jpweek` 모듈 누락으로 실패했다. 로그 `/tmp/signum-p1-time-basis-5-tsc.log`. 기존 HEAD에서도 같은 import와 파일 부재를 확인했다. 빌드와 서버 실행은 하지 않았다.
