# 대가 렌즈 MVP 1단계

운영 화면·문구·푸시·SEO 변경 없음. 이 브랜치에서는 운영 크론을 호출하거나 Redis에 쓰지 않는다.

- GET `/api/guru-lens`: 렌즈별 통과 수와 상위 10개. 통과 0이면 가장 근접한 5개(`passed:false`).
- GET `/api/guru-lens?lens=moat_compounder&limit=20`: 단일 렌즈, 최대 50개.
- GET `/api/guru-lens?ticker=AAPL`: 전체 평가표에서 찾은 통과 렌즈 목록과 렌즈별 수치 판정. Top N 밖 종목도 역조회된다.
- 두 필터를 같이 쓰면 해당 렌즈 안의 종목 판정. 잘못된 필터는 400, 발행본 없음/읽기 실패는 503.
- GET `/api/cron/guru-lens`: Authorization 헤더 필수, 비밀 설정이 없으면 401. Vercel 주 1회 일요일 07:00 UTC(16:00 KST). 실행 제한 300초, 원천 수집 예산 240초.

## 규칙·근거

`rules.ts`의 전략 유형 ID 10개만 공개 이름으로 쓴다. 인물명은 `source.book`의 저자 표기에만 있다. 확인한 장은 `source.chapter`, 장을 확정하지 못한 문헌·논문은 null이다. 각 규칙의 수치·판정·이유는 동일한 Check에서 생성한다. 점수는 정렬용이며 승률이 아니다. `interpretation`과 `sort`에 SIGNUM 축약·대용·가중치를 명시한다.

프로토와 달리 결측 부채·현금·CAPEX·배당을 0으로 만들지 않는다. 평균은 필요한 관측값이 모두 있을 때만 계산한다(ROE는 명시한 9/10 예외). 따라서 프로토 통과 수와 같다고 보장하지 않는다. F점수는 9개 중 8개 충족이며, 개별 항목 하나의 실패와 전체 불통과를 혼동하지 않는다. 배당 연속 기록은 12년으로 축약한 조건이다. 재무는 TTM이 아니라 직전 CY 연간 frames이다.

## 원천·호출량 (코드상 추정, 실호출 측정 아님)

S&P 구성표 503개와 `UNIVERSE` 교집합을 사용하며 현재 495개다. 정적 제외표로 495를 맞추지 않는다.

- SEC: 프로토와 같은 `company_tickers.json` + XBRL frames. 완전 콜드 실행 약 248 GET(티커표 1 + 연간 frames 244 + 최신 분기 주식수 3). frames는 순차 호출하고 요청 간 140ms 대기한다. 404는 결측, 통화·단위·기간·태그 불일치는 실패다. 축약 원자료에는 값·공시 accession·기간·단위·태그를 보존한다.
- Yahoo: 프로토의 공개 chart 경로, 일봉 2년과 분할 이벤트를 한 요청으로 수집. 종목 495 + SPY 1 = 최대 496 GET, 동시 3. 현재 날짜 봉은 제외해 미완성 봉을 사용하지 않는다. 베타는 날짜 교집합의 수익률로 계산한다.
- 일자별 수집 캐시가 모두 있으면 SEC 티커표 1회, 나머지 공개 원천 호출 0회. 캐시 키는 `guru:source:v1:*`, TTL 8일. 유료 공급사 추가 호출은 0이다. 실제 호출 시도 수는 발행 메타/크론 결과의 `calls`에 기록한다.
- SEC 티커표의 XOM은 프로토에 명시된 과거 CIK 34088로 연결하고, 원래 CIK와 사용한 CIK를 모두 보존한다. 직전 정상본과 어느 CIK라도 달라지면 보류한다.

## 배지: 요청 시 기존 캐시만 읽기

- 13F: `/api/command/13f`와 같은 `cusipForTicker`, `isPartialIndex`, `cache:13f:cusip:*` 색인 재사용. 기준일·제출일·지연·표본/잘림 정보를 포함한다. 상위 60개에 없으면 미보유를 단정하지 않는다. 기존 색인에 없는 운용사 포트폴리오 비중·순위는 null이다.
- 오늘의 돈: FINRA의 검증된 읽기 서비스, `intrinio:options:eod`, 내부자 원자료 공유 캐시를 읽는다. 다크풀 축적/은밀도≥70, 콜/풋 거래량≥1.5, 미만기 OI +5,000 이상 계약 중 콜 수>풋 수, 30일 내부자 순매수>0. 신규 OI는 저장된 상위 계약의 대용 지표다. 배지에는 원천별 기준일과 FINRA attribution을 포함한다. EOD 날짜가 다르면 함께 세지 않고, 7일 이상 오래된 EOD는 겹침에 넣지 않는다. 내부자는 거래일 기준, P/S만, 파생거래 제외다. 프로토의 ‘매수 건수가 있으면 순매수’ 조건은 사용하지 않는다.
- 실적: 기존 캘린더 캐시 + `applyConfirmedEarnings`, ET 날짜 기준 D-n. 35일 안 실적만 `readImpliedMoveRows({after,timing})`에 전달한다. 정본의 실적 뒤 첫 만기 ATM 스트래들·세션·결측 사유를 그대로 반환하며 주간 변동폭으로 대신 채우지 않는다.
- 위 읽기 경로에서 원천 재수집·캐시 갱신·내부 HTTP API 호출은 하지 않는다. 내부자 공유 캐시가 없으면 미확인이다.

