# NB2 옵션 EOD 유니버스·직전 정상 스큐 (2026-10-20)

## 확인한 원인과 확인하지 못한 부분

- 판정표 `SWEEP-LIVE.md` 전부와 `verify-regular-session-before-merge.md`를 읽었다. 대상은 L12/L13/L14/L37/L39.
- 원천은 `scripts/intrinio-options-eod.js`의 `universe()`다. `intrinio:eod:snapshot.rows`의 `[ticker,o,h,l,c,v,chg,chgPct]`에서 종가×거래량 상위 400 + 지수 ETF + 고정 140종목을 선택한다. 이 작업 시작 코드에 이미 TSLA·WTFC·FITB 고정 포함이 있었다. 저장된 10/16 운영 묶음에서는 TSLA·WTFC가 없었다. 당시 배포된 수집기 버전/순위 원본은 없으므로 상류 누락의 정확한 계기는 확정하지 못했다.
- API는 `tickers`/`stale`에 값이 없으면 실제 수집 목록을 확인하지 않고 `ticker-not-in-universe`라고 했다. Flow는 `available:false`를 null로 버리고 섹션도 렌더하지 않았다.
- 수집기 저녁 경로만 직전 묶음의 일부 지각 종목을 보존했고, 벌크 교체/반복 결측/순위 이탈 때 보존되지 않았다.
- IV 선택 함수는 새 날짜면 부분 체인도 직전 정상 체인보다 우선했다. API의 30일 정상본과 클라이언트 정상본이 있어도 이 경로에서는 온전한 직전 곡선을 쓰지 않았다.
- 저장된 SPY 장중 ATM은 날짜가 있는 17개 행사가 정상 체인이다. 이 코드에서 재생 시 값이 표시된다. 당시 화면 공백의 별도 원인은 저장 응답만으로 재현되지 않았다.
- FITB 저장 응답은 계약별 `oiChange:null`이다. 직전 전체 종목 날짜가 있다는 사실만으로 계약별 OI를 복구할 수 없다. 0으로 만들지 않고 기준선 미수집 사유를 추가했다.
- Command의 IV 표시는 IV30만 읽어 구조/변동성에 실제 ATM IV가 있어도 비었다.

## 변경과 공유 호출자 영향

- 수집기: 순위 입력의 심볼 정규화·중복 제거, 고정 종목 보장 순수 함수 추출. 두 적재 경로 모두 실제 `collectionUniverse`를 기록. 누락 종목은 원래 date/prevDate/값 그대로 `stale`에 보존하며 재수집되면 제거한다. 현재 날짜 집계에 과거 종목을 합치지 않는다.
- `/api/flow/options-eod`: 새 묶음 목록으로 미적재/대상 밖 구분. 옛 묶음에서 목록을 모르면 미확인으로 답한다. 캐시에 남은 예전 ticker-not-in-universe 응답도 수집 목록 근거가 없으면 대상 밖이라고 단정하지 않는다. `all=1` 현재 판 유지, 과거는 `openingStale`만 사용. 모든 계약의 OI 기준선이 없으면 순증감은 null.
- `all=1` 소비처 검색: `src/app/api/undercurrent/shared.ts`, `src/components/app/watchlist/useWatchlistData.ts`; `premium-metrics`는 HTTP 재호출을 제거한 기존 경로. 앱 Flow 외 데스크톱 페이지는 이 API를 직접 소비하지 않는다. `opening` 의미/날짜는 유지한다. 두 소비처 모두 openingStale의 개별 date/prevDate를 이미 읽는다.
- 묶음 직접 소비처도 확인했다: `institutionalFlow.ts`(premium-metrics의 실제 계산 경로), `todayPicksService.ts`와 이를 읽는 `signalAlertsService.ts`는 기존 tickers 판을 사용하므로 과거 stale을 현재 합계에 섞지 않는다. `/api/app/oi-pcr`는 원래부터 stale의 개별 날짜를 사용하고 완료 세션/직전 한 세션 신선도 제한을 적용한다. `redisClient.ts`는 같은 키 복제 정책만 사용한다. 이들 코드와 계산식은 변경하지 않았다.
- 앱 Flow: 실패 응답 보존, 기존 신규 포지션/이상 옵션 제목과 결측 사실 표시. 정상 데이터의 배너 문턱은 유지한다. 고래 집계 미관측은 숫자 0/실시간 집계 대신 사실을 표시한다. 기존 카드/칸을 숨기지 않는다.
- `selectIVSnapshot`의 새 선택 인수 `preferComplete`는 기본 false로 기존 원천 행 선택을 유지한다. 전 호출자는 ATM API, 모바일 `IVSkewCurve`, 데스크톱 `IVSkewCurveWeb`이다. API와 모바일은 true를 전달하여 부분 새 판보다 직전 정상판 전체를 복원한다. 데스크톱 컴포넌트 파일은 보존하고 기존 기본 선택을 유지하며, API의 복원 응답을 소비하는 회귀시험을 유지한다. 날짜·만기·종목·IV를 섞거나 없는 반대쪽/곡선을 생성하지 않는다. 정상본이 아예 없으면 날짜 있는 실제 부분 행만 남긴다(e622522df 원칙).
- Command IV 수준: IV30 → 구조 ATM IV(decimal→percent) → 기존 volatility.iv(percent) → 경량 batch `mode=ssr`의 실제 IV(percent). batch는 앞의 값이 모두 없을 때만 요청하고 ticker 일치/유한한 양수만 사용한다. 이 폴백은 IV 랭크나 스큐 곡선/점수의 IV30으로 전달하지 않는다. 신규 공유 `commandIvLevel`의 제품 호출자는 Command 하나다. 신규 `OptionsEodNotice`는 앱 Flow의 두 섹션에서 사용한다.

