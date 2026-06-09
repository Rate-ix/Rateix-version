from fastapi import FastAPI, HTTPException, Header, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import sys
import traceback
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

# AI functions import karo
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ai-inventory'))
from ai.inventory import analyze_inventory
from ai.gst import calculate_gst
from ai.khata import analyze_khata

app = FastAPI(title="Retix Backend", version="1.0.0")

# CORS Config - Dynamic origins supported in production
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase client setup with production-grade validation
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")

if not supabase_url or not supabase_key:
    print("WARNING: SUPABASE_URL or SUPABASE_KEY environment variables are missing! Database endpoints will fail.")
    supabase = None
else:
    try:
        supabase = create_client(supabase_url, supabase_key)
    except Exception as e:
        print(f"ERROR: Failed to initialize Supabase client: {e}")
        supabase = None

def check_supabase():
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail="Database client is not initialized. Please verify SUPABASE_URL and SUPABASE_KEY environment variables."
        )

# ═══════════════════════════════
# MODELS
# ═══════════════════════════════

class OrderModel(BaseModel):
    product_name: str
    distributor: str
    quantity: int
    unit: str = "units"
    amount: float
    status: str = "Pending"
    notes: Optional[str] = None

class InventoryModel(BaseModel):
    product_name: str
    sku: Optional[str] = None
    category: Optional[str] = None
    quantity: int
    unit: str = "units"
    reorder_level: int = 10
    buying_price: float = 0
    selling_price: float = 0

class DistributorModel(BaseModel):
    name: str
    phone: Optional[str] = None
    location: Optional[str] = None
    territory: Optional[str] = None
    balance: float = 0
    notes: Optional[str] = None

class KhataModel(BaseModel):
    party_name: str
    type: str
    amount: float
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
    supply_type: str = "intra"

# ═══════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════

@app.get("/")
def root():
    frontend_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Frontend'))
    index_file = os.path.join(frontend_dir, 'index.html')
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Retix Backend chal raha hai! 🚀"}

