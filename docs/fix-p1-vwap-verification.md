# P1 VWAP 4차 수리 검증

## 1. 결과 요약

시작 HEAD는 `aaf27c68a`, 브랜치는 `fix/p1-vwap`이다. 최신 관문 `gate-fix_p1-vwap-10171640.md`를 먼저 전부 읽고, 이전 `10170802`, `10171450` 관문도 전부 확인했다. 3차 결과물은 실제로 `aaf27c68a`에 커밋되어 있다. 이번 작업에서는 커밋하지 않았다.

아래 재현과 검증은 합성 입력·오프라인 실제 소스 실행·React 서버 렌더링 결과다. 운영 실측이나 브라우저 검증이 아니다.

### 해소한 관문 지적(원문 인용)

| 관문 문장 | 원인 → 수정 | 검증 결과 |
|---|---|---|
| “원천 VWAP이 null이면 차트가 캔들 종가의 단순평균을 VWAP으로 표시합니다.” / “`VWAP 100.00` 재현” | CandleChart가 원천 결측/비일봉 범위를 종가 평균 또는 현재가로 대체했다. 원천 일간 VWAP만 사용하고 다른 범위는 null로 둔다. 배지·토글·VWAP 라벨은 유지하며 결측 값은 기존 앱의 `—`로 표시한다. 결측 가격에는 선 좌표를 만들지 않는다. | 종가 `[100,110,90,100]` 입력으로 수정 전 실제 SVG `VWAP 100.00` 실패 확인. 수정 후 `VWAP —`, 평균선 없음. 실측값 109.60, 빈 캔들, 장기 범위도 시험. |
| “기존 VWAP 100에 새 응답 null을 병합해도 **100이 유지**됩니다.” / “localStorage에도 다시 저장되어” | 두 indicator 병합이 null을 건너뛰었다. 두 경로 모두 명시적 null을 덮고, undefined만 생략한다. 출처/세션 시각이 없는 localStorage VWAP은 저장·복원하지 않는다. | 실제 store 모듈을 실행하여 `fetchDashboardData`, `fetchSingleTicker` 모두 수정 전 100 잔존 확인. 수정 후 메모리/저장 직렬화 결과 null. 구형 localStorage 복원, 정상값 교체, 필드 생략도 시험. 저장소와 fetch는 메모리 대역. |
| “결측 VWAP을 옵션 기초자산 가격으로 대체하여 Conviction에 반영합니다.” / “가짜 이격률 23%, 점수 58/B” | 앱 signalsData가 `structure.underlyingPrice`를 VWAP으로 사용했다. 실제 VWAP으로만 이격률을 계산하며 결측은 점수 가감에서 제외한다. | 현재가 123·기초자산 가격 100·VWAP null에서 수정 전 58/B 실패 확인, 수정 후 50/C·거리 null. 측정 VWAP의 상승/하락/동일 점수 유지. |
| 이전: “현재가 123, 원천 VWAP null이면 `vwap=0`, `vwapDistPct=0`을 반환합니다.” / “`$0.00`, `+Infinity%` 재현” | 3차 Terminal/Intel null·거리 0 구분 수리 유지. | 기존 실제 evidence → Intel JSX 시험 유지·통과. |
| 이전: “새 응답과 SSR의 VWAP이 모두 null이면 화면이 0으로 대체합니다.” / “`vwapNear` 설명 선택 재현” | 3차 Dashboard/SSR의 결측 표시 및 신선한 null 우선 처리 유지. | 기존 Dashboard·SSR JSX·선택식 20개 시험 통과. 새 store null을 받는 기존 Dashboard/모바일 소비 JSX도 결측 표식 확인. |
| 이전: “전형가격을 `vw`로 반환합니다.” | snapshot/daily/grouped의 null·typicalPrice 분리 유지. | 기존 Intrinio 34개 시험 유지·통과. `100×1 → 110×97 → 90×1 → 100×1`의 실제 VWAP 109.60과 전형가격 100 구분 유지. |

### 전수 검색으로 추가 수리한 소비 경로