- 전체 타입검사에서 기존 `macroLastGood.ts:34` 오류 1건(`cur?.label`의 never 추론)을 확인했다. `hasValue`의 타입 조건을 `MacroMetric & { value: number }`로 바로잡았다. 실행 코드는 동일하다. 호출자는 같은 파일의 `fillFromLastGood`와 `/api/market/economy`의 보관값 읽기/쓰기 판정이다. 기존 macroLastGood 회귀시험 3건으로 값·날짜·실제 0 보존을 확인했다.

## 호출량 추정 (운영 실측 아님)

- 이 변경은 기존 고정 140개를 더 늘리지 않는다. 빈 순위에서도 ETF 포함 141개, 순위 400과 전혀 겹치지 않는 이론 상한은 541개다. 실제 겹침을 잴 운영 순위 사본은 없다.
- 고정 포함 패치가 없던 수집기 대비: 순위 밖 고정 종목 수를 n이라 하면 벌크 다운로드 증가 0회(동일 ZIP의 행 보존), 저녁은 시도당 n~10n회(종목당 page_size=10,000, 최대 10페이지), 일 최대 6회 시도면 6n~60n회 추가. TSLA·WTFC 두 종목만 새로 들어온다고 가정하면 통상 시도당 +2회, 상한 +20회, 일 상한 +120회다. 이번 정규화로 중복이 빠지면 순위의 새 고유 종목이 들어올 수 있다.
- `collectionUniverse` 기록과 `stale` 보존 자체는 공급사 호출 0회 증가. 벌크의 기존 묶음 Redis GET 위치만 앞당겼으며 조회 횟수 증가는 없다.
- Command 결측 폴백은 데이터 갱신 시 필요한 종목에만 내부 batch GET 1회. ssr도 fast-track에 들어가기 전에 sparkline/ivSkew 자동 복구가 실행될 수 있다. 가격 snapshot뿐 아니라 `getOptionsData`의 체인 조회·기존 캐시 보정 쓰기가 발생할 수 있으며, 이 경로의 공급사 호출 상한은 미실측이다. 공급사 호출 증가 0회나 가격 조회만 증가한다고 단정하지 않는다.

## 재생 자료와 한계

`tests/fixtures/nb2-market-replay.json`은 23:10 KST 저장 ticker/options-eod/ivp/quotes의 관련 시세 필드, closed2의 CLOSED 시세, live의 ATM, watchlist의 WTFC 21/FITB 24만 담았다. 헤더·다른 API·계정 자료는 포함하지 않았다.

- REG: 5종목 원본 session REG/regular, 옵션 원천 날짜 10/16, TSLA·WTFC 결측 섹션의 사유/제목, SPY 실제 17개 행사가/원래 종가 기준/날짜, 서버 장애 시 정상본 보존을 재생한다.
- CLOSED: 실제 CLOSED 시세와 같은 10/16 SPY 체인을 재생하고, API의 `at=`로 REG와 CLOSED 만기 판정을 모두 시험한다.
- TSLA 장중 장애 응답은 실제 사본이다. 저장된 closed2 ATM에는 행별 관측일이 없어 정상본으로 채택하지 않는다. 날짜가 있는 TSLA 정상본 복원은 합성 장애 fixture로 별도 시험했다. 저장 사본만으로 TSLA 과거 실제 스큐의 숫자까지 검증했다고 주장하지 않는다.
- 운영 접근·브라우저·배포·커밋은 하지 않는다. 운영 collector 재적재 및 실제 캐시에 정상본이 있는지 확인은 운영 세션에 남는다. 정상본이 한 번도 없거나 캐시가 완전히 소실되면 실제 값 자체를 만들 수 없다.

