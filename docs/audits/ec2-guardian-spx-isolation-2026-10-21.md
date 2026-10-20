읽는 경로 전수 표(파일:줄·용도·처리)

| 파일:줄 | 용도 | 처리 |
|---|---|---|
| `src/lib/aws/dynamoClient.ts:73` | 공통 DynamoDB 전송·테이블 상수 | 전송 계층; 실제 GEX 접근 경계 세 곳을 아래에 전수 기재 |
| `src/lib/aws/dynamoDataProvider.ts:100` | 최신 옵션 GEX | 직접 호출도 guardian 제외; 정상은 1행, 오염 시 최근 8행에서 수집 행 선택 |
| `src/lib/aws/dynamoDataProvider.ts:120` | 개수 제한 옵션 이력(내림차순) | 반환 전에 공통 출처·단위 판정; 원시 조회 상한 유지 |
| `src/lib/aws/dynamoDataProvider.ts:239` | 통합 스냅샷 | 보호된 getLatestGex 사용 |
| `src/lib/aws/historyStore.ts:30` | 날짜 범위 옵션 이력(오름차순) | 기존 공통 필터 유지; 단위 표지도 새 판정으로 제외 |
| `src/lib/app/intelOptionsBasis.ts:74` | 공통 단위·출처 판정 | source=ec2-guardian 또는 gexBasis=normalized_index 또는 레거시 모양 제외 |
| `src/lib/app/intelOptionsBasis.ts:97` | 모든 최신 소비자의 수집 행 선택 | 대체 DB 구현까지 방어; firstCollectorRow도 같은 판정 |
| `src/services/gexHistoryService.ts:34` | Intel 이전 GEX·차이·레짐·PCR 추세 | 별도 DynamoDB 직접 조회 제거; 보호된 provider 이력 사용 |
| `src/app/api/intel/gex-history/route.ts:36` | 별도 Intel 이력 API | 정상 옵션 이력으로만 이전값·차이 계산 |
| `src/app/api/command/unified/route.ts:368` | Command 30일 GEX 통계 | 보호된 historyStore 사용 |
| `src/app/api/command/unified/route.ts:689,731` | Command 구조·변동성 | 공통 최신 선택 사용(두 호출) |
| `src/app/api/command/unified/route.ts:1609` | Command 통합 AWS 폴백 | 보호된 통합 스냅샷 사용 |
| `src/app/api/intel/fast/route.ts:444` | Intel 최신 GEX·OI 폴백 | 공통 최신 선택 사용 |
| `src/app/api/live/ticker/route.ts:898` | 종목 실시간 구조·OI 폴백 | 공통 최신 선택 사용 |
| `src/app/api/app/oi-pcr/route.ts:50` | 앱 OI P/C | 공통 최신 선택; 기존 정상값·35일 대체 유지 |
| `src/app/api/intel/fast-all/route.ts:74` | Intel 섹터 일괄 응답 | optionMetricsService → 공통 최신 선택; 기존 캐시 응답도 지표 재대입 |
| `src/app/api/intel/fast/route.ts:85` | Intel 옵션 지표 재대입 | optionMetricsService → 공통 최신 선택 |
| `src/app/api/command/unified/route.ts:527` | Command 옵션 지표 재대입 | readOptionEditions → 공통 최신 선택 |
| `src/services/watchlistBatchService.ts:277` | 관심종목 옵션 지표 재대입 | optionMetricsService → 공통 최신 선택 |
| `src/services/portfolioBatchService.ts:101` | 포트폴리오 옵션 지표 | optionMetricsService → 공통 최신 선택 |
| `src/app/api/undercurrent/shared.ts:805` | AI 사실 입력용 옵션 지표 | optionMetricsService → 공통 최신 선택 |
| `src/app/api/app/options-latest/route.ts:23` | 앱 최신 옵션 묶음 | optionMetricsService → 공통 최신 선택 |
| `src/app/api/live/short-squeeze/route.ts:30` | 실시간 스퀴즈 옵션 입력 | optionMetricsService → 공통 최신 선택 |
| `src/app/api/live/ticker/route.ts:307,438` | 종목 옵션 지표 재대입 | optionMetricsService → 공통 최신 선택 |
| `src/app/[locale]/ticker/page.tsx:185` | 종목 서버 렌더링 옵션 판본 | readOptionEditions → 공통 최신 선택; 화면 코드 수정 없음 |
| `src/services/optionMetricsService.ts:22` | 옵션 지표·Intel 일괄 응답 | 공통 최신 선택 사용 |
| `src/services/watchlistBatchService.ts:1329` | 관심종목 AWS 폴백 | 공통 최신 선택 사용 |
| `src/services/guardian/gammaShieldEngine.ts:229` | Guardian SPY·QQQ 옵션 입력 | 공통 최신 선택; 정규화 지수를 달러 GEX로 재입력하지 않음 |
| `src/app/api/history/route.ts:69` | 일반 이력 API | historyStore 필터 후 병합 |
| `src/app/api/aws/history/route.ts:34` | AWS 이력 API | historyStore 필터 적용 |
| `src/lib/gexBackfillMerge.ts:103` | 옵션 이력·복원 병합 | 출처를 live로 바꾸기 전에 공통 판정 적용 |
| `src/app/api/flow/iv-percentile/route.ts:41` | IV30 백분위 이력 | 보호된 provider; 유효 표본 부족 시 최대 600행으로 1회 확장 |
| `src/app/api/flow/enhanced-metrics/route.ts:143` | OI 이상량 이력 | 보호된 provider; guardian의 무수량 행 제외 |
| `src/app/api/ranking/route.ts:60` | 랭킹 직접 이력·일별 스냅샷·옵션 세션 | GEX 테이블만 공통 판정 적용; Flow 조회·400/3000행 상한 유지 |
| `src/app/api/intel/snapshot/route.ts:414` | 거시 시세 | Yahoo 선물 가격; guardian GEX 테이블을 읽지 않음 |
| `src/app/api/intel/cross-sector-brief/route.ts:231` | 교차 섹터 거시 시세 | SPX 선물·IDX_SPX 현물 별도 캐시; 옵션 GEX로 사용하지 않음 |
| `src/services/macroHubProvider.ts:531,554` | 거시 SPX 요인 | Yahoo 공통 시세의 가격·등락률; 옵션 GEX로 사용하지 않음 |
| `src/services/yahooFinanceHub.ts:73` | Yahoo SPX 공통 시세 | ES=F 선물 시세 경로; guardian GEX와 무관 |
| `src/services/marketBackdropLoader.ts:31` | 시장 배경 현물·선물 | IDX_SPX·SPX 시세 캐시 읽기; 옵션 GEX로 사용하지 않음 |
| `src/services/guardian/rlsiEngine.ts:542` | Guardian RUT/SPX 상대 변화 | Yahoo SPX 등락률만 사용; guardian 옵션 이력과 무관 |
| `scripts/lambda-xs/source-adapter.js:479` | XS의 ATM IV 대체 조회 | atmIv만 읽음; netGex는 별도 구조 조각에서 읽어 정규화 지수를 쓰지 않음 |
| `scripts/check-dynamo.sh:59,70,81` | 수동 SPY 최신·최초·건수 진단 | 원시 저장본 확인 경로; 제품 API 아님; 실행하지 않음 |
| `scripts/check-dynamo.js:12` | 수동 원시 진단 | 제품 API 경로 아님; 실행하지 않음 |
| `scripts/debug_dynamo_iv.js:72,96` | 수동 IV 원시 진단(두 조회) | 제품 API 경로 아님; 실행하지 않음 |
| `scripts/final_audit.js:41` | 수동 적재 존재 검사 | 원시 행 존재만 확인; 실행하지 않음 |
| `scripts/_gex-coverage.js:6` | 수동 적재 날짜·필드 검사 | 원시 행 날짜·키 목록만 확인; 실행하지 않음 |
| `scripts/test-dynamodb.js:33` | 수동 Dynamo 진단 | 제품 API 경로 아님; 실행하지 않음 |
| `scripts/precision_stress_test.js:155` | 수동 보조 테이블 존재 검사 | GEX 수치 계산 없음; 실행하지 않음 |

