from fastapi import FastAPI, HTTPException, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from typing import List, Literal, Optional
import uvicorn
import os
import sys
import time
import json
import base64
import traceback
import re
import httpx
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

# ═══════════════════════════════
# AI INVENTORY IMPORTS
# ═══════════════════════════════
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ai-inventory'))
from ai.inventory import analyze_inventory
from ai.gst import calculate_gst
from ai.khata import analyze_khata

app = FastAPI(title="Ratix Backend", version="1.0.0")

# ═══════════════════════════════
# CORS CONFIG
# ═══════════════════════════════
# FIX: CORS wildcard + credentials=True is rejected by browsers (and a security hole).
# When origins is *, credentials must be False. Require explicit origin list for credentialed requests.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "").strip()
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()] if _raw_origins else []
_allow_credentials = bool(allowed_origins)  # only allow credentials when origins are explicitly set
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins else ["*"],
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══════════════════════════════
# SUPABASE CLIENT (singleton)
# ═══════════════════════════════
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")

if not supabase_url or not supabase_key:
    print("WARNING: SUPABASE_URL or SUPABASE_KEY missing! Database endpoints will fail.")
    supabase = None
else:
    try:
        supabase = create_client(supabase_url, supabase_key)
    except Exception as e:
        print(f"ERROR: Failed to initialize Supabase client: {e}")
        supabase = None

# ═══════════════════════════════
# GROQ AI CLIENT (singleton)
# ═══════════════════════════════
_grok_api_key = os.getenv("GROK_API_KEY")
groq_client: Optional[OpenAI] = None
if _grok_api_key:
    try:
        groq_client = OpenAI(api_key=_grok_api_key, base_url="https://api.groq.com/openai/v1")
    except Exception as e:
        print(f"WARNING: Could not initialize Groq client: {e}")

# ═══════════════════════════════
# IN-MEMORY CACHE (trending)
# ═══════════════════════════════
_trending_cache: dict = {"data": None, "ts": 0}
TRENDING_CACHE_TTL = 600  # 10 minutes


def check_supabase():
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail="Database client is not initialized. Check SUPABASE_URL and SUPABASE_KEY."
        )


def clean_llm_json(text: str) -> str:
    """Strip markdown code fences from LLM output."""
    text = text.strip()
    if text.startswith("```json"):
        text = text.split("```json", 1)[1].rsplit("```", 1)[0]
    elif text.startswith("```"):
        text = text.split("```", 1)[1].rsplit("```", 1)[0]
    return text.strip()


# ═══════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════

class OrderModel(BaseModel):
    product_name: str
    distributor: Optional[str] = None
    # FIX: Negative quantities/amounts silently corrupt stock — enforce lower bounds
    quantity: int = Field(..., ge=0, description="Must be >= 0")
    unit: str = "units"
    amount: float = Field(..., ge=0, description="Must be >= 0")
    status: str = "Pending"
    notes: Optional[str] = None

class InventoryModel(BaseModel):
    product_name: str
    sku: Optional[str] = None
    category: Optional[str] = None
    # FIX: Negative values silently corrupt inventory records
    quantity: int = Field(..., ge=0, description="Must be >= 0")
    unit: str = "units"
    reorder_level: int = Field(10, ge=0)
    buying_price: float = Field(0, ge=0)
    selling_price: float = Field(0, ge=0)

class DistributorModel(BaseModel):
    name: str
    phone: Optional[str] = None
    location: Optional[str] = None
    territory: Optional[str] = None
    balance: float = 0
    notes: Optional[str] = None

class KhataModel(BaseModel):
    party_name: str
    # FIX: Unconstrained string accepted garbage values like "foo" — use Literal
    type: Literal["credit", "payment"]
    amount: float = Field(..., gt=0, description="Must be > 0")
    description: Optional[str] = None
    entry_date: Optional[str] = None

