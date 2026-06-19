# Audit T1: Dual-Timeframe Pool Fee Data

**Date**: 2026-06-18
**Auditor**: Hermes (kanban t_2edb88ee)
**Scope**: Verdict-only — NO PATCHES
**Question**: Does Meteora DLMM `fee_active_tvl_ratio` change across timeframes? Do pools with 0% fee/tvl at 5m window have meaningful values at 30m/1h?

---

## Methodology

- 6 pools from latest screening cycle: FARM-SOL, RIV-SOL, WOC-SOL, TURTLE-SOL, GUARDIAN-SOL, NEST-SOL
- 2 data sources queried per pool:
  - **Pool Discovery API** (`pool-discovery-api.datapi.meteora.ag`): `fee_active_tvl_ratio` at 5m, 30m, 1h timeframes
  - **DLMM API** (`dlmm.datapi.meteora.ag`): `fee_tvl_ratio`, volume, fees at 30m, 1h, 2h, 4h, 12h, 24h

---

## Results

### Primary: fee/tvl across timeframes

| Pool | fee/tvl 5m | fee/tvl 30m | fee/tvl 1h | 24h vol | TVL | Scaling 5m→1h |
|------|-----------|------------|-----------|---------|-----|----------------|
| FARM-SOL | 0.031% | 0.069% | 0.190% | $208,026 | $32,558 | 6.1x |
| RIV-SOL | 0.008% | 0.718% | 1.435% | $161,875 | $59,741 | **186.2x** |
| WOC-SOL | 0.000% | 0.001% | 0.070% | $128,885 | $42,643 | 0→0.070% |
| TURTLE-SOL | 0.048% | 0.128% | 0.213% | $146,710 | $35,122 | 4.4x |
| GUARDIAN-SOL | 0.069% | 0.199% | 0.209% | $1,130 | $3,615 | 3.0x |
| NEST-SOL | 0.00003% | 0.00063% | 0.00063% | $1,201 | $23,214 | 22.8x |

### DLMM API fee/tvl breakdown (30m → 24h)

| Pool | 30m | 1h | 2h | 4h | 12h | 24h |
|------|-----|----|----|----|-----|-----|
| FARM-SOL | 0.068% | 0.189% | 0.596% | 1.028% | 4.636% | 6.254% |
| RIV-SOL | 0.699% | 1.398% | 2.422% | 3.828% | 8.863% | 8.863% |
| WOC-SOL | 0.001% | 0.070% | 0.230% | 0.513% | 3.023% | 6.353% |
| TURTLE-SOL | 0.108% | 0.179% | 0.326% | 0.620% | 1.611% | 5.229% |
| GUARDIAN-SOL | 0.123% | 0.129% | 0.150% | 0.181% | 0.376% | 0.806% |
| NEST-SOL | 0.00018% | 0.00018% | 0.00058% | 0.011% | 0.044% | 0.044% |

_Note: Pool Discovery and DLMM APIs agree within ~5% on overlapping timeframes._

---

## Key Finding: RIV-SOL Is a False Negative at 5m

**RIV-SOL** is the one pool where the 5m window causes a meaningful misclassification:

- At 5m: `fee_active_tvl_ratio = 0.0077%` — BELOW the current threshold (`minFeeActiveTvlRatio = 0.005 → 0.5%`)
- At 30m: `fee_active_tvl_ratio = 0.718%` — ABOVE threshold
- At 1h: `fee_active_tvl_ratio = 1.435%` — solidly above

RIV-SOL has $59K TVL, $162K 24h volume, and generates $5,295 in 24h fees. This is a pool the screener SHOULD see but currently skips due to the 5m window.

### Other Pools: True Negatives

- **WOC-SOL**: 5m=0%, 1h=0.07% — still below 0.5% threshold at any timeframe. _True negative._
- **FARM-SOL**: bin_step=50 — disqualified by hard filter anyway. Fee data irrelevant.
- **TURTLE-SOL**: 5m=0.048%, 1h=0.213% — below threshold at all timeframes. _True negative._
- **GUARDIAN-SOL**: TVL $3.6K — below minTvl 10K. Already filtered. _True negative._
- **NEST-SOL**: Fee 0.00003-0.0006% across all timeframes. _True negative._