조사 범위: 저장소 소스의 `signum-gex-history`·`GEX_HISTORY`·`getLatestGex`·`getGexHistory`, 지정 경로의 `SPX`·`IDX_SPX`·`^GSPC`를 검색했다. 위 표는 직접 읽기와 간접 소비를 모두 포함한다. 시험 모의 객체·문자열 설명은 운영 조회로 세지 않는다. `.env*`는 검색·읽기·로드하지 않았다.

생산자도 구분했다. `scripts/ec2-guardian-dynamo.js:160`은 SPX 키에 출처·정규화 단위를 붙여 쓰는 기존 수정본이다. `harvest_lambda/index.js`와 과거 Lambda 생성 스크립트·`.lambda-check/code/index.js`는 옵션 수집 행 작성자다. Yahoo SPX/IDX_SPX 캐시 작성자는 `src/services/jobs/marketFeedJob.ts:24,38`이다. 백업·테이블 설치 스크립트는 시장 수치 소비자가 아니다. 실제 생산자는 시험의 격리 VM에서만 실행했다. 운영 생산자·진단·배포 스크립트는 실행하지 않았다.

결과 요약

- 원인: 같은 테이블의 단위가 다른 행을 소비자별로 걸러 경계가 갈라졌다. 별도 Intel 이력 서비스와 랭킹의 직접 조회가 기존 최신값·차트 필터를 우회했다.
- 수정: provider의 최신값·이력 자체에서 공통 판정을 적용하고, Intel의 별도 AWS 클라이언트를 제거했다. 랭킹은 조회 직후 필터링한다. 출처가 바뀌어도 normalized_index 단위 표지가 남아 있으면 제외한다.
- 정상 SPX 옵션 수집값·SPY·QQQ 값과 측정된 0, 가격·시각을 유지한다. SPX 종목 전체를 차단하지 않는다. 저장된 guardian 행도 보존한다.
- 합성 시험은 실제 생산자 → 메모리 DynamoDB → 이력 API 세 곳·Command 통계·랭킹 조회·IV API를 연결한다. 별도 서비스와 provider를 모의 필터로 바꾸지 않는다.
- 화면 라벨·문구·표시 코드, 운영 데이터, 커밋·push·병합·배포에 손대지 않았다. 운영 상태는 확인하지 않았다.

