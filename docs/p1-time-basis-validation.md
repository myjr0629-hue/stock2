# P1 시각·가격 정의 수리 검증 (3차)

## 결과 요약 · 해소한 관문 지적

`gate-fix_p1-time-basis-10171204.md` 전문을 먼저 읽었고, 이전 관문 `gate-fix_p1-time-basis-10170802.md` 전문도 확인했다. 현재 HEAD 위에서 두 결함을 재현했다. 입력은 합성값이며 운영 빈도·배포 효과를 실측한 결과가 아니다.

| 관문 문장 인용 | 원인 | 수정 전 실패 시험 | 수정 후 확인 |
|---|---|---|---|
| “프리마켓 무버가 전일 종가로 돌아감.” / “2분 freshness 검사와 충돌합니다.” | Provider가 기존 수신시각 `ts` 자리에 원천시각을 넣어 movers의 기존 신선도 검사에 탈락 | 실제 Provider → 실제 movers 컴포넌트 실행: 08:15 ET 값의 08:30 수신이 $100·+1%로 표시 | $105·+5%, PRE-MKT 유지. `ts`는 수신시각, 원천시각은 `priceTime` |
| “저장된 정규장 체결을 EOD로 오표기.” | `fallbackFromRt`가 `dropStaleExt`까지 요구하여 resolver가 선택한 정규장 체결도 EOD로 분류 | 실시간 실패·1시간 된 저장본·당일 EOD 미게시: $102가 `eod_close/intrinio_eod`, 시각 0 | $102의 `trade/cboe_one_delayed`, 정규장 원천시각 유지. 옛 시간외 $103은 폐기 |

제품 코드 수정 전에 기존 12개 시험 통과·신규 2개 실패를 확인했다. 두 건 수정 후 14/14, 경계와 소비자 시험 보강 후 17/17 통과했다. 로그: `/tmp/signum-time-basis-third-{red,green,final}.log`.

이전 관문의 “지연 체결의 세션 오판정.”과 “CSV 미드를 현재 시간외 체결로 전달.”도 기존 시험으로 유지했다. 09:25 ET 체결을 09:40 수신해도 정규장 overlay에 들어가지 않고, 15:46 CSV 미드가 16:01 POST 체결로 바뀌지 않는다. 원천시각 결측은 0, CSV 미드/Edge/EOD 정의·출처·시각, 원래 PRE 후보 쌍, 확정 PRE/POST 우선순위도 유지한다.

## 바꾼 파일

- `src/providers/WebSocketProvider.tsx`: 가격 WS와 Guardian 가격 분기 모두 `ts = Date.now()` 복구. 기존 신선도와 수신시각 소비 계약을 유지하고 `priceTime`에 원천 메시지 `ts`를 보존한다. `receivedAt`, `sourceReceivedAt`, basis/source는 유지한다. 옵션·호가·알림의 `ts`는 수정하지 않았다.
- `src/services/intrinioClient.ts`: `fallbackFromRt`에서 시간외 폐기 조건만 분리했다. 실제 정규장 체결을 선택한 resolver 분기만 체결 메타데이터를 유지한다. 게시된 EOD를 선택하면 가격이 정규장 체결과 같아도 계속 EOD/시각 0이다. 가격 선택식은 불변이다.
- `tests/priceTimeBasis.test.ts`: 기존 12개 회귀를 유지하고 관문 2건·수신 신선도 경계·공용 목록 훅·EOD/정규장 메타데이터 시험 5개 추가. 전체 생산 모듈을 VM에서 실행하며 I/O와 React 스케줄링만 대역으로 둔다. 화면 계산식을 복사하지 않는다.
- `tests/extStaleSnapshot.test.ts`: 옛 시간외 체결 폐기 후 시각 0을 기대하던 부분을 선택된 정규장 체결의 실제 시각·basis/source 보존 검증으로 바꿨다. 옛 시간외 값 폐기, 가격·등락, `hasExtendedTrade=false`, `afterHours` 없음 검증은 유지한다.
- 이 문서.

화면 파일·라벨·문구·CSS·표시 방식은 수정하지 않았다. 칸을 숨기거나 freshness 검사를 제거하지 않았다. `resolveSessionPrices`, `extendedSessionClose.ts`, 종가 확정 시각·조건, 공급사 호출·폴링·캐시 TTL도 수정하지 않았다. 환경파일·브라우저·운영 저장소에 접근하지 않았다.

## 공유 함수 호출자와 시각 소비자

