# AI 딥 분석 재료 결측 수리 — 2026-10-19

## 원인과 변경

- `deepSnapshot` 및 웹·모바일의 중복 조립기가 없는 alpha를 context `0/C`, conviction `50/C`로 채웠다. 구조·재무·애널리스트·변동성에도 `0`, `LOW`, `NORMAL`, `CALM` 자리표가 있었다.
- 프롬프트의 `||`는 관측된 0을 N/A로 바꾸고, squeeze 결측에는 다시 0%를 넣었다.
- 앱 Command의 기존 점수식을 `src/lib/commandScores.ts`로 추출했다. 가중치·등급·번역 키는 그대로이며, 앱 화면과 AI가 같은 함수와 `netPremiumOf`를 사용한다.
- 값 선택은 관측값 → 원천 날짜가 있는 직전 정상값 → null이다. `sources[path]`에 `asOf`, `historical`을 싣고 프롬프트에 과거 값의 날짜를 인용하도록 명시한다. null은 숫자 자리표 목록에 포함되지 않는다.
- 응답 수신용 `timestamp`, `_ts`를 원천 날짜로 추정하지 않는다. 명시된 `asOf`·`sourceDate`·`dataDate`·`date`, 생산자의 `dataFreshness.chainDate`·`chainDate`만 사용한다.
- 점수와 등급의 원천 날짜가 다르면 등급을 재사용하지 않는다. 전부 null인 그룹은 재료 완결 게이트의 관측 그룹으로 세지 않는다.

## 공유 함수 호출자와 영향

| 함수 | 제품 호출자 | 영향·시험 |
|---|---|---|
| `commandScores` | 앱 `app-view/cmd/page.tsx`, `deepSnapshot` | 기존 화면 점수식을 공유한다. `cmdMissingScores`, `vwapConsumers`, WTFC/FITB 재현으로 값·등급·번역·관측 0을 확인한다. |
| `buildDeepSnapshot` | 앱 Command, `deepWarmService`, `LiveTickerDashboard`, `MobileCmdOverview` | 네 경로의 AI 재료에 같은 결측 판정을 적용한다. 웹·모바일의 기존 신뢰/캐시 경로는 `trustLayer: 0`으로 유지한다. `deepWarm`, `cmdMissingScores`, `vwapConsumers`, 신규 재현 시험으로 확인한다. |
| `deepMetricXml` | `api/command/deep-analysis` | 점수·구조 XML만 추출했다. 결측 N/A, 관측 0, 원천 날짜 전달을 신규 재현 및 기존 프리미엄 시험으로 확인한다. |
| `deepMaterialIssues` | deep-analysis 입구 및 기존 게이트 | 실제 관측이 있는 그룹만 센다. 기존 `deepTrust`, `deepWarm`과 신규 결측 시험으로 확인한다. |
| `flowTokensFromDeepSnapshot` | `deepTrust` 재수출 → deep-analysis 입구 | null은 제외하고 관측된 PC 0을 보존한다. `deepTrust`, `deepNumbers`, 신규 재현 및 프리미엄 시험으로 확인한다. Flow 화면용 `flowTokensFromFlowData`는 무변경이다. |

`netPremiumOf`, `computeGexStats`, 화면 라벨·문구·JSX 배치는 변경하지 않았다. `AIDeepAnalysis`는 nullable 재료 타입만 변경했다.

## 픽스처와 검증 범위

- `fixtures/ai-material/WTFC.json`, `FITB.json`은 운영 검증 보고서의 `raw/snap-new-*-FIRST_VIEW.json`에서 snapshot 블록만 복사한 공개 시장 데이터다. 헤더·인증 정보는 없다.
- 당시 upstream 원응답은 확보되지 않았다. 시험 입력은 저장 재료에서 확인 가능한 SMA·GEX·가격·플로 등을 복원하며, 없는 alpha·smartFlow는 보충하지 않는다. 관측 증거 없는 옛 PC 0과 하드코딩된 FCF 0도 원천 값으로 취급하지 않는다. 이 재현에서 기존 Command 식의 확신도는 WTFC 70/B+, FITB 60/B다.
- 신규 시험은 전부 결측, 관측 0, 비정상 숫자, 실패 구조, 날짜 있는 이력, 반복 결측 시 날짜 유지, 새 점수/옛 등급 혼합 금지, 티커 분리, 날짜 없는 값 재사용 금지, 애널리스트 빈 집계와 실제 breakdown을 포함한다.

