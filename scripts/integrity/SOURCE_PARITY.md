# SOURCE_PARITY 구현 범위와 운영 전 확인

`watch.js`의 REG 회차 시작 시 `source-parity.monitor`를 실행한다. EC2 SSM
명령 안에서 앱 `/api/live/quotes`(30+11), 허브 `/last`(41종목), Intrinio
`securities/{symbol}/prices/realtime?source=equities_edge`(종목별)를 모두
병렬 시작한다. 세 경로의 수집 구간이 2초를 넘거나 REG를 벗어나면 대조
불가 경고로 남긴다. 조회 재시도·리다이렉트·FMP 대체는 없다.

## 관문 10170753 보완: 회차 대상 일관성

확인한 원인은 기존 watch의 `INTEGRITY_BASE`·`INTEGRITY_HUB`와 달리
worker가 운영 앱·허브 주소를 고정 사용한 것이다. 이제 회차 시작에
`source-parity-target.js`로 `{ base, hub, source, feed }`를 정규화하고,
동일 대상을 기존 앱 API 전체·웹소켓·TLS 확인·SSM worker·20초 재확인에
전달한다. `runOnce({ base, hub })`와 CLI `--base=URL --hub=URL`은 환경
변수보다 우선한다. 대상 설정은 모듈 로드 시점이 아닌 회차 시작에 읽는다.

기본값은 운영 앱 `https://www.signumhq.com`과 운영 허브
`wss://ws.signumhq.com`이다. 미리보기는 두 설정을 함께 지정해야 한다.
앱 운영 호스트(`www.signumhq.com`·`signumhq.com`)와 비운영 허브,
또는 비운영 앱과 운영 허브(`ws.signumhq.com`) 조합은 조회 전에 막는다.
유효하지 않은 주소·사용자 정보·쿼리·프래그먼트가 붙은 설정도 막으며,
원본 설정값은 경고에 싣지 않는다. 혼합 회차는 외부 조회 없이 종목별
`SOURCE_PARITY_ENVIRONMENT` 경고만 저장한다(정상 0·오류 0).

허브 REST 주소는 지정한 WS 주소의 프로토콜·호스트·포트를 유지해
`wss → https`, `ws → http`로 바꾼 `/last`다. WS 경로(`/stream` 등)는
WS 조회에 유지하고 `/last`는 해당 서버 루트에서 읽는다. TLS 확인도
설정된 WSS 포트를 쓰며, 평문 WS에는 TLS 확인을 하지 않는다. 앱 요청은
다른 서버로 리다이렉트되지 않도록 `redirect: 'error'`를 사용한다.

독립 원천은 운영·미리보기 모두 동일한 Intrinio `equities_edge` 피드다.
앱 환경에 따라 허브 캐시나 다른 원천으로 대체하지 않는다. 원천 서버와
피드도 대상 증거에 포함하며, 허용된 Intrinio 서버·피드 이외의 설정은
거부한다. EC2 실행 환경의 키 조회 방식은 기존과 같고 키를 대상 증거에
포함하지 않는다. 별도 미리보기 공급사 계정이나 다른 원천은 지원하지 않는다.

worker가 반환하는 대상과 회차의 대상이 앱·허브·원천·피드 모두 같아야
가격/시각 판정에 진입한다. 증거 누락·불일치는 가격 데이터를 폐기하고
`SOURCE_PARITY_ENVIRONMENT` 경고로 남긴다. 재확인에서 바뀌어도 가격 오류를
확정하지 않는다. 이 경고는 기존 경고 반복 승격에서 제외된다. latest와
회차 증거에 안전한 대상 정보를 추가하며 version=1과 기존 line은 유지한다.
대상이 바뀌거나 기존 state에 대상 정보가 없으면 누적 경고·참조 캐시를
초기화한다. 대상과 무관한 실행 칸 `lastSlot`은 보존해 같은 15분 칸에서
tick이 회차를 다시 실행하지 않게 한다. 이전 환경의 오류 목록으로 새 오류
알림을 억제하지 않는다.