바꾼 파일

| 파일 | 변경·공유 호출 영향 |
|---|---|
| `src/lib/app/intelOptionsBasis.ts` | 공통 판정에 단위 표지를 추가. 모든 호출자는 firstCollectorRow·latestCollectorGexRow·provider·historyStore·mergeGexHistory·ranking이며 위 표와 회귀시험에 포함한다. |
| `src/lib/aws/dynamoDataProvider.ts` | getLatestGex와 getGexHistory를 보호. 모든 호출자(공통 최신 선택·통합 스냅샷·Intel 이력 서비스·Flow 두 API)는 위 표에 포함한다. |
| `src/services/gexHistoryService.ts` | 직접 AWS 조회를 보호된 provider로 통합. 유일한 운영 호출자는 Intel gex-history API다. |
| `src/app/api/ranking/route.ts` | GEX 이력을 일별로 축약하기 전에 필터. hist의 다른 호출은 Flow이며 기존 동작 유지. |
| `src/app/api/flow/iv-percentile/route.ts` | 필터 후 짧아진 반환 배열을 원시 이력 끝으로 오판하지 않도록 수정. |
| `tests/gexHistoryGuardian.test.js` | 실제 생산자 8·9, 세 API, 정상/혼합/단위/레거시/0, 거래일·PCR, provider 직접 호출, 랭킹, IV 확장, 테이블 접근 경계 감사. |
| `tests/gexGuardianIsolation.test.js` | provider 직접 호출도 guardian을 반환하지 않는 계약으로 검증. 원시 저장본 보존도 검증. |
| `tests/oiPcrSpyGuardian.test.ts` | 변경한 provider 계약에 맞춰 주석 수정. 단언은 유지. |
| 이 문서 | 전수 표·공유 호출 영향·최종 검증·운영 인계. |

돌린 시험과 결과

확인 결과: **443 통과·0 실패·1 생략**(15개 시험 파일). 운영 저장본 경로를 선택 입력으로 받는 기존 Flow 재생 시험 1건만 생략됐다. 전체 저장소의 모든 시험을 실행한 결과라는 뜻은 아니다.

