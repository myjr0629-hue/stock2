# NB4·NB6·NB7 검증 기록 (실적 변동폭 제외)

## 결과 요약

- 작업공간 `fix/p1-ai-whale-blanks`. 최초 HEAD와 로컬 origin/main 모두 `1b31b0a894206b52accaa05b8569dd86463809a7`로 확인했다. 소스·시험의 초기 추적 변경 없음.
- 별도 브랜치 생성 시도는 공용 Git 메타데이터의 index.lock 쓰기 권한 오류로 거절됐다. 제공된 신규 작업 브랜치에서 수정했으며 커밋하지 않았다. origin/main 원격 최신 여부는 조회하지 않았다.
- 판정표 SWEEP-LIVE.md NB4·NB6·NB7과 이전 관문 3개 원문을 확인했다. 관문의 계산 결함 6건은 모두 제외 범위인 실적 변동폭이다. 관련 서비스·옵션 가격·잠금·실적 변동폭 시험은 수정하지 않는다.
- 앱 전용 화면의 숫자 형식·AI 확신도·실제 고래 집계 날짜와 미리보기 금액을 수정한다. 아래 미해결 행이 있어 전체 완료 판정은 아니다.

| 행 | 원인·처리 |
|---|---|
| L06 EPS | 부호를 달러 뒤에 직접 붙임 → `−$0.24`. 반올림된 음수 0 제거. 브리프 검사기에 Unicode 부호 지원을 함께 적용하고 이전 ASCII 형식도 수용한다. |
| L30 순 프리미엄 | Flow·Command 히어로와 Flow 본문의 직접 포맷 → 공용 부호·자동 단위 형식. 값·계산·고정 라벨은 유지한다. |
| L31 고래 프리미엄 | 고정 K → K/M/B 자동 단위. $17,055,844 → `$17.1M`. |
| L32 IV 스큐 | 이미 계산된 풋IV/콜IV 비율에 %를 붙임 → `0.99×`. 지표명은 유지한다. |
| L33 총 프리미엄 | M 고정으로 소액이 0.0M → 실제 WTFC 저장값 `$3.5K`. |
| L41 최근 5일 | 반올림 전 부호 → 반올림된 0은 `0.0%`. 주간 합계도 같은 숫자 형식을 쓴다. |
| L38 확신도 | 모바일은 원천 enum 대신 점만 표시 → HIGH/MEDIUM/LOW 실제 값을 연결한다. 값이 없으면 LOW로 단정하지 않고 점 0개·결측을 유지한다. `NEUTRAL · —`의 대시는 문장 구분자라 변경하지 않는다. |
| L16 날짜·미리보기 | EOD 행에 체결 시각이 없어 빈칸 → 원래 집계 세션 날짜. EOD 미리보기의 빈 금액 → 동일 계약 배열의 총 거래대금. 실제 체결 응답의 미리보기 최대값은 유지한다(이전 관문의 장중 최대값→총액 표시 변경 방지). |
| L15 최대 체결 | **미해결.** sessionAggregate는 개별 체결이 아닌 계약별 일일 거래대금이다. 10개 원본 모두 개별 체결 items가 비어 있어 직전 실제 최대 체결 값도 확인할 수 없다. 내부자 금액이나 일일 거래대금을 최대 체결로 넣지 않는다. |
| L16 BID/ASK | **미해결.** 저장 사본에 실제 방향·직전 방향이 없다. 종가 호가·콜/풋 유형으로 매매 방향을 추정하지 않는다. 칸은 그대로 유지한다. |
| L25·L35 | RSI 구간명·월간/주간 만기 문구는 라벨 변경 금지로 미변경. |
| L42 | 하락 비율은 보합을 포함하는 계산 정의 문제다. 이번의 ‘같은 의미 숫자 형식만’ 범위를 넘어 수정하지 않았다. |

## 바꾼 파일·공유 함수 호출자

- 앱 전용 Flow·Command, App5DayTape, lib/app/displayNumbers.ts(신규), premiumFlow.ts, earningsBrief.ts.
- `fmtPremiumM`: 운영 호출자는 앱 Flow 총 프리미엄 한 곳. `totalPremiumOf`의 정의·검증은 유지하며 표시 단위만 변경한다.
- `fmtEpsUsd`: 앱 실적 표의 fmtEps 별칭, earningsBrief 내부 자리표·검사 메시지, lib/invite/landing.ts 실적 근거. 음수 부호만 바뀌며 브리프 숫자 검사를 함께 보완한다. 실적 변동폭 계산·만기 선택에는 영향이 없다.
- 숫자 파서 영향 경로: `briefFigures` → 내부 `checkBriefNumbers`·`briefDraftOk`·`attachBriefs`. 운영 외부 호출자는 earnings-brief cron의 초안 검사, market/earnings-calendar 라우트의 응답 부착, invite/landing의 실적 카드 부착이다. earningsBrief 시험이 cron·라우트·부착 경로를, inviteLanding 시험이 공유 카드 경로를 검사한다.
- `compactUsd`: 앱 Flow 히어로·본문·고래 금액, Command 히어로, fmtPremiumM. `signedPercent`: App5DayTape 일별·합계. `ivSkewRatioText`: 앱 Flow 두 비율 칸. 새 순수 표시 함수는 네트워크·캐시 쓰기가 없다.
- 시험: nb467Replay.test.ts 및 시장 필드만 선별한 nb467-market-replay.json 신규. 기존 earningsBrief·cmdMissingScores·flowIntegrity2 시험의 기대 EPS/금액 형식·VM 의존성과 현재 main의 결측 문구 기대값을 보완한다.
- 데스크톱 화면·문구 사전·Guardian·실적 변동폭 서비스는 수정하지 않았다.