검증 한계: URL과 수집 코드의 대상 일관성을 확인한다. 두 사용자 지정
서버가 실제로 같은 배포 환경에 속하는지는 서버의 환경 식별 응답이 없어
독립 검증하지 못한다. 미리보기 URL/포트가 EC2에서 접근 가능한지도 미검증이다.

허브 `/last`는 웹소켓 마지막 체결 캐시이므로 독립 원천으로 쓸 수 없다.
원천과 앱/허브의 절대 편차가 0.10%를 초과하면 20초 뒤 해당 종목의
세 경로를 다시 읽는다. 동일 종목·문·규칙이 남아야 `SOURCE_PARITY`
error로 확정한다. 재확인 가격과 제공된 체결 시각을 latest.json errorList
및 회차 증거에 보존한다. 기존 version=1, line 형식, 기존 규칙은 유지한다.
화면 라벨·문구·표시와 src/는 변경하지 않는다.

## 회차 원천 호출 상한: 82회

직접 원천 REST 호출은 **최초 최대 41회 + 재확인 최대 41회 = 회차 최대
82회**다. 재확인은 이상 후보 종목만 중복 제거하여 한 번씩 수행한다.
41종목 모두 앱·허브에 편차가 있어도 원천은 종목당 두 번, 합계 82회이며
앱·허브 두 문에 대한 편차 82건을 확정할 수 있다. STALE_APP 후보도
같은 종목의 재확인 원천 응답을 공유한다.

`calls`는 발송 전 차감하는 보수적인 예약 상한이다. 실패·타임아웃과
키·SSM 실패로 발송하지 못한 예약도 환불하지 않는다. 장 마감으로
재확인을 발송하지 않은 경우에는 최초 조회분만 센다. 42종목 이상은
원천을 호출하지 않고 대상 종목별 `SOURCE_UNAVAILABLE` 경고로 남긴다.
기존 앱 API 내부 벤더 호출 수는 감시기가 통제하지 못하므로 82회 상한에
포함된다고 주장하지 않는다.

재확인 비활성·수집 실패·2초 창 이탈은 `UNCONFIRMED_*` 경고로 남긴다.
재확인에서 사라진 편차는 `TRANSIENT_*` 경고다. 재확인에서 처음 발생한
편차는 두 번 확인된 오류로 취급하지 않는다. 원천 관련 경고에는 기존
'경고 두 번이면 오류' 승격을 적용하지 않는다.

## 원천 조회 실패 집계

키 부재·SSM 실패·전체 수집 실패는 `sym: null` 한 건으로 합치지 않고
대상 종목마다 `SOURCE_UNAVAILABLE` warn을 만든다. 일부 원천 가격·시각
누락이나 앱·허브 가격 부재도 해당 종목·문에 같은 코드로 남긴다.
다른 규칙이 정상이어도 41종목 수집 실패 회차는 **정상 0 / 오류 0 · 경고
41**로 집계한다. 반복 실패도 경고를 유지하며 가격 오류로 승격하지 않는다.
latest.json의 기존 warnList 최대 40개 제한은 유지한다. 전체 41건은
warns 집계와 runs 회차 원본 findings에 남는다.

## STALE_APP: 전달된 원천 last_time으로 검증 가능한 범위만

확인: `src/app/api/live/quotes/route.ts`의 `lastUpdate`는 `Date.now()`로
만드는 응답 생성 시각이다. 현재 응답에는 앱 가격의 원천 `last_time`이
없다. 응답 생성 시각·수신 시각·허브 trade·가격의 반복을 앱 체결 시각으로
대신 쓰지 않는다. 원천 last_time 자체가 오래됐다는 이유만으로도 앱
지연을 단정하지 않는다.

