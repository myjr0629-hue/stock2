# P1 시각·가격 정의 수리 검증 (2차)

## 결과 요약

확인: 최신 관문 `gate-fix_p1-time-basis-10170802.md` 전문과 데이터 감사 보고서 ⑧ 1·2번, 백엔드·생산자 부록을 읽었다. 첫 회귀시험 8개가 수정 전 모두 실패했고, 수정 후 모두 통과했다. 경계·방송·확정 종가 시험을 추가한 최종 시험은 12/12 통과다. 운영 발생 빈도나 배포 효과를 실측했다고 주장하지 않는다.

입력 근거: `measure/out/20261016T133627.576464Z-local.json` 등 6개 로컬 실측은 허브의 `now/live/ticks` 구조를 제공하지만 유효 체결값은 없다. EC2 결과도 해당 가격 summary가 비어 있다. SDK 체결값·CSV 행·시각 경계는 생산 어댑터/파서가 사용하는 형식의 합성 입력이다. 실측 폴더에 CSV 원문은 없어 이를 실측 CSV 재생으로 부르지 않는다.

| 재현 | 수정 전 확인한 결과 | 수정 후 |
|---|---|---|
| 09:25 ET 이벤트를 09:40 수신 | `/last.trade`가 09:40으로 바뀌어 정규장 overlay 채택 | 09:25와 수신 09:40 분리, 기존 개장 게이트로 거부 |
| 15:46 ET CSV 미드를 16:01 조회 | 현재시각이 붙어 POST 가격으로 전달 | 미드 가격 유지, 15:46 보존, POST로 오분류하지 않음 |
| Provider 재전송 | 같은 메시지의 `ts`가 매 수신시각으로 바뀜 | 원천 `ts` 고정, 브라우저 수신시각 별도 |
| CSV/Edge/EOD 가격 | 모두 `lastTrade.p`만으로 가격 종류 소실 | `quote_mid` / `fair_value` / `eod_close`와 원천 보존 |

원인 위치는 수정 전 `scripts/ec2-price-ws.js:217,324`, `src/services/intrinioClient.ts:2065,2161`, `src/providers/WebSocketProvider.tsx:275,426`이다. SDK 연결부에도 결측 시각을 현재로 대체하는 분기가 있어 같이 제거했다.

## 바꾼 파일

- `scripts/ec2-price-ws.js`: 원천 epoch 단위/명시적 timezone만 정규화. 지연은 유지, 시각 결측은 0. `/last`, 방송, 구독 캐시 재전송, REST 폴백에 시각·수신시각·가격 정의·원천 전달. 미래 이벤트는 원문 보존하되 소비 overlay에서 거부.
- `src/services/intrinioClient.ts`: CSV 체결/양쪽 호가 시각 파싱. 미드는 두 호가 중 오래된 시각, 한쪽 시각 결측이면 미확인 0. 캐시 재조회가 이벤트 시각을 갱신하지 않는다. EOD는 날짜 보존·이벤트 시각 0. 단건 Edge/기본 체결/EOD 폴백의 가격 정의도 보존. 가격·등락·거래량 선택식과 종가 resolver는 유지.
- `src/lib/hubLiveOverlay.ts`: 허브 가격의 실제 `priceTime`/basis/source 보존. 기존 `lastTrade.t` 계약을 유지하면서 원래 PRE 후보 가격·시각 쌍을 `_preCloseSnapshot`에 남김. CSV PRE 시각과 정규장 허브 가격이 섞여 PRE 종가로 기억되는 것을 막음.
- `src/app/api/live/quotes/route.ts`: 기존 PRE 선택기에 원래 가격·시각 쌍 전달. 가격/시간외 basis·source 메타데이터 추가. 회상한 PRE 값처럼 원천 정의를 알 수 없으면 null.
- `src/providers/WebSocketProvider.tsx`: 가격 WS와 Guardian의 가격 분기 모두 source `ts` 유지, 브라우저 `receivedAt`와 허브 `sourceReceivedAt` 별도. 미확인 시각은 0.
- `tests/priceTimeBasis.test.ts`: 소켓 없이 실제 모듈 전체를 VM에서 실행하는 12개 시험. 함수 본문을 복제하지 않고 SDK 콜백, CSV 파서/캐시/병합, 라우트, 실제 React 메시지 핸들러를 실행. 외부 I/O와 React 스케줄러만 대역.
- `tests/hubLast.test.js`: 기존 잘못된 기대값(지연→rx)을 원천시각 보존으로 수정. 가짜 허브의 환경파일 읽기는 preload에서 차단.
- 이 보고서.

