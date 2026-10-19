# 대가 렌즈 MVP 1단계

운영 화면·문구·푸시·SEO 변경 없음. 이 브랜치에서는 운영 크론을 호출하거나 Redis에 쓰지 않는다.

- GET `/api/guru-lens`: 렌즈별 통과 수와 상위 10개. 통과 0이면 가장 근접한 5개(`passed:false`).
- GET `/api/guru-lens?lens=moat_compounder&limit=20`: 단일 렌즈, 최대 50개.
- GET `/api/guru-lens?ticker=AAPL`: 전체 평가표에서 찾은 통과 렌즈 목록과 렌즈별 수치 판정. Top N 밖 종목도 역조회된다.
- 두 필터를 같이 쓰면 해당 렌즈 안의 종목 판정. 잘못된 필터는 400, 발행본 없음/읽기 실패는 503.
- GET `/api/cron/guru-lens`: Authorization 헤더 필수, 비밀 설정이 없으면 401. Vercel 주 1회 일요일 07:00 UTC(16:00 KST). 실행 제한 300초, 원천 수집 예산 240초.

## 규칙·근거

`rules.ts`의 전략 유형 ID 10개만 공개 이름으로 쓴다. 인물명은 `source.book`의 저자 표기에만 있다. 확인한 장은 `source.chapter`, 장을 확정하지 못한 문헌·논문은 null이다. 각 규칙의 수치·판정·이유는 동일한 Check에서 생성한다. 점수는 정렬용이며 승률이 아니다. `interpretation`과 `sort`에 SIGNUM 축약·대용·가중치를 명시한다.

`closestSort.metric/direction`은 탈락 종목의 정렬 지표와 방향이다. 최대 비관 렌즈는 5년 평균 PER 오름차순, 나머지 9개는 명시한 원지표·복합점수 내림차순이다. 통과 종목의 백분위·음수 순위합은 기존 내림차순을 사용한다. 양쪽 모두 결측은 뒤로 보내고 동점은 티커 오름차순이다. 근접 목록은 규칙 통과로 바꾸지 않으며, 여러 조건까지의 거리를 새로 합산하는 방식은 아니다.

프로토와 달리 결측 부채·현금·CAPEX·배당을 0으로 만들지 않는다. 평균은 필요한 관측값이 모두 있을 때만 계산한다(ROE는 명시한 9/10 예외). 따라서 프로토 통과 수와 같다고 보장하지 않는다. F점수는 9개 중 8개 충족이며, 개별 항목 하나의 실패와 전체 불통과를 혼동하지 않는다. 배당 연속 기록은 12년으로 축약한 조건이다. 재무는 TTM이 아니라 직전 CY 연간 frames이다.

## 원천·호출량 (코드상 추정, 실호출 측정 아님)

S&P 구성표 503개와 `UNIVERSE` 교집합을 사용하며 현재 495개다. 정적 제외표로 495를 맞추지 않는다.

- SEC: 프로토와 같은 `company_tickers.json` + XBRL frames. 완전 콜드 실행 약 248 GET(티커표 1 + 연간 frames 244 + 최신 분기 주식수 3). frames는 순차 호출하고 요청 간 140ms 대기한다. 404는 결측, 통화·단위·기간·태그 불일치는 실패다. 축약 원자료에는 값·공시 accession·기간·단위·태그를 보존한다.
- Yahoo: 프로토의 공개 chart 경로, 일봉 2년과 분할 이벤트를 한 요청으로 수집. 종목 495 + SPY 1 = 최대 496 GET, 동시 3. 현재 날짜 봉은 제외해 미완성 봉을 사용하지 않는다. 베타는 날짜 교집합의 수익률로 계산한다.
- 일자별 수집 캐시가 모두 있으면 SEC 티커표 1회, 나머지 공개 원천 호출 0회. 캐시 키는 `guru:source:v1:*`, TTL 8일. 유료 공급사 추가 호출은 0이다. 실제 호출 시도 수는 발행 메타/크론 결과의 `calls`에 기록한다.
- SEC 티커표의 XOM은 프로토에 명시된 과거 CIK 34088로 연결하고, 원래 CIK와 사용한 CIK를 모두 보존한다. 직전 정상본과 어느 CIK라도 달라지면 보류한다.

