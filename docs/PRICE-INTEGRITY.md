# 가격 무회귀 검증 — 2026-10-14

기준은 로컬 `origin/main` `64f5a5f8ac811642d86742777fba5850b82be37f`다. 운영 서비스·데이터에 접근하지 않았으며 아래 값은 고정 입력을 실행한 결과다.

## 원인과 변경

1. 지수: 일봉 실패 때 분봉 가격만 새 값으로 바꾸고 그제 기준 종가를 남겨 등락 방향이 반전됐다. 달력상 직전 거래일 일봉이 없으면 가격·기준 종가·시각·후속 폴백 여부를 origin/main 계산 전체로 돌린다. 정확한 날짜 근거가 있으면 그 일봉만 선택한다.
2. 반일장: 17:00 CLOSED 판정이 SIP 캐시 조회를 건너뛰었다. 캐시 조회와 신규 호출 조건을 분리했다. 13:00부터 조회하고 기존처럼 20:00까지 갱신한다. 조회 끝 20:00:03은 `extendedSessionClose`의 POST 창 및 20:17 확정 시각과 맞춘다. 20:00 이후 신규 호출은 없고 유효한 당일 캐시는 읽는다.
3. SIP 예산: 실제 호출 전 예산 거절도 실패 캐시로 저장됐다. 실제 fetch 직전 예산을 얻은 종목만 실패를 저장한다. 미호출 선점은 소유자를 비교하는 원자 EVAL로 해제한다. 재시도 예산 거절 전에 실제 429를 받은 종목은 실패 캐시를 유지한다.
4. 감시기: 수집기에 없는 `closingCross`를 요구해 AZZ·DOW 정상 사례가 오류가 됐다. `scripts/integrity/rules.js`를 origin/main과 바이트 단위 동일하게 복원했다.

## 전후 비교

`tests/priceHardeningComparison.test.ts`는 고정 사본과 현재 구현에 같은 입력을 넣고 83행을 출력한다. 이전 결과와 같거나 독립 정답 열과 일치해야 통과한다. 근거 부족 지수 행은 이전 결과와 전체 동일해야 한다. 지수 순수 함수 외에 실제 `fetchOneQuote`도 세 지수 모두 실행한다.

| 고정 시나리오 | origin/main | 새 구현 | 정답·허용 근거 |
| --- | --- | --- | --- |
| 정규장·프리·애프터·주말 지수 | 101 / 기준 100 | 동일 | 입력 공식 종가 |
| 휴장·11/27 반일장 지수 | 101 / 기준 100 | 동일 | 입력 거래일·종가 |
| DOW meta 하루 묵음 | 51672.1484375 / 51850.5508 | 동일 | 분봉·직전 거래일 일봉 |
| DOW 일봉 실패 | 약 −0.344% | 동일 | 전체 기존 계산 유지; +0.033% 반전 제거 |
| 일봉 누락·빈 배열·null 종가·meta 시각 없음 | 기존 계산 | 동일 | 근거 부족, 부분 보정 금지 |
| 휴장 뒤 일봉 역순 | 101 / 기준 99 | 101 / 기준 100 | 9/8 직전 거래일은 9/4, 종가 100 |
| SIP 정규장 / 프리 / 애프터 | 223 / 222.50 / 222.50 | 동일 | 모의 실시간·SIP 체결 |
| SIP 주말·휴장 | 222.00 | 동일 | 신규 SIP 호출 없이 기존 값 |
| 반일장 13:30 | 223.00 | 222.50 | 13:05 Form T 체결 |
| 반일장 16:30, 15:50 체결 | 222.00 | 222.50 | 13:00부터 조회 |
| 반일장 16:59→17:00→17:01→18:00 | 222.50 | 동일 | 캐시·만료 후 갱신 보존 |
| 반일장 20:16·20:17, 유효 캐시 있음 | 222.00 | 222.50 | 같은 날 더 최신 체결 보존 |
| 예산 밖 6번째 종목, 11·59·61초 | 222.50 | 동일 | 미호출 캐시·선점 없음 |
| SIP 429 지속 / 61초 회복 | 222.00 / 222.50 | 동일 | 실패 중 기본 값, 만료 뒤 회복 |
| 8인스턴스 동일 종목 동시 요청 | 모두 222.50 | 동일 | 새 구현 SIP 실제 호출 1회 |
| AZZ 19:32·DOW 20:05 CLOSE_PRICE 오류 | 각 0건 | 각 0건 | 기존 정상 사례 보존 |

## 공유 함수 호출자와 시험

