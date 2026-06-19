# AUDIT-T11: minTvl Evolution Logic

## Critical Bug — High Severity

**File:** `lessons.js:479`
**Bug:** Uses `state.json` positions (historical archive) to count recent closed positions. But `state.json` only contains CLOSED positions (not active), and the filter `p.closed_at` is always true — so `recentClosed` is empty.
**Current behavior:** Relaxation (`< 3 deploys/7d`) never fires. Tightening fires based on stale/no data → minTvl keeps rising ($2197→$3218) without evidence.
**Expected behavior:** Use `lessons.json` performance array with `recorded_at` as proxy for deploy time.
**Fix:** Replace state.json read with lessons.json perfData filter using recorded_at.

## Data Evidence

- `state.json`: 95 positions, ALL have `closed_at` → historical archive, not active state
- `lessons.json`: 42 performances in last 7 days, avg TVL $29,911, win rate 61.9%
- Market TVL now: $1.5k-2.5k — gate $3.2k is too high, causing no-deploy cycle

## Fix Implementation

```javascript
// BEFORE (lessons.js line 479)
const s = config.screening;
let positions = [];
try {
  const stateData = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  positions = Object.values(stateData.positions || {}).filter((p) => p.closed_at);
} catch { /* ignore */ }

// AFTER
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const recentClosed = perfData.filter((p) => {
  const recorded = Date.parse(p.recorded_at);
  return Number.isFinite(recorded) && Date.now() - recorded < SEVEN_DAYS;
});
```

## Verification

After patch:
1. Check logs: should show "Funnel starve: X deploys/7d — relaxing gates"
2. Verify minTvl decreases from $3218 to ~$1500 (based on market TVL)
3. Confirm deploy happens on Vort-SOL ($1.5k TVL) or COZY-SOL ($2.5k TVL)

Final: kanban_block(reason='audit done, awaiting synthesis T5').