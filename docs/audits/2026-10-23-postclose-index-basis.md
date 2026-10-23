# 2026-10-23 H3·H4·M3 현물/선물 기준 수리

## 확인한 원인

`macroHubProvider.factors.nasdaq100/spx`와 legacy `nq/nqChangePercent`는 NQ/ES 선물(일부 실패 경로는 QQQ 환산)을 담는다. Guardian의 괴리·Triple A·AI 입력, news-digest의 시장 맥락, live/market의 `I:NDX` 매핑이 이 필드를 현물로 읽었다. 현물 `^IXIC`, `^GSPC`는 기존 market-feed 캐시에 별도로 존재한다. 실제 `^NDX` 피드는 수집 목록에 없다.

## 수리 계약

- 공용 `indexBasis.cash.{nasdaq,ndx,spx}`는 각각 `^IXIC`, `^NDX`, `^GSPC`만 허용한다. `price/changePct/asOf/sessionDate/source/basis/live`를 함께 운반한다. 기준 시각은 체결 시각이며 조회·캐시 갱신 시각으로 갈아끼우지 않는다.
- `indexBasis.futures.{nq,es}`는 `NQ=F`, `ES=F`만 허용한다. 선물의 `changePct`는 **전일 정산가 대비**이고 자체 `asOf`를 가진다. 선물 체결일을 현물 정규장 날짜로 쓰지 않는다.
- 현재 수집에는 현물 마감 순간의 선물 기준 관측이 없다. 따라서 진짜 현물 마감 이후 선물 수익률인 `sinceCashClosePct`와 `cashCloseReferenceAt`는 null이다. 전일 정산가 대비 변화에서 현물 일간 변화를 빼서 만들지 않는다.
- 결측·DEFAULT·잘못된 심볼·유효하지 않거나 미래인 체결 시각은 null이다. 0은 실제 관측값일 때만 유지한다. `ndx`는 새 공급사 호출 없이 null을 반환하며, 선물이나 Nasdaq 종합으로 대체하지 않는다.
- `getMacroSnapshotSSOT`의 기존 원천 조회·캐시 정책은 그대로 두고 반환값에 공용 관측을 추가한다. 추가 작업은 기존 Redis 키 4개의 읽기다. 공급사 호출·수집 심볼·수집 주기·새 캐시 쓰기는 추가하지 않았다.

## 호출자와 영향

- `getMacroSnapshotSSOT`: `watchlistBatchService`, `marketBackdropLoader`, `guardian/unifiedDataStream`, `guardian/rlsiEngine`, `reportScheduler`, `terminalEnricher`, `stockApi`, API `debug/audit`, `market/macro`, `live/market`, `live/ticker`, `dashboard/unified`. 기존 필드 의미는 유지하고 `indexBasis`만 추가한다. RLSI 점수 계산/선물 간 상대강도 알고리즘은 이번 수리 범위에서 변경하지 않았다.
- `guardianCore.deriveLocaleParts`: 새 코어와 `overlayCore`, 새 `withCashIndexBasis`가 사용한다. 후자는 같은 coreAt의 옛 스냅샷·lastgood도 공급사 재계산 없이 현물로 다시 판정한다. 결측으로 동기화·이상 없음 판정을 만들지 않는다.
- `guardianNumbers` 추출 함수: `unifiedDataStream`과 `intelligenceNode`가 생성 재료·응답 검사·자리표를 사용한다. Nasdaq 종합·S&P 현물만 읽으며 선물 fallback은 제거했다. AI 프롬프트에는 세션·시각을 가진 공용 묶음도 전달한다.
- `getMarketBreadth`: 호출자는 `rlsiEngine`과 `unifiedDataStream`. 후자는 현물 변화 또는 null을 넘긴다. null은 괴리를 발생시키지 않는다. 원래 분포·캐시·수집은 유지한다.
- `RealityCheck`: 호출자는 GuardianDesktop과 MobileGuardianReality. 둘 다 공용 현물 변화만 전달한다. 하위 `MiniGauge.DualGauge`는 이 컴포넌트에서만 사용한다. 결측은 기존 칸·PRICE 라벨을 유지하며 숫자 대신 —로 전달한다. 이름이 비슷한 `LiveTickerDashboard`의 `DualGaugeHUD`는 별개 컴포넌트다.
- `OracleHeader`: GuardianDesktop의 사용하지 않는 legacy prop 타입만 nullable로 확장했다.
- `useMacroSnapshot`: 응답 타입에 공용 묶음을 추가한다. Guardian 앱의 `NASDAQ 100`은 실제 NDX만, 기존 `S&P 500 F`는 ES 선물만 읽는다. Nasdaq 종합·S&P 현물로 fallback하지 않는다. MacroIndicators의 NDX/VIX 판정도 NDX 현물만 읽는다. 라벨·문구·레이아웃은 수정하지 않는다.
- news-digest: 기존 macro 요청 결과의 `indexBasis`로 현물·선물 이름/비교 기준/세션/체결 시각을 구성한다. 기존 공급사·AI 호출 수와 갱신 주기는 유지한다.

## 재현 GET 및 회귀 시험

운영 재현 경로는 감사 보고서와 같다. 이 작업에서는 운영 GET을 실행하지 않았다. 이 GET들도 내부 갱신/캐시 쓰기를 유발할 수 있으므로, 실제 핸들러와 캐시·공급사·AI 대역으로 오프라인 재생했다.

