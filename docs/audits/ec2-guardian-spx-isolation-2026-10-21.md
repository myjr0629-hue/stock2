# EC2 guardian의 SPY·SPX 옵션 GEX 오염 차단 — 2026-10-21

## 결과 요약

- 최초 원인: guardian 생산자가 SPX 수준 가격·정규화 GEX를 SPY 옵션 수집 행과 같은 키로 저장했다. 앞선 변경은 신규 저장 키를 SPX로 분리하고 모든 최신 옵션 폴백에 수집 행 선택을 적용했다.
- 관문 P2 원인: 키를 SPX로 바꿔도 `historyStore.getGexHistory`가 guardian 정규화 지수를 옵션 이력으로 반환했다. `mergeGexHistory`가 그 출처까지 `live`로 덮고 해당 날짜의 정상 옵션 복원을 막았다.
- 이번 수정은 옵션 이력 읽기와 병합 전에 기존 `isGuardianSnapshotRow` 판정을 적용한다. 명시적 guardian 출처와 레거시 `squeezeLevel`·수량 필드 전무 행을 제외한다. 원시 SPY·SPX 저장 행은 삭제하거나 수정하지 않는다.
- 정상 옵션 GEX·측정된 0·가격·시각은 유지한다. guardian 행만 있는 날짜는 같은 산식의 옵션 복원분으로 채울 수 있다. API의 `liveCount`는 실제 병합에 남은 라이브 옵션 행 수다.
- 코드·합성 입출력으로 확인한 내용이다. 운영 빈도·오염 행 수는 원래 작업 지시의 관측이며 이번에는 운영 실데이터를 확인하지 않았다.
- 화면·라벨·문구·표시 코드 변경, 커밋, push, 병합, 배포, 운영 데이터 쓰기는 하지 않았다. `.env*`도 읽거나 로드하지 않았다.

## 바꾼 파일과 호출 영향

이번 보완의 변경 파일만 기록한다. 앞선 커밋 `9addb639f`의 생산자·최신 폴백 수정은 유지한다.

| 파일 | 변경·영향 |
|---|---|
| `src/lib/aws/historyStore.ts` | 날짜 범위 옵션 GEX 이력에서 guardian 행을 제외한다. 조회 범위·정렬·페이지 수·외부 호출 수는 그대로다. |
| `src/lib/gexBackfillMerge.ts` | 출처를 바꾸고 라이브 날짜 집합을 만들기 전에 같은 판정을 적용한다. 원시 행을 직접 넘기는 호출도 보호한다. |
| `src/app/api/history/route.ts` | `liveCount`를 병합 후 정상 라이브 행 수와 맞춘다. |
| `tests/gexHistoryGuardian.test.js` | 실제 생산자 → 메모리 DynamoDB → 두 이력 API·Command 통계를 실행하는 회귀 6건을 추가한다. |
| `tests/integrityStructUnify.test.js` | 누락된 순수 함수와 티커 검사를 실제 구현으로 연결하고 시험별 캐시 범위를 분리한다. |
| `tests/gammaFlipDistance.test.js` | 현재 UI에 없는 IVSkew 보조 함수 참조를 제거한다. Guardian 거리 검증은 유지하고 기존 IVSkew 전용 시험을 별도 실행한다. |
| 이 문서 | 관문 원인·호출 영향·실행 결과·배포·되돌림을 갱신한다. |

공유 함수의 모든 호출자를 저장소 검색으로 확인했다.

- `historyStore.getGexHistory`: `/api/history`, `/api/aws/history`, Command `fetchGexHistoryData`. 세 경로 모두 실제 함수를 합성 데이터로 실행해 검증한다.
- `mergeGexHistory`: `/api/history` 한 곳. 직접 호출과 API 응답을 함께 검증한다.
- `isGuardianSnapshotRow`의 구현은 바꾸지 않았다. 기존 최신 GEX 선택·OI·옵션 지표 호출부는 이전 회귀 묶음으로 재검증한다.
- `dynamoDataProvider.getGexHistory`는 같은 이름의 별도 원시 조회다. 최근 8행 중 수집 행을 고르는 최신 폴백의 계약을 유지한다.

이력 행을 화면에서 숨기는 변경은 없다. 서로 다른 단위의 데이터를 옵션 GEX 응답에 포함하지 않도록 데이터 경계에서 분리한다. guardian 원래 지수 이력은 `guardian-history`와 원시 저장본에 유지된다.

## 돌린 시험과 결과

수정 전 새 회귀 시험은 0 통과·6 실패로 관문 문제를 재현했다. 수정 후 6 통과·0 실패를 확인했다. 새 시험은 생산자의 SPX 정규화 지수 8이 옵션 GEX로 노출되지 않음, SPY·QQQ·SPX 정상 수집값과 0 보존, 출처 보존, 동일 날짜 복원 허용, 두 API의 개수·Command 통계를 검사한다.

앞선 25건 실패의 메커니즘은 다음과 같다. 제품 코드를 실패 기대값에 맞추지 않고 시험 환경만 고쳤다.

