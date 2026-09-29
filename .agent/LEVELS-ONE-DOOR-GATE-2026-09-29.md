# 옵션 레벨 «구조 한 벌 + 정의 게이트» — 원인·수리·검증 (2026-09-29)

브랜치 `fix/levels-one-door-gate` (= ㊲-2 `fix/maxpain-chain-vintage` + 최신 main + 이 수리) · HANDOFF §3 70 · 관련 메모리: options-levels-five-producers-one-door-rule

## 1. 한 줄 요약

9/28 운영 `watchlist/batch?mode=price` 의 **MU 콜월 1000(현재가 아래)·풋플로어 60·감마플립 530, TSLA 풋플로어 200·감마플립 300** 은
수집 Lambda `signum-harvest` 가 DynamoDB `signum-gex-history` 에 쓰는 «다른 정의»의 값이었다
(벽 = 체인 전체 최대 OI·가격 범위 없음, 감마플립 = (콜월+풋플로어)/2, 맥스페인 = 여러 만기 합산).
그 행이 **세 갈래**로 문(API)에 들어왔고, ㊲-2 의 출구 덮기는 «구조 저장본이 없으면 원래 값»이라 막지 못했다.
수리: 화면으로 나가는 레벨은 **구조 한 벌뿐(없으면 null)** + 모든 출구에 **정의 게이트**.

## 2. 원인 — 증거

### 2-1. 값이 GEX 이력 행과 숫자 하나까지 같다
| 종목 | 배치 API(9/28 19:28 ET) 맥스페인/콜월/풋플로어/감마플립 | `/api/history?type=gex` 마지막 행(16:47 ET) | 구조 API(정의대로) |
|---|---|---|---|
| MU | 955 / 1000 / **60** / **530** | 955 / 1000 / 60 / 530 (계약 2,386) | 970 / 1100 / 900 / 1000 |
| TSLA | 370 / 400 / **200** / **300** | 370 / 400 / 200 / 300 | 360 / 360 / 290 / 360 |
| NVDA | 215 / **220**(현재가 228.86 아래) / 200 / 210 | 215 / 220 / 200 / 210 | 220 / 250 / 200 / 230 |
| AAPL | 330 / 345 / 330 / 337.5 | 330 / 345 / 330 / 337.5 | 335 / 345 / 327.5 / 340 |
| MSFT | 495 / 550 / 470 / 510 | (한 행 전) | 495 / 550 / 470 / 505 |

5종목 전부 감마플립 = (콜월+풋플로어)/2 — `harvest_lambda/index.js` 237행 `fl=cw&&pf?(cw+pf)/2:null` 의 흔적.
같은 파일 221~236행: 벽 = `getAllOptions` 가 준 계약 **전체**의 최대 OI(±20% 범위 없음), 맥스페인 = 그 전체 합산 → 416행이 `signum-gex-history` 에 쓴다.
나스닥 공개 체인 대조: MU 10/16 월물 **$60 풋 OI 14,619**(그 만기 최대 풋 OI), **$1000 콜 OI 11,012**(전 만기 최대 콜 OI).

### 2-2. 세 갈래 입구
1. **분석 캐시 복사**: command/unified `getStructureFromDynamoGex`(GEX 이력 행을 `options_status:'OK'`·`confidence:'HIGH'` 구조로 포장)
   → DynamoDB `signum-unified-cache` → 배치 전체 모드 캐시 미스 경로 C → `writeAnalysisCache` → `cache:analysis:{T}`
   → mode=price/ssr/price-dp·전체 모드 적중이 그 레벨을 그대로 반환. (운영 EC2 사본 MU: 필드 순서가 경로 C 리터럴과 같고 expiration null)
2. **배치 끝 «AWS 폴백»**: 비어 있는 필드를 `getLatestGex`(GEX 이력)로 채움 — maxPain·callWall·putFloor·gammaFlipLevel(=flipLevel)·impliedMovePct.
   MU 는 19:28 ET 에 분석 캐시(17:10 ET)가 15분을 넘겨 미스 → 경로 B(레벨 없음) → 이 채움으로 955/1000/60/530/9 가 됐다.
3. **분석 캐시 직접 읽기**: 인텔 섹터 라우트 9개(m7·siliconcore…)·dashboard 기본 경로·intel/fast 폴백이 `analysis.x || 0`.
   그 밖에 live/ticker 는 벤더가 비면 GEX 이력을 구조 결과에 주입, volatility-regime 은 장외에 GEX 이력 flipLevel 을 씀.

