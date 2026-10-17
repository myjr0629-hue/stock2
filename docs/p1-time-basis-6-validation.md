# P1 시각·가격 정의 수리 검증 (6차)

## 결과 요약 · 해소한 관문 지적

시작 HEAD `5aa3717ed`, 브랜치 `fix/p1-time-basis`. 최신 `gate-fix_p1-time-basis-10171953.md`를 먼저 전부 읽고, 이전 `10170802`, `10171204`, `10171459`, `10171627` 전문도 읽었다. 아래는 실제 생산 모듈에 합성 입력과 I/O 대역을 넣은 오프라인 시험 결과이며, 운영 발생 빈도의 실측은 아니다.

최신 관문 인용: **“유효한 마감 직후 POST 체결이 SSR에서 누락됨”**, **“16:16:30 ET 조회 시 정규장 마지막 체결이 16:00:00이고 시간외 마지막 체결이 16:00:01 또는 16:00:30의 $103이면, 기존 SSR은 POST $103을 반환하지만 현재는 `null`입니다.”**

- 원인: `getTickerSnapshot`의 `lastTime > regularTime + 60_000` 조건이 유효 POST를 `hasExtendedTrade=false`로 만든다. SSR의 부정 메타데이터 검사는 이전 관문의 정규장 폴백 유출을 막는 올바른 계약이므로 생산자의 잘못된 시간외 판정을 수정했다.
- 제품 수정 전: 실제 어댑터 → 실제 `getStockDataLight`에서 16:00:01·16:00:30 두 사례가 각각 `null !== 103`으로 실패했다. 16:01:01 대조군과 기존 30개는 통과했다. 추가 경계 대조도 16:00:00.999 정규장 체결 다음 16:00:01 POST를 누락해 실패했다. 로그 `/tmp/signum-p1-time-basis-6-red.log`는 31통과·3실패다.
- 수정: 마지막 체결이 정규장 마지막 체결보다 뒤이면서, 원천시각의 달력 세션이 PRE/POST인지 판정한다. POST 마감 첫 1초는 정규장으로 취급한다. 기존 `sessionAt`·`regCloseMin`을 사용하므로 일반장 16:00과 반일장 13:00을 각각 판정한다. 수신시각을 체결시각으로 쓰지 않는다.
- 수정 후: 두 사례와 대조군의 SSR POST $103, 정규장 종가 $102, 원천시각·`trade/cboe_one_delayed`, POST 라벨을 확인했다. 같은 실제 어댑터 행을 소비하는 live/quotes GET의 30/31/100종목도 확인했다. 이 라우트 시험의 fetch는 어댑터 결과를 반환하는 대역이며 실제 공급사 라우터 연결 시험은 아니다.
- 오래된 저장본 제외(`dropStaleExt`), 정규장 가격/원천시각 보존, SSR false 메타데이터 검사, 확정 시간외 종가 우선순위를 유지했다. 기존 30개 시험은 삭제하거나 기대값을 바꾸지 않았다.

최초 실패 실행에는 오래된 합성 입력이 VM의 SIP 배경 갱신에 들어가 `crypto` 부재 오류도 남겼다. 경계 대조용 SIP 캐시에 `{none:true}`를 넣어 실제 배경 I/O 없이 판정만 확인하도록 시험을 보강했다. 최신 관문의 두 실패는 이 배경 오류와 별개로 각각 SSR 값 비교에서 확인됐다. 최종 로그 `/tmp/signum-p1-time-basis-6-green.log`: 34/34 통과, 배경 오류 없음.

| 이전 관문 문장 인용 | 유지한 회귀 확인 |
|---|---|
| “지연 체결의 세션 오판정.” | SDK 09:25 ET 체결을 09:40에 수신해도 원천시각 유지, REG 허브 덧입히기 거부 |
| “CSV 미드를 현재 시간외 체결로 전달.” | 정규장 CSV를 16:01에 읽어도 현재 POST 체결로 만들지 않음 |
| “프리마켓 무버가 전일 종가로 돌아감.” | Provider → 실제 Movers의 $105/+5%, PRE-MKT 유지 |
| “저장된 정규장 체결을 EOD로 오표기.” | 정규장 $102의 trade·원천시각 유지, 당일 EOD 게시 시에만 EOD 메타데이터 |
| “정규장 호가가 PRE 값으로 반환됨.” | 09:29:59 bid + 09:30:01 ask는 REG 미드; 기억한 PRE $99.50 유지 |
| “정규장 체결에 SIP 출처가 남음.” | SIP → 저장본 → 실패 폴백에서 $102는 Cboe 출처; Edge·반복 덧입히기·구형 저장본 대조 유지 |
| “정규장 마감 체결이 POST 가격으로 재분류됨.” | 18:00 ET·1시간 된 저장본·EOD 미게시·16:00:00.000/.999 정규장 $102는 SSR POST null, 가격·출처·원천시각 유지 |

