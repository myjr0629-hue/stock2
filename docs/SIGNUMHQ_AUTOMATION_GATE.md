# SignumHQ Automation Gate

## STATUS: BLOCKED 🛑

**3-a-day automation and Lambda integration are strictly blocked until V14.1 public test data is reviewed.**

We do not scale unproven templates. Internal scores, regardless of how rigorous the simulator is, are not sufficient proof to turn on the automated rendering pipeline.

## Automation Unlock Conditions

The daily production engine (Lambda → Redis → Candidate Selector → Remotion) can ONLY be built and activated if the V14.1 baseline public upload achieves **all** of the following metrics:

1. **Viewed vs Swiped Away**: `>= 60%` (Proves the 0.5s hook works algorithmically).
2. **Average View Duration (AVD)**: `>= 14s` (Proves the insight pacing holds attention).
3. **Completion Rate**: `>= 65%` (Proves the product reveal and CTA do not cause early churn).
4. **Technical Quality**: No severe compression banding or text readability issues reported on mobile.
5. **Compliance**: No platform strikes or shadow-bans regarding financial advice language.

If the V14.1 upload fails any of these targets, the next engineering mission must focus on creating V15 (Hook/Pacing redesign) rather than automation.
