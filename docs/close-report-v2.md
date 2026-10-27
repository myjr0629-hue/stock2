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

남은 한계: 뉴스의 사건 시각·인과관계와 세 언어 사건 의미 일치는 프롬프트·정형 검사만으로 증명되지 않는다. 기존 v3/v2로 대체되면 이전 서사가 보일 수 있다. Redis 보관 72시간이 지난 딥링크의 API는 404를 반환한다. 앱은 최신 리포트로 이동하며 최신 조회도 실패하면 인텔 기본 탭을 표시한다. 푸시의 기존 비원자적 중복 방지·마지막 섹터 완료 표식은 이번 범위에서 바꾸지 않는다. 모바일 실제 화면 높이와 OS별 알림 탭은 운영 세션의 실기기 확인이 필요하다.

## 날짜 혼합 관문 후속 수리 (2026-10-23)

원인: 앱의 날짜 쿼리는 크로스 요약 GET에만 전달됐고, W/L은 `shownRegularSessionDate()`의 최신 시세, 섹터 카드는 최신 캐시·시세·옵션 보충으로 재계산됐다. 날짜 지정 스냅샷 API도 최신 AI 헤드라인을 덮었다.

수리:

- 보고서 GET이 반환한 `date`를 고정한다. 날짜 쿼리가 없는 경우도 반환된 보고서 날짜를 사용한다. 섹터 스냅샷은 전부 그 날짜로 조회하며 날짜가 다른 응답은 거절한다.
- 보고서 전용 날짜·언어별 상태를 사용한다. W/L과 섹터 카드·펼침은 같은 저장 행에서 계산한다. 최신 시세·캐시·옵션 보충·상세 로더는 이 상태에 합치지 않는다. 없는 섹터는 이름과 기존 읽기 실패 문구를 표시한다. 섹터 칸을 숨기지 않는다.
- 날짜 조회 API는 최신 AI 제목을 덮지 않는다. 캐시·DB 응답 날짜도 요청 날짜와 대조한다. 날짜가 없는 기존 조회 동작은 유지한다.
- 보고서 뉴스는 타임존이 명시된 보도 시각의 ET 날짜가 맞는 것만 사용한다. Vercel·Lambda의 매크로 입력·표시값은 같은 ET 날짜의 관측으로 제한하고 날짜 없음·미래·stale 값을 제외한다. ETF 레벨도 계산 시각의 ET 날짜를 확인한다. 옵션 OI 기준일은 기존 레벨 블록에 날짜가 명시된다.
- 공통 프롬프트는 모든 보조 필드까지 같은 정규장 세션을 요구한다. 장후 관측은 날짜·시각을 붙이며 현물 종가로 취급하지 않는다. 다음 일정·비교 기준은 날짜와 기준을 명시한다. 근거 가드는 현물 날짜, 뉴스 날짜, 매크로 날짜, 저장본 날짜의 불일치를 거절한다.

공유 함수 호출자 확인:

| 변경 함수 | 전체 호출자와 영향 | 검증 |
|---|---|---|
| `sessionReading` (신규) | Vercel·Lambda 입력, 공통 근거 가드, 비교 스크립트. 다른 날짜·날짜 미상 매크로 제외 | `closingSession`, `closingReport`, `compareCloseReport` |
| `buildClosingPrompt` | Vercel·Lambda 생성, 비교 스크립트. 전 필드의 세션 날짜·장후 구분 강화 | `closingReport`, `closingSession`, `compareCloseReport` |
| `evidenceProblems`·`closingReportProblems` | Lambda 생성, Vercel 생성 검증, `buildGenerationGuard`, `evaluateServedV4`, `newLegacyProblems`, 비교 스크립트. API·푸시의 새 서사 선택에 영향 | `closingReport`, `crossBriefServe`, `pushAiLine`, 전체 오프라인 시험 |
| 앱 내부 `buildSnapshotReport` | 보고서 스냅샷 조회 effect 1곳. 명시 날짜와 응답 날짜 대조 | `closingSession` |
| `closingReportForApp` (신규) | 보고서 탭 전용. 날짜가 맞는 저장 행을 설정 목록에 맞춘 뒤 관찰문을 만든다. 저장 옵션값을 보존한다. 기존 `viewReportForApp`의 실시간 상세·카드 호출은 유지 | `closingSession`, 기존 Intel 시험 |
| `toServedPayload` | 보고서 API GET 호출. 비교 재생용 `sectorInputs`를 내부 입력으로 유지하고 공개 응답에서 제외 | `closingReport`, `crossBriefServe` |
| 스냅샷 GET | 앱·웹·공유 데이터 훅의 조회. 날짜 지정 시 최신 제목 덮기 금지·응답 날짜 대조, 기본 latest 조회 유지 | `closingSession`, 기존 스냅샷 시험 |