## 시험 결과

모든 실행은 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 감쌌다. 다른 작업의 잠금은 해제하거나 변경하지 않았다.

| 시험 | 결과 |
|---|---:|
| `aiMaterialDefaults` | 11건 통과 |
| `cmdMissingScores` | 34건 통과 |
| `vwapConsumers` | 22건 통과 |
| `deepWarm` | 12건 통과 |
| `deepTrust` | 13건 통과 |
| `deepNumbers` | 6건 통과 |
| `flowIntegrity2` | 33건 통과 |
| `flowPcRatio` | 13건 통과 |
| `appCmdNetPremiumLabel` | 2건 통과 |
| 합계 | 146건 통과 |
| `tsc --noEmit --incremental false --pretty false` | exit 0, 진단 0건. 전체 타입 검사는 1회만 실행 |

첫 기존 회귀 실행에서 공통 함수로 이동한 프리미엄 호출부를 찾지 못한 시험의 추출 위치를 수정했다. 이후 실행의 실패 2건은 시험 코드의 `B+` 정규식 처리와 공유 함수로 이동한 번역 키 수집 문제였다. 제품 로직은 전체 타입 검사 통과 이후 변경하지 않았다(최종 공백 검사에서 XML 템플릿의 빈 줄 공백만 정리했다). 실패했던 두 시험과 보강한 WTFC/FITB 픽스처만 선택 재검했고 모두 통과했다. 전체 타입 검사와 이미 통과한 대형 시험 묶음은 반복하지 않았다.

실행 로그: `/tmp/signum-ai-material-checks/*.log`, `/tmp/signum-ai-material-recheck.log`, `/tmp/signum-ai-material-fixtures-final.log`, `/tmp/signum-ai-material-tsc.log`.

## 바꾼 파일

- 재료·계산·프롬프트: `src/lib/ai/deepSnapshot.ts`, `src/lib/commandScores.ts`, `src/lib/ai/deepMaterialPrompt.ts`, `src/lib/ai/deepTrust.ts`, `src/lib/ai/flowTokens.ts`.
- 호출부·타입: `src/app/[locale]/app-view/cmd/page.tsx`, `src/app/api/command/deep-analysis/route.ts`, `src/components/LiveTickerDashboard.tsx`, `src/components/intel/mobile/MobileCmdOverview.tsx`, `src/components/AIDeepAnalysis.tsx`.
- 시험·기록: `tests/aiMaterialDefaults.test.ts`, `tests/cmdMissingScores.test.ts`, `tests/vwapConsumers.test.ts`, `tests/fixtures/ai-material/WTFC.json`, `tests/fixtures/ai-material/FITB.json`, 이 문서.

## 제한

- 직전 정상값은 프로세스/브라우저 세션 메모리에 최대 100종목만 보관한다. 재시작·새 서버 인스턴스·메모리 퇴출 뒤에는 이력이 없어 null이 된다. 원천 날짜 없는 값도 이력으로 재사용하지 않는다.
- 운영 API·브라우저·모델 생성은 실행하지 않았다. 기존 AI 분석 캐시의 삭제·재생성도 하지 않았다.
- 커밋·push·병합·배포·운영 데이터 쓰기를 하지 않았다.

## 관문 10191257 후속 수리