수집기는 앱이 가격과 함께 전달한 `last_time`(ISO 시각)만 선택적으로
받는다. 현행 응답에서는 null이며, 종목별 `SOURCE_PARITY_APP_TIME` warn으로
STALE_APP 검증 불가를 드러낸다. 가격 대조와 재확인은 계속 동작한다.
별도의 합성 시험에서만 앱 last_time을 제공해 판정 가능한 분기를 검증한다.
앱이 해당 필드를 실제로 제공한다고 가정하거나 검증 완료로 보고하지 않는다.

앱에 원천 last_time이 제공될 때만 최신 EquitiesEdge `last_time`과 비교한다.
차이가 60초를 초과하고 20초 뒤 같은 규칙이 남으면 `STALE_APP` error다.
60초는 오류가 아니다. 재확인에서 앱 last_time이 빠지면 미확인 경고로
남긴다. 앱 시각 부재는 가격 편차가 해소됐는지를 판정하는 데에는 영향을
주지 않는다. 앱 체결시각 노출은 이번 src/ 변경 금지 범위 밖이다.

## 키·운영 실측 한계

기존 `ec2-ssm.js`는 ENV_FILE=/dev/null로 로컬 dotenv 읽기를 억제한 뒤
호출한다. AWS 자격증명은 이미 주입된 실행 환경만 사용한다. EC2에서는
실행 환경 또는 기존 허브 PM2 실행 환경에서만 Intrinio 키를 메모리로
찾는다. `.env*`를 읽지 않는다. 키·원본 오류·SSM stderr는 로컬 결과에
전달하지 않는다. 키를 포함하는 원천 요청 URL은 EC2 메모리에서만 구성한다.
원격 파일 업로드·배포·프로세스 재시작은 하지 않는다.

검증은 합성 응답으로만 수행한다. EC2 키 주입 여부, SSM 권한·실행 Node,
실제 41종목 2초 내 응답률은 미검증이다. 운영 조회·브라우저·운영 데이터
쓰기·커밋·배포·push는 이 보완 작업에서 실행하지 않는다.

## 공유 함수 영향과 시험

기존 judgeAll / rules / clock은 바꾸지 않았다. dedupe는 summarize에서만
호출하며 원천 발견에 문·시각별 분리를 적용해 앱·허브 증거를 보존한다.
summarize는 runOnce만 호출한다. runOnce 호출자는 watch.js의 tick / run
CLI 및 tests/priceIntegrityRules.test.ts, tests/integrityParity.test.js와 신규
source-parity.test.js다. 결과 소비자는 scripts/hud/sources.js의 loadIntegrity다.
SOURCE_UNAVAILABLE에 종목을 부여해 기존 집계가 경고로 처리하게 했으며
관제 줄 형식·기존 필드는 유지한다. 경고 승격 루프에서 이 코드를 제외했다.

monitor 호출자는 watch.runOnce와 신규 시험, judge는 monitor와 신규 시험,
sanitize는 collectRemote와 신규 시험, collectRemote는 monitor의 기본
수집기와 신규 시험이다. worker.run은 collectRemote가 SSM에 전달하는
프로그램과 신규 시험이 호출한다. 앱 시각 내부 필드는 t 대신 last_time을
사용하며 이 경로들을 함께 변경했다.

이번 대상 보완의 호출자 확인: `targets.resolve/matches`는 watch,
source-parity, worker(SSM에서는 인메모리 주입), 신규 시험이 호출한다.
`hubHttp`는 worker와 시험에서만 사용한다. `environmentWarnings`는 judge,
monitor와 watch의 혼합 설정 차단 경로가 호출한다. monitor의 collect 인자는
`(symbols, target)`으로 늘었고 기본 collectRemote 및 모든 시험 수집기를
확인했다. judge/sanitize의 target 인자도 monitor·collectRemote·시험에
반영했다. worker.run 호출자는 SSM 전달 프로그램과 신규 시험뿐이다.

