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

## 관문 보류 2건 후속 수리

- 원인 1: `readOptionAlpha`의 V8 재계산 입력에 `impliedMovePct`가 없어, 유효한 7.9%도 결측으로 처리되고 근거 점수가 3에서 0으로 떨어졌다. 기존 `readImpliedMoveFields`로 정의 표식·만기·숫자를 검증한 값을 재계산과 `evidenceInputs`에 함께 전달한다. 분석 캐시에 유효한 값이 없으면 현재 응답의 검증된 값을 사용하고, 모두 없으면 null을 전달한다. 점수·행동 게시 정책과 근거 문구 템플릿은 수정하지 않는다.
- 원인 2: 분석 캐시의 `alphaQuote`가 있으면 현재 배치 가격을 시각 비교 없이 버렸다. 같은 표시 세션의 유효한 ticker 저장본·분석 캐시·현재 배치 가격 후보를 관측 시각으로 비교한다. 선택한 가격 쌍으로 등락을 계산하고 그 관측 시각을 `evidenceAsOf`에 싣는다. 저장 가격의 VWAP 대체값도 선택한 가격 후보의 소유자에게서 읽는다.
- 공용 함수의 직접 호출자 7곳: `watchlistBatchService`, `portfolioBatchService`, `/api/live/ticker`, `/api/command/unified`, `/api/intel/snapshot`, `/api/intel/fast`, `/api/intel/fast-all`. 모두 동일한 근거 재계산을 사용한다. 과거 날짜 snapshot 조회는 기존 우회 경로를 유지한다. 새 공급사 호출·캐시 쓰기·추가 저장본 조회는 없다. 화면 소스는 변경하지 않는다.
- 변경 파일: `src/services/optionAlphaService.ts`, `tests/alphaCrossScreen.test.cjs`, 이 기록.
- 추가 회귀 2건: 7.9%·3점 유지, 정의 표식 없음·만기 경과·null·NaN의 결측 처리, 현재 응답의 유효 예상 변동 복원; 과거 가격 100·0%보다 현재 배치 120·+20% 우선, 반대 시간 순서, 다른 세션·미래/비정상 시각·결측 가격 제외, ticker 저장본과의 시각 비교, 가격/VWAP/근거 시각의 출처 일치, 게시 점수·행동 유지. 기존 9건과 합쳐 11/11 통과했다. 시험은 메모리 저장소를 사용하며 외부 호출·운영 쓰기를 차단한다.
- 이번 후속 수리 검증: `node scripts/run-offline-tests.cjs` 전체 1회 실행, 294/294개 파일 통과·실패 0·종료 코드 0 (`.logs/ux-gate/results.json`). 추가 회귀를 포함한 알파 시험은 11/11 통과했다. `node node_modules/typescript/lib/tsc.js --noEmit --incremental false --pretty false` 1회 실행, 종료 코드 0·오류 출력 0바이트 (`.logs/ux-gate/tsc-gate-followup.log`). 두 무거운 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬 실행했다. `git diff --check`도 통과했다.
- 운영·브라우저 검증, 커밋·push·병합·배포는 하지 않는다. 운영 반영 후 세션별 실측 확인은 운영 세션에 남긴다.

## 남은 확인

배포 후 운영 세션에서 장외와 정규장 양쪽의 같은 종목·원천 날짜를 재측정해야 한다. XS 기존 저장 형식은 게시 시각 없이 거래일(date)만 제공하므로 scoreAsOf도 그 정밀도를 유지한다. 저장된 같은 세션 가격/분봉이 없는 종목은 공급사 추가 호출로 메우지 않는다.

## 관문 2차 보류 후속 수리 (3차)