| 변경 경로 | 모든 직접 호출자/소비 경로 | 영향·시험 |
|---|---|---|
| Provider 가격 map 생성 | `connectPriceWs`의 `prices`, `connectGuardianWs`의 `prices` 분기 → `useRealtimeData`의 아래 23개 소비 파일 | 양쪽 메시지 경로의 수신시각/원천시각, 재전송, 결측/미래 원천시각 시험 |
| 가격 `ts` 신선도 소비 | 앱 `movers/page.tsx`의 `wsFresh` | 실제 행 표시 $105/+5% 복구. 수신 후 119,999ms 통과·120,000ms REST 폴백, 라벨 유지 |
| 가격 `ts` 전달 소비 | `useLiveQuotes.ts` → `liveQuote.liveDisplay` → `LiveDisplay.at` | 실제 훅을 실행하여 PRE/REG 가격·등락·`at` 수신시각 유지 확인. 원천시각은 Provider의 `priceTime`에 보존 |
| 그 외 Provider 소비 | 아래 파일의 가격·등락·거래량 또는 별도 옵션/호가 스트림 | 가격 객체의 `ts`를 추가로 읽는 생산 소비자는 없음. 관련 기존 `watchlistData`, `extWsTrust` 시험 통과. 모든 화면을 구동한 것은 아님 |
| `getTickerSnapshot` | `intrinioRouter` 단건 분기, `sessionAwareLiquidity` 내부 폴백, `buildTickersDirect` | 단건·30종목 경계·오래된 저장본·Edge·실제 EOD 시험. 유동성 소비는 lastQuote/spread만 사용하며 해당 값은 불변 |

소스 전체에서 Provider import·`useRealtimeData` 및 가격 map/getter 접근·시각 접근을 재검색했다. Provider를 설치하는 `src/app/[locale]/layout.tsx`도 확인했다. 아래 23개 소비 파일 중 가격 `ts`를 읽는 경로는 위의 movers와 useLiveQuotes 두 곳이다. `FlowRadar`의 `t.ts` 등은 별도 옵션 이벤트라 이번 변경 대상이 아니다.

- `src/app/[locale]/app-view/cmd/page.tsx`
- `src/app/[locale]/app-view/dash/page.tsx`
- `src/app/[locale]/app-view/flow/page.tsx`
- `src/app/[locale]/app-view/movers/page.tsx`
- `src/app/[locale]/dashboard/DashboardClient.tsx`
- `src/app/[locale]/dashboard/MobileDashboardPage.tsx`
- `src/app/[locale]/intel-guardian/GuardianDesktop.tsx`
- `src/app/[locale]/quant-radar/MobileQuantRadar.tsx`
- `src/app/[locale]/quant-radar/QuantRadarClient.tsx`
- `src/components/FlowRadar.tsx`
- `src/components/IVSkewCurve.tsx`
- `src/components/IVSkewCurveWeb.tsx`
- `src/components/LiveTickerDashboard.tsx`
- `src/components/guardian/mobile/MobileGuardianFlow.tsx`
- `src/components/intel/mobile/MobileCmdChart.tsx`
- `src/components/intel/mobile/MobileCmdOptions.tsx`
- `src/components/intel/mobile/MobileCmdOverview.tsx`
- `src/components/intel/mobile/MobileCommandPage.tsx`
- `src/components/mobile/MobileDashboardClient.tsx`
- `src/hooks/useIntelSharedData.ts`
- `src/hooks/useLivePrice.ts`
- `src/hooks/useLiveQuotes.ts`
- `src/hooks/useOnePipe.ts`

`getTickerSnapshot` 하위 snapshot API의 호출/라우팅 참조는 다음 37개 파일이다. 동명 Dynamo 함수는 다른 함수이므로 제외한다. 기존 하위 가격 계산식·API 라우팅은 수정하지 않았다. 파일 단위 도달성을 런타임 호출 보장으로 해석하지 않는다.

