# EC2 워커 UTF-8 청크 경계 수리 — 2026-10-24

## 결과와 원인

- 사용자 제공 운영 관측: Tactical v3 반영 직후 /ko 가디언 AI 글의 한글·일본어 글자가 호출마다 다른 위치에서 누락됨. 이 작업에서는 운영에 접속하지 않음.
- 로컬 확인: Node HTTP 응답의 data 이벤트는 기본적으로 Buffer를 전달한다. 문자열에 청크를 바로 더하면 각 Buffer가 독립적으로 UTF-8 디코딩되어, 청크에 걸친 3바이트 글자가 U+FFFD로 바뀐다. 이후 U+FFFD 삭제가 글자 누락으로 이어진다.
- 워커 fetchJSON·postJSON은 Buffer 배열 → Buffer.concat → toString('utf8')로 수정했다. 바이트 제한이 있는 source-parity-worker.readJson도 같은 방식으로 수정해 256 KiB 제한을 유지했다.
- 다른 텍스트 스트림은 setEncoding('utf8')로 상태를 유지하며 디코딩한다. HTTP 응답 외 동일 결함인 요청 본문·표준 입출력 수집도 포함했다.
- 수리: 코드 86개 파일, 스트림 123개(UTF-8 디코더 120개 + Buffer 수집 3개). 추가로 scripts/hud/README-v2.md의 stdin 예제 1곳을 고쳤다.
- src/lib/push/send.ts:110 및 sendSignal.ts:52는 이미 setEncoding('utf8')를 사용한다. src/에는 같은 결함의 추가 수정이 없다. 기존 Buffer 수집·ZIP 바이너리 스트림은 검사 후 유지했다.
- 배포 스크립트의 문자열 안에 든 Lambda 생성 코드도 검색·수정했다. 배포 스크립트는 실행하지 않았다.

## 검증

- tests/httpUtf8Collectors.test.js: ko·ja JSON의 모든 바이트 경계 + 1바이트 청크, GET·POST × HTTP·HTTPS 1,336회 원문 보존. 기존 방식의 오·中 1+2 및 2+1 바이트 분할 손상과 삭제를 재현함.
- 같은 시험에서 JSON 오류·요청 오류·시간초과·POST 비정상 상태·Content-Length 바이트 수·독립 수집기 256 KiB 바이트 상한을 확인함.
- 수정한 코드 파일 86개 구문 검사 통과. 생성 문자열 포함 실제 추가된 디코더 식 120개를 1바이트 ko·ja 청크로 시험해 원문 보존 확인. scripts/·src/의 남은 raw data 콜백 점검에서 디코더 없는 문자열 누적 0개(바이트 수 누적은 제외).
- source-parity 기존 시험: 22개 통과(외부 통신·운영 쓰기 없음).
- 전체 오프라인 시험 1회: 지정한 earningsScenario·giftShareGate·readCheck 3개를 제외하고 308개 실행, 최초 304개 통과·4개 실패. 아래 시험 수정 후 실패 4개만 공용 lockf 잠금으로 재검증해 모두 통과. 최종 308/308개 통과·실패 0개(.logs/ux-gate/recheck.json).
- tsc --noEmit: 오류 0개, 종료 코드 0. 전체 오프라인 시험과 타입 검사는 /usr/bin/lockf -k /tmp/signum-heavy.lock 안에서 순차 실행했다. 전체 묶음과 tsc는 반복하지 않았다.
- hubLast·priceTimeBasis: 가짜 HTTP 응답이 스트림 API를 제공하지 않아 실패하므로 PassThrough + Buffer 응답으로 수정했다. 실제 수집 코드의 setEncoding 동작과 REST 후속 가격·시각 흐름을 검사한다.
- tickerPayload: 진단 스크립트의 소스 동일성 검사가 UTF-8 디코더 추가를 요청 계약 변경으로 판단했다. 정확히 setEncoding('utf8').on('data', …) 추가만 정규화하고 기존 URL·체인 검사는 유지했다.
- tacticalV3Compare: 이동한 origin/main이 이미 v3라 옛 계약도 내부 출처명을 거부했다. 시험의 git 의존성만 v3 병합 직전 커밋 0b6afec9ffbaeac3844b8ff7874bc20cc06bdc29로 고정해 옛/새 계약 비교를 복원했다. 운영 비교 도구·프롬프트는 변경하지 않았다.

## U+FFFD 정책 검토 — 이번에는 변경 없음