### 2-3. 운영 전수 측정 (수리 전, `scripts/audit-levels-doors.js`, 9/28 20:0x ET)
문 18개 × 종목 = **161행 · 정의 위반 38 · 구조 한 벌 불일치 57**. 깨끗했던 문: live/ticker·volatility-regime·섹터 6개.

## 3. 수리 (브랜치 커밋)
- `src/lib/optionLevelGate.ts`(순수 함수): `levelViolations`·`gateLevels`·`displayLevels`(없으면 전부 null)·`levelsFromStructure`(계산 현물 S0 로 게이트)·
  `applyLevelsToRealtime/Unified`(없으면 null, 이 요청이 만든 «진짜» 구조(`levelsProducer`)만 예외) — 정의: 콜월 S<K≤1.2S · 풋플로어 0.8S≤K<S · 감마플립 |K−S|≤0.15S · 맥스페인 |K−S|≤0.35S
- `structureService`: `peekStructureLevelsDetailed`(저장본 없음 구분) · `prefetchLevelsForExit`(요청 시작 때 읽어 I/O 와 겹침) · `levelsForExit` ·
  `warmMissingStructure`(저장본 없는 종목은 `next/server after` 로 응답 뒤 계산, 요청당 3·인스턴스 10분 메모) · `overlayLevelsOnQuotes`
- 문: watchlist/portfolio 배치(AWS 폴백에서 레벨 채움 제거) · dashboard · intel/fast · 인텔 섹터 10개 · command/unified(요청 티커로 덮기) · /ticker SSR ·
  live/ticker(표시 = 구조뿐, 병합 뒤 재게이트, 캐시 키 v5·lastgood v4) · volatility-regime(표시 플립 = 구조) · 구조 API 출구(자기 현물 게이트 — 기존 `result.gex` 게이트는 죽은 코드)
- 화면: 대시보드 스토어(레벨 묶음 null 도 덮기·표식 없는 옛 저장값 버리기) · 앱 인텔(실시간 답 우선) · GexTimeline 카드(이력 대체 금지) ·
  앱 Flow(거래량 최대 행사가 대체 제거·눈금자 ±5% 숫자 표시 안 함·STRIKE 탭 배지·$-1·$0.0) · 인텔 문구(«Max Pain ($0)»·«돌파 목표 $X»)
- AI 입력: 레벨 0 = N/A · 감마플립 없으면 gamma_zone UNKNOWN · 가디언 DynamoDB 대체 레벨 비움 · 랭킹 구조 조각 없는 종목 제외 · 인텔 스냅샷 문구
- **점수(알파·레짐·가디언) 입력은 바꾸지 않았다** — 점수 작업은 범위 밖(§6)

## 4. 검증
- **시험** `tests/optionLevelGate.test.ts` 30/30 (9/28 실측값·1.2S/0.8S/±15%/±35% 경계·부동소수·없음→null·가짜 구조 표식) — 실행 명령은 파일 머리.
- **모든 문 감사** `node scripts/audit-levels-doors.js`(문 18개 × 12종목 = 161행, 운영은 공개 API, 프리뷰는 ego 세션 수집 후 `--from`):
  | 대상 | 정의 위반 | 구조 한 벌 불일치 | 레벨 통째 빈 행 |
  |---|---|---|---|
  | 운영(main, 9/28 20:0x ET) | 38 | 57 | 0 |
  | 기준 프리뷰(main 코드, 같은 인프라) | 38 | 56 | 0 |
  | 수리 프리뷰 f42f84dae · d9ec9c2e9 · 3293f75d5 | **0** | **0** | **0** |
- **실화면**(수리 프리뷰, ego 헤드리스·고지 창은 누르지 않고 숨김): 웹 /ticker MU 콜월 $1100·풋플로어(지지) $900·감마플립 $1000·맥스페인 $970(D-4·10/2 만기)
  ← 기준 프리뷰 같은 화면 $1000·$60·$530·$955 · 앱 Flow MU ko·en·ja $1100/$900/$970/$1000 ← 기준 $1000/$540 · 앱 Flow TSLA $360/$290 ← 기준 $400/$235 ·
  앱 Command MU ko·en·ja 맥스페인 $970·감마플립 $1000 · 웹 /flow MU $1100/$900/$970/$1000 · 앱 인텔 MU 타일 PUT FLOOR $900·CALL WALL $1100 · 홈 맥스페인 NVDA $220·TSLA $360.
  웹 /ticker VOL REGIME 은 화면이 감마플립 거리로 다시 계산해 MU 23 CALM → 25 COILING(가짜 플립 +98.9% → 실제 +5.4%) — 올바른 레벨의 부수 효과.
  대시보드·웹 워치리스트는 로그인 화면이라 프리뷰에서 못 봤다(로그인은 안전선 밖) → API 감사로 대신(0/0).