## 시험 결과

최종 실행 결과는 작업 종료 보고와 아래 기록 참조. 최초 수집기 HTTP 통합시험은 sandbox의 `listen EPERM`으로 실행 불가였다. 같은 원래 fixture handler와 모든 기존 단언을 쓰는 `--offline` 경로를 추가했다(메모리 수송만 교체, 네트워크/운영 쓰기 없음). 테스트 설정 파일명은 `.env`가 아닌 `collector-test-config`를 사용한다.


최종 결과(운영 접근 없이 로컬):

| 명령/검증 | 결과 |
|---|---|
| `node tests/optionsEodCollector.test.js` | 16/16 |
| `node tests/optionsEodCollector.flow.test.js --offline` | 기존 12/12 |
| `node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/optionsEodRoute.test.ts` | 9/9, REG + CLOSED 포함 |
| `node --test tests/ivSkew.test.cjs` | 39/39, 실제 SPY 재생·TSLA 장애·e622522df 회귀 포함 |
| `ts-node`로 `tests/watchlistData.test.ts` | 기존 49/49, openingStale 날짜·결측 계약 포함 |
| `ts-node`로 `tests/macroLastGood.test.ts` | 기존 3/3 |
| 전체 `tsc --noEmit` | 기존 타입 오류 1건 확인 후 타입 조건 보정, 수정본 0건(exit 0) |
| `git diff --check` | 통과 |

합계 128개 통과. 무거운 실행은 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬화했다. 최초 실패는 HTTP 포트 차단, 대체 어댑터의 URLSearchParams 누락, 빈 stale 키가 `{}`로 생기는 기존 계약 차이였고 각각 보정 후 해당 실패 시험을 통과했다. 별도 전체 build는 실행하지 않았다.

변경 파일: 수집기 1개, API 2개, 앱 페이지 2개, 모바일 IV 컴포넌트 1개, 결측 안내 컴포넌트 1개, IV/매크로 헬퍼 3개, 시험 4개, 재생 fixture 1개, 이 보고서 1개(총 16개). 데스크톱 페이지/컴포넌트의 최종 diff는 없다. 커밋·push·병합·배포·운영 쓰기 없음.

## 1차 관문 보류 후 추가 수정

- 보류 원문 `gate-fix_nb2-options-universe-10200106.md` 전부를 읽었다. 실제 Command effect를 추출해 WTFC `21 → null`을 REG/CLOSED에서 재생했다. 수정 전 상태에는 `iv:21`만 있고 `sourceDate`가 없어 새 회귀시험이 실패했다.
- Command의 폴백 상태를 `{ticker, iv, sourceDate, dateKind, restored}`로 바꿨다. 결측·HTTP 오류·날짜 없는 후속 응답에는 해당 종목의 직전 값과 원래 날짜를 함께 보존한다. 정상 응답은 값과 날짜를 함께 교체한다. 종목 전환은 이전 종목 값을 가져오지 않는다.
- IV 카드와 IV로 파생한 변동성 프리미엄 줄 모두 원천 날짜를 붙인다. 복원값에는 `직전 관측`을 붙이며 한국어·영어·일본어를 시험했다. 기존 제목/점수/곡선에는 변경이 없다. 날짜 표시 추가는 이번 사용자 지시에 따른 변경이다.
- 구조 ATM/volatility 폴백도 자체 IV 날짜가 있을 때만 사용한다. 날짜 없는 최초 응답은 숫자에 조회일을 붙여 만들지 않는다. 날짜가 있는 직전 값도 없으면 IV는 결측으로 남는다. 기존 숫자만 담은 legacy 캐시는 이 제한을 받는다.
- batch의 GEX 보충 경로는 `atmIv`와 같은 GEX 행의 `chainDate`/`timestamp`를 전달한다. `chainDate`가 있으면 원천 세션 날짜, 없으면 GEX 이력의 관측 날짜(ET)로 표시한다. 후자는 마감 체인 날짜를 증명하지 않으므로 `관측`이라고 명시한다. flow 행의 날짜·시세 시각·응답 시각·analysis 캐시 저장 시각으로 IV를 재날짜화하지 않는다. 분석 캐시의 명시적 `ivSourceDate`/`ivObservedAt`은 전달하되 없는 날짜는 만들지 않는다.
- 새 헬퍼의 제품 호출자는 앱 Command 하나다. `commandIvLevel`의 기존 숫자/단위 계약은 그대로다. `watchlistBatchService` 직접 호출자는 watchlist batch API, 웹 watchlist SSR, `watchlistAiLineService`다. HTTP 소비처는 앱 Command/Intel/내 종목, `useWatchlist`, `useIntelSharedData`, `WatchlistGrid`, Intel 10개 섹터 API·snapshot, M7/PhysicalAI 패널, signum-warm이다. 추가 날짜 필드는 이들 기존 숫자 선택을 바꾸지 않는다. GEX/flow 혼합 행에서는 IV가 GEX 자체에서 온 것만 날짜와 짝지으며, 실제 GEX ATM IV가 없으면 flow 행의 IV를 가져오지 않는다.
- 23:10 저장 원본 5종목(NVDA/AAPL/TSLA/SPY/WTFC)의 ticker 관련 시세 필드·options-eod·ivp·quotes를 fixture와 직접 대조해 모두 일치함을 확인했다. 원본 파일 변경·운영 요청은 없었다.
- 유니버스 추가 확대는 이번 보정에서 없다. 위 수집기 호출량 추정은 그대로다. 날짜 메타 전달 자체의 공급사 추가 호출은 0회다. 날짜 없는 unified IV도 batch 조회 대상으로 바뀌므로 내부 GET은 그 종목의 데이터 갱신당 최대 1회이며, 위 자동 복구에 따른 추가 공급사 호출량은 운영 실측이 필요하다.

