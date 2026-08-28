# Intrinio 이관 — API 실측 파악 (2026-08-29)

Massive(구 Polygon) 약관 위반 차단 후 대안 확정. **Intrinio Startup Plan** 계약·서명 완료.

## 계약 요약

| 항목 | 내용 |
|---|---|
| 플랜 | US Startup Plan (Commercial use) |
| 요금 | $333/월(6개월) → $666(6개월) → $999 이후 · **분기 선불** |
| 약정 | 1년, 자동 갱신 · auto-pay 미적용 시 +10% |
| 권한 | **Display + Commercial Use + Business-wide license** |
| 거래소 수수료 | **없음** |
| 한도 | 2,000 API calls/min · WebSocket 3 연결 |
| 계약서 | PandaDoc "Display Rights Agreement" 서명 완료 |

### 계약상 허용 범위 (원문 요약)
> 자사 애플리케이션에서 **개별 최종 사용자에게 수신·처리·표시 가능**.
> 데이터 재판매·상업적 착취는 금지하되, **실질적 기능/분석이 함께 제공되면 앱 수익화 가능**.

### ⚠️ 의무 사항 (미구현 — 반드시 반영할 것)
> **Intrinio 데이터가 사용되는 모든 페이지**에 Intrinio 로고 또는 출처 표기 +
> **Intrinio 웹사이트로 향하는 follow 백링크**를 노출해야 함.

앱/웹 양쪽 데이터 표시 화면 전부에 적용 필요.

---

## 실측 결과 — 작동 확인 (2026-08-29)

API base: `https://api-v2.intrinio.com` · 인증: `?api_key=`

### ✅ 주식
| 엔드포인트 | 내용 |
|---|---|
| `securities/{t}/prices/realtime` | 실시간가·bid·ask (FMV, 거래소 수수료 0) |
| `securities/{t}/prices` | 일봉 OHLCV + 수정주가 |
| `securities/{t}/data_point/{tag}` | 단일 값 조회 (예: close_price) |

### ✅ 옵션 — **스냅샷 방식**
| 엔드포인트 | 내용 |
|---|---|
| `options/snapshots` | S3 gzip CSV URL 반환 (약 52MB) |
| `options/tickers` | 옵션 상장 티커 전체 목록 |

스냅샷 CSV 컬럼:
```
CONTRACT ID, OPEN INTEREST, TRADE PRICE, TRADE SIZE, TOTAL TRADE VOLUME,
LAST TRADE TIMESTAMP, TRADE HIGH PRICE, TRADE LOW PRICE,
ASK PRICE, ASK SIZE, LAST ASK TIMESTAMP, BID PRICE, BID SIZE, LAST BID TIMESTAMP
```
CONTRACT ID 형식: `NVDA_260911C47.00` = 심볼_YYMMDD + C/P + 행사가

**1개 파일에 전 종목 209만 계약** 포함 → 티커 수 제한 없음.

### ✅ 기관/펀더멘털
| 엔드포인트 | 내용 |
|---|---|
| `securities/{t}/institutional_ownership` | **13F 기관 보유** |
| `owners` / `owners/{cik}/institutional_holdings` | 기관별 보유 내역 |
| `companies/{t}/fundamentals` | 재무제표 |

### ✅ 뉴스 · 지수
| 엔드포인트 | 내용 |
|---|---|
| `companies/{t}/news` | 종목별 뉴스 |
| `companies/news` | 전체 뉴스 |
| `indices/stock_market` / `{symbol}` | S&P500 등 지수 |

### ✅ 기술지표 — 15종 이상 (Massive 대비 대폭 증가)
`securities/{t}/prices/technicals/{i}` :
`macd` `rsi` `sma` `bb` `adx` `atr` `obv` `vwap` `cci` `mfi` `dc` `kc` `sr` `trix` `ao`
(`ema` `wma` `stoch` `macd_histogram` 은 없음)

→ **SMA/MACD 자체 계산 불필요**. Massive 이관 시 그대로 대체 가능.

### ✅ 그 밖에 — Massive 에 없던 신규 기능
| 엔드포인트 | 내용 |
|---|---|
| `indices/economic` · `/{symbol}` | **경제지표** ($GDP 등) |
| `indices/sic` | **산업별 SIC 지수** |
| `filings` · `companies/{t}/filings` | **SEC 파일링** |
| `securities/snapshots` | **전 종목 주식 스냅샷** |
| `options/aggregates` | **티커별 총 OI 집계** (스냅샷 없이 조회) |
| `stock_exchanges` · `companies/{t}/securities` | 거래소·증권 레퍼런스 |

### ❌ 권한 없음 (Enterprise 전용)
- **공매도 잔고 / 다크풀** (`securities/{t}/short_interest`) — 유일한 실질 손실
- Zacks 애널리스트 (`zacks/analyst_ratings` · `eps_estimates` · `sales_estimates`) → **FMP 계속 사용**
- `options/chain/{t}/{exp}` · `options/expirations/{t}` — OPRA 실시간 체인 (스냅샷으로 대체)
- `options/unusual_activity` — 이상 거래 탐지
- `etfs/{t}/holdings` — ETF 구성 종목
- 배당·분할 이력 (`dividends` · `stock_splits`)

---

## 검증: 맥스페인 계산 — Databento와 완전 일치

NVDA · 2026-08-28 만기 기준, 두 벤더 독립 계산 결과가 동일:

