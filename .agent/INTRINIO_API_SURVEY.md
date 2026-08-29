# Intrinio API 전수 실측 보고서

> 2026-08-29. 대표 지시: «모든 API 엔드포인트를 직접 때려보고 데이터 질을 보고하라.»
> 문서를 읽은 게 아니라 **우리 키로 83개를 실제 호출**한 결과다.
> 재현: `KEY_FILE=<키> node scripts/intrinio-api-survey.js --json out.json`

```
사용 가능 46 · 빈값 3 · 권한없음(403/401) 22 · 미존재(404) 12
그중 «지금 안 쓰는데 쓸 수 있는 것» 35개
```

---

## 1. 즉시 가치 있는 발견 (구현 완료/착수)

### 1-1. 배당이 살아 있었다 ✅ 구현완료
`securities/{t}/dividends` 는 **404** 라 «미제공» 으로 분류했었다.
그런데 **`securities/{t}/prices/adjustments` 에 배당이 들어 있다.**
```
AAPL 2026-08-10 $0.27 (분기)   MSFT $0.91   KO $0.53   JNJ $1.34
TSLA 무배당(정확)               NVDA 분할 3건 (2024-06-10 10:1 포함)
```
→ 전 필드 null 이던 `/api/dividends` 복구. **분할 이력**도 같은 응답에서 나온다.
한계: **배당락일만** 준다. 지급일·기준일·선언일 없음 → 추정하지 않고 null.

### 1-2. 뉴스는 Intrinio 가 답이 아니다 ⚠️ 중요
Massive 뉴스는 2026-09-23 해지 예정이라 대안이 필요했다. 3사 실측 비교:

| 항목 | Massive (현재) | Intrinio | **FMP (stable)** |
|---|---|---|---|
| 종목 정확도 | **20/20 (100%)** | 9/30 (30%) | 26/30 (87%) |
| 발행사 수 | 3곳 | **yahoo 1곳** | **17곳** |
| 본문 | 있음(description) | 요약만 | 31/50 |
| 종목별 감성분석 | **있음(insights)** | 없음 | 없음 |
| 키워드 | 있음 | 빈 배열 | 없음 |
| 다종목 1콜 | ✗ | ✗ | **✓ (5종목 60건)** |
| 소형주 커버 | - | - | ✓ (IONQ·AEHR·BBAI 확인) |

**Intrinio 뉴스는 종목 연결이 부정확하다.** `/companies/NVDA/news` 결과에
「GE Vernova」「Ford」「Ulta Beauty」가 섞여 나온다(30건 중 NVDA 언급 9건).
→ **뉴스 이관 대상은 FMP**(`stable/news/stock`). 이미 결제된 스택이다.
   손실: Massive 의 종목별 감성분석(insights). 우리는 자체 AI 분석이 있어 대체 가능.
   `stable/news/press-releases` 는 402(상위 플랜) — 사소한 손실.

### 1-3. 실시간 SEC 공시·내부자 스트림 ★신규
```
filings              최신 0일전 · filing_url/report_type/period_end_date
insider_transaction_filings  최신 0일전 (전역 피드)
  거래 상세: transaction_type_code(A/P/S) · acquisition_disposition_code
             amount_of_shares · transaction_price · total_shares_owned
             officer_title · director/officer/ten_percent_owner 플래그
```
→ 「방금 올라온 내부자 매수」 실시간 피드를 만들 수 있다.
   (NVDA 가 8/12 인 것은 stale 이 아니라 **실제로 그 후 신고가 없어서**다 — 확인함)

### 1-4. 13F 기관 보유 ★신규
`securities/{t}/institutional_ownership` — 필드 11/11 전부 채워짐
```
{"owner_name":"ADAMS DIVERSIFIED EQUITY FUND","period_ended":"2026-06-30",
 "value":219971472,"amount":760200,"previous_amount":767300,
 "amount_change":-7100,"amount_percent_change":-0.009253,
 "sole_voting_authority":760200,"shared_voting_authority":0}
```
→ **직전 분기 대비 증감이 이미 계산되어 온다.** 현재 우리 13F(sec.gov 파싱)보다 풍부.

---

## 2. 새로 쓸 수 있는 것 (미착수)