화면 JSX·라벨·문구·CSS·배치 변경 없음. 지연/결측 값을 화면에서 숨기는 로직을 추가하지 않았다. 원천시각을 확인한 POST 호가와 확정 PRE/POST 값은 계속 전달되는 것을 시험했다. `extendedSessionClose.ts`, `resolveSessionPrices`, `correctBulkSnapshot` 및 종가 확정 시각·Form T 기준은 수정하지 않았다. 공급사 호출/폴링/캐시 TTL은 늘리지 않았다.

## 공유 호출자와 영향

직접 호출자는 전수 검색했다. 동명 Dynamo `getTickerSnapshot`은 이번 Intrinio 함수와 다른 함수라 제외했다.

| 변경 함수/경로 | 모든 직접 생산 호출자 | 영향·시험 |
|---|---|---|
| `normalizeTradeMs` | `handleTradeUpdate`, `fetchSnapshotREST`의 last/regular 시각 | SDK s/ms/us/ns, timezone·결측, REST 폴백 시험 |
| `handleTradeUpdate` | `connectIntrinioWs` SDK onTrade, 구형 `connectToPolygon` 메시지 분기 | 활성 원천은 Intrinio 유지. 가짜 SDK에서 실제 콜백 실행 |
| `throttledBroadcast` | `handleAggregateUpdate`, `handleTradeUpdate` | throttle/숫자 불변. 활성 SDK 방송 시험; 구형 Polygon 집계 활성화 안 함 |
| `broadcastPrice` | `throttledBroadcast`, `fetchSnapshotREST`; 별도 구독 캐시 송신 분기도 확인 | 방송·재전송·REST→Provider 시험 |
| `snapshotTimeMs` | `loadRealtimeSnapshot` | ISO offset, epoch 네 단위, 결측·timezone 미확인 시험 |
| `loadRealtimeSnapshot` | `buildMarketTickers` | 실제 CSV 로드·파싱·5분 메모리 캐시 실행 |
| `buildMarketTickers` | `getFullMarketSnapshotIntrinio`, `getMoversIntrinio` | 벌크와 movers 가격·거래량·basis 시험 |
| `getTickerSnapshot` | `intrinioRouter` 단건 분기, `sessionAwareLiquidity`, `buildTickersDirect` | 30종목 direct·Edge/기본/EOD 시험; 기존 regular/last-good/시간외 회귀 통과. 유동성 계산식/호가는 불변 |
| `getFullMarketSnapshotIntrinio` | `intrinioRouter` v2 다중/전체 및 v3 snapshot 분기 | v3 `last_trade`는 원본 객체를 전달하여 metadata 유지. 30/31/100/101 경계 시험 |
| `getMoversIntrinio` | `intrinioRouter` gainers/losers 분기 | 정렬·가격·volume 필터 불변, metadata 추가 |
| `overlayBulkRow` | `applyHubLast` (다른 생산 호출 없음) | 원본 PRE 가격·시각, EOD·거래량 불변 시험 |
| `applyHubLast` | `overlayBulkWithHub` | 원천시각/미래시각 게이트 및 basis 시험 |
| `overlayBulkWithHub` | `api/live/quotes` 정규장 31~100 분기 | 기존 허브 회귀와 라우트 경계 시험 |
| Provider 가격 map | `useRealtimeData`의 아래 23개 소비 파일 | 숫자 필드/구독/10Hz flush 불변. `useLiveQuotes`는 원천 시각을 그대로 표시 결과에 전달. 앱 movers의 기존 2분 freshness 검사는 지연/시각 미확인 WS에 REST 폴백을 적용하게 됨. 나머지 주가 소비자는 가격·등락을 사용. 옵션/quote 이벤트는 이번 변경 대상 아님 |

23개 소비 파일은 전부 읽고 가격 map 접근과 시각 사용을 확인했다. 모든 화면을 구동한 시험이라는 뜻은 아니다.

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

하위 snapshot endpoint 참조도 전수 검색했다. 아래 37개 파일은 호출 또는 라우팅 참조 목록이다. 옵션 체인 전용 endpoint와 주석은 제외했다. 파일 단위 도달성을 런타임 호출 보장으로 해석하지 않는다. `massiveClient.getFullMarketSnapshot`는 `lastTrade` 객체를 보존하므로 중첩 basis/source를 잃지 않는다. 기존 엔진의 가격·거래량 계산 필드는 그대로다.

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

