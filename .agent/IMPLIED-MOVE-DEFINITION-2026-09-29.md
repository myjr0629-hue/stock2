# 예상 변동(Implied Move) 정의 한 벌 — 벽 사이 폭과 분리 (2026-09-29)

브랜치 `fix/implied-move-definition` · 정의 = `src/lib/impliedMove.ts` · 시험 `tests/impliedMove.test.ts`(17/17)

## 1. 무엇이 틀렸나 (실측)

9/28 MU «옵션 ±9.0%» — 같은 시각 10/2 만기 ATM 1055 스트래들 중간값 41.50 + 41.925 = $83.42 ÷ $1,053.98 = **±7.9%**.
같은 이름 `impliedMovePct` 에 정의가 넷 섞여 있었다:

| 생산자 | 계산 | 화면에 나간 모양 |
|---|---|---|
| watchlist·portfolio 배치 전체 계산 | (콜월 − 풋플로어) ÷ 가격 — **벽 사이 폭**(가격 범위 없는 최대 OI 벽) | 인텔 m7 AMZN «±8.1%»(8.121167823933082 — 반올림도 안 된 벽 폭) |
| 배치 AWS 채움·intel/fast 폴백 | 수집 Lambda(DynamoDB gex 이력): 다리마다 따로 고른 최근접 행사가의 **전일 종가**(day.close) 합 | MU 9.0(= 1055 콜 62.5 + 풋 32.5), 워치리스트·인텔 대부분 |
| alphaEngine.computeImpliedMovePct(live/ticker 알파 입력) | ±2% 창의 «첫» 콜·풋(다른 행사가·만기 가능) + 체결가 없으면 전일 종가 | MU 8.7 · NVDA 4.7 |
| dashboard/unified·FlowRadar | 다리마다 최근접 행사가 · last_trade 또는 전일 종가 | MU 9.0 |
| terminalEnricher(리포트) | (콜월 − 풋플로어) ÷ 두 벽 중간값 | 앱 인텔 리포트 카드 대체값 |
| FlowRadar → Flow AI 프롬프트 | **IV 백분위 × 0.1** (지어낸 값) | `<implied_move value="±3.0%">` |

## 2. 정의 (한 곳)

- `impliedMovePct` = (ATM 콜 중간값 + ATM 풋 중간값) ÷ 현물 × 100
  - 만기: 가장 가까운 만기(구조 한 벌 = 주간 만기) 또는 지정 만기(실적 뒤 첫 만기: amc·unknown 은 다음 만기, bmo·dmh 는 당일 만기부터)
  - 행사가: 현물에 가장 가까운 **하나**(두 다리 같은 행사가, 5% 안, 값이 없으면 다음 행사가)
  - 가격: 실시간 FMV 중간값(`_rtGreeks` 계약 midpoint ≠ EOD mark, 또는 체인 greeksSource=realtime) → basis `live`
    없으면 EOD mark·종가 호가 중간값 → basis `eod`. `day.close` 는 쓰지 않는다.
  - 표식 `impliedMoveDef = 'atm-straddle-mid/1'` + `impliedMoveExpiry` · `impliedMoveBasis` · `impliedMoveAsOf`
  - 화면으로 나가는 필드는 **실시간 값만**(EOD 는 싣지 않는다). 알파 입력은 기준과 무관하게 스트래들 값.
- `wallRangePct` = (콜월 − 풋플로어) ÷ 현물 × 100 — 예상 변동이 아니다. «±»·«implied/expected move» 금지.
  배치는 **모든 덮어쓰기(레벨 한 벌 출구 포함)가 끝난 뒤** 나가는 벽으로 찍는다(`stampOptionMoveFields`).
- 표식 없는 옛 값은 `analysisCache` 읽기 입구·배치 출구·스토어·앱 인텔 리포트 대체에서 버린다.

## 3. 소비처 전수 (file:line — 브랜치 기준)

