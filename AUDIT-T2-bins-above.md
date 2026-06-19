# T2: Audit bins_above hard enforcement

## Enforcement Points

| File:Line | Severity | Enforcement Type | What to Change | Risk |
|-----------|----------|------------------|----------------|------|
| tools/executor.js:790-796 | Critical | Safety check — blocks deploy if bins_above ≠ 0 | Remove `isSingleSidedSol && ...` condition | High — breaks single-side SOL contract with SDK |
| tools/dlmm.js:657-660 | Critical | SDK throw — refuses transaction if bins_above > 0 | Remove throw or add config flag to bypass | High — on-chain failure, position never opens |
| index.js:493 | Info | Comment/documentation | Update comment to reflect new behavior | Low — docs drift |
| prompt.js:126 | Critical | LLM instruction — tells agent to always use 0 | Change instruction to use dynamic bins_above formula | Medium — LLM may still try bins_above=0 if not updated |
| tools/definitions.js:141 | Info | Tool schema docstring | Update description to match new behavior | Low — schema drift |

## SDK Usage (dlmm.js)

- `bins_above` is used in range calculation for BOTH sides (X and Y) — not SOL-specific.
- When `upside_pct` is provided, `bins_above` is calculated from price delta — but still blocked by safety checks for single-side SOL.
- No alternative args bypass the bins_above=0 check — `upside_pct` is converted to `bins_above` internally and then validated.

## Backtest Results

- 0/24 Rule 3 closes had volatility ≥7 — user's premise ("vol≥7 tokens need buffer") doesn't match historical data.
- All Rule 3 closes occurred in low-volatility pools (<7) — suggesting the issue is not volatility but insufficient initial range width or poor timing.

## Recommendation

1. **Do NOT change bins_above enforcement yet** — backtest shows no vol≥7 positions were closed early. Fixing this won't solve the stated problem.
2. Investigate why low-volatility pools are pumping out of range — likely insufficient bins_below (range too narrow) or deploying into pumps.
3. If user insists on testing bins_above > 0, must patch ALL 5 enforcement points simultaneously to avoid silent failures.
4. Add telemetry: log `bins_below`, `bins_above`, `volatility`, and `close_reason` together to correlate range settings with outcomes.