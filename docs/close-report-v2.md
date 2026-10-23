# 장마감 리포트 v2 — 운영 세션 인계

이 문서는 로컬 구현 범위와 아직 확인하지 않은 항목을 구분한다. 운영 조회·쓰기, 모델 호출, 푸시 발송, 커밋·병합·배포는 이 작업에서 수행하지 않는다.

## 확인한 원인과 변경

- Vercel·Lambda가 각각 수치 나열 요약을 요구하고 시장 뉴스의 발행 시각을 제거했다. 두 생산자는 이제 `scripts/lambda-cross-sector/closingReport.js`의 같은 프롬프트·입력 어댑터를 사용한다.
- `closingNarrative.version=1`은 판정 → 현황 → 원인 → 지표 해석 → 다음 관찰 순서다. 기존 보조 필드·라벨은 유지한다. 판정은 기존 `marketOverview.summary`와 동일하며, 현황까지 기본 표시하고 나머지는 펼침에서 원문 전체를 읽는다.
- 현물 S&P 500·NASDAQ 종합의 거래일·시각·종가 변화율을 확인해야 생성한다. 현물 결측을 ES/NQ로 대체하지 않는다. 선물은 별도 이름·관측값으로 제공하며 현물 마감 이후 변화율이라고 부르지 않는다. 마지막 정규장 1분봉 종가를 쓰는 기존 수집기 때문에 마감 직전 1분 타임스탬프도 마감 이후에만 허용한다.
- 뉴스 ID·출처·ISO·ET 보도 시각을 보존한다. 장후 기사에는 장후 분류를 붙이며, 선행 원인으로 분류하면 거절한다. 보도 시각은 사건 시각을 증명하지 않는다. 일정은 ET 날짜·시각과 함께 제공한다. 시각 없는 일정은 시각을 만들어 넣지 않는다.
- 한국어 영어 용어 제한, 필드별 길이, 세 언어의 숫자·부호·시각 일치, 권유·금액 검사와 기존 숫자·언어·가격 수준 가드를 함께 적용한다. 새 Lambda 저장본도 API·푸시 선택 때 공통 내용 검사를 받는다. 기존 v3/v2 대체본 정책은 유지한다.
- 마감 푸시는 판정 한 줄만 사용한다. 기존 제목·전체/마감 선호는 유지한다. FCM·APNs 기본/재시도에 거래일과 앱 경로·웹 경로를 함께 담는다. 앱은 저장 언어로 `/{locale}/app-view/intel?tab=report&date=YYYY-MM-DD`, 웹 폴백은 `/{locale}/intel?tab=report&date=YYYY-MM-DD`를 연다.
- 지정 날짜 GET은 해당 날짜만 조회한다. 없으면 404이며 현재 날짜로 생성하거나 교체하지 않는다. 같은 화면에서 푸시를 다시 눌러도 섹터 시트를 닫고 리포트 탭으로 간다. 차가운 실행의 복구는 경로와 필수 쿼리를 함께 비교한다.

## 공유 함수 영향

| 함수 | 실제 호출자·영향 | 회귀 검증 |
|---|---|---|
| `selectServedBrief` | 보고서 GET, 푸시 준비 검사, 푸시 본문 선택. 새 서사에만 추가 검사를 적용한다. | `crossBriefServe`, `closingReport`, `reportLink` |
| `buildGenerationGuard`·`lengthProblems` | Vercel 생성·v4 서빙. 새 서사 칸만 별도 길이를 쓴다. 기존 칸 상한은 유지한다. | `crossBriefServe`, `closingReport` |
| `closingAiLines` | 마감 푸시 본문. 숫자 없는 문장은 정적 대체한다. | `pushAiLine`, `closingReport` |
| `sendPushByType` | 푸시 크론의 정상 발송·시험 경로. 선택적 거래일 인자만 추가하며 선호·발송 수단은 유지한다. | `pushAiLine`, `reportLink`, `todayPicks` |
| `matchesReportTarget` | `NativeAppProvider`의 기존 모든 pending 딥링크 복구. 모닝·종목 알림도 쿼리 보존 대상이다. | `reportLink` |
| 공용 CJS 계약 | Vercel·Lambda 생성기. Lambda 디렉터리 전체를 묶는 기존 패키징에 포함된다. 배포 스크립트는 실행하지 않는다. | `closingReport` |

## 바꾼 파일 목록

