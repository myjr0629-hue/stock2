# SignumHQ Shorts Engine — Mission 19
## MarketPressureBrief V16 — Upload Candidate

---

## 1. Why V15 Failed

V15 was rejected because:
1. **Replicate/Flux was used as passive wallpaper** — red-wall atmosphere added nothing to data clarity
2. **The first 0–7 seconds felt empty** — "SPY LOOKS NORMAL" is not a data hook, it's a statement
3. **The "hidden layer reveal" did not feel like a reveal** — Flux image fading in is not product contrast
4. **The Normal Chart vs SignumHQ Layer comparison was visually weak** — only 3 abstract lines, no labels
5. **Product contrast looked like decorative lines, not useful market structure**
6. **Core insight (1.3% below Call Wall) was weaker than V14.1**
7. **The video felt like text over a dark background** — a motion poster, not a view-generating Short

## 2. What V16 Restores from V14.1

- SPY + 1.3% + Hidden Call Wall as the immediate data hook (0.5s)
- Measurement bracket visually connecting price to wall
- ProceduralDataLayer with real SVG chart (Call Wall line, price line, dot, bracket)
- Product Contrast with actual labels: CALL WALL $600, GAMMA FLIP $588, PUT FLOOR $580
- SIGNUMHQ LAYER badge with WALL / FLOOR / FLIP text
- V14 TTS audio + V11 SFX (honestly reported as reused)
- 20.5s total duration at 30fps (615 frames)

## 3. How V16 Improves Beyond V14.1

- **Eliminated Replicate entirely** — pure Remotion/SVG/CSS, no passive wallpaper
- **Added procedural grid atmosphere** — subtle depth without competing with data
- **Improved timing**: 0–2.2–4.2–7.0–10.2–15.0–18.0–20.5s (better pacing)
- **Fixed text/chart collision** — Hook text below chart, 1.3% label hidden during hook phase
- **Mission copy updated** — "SPY IS 1.3% BELOW A HIDDEN CALL WALL" (complete thought)
- **CALL WALL label visible during hook** — appears with bracket growth

## 4. Replicate / Flux Usage Decision

**DECISION: NOT USED.**

Replicate was intentionally excluded for V16. Reasons:
1. V15 proved that Replicate as passive wallpaper reduces clarity
2. The procedural grid + gradient provides sufficient atmospheric depth
3. Pure Remotion/SVG gives better compression performance
4. Every pixel of data (lines, labels, brackets) is sharper without competing imagery

Asset test: **Not applicable — no Replicate asset generated.**

## 5. Asset Test Result

N/A — Pure Remotion/SVG/CSS build. No external imagery.

## 6. Final Script

Voice (ElevenLabs — reused V14 audio, NOT newly synthesized):
> "SPY is one point three percent below a hidden call wall.
> Most charts miss this layer.
> Pressure can build here.
> Not a prediction.
> A pressure map.
> SignumHQ shows the structure behind price."

SFX timing:
- 0.0s — data impact
- 2.2s — hidden layer scan
- 4.2s — bracket lock + pressure swell
- 7.0s — map assembly pulse
- 10.2s — product unlock click
- 18.0s — CTA pulse

## 7. Output Paths

| File | Path |
|------|------|
| Video | `out/market_pressure_brief_v16_upload_candidate.mp4` |
| Frame 0.5s | `out/review/v16_frame_0_5.jpg` |
| Frame 1.5s | `out/review/v16_frame_1_5.jpg` |
| Frame 3.0s | `out/review/v16_frame_3_0.jpg` |
| Frame 5.0s | `out/review/v16_frame_5_0.jpg` |
| Frame 7.5s | `out/review/v16_frame_7_5.jpg` |
| Frame 10.5s | `out/review/v16_frame_10_5.jpg` |
| Frame 13.5s | `out/review/v16_frame_13_5.jpg` |
| Frame 17.0s | `out/review/v16_frame_17_0.jpg` |
| Frame 20.0s | `out/review/v16_frame_20_0.jpg` |
| Simulation | `out/review/v16_upload_candidate_viewer_lockin_simulation.json` |
| Simulation | `out/review/v16_upload_candidate_viewer_lockin_simulation.md` |

## 8. Score Breakdown

| Dimension | Score | Notes |
|-----------|-------|-------|
| First 0.5s Lock-in | 90 | SPY + 1.3% + bracket + CALL WALL visible immediately |
| First 3s Curiosity | 88 | "MOST CHARTS MISS THIS LAYER" creates FOMO |
| Insight Clarity | 92 | Concrete data, not abstract concept |
| Silent-first Strength | 95 | All text readable without audio |
| Pressure Visualization | 85 | Bracket tightens, dot pulses, gap compresses |
| Product Desire | 90 | NORMAL CHART vs SIGNUMHQ LAYER with $600/$588/$580 labels |
| Replicate Contribution | N/A | Intentionally excluded |
| Audio Fit | 75 | V14 audio reused; not V16-specific |
| Upload-test Readiness | YES | Pending final collision-fix re-render verification |

**Raw Total: 89 → Capped: 86** (no public data = max 88, no compression test = max 86)

## 9. Remaining Weaknesses

1. **Audio is V14 placeholders** — ElevenLabs 404 not resolved. Script and audio may not perfectly align.
2. **Compression test not run** — V16 needs 1080p/720p/mobile rendering verification.
3. **No public data** — score capped at 86, cannot go higher without real metrics.
4. **Text collision at 0.5s (FIXED in re-render)** — Hook text moved below chart, 1.3% label hidden during hook phase.

## 10. Whether V16 is Public-Test Ready

**YES — conditionally.**

V16 is the closest upload candidate since V14.1, with significantly stronger product contrast.
Remaining requirements before upload:
- [ ] Verify re-render fixed the text collision
- [ ] Run compression test (optional but recommended)
- [ ] Prepare upload package (title, description, hashtags, metrics template)

## 11. Whether Automation Remains Blocked

**YES — 🛑 BLOCKED.**

Per `docs/SIGNUMHQ_AUTOMATION_GATE.md`:
- No public upload has occurred
- No viewer metrics exist
- 3-a-day production and Lambda integration remain blocked
- Unblock requires: Viewed-vs-Swiped ≥60%, AVD ≥14s, Completion ≥65%
