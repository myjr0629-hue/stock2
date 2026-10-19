# PRE 본장 기준·UC 조기 폐장 시각 검증

## 결과 요약

- 브랜치: `fix/price-pre-baseline`. 작업 시작 HEAD와 로컬 `origin/main`은 모두 `1b31b0a894206b52accaa05b8569dd86463809a7`이었다. 원격 fetch는 하지 않았다.
- 관문 B1-10191713의 SSR 본장 기준 오류는 현재 main에서 이미 보정돼 있었다. 남은 PRE 초기화·복귀 경로만 수정했다.
- 확인한 원인: 가격 없는 저장소를 unified 응답으로 채울 때 `prevRegularClose`가 갱신되지 않아 보관된 목요일 기준가가 남는다. PRE WS 갱신은 보관된 `regularCloseToday`를 직전 종가보다 먼저 선택했다. SSR 직후에는 PRE WS가 일간 등락을 0으로 바꾸는 경로도 있었다.
- 수정 후 합성 입력 목98·금100·월PRE100은 본장100·본장+2.04%·PRE0%를 유지한다. 본장 일간 계산용 `prevClose=98`은 보존한다.
- 관문 S-10191741의 원인: UC 배경의 세션 판정과 FACTS 마감 시각이 16시에 고정돼 있었다. UC 배경만 marketCalendar의 날짜별 마감 시각을 사용하도록 연결했다. 조기 폐장 3일은 13:00부터 마감 상태·FACTS 13:00 ET, 평일 정상 마감은 16:00 ET다.
- 화면 파일·고정 라벨·번역 문구 변경 없음. 커밋·push·병합·배포·운영 쓰기 없음.

## 바꾼 파일

| 파일 | 변경 |
| --- | --- |
| `src/stores/dashboardStore.ts` | PRE unified 초기 가격 채움 2곳의 직전 종가 설정, PRE WS 기준가 선택, SSR 일간 등락 보존 |
| `src/lib/marketCalendar.ts` | 조기 폐장을 반영하는 순수 현물 구간 판정 `cashSessionPhaseAt` 추가 |
| `src/lib/marketBackdrop.ts` | UC 배경·캐시 달력 열쇠를 위 판정에 연결하고 FACTS에 날짜별 마감 시각 사용 |
| `tests/pricePreBaseline.replay.test.ts` | 실제 저장소 작업과 모바일 표시 계산식 3개를 실행하는 무네트워크 재생 |
| `tests/fixtures/price-pre-baseline/quotes-2310.json`, `README.md` | 2026-10-19 저장 REG 사본 5종목에서 7개 가격 필드만 복사, 출처·합성 범위 기록 |
| 이 문서 | 원인·공용 호출처 영향·시험 기록 |

공용 호출처 확인:

- 저장소 가격 작업 직접 호출: `DashboardClient`, `MobileDashboardPage`, `MobileDashboardClient`. PRE 초기화·갱신 결과가 함께 수정된다. `MobileDashboardShell`의 헤더·서랍과 `MobileMetricsTab`은 저장 가격을 읽는다.
- 나머지 저장소 소비처 `MobileHoldingCard`, `MobileCommandPage`, `WatchlistClientPage`, `PortfolioClientPage`는 종목 선택·추가 기능만 사용한다. 해당 화면들의 별도 가격 경로는 수정하지 않았다.
- `cashSessionPhaseAt` 호출은 `marketBackdrop.calendarKey`, `buildBackdrop` 두 곳이다. 기존 `marketSession.cashPhase`의 다른 호출자는 변경하지 않았다.
- `buildBackdrop` 직접 호출: `marketBackdropLoader.loadBackdrop`, `preMarketContext`, `/api/market/now`의 시뮬레이션, `/api/undercurrent/macro`의 시뮬레이션. `loadBackdrop`은 `/api/market/now`와 `/api/undercurrent/macro`에서 사용한다. 정상일·휴일·주말 세션과 가격 자료 날짜 보존을 대조했다.
- `factsBlock`은 `/api/undercurrent/macro`의 AI 입력, `calendarKey`는 같은 API의 캐시 검증과 `buildBackdrop`에서 사용한다. 조기 폐장 13:00 경계에 배경과 캐시 열쇠가 함께 바뀐다.

## 돌린 시험과 결과

- 수정본 재생: **31건 통과**. 원본 `/Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots/`의 `quotes-2310.json`을 지정했다.
- 같은 시험을 `--baseline`으로 로컬 origin/main 코드에 적용: **14건 통과·17건 실패**. 실패는 PRE 5건·조기 폐장 12건이며, 저장 REG 5종목 대조는 통과했다.
- PRE·조기 폐장·POST 경계는 합성 재생이다. REG 5종목의 입력만 실제 저장 API 사본이다. 공식 종가 또는 실기기 측정이라고 주장하지 않는다.
- 실제 모바일 계산식 3곳을 AST로 추출해 실행했다. 저장소·가격 함수는 실제 코드를 사용하고, 네트워크·브라우저 저장소는 메모리 대역으로 제한했다.
- 전체 tsc: **오류 0개, 종료 코드 0**. 지정 lockf로 한 번만 실행했고 소스는 이후 수정하지 않았다.
- 같은 lockf 안에서 순차 실행한 회귀 4파일 전부 종료 코드 0:
  - `marketCalendar.session.test.ts`: **37/37 통과**.
  - `marketBackdrop.session.test.ts`: **71/71 통과**.
  - `dashCloseRoll.test.ts`: 저장 JSON → 실제 저장소 → 데스크톱/모바일 표시·차트 식, 입력 순서·세션 경계 재생 **통과**.
  - `pricePreBaseline.replay.test.ts`: 저장한 축약 fixture 기본 경로로 **31/31 통과**. 원본 지정 재생과 같은 결과다.
- 추적 소스 `git diff --check`와 신규 4파일의 줄 끝 공백·개행 검사 **통과**.
- 시험 로그: `/tmp/signum-marketCalendar.session.test.ts.log`, `/tmp/signum-marketBackdrop.session.test.ts.log`, `/tmp/signum-dashCloseRoll.test.ts.log`, `/tmp/signum-pricePreBaseline.replay.test.ts.log`.

재생 명령:

```sh
node node_modules/ts-node/dist/bin.js --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' tests/pricePreBaseline.replay.test.ts
```

`--snapshots-dir=<원본 reg-snapshots 폴더>`로 원본을 사용하고, `--baseline`으로 로컬 origin/main을 대조할 수 있다. 원본 경로를 생략하면 저장한 축약 fixture를 사용한다.

전체 타입 검사는 한 번만 실행했다:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false
```

관련 회귀 묶음도 동일한 lockf 잠금 안에서 순서대로 실행했다. 운영 API·Redis·DB는 호출하지 않는다.

## 남은 위험

- 운영 피드·브라우저·실기기·실제 AI 생성 출력은 검증하지 않았다.
- 기존 가격 채택·체결 시각·공급사 자료 도착 정책은 수정하지 않았다. 지연 자료는 원래 자료 날짜를 유지한다.
- 이번 수정은 UC AI 입력의 마감 시각과 그 세션·캐시 경계에 한정했다. AI 출력 검사 `timeLabelViolation`의 별도 16시 문장 검출 기능은 추가하지 않았다.
- 원격 서버의 최신 main과 로컬 origin/main의 일치 여부는 미확인이다.