- **저장본 없는 종목**: CLOV·DNUT(유니버스 밖) 1차 호출 레벨 null(levelsWaitMs 6) → 90초 뒤 2차부터 구조 값(CLOV 4.5/5/4/4, 정의 안) — `after` 응답 뒤 계산 동작.
- **지연**(같은 인프라 두 프리뷰, ego 세션 안 same-origin fetch, 워밍 뒤 번갈아): 
  | 문 | 서버 중앙값 기준→수리 | 짝 차이(95% CI) | 기준−기준(A/A) | 출구 레벨 대기 |
  |---|---|---|---|---|
  | watchlist mode=price(n=60) | 196·190 → 197ms | +4 [−14,+17] | −9 [−19,+2] | p50 0 · max 1ms |
  | watchlist 전체(n=30) | 211·223 → 225ms | +14 [−3,+47] | +16 [−11,+44] | p50 0 · max 1ms |
  | portfolio mode=price(n=20) | 87·78 → 88ms | +5 [−6,+16] | −6 [−11,+1] | max 0ms |
  1차(출구에서 읽기)는 watchlist price 서버 +19ms 였다 → 요청 시작 때 읽기(prefetchLevelsForExit)로 0 에 수렴. 응답 크기 +0.1~0.9KB(라벨 3개).
  브라우저 왕복은 배포 간 잡음(A/A 에서도 +8~+56ms)이 커서 판정에 쓰지 않았다. 나머지 문(m7·dashboard·ticker·command·volatility-regime)도 짝 차이가 A/A 범위.
- **정적 검사**: tsc 새 오류 0(기존 remotion 1건) · ESLint 바뀐 파일 39개 main 과 파일별 동일(오류 32·경고 189) ·
  merge-tree: 대기 브랜치 21개 중 충돌은 ㊺(live/ticker 5곳)과 fix/fmp-et-timezone(main 과 이미 충돌, 무관)뿐.

## 5. 운영 반영 (대표 승인 — HANDOFF §3 70)
이 브랜치는 ㊲-2 를 품고 있다. 병합하면 ㊲-2 의 웹 수리도 같이 들어간다. ㊲-2 의 ② 수집 Lambda(`deploy-flow-harvest-code-only.js`)는
병합 뒤 따로 한 번(58 도 합칠 거면 58 까지 합친 뒤 한 번). ㊺(`fix/extended-pre-close-label`)와 `src/app/api/live/ticker/route.ts` 5곳 충돌 —
3곳은 ㊲-2 에서 물려받은 것·2곳은 이 수리. 나중에 합치는 쪽이 «양쪽 다 살리고» 캐시 키는 둘보다 한 단계 위(`flow:ticker:v6`·`lastgood:v5`)로.

## 6. 남은 것 (같은 종류 — 이번 변경 밖, 기록)
1. **생산자** `signum-harvest`(harvest_lambda)가 계속 가짜 플립·범위 없는 벽을 `signum-gex-history` 에 쓴다 → 이력 차트·`/api/history`·GexTimeline 적중률 통계.
   생산자 수리 = Lambda 배포(대표 승인) + 이력 연속성 결정.
2. **리포트**(`terminalEnricher`: 벽 = D+2~D+7 체인 전체 최대 OI, 핀존 = 벽 중간값) → 웹 /intel 리포트. **최신 글로벌 리포트가 9/7 생성본(3주)**이고
   7종목 중 4종목 정의 위반(GILD 콜월 148 < 150.99 · CCI 75 < 75.79 · MSFT 풋플로어 500 > 499.68 · AMZN 260 > 258.52). 생산자 수리는 powerEngine 점수·AI 서술 입력이 바뀐다.
