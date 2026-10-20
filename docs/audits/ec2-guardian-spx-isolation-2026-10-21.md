# EC2 guardian의 SPY 오염 차단 — 2026-10-21

## 결과 요약

- 코드에서 확인한 원인: `scripts/ec2-guardian-dynamo.js`가 `gammaShield`의 지수 수준 가격과 정규화 GEX를 `signum-gex-history`의 `SPY` 키에 저장했다. 최신 행을 직접 읽는 폴백은 이 행을 ETF 옵션 수집 행으로 사용했다.
- 운영 빈도·오염 행 수는 작업 지시에서 제공된 관측이다. 이번 작업은 운영 AWS·Redis·DB·브라우저에 접근하지 않았다.
- 새 guardian 행은 `ticker: "SPX"`, `source: "ec2-guardian"`, `gexBasis: "normalized_index"`로 저장한다. 동일 시각의 SPY 수집 행과 파티션 키가 다르다.
- 이 `SPX`는 지수 수준 스냅샷의 저장 키다. 현재 Guardian 가격은 SPY × 10 근사이며, 실제 SPX 옵션 체인 측정값이 아니다. `gex`도 달러 GEX가 아니라 정규화 지수다.
- 모든 기존 최신 GEX 소비 경로가 `latestCollectorGexRow`를 사용한다. 기존 SPY guardian 행은 레거시 표지로, 새 행은 명시적 출처로 제외한다. 기존 행은 삭제·수정하지 않는다.
- 화면·라벨·표시 로직 변경, 커밋, push, 병합, 배포, 운영 데이터 쓰기는 하지 않았다.

## 바꾼 파일과 호출 영향

| 파일 | 변경·영향 |
|---|---|
| `scripts/ec2-guardian-dynamo.js` | GEX 쓰기 키를 SPX로 분리하고 출처·GEX 단위를 기록한다. 다른 두 테이블 쓰기는 그대로다. |
| `src/lib/app/intelOptionsBasis.ts` | `source=ec2-guardian` 판정을 추가한다. 기존 `squeezeLevel` 문자열 + OI·계약 수량 필드 전무 판정도 유지한다. |
| `src/lib/aws/dynamoDataProvider.ts` | `getTickerSnapshot`의 GEX를 수집 행으로 선택한다. 원시 `getLatestGex`와 `getGexHistory`의 조회 계약은 유지한다. |
| `src/app/api/command/unified/route.ts` | 구조·변동성의 DynamoDB 폴백 두 곳을 보호한다. `getTickerSnapshot`을 쓰는 초기 경로도 공급자 수정으로 보호된다. |
| `src/app/api/intel/fast/route.ts` | GEX 폴백을 보호한다. Flow 행 병합은 유지한다. |
| `src/app/api/live/ticker/route.ts` | 옵션 데이터가 비었을 때의 GEX 폴백을 보호한다. |
| `src/services/watchlistBatchService.ts` | 관심종목의 GEX 폴백을 보호한다. Flow·IV 출처 시각은 유지한다. |
| `src/services/guardian/gammaShieldEngine.ts` | SPY·QQQ GEX 폴백을 보호한다. 정규화 결과를 다시 달러 GEX로 읽는 순환 오염을 막는다. |
| `tests/gexGuardianIsolation.test.js` | 생산자와 각 최신 소비 구간을 합성 데이터·메모리 I/O로 실행한다. |
| `tests/oiPcrSpyGuardian.test.ts` | SPY·QQQ·SPX의 실제 oi-pcr·optionMetrics 경로를 추가 검증한다. |
| `tests/gammaFlipDistance.test.js` | 분리 실행하는 실제 Command 함수의 새 의존성 `latestCollectorGexRow`를 시험 실행 문맥에 제공한다. |
| 이 문서 | 원인·호출자·시험·배포·되돌림을 기록한다. |

공유 선택 함수의 기존 호출자 `src/app/api/app/oi-pcr/route.ts`와 `src/services/optionMetricsService.ts`도 영향 범위다. 이미 공통 함수를 사용하므로 호출부 수정은 없고 회귀 시험에 포함했다. `getTickerSnapshot`의 소비자는 종목 페이지(`src/app/[locale]/ticker/page.tsx`)와 Command 초기 경로다. `intrinioClient.getTickerSnapshot`은 이름만 같은 별도 함수다.

저장소 검색에서 기존 SPX 전용 GEX 최신 소비 경로는 발견되지 않았다. 따라서 Guardian 스냅샷을 SPX 옵션 수집 데이터로 연결하는 새 폴백은 추가하지 않았다. SPX 원시 조회는 새 저장 키의 행을 반환하고, 옵션 수집 행 선택은 이를 건너뛴다. 역사 조회 함수는 원시 이력 조회 계약을 유지한다. 이번 차단 범위는 모든 `getLatestGex` 소비 경로다.

최신 행이 정상 수집 행이면 추가 조회가 없다. guardian 행이면 최근 8행 중 첫 수집 행으로 대체한다. 새 출처 판정은 모든 공통 함수 호출자에 동일하게 적용된다.

