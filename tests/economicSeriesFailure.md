**결과 요약**

사용자 제공 운영 실측(2026-10-22 06:5x KST): Intrinio DGS10·BAMLH0A0HYM2는 HTTP 500, T5YIE는 HTTP 200과 빈 historical_data, FRED 공개 웹은 점검 중이다. 상류 장애는 이번 로컬 작업에서 재측정하지 않았다. 조사 문서 macro-source-dead.md는 끝까지 읽었다.

로컬 코드에서 확인한 결함은 경제계열 historical_data가 빈 응답 판정에서 빠져 60초 성공 캐시에 저장된다는 점이다. 경제계열 경로에 한해 빈 배열·관측 배열 누락을 실패로 처리한다. 최종 실패는 HTTP 상태와 사유를 담아 10초 음성 캐시에 저장하고, 정상 관측의 기존 60초 캐시는 유지한다. 이전 코드가 저장한 빈 성공 캐시도 무시한다. 재시도 횟수는 늘리지 않는다.

Intrinio·FRED 모두 계열별 코드·행 수·최신 관측일·성공/빈 응답/HTTP 오류/네트워크 실패/키 부재를 기록한다. 응답을 받지 못했거나 배열이 없으면 행 수와 최신일은 null이다. 인증 URL·키·본문·예외 원문은 로그에 넣지 않는다. Intrinio 음성 캐시 조회는 원천 호출과 구분한다. getEconomicSeries의 배열 반환과 getCreditSpread의 nullable 반환 계약은 유지하되 사유를 로그에 남긴다.

화면·라벨·계산식·FRED 폴백·보관본 유효기간과 점수 입력 규칙은 변경하지 않았다. 470221458은 현재 브랜치의 조상이며 macroSnapshotCarry.test.ts는 수정하지 않았다.

**바꾼 파일**

- src/services/intrinioClient.ts: 경제계열 빈 응답 판정·실패 캐시·계측.
- src/lib/macroFredFallback.ts: 계열별 계측과 예외 원문 기록 제거.
- tests/economicSeriesFailure.test.cjs: 실제 함수 추출을 통한 오프라인 회귀시험.
- tests/integrityAudit2FundGate.test.ts: 기존 매크로 시험의 모의 의존성에 보관본·FRED 모듈 2개 추가. 누락 상태에서는 모듈 적재가 차단돼 7개가 실행 중단됐으며, 설정 보완 후 39개 통과했다.
- tests/economicSeriesFailure.md: 원인·영향·시험 기록.

공유 함수 호출자 확인:

- _looksEmpty는 callIntrinio 내부에서만 호출한다. economic 경로 조건을 먼저 적용하고 다른 경로의 기존 판정은 유지한다.
- callIntrinio는 intrinioClient.ts 내부 27개 함수에서 36회 직접 호출한다. 경제계열은 getEconomicSeries·getCreditSpread 두 함수다.
- 나머지 직접 호출자: intrinioOptionsDiagGet, getTickerSnapshot, getDailyAggregates, getIntradayAggregates, getRealtimeGreeksIntrinio, fetchChainPagesIntrinio, getOptionExpirationsEodIntrinio, probeVendorEodDate, getOptionChainSnapshotIntrinio, getTechnicalIndicator, getTickerDetails, fetchBulkEodDirect, loadRealtimeSnapshot, getDividendsIntrinio, getSplitsIntrinio, getOptionContractsIntrinio, getInstitutionalOwnershipIntrinio, getInsiderFilingsIntrinio, getOpenCloseIntrinio, getLastExtendedTradeIntrinio, dataPoint, freeCashFlowTTM, netIncomeTTM, getIncomeStatementsIntrinio, getFilings8KIntrinio. 경제계열 전용 조건 밖이므로 음성 캐시·경제계열 로그·최종 빈 응답 실패 처리가 적용되지 않는다. 각각을 운영 호출하지 않았으며, 비경제계열 빈 옵션 결과와 실제 실시간 옵션 게이트웨이의 기존 IV 회귀시험으로 공통 경로를 검증했다.
- getEconomicSeries 직접 호출자: macroHubProvider.realYieldFromSameDatePair 2곳, macroEconomy.getMacroEconomy 7곳, intrinioClient.getTreasuryYieldsFred 1곳(7만기 반복), getInflationIntrinio 2곳(CPI·PCE), getInflationExpectationsIntrinio 1곳. 반환 형식을 유지해 결측 필터·실측 0 보존·계열별 계산을 유지한다.
- getCreditSpread 직접 호출자: macroHubProvider.fetchMacroSnapshotFresh 1곳. 실패 시 null 계약을 유지해 기존 FRED 폴백과 보관본 잇기로 진행한다.
- 국채·물가·기대인플레이션 어댑터는 intrinioRouter의 /fed/v1/* 분기를 거친다. 이 라우터와 fedApiClient의 소비 형식은 변경하지 않았다.
- fredObservations 직접 호출자: fredCreditSpread의 BAMLH0A0HYM2 1곳, fredRealPair의 DGS10·T5YIE 2곳. 모두 기존 배열·메모이제이션 계약을 유지한다. 두 폴백의 소비자는 macroHubProvider.fetchMacroSnapshotFresh다.

**돌린 시험과 결과**

모든 원천 응답·캐시 쓰기는 메모리 모의다. 외부 통신·운영 쓰기 없이 실행했다. 공유 의존성은 기존 로컬 node_modules를 연결해 사용했다.

- node --test tests/economicSeriesFailure.test.cjs: 16개 통과. 빈 배열·500·429·정상, 10초 실패 캐시 만료 뒤 회복, 정상 60초 캐시, 이전 빈 성공 캐시 거절, 재시도 중 회복, 스키마 누락, 비경제계열 경계, 캐시 장애, 키 부재·네트워크 오류, 오류 원문 비노출, 배경 429 즉시 중단을 확인했다.
- 같은 시험에서 실제 매크로 재계산 함수를 실행해 Intrinio 실패→FRED 폴백→보관본 잇기, FRED 정상 관측 우선, 양쪽 실패·보관본 부재 시 결측 유지, Intrinio 정상 시 FRED 호출 0회를 확인했다. 보관 관측일·점수 입력 제외 규칙을 유지한다.
- tests/macroSnapshotCarry.test.ts: 기존 16개 통과. 470221458의 보관본·원래 관측일·유효기간·병합 계약 유지.
- tests/integrityAudit2FundGate.test.ts: 시험 설정 보완 후 39개 통과. CPI/PCE·기대인플레이션·국채·실물경제의 결측·실측 0·월간 비교·REAL 반환·기존 표시 입력 유지.
- node --test tests/commandIv.test.cjs: 28개 통과. 비경제계열 공통 게이트웨이의 옵션 관측 시각·공유 캐시·계약별 IV 전달 유지.
- 위 TypeScript 시험은 임시 require 확장에서 typescript.transpileModule로 변환해 실행했다. .env 파일이나 실제 서비스 모듈은 적재하지 않았다.
- /usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false: 1회 실행, 종료 코드 0, 출력 0줄. 전체 타입 검사 반복 실행 없음.
- 최종 회귀시험 합계 99개 통과, 실패 0개. git diff --check 통과.

**남은 위험**

상류 장애가 계속되고 유효한 보관본도 없으면 누락은 남는다. 이번 변경은 상류 복구를 보장하지 않는다. 10초 음성 캐시가 남은 동안에는 상류 회복 감지가 최대 10초 늦을 수 있다. 성공 캐시도 기존 60초 유효기간을 유지한다. 정상 호출도 계측하므로 경제계열 로그량이 늘어난다. 모든 비경제계열 개별 기능을 실행한 것은 아니며, 전용 조건 밖이라는 코드 확인과 대표 공통 게이트웨이 회귀시험으로 영향 범위를 검증했다.

운영 인증 GET·브라우저 접근·.env 열람·운영 Redis/DB/API 쓰기·푸시·병합·배포는 수행하지 않았다. 현재 브랜치는 fix/econ-empty-cache다. git add와 git commit에서 공통 Git 디렉터리의 worktrees/fix-econ-empty-cache/index.lock 생성이 Operation not permitted로 거부됐다. 스테이징·커밋 미완료이며 파일 변경은 보존돼 있다. 전체 변경 패치를 /private/tmp/signum-econ-empty-cache.patch에 남겼다.
