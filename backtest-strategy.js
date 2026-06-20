#!/usr/bin/env node
/**
 * Backtest: Compare current config vs proposed strategy
 * 
 * Proposed changes from trader chat:
 * - minTokenFeesSol: 2 → 60 (6h * 10 SOL/h)
 * - minTokenAgeHours: 2 → 6 (skip tokens under 6h)
 * - minMcap: 259k → 500k, maxMcap: 30M → 1.2M (tighter range)
 * - minBinStep: 100 → 69, maxBinStep: 125 → 110 (bin tight for stability)
 * - athFilterPct: -20 → -35 (enter after -35% from ATH)
 * 
 * Target: 5-7% daily profit, hold 6h+, stable after dump
 */

import fs from 'fs';

// Load data
const lessons = JSON.parse(fs.readFileSync('lessons.json', 'utf8'));
const poolMemory = JSON.parse(fs.readFileSync('pool-memory.json', 'utf8'));

console.log('═'.repeat(80));
console.log('BACKTEST: Current Config vs Proposed Strategy');
console.log('═'.repeat(80));
console.log();

// Current config
const current = {
  minTokenFeesSol: 2,
  minTokenAgeHours: 2,
  minMcap: 259375,
  maxMcap: 30000000,
  minBinStep: 100,
  maxBinStep: 125,
  athFilterPct: -20
};

// Proposed config
const proposed = {
  minTokenFeesSol: 60,
  minTokenAgeHours: 6,
  minMcap: 500000,
  maxMcap: 1200000,
  minBinStep: 69,
  maxBinStep: 110,
  athFilterPct: -35
};

// Analyze lessons
console.log('📊 HISTORICAL DATA ANALYSIS');
console.log('─'.repeat(80));

const closedPositions = Object.values(lessons).filter(l => l.closed_at);
console.log(`Total closed positions: ${closedPositions.length}`);

// Calculate metrics
function calcMetrics(positions) {
  if (positions.length === 0) return null;
  
  const winners = positions.filter(p => (p.pnl_pct || 0) > 0);
  const losers = positions.filter(p => (p.pnl_pct || 0) <= 0);
  
  const avgPnl = positions.reduce((sum, p) => sum + (p.pnl_pct || 0), 0) / positions.length;
  const winRate = (winners.length / positions.length) * 100;
  const totalFees = positions.reduce((sum, p) => sum + (p.fees_earned_sol || 0), 0);
  const avgFeesPerPos = totalFees / positions.length;
  
  // Hold time
  const holdTimes = positions
    .filter(p => p.deployed_at && p.closed_at)
    .map(p => {
      const deployed = new Date(p.deployed_at);
      const closed = new Date(p.closed_at);
      return (closed - deployed) / (1000 * 60 * 60); // hours
    });
  const avgHoldHours = holdTimes.length > 0 
    ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length 
    : 0;
  
  return {
    total: positions.length,
    winners: winners.length,
    losers: losers.length,
    winRate: winRate.toFixed(1),
    avgPnl: avgPnl.toFixed(2),
    totalFees: totalFees.toFixed(3),
    avgFeesPerPos: avgFeesPerPos.toFixed(3),
    avgHoldHours: avgHoldHours.toFixed(1)
  };
}

const overallMetrics = calcMetrics(closedPositions);

console.log();
console.log('Overall Performance:');
console.log(`  Win Rate: ${overallMetrics.winRate}% (${overallMetrics.winners}W / ${overallMetrics.losers}L)`);
console.log(`  Avg PnL: ${overallMetrics.avgPnl}%`);
console.log(`  Total Fees: ${overallMetrics.totalFees} SOL`);
console.log(`  Avg Fees/Position: ${overallMetrics.avgFeesPerPos} SOL`);
console.log(`  Avg Hold Time: ${overallMetrics.avgHoldHours}h`);

// Simulate filters
console.log();
console.log('═'.repeat(80));
console.log('FILTER IMPACT ANALYSIS');
console.log('═'.repeat(80));
console.log();

