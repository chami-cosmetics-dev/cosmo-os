import json
from pathlib import Path

p = Path(r"C:\Users\Bad-Boy\.cursor\projects\c-dev-cosmo-os\agent-tools\d786195d-aef8-464c-8ebe-dc54540dcbc4.txt")
data = json.loads(p.read_text(encoding="utf-8"))
s = data["script"]
print("len", len(s))
for key in [
    "NG15",
    "existing_item",
    "final_discount",
    "coupon_pct",
    "posa_coupons",
    "highest",
    "Item Code",
    "discount_percentage",
    "ignore_pricing_rule",
]:
    print(key, s.count(key))

out = Path(r"c:\dev\cosmo-os\tmp\erp02-validate-coupon.py")
out.write_text(s, encoding="utf-8")
print("wrote", out)
