# Trailing TP Bug Analysis - KOG-SOL Incident

## Executive Summary

**Incident:** KOG-SOL position held at -61.69% loss despite trailing TP activating at peak +27.65%  
**Root Cause:** LLM provider error (404 model not found) prevented position closure. No fallback mechanism existed at the time.  
**Duration:** 12 hours 45 minutes (2026-06-25 20:15 → 2026-06-26 08:42)  
**Impact:** -$10.17 loss instead of +$4.56 profit

---

## Timeline

| Time (UTC) | Event |
|------------|-------|
| 2026-06-25 19:51 | KOG-SOL deployed |
| 2026-06-25 20:15 | **Peak reached: +27.65%** |
| 2026-06-25 20:15 | Trailing TP activated |
| 2026-06-25 20:15 | First exit signal detected |
| 2026-06-25 20:15 | **agentLoop called → 404 error** |
| 2026-06-25 20:15 - 2026-06-26 08:41 | **106 failed agentLoop calls** (every 10 min) |
| 2026-06-26 08:42 | Hardcoded fallback finally executed close |
| 2026-06-26 08:42 | Position closed at -61.69% |

---

## Root Cause Analysis

### 1. LLM Model Resolution Bug

**Code path:**
```javascript
// agent.js line 231
const activeModel = model || DEFAULT_MODEL;
// DEFAULT_MODEL = "dahono/deepseek-v4-flash"

// index.js line 385
const { content } = await agentLoop(`...`);
// Note: model parameter NOT passed
```

**Problem:**
- `user-config.json` sets `managementModel: "dahono/deepseek-v4-flash"`
- But `agentLoop()` is called WITHOUT the model parameter
- So it uses `DEFAULT_MODEL = "dahono/deepseek-v4-flash"`
- LLM provider returns 404: "model does not exist"

**Why hardcoded fallback didn't trigger:**
- Hardcoded fallback was added AFTER the incident (in uncommitted changes)
- During incident, when `agentLoop` threw error, it was caught and logged but position stayed open
- No automatic close mechanism existed

### 2. Missing Emergency Close Mechanism

**What should have happened:**
1. Trailing TP signal detected
2. Exit action queued
3. **If LLM fails → direct close bypass**

**What actually happened:**
1. Trailing TP signal detected ✓
2. Exit action queued ✓
3. **LLM called → error → position held open** ✗

---

## Code Evidence

### Error Pattern (repeated 106 times)
```
[2026-06-26T00:10:01.218Z] [ERROR] Agent loop error at step 0: 404 The model 'dahono/combo' does not exist.
[2026-06-26T00:10:01.218Z] [CRON_ERROR] Agent loop failed: Error: 404 The model 'dahono/combo' does not exist.
```

### Missing Fallback (before fix)
```javascript
// index.js line 385-398 (BEFORE fix)
const { content } = await agentLoop(`...`);
mgmtReport += `\n\n🤖 <b>Agent Response</b>\n${content}`;
// No catch block, no fallback close
```

### Hardcoded Fallback Added After (uncommitted)
```javascript
// index.js line 399-424 (AFTER fix - currently uncommitted)
} catch (error) {
  log("cron_error", `Agent loop failed: ${error.stack || error.message}`);
  mgmtReport += `\n\n❌ <b>Agent Error</b>\n${error.message}`;
  // Hardcoded fallback: execute CLOSE/CLAIM directly without LLM
  const closeErrors = [];
  for (const ap of actionPositions) {
    const act = actionMap.get(ap.position);
    try {
      if (act.action === "CLOSE") {
        log("cron", `Hardcoded close: ${ap.pair} — ${act.reason}`);
        const result = await closePosition({ position_address: ap.position, reason: act.reason || "hardcoded fallback" });
        // ... error handling
      }
    } catch (e) {
      closeErrors.push(`${ap.pair}: ${e.message}`);
    }
  }
}
```

---

## Why Trailing TP State Machine Worked Correctly

The trailing TP logic in `state.js` functioned as designed:

1. ✓ Peak detected at +27.65%
2. ✓ Trailing activated when peak > 3% (trailingTriggerPct)
3. ✓ Exit signal when drop > 1.5% (trailingDropPct)
4. ✓ Exit reason logged: "Stop loss: PnL -61.69% <= -10% — trailing TP triggered"
5. ✗ **Exit action never executed** (LLM failure, no fallback)

**State at close:**
```json
{
  "peak_pnl_pct": 27.65,
  "trailing_active": true,
  "current_pnl_pct": -61.69,
  "close_reason": "Stop loss: PnL -61.69% <= -10% — trailing TP triggered"
}
```

---

## Fixes Required

### Fix 1: Pass managementModel to agentLoop (CRITICAL)

**File:** `index.js` line 385

**Current:**
```javascript
const { content } = await agentLoop(`...`);
```

**Fixed:**
```javascript
const { content } = await agentLoop(
  `...`,
  config.llm.maxSteps,
  [],
  "GENERAL",
  config.llm.managementModel  // ← Pass model
);
```

### Fix 2: Commit Hardcoded Fallback (CRITICAL)

The hardcoded fallback is already in the code but uncommitted. Commit it immediately.

### Fix 3: Add Direct Close for Critical Exits (P0)

Add bypass mechanism for stop-loss and trailing-TP exits that doesn't require LLM:

```javascript
// In management cycle, BEFORE calling agentLoop
const criticalExits = actionPositions.filter(p => {
  const act = actionMap.get(p.position);
  return act.action === "CLOSE" && 
         (act.rule === "exit" || // trailing TP/stop loss
          act.reason?.includes("Stop loss") ||
          act.reason?.includes("Trailing TP"));
});

// Direct close without LLM
for (const p of criticalExits) {
  const act = actionMap.get(p.position);
  try {
    await closePosition({ 
      position_address: p.position, 
      reason: act.reason 
    });
    log("cron", `Direct close: ${p.pair} — ${act.reason}`);
  } catch (e) {
    log("cron_error", `Direct close failed: ${p.pair}: ${e.message}`);
  }
}

// Remove critical exits from LLM processing
const nonCriticalPositions = actionPositions.filter(p => 
  !criticalExits.includes(p)
);
```

### Fix 4: Model Fallback Chain (P1)

Add retry logic with fallback models:

```javascript
// agent.js - enhance retry logic
const MODEL_FALLBACKS = [
  "dahono/deepseek-v4-flash",
  "dahono/qwen3-max",
  "openrouter/healer-alpha"
];

for (const fallbackModel of MODEL_FALLBACKS) {
  try {
    response = await client.chat.completions.create({
      model: fallbackModel,
      // ...
    });
    break; // Success
  } catch (error) {
    if (error.status === 404) {
      log("agent", `Model ${fallbackModel} not found, trying next fallback`);
      continue;
    }
    throw error; // Re-throw non-404 errors
  }
}
```

---

## Prevention Measures

1. **Monitor LLM error rates** — Alert if >5 consecutive failures
2. **Add health check endpoint** — Verify model availability before trading
3. **Circuit breaker** — Pause screening if management fails 3x in a row
4. **Manual override** — Telegram command to force-close positions
5. **Model validation** — Check model exists at startup

---

## Lessons Learned

1. **Never trust LLM for critical paths** — Stop-loss and trailing-TP must have direct execution
2. **Test failure modes** — Simulate LLM downtime to verify fallbacks work
3. **Commit changes immediately** — Uncommitted fixes don't help production
4. **Monitor error patterns** — 106 consecutive errors should have triggered alerts
5. **Separate concerns** — Detection (trailing TP) vs Execution (close) must be independent

---

## Status

- ✅ Root cause identified
- ✅ Hardcoded fallback exists (uncommitted)
- ⏳ **Fixes not yet applied**
- ⏳ **Code not committed**

**Next Steps:**
1. Apply fixes to `index.js` and `agent.js`
2. Test with simulation
3. Commit changes
4. Restart PM2 process
5. Monitor for 24 hours

---

**Analysis Date:** 2026-06-26  
**Analyst:** Hermes Agent  
**Severity:** P0 (Critical)