## 배지: 요청 시 기존 캐시만 읽기

- 13F: `/api/command/13f`와 같은 `cusipForTicker`, `isPartialIndex`, `cache:13f:cusip:*` 색인 재사용. 기준일·제출일·지연·표본/잘림 정보를 포함한다. 상위 60개에 없으면 미보유를 단정하지 않는다. 기존 색인에 없는 운용사 포트폴리오 비중·순위는 null이다.
- 오늘의 돈: FINRA의 검증된 읽기 서비스, `intrinio:options:eod`, 내부자 원자료 공유 캐시를 읽는다. 다크풀 축적/은밀도≥70, 콜/풋 거래량≥1.5, 미만기 OI +5,000 이상 계약 중 콜 수>풋 수, 30일 내부자 순매수>0. 신규 OI는 저장된 상위 계약의 대용 지표다. 배지에는 원천별 기준일과 FINRA attribution을 포함한다. 거래량은 레코드 `date`, 신규 OI는 `prevDate` 세션이다. `prevDate` 결측·역전은 신규 OI 미확인이다. stale 종목은 자체 `date`·`prevDate`만 사용한다. EOD 날짜가 다르면 함께 세지 않고, 7일 초과 EOD는 겹침에 넣지 않는다. 활성 신호가 가장 많은 세션을 선택하며 동수면 최신 세션을 택한다. 내부자는 그 세션에 최근 30일 관측으로 함께 세되 별도 거래기간을 보존한다. 내부자는 거래일 기준, P/S만, 파생거래 제외다. 프로토의 ‘매수 건수가 있으면 순매수’ 조건은 사용하지 않는다.
- 실적: 기존 캘린더 캐시 + `applyConfirmedEarnings`, ET 날짜 기준 D-n. 35일 안 실적만 `readImpliedMoveRows({after,timing})`에 전달한다. 정본의 실적 뒤 첫 만기 ATM 스트래들·세션·결측 사유를 그대로 반환하며 주간 변동폭으로 대신 채우지 않는다.
- 위 읽기 경로에서 원천 재수집·캐시 갱신·내부 HTTP API 호출은 하지 않는다. 내부자 공유 캐시가 없으면 미확인이다.

내부자 원자료 캐시는 첫 30개 공시다. `next_page:null`로 완결을 확인한 응답만 P 금액−S 금액을 확정한다. 후속 페이지가 있거나 페이지 정보가 없는 응답은 내부자 신호의 `on`과 `values`를 null로 반환한다. 첫 페이지 매수 $1,000·다음 페이지 매도 $2,000일 때 첫 페이지 소계로 ‘겹침’을 만들지 않는다. 추가 페이지를 공급사에서 호출하지 않으므로 호출량 추정은 위와 동일하다. 기존 command/insider 공유 함수·10b5-1 분류는 변경하지 않았고, Intrinio가 제공하지 않는 자동매매 여부도 추정하지 않는다.

## 발행 검사·보존

분할 이후 주식수는 원천 이벤트 비율로 조정하고, 계수·주식수/가격 기준일·PER 두 경로를 검산한다. 과거 비교 기간에 걸친 분할로 EPS/가중주식수 기준을 확정하지 못하면 `historical_split_basis_review`로 보류한다. 백만 단위 추정 보정이나 EPS×주식수로 순이익을 몰래 교체하지 않는다. 자릿수/통화/분사/CIK 이상도 보류한다. 가격/CIK 확보율 95% 미만, 유니버스 중복·누락, 7일 초과 가격 지연도 보류한다.

직전 정상본 대비 통과 수 차이가 `max(10, 직전 수×50%)` 이상이면 보류한다. 이것은 데이터 발행 가드이며 렌즈 선정 조건이 아니다. 첫 실행은 비교할 정상본이 없으므로 다른 검사만 적용한다. 프로토에서 이미 발견한 원천 단위 오류·과거 분할이 남아 있으면 최초 발행도 보류될 수 있다. 해당 원자료의 기준을 확인해야 하며 검사를 우회해서는 안 된다.

