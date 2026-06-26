import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FILE = path.join(__dirname, "loser-cooldowns.json");
const POOL_MEMORY_FILE = path.join(__dirname, "pool-memory.json");

function loadJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    log("loser_cooldown_error", `Failed to load ${path.basename(file)}: ${err.message}`);
  }
  return fallback;
}

function load() {
  const data = loadJson(FILE, { tokens: {} });
  if (!data.tokens) data.tokens = {};
  return data;
}

function save(data) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    log("loser_cooldown_error", `Failed to save loser cooldowns: ${err.message}`);
  }
}

function poolMemoryStats(baseMint) {
  const memory = loadJson(POOL_MEMORY_FILE, {});
  let losses = 0;
  let oor = 0;
  let lowYield = 0;
  for (const entry of Object.values(memory || {})) {
    if (!entry || entry.base_mint !== baseMint) continue;
    for (const deploy of entry.deploys || []) {
      const pnl = Number(deploy.pnl_pct ?? deploy.pnlPct ?? 0);
      const reason = String(deploy.close_reason || deploy.reason || deploy.notes || "").toLowerCase();
      if (Number.isFinite(pnl) && pnl < 0) {
        losses += 1;
        if (reason.includes("out of range") || reason.includes("oor")) oor += 1;
        if (reason.includes("low yield")) lowYield += 1;
      }
    }
  }
  return { losses, oor, lowYield, badCount: Math.max(losses, oor, lowYield) };
}

function tierForBadCount(count) {
  if (count >= 5) return { permanent: true, hours: null, label: "permanent" };
  if (count >= 4) return { permanent: false, hours: 24, label: "24h" };
  if (count >= 3) return { permanent: false, hours: 6, label: "6h" };
  if (count >= 2) return { permanent: false, hours: 2, label: "2h" };
  return { permanent: false, hours: 0.5, label: "30m" };
}

export function recordLosingClose(baseMint, symbol, pnlPct, reason = "") {
  if (!baseMint || !Number.isFinite(Number(pnlPct))) return null;
  const pnl = Number(pnlPct);
  const lowerReason = String(reason || "").toLowerCase();
  // Positive PnL = NOT a loser, regardless of close reason (OOR, low yield, etc.)
  if (pnl > 0) return null;

  const stats = poolMemoryStats(baseMint);
  const badCount = Math.max(1, stats.badCount + 1);
  const tier = tierForBadCount(badCount);
  const data = load();
  const entry = {
    symbol: symbol || "UNKNOWN",
    triggeredByPnlPct: pnl,
    reason,
    badCount,
    losses: stats.losses,
    oor: stats.oor,
    lowYield: stats.lowYield,
    updatedAt: new Date().toISOString(),
  };

  if (tier.permanent) {
    entry.permanent = true;
    entry.cooldownUntil = null;
    entry.permanentRejectReason = `bad pool history ${badCount}x (loss=${stats.losses}, oor=${stats.oor}, low_yield=${stats.lowYield})`;
  } else {
    entry.permanent = false;
    entry.cooldownUntil = new Date(Date.now() + tier.hours * 60 * 60 * 1000).toISOString();
  }

  data.tokens[baseMint] = entry;
  save(data);
  log("loser_cooldown", `${tier.permanent ? "Permanent reject" : `Cooldown ${tier.label}`} set for ${symbol || baseMint.slice(0,8)} after badCount=${badCount}, pnl=${pnl.toFixed(2)}%, reason=${reason}`);
  return entry;
}

export function markPermanentReject(baseMint, symbol, reason = "manual permanent reject") {
  if (!baseMint) return null;
  const data = load();
  data.tokens[baseMint] = {
    symbol: symbol || data.tokens?.[baseMint]?.symbol || "UNKNOWN",
    permanent: true,
    cooldownUntil: null,
    reason,
    permanentRejectReason: reason,
    updatedAt: new Date().toISOString(),
  };
  save(data);
  log("loser_cooldown", `Permanent reject set for ${symbol || baseMint.slice(0,8)}: ${reason}`);
  return data.tokens[baseMint];
}

export function getLoserCooldownInfo(baseMint) {
  if (!baseMint) return { onCooldown: false, cooldownUntil: null, permanent: false };
  const data = load();
  const entry = data.tokens?.[baseMint];
  if (!entry) return { onCooldown: false, cooldownUntil: null, permanent: false };
  if (entry.permanent) return { onCooldown: true, permanent: true, ...entry };
  const onCooldown = entry.cooldownUntil ? new Date(entry.cooldownUntil) > new Date() : false;
  return { onCooldown, permanent: false, ...entry };
}

export function isOnLoserCooldown(baseMint) {
  return getLoserCooldownInfo(baseMint).onCooldown;
}
