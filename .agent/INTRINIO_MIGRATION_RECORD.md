# Massive → Intrinio 이관 정본 기록

> 정본. 이관에 관해 하나만 읽어야 한다면 이 문서다.
> 상세 작업 로그는 `INTRINIO_MIGRATION_WORKLOG.md`(40KB), 벤더 판단 근거는
> `INTRINIO_MIGRATION.md` · `NEWS_VENDOR_DECISION.md` · `DARKPOOL_REPLACEMENT.md`.
>
> 기간 2026-08-28 ~ 2026-08-30 · 커밋 97건(마케팅 제외)
> 최종 갱신 2026-08-30

---

## 0. 한 줄 결론

**시세·옵션·뉴스 등 「매일 쓰는 것」은 이관 완료. 다만 아직 Massive 를 타는
경로가 18곳(10종) 남아 있고, 이것은 계정 해지일 2026-09-23 에 죽는다.**

---

## 1. 왜 이관했나

2026-08-28, massive.com 계정이 약관 위반으로 시세 권한을 잃었다(snapshot 403).
같은 키로 aggregates 는 200 이 나와서 **코드 문제로 오진하기 쉬웠다** —
「403 이 $0.00 으로 위장돼 보인다」가 이 사건의 지문이다.

대안 검토 결과 **Intrinio Startup $333/월** 채택:

| 후보 | 결과 |
|---|---|
| Databento | 탈락 — 파생지표까지 「재배포」로 봄 · $2,550/월 |
| **Intrinio Startup** | **채택** — Display+Commercial 명시, 맥스페인 실측이 Databento 와 완전일치, 비용 1/8 |

> 벤더 선택 기준 두 개: ① 파생지표를 재배포로 보는가 ② Display 가 어느 티어인가.

부수 효과로 **약관 걱정 없이 상업적으로 쓸 수 있게 됐다** — 대표가 가장 크게
평가한 부분이고, 앱 사업화의 전제가 해소됐다.

---

## 2. 이관 완료 상태 (2026-08-30 실측)

### 2-1. 완료 — Intrinio / FMP 로 나감

`fetchMassive()` 호출 83건 중 **65건(22종)** 이 라우터에서 Intrinio·FMP 로 전환된다.

| 계열 | 이동처 | 비고 |
|---|---|---|
| 실시간 스냅샷 · 일괄 스냅샷 | Intrinio realtime | 세션 분리 재설계(§4-1) |
| 일봉·분봉 집계 | Intrinio prices | 1D 차트 복구 |
| 옵션 체인 · 계약 스냅샷 | Intrinio options | GEX·맥스페인·월/플로어 |
| 기술지표(RSI/SMA/MACD) | Intrinio technicals | + ATR/ADX/OBV/BB 신규 |
| 뉴스 | **FMP** | Intrinio 가 아니라 FMP. 실측 비교로 결정 |
| 배당 · 분할 | Intrinio prices/adjustments | **죽어 있던 배당 기능 복구** |
| 시장 상태 | Intrinio | |
| 내부자 거래 · 13F | Intrinio | 다크풀 대체 지표의 재료 |
| 실시간 WebSocket | Intrinio WS (EC2 price-ws) | |

### 2-2. ⚠️ 미완료 — 아직 Massive 를 탄다 (2026-09-23 절벽)

라우터가 안 잡는 **10종 / 18곳**. 오늘 전부 HTTP 200 이라 **화면상 아무 이상이
없고, 그래서 안 보인다.** 해지일에 동시에 죽는다.

