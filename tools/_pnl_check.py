import json

with open("/home/ubuntu/meridian/pool-memory.json") as f:
    d = json.load(f)

# Collect all deploys with realized PnL across all pools
all_deploys = []
for addr, p in d.items():
    pname = p.get("symbol") or p.get("pool_name") or addr[:8]
    for depl in p.get("deploys", []):
        depl["_pname"] = pname
        all_deploys.append(depl)


# Filter June 14 closes
def realized(depl):
    # try multiple field names
    for k in ("realized_pnl_usd", "pnl_usd", "net_pnl_usd", "pnlUsd"):
        if depl.get(k) is not None:
            return depl[k]
    return None


j14 = [
    x
    for x in all_deploys
    if (x.get("closed_at") or x.get("closedAt") or "").startswith("2026-06-14")
]
j14.sort(key=lambda x: x.get("closed_at") or x.get("closedAt") or "")

print(f"=== June 14 closed deploys: {len(j14)} ===")
total = 0
for x in j14:
    r = realized(x)
    ts = (x.get("closed_at") or x.get("closedAt") or "")[11:19]
    pct = x.get("pnl_pct") or x.get("realized_pnl_pct") or x.get("net_pnl_pct")
    reason = x.get("close_reason") or x.get("exit_reason") or x.get("reason") or ""
    rstr = f"{r:+.4f}" if isinstance(r, (int, float)) else "n/a"
    pctstr = f"{pct:+.2f}%" if isinstance(pct, (int, float)) else "?"
    if isinstance(r, (int, float)):
        total += r
    print(
        f"{ts} | {x['_pname'][:14]:14} | {rstr:>10} USD | {pctstr:>8} | {reason[:45]}"
    )
print(f"\nTOTAL realized PnL Jun14: {total:+.4f} USD")

# Show what fields a deploy actually has
if j14:
    print("\nSample deploy fields:", list(j14[-1].keys()))
