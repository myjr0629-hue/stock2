# 지표 × 세션 정책 × 앱/웹 경로 매트릭스

> 정본. 2026-08-29 Massive→Intrinio 이관 검증 중, 대표 지적
> «본장중에만 하는 것인지 모든 시간에 하는 것인지 지표에 따라 다른지 면밀하게 보라»
> 에 답하기 위해 **코드에서 직접** 뽑았다. 추정 아님 — 각 항목에 근거 파일:라인을 단다.

세션 정의(전 엔진 공통, ET):
`PRE 04:00–09:30` · `REG 09:30–16:00` · `POST 16:00–20:00` · 그 외/주말 `CLOSED`
정본 구현: `rlsiEngine.getMarketSession()` · `breadthEngine.marketSession()`(순환 import 회피용 동일 복제)

---

## 1. 세션 정책 요약

| 지표 | PRE | REG | POST | CLOSED | 근거 |
|---|---|---|---|---|---|
| **Market Breadth (A/D)** | 중립 | 실시간 | **직전 정규장 값 유지** | 중립 | `breadthEngine.ts` + `MarketBreadthPanel.tsx:235` |
| **RLSI** | 전 세션 계산 | 〃 | 〃 | 〃 | `rlsiEngine.ts:466` |
| ├ priceAction/momentum | 프리마켓 ETF | 라이브 | 라이브 | 프리마켓 ETF | `rlsiEngine.ts:474` |
| └ 그 외 컴포넌트 | 전 세션 동일 | 〃 | 〃 | 〃 | `rlsiEngine.ts:487` «Universal data fetching» |
| **RVOL** | **측정 안 함** | 측정 | **측정 안 함** | 측정 안 함 | `rvolEngine.ts:52` |
| **섹터 로테이션** | 라이브 | 라이브 | 라이브 | **직전 정규장 값 유지** | `sectorEngine.ts:610-624` |
| **Gamma Shield (GEX)** | 전 세션 동일(캐시) | 〃 | 〃 | 〃 | `gammaShieldEngine.ts:245` — 세션 분기 없음 |
| **개별 시세** | PRE 표시 | 라이브 | POST 표시 | 정규장 종가 | `intrinioClient.getTickerSnapshot()` |

### 왜 지표마다 다른가 (성격 판단)

- **A/D Breadth 는 정규장 누적 지표다.** 상승/하락 종목 수는 개장 후에 쌓인다.
  시간외에 다시 재면 안 되는 실증 근거: 2026-08-29 시간외 실측에서
  13,064종목 중 **스프레드 1% 이내는 1,212종목뿐**(>20% 가 5,002종목).
  유동성 있는 종목만 남은 편향 표본이 나온다. → POST 는 **정규장 마감 판독값을 보존**해 서빙.
- **섹터 로테이션은 ETF 기반**이라 시간외에도 실제 거래가 있어 라이브가 유효하다.
  다만 CLOSED(주말·야간)에는 전 종목 변화율이 0% 로 붕괴하므로 직전 세션 값을 유지한다.
  ⚠️ PRE 는 의도적으로 제외 — 프리마켓 등락은 실데이터라 덮으면 안 된다(`sectorEngine.ts:612`).
- **RVOL 은 «당일 누적 거래량 ÷ 동시각 20일 평균»** 이라 정규장 밖에서는 정의 자체가 없다.
  → 0 이 아니라 **부재(undefined)** 로 전달해야 한다. 0 을 넘기면 AI 가
  «거래량 0.00x 저조» 라는 사실 주장으로 바꿔 쓴다(2026-08-29 실제 발생).
- **GEX 는 옵션 미결제약정 기반**이라 세션 무관하게 유효하다.

---

## 2. 앱 / 웹 경로 대조

원칙: **같은 지표는 같은 계산을 통과해야 한다.** 앱이 다시 계산하면 두 화면이 갈린다.

