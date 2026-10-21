**2026-10-21 운영 세션 직접 수리(관문 3회 보류의 근본 설계) — 아래 옛 «전체 교체 거부» 설명을 대체한다**

정상본 갱신은 `src/services/watchlistBatchMerge.ts`의 «필드 묶음 단위 병합» 하나로 정한다. 원천별 실패 신호에 의존하지 않는다.

- 새 계산에서 묶음 값이 비었고(null·누락) 직전 정상본에 값이 있으며 정당한 소멸이 아니면, 그 묶음의 값과 원천 시각 필드를 직전 정상본 그대로 유지한다. 시각을 새로 찍지 않으므로 옛 값이 새 값처럼 보이지 않는다.
- 묶음: 다크풀(pct·vol·date·source) · 유동성(score·spread) · GEX(gex·netGex·gexM·gammaRegime·gexBasis) · 스퀴즈 · P/C(pcr·optionsAsOf·pcrBasis) · 순프리미엄 · 레벨(4레벨+levels* 메타·levelsRefPrice) · 예상 변동(6필드) · ivSkew · iv(+시각) · atmIv(+시각) · rsi · return3d. 설명 입력(GEX·스퀴즈·P/C·다크풀)을 유지하면 alphaSnapshot(자기 capturedAt)도 함께 유지.
- 정당한 소멸(유지 안 함): GEX·스퀴즈 — 이번 계산이 구조 판본을 실제로 읽음(만기·NO_MARKET·값 없음) · P/C — 이번 계산이 OI 행을 실제로 읽음(신선도 초과·콜/풋 OI 계산 불가)(관문 10211255, `optionMetricsService.onEdition`) · 세션·현재가 표시값(price·changePct·missingFields·session·extended*·vwap·volume·relVol·sparkline 등 — 묶음 표에 없는 필드 전부) · 틱 지표(늘 null) · 레벨: 새 계산이 판본을 읽음(levelsSource 있음=범위 밖 null)·가려짐(levelsStaleReason)·직전 판본 만기 지남·새 가격 기준 정의 위반 · P/C: 직전 행이 지금 기준 신선도 상한 초과 · 예상 변동: 지금 시각 정의·만기 검사 불통과.
- 파생값 whaleIndex(출구와 같은 식)·maxPainDist·wallRangePct 는 유지값·새 가격으로 다시 계산.
- 유지 기록 `held[묶음]=처음 계산 시각`(저장 봉투에만, 응답 본문 아님) · 상한 30분 · 유지 묶음이나 원천 실패(`retry`)가 있는 정상본은 5초 뒤 배경 재계산.
- 원천 실패(timing.failed)여도 병합본을 저장한다 — 장애·세션 전환이 정상본 갱신을 영구히 막지 않는다(관문 10211019). 가격 결측 행은 종전대로 저장하지 않는다.
- 시험: `node tests/watchlistBatchFast.test.js` 26/26(관문 4회 재현: 다크풀·유동성·레벨 예외/빈 Map, PRE→정규장·changePct 복구 3/3 저장, 정당한 소멸 목록, 30분 상한, 원본 응답 18개 바이트 동일).

**결과 요약**

조사 원문 `/Users/eunhoon/Documents/signum-work/codex/out/watchlist-batch-slow.md`를 끝까지 읽었다. 운영 퇴행 원인은 여전히 미확정이다. 확인한 코드의 대기 경로는 옵션 선조회 → 본 처리 → 분석 캐시 재읽기이며, 분석 캐시 읽기는 FINRA·예상 변동 보충도 기다린다. guardian 최신 행은 조건부 추가 조회가 있다.

배치 API에만 마지막 정상본 캐시를 적용했다. 종목·모드·세션별 작업을 합치며, 정상본은 메모리에 최대 1,000개 보관하고 Redis에도 별도 키 `perf:watchlist-batch:v1:<mode>:<ticker>`로 저장한다. Redis TTL은 1시간이지만 응답 허용 나이는 계산 시작 기준 정규장 60초, 장외 10분이다. 정규장 15초·장외 60초가 지나면 정상본부터 반환하고 `after()`에서 갱신한다. 적중으로 수명을 연장하지 않는다. 상한 초과·세션 전환·옵션 만기 경계에서는 동기 계산한다. 조기 폐장·휴장은 기존 달력을 따른다.

