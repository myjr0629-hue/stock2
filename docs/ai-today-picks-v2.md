# 오늘 볼 것 v2 인계

기준 브랜치 `feat/ai-today-picks-v2`, 기준 SHA `0b6afec9ffbaeac3844b8ff7874bc20cc06bdc29`. 운영 병합·커밋·배포·운영 저장소 쓰기·실모델 호출은 수행하지 않는다.

확인한 원인: 기존 시스템의 한 절·38/38/70자 지시와 더 긴 복문 예시가 충돌한다. `angleHint`는 입력에 없는 평소 거래 규모 비교, 8% 이상을 역사적 기준 없이 이례적이라고 해석, Max Pain으로의 이동을 요구한다. 프리 배경 전체를 붙이면 날짜가 다른 옵션과 현재 시세·뉴스가 한 원인처럼 읽힐 여지도 있다(후자는 설계상 위험이며 이번 운영 출력 측정값이 아님).

새 계약은 `todayPicksV2.ts`에 격리했다. 기존 숫자 행이 무엇·얼마나·자료 날짜를 담당하고 AI 줄은 이번 사례의 차이와 기전을 연결한다. 두 짧은 절을 허용하고 요청 길이는 46/100/46자, 기존 검사 상한은 56/120/56자 그대로다. 화면·라벨·배치·종류 선별·저장 키·규칙 대체문은 변경하지 않는다.

고래는 거래 회전과 남아 있는 계약을 구분하고, 기존 OI가 실제 0인 경우만 신설 계약으로 읽는다. 다크풀은 자기 거래량 평균과 시장 전체 비중 평균을 구분한다. Gamma Flip은 조건별 완충/증폭 구조와 관측된 현재 쪽을 분리한다. Max Pain은 만기 지급액 기준으로 설명하며 실제 가격 경로를 지어내지 않는다. 실적은 반영된 움직임 크기와 방향을 구분한다. 자료 날짜는 기존 사실에서 보존한다. 감마 가격의 별도 시각·세션이 입력에 없다는 점을 명시해 체인 날짜와 혼동하지 않게 한다. 시간외 배경은 생성 세션·직전 정규장 달력 날짜만 사용하고 개별 옵션 원인에 뉴스·선물 숫자를 넣지 않는다. 외부 출처명·지연 표기는 새 생성 출구에서 막는다.

`checkPickV2Why`는 원문 전체에 기존 숫자·금액·길이·언어·권유·예측 검사를 먼저 적용한다. 인식한 올바른 조건별 감마 절만 현재 쪽 검사에서 분리하고 남은 현재 위치·기전 주장은 다시 검사한다. 문장 수·접속사·쉬운 이름 같은 문체 형식을 새 탈락 사유로 강제하지 않는다. pinning 같은 단어 자체는 새로운 탈락 조건으로 만들지 않는다. 출구가 모든 자연어 인과의 진위를 증명하지는 못한다.

생성 서비스의 validate 콜백과 최종 검사만 새 계약을 쓴다. 저장본의 `readPicks → buildView/viewOf`와 기존 정정·대체 경로는 변경하지 않는다. 새 형식이 아니라는 이유로 정상 저장본을 비우지 않는다. 고래·다크풀 이상 신호 푸시는 기존 `TP_SYSTEM/buildPickUserPrompt/checkPickWhy`를 유지한다. 공유 함수의 동작 변경은 없다.

호출자 확인: `todayPicksLine`은 `todayPicksService`, `signalLine`(고래·다크풀·SIG_SYSTEM 규칙 추출), `econEventLine`(공용 상수), `todayPicks/view`(푸시 검사)가 쓴다. 이중 서비스의 새 생성만 전환한다. `copy`의 `factsForAi/angleHint/MEANING`과 `preMarketContext`는 기존 호출자에서 그대로 유지한다. `signals.copy`, `signals.run`, `todaySummaryEcon`, `todayPageSummary`, `adviceGuard`, `todayPicks` 회귀 시험 대상이다.

Claude 운영 세션에서 비교 도구를 실행한다. 인증은 프로세스 환경으로 주입하며 .env를 읽지 않는다. API 라우트와 runPicks는 생성·쓰기 부작용 때문에 호출하지 않는다.