## 바꾼 파일

- `src/services/intrinioClient.ts`: `getTickerSnapshot`의 시간외 체결 판정만 변경했다. 60초 간격 대신 원천 세션과 마감 첫 1초를 판정한다.
- `tests/priceTimeBasis.test.ts`: 최신 관문 2개·정상 대조 1개·어댑터 경계 대조 1개 추가. PRE, 정규장, EST, 반일장, 동일/역전/결측 시각도 확인한다.
- 이 검증 문서. 이전 검증 문서들은 보존했다.

화면 파일·라벨·문구·CSS·표시 방식은 변경하지 않았다. `resolveSessionPrices`, 정규장 종가 선택, `extendedSessionClose.ts`, 시간외 종가의 확정 시각·Form T 조회 창·계산식은 변경하지 않았다. 공급사 호출 경로·폴링·캐시 TTL도 불변이다.

영어 커밋 메시지는 `/tmp/signum-p1-time-basis-6-commit.txt`: `Fix extended-trade eligibility immediately after the regular close`. 커밋은 생성하지 않았다.

## 공유 함수 호출자 · 같은 필드 소비 경로

`rg`로 `getTickerSnapshot|buildTickersDirect|getFullMarketSnapshotIntrinio|sessionAwareLiquidity`, `hasExtendedTrade|preMarket|afterHours|lastTrade|last_trade`, `_intrinio` 시간외 메타데이터를 검색했다. `src` 필드 검색은 238행·78파일이며, 주석·번역 키·다른 데이터의 동명 필드도 포함한 수치다. 전수 검색 원문:

- `/tmp/signum-p1-time-basis-6-direct-callers.txt`
- `/tmp/signum-p1-time-basis-6-field-consumers.txt`
- `/tmp/signum-p1-time-basis-6-metadata-consumers.txt`
- `/tmp/signum-p1-time-basis-6-script-test-consumers.txt`

| 직접 호출/전달 경로 | 영향 · 확인 |
|---|---|
| `intrinioRouter.ts` 단건 분기 → `getTickerSnapshot` | 시간외 메타데이터와 숫자형 preMarket/afterHours가 수정됨. 실제 어댑터와 SSR 소비 시험 |
| `buildTickersDirect` → `getTickerSnapshot` | ≤30종목 및 벌크 누락 보완. 가격·시각·호가 필드는 불변. 기존 30종목 어댑터 회귀와 새 행 소비 시험 |
| `getFullMarketSnapshotIntrinio` → `buildTickersDirect` | 직접/보완 분기만 위 판정 전파. CSV 벌크 생산자는 변경 없음 |
| `intrinioRouter.ts` v2 다중/전체·v3 → `getFullMarketSnapshotIntrinio` | v3는 last_trade를 전달하며 이 필드 자체는 불변. 호출부 확인 |
| `sessionAwareLiquidity` 폴백 → `getTickerSnapshot` | lastQuote/spread/liquidity 소비. 이 필드는 불변. watchlistData 및 기존 회귀 통과 |
| watchlistBatchService·`/api/intel/fast` → `sessionAwareLiquidity` | 위 유동성 경로. 별도 공급사 호출 추가 없음 |
| `massiveClient.fetchMassive` → `routeToIntrinio` | 위 라우터 응답 전달. 래퍼의 lastTrade 추출 필드도 불변 |

`src/lib/aws/dynamoDataProvider.ts`의 동명 `getTickerSnapshot`과 이를 부르는 ticker/page·command/unified·volatility-regime은 별개 구현이다. 이번 공유 함수의 직접 호출자로 세지 않았다.

