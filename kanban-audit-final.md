# Meridian DLMM Bot: Lifecycle Audit Synthesis Report

**Audit Date:** 2026-06-15
**Auditor:** Hermes Agent

This report synthesizes the findings from a full lifecycle audit of the Meridian DLMM bot, covering Screening/Filtering, Deploy/Entry, Yield/Fee Tracking, and Exit/Cooldown mechanics.

## 1. Structural Architecture & Health

The bot operates a 4-phase lifecycle:
1. **Screening & Filtering:** Fetch candidates (GMGN/Meteora) → Enforce quality gates.
2. **Deploy & Entry:** Construct DLMM range → Enforce safety constraints → Send on-chain transaction.
3. **Monitoring (Yield & Fee):** Track PnL, out-of-range status, and accrued fees via Meteora/Jupiter APIs.
4. **Exit & Cooldown:** Enforce deterministic close rules (TP, SL, OOR) → Execute close (Zap/SDK) → Apply cooldowns to prevent churn.

### 🔴 CRITICAL INCIDENT: Missing Core Modules (P1)
The most severe finding of this audit is that **14 deterministic entry quality rules are completely dead in production**.
- The file `hardcoded-entry.js` is missing (only a `.bak-nullfix` backup exists).
- Companion modules `metric-normalizers.js` and `loser-cooldowns.js` are also missing.
- Because `npm test` only runs a syntax check (`node --check`), the fact that three test files (`test-fee-tvl-normalization.js`, `test-hardcoded-entry-regression.js`, `test-memory-trend-guard.js`) import these missing modules has failed silently.
- **Impact:** The bot is currently operating without critical pre-entry checks (organic score limits, bot/bundler concentration checks, fresh wallet combos, etc.). Only the basic API string parameters and the lightweight `getRawPoolScreeningRejectReason` logic are protecting capital.

## 2. Phase Misalignments & Race Conditions

### 🟡 GMGN Null-Guard Leaks vs Meridian Strictness (P2)
There is a structural mismatch in how missing data is handled between the GMGN enrichment phase and the Meridian core logic:
- **Meridian Core:** `getRawPoolScreeningRejectReason` uses a strict `numeric()` helper. If data (like `mcap` or `feeActiveTvlRatio`) is missing (null), it maps to `null`, and the condition `== null || < threshold` correctly **rejects** the pool (fail-closed).
- **GMGN Enrichment:** `analyzeTokenInfo` uses a `num(value, fallback=0)` helper. If data like `bot_degen_rate`, `top_10_holder_rate`, or `fresh_wallet_rate` is missing from the GMGN API, it defaults to `0`. A check like `0 > maxBotDegenRate` evaluates to `false`, allowing the pool to **pass** the filter (fail-open).
- **Impact:** During API degradation, highly concentrated or bot-dominated pools can slip through the GMGN filter phase.

### 🟢 Deploy Phase Alignment (Healthy)
The deploy phase (`executor.js`) correctly enforces constraints that align with screening goals:
- `bin_step` limits are strictly enforced.
- Single-sided SOL deployment is hardcoded (`amount_x` must be 0).
- Duplicate pool/base-mint deployments are prevented using cache-busted (`{ force: true }`) state checks, mitigating race conditions where the screener might pick up a pool that was just deployed.

## 3. Exit & Cooldown Effectiveness

### 🟢 Deterministic Exit Routing
The close logic (`getDeterministicCloseRule` in `index.js`) is robust and handles multiple exit vectors: Stop Loss, Take Profit, Pumped Out-of-Range (fast exit), Standard Out-of-Range (wait timer), and Low Yield.
- **Data Anomaly Protection:** It includes a critical "Sanity Cap" that bypasses PnL checks if a position drops `<-90%` but holds value `>$0.01`, protecting against Jupiter API pricing glitches triggering fake stop-losses.

### 🟢 Cooldown Cascades
Cooldowns are applied immediately post-close by `pool-memory.js` and enforced by `screening.js` / `executor.js`:
- **Low Yield Closes:** 4-hour pool cooldown.
- **Repeated Out-of-Range:** 12-hour cooldown on BOTH the pool and the base mint.
- **Over-Harvesting:** Configurable cooldown for repeatedly deploying into the same fee-generating asset.
- **Impact:** The system successfully prevents churn cycles (re-entering the same failing or flat asset).

## 4. Config Drift & Metric Tracking

### 🟡 Dual-Config Divergence
- The system operates with a dual-config setup: `user-config.json` and `gmgn-config.json`.
- When `screeningSource: "gmgn"`, threshold checks for `minMcap`, `minHolders`, etc., are pulled from `gmgn-config.json`, effectively ignoring values set in `user-config.json`. This causes confusion and config drift if tuning is applied to the wrong file.

### 🟢 Yield/Fee Metric Accuracy
- Yield tracking is accurate: `fee_per_tvl_24h` is pulled directly from the Meteora `/pnl` API via `safeNum()`.
- Unclaimed fees are calculated dynamically by multiplying on-chain X/Y fee amounts by real-time Jupiter prices.

## Final Recommendations

1. **EMERGENCY REPAIR:** Immediately restore `hardcoded-entry.js` (from `.bak-nullfix`), `metric-normalizers.js`, and `loser-cooldowns.js`. Wire them back into `tools/screening.js` to restore the 14 lost quality gates.
2. **Fix GMGN Fail-Open Leaks:** Update `tools/gmgn.js` to use an `optionalNum()` helper that returns `null` instead of `0`. Apply the `== null` rejection pattern used in Meridian core to ensure fail-closed behavior on missing concentration data.
3. **CI/Test Hardening:** Update `npm test` to actually execute module imports, not just run `node --check`, to catch missing-file regressions immediately.
4. **Config Unification:** Consider merging or strictly documenting the boundary between `user-config.json` and `gmgn-config.json` to prevent operator error during threshold tuning.