function simulateFilter(positions, config) {
  return positions.filter(p => {
    // Check fees
    const fees = p.fees_earned_sol || 0;
    if (fees < config.minTokenFeesSol) return false;
    
    // Check age (hours from deploy to close)
    if (p.deployed_at && p.closed_at) {
      const age = (new Date(p.closed_at) - new Date(p.deployed_at)) / (1000 * 60 * 60);
      if (age < config.minTokenAgeHours) return false;
    }
    
    // Check mcap
    const mcap = p.mcap || 0;
    if (mcap < config.minMcap || mcap > config.maxMcap) return false;
    
    // Check bin step
    const binStep = p.bin_step || 100;
    if (binStep < config.minBinStep || binStep > config.maxBinStep) return false;
    
    // Check ATH filter
    const athDrop = p.ath_drop_pct || 0;
    if (athDrop > config.athFilterPct) return false; // skip if not dropped enough
    
    return true;
  });
}

const currentFiltered = simulateFilter(closedPositions, current);
const proposedFiltered = simulateFilter(closedPositions, proposed);

console.log('Current Config:');
console.log(`  Positions that would pass: ${currentFiltered.length}/${closedPositions.length}`);
console.log(`  Filter rate: ${((1 - currentFiltered.length/closedPositions.length) * 100).toFixed(1)}%`);

const currentMetrics = calcMetrics(currentFiltered);
if (currentMetrics) {
  console.log(`  Win Rate (filtered): ${currentMetrics.winRate}%`);
  console.log(`  Avg PnL (filtered): ${currentMetrics.avgPnl}%`);
}

console.log();
console.log('Proposed Config:');
console.log(`  Positions that would pass: ${proposedFiltered.length}/${closedPositions.length}`);
console.log(`  Filter rate: ${((1 - proposedFiltered.length/closedPositions.length) * 100).toFixed(1)}%`);

const proposedMetrics = calcMetrics(proposedFiltered);
if (proposedMetrics) {
  console.log(`  Win Rate (filtered): ${proposedMetrics.winRate}%`);
  console.log(`  Avg PnL (filtered): ${proposedMetrics.avgPnl}%`);
  console.log(`  Avg Fees/Position (filtered): ${proposedMetrics.avgFeesPerPos} SOL`);
  console.log(`  Avg Hold Time (filtered): ${proposedMetrics.avgHoldHours}h`);
}

// Individual filter impact
console.log();
console.log('═'.repeat(80));
console.log('INDIVIDUAL FILTER IMPACT');
console.log('═'.repeat(80));
console.log();

function testSingleFilter(positions, filterFn, name) {
  const filtered = positions.filter(filterFn);
  return {
    name,
    passed: filtered.length,
    total: positions.length,
    rate: ((1 - filtered.length/positions.length) * 100).toFixed(1)
  };
}

const filters = [
  {
    name: 'Fees >= 60 SOL',
    fn: p => (p.fees_earned_sol || 0) >= 60
  },
  {
    name: 'Age >= 6h',
    fn: p => {
      if (!p.deployed_at || !p.closed_at) return true;
      const age = (new Date(p.closed_at) - new Date(p.deployed_at)) / (1000 * 60 * 60);
      return age >= 6;
    }
  },
  {
    name: 'Mcap $500k-$1.2M',
    fn: p => {
      const mcap = p.mcap || 0;
      return mcap >= 500000 && mcap <= 1200000;
    }
  },
  {
    name: 'Bin Step 69-110',
    fn: p => {
      const binStep = p.bin_step || 100;
      return binStep >= 69 && binStep <= 110;
    }
  },
  {
    name: 'ATH Drop <= -35%',
    fn: p => {
      const athDrop = p.ath_drop_pct || 0;
      return athDrop <= -35;
    }
  }
];

console.log('Filter Impact (how many would be skipped):');
console.log();