### 운영 비교 스크립트

`scripts/compare-close-report.mjs`는 운영 세션에서만 실행한다. 이 작업에서는 운영 Redis·모델을 호출하지 않았다. 환경 파일을 읽지 않으며 프로세스에 이미 설정된 `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_READ_ONLY_TOKEN` (또는 `KV_REST_API_URL`·`KV_REST_API_READ_ONLY_TOKEN`)을 사용한다. Upstash 쓰기 토큰으로 대체하지 않는다. `EC2_REDIS_PROXY_URL`과 `EC2_REDIS_PROXY_KEY`(또는 `REDIS_PROXY_KEY`)가 함께 있으면 보고서 키는 운영 기본 저장소인 EC2 프록시에 GET으로 조회한다. 없으면 Upstash 사본을 조회하며 출력에 저장소 이름을 표시한다. 사다리 상태·한도는 항상 Upstash 읽기 전용 조회다. EC2가 응답한 결측을 Upstash의 오래된 사본으로 대체하지 않는다.

```sh
# 조회만: 최근 저장 키 최대 20개, 과거 90일 범위. 표는 stdout으로 출력.
node scripts/compare-close-report.mjs --count 20 --days 90
# 실제 비교: 저장본마다 3회 유료 생성. 검토 결과는 공개 저장소 밖에 보관.
node scripts/compare-close-report.mjs --count 20 --days 90 --generate --runs 3
```

- 정확한 날짜 키 `postmarket:cross-brief-v4/v3/v2:YYYY-MM-DD`를 최신 날짜·버전 순으로 GET만 한다. N은 날짜 수가 아닌 저장 키 개수다. SCAN/KEYS나 API 자가 복구 경로를 호출하지 않는다.
- 저장본의 `reportEvidence`, `sectorInputs` 또는 보존된 프롬프트의 섹터 입력으로 새 공통 프롬프트를 만든다. 원입력 또는 날짜 근거가 없으면 비교 불가로 표시한다. 현재의 Redis 시세로 과거를 재구성하지 않는다. 새 생성기는 `sectorInputs`도 저장한다.
- 기존 `runLadder`·`callBedrock`·언어/숫자/서사 가드를 재사용한다. 사다리 상태·한도 조회는 읽기 전용 GET, 호출 기록·캡처·원장·서킷의 변경은 프로세스 메모리에만 수행한다. 운영 Redis에 쓰지 않는다. 실행 중 운영 원장에는 비용이 반영되지 않으므로 비교 횟수와 출력 비용을 운영 세션에서 별도 기록한다.
- ko/en/ja별 모든 구조 필드를 저장본/새 결과로 나란히 출력한다. 모델·지연·비용·가드 사유·사다리 결과도 기록한다. 기존 fallback 클라이언트는 사용량을 반환하지 않으므로 그 경로의 비용은 `unknown`으로 남긴다. 탈락 결과도 검토할 수 있도록 표에 남긴다. 키·자격증명·오류 원문은 출력하지 않으며 출력 텍스트의 환경 비밀값은 가린다.
- 요청 수 미달·원입력 없음·생성 실패·가드 탈락은 종료 코드 1이다. 보관 72시간으로 20개를 확보하지 못할 수 있다. 이 경우 충분한 보존 입력을 운영 세션에서 준비해야 하며, 스크립트 실행만으로 필수 비교를 통과했다고 보지 않는다.

후속 변경 파일:

- 날짜 조회·렌더: `src/app/[locale]/app-view/intel/page.tsx`, `src/app/api/intel/snapshot/route.ts`
- 생산·가드·서빙: `scripts/lambda-cross-sector/closingReport.js`, `scripts/lambda-cross-sector/index.js`, `src/app/api/intel/cross-sector-brief/route.ts`, `src/lib/ai/closingReport.ts`, `src/lib/ai/crossBriefServe.ts`
- 운영 비교: `scripts/compare-close-report.mjs`
- 시험: `tests/closingSession.test.ts`, `tests/compareCloseReport.test.mjs`, `tests/closingReport.test.tsx`, `tests/appAccuracy2.test.ts`, `tests/appIntelNoFakeValues.test.ts`, `tests/intelFillFollowups.test.ts`, `tests/intelSectorBrief.test.ts`, `tests/intelSnapshotScore.test.ts`
- 인계: `docs/close-report-v2.md`

### 후속 검증 결과

- 모든 무거운 실행은 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬화했다. 전체 시험은 1회만 실행했다. 운영 Redis 조회·모델 호출·브라우저·실기기·발송·운영 쓰기·커밋·push·병합·배포는 실행하지 않았다.
- 최초 표적 `closingReport`, `closingSession`, `compareCloseReport`, `crossBriefServe`, `reportLink`: 5/5 통과.
- 전체 오프라인 시험: 297개 중 최초 291개 통과·6개 실패. 4개는 최신 화면 날짜/최신 캐시를 가정하던 기존 검사라 보고서 날짜·별도 상태를 검증하도록 갱신했다. 최신 시세가 없다는 이유로 저장 옵션값을 비우지 않도록 마감 전용 순수 경로도 검증했다.
- 수정 후 표적 9개 (`appAccuracy2`, `appIntelNoFakeValues`, `closingReport`, `closingSession`, `compareCloseReport`, `crossBriefServe`, `intelFillFollowups`, `intelSectorBrief`, `intelSnapshotScore`): 9/9 통과. 합산 최종 **297개 중 295개 통과·2개 기존 실패**, 지정 제외 대상 외 실패 0. 기록은 `.logs/ux-gate/final.json`이다.
- 제외된 실패: `earningsScenario`의 기준 커밋 바이트/범위 비교 2건 (22건 중 20건 통과), `readCheck` 15번 기준 커밋 비교 1건 (18건 중 17건 통과). 사용자 지정 기존 제외 범위다. `giftShareGate`는 이 환경에서 통과했다.
- `./node_modules/.bin/tsc --noEmit --incremental false`: 1회 실행, 종료 코드 0·오류 0.
- CJS 공유 계약·Lambda와 비교 스크립트 문법, 비교 CLI `--help`, `git diff --check`: 통과. 오프라인 비교 시험은 HTTP GET 경로·EC2/Upstash 분리·원입력 결측 거절·세 언어 표·비밀값 가림·기존 사다리 어댑터의 메모리 전용 쓰기를 검증한다.

남은 위험: 운영 저장본 20개 이상·실모델 3회 이상 비교 및 실제 알림/실기기 검증은 운영 세션의 병합 전 과제로 남는다. 시각 근거가 없는 옛 저장본의 입력 날짜를 소급 증명할 수 없으며 그런 표본은 비교 불가로 표시한다. 날짜 검증 강화로 날짜가 없거나 다른 날인 매크로/뉴스/옵션 근거는 줄어들 수 있다. 실제 공급사 결측률·모델 탈락률·다국어 의미 정확성은 운영 비교에서 확인해야 한다.

## 웹 지정일·비교 근거 관문 수리 (2026-10-23)