| 엔드포인트 | 쓰는 곳 | 화면 | Intrinio 대체 (실측) |
|---|---|---|---|
| `/fed/v1/treasury-yields` | `live/treasury`, `fedApiClient` | 가디언 매크로 · UC 시장맥락 | ✅ `$DGS10/$DGS2/$DGS30` → **4.67 확인** |
| `/fed/v1/inflation`, `/inflation-expectations` | `fedApiClient` | 매크로 레짐 | ✅ `$CPIAUCSL` → **332.813 확인** |
| `/stocks/financials/v1/ratios` · `/income-statements` | `live/fundamentals` | 펀더멘털 카드 | ✅ `/companies/{t}/fundamentals` |
| `/stocks/filings/8-K/vX/disclosures` | `disclosures.ts` ×2 | 공시 알림 | ✅ `/companies/{t}/filings?report_type=8-K` |
| `/stocks/filings/vX/risk-factors` | `live/risk-factors` | 리스크 카드 | ⚠️ 원문 텍스트는 확인 필요 |
| `/v3/reference/tickers/{t}` | `live/overview`, UC 로고 | 회사 개요·로고 | ✅ `/companies/{t}` |
| `/v2/aggs/grouped/...` | `market/movers`, `sectorEngine` | 무버스·섹터 | ✅ 이미 있는 벌크 EOD 로더 재사용 |
| `/v3/snapshot?ticker.any_of=` | `macroHubProvider` | 매크로 허브 | ✅ 일괄 스냅샷 |

**→ 9/23 전까지 처리해야 할 유일한 이관 잔여 작업이다.**
재현 명령: `node /tmp/classify-endpoints.js` (호출부 전수 분류)

### 2-3. 영구 상실 — 대체 불가

| 잃은 것 | 이유 | 대응 |
|---|---|---|
| **다크풀 %** | Intrinio 미제공 | **유동성 점수**(호가 스프레드 기반)로 대체 · §3 |
| **공매도 잔고(short interest)** | Enterprise 전용(403) | SQUEEZE 카드를 **볼린저 밴드폭 압축**으로 재정의 |
| 공매도 거래량(short volume) | 미제공 | 제거 |
| 틱 체결·틱 호가(`/v3/trades`, `/v3/quotes`) | 플랜 밖 | 옵션 실시간 WS 로 대체 |
| 연관 종목 | 미제공 | 제거 |

> 다크풀 제거는 **24개 커밋**이 걸린 가장 큰 작업이었다. 6갈래로 되살아났고
> (§4-3), 화면이 감마에서 다크풀을 **합성**하고 있던 것까지 나왔다.

---

## 3. 얻은 것 (Massive 에 없던 것)

| 새 지표 | 출처 | 표시 위치 |
|---|---|---|
| **ATR**(평균 실제 범위) | Intrinio technicals | Command 바이탈 스트립 |
| **ADX**(+DI/−DI) | Intrinio technicals | Command TREND PHASE **신뢰도 게이트** |
| **OBV**(누적 거래량) | Intrinio technicals | Command FLOW PULSE 카드 |
| **볼린저 밴드폭 압축** | Intrinio technicals | Command VOL SQUEEZE(죽은 카드 부활) |
| **변동성 프리미엄 (IV−RV)** | 합성 — 우리만 가능 | Command 바이탈 스트립 |
| **추세 품질 (ADX 게이트)** | 합성 | Command TREND PHASE 테두리 강조 |
| **신용 스프레드 (HY OAS)** | `$BAMLH0A0HYM2` | 가디언 매크로 축 |
| **유동성 점수** | 호가 스프레드 | Intel/Flow (다크풀 자리) |
| **내부자 거래** | Intrinio insider | Flow 「기관 레이더」 자리 |
| **13F 보유 변동** | Intrinio ownership | Flow |
| **옵션 계약별 미결제약정 증감** | 옵션 EOD 벌크(5년) | Flow WHALE 탭 · UC 큰손 레이더 |
| **신규진입/청산/단타 구분** | 위 파생 | Flow 이상활동 배너 |
| **PRE/본장/POST 봉 색 구분** | Intrinio 시간외 | 차트 |
| **배당** | Intrinio adjustments | 복구 — Massive 시절에도 죽어 있었다 |