키는 `guru:lens:v1:{lensId}:{date}`, date는 UTC ISO 실행시각이다. `asOf`는 계산에 사용한 완료 가격 세션 중 가장 오래된 날짜로, 실행시각과 분리한다. 같은 `asOf`·더 오래된 `asOf`는 발행하지 않는다. 기존 세대는 TTL 없이 보관하고 직전 정상본을 `head.previous`에 남긴다. 읽기는 같은 세대 10개를 검증하고 불완전하면 직전 세대로 폴백한다.

발행본 전용 저장소는 **기존 Upstash 한 곳**이다. 읽기 API·주간 서비스의 head·렌즈·메타 읽기/쓰기를 모두 같은 저장소로 연결하며 EC2로 전환하거나 복제하지 않는다. 원천 수집 캐시만 기존 EC2 권위 저장소, 배지는 기존 공유 캐시 경로를 사용한다. Upstash 설정·연결 실패는 실패로 처리한다. 과거 EC2 발행본이 별도로 존재한다면 자동 이관하지 않는다. 이번 작업의 운영 쓰기·이관은 0회다.

발행 시 head 단위 `SET NX EX 60` 잠금을 얻는다. 렌즈 10개·메타는 각각 Lua에서 소유권을 확인하고 불변 저장한다(동일 값 재확인만 허용). 한 개라도 실패하면 head 발행에 진입하지 않는다. head는 Lua 한 실행에서 소유권·현재 포인터 전체·기존 `asOf`·11개 저장 완료를 확인한 뒤 갱신한다. 비교와 갱신 사이에 다른 실행이 끼어들 수 없다. 잠금 만료 뒤 늦은 저장·발행은 거부하며, 해제도 소유권 비교 후 삭제한다. 응답 유실은 실패로 반환할 수 있지만 다음 실행이 같은 권위 저장소의 head를 다시 읽으므로 역행하지 않는다.

head의 최신 B가 손상되어 정상 A로 폴백한 경우 C는 관측한 B의 포인터를 비교하면서 `previous:A`로 발행한다. 과거 정상본·부분 저장 고아 세대는 자동 삭제하지 않는다. 보관 용량 정책은 별도 운영 결정이다.

## 로컬 시험

의존성은 기존 저장소 node_modules를 로컬 심볼릭 링크로 재사용(버전 관리 대상 아님). 시험은 메모리 어댑터/합성 입력만 사용한다.

```
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLens.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensApi.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensSources.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensReadOnly.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensRegression.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensGate3.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensGate4.test.ts
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensPublication.test.ts
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false
```

운영 저장소 쓰기·배포·브라우저 접근은 시험에 포함되지 않는다.

원자료 재생 시험은 `tests/guruLensReplay.test.ts <proto 디렉터리>`를 같은 ts-node 옵션과 공용 lockf로 실행한다. 로컬 파일을 fetch 어댑터에 넣고 수집·계산·보류 검사를 끝까지 통과시키며, 실제 네트워크/운영 쓰기는 0이다.

## 최초 구현 검증 기록

- 렌즈 10개 각각 고정 입력 통과·고유 조건 위반·결측, 이유 문자열, Top 10 밖 역조회, 배지, 정상본 보존 시험 통과.
- API 필터·잘못된 쿼리·빈 캐시·크론 무인증 거부, 원천 일봉/분할/베타 시험 통과.
- 실제 배지 어댑터 + 가짜 fetch: Redis 읽기 7회, 공급사 호출 0회, 쓰기 0회.
- 전체 tsc: 공용 lockf 아래 1회 실행, `--noEmit --incremental false`, 종료 0/오류 0.
- 공개 프로토 원자료 오프라인 재생: 495종목, 모의 SEC 248회/가격 496회/유료 0회, 실제 네트워크·운영 쓰기 0회. 발행 보류 검사 111건: PER 불일치 8, 원천 정합 56, 순이익 자릿수 36, 기업행위 검토 7, 단위 4. 중복 종목·원인에 대한 검사도 포함하므로 111종목이라는 뜻이 아니다. 현재 원자료를 그대로 최초 발행할 수 있다는 판정은 아니다.

## 1차 관문 보류 수리 (당시 검증 기록)

