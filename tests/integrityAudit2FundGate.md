# 정합성 감사 2차 — 관문 보류 후속 수리

기준 HEAD: `b50b3d11d`, 작업 브랜치: `fix/integ2-fund`.
관문 `gate-fix_integ2-fund-10182237.md` 전체와 감사 `FINDINGS.md` 전체를 먼저 읽었다.
아래 결과는 합성 입력을 사용하는 오프라인 실행으로 확인했다. 운영 발생 여부·빈도는 미확인이다.

## 해소한 관문 지적

1. **“결측 기대인플레이션으로 실질금리 생성”**
   - 관문 원문: “어댑터가 `Number(null)`로 0을 만들고 새 검증을 통과시켜 **실질금리 +4.20%·TIGHT**를 반환합니다.”
   - 원인: `getEconomicSeries`가 변환 전에 관측 존재 여부를 확인하지 않았다.
   - 수리: 숫자 또는 공백 아닌 숫자 문자열만 변환하고 유한성 검사를 유지한다. null·undefined·공백·불리언·객체·비유한값은 관측에서 제외한다. 숫자 0과 문자열 '0'은 보존한다.
   - 실행: 실제 어댑터 함수 → 실제 `getInflationData` → 실제 `fetchRealYieldData`를 연결하고 외부 I/O만 대체했다. 명목 4.2, 같은 날짜의 기대인플레이션 null이면 실질금리는 null이다. 최신 결측 뒤에 이전 날짜의 유효 관측이 있어도 날짜를 승격하지 않는다. 실제 기대인플레이션 0이면 기존 +4.2/TIGHT 계산을 유지한다.
   - 캐시: 매크로 스냅샷 키 v4 → v5. 옛 계산 결과를 재사용하지 않도록 코드의 키만 변경했다.

2. **“재무 보정이 기존 메타데이터 삭제”**
   - 관문 원문: “객체 전체 교체로 해당 필드들이 삭제됩니다. 공급사 응답에 시가총액이 있어도 유실됩니다.”
   - 원인: `overlayFundamentals`가 기존 fundamentals를 재조회 결과 또는 null로 통째로 교체했고, 재무 API fallback 반환에 이미 읽은 marketCap이 없었다.
   - 수리: 기존 필드와 breakdown 하위 필드를 보존하며 유효 재조회 값을 합친다. null/누락 메타데이터는 기존 값을 지우지 않고, 공급사 marketCap은 실제 0까지 우선 반영한다. 검증 대상인 netMargin·revenueGrowth·score·grade는 재조회 결과로 명시 갱신한다.
   - 실패·티커 부재: 메타데이터는 보존하고 netMargin/revenueGrowth/score는 null, grade는 기존 NO_DATA를 사용한다. 기존 rev/margin breakdown의 값은 기존 ‘—’, 점수 기여는 0으로 무효화하고 라벨·다른 필드는 보존한다. 실패를 검증 완료 판본으로 표시하지 않는다.
   - 캐시: 재무 SWR 키 v3 → v4. 누락된 시가총액을 담은 옛 fallback 결과 재사용을 피한다.
   - 실행: 실제 재무 GET → 실제 통합 `jsonResponse`를 연결했다. 회사명·업종·시가총액·가격·임의 추가 필드 보존, 공급사 시가총액 456/0, 순이익률·성장률·점수 0, null/오류/예외 응답, 티커 부재, 이미 보정된 판본의 추가 호출 0건을 확인했다.

## 공유 함수 호출자 전수와 영향

`src`, `scripts`, `tests`의 TS/TSX/JS를 함수명·API 경로로 검색했다. 실행 코드의 직접 호출자는 다음과 같다.

- `getEconomicSeries`:
  - `intrinioClient.getTreasuryYieldsFred`: 국채 만기별 map 1곳. 누락 관측은 곡선에 0으로 채워지지 않는다.
  - `intrinioClient.getInflationIntrinio`: CPI·PCE 2곳. 원시 관측 부재는 지수 0으로 변환되지 않는다.
  - `intrinioClient.getInflationExpectationsIntrinio`: 1곳. 기대인플레이션 null이 유효 0으로 변환되지 않는다.
  - `macroEconomy.getMacroEconomy`: DFF·UNRATE·CPIAUCSL·PAYEMS·UMCSENT·GDP·T10Y2Y 7곳. 기존 결측 처리에 실제 결측 관측이 전달된다. 실제 0인 정책금리는 유지된다.
  - 위 네 경로 모두 새 회귀시험에서 실행했다. 반환 타입과 공급사 호출 횟수는 바꾸지 않았다.
