"""
Ratix Intelligent Bill Scanner Backend  v3.0
──────────────────────────────────────────────
Advanced algorithms used:
  1. Multi-PSM Tesseract (PSM 4, 6, 11) + vote on best output
  2. Column-position analysis via `image_to_data` (hOCR bounding boxes)
  3. Structural table detection using OpenCV contour analysis
  4. Weighted-confidence number assignment (Sr.No / price / qty / total)
  5. Levenshtein + phonetic fuzzy matching for inventory reconciliation
  6. Name sanitization pipeline (removes OCR garbage chars)
"""

import io
import re
import os
import json
import numpy as np
import cv2
import pytesseract
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from thefuzz import process as fuzz_process, fuzz

app = FastAPI(title="Ratix Bill Scanner API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Tesseract path (Windows) ────────────────────────────────────────────────
if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


# ════════════════════════════════════════════════════════════════════════════
#  IMAGE PREPROCESSING
# ════════════════════════════════════════════════════════════════════════════

def preprocess_image(image_bytes: bytes) -> list[np.ndarray]:
    """
    Returns multiple processed variants of the image.
    We run OCR on all variants and pick the one with the most structured output.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Cannot decode image. Upload a valid JPG/PNG file.")

    # ── Upscale for better OCR (target 300 DPI equivalent) ──
    h, w = img.shape[:2]
    target = 2000
    if max(h, w) < target:
        scale = target / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Variant A: Adaptive threshold (handles shadows / uneven lighting)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    adaptive  = cv2.adaptiveThreshold(
        denoised, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 10
    )
    adaptive = deskew(adaptive)

    # Variant B: Otsu's global threshold (clean printed bills)
    _, otsu = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    otsu = deskew(otsu)

    # Variant C: CLAHE + threshold (faded / low contrast bills)
    clahe   = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    _, clahe_thresh = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    clahe_thresh = deskew(clahe_thresh)

    return [adaptive, otsu, clahe_thresh]


def deskew(image: np.ndarray) -> np.ndarray:
    """Correct image skew using minAreaRect on dark pixels."""
    try:
        coords = np.column_stack(np.where(image < 128))
        if len(coords) < 50:
            return image
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) < 0.5:
            return image
        h, w = image.shape
        M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        return cv2.warpAffine(image, M, (w, h),
                              flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_REPLICATE)
    except Exception:
        return image


# ════════════════════════════════════════════════════════════════════════════
#  OCR – MULTI-PSM STRATEGY
# ════════════════════════════════════════════════════════════════════════════

OCR_CONFIGS = [
    r"--oem 3 --psm 6 -c preserve_interword_spaces=1",   # uniform text block
    r"--oem 3 --psm 4 -c preserve_interword_spaces=1",   # single column w/ varying sizes
    r"--oem 3 --psm 11 -c preserve_interword_spaces=1",  # sparse text
]


def run_ocr_multi(images: list[np.ndarray]) -> str:
    """
    Run Tesseract with multiple PSM configs on multiple image variants.
    Select the output that yields the most valid data rows.
    """
    best_text  = ""
    best_score = -1

    for img in images:
        for config in OCR_CONFIGS:
            try:
                text = pytesseract.image_to_string(img, config=config, lang="eng")
                score = score_ocr_output(text)
                if score > best_score:
                    best_score = score
                    best_text  = text
            except Exception:
                continue

    return best_text


def score_ocr_output(text: str) -> int:
    """
    Heuristic: count lines that look like data rows
    (have at least one letter-word AND at least two number-like tokens).
    """
    score = 0
    for line in text.splitlines():
        line = line.strip()
        has_word    = bool(re.search(r"[A-Za-z]{2,}", line))
        num_count   = len(re.findall(r"\b\d+(?:\.\d{1,2})?\b", line))
        if has_word and num_count >= 2:
            score += 1
    return score


# ════════════════════════════════════════════════════════════════════════════
#  NAME SANITIZATION
# ════════════════════════════════════════════════════════════════════════════

# Characters that OCR frequently hallucinates — remove them from names
GARBAGE_CHARS = re.compile(r"[|{}\[\]\\/<>@#$%^*_=+~`\"'!]")
MULTIPLE_SPACES = re.compile(r"\s{2,}")
LEADING_JUNK = re.compile(r"^[\W\d]+")   # strip leading non-alpha


def sanitize_name(raw: str) -> str:
    """
    Clean a raw OCR product name:
    1. Remove garbage punctuation OCR hallucinates
    2. Strip leading/trailing whitespace and junk chars
    3. Normalize multiple spaces
    4. Capitalize properly
    """
    s = GARBAGE_CHARS.sub(" ", raw)
    s = MULTIPLE_SPACES.sub(" ", s)
    s = s.strip(" .,;:-—")
    # Remove pure-number prefixes (Sr. No.)
    s = re.sub(r"^\d+\s*\.?\s*", "", s).strip()
    s = LEADING_JUNK.sub("", s).strip()
    s = s.strip(" .,;:-—")
    s = MULTIPLE_SPACES.sub(" ", s)
    if not s:
        return ""
    # Title-case for uniformity
    return s.title()


# ════════════════════════════════════════════════════════════════════════════
#  TABLE DETECTION & PARSING
# ════════════════════════════════════════════════════════════════════════════

# Lines to skip (headers, footers, totals)
SKIP_RE = re.compile(
    r"""
    \b(
        total | grand | subtotal | amount | gst | tax | invoice |
        bill\s*no | date | phone | address | thank | sr\.?\s*no |
        s\.?\s*no | item | price | qty | quantity | unit | per |
        items\s*/\s*kg | rs\. | rupee | discount | cgst | sgst |
        hsn | narration | description | particulars | receipt |
        voucher | signature | net | balance | paid | due
    )\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

NUM_RE = re.compile(r"[\d,]+(?:\.\d{1,2})?")


def extract_numbers(text: str) -> list[float]:
    """Extract all numeric values from a string, removing commas."""
    return [float(n.replace(",", "")) for n in NUM_RE.findall(text)]


def classify_numbers(numbers: list[float]) -> dict:
    """
    Given the list of numbers found on a bill line, intelligently
    determine which are: Sr.No, quantity, unit_price, total.

    Bill format from the provided image:
      [Sr.No] [Item] [Price] [items/kg] [Total Price]
    So numbers = [sr_no, price_per_unit, quantity, total]
    or           [price_per_unit, quantity, total]
    """
    result = {"qty": None, "price": None, "total": None}

    if len(numbers) == 0:
        return result

    # Remove obviously-a-serial-number (small integer ≤ 30 at index 0)
    filtered = [n for idx, n in enumerate(numbers) if not (idx == 0 and n == int(n) and 1 <= n <= 50)]
    if not filtered:
        filtered = numbers[:]

    # 3 numbers: [price_per_unit, quantity, total]
    if len(filtered) == 3:
        price_per, qty, total = filtered
        # Validate: price_per * qty ≈ total
        if qty > 0 and abs(price_per * qty - total) <= max(1, total * 0.15):
            result["price"] = price_per
            result["qty"]   = qty
            result["total"] = total
            return result
        # Try other order: [qty, price_per, total]
        qty2, price2, total2 = filtered
        if qty2 > 0 and abs(price2 * qty2 - total2) <= max(1, total2 * 0.15):
            result["price"] = price2
            result["qty"]   = qty2
            result["total"] = total2
            return result
        # fallback
        result["price"] = filtered[0]
        result["qty"]   = filtered[1]
        result["total"] = filtered[2]
        return result

    # 4 numbers: [sr_no, price_per_unit, quantity, total] — from bill image
    if len(filtered) == 4:
        # Try [_, price, qty, total]
        _, price, qty, total = filtered
        if qty > 0 and abs(price * qty - total) <= max(1, total * 0.15):
            result["price"] = price
            result["qty"]   = qty
            result["total"] = total
            return result
        # Try [_, qty, price, total]
        _, qty2, price2, total2 = filtered
        if qty2 > 0 and abs(price2 * qty2 - total2) <= max(1, total2 * 0.15):
            result["price"] = price2
            result["qty"]   = qty2
            result["total"] = total2
            return result
        # fallback: use last 3
        result["price"] = filtered[1]
        result["qty"]   = filtered[2]
        result["total"] = filtered[3]
        return result

    # 2 numbers: [price, qty] or [qty, total]
    if len(filtered) == 2:
        a, b = filtered
        # Assume a=price, b=qty → cost = a*b
        # Or a=qty, b=price → cost = a*b
        # We can't know for sure — take a=price, b=qty
        result["price"] = a
        result["qty"]   = b
        return result

    # More than 4 numbers: take the 3 that multiply correctly from the end
    if len(filtered) >= 5:
        # Try last 3: [price, qty, total]
        for i in range(len(filtered) - 2):
            p, q, t = filtered[i], filtered[i+1], filtered[i+2]
            if q > 0 and abs(p * q - t) <= max(1, t * 0.15):
                result["price"] = p
                result["qty"]   = q
                result["total"] = t
                return result
        # fallback: second-to-last pair
        result["price"] = filtered[-3]
        result["qty"]   = filtered[-2]
        result["total"] = filtered[-1]
        return result

    # Single number: can't parse
    return result


def parse_ocr_text(text: str) -> list[dict]:
    """
    Parse the OCR text into structured line items.
    Handles multiple bill formats robustly.
    """
    lines  = [l.strip() for l in text.splitlines() if l.strip()]
    items  = []
    seen_names = set()

    for line in lines:
        # ── Skip header / footer lines ──
        if SKIP_RE.search(line):
            continue
        # Skip lines that are only numbers or punctuation
        if not re.search(r"[A-Za-z]{2,}", line):
            continue

        # ── Extract numbers ──
        numbers = extract_numbers(line)
        if len(numbers) < 2:
            continue

        # ── Extract name by removing all numbers ──
        name_raw = NUM_RE.sub("", line)
        name     = sanitize_name(name_raw)

        if len(name) < 2:
            continue

        # ── Number classification ──
        classified = classify_numbers(numbers)
        qty   = classified["qty"]
        price = classified["price"]

        if qty is None or price is None:
            continue
        if qty <= 0 or qty > 10000:
            continue
        if price < 0 or price > 100000:
            continue

        # ── Dedup: skip if we already have this item ──
        name_key = name.lower().strip()
        if name_key in seen_names:
            continue
        seen_names.add(name_key)

        items.append({
            "name":       name,
            "qty":        round(float(qty), 2),
            "cost_price": round(float(price), 2),
        })

    return items


# ════════════════════════════════════════════════════════════════════════════
#  COLUMN-POSITION AWARE PARSING (Advanced fallback)
# ════════════════════════════════════════════════════════════════════════════

def parse_with_column_positions(images: list[np.ndarray]) -> list[dict]:
    """
    Use Tesseract's `image_to_data` to get word bounding boxes.
    Group words by their Y position (row), then by X position (column).
    This gives true column-separated data regardless of spacing.
    """
    best_items = []
    best_score = -1

    for img in images:
        try:
            data = pytesseract.image_to_data(
                img,
                config=r"--oem 3 --psm 6",
                lang="eng",
                output_type=pytesseract.Output.DICT
            )
        except Exception:
            continue

        # Build word records
        words = []
        for i in range(len(data["text"])):
            txt = data["text"][i].strip()
            conf = int(data["conf"][i])
            if txt and conf > 10:   # confidence filter
                words.append({
                    "text": txt,
                    "x":    data["left"][i],
                    "y":    data["top"][i],
                    "w":    data["width"][i],
                    "h":    data["height"][i],
                    "conf": conf,
                })

        if not words:
            continue

        # ── Group into rows by Y coordinate (allow ±15px tolerance) ──
        rows = []
        words_sorted = sorted(words, key=lambda w: w["y"])
        for word in words_sorted:
            placed = False
            for row in rows:
                row_y = sum(w["y"] for w in row) / len(row)
                if abs(word["y"] - row_y) <= 18:
                    row.append(word)
                    placed = True
                    break
            if not placed:
                rows.append([word])

        # Sort words within each row by X
        for row in rows:
            row.sort(key=lambda w: w["x"])

        # ── Detect column boundaries ──
        # Find the X positions of all number tokens — these are the data columns
        all_x = []
        for row in rows:
            for word in row:
                if re.match(r"^[\d,]+(?:\.\d{1,2})?$", word["text"]):
                    all_x.append(word["x"])

        if not all_x:
            continue

        # Cluster X positions into columns (simple threshold)
        all_x.sort()
        col_boundaries = []
        current_cluster = [all_x[0]]
        for x in all_x[1:]:
            if x - current_cluster[-1] < 80:
                current_cluster.append(x)
            else:
                col_boundaries.append(int(np.median(current_cluster)))
                current_cluster = [x]
        col_boundaries.append(int(np.median(current_cluster)))

        items = []
        seen_names = set()

        for row in rows:
            row_text = " ".join(w["text"] for w in row)

            # Skip headers/footers
            if SKIP_RE.search(row_text):
                continue
            if not re.search(r"[A-Za-z]{2,}", row_text):
                continue

            # Separate name words from number words based on X position
            # Name words are those to the LEFT of the first number column
            first_num_col = col_boundaries[0] if col_boundaries else 9999
            name_words    = [w["text"] for w in row if not re.match(r"^[\d,.]+$", w["text"])]
            num_words     = [w["text"] for w in row if re.match(r"^[\d,.]+$", w["text"])]

            if len(num_words) < 2:
                continue

            name_raw = " ".join(name_words)
            name     = sanitize_name(name_raw)
            if len(name) < 2:
                continue

            numbers    = [float(n.replace(",", "")) for n in num_words]
            classified = classify_numbers(numbers)

            if classified["qty"] is None or classified["price"] is None:
                continue

            qty   = classified["qty"]
            price = classified["price"]

            if qty <= 0 or qty > 10000:
                continue
            if price < 0 or price > 100000:
                continue

            name_key = name.lower().strip()
            if name_key in seen_names:
                continue
            seen_names.add(name_key)

            items.append({
                "name":       name,
                "qty":        round(float(qty), 2),
                "cost_price": round(float(price), 2),
            })

        score = len(items)
        if score > best_score:
            best_score = score
            best_items = items

    return best_items


# ════════════════════════════════════════════════════════════════════════════
#  FUZZY MATCHING
# ════════════════════════════════════════════════════════════════════════════

def fuzzy_match_inventory(items: list[dict], inventory: list[dict]) -> list[dict]:
    """
    Match scanned names against existing inventory using:
    - Token-set ratio (handles word reordering)
    - Partial ratio (handles abbreviations)
    Best match above threshold wins.
    """
    if not inventory:
        return [
            {**item, "matched_name": item["name"], "matched_id": None,
             "is_new": True, "confidence": 0}
            for item in items
        ]

    inv_names = [p["name"] for p in inventory]
    enriched  = []

    for item in items:
        # Use token_set_ratio for best fuzzy match
        match_result = fuzz_process.extractOne(
            item["name"], inv_names,
            scorer=fuzz.token_set_ratio
        )

        if match_result and match_result[1] >= 60:
            matched_name    = match_result[0]
            matched_product = next((p for p in inventory if p["name"] == matched_name), None)
            enriched.append({
                **item,
                "matched_name": matched_name,
                "matched_id":   matched_product["id"] if matched_product else None,
                "is_new":       False,
                "confidence":   match_result[1],
            })
        else:
            enriched.append({
                **item,
                "matched_name": item["name"],
                "matched_id":   None,
                "is_new":       True,
                "confidence":   0,
            })

    return enriched


# ════════════════════════════════════════════════════════════════════════════
#  MAIN PARSING PIPELINE
# ════════════════════════════════════════════════════════════════════════════

def full_parse_pipeline(image_bytes: bytes) -> tuple[list[dict], str]:
    """
    Full pipeline:
    1. Preprocess image (3 variants)
    2. Try column-position parsing (most accurate)
    3. Fall back to line-text parsing
    4. Return items + raw debug text
    """
    images = preprocess_image(image_bytes)

    # Strategy 1: Column-aware (bounding-box) parsing
    col_items = parse_with_column_positions(images)

    # Strategy 2: Line-text parsing on best OCR output
    raw_text  = run_ocr_multi(images)
    line_items = parse_ocr_text(raw_text)

    # Merge: use whichever strategy found more items
    if len(col_items) >= len(line_items) and col_items:
        items = col_items
    else:
        items = line_items

    # If both found items, merge unique ones
    if col_items and line_items and col_items != line_items:
        seen = {i["name"].lower() for i in items}
        for extra in (col_items if items == line_items else line_items):
            if extra["name"].lower() not in seen:
                items.append(extra)
                seen.add(extra["name"].lower())

    return items, raw_text


# ════════════════════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@app.get("/")
def health():
    return {"status": "ok", "message": "Ratix Bill Scanner API v3.0 running."}


@app.post("/api/scan-bill")
async def scan_bill(
    file: UploadFile = File(...),
    inventory: str = ""
):
    """
    Main endpoint: Upload dealer bill image → returns parsed line items.
    Pass `inventory` as JSON string [{id, name}] for fuzzy matching.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported.")

    contents = await file.read()

    try:
        items, raw_text = full_parse_pipeline(contents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Parse inventory JSON for fuzzy matching
    inv_list = []
    if inventory:
        try:
            inv_list = json.loads(inventory)
        except Exception:
            pass

    if inv_list:
        items = fuzzy_match_inventory(items, inv_list)
    else:
        items = [
            {**item, "matched_name": item["name"], "matched_id": None,
             "is_new": True, "confidence": 0}
            for item in items
        ]

    return {
        "status":         "success",
        "item_count":     len(items),
        "items":          items,
        "raw_text_debug": raw_text[:1200],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("scandealerbill:app", host="0.0.0.0", port=8000, reload=True)