```sh
# 기존 실제 모델 시험 fixture 오프라인 재생
node scripts/today-picks-v2-compare.cjs --out /tmp/today-picks-v2-offline.md
# 기존 운영 저장본 파일 재검사
node scripts/today-picks-v2-compare.cjs --snapshot /path/to/today-picks.json --out /tmp/today-picks-v2-stored.md
# 운영 Redis GET 한 번 + 동일 입력 옛/새 각 3회·3언어
node scripts/today-picks-v2-compare.cjs --redis --live --out /tmp/today-picks-v2-live.md --capture /tmp/today-picks-v2-live.json
```

실모델 비교는 운영과 같은 크레딧 Haiku 5.5에 같은 날짜 앵커·금융 용어 지시를 붙여 직접 요청하고, 토큰 제한 잘림도 구분한다. 모델 요청 외 Redis/DB/계측 쓰기·AWS 대체·자동 재시도는 없다. 첫 응답의 언어별 통과율과 세 언어 동시 통과 항목 수를 분리한다. 저장본의 옛/새 재검사는 같은 기존 검사이며 새 생성 검사는 진단 열로만 표시한다. 모의 결과를 실모델 성적으로 합치지 않는다. 운영 최종 재시도 뒤 대체율은 별도 운영 관측이 필요하다.

실제 fixture 기준 문장 예시는 아래와 같다. 왼쪽은 현행 코드의 규칙 대체문을 같은 AMZN 사실에 적용한 결과, 오른쪽은 기존 실제 Haiku 5.5 시험 출력 중 새 계약에도 통과하는 문장이다. 합성 문장이 아니며, 이번 v2 실모델 생성 결과나 이번에 조회한 운영 화면 문장이라는 뜻은 아니다.

| 언어 | 현행 규칙 대체문 | 새 계약 통과 예(기존 실모델 fixture 재생) |
|---|---|---|
| ko | 딜러 헤지 방향이 바뀌는 경계 가까이에 있습니다 | Gamma Flip 아래라 딜러 헤지가 움직임을 키우는 쪽입니다 |
| en | Sitting near the line where dealer hedging flips | Below Gamma Flip, where dealer hedging tends to amplify moves |
| ja | ディーラーのヘッジ方向が切り替わる境目の近くです | Gamma Flipの下で、ディーラーのヘッジが値動きを増幅する側です |

새 프롬프트의 실제 품질·오탈락률은 Claude의 운영 입력/실모델 비교까지 미측정이다. 이 비교를 통과하기 전 운영 반영을 판단하지 않는다.

검증: 1차 관련 오프라인 시험 8개 모두 통과(`todayPicks`, `todayPicksV2`, `todayPicksV2Compare`, `signals.copy`, `signals.run`, `todayPageSummary`, `todaySummaryEcon`, `adviceGuard`). 기존 실제 모델 fixture 7벌/21언어 행은 옛 검사·새 저장본 계약·새 생성 검사 모두 탈락 0건이다. 실모델 인증 환경 미주입을 값 출력 없이 확인했다. 전체 회귀·tsc 결과는 아래 최종 검증에 기록한다.

최종 검증: `run-offline-tests.cjs` 295/295개 통과, 실패 0개. 지정된 `earningsScenario.test.cjs`, `giftShareGate.test.ts`, `readCheck.test.cjs`만 제외했다(`readCheckSeo.test.cjs` 포함 통과). 결과는 `.logs/ux-gate/recheck.json`과 개별 시험 로그에 있다. `node node_modules/typescript/bin/tsc --noEmit --incremental false` 종료 코드 0, 오류 0건. 전체 회귀·tsc는 각각 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 감싸 순차 실행했다. 비교 스크립트의 운영/실모델 실행은 수행하지 않았고 코드·모의 시험만 검증했다. 화면 관련 파일 변경은 없다.

변경 파일 9개:

- `src/lib/ai/todayPicksV2.ts`
- `src/services/todayPicksService.ts`
- `scripts/today-picks-v2-compare.cjs`
- `tests/todayPicks.test.ts`
- `tests/todayPicksV2.test.ts`
- `tests/todayPicksV2Compare.test.cjs`
- `tests/fixtures/today-picks-v2/existing-model.json`
- `tests/fixtures/today-picks-v2/README.md`
- `docs/ai-today-picks-v2.md`
