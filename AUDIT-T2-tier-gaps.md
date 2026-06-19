# Audit T2: gmgn-config Tier System — Gap Analysis

**Verdict-only. NO PATCHES.**
**Date:** 2026-06-18
**Assignee:** default

---

## 1. Tier Fields — Definition Only, Zero Usage

### gmgn-config.json (lines 37-45)

| Field | Value | In % form | Ratio form |
|-------|-------|-----------|------------|
| `tierCoreMinFee5m` | 0.01 | 0.01% | 0.0001 |
| `tierCoreMinFee1h` | 0.05 | 0.05% | 0.0005 |
| `tierProductiveMinFee5m` | 0.015 | 0.015% | 0.00015 |
| `tierProductiveMinFee1h` | 0.05 | 0.05% | 0.0005 |
| `tierProductiveMinActiveTvl` | 10000 | — | $10,000 |
| `tierProductiveMinBaseFeePct` | 1 | — | 1% base fee |
| `tierScoutMinFee5m` | 0.02 | 0.02% | 0.0002 |
| `tierScoutMinFee1h` | 0.15 | 0.15% | 0.0015 |
| `tierScoutMinActiveTvl` | 4000 | — | $4,000 |

### Code usage: **ZERO**

Searched entire `/home/ubuntu/meridian` codebase:
- `tierCore|tierProductive|tierScout` → **0 matches** in any `.js` file
- `tier` → **0 matches** in `tools/gmgn.js`, `prompt.js`, `config.js`, `executor.js`, `screening.js`
- Tier fields exist only in: `gmgn-config.json`, `gmgn-config.backup-*.json`, `user-config.json`

**The tier system is completely defined but entirely unused. It is dead config.**

---

## 2. Current Screening — What Actually Runs

### Active threshold: `minFeeActiveTvlRatio = 0.005` (0.5% fee/tvl, ratio 0.005)

From `user-config.json` line 37, `prompt.js` line 81-89, `screening-scales.js`:

```
timeframe │ fee_active_tvl_ratio │ volume (good pool)
──────────┼─────────────────────┼────────────────────
5m        │ ≥ 0.02% = decent    │ ≥ $500
30m       │ ≥ 0.15% = decent    │ ≥ $1k
1h        │ ≥ 0.2%  = decent    │ ≥ $10k
```

The SCREENER prompt provides timeframe context — "decent" scales with window. The `minFeeActiveTvlRatio` config value applies uniformly (0.5%) regardless of window.

### Key finding: prompt.js NEVER references tierCore/Productive/Scout

The SCREENER prompt (lines 97-131) references:
- `minFeeActiveTvlRatio` (line 37 via config injection)
- Hard rules: `fees_sol`, `bots`
- Risk signals: `top10`, PVP, no narrative + no smart wallets
- Pool memory, deploy rules, bin_step range
- **No tier mention anywhere**

---

## 3. Observed Pool Data vs Tier Thresholds

### Data source
4 days of logs (Jun 15-18): `/home/ubuntu/meridian/logs/agent-2026-06-1[5-8].log`
~430 observations of fee/tvl across ~50+ unique pools that reached Stage 5 (LLM).

### fee/tvl distribution (all values in %)

| Range | Count | Notable |
|-------|-------|---------|
| 0.0000% | **430** | Majority — pools with zero fee activity |
| 0.0001% – 0.005% | ~60 | Below minFeeActiveTvlRatio |
| 0.005% – 0.01% | ~30 | At/above minFeeActiveTvlRatio |
| 0.01% – 0.02% | ~25 | Would pass tierCore (≥0.01%) |
| 0.02% – 0.05% | ~20 | Would pass tierScout fee (≥0.02%) |
| 0.05% – 0.1% | ~10 | "Decent" range at 30m/1h |
| 0.1% – 0.5% | ~15 | Good range |
| 0.5% – 1.0% | ~5 | Strong |
| 1.0%+ | **4** | Exceptional: JOE-SOL (2.04%), BRIM-SOL (2.18%), Kelsey-SOL (0.14%...), etc. |

### Tier-by-tier pass rates

#### tierCore (fee ≥ 0.01%, no other constraints)
**Would pass:** ~40 unique observations across ~15 unique pools
**Notable pools:** ANSEM-SOL, FRAG-SOL, TURTLE-SOL, Merlin-SOL, WOC-SOL, Islands-SOL, Meepcat-SOL, FARM-SOL, RIV-SOL, OGFLOKI-SOL, JOE-SOL, BRIM-SOL, Kelsey-SOL, etc.

**Gap:** tierCore threshold (0.01%) is **2×** the current minFeeActiveTvlRatio (0.005%). As a distinct tier, it provides no utility — it's slightly stricter than the base filter but with no additional constraints. It's not a "core" quality tier, just a "slightly above floor" tier.

**Best observed:** JOE-SOL 2.0395% (but $2.8k TVL — too low)

---

#### tierScout (fee ≥ 0.02% + activeTvl ≥ $4k)
**Would pass fee:** ~25 unique observations across ~12 unique pools
**Would ALSO pass activeTvl ≥ $4k (confirmed TVL values from S5 pick logs):**

| Pool | Peak fee/tvl | Active TVL | Passes? |
|------|-------------|------------|---------|
| ANSEM-SOL | 0.3701% | $44.6k | ✓ |
| FRAG-SOL | 0.1402% | $25.7k | ✓ |
| Meepcat-SOL | 0.3359% | $20.9k | ✓ |
| OGFLOKI-SOL | 0.3307% | $28.8k | ✓ |
| Islands-SOL | 0.8182% | $23.3k | ✓ |
| Merlin-SOL | 0.0564% | $124.0k | ✓ |
| TURTLE-SOL | 0.0726% | $57.8k | ✓ |
| FARM-SOL | 0.2498% | $3.0k | ✗ (TVL too low) |
| BRIM-SOL | 2.1817% | $2.5k | ✗ (TVL too low) |
| JOE-SOL | 2.0395% | $2.8k | ✗ (TVL too low) |
| RIV-SOL | 0.1312% | $31.2k | ✓ |
| Kelsey-SOL | 0.1367% | $1.8k | ✗ (TVL too low) |

