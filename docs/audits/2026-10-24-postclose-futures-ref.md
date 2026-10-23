# POST 선물의 현물 마감 기준 관측

- 작업 브랜치: `feat/postclose-futures-ref`, 시작 코드 `51a0deea6`.
- 원인: `buildMarketIndexBasis`가 장후 변화율·기준 시각을 항상 null로 설정했다. Tactical은 기준 시각의 ET 분이 정확히 마감 분이어야 허용했으므로 15:59 관측도 사용할 수 없었다.
- 화면 컴포넌트·라벨·프롬프트·문장 검사 계약은 변경하지 않았다.

## 수집과 계산

- `runMarketFeed`의 기존 Yahoo 캐시 쓰기 성공 뒤 NQ=F·ES=F 관측만 사용한다. 공급사 요청을 추가하지 않는다.
- `marketTime`이 `sessionCloseMinutes` 직전/정각/직후 분(통상 15:59~16:01, 조기 폐장 12:59~13:01)에 속할 때 저장 후보로 삼는다. 수집 시점보다 미래이거나 3분 넘게 지연된 관측, 가격 결측·비정상, DEFAULT, 20분 넘게 가격 변화가 없는 피드는 제외한다.
- 날짜별 키는 `yahoo:cash-close:nq:YYYY-MM-DD`, `yahoo:cash-close:es:YYYY-MM-DD`. 값은 심볼·세션 날짜·실제 관측 가격·실제 관측 ISO 시각이다. TTL 인수는 86400초이며 기존 `setInCache`의 ±10% TTL jitter 정책을 따른다.
- 같은 날에는 마감 정각에 더 가까운 후보만 갱신한다. 거리 동률은 더 이른 체결을 선택하고 같은 체결 시각의 가격을 다시 쓰지 않는다. 후보 구간 이후에는 기준을 갱신하지 않는다.
- 저장 실패는 해당 선물을 `failed`에 남겨 기존 EC2/Vercel 넘김 경로가 재시도하도록 한다. EC2의 `verifyRead`가 있으면 기존 기준·새 기준 모두 주 저장소에서 같은 가격·시각인지 재확인한 뒤 성공 표식을 허용한다.
- `loadMarketIndexBasis`는 마지막으로 완료된 현물 세션 날짜의 기준 키 2개를 추가로 읽는다. 캐시 쓰기나 공급사 호출은 없다.
- `buildMarketIndexBasis`의 선택 인수로 기준을 넘긴다. 같은 심볼·완료 세션·유한한 양수 가격·마감과 3분 이내·현재 체결보다 과거 기준일 때만 `(현재 선물 / 기준 선물 - 1) * 100`을 계산한다. 실제 기준 시각을 `cashCloseReferenceAt`으로 보존한다. 기존 정산 대비 `changePct`는 그대로다.
- Tactical POST/CLOSED는 같은 날짜·3분 경계를 다시 검사한다. 기준 결측·불량은 기존 `종가 이후 선물 변화 미확인` 경로를 유지한다. 현재 선물의 기존 LIVE·20분 신선도 조건도 유지한다.

## 공유 함수 호출자와 영향

- `buildMarketIndexBasis`: 운영 직접 호출자는 `src/services/marketIndexBasis.ts` 하나. 기준 인수를 생략하는 기존 시험은 기존 null 계약을 유지한다. 현물·Guardian 판정·공통 정산 대비 숫자는 바뀌지 않는다.
- `loadMarketIndexBasis`: `macroHubProvider.getMacroSnapshotSSOT`와 `unifiedDataStream`의 지수 보충 경로가 호출한다. 조회마다 Redis 기준 키 2개를 추가로 읽으며, 기준이 없거나 읽기에 실패하면 null을 유지한다.
- `buildIndexFacts`: `tacticalPrompt.buildTacticalPrompt`, `unifiedDataStream`의 복구·공유 입력 생성 경로 2곳, `intelligenceNode`의 Tactical 재검사 경로, `scripts/tactical-v3-compare.cjs`의 입력 정규화·세션 파생 경로가 호출한다. POST/CLOSED 기준 허용 범위만 바뀐다. PRE 정산 대비·REG 현물 우선 계약은 유지한다.
- `runMarketFeed`: `scripts/ec2-cron/market-feed-worker.ts`와 `/api/cron/market-feed`가 호출한다. 기존 Yahoo 요청 수·기본 시세 키·TTL·lastChangeAt 규칙은 그대로다. 기준 저장 실패는 실패 심볼 목록에 반영된다.

## 검증

