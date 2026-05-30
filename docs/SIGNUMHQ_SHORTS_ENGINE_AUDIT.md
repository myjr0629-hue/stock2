# SIGNUMHQ SHORTS ENGINE — MISSION 01 AUDIT REPORT

> Generated: 2026-05-19T08:22 KST | Agent: Claude Opus 4.6 (Thinking) / Antigravity  
> Status: **Investigation Complete — No Production Changes Made**

---

## A. Executive Summary

| Metric | Value |
|--------|-------|
| **Current Readiness Score** | **52 / 100** |
| **Remotion** | ✅ Installed, deployed to Lambda, 4 compositions exist |
| **Replicate** | ⚠️ SDK installed, API key exists, no production integration |
| **ElevenLabs** | ❌ Not installed, no API key, no code |
| **Data Availability** | ✅ Rich — GEX, Dark Pool, Call Wall, Put Floor, Gamma Flip all exist |
| **Scoring System** | ❌ No InsightScorer or AlgorithmFitScorer exists |
| **Voice + Captions** | ❌ Only AWS Polly (no word-level timestamps used) |

### Top 5 Blockers

1. **ElevenLabs not integrated** — No SDK, no API key, no voice, no word-level timestamps
2. **No InsightScorer** — Events detected but never scored for video-worthiness
3. **No premium Remotion templates** — Existing compositions are basic CSS animations
4. **No Replicate B-roll pipeline** — SDK installed but only throwaway test scripts
5. **No "Context Score"** — Codebase uses `alphaScore` (pulse+mm+stealth+secret components)

### Fastest Path to First Premium Prototype: ~10 hours

---

## B. Current Architecture Map

### Framework & Stack

- **Framework**: Next.js (App Router) — `next.config.mjs`, `src/app/`
- **Package Manager**: npm — `package-lock.json` (668KB)
- **Deployment**: Vercel (auto-deploy) — `.vercel/`, `vercel.json`
- **Database**: Supabase + Upstash Redis + AWS ElastiCache
- **Cloud**: AWS (S3, Lambda, EC2, Polly, Bedrock)
- **Remotion**: v4.0.441 — Lambda deployed, S3 bundle ready

### Key Data Service Files

| File | Size | Contains |
|------|------|----------|
| `src/services/structureService.ts` | 39,850B | Call Wall, Put Floor, Gamma Flip, GEX calculation |
| `src/services/realtimeMetricsService.ts` | 9,733B | Dark Pool %, Buy/Sell ratio |
| `src/services/alphaEngine.ts` | 93,770B | Main scoring engine |
| `src/services/stockTypes.ts` | 35,838B | Alpha Score system |
| `src/services/terminalEnricher.ts` | 34,116B | Full options analysis pipeline |
| `src/app/api/cron/event-detect/route.ts` | 20,463B | 7 event detectors (551 lines) |
| `src/app/api/cron/render-video/route.ts` | 15,452B | Remotion orchestrator (441 lines) |
| `src/lib/marketing/pollyClient.ts` | 10,810B | AWS Polly TTS + BGM selector |
| `src/lib/marketing/remotionLambda.ts` | 7,372B | Lambda render helper |
| `src/lib/marketing-v2/core/compliance.ts` | 5,781B | Compliance filter + disclaimers |

---

## C. Tool Readiness Matrix

| Tool | Status | Key Files | Missing | Next Action |
|------|--------|-----------|---------|-------------|
| **SignumHQ Data** | ✅ Ready | `structureService.ts`, `realtimeMetricsService.ts` | No GEX percentile, no regime duration tracking | Create DataSnapshotBuilder |
| **Remotion** | ✅ Installed | `src/remotion/` — Lambda deployed, 4 compositions | No cinematic B-roll compositing, no caption sync | Build new premium templates |
| **Replicate** | ⚠️ Partial | `package.json: replicate@^1.4.0`, key in `.env.local` | Key has Unicode corruption (null bytes L57), no service | Fix key, create BrollService |
| **ElevenLabs** | ❌ Missing | None | No SDK, no API key, no code | Install SDK, get key, build service |
| **Storage** | ✅ Ready | S3 `signum-marketing`, Lambda renders to S3 | No B-roll cache | Add cache layer |
| **Compliance** | ✅ Ready | `marketing-v2/core/compliance.ts` (152 lines) | Missing video disclaimers | Extend for video |

---

## D. Available Data Field Matrix

| Field | Exists? | Source File | Video Use |
|-------|---------|-------------|-----------|
| Ticker | ✅ | Multiple | All templates |
| Price | ✅ | `unifiedPriceService.ts`, Redis | All templates |
| Alpha Score (→ "Context Score") | ✅ | `alphaEngine.ts`, `stockTypes.ts` | Ticker Spotlight |
| GEX (Net Gamma) | ✅ | `structureService.ts` L484-530 | Hidden Wall, Pressure Field |
| GEX Percentile | ❌ | — | Must compute from history |
| Gamma Regime | ✅ | Redis `analysis:gex:regime` | Regime Clock |
| Gamma Regime Duration | ❌ | — | Must track timestamps |
| Call Wall | ✅ | `structureService.ts` L484-502 | Hidden Wall |
| Put Floor | ✅ | `structureService.ts` | Hidden Wall |
| Gamma Flip Level | ✅ | `structureService.ts` L393-456 | Hidden Wall, Pressure Field |
| Dark Pool % | ✅ | `realtimeMetricsService.ts` L150 | Dark Flow |
| Buy/Sell Ratio | ✅ | `realtimeMetricsService.ts` | Dark Flow |
| Unusual Options Flow | ✅ | `event-detect` L309-346, Redis | Ticker X-Ray |
| Put/Call Ratio | ✅ | `terminalEnricher.ts` | Ticker X-Ray |
| SPY/QQQ/VIX | ✅ | Redis `yahoo:idx:*`, `yahoo:vix` | Market Pulse |