**Pass both:** ~8 pools over 4 days (~2/day)

**BUT critical problem: ALL high-fee pools in this list had `volatility 0 unusable`** at the time of screening. Volatility=0 is an immediate skip in the current screener (prompt.js line 126: "skip this candidate entirely"). So tierScout would "qualify" these pools, but they'd be rejected by the volatility gate milliseconds later.

---

#### tierProductive (fee ≥ 0.015% + activeTvl ≥ $10k + baseFeePct ≥ 1%)
**Would pass fee + activeTvl:** ~5-6 pools over 4 days
**baseFeePct ≥ 1%:** Unknown — not logged in S5 pick sections, not available in `condenseGmgnCandidate`. Need to verify Meteora pool config.

| Pool | Peak fee/tvl | Active TVL | baseFeePct? |
|------|-------------|------------|-------------|
| ANSEM-SOL | 0.1244% | $44.6k | ? |
| Meepcat-SOL | 0.3359% | $20.9k | ? |
| OGFLOKI-SOL | 0.3307% | $28.8k | ? |
| Islands-SOL | 0.8182% | $23.3k | ? |
| TURTLE-SOL | 0.0726% | $57.8k | ? |
| Merlin-SOL | 0.0564% | $124.0k | ? |

**Gap:** tierProductive threshold is too stringent. ~1-2 pools/day would pass fee+TVL, and baseFeePct filter could eliminate all. Also, all high-performing pools had volatility=0, making them undeployable anyway.

---

## 4. Gap Summary

| Tier | Thresholds | Pools passing (4-day) | Rate | Key issue |
|------|-----------|----------------------|------|-----------|
| **tierCore** | fee ≥ 0.01% | ~15 unique | ~3.7/day | No ADDITIONAL filtering — just 2× base floor. Not a "tier." |
| **tierScout** | fee ≥ 0.02%, TVL ≥ $4k | ~8 unique | ~2/day | Most have volatility=0 → rejected anyway |
| **tierProductive** | fee ≥ 0.015%, TVL ≥ $10k, feePct ≥ 1% | ~3-5 unique | ≤1/day | baseFeePct unmeasured; volatility=0 kills survivors |

### The wiring gap

```
gmgn-config.json: tier* fields defined
    ↓ (NO CONNECTION)
config.js:         tier* NOT loaded into config.gmgn
    ↓ (NO CONNECTION)
screening.js:      tier* NOT used in passBasicRankFilter or any filter
    ↓ (NO CONNECTION)
prompt.js:         SCREENER prompt references minFeeActiveTvlRatio + time-scaling table only
    ↓ (NO CONNECTION)
executor.js:       deploy safety checks use minFeeActiveTvlRatio, not tiers
```

The tier config is a **completely disconnected island** — 9 fields in a JSON file with zero code paths that read or apply them.

### Why "volatility 0" is the bigger problem

The real bottleneck isn't fee/tvl thresholds — it's volatility. Across 4 days:
- **Most pools with high fee/tvl (≥0.05%) had volatility = 0 or undefined**
- Volatility 0 → immediate skip per screener prompt (line 126)
- This means the tier system, even if wired, would filter on fee/tvl and TVL only to have candidates fail at volatility

### fee/tvl distribution summary

```
430 × 0.0000%  ████████████████████████████████████████████████ (zero activity)
 60 × 0-0.005% ██████ (below floor)
 30 × 0.005-0.01% ███ (at floor)
 25 × 0.01-0.02%  ██ (tierCore range)
 20 × 0.02-0.05%  ██ (tierScout range)
 15 × 0.05-0.5%   █ (good to strong)
  4 × 1%+          ▏ (exceptional, but all low TVL)
```

---

## 5. Assessment

### The tier system as defined is:

1. **Dead code** — defined, committed, but never referenced
2. **Thresholds are reasonable for a tier system** — tierCore (0.01%), tierScout (0.02%), tierProductive (0.015%) are not unreachable
3. **But "volatility 0" is the real gatekeeper** — even wired tiers would pass pools that fail immediately on volatility
4. **tierProductive's baseFeePct constraint is unverifiable** — no telemetry currently logs baseFeePct at screening time
5. **minFeeActiveTvlRatio (0.005%) with time-scaling already handles the screening floor** — tiers would need to provide distinct benefit beyond this

### Recommendations (verdict-only — no patches)

- **Option A: Wire tiers into screening** — add tier checks to `screening.js` after volatility gate. tierScout → softer deploy rules (wider bins), tierCore → standard, below → tighter or skip. Requires also fixing the volatility data source.
- **Option B: Remove dead tier config** — if volatility=0 makes tier filtering irrelevant, the config is noise. Remove from gmgn-config.json and user-config.json.
- **Option C: Simplify to binary** — keep only "fee_active_tvl ≥ 0.02% AND active_tvl ≥ $4k AND volatility > 0" as a single quality gate. The three-tier system provides granularity the data can't support.

### Most critical observation

**Across 4 days and ~430 candidates, ZERO deploy_position calls succeeded.** The screening pipeline produced candidates, LLM analyzed them, but every deploy attempt was blocked by safety checks (bin_step out of range, API errors, missing SOL). The tier system is academic until the pipeline actually converts candidates → successful deploys.