**생산(고침)**
- `src/lib/impliedMove.ts` — 정의·필드·출구 도장(신규)
- `src/services/alphaEngine.ts:1818-1833` computeImpliedMovePct → 위 정의 위임(숫자 API 유지, 알림 제공자 모양 호환)
- `src/services/structureService.ts:428` 체인 호가 기준·시각 · `:966-977` 계산 · `:1009-1011` impliedMove·wallRangePct 싣기
- `src/services/watchlistBatchService.ts:258-267` 출구 도장 · `:502·630` 캐시 적중 · `:567` 알파 입력 · `:696-719` DynamoDB 경로(저장된 구조 사본 읽기만, 1초 상한) · `:941-956` 전체 계산 · `:1107·1139` 화면·분석 캐시 · `:1180-1187` 알파 이력(DynamoDB) 표식 · `:1270·1318` AWS 채움 제거
- `src/services/portfolioBatchService.ts:89-97` 출구 도장 · `:211` · `:337-344` · `:403` · `:440-443`
- `src/services/terminalEnricher.ts:612-617·679-680` — 가격 없는 체인 → 예상 변동 null, 벽 폭은 wallRangePct(기준 현물)
- `src/services/impliedMoveService.ts` — 저장된 구조 사본 읽기(`peekStoredStructure`)·전환기(구조 사본에 필드가 없을 때) 수집기 체인 읽기 — 둘 다 읽기 전용
- `src/app/api/dashboard/unified/route.ts:1329-1345` 계산 · `:384` 출력 · `:824` 캐시 경로 · `:427·483` 알파 입력 · `:542-543` 신호
- `src/app/api/live/ticker/route.ts:96-138` 슬림 체인 ATM ±10% 계약에 실시간 표식 · `:1074` 알파 입력(새 정의)
- `src/app/api/intel/fast/route.ts:487-490` 표식 값만 · `:509-510` AWS(Lambda) 채움 제거 · `:552`
- `src/components/FlowRadar.tsx:1029-1064` 타일 · `:1874-1877` AI 페이로드(지어낸 값 제거) · `:3313` 전일 라벨
- `src/app/api/options/implied-move/route.ts` — 읽기 전용 `{impliedMovePct, expiry, asOf}`(신규)

**소비(라벨·프롬프트·화면)**
- `src/app/api/intel/perplexity-analysis/route.ts:62` 프롬프트 라벨 «ImpliedMove(ATM straddle to nearest weekly expiry)» · 0 → N/A · `:136-139` 정의 규칙(벽 폭을 예상 변동으로 쓰지 말 것)
- `src/app/api/flow/ai-analysis/route.ts:203` `<implied_move definition=…>`
- `src/app/[locale]/app-view/intel/page.tsx:843` 리포트 대체값은 표식 있는 값만 · `:424·504` 병합 · `:1396-1415` AI 문장 · `:5227` IMP MOVE 타일(값이 바로잡힘)
- `src/components/intel/SectorSessionGrid.tsx:249·552·846-849` · `src/components/intel/mobile/MobileTickerDetail.tsx:146·309-312` — 값이 바로잡힘(코드 변경 없음)
- `src/app/[locale]/dashboard/DashboardClient.tsx:1616` · `src/components/mobile/MobileMetricsTab.tsx:105` · `src/stores/dashboardStore.ts:349·478`(null 도 덮기 — localStorage 옛 값 차단)
- `src/services/alphaEngine.ts:981-990` 촉매 기둥 예상 변동 항 · `src/services/powerEngine.ts:419`(리포트 입력 = null)
- `src/hooks/useIntelSharedData.ts:616·676` · `src/app/api/cron/signum-warm/route.ts:207`(IMP MOVE 충족률 감시) — 변경 없음
- 문구: `src/messages/{ko,en,ja}.json` dashboardGuide.impliedMove.desc · flowGuide.impliedMove.desc · dashboard.tipImpliedMove · gate.descImpliedMove/fomoImpliedMove/fomoDashImpliedMove · (en·ja) dashboardGuide.cards.impliedMove.meaning — «1σ(67~68%)» 오기 → 스트래들 ≈ 0.8σ(≈58%), «월간 전망» 삭제 · `src/components/ui/CardTooltip.tsx` IMPLIED_MOVE · `src/components/app/metricGlossary.ts:206`

