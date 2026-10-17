# 오늘 볼 것 고래 명목금액 점검 (2026-10-17)

## 결과와 증거의 범위

- 사용자 제공 운영 관측: NVDA, 11/20 만기 $260 콜, 미결제약정 +68,136계약, 표시 명목 $5.29B.
- 검산: `68,136 × 100 × 260 = 1,771,536,000 USD`, 현재 포맷으로 `$1.77B`.
- 운영 읽기 시도: `GET https://www.signumhq.com/api/today-picks?loc=ko`. 이 작업 환경의 curl은 `Could not resolve host`로 실패했다. 별도 공개 URL 읽기도 실패했다. 응답 원문이나 운영 EOD 계약 목록을 확보했다는 의미가 아니다.
- 수정 전 HEAD의 실제 `whatText`를 읽어 실행하고, 종목 합계 입력 `5,290,000,000`과 위 단일 계약 입력을 넣으면 사용자 관측 문장 `$5.29B`가 그대로 나온다. 수정본은 같은 입력으로 `$1.77B`를 낸다.
- 여러 계약을 합쳐 $5.29B가 되는 회귀 입력도 검증했다. 추가 계약·총 OI·세션 날짜는 합성 자료다. **운영 $5.29B의 정확한 원금액과 구성 계약은 미확인**이다(화면 금액은 소수 둘째 자리 반올림이기도 하다).

## 원인과 입력

| 경로 | 확인한 동작 |
|---|---|
| `scripts/intrinio-options-eod.js:374` | 같은 계약의 이전 OI를 조회하고 `oi - before`를 `d`로 저장한다. 이전 값이 없으면 null이다. |
| `src/services/todayPicksService.ts:12`, `:116` | 기존 `intrinio:options:eod` 또는 lastgood 묶음만 읽는다. |
| `src/lib/todayPicks/select.ts:78` | `d`=미결제약정 증가분, `k`=행사가, `oi`=현재 총 OI, `e`=만기. 양의 증가분이며 만기가 마지막 마감 세션 이후인 계약만 고른다. |
| `src/lib/todayPicks/select.ts:80` | 계약별 명목 `n = d × 100 × k`. 승수 100주를 한 번만 곱한다. 현재가나 옵션 프리미엄은 쓰지 않는다. |
| `src/lib/todayPicks/select.ts:81`, `:83`, `:91` | `facts.notional`은 해당 종목의 여러 유효 top 계약 합계. `facts.best.notional`은 가장 큰 단일 계약의 금액. 합계는 선별 점수와 콜 비중 계산에도 사용한다. |
| `src/lib/todayPicks/copy.ts:59` | 문장의 만기·행사가·방향·증가 계약 수는 `best`에서 가져온다. 수정 전 금액만 `facts.notional` 합계를 붙였다. |

확인된 코드 원인은 **단일 계약 설명에 종목 합계를 붙인 범위 혼용**이다. 계산식에 총 OI를 넣거나, 승수를 두 번 곱하거나, 현재가를 쓰는 경로는 아니다. 총 OI는 증가 전후 배수 판정에 사용한다(`select.ts:86`). 운영 원본 미확보로 이 메커니즘이 실제 관측 $5.29B를 구성한 계약까지 확정된 것은 아니다.

## 정의와 수정

표시하는 단일 계약의 «명목»은 `미결제약정 증가 계약 수 × 100주 × 행사가(USD)`다.

기존 근거는 `.agent/product/NEW-POSITIONS-SESSION-ESTIMATE-2026-10-09.md:15`, `.agent/product/WATCHLIST-PLAN-2026-09-29.md:74`, 공개 페이지의 방법 설명 `src/app/[locale]/options-flow/page.tsx:133`이다. Flow 신규 포지션 배너도 같은 식이다(`src/app/[locale]/app-view/flow/page.tsx:843`).

- `copy.ts:63`: 단일 계약 문장의 금액을 `best.notional`로 수정한다. 한국어·영어·일본어 문장 형식, 라벨, 금액 포맷은 유지한다.
- `copy.ts:336`: 기존 저장 문서도 읽을 때 고래 문장만 같은 facts에서 다시 계산한다. 운영 저장소 쓰기나 문서 재생성 없이 기존 잘못된 문장도 교정하는 경로다. AI 해설은 그대로 보존한다.
- `types.ts:21`: 종목 합계와 단일 계약 금액의 용도를 주석으로 구분한다.
- 종목 선별 순서·문턱·콜 비중·만기 필터·날짜·문구·레이아웃은 변경하지 않는다.

## 공용 함수 호출자와 영향

`whatText`의 실제 호출자는 `ruleTexts`, `viewOf`, `src/lib/signals/copy.ts:120-121`이다. `viewOf`의 호출자는 `buildView`다.