- `getTreasuryYieldsFred`는 `getTreasuryYieldsIntrinio`의 FRED fallback 하나에서 호출된다. 물가/기대인플레이션/국채 어댑터는 `intrinioRouter`의 각 `/fed/v1/*` 분기로 전달된다. `getMacroEconomy`는 `/api/market/economy` GET 하나가 호출한다. 이 소비자 코드는 수정하지 않았다.
- 재무 GET 직접 소비자: 앱 Command, Command unified 내부 보정 1곳 및 캐시·배경·DynamoDB·최종 fallback 보충 4곳, `api/cron/signum-warm` 경로 생성 1곳. 스크립트 `live_api_stress_test.js`, `audit-empty-fields.js`, `audit-endpoints.js`, `redis-ab-load.js`, `test_live_fundamentals.js`의 동일 API 참조는 정적 검색만 했다. API의 기존 필드는 유지하며 fallback에 marketCap을 추가했다.
- `overlayFundamentals`: `jsonResponse` 1곳. `jsonResponse`는 메모리 LRU·Redis·DynamoDB·스냅샷·직접 생성·부분 실패의 6개 응답 출구가 사용한다. 함수 및 응답 출구를 추출한 실제 코드를 실행했다. 이미 `_incomeMetricsVersion: 1`인 객체와 null fundamentals는 추가 조회하지 않는다.
- 매크로 키 변경은 기존 `getMacroSnapshotSSOT`의 Redis 읽기·쓰기 키에만 적용된다. 기존 10Y 계산·UI 라벨·표시 코드는 수정하지 않았다.

## 시험 증거

- 수정 전 관문 회귀: **4 통과 / 13 실패**, exit 1. 두 관문 사례 모두 실패를 먼저 확인했다.
- 수정 후 관문 회귀: **19/19 통과**, exit 0. 최초 17개 외에 공유 호출자 `macroEconomy`의 결측·실제 0 대조 2개를 추가했다.
- 기존 감사 ID 10~15 회귀: **30/30 통과**, exit 0.
- 전체 타입 검사: `tsc --noEmit --incremental false` **1회 통과**, exit 0. 검사용 node_modules 심볼릭 링크는 검사 후 제거했다.
- `git diff --check`: 통과.
- 변경 파일 6개의 비밀값 검사: `node scripts/check-secrets.js <6개 파일>` 통과.
- 시험은 `NODE_PATH`로 원 저장소의 node_modules를 사용하고 ts-node/tsconfig-paths를 preload했다. 모든 실행 시험과 전체 타입 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬화했다.

```sh
NODE_PATH=/Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules \
TS_NODE_TRANSPILE_ONLY=1 \
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
/usr/bin/lockf -k /tmp/signum-heavy.lock sh -c \
'node -r ts-node/register -r tsconfig-paths/register tests/integrityAudit2FundGate.test.ts && node -r ts-node/register -r tsconfig-paths/register tests/integrityAudit2Fund.test.ts'

/usr/bin/lockf -k /tmp/signum-heavy.lock node \
/Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules/typescript/bin/tsc --noEmit --incremental false
```

## 남은 위험

- 운영 공급사 응답·캐시 갱신·실제 화면은 확인하지 않았다. 브라우저·서버·운영 API·DB·Redis를 실행하거나 접근하지 않았다. 배포·푸시·병합도 하지 않았다.
- 기존 보정 판본 캐시에 이미 삭제된 메타데이터는 이 코드가 원천 없이 복원하지 않는다. 이후 원천 응답/캐시 재생성이 필요할 수 있다. 실제 운영 캐시는 변경하지 않았다.
- 공유 경제지표 호출자의 기존 월별 배열 위치 기반 비교 방식은 변경하지 않았다. 관측 사이 기간 누락에 대한 비교 기간 검증은 별도 범위다.
- 화면 파일·라벨·번역은 수정하지 않았으며 `.env*`는 읽지 않았다.

## 바꾼 파일

- `src/services/intrinioClient.ts`
- `src/services/macroHubProvider.ts`
- `src/app/api/live/fundamentals/route.ts`
- `src/app/api/command/unified/route.ts`
- `tests/integrityAudit2FundGate.test.ts`
- `tests/integrityAudit2FundGate.md`

## 로컬 커밋 상태

지정 브랜치에서 위 6개 경로만 `git add`했으나, 공통 Git 디렉터리의 `worktrees/fix-integ2-fund/index.lock` 생성이 `Operation not permitted`로 거부됐다. 인덱스 변경·커밋은 생성되지 않았다. 현재 승인 정책은 권한 상승을 허용하지 않는다.

수정 파일은 작업공간에 보존했다. 영어 커밋 메시지는 `/tmp/signum-integ2-fund-2-commit.txt`, 전달용 패치는 `/tmp/signum-integ2-fund-2.patch`에 남긴다.
