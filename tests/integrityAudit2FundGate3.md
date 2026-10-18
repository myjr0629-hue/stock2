# 정합성 감사 2차 — 두 번째 관문 후속 수리

기준 HEAD: `cf7918c39`, 브랜치: `fix/integ2-fund`.
지정 관문 `gate-fix_integ2-fund-10182237.md`, `gate-fix_integ2-fund-10190111.md`를 먼저 읽었다.
원 지적 파일은 지정한 `integrity-audit/`에 없었으며, 인접한 `2026-10-18/integrity-audit2/FINDINGS.md`를 찾아 전체를 읽었다. 이번 대상은 fund ID 10~15와 두 관문의 보류 사유다.

## 결과 요약

- **경제지표 비교 기간**: 결측 행 제거 후 `rows[12]`가 13개월 전을 가리키는 것이 원인이다. 결측을 0으로 되돌리지 않고, CPI·PCE는 최신 관측 월에서 정확히 12개월 전을 찾는다. 비교 월이 없거나 분모가 0이면 전년비는 null이다. CPI 이전 전년비도 전월 및 그 전년 동월을 각각 찾는다.
- **공유 월·분기 비교**: 같은 어댑터를 쓰는 실업률·고용·소비심리·GDP도 배열 위치가 달력 기간이라는 보장이 없었다. 전월은 1개월 전, 고용 증가의 변화는 1·2개월 전, GDP 전분기는 3개월 전으로 고정했다. 수준 관측이 있는 실업률·소비심리는 그 값을 유지하고 비교값이 없으면 change만 null이다. 파생값의 필수 입력이 없는 CPI 전년비·고용 전월비·GDP 전분기비는 기존 missing 계약으로 반환한다. UI에 숨김 조건을 추가하지 않았다.
- **실질금리 결측 판정**: `RealityCheck`의 마지막 삼항 분기가 null까지 `stanceNeutral`로 처리한 것이 원인이다. REAL 게이지는 그대로 두고 실질금리 객체가 없을 때 보조 판정도 기존 결측 기호 `—`로 반환한다. 실제 실질금리 0의 NEUTRAL 및 기존 TIGHT/LOOSE 번역 키는 유지했다. 라벨·번역 사전·레이아웃은 수정하지 않았다.
- **1차 관문 재발 방지**: 실제 경제지표 어댑터 → FED → 실질금리 → REAL JSX 속성을 연결해 결측/날짜 불일치와 실제 0을 대조했다. 실제 재무 GET → 통합 응답 보정 → 재통과로 회사명·업종·시가총액·가격·임의 필드와 중첩 breakdown 메타데이터 보존, 원본 불변성, 추가 조회 1회만을 확인했다. 재무 구현은 이번에 변경하지 않았다.

## 공유 함수 호출자와 영향

- 새 순수 함수 `observationMonthsAgo`: `getInflationIntrinio`의 CPI·PCE 2곳, `getMacroEconomy`의 실업률·CPI(최신 전년 동월/전월/전월의 전년 동월)·고용(1·2개월)·소비심리·GDP 8곳. 월 단위 날짜 키로 선택하며 일간 관측이나 네트워크 요청은 처리하지 않는다. 직접 호출자를 모두 실행 시험했다.
- 변경한 `getInflationIntrinio`: `intrinioRouter`의 `/fed/v1/inflation` 분기 1곳 → `fedApiClient.getInflationData`. 이 결과는 `macroHubProvider.fetchRealYieldData`와 `fedApiClient.getFedSnapshot`이 읽는다. 전자는 매크로 스냅샷, 후자는 `reportScheduler`가 사용한다. CPI·PCE 반환 필드와 요청 수는 그대로다.
- 변경한 `getMacroEconomy`: `/api/market/economy` GET 1곳. 정상 7개 지표의 값·변화량을 고정했고, 월 누락·전년 동월 누락·전분기 누락을 따로 시험했다. 서비스의 기존 missing 집계 계약은 유지했다.
- `getEconomicSeries` 자체는 이번에 변경하지 않았다. 직접 호출자는 국채 FRED fallback 1곳, CPI·PCE 2곳, 기대인플레이션 1곳, `getMacroEconomy` 7곳이다. 결측 거절·실제 0 보존을 국채·물가·기대인플레이션·실물경제 경로에서 재검증했다. 일간 정책금리와 커브의 기존 유효 관측 간 비교는 변경하지 않았다.
- 변경한 `RealityCheck`: 데스크톱 `GuardianDesktop`과 모바일 `MobileGuardianReality` 2곳. 동일 REAL JSX를 실행해 결측 값/판정, 실제 NEUTRAL/TIGHT/LOOSE 및 REAL 라벨 보존을 확인했다. 다른 실질금리 소비자 `MacroIndicators`는 원래 결측을 중립으로 치환하지 않으므로 변경하지 않았다.
- `overlayFundamentals` 및 `jsonResponse`는 수정하지 않았다. 앞선 관문 시험과 새 반복 통과 시험으로 기존 메타데이터 보존을 확인했다.

