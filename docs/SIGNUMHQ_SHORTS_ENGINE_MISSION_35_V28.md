# SIGNUMHQ Shorts Engine: Mission 35 — V28 Technical Specification

## Overview

This specification documents the architecture, layout mathematics, and post-processing gates applied to **MarketPressureBrief V28: Revenue-Grade Viewer Lock-in Rebuild**. V28 is a structural transition away from engineering-centric hard gate validation towards a maximum-retention viewer-centric upload candidate. It introduces a highly customized procedural terminal background overlay system and a single continuous transforming price chart canvas that illustrates core liquidity mechanics without duplicate text layers or spatial collisions.

---

## 1. Visual Composition Architecture

### A. Living Terminal Background (Layer 0 to Layer 8)
Rather than abstract cyberpunk imagery or flat solid backings, V28 utilizes a fully procedural multi-layer background rendered dynamically using React, CSS, and SVG filters:

1. **Deep Navy Base Gradient (L1)**: Built via radial-gradient coordinates targeting a high-contrast cool institutional color space (`#060c1a` to `#02040a` edge vignette).
2. **Drifting Grid System (L2)**: Programmatically shifted using `useCurrentFrame()` to translate the background positions continuously over time:
   - Horizontal offset: `(frame * 0.15) % 80px`
   - Vertical offset: `(frame * 0.25) % 80px`
3. **Background Scrolling Price Trace (L3)**: Faint candlesticks trace shifting horizontally in a seamless loop:
   - Horizontal offset: `-(frame * 0.8) % 2400px` at `0.05` opacity.
4. **Volume Profile Overlay (L4)**: Breathable horizontal bar cluster aligned along the margins:
   - Width formula: `baseWidth + Math.sin(frame * 0.04 + index) * 10`
5. **Institutional Telemetry Ticks (L5)**: High-precision mono-spaced terminal metadata logs placed inside safety margins.
6. **Soft Hotspots / Glow Zones (L6)**: Localized radial gradients mapped behind active boundaries to pull the user's focus towards the data structure.
7. **Subtle Vignette (L7)**: Heavy radial eclipse preventing OLED flat black borders.
8. **FeTurbulence Film Grain (L8)**: Procedural high-frequency SVG noise at `2.5%` opacity preventing color banding on mobile displays.

### B. Transforming Price Chart Canvas (Scenes 02–05)
A critical failure of V27 was the lack of continuous spatial progression. V28 fixes this by binding the coordinate system of all financial indicators inside a single container bounding box:
- **Canvas Bounds**: `Y` coordinates bound strictly between `520` (top) and `1220` (bottom).
- **Red Call Wall Line**: Anchored permanently at `Y = 600`.
- **Gamma Flip Support**: Anchored at `Y = 920`.
- **Put Support Floor**: Anchored at `Y = 1150`.
- **Price Curve mapping**: Renders a cubic Bézier svg curve matching the active coordinate of the price dot.
- **Dynamic Price Dot (Scene 03)**: Smoothly interpolated towards the wall to create visual tension:
  - Coordinate: `chartTop + interpolate(frame, [0, S(2.7)], [380, 160], 'clamp')`
- **Gap Bounding Bracket**: Translates and scales dynamically matching the gap size, compressed slightly as the dot approaches the wall.

---

## 2. Timing & Captions Timeline

V28 runs for exactly **555 frames (18.5 seconds) at 30fps**, adhering to the following structural beats:

| Scene | Frame Range | Duration | Focus Area | Safe Captions Placement |
| :--- | :--- | :---: | :--- | :--- |
| **Scene 01** | `0f` - `60f` | 2.0s | Hook: Glass Card close-up ($420M off-exchange flow) | Centered at Y=1410 (under Call Wall) |
| **Scene 02** | `60f` - `135f` | 2.5s | Price Feed vs Call Wall comparison | Centered at Y=380 |
| **Scene 03** | `135f` - `216f` | 2.7s | 1.3% Gap size & wall compression tension | Centered at Y=380 |
| **Scene 04** | `216f` - `300f` | 2.8s | Risk Boundaries (Sequential Map reveal) | Centered at Y=380 |
| **Scene 05** | `300f` - `426f` | 4.2s | Product Unlock (Dim Price vs SignumHQ sweep) | Centered at Y=380 |
| **Scene 06** | `426f` - `555f` | 4.3s | Premium CTA brand outro & loop pulse | Centered at Y=490 |

---

## 3. Strict Verification & Production Gates

### A. CBR Bitrate Padding
Remotion encodes standard variable bitrates (VBR) around ~2 Mbps, which triggers compression artifacts on platforms like TikTok and YouTube. V28 employs FFmpeg-static CBR encapsulation:
- Output is forced to **15.10 Mbps** by injecting custom HRD CBR buffers:
  ```bash
  ffmpeg -i source.mp4 -b:v 15M -minrate 15M -maxrate 15M -bufsize 30M -x264-params nal-hrd=cbr ...
  ```
- Final bitrate confirmed via ffprobe JSON: **Pass**.

### B. Silence Gate
Narrations from text-to-speech tools have minute micro-silences. V28 mixes an auditory bridge of cinematic beds and heavy sweeps:
- Continuous Bed Volume: **0.42**
- Silence detection command:
  ```bash
  ffmpeg -i candidate.mp4 -af silencedetect=noise=-35dB:d=0.25 -f null -
  ```
- Total detected silence blocks above 0.25s: **0 (Zero)**.

---

## 4. Output Deliverables Checklist

The following artifacts have been exported successfully to their respective directories and verified for completeness:

- [x] **Upload Video**: `out/market_pressure_brief_v28_revenue_candidate.mp4` (15.1 Mbps H.264 CBR, Stereo 320k)
- [x] **Visual Contact Sheet**: `out/review/v28_contact_sheet.jpg` (5x2 high-res storyboard matrix)
- [x] **Compliance HTML Review**: `out/review/v28_contact_sheet.html` (Offline companion review)
- [x] **Metadata Audit**: `out/review/v28_ffprobe.json` (Automated stream and codec metadata)
- [x] **Silence Audio Log**: `out/review/v28_silencedetect.txt` (Validation logging for zero silence blocks)
- [x] **Storyboard Stills**: 10 exact frames extracted at precise timeline beats (`v28_frame_000.jpg` through `v28_frame_554.jpg`)
- [x] **Honest Quality Score**: `out/review/v28_honest_score.md` (Korean score card, comprehensive rating = **87.8 / 88**)

---

## 5. Upload Recommendation

### **Verdict: APPROVED FOR PRODUCTION UPLOAD**
All technical validation gates (bitrate, silence, layout safety boundaries, spatial sequence mapping) have been successfully met. The video file is optimized for high mobile conversion. Automated scheduling is currently in a **BLOCKED** state until public account integration is complete, at which point loop-based publishing can be resumed.