- src/app/api/debug/guardian/route.ts의 stripMojibake는 가디언 스냅샷 문자열을 재귀적으로 삭제 정리하며 GuardianProvider의 HTTP refresh, 워커 수집, cron/harvest-history가 이 출구를 사용한다. src/components/guardian/GuardianProvider.tsx의 mergeSnapshot은 WebSocket verdict 문자열에서도 U+FFFD를 삭제한다.
- src/services/redisClient.ts의 isMojibake는 이미 손상 값을 감지해 다른 저장소로 폴백한다. textIntegrityReasons와 outputGate·tacticalPrompt·intelligenceNode 등에는 손상 문자 탈락 검사가 존재한다.
- 검토 의견: 생성·저장 전에 손상된 글 전체를 탈락시키고 기존 재시도 상한 안에서 재요청하는 편이 적절하다. 표시 단계에서 무제한 재요청하면 비용·동시 호출이 늘므로, 마지막 정상 글과 기존 데이터 기반 폴백 정책에 연결해야 한다. 스냅샷 전체 탈락이나 칸 숨김으로 확대하지 않아야 한다.
- 이번 수리는 전송 디코딩에 한정한다. 이미 삭제·저장된 글자는 복원되지 않는다. 잘못된 원본 UTF-8 및 기존 캐시의 U+FFFD도 별도 정책 검토 대상이다.

## 운영 세션의 EC2 재배포 참고 — 미실행

- 기존 스크립트: [scripts/ec2-deploy-guardian.sh](../../scripts/ec2-deploy-guardian.sh).
- 운영 세션이 검토 후 scripts/ec2-guardian-worker.js를 EC2 /opt/signum-ws/guardian-worker.js로 전달하고, 기존 환경에서 bash ec2-deploy-guardian.sh를 실행하는 구조다. 스크립트는 guardian-worker·guardian-ws·price-ws를 모두 재시작하므로 운영 세션이 적용 범위를 결정해야 한다.
- 워커 두 HTTP 헬퍼는 자체 포함되어 새 공유 모듈 전달이 필요 없다. 이번에 함께 고친 다른 EC2/Lambda 파일은 이 가디언 배포 스크립트만으로 전부 반영되지 않는다.
- 이 작업에서 커밋·push·main 병합·Vercel/EC2 배포·운영 데이터 쓰기는 수행하지 않았다.

## 전체 수정 목록과 호출 영향

아래 줄 번호는 수정본 기준이다. 함수 이름의 참조 위치를 전부 검색해 직접·간접 호출과 메서드 참조를 포함했다. 생성 코드의 줄 번호는 템플릿 내부 기준이며, 문자열 보간 자리는 자리표시자로 계산했다. 독립 실행 스크립트의 이름 없는 콜백은 해당 스크립트가 진입점이다.

공통 영향은 수신 청크를 글자 경계에 맞춰 디코딩하는 데 한정되며, 최종 문자열·JSON 형태와 호출 인자는 같다. 워커 fetchJSON의 호출자는 polygonGet(현재 미사용)과 harvestGuardianData, postJSON의 호출자는 generateMorningBriefing이다. 별도 프로세스·모듈 진입점은 다음과 같다.

- source-parity-worker.readJson → run의 기본 read 의존성(appJobs·hubJob·sourceJobs). scripts/integrity/source-parity.js가 코드를 읽어 원격 실행 프로그램에 포함하고, scripts/integrity/source-parity.test.js가 모듈을 검사한다. 새 오프라인 시험은 실제 readJson을 메모리 스트림으로 검사한다.
- ec2-auto-engine.request → httpJson·httpsJson → 내부 IO의 요청 경로. 외부 simulator는 IO를 대체한다.
- intrinio-options-ws.OptionsWsClient._auth → start; start의 HTTP 업그레이드 거부 수집도 수정. ec2-price-ws.js:935가 OptionsWsClient를 가져와 L941에서 만들고 L996에서 start를 호출한다.
- Lambda exports.handler 및 배포 스크립트에 포함된 handler의 공유 HTTP·Redis 헬퍼는 아래 전체 내부 참조에 영향을 준다. 실제 AWS 호출은 하지 않았다.
- HUD runCollector·egoRun·apiRun 및 검증 실행기의 자식 프로세스 출력은 각 stdout·stderr별 디코더를 사용한다. 해당 브라우저·광고·스토어 작업은 실행하지 않았다.