모든 대형 묶음과 타입 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 안에서 순차 실행했다. 전체 tsc는 한 번만 실행했다. 제품 서버·브라우저·공급사/Redis/DB 호출·배포는 실행하지 않았다.

회귀 실행 형식:

```sh
node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only \
  -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' \
  tests/priceTimeBasis.test.ts
```

| 시험 파일 | 결과 |
|---|---|
| `priceTimeBasis` | 수정 전 8실패 → 수정 후 8통과 → 보강 최종 12/12통과 |
| `hubLiveOverlay` | 23개 통과 |
| `quotesBulkClose` | 9개 통과 |
| `regularRealtimeOverlay` | 10개 통과 |
| `extStaleSnapshot` | 21개 통과 |
| `extStaleRoute` | 6개 통과 |
| `extTransition` | 34/34통과 |
| `preCloseCarryAcrossOpen` | 3개 통과 |
| `priceHardeningComparison` | 고정 origin 사본과 비교하는 전체 시험 프로세스 exit 0 |
| `extendedSipOverlay` | 22/22통과 |
| `watchlistData` | 49/49통과 |
| `marketCalendar.session` | 37/37통과 |
| `hubLast` | 실행 환경의 포트 바인딩 `EPERM`으로 기동 실패. 통과로 계산하지 않음 |
| `node --check` (허브·hubLast 시험 JS) | 통과 |
| `git diff --check` | 통과 |
| 전체 `tsc --noEmit --incremental false --pretty false` | 실패 1건: `src/remotion/kit/scripts.ts:5004`가 `./scripts-jpweek`를 찾지 못함. HEAD에도 같은 import가 있고 대상 파일은 HEAD에 없음. 변경 파일 진단은 없음 |

최종 메타데이터/PRE 후보 보강 뒤 영향 있는 `priceTimeBasis`, `hubLiveOverlay`, `quotesBulkClose`, `extTransition`, `preCloseCarryAcrossOpen`만 재실행해 통과했다. 전체 묶음·전체 tsc는 반복하지 않았다.

추가 제한 타입 검사 시도는 Next의 global fetch 선언을 포함하지 못해 기존 `stockApi.ts:43,1476`의 `RequestInit.next` 진단 2개로 실패했다. 이를 제품 코드 오류 또는 통과 증거로 사용하지 않는다. 전체 tsc의 별개 누락 모듈 문제는 남아 있다.

## 커밋 상태

지정 브랜치 `fix/p1-time-basis`에서 8개 파일의 `git add`를 시도했으나 Git 공통 디렉터리의 `worktrees/fix-p1-time-basis/index.lock` 생성이 `Operation not permitted`로 거부됐다. 커밋은 생성되지 않았다. 변경은 작업공간에 보존했다. 예정 영어 메시지: `fix: preserve Intrinio price timestamps and basis`.

## 남은 위험

- 운영 실측·배포 검증은 하지 않았다. 실제 source 시각 결측률, CSV 파일별 timestamp 포맷/지연, 발생 빈도는 미확인이다.
- CSV 원문이 없으므로 시험 행은 합성이다. timezone 없는 문자열을 ET/UTC로 추정하지 않고 0으로 보존한다. 가격은 유지하며 시간외 선택은 기존 원천시각 게이트를 따른다.
- `lastTrade`는 기존 가격 호환 자리로 남고 basis/source로 구별한다. 허브 overlay의 실제 가격시각은 `priceTime`; PRE 후보는 원래 쌍이다. 소비처가 이 metadata를 버리면 정의 구별도 잃는다.
- 구버전 허브가 `ts` 없는 가격을 보내면 새 Provider는 시각 미확인 0으로 둔다. 앱 movers의 기존 freshness 게이트는 REST를 사용한다. 운영 세션이 허브/웹 반영 순서를 관리해야 한다.
- 실소켓 `hubLast` 재실행은 포트 허용 환경에서 필요하다. 같은 실제 허브 코드의 오프라인 SDK→방송→캐시→Provider/REST 경로는 통과했다.
- 전체 타입 검사는 기존 Remotion 모듈 누락으로 green이 아니다. 무관 파일은 고치지 않았다.