3. 웹 /flow `FlowRadar`: API 값이 비면 화면 계산(거래량/OI 최대 행사가·자체 맥스페인)을 같은 이름으로(`FlowRadar.tsx` 1236~1315). 이 수리 뒤엔 구조가 없거나 게이트에 걸릴 때만.
4. 점수 입력: 배치·대시보드·live/ticker 의 V4.6 알파, `computeVolatilityRegime`(플립 없으면 근접 +15), 가디언 — 여전히 구조가 아닌 레벨을 쓸 수 있다.
5. quant-radar(운영자 전용)는 분석 캐시 레벨을 그대로 쓴다.
6. 캐시 수명: UC ticker 10분 · WIM lab/units 하루 · SEO /flow/[t] ISR 1시간 · 인텔 일일 스냅샷(다음 21:xx UTC) — 수명이 지나면 따라온다.
7. `cache:analysis` 는 EC2·Upstash 사본이 갈라질 수 있고, `mgetFromCache` 는 EC2 예외 한 번에 그 인스턴스 수명 동안 Upstash 로만 간다(`ecProxyAvailable=false`) — 67(Redis) 쪽.

## 7. 2026-09-30 — 판본 하나 · 정의대로 다시 고르기(가림 0) · 브랜치 `fix/levels-perfect`

대표 9/30: «못 나가게 하는 것이 아닌 완벽하게 작동하게» · «레벨도 공용 층 하나에서, 새 층을 덧대지 말고 있는 것을 하나로».
게이트(§3)는 틀린 값은 막았지만 «—» 로 가렸다. 9/30 00:16 KST 운영 전수 감사(이 검사기의 옛 판정) DEF 2 · ONE 39.

### 7-1. 메커니즘 (실측)
| 증상 | 문·종목 | 메커니즘(증거) | 고친 곳 |
|---|---|---|---|
| ONE 39 중 대부분 | 전 문 | 검사기가 기준(구조 API)을 처음에 한 번 받고 문을 2분에 걸쳐 받아, 그 사이 갱신된 판본을 불일치로 셌다(AMD 기준 11:11 판본 vs 문 11:16:34 판본) | 검사기: 문마다 앞·뒤 기준 + 판본 표식(levelsAsOf) |
| 판본 57분 | 구조 API·peek 문 | 마지막 정상본 즉시 반환 뒤 «배경 갱신»이 `after` 없는 약속 → 응답 뒤 멈춤. peek 만 하는 문은 갱신을 아예 안 걸었다(CRWD·LMT·COST `_staleSec` 3,436) | structureService: 판본 읽기 하나 + 응답 뒤 갱신(`after`)·인스턴스 간 잠금 |
| 가려짐(—) | live/ticker CRWD 감마플립 @259.2 · intel/fast ARM 콜월 @288.6 | 낡은 판본 × 움직인 현재가 → 게이트가 null | lib `displayLevels`: 넘은 필드만 같은 분포에서 표시 가격 기준 재선택(`levelsAt`) + 판본 재고정 갱신 |
| 문마다 다른 판본 | live/ticker(AAPL 355 vs 350, AMD 640 vs 642.5) | 60초 응답 캐시에 레벨이 굳음 + 인스턴스 메모리 사본(60초) | live/ticker 출구(캐시 적중 포함)에서 판본으로 덮기 · 레벨 판본은 메모리 사본 없음 |
| 1분마다 값이 오감 | AAPL 330/340 ↔ 327.5/345 등(20분 표본: 값 바뀜 45/468, 체인 null↔9/28 22회) | 프로브 작성자 둘: 옛 코드 수집 Lambda(체인 날짜 없음·가끔 하루 늦은 OI — AAPL 124,509 = Intrinio 9/25) vs 온디맨드(191,501 = 9/28) | 판본은 뒤로 가지 않는다(저장 거부) + 체인 날짜 없는 프로브는 OI 합이 같을 때만 같은 판본으로 잇는다 · 근본 = ㊲-2 Lambda 배포 |
| 저가·얇은 체인 «가려짐» | DH·GRWG·SES·FATE·AKBA·REX 맥스페인 | ±35%(정의의 일부)를 출구 게이트가 지웠다 | 계산에서 «정의상 없음»(null, debug.maxPainOutOfBand) |
| 벤더 호출 낭비 | 모든 계산 | 다음 주 만기 체인(체인 1 + 실시간 그릭스 1~3쪽 + 시세)을 받아 nextWeekOI 를 만들었지만 쓰는 곳 0 | 삭제 |

