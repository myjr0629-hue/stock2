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