내부자 원자료 캐시는 첫 30개 공시다. `next_page:null`로 완결을 확인한 응답만 P 금액−S 금액을 확정한다. 후속 페이지가 있거나 페이지 정보가 없는 응답은 내부자 신호의 `on`과 `values`를 null로 반환한다. 첫 페이지 매수 $1,000·다음 페이지 매도 $2,000일 때 첫 페이지 소계로 ‘겹침’을 만들지 않는다. 추가 페이지를 공급사에서 호출하지 않으므로 호출량 추정은 위와 동일하다. 기존 command/insider 공유 함수·10b5-1 분류는 변경하지 않았고, Intrinio가 제공하지 않는 자동매매 여부도 추정하지 않는다.

## 발행 검사·보존

분할 이후 주식수는 원천 이벤트 비율로 조정하고, 계수·주식수/가격 기준일·PER 두 경로를 검산한다. 과거 비교 기간에 걸친 분할로 EPS/가중주식수 기준을 확정하지 못하면 `historical_split_basis_review`로 보류한다. 백만 단위 추정 보정이나 EPS×주식수로 순이익을 몰래 교체하지 않는다. 자릿수/통화/분사/CIK 이상도 보류한다. 가격/CIK 확보율 95% 미만, 유니버스 중복·누락, 7일 초과 가격 지연도 보류한다.

직전 정상본 대비 통과 수 차이가 `max(10, 직전 수×50%)` 이상이면 보류한다. 이것은 데이터 발행 가드이며 렌즈 선정 조건이 아니다. 첫 실행은 비교할 정상본이 없으므로 다른 검사만 적용한다. 프로토에서 이미 발견한 원천 단위 오류·과거 분할이 남아 있으면 최초 발행도 보류될 수 있다. 해당 원자료의 기준을 확인해야 하며 검사를 우회해서는 안 된다.

키는 `guru:lens:v1:{lensId}:{date}`, date는 충돌을 줄이는 UTC ISO 실행시각이다. 10개 불변 세대와 메타 저장 성공 후 head 한 키를 갱신한다. `head.previous`로 직전 정상본을 보존하며 중간 쓰기 실패·보류 시 포인터를 바꾸지 않는다. 읽기는 같은 세대의 10개를 검증하고, 불완전하면 직전 세대로 폴백한다. 발행본에 TTL을 두지 않아 장기 수집 실패 중에도 직전 정상본을 유지한다.

실행 시작 때 읽은 head를 정상본 조회와 발행 재검사에 함께 전달한다. head의 최신 B가 손상되어 A로 폴백한 경우에도 새 정상본 C가 B를 대체하고 `previous:A`를 보존한다. 동시 발행 검사는 A의 날짜가 아니라 시작 시 head의 `current`·`previous` 둘 다와 비교한다. 시작 시 최신 B보다 오래된 계산은 발행하지 않는다.

동시 실행은 저장 후 head 재확인으로 감지하지만 분산 CAS는 아니다. 배포 측에서 중복 크론 실행을 피해야 한다. 불변 세대는 자동 삭제하지 않으므로 장기 보관 용량 정책은 운영에서 정해야 한다. 신규 키는 기존 Redis 클라이언트 정책을 그대로 따른다. 공유 Redis·13F·impliedMove 함수는 변경하지 않았다.

## 로컬 시험

의존성은 기존 저장소 node_modules를 로컬 심볼릭 링크로 재사용(버전 관리 대상 아님). 시험은 메모리 어댑터/합성 입력만 사용한다.

```
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLens.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensApi.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensSources.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensReadOnly.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/guruLensRegression.test.ts
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

## 1차 관문 보류 수리

- 수정 전 합성 재현 2건 모두 실패 확인: 불완전 내부자 페이지로 `overlap:true`, B 손상→A 폴백 뒤 C 발행 시 `head_changed`.
- 영향 호출자: `insiderNet`은 `readBadges`가 사용한다. `publishSnapshot`은 주간 `runGuruLens`가 사용한다. `readSnapshot`은 같은 주간 서비스와 GET 읽기 API가 사용하며, API의 인자 생략 시 head를 읽는 동작은 유지한다. 호출자를 `src`·`tests` 전체에서 검색하고 주간 서비스와 API 시험에 포함했다.
- 수정 후 신규 회귀 시험 5개 통과: 불완전/페이지 정보 누락/완전 내부자 응답, P−S·기타 코드·거래일, 캐시 배지 연동, 손상본 폴백 뒤 발행·정상본 보존·동시 head 변경·오래된 계산 거부, 495종목 합성 입력의 실제 주간 서비스 복구. 기존 경량 시험 4개도 통과했다.
- 전체 tsc는 공용 lockf 아래 1회 실행해 종료 0·오류 0을 확인했다. 오프라인 원자료 재생도 공용 lockf 아래 1회 통과했다. 495종목·모의 SEC 248회/가격 496회/유료 0회, 실제 네트워크·운영 쓰기 0회. 발행 보류 111건(위 기록과 같은 원인별 건수)을 재측정했다. 원천 이상이 해소된 상태라는 뜻은 아니다.
- 잔여 제한: 불완전 내부자 캐시는 미확인, 원자료 이상으로 최초 발행 보류, head 재검사는 분산 CAS가 아니다. 운영 화면·라벨·기존 공유 서비스 변경, 커밋·배포·운영 데이터 쓰기 없음.