- `src/app/api/command/unified/route.ts`
- `src/app/api/dashboard/unified/route.ts`
- `src/app/api/intel/biopulse/route.ts`
- `src/app/api/intel/cloudfortress/route.ts`
- `src/app/api/intel/cybershield/route.ts`
- `src/app/api/intel/fast/route.ts`
- `src/app/api/intel/fintechpulse/route.ts`
- `src/app/api/intel/m7-fast/route.ts`
- `src/app/api/intel/m7/route.ts`
- `src/app/api/intel/orbitdefense/route.ts`
- `src/app/api/intel/physicalai-fast/route.ts`
- `src/app/api/intel/powermatrix/route.ts`
- `src/app/api/intel/quantumedge/route.ts`
- `src/app/api/intel/siliconcore/route.ts`
- `src/app/api/live/options/atm/route.ts`
- `src/app/api/live/prices/route.ts`
- `src/app/api/live/quotes/route.ts`
- `src/app/api/live/related/route.ts`
- `src/app/api/live/ticker/route.ts`
- `src/app/api/market/movers/route.ts`
- `src/app/api/portfolio/batch/route.ts`
- `src/app/api/quant-radar/route.ts`
- `src/app/api/ranking/route.ts`
- `src/app/api/undercurrent/price/route.ts`
- `src/services/breaking/detectMove.ts`
- `src/services/centralDataHub.ts`
- `src/services/guardian/breadthEngine.ts`
- `src/services/guardian/rlsiEngine.ts`
- `src/services/guardian/sectorEngine.ts`
- `src/services/intrinioRouter.ts`
- `src/services/macroHubProvider.ts`
- `src/services/marketDataLight.ts`
- `src/services/massiveClient.ts`
- `src/services/portfolioBatchService.ts`
- `src/services/stockApi.ts`
- `src/services/structureService.ts`
- `src/services/watchlistBatchService.ts`

## 돌린 시험과 결과

대형 묶음과 전체 타입 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 순차 실행했다. 전체 타입 검사는 한 번만 실행했다. 기존 회귀 묶음은 환경파일 읽기와 실제 네트워크 I/O를 차단한 preload, 제한된 환경변수로 실행했다.

| 시험 | 결과 |
|---|---|
| `priceTimeBasis` | 수정 전 기존 12통과·신규 2실패 → 수정 후 14통과 → 보강 최종 17/17통과 |
| `hubLiveOverlay` | 23개 통과 |
| `quotesBulkClose` | 9개 통과 |
| `regularRealtimeOverlay` | 10개 통과 |
| `extStaleSnapshot` | 21개 통과 |
| `extStaleRoute` | 6개 통과 |
| `extTransition` | 34/34통과 |
| `preCloseCarryAcrossOpen` | 3개 통과 |
| `priceHardeningComparison` | 고정 origin 사본과 비교, 83개 비교 행 통과 |
| `extendedSipOverlay` | 22/22통과 |
| `watchlistData` | 49/49통과 |
| `marketCalendar.session` | 37/37통과 |
| `extWsTrust` | 12개 통과 |
| `node --check scripts/ec2-price-ws.js` | 통과 |
| `git diff --check` | 통과 |
| 전체 `tsc --noEmit --incremental false --pretty false` | 실패 1건: `src/remotion/kit/scripts.ts:5004`의 `./scripts-jpweek` 누락. HEAD에도 같은 import가 있고 대상 파일은 없음. 변경 파일 진단 없음 |

기존 회귀 12개 파일은 모두 exit 0이다. 결과 목록 `/tmp/signum-time-basis-third-results.json`, 개별 로그 `/tmp/signum-time-basis-third-<시험명>.log`, 타입 검사 로그 `/tmp/signum-time-basis-third-tsc.log`에 남겼다. 전체 tsc와 대형 회귀 묶음은 반복하지 않았다.

실행 형식:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node_modules/.bin/ts-node   -r tsconfig-paths/register --transpile-only   -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}'   tests/priceTimeBasis.test.ts
/usr/bin/lockf -k /tmp/signum-heavy.lock python3 /tmp/signum-time-basis-third-regressions.py
/usr/bin/lockf -k /tmp/signum-heavy.lock node_modules/.bin/tsc --noEmit --incremental false --pretty false
```

## 커밋 상태

지정 브랜치 `fix/p1-time-basis`에서 위 5개 파일만 `git add`하려 했으나 공통 Git 디렉터리의 `worktrees/fix-p1-time-basis/index.lock` 생성이 `Operation not permitted`로 거부됐다. 커밋은 생성되지 않았고 변경은 작업공간에 남아 있다. 영어 메시지: `Fix receipt freshness and preserve regular trade metadata`.

## 남은 위험

- 운영 빈도·실소켓·실브라우저·배포 효과는 미확인이다. 사용자 제한에 따라 브라우저·운영 쓰기·push·병합·배포는 하지 않았다. 기존 `hubLast` 실소켓 시험은 이번에 재실행하지 않았다.
- 합성 입력으로 검사했으며 CSV 실측 원문은 없다. 원천시각 결측은 계속 0이다. `ts`는 수신 신선도용, `priceTime`은 원천시각용으로 구분해야 한다. 재전송은 수신시각만 갱신하고 원천시각을 바꾸지 않는다.
- 전체 타입 검사는 기존 Remotion 모듈 누락으로 통과하지 못했다. 관련 없는 파일은 수정하지 않았다.