| 파일 | 수정 스트림 수 | 수집 함수와 전체 파일 내 참조 |
| --- | ---: | --- |
| [scripts/audit-intrinio-capabilities.js](../../scripts/audit-intrinio-capabilities.js) | 1 | `probe` → L163 |
| [scripts/audit_redis_keys.js](../../scripts/audit_redis_keys.js) | 3 | `ecGet` → L58, L73, L85, L92, L101, L111, L120, L141; `ecPing` → L47; `captureWorkerCheck` → L52 |
| [scripts/aws-backfill-history.js](../../scripts/aws-backfill-history.js) | 1 | `httpsGet` → L127, L170, L190, L338 |
| [scripts/aws-setup-lambda.js](../../scripts/aws-setup-lambda.js) | 1 | 생성 코드 `httpsGet` → 내부 L70, L101, L208 |
| [scripts/build-universe.js](../../scripts/build-universe.js) | 1 | `httpsGet` → L95, L170 |
| [scripts/check-client-field-drift.js](../../scripts/check-client-field-drift.js) | 1 | `get` → L24, L28, L56 |
| [scripts/check-rotation-scale.js](../../scripts/check-rotation-scale.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/check_api_structure.js](../../scripts/check_api_structure.js) | 1 | `fetch` → L18 |
| [scripts/check_flow_harvest.js](../../scripts/check_flow_harvest.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/check_font.js](../../scripts/check_font.js) | 1 | `fetch` → L9, L19 |
| [scripts/check_massive_url.ts](../../scripts/check_massive_url.ts) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/darkpool-hooks.js](../../scripts/darkpool-hooks.js) | 1 | `g` → L32, L72 |
| [scripts/debug_atm_iv.js](../../scripts/debug_atm_iv.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/debug_macro_js.js](../../scripts/debug_macro_js.js) | 1 | `get` → L13, L29 |
| [scripts/deploy-fmp.js](../../scripts/deploy-fmp.js) | 1 | 생성 코드 `httpsGet` → 내부 L60, L61, L62, L125 |
| [scripts/deploy-lambda-v3.js](../../scripts/deploy-lambda-v3.js) | 1 | 생성 코드 `httpsGet` → 내부 L31, L58, L132 |
| [scripts/deploy-lambda-v4.js](../../scripts/deploy-lambda-v4.js) | 1 | 생성 코드 `httpsGet` → 내부 L33, L85, L86, L87, L88, L182 |
| [scripts/deploy-lambda-v5.js](../../scripts/deploy-lambda-v5.js) | 1 | 생성 코드 `httpsGet` → 내부 L32, L72, L73, L74, L110, L172, L173, L223, L241, L261, L277 |
| [scripts/deploy-lambda-v6.js](../../scripts/deploy-lambda-v6.js) | 1 | 생성 코드 `httpsGet` → 내부 L32, L72, L73, L74, L180, L249, L250, L300, L318, L338, L354 |
| [scripts/deploy-lambda-v7.js](../../scripts/deploy-lambda-v7.js) | 7 | 생성 코드 `httpsGet` → 내부 L279, L291, L307, L323, L363, L364, L365, L520, L825, L826, L827, L828, L829, L918, L919, L920, L1003, L1025, L1026, L1143, L1152, L1308, L1660, L1790, L1791, L1792, L1836, L1837, L1838, L1890, L1906, L1907, L1921, L1966, L1967, L1968; 생성 코드 `ec2ProxyGet` → 내부 L1195, L2047; 생성 코드 `ec2ProxyPost` → 내부 L102, L153; 생성 코드 `redisSet` → 내부 L2033, L2074; 생성 코드 `redisPipeline` → 내부 L1630, L2038; 생성 코드 `releaseLock` → 내부 L2264 |
| [scripts/dump_structure.js](../../scripts/dump_structure.js) | 1 | `fetch` → L20 |
| [scripts/ec2-auto-engine.js](../../scripts/ec2-auto-engine.js) | 1 | `request` → L72, L90, L91 |
| [scripts/ec2-capture-worker.js](../../scripts/ec2-capture-worker.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/ec2-flow-accumulator.js](../../scripts/ec2-flow-accumulator.js) | 1 | `httpsGet` → L169, L203 |
| [scripts/ec2-guardian-worker.js](../../scripts/ec2-guardian-worker.js) | 2 | `fetchJSON` → L276, L292; `postJSON` → L840 |
| [scripts/ec2-price-ws.js](../../scripts/ec2-price-ws.js) | 1 | `httpsGet` → L94, L1628 |
| [scripts/ec2-toss-executor.js](../../scripts/ec2-toss-executor.js) | 2 | `httpsJson` → L91, L130, L150, L269 |
| [scripts/fetch-guardian.js](../../scripts/fetch-guardian.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/finra-offexchange.js](../../scripts/finra-offexchange.js) | 2 | `post` → L259, L271; `redis` → L230, L236 |
| [scripts/generate_alpha_report.js](../../scripts/generate_alpha_report.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/hooks/hud-hook.js](../../scripts/hooks/hud-hook.js) | 2 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/hooks/pre-bash-guard.js](../../scripts/hooks/pre-bash-guard.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/hud/refresh.js](../../scripts/hud/refresh.js) | 4 | `egoRun` → L135, L238, L275; `apiRun` → L218 |
| [scripts/hud/server.js](../../scripts/hud/server.js) | 2 | `runCollector` → L425, L435 |
| [scripts/hud/verify-ads-api.js](../../scripts/hud/verify-ads-api.js) | 2 | `run` → L33, L38, L44, L49 |
| [scripts/hud/verify-v2.js](../../scripts/hud/verify-v2.js) | 4 | `request` → L26, L83, L92, L94, L96; `startServer` → L106; `run` → L142, L193, L221, L307, L308 |
| [scripts/integrity/source-parity-worker.js](../../scripts/integrity/source-parity-worker.js) | 1 | `readJson` → L34, L74 |
| [scripts/intrinio-options-ws.js](../../scripts/intrinio-options-ws.js) | 2 | `_auth` → L154; `start` → L191 |
| [scripts/intrinio-plan-audit.js](../../scripts/intrinio-plan-audit.js) | 1 | `get` → L121, L135 |
| [scripts/lambda-flow-harvest/index.js](../../scripts/lambda-flow-harvest/index.js) | 7 | `httpsGet` → L402, L453, L574, L575, L576, L696, L730; `ec2ProxyGet` → L240; `ec2ProxyPost` → L197, L286, L899; `redisSet` → L40, L533, L540, L933, L1092; `redisGet` → L39, L1024, L1106; `redisPipeline` → L845; `acquireLock` → L998 |
| [scripts/lambda-fmp/index.js](../../scripts/lambda-fmp/index.js) | 1 | `httpsGet` → L60, L61, L62, L125 |
| [scripts/lambda-harvest/index.js](../../scripts/lambda-harvest/index.js) | 7 | `httpsGet` → L296, L308, L324, L340, L380, L381, L382, L537, L842, L843, L844, L845, L846, L935, L936, L937, L1020, L1042, L1043, L1160, L1169, L1325, L1677, L1807, L1808, L1809, L1853, L1854, L1855, L1907, L1923, L1924, L1938, L1983, L1984, L1985; `ec2ProxyGet` → L1212, L2064; `ec2ProxyPost` → L119, L170; `redisSet` → L2050, L2091; `redisPipeline` → L1647, L2055; `releaseLock` → L2281 |
| [scripts/live_api_stress_test.js](../../scripts/live_api_stress_test.js) | 1 | `fetchApi` → L26, L27, L28, L29 |
| [scripts/probe-flow-expand.js](../../scripts/probe-flow-expand.js) | 1 | `get` → L27, L51 |
| [scripts/scrape-fedwatch.js](../../scripts/scrape-fedwatch.js) | 1 | `saveToRedis` → L225 |
| [scripts/simulate_market_live.js](../../scripts/simulate_market_live.js) | 1 | `httpsGet` → L34 |
| [scripts/sma_analysis.js](../../scripts/sma_analysis.js) | 1 | `main` → L34 |
| [scripts/speed_test_domains.js](../../scripts/speed_test_domains.js) | 1 | `httpGet` → L52 |
| [scripts/test-bedrock-quick.js](../../scripts/test-bedrock-quick.js) | 1 | `httpsGet` → L25 |
| [scripts/test-bedrock-vs-gemini.js](../../scripts/test-bedrock-vs-gemini.js) | 1 | `httpsGet` → L40 |
| [scripts/test-buffer-api.js](../../scripts/test-buffer-api.js) | 1 | `bufferQuery` → L31 |
| [scripts/test-claude-optimized.js](../../scripts/test-claude-optimized.js) | 1 | `httpsGet` → L47 |
| [scripts/test-claude-vs-gemini.js](../../scripts/test-claude-vs-gemini.js) | 1 | `httpsGet` → L26 |
| [scripts/test-rlsi-calc.js](../../scripts/test-rlsi-calc.js) | 1 | `httpsGet` → L39, L40 |
| [scripts/test_batch20.js](../../scripts/test_batch20.js) | 1 | `get` → L8, L26, L30, L39 |
| [scripts/test_blueocean.js](../../scripts/test_blueocean.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/test_clear_nvda.js](../../scripts/test_clear_nvda.js) | 1 | `redisDel` → L28, L29, L30, L31, L32, L33 |
| [scripts/test_fmp_all.js](../../scripts/test_fmp_all.js) | 1 | `testEndpoint` → L76 |
| [scripts/test_fmp_permissions.js](../../scripts/test_fmp_permissions.js) | 1 | `testEndpoint` → L99 |
| [scripts/test_force_sync_m7.js](../../scripts/test_force_sync_m7.js) | 1 | `httpsGet` → L30, L31 |
| [scripts/test_force_sync_nvda.js](../../scripts/test_force_sync_nvda.js) | 1 | `httpsGet` → L28, L29 |
| [scripts/test_lambda_structure_compat.js](../../scripts/test_lambda_structure_compat.js) | 1 | `httpsGet` → L66, L80, L190, L220 |
| [scripts/test_live_flow.js](../../scripts/test_live_flow.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/test_live_fundamentals.js](../../scripts/test_live_fundamentals.js) | 1 | `fetchApi` → L21 |
| [scripts/test_nvda_api.js](../../scripts/test_nvda_api.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/test_overnight_polygon.js](../../scripts/test_overnight_polygon.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/test_postmarket_discrepancy.js](../../scripts/test_postmarket_discrepancy.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/test_postmarket_discrepancy2.js](../../scripts/test_postmarket_discrepancy2.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/test_postmarket_polygon.js](../../scripts/test_postmarket_polygon.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/test_postmarket_polygon2.js](../../scripts/test_postmarket_polygon2.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/test_premarket_929.js](../../scripts/test_premarket_929.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/test_premarket_diag.js](../../scripts/test_premarket_diag.js) | 1 | `fetch` → L23 |
| [scripts/test_premarket_validation.js](../../scripts/test_premarket_validation.js) | 1 | `fetchTicker` → L37 |
| [scripts/test_rt_nvda.js](../../scripts/test_rt_nvda.js) | 1 | `redisGet` → L22 |
| [scripts/test_sv_nvda.js](../../scripts/test_sv_nvda.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/test_tsla_quick.js](../../scripts/test_tsla_quick.js) | 1 | `get` → L8, L18, L23, L35 |
| [scripts/tmp_lambda_run.js](../../scripts/tmp_lambda_run.js) | 4 | `httpsGet` → L240, L269, L304, L305, L306, L423, L457; `redisSet` → L288; `redisGet` → L648; `redisPipeline` → L556 |
| [scripts/trace_pipeline.js](../../scripts/trace_pipeline.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/trade_debug.js](../../scripts/trade_debug.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/verify-universe.js](../../scripts/verify-universe.js) | 1 | `upstashPipeline` → L58 |
| [scripts/verify_atm_iv.js](../../scripts/verify_atm_iv.js) | 1 | `fetch` → L18 |
| [scripts/verify_atm_iv_polygon.js](../../scripts/verify_atm_iv_polygon.js) | 1 | `get` → L7, L19 |
| [scripts/verify_ec2_proxy_dp.js](../../scripts/verify_ec2_proxy_dp.js) | 1 | `ec2ProxyGet` → L47 |
| [scripts/verify_fields.js](../../scripts/verify_fields.js) | 1 | `fetch` → L22 |
| [scripts/verify_guardian_live.js](../../scripts/verify_guardian_live.js) | 1 | 스크립트/HTTP 이벤트 콜백 |
| [scripts/verify_pipeline.js](../../scripts/verify_pipeline.js) | 2 | `ecGet` → L41, L57; `httpsGet` → L72, L83 |

추가 파일: scripts/hud/README-v2.md(예제), tests/httpUtf8Collectors.test.js(새 재현·회귀 시험), tests/hubLast.test.js·priceTimeBasis.test.ts·tickerPayload.test.js·tacticalV3Compare.test.cjs(기존 시험 보정), 이 보고서. 코드 86개 + 기존 시험 4개 + 새 시험 1개 + 문서 2개 = 총 93개 파일.
