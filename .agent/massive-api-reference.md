# Massive API Reference

## 주식 관련 API

### Short Interest (공매도 잔고)
- **Endpoint**: `/stocks/v1/short-interest`
- **설명**: 브로커-딜러가 FINRA에 보고한 공매도 잔고 집계 데이터 (격월 업데이트)
- **용도**: SI% 지표, 공매도 비율 분석

### Short Volume (일일 공매도 거래량)
- **Endpoint**: `/stocks/v1/short-volume`
- **설명**: 장외거래소 및 ATS에서 보고된 일일 공매도 거래량
- **용도**: 일일 공매도 활동 모니터링

### Float (유동주식수)
- **Endpoint**: `/stocks/vX/float`
- **설명**: 공개적으로 거래 가능한 발행 주식 수
- **용도**: SI% 계산 (Short Interest / Float)

### Financial Ratios
- **Endpoint**: `/stocks/financials/v1/ratios`
- **설명**: 가치평가, 수익성, 유동성, 레버리지 지표

## 옵션 관련 API

### Option Chain Snapshot
- **Endpoint**: `/v3/snapshot/options/{underlyingAsset}`
- **설명**: 옵션 체인 전체 스냅샷 (그리스, IV, OI 포함)

### Option Contract Snapshot
- **Endpoint**: `/v3/snapshot/options/{underlyingAsset}/{optionContract}`
- **설명**: 개별 옵션 계약 상세 정보

## 시장 데이터 API

### Single Ticker Snapshot
- **Endpoint**: `/v2/snapshot/locale/us/markets/stocks/tickers/{stocksTicker}`
- **설명**: 종목별 실시간 스냅샷

### Previous Day Bar
- **Endpoint**: `/v2/aggs/ticker/{stocksTicker}/prev`
- **설명**: 전 거래일 OHLC

### Custom Bars (OHLC)
- **Endpoint**: `/v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}`
- **설명**: 커스텀 시간대 OHLC 데이터

## 기술적 지표 API

### SMA, EMA, MACD, RSI
- `/v1/indicators/sma/{stockTicker}`
- `/v1/indicators/ema/{stockTicker}`
- `/v1/indicators/macd/{stockTicker}`
- `/v1/indicators/rsi/{stockTicker}`

## 재무제표 API

### Income Statements
- **Endpoint**: `/stocks/financials/v1/income-statements`

### Balance Sheets
- **Endpoint**: `/stocks/financials/v1/balance-sheets`

### Cash Flow Statements
- **Endpoint**: `/stocks/financials/v1/cash-flow-statements`

## 기타 유용한 API

### Ticker Overview
- **Endpoint**: `/v3/reference/tickers/{ticker}`
- **설명**: 종목 상세 정보 (시가총액, 산업분류 등)

### Related Tickers
- **Endpoint**: `/v1/related-companies/{ticker}`
- **설명**: 관련 종목 (동종업계, 경쟁사)

### News
- **Endpoint**: `/v2/reference/news`
- **설명**: 종목 관련 뉴스 + 감성분석

### Market Status
- **Endpoint**: `/v1/marketstatus/now`
- **설명**: 현재 시장 개장/폐장 상태

### Market Holidays
- **Endpoint**: `/v1/marketstatus/upcoming`
- **설명**: 예정된 휴장일
