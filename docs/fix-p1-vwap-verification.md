# P1 VWAP 2차 수리 검증

## 결과 요약

- 원인: `intrinioClient.bar()`와 `getDailyAggregates()`가 전형가격 `(H+L+C)/3`을 거래량가중평균 필드 `vw`로 반환했다. grouped 일봉에도 같은 대체가 있었다.
- 수정: 이 경로의 `vw`는 원천 VWAP이 없으면 `null`. 전형가격은 `typicalPrice`로 보존한다. OHLCV·정렬·limit·가격·종가 확정·세션 판정은 유지한다. 종가만 보유한 grouped 이전 날짜에는 전형가격도 만들지 않는다.
- 추가로 확인한 소비 경로: Terminal은 결측 VWAP을 현재가로 대체했다. 기존 숫자 계약의 결측 센티널 `0`으로 바꿔 가짜 VWAP과 거리 계산을 막았다.
- 실제 VWAP을 새로 공급하는 변경은 아니다. 화면 컴포넌트·라벨·문구·조건부 표시 코드는 수정하지 않았다. 기존 화면의 결측 처리(`0` 또는 `--` 등)는 그대로 적용된다.
- 공급사·Redis·DB 실제 호출/쓰기, 브라우저, 커밋, push, 병합, 배포는 수행하지 않았다. 공급사 요청 경로·수·캐시 TTL도 수정하지 않았다.

### 재현 근거와 한계

최신 관문 `gate-fix_p1-vwap-10170802.md` 전문과 감사 보고서 ⑧의 3번을 읽었다.

`measure/out/ec2-10161700.txt`의 gzip payload에서 `NVDA_realtime_default`, `stock_eod`, `interval_edge`의 **id/status/summary만** fixture에 옮겼다. 모두 `401 / {}`다. 다른 EC2 측정 파일도 해당 REST 성공 본문이 없었다. 따라서 성공 OHLCV의 실측 fixture라고 주장하지 않는다. 성공 본문 모양은 기존 어댑터와 실측기 `measure/probe.py:intrinio_summary`의 필드 계약을 따르며, 값은 합성 입력이다.

체결 `100×1 → 110×97 → 90×1 → 100×1`은 OHLCV `100/110/90/100/100`, 실제 VWAP `109.60`이다. 거래량 배분을 바꾸면 같은 OHLCV에서 VWAP `90.40`도 가능하다. 기존 어댑터는 두 경우 모두 `100`을 반환했다. OHLCV만으로 실제 VWAP을 복원할 수 없으므로 근사값을 별도 필드로 분리했다.

수리 전 **실제 gateway → snapshot/daily 함수 → router**를 실행한 11개 시험에서 10개가 실패했다(숫자 `100` 또는 `0`이 `null`과 불일치). 계산식만 복사한 시험이 아니다. 수리 후 같은 11개가 모두 통과했고, 호출자 검증을 추가한 최종 33개도 통과했다.

## 바꾼 파일

| 파일 | 변경 |
|---|---|
| `src/services/intrinioClient.ts` | 스냅샷·개별/벌크 일봉·grouped의 VWAP/전형가격 계약 분리 |
| `src/services/terminalEnricher.ts` | 현재가를 VWAP 결측 대용으로 쓰지 않음 |
| `src/app/api/dashboard/unified/route.ts` | 명시적 `vw=null`에 대한 무의미한 동일 스냅샷 재조회 방지 |
| `tests/intrinioVwap.test.ts` | 실제 어댑터/라우터/서비스, 소비자 매핑, 가격·세션 보존 33개 시험 |
| `tests/fixtures/intrinio-vwap.json` | 실측 상태와 합성 OHLCV를 명시적으로 구분한 입력 |
| `tests/tsconfig.intrinio-vwap.json` | 변경 3개 모듈·시험·전이 의존성의 범위 타입 검사(Next 전역 타입 포함) |
| `docs/fix-p1-vwap-verification.md` | 이 보고서 |

### 공유 함수 호출자와 영향

| 함수/경로 | 직접 호출자 전부 | 시험·영향 |
|---|---|---|
| `bar()` | `getTickerSnapshot`, `buildMarketTickers`, `getDailyAggregates`, `getGroupedDailyIntrinio` | day/prevDay/min·개별/벌크·일봉·grouped의 `vw=null`, 전형가격 분리. OHLCV 보존 |
| `getTickerSnapshot` | `intrinioRouter.routeToIntrinio`, `sessionAwareLiquidity`, `buildTickersDirect` | 실제 router 단일 조회, 소수 batch, 유동성 fallback 실행. 유동성은 호가로 계산해 정상 유지 |
| `getDailyAggregates` | `intrinioRouter`의 day range, prev 분기 | 실제 호출로 asc/desc·limit·count·OHLCV·null 검증 |
| `getGroupedDailyIntrinio` | `intrinioRouter` grouped 분기 | 최신·직전·종가 행렬 이력의 누락값 계약 검증 |
| `buildMarketTickers` | `getFullMarketSnapshotIntrinio`, `getMoversIntrinio` | 실제 전체 bulk 실행. movers는 동일 결과를 가격/거래량으로 정렬하며 VWAP은 읽지 않음(정적 확인) |
| `buildPriceEvidence` | `enrichSingleTickerWithRetry` | 현재 소스의 함수 본문 전체 실행. 현재가 보존·결측/정상 VWAP·거리 계산 검증 |
| `buildResponseFromAnalysisCache` | dashboard `GET`의 부분/전체 analysis-cache 응답 분기 두 곳 | 결측 명시(null)는 재조회 제외, 값 미수신/기존 0은 재조회 유지. 수정 전 1 실패 → 수정 후 통과 |
| Terminal 상위 | `enrichTerminalItems` → `reportScheduler`, `api/cron/backfill-terminal` | 직접 import/호출 전수 확인. 운영 report/cron 실행하지 않음 |

