# deviation 기준군 수리 — 2026-10-23

## 확인한 원인과 변경

기존 두 API는 과거 행의 완결성과 premiumBasis를 검사하지 않고 오늘 OI의 0.5~2배인 행을 비교했다. 부분 오늘의 OI가 작아지면 부분 과거 행으로 기준군이 바뀔 수 있었다. 같은 날짜·OI에서 최신 시각만 우선하는 d78 규칙은 작은 늦은 프리미엄으로 큰 측정을 덮었다. 지표·OI가 없는 원천 행도 레거시 이력 전환 시작점을 앞당겼다.

- 평소: 검증된 chainDate, optionBasis=eod, partial 아님, 거래일이며 수집 당시 이미 마감한 세션만 허용한다. 날짜 없는 레거시는 대표 조회에는 보존하되 평소로 추정하지 않는다. 다음 날 PRE에 재수집한 전날 EOD는 허용한다.
- 대표: 완결성 → 총 OI → 프리미엄 측정 보유 순으로 선택한다. 같은 premiumBasis·OI에서는 큰 프리미엄을 보존하고, 금액도 같으면 최신 행을 고른다. 서로 다른 기준의 금액은 크기로 비교하지 않는다. volume-close를 OI 대체보다 우선한다.
- 프리미엄 평소: 오늘과 동일한 명시적 premiumBasis만 허용한다. 기준 미상끼리도 같은 계산법으로 추정하지 않는다. OI·PCR 축에는 프리미엄 기준 제한을 걸지 않는다.
- 오늘: 최신 세션을 과거 측정으로 대체하지 않는다. 부분 자료는 항목·블록·응답의 partial로 전달한다. 별도 API의 조각 저장·병합에도 전달한다. 후보가 없어도 부분 자료 표식을 남긴다.
- 전환 시작점: 해당 집계가 사용할 측정·유효한 원천 날짜·수집 시각이 있으면 정한다. 부분 원천도 포함하며, 평소 기준군 적격성은 별도로 검사한다(2차 관문 후속 수리).
- 생산자: FlowWarm exact/probe의 다음 페이지 잔여, GEX 수집의 20페이지 상한을 partial로 기록한다. GEX 프리미엄은 실제 산식에 맞춰 volume-trade-or-close로 기록해 FlowWarm volume-close와 섞지 않는다. 호출 수·페이지 상한·계산식은 유지한다.
- 캐시: 현재 공용 v14, 별도 응답 v13, 별도 조각 v12(2차 관문 후속). 운영 캐시 변경은 실행하지 않았다.

## 공유 함수의 모든 운영 코드 호출자와 영향

| 함수 | 호출자·영향 | 검증 |
|---|---|---|
| dailySnapshots | /api/ranking의 Flow·GEX 이력과 /api/ranking/deviation. deviation·multi-axis 대표, 구조 랭킹 fallback, optionSession에 영향 | 실제 GET 메모리 대역, 구조·날짜·대표·부분 행 시험 |
| deviationOf / deviationSeries | 공용 API의 deviation·multi-axis / 별도 API의 옵션 축. 완결성·동일 기준 필터 공통화 | 양쪽 GET, 프리미엄 결측·실측 0, 같은 기준 양방향 비교 |
| sourceHistoryStart | dailySnapshots, latestWith, dailyValues, sessionValues에서 호출. 각 집계에 사용할 수 없는 원천 행의 이력 제거 방지 | OI 없는 원천 행 추가 전후 17개 대표 보존, 요청 필드 없는 행·IV 시계열 |
| latestWith | /api/ranking money-vs-oi. 한 행의 프리미엄·OI 유지, 부분 표식 전달 | 실제 GET·같은 행 지표 보존 |
| dailyValues | readinessOf → /api/ranking volatility-bet 준비도 | GEX 준비도·원천 날짜·이력 개수 |
| sessionValues | /api/ranking volatility-bet IV 세션 백분위 | IV 세션 날짜·마지막 값·세션 개수 |
| getAllOptions | harvestGex, computeIvSurface. 배열에 partial 메타만 추가 | 실제 두 함수 메모리 대역, 금액·OI·IV 수치와 페이지 호출 수 |
| rankingCacheKey | /api/ranking, aiqContextService, scripts/ai-quality-55/harness | 소비자가 공용 기본 키를 계속 읽는 시험 |