filters.forEach(f => {
  const result = testSingleFilter(closedPositions, f.fn, f.name);
  console.log(`  ${result.name}`);
  console.log(`    Passed: ${result.passed}/${result.total} (${result.rate}% filtered out)`);
});

// Risk analysis
console.log();
console.log('═'.repeat(80));
console.log('RISK ANALYSIS');
console.log('═'.repeat(80));
console.log();

const tooFewPositions = proposedFiltered.length < 10;
console.log(`⚠️  Sample Size Warning: ${tooFewPositions ? 'YES' : 'NO'}`);
if (tooFewPositions) {
  console.log(`   Only ${proposedFiltered.length} positions would pass all filters`);
  console.log('   Recommendation: Test filters individually first');
}

console.log();
console.log('⚠️  Opportunity Cost:');
const skipped = closedPositions.length - proposedFiltered.length;
const skippedWinners = closedPositions.filter(p => {
  return !proposedFiltered.includes(p) && (p.pnl_pct || 0) > 0;
}).length;
console.log(`   Would skip ${skipped} positions (${skippedWinners} winners)`);

// Daily profit simulation
console.log();
console.log('═'.repeat(80));
console.log('DAILY PROFIT SIMULATION');
console.log('═'.repeat(80));
console.log();

if (proposedMetrics) {
  const positionsPerDay = proposedFiltered.length / 30; // assume 30 day period
  const avgPnlPerPos = parseFloat(proposedMetrics.avgPnl);
  const dailyPnl = positionsPerDay * avgPnlPerPos;
  
  console.log(`Proposed Strategy:`);
  console.log(`  Positions per day: ${positionsPerDay.toFixed(1)}`);
  console.log(`  Avg PnL per position: ${avgPnlPerPos.toFixed(2)}%`);
  console.log(`  Estimated daily PnL: ${dailyPnl.toFixed(2)}%`);
  console.log();
  console.log(`  Target: 5-7% daily`);
  console.log(`  Gap: ${dailyPnl >= 5 ? '✅ On target' : `❌ Need ${(5 - dailyPnl).toFixed(2)}% more`}`);
}

// Recommendations
console.log();
console.log('═'.repeat(80));
console.log('RECOMMENDATIONS');
console.log('═'.repeat(80));
console.log();

const recommendations = [];

if (tooFewPositions) {
  recommendations.push('❌ Too few historical positions to validate full strategy');
  recommendations.push('   → Test filters one at a time to see which has most impact');
}

if (proposedMetrics && parseFloat(proposedMetrics.avgHoldHours) < 6) {
  recommendations.push('⚠️  Current avg hold time < 6h target');
  recommendations.push('   → Consider adjusting management rules for longer holds');
}

if (proposedMetrics && parseFloat(proposedMetrics.avgFeesPerPos) < 60) {
  recommendations.push('⚠️  Avg fees per position < 60 SOL target');
  recommendations.push('   → May need to relax minTokenFeesSol or increase position duration');
}

// Check which filter is most restrictive
const mostRestrictive = filters.map(f => {
  const result = testSingleFilter(closedPositions, f.fn, f.name);
  return { ...result, filterRate: parseFloat(result.rate) };
}).sort((a, b) => b.filterRate - a.filterRate)[0];

console.log(`Most Restrictive Filter: ${mostRestrictive.name}`);
console.log(`  Skips ${mostRestrictive.rate}% of positions`);
console.log(`  Recommendation: Test this filter first before full rollout`);
console.log();

if (recommendations.length > 0) {
  console.log('Action Items:');
  recommendations.forEach(r => console.log(r));
} else {
  console.log('✅ No critical issues found');
}

console.log();
console.log('═'.repeat(80));
console.log('NEXT STEPS');
console.log('═'.repeat(80));
console.log();
console.log('1. Review individual filter impacts above');
console.log('2. Test most restrictive filter in dry-run mode');
console.log('3. Monitor for 24-48h before full rollout');
console.log('4. Adjust parameters based on live results');
console.log();