**손대지 않음(이유)**
- `src/app/[locale]/app-view/flow/page.tsx:1527-1528` — 쓰이지 않는 변수(impliedMoveStr), 두 대기 브랜치가 같은 줄을 고침
- `harvest_lambda/index.js:240-313` — Lambda 의 DynamoDB impliedMovePct(다리별 최근접·전일 종가). 웹은 이제 읽지 않는다. 고치려면 Lambda 배포(대표 승인) 필요
- `src/app/[locale]/wim/page.tsx:312·973`(개념 키) · `MobileCommandPage.tsx:146`(자리표시 0)

## 4. 전후 (운영 실측 9/29 01:1x~01:3x ET = 9/28 종가, 주간 만기 10/2)

| 종목 | 현물 | 수리 전 화면 | 수리 전 출처 | 벽 사이 폭(구조 벽) | 수리 후 (행사가 · 기준) |
|---|---|---|---|---|---|
| MU | 1,053.98 | ±9.0 | Lambda 전일 종가 합 | 19.0% (1100/900) | **±7.9%** (1055 · 실시간 41.50+41.925) |
| NVDA | 228.86 | ±2.5 | Lambda | 21.8% (250/200) | **±2.9%** (230) |
| TSLA | 357.45 | ±4.8 | Lambda | 19.6% (360/290) | **±3.8%** (357.5) |
| AMD | 607.87 | ±5.3 | Lambda | 32.9% (700/500) | **±4.6%** (607.5) |
| AMZN | 246.15 | ±8.1(인텔 m7) | 배치 벽 사이 폭 | 8.1% (260/240) | **±2.7%** (245) |
| META | 715.62 | ±5.9 | Lambda | 14.0% (800/700) | **±3.9%** (715) |
| AAPL | 338.40 | ±2.0 | Lambda | 5.2% | **±2.1%** (337.5) |
| SPY | 765.61 | ±1.1 | Lambda | 4.6% | **±1.2%** (766) |

«수리 후»는 운영 `/api/live/ticker` 의 주간 체인(greeks REALTIME)에 브랜치 함수를 그대로 적용한 값(스크립트 계산).
알파(V4.6) 촉매 기둥의 예상 변동 항(0~4점) 입력이 바뀐다 — 표시 점수는 XS 가 덮는 종목(MU·NVDA·TSLA·AAPL·AMD) 불변, V8 점수 종목(SPY 등)은 최대 ±1~3점.

## 5. 비용·부작용

- 벤더 호출 0 추가 · 새 Redis 키 0 · Upstash 쓰기 0 추가(구조 사본에 ~250B 필드, 슬림 체인 ATM ±10% 계약에 표식 ~1.4KB).
- 배치 DynamoDB 경로: 저장된 구조 사본 읽기(EC2 mget 2키 — 계산·배경 갱신·쓰기 없음, `peekStoredStructure`) 병행, 1초 상한. AWS 보충 판정에서 예상 변동을 빼 DynamoDB 헛읽기는 줄어든다.
- 전환기: 수리 전 구조 사본(장외 72시간)에는 필드가 없다 → 같은 체인(수집기 캐시)을 읽기만 해서 채운다(인스턴스 메모 60초).
- 새 문 `/api/options/implied-move`: EC2 mget 1~2회, CDN 60초, 쓰기 0.

## 6. 합칠 때

