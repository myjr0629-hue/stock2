# 정합성 감사 2차 — ID 10~15 수리 검증

확인 범위: 감사 원문 FINDINGS.md의 15개 행 전체를 읽고, 지정된 ID 10~15를 수정했다. 실행 증거는 합성 입력을 사용하는 오프라인 시험이다. 운영 발생 빈도와 공급사 실데이터는 확인하지 않았다. 화면 파일·라벨·번역은 수정하지 않았다.

## ID별 원인 · 수리 · 시험 · 남은 위험

| ID | 확인한 원인 | 수리 | 시험 | 남은 위험 / 대표 결정 |
|---|---|---|---|---|
| 10 | `Number(null)`과 빈 문자열이 0으로 통과. ADX/DI 및 밴드를 각기 다른 행에서 선택 | 변환 전 관측 유무 검사. ADX/DI·BB는 한 행의 완전한 관측만 채택. ATR/OBV·BB 과거 분포에도 결측 검사 적용. 실제 0 보존 | null ADX, 불완전한 최신 행/완전한 이전 행, ADX 0, 결측 ATR/BB 통과 | 공급사 관측 자체의 정확성과 운영 날짜별 누락은 미확인. 이전 완전 관측을 선택할 수 있음 |
| 11 | fallback 및 그 앞 Intrinio 어댑터에서 순이익 결측을 0으로 변환. Lambda 네 계산 경로에도 같은 식 | null·공백·비수치 순이익은 마진 미산정. 실제 순이익 0은 마진 0 및 기존 4점 유지. 원본/배포 템플릿은 공통 소스의 계산을 사용 | API 마진/점수, 어댑터 null/공백/false/0, Lambda 네 경로, 옛/새 DynamoDB 버전 분기, 통합 응답 출구 통과 | 배포·운영 캐시 재생성은 하지 않음. 다른 운영 소비자는 수확본 갱신 전 옛 값을 보유할 수 있음 |
| 12 | 배열 길이가 짧으면 QoQ, 길면 YoY로 지표 정의가 변경 | 회계연도 전년·같은 분기만 비교. 순서·행 개수와 무관. 정확한 비교 분기/회계 식별자 없으면 null. 실제 매출 0은 -100% 보존 | 두 분기만 있는 경우 null, 순서/누락과 무관한 YoY +50%, 잘못된 다섯 번째 분기 배제, 식별자 없음, 0 매출, Lambda 네 경로 통과 | 전년 분기가 5행 응답 안에 없으면 null. 비교 기간 문구 추가는 대표 결정 사항이므로 미수정 |
| 13 | 기대인플레이션 2.3 및 명목금리 4.2 상수 fallback. CPI 날짜와 기대인플레이션 날짜를 구분하지 않음 | 상수 제거. 기대인플레이션 고유 관측일 전달. 헤드라인과 같은 명목금리 및 양쪽 유효 출처·동일 관측일에서만 실질금리와 stance 계산 | 조회 실패·명목금리 결측·날짜 결측/불일치 → null, 같은 날짜의 실질금리 0, CPI와 다른 기대인플레이션 날짜 전달, 기존 10Y 통일 13/13 | 두 원천 게시일이 어긋나면 기존 REAL 칸은 —. 기존 기대인플레이션 원천은 5년 브레이크이븐이며, 기간 지표 자체를 바꾸는 작업은 하지 않음 |
| 14 | 결측 프리미엄이 0으로 통과하고 log(0)이 Infinity 순위를 생성. 최신 행을 걸러내면 어제 값이 오늘로 승격될 가능성 | 최신 행의 관측을 먼저 요구. 결측 과거 행 제외. 실제 0은 보존. 배수 거리는 abs(r−1)/(r+1): 양수에서 기존 로그 거리와 단조 관계·상호 역수 대칭, 실제 0에서 극한 1. 최종 표시/풀에 유한 점수만 허용 | 결측/공백/false/Infinity 최신 행 배제, 실제 0의 유한 순위, 역수 대칭·단조성, API 선택부의 비유한 점수 배제, 기존 실시간 랭킹 31/31 | 양수 한 축의 순서는 보존되지만 다축 합산의 보조 가중치는 새 거리 척도에 따라 달라질 수 있음 |
| 15 | 과거 OI 분산 0이면 오늘 변화와 무관하게 z-score 0·정상 | 분산 0+변화 있음은 zScore/isUnusual null, 변화 없음은 기존 0/false. OI 양쪽 관측이 있어야 합산하며 실제 0은 보존. null이면 기존 FlowRadar 거래량/OI 경로 사용 | 100/100/100→200의 null, 변화 없음 0, 결측 OI 배제, 비상수 분포 z=12.2, 기존 FlowRadar fallback의 실제 실행 통과 | 대체 경로는 당일 거래량/OI로, OI 급증 자체의 대체 판정이 아님. 새 판정·설명 문구는 대표 결정 사항이므로 추가하지 않음 |

