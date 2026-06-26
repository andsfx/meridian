import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import DLMM from '@meteora-ag/dlmm';

const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=50e45e43-df47-4551-86a5-7941739236fb", "confirmed");

async function checkPool(poolAddress, positionAddress) {
  try {
    console.log(`\n=== Checking Pool: ${poolAddress} ===`);
    const poolPubkey = new PublicKey(poolAddress);
    const pool = await DLMM.create(connection, poolPubkey);
    
    const activeBin = await pool.getActiveBin();
    const activePrice = pool.fromPricePerLamport(Number(activeBin.price));
    console.log(`Active Bin ID: ${activeBin.binId}`);
    console.log(`Active Price: ${activePrice}`);
    console.log(`Bin Step: ${pool.lbPair.binStep}`);

    if (positionAddress) {
      const posPubkey = new PublicKey(positionAddress);
      const posObj = await pool.getPosition(posPubkey);
      const position = posObj.positionData;
      console.log(`\nPosition: ${positionAddress}`);
      const lowerBinId = Number(position.lowerBinId);
      const upperBinId = Number(position.upperBinId);
      console.log(`Lower Bin ID: ${lowerBinId}`);
      console.log(`Upper Bin ID: ${upperBinId}`);
      
      const lowerPrice = pool.fromPricePerLamport(lowerBinId);
      const upperPrice = pool.fromPricePerLamport(upperBinId);
      console.log(`Lower Price: ${lowerPrice}`);
      console.log(`Upper Price: ${upperPrice}`);
      
      const binsBelow = activeBin.binId - lowerBinId;
      const binsAbove = upperBinId - activeBin.binId;
      console.log(`Bins Below Active: ${binsBelow}`);
      console.log(`Bins Above Active: ${binsAbove}`);
    }
  } catch (e) {
    console.error(`Error for ${poolAddress}:`, e.message);
  }
}

// Brötchen-SOL
await checkPool("HpHZ9oN5s6PVYNGNP4Kf8N4yj7WL9CSdvFqB32V7ZnbP", "4nYWqZXUj8mSgKycDyvnBupW3HaCdRQqv96mwnBBfru6");

// Jotchua-SOL
await checkPool("EDeuGoVFTEUvWZvNGQH6UvSs5uk6RLgKTvr3MgY32ouw", "2R4M6giMbSMJiLHKxEcgQZ8gmFjHgviDimSniJJjNsPw");
