# Mission 22: MarketPressureBrief V17 — Revenue-Grade Rebuild

## 1. Why V16.2 Failed

V16.2 was a patch on V16.1, which was a patch on V16.

| Problem | Detail |
|---------|--------|
| Layout | Same top-text / middle-line / bottom-empty pattern since V14 |
| Audio | Voice ends at ~14s, leaving 6s of dead space |
| Density | Low insight-per-second makes 20.5s feel long |
| Feel | Finance slide/motion poster, not a compelling Short |
| Product contrast | Static comparison card, not an unlock moment |
| Hook | Readable but not curiosity-generating |

**Decision**: Stop the V16 patch loop. Build V17 from scratch.

## 2. What Was Rebuilt

### Template Architecture
| V16.x | V17 |
|-------|-----|
| 7 scenes, same layout | 7 completely new scenes |
| Text-heavy, centered | Data-first, spatial layout |
| Top text + middle line | Close-up visualization + supporting text |
| Static product comparison | Scanner reveal + glow pulse unlock |
| WALL/FLOOR/FLIP in badge | Sequential spotlight with line+label |
| 20.5s (feels long) | 20.0s (higher density) |

### New Scene Structure
| Time | Scene | V17 Approach |
|------|-------|--------------|
| 0.0-1.6s | Pattern Interrupt | Data already on screen. Price dot, wall, bracket, 1.3% hero. Text below viz. |
| 1.6-3.8s | Reveal Hidden Wall | Normal chart → scanner wipe → wall layer appears |
| 3.8-6.5s | Pressure Build | Bracket compresses. Dot pulses. Wall glows. 1.3% isolated. |
| 6.5-9.2s | Pressure Map | Sequential assembly: Wall → Flip → Floor with slide-in |
| 9.2-13.2s | Product Desire | PRICE ONLY (dim) vs STRUCTURE LAYER (bright) with scanner + glow |
| 13.2-16.5s | Insight Recap | WALL / FLIP / FLOOR sequential spotlight |
| 16.5-20.0s | CTA | Logo + tagline + URL, decisive end |

## 3. Why This Is Not Another Patch

- Completely new `.tsx` file, not derived from V16
- New layout philosophy: data visualization first, text supports
- New spatial composition: close-up views, then wide map
- New hook structure: "A WALL YOU CAN'T SEE" instead of "A HIDDEN CALL WALL"
- New audio: longer script extending to ~17.5s
- New product contrast: scanner reveal with system glow, not static card
- New vocab section: sequential line+label spotlight, not badge

## 4. Audio Changes

| Aspect | V16.x | V17 |
|--------|-------|-----|
| Script | 5 phrases, ~13-14s | 6 phrases, ~17-18s |
| Voice | v16_1_voice.mp3 | **v17_voice.mp3 (NEW)** |
| Model | eleven_flash_v2_5 | eleven_flash_v2_5 |
| Voice ID | pNInz6obpgDQGcFmaJgB (Adam) | Same |
| File size | 196.4KB | 312.3KB |
| SFX | V11 reused | V11 reused |
| Bed | v11_bed.mp3 @0.12 | v11_bed.mp3 @0.18 (louder) |

New script includes: "Call wall. Gamma flip. Put floor." — vocabulary section now has voice support.

## 5. Replicate Usage Decision

**NOT USED.** V17 is pure Remotion/SVG/CSS.

Reason: V15 proved that Replicate assets become passive wallpaper when misused. V17's visual authority comes from data clarity and spatial composition, not cinematic textures.

## 6. Frame-by-Frame Review

| Time | Element | Quality |
|------|---------|---------|
| 0.5s | 1.3% hero + bracket + wall + price dot | Discovery feel, not title card |
| 1.5s | Pattern interrupt text + data viz | Higher density than V16 hook |
| 3.0s | Scanner reveal of hidden wall | Dynamic, not static |
| 5.0s | Pressure compression + pulsing dot | Physical gap feeling |
| 7.5s | Map assembly with sequential slide-in | Clean, proportional |
| 10.5s | Product desire: PRICE ONLY vs STRUCTURE | Scanner + glow unlock |
| 13.5s | WALL / FLIP / FLOOR spotlight | Sequential, memorable |
| 16.5s | CTA with logo + URL | Decisive |
| 19.5s | CTA hold | Clean end |

## 7. Honest Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| First 0.5s Stop Power | 88 | Data on screen immediately |
| First 3s Curiosity | 87 | Scanner reveal creates FOMO |
| Visual Hierarchy | 88 | 1.3% always hero, clean layout |
| Pressure Visualization | 86 | Bracket compression, dot pulse |
| Map Clarity | 87 | Sequential assembly |
| Product Desire | 86 | Scanner unlock, but still digital |
| Audio Energy | 85 | Longer voice, but SFX still V11 |
| Silent-first Strength | 88 | Every beat readable without audio |
| Upload Readiness | 86 | Better than V16.2 but still untested |
| **Overall** | **87** | Max 88 without public data |

## 8. Remaining Weaknesses

1. SFX are still V11 reuses, not custom
2. Audio timing is estimated, not frame-exact
3. No mobile compression test (no ffmpeg)
4. Product contrast still digital, not physically satisfying
5. No public viewer data

## 9. Public Test Recommendation

**YES — recommended for first public test.** V17 is a genuine improvement over V16.2 in density, layout, and storytelling flow.

## 10. Automation Status

🛑 **BLOCKED** — No public metrics. SIGNUMHQ_AUTOMATION_GATE.md conditions not met.
