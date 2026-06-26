/**
 * Hardcoded entry reject tracker.
 * Tracks repeated rejects for same token/base mint and applies cooldown.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./logger.js";

const TRANSIENT_REJECT_PATTERNS = [
  // Market-condition patterns — no cooldown for these.
  // Token yang gagal karena market timing bisa jadi bagus lagi nanti.
  /volatility .* unusable/i,
  /volatility .* too hot for sideways/i,
  /price change .* > .* already pumped/i,
  /price vs ATH.*too close to ATH/i,
  /momentum.*pump\.fun.*smart wallets.*0/i,
  /very hot for sideways/i,
  /volume \$[\d.]+ < \$[\d.]+.*low liquidity/i,
  /TVL\/MC .* > .* pool saturated/i,
  /market cap \$[\d.]+ > \$[\d.]+.*too large/i,
  // Fee/TVL is market-condition, not fundamental — pool fees fluctuate every cycle
  // Handles 'fee/TVL 0 < absolute floor 0.0001%' and 'fee/TVL 0.0038% < 0.02%'
  /fee\/TVL\s+[\d.]+%?\s+<.*?[\d.]+%/i,
];

function isTransientReject(reason) {
  const text = String(reason || "");
  return TRANSIENT_REJECT_PATTERNS.some((pattern) => pattern.test(text));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REJECT_STATE_FILE = path.join(__dirname, "hardcoded-entry-rejects.json");

/**
 * Load reject state from disk.
 */
function loadRejectState() {
  try {
    if (fs.existsSync(REJECT_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(REJECT_STATE_FILE, "utf8"));
      return data.rejects || {};
    }
  } catch (err) {
    log("reject_state_error", `Failed to load reject state: ${err.message}`);
  }
  return {};
}

/**
 * Save reject state to disk.
 */
function saveRejectState(state) {
  try {
    const data = {
      rejects: state,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(REJECT_STATE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    log("reject_state_error", `Failed to save reject state: ${err.message}`);
  }
}

/**
 * Record a hardcoded entry reject for a token/base mint.
 * Returns cooldown info if threshold reached.
 * 
 * @param {string} baseMint - Token base mint address
 * @param {string} reason - Reject reason
 * @param {object} config - Config object with hardcodedEntryRejectCooldown settings
 * @returns {{ onCooldown: boolean, cooldownUntil: string | null, rejectCount: number }}
 */
export function recordHardcodedReject(baseMint, reason, config) {
  if (!baseMint) return { onCooldown: false, cooldownUntil: null, rejectCount: 0 };

  const state = loadRejectState();
  const now = Date.now();
  const triggerCount = Math.max(1, Number(config.hardcodedEntryRejectCooldownTriggerCount ?? 2));
  const cooldownHours = Math.max(0, Number(config.hardcodedEntryRejectCooldownHours ?? 2));
  const windowMinutes = Math.max(1, Number(config.hardcodedEntryRejectWindowMinutes ?? 60));

  if (!state[baseMint]) {
    state[baseMint] = {
      rejects: [],
      cooldownUntil: null,
    };
  }

  const entry = state[baseMint];

  // Check existing cooldown
  if (entry.cooldownUntil && new Date(entry.cooldownUntil) > new Date()) {
    return {
      onCooldown: true,
      cooldownUntil: entry.cooldownUntil,
      rejectCount: entry.rejects.length,
    };
  }

  // Add new reject. Transient rejects count separately and never trigger hard cooldown.
  const transient = isTransientReject(reason);
  entry.rejects.push({
    timestamp: new Date().toISOString(),
    reason,
    transient,
  });

  // Prune old rejects outside window
  const windowMs = windowMinutes * 60 * 1000;
  entry.rejects = entry.rejects.filter((r) => now - new Date(r.timestamp).getTime() < windowMs);

  const cooldownEligibleRejects = entry.rejects.filter((r) => !r.transient);

  // Check if threshold reached
  if (cooldownEligibleRejects.length >= triggerCount && cooldownHours > 0) {
    const cooldownUntil = new Date(now + cooldownHours * 60 * 60 * 1000).toISOString();
    entry.cooldownUntil = cooldownUntil;
    log(
      "hardcoded_reject_cooldown",
      `Cooldown set for ${baseMint.slice(0, 8)} until ${cooldownUntil} (${cooldownEligibleRejects.length} fundamental rejects in ${windowMinutes}m)`
    );
    saveRejectState(state);
    return {
      onCooldown: true,
      cooldownUntil,
      rejectCount: cooldownEligibleRejects.length,
    };
  }

  saveRejectState(state);
  return {
    onCooldown: false,
    cooldownUntil: null,
    rejectCount: entry.rejects.length,
  };
}

/**
 * Check if a token/base mint is on cooldown from repeated rejects.
 * 
 * @param {string} baseMint - Token base mint address
 * @returns {boolean}
 */
export function isOnRejectCooldown(baseMint) {
  if (!baseMint) return false;
  const state = loadRejectState();
  const entry = state[baseMint];
  if (!entry?.cooldownUntil) return false;
  return new Date(entry.cooldownUntil) > new Date();
}

/**
 * Get reject cooldown info for a token/base mint.
 * 
 * @param {string} baseMint - Token base mint address
 * @returns {{ onCooldown: boolean, cooldownUntil: string | null, rejectCount: number }}
 */
export function getRejectCooldownInfo(baseMint) {
  if (!baseMint) return { onCooldown: false, cooldownUntil: null, rejectCount: 0 };
  const state = loadRejectState();
  const entry = state[baseMint];
  if (!entry) return { onCooldown: false, cooldownUntil: null, rejectCount: 0 };

  const onCooldown = entry.cooldownUntil && new Date(entry.cooldownUntil) > new Date();
  return {
    onCooldown,
    cooldownUntil: entry.cooldownUntil,
    rejectCount: entry.rejects.length,
  };
}
