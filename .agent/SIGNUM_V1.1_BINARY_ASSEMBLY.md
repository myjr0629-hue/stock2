# SIGNUM v1.1 — Native Binary Assembly (turnkey)

**Status as of 2026-07-10:** All *web* pieces of v1.1 are DONE, deployed, and dormant.
This doc is the remaining *native binary* work — it needs a real device and cannot be
finished from the web alone. Do it in ONE pass when ready to ship v1.1.

Shell repo root = SIGNUM shell (`capacitor.config.ts`, `appId com.signumhq.app`).
Loads remote `https://www.signumhq.com/en/app-view/dash` (remote webview).

---

## What already shipped to web (live now, inert until this binary)

1. **Ad-removal subscription UI** — `ValueWall.tsx` + `settings/page.tsx`, all gated by
   `IAP_LIVE` in `src/config/iap.ts` (currently `false`). RevenueCat via
   `@revenuecat/purchases-capacitor` (already in root `package.json`). Verified inert on
   the simulator: no Pro card renders while `IAP_LIVE=false`.
2. **In-app review** — `capacitorBridge.ts` (`canRequestReview/requestAppReview/maybePromptReview`)
   via the runtime `Capacitor.Plugins.InAppReview` bridge. Settings "Rate app" row +
   dash auto-prompt (3rd/8th distinct day). **No-op until the plugin below is compiled in.**
3. **Push cold-start deep-link hardening** — `app-view/layout.tsx` persists the tapped
   target to `sessionStorage['signumhq.pendingDeepLink']`; `NativeAppProvider.tsx` polls
   ~2.4s after launch and re-applies it so the root→/dash launch redirect can't clobber it.
   (Plugin already buffers the tap: `retainUntilConsumed:true` in the push plugin — so the
   native event is NOT lost; the bug was the redirect race, fixed in JS. **Confirm on device.**)

---

## Native step 1 — add the in-app-review plugin

```bash
cd <repo root>            # SIGNUM shell
npm i @capacitor-community/in-app-review@^8.0.0
npx cap sync ios
npx cap sync android
```

`cap sync` auto-registers the plugin. Verify it landed:
- iOS: `ios/App/App/capacitor.config.json` plugins list gains `InAppReviewPlugin`; SPM
  `Package.swift` gains `CapacitorCommunityInAppReview` (mirror UC's `uc-app/ios/...`).
- Android: `android/app/src/main/.../MainActivity` or the generated plugin list includes it.

No JS changes needed — the runtime bridge in `capacitorBridge.ts` picks it up automatically
(the settings row + auto-prompt become live once the plugin is present).

⚠️ `cap sync` pollutes `ios/App/build*` (SPM). Do NOT `git add -A` after a device build —
stage only `package.json`, `package-lock.json`, `ios/App/App/capacitor.config.json`,
`ios/App/App/Podfile*`/`Package.swift`, `android/` plugin registration. `.gitignore`
already excludes `uc-app/ios/App/build-device/`; make sure the SIGNUM `ios/App/build*` is
ignored too before committing.

---

## Native step 2 — version bump

`ios/App/App.xcodeproj/project.pbxproj` (both Debug+Release config blocks):
- `MARKETING_VERSION = 1.0` → `1.1`
- `CURRENT_PROJECT_VERSION = 1` → `2`

Android `android/app/build.gradle`: `versionCode` +1, `versionName "1.1"`.

Also flip the settings footer: `settings/page.tsx` `versionNum` `v1.0.0` → `v1.1.0`
(do this in the SAME deploy that the v1.1 binary goes live, not before — web is shared
with current v1.0 users).

---

## Native step 3 — device test (StoreKit sandbox + real push) — THE GATE

Do ALL of these on a real device before flipping `IAP_LIVE` or submitting:

1. **IAP purchase+restore** (StoreKit sandbox account):
   - `IAP_LIVE=true` locally, RC keys set, product `com.signumhq.app.pro.monthly` live.
   - Buy → banner + interstitials disappear immediately; settings shows "✓ Active".
   - Delete+reinstall → Restore returns Pro. Cancel mid-purchase → no error toast.
2. **In-app review**: settings "Rate app" row appears and shows the native sheet.
3. **Push cold-start**: fully kill the app → send a `type:closing` push → tap it →
   lands on Intel (not stuck on dash). Repeat `type:morning` → Guardian brief overlay.
   Warm tap (app open) still deep-links. This validates the JS race fix on device.
4. **iOS cold-start onboarding/locale**: confirm the deep-link doesn't fight the
   first-run locale redirect.

---

## Native step 4 — go live (only AFTER step 3 passes)

1. Flip `IAP_LIVE=false → true` in `src/config/iap.ts`, set RC public keys in Vercel env
   (`NEXT_PUBLIC_RC_IOS_KEY` / `_ANDROID_KEY` — confirm exact names in `iap.ts`), deploy.
   **Never flip this before the cap-synced binary is the live build** — v1.0 users would
   get a purchase button that crashes (no RC plugin) → App Store 3.1.1 risk.
2. Paywall review screenshot for App Store Connect (the ValueWall Pro CTA + settings card).
3. Archive in Xcode (Release), upload, submit v1.1. Android: `bundleRelease` AAB, upload.
4. App Privacy unchanged (tracking = YES stays — real ad units).

---

## Gotchas / invariants

- `IAP_LIVE` must stay airtight: every subscription entry point is `{IAP_LIVE && ...}`.
  Confirmed no leak with the flag off (sim-verified 2026-07-10).
- adManager banner is driven by `setPro`/`wantBanner` gated on `useProStatus().ready`
  in NativeAppProvider — a Pro user never sees a cold-start banner flash. Don't reintroduce
  an unconditional `showBanner()` in the mount effect.
- The review auto-prompt keys off `signumhq.review.days` / `.prompted` — StoreKit throttles
  to ≤3/yr anyway; never prompt on first launch (it's distinct-day gated).