- 원인: 웹 `PostMarketBriefView`가 날짜를 요약 GET에만 전달했다. 하위 `TacticalReportDeck`은 최신 섹터를 조회하며 응답 날짜도 검사하지 않았다. 이제 검증된 요약 응답 날짜를 하위에 전달하며, 지정 날짜와 다른 요약·섹터 응답을 거절한다. 날짜 전환 시 하위를 다시 마운트하고 이전 요청의 늦은 성공·실패·본문 응답을 무시한다. 요약 날짜가 없으면 최신 섹터로 대체하지 않고 기존 결측 문구를 사용한다.
- 공유 컴포넌트 호출자 전체: `PostMarketBriefView` 1곳과 `IntelClientPage`의 독립 섹터 화면 10곳이다. 전자는 반환된 보고서 날짜로 고정한다. 후자는 날짜 속성을 생략하므로 기존 최신 조회·`lockedTickers` 전달을 유지한다. `webClosingSession`이 날짜 전달·불일치·404·결측·요청 경합·독립 화면 조회를, `intelSnapshotNullRender`가 실제 웹·모바일 행과 결측 표시를 검증한다.
- 원인: 비교 스크립트의 `macroStr` 복원이 현물 지수에 한정되어, 공통 출구 검사에 같은 날 VIX3M 근거를 전달하지 못했다. 이제 기존 `sessionReading`을 통과한 저장 매크로 관측값 전체를 생산자와 같은 이름·정밀도·금리 bp·선물 구분으로 복원한다. 원래 날짜·stale·미래 검사와 가격 출구 검사는 유지한다. 생산자·공유 가드 자체는 변경하지 않았다.
- `compareCloseReport`는 Vercel·Lambda의 실제 매크로 표현식을 오프라인으로 실행해 복원 문자열이 같은지 대조한다. 가짜 모델을 통한 실제 비교 어댑터의 후처리에서 정상 VIX3M=22.37 보존과 다른 날·날짜 미상·stale·생성 이후 근거의 삭제도 확인한다. 운영 저장본·실모델은 호출하지 않는다.
- 5단 구조·화면 라벨·문구·펼침 방식·한국어 제약·마감 푸시 딥링크는 변경하지 않았다. 이번 수리 파일은 `src/components/intel/PostMarketBriefView.tsx`, `src/components/intel/TacticalReportDeck.tsx`, `scripts/compare-close-report.mjs`, `tests/webClosingSession.test.ts`, `tests/compareCloseReport.test.mjs`, 이 문서다.

검증 결과:

- 표적 7개 파일 통과. 새 웹 시험의 초기 실패는 상위 컴포넌트 대신 파일 첫 애니메이션 훅을 추출한 시험 도구 문제였다. 실제 컴포넌트 함수를 먼저 찾도록 고친 후 해당 시험을 재검사해 통과했다.
- 전체 `node scripts/run-offline-tests.cjs`는 1회 실행: 298개 중 294개 통과·4개 파일 실패. 기존 제외는 `earningsScenario` 2건·`readCheck` 1건이다. 추가 실패 두 파일은 분기 이후 `origin/main` 변경을 이 브랜치와 비교한 데서 발생했다. 당시 공통 조상은 `d6c648194`, `origin/main`은 `0b6afec9f`였다. main에만 현물 감마 정규화·랭킹 배지 변경이 있었고, 이 브랜치의 해당 두 생산 파일은 공통 조상과 동일함을 확인했다.
- `tests/tickerPayload.test.js`·`tests/uxTimeoutsPaywall.test.cjs`의 비교 기준을 `git merge-base HEAD origin/main`으로 고정했다. 기존 응답·태그·문구·사전·CSS 비교 검사는 유지한다. 두 파일만 재검사해 2/2 통과했다. 최종 합산 **298개 중 296개 통과·2개 파일의 기존 실패 3건**, 지정 제외 외 실패 0. 기록: `.logs/ux-gate/results.json`, `recheck.json`, `final.json`. 최종 변경 파일은 위 6개에 이 두 시험 파일을 더한 8개다.
- `./node_modules/.bin/tsc --noEmit --incremental false`: 1회 실행, 종료 코드 0·오류 0. 모든 시험 실행·tsc는 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬화했다. 비교 스크립트·비교 시험의 `node --check`와 `git diff --check`도 통과했다.
- 운영 저장본·모델·브라우저·실기기·알림·운영 쓰기·커밋·push·병합·배포는 실행하지 않았다. 운영 비교와 실기기 검증은 앞의 운영 세션 과제로 남는다.

## 앱 설정 종목·만료 알림 관문 수리 (2026-10-23 18:55 관문)