---

## E. Recommended Architecture

```
src/shorts/
├── data/DataSnapshotBuilder.ts
├── events/MarketEventDetector.ts
├── scoring/
│   ├── AlgorithmFitScorer.ts
│   ├── MonetizationFitScorer.ts
│   └── ComplianceSafetyGate.ts
├── scripts/ScriptGenerator.ts
├── voice/ElevenLabsVoiceService.ts
├── captions/CaptionSegmentBuilder.ts
├── broll/ReplicateBrollService.ts
├── remotion/
│   ├── components/ (DataCard, CaptionOverlay, WallLevelViz, ComplianceFooter)
│   └── templates/ (HiddenWall, PressureField, DarkFlow, RegimeClock, TickerXRay, DashboardReveal)
├── render/RemotionRenderService.ts
├── qa/QualityGate.ts
└── analytics/PerformanceFeedbackLoop.ts
```

---

## F. First 6 Template Concepts

### 1. Hidden Wall — "The wall is not on your chart"
- **Data**: ticker, price, callWall, putFloor, gammaFlipLevel, distance-to-levels
- **Hook**: "$NVDA is 3.4% from a wall most traders can't see."
- **B-roll**: Abstract glass barrier with cyan edge glow in dark navy void

### 2. Pressure Field — "Price is visible. Pressure is not."
- **Data**: ticker, GEX, gamma regime, gammaFlipLevel
- **Hook**: "The pressure beneath $TSLA just shifted."
- **B-roll**: Purple/cyan energy waves pressing against dark surface

### 3. Dark Flow — Institutional dark pool activity
- **Data**: ticker, darkPoolPercent, buyPct, sellPct
- **Hook**: "68% of $AAPL volume just went dark."
- **B-roll**: Dark liquid flowing through invisible channels, bioluminescent

### 4. Regime Clock — Gamma regime duration
- **Data**: gamma regime, duration, GEX, historical data
- **Hook**: "SPY has been in negative gamma for 12 days."
- **B-roll**: Dark clock mechanism with amber/cyan traces

### 5. Ticker X-Ray — Deeper layer beneath a known ticker
- **Data**: Full data snapshot (all fields)
- **Hook**: "What's hiding inside $NVDA right now."
- **B-roll**: X-ray scan effect revealing hidden layers

### 6. Dashboard Reveal — Product conversion
- **Data**: Multiple tickers, product screenshots
- **Hook**: "This is what most traders never see."
- **B-roll**: Dark command center with holographic data streams

---

## G. First Prototype: Hidden Wall (recommended)

**Reasons**: Call Wall/Put Floor/Gamma Flip data is 100% available. Hook is the core brand identity. Visual is simplest to execute. Compliance is safest.

---

## H. Open Questions For Owner

| # | Question | Default if no answer |
|---|----------|---------------------|
| 1 | **ElevenLabs API key** — required, no workaround | Must provide |
| 2 | **Replicate key encoding** — `.env.local` L57 has null bytes | Re-enter as clean ASCII |
| 3 | **Rename alphaScore → "Context Score" for videos?** | Yes |
| 4 | **Voice preference** — male/female, accent, tone? | Deep male, American, calm authority |
| 5 | **Daily API budget for Replicate + ElevenLabs?** | $5-10/day |
| 6 | **YouTube/TikTok channels created?** | Manual upload initially |

---

## I. Implementation Plan (7 Stages)

1. **Foundation** — DataSnapshotBuilder, Scorers, ComplianceSafetyGate
2. **One Premium Template** — HiddenWallShort with mock data
3. **ElevenLabs** — Voice + word-level timestamps + CaptionOverlay
4. **Replicate B-roll** — Cinematic abstract prompts + S3 cache
5. **Render Pipeline** — End-to-end: data → score → script → voice → broll → render
6. **QA Gate** — Pre-render validation
7. **Daily Generation** — Cron, remaining 5 templates, feedback loop

---

## K. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| ElevenLabs cost | Medium | Cap 3-4 videos/day, 30-38s scripts |
| B-roll quality | Medium | Abstract/atmospheric only, never fake charts |
| Compliance violation | High | Hard-coded regex + AI review gate |
| Generic AI content | High | InsightScorer threshold 80, one insight per video |
| YouTube repetition detection | Medium | 6 templates, varied B-roll/voice pacing |
| Replicate API key corruption | Medium | Re-enter `.env.local` line 57 |

---

## L. Immediate Next Command

**MISSION 02**: Build foundation + HiddenWallShort template with mock data.  
**Prerequisites from owner**: ElevenLabs API key, confirm Replicate key, confirm "Context Score" naming.
