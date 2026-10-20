# 웹 Command 확신도 결측 수리 기록 (2026-10-19)

## 결과 요약

- 작업 브랜치 `fix/web-cmd-defaults`, 시작 HEAD 및 로컬 `origin/main` = `c78d62b8c`. 앱 수리 `71834d70a`가 해당 main에 포함됐음을 merge-base로 확인했다. 원격 fetch는 하지 않았다.
- 원인: 웹 `calculateConviction`은 유효한 관측이 하나도 없어도 50에서 시작해 C·중립을 생성했다. 프리미엄은 `netPremium || 0`으로 읽었으며, 재계산 의존성은 VWAP·실제 표시 가격·프리미엄 관측 계약 수 변경을 놓쳤다. AI snapshot에서도 결측 확신도를 50/C로 다시 만들었다.
- 앱의 N4 판정·가중치·등급 경계를 `commandConviction`으로 추출했다. 앱과 웹 모두 같은 함수를 호출하며 순 프리미엄 관측 여부는 변경하지 않은 `netPremiumOf`로만 판단한다. 웹의 기존 뉴스 가중치는 선택 입력으로 유지했다.
- 웹은 가공된 SMA/structure UI state 대신 원천 응답을 읽는다. 결측 필드는 같은 종목의 직전 정상 입력으로 먼저 채운다. 원천 날짜가 있는 더 오래된 응답은 새 관측을 덮지 못한다. 관측된 0은 정상 갱신한다.
- SSR 정상값으로 최초 결측을 채우고, 브라우저 메모리의 종목별 최근 입력 최대 64개로 페이지 이동 후에도 재사용한다. 누락된 live VWAP이 오래된 SSR 값으로 되돌아가지 않는다. 이력이 전혀 없으면 점수·등급·설명·상태를 —로 표시한다. 칸·라벨·정상 표시·번역 JSON은 유지했다.
- 원천 날짜는 입력별로 유지해 확신도 카드 `data-source-dates`와 날짜 title에 전달한다. 응답 생성 시각·캐시 갱신 시각을 원천 날짜로 쓰지 않는다. 원천이 날짜를 주지 않으면 null이다.
- AI snapshot의 확신도는 결측 시 null/null이다. 관측된 점수 0도 `??`로 보존한다.
- 커밋·push·main 병합·배포·운영 쓰기·브라우저 접근·.env 읽기 없음.

## 호출자와 영향

- 신규 공유 함수 `convictionInputsOf` / `scoreCommandConviction`: 제품 호출자는 앱 `app-view/cmd/page.tsx`와 웹 `LiveTickerDashboard.tsx` 두 곳이다. 앱은 기존 입력/번역 키/출력을 유지하고, 웹은 관측이 없을 때만 기본점수 생성을 중단한다.
- `retainConvictionInputs` / `webConvictionSnapshot`: 웹 확신도 전용이다. 다른 카드의 시세·VWAP·라벨은 변경하지 않는다. 종목 ID가 명시된 다른 종목의 응답은 제외한다.
- 기존 `netPremiumOf` / `normalizeVwap` / `vwapDistancePct`는 변경하지 않았다.
- 웹 확신도 하위 소비처: CONVICTION 카드, 모바일 하위 분석에 전달되는 convictionData, AIDeepAnalysis snapshot. 값이 없으면 null을 유지한다.
- `AIDeepAnalysis`의 확신도 타입만 nullable로 넓혔다. 호출자는 LiveTickerDashboard와 MobileCmdOverview 두 곳이며 모바일의 기존 숫자 입력도 타입에 포함된다. 내부는 snapshot을 그대로 JSON 전달한다. API deep-analysis의 기존 prompt는 null을 N/A로 처리한다. API·모바일 계산식은 변경하지 않았다.

## 바꾼 파일

- `src/lib/commandConviction.ts`: 공유 관측 판정·점수·이력 보존·원천 응답 매핑.
- `src/components/LiveTickerDashboard.tsx`: 공유 함수, 종목별 이전 관측, 원천 날짜, 결측 표시와 AI 입력.
- `src/app/[locale]/app-view/cmd/page.tsx`: 기존 앱 계산식을 공유 함수로 대체. 기존 번역 키 유지.
- `src/components/AIDeepAnalysis.tsx`: 확신도 snapshot 타입 nullable.
- `tests/webCmdMissingScores.test.ts`: 웹 실제 memo/effect/카드/AI snapshot 실행 재현.
- `tests/cmdMissingScores.test.ts`, `tests/vwapConsumers.test.ts`: 기존 AST 실행 시험에 추출한 공유 함수 주입.
- 이 기록 파일.

## 돌린 시험과 결과

- 웹 재현: 최초 9/9 통과. HEAD 실제 계산식에 가격만 입력하면 50/C, 수정본은 null/null 및 카드 —임을 확인했다.
- 정상 입력 972개 조합에서 기존 웹 점수·등급·번역 키와 동일했다. 한국어·영어·일본어 정상 카드 HTML은 날짜 속성을 제외하면 HEAD와 동일했다.
- 웹 최종 9/9 통과. 누락된 live VWAP보다 직전 관측을 우선하는 회귀 사례를 추가해 재실행했다. 해당 사례만 별도로 좁힌 추가 확인도 1/1 통과(나머지 8개 skip)했다. 최종 웹 묶음은 전역 heavy 잠금 해제 후 실행됐다.
- 기존 Command N4 34/34, VWAP 소비처 22/22, 프리미엄 8/8 통과. 기존 묶음은 lockf 아래 한 번 순차 실행했다. 제품 API/Redis/DB/외부 서비스 의존성은 모의 처리했다.
- 변경 범위 타입검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock ./node_modules/.bin/tsc --noEmit --project /tmp/signum-web-cmd-types.json` 한 번 실행, exit 2. 작업트리에 없는 next-env.d.ts를 include에 적어 Next 전역 선언이 로드되지 않았다. CSS 모듈·styled-jsx·RequestInit.next 관련 11개 진단. 변경한 계산/nullable 계약 관련 진단은 없었으나 타입검사 통과를 주장하지 않는다. 반복 실행하지 않았다.
- git diff로 저장 확인 및 diff --check 통과. 신규 파일도 git diff --no-index로 내용 확인했다.
- 타입검사·시험용 node_modules 심볼릭 링크는 마지막에 제거했다. 임시 설정/로그는 /tmp에만 생성했다.

## 남은 위험

- 날짜가 없는 기존 API 필드(일부 SMA/structure 등)의 원천 날짜는 알 수 없다. 해당 필드를 현재 날짜로 위장하지 않으며, 알려진 날짜만 보존한다.
- 이력은 브라우저 메모리이므로 전체 새로고침·프로세스 종료 후에는 SSR/SWR 원천만 사용할 수 있다. 64종목 한도를 넘으면 가장 오래 사용하지 않은 이력을 제거한다. 영속/서버의 정상값 이력 저장소는 이번 범위에서 추가하지 않았다.
- Next 전역 선언을 포함한 유효한 타입검사 통과와 실제 브라우저/기기·운영 데이터·배포 상태 확인은 남았다. 로컬 서버를 실행하지 않았다.
- 확신도 외의 웹 volatility 등 기본점수 경로는 이번 수리 범위에 포함하지 않았다.