- 웹 스퀴즈: `effectiveVol`은 GEX만 있어도 화면용 `squeezeScore: 0`, `squeezeRisk: LOW`를 만든다. 웹 AI 조립부가 이 객체 대신 생산자 `volatility`를 전달하도록 바꿨다. 화면 계산식·JSX·라벨은 그대로다. 결측은 기존 공통 조립기의 날짜 있는 직전 관측값 → null 경로를 따른다.
- 감마 집중도: 생산자는 OI 분모를 `debug.todayOI`에 내보내지만 소비자는 없는 최상위 합계 두 개만 요구했다. 정상 양수는 그대로 전달하고, 관측된 0은 `debug.todayOI` 또는 기존 합계로 실제 OI가 확인될 때 보존한다. OI 없는 생산자 자리표 0은 계속 결측이다.
- 모바일: 캐시 탐색 요청 뒤 재료가 완결되면 한 번 재요청한다. 서버와 같은 `deepMaterialIssues` 판정을 사용하며, 시세 갱신·재료 준비 여부 반복 변화는 추가 생성 요청을 만들지 않는다. 종목/언어 변경·해제 시 요청을 취소하고 늦은 응답을 무시한다. StrictMode의 effect 재실행도 복구한다.

공유 함수 `buildDeepSnapshot`의 제품 호출자는 앱 `app-view/cmd/page.tsx`, 웹 `LiveTickerDashboard`, 모바일 `MobileCmdOverview`, 서버 `deepWarmService`의 4곳이다. 감마 집중도 수리는 네 경로 모두에 적용된다. 웹만 원본 변동성 입력으로 교체하며, 앱·예열은 원래 생산자 unified를 전달한다. `deepMaterialIssues` 함수 자체는 바꾸지 않았고 모바일에서 같은 준비 판정을 재사용한다.

추가 시험 `aiMaterialDefaultsFollowup`은 실제 웹 `effectiveVol`·AI 조립 호출 및 모바일 JSX 이전 훅을 추출해 오프라인으로 실행한다. 스퀴즈 결측/날짜 있는 이력/관측 0, 생산자 모양 감마 집중도, 모바일 422 뒤 재요청/반복 요청 차단/StrictMode/종목 전환 뒤 늦은 응답을 검증한다. fetch는 모의 응답이며 브라우저·운영 API에 접근하지 않는다.

후속 실행 결과(모두 공용 `lockf`로 직렬 실행):

| 시험 | 결과 |
|---|---:|
| `aiMaterialDefaultsFollowup` | 6건 통과 |
| `aiMaterialDefaults` | 11건 통과 |
| `cmdMissingScores` | 34건 통과 |
| `vwapConsumers` | 22건 통과 |
| `deepWarm` | 12건 통과 |
| `deepTrust` | 13건 통과 |
| 합계 | 98건 통과 |
| `tsc --noEmit --incremental false --pretty false` | 1회 실행, exit 0, 진단 0건 |

최초 시험 명령은 작업공간의 `.bin/ts-node` 실행 링크가 없어 본문 실행 전에 실패했다. 설치된 모듈을 `node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/<suite>.test.ts`로 직접 호출해 위 결과를 얻었다. 통과한 묶음과 전체 타입 검사는 반복하지 않았다. 변경분 공백 검사도 통과했다.

후속 로그는 `/tmp/signum-ai-material-followup-<suite>.log`, `/tmp/signum-ai-material-followup-tsc.log`다. 제품 3개 파일, 추가 재현 시험, 이 기록만 변경했다. 브라우저·실기기·운영 API 검증과 기존 분석 캐시 정리는 수행하지 않았다. 날짜 있는 이력의 세션/프로세스 메모리 제한은 그대로다. 커밋·push·병합·배포·운영 데이터 쓰기는 하지 않았다.

## 관문 10191458 웹 422 후속 수리

원인: `LiveTickerDashboard`는 가격이 먼저 도착한 상태에서도 `AIDeepAnalysis`를 마운트한다. 캐시 미스와 관측 그룹 부족이 겹치면 서버는 `422 / insufficient_snapshot`을 반환한다. 기존 컴포넌트는 이를 일반 오류에 넣고, 최초 요청 효과가 `[ticker]`에만 의존하므로 나중에 채워진 snapshot으로 요청하지 않았다.