- 원인: `closingReportForApp`은 설정 목록 정렬 시 보충 시세를 전달하지 않았다. 생산자 퀀텀 목록에는 IONQ만 겹쳐 RGTI·QBTS가 행과 W/L 분모에서 빠졌다. 마감 전용 경로에서 저장본에 없는 설정 종목을 결측 행으로 먼저 보충한다. 이후 기존 `alignReportToConfig`로 목록·집계를 맞춘다. 날짜가 같은 저장값과 옵션은 유지하며 현재 시세를 과거 값으로 사용하지 않는다. 최신 경로와 공통 정렬 함수는 변경하지 않았다.
- 원인: 크로스 요약 404 후에도 `!crossBrief`가 로딩 분기를 선택했다. 별도 로딩 상태와 오류 분기를 두고 요청을 12초로 제한했다. 지정일 실패 시 날짜 쿼리를 해제한 리포트 URL로 한 번 이동한다. 최신 조회도 실패하면 인텔 기본 섹터 탭을 표시한다. API의 지정일 404·날짜 대조 정책은 유지한다. 응답·본문 수신 중 날짜 전환과 이전 요청의 실패가 새 화면을 덮거나 이동시키지 않도록 취소한다.
- 호출자 확인: 수정한 앱 내부 `closingReportForApp`은 마감 스냅샷 조회 effect 1곳에서만 호출한다. `alignReportToConfig`의 다른 호출자인 `viewReportForApp`과 그 상세 화면 경로는 변경하지 않았다. `crossBriefUrl`·API·푸시 공용 함수도 변경하지 않았다.
- 재현 시험: `closingSession`은 실제 생산자 퀀텀 목록·설정 목록·빈 저장 목록을 세 언어로 실행해 설정 행 전부 유지, 실측 0과 결측 구분, 저장 옵션 보존, W/L의 1/3·0/3 분모, 원본 불변을 검증한다. 실제 앱 행 JSX도 렌더해 RGTI·QBTS의 이름과 기존 결측 표시를 확인한다. `appClosingRecovery`는 실제 앱 effect·JSX를 실행해 404 뒤 로딩 종료·섹터 목록 유지, 최신 조회 성공/실패, 불완전·다른 날짜 응답, 시간 제한, 늦은 응답·본문 취소를 검증한다.
- 화면 라벨·문구·펼침 방식은 변경하지 않았다. 운영 저장본·실모델·브라우저·실기기·발송·운영 쓰기·커밋·push·병합·배포는 실행하지 않는다.

검증 결과:

- 무거운 실행은 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬화했다. 다른 작업공간의 잠금을 기다렸으며 전체 시험과 tsc는 각각 1회 실행했다.
- 최초 표적 시험 2개는 새 JSX 시험 도구에 `exports` 주입이 없어 검사 전에 실패했다. 도구를 수정한 뒤 `closingSession`·`appClosingRecovery`·`intelFillFollowups`·`intelSectorBrief`·`reportLink` 5/5 통과했다.
- 수정 전 HEAD 소스를 같은 재현 시험에 입력하면 각각 실패한다. `closingSession`은 실제 결과가 IONQ 한 행인 것을, `appClosingRecovery`는 404 뒤 로딩 상태가 종료되지 않는 것을 확인했다. 기록: `.logs/ux-gate/close-report-v2-before-rows.log`, `close-report-v2-before-recovery.log`.
- 기존 `appAccuracy2`의 배선 검사 1줄도 결측 행 보충 후 날짜 고정 정렬을 검증하도록 갱신했다. 최신 시세 미병합 검사는 유지했다. 전체 `node scripts/run-offline-tests.cjs`: **299개 중 297개 통과·2개 파일의 기존 제외 실패 3건**, 지정 제외 외 실패 0. `earningsScenario`의 과거 커밋 범위 비교 2건과 `readCheck`의 기준 커밋 비교 1건이다. `giftShareGate`는 통과했다. 기록: `.logs/ux-gate/results.json`, `final.json`.
- `./node_modules/.bin/tsc --noEmit --incremental false`: 종료 코드 0·오류 0. 기록: `.logs/ux-gate/close-report-v2-tsc.log`, `close-report-v2-status.json`.
- 변경 파일은 앱 `src/app/[locale]/app-view/intel/page.tsx`, 시험 `tests/closingSession.test.ts`·`tests/appClosingRecovery.test.ts`·`tests/appAccuracy2.test.ts`, 이 인계 문서 — 총 5개다. `git diff --check` 통과.

