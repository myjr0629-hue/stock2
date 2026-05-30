# Daily 3-Shorts Engine Readiness Check

Before we build the fully automated pipeline (SignumHQ Lambda → Redis → Remotion), we must evaluate what is currently built and what is missing.

## 1. What is Already Built?
- **Render Engine**: Remotion templates for V14.1 (`MarketPressureBriefV14_1`). Procedural UI, spatial squeeze animations, and structural reveals are locked in.
- **Pre-Upload Evaluation**: `ViewerLockInSimulator` is fully built and calibrated to prevent false positives without public data.
- **Content Selection Logic**: `DailyShortCandidateSelector.ts` is built but currently runs on mock data.
- **Audio Pipeline**: ElevenLabs TTS integration is tested and proven.

## 2. What is Still Mock-Only?
- **Market Data**: Currently hardcoded in `mockMarketPressureBriefV14_1.ts` and `daily_short_candidates.json`.
- **Script Generation**: We do not yet have an LLM or template engine that takes raw numbers and generates the exact 20-second TTS script.

## 3. What Real Data Endpoints are Needed?
- **SignumHQ Lambda API**: Must expose an endpoint returning daily market structure (Call Wall, Put Floor, Gamma Flip, Zero Gamma, GEX Regimes) for major indices and top 50 retail equities.

## 4. What Redis Keys/Tables are Needed?
Per the `/verify-redis-policy` workflow, no direct API calls to external services are allowed during render.
- `shq:market_data:daily` (Hash map of tickers to structure data)
- `shq:shorts:queue` (List of candidates selected for today's render)
- `shq:shorts:history` (Log of previously rendered concepts to avoid daily repetition)

## 5. What Lambda Functions are Needed?
- A cron-triggered Lambda that pulls from SignumHQ core database at 08:00 AM EST and writes to the `shq:market_data:daily` Redis cache.

## 6. What Output JSON Shape is Required?
The data fetched from Redis must map directly to `ShortsVideoInput`:
```json
{
  "theme": "dark",
  "ticker": "SPY",
  "currentPrice": 592.31,
  "structure": {
    "callWall": 600,
    "putFloor": 580,
    "gammaFlip": 588,
    "zeroGamma": 588
  },
  "narrative": {
    "hook": "SPY is 1.3% below a hidden Call Wall",
    ...
  }
}
```

## 7. What Parts Depend on Public Upload Data?
- **Visual Pacing**: The spatial squeeze at 4.0s might need adjustments based on 5-10s dropoff rates.
- **Template Diversity**: We should not automate Template B or C until Template A (MarketPressureBrief) proves it can achieve >60% Viewed-vs-Swiped.

## 8. What Should be Automated ONLY AFTER V14.1 Public Test?
- **The Cron Job**: Do not schedule the 3-a-day loop until V14.1 data is back. If V14.1 fails the hook test, we must build V15 before scaling.

---

## The Future Pipeline (Post-V14.1 Data)
1. **08:00 EST**: SignumHQ Lambda caches data to Redis.
2. **08:05 EST**: `DailyShortCandidateSelector` picks 3 tickers.
3. **08:10 EST**: Script Generator formats the TTS string and Remotion JSON.
4. **08:15 EST**: ElevenLabs generates Audio.
5. **08:20 EST**: Remotion renders 3 MP4s concurrently.
6. **08:30 EST**: `ViewerLockInSimulator` scores them. If < 85, reject.
7. **09:00 EST**: Approved MP4s and Upload Packages (Markdown/CSV rows) are ready for the social media manager (or automated upload API).
