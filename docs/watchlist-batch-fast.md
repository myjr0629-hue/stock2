**결과 요약**

조사 원문 `/Users/eunhoon/Documents/signum-work/codex/out/watchlist-batch-slow.md`를 끝까지 읽었다. 운영 퇴행 원인은 여전히 미확정이다. 확인한 코드의 대기 경로는 옵션 선조회 → 본 처리 → 분석 캐시 재읽기이며, 분석 캐시 읽기는 FINRA·예상 변동 보충도 기다린다. guardian 최신 행은 조건부 추가 조회가 있다.

배치 API에만 마지막 정상본 캐시를 적용했다. 종목·모드·세션별 작업을 합치며, 정상본은 메모리에 최대 1,000개 보관하고 Redis에도 별도 키 `perf:watchlist-batch:v1:<mode>:<ticker>`로 저장한다. Redis TTL은 1시간이지만 응답 허용 나이는 계산 시작 기준 정규장 60초, 장외 10분이다. 정규장 15초·장외 60초가 지나면 정상본부터 반환하고 `after()`에서 갱신한다. 적중으로 수명을 연장하지 않는다. 상한 초과·세션 전환·옵션 만기 경계에서는 동기 계산한다. 조기 폐장·휴장은 기존 달력을 따른다.

실패한 계산·오류 행·가격 결측·확인된 원천 읽기 실패는 정상본을 덮지 않는다. Redis 저장 실패도 메모리 정상본을 지우지 않는다. 상한을 넘긴 뒤 계산까지 실패하면 상한을 넘은 정상본을 응답하지 않고 기존 저장본만 보존한다. Redis의 null은 키 부재와 장애를 구분할 수 없어 옵션 구조/행이 없는 계산은 보수적으로 정상본 교체에서 제외한다.

배치 API 전용 계산 진입점은 이미 읽은 분석 판본과 요청 안에서 새로 계산한 판본을 재사용한다. 기존 알파 재읽기가 적용하던 FINRA 입력 보충도 같은 요청의 자료로 유지한다. 계산 정의·가격·레벨 게이트·화면·라벨은 수정하지 않았다. 원천 시각·세션 날짜와 기존 JSON 필드도 갱신 시각으로 바꾸지 않는다. 서로 다른 묶음에서 만든 행을 합칠 때 기존 meta의 count는 요청 수, elapsed/levelsWaitMs는 포함된 계산들의 최대값, cached는 논리곱으로 구성한다.

응답 본문과 별개인 `Server-Timing` 헤더:

| 항목 | 의미 |
|---|---|
| `batch_options` | 옵션 선조회 밀리초 |
| `batch_main` | 보충 구간을 제외한 본 처리 밀리초 |
| `batch_alpha` | 알파 판본 선택·출구 처리 밀리초 |
| `batch_fill` | 유동성·FINRA·AWS 결측 보충·레벨 출구 대기 밀리초 |
| `batch_json` | 응답 JSON 직렬화 밀리초 |
| `batch_cache` | 메모리/Redis 적중·유효한 만료본·동기 계산·배경 갱신 예약 종목 수 |
| `batch_analysis` | 분석 캐시 적중·자가복구·AWS 보충 분기 종목 수와 읽기 실패 여부 |

캐시 적중 응답의 계산 구간은 0이다. 배경 갱신은 응답 뒤 실행하므로 그 계산 시간은 해당 응답 헤더에 포함되지 않는다. 기존 meta.elapsed는 저장본을 만들 때의 값으로 보존한다.

**바꾼 파일**

- `src/app/api/watchlist/batch/route.ts`: 배치 전용 캐시·after·헤더 연결.
- `src/services/watchlistBatchCache.ts`: 정상본·Redis 복원·신선도·동시 작업 합치기.
- `src/lib/watchlistBatchTiming.ts`: 요청별 계측과 헤더 형식.
- `src/services/watchlistBatchService.ts`: API 전용 진입점·같은 요청 자료 재사용·구간 측정.
- `src/services/optionAlphaService.ts`: 이미 확보한 분석 판본을 받는 선택 인자 추가.
- `src/services/optionMetricsService.ts`: 원천 실패를 관측하는 선택 콜백 추가. 반환 지표는 동일.
- `tests/watchlistBatchFast.test.js`, `tests/fixtures/watchlistBatchBefore.json`: 실제 서비스·라우트·분석 캐시 전처리와 원본 커밋의 합성 응답 비교.
- 이 보고서.

