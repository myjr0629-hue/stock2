# 오늘 돈의 지도 — 관문 재검토 기록 (2026-10-20)

## 결과 요약

- **실측:** 관문 보류 3건을 회귀 시험으로 재현했다. 수정 전 기존 27건 통과 / 추가 6건 실패, 수정 후 돈의 지도 39건 통과.
- 시세 관측 시각을 응답 시각으로 바꾸던 경로를 제거했다. PRE는 `extendedTime`, REG는 `priceTime`/`regularTime`, 확정 종가는 원천 날짜·종류를 쓴다. 날짜·시각 불명인 이전 저장값은 날짜 표식을 유지하되 현재 순위에는 쓰지 않는다.
- POST·CLOSED·주말에도 오래된 장중 값과 SPY를 현재 마감 순위로 올리지 않는다. 원천 날짜가 확인된 종가 또는 마감 20분 이내 정규장 값만 마감 비교에 사용한다. 값 자체와 기존 칸은 유지한다.
- 반등 표식은 표시 중인 등락과 5일 값으로 엔진과 같은 조건(`오늘 > 0.3% / 5일 < -1%`, 또는 반대 방향)을 재판정한다. 오래된 Guardian 표식을 그대로 복사하지 않는다.
- 캘린더 전체 결측 시 복원한 행과 로컬 저장본을 렌더할 때도 기존 `validateRowImplied`로 발표 완료·만기 지남을 다시 검사한다. 발표가 끝난 실적 행은 유지하고 예상 변동폭만 무효화한다.
- 기존 Intel 카드·기존 라벨·messages는 이번 수리에서 수정하지 않았다. 경제지표 함수의 필수 인자 누락은 기존 동작과 같은 `false`를 명시해 고쳤다.
- 커밋·push·병합·배포·운영 쓰기·새 AI 호출·브라우저 접근은 하지 않았다. `.env*`는 읽지 않았다.

## 바꾼 파일

이번 수리의 변경 파일:

| 파일 | 변경 |
|---|---|
| `src/lib/app/moneyMap.ts` | 원천 시각·종가 종류 보존, 순위 신선도, 반등 재판정, 실적 복원·렌더 재검증 |
| `src/components/intel/TodayMoneyMap.tsx` | NQ 값의 원천 시각 종류 전달 |
| `src/components/intel/MoneyMapCards.tsx` | `formatEventName`의 누락된 필수 인자 명시 |
| `src/lib/bulkQuoteClose.ts` | 기존 가격 계산을 바꾸지 않는 순수 `regularQuoteProvenance` 추가 |
| `src/app/api/live/quotes/route.ts` | 기존 응답에 `regularDate/regularTime/regularKind`만 추가 |
| `tests/moneyMap.test.cjs` | 관문 6개 회귀, 시각·종가·오래된 저장본·발표 완료·실제 Guardian 재생 검사 |
| `tests/fixtures/money-map-reg-1019.json` | 원본에서 누락됐던 실제 `priceTime/priceBasis/priceSource` 복원 |
| `tests/fixtures/money-map-report-pre-1019.json` | 별도 `archivedGuardian` 필드에 10/15 보관 원본의 섹터 결과·원본 SHA-256 보관 |
| `docs/MONEY-MAP-1019.md` | 이 실행 기록 |

브랜치 기존 구현: Intel 상단 독립 카드 3장, `SECTOR_MAP` 정본 16개(실제 ETF 14 + 합성 평균 2), ko/en/ja moneyMap 문구, 기존 Guardian·analysis·실적·경제·AI 캐시 읽기 경로. 원천 거래일 없는 옵션/5일 값은 관측일 기준임을 표시한다. `instFlow` 결측은 날짜별 analysis 합산 → 날짜 있는 직전 값 순으로 잇는다. 새 AI 생성은 없다.

공유 경로 영향과 호출자:

- `mapQuoteValues/mergeMoneyMapSources/buildMoneyMap`: 제품 호출자는 `TodayMoneyMap`뿐이다. `MoneyMapCards`는 결과를 표시한다. 회귀·3언어 SSR 시험으로 확인했다.
- 새 `regularQuoteProvenance`의 호출자는 `/api/live/quotes` 1곳이다. 같은 파일의 기존 `correctBulkSnapshot` 본문은 바꾸지 않았다. 새 메타데이터 외에 가격·등락·PRE/POST·거래량·벤더 호출 수는 보존한다.
- `/api/live/quotes` 사용처를 `src`·`scripts`에서 검색했다. `useOnePipe`, `useLivePrice`, `useIntelSharedData`, `utils/liveQuote`(→ `useLiveQuotes`), `dashboardStore`, `MobileWatchlistSwipeBar`, 앱 dash·TodayMoneyMap, 웹 dashboard·dashboard/unified, cron structure-build·signum-warm·sector-headlines가 사용한다. 기존 소비자는 추가 필드를 무시한다. 스크립트 사용처는 `audit-endpoints`, `audit-screen-numbers`, `check-ext-transition`, `ec2-price-ws`, `full_stress_test_v2`, `measure-session-quality`, `redis-ab-load`, `verify-price-accuracy` 및 `integrity/{bigdoor,rules,screen,screenprobe,source-parity-worker,watch}`와 관련 시험이다. 운영 쓰기·실서버 호출 가능성이 있는 스크립트는 실행하지 않았다. 벌크 종가·허브·가격 시각의 기존 라우트 시험으로 회귀를 확인했다.
- 브랜치 이전 변경인 `calculateRotationIntensityV2`는 날짜·basis 메타데이터만 추가한다. 호출자는 같은 파일의 `SectorEngine.getSectorFlows`; 이는 `unifiedDataStream`과 기존 점검 스크립트에서 쓴다. 5일 score·cumReturn 불변 시험을 유지했다. 기존 `withConfirmedDates`는 본문 변경 없이 export만 추가했으며 기존 `getMarketEarningsCalendar`와 새 money-map GET이 사용한다.

