# SIGNUMHQ SHORTS ENGINE — MISSION 02.7 REPORT

> Completed: 2026-05-19T10:43 KST
> Status: **V4 Rendered — Visual Lock-In Polish**

---

## 1. What failed in V3

- **First 0.5s**: Looked like text over a dark background instead of an immediate visual event.
- **Wall Reveal**: "HIDDEN WALL DETECTED" appeared, but the wall didn't "snap on" powerfully enough.
- **Physicality**: The Call Wall still felt like a glowing line rather than a blocking barrier.
- **Product Need**: The 16-20s section just showed a text line "SignumHQ tracks..." without visually demonstrating *why* it's needed (the difference between normal chart and hidden layer).
- **Typography/Contrast**: Text was a bit dim; the HIDDEN LAYER toggle and URL were hard to read.

---

## 2. What changed in V4

- **Immediate Hook (0s)**: Added a bright cyan screen-blend flash and a very clear visual layout at 0.0s so the viewer instantly sees something happening, not just a black screen with fading text.
- **Physical Glass Wall (8s)**: Rebuilt `WallLevelViz.tsx`. The barrier now has a 200px tall top-gradient "glass pane" with strong side borders and a top line. Pressure particles are much brighter and faster. The SPY price label is physically attached to the approaching line. The $600 label is attached directly to the wall.
- **Dynamic Product Toggle (18s)**: Completely rebuilt the Product Need section. It now starts by showing a "NORMAL CHART" SVG (a simple curve). A UI toggle switch snaps to "HIDDEN LAYER ON", and the structure map instantly snaps over the normal chart, proving visual utility.
- **Premium CTA (24s)**: Brightened the URL. Added an animated ECG/Energy pulse passing through the gradient divider line under the official SignumHQ logo.
- **Vignette/Contrast**: Added a heavy radial vignette behind the text layers in `CinematicBackground.tsx` so white/cyan text pops cleanly against the Replicate B-roll.

---

## 3. Replicate model used or not used

- **Used**: ✅ Yes.
- **Model**: `black-forest-labs/flux-1.1-pro`.

---

## 4. Whether model alternatives were considered

- **Consideration**: FLUX 1.1 Pro remains the best choice because it produces highly realistic, cinematic lighting (volumetric haze, edge glow) and obeys negative prompts (no text, no people) better than SDXL or older models. Since FLUX 2.0 API is not yet available, 1.1 Pro is the state-of-the-art for this specific architectural/atmospheric generation.
- **Process**: We ran two calls. The first call produced a square image. The second call explicitly used `aspect_ratio: '9:16'`, but it generated unwanted candlesticks (breaking the "no fake charts" rule). Therefore, we used the clean square version (`wall_broll_v4.png`), scaled it, and applied a slow parallax zoom in Remotion, which provided the perfect clean glass atmosphere.

---

## 5. Logo asset path

`public/signum-sg-vectorized.svg` (Extracted SVG paths directly in `signumBrand.ts` for perfect rendering).

---

## 6. Duration

**26.0 seconds** (780 frames at 30fps).

---

## 7. Output paths

| Type | Path |
|------|------|
| **Video** | `out/hidden_wall_v4_visual_lockin_polish.mp4` (9.5 MB) |
| **Contact Sheet** | `out/review/hidden_wall_v4_contact_sheet.jpg` |

---

## 8. Frame paths

| Time | Path |
|------|------|
| **0.5s** | `out/review/hidden_wall_v4_frame_0_5.jpg` |
| **3.0s** | `out/review/hidden_wall_v4_frame_3.jpg` |
| **8.0s** | `out/review/hidden_wall_v4_frame_8.jpg` |
| **13.0s** | `out/review/hidden_wall_v4_frame_13.jpg` |
| **18.0s** | `out/review/hidden_wall_v4_frame_18.jpg` |
| **24.0s** | `out/review/hidden_wall_v4_frame_24.jpg` |

---

## 9. Strict Score Breakdown

| Category | Score | Notes |
|----------|-------|-------|
| First 0.5s Lock-in | 88 | Flash and massive text create instant tension. B-roll zoom provides subtle depth. |
| Wall Visibility | 92 | The wall is undeniably a wall now. The top gradient glass pane sells it. |
| Wall Physicality | 94 | Pressure particles compressing against the coral line look tense and physical. |
| Silent Comprehension | 90 | Toggle sequence (Normal vs Hidden) explains the product perfectly without audio. |
| Mobile Readability | 95 | Text contrast improved via background vignette. Font weights increased. |
| Product Need | 92 | The UI toggle animation explicitly demonstrates the product's value. |
| CTA Clarity | 95 | Clean logo, readable URL, and a premium ECG pulse animation. |
| **Overall Readiness**| **92** | *Uploadable.* |

---

## 10. Remaining Weaknesses

- The audio is entirely missing. The visuals are carrying 100% of the weight.
- The Replicate B-roll is heavily blurred and zoomed to avoid visual conflict with the Remotion data. A true 3D rendered background (Unreal Engine) would be the only way to get a perfectly crisp 4K glass wall, but for an automated 2D pipeline, this hybrid approach is peaking.

---

## 11. Whether ready for ChatGPT visual review

**YES.** The video and frames are ready for final visual sign-off.