- 수정 전 합성 재현 2건 모두 실패 확인: 불완전 내부자 페이지로 `overlap:true`, B 손상→A 폴백 뒤 C 발행 시 `head_changed`.
- 영향 호출자: `insiderNet`은 `readBadges`가 사용한다. `publishSnapshot`은 주간 `runGuruLens`가 사용한다. `readSnapshot`은 같은 주간 서비스와 GET 읽기 API가 사용하며, API의 인자 생략 시 head를 읽는 동작은 유지한다. 호출자를 `src`·`tests` 전체에서 검색하고 주간 서비스와 API 시험에 포함했다.
- 수정 후 신규 회귀 시험 5개 통과: 불완전/페이지 정보 누락/완전 내부자 응답, P−S·기타 코드·거래일, 캐시 배지 연동, 손상본 폴백 뒤 발행·정상본 보존·동시 head 변경·오래된 계산 거부, 495종목 합성 입력의 실제 주간 서비스 복구. 기존 경량 시험 4개도 통과했다.
- 전체 tsc는 공용 lockf 아래 1회 실행해 종료 0·오류 0을 확인했다. 오프라인 원자료 재생도 공용 lockf 아래 1회 통과했다. 495종목·모의 SEC 248회/가격 496회/유료 0회, 실제 네트워크·운영 쓰기 0회. 발행 보류 111건(위 기록과 같은 원인별 건수)을 재측정했다. 원천 이상이 해소된 상태라는 뜻은 아니다.
- 잔여 제한: 불완전 내부자 캐시는 미확인, 원자료 이상으로 최초 발행 보류, head 재검사는 분산 CAS가 아니다. 운영 화면·라벨·기존 공유 서비스 변경, 커밋·배포·운영 데이터 쓰기 없음.

## 2차 관문 보류 수리 (당시 검증 기록; 현재 발행 저장소는 위 계약)

- 원인: `setInCache`의 성공 기준은 EC2 또는 Upstash 중 하나의 성공이다. 주간 서비스는 EC2 권위 읽기를 사용하므로 렌즈 한 개가 Upstash에만 저장된 경우에도 head가 발행되어, 다음 주기에는 `previous_snapshot_unreadable`로 막혔다. 실제 Redis 코드와 주간 서비스에 메모리 저장소를 연결한 수정 전 시험에서 `published:true` 오판을 재현했다.
- 수정: `redisClient.setAuthoritativeCache`는 EC2 성공만 반환하고 Upstash로 전환·복제하지 않는다. 주간 서비스의 원천 캐시·렌즈 10개·메타·head를 이 함수에 연결했다. 기존 `publishSnapshot`의 렌즈별 순차 결과 검사는 유지한다. 렌즈 또는 메타 하나라도 실패하면 head 쓰기에 진입하지 않으며, head 자체 실패도 발행 실패다. 장애 해소 뒤 다음 계산은 다시 발행할 수 있다.
- 공용 원자적 저장 함수 검토: main의 `e2dfab7ea`에 있는 `atomicArchiveSave`는 단일 저장소 EVAL 또는 전용 WATCH 연결과 원천 시각·TTL 계약을 요구한다. 현재 EC2 HTTP 프록시는 EVAL/WATCH/CAS를 지원하지 않는다. Upstash로 연결하면 권위 읽기 저장소와 달라지므로 재사용하지 않았다. 불변 세대 저장 후 단일 head SET 구조를 유지하며 다중 키 트랜잭션·분산 CAS라고 주장하지 않는다.
- 영향 호출자: 신규 `setAuthoritativeCache`의 운영 호출자는 `guruLens/service.ts`의 `strictCache.write` 한 곳이다. 이를 원천 수집 `collectCompanies`와 발행 `publishSnapshot`이 사용한다. 기존 `setInCache`·`getAuthoritativeCache`·`getFromCache`의 구현·호출 계약은 유지했다. 화면·라벨·읽기 API 응답 구조 변경 없음.
- 신규 시험: 최초 발행/직전 정상본 있음 각각에 대해 렌즈 10개·메타·head의 개별 실패 총 24개 시나리오, head 보존·폴백 쓰기 0회·다음 주기 495종목 새 발행·정상본 다시 읽기를 검사한다. 기존 복제 저장 함수의 성공 계약도 재현하며, 신규 함수의 결측/오류 응답 차단·전체 저장소 장애를 검사한다. 시험은 Redis 원본 모듈을 격리 실행하고 이미 생성한 가짜 SDK를 주입한다. 실제 환경변수·환경 파일을 읽지 않고 네트워크·운영 쓰기도 하지 않는다.
- 수정 후 검증: 신규 시험 3개(개별 저장 실패·재시도 24개 시나리오 포함), 기존 경량 시험 4종, 1차 관문 회귀 5개 모두 통과했다. 실제 배지 어댑터는 모의 Redis 읽기 6회·공급사 호출 0회·쓰기 0회였다. 전체 tsc는 공용 lockf 아래 1회 실행하여 종료 0·오류 0을 확인했다. 원자료 재생도 공용 lockf 아래 1회 통과했다. 495종목·모의 SEC 248회/가격 496회/유료 0회, 실제 네트워크·운영 쓰기 0회였다. 발행 보류 111건(PER 8·원천 정합 56·순이익 자릿수 36·분사 7·단위 4)을 재측정했다. 이 원자료는 현재도 최초 발행 보류 대상이다.