### 7-2. 수리 (공용 층 하나)
- `lib/optionLevelGate.ts`: `levelsAt(분포, 기준가)` = 정의 하나(콜월·풋플로어·감마플립). 구조 계산(S0)과 모든 문(표시 가격)이 같은 함수.
  `displayLevels`: 판본 값 그대로(같은 순간 모든 문 같은 값) → 표시 가격이 넘은 필드만 재선택(`levelsReselected`) → 안전망(`levelsDropped`, 기록).
- `structureService.ts`: 판본 키 `structure:v2:{T}`(72시간, v1+lastgood 두 벌을 하나로) · `readStoredStructures`(구조 API·모든 문 공용, mget [판본, 판본표]) ·
  낡음 = 장중 60초(벤더 직접 판본 5분)·분포 없는 옛 판본·체인 판본 뒤처짐 → 응답 뒤 갱신(`after`, 잠금 `structure:refresh:{T}`, 요청당 8) ·
  판본 없음 → 응답 뒤 계산(요청당 3) · 체인 판본은 뒤로 가지 않는다 · 옵션 없음(NO_MARKET)도 6시간 판본 · 배치 크론(structure-build)은 갱신을 걸지 않는다.
  분포 = `structure.{strikes, callsOI, putsOI, gexCum}`(gexCum 추가). 옛 저장본(structure:lastgood:{T}:auto)은 전환기에만 읽는다.
- 문: live/ticker(출구 덮기) · volatility-regime · 구조 API · dashboard · command/unified · /ticker SSR · intel 10 · intel/fast · watchlist · portfolio — 전부 같은 두 함수.
- `redisClient`: `structure:v2:` Upstash 복제는 5분에 한 번(예전 lastgood 는 계산마다).
- 검사기 `scripts/audit-levels-doors.js`: 문마다 앞·뒤 기준, 가려짐·재선택·판본·체인 날짜·정의상없음. 시험 45/45(lib ↔ 검사기 JS 사본 동일성 포함).

### 7-3. 미결제약정 기준일 (코디네이터 9/30 00:4x — 나스닥 대비 OI 53~89%)
행사가 수는 나스닥·OCC 와 같다(MU 335/335 …) — 잘림·만기 누락 아님. **OI 기준일**이다(미리보기 진단 `?diag=raw`, 9/30 01:4x KST):
Intrinio EOD 레코드 D 의 OI = D 아침 공표분. 장중 최신 레코드는 전일(9/28) → OCC·나스닥(오늘 아침 공표)보다 한 번 늦다(85~89%).
MU 는 Intrinio 9/28 레코드가 없어(eod?date=9/28 → 0행) 9/25 → 두 번 늦었다(53%, 그날 늦게 9/28 들어옴). 실시간 체인(`options/chain/…/realtime`)·
실시간 시세(`options/prices/by_ticker/…/realtime`)·`eod?date=오늘` 은 403. OCC 공개 시리즈(marketdata.theocc.com series-search) = 나스닥과 정확히 같다(MU 10/02 309,917).
전체 체인(OCC)으로 다시 계산한 레벨이 우리와 다른 곳: MU 맥스페인 970→1000·풋플로어 900→1000, AAPL 335→337.5·콜월 345→342.5·풋플로어 327.5→330,
AMD 577.5→582.5, MSFT 500→505, IWM 콜월 290→300, ORCL 143→140·콜월 160→155, NVDA 222.5→225, TSLA 365→362.5.
원천 수리 선택지(대표 결정): OI 를 OCC 공개 시리즈(매일 아침)로 결합(약관 확인 필요) · Intrinio 상위 상품 · 전일 OI 임을 화면에 밝힘.

