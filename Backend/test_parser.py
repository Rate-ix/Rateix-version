"""
Test script: validates classify_numbers and sanitize_name against the real bill image.
Bill format:  Sr.No | Item | Price/unit | items/kg | Total
"""
import os
os.environ["PYTHONUTF8"] = "1"

from main import classify_numbers, sanitize_name

tests = [
    ([1, 20, 2, 40],    "toothpaste",    20,  2),
    ([2, 25, 6, 150],   "soap",          25,  6),
    ([3, 41, 2, 82],    "hair oil",      41,  2),
    ([4, 60, 1, 60],    "shampo",        60,  1),
    ([5, 53, 7, 371],   "rise",          53,  7),
    ([6, 133, 4, 532],  "Tur dal",       133, 4),
    ([7, 25, 15, 375],  "Gehu",          25,  15),
    ([8, 120, 5, 600],  "cooking oil",   120, 5),
    ([9, 12, 15, 180],  "maggi",         12,  15),
    ([10, 3, 60, 180],  "garbage bags",  3,   60),
    ([11, 10, 60, 600], "corona masks",  10,  60),
    ([12, 25, 10, 250], "biscuits",      25,  10),
    ([13, 250, 2, 500], "body spray",    250, 2),
]

print("=" * 65)
print(f"{'STATUS':<8} {'ITEM':<20} {'PRICE':>8} {'QTY':>6}")
print("=" * 65)

passed = 0
failed = 0
for nums, name, expected_price, expected_qty in tests:
    r = classify_numbers(nums)
    ok = (r["price"] == expected_price and r["qty"] == expected_qty)
    if ok:
        passed += 1
        status = "PASS"
    else:
        failed += 1
        status = "FAIL"
    got_price = r["price"]
    got_qty   = r["qty"]
    marker = "" if ok else f"  <- expected price={expected_price}, qty={expected_qty}"
    print(f"{status:<8} {name:<20} {got_price:>8} {got_qty:>6}{marker}")

print("=" * 65)
accuracy = (passed / len(tests)) * 100
print(f"Accuracy: {passed}/{len(tests)} = {accuracy:.0f}%")
print()
print("Name sanitization tests:")
print("  '|soap'          ->", sanitize_name("|soap"))
print("  'shampo-s| ~d|-' ->", sanitize_name("shampo-s| ~d|-"))
print("  'turdal | [a'    ->", sanitize_name("turdal | [a"))
print("  '1 Toothpaste'   ->", sanitize_name("1 Toothpaste"))
print("  'coronamasks | [' ->", sanitize_name("coronamasks | ["))