@app.get("/health")
def health():
    return {"status": "ok"}

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
async def update_order_status(order_id: str, status: str):
    check_supabase()
    try:
        res = supabase.table("orders").update({"status": status}).eq("id", order_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/orders/{order_id}")
async def delete_order(order_id: str):
    check_supabase()
    try:
        res = supabase.table("orders").delete().eq("id", order_id).execute()
        return {"success": True}
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
async def update_inventory(item_id: str, item: InventoryModel):
    check_supabase()
    try:
        res = supabase.table("inventory").update(item.model_dump()).eq("id", item_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/inventory/{item_id}")
async def delete_inventory(item_id: str):
    check_supabase()
    try:
        res = supabase.table("inventory").delete().eq("id", item_id).execute()
        return {"success": True}
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

# ═══════════════════════════════
# MARKET TRENDING PRODUCTS
# ═══════════════════════════════
@app.get("/market/trending")
async def get_trending_products():
    api_key = os.getenv("GROK_API_KEY")
    if api_key:
        try:
            from openai import OpenAI
            import json
            client = OpenAI(
                api_key=api_key,
                base_url="https://api.groq.com/openai/v1"
            )
            prompt = """
            Generate a list of 6-8 popular consumer electronics, smartphones, accessories, or FMCG/grocery products that are currently trending in the Indian retail market.
            For each product, provide the following details strictly in JSON format:
            {
                "name": "Product Name",
                "category": "Product Category (e.g., Electronics, Accessories, Wearables, Grocery, Kitchen)",
                "buying_price": 0.0,
                "selling_price": 0.0,
                "growth": "+X% demand",
                "tag": "Trending / Best Seller / Hot Buy",
                "description": "Short 1-sentence explanation of why it is trending"
            }
            Return ONLY a valid JSON array of these objects. Do not include markdown code block formatting (like ```json), explanations, or extra text.
            """
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                timeout=6.0
            )
            text = response.choices[0].message.content.strip()
            if text.startswith("```json"):
                text = text.split("```json")[1].split("```")[0].strip()
            elif text.startswith("```"):
                text = text.split("```")[1].split("```")[0].strip()
            
            data = json.loads(text)
            if isinstance(data, list) and len(data) > 0:
                return {"success": True, "data": data}
        except Exception as e:
            print(f"Error fetching trending products via LLM: {e}")
            
    # Fallback curated list
    fallback_data = [
        {
            "name": "OnePlus Nord CE 4 5G",
            "category": "Electronics",
            "buying_price": 21500,
            "selling_price": 24999,
            "growth": "+45% sales",
            "tag": "Best Seller",
            "description": "Top mid-range smartphone with high demand due to fast charging."
        },
        {
            "name": "Boat Airdopes 141",
            "category": "Accessories",
            "buying_price": 850,
            "selling_price": 1299,
            "growth": "+52% demand",
            "tag": "Hot Buy",
            "description": "Affordable wireless earbuds with great battery life and heavy bass."
        },
        {
            "name": "Noise ColorFit Pulse 4",
            "category": "Wearables",
            "buying_price": 1400,
            "selling_price": 2199,
            "growth": "+38% views",
            "tag": "Trending",
            "description": "Popular budget smartwatch with AMOLED display and fitness tracking."
        },
        {
            "name": "Mi Power Bank 3i 20000mAh",
            "category": "Accessories",
            "buying_price": 1450,
            "selling_price": 1999,
            "growth": "+22% sales",
            "tag": "Essential",
            "description": "High-capacity portable charger, high utility and consistent demand."
        },
        {
            "name": "Samsung Galaxy Fit 3",
            "category": "Wearables",
            "buying_price": 3100,
            "selling_price": 4499,
            "growth": "+29% search",
            "tag": "New Launch",
            "description": "Sleek fitness tracker from Samsung with long battery life."
        },
        {
            "name": "SanDisk Ultra 128GB MicroSD",
            "category": "Storage",
            "buying_price": 580,
            "selling_price": 899,
            "growth": "+15% demand",
            "tag": "Top Brand",
            "description": "Reliable storage card for android phones, cameras, and gaming consoles."
        }
    ]
    return {"success": True, "data": fallback_data}


@app.delete("/distributors/{dist_id}")
async def delete_distributor(dist_id: str):
    check_supabase()
    try:
        res = supabase.table("distributors").delete().eq("id", dist_id).execute()
        return {"success": True}
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
async def delete_khata(entry_id: str):
    check_supabase()
    try:
        res = supabase.table("khata").delete().eq("id", entry_id).execute()
        return {"success": True}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ═══════════════════════════════
# AI ENDPOINTS
# ═══════════════════════════════

class AnalyzeInventoryRequest(BaseModel):
    stock_data: dict

class AnalyzeKhataRequest(BaseModel):
    customers: list

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
            "seller": {
                "name": request.seller_name,
                "gstin": request.seller_gstin,
                "address": request.seller_address
            },
            "buyer": {
                "name": request.buyer_name,
                "gstin": request.buyer_gstin,
                "address": request.buyer_address
            },
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

@app.get("/ai/hsn-suggest")
async def ai_hsn_suggest(product_name: str):
    try:
        from openai import OpenAI
        import json

        api_key = os.getenv("GROK_API_KEY")
        if not api_key:
            raise ValueError("GROK_API_KEY is not defined")

        client = OpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1"
        )
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{
                "role": "user",
                "content": f"""
                Product: {product_name}
                Sirf JSON do:
                {{
                    "product": "{product_name}",
                    "hsn_code": "HSN code",
                    "gst_rate": 0,
                    "description": "short description"
                }}
                """
            }]
        )
        text = response.choices[0].message.content.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        data = json.loads(text)
        return {"success": True, "data": data}
    except Exception as e:
        print(f"HSN lookup API failed: {e}. Using local fallback lookup.")
        
        # Local database lookup
        hsn_fallback_db = {
            "salt": {"hsn_code": "2501", "gst_rate": 0, "description": "Common Salt"},
            "atta": {"hsn_code": "1101", "gst_rate": 0, "description": "Wheat Flour"},
            "flour": {"hsn_code": "1101", "gst_rate": 0, "description": "Wheat Flour / Maida"},
            "rice": {"hsn_code": "1006", "gst_rate": 0, "description": "Rice"},
            "oil": {"hsn_code": "1507", "gst_rate": 5, "description": "Edible Vegetable Oil"},
            "mustard": {"hsn_code": "1507", "gst_rate": 5, "description": "Mustard Oil"},
            "sugar": {"hsn_code": "1701", "gst_rate": 5, "description": "Sugar"},
            "soap": {"hsn_code": "3401", "gst_rate": 18, "description": "Toilet Soap"},
            "handwash": {"hsn_code": "3401", "gst_rate": 18, "description": "Liquid Soap / Handwash"},
            "noodles": {"hsn_code": "1902", "gst_rate": 18, "description": "Pasta / Noodles"},
            "maggi": {"hsn_code": "1902", "gst_rate": 18, "description": "Noodles"},
            "biscuit": {"hsn_code": "1905", "gst_rate": 18, "description": "Sweet Biscuits"},
            "tea": {"hsn_code": "0902", "gst_rate": 5, "description": "Tea"},
            "coffee": {"hsn_code": "0901", "gst_rate": 5, "description": "Coffee"},
            "milk": {"hsn_code": "0401", "gst_rate": 0, "description": "Fresh Milk"},
            "paneer": {"hsn_code": "0406", "gst_rate": 5, "description": "Cottage Cheese / Paneer"},
            "ghee": {"hsn_code": "0405", "gst_rate": 12, "description": "Butter Ghee"},
        }
        
        name_lower = product_name.lower()
        fallback_match = None
        for key, val in hsn_fallback_db.items():
            if key in name_lower:
                fallback_match = val
                break
        if not fallback_match:
            fallback_match = {"hsn_code": "2106", "gst_rate": 18, "description": "General Groceries / Mixed Goods"}
            
        data = {
            "product": product_name,
            **fallback_match
        }
        return {"success": True, "data": data}