| 분류 | 엔드포인트 | 데이터 질 | 활용 아이디어 |
|---|---|---|---|
| 기술지표 | `technicals/bb` `atr` `adx` `obv` | 1일전 · 필드 완전 | Massive 에 없던 지표. 변동성·추세 강도 |
| 기업 | `historical_data/marketcap` | 1일전 · 일별 | 시총 추이 차트 |
| 기업 | `data_tags` (11필드) | - | 사용 가능한 재무 태그 카탈로그 |
| 재무 | `standardized_financials` | 22항목 | 표준화 재무제표 (비교 가능) |
| 재무 | `reported_financials` | 19항목 | 보고 원문 |
| 지수 | `indices/stock_market` | **0일전** | $SPX 등 지수 직접 |
| 지수 | `indices/economic/{id}/historical_data` | 150일전 | FRED 대안(단, 갱신 느림) |
| 지수 | `indices/sic` | 28일전 | SIC 산업분류 지수 |
| 시세 | `stock_exchanges` (195곳) | 1일전 | 거래소 메타 |
| 옵션 | `options/prices/{계약}/eod` | 1일전 · 20/28필드 | 계약별 시계열(현재 체인만 씀) |
| 외환 | `forex/pairs` (40쌍) | - | 환율 대안 |

### 봉마다 bid/ask — 이미 받고 있으나 안 쓰는 것
`prices/intervals` 응답에 분봉마다:
```
bid_open/high/low/close · ask_open/high/low/close · average · trade_count
```
→ **분봉 단위 스프레드**(유동성 지표)를 만들 수 있다. Massive 엔 없던 데이터.
→ `average` 는 진짜 평균가 — 현재 `(h+l+c)/3` 근사를 쓰는 곳을 대체 가능.

### 전 종목 NBBO 스냅샷 (1콜)
`securities/snapshots` → 약 13,000종목의 bid/ask/size + 누적거래량.
시간외 실측 스프레드 분포:
| ≤0.1% | ≤0.5% | ≤1% | ≤5% | ≤20% | >20% |
|---|---|---|---|---|---|
| 112 | 505 | 595 | 3,034 | 3,741 | 5,002 |
→ **시장 전체 유동성 지도**를 만들 수 있다(경쟁사에 없는 지표).
→ 이미 이걸로 **시간외 봉 기록기**를 만들어 차트 PRE/POST 를 복원했다.

---

## 3. 권한 없음 / 미제공 (403 · 404)

| 항목 | 상태 | 영향 |
|---|---|---|
| **ETF 보유종목/애널리틱스/통계** | 403 | 섹터 구성 정확도 개선 불가 |
| **Zacks 전체**(애널리스트 등급·EPS 추정·목표주가·서프라이즈) | 403 | 애널리스트 레이어 불가 |
| 옵션 실시간 체인 / 계약 목록 / UOA | 403 | **EOD 체인만** 사용 가능 |
| 공매도 잔고(short_interest) | 403 | 스퀴즈 지표 불가 → null 처리함 |
| ESG | 403 | - |
| 기업 이벤트(answers) | 403 | - |
| 증권 스크리너 | 404 | - |
| `securities/{t}/dividends` `earnings` | 404 | 배당은 adjustments 로 우회 성공 |
| 옵션 만기별 통계 / 인터벌 무브먼트 | 404 | - |

### 다크풀 — 확정: 현재 피드로는 불가
`realtime` 응답에 `is_darkpool` 필드가 **있어서** 될 것처럼 보이지만,
같은 응답이 명시한다:
> "market_center, listing_venue, sales_conditions, and quote_conditions
>  are only available with our delayed sip feed."

EQUITIES_EDGE WS 실측(2026-08-28 POST):
```
MarketCenter=" "  Condition=""  IsDarkpool=false(전건)  Size=0  TotalVolume=0
```
프로바이더 권한 실측: **DELAYED_SIP 도 HTTP 200**.
→ 장 마감으로 체결 표본이 없어 **미확정**. `scripts/intrinio-darkpool-probe.js` 가
   월요일 개장 직후(ET 09:45) 자동 판정한다 → `/var/log/intrinio-darkpool-probe.log`

---

## 4. 우선순위 제안

| 순위 | 항목 | 근거 | 상태 |
|---|---|---|---|
| 1 | **배당 복구** | 화면이 전 필드 null 이었다 | ✅ 완료 |
| 2 | **뉴스 → FMP** | Massive 9/23 해지 · 품질 실측 우위 | 착수 필요 |
| 3 | 다크풀 판정 확인 | 자동 실행됨 | ⏳ 월요일 |
| 4 | `average` → VWAP 대체 | 근사치를 실측치로 | 분봉은 반영됨 |
| 5 | 분봉 스프레드 지표 | 경쟁사에 없음 | 신규 |
| 6 | 13F 를 Intrinio 로 | 증감이 계산되어 옴 | 검토 |
| 7 | 실시간 내부자 피드 | 0일전 전역 스트림 | 신규 |
| 8 | BB/ATR/ADX/OBV 추가 | Massive 에 없던 지표 | 신규 |