watch의 app 호출자는 fetchQuotes/Big/Tickers/Watchlist/Dashboard/WebPrices/
IndexClose와 runOnce의 ticker 재확인이다. 모두 동일 base를 전달한다.
이 fetch 함수와 hubSample/tlsDays의 호출자는 watch 내부 runOnce뿐이며
최초·일반 재확인·31개 문 재확인을 함께 수정했다. 화면 probe에는 같은 base를
전달한다(실행은 하지 않음). summarize는 runOnce의 정상/혼합 경로가 호출한다.
관제 소비자 `scripts/hud/sources.js::loadIntegrity`는 기존 집계와 line을 읽어
추가 target 필드의 영향을 받지 않는다. rules·clock·앱 src는 변경하지 않았다.

신규 시험 명령:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock env NODE_PATH=/Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules node scripts/integrity/source-parity.test.js
```

네트워크·AWS·브라우저 없이 REG 달력, 가격/시각 경계, 병렬 발송,
2초 창, 20초 재확인, 82회 상한, 실패 예약 차감, SSM 전달 코드,
lastUpdate 배제, last_time 누락, latest.json·회차 증거와 반복 경고를 검사한다.
기존 priceIntegrityRules, integrityBigDoor, integrityParity 시험도 lockf로 감싼다.
검증 결과는 시험 종료 후 아래에 기록한다.

보완 검증 결과: 신규 14개 통과. 기존 priceIntegrityRules 82개,
integrityBigDoor 7개, integrityParity 33사례·7회차 재생의 306/306 비교 통과.
모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 감쌌으며 공유 잠금
해제까지 기다린 뒤 실행했다. 신규 통합시험 최초 실행은 합성 ticker의
옵션 레벨 누락(LV_EMPTY 41건) 때문에 경고 합계 기대값에서 실패했다.
시험 응답에 정상 옵션 레벨을 채운 뒤 신규 시험만 재실행해 통과했다.
기존 시험 묶음·전체 tsc·next build는 반복 실행하지 않았다.
구문 검사 4개와 `git diff --check`도 통과했다.

영어 커밋 메시지 제안은 `/tmp/signum-source-parity-commit.txt`에 남겼다.
커밋은 실행기가 수행한다.

관문 10170753 보완 검증 결과: lockf 적용 오프라인 sourceParity **19개 통과**.
운영/미리보기/로컬 주소 선택, 혼합 조합의 무조회 경고, 최초/재확인 대상 전달,
앱/허브/원천/피드 증거 누락·불일치, SSM 전달 코드의 VM 실행, 미리보기
WS와 TLS 포트, 반복 혼합 회차 경고 및 명시적 실행 옵션 우선순위를 확인했다.
기존 priceIntegrityRules **82개**, integrityBigDoor **7개**, integrityParity
**33사례·7회차 재생 306/306** 비교 통과. 기존 규칙별 원본 비교도 152/152,
40/40 통과했다. 기존 비교 시험은 추가 target 메타데이터만 비교에서 제외하며
판정·집계 비교를 유지한다. target 자체는 신규 통합시험에서 별도 검증한다.

최초 소규모 시험은 기존 fixture의 target 증거 누락으로 기대 코드가 달라
실패했다. fixture를 보완한 뒤 원천 대조 시험만 재실행해 통과했다.
기존 시험 묶음은 각각 한 번 실행했다. 전체 tsc·next build는 실행하지 않았다.
최종 검토에서 혼합 차단 경로에도 기존 summary 필드(호출 수·세션·ticker
실패 수·newErrors)를 유지하도록 보완했다. 이 경로가 포함된 watch 통합시험
1개만 이름 필터로 재실행해 통과했다. JS 구문 검사 6개와 diff 검사도 통과했다.
브라우저·운영 조회·AWS 접근·운영 쓰기·커밋·push·배포는 실행하지 않았다.

## 관문 10171123 보완: 대상 초기화 뒤 같은 칸 중복 실행

관문 지적: “기존 state에 `target`이 없는 최초 적용 또는 대상 변경 시,
state 전체를 초기화하면서 `tick()`이 저장한 `lastSlot`도 삭제합니다.”
원인은 `runOnce`의 대상 불일치 분기가 빈 state를 만들어 회차 종료 시
스케줄러의 칸 기록까지 덮어쓴 것이다. 이 분기는 이제 `lastSlot`만 이어받고
대상별 실적 목록·참조 캐시·회전 위치·누적 경고는 기존처럼 초기화한다.
대상이 같으면 기존 state를 그대로 이어받는다. 화면·관제 문구와 표시,
공유 함수 인자·반환값은 바꾸지 않았다.

신규 `watch-scheduling.test.js`는 실제 `tick -> runOnce -> persist`를
VM에서 실행한다. private tick만 시험 VM에서 노출하며 운영 export는
바꾸지 않는다. 외부 응답·시계·알림·화면 probe는 모의 처리하고 state,
latest, history와 회차 파일은 임시 디렉터리에 쓴 뒤 삭제한다.

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock env NODE_PATH=/Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules node --test scripts/integrity/watch-scheduling.test.js
```

