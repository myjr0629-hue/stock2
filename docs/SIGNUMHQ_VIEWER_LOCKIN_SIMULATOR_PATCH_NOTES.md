# Viewer Lock-in Simulator Patch Notes & Known Issues

## 1. Current Calibration (V2)
- Added hard scoring caps to prevent 90+ scores without public data.
- Enforced strict thresholds for compression readiness and silent-first readability.

## 2. Future Required Patch: "Weakest Segment Identification"
**Status**: Pending (Not blocking public test, but blocking full automation).

### The Issue
Currently, if a video is structurally excellent (like V14.1), the simulator can report "No weakest segment." This is not acceptable for an automated learning engine. Even a 99/100 video has a segment that is relatively weaker than the rest.

### The Fix Required
Before we approve full 3-a-day automation, the simulator must be patched to forcefully output the following, even for strong videos:
1. **Weakest 0.5s segment**: The interval with the lowest motion density or text coverage relative to the rest of the video.
2. **Most cluttered frame**: The frame with the highest bounding-box collision risk.
3. **Most compression-risky frame**: The frame with the deepest gradients or smallest font size.
4. **Most likely drop-off point**: Predicted based on the longest duration between visual "beats".

*Note: Do not implement this patch yet unless it is trivial. This will be addressed after the V14.1 public upload data is received.*
