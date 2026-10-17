# KPI source contracts

`refresh.js run rc` now uses the tracked `scripts/hud/rc-auto.mjs` instead of
`~/Documents/signum-work/report-tools/rc-auto.mjs`. `HUD_RC_SCRIPT` still overrides
the reader. No external script is modified. The reader is self-contained because
refresh copies it into its ego IO directory before invoking `ego-run.sh`.

The reader lists spaces, refuses missing or non-agent-owned space 0, then calls
`claimTaskSpace(0)` and `taskSpace(0)`. It opens and closes only its own page and
leaves the shared space available for other operational jobs. No profile selection,
new space creation, login, or write API is used.

`<HUD_WORK>/<KST date>/report/rc-overview.json` sits beside `rc.log`:

- `schemaVersion: 1`, `readAt` (ISO), `source`, `url`.
- `metrics` uses the exact canonical keys `Active Subscriptions`, `Active Trials`,
  `MRR`, `New Customers`, `Revenue`. Each card contains `label` (observed text),
  `value` (number or null), and `display` (observed numeric text or null).
- Case, whitespace, singular/plural labels, and the expanded MRR name are accepted.
  Missing cards stay null; percentage changes and adjacent cards are excluded.
  Compact display values such as `1.2K` are normalized; the display remains available
  because the source may be rounded. Currency symbols are retained in `display`.
- `missing` lists unread cards. `trialToPaidConversion` is null: these cards do not
  identify a trial cohort or its paid conversions. `Active Subscriptions` is kept
  under its source name, without claiming it is a paid-only subscriber count.
  `New Customers` is not relabelled as cumulative registered accounts. Revenue and
  new-customer reporting periods require operational confirmation of the dashboard.
- Overview is saved independently of chart parsing and the existing platform-log
  fallback. A missing Overview output or login failure preserves the previous file.
  A successfully read page with missing cards records their nulls, not older values.

`node scripts/hud/redeem-summary.js` invokes only each allocator's `--count`, then
atomically writes `~/signum-ego-io/redeem-summary.json` and prints the same JSON.
`HUD_WORK`, `HUD_EGO_IO`, and `HUD_REDEEM_SUMMARY` can select isolated paths.
The script never reads a code CSV itself and never logs child output or errors.

**`--used` modifies the ledger; it is not a summary command.** The inspected
allocators require a post URL and indices with that option, then save the ledger.

The summary includes `platforms.ios`, `platforms.android`, and `total`, with:
`distributed`, `confirmedUsed`, `remaining`, `today`, `total` (stock size).
`basis: ledger_comment_confirmation` means manually confirmed comment/ledger use,
not verified store redemptions or paid subscriptions. Apple's distributed count
includes reserved ledger entries. Remaining means unallocated stock, not unused
codes already distributed, and may include expired batches as reported upstream.
Android currently reports only remaining posting stock and today's distribution;
its cumulative distribution, confirmed use, and stock size remain null. Combined
totals are null unless both platforms report the corresponding field.

`sources.loadRcOverview()` and `sources.loadRedeemSummary()` read only these JSON
contracts. Missing, malformed, or unusable files produce `state: pending` and
`msg: 판독 대기`. Partial sources keep individual nulls. Both expose `readAt`,
`ageMs`, and `stale` (40 minutes for RC; 24 hours for the manual redeem summary).
The HUD snapshot exposes them as `live.rcOverview` and `live.redeemSummary`.
No screen labels, markup, or existing shared parsing functions change.

## Offline checks

```sh
node --test scripts/hud/verify-kpi.js
```

Fixtures cover DOM parsing, space control, read-only allocator arguments, missing
counts, loaders, freshness, and refresh/summary file writes. No browser or private
allocator is executed by these checks.

## Operational verification (operations session only)

From the worktree containing these changes, after checking space 0 is available:

```sh
HUD_RC_SCRIPT="$PWD/scripts/hud/rc-auto.mjs" node scripts/hud/refresh.js run rc
node scripts/hud/redeem-summary.js
node -e 'const s = require("./scripts/hud/sources"); console.log(JSON.stringify({rcOverview: s.loadRcOverview(), redeemSummary: s.loadRedeemSummary()}, null, 2));'
```

Compare each `metrics.*.display` with the Overview card and confirm its period and
currency. Check `readAt`, `missing`, the sibling JSON path, and preservation of
`rc.log` platform rows. Android nulls and conversion null are expected. A running
HUD server needs to load the changed modules before its snapshot has the new keys.
