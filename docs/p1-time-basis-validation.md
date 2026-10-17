# P1 시각·가격 정의 수리 검증 (4차)

## 결과 요약 · 해소한 관문 지적

시작 HEAD는 `06c0562ea`, 브랜치는 `fix/p1-time-basis`다. 최신 `gate-fix_p1-time-basis-10171459.md` 전문을 먼저 읽었고, 이전 `10170802`, `10171204` 관문 전문도 확인했다. 아래 결과는 실제 생산 모듈을 대역 I/O로 실행한 합성 입력 시험이다. 운영 발생 빈도를 실측한 결과가 아니다.

| 관문 문장 인용 | 원인 메커니즘 | 수정 전 실패 | 수정 후 확인 |
|---|---|---|---|
| “정규장 호가가 PRE 값으로 반환됨.” / “정규장 호가가 포함된 값을 프리마켓 가격으로 분류합니다.” | CSV 미드에 `min(askTime,bidTime)`을 붙여 09:30:01 ET 호가가 들어온 뒤의 조합을 09:29:59 PRE로 돌림 | 09:46 ET·31종목·허브 $102 조건에서 PRE $100.40 반환 | 미드가 성립한 최신 호가 원천시각 09:30:01로 판정. $100.40은 정규장 값이며 PRE 후보가 아님. 호가 양쪽 시각 순서를 뒤집어도 동일 |
| “정규장 체결에 SIP 출처가 남음.” / “실제 정규장 출처는 `cboe_one_delayed`입니다.” | SIP가 마지막 체결의 `source`를 바꾸면서 정규장 출처를 잃었고, 저장본 정규장 폴백이 그 SIP 출처를 재사용 | 실제 SIP 덧입히기→직렬화된 마지막 정상 저장본→1시간 뒤 조회 실패·EOD 미게시에서 $102 출처 `delayed_sip` | 정규장 출처를 별도 보존하고 선택된 가격의 메타데이터로 반환. $102의 `trade/cboe_one_delayed`와 15:59:59 ET 원천시각 유지 |

제품 코드 수정 전 기존 17개 통과·최신 관문 2개 실패를 확인했다. 수정 후 19/19 통과했고, 기억한 PRE 유지·SIP 반복/Edge 갱신·이전 형식 저장본/EOD 경계 시험을 보강했다. 최종 결과는 아래에 기록한다. 실패 로그 `/tmp/signum-time-basis-fourth-red.log`, 수정 직후 `/tmp/signum-time-basis-fourth-green.log`, 보강 최종 `/tmp/signum-time-basis-fourth-final.log`.

이전 관문의 “지연 체결의 세션 오판정.”, “CSV 미드를 현재 시간외 체결로 전달.”, “프리마켓 무버가 전일 종가로 돌아감.”, “저장된 정규장 체결을 EOD로 오표기.” 회귀 시험을 유지했다. 09:25 체결의 09:40 수신은 정규장 허브 덧입히기에 탈락한다. 양쪽 호가가 정규장 15:46인 CSV를 16:01에 읽어도 POST 체결로 만들지 않는다. Movers $105/+5%와 PRE-MKT, 정규장/EOD 선택별 메타데이터도 유지한다.

## 바꾼 파일

- `src/services/intrinioClient.ts`: 미드 시각을 양쪽 호가 중 최신 원천시각으로 계산한다. 수신시각은 사용하지 않고, 한쪽 시각 결측이면 기존처럼 0이다. 실제 체결 가격이 있으면 호가 시각 대신 실제 체결시각을 계속 쓴다. SIP 덧입히기에 `normal_market_hours_last_source`를 보존하며, Edge가 정규장 값을 갱신할 때 해당 출처도 갱신한다. 정규장 폴백의 basis/source는 이 출처를 읽는다.
- `tests/priceTimeBasis.test.ts`: 관문 재현 2개와 추가 경계 3개를 추가했다. 기존 “오래된 호가 시각” 시험은 새 미드 형성시각 정의에 맞춰 최신 원천시각을 기대하도록 수정했다. 결측/EOD·원천시각 보존과 이전 관문 시험은 유지했다. Redis 저장 대역은 직렬화 왕복을 거친다. 실제 PRE 기억값 $99.50·−0.50%·기준시각·PRE 라벨이 31/100종목에서 유지되는지도 확인한다.
- 이 문서.

화면 파일·라벨·문구·CSS·표시 방식은 수정하지 않았다. `resolveSessionPrices`, `extendedSessionClose.ts`, 정규장·시간외 종가 확정 시각과 조건은 수정하지 않았다. 공급사 호출 수·선점·폴링·캐시 TTL도 불변이다. 브라우저·환경파일·운영 쓰기·push·병합·배포는 실행하지 않았다.

## 공유 함수 호출자와 영향

소스 전체의 함수 참조와 snapshot 경로를 검색하고 아래 직접 호출 지점을 확인했다. 동명 DynamoDB `getTickerSnapshot`은 별개 함수다.

