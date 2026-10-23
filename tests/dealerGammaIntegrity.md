# H5 · L9 · M11 수리 기록 (2026-10-23)

## 결과 요약

- 작업 브랜치: `fix/dealer-gamma-sign`. 시작 HEAD와 로컬 `origin/main` 모두 `d6c648194118fe0855bceb6b16a51fe208d021a5`.
- 화면 문구·라벨·레이아웃은 수정하지 않았다. 공급사 호출을 추가하지 않았다.
- 운영 GET 재측정·운영 쓰기·커밋·push·병합·배포는 수행하지 않았다.

| 항목 | 코드에서 확인한 원인 | 수리 |
| --- | --- | --- |
| H5 | `getDealerGamma`가 백필 마지막 행을 현재값으로 선택했다. premium API가 이미 읽은 SPY 구조 판본과 별개였다. | premium API의 같은 구조 판본에서 `netGex`·`chainDate`·기준가를 전달한다. 백필은 그 날짜보다 앞선 관측만 백분위 비교에 사용한다. 현재값·날짜 결측은 `null`, 이력만 결측이면 현재값을 유지하고 백분위는 `null`. |
| L9 | CentralDataHub의 별도 체인은 콜 + / 풋 −, 구조 GEX는 콜 − / 풋 + 규약이고 단위도 달랐다. 출력 경계가 netGex만 덮고 gamma는 남겼다. | live/ticker의 공통 출력 경계에서 `gamma = netGex`. 캐시 적중·새 계산·직전 정상본 병합에 동일 적용한다. |
| M11 | 랭킹 생성과 장중 가격 재계산은 `(가격−레벨)/가격`, batch의 `maxPainDist`는 `(레벨−가격)/가격`이었다. | 맥스페인 랭킹 두 계산을 batch 규약으로 통일한다. 감마 플립 거리는 기존 규약을 유지한다. 구조 `chainDate`를 행의 `date`로 운반하고, 반대 부호의 기존 캐시는 공용 키 v12로 분리한다. |

## 바꾼 파일과 호출자 영향

- `src/services/dealerGamma.ts`: 운영 호출자 전수 확인 2곳.
  - `src/app/api/live/premium-metrics/route.ts`: 이미 읽은 구조를 전달하므로 추가 공급사·구조 호출 없음. 카드 GEX와 volatilityRegime 입력이 같은 판본이다.
  - `src/services/guardian/unifiedDataStream.ts`: 백분위·표본 수만 소비한다. 기존 1인수 호출은 저장된 `structure:v2:SPY`를 읽는다. Redis 읽기 1회 추가, 공급사 호출·쓰기 없음. SPY×10 지수 프록시 가격은 전달하지 않는다.
- `src/app/api/live/ticker/route.ts`: `withExitLevels` 호출 2곳(캐시 응답, 새 계산/직전 정상본 병합 응답). `flow.gamma`를 읽는 다른 앱 소스 호출자는 검색에서 발견하지 못했다.
- `src/lib/rankings/livePrice.ts`: `applyLivePrices`의 운영 호출자는 같은 파일의 `withLivePrices`, 그 호출자는 `src/app/api/ranking/route.ts`다. 맥스페인 부호만 바뀌며 절댓값 순위·유효 범위·기존 시세 호출 수는 유지한다.
- `src/lib/rankings/cacheKey.ts`: 생산자는 ranking API, 운영 소비자는 `services/aiqContextService.ts`, 검사 소비자는 `scripts/ai-quality-55/harness.ts`. 모두 공용 키를 import하므로 v12를 함께 사용한다.
- 회귀 시험: `gammaFlipDistance.test.js`, `b5MetricDefinitions.test.cjs`, `rankingLivePrice.test.ts`, `rankingSessionDate.test.cjs`, 신규 `tickerGammaSign.test.cjs`.
- `tests/earningsScenario.test.cjs`: 전체 실행에서 과거 기능 커밋 대비 저장소 전체 diff를 고정한 일회성 검사가 실패했다. 비교 범위를 시나리오 기능·보호 대상 페이지로 한정했다. 기존 계산 600조합, 모델 바이트, 3언어 HTML 검사는 유지한다.
- `tests/readCheck.test.cjs`: 같은 종류의 과거 저장소 전체 diff 검사를 보호 대상 파일과 로컬 `origin/main`의 비교로 바꿨다. 과거 구현과의 3언어 HTML 비교는 유지한다.
- `tests/tickerPayload.test.js`, `tests/tickerVwapColdCache.test.js`: 실제 옵션 판본 적용과 같이 `netGex`를 전달하도록 대역을 정비했다. 의도적으로 수리한 `gamma` 별칭만 새 계약으로 검사하고, 나머지 본문·체인·VWAP 비교는 유지한다.

## 돌린 시험과 결과

- H5: 감사 값(구조 +400,297,625 / 전일 백필 −6,017,528)을 고정한 premium GET, Guardian 기본 경로, 같은 날·미래 이력 제외, 이력 부족, 현재값/날짜 결측, 실제 0.
- L9: 실제 `withExitLevels` 함수를 메모리 대역으로 실행. 양수·음수·0·결측·비유한수, 캐시 객체 불변, 두 응답 경로 확인.
- M11: 실제 ranking GET에 NVDA·IBM·UMC·일치·결측 fixture를 넣어 부호·순위·날짜·캐시 판본을 확인. 장중 가격 재계산은 별도 시험으로 확인한다.
- 기존 감마 플립 거리·임계값·Guardian 프록시 방어 시험을 유지했다.
- 전체 오프라인 294개 최초 실행: 290개 통과, 4개 실패. 위의 기존 시험 4개를 정비하고 해당 파일만 재검사한 최종 결과는 **294개 통과, 실패 0개**다. 전체 실행은 반복하지 않았다.
- TypeScript: **종료 코드 0, 오류 0개** (`--noEmit --incremental false`). 검사 출력 파일은 0바이트다.
- 실행 명령은 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 감쌌다.
  - `node scripts/run-offline-tests.cjs` (전체)
  - `node scripts/run-offline-tests.cjs earningsScenario.test.cjs` (실패 파일 재검사)
  - `node scripts/run-offline-tests.cjs readCheck.test.cjs tickerPayload.test.js tickerVwapColdCache.test.js` (실패 파일 재검사)
  - `node node_modules/typescript/bin/tsc --noEmit --incremental false`
- 로컬 증거: `.logs/ux-gate/results.json`(최초), `recheck.json`(4개 재검사), `final.json`(294개 최종), 시험별 `.log`. `git diff --check`도 통과했다.

## 남은 위험

- 검증은 외부 통신과 환경 파일 읽기를 차단한 오프라인 대역으로 수행했다. 운영 반영 후 같은 세션의 GET 대조는 운영 세션에서 필요하다.
- `flow.gamma`는 이제 달러 GEX 별칭이다. 내부 화면 소비자는 발견하지 못했으나, 저장되지 않은 외부 소비자의 옛 단위 의존 여부는 확인할 수 없다.
- 공급사/구조 판본 자체의 결측·지연은 이 수리로 생성하거나 보정하지 않는다. 현재 관측 근거가 없으면 `null`을 운반한다.