## 3차 관문 보류 수리

- 수정 전 HEAD 코드로 합성 재현: `date=10/16`, `prevDate=10/15`, 콜 OI +6,000과 10/16 다크풀이 `count:2, overlap:true`였다. 두 실행이 같은 head를 읽고 최신→이전 순서로 쓰면 둘 다 성공하고 최신본이 역행했다. 운영 재현은 하지 않았다.
- OI 기준일 수정, stale 종목 날짜 분리, 세션별 겹침 계산을 추가했다. `prevDate`를 거래량 `date`나 달력 전날로 추정하지 않는다.
- main `e2dfab7ea`의 `atomicArchiveSave`를 검토했다. 단일 키·필수 TTL 계약이며 기존 EC2 HTTP 프록시는 EVAL/WATCH가 없다. 무기한 세대 보존·11개 저장 확인·head CAS·잠금 소유권을 함께 처리해야 하므로 발행 전용 Upstash 어댑터를 추가했다. 공용 함수와 기존 호출자는 변경하지 않았다. 큰 다중 키 JSON을 한 요청에 싣지 않고 렌즈별 저장 결과를 모두 확인한다.
- 영향 호출자: `moneyBadge`→`readBadges`→`currentBadges`→GET 읽기 API. `publishSnapshot`→`runGuruLens`→주간 크론. `readSnapshot`→주간 서비스·GET 읽기 API. 새 `publicationStore`는 이 두 경로에서만 사용한다. 기존 13F·내부자·impliedMove·공용 Redis 함수 구현은 변경하지 않았다. API에는 원천 기준일 `asOf`가 추가된다.
- 공급사 호출량 추정은 기존 SEC 248·가격 496·유료 0으로 동일하다. 발행 저장소 명령은 성공 주기당 잠금 1·세대 저장 EVAL 11·head EVAL 1·잠금 해제 EVAL 1, 별도 정상본 읽기 최대 23 GET이다(코드상 추정, 운영 실측 아님). 공급사 신규 호출은 없다.
- 검증은 모의 Redis 프로토콜과 메모리 저장소를 사용한다. 실제 Redis Lua 엔진·운영 Upstash 연결은 이번 환경에서 미검증이다. 로컬 Redis 실행 파일이 없다. 운영 화면·라벨 변경, 커밋·push·병합·배포·운영 데이터 쓰기 없음.