- 앱 Flow: `현재가×0.995` 대체 제거. 원천 null이 raw/표시값의 과거 양수로 대체되지 않도록 선택한다. VWAP 칸·라벨·기존 `—`는 유지한다.
- 모바일 Command: parent가 `/api/live/ticker`의 null을 SSR보다 우선하여 metrics·AI·chart·options에 전달한다. Metrics의 VWAP 가격·Conviction에서 기초자산 대체를 제거한다. Overview AI의 가짜 `0%`는 결측 `N/A` 값으로 보낸다.
- 앱/예열 공용 AI snapshot: 기초자산 가격과 고정 `0%` 대신 원천 VWAP·실제 거리, 결측이면 null/`N/A`를 보낸다.
- live/ticker의 응답·Alpha 입력, dashboard/unified, watchlist light, Top3, Quant Radar: 신선한 명시적 null이 prevDay·후보·분석 캐시의 양수를 되살리지 않는다. 필드가 없는 undefined일 때만 이전 소스를 허용한다.
- dashboard/unified의 재조회 null이 오래된 prevDay 100에 가려지는 경계도 추가로 수정 전 실패시켰다. 재조회 결과가 이전 거래일보다 우선한다.
- Quant 자동 응답: 현재가를 VWAP으로 복사하지 않는다. 실제 VWAP이 없으면 VWAP 기반 smart limit 가격/전략도 null이다. 새 라벨·전략 문구는 만들지 않았다.

화면 JSX 텍스트·정적 label/title/term·번역 키를 시작 HEAD와 비교하는 시험이 통과했다. 라벨/번역 파일은 변경하지 않았다. 정규장·시간외 종가의 선택·확정 로직은 변경하지 않았다. 공급사 요청 경로·횟수·TTL도 변경하지 않았다.

## 2. 바꾼 파일

| 파일 | 변경 |
|---|---|
| `src/app/[locale]/app-view/cmd/page.tsx` | chart/Conviction/응답 매핑과 상태 타입에 null 유지, 기존 vital 결측 표시 유지 |
| `src/app/[locale]/app-view/flow/page.tsx` | 가짜 VWAP 제거, 기존 칸의 `—` 적용 |
| `src/stores/dashboardStore.ts` | 두 병합 경로와 localStorage 저장·복원에서 결측 보존 |
| `src/lib/vwap.ts` | `selectVwap` 추가. 기존 normalize/거리 함수의 동작은 그대로 |
| `src/lib/ai/deepSnapshot.ts` | 앱/예열 공용 재료의 VWAP·거리 정정 |
| `src/components/intel/mobile/MobileCommandPage.tsx` | fresh null을 모든 탭에 전달 |
| `src/components/intel/mobile/MobileCmdMetrics.tsx` | 실제 VWAP만 가격/점수에 사용 |
| `src/components/intel/mobile/MobileCmdOverview.tsx` | AI 재료의 결측 보존 |
| `src/app/api/live/ticker/route.ts` | 응답·Alpha의 VWAP 선택식만 수정 |
| `src/app/api/dashboard/unified/route.ts` | snapshot/재조회 null을 과거 캐시보다 우선 |
| `src/app/api/quant-radar/route.ts` | 응답 VWAP·VWAP 기반 smart limit의 결측 보존 |
| `src/services/watchlistBatchService.ts`, `src/services/top3Enrichment.ts` | 과거 소스 대체가 명시적 null을 지우지 않도록 수정 |
| `tests/vwapConsumers.test.ts` | 관문 3건·두 store 경로·저장 복원·추가 소비자·최종 JSX·라벨 비교 22개 |
| `tests/intrinioVwap.test.ts`, `tests/dashCloseRoll.test.ts` | 새 helper 의존성만 대역에 연결. 기존 검증 유지 |
| `tests/tsconfig.intrinio-vwap.json` | 변경 production 파일·신규 시험까지 범위 확대 |
| `docs/fix-p1-vwap-verification.md` | 이 보고서 |

### 같은 필드와 공유 함수 호출자 확인

