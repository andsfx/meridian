// Get detailed cooldown info for a pool or base mint
export function getCooldownInfo(identifier) {
  const db = load();
  const now = new Date();
  
  // Try to find by pool address first
  let entry = db[identifier];
  
  // If not found, try to find by base mint
  if (!entry) {
    for (const [addr, e] of Object.entries(db)) {
      if (e.base_mint === identifier) {
        entry = e;
        break;
      }
    }
  }
  
  if (!entry) return null;
  
  const result = {
    name: entry.name,
    pool_address: identifier in db ? identifier : Object.keys(db).find(addr => db[addr].base_mint === entry.base_mint),
    base_mint: entry.base_mint,
    has_cooldown: false,
    pool_cooldown_until: null,
    pool_cooldown_reason: null,
    base_mint_cooldown_until: null,
    base_mint_cooldown_reason: null,
    remaining_hours: 0,
    is_exempt: isPoolMemoryExempt(entry.pool_address || identifier)
  };
  
  // Check pool-level cooldown
  if (entry.cooldown_until && new Date(entry.cooldown_until) > now) {
    result.has_cooldown = true;
    result.pool_cooldown_until = entry.cooldown_until;
    result.pool_cooldown_reason = entry.cooldown_reason;
  }
  
  // Check base mint-level cooldown
  if (entry.base_mint_cooldown_until && new Date(entry.base_mint_cooldown_until) > now) {
    result.has_cooldown = true;
    result.base_mint_cooldown_until = entry.base_mint_cooldown_until;
    result.base_mint_cooldown_reason = entry.base_mint_cooldown_reason;
  }
  
  // Calculate remaining hours (use the later expiration if both exist)
  const poolExpires = result.pool_cooldown_until ? new Date(result.pool_cooldown_until) : null;
  const mintExpires = result.base_mint_cooldown_until ? new Date(result.base_mint_cooldown_until) : null;
  const expiresAt = poolExpires && mintExpires ? 
    (poolExpires > mintExpires ? poolExpires : mintExpires) :
    poolExpires || mintExpires;
  
  if (expiresAt) {
    const remainingMs = expiresAt - now;
    result.remaining_hours = Math.max(0, remainingMs / (1000 * 60 * 60));
  }
  
  return result;
}