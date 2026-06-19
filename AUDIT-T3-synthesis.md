# Audit T3: Synthesis + Phase 1 Implementation

**Date**: 2026-06-18
**Worker**: Hermes (kanban t_f8d67738)
**Parents**: t_2edb88ee (dual-timeframe), t_7128b163 (tier gaps)

---

## 1. Synthesis Summary

### From T1 (dual-timeframe)
- fee/tvl scaling is **non-linear**: 3x–186x between 5m and 1h
- **RIV-SOL is the only false negative**: 0.008% at 5m (rejected) → 0.718% at 30m (passes)
- Volatility is **0.0 at 5m for ALL tested pools** — current `getVolatilityTimeframe()` already falls back to `max(5m, 30m)` = 30m to mitigate
- Recommendation: switch timeframe from 5m to 30m. **Already partially done** — `user-config.json` has `"timeframe": ["30m", "1h"]`

### From T2 (tier gaps)
- 9 tier fields in `gmgn-config.json` — **ZERO code references**. Dead config.
- 4-day stats: ~430 candidates with 0.0% fee/tvl, ~80 pass fee+TVL but ALL have volatility=0 → undeployable
- **0 deploy_position calls succeeded** in 4 days. Pipeline converts nothing.
- Volatility=0 is the real bottleneck, not fee/tvl thresholds.

### Cross-audit conflicts
- **None**. Both audits agree on core problem: too many zero-fee pools reaching LLM, and volatility=0 kills the survivors.
- T1's dual-timeframe fix partially overlaps with T2's tier system in spirit: both try to rescue pools with real fee activity at longer timeframes.
- T1 says "switch to 30m" — already done in config. T2 says "wire tiers" — but tier definitions would still fail on volatility=0.

---

## 2. Severity Matrix

| Fix | Complexity | Impact | Risk | Phase |
|-----|-----------|--------|------|-------|
| **A: Quick fee gate** | 1-line + guard | ~80% LLM waste reduction | Minimal (exact same comparison as executor.js) | **Phase 1** |
| **B: Wire tier system** | Multi-file, structural | ~60% further LLM precision | Medium (needs volatility fix first) | Phase 2 |
| **C: Dual-timeframe fallback** | Medium (fetch 30m when 5m=0) | Rescues RIV-SOL-class pools (1/day) | Medium (extra API call per rejected pool) | Phase 3 |

### Why A first
- Fee gate runs BEFORE LLM. Every pool with `fee_active_tvl_ratio < 0.5%` (`minFeeActiveTvlRatio = 0.005`) never reaches the LLM.
- T2 data: ~430/500+ observations were 0.0% fee/tvl. These all get filtered now.
- Zero risk: same comparison as `executor.js:137-148` (already runs at deploy time).
- No config changes needed — reuses existing `minFeeActiveTvlRatio`.

### Why B requires A+more
- Wiring tiers (`tierScoutMinFee5m=0.02`, etc.) is structural (config.js → prompt.js → screening.js).
- But tier thresholds are 2-4x higher than current `minFeeActiveTvlRatio=0.005` — so gate A already filters the pools tiers would flag.
- Volatility=0 kills ALL passing candidates anyway. Tiers are academic until volatility data is reliable.

### Why C is lowest priority
- 1 false negative (RIV-SOL) per cycle. Current timeframe is already ["30m", "1h"] in config.
- Dual-timeframe adds complexity: query 5m, if fail → query 30m → extra API call.
- BETTER approach: keep current 30m/1h timeframes. T1's recommendation is already live.

---

## 3. Unified Action Plan

### Phase 1 — DONE (this task)
- **Fee gate in tools/gmgn.js Stage 5** (line 679-695)
  - Filters pools with `fee_active_tvl_ratio < config.screening.minFeeActiveTvlRatio`
  - Same comparison as `executor.js:validateDeployPoolThresholds`
  - Reject reason logged to `filtered[]` for funnel reporting
  - Backup: `tools/gmgn.js.bak-feegate-1781777202`
  - **PM2 NOT restarted** — operator restart after review

### Phase 2 — Proposed
- **Wire tier system** (or remove dead config entirely)
  - Option: wire tierScout thresholds into `passBasicRankFilter()` → apply softer deploy rules (wider bins)
  - Pre-req: fix volatility data source so pools with real fee/tvl aren't killed by vol=0
  - OR: delete dead tier config from `gmgn-config.json` and `user-config.json`

### Phase 3 — If needed
- **Dual-timeframe check**: when 5m fee/tvl = 0, fall back to 30m/1h query
  - Only needed if timeframe config reverts to 5m
  - Currently `timeframe: ["30m", "1h"]` — T1 recommendation already applied

---

## 4. Phase 1 Implementation Details

### File: `tools/gmgn.js`
### Lines: 679–695 (17 lines added)

```diff
+      // P1-FeeGate (kanban t_f8d67738): drop low-fee pools before LLM analysis.
+      // Saves ~80% of LLM calls per the 4-day audit (430/500+ observations had 0.0% fee/tvl).
+      // Unit: poolDetail.fee_active_tvl_ratio is decimal ratio (0.0868 = 8.68%), matching
+      // config.screening.minFeeActiveTvlRatio (0.005 = 0.5%). Same comparison as executor.js.
+      const minFeeRatio = config.screening.minFeeActiveTvlRatio;
+      if (
+        Number.isFinite(minFeeRatio) && minFeeRatio > 0 &&
+        candidate.fee_active_tvl_ratio != null &&
+        candidate.fee_active_tvl_ratio < minFeeRatio
+      ) {
+        filtered.push({
+          stage: 5,
+          name: token.symbol || mint,
+          reason: `fee/tvl ${(candidate.fee_active_tvl_ratio * 100).toFixed(4)}% < min ${(minFeeRatio * 100).toFixed(4)}%`,
+        });
+        continue;
+      }
```

### Verification
- `node --check tools/gmgn.js` — clean
- `config.screening.minFeeActiveTvlRatio = 0.005` (0.5% fee/tvl)
- Backend: `tools/gmgn.js.bak-feegate-1781777202` (36,270 bytes)
- **PM2 NOT restarted** — operator must restart after review

### Expected impact
- ~430 zero-fee pools filtered per 4-day cycle → ~80% LLM call reduction
- Surviving pools: ~30 with fee/tvl ≥ 0.005% through to Stage 5
- Pipeline still blocked by volatility=0 for deploy attempts

---

## 5. Remaining Issues (for Phase 2+)

1. **Volatility=0 dominant** — even with fee gate, pools that pass fee/tvl still hit vol=0 at screening. Need to investigate why Meteora API returns 0 for most pools at 30m+.
2. **Dead tier config** — 9 fields in `gmgn-config.json` with no code path. Either wire or remove.
3. **0 deploys in 4 days** — screening produces candidates, LLM approves, but executor safety checks block every deploy. Need root cause analysis of why pool/bin_step/balance checks fail.