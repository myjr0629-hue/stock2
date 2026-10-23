# H1 종목 RSI14 관문 보완 — 2026-10-23

## 3차 수리 — 공급사 호출 제한과 판정 범위

### 확인한 원인과 수리

- 2차 보류 전문에 적힌 잔여 문제는 전체 시험의 과거 기준 커밋 고정 검사 실패다. 이번 지시의 제외 대상(`earningsScenario`, `giftShareGate`의 rg 부재, `readCheck` 15번) 외 실패가 없는지 전체 묶음으로 확인한다. 제외 대상 시험의 기대값·소스는 수정하지 않는다.
- 추가 확인: 종목 GET은 RSI 날짜 불일치만으로 응답 캐시 전체를 거부했다. 마감 직전 캐시가 마감 뒤 조회되면 정상 시세·일봉·체인까지 다시 취득하는 경로여서 공급사 호출 제한과 충돌했다.
- 기존 캐시 유효성 검사는 유지하고, 완료 세션과 다른 날짜 또는 날짜 없는 RSI만 반환 복사본에서 `null`로 만든다. 캐시 적중·기존 가격·RSI 계산 날짜·캐시 객체는 유지한다. 새 조회·재계산·캐시 쓰기는 추가하지 않는다.
- 이번 변경은 종목 GET 내부 경로뿐이며 공유 함수 서명·구현은 바꾸지 않았다. 앞선 두 차수의 공유 함수 호출자는 아래 기록과 같고 전체 묶음에서 관련 회귀를 확인한다.
- 브랜치 시작 기준 `d6c648194`부터 생산 코드 변경은 API·RSI 계산·캐시·Intrinio 어댑터 6개 파일뿐이다. 화면 파일·문구·라벨·표시 코드는 변경되지 않아 복원할 화면 변경은 없다.

### 회귀시험과 검증

- `tickerVwapColdCache.test.js`에 실제 GET 캐시 84조합(일반/조기 마감 직전·직후, 주말·휴장·무표식 × 숫자/0/null × lite/full × 체인 요약/full)을 추가했다. 적중 유지, 오래된 RSI만 null, 실제 0·계산 날짜·가격 보존, 라우트에 넘긴 캐시 원본 불변, 공급사 조회 0회를 단언한다.
- 신규 회귀를 수리 전 `702b8bd22`의 라우트에 대입하면 `MISS !== HIT`로 실패한다. 수리 후 신규 회귀 단독 실행은 통과했다. 합성 자료를 사용한 오프라인 재현이며 운영 트래픽 측정은 아니다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs`: 전체 294개 시험 파일을 한 번 실행, 292개 통과·2개 실패(원시 종료 코드 1). 실패는 `earningsScenario` 16·20번의 과거 기준 커밋 변경 범위 고정 검사와 `readCheck` 15번의 같은 검사뿐이다. 각각 나머지 20/22·17/18 하위 시험은 통과했다. 지정 제외 대상 외 실패는 0개다. 시험을 건너뛰거나 실패를 성공 코드로 바꾸지 않았다.
- `giftShareGate.test.ts`는 이번 환경에서 통과했다. `dailyRsi` 6/6, 종목 GET `tickerVwapColdCache` 42/42, `intelFastFallback` 20/20, `tickerPayload`와 관련 가격·실적·세션·공유 어댑터 회귀도 통과했다. 상세 로그는 `.logs/ux-gate/results.json` 및 같은 디렉터리의 개별 `.log`다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false`: 전체 시험과 같은 잠금으로 순차 실행, 한 번 실행·종료 코드 0·오류 출력 0. 로그 `/tmp/signum-ticker-rsi14-tsc-r3.log`는 0바이트다.
- 변경 JS의 `node --check`, `git diff --check origin/main` 통과.

### 남은 위험

- 공급사 실제 자료·운영 트래픽·화면은 확인하지 않았다. 조정 종가 또는 현재 완료 세션 자료가 없으면 RSI는 null이다.
- 마감 경계의 오래된 응답 캐시는 기존 TTL 만료·정상 갱신 전까지 RSI만 null이다. 그 복구를 위해 추가 공급사 요청을 만들지 않는다.
- 원시 전체 시험의 제외 대상 실패 2개 파일은 그대로 남는다. main에서의 기존 실패라는 점은 이번 사용자 지시를 적용했으며 main 시험은 별도 재실행하지 않았다.
- 커밋·push·main 병합·배포·운영 쓰기·브라우저 접근·환경 파일 읽기는 하지 않았다.