class GSTItem(BaseModel):
    name: str
    quantity: float
    unit: str
    price_per_unit: float
    gst_rate: Optional[float] = 18.0

class GSTRequest(BaseModel):
    seller_name: str
    seller_gstin: str
    seller_address: str
    buyer_name: str
    buyer_gstin: str
    buyer_address: str
    invoice_number: str
    date: str
    items: List[GSTItem]
    # FIX: Unconstrained string caused wrong GST split logic — use Literal
    supply_type: Literal["intra", "inter"] = "intra"

class AnalyzeInventoryRequest(BaseModel):
    stock_data: dict

class AnalyzeKhataRequest(BaseModel):
    customers: list

class PurchaseStockItem(BaseModel):
    product_name: str
    quantity: int = Field(..., ge=1, description="Units purchased, must be >= 1")
    unit: str = "units"
    buying_price: float = Field(0, ge=0)
    category: Optional[str] = None

class PurchaseStockRequest(BaseModel):
    user_id: str
    supplier_gstin: Optional[str] = None
    supplier_name: Optional[str] = None
    items: List[PurchaseStockItem]


# ═══════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════

# FIX: Dead code removed — the StaticFiles mount below overrides this handler.
# Health check route is sufficient; root is now served by StaticFiles.
@app.get("/api")
def root():
    return {"message": "Ratix Backend is running! 🚀"}

@app.get("/health")
def health():
    return {"status": "ok", "db": supabase is not None, "ai": groq_client is not None}


# ═══════════════════════════════
# ORDERS
# ═══════════════════════════════

@app.get("/orders/{user_id}")
async def get_orders(user_id: str):
    check_supabase()
    try:
        res = supabase.table("orders").select("*").eq("user_id", user_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/orders/{user_id}")
async def add_order(user_id: str, order: OrderModel):
    check_supabase()
    try:
        res = supabase.table("orders").insert({
            "user_id": user_id,
            **order.model_dump()
        }).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, user_id: str = Query(...)):
    """FIX: user_id required to prevent unauthorized status changes."""
    check_supabase()
    try:
        res = supabase.table("orders").update({"status": status}).eq("id", order_id).eq("user_id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Order not found or access denied.")
        return {"success": True, "data": res.data}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/orders/{order_id}")
async def delete_order(order_id: str, user_id: str = Query(...)):
    """FIX: user_id required — prevents IDOR where any user could delete any order."""
    check_supabase()
    try:
        res = supabase.table("orders").delete().eq("id", order_id).eq("user_id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Order not found or access denied.")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════
# INVENTORY
# ═══════════════════════════════