다음 17개 파일의 `.vw` 소비를 전수 확인했다. 모든 HTTP/화면을 실행한 것은 아니다.

- **실제 함수 실행:** `services/stockApi.getStockData`(SSR 입력), `services/centralDataHub.getUnifiedData`, `services/tickerOverview.getTickerOverview`. 실제 어댑터/라우터를 유지하고 옵션·뉴스·저장소만 대역으로 격리했다. CentralDataHub의 `dayVwap` 지역변수는 반환되지 않는 기존 미사용 값이며 가격·종가 선택에는 관여하지 않는다.
- **현재 소스의 매핑식 실행:** `api/live/ticker`(display·alpha 두 곳), `api/live/prev-day`, `api/dashboard/daily-history`, `api/dashboard/unified`, `api/portfolio/batch`, `api/quant-radar`; `services/stockApi`, `marketDataLight`, `watchlistBatchService`, `portfolioBatchService`, `unifiedPriceService`, `top3Enrichment`, `terminalEnricher`. 각 경로에 `null`과 정상 VWAP `109.6` 및 별도 전형가격 `100`을 넣고 결과를 검증했다. 캐시 대용값도 결측/정상값으로 맞춘 단위 시험이다.
- **현재 소스의 숫자 필터 실행:** `api/wim/today`, `api/wim/lab`. 결측 VWAP은 숫자 배열에 섞이지 않는다. 이번에 분봉 원천/매핑은 바꾸지 않았다.
- **분석 엔진 실행:** 실제 snapshot의 null을 `alphaEngine.calculateAlphaScore`에 전달해 기존 `VWAP 없음(추정)` 분기를 확인했다. 점수 산식·문구는 수정하지 않았다.
- `CommandSSRCards` 등 화면의 후속 `.vwap` 소비는 기존 `getStockData`의 결측 처리에 따른다. 화면 렌더링/브라우저 시험은 하지 않았다.

## 돌린 시험과 결과

공통 시험 실행기:

```sh
node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only \
  -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' \
  tests/intrinioVwap.test.ts
```

| 시험 | 결과 |
|---|---|
| 수정 전 `intrinioVwap` 초기 11개 | 1 통과 / 10 실패 — 결함 재현 |
| 수정 후 `intrinioVwap` 최종 | 33 통과 / 0 실패 |
| `regularRealtimeOverlay.test.ts` | 10 통과 |
| `extStaleSnapshot.test.ts` | 21 통과 |
| `extendedSipOverlay.test.ts` | 22 통과 |
| `extStaleRoute.test.ts` | 6 통과 |
| `quotesBulkClose.test.ts` | 9 통과 |
| `afterCloseSession.test.ts` | 35 통과 |
| 전체 `tsc --noEmit --incremental false` | 실패 1건: 기존 `src/remotion/kit/scripts.ts:5004`의 `./scripts-jpweek` 누락. HEAD에서도 참조는 있고 대상 모듈은 없음 |
| 범위 `tsc --noEmit -p tests/tsconfig.intrinio-vwap.json` | 변경 3개 모듈·새 시험·전이 의존성 통과(exit 0) |
| `git diff --check` | 통과(exit 0) |

전체 tsc는 한 번만 실행했다. tsc와 기존 6개 파일 시험 묶음은 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 감쌌다. 범위 검사 준비 중 임시 config가 Next 전역 타입을 빠뜨려 `RequestInit.next` 오류 3건을 낸 것은 시험 구성 오류였다. 최종 범위 config는 설치된 Next의 전역 타입을 포함한다. 외부 의존성은 기존 작업 저장소의 `node_modules`를 읽기 링크로 사용했다.

## 남은 위험

- 실제 VWAP의 수급·계정 권리·기간별 정확성은 확인/확대하지 않았다. 이 수리는 근사값을 실제 VWAP으로 오인시키는 지정 경로를 제거한다.
- 기존 화면은 null을 기존 방식으로 처리하므로 일부 화면은 `0.00` 또는 결측 표시, 분석은 기존 추정 분기를 사용할 수 있다. 화면 표시 변경이나 칸 숨김을 추가하지 않았다.
- 기존 응답/분석/last-good 캐시에 남아 있는 과거 근사값은 자연 만료 전까지 남을 수 있다. 운영 캐시 삭제·데이터 쓰기는 하지 않았다.
- 분봉 `average`, 시간외 점관측, 옵션 `day.vwap`, 별도 Lambda 어댑터의 가격 정의는 이번 일봉/스냅샷 수리 범위 밖이다. 이 작업으로 전체 VWAP 계열의 정확성을 보증하지 않는다.
- 전체 타입 검사의 기존 모듈 누락은 남아 있다. 성공 Intrinio 실측과 화면 렌더링 검증은 하지 않았다.
