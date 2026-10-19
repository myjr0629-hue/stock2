결과 요약

- 두 관문 기록(10190849·10191217), 원 지시서, SESSION-MATRIX-CODEX를 읽었다.
- 원인: v1은 같은 원천 시각의 값을 무조건 거절했고, GET/비교/SET이 분리돼 동시 저장에서 과거 응답이 최신 정상본을 덮을 수 있었다.
- fix/atomic-archive-save(18abe887b)의 공용 함수·시험을 가져왔다. Git 병합은 ORIG_HEAD.lock 생성이 샌드박스에서 Operation not permitted로 실패했다. 브랜치 전체 병합·커밋은 하지 않았다.
- 공용 함수에 선택적 revision과 무만료 저장을 보완했다. sourceTime이 항상 우선이며, 같은 원천 시각·같은 correction 상태에서만 revision을 비교한다. revision 생략=0으로 기존 호출 계약을 유지한다.
- 지수 v2는 Upstash 한 곳에서 EVAL로 비교·저장한다. 기존 EC2 HTTP 프록시는 EVAL/WATCH 미지원이므로 원자 저장에 사용하지 않는다. 오류 후 다른 Redis로 쓰지 않는다. v1은 읽기 대체 경로로 유지한다.
- revision은 공급사 원천 시각과 별개인 수집 요청 시작 시각(ms)이다. live/v2/API 메모리/대시보드 localStorage까지 보존한다. 오래된 원천 시각을 revision으로 승격하지 않는다. 같은 원천의 기준 종가 정정과 실제 0을 모두 저장한다.
- 크론은 보관본 쓰기 실패를 ARCHIVE_WRITE_FAIL/fail로 보고한다. Upstash 자동 재시도는 끄고 각 요청에 3초 제한을 둔다.
- 라벨·문구·표시 방식 변경 없음. 브라우저·운영 API·운영 Redis 접근, .env 파일 열람, push·배포·커밋 없음.

바꾼 파일

- src/lib/atomicArchiveSave.ts: 공용 원자 저장, revision·무만료 옵션.
- src/services/indexArchiveStore.ts: 지수 전용 단일 저장소 어댑터, v2 키.
- src/app/api/cron/market-feed/route.ts: 원자 저장 호출과 실패 보고.
- src/app/api/market/index-close/route.ts: v2/v1/live/메모리 복원.
- src/lib/indexCloseSnapshot.ts: sourceTime 우선·동일 원천 revision 비교.
- src/lib/dashMarketSnapshot.ts: 개정 순서 메타데이터 보존.
- tests/atomicArchiveSave.test.ts, tests/helpers/indexArchiveMemory.ts, tests/indexSectorSnapshot.test.ts: 프로토콜 모의·관문 재현·회귀 시험.
- 이 보고서.

공유 함수 호출자와 영향

- atomicArchiveSave: 운영 호출자는 indexArchiveStore.saveIndexArchive 하나. 기본 sourceTime/sessionDate/correction 비교 시험도 유지한다.
- indexCloseSnapshot: market-feed, indexArchiveStore, resolveIndexClose. 유효 값 검증은 유지하고 revision만 선택적으로 전달한다.
- resolveIndexClose: index-close API와 dashMarketSnapshot.buildIndexItems. 원천 시각 우선, 같은 원천에서는 개정 순서가 뒤인 값 보존.
- buildIndexItems: app-view/dash의 초기화·두 폴링 경로. localStorage 왕복 때도 revision을 보존하며 UI를 바꾸지 않는다.
- index-close API 직접 소비자: app-view/dash, app-view/guardian, MobileGuardianPage, OracleHeader, signum-warm. 기존 price/changePct/updatedAt/null 형태를 유지하고 revision만 선택적으로 추가한다. 저장소 src 전역에서 호출자를 검색했다. 기존 웹 dashboard/flow 경로에는 직접 호출이 없고, 별도 웹 command 디렉터리는 없다. marketBackdropLoader 등 기존 Yahoo 캐시 직접 소비자는 live 시세 형태가 유지되므로 숫자 필드 계약에 변경이 없다.

돌린 시험과 결과

- 최종 동작 시험 82개 통과, 실제 Redis Lua 1개 건너뜀: indexSectorSnapshot 23/23, atomicArchiveSave 오프라인 21/21, indexQuoteReconcile 20/20, marketRiskSectors 9/9, marketRiskScore 9/9.
- 제한 타입 검사: 공용 함수·지수 저장 어댑터·스냅샷·메모리 프로토콜은 오류 없음. 실제 Redis 시험의 ioredis 어댑터에서 SET 오버로드 타입 오류 1개를 확인해 명시적 어댑터로 수정. 해당 시험·공용 함수 범위만 재검사하여 0 diagnostics 확인.
- git diff --check 통과.
- 초회 묶음 중 indexSectorSnapshot/indexQuoteReconcile은 tsconfig-paths 등록 누락으로 실행 실패. 경로 별칭을 등록한 뒤 두 파일을 재실행해 통과했다. 통과한 위험 점수·섹터 시험은 반복하지 않았다.
- 이후 추가 시험 재실행은 대시보드 개정 보존·보관본 읽기 실패·무만료 EVAL 인자 검증을 추가한 파일에 한정했다.
- 모든 시험/타입 검사 명령은 /usr/bin/lockf -k /tmp/signum-heavy.lock으로 감쌌다. 전체 tsc/next build는 실행하지 않았다.
- 두 관문 재현: 10/16 가격 110 다음 10/15 가격 100, 같은 원천의 110/110→110/100→110/110, 과거 저장을 멈춘 사이 최신 저장 완료 후 과거 저장 재개. 각각 live 만료·새 API 인스턴스 복원을 포함한다. 동시 저장은 날짜 역전/동일 거래일 과거 틱/동일 원천의 정정 역전까지 강제한다.
- 실제 Lua 시험은 로컬 redis-server 부재로 건너뛴다. 메모리 시험의 저장 순서 판정은 모의 구현이 아니라 공용 함수의 운영 WATCH 경로를 실행한다. 모의 저장소는 버전 충돌만 구현한다.

남은 위험

- Git 브랜치 병합 자체는 권한 제한으로 미완료. 운영 통제 세션에서 공용 브랜치 병합 및 이 보완분 통합이 필요하다.
- 실제 Upstash EVAL 권한·통신·운영 잔존 데이터와 실제 단말은 미확인. Upstash를 사용할 수 없으면 v1/live/메모리 읽기로 복원하며 새 v2 보관본 쓰기는 실패로 보고한다.
- revision은 공급사 개정 번호가 아니라 요청 시작 시각이다. 서로 다른 인스턴스의 시계 오차나 같은 ms의 동일 원천 충돌까지 공급사 개정 순서를 확정하지는 못한다. sourceTime 역전 방지는 이와 독립적이다.
- 기존 원천 날짜의 새 화면 표식은 대표 결정이 남아 있다.

재현 명령(외부 서비스 접속 없음)

```sh
NODE_PATH=/Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' /usr/bin/lockf -k /tmp/signum-heavy.lock node -r /Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules/ts-node/register/transpile-only -r /Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules/tsconfig-paths/register --test --test-concurrency=1 tests/indexSectorSnapshot.test.ts tests/atomicArchiveSave.test.ts tests/indexQuoteReconcile.test.ts tests/marketRiskSectors.test.ts tests/marketRiskScore.test.ts
```