| 지표 | 웹 경로 | 앱 경로 | 동일? |
|---|---|---|---|
| Market Breadth | `GuardianDesktop.tsx:513` → `MarketBreadthPanel` | `MobileGuardianOverview.tsx:191` → **동일 컴포넌트** | ✅ (차이는 `appCompact` 스타일뿐) |
| RLSI / GravityGauge | `GuardianDesktop.tsx:443` `session={data.rlsi.session}` | `MobileGuardianOverview.tsx:149` **동일** | ✅ |
| 세션 정규화 | `getEffectiveSession(rawSession)` | ~~원본 그대로~~ → **2026-08-29 수정, 동일화** | ✅ (수정 후) |
| Intel 시세 | `useIntelSharedData` (REST) | `useIntelSharedDataForApp` (REST + WS 오버레이) | ✅ WS 를 **같은 `computeOnePipe` 로 통과**시켜 세션 분기 공유 |
| 개별 종목 시세 | REST | REST + WS | ✅ 동일 파이프 |

### 발견·수정한 불일치 (2026-08-29)
`MobileGuardianOverview` **만** `getEffectiveSession()` 을 거치지 않고 원본 세션을
`MarketBreadthPanel` 에 넘기고 있었다. 형제 컴포넌트(`MobileGuardianFlow`,
`MobileGuardianShield`)와 웹은 모두 정규화를 거친다.

**증상**: API 가 `CLOSED` 를 주는데 실제로는 정규장인 경우(marketStatus 지연 등)
웹은 실시간 breadth 를 보여주는데 **앱만 비실시간**이 된다.
같은 파일 안에서도 `isMarketActive`(내부 정규화됨)=true 인데 `session`=CLOSED 라
**자기모순** 상태가 된다.

---

## 3. 데이터 출처

| 값 | 출처 | 비고 |
|---|---|---|
| 개별 시세 / 일봉 / 분봉 | **Intrinio** | `securities/{t}/prices/realtime`, `prices/intervals` |
| 전 종목 EOD (breadth·movers·grouped) | **Intrinio 벌크** → EC2 → ElastiCache | `intrinio:eod:snapshot`, EC2 cron 3h |
| 전 종목 현재 호가 | **Intrinio 스냅샷 CSV** | Startup 플랜은 **체결 없이 NBBO 호가만** → 미드 사용(스프레드 ≤1% 게이트) |
| 옵션 체인 | **Intrinio** | `options/chain/{t}/{exp}/eod` |
| 실시간 틱 | **Intrinio WS** (`EQUITIES_EDGE`) | EC2 `price-ws` |
| 지수·선물·VIX·DXY·금리 | **Yahoo** | `market.factors.*.feedSource = YAHOO` |
| 금리 매크로 | **FRED** | `fedApiClient` |
| CNN Fear&Greed | CNN | `fetchFearGreedIndex` |
| 뉴스 | **Massive (2026-09-23 해지까지)** | 유일하게 남긴 Massive 경로 |

---

## 4. 알려진 잔여 사항

- 벌크 EOD 데이터셋 이름이 `US Stock Prices, 6 months (trial)` → 스타트업 플랜 정식
  항목인지 **영업 확인 필요**. 끊기면 breadth·movers 가 다시 죽는다.
- 벌크 EOD 는 **T+1 게시**. 장 마감 직후 몇 시간은 아직 전일 자료다.
  그 구간에서 breadth 는 «직전 정규장 판독값»(`guardian:breadth:lastreg`)으로 덮인다.
- `src/services/*` 의 `source: "MASSIVE"` 문자열은 **내부 출처 라벨**이라 화면에 안 나온다.
  (사용자에게 보이던 `DATA STREAM: MASSIVE API` 등 2곳은 2026-08-29 제거)
- `getStockChartData` 의 range 매핑은 미인식 값을 **조용히 5년**으로 떨어뜨린다.
  현재 클라이언트는 `1d/1w/1m/3m/1y` 만 보내므로 실사용 문제는 없으나,
  새 range 를 추가할 때 매핑을 같이 넣지 않으면 조용히 5년치가 나간다.