### 이번에 바꾼 파일

- `src/app/api/live/ticker/route.ts`
- `tests/tickerVwapColdCache.test.js`
- `tests/tickerRsi14.md`

---

아래는 2차 수리 시점의 기록이다.

## 결과 요약

분할 조정 누락(P1)과 마감 경계 캐시의 전 세션 RSI 반환(P2)을 수리했다. 화면 파일·문구·라벨·레이아웃은 변경하지 않았다. 아래 수치는 합성 자료를 사용한 오프라인 확인이며 운영 측정이 아니다.

## 확인한 원인과 수리

### P1 — 분할 가격 차이를 손실로 누적

`adjusted=true` 요청에도 `getDailyAggregates`는 Intrinio `stock_prices.close`를 `c`에 담았다. 공통 RSI 함수가 이를 쓰면서 250봉 안의 분할을 실제 하락으로 누적했다.

- 같은 일봉 응답의 `adj_close`를 별도 `adjustedClose`에 전달한다. 기존 `o/h/l/c/v/vw`는 그대로다.
- `dailyRsi14`는 `adjustedClose`만 사용한다. 조정 종가가 없거나 잘못된 경우 원본 종가·0으로 대체하지 않고 null을 반환한다.
- 완료 정규장 세션까지 최신 250봉, 첫 14개 변동 평균 seed, Wilder 재귀 평활을 유지한다. 부족·중복·최신 세션 미도착도 null, 실제 0/100/보합 50은 보존한다.
- 종목 응답 캐시 v8 / last-good v7으로 수리 전 원본 종가 RSI 캐시와 분리한다. `readIntelTickerCache`도 v8을 읽는다.

### P2 — 마감 직전 캐시의 RSI가 마감 후에도 유효

분석 캐시에 RSI의 완료 세션과 계산 기준이 없었고, batch 적중 경로는 공통 계산을 우회했다. 저장 시각이 15분 이내여도 마감 경계를 넘으면 RSI의 기준 세션은 달라진다.

- `getStockDataLight`에서 완료 세션 `rsi14Date`와 계산 기준 `rsi14Basis`를 만든다. sparkline 복구·Dynamo 보충·새 계산 캐시 작성 모두 이 표식을 보존한다. 점수 재계산은 기존 표식을 유지한다.
- batch의 모든 적중 모드(full/price/price-dp/ssr)가 반환과 Alpha 입력 전에 완료 세션·계산 기준을 검사한다. 다르면 RSI만 null로 전달한다. 원본 캐시 객체와 RSI 날짜를 새 시각으로 덧씌우지 않는다.
- 캐시 적중을 새 공급사 조회로 바꾸지 않는다. 유효한 현재 세션 자료가 캐시에 없으면 null이며, 기존 정상 갱신 경로가 완료 세션 일봉을 받으면 숫자를 반환한다. 다른 작성자가 만든 표식 없는 분석 RSI도 검증할 수 없어 null이다.
- 거래일·휴장·조기 폐장·DST는 기존 `etLastClosedSessionDate`를 재사용한다.

## 공유 함수 호출자와 영향

- `dailyRsi14`의 생산 코드 호출자는 `api/live/ticker.GET`과 `watchlistBatchService.getStockDataLight` 두 곳이다. 둘 다 같은 어댑터의 조정 종가 필드를 사용한다. 종목 표시값·Alpha 입력과 batch 입력을 실제 모듈 회귀시험으로 확인한다.
- `getDailyAggregates`의 직접 호출자는 `intrinioRouter`의 일봉 range/prev 경로와 `earningsActualsService.intrinioCloses`다. 원본 OHLCV는 보존하고 필드만 추가하므로 기존 가격·수익률·sparkline·실적 종가 계산은 같은 `c`를 읽는다. 어댑터 시험에서 원본 `c` 보존을 단언한다. 전체 묶음의 가격·실적 시험도 실행한다.
- `readIntelTickerCache` 호출자는 `api/intel/fast`다. 같은 Redis MGET에서 v8 full/nochain을 읽는다. 점수 0·같은 거래일 검사는 그대로이며 `intelFastFallback` 회귀시험을 유지한다.
- `AnalysisCacheEntry`에는 선택적 메타데이터 두 개만 추가했다. 공유 읽기/쓰기 함수의 동작은 변경하지 않았다. batch 외 작성자는 새 필드가 없어도 타입 호환된다.
- 공급사 호출 수는 새 계산 batch 3회, 종목 일봉 1회, batch 캐시 적중 묶음 snapshot 1회를 유지한다. RSI 검증만으로 새 호출을 만들지 않는다. 실제 공급사 트래픽은 측정하지 않았다.