- 생성·입력·가드: `scripts/lambda-cross-sector/closingReport.js`, `scripts/lambda-cross-sector/index.js`, `src/app/api/intel/cross-sector-brief/route.ts`, `src/lib/ai/closingReport.ts`, `src/lib/ai/crossBriefServe.ts`
- 앱·웹 표시: `src/components/intel/ClosingNarrative.tsx`, `src/components/intel/PostMarketBriefView.tsx`, `src/app/[locale]/app-view/intel/page.tsx`, `src/app/[locale]/intel/IntelClientPage.tsx`
- 푸시·라우팅: `src/app/api/cron/push/route.ts`, `src/lib/push/send.ts`, `src/lib/push/aiLine.ts`, `src/lib/app/reportLink.ts`, `src/app/[locale]/app-view/layout.tsx`, `src/components/native/NativeAppProvider.tsx`
- 시험: `tests/closingReport.test.tsx`, `tests/reportLink.test.ts`, `tests/aiLadderRest.test.ts`, `tests/pushAiLine.test.ts`, `tests/todayPicks.test.ts`, `tests/intelSnapshotNullRender.test.ts`, `tests/sectorMinimal.test.cjs`, `tests/signals.app.test.ts`
- 인계: `docs/close-report-v2.md`

## 검증 기록

무거운 명령은 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 감쌌다. 다른 작업공간의 잠금 해제를 기다린 뒤 순차 실행했다. 브라우저·실기기 검증은 수행하지 않았다. 화면 시험은 정적 렌더에서 글 전체와 펼침 순서를 확인했다.

- `node scripts/run-offline-tests.cjs`: 295개 시험 파일 전체 실행, 최초 292 통과·3 실패. 구조 키가 추가된 배선 검사를 갱신하고 보강한 새 서사 시험과 함께 표적 재검사해 2/2 통과했다. 최종 합산 **293 통과·2 실패** (`.logs/ux-gate/final.json`). 전체 묶음은 반복하지 않았다.
- 남은 `earningsScenario.test.cjs` 실패 2건은 과거 두 커밋 대비 변경 파일을 각각 2개·1개로 고정한 검사다. 작업 변경을 제외한 HEAD 자체에서도 기준과 40개·46개 파일 차이를 확인했다.
- 남은 `readCheck.test.cjs` 실패 1건은 과거 커밋 대비 기존 파일 수정이 `darkPool.ts` 하나여야 한다는 검사다. HEAD 자체에서도 기준과 47개 파일 차이를 확인했다. 두 파일의 범위 제한 검사는 수정하지 않았다.
- `./node_modules/.bin/tsc --noEmit --incremental false`: 1회 실행, 종료 코드 0·오류 0. 이후 타입 구조를 바꾸지 않는 종가 타일 기존 행 복구와 거래일 변수 고정, CJS 방어·캘린더 보완을 반영했으며 관련 시험과 CJS 문법 검사를 통과했다.
- `node --check` 두 CJS 생산 파일·공유 계약 및 `git diff --check`: 통과.
- 운영 모델·저장본 비교, 브라우저·실기기, 실제 알림 발송: 실행하지 않았다. 의존성은 기존 저장소의 `node_modules`를 작업공간에 심볼릭 링크해 사용했으며 설치 명령은 실행하지 않았다.

## 운영 반영 전 필수 비교

운영 세션이 저장 입력·출력 최소 20개와 대표 장외 입력별 기존/변경 실모델 최소 3회 짝 비교를 수행해야 한다. 거래일, 생성 시각, provider/model, 원입력, 출력, 첫 탈락·최종 탈락·대체율, 언어별 사유, 지연·비용을 기록한다. 수치·부호·기준·시간 선후·언어 사실 충돌·권유 치명 오류는 0건이어야 하며 전체/장외 최종 탈락률이 악화되면 반영을 보류한다.

비교용 생성 경로는 Vercel 인증 POST의 `?dry=1`, Lambda 수동 이벤트의 `dryRun:true`다. 결과와 입력 근거를 반환하며 보고서 저장은 건너뛴다. 이 경로도 실제 모델 호출 비용은 발생하므로 운영 세션에서만 실행한다. 푸시는 별도 크론의 기존 `dry=1`을 사용한다.

남은 한계: 뉴스의 사건 시각·인과관계와 세 언어 사건 의미 일치는 프롬프트·정형 검사만으로 증명되지 않는다. 기존 v3/v2로 대체되면 이전 서사가 보일 수 있다. Redis 보관 72시간이 지난 딥링크는 404로 종료한다. 푸시의 기존 비원자적 중복 방지·마지막 섹터 완료 표식은 이번 범위에서 바꾸지 않는다. 모바일 실제 화면 높이와 OS별 알림 탭은 운영 세션의 실기기 확인이 필요하다.