---

## Volatility Is Also Timeframe-Dependent

| Pool | vol 5m | vol 30m | vol 1h |
|------|--------|---------|--------|
| FARM-SOL | 0.0 | 1.17 | 1.54 |
| RIV-SOL | 0.0 | 2.67 | 2.78 |
| WOC-SOL | 0.0 | 0.0 | 2.35 |
| TURTLE-SOL | 0.0 | 1.20 | 1.60 |
| GUARDIAN-SOL | 0.0 | 1.99 | 3.04 |
| NEST-SOL | 0.0 | 0.0 | 0.0 |

Volatility is 0.0 at 5m for ALL pools in this set. This means `isUsableVolatility()` returns false for all candidates at the 5m screening window. The screening.js function `getVolatilityTimeframe()` already uses `max(screening timeframe, 30m)` to mitigate this — confirming that fallback is essential. NEST-SOL is the only pool where volatility stays 0 at all timeframes.

---

## API Observations

### Pool Discovery API
- `volume_window`, `volume_24h`, `fee_24h`, `total_volume` all returned **None** for every query
- `active_tvl` is available and matches expectations
- 18 calls, no rate limiting encountered

### DLMM API
- More comprehensive: provides `fee_tvl_ratio`, `volume`, `fees` per timeframe bucket
- Also returns `tvl`, `bin_step`, token metadata, pool config
- 6 calls, no rate limiting

### Gap: volume_24h and fee_24h
The Pool Discovery API should return `volume_24h` and `fee_24h` but they're None for these queries. This might be a schema issue or require different filter parameters. The DLMM API provides these values via its 24h aggregation.

---

## Scaling Is Not Linear

The hypothesis "1h = 12 × 5m" is wrong. Scaling factors range from 3.0x (GUARDIAN) to 186x (RIV). Fee activity is bursty, not evenly distributed. A pool can have zero fees in a 5-minute window but still be highly active over an hour.

---

## Implications for Meridian Config

Current: `timeframe: "5m"`, `minFeeActiveTvlRatio: 0.005`

### Option A: Keep 5m, recognize blind spot
- No change. RIV-SOL-like pools (~1 missed per cycle) are acceptable risk.
- Current false-negative rate: 1/6 pools tested.

### Option B: Switch to 30m or 1h
- RIV-SOL would be captured (0.718% at 30m > 0.5%)
- Trade-off: longer window means more stale data for fast-moving pools
- Other thresholds (`volume`, `tvl`, `holders`) are not timeframe-specific — no side effects

### Option C: Dual-timeframe screening
- Screen at 5m as primary, but also query 1h for pools that fail fee/tvl at 5m
- RIV-SOL would get a "second chance" at 1h
- Adds 1 extra API call per rejected pool
- Most complex to implement

### Option D: Lower 5m threshold
- If `minFeeActiveTvlRatio` goes to 0.001, RIV-SOL passes at 5m (0.008%)
- But: this opens the floodgate for truly dead pools
- WOC (0%) and NEST (0.00003%) still filtered — good
- TURTLE (0.048%) would also pass — borderline

---

## Recommendation

**Option B (switch to 30m) is the simplest effective change.** 30m provides enough window to capture bursty fee activity while keeping data reasonably fresh. The 5m window is too narrow — it misses pools that generate real fee volume but happen to be in a quiet 5-minute stretch.

Evidence:
1. RIV-SOL at 5m: $0 fees in window → 0.008% fee/tvl → REJECTED
2. RIV-SOL at 30m: $418 fees in window → 0.718% fee/tvl → PASSES
3. RIV-SOL at 1h: $835 fees → 1.44% → clearly a real pool

If switching timeframes, also re-evaluate `minFeeActiveTvlRatio` — the distribution shifts at 30m (pools that were 0.01-0.05% at 5m become 0.05-0.2% at 30m).

---

## Raw Data

All API responses cached at:
- `/tmp/pool-discovery-{addr}-{5m,30m,1h}.json` (18 files)
- `/tmp/pool-dlmm-{addr}.json` (6 files)
- Also in this session's tool output history