핵심은 **변동성 프리미엄(IV−RV)** 이다. ATM IV 는 옵션 체인에서, 실현변동성은
20일 종가에서 계산한다. 둘 다 가진 서비스는 드물고, 방향이 아니라 **옵션 가격의
적정성**을 말한다. 새 지표 5종은 AI 분석 프롬프트에도 연결했다.

또 하나 — **옵션 EOD 벌크 5년치(2021-09-27~)** 접근권이 생겼다. 매일 210만 행을
디스크에 안 쓰고 스트리밍해 파싱한다(9~13초, RSS 256MB). 이걸로:
- 계약별 이상활동 (거래량이 못 가르는 신규/청산 구분)
- GEX 역사 백필 (수집 중단 시 자동 치유)

---

## 4. 이관과 **무관하게** 고친 데이터 정합성 결함

> 대표 질문의 핵심. **Massive 시절에도 틀리고 있었던 것들**이다.
> 벤더를 바꾸느라 파이프라인을 전수로 다시 읽게 되면서 드러났다.
> 이관 커밋보다 이쪽이 더 많다.

### 4-1. 가격 — 가장 심각 (16커밋)

| 결함 | 언제부터 | 증상 |
|---|---|---|
| 기준선이 **오늘 종가** | 2025-12-30 「보합 가드」 이후 | **전 종목 등락률 ≈ 0.00%** |
| `S.afterHours?.p` — 숫자를 객체로 읽음 | **2026-02-12** | POST 등락률 **항상 0.00%** |
| 시간외 가격을 종가로 **날조** | 이관 중 유입 | POST 가 본장과 같은 값 |
| 시간외 봉 ET 오프셋 **부호 반전** | 기존 | POST 봉이 조용히 버려짐 |
| `eod_close_price` 를 「전일」로 오독 | 이관 중 | 등락률 하루 밀림 |

→ **순수함수 `resolveSessionPrices()` 로 재설계 + 테스트 26/26 + 상시 대조기**
(`scripts/verify-price-accuracy.js`, 「전 종목 보합」 지문 자동 탐지).

「보합 가드」가 **틀린 값을 가려주고 있었다**는 게 이 건의 교훈이다.
방어 코드가 증상을 덮으면 원인은 반년을 산다.

### 4-2. 「없는 값」이 「0 이라는 사실」로 둔갑 (13커밋)

에러를 안 내기 때문에 **틀린 값보다 나쁘다** — 사용자가 판정 결과로 읽는다.

| 코드 | 화면이 하던 말 |
|---|---|
| `let pcr = 1` | 옵션 데이터가 없는데 「PCR 균형」 |
| `analysis.gex \|\| 0` | GEX 미수집이 「감마 0」 |
| `stock.gex \|\| 0` | Intel 타일 전 종목 0 |
| `rvol \|\| 1.0` | 엔진을 고쳐도 계속 「거래량 저조」 |
| `grade \|\| 'B'` · `score \|\| 55` | **평가받지 않은 종목에 등급** |
| `gamma_regime \|\| 'NEUTRAL'` | 감마 미측정이 「중립 판정」 |
| **`avgDarkPool \|\| 48 + \|gammaPulse\|*0.18`** | **감마에서 다크풀을 합성** ← 최악 |

마지막 것은 새로고침마다 값이 바뀌었다. API 만 봐서는 안 보이고 **실화면 DOM 에서
역추적**해야 나왔다.

→ `TickerSnapshot` 타입부터 null 을 허용하게 바꿔 **소비처 62곳이 타입체커에 걸리게**
한 뒤, `|| 0` 을 되붙이지 않고 하나씩 「없으면 없다고 말하는」 방식으로 처리.
AI 프롬프트에는 N/A 로 넘기고 「N/A 는 미측정이며 0·중립이 아니다」 규칙 추가.
상시 검사기 `scripts/check-fake-defaults.js`.

### 4-3. 죽은 데이터가 살아 돌아옴 (다크풀 6갈래)

