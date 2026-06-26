import json
from collections import defaultdict

with open("/home/ubuntu/meridian/pool-memory.json") as f:
    d = json.load(f)

all_deploys = []
for addr, p in d.items():
    pname = p.get("symbol") or p.get("pool_name") or addr[:8]
    for depl in p.get("deploys", []):
        depl["_pname"] = pname
        all_deploys.append(depl)

# Get closed June (10-14)
june = [
    x
    for x in all_deploys
    if (x.get("closed_at") or "").startswith(
        ("2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14")
    )
]
june.sort(key=lambda x: x.get("closed_at", ""))

# Group by deploy amount (size)
print("=== June 10-14 by deploy amount ===")
amt = defaultdict(list)
for x in june:
    a = x.get("amount_sol") or 0.30
    pnl = x.get("pnl_usd") or 0
    if a < 0.30:
        amt["<0.30"].append(pnl)
    elif a < 0.40:
        amt["0.30-0.39"].append(pnl)
    elif a < 0.50:
        amt["0.40-0.49"].append(pnl)
    else:
        amt[">=0.50"].append(pnl)
for k in ["<0.30", "0.30-0.39", "0.40-0.49", ">=0.50"]:
    v = amt.get(k, [])
    if v:
        win = sum(1 for x in v if x > 0)
        print(
            f"  {k:10} n={len(v):>2} total_pnl={sum(v):+.2f} avg={sum(v) / len(v):+.3f} win={win}/{len(v)}"
        )

# Hours held vs outcome
print("\n=== June 10-14 by minutes_held ===")
held = defaultdict(list)
for x in june:
    m = x.get("minutes_held") or 0
    pnl = x.get("pnl_usd") or 0
    if m < 30:
        held["<30m"].append(pnl)
    elif m < 90:
        held["30-90m"].append(pnl)
    elif m < 180:
        held["90-180m"].append(pnl)
    else:
        held[">=180m"].append(pnl)
for k in ["<30m", "30-90m", "90-180m", ">=180m"]:
    v = held.get(k, [])
    if v:
        win = sum(1 for x in v if x > 0)
        print(
            f"  {k:10} n={len(v):>2} total_pnl={sum(v):+.2f} avg={sum(v) / len(v):+.3f} win={win}/{len(v)}"
        )

# Volatility at deploy vs outcome
print("\n=== June 10-14 by volatility_at_deploy ===")
vol = defaultdict(list)
for x in june:
    v = x.get("volatility_at_deploy") or 0
    pnl = x.get("pnl_usd") or 0
    if v < 1:
        vol["v<1"].append(pnl)
    elif v < 2:
        vol["v 1-2"].append(pnl)
    elif v < 3:
        vol["v 2-3"].append(pnl)
    else:
        vol["v 3+"].append(pnl)
for k in ["v<1", "v 1-2", "v 2-3", "v 3+"]:
    v = vol.get(k, [])
    if v:
        win = sum(1 for x in v if x > 0)
        print(
            f"  {k:10} n={len(v):>2} total_pnl={sum(v):+.2f} avg={sum(v) / len(v):+.3f} win={win}/{len(v)}"
        )

# Range efficiency
print("\n=== June 10-14 by range_efficiency ===")
rng = defaultdict(list)
for x in june:
    r = x.get("range_efficiency") or 0
    pnl = x.get("pnl_usd") or 0
    if r < 30:
        rng["<30%"].append(pnl)
    elif r < 60:
        rng["30-60%"].append(pnl)
    elif r < 85:
        rng["60-85%"].append(pnl)
    else:
        rng[">=85%"].append(pnl)
for k in ["<30%", "30-60%", "60-85%", ">=85%"]:
    v = rng.get(k, [])
    if v:
        win = sum(1 for x in v if x > 0)
        print(
            f"  {k:10} n={len(v):>2} total_pnl={sum(v):+.2f} avg={sum(v) / len(v):+.3f} win={win}/{len(v)}"
        )

print(
    f"\nTotal June 10-14: {sum(x.get('pnl_usd') or 0 for x in june):+.2f} USD across {len(june)} trades"
)
