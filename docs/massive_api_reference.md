# Massive API Reference (Unlimited Access)

User has confirmed unlimited access to the following Massive API endpoints. Use these to enhance data features.

## Market Data (Stocks/Indices/Forex/Crypto)
- **Unified Snapshot** (`/v3/snapshot`): Integrated market data (last trade, quote, OHLC, volume) across all asset classes in a single request.
- **Single Ticker Snapshot** (`/v2/snapshot/locale/us/markets/stocks/tickers/{stocksTicker}`): Real-time snapshot for a specific ticker (trade, quote, min/day/prev aggs). Resets 3:30 AM ET.
- **Full Market Snapshot** (`/v2/snapshot/locale/us/markets/stocks/tickers`): Snapshot for ALL active US stocks (>10k tickers) in one response.
- **Top Market Movers** (`/v2/snapshot/locale/us/markets/stocks/{direction}`): Top 20 gainers/losers.
- **Custom Bars (OHLC)** (`/v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}`): Historical custom aggregates (e.g. 5-min bars).
- **Daily Market Summary** (`/v2/aggs/grouped/locale/us/market/stocks/{date}`): OHLCV for entire market on a specific date.
- **Previous Day Bar** (`/v2/aggs/ticker/{stocksTicker}/prev`): Previous day's OHLCV.
- **Ticker Overview** (`/v3/reference/tickers/{ticker}`): Detailed company info (market cap, industry, CIK, FIGI, branding).
- **Ticker Types** (`/v3/reference/tickers/types`): List of asset classes and ticker types.
- **Related Tickers** (`/v1/related-companies/{ticker}`): Peers and competitors based on news/returns.

## Options
- **Option Chain Snapshot** (`/v3/snapshot/options/{underlyingAsset}`): **CRITICAL**. Comprehensive snapshot of ALL options for an underlying (Greeks, IV, Quotes, Trades, OI) in one request.
- **Option All Contracts** (`/v3/reference/options/contracts`): List of all active/expired option contracts.

## Technical Indicators
- **SMA** (`/v1/indicators/sma/{stockTicker}`)
- **EMA** (`/v1/indicators/ema/{stockTicker}`)
- **MACD** (`/v1/indicators/macd/{stockTicker}`)
- **RSI** (`/v1/indicators/rsi/{stockTicker}`)

## Macro & Fed
- **Treasury Yields** (`/fed/v1/treasury-yields`): Daily treasury yields (1mo to 30yr).
- **Inflation** (`/fed/v1/inflation`): CPI and PCE data.
- **Inflation Expectations** (`/fed/v1/inflation-expectations`): Short/long-term inflation forecasts.

## Metadata & Status
- **Market Status** (`/v1/marketstatus/now`): Real-time open/closed status.
- **Market Holidays** (`/v1/marketstatus/upcoming`): Upcoming holidays.
- **Exchanges** (`/v3/reference/exchanges`): Exchange codes and details.
- **Condition Codes** (`/v3/reference/conditions`): Trade/Quote condition codes.
- **News** (`/v2/reference/news`): Ticker-specific news with sentiment.

## Experimental / Other
- **Ticker Events** (`/vX/reference/tickers/{id}/events`): Ticker changes, rebranding.
- **Risk Factors** (`/stocks/filings/vX/risk-factors`): SEC filing risk factors.