## 돌린 시험과 결과

- 수정 전 새 회귀에서 경제지표 기간 7개·실질금리 결측 표시 1개가 실패했다. 정상 판정 및 기존 1차 관문 19개는 통과했다.
- 최종 `integrityAudit2FundGate.test.ts`: **31/31 통과**. 기존 19개와 새 12개를 포함한다. 외부 I/O를 가짜로 바꾸고 실제 생산 함수 및 REAL JSX 속성식을 실행했다.
- 기존 `integrityAudit2Fund.test.ts`: **30/30 통과** (ID 10~15, Lambda 계산 원문 일치 포함).
- 기존 `rankingLivePrice.test.ts`: **31/31 통과**, 시세와 캐시 의존성은 시험에서 주입한다.
- 기존 `yieldChange.test.ts`: **23/23 통과**.
- 기존 `unifyUs10y.test.ts`: **13/13 통과**. `/tmp/signum-fund-unify-offline.cjs`에서 실제 매크로 모듈의 외부 의존성을 격리하고 원래 시험 파일을 실행했다.
- 위 관련 무네트워크 시험은 합계 **128/128 통과**했다. 모든 실행 시험을 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬화했다.
- 실제 로컬 `origin/main`(`3adb8a44d`)·수정 전 HEAD·수정 후 함수의 같은 합성 입력 비교도 통과했다. 정상 자료는 셋 모두 CPI/PCE 전년비 20%였다. 중간 한 달 null 자료는 main 20% / 수정 전 50% / 수정 후 20%였다. 비교 실행기는 `/tmp/signum-fund-period-compare.cjs`이며 공급사 호출을 가짜로 대체했다.
- 전체 타입 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node <공유 node_modules>/typescript/bin/tsc --noEmit --incremental false` **1회 통과**, exit 0. 검사용 node_modules 심볼릭 링크를 검사 후 제거했다.
- `git diff --check` 및 변경 6개 파일의 비밀값 검사 통과. 전체 빌드는 실행하지 않았다.

```sh
NODE_PATH=/Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules \
TS_NODE_TRANSPILE_ONLY=1 \
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
/usr/bin/lockf -k /tmp/signum-heavy.lock sh -c \
'node -r ts-node/register -r tsconfig-paths/register tests/integrityAudit2FundGate.test.ts && node -r ts-node/register -r tsconfig-paths/register tests/integrityAudit2Fund.test.ts && node -r ts-node/register -r tsconfig-paths/register tests/rankingLivePrice.test.ts && node -r ts-node/register -r tsconfig-paths/register tests/yieldChange.test.ts'
```

## 바꾼 파일

- `src/lib/economicSeries.ts`: 월 단위 비교 관측 선택.
- `src/services/intrinioClient.ts`: CPI·PCE 전년 동월 선택.
- `src/services/macroEconomy.ts`: 월·분기 비교 기간 고정.
- `src/components/guardian/RealityCheck.tsx`: REAL 결측 보조 판정 `—`.
- `tests/integrityAudit2FundGate.test.ts`: 기간·실질금리·재무 보존 회귀 보강.
- `tests/integrityAudit2FundGate3.md`: 이번 결과와 호출자 영향 기록.

## 남은 위험

- 운영 공급사 데이터·발생 빈도·캐시 갱신·실제 브라우저 화면은 미확인이다. 시험 결과는 합성 입력에서 확인한 사실이다.
- 비교 월이 응답 범위에 없으면 추가 공급사 조회 없이 결측을 유지한다. 호출 수를 늘리지 않았다.
- 기존 운영 캐시에 이미 유실된 메타데이터는 원천 없이 복원하지 않는다. 이번 작업에서 운영 캐시를 변경하지 않았다.
- `.env*` 읽기, 브라우저, 서버 기동, 운영 API·Redis·DB 접근, 배포, 병합, push는 실행하지 않았다.

## 로컬 커밋 상태

시험·타입 검사 통과 후 지정 브랜치에서 변경 6개 파일을 `git add`했으나, 공통 Git 디렉터리의 `worktrees/fix-integ2-fund/index.lock` 생성이 `Operation not permitted`로 거부됐다. 스테이징과 커밋은 생성되지 않았고 HEAD는 `cf7918c39`다. 현재 세션은 권한 상승을 허용하지 않는다.

작업공간에 변경 6개 파일을 보존했다. 전달용 패치는 `/tmp/signum-integ2-fund-3.patch`, 영어 커밋 메시지는 `/tmp/signum-integ2-fund-3-commit.txt`에 저장했다. 패치는 추적 파일 4개와 새 파일 2개를 모두 포함한다.