## 공유 함수 호출자 전수와 영향

저장소 src·scripts·tests를 함수명과 API 경로로 검색했다. 아래는 실행 코드의 직접 호출자이며, 문서/주석만의 참조는 제외했다.

- `advancedTechnicals.firstNum`: 같은 파일 ATR, OBV. `firstComplete`: ADX, 현재 BB, BB 과거 분포. `getAdvancedTechnicals`: `api/live/technicals/route.ts` 하나. API 소비자는 앱 Command와 `deepWarmService`; `lib/ai/deepSnapshot.ts`는 응답 타입 참조. 결측이 RANGE나 밴드 숫자로 바뀌지 않는다. `realizedVolPct`는 수정하지 않았다.
- `computeIncomeMetrics`: `api/live/fundamentals/route.ts` 1곳, `scripts/lambda-harvest/index.js` 2곳, `scripts/deploy-lambda-v7.js` 템플릿 2곳. 배포 템플릿은 공통 JS 원문을 주입하고, 패키지 원본의 포함 함수는 원문 동일성 시험으로 고정한다. 각 마진·성장률 계산이 동일하다.
- `getIncomeStatementsIntrinio`: `services/intrinioRouter.ts`의 income-statements 분기 하나. 이후 Massive 호환 호출자는 위 재무 API. 어댑터에 남아 있던 null→0 변환도 제거했다.
- 재무 API의 직접 호출자는 앱 Command, `api/command/unified/route.ts` 내부 호출(캐시 보충·배경 보충·DynamoDB 보충·fallback 보충), `api/cron/signum-warm/route.ts`. `overlayFundamentals`는 통합 `jsonResponse` 하나에서 호출되며 그 응답 함수는 메모리·Redis·DynamoDB·스냅샷·직접 생성·부분 실패의 6개 출구가 사용한다. 옛 재무 버전은 같은 재무 API로 재조회하고 실패하면 결측을 유지한다. 새 버전에서는 추가 재조회를 하지 않는다. 기존 `isFieldUsable`은 변경하지 않았다.
- `getInflationData`: `macroHubProvider.fetchRealYieldData`, `fedApiClient.getFedSnapshot`. 후자는 `reportScheduler`가 호출한다. 기존 CPI 날짜는 유지하고 `expectationsDate`만 추가한다.
- `fetchRealYieldData`: `macroHubProvider.fetchMacroSnapshotFresh` 하나. `getMacroSnapshotSSOT`의 실행 호출자는 `watchlistBatchService`(4개 시세/스코어 경로의 매크로 전달), `terminalEnricher`, `marketBackdropLoader`, `guardian/unifiedDataStream`, `guardian/rlsiEngine`, `reportScheduler`(2곳), `api/debug/audit`, `api/dashboard/unified`, `api/live/market`, `api/live/ticker`, `api/market/macro`. 오프라인 실행 스크립트의 호출자는 `scripts/audit_pipeline.ts`, `scripts/probe_macro.ts`; `scripts/refactor_batch.js`는 코드 생성 문자열이다. 이들에서 실질금리 접근은 optional chaining/nullish 처리를 사용하며 명목금리·나머지 매크로 값은 그대로 전달한다. 수정한 `fetchFedYield`는 같은 fresh snapshot의 Promise.all에서 호출되며 원본 관측일 메타데이터만 추가한다.
- `deviationOf`: `api/ranking/route.ts`의 deviation/multi-axis 공용 지표 루프 하나. `ratioDistance`: 같은 루프와 darkpool-volume의 2곳. 다축 순위는 해당 루프 결과를 합산한다. 양수 단일 축 순서는 같고 0 관측 및 비유한 점수 처리만 명시한다. 다축 보조 가중치 척도 변화는 위 위험에 기재했다.
- `computeUoaZScore`: enhanced-metrics GET 하나 → `hooks/useFlowData.useEnhancedMetrics` → `components/FlowRadar`. null z-score에서 기존 fallback이 선택되는 것을 원래 컴포넌트 계산식을 추출해 실행 시험했다. UI 파일은 수정하지 않았다.

