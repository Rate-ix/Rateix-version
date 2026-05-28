from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

# AI functions import karo
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ai-inventory'))
from ai.inventory import analyze_inventory
from ai.gst import calculate_gst
from ai.khata import analyze_khata

app = FastAPI(title="Retix Backend", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase client
supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
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
    return {"message": "Retix Backend chal raha hai! 🚀"}

@app.get("/health")
def health():
    return {"status": "ok"}

# ═══════════════════════════════
# ORDERS
# ═══════════════════════════════

@app.get("/orders/{user_id}")
async def get_orders(user_id: str):
    try:
        res = supabase.table("orders").select("*").eq("user_id", user_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/orders/{user_id}")
async def add_order(user_id: str, order: OrderModel):
    try:
        res = supabase.table("orders").insert({
            "user_id": user_id,
            **order.dict()
        }).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str):
    try:
        res = supabase.table("orders").update({"status": status}).eq("id", order_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/orders/{order_id}")
async def delete_order(order_id: str):
    try:
        res = supabase.table("orders").delete().eq("id", order_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ═══════════════════════════════
# INVENTORY
# ═══════════════════════════════

@app.get("/inventory/{user_id}")
async def get_inventory(user_id: str):
    try:
        res = supabase.table("inventory").select("*").eq("user_id", user_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/inventory/{user_id}")
async def add_inventory(user_id: str, item: InventoryModel):
    try:
        res = supabase.table("inventory").insert({
            "user_id": user_id,
            **item.dict()
        }).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/inventory/{item_id}")
async def update_inventory(item_id: str, item: InventoryModel):
    try:
        res = supabase.table("inventory").update(item.dict()).eq("id", item_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/inventory/{item_id}")
async def delete_inventory(item_id: str):
    try:
        res = supabase.table("inventory").delete().eq("id", item_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ═══════════════════════════════
# DISTRIBUTORS
# ═══════════════════════════════

@app.get("/distributors/{user_id}")
async def get_distributors(user_id: str):
    try:
        res = supabase.table("distributors").select("*").eq("user_id", user_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/distributors/{user_id}")
async def add_distributor(user_id: str, dist: DistributorModel):
    try:
        res = supabase.table("distributors").insert({
            "user_id": user_id,
            **dist.dict()
        }).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/distributors/{dist_id}")
async def delete_distributor(dist_id: str):
    try:
        res = supabase.table("distributors").delete().eq("id", dist_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ═══════════════════════════════
# KHATA
# ═══════════════════════════════

@app.get("/khata/{user_id}")
async def get_khata(user_id: str):
    try:
        res = supabase.table("khata").select("*").eq("user_id", user_id).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/khata/{user_id}")
async def add_khata(user_id: str, entry: KhataModel):
    try:
        res = supabase.table("khata").insert({
            "user_id": user_id,
            **entry.dict()
        }).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/khata/{entry_id}")
async def delete_khata(entry_id: str):
    try:
        res = supabase.table("khata").delete().eq("id", entry_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ═══════════════════════════════
# AI ENDPOINTS
# ═══════════════════════════════

@app.post("/ai/analyze-inventory/{user_id}")
async def ai_analyze_inventory(user_id: str):
    try:
        # Supabase se inventory lo
        res = supabase.table("inventory").select("*").eq("user_id", user_id).execute()
        items = res.data

        if not items:
            return {"success": False, "message": "Inventory empty hai!"}

        # Format karo
        stock_data = {}
        for item in items:
            stock_data[item["product_name"]] = {
                "current_stock": item["quantity"],
                "min_stock": item["reorder_level"] or 10,
                "unit": item["unit"] or "units"
            }

        result = analyze_inventory(stock_data)
        return {"success": True, "data": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ai/analyze-khata/{user_id}")
async def ai_analyze_khata(user_id: str):
    try:
        res = supabase.table("khata").select("*").eq("user_id", user_id).execute()
        entries = res.data

        if not entries:
            return {"success": False, "message": "Khata empty hai!"}

        # Party wise group karo
        party_map = {}
        for entry in entries:
            name = entry["party_name"]
            if name not in party_map:
                party_map[name] = {
                    "name": name,
                    "phone": "",
                    "transactions": []
                }
            party_map[name]["transactions"].append({
                "date": entry["entry_date"],
                "type": "credit" if entry["type"] == "Credit" else "payment",
                "amount": float(entry["amount"]),
                "description": entry["description"] or ""
            })

        result = analyze_khata({"customers": list(party_map.values())})
        return {"success": True, "data": result}

    except Exception as e:
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
            "items": [item.dict() for item in request.items],
            "supply_type": request.supply_type
        }
        result = calculate_gst(order_data)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/ai/hsn-suggest")
async def ai_hsn_suggest(product_name: str):
    try:
        from openai import OpenAI
        import json

        client = OpenAI(
            api_key=os.getenv("GROK_API_KEY"),
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
        raise HTTPException(status_code=500, detail=str(e))

# ═══════════════════════════════
# SERVER START
# ═══════════════════════════════
if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)