캐시를 지워도 크론·Lambda 가 **새 타임스탬프로 다시 채워** 나이 검사까지 무력화.
→ **입구를 쫓지 말고 응답 출구 1곳(`jsonResponse`)에 게이트.**
파생 지표 재정규화도 필요했다 — 0 을 섞으니 섹터 IFS 가 통째로 −12점 밀렸다.

### 4-4. 조용히 죽어 있던 것들

| 결함 | 증상 |
|---|---|
| **변수 섀도잉** (`structureService`) | **TSM 만** 옵션 지표 전멸, AVGO 는 정상 |
| **서비스 워커 `CACHE_NAME` 하드코딩** | activate 가 아무것도 안 지워 **배포한 수정이 사용자에게 안 감** |
| **DynamoDB `Limit` + 오름차순** | 최신을 버려 30일 차트가 열흘 전에서 끊김 (5곳) |
| **섹터 id 불일치** (크론 `cloud_fortress` ↔ 설정 `cloudfortress`) | **인텔 3개 섹터 통째로 빈 화면**, 커버리지 56/70 |
| **`batch.flow` 키 없음** | 배치 병합이 **한 번도 동작한 적 없음** |
| `useMemo` 의존성 누락 | ATR 배지·변동성 프리미엄이 영영 안 뜸 |
| Market Breadth `0` 하드코딩 | 가디언 코어가 기본값 50/50 |
| 13F 신규 편입을 「0% 변화」로 | |
| 내부자 「거래 30건인데 매수 0 매도 0」 | |
| Lambda 배포가 자기 API 키를 지움 | 정규장 내내 `ok=0 fail=501` |
| harvest Lambda 매 실행 900초 타임아웃 | 라우팅에 타임아웃 가드가 없었다 |

---

## 5. 남긴 자산 — 상시 검사기

일회성 수정이 아니라 **재발을 막는 장치**로 남겼다.

| 스크립트 | 잡는 것 |
|---|---|
| `verify-price-accuracy.js` | 화면별 엔드포인트 가격 대조 + 「전 종목 보합」 지문 |
| `test-session-prices.js` | 세션 분리 순수함수 26케이스 |
| `check-fake-defaults.js` | 지표성 필드의 `\|\| 0` / `?? 0` |
| `check-sector-ids.js` | 생산자(크론) ↔ 소비자(설정) 키 대조 |
| `check-i18n-keys.js` | ko/en/ja 번역키 누락 |
| `check-shadowed-vars.js` | 변수 섀도잉 (AST) |
| `audit-empty-fields.js` | 응답의 빈 필드 |

---

## 6. 이관이 남긴 판단 기준 (다음에도 쓸 것)

1. **403 은 「$0.00」으로 위장한다.** 같은 키로 A=200·B=403 이면 코드가 아니라 결제/플랜.
2. **벤더 선택은 ①파생지표 재배포 허용 ②Display 티어** 두 가지로 갈린다.
3. **방어 코드가 증상을 덮으면 원인은 반년을 산다** (보합 가드).
4. **없는 값을 0 으로 채우면 화면도 AI 도 그것을 사실로 읽는다.**
5. **「끊긴 이력」은 먼저 창을 좁혀 재질의하라** — 쿼리 절단일 수 있다.
6. **생산자·소비자 이름 불일치는 에러를 안 낸다** — 검사기로 고정.
7. **검증은 API 가 아니라 실화면에서.** 합성 지표는 DOM 역추적으로만 나왔다.

---

## 7. 남은 일

| 우선순위 | 항목 | 기한 |
|---|---|---|
| **1** | §2-2 의 10종/18곳을 Intrinio 로 이관 | **2026-09-23 (계정 해지)** |
| 2 | 리스크팩터 원문 텍스트 Intrinio 대체 가능성 확인 | 위와 동일 |
| 3 | Massive 관련 코드·환경변수 완전 제거 | 이관 후 |