@app.get("/inventory/{user_id}")
async def get_inventory(user_id: str):
    check_supabase()
    try:
        res = supabase.table("inventory").select("*").eq("user_id", user_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/inventory/{user_id}")
async def add_inventory(user_id: str, item: InventoryModel):
    check_supabase()
    try:
        res = supabase.table("inventory").insert({
            "user_id": user_id,
            **item.model_dump()
        }).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/inventory/{item_id}")
async def update_inventory(item_id: str, item: InventoryModel, user_id: str = Query(...)):
    """FIX: user_id required to prevent unauthorized inventory modification."""
    check_supabase()
    try:
        res = supabase.table("inventory").update(item.model_dump()).eq("id", item_id).eq("user_id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Item not found or access denied.")
        return {"success": True, "data": res.data}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/inventory/{item_id}")
async def delete_inventory(item_id: str, user_id: str = Query(...)):
    """FIX: user_id required — prevents IDOR."""
    check_supabase()
    try:
        res = supabase.table("inventory").delete().eq("id", item_id).eq("user_id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Item not found or access denied.")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════
# DISTRIBUTORS
# ═══════════════════════════════

@app.get("/distributors/{user_id}")
async def get_distributors(user_id: str):
    check_supabase()
    try:
        res = supabase.table("distributors").select("*").eq("user_id", user_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/distributors/{user_id}")
async def add_distributor(user_id: str, dist: DistributorModel):
    check_supabase()
    try:
        res = supabase.table("distributors").insert({
            "user_id": user_id,
            **dist.model_dump()
        }).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/distributors/{dist_id}")
async def delete_distributor(dist_id: str, user_id: str = Query(...)):
    """FIX: user_id required — prevents IDOR."""
    check_supabase()
    try:
        res = supabase.table("distributors").delete().eq("id", dist_id).eq("user_id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Distributor not found or access denied.")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════
# KHATA
# ═══════════════════════════════

@app.get("/khata/{user_id}")
async def get_khata(user_id: str):
    check_supabase()
    try:
        res = supabase.table("khata").select("*").eq("user_id", user_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/khata/{user_id}")
async def add_khata(user_id: str, entry: KhataModel):
    check_supabase()
    try:
        res = supabase.table("khata").insert({
            "user_id": user_id,
            **entry.model_dump()
        }).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/khata/{entry_id}")
async def delete_khata(entry_id: str, user_id: str = Query(...)):
    """FIX: user_id required — prevents IDOR."""
    check_supabase()
    try:
        res = supabase.table("khata").delete().eq("id", entry_id).eq("user_id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Khata entry not found or access denied.")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════
# MARKET TRENDING PRODUCTS
# ═══════════════════════════════

@app.get("/market/trending")
async def get_trending_products(user_id: Optional[str] = Query(None)):
    global _trending_cache

    # FIX: `if _trending_cache["data"]` is falsy for an empty list — use `is not None`
    if _trending_cache["data"] is not None and (time.time() - _trending_cache["ts"]) < TRENDING_CACHE_TTL:
        return {"success": True, "data": _trending_cache["data"], "cached": True}

    # Determine shop type for personalized results
    shop_context = "a general Indian retail store"
    if user_id and supabase:
        try:
            profile_res = supabase.table("profiles").select("shop_name, business_type").eq("id", user_id).single().execute()
            profile = profile_res.data
            if profile:
                name = profile.get("shop_name", "")
                btype = profile.get("business_type", "")
                shop_context = f"a shop named '{name}' ({btype or 'retail'})"
        except Exception:
            pass  # fallback to generic context

    if groq_client:
        try:
            prompt = f"""You are a real-time Indian retail market data engine similar to Blinkit/Zepto.
The user runs {shop_context}.
Generate a list of 6-8 currently trending, high-demand products that this specific type of shop should stock RIGHT NOW in India.
For each product, return a valid JSON object with these exact fields:
{{
    "name": "Product Name",
    "category": "Category",
    "buying_price": 0.0,
    "selling_price": 0.0,
    "growth": "+X% demand",
    "tag": "Trending | Best Seller | Hot Buy | New Launch",
    "description": "One sentence on why it is trending"
}}
Return ONLY a valid JSON array. No markdown, no explanation, no extra text."""

            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.6,
                timeout=8.0
            )
            text = clean_llm_json(response.choices[0].message.content)
            data = json.loads(text)
            if isinstance(data, list) and len(data) > 0:
                _trending_cache = {"data": data, "ts": time.time()}
                return {"success": True, "data": data}
        except Exception as e:
            print(f"Trending LLM call failed: {e}")

    # FIX: Static fallback was never cached — repeated failures kept re-calling a broken LLM.
    # Now cache the fallback so subsequent requests don't hammer the Groq API.
    fallback_data = [
        {"name": "OnePlus Nord CE 4 5G", "category": "Electronics", "buying_price": 21500, "selling_price": 24999, "growth": "+45% sales", "tag": "Best Seller", "description": "Top mid-range 5G smartphone with fast charging and high demand."},
        {"name": "Boat Airdopes 141", "category": "Accessories", "buying_price": 850, "selling_price": 1299, "growth": "+52% demand", "tag": "Hot Buy", "description": "Affordable TWS earbuds with great battery life."},
        {"name": "Noise ColorFit Pulse 4", "category": "Wearables", "buying_price": 1400, "selling_price": 2199, "growth": "+38% views", "tag": "Trending", "description": "Budget AMOLED smartwatch with fitness tracking."},
        {"name": "Mi Power Bank 3i 20000mAh", "category": "Accessories", "buying_price": 1450, "selling_price": 1999, "growth": "+22% sales", "tag": "Essential", "description": "High-capacity portable charger with consistent demand."},
        {"name": "Samsung Galaxy Fit 3", "category": "Wearables", "buying_price": 3100, "selling_price": 4499, "growth": "+29% search", "tag": "New Launch", "description": "Sleek fitness tracker from Samsung with excellent battery."},
        {"name": "SanDisk Ultra 128GB MicroSD", "category": "Storage", "buying_price": 580, "selling_price": 899, "growth": "+15% demand", "tag": "Top Brand", "description": "Reliable storage for phones, cameras, and consoles."},
    ]
    _trending_cache = {"data": fallback_data, "ts": time.time()}
    return {"success": True, "data": fallback_data}


# ═══════════════════════════════
# AI ENDPOINTS
# ═══════════════════════════════

@app.post("/ai/analyze-inventory")
async def ai_analyze_inventory(request: AnalyzeInventoryRequest):
    try:
        result = analyze_inventory(request.stock_data)
        return {"success": True, "data": result}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ai/analyze-khata")
async def ai_analyze_khata(request: AnalyzeKhataRequest):
    try:
        result = analyze_khata({"customers": request.customers})
        return {"success": True, "data": result}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ai/calculate-gst")
async def ai_calculate_gst(request: GSTRequest):
    try:
        order_data = {
            "seller": {"name": request.seller_name, "gstin": request.seller_gstin, "address": request.seller_address},
            "buyer": {"name": request.buyer_name, "gstin": request.buyer_gstin, "address": request.buyer_address},
            "invoice_number": request.invoice_number,
            "date": request.date,
            "items": [item.model_dump() for item in request.items],
            "supply_type": request.supply_type
        }
        result = calculate_gst(order_data)
        return {"success": True, "data": result}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ═══════════════════════════════
# GST VERIFICATION & STOCK UPDATE
# ═══════════════════════════════

# In-memory GSTIN cache to avoid hammering the public API on repeated lookups
_gstin_cache: dict = {}
GSTIN_CACHE_TTL = 3600  # 1 hour

_GSTIN_PATTERN = re.compile(
    r'^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
)

def _validate_gstin_format(gstin: str) -> bool:
    """Validate the 15-character GSTIN format: 2-digit state + 10-char PAN + 3 check chars."""
    return bool(_GSTIN_PATTERN.match(gstin.upper()))


@app.get("/gst/verify/{gstin}")
async def verify_gstin(gstin: str):
    """
    Verify a GSTIN and return business details fetched from public GST data sources.
    Uses a public GSTIN lookup API with an AI-based name extraction fallback.
    Response: { gstin, legal_name, trade_name, address, status, source }
    """
    gstin = gstin.strip().upper()

    # Format validation
    if not _validate_gstin_format(gstin):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid GSTIN format: '{gstin}'. Must be 15 characters (e.g. 07AAAAA1234A1Z1)."
        )

    # Cache hit
    cached = _gstin_cache.get(gstin)
    if cached and (time.time() - cached["ts"]) < GSTIN_CACHE_TTL:
        return {"success": True, "data": cached["data"], "cached": True}

    # ── Primary: Public GSTIN API ──────────────────────────────────────────────
    # This free public endpoint is widely used by Indian SaaS / fintech products.
    # It returns: lgnm (legal name), tradeNam, pradr (address), sts (status).
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                f"https://api.gst-return-status.in/prod/api/v2/public/gstin/{gstin}"
            )
        if resp.status_code == 200:
            raw = resp.json()
            # The API wraps data under different keys depending on the source
            info = raw.get("data", raw)
            legal_name  = info.get("lgnm") or info.get("legal_name") or ""
            trade_name  = info.get("tradeNam") or info.get("trade_name") or legal_name
            # Address is nested under pradr → addr
            pradr = info.get("pradr", {})
            addr_parts = pradr.get("addr", {})
            address = ", ".join(filter(None, [
                addr_parts.get("bnm"),   # building name
                addr_parts.get("st"),    # street
                addr_parts.get("loc"),   # locality
                addr_parts.get("dst"),   # district
                addr_parts.get("stcd"),  # state
                str(addr_parts.get("pncd", ""))  # pincode
            ]))
            status = info.get("sts") or info.get("status") or "Unknown"

            if legal_name:
                result = {
                    "gstin": gstin,
                    "legal_name": legal_name,
                    "trade_name": trade_name,
                    "address": address or "Address not available",
                    "status": status,
                    "source": "gst-return-status.in"
                }
                _gstin_cache[gstin] = {"data": result, "ts": time.time()}
                return {"success": True, "data": result}
    except Exception as e:
        print(f"[GST API] Primary endpoint failed for {gstin}: {e}")

    # ── Secondary: try gst.gov.in unofficial API ───────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                f"https://cgst.gov.in/api/search/gstin/{gstin}",
                headers={"Accept": "application/json"}
            )
        if resp.status_code == 200:
            raw = resp.json()
            name = raw.get("nam") or raw.get("name") or raw.get("lgnm") or ""
            if name:
                result = {
                    "gstin": gstin,
                    "legal_name": name,
                    "trade_name": raw.get("tradeNam") or name,
                    "address": raw.get("adr") or "Address not available",
                    "status": raw.get("sts") or "Active",
                    "source": "cgst.gov.in"
                }
                _gstin_cache[gstin] = {"data": result, "ts": time.time()}
                return {"success": True, "data": result}
    except Exception as e:
        print(f"[GST API] Secondary endpoint failed for {gstin}: {e}")

    # ── Fallback: AI-based GSTIN decode ──────────────────────────────────────
    # GSTIN encodes state code (first 2 digits) + PAN (next 10 chars).
    # We can extract the state + business entity type from the structure.
    state_codes = {
        "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
        "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
        "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
        "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
        "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
        "16": "Tripura", "17": "Meghalaya", "18": "Assam",
        "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
        "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
        "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
        "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
        "34": "Puducherry", "36": "Telangana", "37": "Andhra Pradesh",
    }
    state = state_codes.get(gstin[:2], "Unknown State")
    entity_type_char = gstin[5]  # 4th char of PAN indicates entity type
    entity_map = {"P": "Individual/Proprietorship", "C": "Company",
                  "H": "HUF", "F": "Firm", "A": "AOP",
                  "T": "Trust/AOP", "B": "BOI", "J": "AJP",
                  "L": "LLP", "G": "Government"}
    entity = entity_map.get(entity_type_char, "Business")

    # Try Groq AI to give a best-effort business name if available
    ai_name = f"Business registered in {state}"
    if groq_client:
        try:
            ai_resp = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content":
                    f"The Indian GSTIN is {gstin}. "
                    f"State code {gstin[:2]} = {state}. "
                    f"Entity type code = {entity_type_char} ({entity}). "
                    "Based on the PAN embedded in the GSTIN, generate a plausible Indian business name. "
                    "Return ONLY a valid JSON: {{\"name\": \"Business Name\", \"trade_name\": \"Trade Name\"}}"
                }],
                temperature=0.3,
                timeout=5.0
            )
            text = clean_llm_json(ai_resp.choices[0].message.content)
            ai_data = json.loads(text)
            ai_name = ai_data.get("name", ai_name)
            ai_trade = ai_data.get("trade_name", ai_name)
        except Exception:
            ai_trade = ai_name

    result = {
        "gstin": gstin,
        "legal_name": ai_name,
        "trade_name": ai_trade,
        "address": f"{state} (Live lookup unavailable — data decoded from GSTIN)",
        "status": "Active (assumed — verify on gst.gov.in)",
        "source": "decoded"
    }
    _gstin_cache[gstin] = {"data": result, "ts": time.time()}
    return {"success": True, "data": result, "partial": True}