추가 수정본의 최종 검증:

| 검증 | 결과 |
|---|---|
| `node --test tests/commandIv.test.cjs` | 5/5. 수정 전 실제 effect에서 날짜 누락 실패를 확인한 뒤 수리. 실제 effect·signalsData 계산·IV 카드·프리미엄 JSX 실행, REG/CLOSED 및 ko/en/ja 포함 |
| 기존 수집기 단위/오프라인 통합·IV 스큐·EOD API·watchlist·macroLastGood | 16 + 12 + 39 + 9 + 49 + 3 = 128/128 재실행 통과 |
| `/usr/bin/lockf -k /tmp/signum-heavy.lock npx tsc --noEmit` | 1회 실행, exit 0, 오류 0건 |
| 추가 공유 생산자 회귀 `node tests/integrityStructUnify.test.js` (공용 잠금 사용) | 83 통과 / 1 실패. watchlist의 price/price-dp/ssr/full 경로와 관련 생산자 단언은 통과. 실패는 수정하지 않은 fast-all의 OI 시각 즉시 갱신 기대 |
| 실패 1건 분리 대조 | HEAD fast-all 소스·기존 mock으로 재현. watchlistBatchService를 로드하지 않음. 고정 시계에서 첫 응답의 OI 시각이 캐시되고, 원천 mock을 바꿔도 60초 동안 유지됨. 시계만 60,001ms 진행하면 새 원천 시각으로 갱신됨. 기존 옵션 메트릭 TTL과 시험의 고정 시계 전제가 충돌하며 이번 보정과 무관함을 확인. 해당 파일/시험은 변경하지 않음 |
| 원본 대조 / `git diff --check` | 장중 원본 5종목 일치 / 통과 |

NB2 관련 시험 133개 통과. 추가 공유 시험의 기존 실패 1건을 포함해 전체를 무실패라고 주장하지 않는다. 기존 무거운 시험 묶음·tsc·공유 생산자 묶음은 공용 잠금으로 순서대로 각각 1회 실행했고, 같은 무거운 명령을 반복하지 않았다. 전체 build·브라우저·운영 API·운영 쓰기는 실행하지 않았다. 이번 보류 수리의 변경은 Command, commandIv 헬퍼, watchlistBatchService, IV 스큐 시험의 mock import, 신규 Command 회귀시험, 이 문서의 6개 파일이며 추가 커밋은 하지 않았다.

## 2차 관문 보류 후 수정 (3차 제출용)