`rg -n -i vwap src --glob '*.{ts,tsx}'`(백업 파일 제외), `rg -n '\.vw\b|\bvw:' src --glob '*.{ts,tsx}'`와 공유 함수/Store 호출 검색을 수행했다. 최초 vwap 검색은 85개 파일·599개 행이었다. 추가된 parent 전달 파일까지 확인했다. 원시 검색 결과는 `/tmp/signum-p1-vwap-4-{grep,vw-grep,callers-final}.txt`다.

| 경로 | null 영향과 확인 |
|---|---|
| Intrinio snapshot/daily/grouped → stockApi/marketDataLight/portfolioBatch/watchlistBatch/unifiedPrice/tickerOverview | 원천 null 보존. 기존 17개 파일의 실제 매핑 표현식 시험과 실제 SSR light → 카드 실행 유지 |
| live/ticker → 앱 Command/Flow, 웹 LiveTickerDashboard, DecisionGate | 앱의 대체값 제거. 웹 기존 카드/Conviction/AI/차트 6개 선택식은 기존 시험 유지. DecisionGate는 양수일 때만 신호 추가(정적 확인) |
| dashboard/unified → dashboardStore → DashboardClient, MobileDashboardPage, MobileDashboardClient/Shell/MetricsTab | 두 indicator 병합 시험·실제 Dashboard/모바일 JSX의 `—`·종가 JSON 재생 통과. 나머지 Store 호출자인 watchlist/portfolio/MobileHoldingCard/MobileCommandPage는 종목 선택·즐겨찾기만 사용(정적 확인) |
| terminalEnricher → Intel price evidence → powerEngine | Terminal/Intel 기존 시험 유지. powerEngine의 null 거리에는 양수 가산 없음, Alpha/TradePlan에 null 전달(정적 확인) |
| watchlist realtime.vwap/vwapDist → WatchlistGrid, WatchlistClientPage, MobileWatchlistTabs, useWatchlist | null 가격은 기존 `-`, null 거리는 기존 선택적 표시 조건 유지(정적 확인). Top3는 missingData VWAP 분기 사용 |
| StockChart, TechnicalLevelsMap, MobileCmdChart/Options | parent의 null을 차트 계약에 맞춰 undefined로 전달. 양수일 때만 선/레벨 생성. 차트 DOM은 미실행 |
| buildDeepSnapshot | 직접 호출자는 앱 Command와 deepWarmService 두 곳. 신규 source 실행 + 기존 deepWarm의 실제 buildWarmMaterial 시험 통과. computeGexStats 동작 변경 없음 |
| MobileCmdMetrics/Overview | 직접 JSX 호출자는 MobileCommandPage 한 곳. props 전달과 실제 계산식·카드 실행 시험. 라벨 문자열 그대로 |
| selectVwap | live/ticker 2곳, dashboard/unified 2곳, watchlist light 1곳, Top3 1곳, Quant 2곳, Flow 1곳, mobile parent 1곳, deepSnapshot 1곳. 각 source 표현식/최종 결과 시험 |
| normalizeVwap / vwapDistancePct | 기존 Terminal/Intel/SSR/Dashboard 호출자 모두 유지. 신규 앱 차트/매핑/Conviction·Store·모바일·AI·Flow·Quant 호출은 경계 시험/범위 타입 검사에 포함 |
| Quant calculateSmartLimit | 직접 호출자 자동 포트폴리오 매핑 한 곳. 실제 callback을 실행해 정상 VWAP 전략 유지와 null 결과 확인. 화면 소비자는 realtime 가격만 읽고 smartLimit 필드를 직접 표시하지 않음(검색 확인) |
| WIM today/lab → WIM page | null 봉 VWAP을 numeric filter에서 제외하며 시계열이 완전하지 않으면 vwap=null. 기존 필터 시험 유지 |
| daily-history → Dashboard/MobileDashboard history, live/prev-day | bar.vw null 직렬화, 기존 `—` 표시/prevVwap 전달 유지(기존 매핑 시험·정적 확인) |
| alphaEngine, tpgEngine, interpretationSSOT, whyEngine, i18n | 기존 결측 분기(`VWAP 없음(추정)`, NO_DATA 등)·조건부 신호 유지. 이들 문구/산식 수정 없음 |
| 나머지 검색 결과 | 타입·설명/도움말·정적 Remotion 자료·관리 backtest 주석은 null 실행 소비가 아님. 옵션의 day.vwap(EOD mark), 다크풀 buy/sell VWAP, per-interval VWAP은 별도 공급사 필드. centralDataHub의 dayVwap 지역변수는 외부 반환/사용 없음 |

