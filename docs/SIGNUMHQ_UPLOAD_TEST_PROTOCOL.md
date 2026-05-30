# SignumHQ Upload Test Protocol

This document establishes the strict separation between internal quality checks and public algorithmic performance tests.

## 1. The Core Doctrine
**Private/unlisted upload is NOT performance proof.**
Internal review can only evaluate technical correctness, not psychological pull.

## 2. Unlisted/Private Testing (Compression Check)
Use unlisted or private uploads **ONLY** for:
- Checking YouTube/TikTok compression algorithms against dark gradients and glowing colors.
- Ensuring text labels remain readable on 6-inch mobile screens.
- Verifying exact audio/video sync post-upload.
- Finding layout collisions with the native platform UI (e.g., Like button, description text).

## 3. Public Upload Testing (Algorithm Data)
To validate a Short, it must be published publicly. We rely on the initial 24-48 hour analytics window.

### Key Metrics to Record:
- **Viewed vs Swiped Away**: The ultimate measure of the first 0.5s lock-in. Target: > 60% Viewed.
- **Average View Duration (AVD)**: Measures pacing and insight density. Target: > 16s for a 20s video.
- **Completion Rate**: Target > 75%.
- **Rewatch Estimate**: Does the complexity of the data encourage a second loop?

## 4. Decision Rules based on Data
If a video underperforms, use this framework to adjust the engine for the next generation:
- **If first 2s retention is weak**: The Hook is failing. Rewrite the script and increase visual contrast.
- **If 5s retention is weak**: The payload isn't clear enough. Strengthen the insight text.
- **If 10s retention is weak**: The video is stalling. Improve the pacing and motion density.
- **If completion is high but clicks/conversions are low**: The video is entertaining but lacks product desire. Strengthen the CTA and Normal Chart vs SignumHQ contrast.
- **If views are high but retention is low**: The packaging (title/topic) is clicky, but the video fails to deliver the promise.
- **If retention is high but views are low**: The video is structurally excellent, but the packaging/topic is not algorithmically attractive.

## 5. Test Logging
All tests must be recorded in `out/upload_tests/signumhq_shorts_test_log.csv`.