표의 호출자는 src, scripts, harvest_lambda에서 검색했다. isCompleteOptionEod는 엔진 내부와 두 API에서 사용하며 신규 완결성 판정을 담당한다. 화면 파일·라벨·표시 방식 변경은 없다.

## 합성 재현과 시험

| 조사 조건 | 수리 후 확인 |
|---|---|
| 새 날짜 부분 행의 OI 감소 | 취약한 계산은 43,302,986 → 111,623. 수리 후 작은 부분 기준군은 제외되고 완결 OI 비교군 부족 사유를 반환 |
| d78 전·후 대표 규칙 | 동률이 없는 같은 합성 입력에서 두 취약 대표 규칙 모두 동일 급락. 수리 후 공통 기준군 필터로 차단 |
| 같은 세션·OI의 작은 늦은 프리미엄 | 입력 순서를 뒤집어도 큰 완결 측정 유지. 더 큰 OI의 부분 행도 완결 행을 덮지 않음 |
| OI 없는 원천 행 추가 | 레거시 대표 17개 유지. IV·latestWith에서도 요청 필드 없는 행이 이력을 밀어내지 않음 |

추가로 일반·조기 폐장 경계, PRE·장중·휴장·날짜 불명 제외, 서로 다른 premiumBasis 분리, 부분 응답의 조각 병합, 공급사 페이지 잘림·probe 대체를 검사했다. 모든 I/O는 메모리 대역 또는 오프라인 차단이다. 숫자는 운영 AVGO 자료가 아닌 합성 자료다.