- H3 `/api/debug/guardian?force=false&locale=ko`: 현물 -2.60%, NQ -0.06%, RLSI 29.2를 넣으면 Deep Freeze(D), 체크리스트 -2.60%·통과 false. ko/en/ja, 같은 coreAt의 기존 스냅샷, 실제 공개 응답 출구, 게이지 null을 확인한다.
- H4 `/api/guardian/news-digest?refresh=1&locale=ko`: 실제 생성 핸들러가 NASDAQ Composite 26008.86(-2.60%), S&P 7663.43(-1.21%), 별도 NQ 29123.75(-0.06%)와 각 시각을 AI에 전달하는지 확인한다. AI 문장의 품질을 실제 모델로 측정한 시험은 아니다.
- M3 `/api/live/market`: `I:NDX`에 NQ 가격이 들어가지 않고 null을 유지하는지, 실제 NDX가 주어졌을 때만 28958.69/-2.88%가 매핑되는지, 별도 선물·시각이 유지되는지 확인한다.
- 추가로 장중·주말·실제 0·결측·NaN·DEFAULT·심볼 혼동·손상/미래 시각·개장 전 벤더 시각 전진·미완료 세션·옛 세션·조기 폐장을 확인한다.
- 새 회귀: `tests/postCloseIndexBasis.test.ts`. 기존 GuardianCore/GuardianNumbers 및 integrityAudit 시각 시험의 현물 재료를 새 계약에 맞췄다. Tactical 캐시 시험에도 새 현물 묶음/재판정 대역을 추가했으며, REAL 계산의 격리 시험 두 파일에는 새 공용 캐시 의존성을 호출 금지 대역으로 명시했다(계산 시험에서 캐시 I/O는 계속 금지).

## 전체 시험에서 발견한 기존 검증 결함

`earningsScenario.test.cjs`의 두 검증은 고정된 과거 커밋 이후 저장소 전체 `src` 변경을 금지했다. 현재 origin/main에 이미 병합된 쿠폰·랭킹 등의 변경으로도 실패하며 선행 작업공간의 동일 시험에서도 실패를 확인했다. 범위 비교는 earnings-scenario의 클라이언트·공용 라이브러리·서비스로 한정하고, 과거 원본과의 600조합 계산/표시값 비교 및 read-check·실적 영수증 실제 소스/3언어 SSR 비교는 유지한다. 운영 코드 변경은 없다. readCheck 시험에도 같은 저장소 전체 변경 금지 검증이 있어, 영수증·실제로 사용하는 원천 API·내부자 어댑터의 소스 바이트 대조로 한정했다. 기존 기본 호출·3언어 SSR 검증은 유지한다. 전체 묶음 재실행 대신 실패 파일만 재검사한다.

## 운영 세션에 남기는 경계

- 배포·병합·push·커밋·운영 쓰기는 실행하지 않는다. 현재 기반 HEAD는 작업 시작 시 로컬 origin/main과 동일했다. 원격 fetch는 FETCH_HEAD 쓰기 권한 거부로 실패해 최신 여부를 재검증하지 못했다.
- news-digest의 이미 저장된 AI 문장은 기존 생성 당시의 잘못된 해석을 포함할 수 있다. 호출 증가나 항목 숨김 없이 수리하기 위해 캐시 키/TTL/갱신 주기는 바꾸지 않았다. 운영 적용 후 기존 정기 갱신으로 새 항목이 누적된 뒤 GET을 대조해야 한다. 오래된 AI 본문은 새 입력만으로 소급 수정되지 않는다.
- NDX 실수치를 복구하려면 기존 수집 안에서 실제 NDX 원자료를 확보하는 별도 원천 결정이 필요하다. 이번 작업은 새 공급사 호출을 추가하지 않는다. 실제 장 마감 이후 선물 수익률도 마감 시점 선물 기준 관측을 확보하기 전에는 null이다.
- 운영 실측·화면 렌더·실제 모델 출력은 확인하지 않았다. 화면 라벨 변경이 필요하다면 운영 세션에서 별도 제안으로 검토한다.

## 실제 검증 결과

- `/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs`: 294개 파일 전부 실행, 최초 288 통과/6 실패. 위의 과거 범위 검증과 시험 대역을 보완했다.
- 동일 공용 잠금으로 실패 파일만 재검사: `earningsScenario.test.cjs` 1/1, `integrityAudit.test.ts integrityAudit2Fund.test.ts integrityAudit2FundGate.test.ts` 3/3, `readCheck.test.cjs tacticalCache.test.ts` 2/2 통과. `.logs/ux-gate/final.json` 기준 **최종 294/294 통과, 실패 0**. 전체 묶음을 반복 실행하지 않았다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false`: **종료 0, 오류 0**. 한 번만 실행했다.
- 새 H3/H4/M3 GET 회귀 파일 통과. 기존 GuardianCore 35개, GuardianNumbers 24개 개별 검증도 통과했다.
- UI 7개 파일의 JSX 문구·태그·고정 속성을 HEAD와 정적 대조해 동일함을 확인했다. 숫자 단위 `%`를 JSX 식 안으로 옮긴 부분은 제외하고 비교했으며, 실제 게이지의 -2.6%와 null→—는 React 정적 렌더로 별도 확인했다. 브라우저 화면 검증은 수행하지 않았다.
- `git diff --check` 통과. 비밀 파일을 읽거나 운영 GET/쓰기·커밋·push·병합·배포를 실행하지 않았다.
