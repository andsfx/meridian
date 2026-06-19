# AUDIT-T3: Evolution System Gaps

## Critical Finding

**File:** `lessons.js`
**Function:** `evolveThresholds`
**Current params evolved:** minFeeActiveTvlRatio, minOrganic, outOfRangeWaitMinutes, minTvl, minMcap, minHolders, minVolume

## Missing from evolution

- `stopLossPct` (no reference in lessons.js)
- `binsAbove` (no reference in lessons.js)

## Why this matters

Evolution tightens entry gates (minTvl, minMcap) but win rate stays at 15-16%. The actual losses come from:
- Stop loss (-5% too tight — kills fee-collecting positions)
- Rule 3 closes (bins_above=0 — no buffer for pumps)

Evolution ignores strategy params that control exit behavior.

## Recommendation

Add `stopLossPct` and `binsAbove` to `evolveThresholds` function.

**Impact:** Auto-tuning would optimize both entry AND exit parameters, leading to higher win rates.

**Risk:** Low — only affects auto-tuning, not base config.

## Fix Implementation

Add to `evolveThresholds`:

```javascript
// ── 5. stopLossPct ─────────────────────────────────────────────
{
  const current = config.management.stopLossPct ?? -5;
  // Logic to adjust based on fee recovery vs loss severity
}

// ── 6. binsAbove ───────────────────────────────────────────────
{
  const current = config.binsAbove ?? 0;
  // Logic to adjust based on Rule 3 close frequency vs volatility
}
```

Final: kanban_block(reason='audit done, awaiting synthesis T5').