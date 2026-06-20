import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, "config-change-log.json");

/**
 * Load existing config change log
 */
function loadLog() {
  try {
    if (fs.existsSync(LOG_PATH)) {
      const data = fs.readFileSync(LOG_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[CONFIG_LOG] Failed to load log:", err.message);
  }
  return [];
}

/**
 * Save config change log
 */
function saveLog(log) {
  try {
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), "utf-8");
  } catch (err) {
    console.error("[CONFIG_LOG] Failed to save log:", err.message);
  }
}

/**
 * Log a config change
 * @param {string} key - Config key that changed (e.g., "screening.minBinStep")
 * @param {any} oldValue - Previous value
 * @param {any} newValue - New value
 * @param {string} reason - Why the change was made
 * @param {string} source - Where the change came from (e.g., "manual", "evolve", "user")
 */
export function logConfigChange(key, oldValue, newValue, reason, source = "unknown") {
  const log = loadLog();
  
  const entry = {
    timestamp: new Date().toISOString(),
    key,
    oldValue,
    newValue,
    reason,
    source,
  };
  
  log.push(entry);
  
  // Keep only last 100 entries
  if (log.length > 100) {
    log.splice(0, log.length - 100);
  }
  
  saveLog(log);
  
  console.log(`[CONFIG_LOG] ${key}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)} (${reason})`);
}

/**
 * Get recent config changes
 * @param {number} limit - Number of recent changes to return
 */
export function getRecentChanges(limit = 10) {
  const log = loadLog();
  return log.slice(-limit);
}

/**
 * Get all changes for a specific key
 * @param {string} key - Config key to filter by
 */
export function getChangesForKey(key) {
  const log = loadLog();
  return log.filter(entry => entry.key === key);
}

/**
 * Get all config changes
 */
export function getAllChanges() {
  return loadLog();
}