수정 전에는 신규 state·target 없는 기존 state·대상 변경의 3개 시험 모두
같은 칸에서 원천 대조가 2회 실행되어 실패했고, 동일 대상 대조군은 통과했다.
수정 후 4/4 통과했다. 두 번째 tick의 원천·앱 무조회, history 1회 저장,
run.lock 해제, 다음 칸 실행, 대상별 캐시 초기화와 동일 대상 보존을 확인했다.

공유 함수 영향: 변경한 `runOnce`의 호출자는 watch의 tick/run CLI,
`source-parity.test.js`, `tests/priceIntegrityRules.test.ts`,
`tests/integrityParity.test.js`와 신규 스케줄 시험이다. 수동 run도 기존
실행 칸을 보존한다. `lastSlot` 소비자는 tick뿐이고, 관제
`scripts/hud/sources.js::loadIntegrity`가 읽는 summary 스키마는 동일하다.

이전 관문 회귀 시험 `source-parity.test.js` 19/19 통과. 41종목 재확인
82회 예산, lastUpdate 배제와 last_time 누락 경고, 전체 수집 실패의
41종목 경고 집계, 지정 대상 전달·혼합 환경 차단 시험을 유지했다.
기존 priceIntegrityRules 82/82, integrityBigDoor 7/7,
integrityParity 33사례·7회차의 306/306 비교도 통과했다.
원본 규칙 비교 152/152와 40/40도 통과했다. 모든 시험은 lockf로 직렬 실행했고,
기존 시험 묶음은 한 번만 실행했다.

