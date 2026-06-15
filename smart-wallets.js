import fs from "fs";
import { log } from "./logger.js";
import { repoPath } from "./repo-root.js";

const WALLETS_PATH = repoPath("smart-wallets.json");

function loadWallets() {
  if (!fs.existsSync(WALLETS_PATH)) return { wallets: [] };
  try {
    return JSON.parse(fs.readFileSync(WALLETS_PATH, "utf8"));
  } catch {
    return { wallets: [] };
  }
}

function saveWallets(data) {
  fs.writeFileSync(WALLETS_PATH, JSON.stringify(data, null, 2));
}

const SOLANA_PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function addSmartWallet({ name, address, category = "alpha", type = "lp" }) {
  if (!SOLANA_PUBKEY_RE.test(address)) {
    return { success: false, error: "Invalid Solana address format" };
  }
  const data = loadWallets();
  const existing = data.wallets.find((w) => w.address === address);
  if (existing) {
    return { success: false, error: `Already tracked as "${existing.name}"` };
  }
  data.wallets.push({ name, address, category, type, addedAt: new Date().toISOString() });
  saveWallets(data);
  log("smart_wallets", `Added wallet: ${name} (${category}, type=${type})`);
  return { success: true, wallet: { name, address, category, type } };
}

export function removeSmartWallet({ address }) {
  const data = loadWallets();
  const wallet = data.wallets.find((w) => w.address === address);
  if (!wallet) return { success: false, error: "Wallet not found" };
  data.wallets = data.wallets.filter((w) => w.address !== address);
  saveWallets(data);
  log("smart_wallets", `Removed wallet: ${wallet.name}`);
  return { success: true, removed: wallet.name };
}

export function listSmartWallets() {
  const { wallets } = loadWallets();
  return { total: wallets.length, wallets };
}

// Cache wallet positions for 5 minutes to avoid hammering RPC
const _cache = new Map(); // address -> { positions, fetchedAt }
const CACHE_TTL = 5 * 60 * 1000;

// Weighted scoring: Agent Meridian top LPers carry highest conviction (PnL track record)
const CATEGORY_WEIGHTS = { agent_meridian: 3, kol: 2, alpha: 1 };
// Score >= this threshold = strong enough to override weak fundamentals
const SMART_WALLET_SCORE_THRESHOLD = 3;
// Dominant category drives auto-strategy selection
const STRATEGY_BY_CATEGORY = { agent_meridian: "spot", kol: "bid_ask", alpha: "bid_ask" };

export async function checkSmartWalletsOnPool({ pool_address }) {
  const { wallets: allWallets } = loadWallets();
  // Only check LP-type wallets — holder wallets don't have positions
  const wallets = allWallets.filter((w) => !w.type || w.type === "lp");
  if (wallets.length === 0) {
    return {
      pool: pool_address,
      tracked_wallets: 0,
      in_pool: [],
      confidence_boost: false,
      signal: "No smart wallets tracked yet — neutral signal",
    };
  }

  const { getWalletPositions } = await import("./tools/dlmm.js");

  const results = await Promise.all(
    wallets.map(async (wallet) => {
      try {
        const cached = _cache.get(wallet.address);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
          return { wallet, positions: cached.positions };
        }
        const { positions } = await getWalletPositions({ wallet_address: wallet.address });
        _cache.set(wallet.address, { positions: positions || [], fetchedAt: Date.now() });
        return { wallet, positions: positions || [] };
      } catch {
        return { wallet, positions: [] };
      }
    })
  );

  const inPool = results
    .filter((r) => r.positions.some((p) => p.pool === pool_address))
    .map((r) => ({ name: r.wallet.name, category: r.wallet.category, address: r.wallet.address }));

  // Compute weighted score & dominant category
  let score = 0;
  const counts = { agent_meridian: 0, kol: 0, alpha: 0 };
  for (const w of inPool) {
    const weight = CATEGORY_WEIGHTS[w.category] || 0;
    score += weight;
    if (counts.hasOwnProperty(w.category)) counts[w.category]++;
  }

  // Determine dominant strategy based on highest count
  let dominantStrategy = "bid_ask"; // fallback
  let maxCount = Math.max(counts.agent_meridian, counts.kol, counts.alpha);
  if (maxCount > 0) {
    if (counts.agent_meridian === maxCount) dominantStrategy = STRATEGY_BY_CATEGORY.agent_meridian;
    else if (counts.kol === maxCount) dominantStrategy = STRATEGY_BY_CATEGORY.kol;
    else if (counts.alpha === maxCount) dominantStrategy = STRATEGY_BY_CATEGORY.alpha;
  }

  return {
    pool: pool_address,
    tracked_wallets: wallets.length,
    in_pool: inPool,
    counts,
    score,
    dominant_strategy: dominantStrategy,
    meets_threshold: score >= SMART_WALLET_SCORE_THRESHOLD,
    confidence_boost: inPool.length > 0,
    signal: inPool.length > 0
      ? `${inPool.length}/${wallets.length} smart wallet(s) are in this pool: ${inPool.map((w) => w.name).join(", ")} — STRONG signal (score: ${score})`
      : `0/${wallets.length} smart wallets in this pool — neutral, rely on fundamentals`,
  };
}