실행 명령:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node --require ./scripts/offline-test-preload.cjs --test tests/rankingSessionDate.test.cjs tests/rankingEtDay.test.cjs
/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false
```

개별 합성·날짜 시험 44/44 통과. 전체 오프라인 296개 파일 모두 통과(기존 실패로 언급된 integrityAudit2Fund·readCheck·structureWarm도 통과). 랭킹 파일은 Badge 168, SessionDate 38, EtDay 6, LivePrice 32, Format 10건 통과다. 전체 결과는 커밋하지 않는 .logs/ux-gate/results.json에 있다. 타입 검사는 종료 코드 0·오류 0건이다. 무거운 명령은 각각 한 번만 실행했고 공용 잠금으로 직렬화했다.

작업공간 준비로 기존 설치 node_modules를 연결하고 무시 대상 next-env.d.ts에 표준 Next 타입 참조만 생성했다. 환경 파일은 읽지 않았다. 전체 build·브라우저·운영 API·운영 쓰기·커밋·push·병합·배포는 실행하지 않았다.

## 남은 위험

운영 AVGO의 실제 원인·영향 종목 수는 미측정이다. 날짜·계산 기준이 불명인 과거 행은 기준군에서 제외되므로 충분한 적격 이력이 없는 축은 후보가 줄 수 있다. 과거 EOD 행에 부분 메타가 없으면 날짜·수집 시각 외의 체인 누락을 소급 판별할 수 없다. 새 생산자 메타는 이 작업만으로 운영에 적용되지 않는다. 부분 오늘은 OI가 맞는 완결 과거가 충분할 때만 비교되며, 결과의 partial은 자료 상태를 알리는 표식이다.

## P1 후속 수리 — 공급사 만기별 실패

관문 `gate-fix_deviation-baseline-partial-10231916.md`가 지적한 경로는 Lambda 어댑터의 만기별 요청 실패를 `null`로 바꾸는 처리와 수집기의 `next_url` 전용 완결성 판정이 결합한 것이다. 성공한 만기의 계약만 반환되면 누락된 체인이 `partial:false`로 저장됐다.

- `harvest_lambda/intrinio-adapter.js:getOptionChain` 응답에 `requestedExpirations`, `failedExpirations`, `partial`을 추가한다. 요청 만기는 기존 제한으로 선택한 만기 수이며, 실패 또는 chain 배열 없는 응답이 하나라도 있으면 부분 자료다. 정상 빈 chain과 조회 실패를 구분한다. 만기 목록 조회 실패도 빈 성공으로 취급하지 않는다.
- `getAllOptions`는 모든 페이지의 공급사 `partial`과 기존 페이지 상한 판정을 합친다. 배열 형태와 계약 수치는 유지하며, GEX·Flow 두 이력의 기존 `partial` 저장 경로로 전달한다.
- `warmFlowCache`는 실제 선택한 exact 또는 대체 probe 응답의 `partial`도 전달한다. 채택하지 않은 probe의 실패가 정상 exact를 부분 자료로 바꾸지는 않는다.
- 기존 저장 행의 표시 없음·`partial:false` 판정과 랭킹 엔진은 변경하지 않는다. 운영 자료 소급 수정도 없다. 실패 표식이 없는 과거 누락 행은 계속 소급 판별할 수 없다.
- 만기 선택 수·요청 경로·재시도·페이지 상한은 바꾸지 않는다. 공급사 호출을 추가하는 코드는 없다.

공유 함수 호출자 확인:

| 변경 함수 | 모든 운영 호출자와 영향 | 검증 범위 |
|---|---|---|
| getOptionChain | 같은 파일의 routeMassiveUrl, index.js의 refreshIv30Pending.fetchChain. 라우터는 계약 유형 필터 뒤에도 새 메타를 보존한다. IV30은 기존 results 배열만 읽는다. | 실제 라우터의 전체·단일 만기·실패·계약 유형 필터, 기존 IV30·greeks 회귀 |
| getAllOptions | harvestGex, computeIvSurface. 전자는 GEX·Flow 이력에 부분 표식을 저장하고 후자는 기존 배열을 그대로 계산한다. | 실제 수집·메모리 저장·IV Surface 계산·여러 페이지 표식 보존 |
| warmFlowCache | handler. 선택한 exact/probe의 부분 표식을 Flow 이력에 저장한다. | exact·대체 probe 각각 부분/완결 조합, 기존 프리미엄과 호출 수 |

호출자는 `harvest_lambda`, `scripts`, `src`, `tests`에서 검색했다. 다른 Lambda 사본의 어댑터·웹 공급사 경로·화면 파일은 수정하지 않았다.

추가 시험은 `tests/rankingSessionDate.test.cjs`에 있다. 8개 과거 세션 각각 만기 2개 중 1개를 실패시키고, 실제 어댑터→라우터→getAllOptions→harvestGex→메모리 저장→두 랭킹 API를 실행한다. 정상 합성 자료의 중앙값은 2,000만이며 오늘은 2,300만이다. 같은 누락 자료에서 부분 표식을 제거하면 기준선 1,000만·2.3배가 재현되고, 새 표식이 있는 과거 8세션은 기준군에서 제외돼 가짜 후보를 내보내지 않아야 한다. 정상·실패 수집 모두 세션당 목록 1 + 시세 1 + 만기 2 = 4콜로 검증한다. 단일 만기 실패·전체 실패·정상 빈 chain·만기 목록 실패도 포함한다.

후속 변경 후 실제 검증 결과:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node --require ./scripts/offline-test-preload.cjs --test tests/rankingSessionDate.test.cjs tests/rankingEtDay.test.cjs tests/greeksNull.test.cjs tests/iv30.harvest.test.js
/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false
```

- 개별 재현·회귀 69건 통과(실패 0). 정상 8세션 중앙값 2,000만, 표식 없는 누락 8세션 기준선 1,000만·2.3배를 확인했다. 새 부분 표식이 있는 누락 과거 8세션은 기준군에서 모두 제외되며 두 랭킹 API에서도 가짜 후보가 없다. 정상·실패 수집 각각 세션당 4콜, 증가 0이다. 운영 자료가 아닌 합성·메모리 대역 결과다.
- 전체 오프라인 296파일 통과·실패 0, 종료 코드 0. 기존 실패로 언급된 integrityAudit2Fund·readCheck·structureWarm도 통과했다. 이번 실행에서 제외한 파일은 없다.
- tsc 종료 코드 0·오류 출력 0건. 변경한 JavaScript 두 파일과 시험 파일의 `node --check`, `git diff --check`도 통과했다.
- 각 무거운 명령은 한 번씩 전역 잠금으로 실행했다. 다른 작업의 잠금이 풀릴 때까지 기다렸으며 잠금을 우회하지 않았다. 로그는 `/tmp/signum-deviation-partial-targeted.log`, `/tmp/signum-deviation-partial-offline.log`, `/tmp/signum-deviation-partial-tsc.log`에 있다.

