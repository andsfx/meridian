# T5 SYNTHESIS: Audit Findings + Patch Plan

## Severity Matrix

| Card | Topic | Severity | Impact | Urgency |
|------|-------|----------|--------|---------|
| T1 | Stop loss logic scope | Medium | Fees save positions, but -10% SL risk overexposure | High |
| T2 | bins_above hard enforcement | High | 60% positions close via Rule 3 — instant OOR on pumps | Critical |
| T3 | Evolution system gaps | Medium | Win rate stuck 15-16% — tightening wrong params | High |
| T4 | Pool-memory cooldown Rule 3 bug | Medium | Toxic pools (FARM-SOL) redeploy repeatedly | Medium |
| T11 | minTvl evolution logic | Critical | False tightening → no deploy cycle (market dead) | Critical |

## Phase 1 Patch Plan (Immediate)

### P1.1: Fix minTvl evolution source (Critical)
- **File:** `lessons.js`
- **Change:** Replace state.json read with lessons.json perfData filter using recorded_at
- **Risk:** Low — only affects evolution logic, not core trading
- **Verify:** Check logs for "relaxing gates" message, minTvl decreases to ~$1500

### P1.2: Loosen stop loss to -10% (Medium)
- **File:** `user-config.json`
- **Change:** Set `stopLossPct: -10`
- **Risk:** Medium — could increase losses if fees don't compensate
- **Verify:** Backtest on last 8 SL closes — net PnL (PnL + fees) should improve

### P1.3: Enable bins_above for vol≥7 (High)
- **Files:** `tools/executor.js`, `tools/dlmm.js`, `index.js`, `prompt.js`
- **Change:** Remove hard enforcement of bins_above=0, add conditional logic
- **Risk:** High — multi-file change, could break position deployment
- **Verify:** Deploy test position on high-vol pool (vol≥7), confirm range expands

## Phase 2 Patch Plan (Next)

### P2.1: Evolve stopLossPct and binsAbove (Medium)
- **File:** `lessons.js`
- **Change:** Add stopLossPct and binsAbove to evolveThresholds
- **Risk:** Low — only affects auto-tuning, not base config

### P2.2: Fix pool-memory cooldown for Rule 3 (Medium)
- **File:** `pool-memory.js`
- **Change:** Count Rule 3 closes as failures for cooldown trigger
- **Risk:** Low — only affects pool memory, not core trading

## Safety Protocol

1. **Backup:** `cp user-config.json user-config.json.bak-pre-patch-phase1`
2. **Syntax check:** `node --check index.js tools/screening.js tools/gmgn.js config.js`
3. **Review:** Present diff to Andy — wait for "oke patch ya"
4. **Apply:** Patch files
5. **Verify:** Run one screening cycle, confirm deploy happens
6. **Restart:** `pm2 restart meridian` (if needed for config reload)

**JANGAN restart PM2 in worker — operator restart after diff review.**