공유 함수 호출자 영향:

| 공유 함수 | 확인한 호출자 | 영향·시험 |
|---|---|---|
| `processWatchlistBatch` | 웹 watchlist SSR, watchlistAiLineService | 기존 진입점과 재조회 동작 유지. 별도 회귀 확인 |
| `processWatchlistBatchForApi` | watchlist/batch API | 캐시 계산과 분석 재사용은 이 경로에만 적용 |
| `readOptionAlpha` | 배치, 포트폴리오, Command unified, live/ticker | 선택 인자 없는 호출자는 종전 조회 유지. 공유 데이터 경계 회귀 |
| `readOptionMetrics` / `readOptionEditions` | 배치, 포트폴리오, app/options-latest, Command unified, intel/fast, intel/fast-all, live/ticker, live/short-squeeze, undercurrent/shared, 두 함수 간 위임 | API만 실패 콜백 사용. 다른 호출자의 조회·캐시 선택·지표값 유지. 공유 데이터 경계 및 옵션 지표 캐시 회귀 |

**돌린 시험과 결과**

전체 타입 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit` 종료 코드 0. 전체 빌드는 실행하지 않았다. 시험의 Redis·DynamoDB·벤더 조회와 쓰기는 모두 합성 저장소로 대체했다. `.env*`·브라우저·운영 API는 사용하지 않았다.

| 시험 | 결과 |
|---|---|
| 배치 전용 오프라인 시험 `node tests/watchlistBatchFast.test.js` | 13/13 통과 |
| 원본 `df149853d`의 실제 분석 캐시 전처리를 포함한 응답 스냅샷 | 18/18 JSON 바이트 일치, 분석 조회 2→1 |
| 정상본 메모리 적중 | Redis·DynamoDB·시세 호출 각각 0회 |
| 동시 10요청 만료 처리 | 응답 전 추가 조회 0회, after 갱신 1회 |
| Redis 정상본 복원·상한 초과·실패 보존·장중/장외·조기폐장·휴장·서머타임 | 위 13개 시험에 포함, 통과 |
| 공유 데이터 경계 `tests/integrityStructUnify.test.js` | 85/85 통과 |
| 옵션 지표 캐시 `tests/optionMetricsCache.test.ts` | 15/15 통과 |
| 옵션 레벨 정의 `tests/optionLevelGate.test.ts` | 61/61 통과 |

시험 합계 174개 통과. 원본 스냅샷은 합성 입력·고정 시계로 생성했으며 운영 응답을 복사한 것이 아니다. 전체 타입 검사 기록과 최종 소스 해시를 대조했고, 마지막 보충 코드를 수정한 `watchlistBatchService.ts`는 같은 lockf 아래 TypeScript API로 구문·의미 진단을 별도 수행해 0개를 확인했다. 전체 tsc는 1회만 실행했다. 관련 시험도 lockf 아래 직렬 실행했다.

**남은 위험**

운영 p50/p95 개선치는 미측정이며 기준선 회복을 확정할 수 없다. 운영 배포와 헤더 수집은 운영 세션의 후속 작업이다. 배경 갱신 합치기는 같은 서버 인스턴스 안에서 보장한다. 서로 다른 인스턴스가 동시에 만료를 발견하면 중복 계산할 수 있으며 Redis에 대한 분산 잠금은 추가하지 않았다. 메모리가 빈 인스턴스는 Redis 읽기 1회가 필요하다. 원천 자료 자체의 수집 지연은 응답 정상본 캐시가 해결하지 않는다.

push·main 병합·배포·운영 데이터 쓰기는 수행하지 않았다.

커밋은 환경 권한으로 막혔다. `fix/watchlist-batch-fast`에서 위 9개 파일을 명시해 `git add`를 실행했으나 `/Users/eunhoon/.gemini/antigravity/scratch/stock2/.git/worktrees/fix-watchlist-batch-fast/index.lock` 생성이 `Operation not permitted`로 거부됐다. 스테이징·커밋은 생성되지 않았다. 이 세션은 권한 상승을 지원하지 않는다. 파일은 작업공간에 저장돼 있으며, 운영 세션에서 이 브랜치의 9개 파일을 커밋해야 한다. 제안 커밋 제목: `fix: 관심종목 배치 정상본 캐시와 응답 계측`.
