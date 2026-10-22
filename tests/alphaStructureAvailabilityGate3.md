# 옵션 입력 가용성 3차 수리 — 2026-10-22

## 결과 요약

- 원인 확인: `terminalEnricher`의 수집 실패/미수집 응답이 `PENDING/FAILED`, `complete:false`와 함께 PCR/GEX 기본값 0을 반환했다. `powerEngine`이 상태를 제거하고 숫자만 전달해, 엔진이 기본값을 실측으로 인정했다.
- 오프라인 재현: 2차 커밋 `ad608fb97`의 실제 `buildOptionsEvidence(null)`은 PCR/GEX 0을 반환하고 기존 엔진 구조 진단은 5점이었다. 수정한 리포트 입력 경로는 같은 실패 응답을 null로 운반해 결측 기준 8점을 반환한다. 총점은 양쪽 모두 41점이었다.
- 공통 경계 `optionObservation`에서 원천 실패 상태·오류를 먼저 검사하고, 필드의 null/undefined·유한 숫자를 구분한다. 정상 응답의 실측 0은 보존한다. 동일 원천의 호환 필드 대체는 undefined일 때만 허용하고 명시적 null은 보존한다.
- `PENDING` 부분 응답의 실제 계산값은 생산자의 `optionObservations`로 판별한다. 구조 생산자가 남은 OI로 계산한 PCR은 0도 보존하며, 계산하지 않은 GEX/스퀴즈를 만들지 않는다. 전체 complete/체인 유무로 독립 원천의 정상 지표를 막지 않는다.
- 상태가 없는 정규화 지표·저장 행은 기존 nullable 필드 계약을 유지한다. 원시 응답의 실패 상태는 정규화 전에 검사한다. 기존 실패 상태가 붙은 0 캐시도 차단한다.
- 화면 라벨·문구·컴포넌트 표시 방식과 점수 공식은 변경하지 않았다. `alphaEngine`은 주석만 수정했다. 커밋·push·병합·배포·운영 쓰기는 실행하지 않았다.

### 호출자 전수 확인과 영향

`rg` 검색과 회귀시험의 AST 전수 검사로 `src`의 `calculateAlphaScore` 직접 호출 10곳, quick/batch 래퍼 2곳을 확인했다.

| 경로 | 확인·수정한 입력 경계 |
| --- | --- |
| 종목 상세 | 정본 PCR/GEX/스퀴즈, 구조·체인 레벨 선택, rawChain/IV |
| 관심종목 | 분석 캐시, DynamoDB 대체 생산자, 신규 조회, 오류 대체 총 4곳 |
| 포트폴리오 | 분석 캐시, 신규 조회, 오류 대체 총 3곳. 정본 지표를 내부 함수에 전달하며 기존 조회 1회를 앞당김 |
| 대시보드 | 구조 응답 입력, 분석 캐시의 값 truthiness 기반 성공 추정 제거 |
| 리포트 | 실제 terminal 생산자 3개 함수와 powerEngine의 원천별 입력 정규화 |

공통 `optionNumber/optionChain/optionSourceSucceeded` 직접 사용자는 위 5개 경로와 `optionMetrics`, `terminalEnricher`다. `pickAlphaLevels` 호출자는 상세 GET 1곳, `processPortfolioBatchCore` 호출자는 공개 배치 래퍼 1곳이다. terminal의 `fetchOptionsChain/buildOptionsEvidence/createIncompleteItem`은 같은 파일의 수집·증거 생성 경로에서 사용한다.

변경한 공통 `optionMetrics`는 `optionMetricsService`와 두 apply 함수의 기본값 경로에서 사용한다. 간접 소비자는 관심종목·포트폴리오, ticker 초기 데이터, app/options-latest, command/unified, undercurrent/shared, intel/fast·fast-all, live/ticker·short-squeeze다. 각 소비자는 원천 실패에서 null을 받으며 정상 관측값과 범위 정의는 유지한다. 실패한 OI 행은 수량 관측 표식도 갖지 않아 상세의 정상 대체 원천을 막지 않는다.

## 바꾼 파일

- 공통 경계·타입: `src/lib/optionObservation.ts`(신규), `src/lib/optionMetrics.ts`, `src/lib/storage/evidenceCache.ts`, `src/types.ts`.
- 생산자·호출자: `src/services/terminalEnricher.ts`, `structureService.ts`, `powerEngine.ts`, `watchlistBatchService.ts`, `portfolioBatchService.ts`, `src/app/api/live/ticker/route.ts`, `src/app/api/dashboard/unified/route.ts`.
- 엔진: `src/services/alphaEngine.ts` 주석만 변경.
- 시험: `tests/alphaStructureAvailability.test.cjs`, `tickerPayload.test.js`, `tickerVwapColdCache.test.js`, `integrityStructUnify.test.js`, `commandIv.test.cjs`. 기존 하네스는 새 순수 모듈을 실제 실행하도록 갱신했다.
- 이 보고서: `tests/alphaStructureAvailabilityGate3.md`.

## 돌린 시험과 결과

모든 시험·전체 tsc는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 순차 실행했다. 외부 I/O는 모형으로 대체했으며 환경 파일·브라우저·운영 저장소를 열지 않았다.

| 시험 | 최종 결과 |
| --- | --- |
| `node --test tests/alphaStructureAvailability.test.cjs` | 81/81 |
| `node tests/tickerPayload.test.js` | 40/40 |
| `node --test tests/tickerVwapColdCache.test.js` | 33/33 |
| `tests/optionMetricsCache.test.ts` | 15/15 |
| `node tests/integrityStructUnify.test.js` | 85/85 |
| `node --test tests/commandIv.test.cjs` | 28/28 |
| `node --test tests/b5MetricDefinitions.test.cjs` | 58/58 |
| 전체 `node_modules/.bin/tsc --noEmit --incremental false` | 종료 0, 오류 0 |
| `git diff --check` | 통과 |

합계 340개 통과. 신규 가용성 시험은 주입한 최종 숫자만 검사하지 않고 실제 생산자·호출 전 선언식·Alpha 입력 표현식·엔진을 실행한다. 5개 경로의 실패 상태 0, 정상 실측 0, 실패 응답의 남은 체인/양수 레벨, 독립 원천, null/undefined 대체, 부분 응답에서 실제 계산한 PCR 0, 2차 리포트 결함을 포함한다. 정상 전체 입력의 구조 점수 21점·기존 가중치도 유지됐다.

초기 검사에서는 포트폴리오 내부 함수에 정본 지표 전달이 누락되어 타입 오류 3개가 발생했고 수정 후 전체 검사 오류 0을 확인했다. 정합성 시험의 옛 소스 정규식도 새 입력 경계에 맞췄다. 로컬 `ts-node` 실행 파일이 없어 캐시 시험은 `/tmp/signum-ts-run.cjs`의 설치된 TypeScript 전사 훅·기존 tsconfig 경로 매핑으로 실제 시험을 실행했다. 의존성 설치는 하지 않았다.

## 남은 위험

운영 발생 빈도·실제 저장값과 배포 후 동작은 미확인이다. 운영 접근·캐시 변경·배포는 수행하지 않았다. 브라우저/실기 화면 검증도 수행하지 않았다.
