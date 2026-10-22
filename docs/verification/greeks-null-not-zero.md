# 그릭스·IV 결측과 관측 0 구분

## 원인과 수정

- `src/services/intrinioClient.ts`의 체인 변환은 실시간·EOD 필드가 모두 없으면 delta·theta·vega·IV를 `?? 0`으로 채웠다. gamma만 null이었다.
- Lambda 어댑터 5곳에도 같은 패턴이 있었다. 네 EOD 복사본은 gamma 결측도 0으로 채웠다.
- 각 변환의 그릭스·IV 전용 숫자 판독기는 결측·빈 문자열·비유한 수·숫자 아닌 값을 null로 운반한다. 숫자 문자열은 기존처럼 숫자로 변환하고, 관측된 0은 유지한다.
- 실시간 유효 값 → EOD 유효 값 → null 순서를 유지한다. 실시간 0도 유효 값이다. IV 출처 판정과 EOD 원관측에도 같은 판독기를 사용한다.
- 다른 데이터가 사용하는 기존 `num` 함수는 변경하지 않았다. 공유 체인 함수와 `OptionSnapshot` 타입의 영향은 아래와 같다.

## 호출자 전수 추적

`src`의 그릭스·IV 필드, 체인/단일 계약 함수, 스냅샷 경로 및 Lambda의 어댑터 호출을 정적 검색했다.

| 경로·호출자 | 영향·확인 |
|---|---|
| `intrinioClient.getRealtimeGreeksIntrinio` | 체인 변환 내부에서만 사용. 필드별 실시간 값이 없으면 기존 EOD 대체 규칙 유지. |
| `intrinioRouter.routeToIntrinio` | 스냅샷 경로를 체인 변환에 연결. 계약 유형 필터 후에도 null 유지. |
| `massiveClient.getOptionSnapshot`, `getOptionChainSnapshot`, `fetchOptionSnapshot` | 체인·단일 계약을 그대로 전달. `OptionSnapshot` 그릭스 4개·IV 타입을 `number \| null`로 정정. 단일 계약 함수는 `forensicService`에 사용하지 않는 import만 존재. |
| `centralDataHub` → `live/ticker.slimOptionChain` → 웹 Flow | delta·gamma·IV를 복사하므로 null/0 구분 유지. theta·vega는 기존 슬림 계약 필드에 없으며 이번에 필드를 숨기거나 제거하지 않음. |
| `FlowRadar` OPI·DEX | 유한한 숫자 delta만 집계하도록 명시. 결측 계약을 0 관측으로 바꾸지 않음. 기존 합계·분류·문구 유지. |
| `FlowRadar` ATM IV 평균·IV Skew | 양수 IV 필터 후 그 계약 수로 나누므로 결측이 평균 분모에 들어가지 않음. IV=0은 원본에 유지하되 기존 양수 IV 도메인 필터에서는 제외. |
| `structureService` | gamma 숫자 검사로 GEX·커버리지에 결측 제외, 관측 gamma=0은 커버리지에 포함. ATM IV·스퀴즈 IV는 양수 필터. OI 기반 맥스페인·벽·PCR은 그릭스와 독립. |
| `stockApi`, `centralDataHub`, `dashboard/unified` 및 Flow gamma 합계 | 기존 `gamma \|\| 0`은 합계에만 기여 0인 항으로 처리. 결측을 별도 계약 관측값으로 반환하지 않음. gamma 결측 제외와 합계가 같음. |
| `terminalEnricher` → `alphaEngine.computeIVSkew` | 평탄화 시 null은 undefined로 생략. ATM IV 평균·스큐는 양수 IV만 사용. 그릭스 추정값으로 채우지 않음. |
| `live/options/chain`, `live/options/trades` | 체인·greeks·IV를 그대로 전달. 체결 원천 부재 처리 규칙 유지. |
| `live/options/atm` → `lib/ivSkew` → 기존 IV 화면 | 별도 EOD 원관측의 null/0 구분 유지. 기존 결측 표시·행 유지 동작은 기존 `ivSkew.test.cjs`로 검사. |
| `earningsMonthlyProbe` | 체인 EOD 호가로 스트래들 가격 계산. 그릭스·IV 값에 의존하지 않음. |
| `tickerOverview`, `weekendOptionsCache`, `forensicService`, 진단 API `debug/options-probe`, `live/options/structure` | 체인을 전달하거나 OI·가격·거래량 사용. theta·vega 직접 계산/화면 사용처 없음. |
| `scripts/lambda-flow-harvest/intrinio-adapter.js` | 실시간/EOD 합성 변환을 Vercel과 일치시킴. `index.js`의 `routeMassiveUrl` 경로와 슬림 계약은 기존 gamma·IV만 사용. |
| `scripts/lambda-shared`, `scripts/lambda-harvest`, `scripts/lambda-xs`, `harvest_lambda`의 `intrinio-adapter.js` | EOD 변환 네 복사본도 4개 그릭스·IV를 null로 운반. `lambda-harvest/index.js`, `harvest_lambda/index.js`의 라우터 및 직접 체인 호출도 영향 대상. |
| `harvest_lambda/index.js`, `iv30.js`, `lambda-xs/source-adapter.js` | gamma·delta는 합계/부호 필터, IV는 유효 양수 필터 후 집계. theta·vega 직접 사용 없음. |

