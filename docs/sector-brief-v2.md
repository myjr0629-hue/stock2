# 섹터 AI 브리프 v2 인계

작업 브랜치 `feat/ai-sector-brief-v2`, 기준 `0b6afec9ffbaeac3844b8ff7874bc20cc06bdc29`.
화면·라벨·배치·글 길이 칸과 3언어 필드 형식을 변경하지 않았다.
커밋·push·병합·배포·운영 쓰기·브라우저 접근·환경 파일 읽기는 실행하지 않는다.

## 확인한 원인과 변경

기존 지시는 사실을 반복하지 말라고 하면서 분산 해석과 짧은 관찰형 종결을 요구했다.
종목 중간 분포가 빠져 선두·후미·평균만으로 전체 참여를 판단해야 했다.
PRE에는 시각 있는 뉴스와 선물·과거 옵션 배경도 함께 들어왔지만 섹터 원인으로 쓸 연결 근거가 없었다.
기존 숫자 검사는 절댓값 중심이라 `NVDA +6%`를 `NVDA -6%`로 써도 구별하지 못했다.

새 입력에는 측정 종목별 등락과 선두 제외 평균을 넣었다. 기존 가격 집계·세션 표본 선택은 유지한다.
새 프롬프트에서는 옵션·뉴스·선물 배경을 제외한다. 따라서 뉴스 원인을 창작하지 않고 가격 분포의 의미를 설명한다.
“주어와 측정치 → 나머지 종목까지 함께 움직이는가 → 그 의미”를 우선하고,
공간이 남으면 “동료가 동참하면 확산, 동참하지 않으면 집중”이라는 조건별 관찰점을 덧붙인다.
길이 목표는 기존 KO/JA 40–70자, EN 55–95자이고, 조건문 누락·형식·상한 길이만으로 새 탈락을 만들지 않는다.

새 생성 검사는 명시적 종목 수치·부호 모순, 세션 모순, 근거 없는 뉴스 인과·기관 자금 주장,
내부 출처명·선물 주장·데이터 시차 표기를 검사한다. 부정·미확인 표현은 원인·기관 의도 단정으로 보지 않는다.
기존 숫자 공통 함수와 예측어 공통 함수는 변경하지 않는다.
날짜 숫자는 주가 숫자와 분리하고, 추가 입력의 중간 종목 등락과 선두 제외 평균도 허용한다.

## 호출자와 저장본 보호

| 함수/소비처 | 영향과 검증 |
|---|---|
| `buildSectorFacts` | cron과 비교 도구가 공유. PRE/POST 표본 부족의 REG 복구, 실제 0%, 부분 측정, 종목별·선두 제외 평균을 시험 |
| `buildSectorBriefPrompt` | cron과 비교 도구가 공유. 3언어·기존 길이·가격 근거만 전달하는 계약을 시험 |
| `checkSectorBriefNew`, `sectorBriefBatchGate`, `selectSectorBriefOutput` | cron의 새 생성과 비교 도구만 사용. batch 한국어 80%·한국어 필수·언어별 부분 채택을 유지 |
| snapshot `overlayAiHeadline` | 코드 변경 없음. 날짜·120분·존재 확인을 유지. 실제 함수를 실행해 옛 정상 문장·부분 언어·원본 복구를 확인 |
| money-map API·`MoneyMapCards` | 코드 변경 없음. 기존 AI 문장 재사용. 기존 moneyMap 시험과 신규 경로 검사 |
| `checkSectorBriefLegacy` | 비교 도구에서 옛 생성 검사 재현. 공통 forecast/숫자 함수는 그대로 |
| `checkSectorBriefStored` | 비교 전용으로 기존 서빙의 문장 존재 계약을 재현. 새 문체 검사를 복구 경로에 도입하지 않음 |

새 생성이 전부 실패하면 기존 pack을 덮어쓰지 않는 동작을 유지한다.
일부 언어가 실패하면 기존처럼 해당 언어의 스냅샷 규칙문이 남는다.
이전 문장의 시각을 새 생성 시각으로 연장하는 병합은 추가하지 않았다.

추가 추적에서 감사 문서의 적용 범위를 정정했다. 앱 인텔 `viewReportForApp`는
`applySectorBrief`를 호출해 서버 글을 화면 종목 기준의 규칙문으로 다시 덮는다.
앱 설정 목록과 엔진 목록도 일부 다르다(예: quantum_edge 앱 3종목, 엔진 7종목).
이번 프롬프트·입력·생성 검사 수정은 기존 cron을 소비하는 머니맵과 웹 리포트에 적용된다.
앱의 규칙문 칸은 이 변경만으로 개선되지 않는다. 재작성 우회나 종목 목록 변경은 하지 않았다.
앱 AI 연결은 화면 종목과 같은 입력 계약을 먼저 마련하는 별도 작업이 필요하다.

## Claude 운영 세션 실행

기본 실행은 로컬 fixture만 읽는다. `.env*`는 읽지 않고 프로세스 환경을 주입한다.

```sh
node scripts/sector-brief-v2-compare.cjs --out /tmp/sector-brief-offline.md
node scripts/sector-brief-v2-compare.cjs --redis --capture --out /tmp/sector-brief-stored.md
node scripts/sector-brief-v2-compare.cjs --snapshot /path/to/paired-input.json --live --provider anthropic --out /tmp/sector-brief-live.md
```