- 이번 검증 결과: 고정 입력·출구 검사·역조회, API, 원천, 실제 배지 읽기 어댑터의 기존 4종 통과. 1차 관문 회귀 5개, 2차 관문 시험 3개(개별 저장 실패·다음 주기 재발행 24개 상황 포함), 3차 관문 회귀 7개 통과. 수정 전 HEAD 코드의 3차 결함 2건도 별도 메모리 재현했다.
- 전체 tsc는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 `--noEmit --incremental false`로 한 번 실행해 종료 0·오류 0이었다. 공용 잠금 대기 뒤 실행했으며 반복 실행하지 않았다.
- 오프라인 원자료 재생도 같은 공용 잠금 아래 한 번 실행해 통과했다. 495종목, 모의 SEC 248·가격 496·유료 원천 0회, 실제 네트워크·운영 쓰기 0회다. 보류 111건을 재측정했다(PER 불일치 8·원천 정합 56·순이익 자릿수 36·분사 7·단위 4). 원자료 발행 가능 판정은 아니다.
- 바꾼 파일 11개: `src/lib/guruLens/{badges,pipeline,service,store,types}.ts`, 이 `README.md`, `tests/guruLens.test.ts`, `tests/guruLensRegression.test.ts`, `tests/guruLensPublication.test.ts`, `tests/guruLensGate3.test.ts`, `tests/helpers/guruPublication.ts`. `git diff`로 저장 확인 및 공백 검사 통과. 이번 수리에서 화면·Vercel 설정·기존 공용 Redis 구현의 추가 변경은 0개다.

## 4차 관문 보류 수리

- 원인·수정 전 재현: 최대 비관 렌즈의 탈락 종목은 원지표 PER을 `score`로 보존하지만, 공통 정렬은 통과 백분위처럼 내림차순이었다. PER 16·20·30·40·50·60, 나머지 조건 동일인 고정 입력에서 통과 0개와 근접 목록 60·50·40·30·20을 확인했다. 신규 회귀시험의 첫 단언이 수정 전 코드에서 실패했다.
- 수정: 10개 렌즈에 탈락 지표·정렬 방향을 명시했다. 최대 비관 렌즈는 PER 오름차순으로 16·20·30·40·50을 선택한다. 통과 점수·판정·이유 문자열 생성은 그대로이며, 결측 점수는 양방향 모두 후순위다. 기존 발행본은 읽을 때 재정렬하거나 다시 저장하지 않으며 다음 정상 계산본부터 적용된다.
- 영향 호출자 전수 검색: `evaluateLenses`의 운영 직접 호출자는 `pipeline.makeSnapshot` 한 곳이며 `service.runGuruLens`→주간 크론으로 이어진다. 읽기 API는 `readSnapshot`→`selectSnapshot` 뒤 저장된 순서에서 5개를 선택한다. 직접 시험 호출자는 `guruLens.test.ts`·신규 `guruLensGate4.test.ts`; `makeSnapshot`을 거치는 API·원자료 재생·발행·1차/3차 관문 시험도 검사했다. `LensDefinition`에는 `closestSort` 메타데이터가 추가된다. 기존 화면·라벨·공용 Redis·13F·내부자·impliedMove 구현 변경은 없다.
- 신규 회귀 검증 통과: PER 6개 입력의 근접 5개, 10개 렌즈 각각 유리한 지표 방향, 양방향 결측·동점, 통과 백분위 순서·통과 우선, 전체/단일 렌즈 GET 및 `limit=1`에서도 근접 5개, 첫 후보와 상위 5개 밖 후보의 역조회에서 `passed:false` 보존.
- 기존 7종 시험 모두 통과: 고정 입력·출구 검사·역조회, API, 원천, 실제 배지 읽기 어댑터, 1차 관문 5개, 2차 관문 3개(24개 저장 실패·재시도 상황), 3차 관문 7개. 실제 배지 어댑터는 모의 Redis 읽기 6회·공급사 호출 0회·쓰기 0회였다.
- 전체 tsc는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 `--noEmit --incremental false`로 한 번 실행해 종료 0·오류 0이었다. 기존 시험 묶음·오프라인 원자료 재생도 같은 공용 잠금 안에서 순차 실행했다. 원자료 재생 495종목, 모의 SEC 248·가격 496·유료 0회, 실제 네트워크·운영 쓰기 0회였다. 발행 보류 111건(PER 8·원천 정합 56·순이익 자릿수 36·분사 7·단위 4)을 재측정했으며 해당 원자료는 발행 불가다. 공급사 호출량 추정은 기존과 동일하다.
- 바꾼 파일 4개: `rules.ts`, `types.ts`, 이 `README.md`, `tests/guruLensGate4.test.ts`. 남은 위험은 원자료 이상에 따른 발행 보류와 실제 Redis Lua·운영 연결 미검증이다. 화면·라벨 변경, 커밋·push·병합·배포·운영 데이터 쓰기 없음.