이 변경은 tsconfig의 검사 대상에서 제외된 scripts/*.js에 한정되므로
Node 구문 검사 6개와 `git diff --check`로 검증했고 모두 통과했다.
전체 tsc·next build와 개발 서버는 실행하지 않았다.
실제 EC2 응답·2초 수집률과 앱 last_time 부재에 따른 STALE_APP 실검증
한계는 그대로다. 브라우저·운영 조회·AWS 접근·운영 쓰기·커밋·push·배포는
실행하지 않았다.

## 5차: 관문 10171314의 REG 종료 경계 보완

해소 대상 문장: “장중 여부를 키 조회 전에만 검사합니다.”
또한 “마감 0.5초 전에 진입하고 키 조회에 1초가 걸리면, 마감 후에도
원천 조회를 진행합니다.”라는 지적을 보완했다.
원인은 worker 진입 시 검사 뒤 키 조회·앱 배치·허브·원천 발송 사이에
REG 여부를 다시 검사하지 않은 것이다. 수리 전에 경계 시험을 추가해
마감 0.5초 전 진입·키 조회 0.5초 지연의 정확한 마감 시각에서도 원천
41건이 발송돼 기대값 0건과 달리 실패하는 것을 확인했다.

worker는 앱 각 배치, 허브, 각 원천 요청 직전에 REG를 재검사한다.
장외면 남은 요청 발송을 즉시 멈추고 `{ sessionAborted: true }`만 반환한다.
이미 발송한 요청은 완료될 수 있지만 부분 rows는 반환하지 않는다.
sanitize는 이 상태만 허용해 SSM 반환과 회차 증거에 보존하고, judge는
종목별 `SOURCE_PARITY_SESSION_ABORTED` 경고(“장외 중단”)로 기록한다.
중단 자료는 가격·STALE_APP 판정에 쓰지 않으며, 재확인 중 중단되면
최초 후보는 UNCONFIRMED로 남긴다. 기존 SOURCE_PARITY 접두사 제외 규칙에
따라 반복 경고도 오류로 승격되지 않는다. calls는 기존처럼 수집 전에
예약하는 예산이며, 중단으로 실제 발송이 줄어도 예약량을 환급하지 않는다.
앱 화면 라벨·문구·표시와 watch의 집계 형식은 변경하지 않았다.

공유 함수 영향과 호출자: worker.run은 collectRemote가 만드는 SSM 프로그램과
source-parity.test.js가 호출한다. sanitize는 monitor·collectRemote·시험,
judge는 monitor·시험이 호출한다. monitor는 watch.runOnce·시험에서 사용한다.
watch는 기존 경고 집계와 `evidence.sourceParity.initial/confirmation` 저장을
그대로 사용하므로 watch·HUD 코드는 변경하지 않았다. HUD의 loadIntegrity는
기존 summary와 line을 계속 읽는다.

시험 결과(모두 오프라인, lockf 직렬 실행):

- source-parity.test.js: 수정 전 신규 경계 시험 41 ≠ 0으로 실패,
  수정 후 전체 22/22 통과. 일반 16:00·조기 13:00 마감에서 키 조회 지연
  500/1000ms, 진입 시 이미 장외, 44개 발송 사이 43개 경계 각각을 검사했다.
  모든 경우 장외 추가 발송 0건, 부분 자료 폐기와 최초/재확인 판정 배제를 확인했다.
- SSM 코드 VM 실행에서 앱 발송 뒤 마감 시 허브·원천 무발송과 중단 상태 전달을
  확인했다. 임시 파일 통합시험에서 41종목 장외 중단이 정상 0·오류 0·경고 41,
  회차 증거 보존, 두 회차 반복 시 승격 없음으로 기록됐다.
- 이전 관문 회귀 유지: 82회 예산·lastUpdate 배제·last_time 누락·전체 실패 경고·
  대상 분리 및 lastSlot 스케줄 4/4 통과.
- 기존 priceIntegrityRules 82/82, integrityBigDoor 7/7,
  integrityParity 33사례·7회차 306/306 비교 통과. 원본 규칙 비교 152/152와
  40/40도 통과했다. 기존 묶음은 한 번만 실행했다.
- Node 구문 검사 7/7과 git diff --check 통과. 변경 JS는 tsconfig 검사 대상에서
  제외되어 전체 tsc·next build와 개발 서버는 실행하지 않았다.

명령은 기존 source 시험 명령과 동일한 NODE_PATH를 사용했다.
각 시험·구문 검사 실행을 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 감쌌다.
스케줄 시험은 `node --test scripts/integrity/watch-scheduling.test.js`,
기존 TS 시험은 ts-node의 `--transpile-only`와 CommonJS/node 설정,
기존 비교는 `node tests/integrityParity.test.js`로 실행했다.

남은 위험: EC2 실응답·실제 2초 수집률은 미검증이고 앱 last_time 부재로
STALE_APP 실검증 한계가 남는다. REG 안에 이미 발송한 요청은 취소하지 않는다.
영어 커밋 메시지는 `/tmp/signum-source-parity5-commit.txt`에 저장한다.
커밋·push·병합·배포·운영 접근과 쓰기는 실행하지 않았다.