캐시 판본: fundamentals v3, advanced technicals v3, macro snapshot v4, ranking v10, enhanced metrics v2. 실제 캐시 삭제/쓰기/사전 갱신은 실행하지 않았다. 새 수확본에는 `_incomeMetricsVersion: 1`을 붙이고, 재무 API 및 Command 공통 출구에서 구버전 계산을 거른다.

## 실행 증거

- 수정 전: 최초 회귀 19개 중 14개 실패, 실제 0 대조 등 5개 통과. 대상 6개 ID 모두 실패를 확인했다.
- 추가 범위: Lambda 네 계산 경로의 결측/기간 시험 실패 후 수정. 통합 응답에서 옛 캐시 계산이 우회하는 시험 실패 후 공통 출구 수정.
- 최종 `tests/integrityAudit2Fund.test.ts`: 30/30 통과. 가짜 응답과 추출한 실제 계산 함수만 실행하며 외부 모듈은 명시적으로 격리한다.
- 기존 `tests/rankingLivePrice.test.ts`: 31/31 통과. 순수 계산/주입 시세만 사용한다.
- 기존 `tests/unifyUs10y.test.ts`: 13/13 통과. /tmp의 격리 실행기로 macroHubProvider의 실제 모듈에서 외부 의존성을 가짜로 바꾸고 순수 yieldChange 함수만 연결했다.
- 전체 타입 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node <공유 node_modules>/typescript/bin/tsc --noEmit --incremental false` 1회, exit 0. 검사용 node_modules 심볼릭 링크는 제거했다.
- `node --check`: incomeMetrics.js, lambda-harvest/index.js, deploy-lambda-v7.js 통과. 스크립트 본문 실행 없음.
- `git diff --check`: 통과.

실행 예:

```sh
NODE_PATH=/Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules \
TS_NODE_TRANSPILE_ONLY=1 \
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
node -r ts-node/register -r tsconfig-paths/register tests/integrityAudit2Fund.test.ts
```

운영 API/DB/Redis 접근·쓰기, 브라우저, .env 파일 읽기, 서버 구동, 빌드, 푸시, 병합, 배포는 실행하지 않았다. 로컬 시험으로 운영 데이터 전체의 완전성을 증명했다고 보고하지 않는다.

## 바꾼 파일

- 서비스: `src/services/advancedTechnicals.ts`, `src/services/intrinioClient.ts`, `src/services/fedApiClient.ts`, `src/services/macroHubProvider.ts`
- API: `src/app/api/live/technicals/route.ts`, `src/app/api/live/fundamentals/route.ts`, `src/app/api/command/unified/route.ts`, `src/app/api/ranking/route.ts`, `src/app/api/flow/enhanced-metrics/route.ts`
- 공통 계산: `src/lib/incomeMetrics.js`, `src/lib/rankings/engine.ts`
- Lambda 소스: `scripts/lambda-harvest/index.js`, `scripts/deploy-lambda-v7.js`
- 시험/보고: `tests/integrityAudit2Fund.test.ts`, `tests/integrityAudit2Fund.md`

## 로컬 커밋 상태

`fix/integ2-fund`에서 git add를 시도했으나 `.git/worktrees/fix-integ2-fund/index.lock` 생성이 `Operation not permitted`로 차단됐다. 인덱스 변경과 커밋은 생성되지 않았다. 이 환경의 승인 정책은 권한 상승을 허용하지 않는다. 수정 파일은 작업공간에 남겼다. 영어 커밋 메시지는 `/tmp/signum-integ2-fund-commit.txt`, 전달용 전체 패치는 `/tmp/signum-integ2-fund.patch`다.
