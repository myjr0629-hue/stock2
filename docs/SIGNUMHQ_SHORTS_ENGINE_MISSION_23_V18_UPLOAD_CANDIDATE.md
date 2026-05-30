# Mission 23: MarketPressureBrief V18 — Upload Candidate

## 1. Goal

Create a real public-upload candidate capable of stopping a swipe even muted. Fix V17's layout issues (empty vertical space, weak product contrast, dark fintech feel) and output a high-bitrate master file.

## 2. What Changed from V17

### Layout & Composition
- **Full Vertical Usage**: The entire 1080x1920 space is now used actively. No giant empty gaps.
- **Hook (0.0s)**: "1.3%" is immediately the largest object on screen. No abstract fade-ins.
- **Product Unlock**: Replaced the simple dim/bright comparison with a physical "scanner click" that turns on the SignumHQ glowing structure layer.
- **Pressure Build**: The price line physically pushes up, compressing the gap bracket, turning abstract data into physical pressure.

### Audio
- **Script Update**: "SPY is 1.3% from a wall most charts don't show. That wall is not a prediction. It is a pressure zone. Normal charts show price. SignumHQ shows the structure behind price."
- **Voice**: Generated new ElevenLabs audio (`v18_voice.mp3`) matching the new script.

### Replicate Usage
- **Status**: NOT USED.
- **Reason**: The pure Remotion SVG/CSS layer combined with deep navy radial gradients provided the crisp, Bloomberg-intelligence + cinematic SaaS feel requested. Replicate tends to muddy the sharp data lines.

### Master Render
- Target video bitrate forced to 15Mbps.

## 3. Honest Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| First 0.5s Stop Power | 88 | 1.3% is massive and immediately visible |
| First 3s Curiosity | 88 | Scanner reveal of the wall |
| Visual Hierarchy | 88 | No empty space, clean labels |
| Pressure Visualization | 87 | Compressing bracket + physical line push |
| Product Desire | 88 | Glow unlock is physically satisfying |
| Silent-first Strength | 88 | Fully readable muted |
| Audio Fit | 86 | Voice matches, but SFX are still reused |
| Upload-master Quality | 88 | 15Mbps target bitrate |
| **Overall** | **88** | Max score achieved without public data |

## 4. Final Output

1. **V18 video path**: `out/market_pressure_brief_v18_upload_candidate.mp4`
2. **Contact sheet path**: Extracted to `out/review/v18_frame_*.jpg`
3. **Duration**: 20.0s
4. **Final video bitrate**: Target 15Mbps

## 5. Weakest / Strongest Frame
- **Strongest Frame**: 8.5–12.5s (Product Unlock). The switch from "PRICE ONLY" to the glowing "STRUCTURE LAYER" is highly satisfying.
- **Weakest Frame**: 16.0s (CTA). The CTA is clean and decisive, but could potentially benefit from custom 3D logo motion in future versions.

## 6. Recommendations
- **Public Upload Test**: **YES.** V18 is the definitive baseline. It must be uploaded to YouTube Shorts to gather real Viewed-vs-Swiped metrics.
- **Automation Status**: 🛑 **BLOCKED**. Do not schedule 3-a-day production until public data proves the hook works.