- `reconcileIndexQuote`: 유일한 운영 호출자는 `src/app/api/cron/market-feed/route.ts`의 `fetchOneQuote`. 지수 시험·비교 시험으로 가격·기준·등락·시각과 후속 일봉 조회를 검사한다.
- `extendedSipOverlay`, `etSessionNow`: `getTickerSnapshot` 내부에서만 사용한다. 그 스냅샷의 직접 호출자는 `intrinioRouter.ts`, 동일 모듈의 `sessionAwareLiquidity`·`buildTickersDirect`다. `src/lib/aws/dynamoDataProvider.ts`의 동명 함수 및 그 호출자는 별개다. 정규장·SIP·stale snapshot·벌크/목록·세션 전환 시험으로 간접 경로를 검사한다.
- `getLastExtendedTradeIntrinio`: SIP 보정과 `extendedSessionClose.ts`가 호출한다. 후자는 `beforeAttempt`를 넘기지 않으므로 기존 재시도·페이지 판정 그대로다. `scripts/test-extended-session-close.ts` 45건과 SIP 시험으로 검사한다.
- `callIntrinio`: 동일 모듈의 진단·가격·옵션·기술지표·회사·벌크·기관/내부자·재무 호출들이 공유한다. 예산 콜백은 SIP 보정의 trades 조회에서만 넘긴다. `structureWarm`·`intelFast429` 시험은 예산 콜백 없는 사용자/배경 호출·재시도·계측 경로를 검사한다.
- 새 `releaseMeterClaim`: 호출자는 SIP 보정 1곳이다. `extendedSipClaim`은 실제 SDK의 REST EVAL 명령·키·소유자 전달을 모의하고 자기 선점 해제·다른 소유자 보존을 검사한다. Redis 서버에서 Lua를 실행한 시험은 아니다.
- 감시기 `deriveRef`·`judgeFlowShown`·`judgeListShown`: `scripts/integrity/watch.js`, `bigdoor.js`가 사용한다. 감시 규칙 65건·다종목 감시 7건·비교 표를 검사한다. 실제 감시기는 실행하지 않았다.

## 알려진 한계

- 사후 검토 #3: 일반 시간외 봉을 종가로 인정하는 맹점은 남아 있다. 현재 수집기는 `closingCross`를 생성하지 않는다. origin/main은 마감 직후 거래량이 큰 분봉이나 meta를 종가 대안으로 허용하므로 실제 경매가 아닌 체결을 정상으로 볼 수 있다. 이번에는 감시 오탐 회귀를 막기 위해 기존 규칙을 유지한다.
- 근거 부족 시 기존 동작을 유지하므로 기존의 잘못된 추정도 남는다. 예: 당일 meta가 묵고 일봉까지 실패한 경우, 또는 직전 거래일 일봉 누락. 비교 표는 이 경우를 개선으로 주장하지 않는다.
- SIP 실패 캐시·공유 호출 예산·저장소 장애에 따른 갱신 지연은 남는다. 모의 시나리오 통과는 모든 가능한 공급사 응답·분산 장애·운영 발생 빈도의 증명이 아니다.
- 반일장의 앱/감시 세션은 17:00에 CLOSED이나 시간외 종가 서비스의 확정은 기존처럼 20:17이다. 이번 수정은 그 사이 정상 SIP 값을 보존한다. 다른 화면의 시간·라벨·표시 방식은 수정하지 않았다.
- 타입 검사는 기존 `src/remotion/kit/scripts.ts:5004`의 `./scripts-jpweek` 누락 1건을 제외하면 오류가 없다. origin/main에도 같은 import가 있고 파일이 없다.

## 재실행

검증 결과: 관련 시험 18개 군 모두 종료 코드 0. 전후 비교 83행, 지수 20건, SIP 22건, 선점 해제 4건, 감시 규칙 65건, 정규장 10건, 다종목 감시 7건, 시간외 종가 45건을 포함한다. pre-commit 비밀값 검사도 통과했다.

```sh
NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/priceHardeningComparison.test.ts
node_modules/.bin/tsc --noEmit --incremental false
```

추가 시험: `indexQuoteReconcile`, `extendedSipOverlay`, `extendedSipClaim`, `priceIntegrityRules`, `regularRealtimeOverlay`, `integrityBigDoor`, `extStaleSnapshot`, `extTransition`, `extStaleRoute`, `quotesBulkClose`, `preCloseCarryAcrossOpen`, `hubLiveOverlay`, `marketCalendar.session`, `afterCloseSession`, `structureWarm`, `intelFast429` 및 `scripts/test-extended-session-close.ts`. 테스트 실행에는 외부 소켓 차단·모의 fetch·최소 환경변수를 사용했고 `.env*`를 읽지 않았다.