`--redis`는 `intel:ai_headlines:v1`에 대한 GET 1회만 수행한다. 크론·생성 API는 호출하지 않는다.
Upstash 또는 EC2 proxy URL과 인증은 주입한 환경만 사용하며 값과 오류 본문을 출력하지 않는다.
`--live`는 고정 Haiku 5.5를 동일 공급사로 옛/새 각 3회, 매회 3언어 생성한다.
`--provider`는 `anthropic`, `bedrock-invoke`, `bedrock-mantle` 중 선택한다.
운영 사다리와 같은 공급사 함수·요청 구성(금융 공통어·low·thinking disabled·4000 토큰)을 사용하되
원장·서킷·운영 캡처 쓰기를 일으키는 사다리 래퍼는 호출하지 않는다.
따라서 성적은 재시도 없는 첫 응답 성적이며 운영 사다리 전체 성공률과 다르다.
인증 환경이 없으면 모델 호출 전에 종료한다. 비교 도구 자체도 오프라인 mock으로 시험한다.

보고서와 `.json` 부록에는 입력 해시·기준 버전·세션·반복·공급사·모델·언어별 탈락 사유,
batch 통과 및 한국어 의존성을 반영한 최종 채택 여부·길이 목표 충족 여부를 남긴다.
운영 저장 문장과 동일 입력의 새 실모델 결과가 모두 있을 때만 3언어 전후 예시를 만든다.
작성한 회귀 문자열로 예시를 채우지 않는다.

## 남은 측정

로컬에는 실제 10/14 POST 가격 입력 1건만 있다. 운영 AI 저장 문장 0건, 새 실모델 출력 0건이다.
3언어 운영 전후 예시와 실모델 탈락률은 미측정이다. PRE/REG의 실제 입력 수집도 운영 세션에서 추가해야 한다.
뉴스 원인을 추가하려면 섹터 관련성·발행/사건 시각을 확인하는 별도 입력 계약부터 필요하다.

## 실행한 검증

- `run-offline-tests.cjs`: 294/294 파일 통과. 기존 실패 `earningsScenario.test.cjs`, `giftShareGate.test.ts`, `readCheck.test.cjs`만 제외했다. 전체 묶음은 1회 실행했다.
- 표적 묶음: `krEveningRefresh.test.ts`, `moneyMap.test.cjs`, `sectorBriefV2.test.cjs` 3/3 파일 통과.
- 전체 타입 검사 1회에서 새 어댑터가 `OptionsEodBundle.date`를 필수로 선언한 오류 1건 발견. 기존 타입을 직접 사용하도록 수정했다.
- 이후 크론과 새 모듈 2개를 루트로, 같은 tsconfig 설정과 의존성을 사용한 변경 경로 타입 검사: 오류 0건. 전체 타입 검사를 반복하지 않았다.
- 전체 묶음 후 실제 POST fixture의 `-0.04% → -0.0%` 정상 반올림 오탈락을 방지하는 한 줄을 추가했다. 최신 `sectorBriefV2.test.cjs` 11/11 재통과. 비영(非零) 부호 오류 검사는 유지한다.
- 비교 CLI 기본 실행: 종료 0. 실제 가격 입력 1건 재생, 운영 저장 문장 0칸, 실모델 호출 0회. 0칸의 탈락 0건을 품질 통과율로 세지 않는다.
- `git diff --check`: 통과. 화면 파일·공통 숫자/예측 함수 변경 없음.

무거운 명령은 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬 실행했다.
상세 로그: `.logs/ux-gate/recheck.json`, `.logs/ux-gate/*.log`,
`.logs/sector-brief-v2/verification.json`, `.logs/sector-brief-v2/offline-compare.md` 및 JSON 부록.

## 바꾼 파일

| 파일 | 내용 |
|---|---|
| `src/app/api/cron/sector-headlines/route.ts` | 새 사실·프롬프트·검사 연결, 입력 facts/버전 보관 |
| `src/lib/ai/sectorBriefFacts.ts` | 기존 집계 분리, 종목별 등락·선두 제외 평균 |
| `src/lib/ai/sectorBrief.ts` | 새 생성 계약과 옛 생성·저장본 계약 분리 |
| `scripts/sector-brief-legacy.cjs` | 고정 SHA의 옛 프롬프트 |
| `scripts/sector-brief-v2-compare.cjs` | 저장본·실모델 비교, GET 전용 수집 |
| `tests/krEveningRefresh.test.ts` | 입력 범위와 실패 시 기존 저장본 보존 회귀 |
| `tests/sectorBriefV2.test.cjs` | 순수 함수·복구 경로·비교 도구·실제 시세 사본 시험 |
| `tests/fixtures/sector-brief-v2/operational-2026-10-14-44e63357.json` | 실제 POST 시세 입력 |
| `tests/fixtures/sector-brief-v2/README.md` | 출처·합성 회귀 문자열 구분·캡처 방법 |
| `docs/sector-brief-v2.md` | 적용 범위·실행·검증 인계 |
