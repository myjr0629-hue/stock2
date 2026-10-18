# VWAP CLOSED 시험 실패 원인 확인

## 결과 요약

- 작업 기준: `fix/vwap-closed-regression`, 시작 HEAD/main `536d81d2c`.
- 대상은 `tests/intrinioVwap.test.ts`의 9번 CLOSED 시험이다. `tests/vwapConsumers.test.ts`에는 해당 이름의 시험이 없다.
- 수정 전 실제 시험 결과: 34개 중 33개 통과, CLOSED의 `afterHours`만 `undefined !== 102`로 실패했다. 가격 102, CLOSED 세션, 정규장 종가 100, 전일 종가 98 비교는 통과했다.
- 실패 시작 커밋은 `eb75a841c`이며 main 유입 병합은 `ad2c9e53d`이다. VWAP `ce6380801`과 risk `e3a752616`은 원인이 아니다.
- 판정: 시험 입력이 낡았다. CLOSED 조회시각 20:30 ET를 원천 체결시각으로도 사용해 POST 가격을 기대했다. 제품 코드의 원천시각 판정은 유지하고 시험만 갱신했다.

### 커밋 전후 실행 근거

원래 시험의 PRE/REG/POST/CLOSED 가격·세션·종가·시간외 가격 단언을 고정하고 각 버전의 실제 생산 모듈을 실행했다. VWAP 추가 전 버전도 비교하기 위해 이 비교에서만 VWAP null 단언은 제외했다. 각 프로세스는 해당 버전의 `src`/`scripts` 모듈을 `git show`로 로드한다. Git 작업 트리 전환은 하지 않았다.

| 버전 | 통과/실패 | CLOSED afterHours / hasExtendedTrade |
|---|---|---|
| `ce6380801^` | 4/0 | 102 / true |
| `ce6380801` = risk 병합 직전 | 4/0 | 102 / true |
| `e3a752616` | 4/0 | 102 / true |
| `ad2c9e53d^1` | 4/0 | 102 / true |
| `ad2c9e53d` | 3/1 | undefined / false |
| `eb75a841c^` | 4/0 | 102 / true |
| `eb75a841c` | 3/1 | undefined / false |
| 시작 HEAD `536d81d2c` | 3/1 | undefined / false |

모든 버전에서 CLOSED의 원천 가격 102, 정규장 종가 100, 전일 종가 98, 세션 CLOSED는 동일했다. 비교 스크립트는 `/tmp/signum-vwap-closed-history.cjs`, 전체 결과는 `/tmp/signum-vwap-closed-history.log`, 개별 로그는 `/tmp/signum-vwap-closed-history-*.log`다. 원본 전체 시험 실패 로그는 `/tmp/signum-vwap-closed-baseline.log`다.

### 커밋 의도와 실패 메커니즘

`eb75a841c`의 제목은 `Fix extended-trade eligibility immediately after the regular close`다. 해당 커밋의 [6차 검증 문서](p1-time-basis-6-validation.md)는 다음 의도를 명시한다: “마지막 체결이 정규장 마지막 체결보다 뒤이면서, 원천시각의 달력 세션이 PRE/POST인지 판정한다.” 기존 60초 간격 조건이 유효한 16:00:01 POST를 누락하던 문제를 수리한 변경이다.

실제 diff는 `hasExtendedTrade`에 `sessionAt(lastTime)`의 PRE/POST 조건을 추가했다. 달력 판정기의 일반 POST는 16:00 이상 20:00 미만이다. 원래 CLOSED 입력 `2026-10-17T00:30:00Z`는 10월 16일 20:30 ET이므로 POST 체결이 아니다. 마지막 원천 가격은 계속 102이지만 POST 가격으로는 인정하지 않는 결과가 의도와 일치한다.

## 바꾼 파일

- `tests/intrinioVwap.test.ts`: CLOSED 조회시각은 20:30 ET로 유지하고 원천 체결시각은 직전 POST의 19:59:59 ET로 분리했다. 가격·세션·두 종가·시간외 가격의 기존 단언을 유지하고 시간외 메타데이터·원천시각도 확인한다. 별도 대조 시험은 20:00/20:30 ET 원천 체결을 POST에서 제외하면서 원천 가격·시각·종가·VWAP 결측을 보존하는지 확인한다.
- 이 검증 문서.

생산 코드·공유 함수·화면 라벨·문구·표시 방식은 변경하지 않았다. 영어 커밋 메시지는 `/tmp/signum-vwap-closed-test-commit.txt`에 작성했다. 커밋은 생성하지 않았다.

## 돌린 시험과 결과

비교·회귀 묶음·타입 검사는 각각 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬화했다. 최종 회귀 실행은 `.env*` 읽기와 실제 외부 fetch/HTTP/socket 연결을 차단하는 preload를 사용했다. 공급사·Redis 응답과 쓰기는 시험 대역이다.

| 시험 | 결과 |
|---|---|
| intrinioVwap | 35 통과 / 0 실패 |
| vwapConsumers | 22 통과 / 0 실패 |
| vwapDisplay | 20 통과 / 0 실패 |
| priceTimeBasis | 43 통과 / 0 실패 |
| extStaleSnapshot | 21 통과 / 0 실패 |
| dashCloseRoll | 원본 JSON·실제 store·화면 계산·세션 경계 재생 통과 |
| `tsc --noEmit --pretty false -p tests/tsconfig.intrinio-vwap.json` | exit 0 |
| `git diff --check` | exit 0 |

합계 141개 통과 및 JSON 재생 통과. 최종 결과는 `/tmp/signum-vwap-closed-results.json`, 개별 로그는 `/tmp/signum-vwap-closed-{시험명}.log`, 타입 로그는 `/tmp/signum-vwap-closed-types.log`다.

## 남은 위험

- 이번 확인은 합성 입력과 저장된 JSON의 오프라인 실행이다. 운영 공급사의 실제 CLOSED 응답·브라우저·실기기는 확인하지 않았다.
- 전체 tsc와 Next build는 실행하지 않았다. 변경 시험과 관련 생산 경로를 포함하는 기존 범위 타입 검사만 통과했다.
- push·main 병합·배포·운영 데이터 쓰기는 하지 않았다.