| | Databento | Intrinio |
|---|---|---|
| MAX PAIN | $212.50 | **$212.50** |
| 총 손실 | $116.0M | **$116.0M** |
| 콜 OI | 1,169,254 | **1,169,254** |
| 풋 OI | 581,848 | **581,848** |
| PUT/CALL | 0.498 | **0.498** |
| 행사가 수 | 81 | **81** |

→ 동일 OPRA 원본. **데이터 품질 차이 없음**, 비용만 1/8.

검증 스크립트: 스크래치패드 `intrinio_maxpain.py` / `verify_maxpain.py`

---

## ★ 엔드포인트 매핑표 (이관 정본)

`massiveClient.ts` 가 단일 허브 → **fetchMassive() 내부 라우팅만 교체**하면 소비처 30여 파일 무수정.

| # | Massive 엔드포인트 | 사용 | → Intrinio |
|---|---|---|---|
| 1 | `/v2/snapshot/.../tickers/{t}` | 14 | `securities/{t}/prices/realtime` |
| 2 | `/v2/snapshot/.../tickers` (전체) | 19 | `securities/snapshots` |
| 3 | `/v2/aggs/ticker/{t}/range/1/day/..` | 19 | `securities/{t}/prices` |
| 4 | `/v3/snapshot/options/{t}` | 8 | **`options/chain/{t}/{exp}/eod`** ★ |
| 5 | `/v1/indicators/rsi/{t}` | 6 | `securities/{t}/prices/technicals/rsi` |
| 6 | `/v3/reference/tickers/{t}` | 4 | `companies/{t}` |
| 7 | `/v2/snapshot/.../gainers`·`losers` | 6 | `securities/snapshots` 로 자체 정렬 |
| 8 | `/v2/aggs/grouped/...` | 4 | `securities/snapshots` |
| 9 | `/v1/open-close/{t}/{d}` | 3 | `securities/{t}/prices` |
| 10 | `/v1/marketstatus/now`·`upcoming` | 5 | 자체 캘린더 계산 |
| 11 | `/v2/aggs/ticker/{t}/prev` | 2 | `securities/{t}/prices` |
| 12 | `/v1/related-companies/{t}` | 2 | 자체/생략 |
| 13 | `/v3/reference/dividends` | 1 | ❌ 없음 |
| 14 | short interest / float / SI% | 3 | ❌ **없음 — 다크풀 포기 확정** |
| — | `/v2/reference/news` | **16** | **Massive 유지 (9/23 마감, 별도 작업)** |

### 옵션 경로 상세 (검증 완료)
| 용도 | 엔드포인트 | 비고 |
|---|---|---|
| **만기별 전체 체인** | `options/chain/{t}/{exp}/eod` | 176계약/호출 · **OI+IV+Greeks 전부** |
| 티커 전체 계약 | `options/prices/by_ticker/{t}/eod` | 대량 |
| 만기 목록 | `options/expirations/{t}/eod` | |
| 계약 단건 | `options/prices/{code}/eod` | |
| 전 종목 스냅샷 | `options/snapshots` | S3 gzip CSV 52MB · **Greeks 없음** |
| 계약 레퍼런스 | `options/{t}/realtime` | code·strike·expiration·type 만 |
| 벌크 | `bulk_downloads/links` | 전체 히스토리 107GB |

`prices` 응답 필드: `date close close_bid close_ask volume open_interest high low mark
implied_volatility delta gamma theta vega exercise_style`

### 보유 인프라 (옵션 파이프라인용)
Upstash Redis · Vercel KV · ioredis(EC2 프록시) · AWS S3 · DynamoDB · Lambda · EventBridge · Scheduler

---

## Massive 대비 커버리지

| 기능 | Massive | Intrinio Startup |
|---|---|---|
| 실시간 시세 | ✅ | ✅ |
| 옵션 체인·OI | ✅ | ✅ (스냅샷) |
| 일봉 | ✅ | ✅ |
| 13F | ✅ | ✅ |
| 뉴스 | ✅ | ✅ |
| **다크풀 / short volume** | ✅ | ❌ **손실** |
| 기술지표(SMA/MACD) | ✅ | 자체 계산 필요 |

**손실 = 다크풀 1개.** FMP에서 받던 실적·애널리스트·경제캘린더는 영향 없음.

---

## 남은 작업

1. **Intrinio 출처 표기 + 백링크** 구현 (계약 의무)
2. 데이터 레이어 교체 — Massive 호출 21개 파일
3. 다크풀 지표 처리 방향 결정 (제거 / 대체 / Enterprise 승격) — **유일한 손실**
4. ~~SMA·MACD 자체 계산~~ → **불필요. `technicals/` 엔드포인트로 그대로 대체**
5. 앱 `$0.00` 표시 차단 (임시 조치, 미적용)
6. `src/app/api/live/ticker/route.ts:16` 하드코딩 키 제거
7. Massive 해지 확인됨 — Stocks/Options Advanced 모두 `Cancellation pending 2026-09-23`

## 참고 — 탈락한 대안

**Databento**: 파생 지표 표시도 "external data distribution"으로 간주 →
Plus 플랜 필수, 데이터셋당 $1,500(15% 스타트업 할인 적용 시 $1,275),
주식+옵션 $2,550/월, **12개월 약정 협상 불가**. 연 $30,600 vs Intrinio $5,994.
