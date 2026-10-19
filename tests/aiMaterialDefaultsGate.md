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
