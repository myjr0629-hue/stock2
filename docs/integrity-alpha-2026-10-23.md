# H2 · M8 알파 정합성 수리

대상: `fix/alpha-cross-screen`, 시작점 `d6c648194` (로컬 origin/main 동일).
감사 원문: `/Users/eunhoon/Documents/signum-work/2026-10-23/integrity-audit/AUDIT.md`.
운영 GET 재측정·운영 데이터 쓰기·커밋·push·병합·배포는 실행하지 않는다.

## 확인한 원인

- H2: sector snapshot GET은 17시대 저장된 점수를 다음 장 마감까지 고정해서 읽었다. XS 점수는 그 뒤 22:10 UTC에 게시되고 analysisCache 읽기는 XS로 교체한다. fast/fast-all 응답 캐시는 예전 점수를 담은 채 반환할 수 있었다.
- M8: getStockDataLight는 장외에 changePercent를 시간외 수익률로 반환했다. 알파 priceChange 근거가 당일 정규장 등락 대신 그 값을 사용했다.
- M8: watchlist 배치는 매크로를 ndxChangePct/vixValue/vixChangePct/realYieldStance로 조립하고 nqChangePercent/vix/factors.vix.chgPct/realYield.stance로 읽어 값을 잃었다.
- M8: FINRA 다크풀 복원은 분석 캐시를 읽은 뒤 수행하지만 저장된 pillars는 복원 전 값이었다. FINRA shortPct는 분석 캐시의 shortVolPct에 전달하지 않았다.
- M8: 원천 주가 스냅샷에 없는 VWAP을 배치가 null로 내보냈다. 종목 화면은 같은 세션 분봉 저장본으로 이미 VWAP을 계산한다.

## 변경과 영향

- 최신 snapshot GET, fast, fast-all을 기존 watchlist/portfolio/live ticker/command와 같은 readOptionAlpha 출구로 연결한다. 점수·등급·XS 원천 날짜(scoreAsOf)를 함께 운반한다. 과거 date 지정 조회는 변경하지 않는다. 최신 스냅샷 평균은 최종 종목 점수의 측정값만으로 계산한다.
- readOptionAlpha는 저장된 ticker 정규장 가격 쌍, 같은 세션 분봉 VWAP, FINRA DP/SV, 매크로 저장본을 사용해 기존 V8 근거 산식을 다시 실행한다. 기존 게시 점수/행동과 XS 표시 정책은 유지한다. 정규장 관측 시각과 입력을 evidenceAsOf/evidenceSession/evidenceInputs에 운반한다.
- NQ 선물 수익률을 NDX 현물 근거로 사용하지 않는다. 저장된 QQQ의 정규장 가격 쌍이 있으면 기존 엔진의 QQQ 프록시 기준을 사용한다. 현물/프록시 측정값이 없으면 null이다.
- getStockDataLight의 호출자는 같은 파일의 캐시 복구 2곳과 full 계산 1곳이다. 반환 가격·등락은 정규장 기준이며 시간외 등락은 별도 필드를 유지한다. 측정되지 않은 정규장 가격·등락·VWAP은 null이다.
- analysisCache FINRA 보충은 모든 분석 캐시 소비자에 공매도 비중을 함께 전달한다. 실제 없는 블록 거래는 null이다.
- xsSnapshotOverride/xsOverride 공용 함수의 기존 점수·등급 산식은 유지하고 원천 날짜 필드만 추가한다. 호출 영향: alphaEngine, analysisCache, intel/fast, watchlist/analyze, command/unified와 공통 알파 출구.
- ensureXsScores 비동기 읽기는 최신 게시본을 확인한다. 여러 요청이 같은 서버에서 동시에 읽으면 기존 single-flight를 유지한다. 동기 계산용 10분 메모리 값이 비동기 API의 새 게시본을 가리지 않는다.
- 공급사 호출을 추가하지 않는다. 추가 입력 조회는 Redis 저장본의 일괄 읽기다. 화면 컴포넌트·문구·라벨·레이아웃은 변경하지 않는다.

