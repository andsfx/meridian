#!/usr/bin/env node
// Dump all GMGN filter rejections to analyze pipeline bottleneck
import { discoverGmgnPools } from "./tools/gmgn.js";
import fs from "fs";

const result = await discoverGmgnPools({ limit: 80 });

let out = [];
const sc = result.stage_counts || {};
out.push(`Ranked: ${result.total} → S1: ${sc.s1} → S2: ${sc.s2} → S3: ${sc.s3} → S4: ${sc.s4} → Final: ${sc.s5}`);
out.push("");

const byStage = {};
for (const f of (result.all_filtered || [])) {
  const s = `S${f.stage || "?"}`;
  if (!byStage[s]) byStage[s] = [];
  byStage[s].push(`${f.name}: ${f.reason}`);
}

for (const [stage, entries] of Object.entries(byStage).sort()) {
  out.push(`=== ${stage} (${entries.length} rejected) ===`);
  for (const e of entries) out.push(`  ${e}`);
  out.push("");
}

fs.writeFileSync("/tmp/gmgn-debug.txt", out.join("\n"));
console.log(`Wrote /tmp/gmgn-debug.txt — ${(result.all_filtered || []).length} total rejected`);
console.log(`Stage counts: ${out[0]}`);