## 회귀시험

- `dailyRsi.test.js`: 교과서 Wilder 수치, 250봉 warm-up, 결측/0/100/50, 실제 batch 입력의 분할 조정·원본 30일 자료 보존·3회 호출, 실제 Intrinio 어댑터의 10:1 분할·조정 결측·단일 호출, 실제 batch 캐시의 정규/조기 마감 경계·주말·휴장·구원천/무표식·실제 0/null·모든 모드·추가 조회 없음·점수 재작성 시 RSI 날짜 보존.
- `tickerVwapColdCache.test.js`: 실제 GET의 분할 조정·조정 결측·Alpha 입력·lite/full·full/summary 체인, 완료 세션별 계산, 응답 MISS→HIT·last-good의 null/0, v8 응답/v7 last-good 분리.
- `intelFastFallback.test.js`, `extStaleRoute.test.ts`: 새 캐시 키를 반영한다.

## 바꾼 파일

- `src/lib/dailyRsi.ts`
- `src/services/intrinioClient.ts`
- `src/services/watchlistBatchService.ts`
- `src/services/analysisCache.ts`
- `src/app/api/live/ticker/route.ts`
- `src/services/intelFastFallback.ts`
- `tests/dailyRsi.test.js`
- `tests/tickerVwapColdCache.test.js`
- `tests/intelFastFallback.test.js`
- `tests/extStaleRoute.test.ts`
- `tests/tickerRsi14.md`

## 돌린 시험과 결과

- `/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs`: 294개 시험 파일 전부 실행, 292개 통과·2개 실패(종료 코드 1). 전체 명령은 한 번 실행했다.
- `dailyRsi.test.js` 6/6, `tickerVwapColdCache.test.js` 41/41 통과. 관련 `tickerPayload`, `intelFastFallback`, `extStaleRoute`, `integrityStructUnify`와 공유 어댑터 영향의 `earningsActuals`, `priceHardeningComparison`, `priceTimeBasis`, `regularRealtimeOverlay`도 전체 묶음에서 통과했다.
- 이전 시간 초과였던 `adviceGuard`와 `appNoFakeSocialProof`는 이번 전체 실행에서 통과했다.
- 실패: `earningsScenario.test.cjs`의 전체 저장소 변경 범위 고정 단언 2개(278/371행), `readCheck.test.cjs`의 동일 종류 단언 1개(308행). RSI 수치나 세션 단언 실패는 없다. 해당 시험은 수정하지 않았다.
- 상속된 실패 조건 확인: 시작 HEAD에도 각 고정 기준 `927bf01d3` / `72bb6d891` / `8efa93c14` 대비 이미 src 변경 파일 42개 / 32개 / 48개가 있다(`git diff <기준> HEAD --name-only`, 뒤 두 항목은 시험과 같은 `--diff-filter=MDR`). 해당 단언은 각각 2개 파일 / sitemap 한 파일 / darkPool 한 파일만 바뀌기를 요구하므로 시작 상태에도 성립하지 않는다. 시작 HEAD에서 전체 시험을 별도로 재실행한 것은 아니다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false`: 한 번 실행, 종료 코드 0·오류 출력 0.
- `git diff`로 저장된 변경을 확인했고, 변경 파일 한정 `git diff --check` 통과. 전체 결과는 `.logs/ux-gate/results.json`, 개별 로그는 같은 디렉터리의 `<시험 파일>.log`에 있다.

## 남은 위험

- 전체 오프라인 묶음은 위 범위 고정 검사 2개 파일 때문에 전부 통과한 상태가 아니다.
- 운영·외부 자료 대조는 미실행이다. 공급사의 실제 `adj_close` 제공 여부와 조정 정책은 운영 세션에서 확인해야 한다. 필드가 없으면 null이다.
- 마감 후 현재 세션이 아직 없는 분석 캐시는 추가 조회 없이 null을 운반한다. 공급사 일봉 도착·기존 갱신 전까지 숫자가 없을 수 있다.
- 커밋·push·main 병합·배포·운영 쓰기·브라우저 접근·환경 파일 읽기는 하지 않았다.