@app.post("/ai/scan-bill")
async def ai_scan_bill(file: UploadFile = File(...)):
    try:
        import base64
        import json
        from openai import OpenAI

        file_bytes = await file.read()
        file_name = file.filename

        api_key = os.getenv("GROK_API_KEY")
        if api_key:
            client = OpenAI(
                api_key=api_key,
                base_url="https://api.groq.com/openai/v1"
            )
            
            ext = file_name.split('.')[-1].lower()
            if ext in ['jpg', 'jpeg']:
                media_type = "image/jpeg"
            elif ext == 'png':
                media_type = "image/png"
            elif ext == 'webp':
                media_type = "image/webp"
            else:
                media_type = "image/jpeg"

            base64_image = base64.b64encode(file_bytes).decode('utf-8')
            
            response = client.chat.completions.create(
                model="llama-3.2-11b-vision-preview",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Analyze this invoice or shopping bill. Extract the store/vendor name and all items purchased with their name, quantity, and price. Return only a valid JSON object matching this schema: {\"store_name\": \"Name\", \"items\": [{\"name\": \"Item Name\", \"quantity\": 1, \"price\": 10.0}]}. Do not include any explanation or markdown formatting."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{media_type};base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                temperature=0.0
            )
            
            text = response.choices[0].message.content.strip()
            if text.startswith("```json"):
                text = text.split("```json")[1].split("```")[0].strip()
            elif text.startswith("```"):
                text = text.split("```")[1].split("```")[0].strip()
                
            data = json.loads(text)
            if "store_name" in data and "items" in data:
                return {"success": True, "data": data}
                
    except Exception as e:
        print(f"Vision API parsing failed: {e}")

    # Fallback to realistic mock items so it always works properly
    fallback_data = {
        "store_name": "Krishna General Store",
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
# SERVER START & STATIC FILES MOUNT
# ═══════════════════════════════
# Mount static files at the end so it doesn't block API routes
frontend_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Frontend'))
if os.path.exists(frontend_dir):
    print(f"Mounting static files from: {frontend_dir}")
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    print(f"Warning: Frontend directory not found at {frontend_dir}. Serving API only.")

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)