| 시험 파일 | 통과 | 실패 | 생략 |
|---|---:|---:|---:|
| `gexGuardianIsolation.test.js` | 6 | 0 | 0 |
| `gexHistoryGuardian.test.js` | 11 | 0 | 0 |
| `oiPcrSpyGuardian.test.ts` | 12 | 0 | 0 |
| `optionMetricsCache.test.ts` | 15 | 0 | 0 |
| `oiNear35.test.ts` | 34 | 0 | 0 |
| `sessionArchiveB3.test.ts` | 12 | 0 | 0 |
| `appAccuracy2.test.ts` | 22 | 0 | 0 |
| `watchlistInsights.test.ts` | 96 | 0 | 0 |
| `optionLevelGate.test.ts` | 61 | 0 | 0 |
| `integrityStructUnify.test.js` | 85 | 0 | 0 |
| `gammaFlipDistance.test.js` | 15 | 0 | 0 |
| `ivSkew.test.cjs` | 39 | 0 | 0 |
| `ivRank.iv30.test.ts` | 13 | 0 | 0 |
| `flowIvRank.test.ts` | 16 | 0 | 1 |
| `intelExtraOptions.test.ts` | 6 | 0 | 0 |
| 전체 tsc 최초 1회 | 종료 코드 2; TS2322 1건 확인 | 아래처럼 수정 | — |
| 최종 변경 경로·Intel 호출자·전이 의존성 국소 tsc | 종료 코드 0·출력 0바이트 | 0 | — |

최신 격리 회귀는 도구의 직접 실행 출력으로 확인했다. 이력 회귀의 최종 로그는 gexHistoryGuardian.final.log다. 나머지 13개 시험과 전체 tsc는 공용 잠금 아래 순차 실행한다. 원본 로그는 `/tmp/signum-gex-full-audit/`에 있다. 통과한 기존 시험 13개 묶음과 전체 tsc는 반복하지 않았다. 최종 점검에서 앞 200행이 전부 guardian인 경우도 IV 확장으로 복구하도록 보완하고 해당 이력 회귀 파일만 재검증해 11 통과·0 실패를 확인했다. 전체 tsc에서 발견한 TS2322 1건은 GexSnapshot의 maxPain·callWall·putFloor가 실제 Dynamo 스키마의 null을 허용하지 않아서 생겼다. 기존 직접 조회의 타입 단언이 감췄던 스키마 차이를 정상 nullable 정의로 수정했다. 이 타입의 외부 호출자는 없고 Intel 이력 경로 내부에서만 사용한다. 전체 명령 반복 금지에 따라 전체 tsc는 재실행하지 않고, 변경한 운영 파일 5개·Intel API 호출자·전이 의존성을 국소 tsc로 재검증해 종료 0·오류 0을 확인했다. 국소 검사 첫 실행에서는 프로젝트 전체 검사에 포함되던 Next의 RequestInit 확장 선언이 빠져 TS2769 1건이 발생했다. 임시 검사 설정에 설치된 Next 공통 선언을 포함한 뒤 통과했다. 제품 코드는 이 환경 오류에 맞춰 바꾸지 않았다. 작업 초기에 작성 중인 이력 시험은 두 차례 수정 후 재실행했다. IV 모듈의 상대 의존성을 로더에 연결하고, API에 없는 windowRows 대신 실제 반환 필드 window를 검증했다.

실행 명령:

```sh
# 공용 잠금으로 시험 13개와 전체 tsc를 순차 실행한 기록
/usr/bin/lockf -k /tmp/signum-heavy.lock python3 /tmp/signum-gex-regression.py
# 위 실행기 내부의 전체 타입 검사(1회)
node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false
# 최종 변경 운영 파일 5개·Intel API 호출자와 전이 의존성 검사
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc -p /tmp/signum-gex-iv-tsconfig.json --noEmit --pretty false
```

실행기는 `.env*`를 로드하지 않으며 TypeScript 시험은 ts-node의 CommonJS 모드와 tsconfig-paths로 실행한다. git diff로 저장을 확인하고 diff 공백 검사도 수행한다. 브라우저·개발 서버·운영 네트워크 검증은 수행하지 않았다.

## 운영 세션용 EC2 배포 절차 — 이번 작업에서는 실행하지 않음

기존 `scripts/ec2-deploy-guardian.sh`를 확인했다. 해당 스크립트는 `/opt/signum-ws`를 사용하고 guardian-worker·guardian-ws·price-ws를 모두 재기동한다. 반면 `.agent/INFRASTRUCTURE_MAP.md`의 Guardian 경로는 `/home/ec2-user/guardian`이다. 실제 경로를 추정해서 복사하지 않는다. 워커는 `require("./ec2-guardian-dynamo.js")`로 모듈을 불러오므로, 실행 중인 PM2 워커 파일과 같은 디렉터리의 모듈을 교체한다.

1. 운영 세션에서 변경본의 웹 읽기 코드도 별도로 반영한다. EC2 모듈만 반영하면 이미 쌓인 SPY 행에 대한 미보호 웹 폴백은 남는다.
2. 아래 명령은 운영 담당자가 수행한다. SSH 별칭에는 운영 세션에서 확인한 대상을 넣는다. 키·토큰을 명령 문자열에 적지 않는다.

