# B5 옵션 표시 게이트 검증 — 2026-10-19

작업 브랜치: `fix/b5-option-gate`. 근거: `SWEEP-CLOSED.md` A절 D05·D14·D15·D19·D25 및 D절 B5.

## 원인과 변경

- D05: 신규 포지션 목록에만 있던 만기 판정이 WHALE 목록에는 없었다. `activeOptionRows`가 기존 `optionExpiryJudge`와 `expired:true`를 함께 검사한다. 정렬·상위 행 선택보다 먼저 적용한다. 만기 문자열은 연도를 유지하고 OCC 계약 코드도 판독한다.
- D14: OPI 초기값 0이 `opi <= 35`를 만족해 결측을 고확신 하방으로 바꿨다. 주간 표본 100계약 이상과 유효한 OI P/C가 있어야 OPI·확신도를 표시한다. 원래 점수식은 유지한다. 실제 OI 비율 0과 결측은 구분한다.
- D15: 종합 점수 결론이 거래량 P/C·순프리미엄과 별도로 출력됐다. 두 관측 근거가 모두 반대면 기존 혼조 표현 또는 `—`를 사용한다. 앱의 기존 순프리미엄 계산 폴백은 이 모순 검사의 관측 근거로 사용하지 않는다.
- D19: 월간 만기 새 문구(3개 언어)는 6차 관문 지적·대표 규칙(화면 문구 변경은 대표 지시 때만)에 따라 되돌렸다. STRIKE 안내는 기존 문구 그대로이고, 직전 세션 보관 목록일 때만 원천 날짜 표식(예: 2026-10-16 · )을 앞에 붙인다(대표 10/19 «직전 실제 값+날짜»).
- D25: 장외 호가도 유효성 검사만 통과하면 NBBO에 들어갔다. bid/ask로 스프레드를 직접 계산해 REG 외 세션에서 5% 초과를 제외한다. Command 차트 축은 캔들 고저만 사용하며, 호가가 범위에 들어가지 않는 것을 시험한다.
- 표본 상태가 바뀌거나 종목이 바뀐 뒤 늦게 도착하는 AI 응답은 무효화한다. 웹 AI 영역은 유지하고 기존 결측 표현을 표시한다.

## 공용 함수 호출자와 영향

`src/lib/marketCalendar.ts` 자체는 수정하지 않았다. 추가한 게이트의 호출자는 다음과 같다.

| 함수 | 호출 경로 | 영향 |
|---|---|---|
| `activeOptionRows` | 앱 Flow rawChain·신규 포지션·체결 목록·이상 옵션 활동 | 만기 지난 행 제외, 관련 개수도 같은 집합 사용 |
| `activeOptionRows` | 웹 FlowRadar rawChain·allExpiryChain·REST 고래·WS 체결 | 웹 목록과 스트라이크 입력도 같은 경계 사용 |
| `activeOptionRows` | 공개 홈 TickerDrawer ATM 계약 표 | 표시 전에 만기 판정 |
| `optionSampleReady`·`displayOpi` | 앱 Flow | 표본 부족 시 OPI·확신도·HIGH CONVICTION을 기존 `—`로 표시 |
| `optionChainSampleReady` | 웹 FlowRadar | 가장 가까운 만기 표본으로만 판정, 먼 만기 거래량으로 하한 충족 금지 |
| `optionConclusion` | 앱 Flow·웹 FlowRadar | P/C와 원천 순프리미엄이 함께 반대일 때 방향 결론 제한 |
| `sessionOptionRows` | 공개 options-flow 계약 표·OG·단일 계약 설명 | 그 목록의 세션 시점으로 만기 판정 → 세션 합계와 표 일치(마감 뒤에도 비지 않음) |
| `displayQuote` | Command CandleChart·공용 StockChart | 장외 과대 스프레드 NBBO 제외 |

공용 StockChart 호출자는 LiveTickerDashboard·DashboardClient·MobileDashboardPage·MobileCmdChart다. 이 중 NBBO를 전달하는 LiveTickerDashboard에 실제 세션 전달을 추가했다. 나머지 호출자는 NBBO를 전달하지 않는다. FlowAIAnalysis의 호출자는 FlowRadar 한 곳이며 표본 게이트를 함께 전달한다.

옵션 합계 정의·세션 생산자·Command 점수 산식·다른 진행 브랜치의 결측/표시 함수는 변경하지 않았다. 계약 목록을 필터링하는 공개 페이지의 세션별 종목 합계는 원래 집계 정의를 유지한다.