## 돌린 시험과 결과

- 원본 REG 사본 대조: ticker/options-eod/ivp/quotes × NVDA/AAPL/TSLA/SPY/WTFC = **20/20 일치**. 원본에 없는 필드의 null 정규화만 허용했다.
- CLOSED 원본 5/5와 AI 원본 확신도 7/7도 별도 대조했다.
- 재생 자료: REG 5종목·직전 CLOSED 5종목·AI 7종목·고래 10응답. 고래 3,330개 계약을 축약 없이 사용하고 티커·세션 날짜·건수·금액을 실제 JSX/표현식으로 확인한다. 원본 응답의 헤더·URL·계정 정보는 fixture에 저장하지 않는다.
- 첫 시험 시도는 node_modules가 없어 ts-node preload에서 종료됐다(시험 본문 실행 전). 기존 stock2/node_modules를 이 작업공간의 gitignore 대상 심볼릭 링크로 연결했다. 패키지 설치·의존성 파일 변경은 없다.
- 기준 화면 JSX(`NB467_BASELINE=1`, 고정 기준 커밋 1b31b0a89) 재현: **7건 중 5건 실패·2건 통과**. 순 프리미엄 형식·확신도 문자열 부재·EOD 카드 금액/날짜·IV 표기·결측 확신도의 LOW 점등을 재현했다. 최대 체결/EOD 구분과 실제 체결 미리보기 최대값 유지 관문은 기준·수정본 모두 유지한다.
- 수정 후 `nb467Replay`: **7/7 통과**. 실제 JSX와 표현식에서 REG/CLOSED 숫자·AI enum·점·고래 3,330행 합계/건수/날짜·BID/ASK 부재·실제 체결 미리보기 최대값 보존을 확인했다.
- 최초 관련 묶음은 재생 1파일 + 기존 8파일(총 9파일) 중 7파일 종료 0, 2파일 실패였다. cmdMissingScores의 기존 VM에 현재 main의 batchIv·IV 출처 날짜 의존성이 빠져 있었고, flowIntegrity2는 현재 main의 ‘집계 관측 없음’을 이전 대시로 기대했다. 생산 코드/라벨을 바꾸지 않고 VM에 실제 공용 IV 함수를 주입하고 명시적인 합성 IV 자료의 날짜를 추가했다. 금액 관측 여부·실제 0·라벨/HTML 비교 검사는 유지한다. **실패한 두 파일만 재검사하여 cmdMissingScores 35/35·flowIntegrity2 33/33, 모두 종료 0**을 확인했다. 최종 관련 기존 8파일 전부 통과했다(earningsBrief, inviteLanding, flowWhaleIntraday, cmdMissingScores, premiumFlow, flowNumbers, flowIntegrity2, appCmdNetPremiumLabel).
- 전체 tsc: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --project tsconfig.json --noEmit --incremental false` **1회 실행, 종료 0·오류 출력 0**. 이후 변경은 tsconfig 제외 대상인 시험 하네스·이 문서뿐이며 운영 소스는 바꾸지 않았다. 전체 tsc는 반복하지 않았다.
- 재생·기존 시험 묶음·실패 파일 재검사도 모두 같은 `lockf -k`로 직렬 실행했다. 선행 작업이 잠금을 오래 점유해 대기했으며 다른 프로세스·잠금 파일은 변경하지 않았다. 시험에는 네트워크 연결·env 파일 동기 읽기를 차단하는 임시 preload도 적용했다.
- `git diff`로 기존 파일, `git diff --no-index /dev/null`로 신규 파일의 저장을 확인했고 `git diff --check`는 통과했다.

## 남은 위험

- L15 최대 체결·L16 방향 칸은 실제 체결 원천/직전 정상본이 필요하다. 현 저장 사본만으로 숫자나 방향을 생성할 수 없다.
- L25·L35는 문구 결정, L42는 계산 정의 수정의 별도 범위가 필요하다.
- 시험은 오프라인 JSX/표현식 재생이며 운영 화면 해소·실제 공급사 충족률은 미측정이다. 로컬 서버·브라우저·운영 API·운영 데이터 쓰기·커밋·push·병합·배포는 실행하지 않는다.


## 최종 변경 파일 (12개)

- `src/app/[locale]/app-view/flow/page.tsx`
- `src/app/[locale]/app-view/cmd/page.tsx`
- `src/components/app/App5DayTape.tsx`
- `src/lib/app/displayNumbers.ts` (신규)
- `src/lib/premiumFlow.ts`
- `src/lib/earnings/earningsBrief.ts`
- `tests/nb467Replay.test.ts` (신규)
- `tests/fixtures/nb467-market-replay.json` (신규)
- `tests/earningsBrief.test.ts`
- `tests/cmdMissingScores.test.ts`
- `tests/flowIntegrity2.test.ts`
- 이 검증 기록 (신규)

재현 실행 예(저장소 루트, 기존 node_modules 필요):

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' node -r ts-node/register/transpile-only -r tsconfig-paths/register tests/nb467Replay.test.ts
```

같은 실행에 `NB467_BASELINE=1`을 전달하면 화면 소스만 고정 기준 커밋에서 읽어 5건 실패를 재현한다. 임시 하네스 preload는 네트워크 소켓과 env 파일 동기 읽기를 막았고, 각 기존 시험의 외부 저장소·공급사 호출은 메모리/SDK 대역을 사용했다. 새로운 재생 시험은 순수 표시 코드만 읽고 fetch도 차단한다. 전체 시험 묶음을 반복하지 않았으며, 소스 변경 없이 실패한 두 하네스만 보완·재검사했다.