- 보류 원문 `gate-fix_nb2-options-universe-10200138.md` 전부를 읽었다. 수정 전에 실제 Command effect에서 WTFC의 21%를 FITB로 저장하는 실패와, unified API의 IV 복사문 실행 후 10/16 IV에 10/19 구조 날짜를 붙이는 실패를 각각 확인했다(기존 5건 통과, 새 2건 실패). 앞선 «종목 전환은 이전 종목 값을 가져오지 않는다»는 검증은 ticker 변경 뒤 남아 있는 이전 `data` 조건을 다루지 못했다.
- Command 보존 상태를 종목별 사전으로 분리했다. effect는 `data.ticker === ticker`인 자료만 저장한다. 렌더에서도 이전 종목 unified IV는 사용하지 않고 해당 종목의 보존값만 선택한다. WTFC → FITB → WTFC 왕복 시 각 종목의 값/날짜가 독립적으로 남는다. 요청 중 종목을 바꾸면 기존 AbortController로 늦은 응답을 버린다. 섹션/카드/칸을 숨기는 조건이나 화면 문구는 추가하지 않았다.
- `commandUnifiedIv`는 `structure.chainDate`를 IV 날짜로 쓰지 않는다. unified API는 `volatility.iv` 숫자만 구조 ATM IV로 복사하고, 출구 `applyLevelsToUnified`는 구조 날짜를 레벨 판본 날짜로 덮기 때문이다. 구조/변동성 각각의 `ivSourceDate` 또는 `ivObservedAt`만 인정한다. payload와 하위 원천에 명시된 ticker도 검증한다. 구조 날짜밖에 없는 IV는 batch 또는 같은 종목의 날짜 있는 보존값으로 넘어간다. 날짜 없는 최초 값에 날짜를 만들어 붙이지 않는다.
- 공유 헬퍼 제품 호출자는 `src/app/[locale]/app-view/cmd/page.tsx` 하나이며 effect와 signalsData에서 사용한다(`rg`로 전 호출자 확인). 스큐 선택/곡선·IV30·랭크·수집기·EOD API·watchlist 생산자는 이번 보정에서 수정하지 않았다. 숫자 단위와 기존 날짜 표시 형식도 유지한다.
- 23:10 KST 원본 NVDA/AAPL/TSLA/SPY/WTFC의 ticker 관련 시세·chainDate·options-eod 전체·ivp 전체·quotes 관련 시세를 fixture와 재대조했다. 5종목 모두 일치했다. 원본/운영 데이터는 변경하지 않았다.
- 공급사 호출량: 유니버스 추가 확대는 없고 앞의 수집기 추정은 유지한다. 종목별 메모리 보존 자체의 추가 호출은 0회다. 기존에 chainDate만으로 날짜 있다고 간주하던 IV가 이제 batch 대상이 되므로, 그런 종목은 데이터 갱신당 내부 batch GET 최대 1회가 추가될 수 있다. `mode=ssr`의 체인 자동 복구를 포함한 공급사 호출 증가 상한은 미실측이다.
- 운영 TSLA/WTFC 누락 당시 수집기 버전과 실제 정상본 캐시 존재는 여전히 미확인이다. 브라우저·운영 API·커밋·push·병합·배포·운영 쓰기 없이 로컬 검증만 수행한다.

3차 제출 수정본의 최종 검증:

| 검증 | 결과 |
|---|---|
| Command 실제 effect/렌더 계산/JSX | 9/9. REG + CLOSED에서 종목 전환 직후 이전 data, 왕복 전환, 결측 후 날짜 보존, 늦은 응답 차단, 실제 unified IV 복사문 + 레벨 날짜 덮기, 한·영·일 날짜 표시 포함 |
| 기존 IV 스큐 / 수집기 단위 / 오프라인 수집 흐름 / EOD API / watchlist / macroLastGood | 39 + 16 + 12 + 9 + 49 + 3 = 128/128. e622522df 회귀와 장중 사본 + 직전 CLOSED 조건 유지 |
| `/usr/bin/lockf -k /tmp/signum-heavy.lock npx tsc --noEmit` | 1회 실행, exit 0, 오류 0건 |
| 원본 저장 사본 직접 대조 | NVDA/AAPL/TSLA/SPY/WTFC 모두 일치 |
| `git diff --check` | 통과 |

합계 137/137 통과. 전체 타입검사와 회귀시험 묶음은 공용 잠금으로 직렬 실행했고 같은 무거운 명령은 반복하지 않았다. 이번 수정 파일은 앱 Command, commandIv 헬퍼, Command 회귀시험, 이 검증 기록의 4개다. 전체 build·브라우저 화면 검증·운영 검증은 실행하지 않았으며, 이전 절의 공유 생산자 시험 실패 1건은 이번 실행 대상이 아니다.
