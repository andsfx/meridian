# AUDIT-T4: Pool-Memory Cooldown Rule 3 Bug

## Critical Finding

**File:** `pool-memory.js`
**Function:** `recordDeployPerformance`
**Current logic:** Only triggers cooldown on "repeat fee-generating deploys" (line 202-205). Requires `isFeeGeneratingDeploy(d)` to be true, which checks `fee_earned_pct >= minFeeEarnedPct` (default 3%).

## Evidence: FARM-SOL

- 5 total deploys
- 4 closed via Rule 3 (pumped far above range)
- All 5 are fee-generating (fees > 0)
- **Cooldown NOT set** — because fee_earned_pct may be < 3% (early closes)

## Root Cause

The cooldown trigger logic ignores Rule 3/OOR closes as failures. It only counts "fee-generating" deploys, but Rule 3 closes often have low fees (position closed early).

## Recommendation

Modify cooldown logic to also count Rule 3 closes as failures. Add a new trigger:

```javascript
// After line 205 in pool-memory.js
const repeatedRule3Closes =
  recentDeploys.length >= triggerCount &&
  recentDeploys.filter((d) => isOorCloseReason(d.close_reason)).length >= Math.ceil(triggerCount * 0.5);

if (repeatedRule3Closes) {
  const reason = `repeated Rule 3 closes (${triggerCount}x)`;
  // Set cooldown same as fee-generating case
}
```

**Impact:** Toxic pools like FARM-SOL (chronic OOR) will be blocked after 3+ Rule 3 closes.

**Risk:** Low — only affects pool memory, not core trading.

Final: kanban_block(reason='audit done, awaiting synthesis T5').