실패한 계산·오류 행·가격 결측·확인된 원천 읽기 실패는 정상본을 덮지 않는다. 직전 정상본에서 값이 있던 응답 필드가 새 계산에서 null·누락·빈 문자열·빈 배열·빈 객체로 사라져도 정상본 전체 교체를 거부한다. 중첩 필드도 검사하며 0·false는 유효한 값으로 취급한다. 일부 값을 섞지 않으므로 파생 지표와 필드별 원천 시각, envelope의 at/meta가 모두 기존 판본에 남고 수명도 연장되지 않는다. 지난 세션 Redis 정상본도 완결성 비교용으로만 복원하며 응답의 세션·허용 나이 검사는 그대로 적용한다. Redis 저장 실패도 메모리 정상본을 지우지 않는다. 상한을 넘긴 뒤 계산까지 실패하면 상한을 넘은 정상본을 응답하지 않고 기존 저장본만 보존한다. Redis의 null은 키 부재와 장애를 구분할 수 없어 옵션 구조/행이 없는 계산은 보수적으로 정상본 교체에서 제외한다.

관문 보류 원인은 FINRA·유동성 조회가 예외 대신 빈 결과를 반환하는데 가격 검사만 통과하면 저장했던 것이다. API 배치는 기존 `getDarkPoolBatchChecked`로 실패·미적재와 정상 빈 map을 구분한다. `sessionAwareLiquidity`에는 선택적 `onReadFailure` 관측 인자를 추가했다. 내부 저장본 조회의 HTTP·네트워크·JSON 오류와 미적재·깨진 형태를 배치의 `timing.failed`에 전달한다. 다른 호출자가 먼저 읽어 메모리에 저장한 결측 형태도 실패 표식을 유지한다. 기존 호출자의 반환 형태·캐시 기간·스냅샷 폴백 순서는 유지한다. FINRA 공유 조회 함수 자체는 수정하지 않았다.

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

이번 관문 보류 수정은 `watchlistBatchCache.ts`, `watchlistBatchService.ts`, `intrinioClient.ts`, `tests/watchlistBatchFast.test.js`, 새 시험 `tests/watchlistBatchSources.test.js`, 이 문서의 6개 파일이다. 아래 목록은 앞선 배치 속도 작업을 포함한 누적 범위다.

- `src/app/api/watchlist/batch/route.ts`: 배치 전용 캐시·after·헤더 연결.
- `src/services/watchlistBatchCache.ts`: 정상본·Redis 복원·신선도·동시 작업 합치기.
- `src/lib/watchlistBatchTiming.ts`: 요청별 계측과 헤더 형식.
- `src/services/watchlistBatchService.ts`: API 전용 진입점·같은 요청 자료 재사용·구간 측정.
- `src/services/optionAlphaService.ts`: 이미 확보한 분석 판본을 받는 선택 인자 추가.
- `src/services/optionMetricsService.ts`: 원천 실패를 관측하는 선택 콜백 추가. 반환 지표는 동일.
- `src/services/intrinioClient.ts`: 유동성 저장본 조회 실패를 선택적으로 관측하고 결측 형태의 메모리 캐시에도 실패 표식을 보존.
- `tests/watchlistBatchFast.test.js`, `tests/fixtures/watchlistBatchBefore.json`: 실제 서비스·라우트·분석 캐시 전처리와 원본 커밋의 합성 응답 비교.
- `tests/watchlistBatchSources.test.js`: 실제 FINRA·유동성 조회 코드의 실패 신호, 기존 호출자 반환값, 복구·원천 날짜 검증.
- 이 보고서.

공유 함수 호출자 영향:

| 공유 함수 | 확인한 호출자 | 영향·시험 |
|---|---|---|
| `processWatchlistBatch` | 웹 watchlist SSR, watchlistAiLineService | 기존 진입점과 재조회 동작 유지. 별도 회귀 확인 |
| `processWatchlistBatchForApi` | watchlist/batch API | 캐시 계산과 분석 재사용은 이 경로에만 적용 |
| `readOptionAlpha` | 배치, 포트폴리오, Command unified, live/ticker | 선택 인자 없는 호출자는 종전 조회 유지. 공유 데이터 경계 회귀 |
| `readOptionMetrics` / `readOptionEditions` | 배치, 포트폴리오, app/options-latest, Command unified, intel/fast, intel/fast-all, live/ticker, live/short-squeeze, undercurrent/shared, 두 함수 간 위임 | API만 실패 콜백 사용. 다른 호출자의 조회·캐시 선택·지표값 유지. 공유 데이터 경계 및 옵션 지표 캐시 회귀 |
| `sessionAwareLiquidity` | watchlistBatchService, intel/fast API; intrinioVwap 시험 | 배치 API만 선택적 실패 관측. intel/fast와 SSR·AI 재료는 기존 반환값·폴백 유지. 실제 원천 함수의 관측 유무 비교, intrinioVwap·공유 경계 회귀로 확인 |
| `loadLastRegLiquidity` (비공개) | `sessionAwareLiquidity` 1곳 | 실패를 숨기던 `{}` 반환을 바꾸지 않고 관측 신호 추가. 결측 형태를 메모리에 저장한 경우도 실패 표식 보존 |