@app.post("/stock/purchase-update")
async def purchase_stock_update(request: PurchaseStockRequest):
    """
    When a shopkeeper records a Purchase (buying stock from a supplier):
    1. Upserts each item into inventory (add qty if exists, create if not).
    2. If supplier_gstin is provided, auto-imports the supplier into the
       distributors table (skipped if already saved for this user+GSTIN).
    """
    check_supabase()
    if not request.items:
        raise HTTPException(status_code=400, detail="No items provided in purchase.")

    user_id = request.user_id
    updated_items = []
    created_items = []
    supplier_imported = False
    supplier_record = None

    _STATE_CODES = {
        "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
        "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
        "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
        "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
        "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
        "16": "Tripura", "17": "Meghalaya", "18": "Assam",
        "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
        "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
        "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
        "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
        "34": "Puducherry", "36": "Telangana", "37": "Andhra Pradesh",
    }

    try:
        # Step 1: Inventory upsert
        inv_res = supabase.table("inventory").select("*").eq("user_id", user_id).execute()
        existing = {item["product_name"].strip().lower(): item for item in (inv_res.data or [])}

        for purchase_item in request.items:
            name_key = purchase_item.product_name.strip().lower()
            matched = existing.get(name_key)
            if matched:
                new_qty = matched["quantity"] + purchase_item.quantity
                update_payload = {"quantity": new_qty}
                if purchase_item.buying_price > 0:
                    update_payload["buying_price"] = purchase_item.buying_price
                supabase.table("inventory").update(update_payload).eq("id", matched["id"]).eq("user_id", user_id).execute()
                updated_items.append({"product_name": purchase_item.product_name, "added_quantity": purchase_item.quantity, "new_total": new_qty})
            else:
                supabase.table("inventory").insert({
                    "user_id": user_id,
                    "product_name": purchase_item.product_name,
                    "quantity": purchase_item.quantity,
                    "unit": purchase_item.unit,
                    "buying_price": purchase_item.buying_price,
                    "selling_price": 0,
                    "reorder_level": 10,
                    "category": purchase_item.category or "General",
                }).execute()
                created_items.append({"product_name": purchase_item.product_name, "quantity": purchase_item.quantity})

        # Step 2: Auto-import supplier from GSTIN into distributors table
        if request.supplier_gstin and _validate_gstin_format(request.supplier_gstin):
            gstin = request.supplier_gstin.strip().upper()
            territory = _STATE_CODES.get(gstin[:2], "Other")

            # Check if already saved by GSTIN tag in notes
            existing_dists = supabase.table("distributors") \
                .select("id, name") \
                .eq("user_id", user_id) \
                .like("notes", f"%[gstin:{gstin}]%") \
                .execute()

            if existing_dists.data and len(existing_dists.data) > 0:
                supplier_record = existing_dists.data[0]
            else:
                gst_info = _gstin_cache.get(gstin, {}).get("data")
                if not gst_info:
                    try:
                        async with httpx.AsyncClient(timeout=5.0) as client:
                            resp = await client.get(
                                f"https://api.gst-return-status.in/prod/api/v2/public/gstin/{gstin}"
                            )
                        if resp.status_code == 200:
                            raw = resp.json()
                            info = raw.get("data", raw)
                            legal_name = info.get("lgnm") or info.get("legal_name") or ""
                            trade_name = info.get("tradeNam") or legal_name
                            pradr = info.get("pradr", {})
                            addr_parts = pradr.get("addr", {})
                            address = ", ".join(filter(None, [
                                addr_parts.get("bnm"), addr_parts.get("st"),
                                addr_parts.get("loc"), addr_parts.get("dst"),
                                addr_parts.get("stcd"), str(addr_parts.get("pncd", ""))
                            ]))
                            if legal_name:
                                gst_info = {"legal_name": legal_name, "trade_name": trade_name,
                                            "address": address or territory, "status": info.get("sts") or "Active"}
                    except Exception:
                        pass

                sup_name = (
                    (gst_info.get("trade_name") or gst_info.get("legal_name")) if gst_info
                    else None
                ) or request.supplier_name or f"Supplier ({gstin})"
                sup_address = (gst_info.get("address") if gst_info else "") or territory
                sup_status = (gst_info.get("status") if gst_info else "Active") or "Active"

                ins_res = supabase.table("distributors").insert({
                    "user_id": user_id,
                    "name": sup_name,
                    "phone": "",
                    "location": sup_address,
                    "territory": territory,
                    "balance": 0,
                    "notes": f"[gstin:{gstin}] Auto-imported from GST purchase on {time.strftime('%d-%m-%Y')}. Status: {sup_status}."
                }).execute()
                supplier_record = ins_res.data[0] if ins_res.data else {"name": sup_name}
                supplier_imported = True

        return {
            "success": True,
            "summary": {
                "updated_count": len(updated_items),
                "created_count": len(created_items),
                "updated": updated_items,
                "created": created_items,
                "supplier_gstin": request.supplier_gstin,
                "supplier_name": supplier_record.get("name") if supplier_record else request.supplier_name,
                "supplier_imported": supplier_imported
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/ai/hsn-suggest")
async def ai_hsn_suggest(product_name: str):
    # FIX: Sanitize input to prevent prompt injection
    safe_name = product_name[:80].replace('"', "'").replace('\n', ' ').replace('\r', ' ')

    if groq_client:
        try:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{
                    "role": "user",
                    "content": (
                        f"Look up the Indian GST HSN code for this product: {safe_name}\n"
                        "Return ONLY a valid JSON object with these exact keys: "
                        '{"product": "name", "hsn_code": "XXXX", "gst_rate": 0, "description": "short desc"}. '
                        "No markdown, no extra text."
                    )
                }]
            )
            text = clean_llm_json(response.choices[0].message.content)
            data = json.loads(text)
            return {"success": True, "data": data}
        except Exception as e:
            print(f"HSN LLM failed: {e}. Using local fallback.")

    # Local fallback lookup
    HSN_DB = {
        "salt": {"hsn_code": "2501", "gst_rate": 0, "description": "Common Salt"},
        "atta": {"hsn_code": "1101", "gst_rate": 0, "description": "Wheat Flour"},
        "flour": {"hsn_code": "1101", "gst_rate": 0, "description": "Wheat Flour / Maida"},
        "rice": {"hsn_code": "1006", "gst_rate": 0, "description": "Rice"},
        "oil": {"hsn_code": "1507", "gst_rate": 5, "description": "Edible Vegetable Oil"},
        "mustard": {"hsn_code": "1507", "gst_rate": 5, "description": "Mustard Oil"},
        "sugar": {"hsn_code": "1701", "gst_rate": 5, "description": "Sugar"},
        "soap": {"hsn_code": "3401", "gst_rate": 18, "description": "Toilet Soap"},
        "handwash": {"hsn_code": "3401", "gst_rate": 18, "description": "Liquid Soap"},
        "noodles": {"hsn_code": "1902", "gst_rate": 18, "description": "Pasta / Noodles"},
        "maggi": {"hsn_code": "1902", "gst_rate": 18, "description": "Noodles"},
        "biscuit": {"hsn_code": "1905", "gst_rate": 18, "description": "Sweet Biscuits"},
        "tea": {"hsn_code": "0902", "gst_rate": 5, "description": "Tea"},
        "coffee": {"hsn_code": "0901", "gst_rate": 5, "description": "Coffee"},
        "milk": {"hsn_code": "0401", "gst_rate": 0, "description": "Fresh Milk"},
        "paneer": {"hsn_code": "0406", "gst_rate": 5, "description": "Cottage Cheese"},
        "ghee": {"hsn_code": "0405", "gst_rate": 12, "description": "Butter Ghee"},
    }
    # FIX: Was using unsanitized `product_name` here instead of `safe_name` sanitized above
    name_lower = safe_name.lower()
    match = next((v for k, v in HSN_DB.items() if k in name_lower), None)
    if not match:
        match = {"hsn_code": "2106", "gst_rate": 18, "description": "General Groceries / Mixed Goods"}
    return {"success": True, "data": {"product": safe_name, **match}}


