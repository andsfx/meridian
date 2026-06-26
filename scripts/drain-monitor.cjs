#!/usr/bin/env node
// Drain monitor for Meridian wallet
// Runs every 1m. Silent unless SOL is transferred out.
// Exit 0 = no drain. Exit 1 = drain detected. Exit 2 = error.

const { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
const fs = require("fs");
const path = require("path");

// Read .env manually (no dotenv dep)
const ENV_PATH = "/home/ubuntu/meridian/.env";
const env = {};
try {
  const lines = fs.readFileSync(ENV_PATH, "utf-8").split("\n");
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) {
      env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
} catch (e) {
  console.log("ERROR: Cannot read .env");
  process.exit(2);
}

const WALLET_KEY = env.WALLET_PRIVATE_KEY;
const RPC_URL = env.RPC_URL || "https://mainnet.helius-rpc.com/?api-key=" + (env.HELIUS_API_KEY || "");

if (!WALLET_KEY) { process.exit(2); }

const wallet = (() => {
  try { return Keypair.fromSecretKey(bs58.decode(WALLET_KEY)); }
  catch { return null; }
})();

if (!wallet) { process.exit(2); }

const ADDRESS = wallet.publicKey.toString();
const STATE_FILE = "/home/ubuntu/meridian/scripts/.drain-state.json";

let state = { balance: 0, lastTx: "" };
try { state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); } catch {}

async function main() {
  const conn = new Connection(RPC_URL, "confirmed");
  const bal = await conn.getBalance(wallet.publicKey);

  if (state.balance === 0) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ balance: bal, lastTx: "" }));
    return;
  }

  const dropped = state.balance - bal;
  if (dropped <= 0) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ balance: bal, lastTx: state.lastTx }));
    return;
  }

  // SOL dropped -- check recent txs
  const sigs = await conn.getSignaturesForAddress(wallet.publicKey, { limit: 5 });
  if (!sigs.length) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ balance: bal, lastTx: state.lastTx }));
    return;
  }

  let foundDrain = false;
  let drainSig = "";
  let drainAmount = 0;
  let drainRecipient = "";

  for (const sig of sigs) {
    if (sig.signature === state.lastTx) break;
    try {
      const tx = await conn.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
      if (!tx?.meta) continue;

      const accounts = tx.transaction.message.accountKeys.map(k => k.toString());
      const pre = tx.meta.preBalances;
      const post = tx.meta.postBalances;
      const ourIdx = accounts.indexOf(ADDRESS);
      if (ourIdx === -1) continue;

      const solOut = (pre[ourIdx] - post[ourIdx]) / LAMPORTS_PER_SOL;
      if (solOut < 0.0001) continue;

      // Check if this is a simple SystemProgram transfer (from -> to -> SystemProgram)
      // Bot operations (deploy/close) involve multiple accounts + specific programs
      const hasSystemProgram = accounts.includes("11111111111111111111111111111111");
      const isSimpleTransfer = hasSystemProgram && accounts.length <= 4 && !tx.meta.logMessages?.some(l => l.includes("Meteora") || l.includes("DLMM") || l.includes("Jupiter"));

      if (isSimpleTransfer && solOut > 0.001) {
        foundDrain = true;
        drainSig = sig.signature;
        drainAmount = solOut;
        drainRecipient = accounts.find(a => a !== ADDRESS && a !== "11111111111111111111111111111111") || "unknown";
        break;
      }
    } catch { continue; }
  }

  state.balance = bal;
  state.lastTx = sigs[0].signature;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));

  if (foundDrain) {
    console.log(
      "🚨 DRAIN ALERT\n" +
      "Amount: " + drainAmount.toFixed(4) + " SOL\n" +
      "To: " + drainRecipient + "\n" +
      "TX: https://solscan.io/tx/" + drainSig
    );
    process.exit(1);
  }
}

main().catch(e => {
  console.log("CRITICAL: drain monitor error:", e.message);
  process.exit(2);
});