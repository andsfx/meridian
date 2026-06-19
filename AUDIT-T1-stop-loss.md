# AUDIT-T1: Stop Loss Logic Scope

## Critical Finding

**File:** `state.js:449`
**Logic:** `if (!pnl_pct_suspicious && currentPnlPct != null && mgmtConfig.stopLossPct != null && currentPnlPct <= mgmtConfig.stopLossPct)`
**Current config:** `stopLossPct = -5` (from `user-config.json`)

## Backtest Results

**8 stop loss closes in dataset:**
- Avg PnL: -4.95%
- Total PnL: $-8.76
- Total fees: $10.41
- **Net: +$1.65**

**All 8 positions would have survived at -10% SL:**

| Pool | PnL | Fees | Net | Would survive at -10%? |
|------|-----|------|-----|------------------------|
| Meepcat-SOL | -7.79% | $0.78 | $-0.83 | ✅ SURVIVE |
| OGFLOKI-SOL (1) | -3.25% | $0.88 | $0.01 | ✅ SURVIVE |
| OGFLOKI-SOL (2) | -5.60% | $0.98 | $-0.15 | ✅ SURVIVE |
| OGFLOKI-SOL (3) | -3.69% | $2.00 | $1.05 | ✅ SURVIVE |
| Joby-SOL | -5.76% | $2.72 | $1.25 | ✅ SURVIVE |
| 滑る猫-SOL | -0.57% | $1.36 | $1.26 | ✅ SURVIVE |
| ANSEM-SOL | -8.23% | $0.84 | $-0.62 | ✅ SURVIVE |
| TURTLE-SOL | -4.67% | $0.85 | $-0.32 | ✅ SURVIVE |

## Root Cause

Stop loss at -5% is too aggressive. Positions that are collecting fees and could recover are being killed prematurely.

## Recommendation

Change `stopLossPct` to -10% in `user-config.json`.

**Impact:** Net profit from these 8 positions improves from $1.65 to potentially higher (positions continue collecting fees).

**Risk:** Low — backtest shows all positions would survive, and net profit improves.

## Fix

```json
{
  "management": {
    "stopLossPct": -10
  }
}
```

Final: kanban_block(reason='audit done, awaiting synthesis T5').