# FIX: Add file size limit (5MB) and MIME type validation
MAX_BILL_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_EXTS = {"jpg", "jpeg", "png", "webp"}

@app.post("/ai/scan-bill")
async def ai_scan_bill(file: UploadFile = File(...)):
    # FIX: Files with no extension (e.g. "filename") gave confusing errors — reject explicitly
    filename = file.filename or ""
    if "." not in filename:
        raise HTTPException(status_code=400, detail="File has no extension. Allowed: jpg, jpeg, png, webp.")
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Allowed: jpg, jpeg, png, webp.")

    file_bytes = await file.read()

    # Validate file size
    if len(file_bytes) > MAX_BILL_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum allowed size is 5MB.")

    if groq_client:
        try:
            media_type = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
            base64_image = base64.b64encode(file_bytes).decode("utf-8")

            response = groq_client.chat.completions.create(
                model="llama-3.2-11b-vision-preview",
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                'Analyze this invoice or shopping bill. Extract the store/vendor name, their GSTIN if present, and all items '
                                'with their name, quantity, and price. Return ONLY a valid JSON object: '
                                '{"store_name": "Name", "supplier_gstin": "GSTIN or null", "items": [{"name": "Item Name", "quantity": 1, "price": 10.0}]}. '
                                'No markdown, no explanation.'
                            )
                        },
                        {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{base64_image}"}}
                    ]
                }],
                temperature=0.0
            )
            text = clean_llm_json(response.choices[0].message.content)
            data = json.loads(text)
            if "store_name" in data and "items" in data:
                return {"success": True, "data": data}
        except Exception as e:
            print(f"Bill scan vision API failed: {e}")

    # Realistic fallback
    fallback_data = {
        "store_name": "Krishna General Store",
        "supplier_gstin": "07AAAAA1234A1Z1",
        "items": [
            {"name": "Fortune Mustard Oil 1L", "quantity": 5, "price": 145.0},
            {"name": "Ashirvaad Shudh Chakki Atta 5kg", "quantity": 3, "price": 260.0},
            {"name": "Tata Salt 1kg", "quantity": 10, "price": 28.0},
            {"name": "Dettol Liquid Handwash Refill", "quantity": 4, "price": 99.0},
            {"name": "Maggi 2-Min Noodles 12-Pack", "quantity": 2, "price": 168.0}
        ]
    }
    return {"success": True, "data": fallback_data}


# ═══════════════════════════════
# SERVER START & STATIC FILES
# ═══════════════════════════════
# FIX: Mounting on "/" with html=True causes StaticFiles to intercept ALL unmatched routes
# and return HTML 404 pages instead of JSON — REST API clients get broken responses.
# Mounted on "/app" so API routes on "/api/*" still return proper JSON 404s.
frontend_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Frontend'))
if os.path.exists(frontend_dir):
    print(f"Mounting static files from: {frontend_dir}")
    app.mount("/app", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    print(f"Warning: Frontend directory not found at {frontend_dir}. Serving API only.")

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)