- 지적 1 원인: `readOptionAlpha`가 pillars를 재계산할 때 정상 계산에 사용한 F&G·MACD histogram·시간외 등락을 전달하지 않았다. 생산자도 이 입력을 snapshot에 남기지 않아, 응답과 분석 캐시를 다시 읽을 때 원천을 잃었다.
- 수리: 워치리스트 full·캐시 재계산·Dynamo 복원 경로에서 실제 계산에 사용한 세 입력을 `alphaSnapshot.evidenceInputs`와 `evidenceSession`에 함께 운반한다. live ticker는 세 입력을, portfolio는 이미 계산에 쓰는 시간외 입력을 운반한다. 공통 출구는 현재 응답을 우선하고 같은 정규장 세션의 저장 입력으로 보충한다. 유효한 0은 유지하고 비유한 수·결측은 null이다. 게시 점수·등급·행동과 근거 문구 템플릿은 유지한다.
- 지적 2 원인: 매크로의 legacy `vix`는 Yahoo 기본값 생성 결과인 15를 담을 수 있다. 숫자 유무만 검사하면 `FAIL`·`UNAVAILABLE` 값도 실측 VIX가 된다.
- 수리: Yahoo 저장본의 `DEFAULT`·`FAIL`·`UNAVAILABLE`을 제외하고, 매크로 대체는 `status=OK`이며 실패 원천이 아닌 factor의 양수 level만 사용한다. VIX 등락도 선택한 같은 관측에서 읽는다. 정상 원천이 없으면 VIX·등락은 null이며 VIX3M 기본값도 제외한다. 매크로에 실린 정상 F&G도 공통 입력으로 전달한다.
- 공용 함수 영향: `readOptionAlpha` 직접 호출자 7곳(`watchlistBatchService`, `portfolioBatchService`, `live/ticker`, `command/unified`, `intel/snapshot`, `intel/fast`, `intel/fast-all`), `alphaMacroInputs` 직접 호출자 2곳(`optionAlphaService`, `watchlistBatchService`)을 확인했다. 분석 캐시 타입에 선택적 입력 필드만 추가하며 저장 형식은 이전 항목과 호환된다. 공급사 호출·저장본 조회·운영 쓰기 증가는 없다. UI 컴포넌트·화면 문구·라벨·표시 소스와 엔진 문구 템플릿은 시작점 `d6c648194` 대비 변경 없음도 확인했다.
- 추가 회귀 3건: 실제 워치리스트 snapshot 매퍼와 V8 엔진을 연결해 cold/warm/기존 캐시 우선 상황에서 `F&G 20`·MACD 3점·시간외 역행 -3점 보존, 유효한 0·null·NaN·다른 세션 제외를 확인했다. live ticker·portfolio snapshot 매퍼도 실제 공통 출구에 연결했다. 실제 `getDefaultQuote`와 `createYahooFactor`로 만든 실패 매크로·저장본 부재/기본값/실패 상태 조합에서 VIX null, 정상 Yahoo/매크로·보합 0 보존과 관측 혼합 방지도 확인했다. 기존 11건 포함 14/14 통과, 공급사 호출·운영 쓰기 0이다. 수정 전 두 공용 함수 구현을 각각 메모리에서 연결하면 해당 새 회귀가 실패함을 확인했다.
- 변경 파일: `src/lib/alphaEvidence.ts`, `src/services/optionAlphaService.ts`, `src/services/analysisCache.ts`, `src/services/watchlistBatchService.ts`, `src/services/portfolioBatchService.ts`, `src/app/api/live/ticker/route.ts`, `tests/alphaCrossScreen.test.cjs`, 이 기록.
- tsc: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/lib/tsc.js --noEmit --incremental false --pretty false` 1회, 종료 코드 0·오류 출력 0바이트 (`.logs/ux-gate/tsc-gate-r3.log`)다.
- 전체 시험: `/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs` 1회, 294/294개 파일 통과·실패 0·종료 코드 0 (`.logs/ux-gate/results.json`, `.logs/ux-gate/offline-gate-r3.log`)다. 사용자 지정 예외 3개(`earningsScenario`, `giftShareGate`, `readCheck`)도 이번 실행에서는 통과했다. 전역 잠금을 지켜 다른 작업공간의 무거운 검사와 직렬 실행했다. `node --check tests/alphaCrossScreen.test.cjs`와 최종 `git diff --check`도 통과했다.
- 남은 위험: 입력을 저장하지 않았던 옛 snapshot의 MACD·시간외 원천은 추가 공급사 호출로 복원하지 않는다. 같은 세션의 실제 입력이 없으면 null이다. 운영·브라우저 확인은 수행하지 않는다. 커밋·push·병합·배포·운영 데이터 쓰기도 수행하지 않는다.
