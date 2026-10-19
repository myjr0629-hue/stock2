# 옵션 조회 실패 결측 처리 — 추가 관문 기록

## 결과 요약

- 원인 확인: centralDataHub의 옵션 조회 실패 응답이 프리미엄·계약 수를 0으로 채웠고, 앱 Command의 signalsData가 실패 표식 없이 숫자 존재만 검사해 50/C·중립으로 인정했다.
- 수정: 실패/조회 불가 응답의 netPremium·callPremium·putPremium·totalPremium·optionsCount를 null, dataSource를 NONE으로 통일했다. 가격 부재·주간 만기 부재·빈 exact 체인·조회 예외·상위 catch·전체 조회 재시도 소진 경로를 포함한다.
- Command는 기존 캐시의 0/NONE 및 error 표식도 결측으로 처리한다. 다른 기술 관측이 있으면 해당 관측만 계산하고, 정상 관측 0은 유지한다.
- 재현 고정: 실제 생산자를 오프라인 모의 의존성으로 실행한 가격 100·기술/옵션 결측·옵션 조회 실패 응답 → 확신도/등급/설명 모두 —. 한국어·영어·일본어 카드 칸과 라벨 유지.
- 커밋·push·병합·배포·운영 API/DB/Redis 접근·브라우저 접근 없음. .env 파일 읽기 없음.

## 호출자 전수 확인

`CentralDataHub`, `getUnifiedData`, `getQuote`, `_fetchOptionsChain` 참조를 저장소의 TS/TSX/JS/MJS에서 검색했다.

| 호출자 | 영향과 처리 | 확인 |
| --- | --- | --- |
| centralDataHub._fetchInternal / getUnifiedData / getQuote | 내부 호출·위임. 모든 실패 경로가 같은 결측 응답을 사용한다. 외부 getQuote 호출은 검색되지 않았다. | 실제 생산자 오프라인 실행 |
| api/live/ticker | _fetchOptionsChain 결과를 flow에 전개한다. 프리미엄 null을 다시 0으로 만들지 않는다. | 정적 확인 |
| terminalEnricher | netPremium을 netFlow·largeTradesUsd에 복제하던 null→0 변환 제거. 실패 표식 우선, 결측 시 complete=false. | 실제 함수 추출 실행 |
| tickerOverview → api/ticker/overview | 비어 있지 않은 rawChain과 정상 flow가 있을 때만 옵션 값을 채우고 OK로 승격한다. NONE/error는 거부한다. 타입은 nullable로 갱신. | 실제 조건문 추출 실행 |
| api/debug/hub | 숫자를 계산하지 않고 필드를 그대로 JSON으로 전달한다. 수정 불필요. | 정적 확인 |
| scripts/debug_flow_calc.ts | null 계약 수가 성공 분기로 들어가던 지점에 결측 분기 추가. | 정적 확인, 실행 안 함 |
| scripts/probe_meta_deep.ts | null 프리미엄을 0 금액으로 나누지 않고 —로 출력; null 계약 수는 UNAVAILABLE. | 정적 확인, 실행 안 함 |
| scripts/debug_premarket.ts / verify_hub_refactor.ts / debug_3day.ts | 가격·세션·히스토리만 읽는다. 옵션 null 영향 없음. | 정적 확인, 실행 안 함 |
| tests/intrinioVwap.test.ts | UnifiedQuote의 VWAP 검증용 모의 옵션 함수. 프리미엄 산술 없음. | 정적 확인 |

getMarketStatus만 호출하는 Intel API들, sanitizeMaxPain만 사용하는 구조 빌드/API는 변경한 옵션 응답 계약의 소비자가 아니다. Lambda 스크립트의 _fetchOptionsChain 언급은 호출이 아닌 주석이다.

추가로 하위 소비처를 확인했다.

- 웹 LiveTickerDashboard·모바일 MobileCmdOptions·MobileCmdFlow의 FlowSniper 호출 3곳: null을 보존하고 dataSource/error도 전달한다.
- 공통 FlowSniper: 실패 시 금액·계약 수·강약 판정·비중을 —로 표시한다. 칸과 라벨을 유지한다. 계산 불가한 50/50 비중은 만들지 않는다. 정상 양수/음수/균형 프리미엄의 HTML은 기존 HEAD와 동일함을 확인했다.
- 앱 Flow: 명시적 null/NONE/error를 과거 금액과 콜 비중으로 재구성하지 않는다.
- Terminal 하위 Intel 표시와 공유/캐시 타입: nullable 계약 반영. Intel은 complete=false 또는 금액 부재에서 기존 결측 표시를 사용한다.
- largeTradesUsd·netFlow 소비처 검색: Power/Stealth의 양수 임계 보너스와 방향 신호는 null에서 성립하지 않는다. 해당 점수식은 변경하지 않았다.

## 바꾼 파일

- 생산자/직접 소비처: src/services/centralDataHub.ts, terminalEnricher.ts, tickerOverview.ts
- 화면: src/app/[locale]/app-view/cmd/page.tsx, app-view/flow/page.tsx, intel/IntelClientPage.tsx
- 공통 카드/호출처: src/components/FlowSniper.tsx, LiveTickerDashboard.tsx, intel/mobile/MobileCmdOptions.tsx, MobileCmdFlow.tsx
- 타입: src/types.ts, src/types/intel.ts, src/lib/storage/evidenceCache.ts
- 진단 도구: scripts/debug_flow_calc.ts, scripts/probe_meta_deep.ts
- 시험/기록: tests/cmdMissingScores.test.ts, tests/cmdMissingScoresGate.md

## 돌린 시험과 결과

- cmdMissingScores: 최종 18/18 통과. 생산자 실패 경로, 실제 실패 응답→Command 렌더, 과거 0/NONE/error, 정상 관측 0, Terminal 별칭, tickerOverview 실패 게이트, 앱 Flow, FlowSniper와 호출 3곳, 정상 HTML/번역 키 보존 검증.
- vwapConsumers: 22/22 통과. 기존 VWAP·화면 라벨 회귀 검증.
- 중간 최초 실행: 14/15 통과. 정상 캐시 시험 fixture에서 _ts를 빠뜨려 정상 캐시가 거부됐다. fixture에 타임스탬프를 넣은 뒤 정상 관측 0 시험 통과. 제품 코드 결함으로 확인된 실패는 아니었다.
- 타입검사: lockf로 1회 실행, exit 2. 임시 범위 tsconfig에서 next-env.d.ts를 포함하지 않아 CSS 모듈·styled-jsx·RequestInit.next 관련 23개 진단이 발생했다. nullable 계약 관련 진단은 없었으나 타입검사 통과를 주장하지 않는다. 반복 실행 제한에 따라 재실행하지 않았다.
- 전체 tsc·next build는 실행하지 않았다.
- git diff --check 통과.

시험 실행은 기존 설치의 node_modules를 NODE_PATH로 지정했다. 타입검사에 한해 임시 node_modules 심볼릭 링크와 /tmp 범위 설정을 사용했으며 링크는 제거했다. 실제 서비스 의존성·외부 통신·영속 쓰기는 시험 전에 모의 구현으로 치환했다.

## 남은 위험

- Next 전역 선언을 포함한 유효한 타입검사는 미완료다.
- 운영 발생 빈도, 실제 브라우저/기기, 배포 후 캐시 갱신은 미확인이다. 기존 0/NONE 응답은 수정한 Command/Flow/FlowSniper/Terminal 게이트가 방어한다.