- 대기 브랜치 21개와 시험 병합(`git merge-tree`) 충돌 0(maxpain-chain-vintage·dash-yield-change-units 의 충돌은 main 과도 나는 기존 충돌).
- 레벨 한 벌(72)과 순서 무관 — 합치면 wallRangePct 는 레벨 덮기 «뒤»의 벽으로 찍힌다.
- 알림(feat/watchlist-alerts)의 `realtimeImpliedMove(…, computeImpliedMovePct)` 는 새 정의로 계산된다(모양 호환 시험 포함).
- 합친 뒤 확인: 인텔 m7 AMZN IMP MOVE ±2~3%대(벽 폭 8.1 아님) · 워치리스트 MU ±7.9 근처 · 대시보드 Implied Move · FlowRadar AI 프롬프트.

## 7. 10/4 보류 해제 — 장외 «세션 꼬리표» · IV 랭크 반복 행 · 이름 분리 (브랜치 `fix/options-defs-unify`)

**74 보류 사유**: 화면 필드가 실시간 값만 실어 장외·주말엔 IMP MOVE 가 전부 «—»(대표 9/30 «가림 0»과 충돌).
**해결**: `impliedMoveFields` 가 EOD 값도 싣고 `impliedMoveSession`(= EOD 체인 날짜)을 함께 싣는다. 화면은
`impliedMoveSessionNote` 로 «10/2 종가 / 10/2 close / 10/2終値»를 붙인다. 장중 실시간 값은 꼬리표 없음, 장 끝난 뒤까지
남은 실시간 값(구조 사본 72시간)은 «10/2 장중». `liveOnly` 는 «지금 값»만 받아야 하는 소비처(알림) 전용.
꼬리표가 붙는 문: 웹 대시보드·모바일 카드 · 웹 인텔(섹터 그리드·모바일 상세) · FlowRadar(«전일 호가» → 체인 날짜) · 앱 인텔 타일·AI 문장.
앱 인텔 스냅샷 행(`data.snapshot.tickers[].implied_move_pct`)도 표식 없는 옛 값은 버린다.

**IV 랭크(src/lib/ivRank.ts)**
- 실측(10/4 DynamoDB signum-gex-history 15종목 200행): 수집 Lambda 의 atmIv 는 «항상 EOD 체인»(options/chain/…/eod)·가장
  가까운 만기 ATM. 장중 행 = 전 세션 EOD IV(현물이 움직여 ATM 행사가만 바뀜 — 하루 고유값 1~15개), 16:47 ET 부터 당일 EOD,
  금요일 만기 뒤엔 다음 주 만기 IV 가 토·일·월 새벽까지 반복(창의 30~40%).
- 정의 쪽: 창 안 «같은 세션(shownRegularSessionDate) · 같은 값»은 표본 하나. 마지막 행이 4일보다 오래된 창은 stale(미제공) —
  DIA 는 8/28 에 수집이 멈춘 이력으로 «95%»가 나가고 있었다.
- ⚠ «0%»(SPY·IWM·NVDA·MSFT·MU·AMZN)는 중복 때문이 아니다: 현재값(금 마감 체인의 다음 주 만기 ATM IV)이 창의 최솟값이라
  중복을 지워도 0%다(만기 점프 = 정의의 성질). 고치려면 «고정 만기» IV 시계열이 필요하다 — 수집이 종목당 6만기만 받아
  일일 만기 ETF(SPY·QQQ·IWM)는 30일에 못 닿고(벤더 호출 증가), 바꾸면 창 7일이 두 정의로 섞인다 → 이번엔 Lambda 무변경.
- 랭킹 volatility-bet 의 «세션 단위 백분위»는 다른 지표 → `ivSessionPct`·«IV 세션 백분위»로 이름 분리, 세션 열쇠도 정규장 기준(sessionValues).
- 웹 대시보드·모바일 «IV Rank» 카드(ATM IV × 1.5)는 폐기 → /api/flow/iv-percentile(ivRank.ts) 값.