### 7-4. 검증 (정규장 9/29 15:13~15:28 ET, 수리 프리뷰 f07e6a8 — 전체 출력은 세션 scratchpad `levels-audit/`)
| 대상·시각(KST) | DEF | ONE | 가려짐 | 재선택(실제 돌파) | 판본다름 | 레벨전무 | 정의상없음 | 체인 날짜 ≠ 9/28 |
|---|---|---|---|---|---|---|---|---|
| 운영(옛 코드) 00:16 · 옛 감사 | 2 | 39 | (칸 없음) | — | — | 0 | — | — |
| 운영(옛 코드) 02:02 · 새 감사 | 0 | 3 | 2 | 0 | — | 0 | — | 24 |
| 운영(옛 코드) 04:29 · 새 감사 | 0 | 1 | 1 | 0 | — | 0 | 0 | 11 |
| 수리 f07e6a8 04:13 | 0 | 0 | 0 | 0 | 0/149 | 0 | 0 | 0/64 |
| 수리 f07e6a8 04:19 | 0 | 0 | 0 | 3 | 0/149 | 0 | 0 | 0/64 |
| 수리 f07e6a8 04:25 | 0 | 0 | 0 | 0 | 0/149 | 0 | 0 | 0/64 |
| 수리 112a346(최종) 04:46 | 0 | 0 | 0 | 0 | 0/149 | 0 | 0 | 0/64 |
중간 배포에서 잡은 것(고침): IONQ·HOOD «옵션 없음» 고착(벤더 빈 체인이 정상 판본을 덮음 → 182fa87) · ARM 콜월을 정규장에 남은 프리마켓 가격으로 고름(f07e6a8).
- 유니버스(2,001) 밖 옵션 상장 30종목(OCC 로 상장 확인): 10초 폴링 30/30 이 100초 안에 레벨(요청당 3종목 계산) · DEF 0 · 체인 30/30 9/28 ·
  «정의상 없음» 칸은 저가·얇은 체인(행사가 간격 > 20% 범위: BLNK 0.55·DH 0.91 …)뿐.
- 실화면(ego, 프리뷰): 앱 Command MU(ko) 맥스페인 $1000·감마플립 $1075 · 앱 Flow MU(en) 풋플로어 $1000·콜월 $1100·맥스페인 $1000·감마플립 $1075 ·
  앱 Command AMD(ja) $578·$642.50 · 웹 /ticker AAPL(ko) 콜월 $340·풋플로어 $330·맥스페인 $335 — 같은 순간 구조 API 판본과 전부 같다.
- 지연(같은 인프라 두 프리뷰, 기준 = main 같은 코드): watchlist 가격 서버 p50 197·206 → 197ms(짝 차이 0 [−9,10], A/A 6), p95 324·326 → 347 ·
  8종목 213·207 → 191(−14 [−25,−4]) · portfolio 80·85 → 80 · 블록 왕복: 구조 API MU 250 → 250 · command 443 → 433 · dashboard 243 → 250(+10 [−3,15], A/A −3) ·
  live/ticker 는 판본 읽기를 따로 걸어 +6 [1,9] 였다 → 응답 캐시와 한 번의 mget(112a346) 뒤 MU 243 → 236(−2 [−6,24], A/A −1)·NVDA 244 → 241 ·
  dashboard 239 → 234(−2 [−14,2]). 출구 레벨 대기 p50 0ms.
- 같은 종목의 레벨이 몇 분 사이 오가던 것(위젯 관찰 AAPL 330–340 ↔ 327.5–345 …): 수리 프리뷰 4회(35분) AAPL 330–340·맥스페인 335 · NVDA 200–235·222.5 ·
  TSLA 290–390·365 고정. 감마플립만 실시간 그릭스로 움직인다(AAPL 300~320 — 정의상 부호 교차점 중 현재가에 가장 가까운 것).

### 7-5. 운영 반영 순서·위험
1. 병합(Vercel) — 새 키 `structure:v2:*` 는 처음엔 비어 있어 옛 저장본(structure:lastgood)을 읽고 응답 뒤 갱신으로 채운다(장중 종목당 1분 안).
   충돌: `fix/structure-completeness-guards`(58) 3파일·`fix/extended-pre-close-label`(㊺) live/ticker — 나중에 합치는 쪽이 수동 해결. 워치리스트·위젯·Redis 브랜치와는 0.
2. 수집 Lambda(㊲-2 ②, `deploy-flow-harvest-code-only.js`) — 체인 날짜 없는·하루 늦은 프로브(옛 코드)가 사라진다. 이 브랜치의 «판본 되돌림 방지·OI 합 추정»은
   그때까지 Vercel 쪽에서 막는 장치다.
3. 미결제약정 기준일(§7-3): 원천 선택 — 대표 결정.
4. 미리보기 전용 진단(`/api/live/options/structure?diag=vintage|raw`, 운영 꺼짐)은 OI 기준일 증명(오늘 밤 Intrinio 9/29 공표 뒤 OCC 현재 파일과 대조) 뒤 지워도 된다.