화면 JSX·라벨·번역·표시 형식은 변경하지 않았다. theta·vega를 계산하거나 표시하는 직접 소비처는 현재 코드에서 확인되지 않았다.

## 시험

- 신규 `tests/greeksNull.test.cjs`: 실제 Vercel 변환과 Lambda 5개 변환, 원천 결측/0/문자열 0/잘못된 값, 실시간 우선/EOD 대체/실시간 0, IV 출처, JSON 직렬화 검사.
- 실제 라우터·체인/단일 계약 래퍼·슬림 전달 함수, Flow OPI/DEX/IV 평균/스큐 계산, 구조 GEX/커버리지 콜백을 오프라인으로 실행한다.
- 기존 `commandIv.test.cjs`, `ivSkew.test.cjs`의 함수 발췌 시험에도 실제 `greekNumber` 선언을 함께 넣었다. 검증 조건을 완화하거나 판독기를 모의 구현하지 않았다.
- 신규 회귀 11/11 통과. 기존 IV 앱·웹 결측 렌더 시험과 실제 Intrinio 연결 경로 시험 통과.
- 전체 tsc `node node_modules/typescript/bin/tsc --noEmit --pretty false`: 종료 코드 0, 진단 0. 제품 코드 수정 후 1회 실행.
- 전체 오프라인 시험 초회: 280파일 실행, 276 통과·4 실패. `commandIv.test.cjs`의 새 판독기 선언 누락을 보완하고 해당 파일만 재검사해 통과했다. **최종 280파일 중 277 통과·기존 원인 3 실패.**
- 무거운 명령은 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬 실행했다. 환경 파일·외부 통신은 기존 오프라인 사전 로더로 차단했다.

기존 원인으로 확인한 실패 3개는 이번 수정 범위 밖이다.

| 시험 | 실패 원인·기존 상태 확인 |
|---|---|
| `integrityAudit2Fund.test.ts` | 매크로 시험 로더의 `@/lib/macroSnapshotCarry` 의존성 누락. 해당 시험·매크로 소스 2개 모두 HEAD와 SHA-256 일치. |
| `readCheck.test.cjs` | 옛 기준 `8efa93c14` 대비 기존 src 수정 파일이 `darkPool.ts` 하나여야 한다는 단언. 작업 전 HEAD 자체가 이미 여러 파일에서 달라 실패 조건을 만족. 시험 파일은 HEAD와 동일. |
| `structureWarm.test.ts` | 명시된 계측 호출자 목록에 기존 `realtimeSessionVwap.ts`가 누락. 해당 시험·해당 서비스는 HEAD와 SHA-256 일치. |

## 남은 제한

- 과거 캐시에 이미 저장된 0은 진짜 관측 0과 구분할 수 없다. 운영 캐시 쓰기/삭제 및 배포를 하지 않았으므로 기존 저장본은 정상 만료·갱신 전까지 남을 수 있다.
- 외부 API·운영·브라우저 검증은 수행하지 않는다. 결과는 저장소 코드의 정적 추적 및 오프라인 재생 범위다.

- 현재 브랜치: `fix/greeks-null-not-zero`. Git 인덱스 `index.lock` 생성이 환경에서 `Operation not permitted`로 거부되어 커밋 미완료. 전체 변경 패치는 `/tmp/signum-greeks-null-not-zero.patch`에 보관했다. push·병합·배포·운영 쓰기 없음.