| 소비처 | 경로와 영향 | 검증 |
|---|---|---|
| 오늘 볼 것 새 문서 | `todayPicksService.ts:324 → ruleTexts → whatText` | todayPicks |
| 메인 카드·앱 전체보기 | `api/today-picks/route.ts:29 → buildView → viewOf`; 두 화면 모두 `useTodayPicks` | todayPicks의 기존 저장본 API 재생(3개 언어), todayEarningsUi |
| 공개 목록·SEO·공유 문구·OG | `[locale]/today/page.tsx:26`, `today/opengraph-image.tsx:63 → buildView` | todayPicks 연결 검사 |
| 종목별 공유 랜딩·OG | `lib/invite/landing.ts:337 → buildView` | inviteLanding의 기존 잘못된 문장·OG 입력 교정 |
| 이상 신호 푸시 | `lib/signals/copy.ts:121 → whatText` | signals.copy의 콜 단일 계약 금액 3개 언어, signals.detect/run/app |
| 마감 푸시의 오늘 볼 것 한 줄 | `pushPickLine → 저장된 push`; 명목금액을 싣지 않는다 | todayPicks의 기존 푸시 동일성·발송 정책 검사 |
| Flow 신규 배너 | `app-view/flow/page.tsx:843`; 같은 정의이나 별도 계산 | 코드 대조, optionsEodRoute |
| 공개 옵션 Flow·기관 요약 | `services/institutionalFlow.ts:425`, `api/flow/options-eod/route.ts:93`; 같은 정의이나 별도 계산 | 코드 대조, whaleOpeningDate, newPositionEstimate |
| iOS·Android 홈 위젯 | `WidgetData.swift:291`, `WidgetData.java:132`, `widgetBridge.ts`; 시세·옵션 레벨 경로. 오늘 볼 것·명목금액 계산 호출 없음 | 코드 검색, widgetBridge |

## 실행한 검증

무거운 명령과 시험 묶음은 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬 실행했다. 전체 tsc는 한 번만 실행했다. 작업공간에 원본 저장소의 기존 node_modules를 임시 링크해 사용했다. 설치·브라우저·개발 서버·운영 쓰기는 하지 않았다.

- 수정 전 HEAD / 수정본 동일 입력 비교: `$5.29B → $1.77B`, 단일 계약 원금액 `1,771,536,000`, 통과.
- `todayPicks`: 42 통과. NVDA 계산·콜/풋·3개 언어·종목 합계 선별 유지·기존 저장본의 뷰와 API·저장/AI 호출 0 포함.
- `signals.copy`: 18, `signals.detect`: 31, `signals.run`: 23, `signals.app`: 16 통과.
- `inviteLanding`: 41, `todayEarningsUi`: 11, `widgetBridge`: 13 통과.
- `optionsEodRoute`: 6, `whaleOpeningDate`: 5, `newPositionEstimate`: 30 통과.
- 합계 **236개 통과**.
- `tsc --noEmit --incremental false`: 실패 1건. 변경하지 않은 `src/remotion/kit/scripts.ts:5004`가 없는 `./scripts-jpweek`를 import한다(TS2307). HEAD에도 같은 import가 있고 해당 대상 파일은 추적 목록에 없다. 전체 타입검사 통과로 보고하지 않는다.
- `git diff --check`: 통과.

## 남은 확인과 별도 불일치

1. 운영 API 원문·NVDA 저장 facts 또는 원본 EOD가 필요하다. 실제 $5.29B 구성 합계와 운영 응답 교정 여부는 아직 검증하지 못했다. 이 작업에서는 배포·운영 데이터 쓰기·푸시·커밋을 하지 않았다.
2. 기기 로컬에는 이미 받은 표시 문장이 남을 수 있다. `useTodayPicks.ts:18-21,61-87`의 기존 메모리 5분·로컬 36시간 사본은 다음 정상 API 읽기 때 교체된다. 이번 수정은 이 캐시 정책을 바꾸지 않는다.
3. **별도 WHALE 탭 불일치 발견:** 신규 OI 목록은 계약 수를 표시한다(`app-view/flow/page.tsx:4061,4120`). 그 아래 «당일 추적 명목총액»(`:1398,:4175`)은 `whaleSummary.total`의 **프리미엄 합계**(`:1381-1387,:1420-1422`)에 연결되어 있다. 원재료도 거래 프리미엄 또는 `volume × optionPrice × 100`(`:1340,:1356`)이다. 따라서 이 요약은 행사가 기준 명목과 일치하지 않는다. 오늘 볼 것의 `facts.notional/best.notional` 경로와 별도이며, 이번 수정에 포함하지 않았다. 이 화면까지 명목 정의를 통일하려면 합계·구성비·압력 점수의 연결 영향을 함께 검토해야 한다.