### 7-6. 합치기 순서표 (대표 승인 뒤 — 통합 브랜치 `integ/levels-58-45` 에 충돌 해결본이 있다)
통합 브랜치 = `fix/levels-perfect`(5dfb525) + 58(`3fd440fbb` 에서 해결: structureService 성공 응답·intrinioClient 페이지 함수에 날짜 인자·구조 라우트 import)
+ ㊺(`bdac3a972` 에서 해결: live/ticker 4곳 — 양쪽 다 살리고 캐시 키 `flow:ticker:v6`·`lastgood:v5`). 시험 8파일 전부 통과 · tsc 새 오류 0.
단계마다 «운영 배포 확인 → 검사 → 다음 단계». 각 단계는 앞 단계의 자손 커밋을 합치므로 새 충돌은 main 의 기록 커밋뿐이다(HANDOFF 는 main 쪽을 남긴다).

| 단계 | 명령(한 줄) | 확인 | 되돌리기 |
|---|---|---|---|
| ① 레벨 판본 | `git -C /tmp/stock2-main-merge fetch -q origin && git -C /tmp/stock2-main-merge reset -q --hard origin/main && git -C /tmp/stock2-main-merge merge -q --no-ff origin/fix/levels-perfect -m "merge: 옵션 레벨 판본 하나·정의대로 다시 고르기(대표 승인)" && git -C /tmp/stock2-main-merge push -q origin HEAD:main` | 배포 뒤 `curl -s 'https://www.signumhq.com/api/live/options/structure?t=NVDA'` 에 `levelsAsOf`·`structure.gexCum` 이 있으면 새 코드 · 2분 뒤 `node scripts/audit-levels-doors.js --save /tmp/lv-prod-1` 합계 DEF 0·ONE 0·가려짐 0·레벨전무 0 · `node scripts/audit-expiration-selection.js --live` 341/0 | Vercel 배포 목록에서 직전 운영 배포 «Instant Rollback»(초 단위) 또는 `git revert -m 1 <병합 SHA>` 푸시. 새 키 `structure:v2:*` 는 옛 코드가 읽지 않아 지울 것 없음 |
| ② 58 완결성 | 같은 한 줄에서 병합 대상만 `3fd440fbb`(메시지 «merge: 58 옵션 체인 완결성 가드(통합 해결본, 대표 승인)») | `curl -s '…/api/live/options/structure?t=SPY&exp=2026-10-23'` 의 expiration 이 10-23·`partial`·`contractsFetched` 있음 · `node scripts/audit-expiration-selection.js --live` 341/0 · `node scripts/audit-structure-vs-nasdaq.js`(실패는 OI 기준일 차이만) · 레벨 감사 다시 0 | ①과 같음(①의 배포로 되돌림) |
| ③ ㊺ 시간외 | 같은 한 줄에서 병합 대상만 `bdac3a972`(메시지 «merge: ㊺ 시간외 PRE/POST(통합 해결본, 대표 승인)») | `npx tsx scripts/test-extended-session-close.ts` 45/0 · `node scripts/audit-screen-numbers.js`(⑦ 시간외) · 캐시 키 v6 라 첫 몇 분 live/ticker 가 새로 계산 — 응답 시간 확인 · 레벨 감사 다시 0 | ②의 배포로 되돌림 |
| ④ ㊲-2 수집 Lambda | 배포 전 현재 코드 받아 두기: `aws lambda get-function --function-name signum-flow-harvest --query Code.Location --output text \| xargs curl -s -o /tmp/flow-harvest-before.zip` → `git -C ~/.gemini/antigravity/scratch/stock2 pull -q --ff-only && (cd ~/.gemini/antigravity/scratch/stock2 && node scripts/deploy-flow-harvest-code-only.js)` | 20분 뒤 프로브에 `chainDate` 가 실린다(미리보기 `?diag=vintage` 의 probe.chainDate, 운영 구조 API `debug.probeSource`) · `node scripts/audit-options-levels.js` · 레벨 감사의 «체인 날짜 다른 종목 0» | `aws lambda update-function-code --function-name signum-flow-harvest --zip-file fileb:///tmp/flow-harvest-before.zip` (스크립트는 버전을 발행하지 않는다 — 받아 둔 zip 이 유일한 되돌림) |

①~③을 한 번에 하려면 통합 브랜치 끝(`origin/integ/levels-58-45`)을 한 번 합치면 된다 — 대신 단계별 확인이 한 번으로 줄어든다(권장하지 않음).