- 추가 시험 `futuresCashClose.test.ts`: 정상·조기 폐장, DST 시작/종료 전후 거래일, 마감 UTC 시각, NQ/ES 분리, 가장 가까운 실제 관측·동률·정각 개선·동일 체결 불변, TTL 인수, 기준 결측·다른 심볼/날짜·비정상 가격·미래·3분 경계, 오래되거나 정체된 피드, 캐시 읽기 실패, 기존 수집 배선의 공급사 추가 호출 0, 저장 실패 재시도, ko/en/ja POST 첫 문장 계약을 검증한다.
- 기존 제외 대상: `earningsScenario.test.cjs`, `readCheck.test.cjs`, `giftShareGate.test.ts` (이전 감사 문서의 지정 목록).
- `tacticalV3Compare.test.cjs`는 origin/main이 이미 Tactical v3(51a0deea6)인데도 v2의 내부 출처·개별 기업 뉴스 허용 및 숫자 없는 첫 문장을 기대해 실패했다. 실제 실패를 확인한 뒤 현재 main의 명시적 거절·첫 문장 계약으로 기대값을 갱신했다. 비교 스크립트·프롬프트·운영 검사는 바꾸지 않았다.
- 추가 단일 시험은 종료 0으로 정상·조기 폐장·DST·결측·실제 수집 모의 및 3언어 POST 계약을 통과했다.
- 수정한 `tacticalV3Compare.test.cjs` 단일 재검사 종료 0. 모델 호출은 모의이며 실모델 호출은 없다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node --require ./scripts/offline-test-preload.cjs node_modules/typescript/bin/tsc --noEmit --incremental false`: 한 번 실행, 종료 0·오류 0. 로그 `/tmp/signum-futures-tsc.log` 0바이트.
- 전체 `scripts/run-offline-tests.cjs`: 공용 잠금 아래 기존 지정 3개를 제외한 모든 시험 파일을 한 번 실행했다. **308/308 파일 통과, 실패 0, 종료 0**. 실행 요약 `/tmp/signum-futures-offline.log`, 상세 `.logs/ux-gate/recheck.json` 및 개별 로그. `futuresCashClose.test.ts`·`tacticalV3Compare.test.cjs`·기존 시장 세션·Guardian·POST·EC2 넘김 회귀가 모두 이 실행에 포함됐다.
- 수정 파일의 `git diff`와 신규 파일의 `git diff --no-index /dev/null <파일>`로 물리 저장을 확인했다. tracked/new 파일 모두 `git diff --check` 통과. 화면·프롬프트·비교 스크립트 diff 0.

## 바꾼 파일

- `src/lib/futuresCashClose.ts`: 마감 후보·기준 검증·가까운 관측 선택.
- `src/services/futuresCashClose.ts`: 날짜별 기준 저장·주 저장소 재확인.
- `src/services/jobs/marketFeedJob.ts`: 기존 수집 관측의 기준 저장 배선·실패 표식.
- `src/lib/marketIndexBasis.ts`: 검증된 기준으로 장후 변화율 계산.
- `src/services/marketIndexBasis.ts`: 기준 키 읽기.
- `src/lib/ai/tacticalIndexFacts.ts`: POST/CLOSED 실제 기준 관측의 3분 허용 오차.
- `tests/futuresCashClose.test.ts`: 새 경로의 오프라인 재현.
- `tests/tacticalV3Compare.test.cjs`: main의 v3 병합 후 비교 시험 기대값 교정.
- `docs/audits/2026-10-24-postclose-futures-ref.md`: 호출자·검증·운영 확인점·실모델 비교 명령.

## 운영 세션에서 남은 확인

- 이번 작업에서 커밋·push·main 병합·배포·운영 읽기/쓰기·브라우저 접근·실모델 호출은 하지 않는다.
- 기준은 실제 마감 관측이 수집된 뒤부터 생긴다. 과거 정산 대비 수치를 기준으로 보충하지 않는다.
- 기준의 read/compare/write는 기존 Redis 인터페이스를 사용하며 분산 CAS가 아니다. EC2와 Vercel이 장애 전환 중 같은 심볼을 동시에 수집하면 더 먼 후보가 마지막에 저장될 가능성이 있다. 기존 EC2 중복 실행 방지·성공 표식 넘김은 유지하지만 이 경합을 원자적으로 막지는 않는다.
- Claude 운영 세션에서 인증 환경을 프로세스로 주입하고 실제 PRE/REG/POST 입력을 각각 확보한 뒤 비교한다. POST 입력에 유효한 `cashCloseReferenceAt`·`sinceCashClosePct`가 들어 있는지 먼저 확인한다. 실입력 확인에는 `--derive-sessions`를 사용하지 않는다.

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/tactical-v3-compare.cjs \
  --snapshot /tmp/tactical-PRE.json --snapshot /tmp/tactical-REG.json --snapshot /tmp/tactical-POST.json \
  --baseline-live --out /tmp/tactical-postclose-futures-compare.md
```

`origin/main`이 비교 기준이다. 비교 시점의 기준 SHA는 보고서에 기록된다. 위 명령은 실모델을 호출하고 로컬 보고서만 저장한다. 환경 파일을 읽지 않고 Redis/DB에는 쓰지 않는다.

이번 변경의 프롬프트는 main과 같다. 비교 스크립트는 양쪽에 같은 정규화 입력을 전달하므로 모델 문장 계약을 확인하는 용도이며, 출력 차이를 기준 수집 정확성의 증거로 삼지 않는다. 실제 마감 관측·기준 키·현재 선물 가격에서 계산한 변화율 확인은 별도로 필요하다.