남은 위험: 운영 저장본 20개·실모델 3회 이상 비교와 실기기 알림 검증은 이번에도 미실시이며 운영 세션의 병합 전 과제로 남는다.

## T4b 운영 첫 생성(10/26) 품질 결함 수리 (2026-10-27)

- ① ko «평상시 구조(평상시 구조)»: 모델이 쉬운 말 뒤에 원어를 괄호로 붙이고(«평상시 구조(콘탱고)», 옛 실측 6회 중 3회) 출구 치환 `KO_PLAIN` 이 괄호 안 «콘탱고»까지 바꿔 같은 말이 겹쳤다. 치환 전에 원어 괄호 풀이(`KO_GLOSS`)를 지우고, 지시문에서 «쉬운 말(풀이)» 괄호 예시를 없앴다.
- ② why: 입력 뉴스가 최신순이라 장후 보도가 맨 앞에 있었고, 지시가 «최대 4건 시간순 + 인과 미확인이면 미확인이라 쓰라»뿐이라 장후 보도 나열·«인과 확인 안 됨»으로 시작했다. 프롬프트에는 정규장 시간대 보도를 먼저 보이고(저장 근거·검사 불변), why 를 «가능한 원인 후보 + 확인 수준 + 시장 내부 근거(섹터·VIX·금리 bp·달러·유가·금)»로, 장후 보도는 빼거나 «마감 뒤 소식:» 한 문장으로 분리하게 했다. 참조 검사·정리는 옛 그대로다.
- ③ 섹터 표시명: 입력 섹터 이름이 영어 라벨뿐이었다. `SECTOR_DISPLAY`(앱 상단 카드 `SECTOR_APP_COPY.name` 과 같은 사전, 오프라인 시험이 일치 검사)를 `displayName` 으로 입력에 넣고, 출구에서 ko·ja 글의 영어 섹터 이름을 표시명으로 바꾼다(숫자·괄호 값 불변, 매칭용 `sector` 칸 불변).
- ④ ko·ja 일정 이름의 영어(MoM·Ex Transp 등): 일정 이름 현지화 지시와 예시.
- ⑤ MIXED 배지: 코드 판정 없이 모델이 고르던 값(같은 입력 a55 3회 MIXED, Lambda Sonnet BULLISH). `settleTone` — 두 지수가 같은 방향 ±0.30% 이상이고 VIX 가 반대로 움직이지 않은 날만 MIXED·반대 톤을 판정 방향으로. CAUTIOUS·애매한 날은 모델 판단 그대로. 배지 문구 불변.
- 한국어 서사의 한자·가나(`narrative:ko:script`)를 고침 요청 사유로 추가(실측 8회 중 2회 «美»·«整合», 출구 게이트는 한국어 칸의 가나만 봤다).
- 실측 중 추가로 막은 것: 참조·인용 불일치(본문에서 뺀 장후 참조·같은 출처 다른 시각·지어낸 ID)는 출구에서 고치지 않고(관문 10270904·10270912: 휴리스틱 정리가 장후 원인 서술의 검사를 지웠다) 고침 요청에 «인용하거나 참조에서 빼라»·실제 ID 목록 · «반도체 코어(Silicon Core)» 겹침 정리·음역 별칭(«실리콘 코어» 등) · 일정 이름 현지화를 고침 요청에도 · «판매도»(매도 오탐)·«…の買いです»·뉴스 속 목표가 인용 회피 지시.
- 측정: `~/Documents/signum-work/2026-10-27/close-report-v2/t4b/`(harness.cjs = Vercel 경로 재현, 모델 호출만 비승격 운영 배포 preview/t4b-close-dry 의 `?dry=prompt` → 운영 사다리 ① claude-haiku-5.5, 저장 0 · lambda-sim.cjs = Lambda 경로 Sonnet 4.6 · analyze.cjs). preview 브랜치는 병합 금지.
