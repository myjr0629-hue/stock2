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
- Command 결측 폴백은 데이터 갱신 시 필요한 종목에만 내부 batch GET 1회. ssr 모드는 전체 분석을 하지 않는다. 캐시 없는 가격 snapshot 조회가 발생할 수 있으므로 공급사 호출 증가 0회로 단정하지 않는다.

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