- 9건: 모의 `structureService`에 `applyLevelsToVolatilityCard`가 없었다. 실제 순수 구현을 시험 로더에 연결했다.
- 14건: 로더가 `isFlowTicker`를 읽지 않아 허용 티커도 `invalid ticker`가 됐다. 실제 순수 티커 검사를 연결했다.
- 1건: 앞 시험에서 남은 opt-in 메모리 캐시가 다음 시험의 합성 OI 행·시각을 가렸다. 시험별 캐시 범위를 분리했다. 캐시 자체의 동작은 기존 `optionMetricsCache` 시험으로 별도 검증한다.
- 1건: 현재 `IVSkewCurve`에 존재하지 않는 `getGammaFlipSub`를 AST에서 찾았다. 그 낡은 참조를 제거하고 현재 IVSkew 시험을 실행한다. Guardian 두 화면의 감마플립 거리 검증은 유지했다.

최종 시험 묶음과 타입 검사는 공용 `/usr/bin/lockf -k /tmp/signum-heavy.lock`을 사용해 순차 실행한다. 앞선 실행에서 사용한 기존 시험 10개 파일 전체와 새 회귀·기존 IVSkew 전용 시험이 검증 범위다. 저장소의 모든 시험 파일을 실행했다는 뜻은 아니다.

| 시험 파일 | 실제 결과 줄 |
|---|---|
| `gexGuardianIsolation.test.js` | `6/6 통과` |
| `gexHistoryGuardian.test.js` | `결과: 6 통과 · 0 실패` |
| `oiPcrSpyGuardian.test.ts` | `12/12 통과` |
| `optionMetricsCache.test.ts` | `15 tests passed; measured baseline 140/2 requests, cached hit 0/request, simultaneous 70/10 requests.` |
| `oiNear35.test.ts` | `34/34 통과` |
| `sessionArchiveB3.test.ts` | `12개 통과` |
| `appAccuracy2.test.ts` | `appAccuracy2: 22건 통과` |
| `watchlistInsights.test.ts` | `96/96 통과` |
| `optionLevelGate.test.ts` | `61개 통과` |
| `integrityStructUnify.test.js` | `85 passed, 0 failed` |
| `gammaFlipDistance.test.js` | `# pass 15 · # fail 0` |
| `ivSkew.test.cjs` | `# pass 39 · # fail 0` |
| `tsc --noEmit --pretty false` | 종료 코드 0 · 출력 0바이트 · 오류 0 |

이전 과제의 기존 시험 10개 파일 전체는 **358 통과·0 실패**다. 새 회귀 6건과 기존 IVSkew 39건을 더한 최종 합계는 **403 통과·0 실패**다. 결과 줄은 실제 실행 로그에서 추출했다. 저장소의 모든 시험 파일을 실행한 것은 아니다.

옵션 레벨 시험의 첫 묶음 실행은 외장 볼륨의 `src` 전수 읽기 중 실행기에 설정한 120초 제한으로 종료 124였다. 단언 실패는 없었다. 이 파일만 제한을 900초로 늘려 재실행했고 전체 61건·종료 0을 확인했다. 다른 통과 시험과 tsc는 이 사유로 반복하지 않았다. 전체 tsc는 한 번 실행해 종료 0·오류 0이었다.

원본 로그는 `/tmp/signum-guardian-verification/`과 `/tmp/signum-guardian-integrity-after.log`에 있다. 옵션 레벨의 최종 로그는 `optionLevelGate.retry.log`다. `summary.txt`에 한국어 결과 줄을 별도로 기록했다.


재현 명령(작업공간 루트, `.env*`를 로드하지 않음):

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock env \
  TS_NODE_TRANSPILE_ONLY=1 \
  TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","jsx":"react-jsx","esModuleInterop":true,"resolveJsonModule":true}' \
  sh -eu -c '
for file in \
  tests/gexGuardianIsolation.test.js \
  tests/gexHistoryGuardian.test.js \
  tests/oiPcrSpyGuardian.test.ts \
  tests/optionMetricsCache.test.ts \
  tests/oiNear35.test.ts \
  tests/sessionArchiveB3.test.ts \
  tests/appAccuracy2.test.ts \
  tests/watchlistInsights.test.ts \
  tests/optionLevelGate.test.ts \
  tests/integrityStructUnify.test.js \
  tests/gammaFlipDistance.test.js \
  tests/ivSkew.test.cjs
do
  case "$file" in
    *.ts) node -r ts-node/register -r tsconfig-paths/register "$file" ;;
    *) node "$file" ;;
  esac
done
node node_modules/typescript/bin/tsc --noEmit --pretty false
'
```

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

- 운영 배포·실데이터 확인은 운영 세션이 담당한다. 기존 배포 절차와 되돌림 명령은 위에 보존했다. 이번 보완은 웹 읽기 코드에도 반영해야 한다.
- 정상 옵션 수집·복원 값이 모두 없으면 정규화 지수나 임의 숫자로 대신하지 않는다.
- 최신 폴백의 최근 8행 조회 상한, 이력 조회의 기존 페이지 상한, 이미 만들어진 응답 캐시 수명은 유지한다. 운영 캐시를 삭제하거나 갱신하지 않았다.
- 검증 범위는 앞선 과제의 기존 시험 묶음과 이번 회귀·IVSkew 시험이다. 운영 데이터의 상태·배포 결과는 이번 시험으로 입증하지 않는다.
