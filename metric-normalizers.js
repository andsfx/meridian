/**
 * Canonical metric normalization helpers.
 * Fee/TVL values in Meridian are percentage-form metrics: 0.02 means 0.02%.
 */

export function normalizeNumber(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const text = value.trim().replace(/%$/, '');
    if (!text || ['none', 'null', 'undefined', 'n/a', 'nan'].includes(text.toLowerCase())) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeFeeTvlPct(pool = {}) {
  const fields = [
    'fee_active_tvl_ratio_equiv_5m',
    'fee_active_tvl_ratio_5m',
    'fee_active_tvl_ratio',
    'fee_tvl_ratio',
    'feeTvlRatio',
    'fees_tvl_ratio',
    'fee_active_tvl_pct',
    'fee_tvl_pct',
    '_feeTvl',
  ];
  let explicitZero = false;
  for (const key of fields) {
    const n = normalizeNumber(pool?.[key]);
    if (n == null) continue;
    if (n > 0) return n;
    if (n === 0) explicitZero = true;
  }

  // Do not derive fee/TVL from gmgn_total_fee_sol/global fees.
  // Those are often lifetime/global token fees, not current-window pool fee intensity.
  // Using them as deploy-gate fee/TVL fabricates huge ratios (e.g. PARQ 38%).
  return explicitZero ? null : null;
}

export function formatPct(value, digits = 4) {
  const n = normalizeNumber(value);
  if (n == null) return 'unknown';
  return `${n.toFixed(digits)}%`;
}