화면 변경·환경 파일 읽기·브라우저·운영 접근·운영 쓰기·커밋·push·병합·Lambda 배포는 실행하지 않았다. 운영 영향 범위는 미측정이며, 표시 없이 이미 저장된 누락 행의 위험은 그대로 남는다.


## 2차 관문 후속 수리 — 구조 partial 전달과 레거시 재선택

관문 `gate-fix_deviation-baseline-partial-10232150.md`의 P1·P2를 대상으로 한다. 아래 수치는 운영 자료가 아닌 합성 입력과 메모리 저장 결과다.

이번 변경 파일(6개): `src/lib/rankings/engine.ts`, `src/app/api/cron/structure-build/route.ts`, `src/lib/rankings/cacheKey.ts`, `src/app/api/ranking/deviation/route.ts`, `tests/rankingSessionDate.test.cjs`, 이 문서.

### 확인한 원인과 변경

- P1: `structureService.getStructureData`는 체인 잘림·OI 결측을 `partial:true`로 반환하지만, `structure-build`가 `StructRow`를 만들 때와 Flow 이력을 쓸 때 이 표식을 누락했다. 유효한 `historyChainDate`만으로 체인 완결성을 증명할 수 없는데 엔진에는 완결 EOD로 들어왔다. 이제 `d.partial → StructRow.partial → FLOW_HISTORY.partial`을 보존한다. `isCompleteOptionEod`와 두 API의 기존 공통 기준군 필터가 부분 과거를 제외하고, 부분 오늘은 기존 응답 `partial`로 운반한다. 기존 행에 표식이 없으면 기존 규칙을 유지한다.
- P2: `sourceHistoryStart`가 `isCompleteOptionEod`를 요구해서 사용할 수 있는 원천 행이 부분 자료뿐일 때 시작점이 사라졌다. 원천 존재는 완결성 판정과 분리하고, 유효한 원천 날짜·수집 시각·호출자가 요청한 측정으로 판정한다. 부분 원천도 레거시 전환을 시작하지만 평소 기준군에는 여전히 들어가지 않는다. 요청 필드나 OI가 없는 원천 행이 레거시 이력을 지우지 않도록 기존 `usable` 조건은 보존한다.
- 결과 캐시는 공용 `v14`, 별도 응답 `v13`, 별도 조각 `v12`로 올려 이전 선택 결과를 재사용하지 않는다. 구조 캐시 키·화면·라벨·공급사 호출·재시도·계산식은 바꾸지 않았다. 운영 캐시는 건드리지 않았다.

### 공유 함수 호출자·영향과 시험

| 변경 함수 | 모든 운영 호출자·영향 | 시험 |
|---|---|---|
| sourceHistoryStart | dailySnapshots → 두 랭킹 API(대표·deviation·multi-axis·optionSession·구조 fallback), latestWith → 공용 API money-vs-oi, dailyValues → readinessOf → volatility-bet 준비도, sessionValues → volatility-bet IV 백분위 | 부분 원천+PRE 레거시를 두 입력 순서로 넣어 네 집계의 날짜·측정을 검사. IV 준비도가 가짜 세션으로 채워지지 않고 money-vs-oi 6.67배 후보가 사라지는지 실제 GET 검사 |
| structure-build GET | 같은 라우트의 팬아웃, 외부 크론 HTTP 진입. 생산한 StructRow는 같은 파일에서 Redis·Flow 이력으로 저장 | 실제 구조 계산→저장본 읽기→구조 GET→메모리 Flow 저장→엔진→양 API. 기존 구조 소비자는 추가 필드를 무시하며 키와 수치를 유지 |
| rankingCacheKey | /api/ranking, aiqContextService, scripts/ai-quality-55/harness | 공용 키를 계속 사용하는 기존 회귀시험. 별도 API는 새 조각 키로 저장·병합 검사 |

