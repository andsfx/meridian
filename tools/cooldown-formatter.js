// Format cooldown remaining time in human-readable form
export function formatCooldownRemaining(hours) {
  if (hours <= 0) return "now";
  
  const totalMinutes = Math.round(hours * 60);
  
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  
  if (h < 24) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  
  const days = Math.floor(h / 24);
  const remainingH = h % 24;
  return remainingH > 0 ? `${days}d ${remainingH}h` : `${days}d`;
}

// Format timestamp as "HH:MM UTC" or "MMM DD HH:MM UTC"
export function formatCooldownExpiry(isoTimestamp) {
  if (!isoTimestamp) return "unknown";
  
  const date = new Date(isoTimestamp);
  const now = new Date();
  const hoursAhead = (date - now) / (1000 * 60 * 60);
  
  const timeStr = date.toISOString().substring(11, 16); // "22:06"
  
  // If > 24h away, include date
  if (hoursAhead > 24) {
    const monthDay = date.toISOString().substring(5, 10); // "06-21"
    return `${monthDay} ${timeStr} UTC`;
  }
  
  return `${timeStr} UTC`;
}