| 같은 필드의 실제 소비 경로 | 영향 · 시험 한계 |
|---|---|
| `marketDataLight.ts` → ticker SSR·marketing-v2·daily-content, SSR → LiveTickerDashboard | `hasExtendedTrade !== false` 사용. 최신 두 사례의 실제 SSR 모듈 시험. 외부 페이지 자체는 미실행 |
| `/api/live/ticker` → Flow·Command·usePriceDisplay·calcPriceDisplay | 같은 메타데이터 검사로 유효 POST를 허용. 소비부 코드 확인, extStaleRoute·extTransition·preCloseCarryAcrossOpen 통과. 최신 두 사례의 이 라우트 전체 실행은 하지 않음 |
| `_intrinio.extendedPrice/extendedChangePct` | 생산자와 시험 외 직접 읽기 없음. 새 시험에서 가격·정규장 기준 등락률 확인 |
| live/quotes·intel/fast·stockApi·watchlistBatchService·portfolioBatchService·centralDataHub·structureService·undercurrent/price | lastTrade.p/t와 시간 판정 helper 소비. 그 원천 필드는 불변. live/quotes 30/31/100과 watchlistData 등 회귀; 나머지는 호출부 추적 |
| unifiedPriceService·dashboard/unified·Intel m7/m7-fast/physicalai-fast 및 섹터 API | preMarket/afterHours의 `.p` 접근 또는 lastTrade 폴백이 있음. 어댑터의 시간외 필드는 숫자형이다. 이번에 해당 소비부를 바꾸지 않았으며 기존 폴백 문제는 잔여 위험 |
| stockTypes·macroHubProvider·breaking/detectMove·rankings/livePrice·엔진·market/movers·live/prices/related/options/atm·quant-radar·portfolio/batch·guardian/sectorEngine 등 | lastTrade 가격/시각 또는 v3 last_trade 소비. 이번에는 이 필드와 종가·거래량을 바꾸지 않음. 전수 검색 로그에 나머지 화면 전달·동명 옵션 필드·주석/번역 키 포함 |
| scripts의 Lambda 어댑터 4개 | Next.js 함수를 호출하지 않는 별도 생산자. 기존 `+60000` 조건이 남음. 변경/배포하지 않았으며 이번 수리 효과를 이 경로까지 주장하지 않음 |

## 돌린 시험과 결과

회귀 실행과 타입 검사는 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 안에서 실행했다. 13개 회귀 파일은 한 묶음에서 순차 실행했고, 전체 타입 검사는 1회 실행했다. 최소 환경과 preload로 `.env*` 읽기·실제 외부 fetch/HTTP/socket을 차단했다. 시험 내부 Redis 쓰기는 메모리 대역이다.

| 시험 | 결과 |
|---|---|
| priceTimeBasis | 수정 전 최신 두 사례 실패, 최종 34/34 통과 |
| hubLiveOverlay / quotesBulkClose / regularRealtimeOverlay | 23 / 9 / 10개 통과 |
| extStaleSnapshot / extStaleRoute | 21 / 6개 통과 |
| extTransition / preCloseCarryAcrossOpen | 34 / 3개 통과 |
| priceHardeningComparison | 83개 비교 행 통과 |
| extendedSipOverlay / extendedSipClaim | 22 / 4개 통과 |
| watchlistData / marketCalendar.session / extWsTrust | 49 / 37 / 12개 통과 |
| node --check scripts/ec2-price-ws.js / git diff --check | 통과 |
| 전체 tsc --noEmit --incremental false --pretty false | 실패 1건: `src/remotion/kit/scripts.ts:5004`의 `./scripts-jpweek` 모듈 누락. 변경 파일 진단 없음 |

회귀 13파일 모두 exit 0: `/tmp/signum-p1-time-basis-6-results.json` 및 개별 `-<시험명>.log`. priceTimeBasis 최종 로그는 `-green.log`. 타입 검사 로그는 `/tmp/signum-p1-time-basis-6-tsc.log`. 시작 HEAD에도 같은 import가 있고 해당 파일이 없음을 git show·git ls-tree로 확인했다. 전체 빌드·서버·브라우저는 실행하지 않았다.

## 남은 위험

- 운영 발생 빈도·실소켓·브라우저 미검증. 새 어댑터 경계의 통합 소비 시험은 SSR과 live/quotes이며 다른 경로는 코드 추적과 기존 회귀로 확인했다.
- 별도 Lambda 어댑터 4개에는 60초 조건이 남아 있다. 기존 Intel 등의 `.p`/lastTrade 폴백 문제와 함께 별개 경로의 잔여 위험이다.
- 기존 SSR/라우트 캐시는 다음 SWR 갱신·TTL 만료까지 예전 결과를 반환할 수 있다. 운영 캐시 삭제나 쓰기는 하지 않았다.
- 반일장은 어댑터 메타데이터 경계만 대조했다. SSR/다른 서비스의 반일장 세션 체계 전체는 검증하지 않았다.
- 전체 타입 검사는 기존 모듈 누락으로 통과하지 못했다. 관련 없는 Remotion 파일을 수정하거나 빌드를 반복하지 않았다.
- `.env*` 읽기, 계정/브라우저 접근, 운영 쓰기, push·main 병합·배포는 실행하지 않았다.