## 3. 돌린 시험과 결과

| 시험 | 결과 |
|---|---|
| 수정 전 최신 관문/경계 8개 | 2 통과 / 6 실패. 차트·두 병합·Conviction 등 실제 소스에서 재현 |
| 수정 전 추가 소비자 5개 | 5 실패. 모바일 metrics/AI·공용 snapshot·Flow 재현 |
| 수정 전 재조회 null 우선순위 | 실제 source 선택식 100 반환으로 실패 |
| 최종 vwapConsumers | 22 통과 / 0 실패 |
| intrinioVwap | 34 통과 / 0 실패(기존 시험 유지) |
| vwapDisplay | 20 통과 / 0 실패(기존 시험 유지) |
| regularRealtimeOverlay | 10 통과 |
| extStaleSnapshot | 21 통과 |
| extendedSipOverlay | 22 통과 |
| extStaleRoute | 6 통과 |
| quotesBulkClose | 9 통과 |
| afterCloseSession | 35 통과 |
| extCloseStarvation | 25 통과 |
| preCloseCarryAcrossOpen | 3 통과 |
| deepWarm | 12 통과 |
| impliedMove | 20 통과 |
| dashCloseRoll | 원본 JSON → 실제 Store → desktop/mobile 표현식·세션 경계 재생 통과 |

개수 집계가 있는 시험은 **239개 통과 / 0 실패**, 별도로 dashCloseRoll 재생 통과다. 시험 하네스 최초 준비 때 fetchSingleTicker 인자를 빠뜨린 실행은 수정 전 실패 집계에서 제외했다.

전체 `tsc --noEmit --incremental false`는 한 번 실행하여 2개 진단을 확인했다. 이번 앱 상태 타입의 null 누락은 수정했다. 다른 진단은 시작 HEAD에도 없는 `src/remotion/kit/scripts-jpweek.ts`를 기존 scripts.ts가 import하는 문제다(`git cat-file`, `git show`로 확인). 전체 명령은 반복하지 않았다.

변경 production 파일·기존 UI/공유 타입·신규/기존 시험을 포함하도록 확장한 **범위 타입 검사 `tsc --noEmit -p tests/tsconfig.intrinio-vwap.json`는 exit 0**이다. 최종 `git diff --check`도 통과했다. 모든 타입 검사와 시험 묶음은 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬화했다.

로그는 `/tmp/signum-p1-vwap-4-*.log`에 있다. 최신 소비자 로그는 `consumers-reviewed.log`, Intrinio 최종 로그는 `intrinio-final.log`, 타입 로그는 `types.log`/`types-focused.log`다. 영어 커밋 메시지는 `/tmp/signum-p1-vwap-4-commit.txt`에 작성했다. 커밋·push·병합·배포·운영 데이터 쓰기는 하지 않았다.

## 4. 남은 위험

- 브라우저·실기기·외부 API·운영 실측은 수행하지 않았다. 실제 공급사 VWAP 수급 여부도 확인하지 않았다.
- 전체 타입 검사 성공은 주장하지 않는다. 기존 Remotion 모듈 부재가 남아 있으며 Next build는 실행하지 않았다. 변경 범위 타입 검사와 오프라인 시험은 통과했다.
- 양의 유한 숫자만으로 과거 서버 응답/분석/AI 캐시의 근사값 출처를 식별할 수 없다. 신선한 null이 오면 우선하고 localStorage 복원은 차단했지만, 서버 캐시가 신선한 원천 없이 단독 응답하면 만료 전까지 과거 값이 남을 수 있다. 운영 캐시는 삭제하지 않았다.
- Intrinio interval의 average/시간외 봉 vw, 옵션 EOD mark, 별도 Lambda 산출값은 이번 snapshot/daily null 계약과 다른 원천이다. 원천 정의의 정확성은 이번 소비 경로 시험으로 검증하지 않았다.
