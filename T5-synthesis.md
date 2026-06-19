# T5 SYNTHESIS: Audit Findings + Patch Plan

## Severity Matrix

| Card | Topic | Severity | Impact | Urgency | Status |
|------|-------|----------|--------|---------|--------|
| T1 | Stop loss logic scope | High | 8/8 SL closes would survive at -10%, net +$1.65 | High | ✅ AUDIT DONE |
| T2 | bins_above hard enforcement | Medium | 0/24 Rule 3 closes had vol≥7 — backtest shows no benefit | Low | ✅ AUDIT DONE |
| T3 | Evolution system gaps | Medium | Evolution ignores stopLossPct and binsAbove | Medium | ✅ AUDIT DONE |
| T4 | Pool-memory cooldown Rule 3 bug | High | FARM-SOL redeployed 5x despite 4 Rule 3 closes | High | ✅ AUDIT DONE |
| T11 | minTvl evolution source bug | Critical | False tightening → no deploy cycle (market dead) | Critical | ✅ AUDIT DONE |

## Phase 1 Patch Plan (Immediate — Low Risk)

### P1.1: Fix minTvl evolution source (Critical)
- **File:** `lessons.js:479`
- **Change:** Replace state.json read with lessons.json perfData filter using recorded_at
- **Risk:** Low — only affects evolution logic, not core trading
- **Verify:** Check logs for "relaxing gates" message, minTvl decreases to ~$1500

### P1.2: Loosen stop loss to -10% (High)
- **File:** `user-config.json`
- **Change:** Set `stopLossPct: -10`
- **Risk:** Low — backtest shows all 8 SL positions would survive
- **Verify:** Check next stop loss close — PnL should be > -10% or position continues

### P1.3: Fix pool-memory cooldown for Rule 3 (High)
- **File:** `pool-memory.js:202`
- **Change:** Add new trigger for repeated Rule 3 closes
- **Risk:** Low — only affects pool memory, not core trading
- **Verify:** FARM-SOL should be on cooldown after next Rule 3 close

## Phase 2 Patch Plan (Next — Medium Risk)

### P2.1: Evolve stopLossPct and binsAbove (Medium)
- **File:** `lessons.js`
- **Change:** Add stopLossPct and binsAbove to evolveThresholds
- **Risk:** Low — only affects auto-tuning, not base config
- **Verify:** Check evolution logs — should see stopLossPct and binsAbove adjustments

## Phase 3: DO NOT IMPLEMENT (Low Priority / High Risk)

### P3.1: bins_above > 0 enforcement change
- **Status:** DEFERRED — backtest shows 0/24 Rule 3 closes had vol≥7
- **Reason:** User's premise ("vol≥7 tokens need buffer") doesn't match data
- **Recommendation:** Investigate bins_below (range too narrow) or deploy timing instead

## Safety Protocol

1. **Backup:** `cp user-config.json user-config.json.bak-pre-patch-phase1`
2. **Syntax check:** `node --check index.js tools/screening.js tools/gmgn.js config.js pool-memory.js`
3. **Review:** Present diff to Andy — wait for "oke patch ya"
4. **Apply:** Patch files
5. **Verify:** Run one screening cycle, confirm deploy happens
6. **Restart:** `pm2 restart meridian` (if needed for config reload)

**JANGAN restart PM2 in worker — operator restart after diff review.**

## Estimated Impact

- P1.1: Bot deploys again (market is $1.5k-2.5k TVL, gate will lower to ~$1500)
- P1.2: 8 SL positions would have net +$1.65 instead of being closed early
- P1.3: Toxic pools blocked, fewer wasted deploys
- P2.1: Long-term win rate improvement via auto-tuning

**Total immediate impact:** Bot stops dying (P1.1), recovers $1.65 from prevented SL closes (P1.2), avoids toxic pool redeploys (P1.3).

Final: kanban_block(reason='synthesis complete, awaiting operator review').