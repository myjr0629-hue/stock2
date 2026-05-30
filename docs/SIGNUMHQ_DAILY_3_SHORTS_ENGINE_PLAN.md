# SignumHQ Daily 3-Shorts Engine Plan

This architecture defines the automated production system required to generate 3 high-quality, lock-in optimized Shorts per day.

## 1. Daily Cadence & Purpose

Every daily batch must include one of each category below to balance reach, searchability, and conversion.

### SHORT 1 — Market Pressure Brief
- **Purpose**: Broad index/ETF structural insight.
- **Targets**: SPY, QQQ, SPX, IWM.
- **Hook Types**:
  - "SPY is 1.3% below a hidden Call Wall"
  - "QQQ is entering a pressure corridor"
  - "SPX is near a gamma flip zone"
- **Best For**: Algorithmic reach + broad market relevance.

### SHORT 2 — Ticker Structure Spotlight
- **Purpose**: Single-stock hidden structure insight.
- **Targets**: High-volume, high-interest equities (e.g., NVDA, TSLA, AAPL, AMD).
- **Hook Types**:
  - "NVDA has a hidden wall above price"
  - "TSLA is near a structure zone most charts miss"
  - "AAPL price is between Wall and Floor"
- **Best For**: Ticker-specific search and fandom/retail engagement.

### SHORT 3 — Hidden Layer Education / Product Desire
- **Purpose**: Teach what SignumHQ reveals without giving financial advice.
- **Hook Types**:
  - "A normal chart shows price. Not pressure."
  - "Wall / Floor / Flip explained in 20 seconds"
  - "Why price alone is incomplete"
- **Best For**: Building trust, product understanding, and driving website conversion.

---

## 2. Template Taxonomy

To support the daily cadence, the rendering engine utilizes the following templates:

### Template A: MarketPressureBrief
- **Usage**: When there is a clear wall/floor/flip event for a major index or ticker.
- **Duration**: 20–22s cut.

### Template B: PressureCorridor
- **Usage**: When price is squeezed tightly between a Call Wall and Put Floor.
- **Visuals**: Focus on dual-sided pressure squeezing the price line.

### Template C: GammaFlipWatch
- **Usage**: When price is exactly at or crossing the Gamma Flip line.
- **Visuals**: Highlighting regime change (positive to negative gamma).

### Template D: HiddenLayerEducation
- **Usage**: Explainer formats.
- **Duration**: Can be a 20s fast-cut or an optional 35–40s extended education cut.

### Template E: TickerSpotlight
- **Usage**: Similar to Template A, but branded for specific equities (e.g., green for NVDA, red for TSLA).

---

## 3. Core Requirements per Output
Regardless of the template, every generated Short MUST include:
1. **Silent-First Text Plan**: Fully comprehensible on mute.
2. **Voice Script Plan**: ElevenLabs synthesis using calm, institutional tone.
3. **SFX Plan**: Accurately timed impacts, pulses, and layer scans.
4. **CTA Plan**: Clean SignumHQ.com call-to-action.
5. **Compliance Gate**: Hard-fail on restricted financial jargon.
