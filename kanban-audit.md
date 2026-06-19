# Meridian Codebase Audit: Hardcoded Close Logic and Pool Cooldown Rules

## 1. Deterministic Close Logic (`getDeterministicCloseRule` - index.js)

The `getDeterministicCloseRule` operates as the primary risk management layer. It handles five deterministic close types based on configuration settings and position state.

**Key Features:**
*   **Safety Bypass:** Skips execution if `pnl_pct_suspicious` is true (Jupiter API failure/outage), protecting against fake dumps.
*   **Sanity Cap:** Bypasses PnL checks if position value > $0.01 but PnL is suspiciously deep (<-90%), preventing premature stops during extreme data anomalies.
*   **Rules Sequence:**
    1.  **Stop Loss:** Triggered when `pnl_pct <= config.stopLossPct`.
    2.  **Take Profit:** Triggered when `pnl_pct >= config.takeProfitPct`.
    3.  **Pumped Out of Range:** Fast exit when price moves rapidly above range (`active_bin > upper_bin + outOfRangeBinsToClose`).
    4.  **Standard OOR:** Exit when price drifts out of range and stays out for >= `outOfRangeWaitMinutes`.
    5.  **Low Yield:** Exit if pool fee generation per 24h is below `minFeePerTvl24h` and position has been open for at least 60 minutes.

## 2. Close Execution (`close_position` - executor.js)

The executor layer manages the physical interaction with the chain when a close is requested.

**Execution Flow:**
1.  **Tool Authorization Check:** `executeTool` validates the tool against `PROTECTED_TOOLS`.
2.  **Notification & Tracking:**
    *   Fires a notification `notifyClose()` asynchronously.
    *   Logs "low yield" closes directly to pool memory via `addPoolNote` to prevent immediate redeployment by the screener.
3.  **Auto-Swap:**
    *   Automatically swaps the returned base token back to SOL (unless `skip_swap` is requested).
    *   Requires token value >= $0.10.
    *   Appends `auto_swapped = true` to the result, signaling to the LLM agent that manual swap_token is not needed.

## 3. Cooldown and Pool Tracking (`recordPoolDeploy` - pool-memory.js)

The `pool-memory.js` module tracks position lifecycles to prevent rapid reentry into unprofitable pools.

**Cooldown Mechanics:**
*   **Low Yield Closes:** Immediately triggers a 4-hour pool-level cooldown.
*   **Repeated OOR Closes:** If the last `oorCooldownTriggerCount` (default: 3) closes were due to "out of range", a 12-hour cooldown is applied to **both the pool and the base mint**.
*   **Repeated Fee-Generating Deploys:** To prevent over-harvesting the same asset, if the last `repeatDeployCooldownTriggerCount` (default: 3) deploys generated fees, a cooldown (default: 12 hours) is applied based on `repeatDeployCooldownScope` ("pool", "token", or "both").

## 4. On-Chain Submission (`closePosition` - dlmm.js)

The `dlmm.js` module handles the underlying Meteora/Jupiter interactions to finalize the close.

**Key Characteristics:**
*   **Zap-out Execution:** Prefers using the LPAgent relay (`meridianJson("/execution/zap-out/order")`) for optimized routing.
*   **Relay Fallback:** If the relay fails to submit or verify the close within 4 attempts, it falls back to a native SDK "claim -> remove liquidity -> close" sequence.
*   **Performance Recording:** Post-close, it extracts final metrics from the datapi endpoint (Initial USD, Final USD, PnL, Fees, Minutes Held) and calls `recordPerformance()`, storing the outcome in `lessons.json`.
*   **Decision Logging:** Appends a "close" decision trace via `appendDecision()` with the exact reason and metrics.

## Conclusion

The Meridian close and cooldown logic implements a robust, multi-tier defense system. It separates the **decision layer** (deterministic rules), **execution routing** (zap-out vs local SDK), **post-close processing** (auto-swaps), and **future risk mitigation** (pool memory cooldowns). The system is actively designed to avoid repeating mistakes on stagnant, wildly volatile, or low-yield assets through immediate and cascading cooldown periods.