호출자는 `src`, `scripts`, `harvest_lambda`, `tests`에서 검색했다. `sourceHistoryStart`의 직접 호출자는 위 네 함수 전부다. 완결 EOD 판정 함수·기준군 필터·화면 소비자는 변경하지 않았다.

### 재현 내용

- 수정 전 새 P1·P2 시험을 이름으로 선택 실행해 실패 2건을 확인했다. 구조 저장 행의 `partial`이 `undefined`였고, 부분 원천 10/21 옆에 PRE 레거시 10/22가 추가됐다. 로그: `/tmp/signum-deviation-r3-before.log`.
- 구조 경로: 과거 8세션의 실제 구조 생산자에 잘린 체인을 주입한다. 정상 PCR 중앙값은 2, 부분 체인에서 표식을 제거한 대조군은 중앙값 1·오늘 2.3배다. 표식을 보존한 부분 과거는 모두 기준군에서 제외돼 두 API가 가짜 후보를 반환하지 않는다. 완결 오늘은 `partial:false`, 실제 생산자가 만든 부분 오늘은 항목·응답·별도 조각·8조각 병합에서 `partial:true`다. 프로브 사용 시 정상·부분 모두 공급사 호출 0이다.
- Lambda 경로: 실제 어댑터에서 만기 2개 중 1개 실패한 과거 8세션을 수집·저장한다. 정상 중앙값 2,000만, 표식 없는 대조군 1,000만·2.3배를 재현한다. 부분 과거는 양 API에서 제외되며, 별도 시나리오의 실제 Lambda 부분 오늘도 양 API에서 `partial:true`다. 정상·부분 과거·부분 오늘 모두 세션당 4콜로 증가 0이다.
- 레거시 경로: 10/22 PRE 레거시(금액 비율 6.67)와 10/21 부분 원천(금액 비율 1)을 함께 넣어 10/21만 선택한다. 이는 확인한 `origin/main`의 선택 결과와 같다. 부분 원천은 `isCompleteOptionEod=false`로 유지된다. 유효하지 않은 날짜·수집 시각 및 요청 측정 없는 원천은 전환을 시작하지 않는다.

### 검증 명령

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node --require ./scripts/offline-test-preload.cjs --test --test-name-pattern='^P[12]' tests/rankingSessionDate.test.cjs
/usr/bin/lockf -k /tmp/signum-heavy.lock node --require ./scripts/offline-test-preload.cjs --test tests/rankingSessionDate.test.cjs tests/rankingEtDay.test.cjs
/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs <제외 3개를 뺀 시험 파일 293개>
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false
```

오프라인 실행은 Node 래퍼가 시험 목록을 열거해 기존 실행기에 인자로 전달했다. 제외 목록은 요청한 `earningsScenario.test.cjs`, `giftShareGate.test.ts`, `readCheck.test.cjs`이며, 정확한 파일 목록은 `/tmp/signum-deviation-r3-offline-manifest.json`에 있다. 각 무거운 명령은 공용 잠금으로 직렬 실행했다. 수정 후 날짜·재현 시험은 50/50 통과(실패·건너뜀 0)했다. 전체 오프라인은 이번에 실행한 293/293파일 통과·실패 0, 종료 코드 0이다. 제외 3개는 이번에 실행하지 않았다. 실행기의 과거 결과 병합 수치(296)는 이번 검증 수로 세지 않았다. tsc는 종료 코드 0·오류 출력 0바이트다. `node --check tests/rankingSessionDate.test.cjs`와 `git diff --check`도 통과했다. 로그는 `/tmp/signum-deviation-r3-targeted.log`, `/tmp/signum-deviation-r3-offline.log`, `/tmp/signum-deviation-r3-tsc.log`에 있다.

### 남은 위험

부분 표식 없이 이미 저장된 과거 누락 행은 소급 판별하지 못한다. 운영 발생 범위·영향 종목 수는 측정하지 않았다. 이 변경은 작업 브랜치의 미커밋 수정이며 운영에 적용하지 않았다. 환경 파일 읽기·브라우저·운영 접근·운영 쓰기·커밋·push·병합·배포는 실행하지 않았다.