## 돌린 시험과 결과

외부 통신·운영 쓰기 없이 합성 행과 메모리 스텁을 사용했다. 무거운 시험 묶음과 전체 타입 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 안에서 순차 실행했다. 타입 검사는 한 번만 실행했다.

| 시험 파일·검사 | 최종 결과 |
|---|---|
| `gexGuardianIsolation.test.js` | 6/6 통과 |
| `oiPcrSpyGuardian.test.ts` | 12/12 통과 |
| `optionMetricsCache.test.ts` | 15/15 통과 |
| `oiNear35.test.ts` | 34/34 통과 |
| `sessionArchiveB3.test.ts` | 12/12 통과 |
| `appAccuracy2.test.ts` | 22/22 통과 |
| `watchlistInsights.test.ts` | 96/96 통과 |
| `optionLevelGate.test.ts` | 61/61 통과 |
| `integrityStructUnify.test.js` | 61 통과·24 실패 — 변경 전 HEAD에서도 동일 |
| `gammaFlipDistance.test.js` | 14 통과·1 실패 — 남은 실패는 변경 전 HEAD에서도 동일 |
| `tsc --noEmit --pretty false` | 종료 0·오류 0 |
| `git diff --check` | 통과 |

최종 합계는 333 통과·25 실패다. 따라서 기존 시험 전체 통과 조건은 충족하지 못했다. 실패를 없애기 위해 화면 코드나 기존 판정을 바꾸지 않았다.

초기 감마플립 시험에는 새 공통 함수가 분리 실행 문맥에 없어 추가 실패가 1건 있었다. 실제 공통 함수와 순수 의존성을 시험 로더에 제공한 뒤 해당 파일만 재실행해 해결했다. 기존의 25건은 변경한 구현 7개 파일을 `git show HEAD:<경로>` 내용으로 메모리에서 대체하는 읽기 전용 비교 실행으로 재현했다. 작업트리 파일을 되돌리거나 운영 데이터를 사용하지 않았다.

- `integrityStructUnify`: `applyLevelsToVolatilityCard` 모의 함수 누락, 티커 검사 경로의 `invalid ticker`, fast-all 시각 기대값 실패가 변경 전·후 동일하다.
- `gammaFlipDistance`: 현재 `IVSkewCurve.tsx`에 없는 `getGammaFlipSub`를 AST에서 찾는 기존 시험 1건이 변경 전·후 동일하게 실패한다.

재현 시 설치된 의존성을 사용하는 작업공간에서 아래처럼 실행한다. `.env*`를 읽거나 로드하지 않는다. 다른 무거운 작업과 동시에 실행하지 않는다.

```sh
NODE_PATH="$PWD/node_modules" node tests/gexGuardianIsolation.test.js
/usr/bin/lockf -k /tmp/signum-heavy.lock env TS_NODE_TRANSPILE_ONLY=1 TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","jsx":"react-jsx","esModuleInterop":true,"resolveJsonModule":true}' node -r ts-node/register -r tsconfig-paths/register tests/oiPcrSpyGuardian.test.ts
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --pretty false
```

합성 시험은 다음을 확인한다.

- 생산자가 SPX에만 GEX 행을 쓰고 같은 시각의 SPY 수집 행을 보존한다.
- SPY: 최신 guardian 가격 7654·콜월 7900 대신 수집 가격 766.48과 수집 레벨·GEX·PCR·시각을 선택한다.
- QQQ: 정상 최신 수집 행을 추가 이력 조회 없이 유지한다.
- SPX: 원시 조회는 guardian 지수값을 보존한다. 옵션 소비 경로는 합성 SPX 수집 행이 있으면 그 행을 선택하고, guardian만 있으면 이를 옵션 값으로 사용하지 않는다.
- 구조·변동성·Intel·관심종목·live·Guardian·통합 스냅샷 및 oi-pcr·optionMetrics 경로에 같은 선택 규칙이 적용된다.
- 수집 행 부재·이력 조회 실패 때 guardian 값을 대신 내보내지 않는다.

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

## 남은 위험

- 운영 배포·실데이터 확인은 운영 세션의 작업으로 남는다. 저장 경로와 PM2 대상도 운영에서 확인해야 한다.
- 기존 시험 25건 실패는 변경 전에도 재현됐지만 미해결이다. 전체 시험 통과로 보고하지 않는다.
- 최근 8행 안에 수집 행이 없거나 조회가 실패하면 공통 선택 함수는 null이다. 지수값이나 임의 숫자로 빈 값을 채우지 않는다. 정상 장중 수집 간격과 guardian 간격에서는 이 범위 안에 수집 행이 있어야 한다는 기존 가정을 유지했다.
- 배포 전 오염 값이 이미 응답 캐시에 저장돼 있으면 기존 캐시 수명 동안 남을 수 있다. 이번 작업에서 운영 캐시를 삭제하거나 갱신하지 않았다.
- 원시 역사 조회는 기존 행을 그대로 보존하므로 별도 이력 분석에서는 출처와 단위를 구분해야 한다. 최신 옵션 폴백은 guardian 출처를 제외한다.
