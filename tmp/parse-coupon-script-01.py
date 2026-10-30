import json
from pathlib import Path

p = Path(r"C:\Users\Bad-Boy\.cursor\projects\c-dev-cosmo-os\agent-tools\f96f6f8d-5c7e-4f1e-b484-3090e475fdb1.txt")
data = json.loads(p.read_text(encoding="utf-8"))
s = data["script"]
print("len", len(s))
for key in [
    "NG15",
    "existing_item",
    "final_discount",
    "coupon_pct",
    "highest",
    "discount_percentage",
]:
    print(key, s.count(key))

out = Path(r"c:\dev\cosmo-os\tmp\erp01-validate-coupon.py")
out.write_text(s, encoding="utf-8")
print("wrote", out)