## 바꾼 파일

- 숫자 원천·공용 읽기: `src/lib/alphaEvidence.ts`, `src/lib/publishedAlpha.ts`, `src/services/optionAlphaService.ts`, `src/services/analysisCache.ts`, `src/services/watchlistBatchService.ts`, `src/services/xsScores.ts`.
- API 출구: `src/app/api/intel/snapshot/route.ts`, `src/app/api/intel/fast/route.ts`, `src/app/api/intel/fast-all/route.ts`.
- 시험: `tests/alphaCrossScreen.test.cjs`, `tests/integrityStructUnify.test.js`, `tests/intelFastFallback.test.js`, `tests/earningsScenario.test.cjs`, `tests/readCheck.test.cjs`.
- 기록: 이 파일. 검증용 `node_modules` 링크와 `next-env.d.ts`는 Git 무시 대상이다.

## 회귀와 검증

`tests/alphaCrossScreen.test.cjs`에서 운영 코드의 GET/출구/매퍼와 실제 XS·V8 엔진을 메모리 저장소로 실행한다.

- H2: 70종목, XS 실측 0, Redis/DB 최신 snapshot, 과거 date 조회 보존, fast·fast-all 동등성, 결측 대체 0 거부.
- M8: NVDA 정규장 -4.4%와 시간외 -0.2% 분리, DP 39.5%·SV 41.5%·VIX 19.03·VWAP 213.659, QQQ/NQ 기준 구분, 같은 세션 분봉 복원, 결측/보합 구분.
- 추가 알파 회귀 9건 통과. 영향 범위 선행 검사 4개 파일 통과: alphaCrossScreen, integrityStructUnify(85건), intelSnapshotScore, optionMetricsCache(15건).
- `node scripts/run-offline-tests.cjs` 전체 294개 파일 실행: 최초 292개 통과, 2개 실패. 두 실패는 과거 커밋 이후 `src` 전체가 변경되지 않았어야 한다는 기존 도입 범위 검사였다. HEAD 자체도 해당 과거 기준 대비 40/46개 경로가 달라, 이번 수리와 독립적으로 성립하지 않는 조건이었다.
- earningsScenario 검사는 시뮬레이터 기능 경로로 한정하고 계산·600조합·현재 SSR 비교를 유지했다. readCheck의 도입 범위 검사는 실제 도입 검수본 bf050fa47과 이전 기준 8efa93c14를 비교하도록 고쳤고, 현재 규칙·서비스·SSR 시험은 유지했다.
- 실패 두 파일만 개별 재검사: earningsScenario 22/22, readCheck 18/18 통과. 최종 294/294개 파일 통과. 전체 묶음은 반복 실행하지 않았다. 결과: `.logs/ux-gate/final.json`.
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false --pretty false`: 실제 실행 1회, 종료 코드 0, 오류 출력 0바이트 (`.logs/ux-gate/tsc.log`).
- 모든 무거운 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 안에서 직렬 실행했다. JS 문법 검사·`git diff --check`도 통과했다.

운영 세션 재확인 GET: `/api/intel/snapshot?sector=m7` ↔ `/api/intel/fast-all` ↔ `/api/watchlist/batch?mode=price&tickers=NVDA,MSFT,TSLA,ARM`; 근거는 `alphaSnapshot.pillars`와 `evidenceInputs`, 점수 시점은 `scoreAsOf`/`alpha_score_as_of`/`alphaScoreAsOf`를 비교한다.

## 남은 확인

배포 후 운영 세션에서 장외와 정규장 양쪽의 같은 종목·원천 날짜를 재측정해야 한다. XS 기존 저장 형식은 게시 시각 없이 거래일(date)만 제공하므로 scoreAsOf도 그 정밀도를 유지한다. 저장된 같은 세션 가격/분봉이 없는 종목은 공급사 추가 호출로 메우지 않는다.