- `AIDeepAnalysis`에서 해당 상태/오류 코드만 재료 대기로 기록한다. `deepMaterialIssues`에 웹 라우트와 같이 `materialPhase: 'complete'`를 적용해 관측 그룹과 가격을 확인한다. 공유 판정 함수 본문은 변경하지 않았다.
- 최초 422 응답 시점부터 최소 5초를 두고, 재료가 준비되면 최신 snapshot으로 `FIRST_VIEW`를 종목 조회당 최대 1회 자동 재요청한다. 시세 갱신·준비 여부 반복 변화·수동 요청은 이 자동 재시도 예산을 초기화하지 않는다. 종목 전환 시 새 예산을 부여한다.
- 재시도 응답이 다시 422이거나 fallback이어도 추가 복구 요청을 만들지 않는다. 다른 422, 429, 500, 네트워크 오류는 재료 재시도를 예약하지 않는다. 정상 응답 이후 기존 정기/가격/감마 갱신은 유지한다.
- 종목 전환·해제·재료 준비 해제 시 예약을 취소한다. 요청마다 지역 AbortController를 보관해 이전 응답 및 finally가 새 종목 분석·로딩 잠금을 덮어쓰지 못하게 한다. 종목 전환 시 가격/감마 갱신 기준도 초기화한다.

제품 호출자는 `LiveTickerDashboard`의 `<AIDeepAnalysis>` 한 곳이다. 호출부·snapshot 조립·서버·모바일·공유 함수 본문과 화면 JSX/문구는 변경하지 않았다. 기존 `deepMaterialIssues`의 제품 호출자는 deep-analysis 라우트와 모바일 `MobileCmdOverview`이며 이번에 웹 `AIDeepAnalysis`가 추가된다.

`tests/aiMaterialWebRetry.test.ts`는 실제 컴포넌트의 JSX 이전 훅을 추출해 모의 React 스케줄링·시간·fetch로 실행한다. 422 뒤 정상 복구·5초 백오프·최신 재료, 응답보다 빠른 재료 도착, 재료 지연/준비 해제, 반복 422 상한과 수동 요청, 다른 오류 배제, 캐시/최초 정상 재료, 기존 정기/가격 갱신, fallback 추가 요청 차단, 종목 전환/해제, 늦은 응답/finally, StrictMode를 검증한다. 브라우저와 운영 API에는 접근하지 않는다.

### 실행 검증 보류 — Claude 운영 세션 인계

- 확인 완료: 제품/기록 diff, 신규 시험 파일의 디스크 저장(diff), `git diff --check`, HEAD 대비 표시용 helper 및 전체 JSX 동일성.
- 미실행: 신규 재현 14건, 수정 전 훅의 결함 재현, 기존 `aiMaterialDefaults` 11건·`aiMaterialDefaultsFollowup` 6건·`deepTrust` 13건, 전체 타입 검사. 통과 결과가 아니다.
- 원인: `/tmp/signum-heavy.lock`을 다른 작업(`fix-b1a-fake-index`, PID 2068)이 보유했다. 2026-10-19 15:58경부터 16:12 이후까지 대기했고 신규 시험 로그는 0바이트였다. 다른 작업의 프로세스와 잠금 파일은 변경하지 않았다. 이 작업이 만든 잠금 대기 프로세스 2개만 종료했다.
- `.agents/AGENTS.md`의 전체 타입 검사 요구도 아직 충족하지 못했다. 브라우저·운영 API·실기기 검증, 커밋·push·병합·배포는 하지 않았다.

잠금이 정상적으로 풀린 뒤, 현재 작업공간에서 아래 두 명령을 순차 실행한다. 두 번째 스크립트는 HEAD의 수정 전 훅으로 의도된 실패를 재현하고 기존 회귀 3묶음과 전체 타입 검사를 직렬 실행한다. 수정 전 소스와 실행 스크립트는 각각 `/tmp/signum-web-ai-before.tsx`, `/tmp/signum-web-ai-validation.sh`에 준비했다. 성공한 무거운 명령을 반복 실행하지 않는다.

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/aiMaterialWebRetry.test.ts
/usr/bin/lockf -k /tmp/signum-heavy.lock sh /tmp/signum-web-ai-validation.sh
```

로그 경로는 `/tmp/signum-web-ai-retry.log`, `/tmp/signum-web-ai-baseline.log`, `/tmp/signum-web-ai-<suite>.log`, `/tmp/signum-web-ai-tsc.log`다. 이 기록 시점에는 재현/회귀/타입 검사 본문이 시작되지 않았다.
