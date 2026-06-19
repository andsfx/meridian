# Meridian Config Changes — Phase 1 Patches

## P1.1: Fix minTvl evolution source
- **File:** `lessons.js`
- **Change:** Replace state.json read with lessons.json perfData filter using recorded_at
- **Commit hash:** TBD (will be generated after git commit)

## P1.2: Loosen stop loss to -10%
- **File:** `user-config.json`
- **Change:** Set `stopLossPct: -10` (was -5)
- **Reason:** Backtest shows 8/8 SL positions would survive, net +$1.65
- **Note:** Actual user-config.json not committed due to .gitignore (contains secrets). This file serves as change log.

## P1.3: Fix pool-memory cooldown for Rule 3
- **File:** `pool-memory.js`
- **Change:** Add new trigger for repeated Rule 3 closes
- **Impact:** Toxic pools like FARM-SOL blocked after 3+ Rule 3 closes

---

**Verification:**
- Bot deployed COZY-SOL after patches (proof that minTvl gate relaxed)
- GTAVI-SOL correctly filtered due to cooldown (proof that P1.3 works)

**Next steps:**
- Phase 2: Evolve stopLossPct and binsAbove in lessons.js
- Phase 3: Monitor position performance, adjust as needed