**돌린 시험과 결과**

전체 타입 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit` 종료 코드 0. 전체 빌드는 실행하지 않았다. 시험의 Redis·DynamoDB·벤더 조회와 쓰기는 모두 합성 저장소로 대체했다. `.env*`·브라우저·운영 API는 사용하지 않았다.

| 시험 | 결과 |
|---|---|
| 배치 전용 오프라인 시험 `node tests/watchlistBatchFast.test.js` | 기존 13건 + 추가 5건 = 18/18 통과 |
| 실제 원천 실패 관측 `node tests/watchlistBatchSources.test.js` | 14/14 통과 |
| 원본 `df149853d`의 실제 분석 캐시 전처리를 포함한 응답 스냅샷 | 18/18 JSON 바이트 일치, 분석 조회 2→1 |
| 정상본 메모리 적중 | Redis·DynamoDB·시세 호출 각각 0회 |
| 동시 10요청 만료 처리 | 응답 전 추가 조회 0회, after 갱신 1회 |
| Redis 정상본 복원·상한 초과·실패 보존·장중/장외·조기폐장·휴장·서머타임 | 위 18개 시험에 포함, 통과 |
| 공유 데이터 경계 `tests/integrityStructUnify.test.js` | 85/85 통과 |
| 공유 유동성 폴백·가격 회귀 `tests/intrinioVwap.test.ts` | 35/35 통과 |
| 옵션 지표 캐시 `tests/optionMetricsCache.test.ts` | 15/15 통과 |
| 옵션 레벨 정의 `tests/optionLevelGate.test.ts` | 61/61 통과 |

시험 합계 228개 통과. 수리 전 예외 없는 FINRA·유동성 실패를 각각 주입해 정상본 훼손(40→null, 80→null)을 재현했다. 수리 뒤 메모리·Redis 정상본과 전체 원천 시각 보존, 복구 뒤 정상 갱신을 확인했다. 실패 신호 없는 필드 결측·빈 값, 정상값 0, 상한·세션 경계 뒤 비교도 확인했다. 원본 스냅샷은 합성 입력·고정 시계로 생성했으며 운영 응답을 복사한 것이 아니다. 전체 tsc는 최종 제품 코드에 1회만 실행해 종료 코드 0을 확인했다. 관련 시험도 lockf 아래 직렬 실행했다.

**남은 위험**

운영 p50/p95 개선치는 미측정이며 기준선 회복을 확정할 수 없다. 운영 배포와 헤더 수집은 운영 세션의 후속 작업이다. 배경 갱신 합치기는 같은 서버 인스턴스 안에서 보장한다. 서로 다른 인스턴스가 동시에 만료를 발견하면 중복 계산할 수 있으며 Redis에 대한 분산 잠금은 추가하지 않았다. 메모리가 빈 인스턴스는 Redis 읽기 1회가 필요하다. 원천 자료 자체의 수집 지연은 응답 정상본 캐시가 해결하지 않는다.

정상적인 원천 결측에도 직전 값이 사라지면 보수적으로 교체를 거부하므로, 완결성 회복 전에는 허용 나이 초과 후 동기 계산이 늘 수 있다. 유동성 원천의 기존 30분 로컬 캐시 기간은 유지한다. 미적재·깨진 형태가 이미 로컬 캐시에 들어갔다면 그 기간 동안 실패 표식을 보존하며 정상본 교체를 막는다.

push·main 병합·배포·운영 데이터 쓰기는 수행하지 않았다.

이번 보류 수정의 커밋 범위는 `fix/watchlist-batch-fast`의 위 6개 파일이다. `git add`는 `/Users/eunhoon/.gemini/antigravity/scratch/stock2/.git/worktrees/fix-watchlist-batch-fast/index.lock` 생성에서 `Operation not permitted`로 거부됐다. 이 실행 환경에서 해당 worktree Git 디렉터리에 쓸 수 없음을 확인했으며, 스테이징·커밋은 생성되지 않았다. 이 세션은 권한 상승을 지원하지 않는다. 운영 세션에서 이 6개 파일을 커밋해야 한다. 제안 제목: `fix: 관심종목 배치 원천 결측 시 정상본 보존`.