| 바뀐 함수/경로 | 모든 직접 생산 호출자 | 영향·시험 |
|---|---|---|
| `overlayRealtimeEdge` | `getTickerSnapshot` | 정규장 가격 갱신과 함께 출처 보존 필드 갱신. 기존 Cboe 필드가 Edge에 잘못 남지 않는 시험, `regularRealtimeOverlay` |
| `overlayExtendedSip` | `extendedSipOverlay`의 캐시 적중 분기 | 가격·체결시각 선택식은 불변. 정규장 출처만 추가 보존. 반복 덧입히기·직렬화·실패 폴백·`extendedSipOverlay`·`extendedSipClaim` |
| `loadRealtimeSnapshot` | `buildMarketTickers` | 미드 형성시각 판정. 반대 순서 호가·09:30 경계·캐시·체결시각 우선·결측·POST 경계 시험 |
| `buildMarketTickers` | `getFullMarketSnapshotIntrinio`, `getMoversIntrinio` | 벌크 미드 원천시각 전파. 가격·거래량·등락 계산식 불변. 실제 CSV 파서→벌크→31/100종목 라우트 및 Movers API 시험 |
| `getTickerSnapshot` | `intrinioRouter` 단건 분기, `buildTickersDirect`, `sessionAwareLiquidity` 폴백 | 단건 및 ≤30종목의 선택된 가격별 basis/source. 정규장 가격·종가·EOD 선택은 불변. 유동성 경로가 읽는 lastQuote/spread는 불변 |
| `buildTickersDirect` | `getFullMarketSnapshotIntrinio`의 소수 종목/벌크 누락 보완 분기 | 30종목 직접 경로 시험, 기존 회귀 |
| `getFullMarketSnapshotIntrinio` | `intrinioRouter` v2 다중/전체 및 v3 분기 | v2 라우트와 v3의 last_trade에 메타데이터 전파. v3 session 가격 계산은 불변 |
| `getMoversIntrinio` | `intrinioRouter` gainers/losers 분기 | 미드 시각만 변경. 순위·가격·거래량 계산은 불변, 기존 Movers 가격/거래량 시험 |

`sessionAwareLiquidity`의 외부 생산 호출자는 `src/services/watchlistBatchService.ts`, `src/app/api/intel/fast/route.ts`다. Router의 진입은 `massiveClient.fetchMassive`다. snapshot API 참조/라우팅의 하위 37개 파일은 다음과 같다. 파일 단위 도달성이며 모든 화면을 실제 구동했다는 의미는 아니다.

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

전체 타입 검사와 시험 실행에 `/usr/bin/lockf -k /tmp/signum-heavy.lock`을 적용했다. 대형 회귀 묶음과 전체 타입 검사는 각각 한 번 실행했다. 외부 소켓/HTTP·환경파일 읽기를 차단한 preload로 시험했으며, 회귀 묶음은 최소 환경변수로 실행했다.

| 시험 | 결과 |
|---|---|
| `priceTimeBasis` | 수정 전 기존 17통과·신규 2실패 → 수정 직후 19/19 → 보강 최종 22/22 통과 |
| `hubLiveOverlay` | 23개 통과 |
| `quotesBulkClose` | 9개 통과 |
| `regularRealtimeOverlay` | 10개 통과 |
| `extStaleSnapshot` | 21개 통과 |
| `extStaleRoute` | 6개 통과 |
| `extTransition` | 34/34 통과 |
| `preCloseCarryAcrossOpen` | 3개 통과 |
| `priceHardeningComparison` | 83개 비교 행 통과 |
| `extendedSipOverlay` | 22/22 통과 |
| `extendedSipClaim` | 4개 통과 |
| `watchlistData` | 49/49 통과 |
| `marketCalendar.session` | 37/37 통과 |
| `extWsTrust` | 12개 통과 |
| `node --check scripts/ec2-price-ws.js` | 통과 |
| `git diff --check` | 통과 |
| 전체 `tsc --noEmit --incremental false --pretty false` | 실패 1건: `src/remotion/kit/scripts.ts:5004`의 `./scripts-jpweek` 모듈 누락. 기존 HEAD에도 같은 import가 있고 파일은 없음. 변경 파일 진단 없음 |

회귀 13개 파일은 모두 exit 0이다. 결과 목록 `/tmp/signum-time-basis-fourth-results.json`, 개별 로그 `/tmp/signum-time-basis-fourth-<시험명>.log`, 타입 검사 로그 `/tmp/signum-time-basis-fourth-tsc.log`.

영어 커밋 메시지를 `/tmp/signum-p1-time-basis-4-commit.txt`에 저장했다: `Fix quote midpoint timing and preserve regular-session provenance`. 커밋은 생성하지 않았다.

## 남은 위험

- 운영 발생 빈도·실소켓·실브라우저·배포 효과는 미확인이다. 합성 입력이며 실측 CSV 원문은 없다.
- 이전 코드로 이미 저장되어 정규장 출처를 잃은 SIP 저장본은 Cboe/Edge를 복원할 근거가 없다. 이때 정규장 가격·원천시각은 유지하고 일반 출처 `intrinio_realtime`을 반환한다. 이후 성공 조회로 보존 필드가 채워진 저장본은 정확한 원래 출처를 사용한다. 캐시 TTL은 기존 12시간이다.
- 미드 시각은 두 호가 조합의 최신 원천시각이다. 양쪽 가격이 여전히 유효한 호가라는 기존 CSV 전제와 스프레드 게이트를 유지한다. 한쪽 원천시각이 없으면 계속 미확인 0이다.
- 전체 타입 검사는 기존 Remotion 모듈 누락으로 통과하지 못했다. 빌드는 실행하지 않았다.
