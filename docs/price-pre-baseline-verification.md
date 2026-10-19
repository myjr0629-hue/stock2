# PRE 본장 기준·UC 조기 폐장 시각 검증 — 3차 재작업

## 결과 요약

- 지정 작업공간·브랜치 `fix/price-pre-baseline`에서 관문 2차 보류를 재현 후 수리했다. 작업 시작 HEAD는 `583e3e5eee5f22bec1eeaa17c57844d1c00bc404`다. 이번 작업에서 커밋·fetch·push·병합·배포·운영 쓰기는 하지 않았다.
- 기존 분리 브랜치의 기준점(현재 로컬 origin/main과 merge-base)은 `1b31b0a894206b52accaa05b8569dd86463809a7`이다. 현재 로컬 origin/main은 `591bd2a1349c34c4e8a6acfc987e4caf8e92c00a`로 진전했다. 이번 재작업에서는 기존 관문 대상 브랜치를 유지했다. 원격 서버 최신 상태는 조회하지 않았다.
- 관문 `gate-fix_price-pre-baseline-10200458.md`의 원인: 실제 persist.partialize가 가격과 등락률을 비우고 `prevRegularClose=100`, `prevClose=98`만 보관한다. PRE unified가 quotes보다 먼저 도착하면, 날짜 없는 보관 종가를 유지하는 분기에서 비워진 등락률을 다시 선택해 표시식이 0%로 출력했다.
- 수리: 보관 종가를 선택했고 기존 등락률이 없을 때, 함께 보관된 종가·전일 종가로 일간 등락을 복원한다. `100/98`은 +2.0408163265%, `100/100`은 실제 0%, `100/102`는 -1.9607843137%다. 기존 유효 등락률은 유지한다. 거부한 후보의 등락률·분모·관측 날짜를 섞지 않는다.
- 관문 1차 수리 유지: 구조 가격 99를 종가 후보로 사용하지 않는다. 보관 종가는 양쪽 관측 날짜가 확인되고 후보 날짜가 더 새로울 때만 교체한다. 동일일·과거일·날짜 불명은 보관 가격·날짜를 유지한다.
- 기존 UC 수리 유지: `marketCalendar.cashSessionPhaseAt`으로 구간을 판정하고 `sessionCloseMinutes`로 FACTS의 마감 시각을 만든다. 조기 폐장 3일은 13:00 ET다. 다른 가격 경로·화면 라벨·문구·칸은 수정하지 않았다.

## 바꾼 파일

이번 재작업의 미커밋 변경은 3개다.

| 파일 | 변경 |
| --- | --- |
| `src/stores/dashboardStore.ts` | PRE 종가 보존 분기에서 누락된 일간 등락률을 보관 가격 쌍으로 복원 |
| `tests/pricePreBaseline.replay.test.ts` | 실제 저장/복원 어댑터를 통과하는 관문 재현, 거부 후보와 등락률 분리, 실제 0%·음수 등락 검증 20건 추가 |
| 이 문서 | 3차 원인·공유 호출처·실행 결과 갱신 |

기존 분리 브랜치에는 위 파일 외에 unified API의 일봉 날짜 전달, marketCalendar·marketBackdrop의 조기 폐장 처리, REG 가격 fixture와 출처 README가 있다. 이번 생산 코드 수정은 저장소 한 곳이다.

공유 함수 영향과 시험:

- 수정한 `seedUnifiedPrice`의 모든 직접 호출자는 `fetchDashboardData`, `fetchSingleTicker` 두 곳이다. PRE 초기화에서만 복원 분기가 바뀐다. 두 호출자를 구조 응답·analysis-cache 응답, 일봉 조회·일봉 캐시 조합으로 실제 실행했다.
- 두 저장소 작업은 `DashboardClient`, `MobileDashboardPage`, `MobileDashboardClient`에서 사용한다. 표시 소비처 `MobileDashboardShell` 헤더·서랍과 `MobileDashboardClient` 카드의 실제 `calcPriceDisplay` 호출식 3곳을 재생했다. 기존 `dashCloseRoll`은 데스크톱·모바일 표시식과 세션 전환을 함께 실행한다.
- 기존 `getDailyChangeBatch` 직접 호출자는 `buildResponseFromResults`, `buildResponseFromAnalysisCache` 두 곳이다. 실제 일봉 독자·응답 생성 함수를 실행하되 I/O·알파·기록은 메모리 대역으로 대체했다. PRE 날짜 전달 및 REG·POST·CLOSED의 기존 가격 필드도 시험했다.
- 기존 `cashSessionPhaseAt` 직접 호출자는 `marketBackdrop.calendarKey`, `buildBackdrop` 두 곳이다. `buildBackdrop`은 `marketBackdropLoader.loadBackdrop`, `preMarketContext`, `/api/market/now`, `/api/undercurrent/macro`에서 사용한다. `factsBlock`은 UC macro AI 입력에 쓰인다. 정상일·휴일·주말 및 조기 폐장 경계·자료 날짜 보존을 재생했다.

## 돌린 시험과 결과

- 생산 코드 수정 전: 신규 20건 중 **18건 실패·2건 통과**, 기존 **55/55 통과**. 실제 저장 어댑터 → 두 unified 생성식 → 초기화 두 경로 → 모바일 표시식 3곳에서 0% 회귀를 확인했다.
- 수정 후 재생: **75/75 통과**, 종료 코드 0. 관문 1·2차, 날짜 신구·동일·결측, SSR·폴링·WS, PRE·REG·POST·CLOSED, 조기 폐장 3일을 포함한다.
- REG는 원본 `/Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots/quotes-2310.json`의 5종목 사본을 지정했다. PRE·POST·조기 폐장 및 관문 입력은 합성 재생이며 실기기·공식 종가 측정이 아니다.
- 기존 회귀: `marketCalendar.session.test.ts` **37/37**, `marketBackdrop.session.test.ts` **71/71**, `dashCloseRoll.test.ts` **통과**, 각각 종료 코드 0.
- 전체 tsc: **오류 0개**, 종료 코드 0. 한 번 실행했고 로그는 0바이트다. 이후 생산 코드 변경은 없다.
- 재생과 회귀·tsc는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 실행했다. 수정 전후 재생은 생산 코드가 달라 각각 실행했다. 전체 tsc는 한 번만 실행했다.
- 파일 변경은 `git diff`로 물리 저장을 확인했고 `git diff --check`도 통과했다. 브라우저·환경 파일·운영 피드·Redis·DB에는 접근하지 않았다.

실행 명령:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/ts-node/dist/bin.js --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' tests/pricePreBaseline.replay.test.ts --snapshots-dir=/Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots
```

회귀와 타입 검사는 공용 잠금 아래 Python 순차 실행기로 실행했다. 각 로그는 `/tmp/signum-pre-baseline-round3-{calendar,backdrop,dashboard,tsc}.log`다. 타입 검사 명령은 `node node_modules/typescript/bin/tsc --noEmit --incremental false`다.

## 남은 위험

- 날짜 없는 보관 종가의 신구는 확정할 수 없어 기존 가격을 보존한다. 보관 전일 종가도 없고 등락률도 없으면 복원 근거가 없다. 수신일로 관측 날짜를 만들어 채우지 않는다.
- 운영 피드·실기기·실제 AI 생성 출력·원격 최신 main은 미검증이다. UC 출력 검사에 별도 16시 문장 검출은 추가하지 않았다.
