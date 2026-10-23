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

## 관문 재심 — 마감 1분봉·LIVE 신선도

### 원인과 수정

- 마감값 소실: `marketFeedJob.fetchOneQuote`는 기존 `reconcileIndexQuote`가 선택한 마지막 정규장 1분봉의 시작 시각을 `marketTime`에 보존한다. 기존 `buildMarketIndexBasis`의 장외 조건은 마감 시각 이후만 허용해 정상 15:59 봉을 버렸다. 이제 달력상 마감 직전 마지막 1분(정상 15:59, 조기 마감 12:59)의 관측도 완료된 세션 값으로 허용한다. 더 이른 장중 값·다른 세션·개장 전 시각은 계속 null이다. `asOf`는 원시각을 보존하며 조회 시각이나 16:00으로 바꾸지 않는다.
- 낡은 장중 값 LIVE: 같은 ET 날짜라는 조건만 있어 15:00에 09:30 관측도 LIVE였다. 현물 LIVE에도 기존 선물과 같은 20분 상한을 적용했다. 20분 초과 관측은 가격·세션·원시각을 보존하되 `live: false`이며 뉴스 입력은 기존 `regular-session observation` 분류를 사용한다. 공급사·수집·캐시 갱신 경로는 수정하지 않았다.
- `indexContext`의 마감 분류에도 마지막 1분봉 기준을 적용했다. 기존 문구를 사용하며 새 화면 문구를 만들지 않는다.

### 공유 함수 호출자와 영향

- `buildMarketIndexBasis`의 운영 호출자는 `services/marketIndexBasis.loadMarketIndexBasis` 하나다. 기존 Redis 4키 읽기와 미수집 NDX=null 계약은 유지된다. 그 반환값은 `macroHubProvider.getMacroSnapshotSSOT`와 `guardian/unifiedDataStream`의 기존 스냅샷 재판정으로 전달된다.
- 가격·변화 소비자: GuardianCore의 `deriveLocaleParts` → 새 계산/`overlayCore`/`withCashIndexBasis`, `guardianNumbers`, `unifiedDataStream`의 AI 입력·breadth, GuardianDesktop/MobileGuardianReality → RealityCheck → DualGauge, 앱 Guardian 페이지·MacroIndicators, `/api/live/market`. 마지막 마감 봉의 정상값이 null로 사라지지 않으며 결측은 null을 유지한다.
- `indexContext`의 운영 호출자는 news-digest의 `getMacroContext` 하나다. 오래된 장중 관측을 live로 설명하지 않으며 마감 보정 봉은 원시각과 함께 기존 마감 분류로 전달한다.
- `getMacroSnapshotSSOT`의 간접 호출자는 앞 절의 목록과 같다. 원천 조회·공급사 호출 수·TTL·갱신 주기·캐시 쓰기에는 변경이 없다.

### 회귀 범위

- `marketIndexBasisSession.test.ts`: 실제 `reconcileIndexQuote`의 15:59 보정 결과 → 17:00 Guardian 숫자/뉴스 입력, 세 현물 심볼, 주말·휴장·다음 개장 전/후, 정상·조기 마감 마지막 분/직전 경계, 실제 0/null, 09:30→15:00 낡은 시세, 20분 경계와 미래/손상 시각을 검사한다.
- `postCloseIndexBasis.test.ts`: 실제 Guardian GET의 15:59 마감값 보존, 실제 뉴스 생성 GET·AI 입력의 마감 원시각/분류, 오래된 장중 관측의 live 설명 차단을 추가했다. 공급사·AI·Redis는 시험 대역이며 각 뉴스 생성의 기존 공급사 호출 1회를 확인한다.

### 이번 실행 결과

- `/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs marketIndexBasisSession.test.ts`: 새 세션 회귀 6/6 통과.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs`: 전체를 한 번 실행해 **295/295 파일 통과, 실패 0, 종료 0**. 기존 GuardianCore 35건과 실제 H3/H4/M3 GET 및 추가 관문 재현도 이 실행에서 통과했다. 이 결과는 이번 `results.json`과 `/tmp/signum-postclose-offline-current.log`로 확인했으며, 앞 절의 1차 수리 `final.json` 결과를 재사용하지 않았다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false`: 한 번 실행, **종료 0, 오류 0**. `/tmp/signum-postclose-tsc-current.log` 출력 0바이트.
- `git diff --check` 통과. 커밋·push·병합·배포·운영 API/Redis/DB 쓰기·브라우저 접근은 실행하지 않았다.

### 미완료: 결측 화면 정책

이번 세션은 `guardianCore.ts`와 `MiniGauge.tsx`를 수정하지 않았다. 관문이 지적한 1차 수리의 결측 제목·설명과 게이지의 `—`·회색·원호 0은 여전히 남아 있으며, 관문 전체 수리 완료로 볼 수 없다.

`origin/main`의 DualGauge는 `priceValue: number`와 `priceValue.toFixed(1)`만 지원하고 결측 표시 계약이 없다. 그대로 원복하면 null 입력에서 오류가 나며, null을 0으로 치환하는 것은 이번 지시의 null 운반 원칙과 충돌한다. 화면 표시 변경도 금지돼 있어 결측 표시 정책을 사용자에게 질의했고 응답 대기 중이다. 새로운 표시를 임의 적용하거나 칸을 숨기지 않았다.