## 돌린 시험과 결과

| 실행 | 실측 결과 |
|---|---|
| 수정 전 `node --test tests/moneyMap.test.cjs` | 기존 27 통과, 추가 6 실패: PRE 체결 시각, POST/CLOSED/주말 장중 잔존값, 반등 모순, 캘린더 결측 후 발표 완료 |
| 수정 후 `node --test tests/moneyMap.test.cjs` | 39/39 통과. PRE·REG·POST·CLOSED·주말 × ko/en/ja 렌더 15개 포함 |
| `MONEY_MAP_GUARDIAN_REPLAY=…/2026-10-15/guardian-ko.json node --test tests/moneyMap.test.cjs` | 전체 보관 원본으로 39/39 통과 |
| 기존 `quotesBulkClose.test.ts` | 9/9 통과 |
| 기존 `hubLiveOverlay.test.ts` | 23/23 통과 |
| 기존 `priceTimeBasis.test.ts` | 43/43 통과 |
| 기존 `earningsImplied.test.ts` | 12/12 통과 |
| 기존 `earningsConfirmed.test.ts` | 30/30 통과 |
| 전체 tsc (1회) | TS2554 1건: `MoneyMapCards.tsx`의 `formatEventName` 필수 3번째 인자 누락. 수정 완료 |
| 수정 후 MoneyMapCards와 전이 의존성 tsc | 오류 0, 종료 코드 0 |
| `git diff --check` | 통과 |

기존 TS 시험은 `.bin/ts-node`가 없어 시작 실패(127)했다. 기존 money-map 시험과 같은 TypeScript transpile/경로 별칭 로더를 `/tmp/money-map-test-loader.cjs`에 두고 `NODE_PATH="$PWD/node_modules" node --require /tmp/money-map-test-loader.cjs tests/<파일>.test.ts`로 실행했다. 외부 I/O는 각 시험의 기존 대역을 사용했다. 최초 임시 로더의 모듈 경로 오류도 `NODE_PATH`로 해결한 뒤 위 결과를 얻었다.

타입 검사 명령(모두 지정 공용 잠금 사용):

- 전체 1회: `/usr/bin/lockf -k /tmp/signum-heavy.lock ./node_modules/.bin/tsc --noEmit --incremental false`
- 수정 후 범위 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock ./node_modules/.bin/tsc --noEmit -p /tmp/money-map-tsconfig.json`. 저장소 tsconfig를 상속하고 MoneyMapCards를 루트 파일로 지정한다. 전체 무거운 명령은 반복하지 않았다.

재생 근거:

- 10/19 REG 시세: 운영 세션 보관 `reg-snapshots/quotes-2310.json`의 SPY·NVDA·AAPL·TSLA. 실제 시세·원천 시각을 비교한다.
- PRE 실측 발췌: 근거 보고서 §B-3의 5개 섹터, SMH +2.40% / 5일 −10.07%, NQ 대비 +1.15pp. 전체 API 응답과 구분한다.
- Guardian 전체 보관 응답: `2026-10-15/guardian-ko.json`, 실제 기준 시각 **2026-10-14T22:32:18.309Z(POST)**. 모든 16개 5일 값을 reader → 카드까지 재생했다. 재현용 fixture는 공개 섹터 결과만 그대로 보관한다. 이 과거 응답에는 거래일 메타데이터가 없어 관측일 표식을 검사하며, 현재 시세 순위를 만들지 않는다. 신규 GET은 수행하지 않았다(해당 GET이 재계산·AI·캐시 쓰기를 일으킬 수 있음).

실행 로그: `/tmp/money-map-gate-before.tap`, `/tmp/money-map-final.tap`, `/tmp/money-map-full-guardian-replay.tap`, `/tmp/money-map-{bulk,hub,time,earnings,confirmed}-regression.log`, `/tmp/money-map-tsc.log`, `/tmp/money-map-tsc-scoped.log`.

## 남은 위험

- 전체 tsc의 유일한 오류는 수정했으나, 수정본 전체 tsc 0은 아직 실측하지 않았다. 전체 명령 반복 금지에 따라 해당 파일과 의존성을 따로 검사한다. 전체 결과와 범위 검사 결과를 혼동하지 않는다.
- Guardian 재생 원본은 10/14 POST다. 10/19 REG의 전체 Guardian 응답 재생은 아니며, 10/19 REG는 실제 시세 사본으로 검증했다.
- 브라우저·실기기 확인은 금지 범위라 하지 않았다. 검증은 SSR·순수 함수·캐시/시세 경계·타입 검사다.
- 원천 거래일 없는 구형 데이터는 관측일 표식이 남고, 원천 시각 없는 구형 로컬 시세는 현재 순위에서 제외된다.
- 미추적 파일 최종 확인: **0개** (`git ls-files --others --exclude-standard`). 신규 fixture는 기존 추적 fixture 안에 통합했다. 인덱스 쓰기는 권한 제한으로 불가능했으며 커밋은 없다.