## 시험

`tests/optionDisplayGate.test.ts`는 실제 페이지 선언식과 AI 비동기 함수를 추출해 오프라인 실행한다.

- AAPL 만기 지난 8행, cached `expired:false`, OCC 코드 경로.
- 15:59/16:00, 조기폐장 12:59/13:00, 휴일·주말·DST 경계.
- WTFC C8/P5와 OI 결측, 99/100계약 경계, 유효한 0과 NaN·무한대 구분.
- AAPL P/C 1.55와 음수 순프리미엄에 상방 결론이 붙는 경우, 반대 방향의 대칭 검사.
- 만기 종류와 관계없이 STRIKE 기존 문구 유지(월간 새 문구 없음).
- WTFC/MSFT 장외 과대 호가, 정확히 5%/5% 초과, REG 정상 통과, 캔들 축 독립성.
- 앱/웹/홈 계약 목록, 실제 차트 세션 전달, 표본 변경 후 AI 지연 응답 무효화.
- 변경한 TSX 파싱·트랜스파일.

전체 타입 검사와 관련 시험 묶음은 각각 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 순차 실행했다.

| 검사 | 결과 |
|---|---|
| `tsc --noEmit --incremental false --pretty false` | 종료 0, 진단 없음. 전체 검사 1회 실행 |
| `optionDisplayGate.test.ts` | 13/13 통과 |
| `optionExpiry.test.ts` | 18/18 통과 |
| `flowIntegrity2.test.ts` | 33/33 통과 |
| `flowWhaleIntraday.test.ts` | 6/6 통과 |
| `flowPcRatio.test.ts` | 13/13 통과 |
| `flowEmptyStates.test.ts` | 첫 6개 검사 통과 후 로컬 HTTP 서버의 `listen EPERM 127.0.0.1`로 중단. 완주로 세지 않음 |
| `git diff --check` | 통과 |

완주한 5개 시험 묶음은 총 83개 검사 통과. 마지막 웹 혼조 분기 보완 후 B5 단일 시험 13/13과 변경 TSX 파싱도 다시 통과했다. 전체 타입 검사나 대형 시험 묶음은 반복하지 않았다.

## 바꾼 파일

- 공용 게이트: `src/lib/optionDisplayGate.ts` (신규).
- 앱: `src/app/[locale]/app-view/flow/page.tsx`, `src/app/[locale]/app-view/cmd/page.tsx`.
- 공개 목록: `src/app/[locale]/(home)/page.tsx`, `src/app/[locale]/options-flow/page.tsx`.
- 공용 컴포넌트: `src/components/FlowRadar.tsx`, `src/components/FlowAIAnalysis.tsx`, `src/components/StockChart.tsx`, `src/components/LiveTickerDashboard.tsx`.
- 시험: `tests/optionDisplayGate.test.ts` (신규), `tests/flowIntegrity2.test.ts`, `tests/flowWhaleIntraday.test.ts` (기존 VM 시험에 게이트 주입).
- 검증 기록: 이 문서 (신규).

## 6차 관문(10/19 17:22) 수리

- 웹 FlowRadar: «No Flow Data Available» 은 원천 rawChain 자체가 빌 때만(기존 동작). 만기 게이트·복구가 아무 것도 못 남기면 옵션 칸만 결측(기존 «No Options Data»·«—», AI 차단)이고 다크풀 등 다른 카드는 그대로 그린다.
- 공개 options-flow: 과거 세션 신규 포지션 표·OG·첫 설명은 그 세션 시점으로 만기를 판정한다(`sessionOptionRows`). 날짜가 없거나 미래·무효면 현재 시각 경계로 되돌아간다.
- 시험: `optionGateRegression.test.ts` 에 6차 재현 2건(FlowRadar 실제 서버 렌더 포함). 수리 전 실패·수리 후 통과 확인.

## 확인 범위와 남은 위험

- 브라우저·운영 API 접근, 운영 데이터 쓰기, `.env*` 읽기, 커밋·push·병합·배포는 하지 않았다.
- 화면 실측은 하지 않았다. 저장된 감사의 재현값과 코드 실행 시험으로 검증한다.
- 날짜와 OCC 코드가 모두 없는 계약은 기존 `optionExpiryJudge`와 같이 만기를 단정하지 않는다.
- 달력의 휴장 데이터 범위를 넘어서는 미래 만기 판정은 달력 갱신에 의존한다.