운영 실측·실제 화면·최신 원격 main은 확인하지 않았다. NDX 원천 부재와 기존 뉴스 AI 본문의 소급 수정 불가는 앞 절과 같다.

## 관문 2차 재심 수리 — 3차 작업

### 확인한 원인과 현재 수정

- 제목·설명: 1차 수리가 `deriveLocaleParts`의 현물 결측 분기에 전용 제목 `TACTICAL INSIGHT`와 짧은 설명을 추가했다. 해당 분기를 제거하고 기존 `VERDICT_TEXTS.SYNC` 제목과 ko/en/ja의 `reason.sync` 문장 템플릿을 복원했다. 원천 `indexBasis.cash.nasdaq.changePct`와 `guardianCashChange`는 null을 유지한다. Triple A의 상승 조건은 실패, regime은 NEUTRAL을 유지한다.
- 게이지: 1차 수리가 `DualGauge`에 결측 전용 `—`·회색·원호 0 분기를 추가했다. 원래 게이지는 숫자만 받고 호출자가 결측을 0으로 넘겼다. null 원천을 유지하면서 기존 화면 출력만 복원할지 사용자에게 질의했다. 답변 전에는 게이지를 수정하지 않는다.
- 기존 시험 3개 제외 지시에 따라 1차 수리에서 완화했던 `earningsScenario.test.cjs`와 `readCheck.test.cjs`를 `origin/main`과 동일한 원본으로 복원했다. 과거 범위 검증을 완화해서 전체 통과로 집계하지 않는다. `giftShareGate`도 수정하지 않는다.

### 공유 함수 호출자·회귀 범위

- `deriveLocaleParts`: 운영 직접 호출자는 `unifiedDataStream.computeGuardianSnapshot`과 `guardianCore.overlayCore`. `withCashIndexBasis`는 `overlayCore`를 통해 같은 coreAt의 기존 스냅샷을 재판정한다. 숫자 원천·추가 I/O·공급사 호출·캐시 정책에는 변화가 없다.
- `overlayCore`: `unifiedDataStream.withSharedCore`와 `withCashIndexBasis`가 사용한다. 기존 AI 실패 폴백 본문이 옛 괴리 문장과 같을 때만 복원된 템플릿으로 교정한다. AI가 만든 별도 본문은 기존 정책대로 유지한다.
- `DualGauge`: 운영 호출자는 `RealityCheck` 하나. 상위 `GuardianDesktop`과 `MobileGuardianReality`는 공용 현물 값 또는 null을 전달한다. `LiveTickerDashboard`의 `DualGaugeHUD`는 별개다.
- `postCloseIndexBasis.test.ts`: 제목·설명 원문 3언어, 결측 원천 null, Triple A의 상승 실패·NEUTRAL, 기존 캐시/AI 실패 폴백 교정, 실제 Guardian GET 3언어의 null·원문 유지·공급사 호출 0을 추가했다. 기존 H3/H4/M3 및 세션 회귀는 유지한다.

### 검증 상태

- 모든 무거운 명령은 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬 실행했다. 다른 작업공간이 먼저 보유한 잠금이 해제될 때까지 기다렸다.
- 개별 회귀 `postCloseIndexBasis.test.ts guardianCore.test.ts guardianNumbers.test.ts`: 3/3 파일 통과. GuardianCore 35건, GuardianNumbers 24건 및 실제 H3/H4/M3 GET·추가 결측 회귀 통과. 개별 실행의 `final.json`에는 이전 전체 결과가 합쳐지므로 이번 전체 판정에 사용하지 않았다.
- 전체 `node scripts/run-offline-tests.cjs`: 한 번 실행, 295개 파일 중 293개 통과/2개 실패, 종료 1. 실패는 `earningsScenario.test.cjs`의 기존 과거 범위 검사 2건과 `readCheck.test.cjs`의 기존 15번 기준 커밋 검사 1건이다. 각각 나머지 20/20건·17/17건은 통과했다. 지정된 제외 3개 파일 밖은 **292/292 파일 통과**이며, 제외 대상 `giftShareGate.test.ts`도 이번 환경에서는 통과했다. 현재 `.logs/ux-gate/results.json`과 `/tmp/signum-postclose-r3-offline.log`를 대조했다. 실패 검증을 완화하거나 전체 시험을 반복 실행하지 않았다.
- tsc: 공용 잠금 획득 뒤 `node node_modules/typescript/bin/tsc --noEmit --incremental false` 한 번 실행, **종료 0·오류 0**. 로그 `/tmp/signum-postclose-r3-tsc.log` 0바이트. 요청 뒤 다른 작업공간의 잠금을 기다린 시간과 실제 실행 시간을 구분해 확인했다.
- `git diff --check` 통과. 커밋·push·병합·배포·운영 쓰기·브라우저 접근은 실행하지 않았다.

### 남은 미해결 사항

두 관문 지적 중 제목·설명은 복원했지만, 게이지는 아직 미수리다. 기존 화면 출력 `+0.0%`·초록색·기본 원호를 마지막 표시 단계에서만 복원하고 원천·계산·전달값은 null로 유지해도 되는지, 또는 결측 표시 변경을 예외로 허용하는지 사용자 응답이 필요하다. 응답 부재를 승인으로 처리하지 않았으며 **전체 수리 완료로 판정하지 않는다**.