```sh
# 로컬: 검토한 변경본 모듈을 후보 파일로 전송
scp scripts/ec2-guardian-dynamo.js '<운영 SSH 별칭>:/tmp/ec2-guardian-dynamo.js.candidate'
```

3. EC2 운영 셸에서 경로 확인·백업·문법 검사·교체·재기동을 수행한다. 아래 코드는 실패 시 중단한다. 백업 이름이 이미 있으면 기존 백업을 덮지 않고 중단한다.

```sh
set -eu
GUARDIAN_SCRIPT=$(pm2 jlist | node -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{const p=JSON.parse(s).find(p=>p.name==="guardian-worker");if(!p?.pm2_env?.pm_exec_path)process.exit(1);process.stdout.write(require("fs").realpathSync(p.pm2_env.pm_exec_path));});')
GUARDIAN_DIR=$(dirname "$GUARDIAN_SCRIPT")
GUARDIAN_MODULE="$GUARDIAN_DIR/ec2-guardian-dynamo.js"
GUARDIAN_BACKUP="$GUARDIAN_MODULE.before-spx-20261021"
test -f "$GUARDIAN_MODULE"
test ! -e "$GUARDIAN_BACKUP"
node --check /tmp/ec2-guardian-dynamo.js.candidate
cp -p "$GUARDIAN_MODULE" "$GUARDIAN_BACKUP"
cp /tmp/ec2-guardian-dynamo.js.candidate "$GUARDIAN_MODULE"
pm2 restart guardian-worker
curl --fail --silent --show-error http://127.0.0.1:8083/health
```

4. 운영 세션이 정규장 다음 저장 주기 이후 확인한다. 새 guardian 행의 키는 SPX이고 `source=ec2-guardian`이다. 새 SPY 행은 OI·계약 수량을 가진 수집 행이며 guardian 신규 행이 더는 생기지 않아야 한다. SPY·QQQ의 Command·Intel·OI·Flow 값을 확인한다. 상태 점검만으로 Dynamo 쓰기 성공이 입증되지는 않는다. 로그 확인 시 값·시각·오류만 확인하고 비밀값이 포함될 수 있는 전체 환경·PM2 JSON을 보고에 복사하지 않는다.

## 운영 세션용 되돌림 명령 — 이번 작업에서는 실행하지 않음

위에서 확인한 같은 EC2 셸 변수로 실행한다. 새 셸이면 배포 절차의 PM2 경로 확인과 변수 선언을 먼저 반복한다.

```sh
set -eu
test -f "$GUARDIAN_BACKUP"
node --check < "$GUARDIAN_BACKUP"
cp -p "$GUARDIAN_BACKUP" "$GUARDIAN_MODULE"
pm2 restart guardian-worker
curl --fail --silent --show-error http://127.0.0.1:8083/health
```

되돌림은 이전 SPY 쓰기를 재개한다. 웹 읽기 보호는 유지해야 한다. 백업·후보 파일은 운영 확인이 끝날 때까지 보존한다. 기존 SPY 행과 새 SPX 행 모두 삭제하지 않는다.


남은 위험

- 운영 실데이터·배포 상태·운영 캐시는 확인하거나 변경하지 않았다. 웹 코드와 기존 EC2 생산자 수정의 반영은 운영 세션이 담당한다.
- 최신 선택의 최근 8행·날짜 이력의 기존 페이지 상한은 유지한다. 정상 옵션 수집·복원 이력이 없으면 정규화 지수나 임의 숫자로 대체하지 않는다.
- IV 이력이 조금 있으나 200개 유효 표본이 없으면 DynamoDB를 한 번 더 읽을 수 있다. 기존 총 두 조회·600행 확장 상한을 유지하며 공급사 호출은 추가하지 않았다.
- 기존 응답 캐시는 수명 동안 남을 수 있다. 운영 쓰기 금지에 따라 삭제·재생성하지 않았다.
- 전체 tsc 최초 실행에서는 TS2322 1건이 있었다. 수정 후 변경 경로·호출자·전이 의존성 검사는 오류 0이다. 전체 명령 반복 금지에 따라 수정 후 전체 tsc 재실행은 하지 않았다.
- 보고된 합성 검증은 운영 수집 상태나 배포 성공을 입증하지 않는다.
