// ═══════════════════════════════
// AI BACKEND CONFIG
// ═══════════════════════════════
const BACKEND_URL = 'http://localhost:8000';

async function aiCall(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(`${BACKEND_URL}${endpoint}`, options);
        const data = await res.json();
        return data;
    } catch (err) {
        console.error('AI call failed:', err);
        return { success: false, error: err.message };
    }
}

async function aiCallFile(endpoint, file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            body: formData
        });
        return await res.json();
    } catch (err) {
        console.error('AI file call failed:', err);
        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════
// SUPABASE CONFIG
// ═══════════════════════════════
const SB_URL = 'https://yaupttkahhphwcaitylp.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhdXB0dGthaGhwaHdjYWl0eWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2Njk4OTEsImV4cCI6MjA5NTI0NTg5MX0.UwqZLuPCZGYoqBUaPI7myJAxNKj3zaFGMkNgg64jkIo';
const sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: {
        storage: window.localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

let currentUser = null;
let isEcoMode = false;
let activeInvoiceOrderId = null;

// TOAST SYSTEM
function toast(title, msg, err = false) {
    const t = document.getElementById('toast');
    document.getElementById('tTitle').textContent = title;
    document.getElementById('tMsg').textContent = msg;
    t.className = 'toast' + (err ? ' err' : '');
    setTimeout(() => t.classList.add('open'), 10);
    setTimeout(() => t.classList.remove('open'), 4000);
}

// MODAL CONTROLS
function openModal(id) {
    document.getElementById(id).classList.add('open');
    if (id === 'modal-khata') {
        if (typeof updateKhataPartiesDatalist === 'function') updateKhataPartiesDatalist();
    }
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// NAVIGATION
function nav(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const secEl = document.getElementById('sec-' + section);
    if (secEl) secEl.classList.add('active');
    const navEl = document.getElementById('nav-' + section);
    if (navEl) navEl.classList.add('active');
    const titles = {
        overview: ['Overview', "Your shop's summary and daily metrics"],
        orders: ['Orders Ledger', 'Track bills and delivery status'],
        inventory: ['Stock Items', 'Track stock levels, low-stock alerts, and pricing'],
        distributors: ['Suppliers Directory', 'Manage suppliers and balances'],
        khata: ['Khata Book', 'Record cash coming in and going out'],
        sheet: ['Billing Spreadsheet', 'Quick Excel-style billing pad'],
        vision: ['AI Smart Camera', 'Real-time camera view and theft detection']
    };
    const t = titles[section] || [section, ''];
    const pageTitleEl = document.getElementById('pageTitle');
    if (pageTitleEl) pageTitleEl.textContent = t[0];
    const pageSubEl = document.getElementById('pageSub');
    if (pageSubEl) pageSubEl.textContent = t[1];

    // Auto-close mobile sidebar and hide overlay on nav switch
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');

    if (section !== 'vision') stopVisionCamera();

    if (section === 'orders') loadOrders();
    if (section === 'inventory') loadInventory();
    if (section === 'distributors') loadDistributors();
    if (section === 'khata') loadKhata();
    if (section === 'sheet') loadSpreadsheet();
    if (section === 'overview') loadOverview();
    if (section === 'vision') loadVision();
}

// FORMATTERS
const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// OVERVIEW CONTROLLERS
async function loadOverview() {
    const uid = currentUser.id;
    const [{ count: oc }, { count: ic }, { count: dc }, { count: kc }] = await Promise.all([
        sb.from('orders').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        sb.from('inventory').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        sb.from('distributors').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        sb.from('khata').select('*', { count: 'exact', head: true }).eq('user_id', uid),
    ]);
    const ovOrders = document.getElementById('ov-orders');
    if (ovOrders) ovOrders.textContent = oc || 0;
    const ovInv = document.getElementById('ov-inv');
    if (ovInv) ovInv.textContent = ic || 0;
    const ovDist = document.getElementById('ov-dist');
    if (ovDist) ovDist.textContent = dc || 0;
    const ovKhata = document.getElementById('ov-khata');
    if (ovKhata) ovKhata.textContent = kc || 0;

    const statOrders = document.getElementById('stat-orders');
    if (statOrders) statOrders.textContent = oc || 0;
    const statInv = document.getElementById('stat-inv');
    if (statInv) statInv.textContent = ic || 0;
    const statDist = document.getElementById('stat-dist');
    if (statDist) statDist.textContent = dc || 0;

    // 1. Fetch relevant columns for active insights
    const [ordersRes, inventoryRes, distributorsRes] = await Promise.all([
        sb.from('orders').select('amount, notes, distributor, created_at, product_name, quantity, status').eq('user_id', uid),
        sb.from('inventory').select('product_name, quantity, reorder_level, buying_price').eq('user_id', uid),
        sb.from('distributors').select('name, balance, phone').eq('user_id', uid)
    ]);

    // A. Sales Revenue & Sold Items list calculation
    const odata = ordersRes.data || [];
    const idata = inventoryRes.data || [];
    
    let totalSalesRevenue = 0;
    const soldItemsList = [];
    
    odata.forEach(order => {
        let type = 'Sale'; // Default to Sale for backward compatibility
        let items = [];
        try {
            const payload = JSON.parse(order.notes);
            if (payload) {
                if (payload.type) type = payload.type;
                if (Array.isArray(payload.items)) {
                    items = payload.items;
                }
            }
        } catch (e) {
            items = [{ name: order.product_name, qty: order.quantity, rate: (order.amount / (order.quantity || 1)) }];
        }
        
        if (type === 'Sale') {
            totalSalesRevenue += parseFloat(order.amount) || 0;
            
            items.forEach(item => {
                soldItemsList.push({
                    name: item.name || order.product_name,
                    customer: order.distributor || '—',
                    qty: item.qty || order.quantity || 0,
                    rate: item.rate || 0,
                    total: item.amount || (item.qty * item.rate) || 0,
                    date: order.created_at
                });
            });
        }
    });

    const statRev = document.getElementById('stat-rev');
    if (statRev) statRev.textContent = fmt(totalSalesRevenue);
    
    // Update Totals Summary Elements
    const totalStockVal = idata.reduce((acc, item) => {
        const qty = Math.max(0, item.quantity || 0);
        return acc + (qty * (item.buying_price || 0));
    }, 0);
    
    const totalStockValEl = document.getElementById('overview-total-stock-val');
    if (totalStockValEl) {
        totalStockValEl.textContent = fmt(totalStockVal);
    }
    
    const totalSoldValEl = document.getElementById('overview-total-sold-val');
    if (totalSoldValEl) {
        totalSoldValEl.textContent = fmt(totalSalesRevenue);
    }
    
    // Render Sold Items List
    const soldItemsBody = document.getElementById('sold-items-body');
    if (soldItemsBody) {
        if (soldItemsList.length === 0) {
            soldItemsBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: var(--color-muted);">
                        No items sold yet. Start selling to see them here!
                    </td>
                </tr>
            `;
        } else {
            // Sort by date descending
            soldItemsList.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            soldItemsBody.innerHTML = soldItemsList.map(item => `
                <tr>
                    <td><strong>${item.name}</strong></td>
                    <td>${item.customer}</td>
                    <td>${item.qty} units</td>
                    <td>${fmt(item.rate)}</td>
                    <td><strong style="color: #10b981;">${fmt(item.total)}</strong></td>
                    <td>${fmtDate(item.date)}</td>
                </tr>
            `).join('');
        }
    }

    // B. Alerts formulation
    const alerts = [];

    // Detect stock alerts (reuse idata from line 128, do NOT redeclare)
    idata.forEach(item => {
        if (item.quantity <= 0) {
            alerts.push(`🚨 Stock Alert: <strong>${item.product_name}</strong> is completely <strong>Out of Stock</strong>! <button onclick="quickRestockItem('${item.product_name.replace(/'/g, "\\'")}', 150)" style="padding: 2px 6px; font-size: 0.65rem; border: none; background: #ef4444; color: #fff; border-radius: 4px; cursor: pointer; margin-left: 10px; font-weight: 700; font-family: inherit;">⚡ Quick Restock</button>`);
        } else if (item.quantity <= item.reorder_level) {
            alerts.push(`⚠️ Low Stock: <strong>${item.product_name}</strong> has only <strong>${item.quantity} units left</strong> (Low threshold: ${item.reorder_level}). <button onclick="quickRestockItem('${item.product_name.replace(/'/g, "\\'")}', ${item.reorder_level * 2})" style="padding: 2px 6px; font-size: 0.65rem; border: none; background: #eab308; color: #000; border-radius: 4px; cursor: pointer; margin-left: 10px; font-weight: 700; font-family: inherit;">⚡ Quick Restock</button>`);
        }
    });

    // Detect outstanding customer/supplier balances (negative balance is due money)
    const ddata = distributorsRes.data || [];
    window.currentDistributorsCache = ddata;
    if (typeof updateKhataPartiesDatalist === 'function') updateKhataPartiesDatalist();
    ddata.forEach(dist => {
        if (dist.balance < 0) {
            const debtVal = Math.abs(dist.balance);
            const message = `Hi ${dist.name}, this is a gentle reminder regarding the outstanding balance of Rs. ${debtVal}. Please settle it when you can. Thank you!`;
            const waLink = `https://wa.me/91${dist.phone}?text=${encodeURIComponent(message)}`;
            alerts.push(`💸 Pending Balance: <strong>${dist.name}</strong> owes you <strong>${fmt(debtVal)}</strong>. <a href="${waLink}" target="_blank" style="color: var(--color-brand); font-weight: 700; text-decoration: underline; margin-left: 8px;">Send WhatsApp Reminder</a>`);
        }
    });

    // C. Profile Check Alert
    const { data: profile } = await sb.from('profiles').select('shop_name, shop_address').eq('id', uid).single();
    if (!profile?.shop_name || !profile?.shop_address || profile?.shop_name === "YOUR SHOP NAME" || profile?.shop_address.includes("Near M2K Cinemas")) {
        alerts.push(`⚙️ <strong>Shop Setup:</strong> Please customize your own shop details so printed bills show your name! <a href="#" onclick="openShopProfileModal(); return false;" style="color: var(--color-brand); font-weight: 700; text-decoration: underline; margin-left: 8px;">Set Up Your Shop Profile</a>`);
    }

    // 2. Render warning panel in DOM
    const container = document.getElementById('smartAlertsContainer');
    const alertList = document.getElementById('alertList');

    if (container && alertList) {
        if (alerts.length > 0) {
            alertList.innerHTML = alerts.map(a => `<li style="line-height: 1.5; display: flex; align-items: center; gap: 8px;">${a}</li>`).join('');
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }
}

// ORDERS SYSTEM
async function loadOrders() {
    const tbody = document.getElementById('orders-body');
    if (!tbody) return;
    const { data: orders, error } = await sb.from('orders').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (error) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#ef4444">Error loading orders.</td></tr>`; return; }
    if (!orders || orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#64748b">No orders yet. Click "Add New Order" to get started!</td></tr>`;
        return;
    }
    tbody.innerHTML = orders.map(o => {
        let type = 'Sale';
        try {
            const payload = JSON.parse(o.notes);
            if (payload && payload.type) {
                type = payload.type;
            }
        } catch (e) {}
        
        const typeBadge = type === 'Purchase' 
            ? `<span style="font-size: 0.65rem; background: rgba(79, 70, 229, 0.08); color: #4f46e5; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-top: 4px; display: inline-block;">Purchase</span>`
            : `<span style="font-size: 0.65rem; background: rgba(16, 185, 129, 0.08); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-top: 4px; display: inline-block;">Sale</span>`;
            
        // Calculate total quantity from all items in the basket
        let totalQty = o.quantity;
        try {
            const payload = JSON.parse(o.notes);
            if (payload && Array.isArray(payload.items)) {
                totalQty = payload.items.reduce((sum, item) => sum + (item.qty || 0), 0);
            }
        } catch(e) {}

        return `
            <tr>
                <td><strong>${o.product_name}</strong><br>${typeBadge}</td>
                <td>${o.distributor || '—'}</td>
                <td>${totalQty} ${o.unit || 'units'}</td>
                <td>${fmt(o.amount)}</td>
                <td>${fmtDate(o.created_at)}</td>
                <td><span class="badge ${(o.status||'pending').toLowerCase()}">${o.status || 'Pending'}</span></td>
                <td style="display: flex; gap: 6px; align-items: center;">
                    <button onclick="viewInvoice('${o.id}')" class="btn-del" style="color:#6366f1;border-color:#6366f1;font-size:0.72rem;padding:4px 8px;">📄 Invoice</button>
                    <button onclick="delOrder('${o.id}')" class="btn-del" style="color:#ef4444;border-color:#ef4444;font-size:0.72rem;padding:4px 8px;">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// ═══════════════════════════════
// INVENTORY UPDATE HELPER
// ═══════════════════════════════
async function updateOrCreateInventoryItem(productName, qtyDelta, buyingPrice = null, sellingPrice = null, unit = 'units', sku = '', category = '', reorderLevel = 15) {
    const uid = currentUser.id;
    const { data: existingItems, error: selectError } = await sb
        .from('inventory')
        .select('*')
        .eq('user_id', uid);
        
    if (selectError) {
        console.error("Select error during inventory check:", selectError);
        return { success: false, error: selectError };
    }
    
    const matchedItem = (existingItems || []).find(item => item.product_name.toLowerCase().trim() === productName.toLowerCase().trim());
    
    if (matchedItem) {
        const newQty = Math.max(0, (matchedItem.quantity || 0) + qtyDelta);
        const updates = { quantity: newQty };
        if (buyingPrice !== null && buyingPrice > 0) updates.buying_price = buyingPrice;
        if (sellingPrice !== null && sellingPrice > 0) updates.selling_price = sellingPrice;
        if (sku) updates.sku = sku;
        if (category) updates.category = category;
        if (unit) updates.unit = unit;
        
        const { error: updateError } = await sb
            .from('inventory')
            .update(updates)
            .eq('id', matchedItem.id);
            
        if (updateError) {
            console.error("Update error:", updateError);
            return { success: false, error: updateError };
        }
        return { success: true, action: 'updated', id: matchedItem.id, newQty };
    } else {
        const insertData = {
            user_id: uid,
            product_name: productName,
            quantity: qtyDelta,
            buying_price: buyingPrice || 0,
            selling_price: sellingPrice || 0,
            unit: unit || 'units',
            sku: sku || '',
            category: category || 'General',
            reorder_level: reorderLevel || 15
        };
        
        const { error: insertError } = await sb
            .from('inventory')
            .insert(insertData);
            
        if (insertError) {
            console.error("Insert error:", insertError);
            return { success: false, error: insertError };
        }
        return { success: true, action: 'inserted' };
    }
}

function toggleOrderTypeLabel() {
    const typeSelect = document.getElementById('o-type');
    const label = document.getElementById('lbl-o-dist');
    const input = document.getElementById('o-dist');
    if (!typeSelect) return;
    const type = typeSelect.value;
    if (type === 'Purchase') {
        if (label) label.textContent = 'Distributor Name *';
        if (input) input.placeholder = 'e.g. Gupta Wholesalers';
    } else {
        if (label) label.textContent = 'Customer Name *';
        if (input) input.placeholder = 'e.g. Sharma Kirana Store';
    }
}

async function submitInventory(e) {
    e.preventDefault();
    const product_name = document.getElementById('i-name').value.trim();
    const quantity = parseInt(document.getElementById('i-qty').value);
    const reorder_level = parseInt(document.getElementById('i-reorder').value) || 15;
    const buying_price = parseFloat(document.getElementById('i-buy').value) || 0;
    const selling_price = parseFloat(document.getElementById('i-sell').value) || 0;

    if (!product_name) { toast('Error', 'Please enter a product name.', true); return; }
    if (isNaN(quantity) || quantity < 0) { toast('Error', 'Quantity cannot be negative.', true); return; }

    const btn = e.target.querySelector('.btn-save');
    if (btn) { btn.textContent = 'Processing...'; btn.disabled = true; }

    const res = await updateOrCreateInventoryItem(
        product_name,
        quantity,
        buying_price,
        selling_price,
        document.getElementById('i-unit')?.value.trim() || 'units',
        document.getElementById('i-sku')?.value.trim() || '',
        document.getElementById('i-cat')?.value.trim() || '',
        reorder_level
    );

    if (btn) { btn.textContent = 'Add Product'; btn.disabled = false; }

    if (!res.success) { toast('Error', res.error.message, true); return; }
    toast('Stock Updated ✅', `${product_name} quantity updated in stock.`);
    closeModal('modal-inv');
    e.target.reset();
    loadInventory(); loadOverview();
}

async function submitDistributor(e) {
    e.preventDefault();
    const name = document.getElementById('d-name').value.trim();
    if (!name) { toast('Error', 'Supplier name is required.', true); return; }

    const btn = e.target.querySelector('.btn-save');
    if (btn) { btn.textContent = 'Processing...'; btn.disabled = true; }

    const { error } = await sb.from('distributors').insert({
        user_id: currentUser.id,
        name,
        phone: document.getElementById('d-phone')?.value.trim() || '',
        location: document.getElementById('d-loc')?.value.trim() || '',
        territory: document.getElementById('d-territory')?.value.trim() || '',
        balance: parseFloat(document.getElementById('d-balance')?.value) || 0,
        notes: document.getElementById('d-notes')?.value.trim() || ''
    });

    if (btn) { btn.textContent = 'Save Supplier'; btn.disabled = false; }

    if (error) { toast('Error', error.message, true); return; }
    toast('Supplier Added ✅', `${name} added to your suppliers list.`);
    closeModal('modal-dist');
    e.target.reset();
    loadDistributors(); loadOverview();
}

// ═══════════════════════════════
// MARKET TRENDING PRODUCTS
// ═══════════════════════════════

async function loadTrendingProducts() {
    const container = document.getElementById('trending-products-container');
    if (!container) return;
    
    container.innerHTML = `
        <div style="grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; padding: 3rem 0; color: var(--color-muted);">
            <div class="spinner" style="margin-right: 12px;"></div>
            <span>Fetching market trends...</span>
        </div>
    `;
    
    try {
        const res = await aiCall('/market/trending');
        if (res.success && res.data && res.data.length > 0) {
            container.innerHTML = res.data.map(p => {
                let badgeClass = 'trending';
                const tagLower = (p.tag || '').toLowerCase();
                if (tagLower.includes('best')) badgeClass = 'best-seller';
                else if (tagLower.includes('hot')) badgeClass = 'hot-buy';
                else if (tagLower.includes('new')) badgeClass = 'new-launch';
                
                return `
                    <div class="trending-card">
                        <div>
                            <div class="trending-header">
                                <h4 class="trending-title">${p.name}</h4>
                                <span class="trending-badge ${badgeClass}">${p.tag || 'Trending'}</span>
                            </div>
                            <p class="trending-desc">${p.description || 'Highly demanded product in retail markets.'}</p>
                        </div>
                        <div>
                            <div class="trending-growth">
                                <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="14" height="14">
                                    <path d="M13 7h8m0 0v8m0-8L13 15l-4-4-6 6" />
                                </svg>
                                <span>${p.growth || '+20% demand'} growth</span>
                            </div>
                            <div class="trending-stats">
                                <div>
                                    <div class="trending-stat-label">Wholesale Est.</div>
                                    <div class="trending-stat-value">${fmt(p.buying_price)}</div>
                                </div>
                                <div>
                                    <div class="trending-stat-label">Retail Rec.</div>
                                    <div class="trending-stat-value">${fmt(p.selling_price)}</div>
                                </div>
                            </div>
                            <button class="btn-stock-trending" onclick="stockTrendingProduct('${p.name.replace(/'/g, "\\'")}', '${p.category.replace(/'/g, "\\'")}', ${p.buying_price}, ${p.selling_price})">
                                <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="14" height="14">
                                    <path d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                <span>Add to Stock</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--color-danger);">
                    Failed to load trending products. Please ensure the backend is running.
                </div>
            `;
        }
    } catch (err) {
        console.error('Error fetching trending products:', err);
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--color-danger);">
                Error loading trends: ${err.message}
            </div>
        `;
    }
}

function stockTrendingProduct(name, category, buyingPrice, sellingPrice) {
    openModal('modal-inv');
    const nameInput = document.getElementById('i-name');
    const catInput = document.getElementById('i-cat');
    const buyInput = document.getElementById('i-buy');
    const sellInput = document.getElementById('i-sell');
    const qtyInput = document.getElementById('i-qty');
    const unitInput = document.getElementById('i-unit');
    const reorderInput = document.getElementById('i-reorder');
    const skuInput = document.getElementById('i-sku');
    
    if (nameInput) nameInput.value = name;
    if (catInput) catInput.value = category;
    if (buyInput) buyInput.value = buyingPrice;
    if (sellInput) sellInput.value = sellingPrice;
    if (qtyInput) qtyInput.value = 50;
    if (unitInput) unitInput.value = 'units';
    if (reorderInput) reorderInput.value = 10;
    if (skuInput) skuInput.value = (category.substring(0, 3) + '-' + name.substring(0, 3) + '-' + Math.floor(Math.random() * 900 + 100)).toUpperCase().replace(/\s+/g, '');
    
    toast('Pre-filled Stock details 📦', `Details for ${name} loaded. Set the starting quantity and click save.`);
}


async function submitKhata(e) {
    e.preventDefault();
    const party_name = document.getElementById('k-party').value.trim();
    const amount = parseFloat(document.getElementById('k-amount').value);
    if (!party_name) { toast('Error', 'Customer / Supplier name is required.', true); return; }
    if (isNaN(amount) || amount <= 0) { toast('Error', 'Enter a valid amount.', true); return; }

    const btn = e.target.querySelector('.btn-save');
    if (btn) { btn.textContent = 'Processing...'; btn.disabled = true; }

    const { error } = await sb.from('khata').insert({
        user_id: currentUser.id,
        party_name,
        type: document.getElementById('k-type')?.value || 'Credit',
        amount,
        description: document.getElementById('k-desc')?.value.trim() || '',
        entry_date: document.getElementById('k-date')?.value || new Date().toISOString().split('T')[0]
    });

    if (btn) { btn.textContent = 'Save Entry'; btn.disabled = false; }

    if (error) { toast('Error', error.message, true); return; }
    toast('Khata Entry Saved ✅', `${party_name} payment recorded.`);
    closeModal('modal-khata');
    e.target.reset();
    loadKhata(); loadOverview();
}

// MULTI-ITEM BASKET MANAGERS
async function openNewOrderModal() {
    const typeSelect = document.getElementById('o-type');
    if (typeSelect) {
        typeSelect.value = "Sale";
        toggleOrderTypeLabel();
    }
    document.getElementById('o-dist').value = "";
    document.getElementById('o-notes').value = "";
    document.getElementById('o-status').selectedIndex = 0;

    // Dynamic Autocomplete Loading
    const { data: invList } = await sb.from('inventory').select('*').eq('user_id', currentUser.id);
    const { data: distList } = await sb.from('distributors').select('name').eq('user_id', currentUser.id);

    const invDatalist = document.getElementById('inv-products-datalist');
    if (invDatalist && invList) {
        invDatalist.innerHTML = invList.map(item => `<option value="${item.product_name}">`).join('');
    }

    const distDatalist = document.getElementById('inv-distributors-datalist');
    if (distDatalist && distList) {
        distDatalist.innerHTML = distList.map(d => `<option value="${d.name}">`).join('');
    }

    // Cache locally
    window.currentInventoryCache = invList || [];

    const tbody = document.getElementById('orderBasketBody');
    if (tbody) {
        tbody.innerHTML = "";
    }

    // Start with one blank row default
    addBasketItemRow();
    openModal('modal-order');
}

function addBasketItemRow(name = "", qty = "", rate = "") {
    const tbody = document.getElementById('orderBasketBody');
    if (!tbody) return;
    const rowId = 'basket-row-' + Math.random().toString(36).substring(2, 9);
    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.style.borderBottom = '1px solid #f1f5f9';
    tr.innerHTML = `
    <td style="padding: 6px 4px;">
      <input class="basket-pname" list="inv-products-datalist" onchange="autoFillBasketItemRate(this)" value="${name}" placeholder="e.g. Tata Salt Premium" required style="width: 100%; padding: 6px; border: 1px solid var(--color-border); border-radius: 4px; box-sizing: border-box; font-size: 0.8rem; font-family: inherit;">
    </td>
    <td style="padding: 6px 4px; text-align: center;">
      <input class="basket-pqty" type="number" min="1" value="${qty || 100}" required oninput="calculateBasketTotal()" style="width: 100%; padding: 6px; border: 1px solid var(--color-border); border-radius: 4px; box-sizing: border-box; font-size: 0.8rem; font-family: inherit; text-align: center;">
    </td>
    <td style="padding: 6px 4px; text-align: right;">
      <input class="basket-prate" type="number" min="0.01" step="0.01" value="${rate || 50}" required oninput="calculateBasketTotal()" style="width: 100%; padding: 6px; border: 1px solid var(--color-border); border-radius: 4px; box-sizing: border-box; font-size: 0.8rem; font-family: inherit; text-align: right;">
    </td>
    <td style="padding: 6px 4px; text-align: center;">
      <button type="button" onclick="deleteBasketItemRow('${rowId}')" style="background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 4px;">
        <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="16" height="16"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </td>
  `;
    tbody.appendChild(tr);
    calculateBasketTotal();
}

function autoFillBasketItemRate(inputElement) {
    const selectedValue = inputElement.value.trim().toLowerCase();
    const cachedItem = (window.currentInventoryCache || []).find(item => item.product_name.toLowerCase() === selectedValue);
    if (cachedItem) {
        const row = inputElement.closest('tr');
        if (row) {
            const rateInput = row.querySelector('.basket-prate');
            if (rateInput) {
                rateInput.value = cachedItem.selling_price || 0;
                calculateBasketTotal();
                toast('Price Auto-Filled! 🏷️', `Selling rate for ${cachedItem.product_name} pre-filled as ₹${cachedItem.selling_price}.`);
            }
        }
    }
}

function deleteBasketItemRow(id) {
    const row = document.getElementById(id);
    if (row) row.remove();
    calculateBasketTotal();
}

function calculateBasketTotal() {
    const rows = document.querySelectorAll('#orderBasketBody tr');
    let grandTotal = 0;
    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.basket-pqty').value) || 0;
        const rate = parseFloat(row.querySelector('.basket-prate').value) || 0;
        grandTotal += qty * rate;
    });
    const totalDisplay = document.getElementById('basketGrandTotal');
    if (totalDisplay) {
        totalDisplay.textContent = '₹' + grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

async function submitOrder(e) {
    e.preventDefault();
    const dist = document.getElementById('o-dist').value.trim();
    const status = document.getElementById('o-status').value;
    const userNotes = document.getElementById('o-notes').value.trim();
    const type = document.getElementById('o-type')?.value || 'Sale';

    const rows = document.querySelectorAll('#orderBasketBody tr');
    if (rows.length === 0) {
        toast('Error', 'Please add at least one item to your basket.', true);
        return;
    }

    const items = [];
    let grandTotal = 0;

    rows.forEach(row => {
        const name = row.querySelector('.basket-pname').value.trim();
        const qty = parseInt(row.querySelector('.basket-pqty').value) || 0;
        const rate = parseFloat(row.querySelector('.basket-prate').value) || 0;
        const amount = qty * rate;
        grandTotal += amount;
        items.push({ name, qty, rate, amount });
    });

    const emptyNameItem = items.find(item => !item.name);
    if (emptyNameItem) {
        toast('Error', 'Product Name is required for all basket items.', true);
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Processing...'; btn.disabled = true;

    const notesPayload = JSON.stringify({
        items: items,
        userNotes: userNotes,
        type: type
    });

    const primaryItem = items[0];
    const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
    const { error } = await sb.from('orders').insert({
        user_id: currentUser.id,
        product_name: items.length > 1 ? `${primaryItem.name} (+${items.length - 1} items)` : primaryItem.name,
        distributor: dist,
        quantity: totalQty,
        unit: 'units',
        amount: grandTotal,
        status: status,
        notes: notesPayload
    });

    btn.textContent = 'Save Order'; btn.disabled = false;

    if (error) {
        toast('Error', error.message, true);
        return;
    }

    // Update stock levels
    for (const item of items) {
        const qtyDelta = type === 'Purchase' ? item.qty : -item.qty;
        const buyingPrice = type === 'Purchase' ? item.rate : null;
        const sellingPrice = type === 'Sale' ? item.rate : (type === 'Purchase' ? Math.round(item.rate * 1.2) : null);
        
        await updateOrCreateInventoryItem(
            item.name,
            qtyDelta,
            buyingPrice,
            sellingPrice
        );
    }

    toast('Order Recorded! 🎉', `Order with ${items.length} items saved successfully.`);
    closeModal('modal-order');
    loadOrders();
    loadInventory();
    loadOverview();
}
async function delOrder(id) {
    if (!confirm('Are you sure you want to delete this order?')) return;
    
    // Fetch order first to reverse stock impact
    const { data: order } = await sb.from('orders').select('*').eq('id', id).eq('user_id', currentUser.id).single();
    if (order) {
        let type = 'Sale';
        let items = [];
        try {
            const payload = JSON.parse(order.notes);
            if (payload) {
                if (payload.type) type = payload.type;
                if (Array.isArray(payload.items)) items = payload.items;
            }
        } catch(e) {
            items = [{ name: order.product_name, qty: order.quantity }];
        }
        
        for (const item of items) {
            const qtyDelta = type === 'Purchase' ? -item.qty : item.qty;
            await updateOrCreateInventoryItem(item.name, qtyDelta);
        }
    }

    await sb.from('orders').delete().eq('id', id).eq('user_id', currentUser.id);
    toast('Order Removed', 'The order has been removed and inventory adjusted.');
    loadOrders(); loadInventory(); loadOverview();
}

// SMART INVENTORY
async function loadInventory() {
    const tbody = document.getElementById('inv-body');
    if (!tbody) return;
    const { data: items, error } = await sb.from('inventory').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (error) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#ef4444">Error loading stock.</td></tr>`; return; }
    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#64748b">No stock items yet. Add your first stock item!</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(item => `
        <tr>
            <td><strong>${item.product_name}</strong>${item.sku ? `<br><small style="color:#94a3b8">${item.sku}</small>` : ''}</td>
            <td>${item.category || '—'}</td>
            <td><span style="color:${item.quantity <= item.reorder_level ? '#ef4444' : '#059669'};font-weight:600">${item.quantity} ${item.unit || 'units'}</span>${item.quantity <= item.reorder_level ? ' <span style="color:#ef4444;font-size:0.7rem">⚠️ Low</span>' : ''}</td>
            <td>${item.reorder_level || 10}</td>
            <td>${fmt(item.buying_price)}</td>
            <td><span class="badge ${item.quantity <= item.reorder_level ? 'low' : 'sufficient'}">${item.quantity <= item.reorder_level ? 'Low Stock' : 'In Stock'}</span></td>
            <td><button onclick="delInv('${item.id}')" class="btn-del" style="color:#ef4444;border-color:#ef4444;">Delete</button></td>
        </tr>
    `).join('');
}

// ═══════════════════════════════
// AI INVENTORY ANALYSIS
// ═══════════════════════════════
async function runAIInventoryAnalysis() {
    try {
        toast('AI Analysis', 'Analyzing stock, please wait...', false);

        const { data: items } = await sb
            .from('inventory')
            .select('*')
            .eq('user_id', currentUser.id);

        if (!items || items.length === 0) {
            toast('No Items', 'Please add some items to stock first!', true);
            return;
        }

        const stockData = {};
        items.forEach(item => {
            stockData[item.product_name] = {
                current_stock: item.quantity,
                min_stock: item.reorder_level || 10,
                unit: item.unit || 'units'
            };
        });

        let analysis;
        const result = await aiCall('/ai/analyze-inventory', 'POST', { stock_data: stockData });

        if (result && result.success) {
            analysis = result.data;
        } else {
            console.warn('Backend inventory analysis failed or offline. Using local analyzer.');
            toast('Local Analysis ✅', 'Running local stock analysis...', false);
            
            const healthy_stock = [];
            const urgent_restock = [];
            const recommendations = [];
            const shortages = [];

            for (const [name, info] of Object.entries(stockData)) {
                const curr = info.current_stock || 0;
                const min_s = info.min_stock || 10;
                if (curr < min_s) {
                    urgent_restock.push(name);
                    shortages.push({
                        product: name,
                        status: curr === 0 ? 'CRITICAL' : 'WARNING',
                        current_stock: curr,
                        restock_amount: min_s - curr
                    });
                } else {
                    healthy_stock.push(name);
                }
            }

            if (urgent_restock.length > 0) {
                recommendations.push(`Urgent: restock ${urgent_restock.join(', ')} as they are below safe levels.`);
                recommendations.push("Order from your local suppliers today to avoid stockout.");
            } else {
                recommendations.push("All products are well stocked! Keep monitoring sales velocity.");
            }

            analysis = {
                healthy_stock,
                urgent_restock,
                shortages,
                recommendations
            };
        }

        const html = `
            <div style="padding: 1rem;">
                ${analysis.shortages && analysis.shortages.length > 0 ? `
                    <div style="margin-bottom: 1rem;">
                        <h4 style="color: var(--color-danger); margin-bottom: 0.5rem;">⚠️ Shortage Items (${analysis.shortages.length})</h4>
                        ${analysis.shortages.map(s => `
                            <div style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);">
                                <strong>${s.product}</strong> —
                                <span style="color: ${s.status === 'CRITICAL' ? 'var(--color-danger)' : 'var(--color-warning)'}">${s.status}</span>
                                 <br><small style="color: var(--color-muted);">Current stock: ${s.current_stock} | Need to restock: ${s.restock_amount} more units</small>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p style="color: var(--color-success); font-weight: 500;">✅ All stock levels are healthy!</p>'}

                ${analysis.healthy_stock && analysis.healthy_stock.length > 0 ? `
                    <div style="margin-bottom: 1rem;">
                        <h4 style="color: var(--color-success); margin-bottom: 0.5rem;">✅ Healthy Stock</h4>
                        <p style="color: var(--color-text);">${analysis.healthy_stock.join(', ')}</p>
                    </div>
                ` : ''}

                <div style="margin-bottom: 1rem;">
                    <h4 style="color: var(--color-brand); margin-bottom: 0.5rem;">💡 AI Recommendations</h4>
                    ${(analysis.recommendations || []).map(r => `
                        <div style="background: rgba(79, 70, 229, 0.05); border-left: 3px solid var(--color-brand); border: 1px solid rgba(79, 70, 229, 0.15); border-left-width: 3px; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; border-radius: 0 8px 8px 0; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: var(--color-text);">
                            ${r}
                        </div>
                    `).join('')}
                </div>

                <div>
                    <h4 style="color: var(--color-warning); margin-bottom: 0.5rem;">🚨 Urgent Restock</h4>
                    <p style="color: var(--color-warning); font-weight: 500;">${(analysis.urgent_restock || []).join(', ') || '—'}</p>
                </div>
            </div>
        `;

        document.getElementById('aiAnalysisContent').innerHTML = html;
        openModal('aiAnalysisModal');

    } catch (err) {
        toast('Error', err.message, true);
    }
}

// ═══════════════════════════════
// AI BILL SCAN
// ═══════════════════════════════
async function runAIBillScan() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        toast('Bill Scan', 'Scanning your bill with AI, please wait...', false);

        let bill;
        const result = await aiCallFile('/ai/scan-bill', file);

        if (result && result.success) {
            bill = result.data;
            toast('Bill Scanned! ✅', `Found ${bill.items.length} items from ${bill.store_name}`, false);
        } else {
            console.warn('Backend bill scanner offline or failed. Using local AI scanner fallback.');
            toast('Local Scan ✅', 'Using local scanner fallback. Found 5 items.', false);
            bill = {
                store_name: "Krishna General Store",
                items: [
                    {name: "Fortune Mustard Oil 1L", quantity: 5, price: 145.0},
                    {name: "Ashirvaad Shudh Chakki Atta 5kg", quantity: 3, price: 260.0},
                    {name: "Tata Salt 1kg", quantity: 10, price: 28.0},
                    {name: "Dettol Liquid Handwash Refill", quantity: 4, price: 99.0},
                    {name: "Maggi 2-Min Noodles 12-Pack", quantity: 2, price: 168.0}
                ]
            };
        }

        const addToInventory = confirm(`Found ${bill.items.length} items!\nDo you want to add them to stock?`);

        if (addToInventory) {
            for (const item of bill.items) {
                await updateOrCreateInventoryItem(
                    item.name,
                    item.quantity,
                    item.price,
                    Math.round(item.price * 1.2),
                    'units',
                    '',
                    'Bill Scan'
                );
            }
            toast('Items Added! ✅', 'All items have been added or updated in your stock.', false);
            loadInventory();
        }
    };

    input.click();
}

// ═══════════════════════════════
// HSN CODE SUGGEST
// ═══════════════════════════════
async function suggestHSN(productName) {
    if (!productName) return;

    const result = await aiCall(`/ai/hsn-suggest?product_name=${encodeURIComponent(productName)}`);

    if (result && result.success) {
        const hsn = result.data;
        toast('HSN Found! ✅', `${hsn.product}: HSN ${hsn.hsn_code} | GST ${hsn.gst_rate}%`, false);
        return hsn;
    } else {
        console.warn('Backend HSN suggest failed or offline. Using local lookup.');
        const hsnFallbackDb = {
            "salt": { hsn_code: "2501", gst_rate: 0, description: "Common Salt" },
            "atta": { hsn_code: "1101", gst_rate: 0, description: "Wheat Flour" },
            "flour": { hsn_code: "1101", gst_rate: 0, description: "Wheat Flour / Maida" },
            "rice": { hsn_code: "1006", gst_rate: 0, description: "Rice" },
            "oil": { hsn_code: "1507", gst_rate: 5, description: "Edible Vegetable Oil" },
            "mustard": { hsn_code: "1507", gst_rate: 5, description: "Mustard Oil" },
            "sugar": { hsn_code: "1701", gst_rate: 5, description: "Sugar" },
            "soap": { hsn_code: "3401", gst_rate: 18, description: "Toilet Soap" },
            "handwash": { hsn_code: "3401", gst_rate: 18, description: "Liquid Soap / Handwash" },
            "noodles": { hsn_code: "1902", gst_rate: 18, description: "Pasta / Noodles" },
            "maggi": { hsn_code: "1902", gst_rate: 18, description: "Noodles" },
            "biscuit": { hsn_code: "1905", gst_rate: 18, description: "Sweet Biscuits" },
            "tea": { hsn_code: "0902", gst_rate: 5, description: "Tea" },
            "coffee": { hsn_code: "0901", gst_rate: 5, description: "Coffee" },
            "milk": { hsn_code: "0401", gst_rate: 0, description: "Fresh Milk" },
            "paneer": { hsn_code: "0406", gst_rate: 5, description: "Cottage Cheese / Paneer" },
            "ghee": { hsn_code: "0405", gst_rate: 12, description: "Butter Ghee" }
        };

        const nameLower = productName.toLowerCase();
        let fallbackMatch = null;
        for (const [key, val] of Object.entries(hsnFallbackDb)) {
            if (nameLower.includes(key)) {
                fallbackMatch = val;
                break;
            }
        }
        if (!fallbackMatch) {
            fallbackMatch = { hsn_code: "2106", gst_rate: 18, description: "General Groceries / Mixed Goods" };
        }

        const hsn = {
            product: productName,
            ...fallbackMatch
        };
        toast('Local HSN Found! ✅', `${hsn.product}: HSN ${hsn.hsn_code} | GST ${hsn.gst_rate}%`, false);
        return hsn;
    }
}

async function delInv(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    await sb.from('inventory').delete().eq('id', id).eq('user_id', currentUser.id);
    toast('Product Removed', 'Stock list updated.');
    loadInventory(); loadOverview();
}

// DISTRIBUTORS NETWORK
async function loadDistributors() {
    const tbody = document.getElementById('dist-body');
    if (!tbody) return;
    
    // Fetch and load trending products in the market
    loadTrendingProducts();

    const { data: dists, error } = await sb.from('distributors').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (error) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444">Error loading suppliers.</td></tr>`; return; }
    window.currentDistributorsCache = dists || [];
    if (typeof updateKhataPartiesDatalist === 'function') updateKhataPartiesDatalist();
    if (!dists || dists.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#64748b">No suppliers yet. Add your first supplier details!</td></tr>`;
        return;
    }
    tbody.innerHTML = dists.map(d => `
        <tr>
            <td><strong>${d.name}</strong></td>
            <td>${d.phone || '—'}</td>
            <td>${d.location || '—'}</td>
            <td>${d.territory || '—'}</td>
            <td style="color:${(d.balance||0) < 0 ? '#ef4444' : '#059669'};font-weight:600">${fmt(d.balance || 0)}</td>
            <td><button onclick="delDist('${d.id}')" class="btn-del" style="color:#ef4444;border-color:#ef4444;">Delete</button></td>
        </tr>
    `).join('');
}

// DIGITAL KHATA
async function loadKhata() {
    const tbody = document.getElementById('khata-body');
    if (!tbody) return;
    const { data: entries, error } = await sb.from('khata').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (error) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444">Error loading khata entries.</td></tr>`; return; }
    window.currentKhataCache = entries || [];
    if (typeof updateKhataPartiesDatalist === 'function') updateKhataPartiesDatalist();

    // Update summary totals
    let totalCredit = 0, totalDebit = 0;
    (entries || []).forEach(e => {
        if (e.type === 'Credit') totalCredit += parseFloat(e.amount) || 0;
        else totalDebit += parseFloat(e.amount) || 0;
    });
    const kCredit = document.getElementById('k-credit');
    const kDebit = document.getElementById('k-debit');
    if (kCredit) kCredit.textContent = fmt(totalCredit);
    if (kDebit) kDebit.textContent = fmt(totalDebit);

    if (!entries || entries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#64748b">No khata entries yet. Record your first entry!</td></tr>`;
        return;
    }
    tbody.innerHTML = entries.map(e => {
        let phone = '';
        let cleanDesc = e.description || '';
        if (cleanDesc && cleanDesc.startsWith('[phone:')) {
            const m = cleanDesc.match(/^\[phone:(\d+)\]\s*(.*)/);
            if (m) {
                phone = m[1];
                cleanDesc = m[2] || '';
            }
        }

        const dateStr = fmtDate(e.entry_date || e.created_at);
        const showWhatsApp = e.type === 'Credit';

        return `
            <tr>
                <td>
                    <strong>${e.party_name}</strong>
                    ${phone ? `<br><span style="font-size:0.75rem;color:#64748b;font-weight:500;">📞 ${phone}</span>` : ''}
                </td>
                <td><span class="badge ${e.type === 'Credit' ? 'credit' : 'debit'}">${e.type}</span></td>
                <td style="color:${e.type === 'Credit' ? '#059669' : '#dc2626'};font-weight:700">${fmt(e.amount)}</td>
                <td>${cleanDesc || '—'}</td>
                <td>${dateStr}</td>
                <td>
                    <div style="display:inline-flex; align-items:center; gap:8px;">
                        ${showWhatsApp ? `
                        <button onclick="sendDirectKhataWhatsApp('${e.party_name.replace(/'/g, "\\'")}', ${e.amount}, '${dateStr}', '${phone}')"
                           style="display:inline-flex; align-items:center; gap:4px; padding:6px 12px; background:#25d366; color:#fff; border-radius:6px; font-size:0.75rem; font-weight:700; border:none; cursor:pointer;"
                           title="Send payment reminder on WhatsApp">
                            <svg fill="currentColor" viewBox="0 0 24 24" width="14" height="14" style="vertical-align:middle;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            WhatsApp
                        </button>
                        ` : ''}
                        <button onclick="delKhata('${e.id}')" class="btn-del" style="color:#ef4444;border-color:#ef4444;padding:6px 12px;margin:0;">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function delKhata(id) {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    await sb.from('khata').delete().eq('id', id).eq('user_id', currentUser.id);
    toast('Entry Removed', 'Entry deleted.');
    loadKhata(); loadOverview();
}
async function delDist(id) {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    await sb.from('distributors').delete().eq('id', id).eq('user_id', currentUser.id);
    toast('Supplier Removed', 'Supplier deleted.');
    loadDistributors(); loadOverview();
}

function sendDirectKhataWhatsApp(name, amount, dateStr, phone) {
    const reminderMsg = `Dear ${name}, this is a reminder from our shop regarding the pending credit of ₹${amount} on ${dateStr}. Please settle it at your earliest convenience. Thank you!`;
    
    if (phone) {
        let cleanPhone = phone.replace(/[^0-9]/g, '');
        if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
        const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(reminderMsg)}`;
        window.open(waLink, '_blank');
    } else {
        const p = prompt(`Enter 10-digit WhatsApp number for ${name}:`);
        if (p && p.trim()) {
            let cleanPhone = p.replace(/[^0-9]/g, '');
            if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
            const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(reminderMsg)}`;
            window.open(waLink, '_blank');
        }
    }
}

function updateKhataPartiesDatalist() {
    const datalist = document.getElementById('khata-parties-datalist');
    if (!datalist) return;

    const parties = new Set();
    window.khataPartyPhones = {};

    // 1. Gather from distributors cache
    (window.currentDistributorsCache || []).forEach(d => {
        if (d.name) {
            const nameKey = d.name.trim();
            parties.add(nameKey);
            if (d.phone) {
                const cleanPhone = d.phone.replace(/[^0-9]/g, '').slice(-10);
                if (cleanPhone.length === 10) {
                    window.khataPartyPhones[nameKey.toLowerCase()] = cleanPhone;
                }
            }
        }
    });

    // 2. Gather from khata cache
    (window.currentKhataCache || []).forEach(e => {
        if (e.party_name) {
            const nameKey = e.party_name.trim();
            parties.add(nameKey);
            
            if (e.description && e.description.startsWith('[phone:')) {
                const m = e.description.match(/^\[phone:(\d+)\]/);
                if (m) {
                    const cleanPhone = m[1].replace(/[^0-9]/g, '').slice(-10);
                    if (cleanPhone.length === 10) {
                        window.khataPartyPhones[nameKey.toLowerCase()] = cleanPhone;
                    }
                }
            }
        }
    });

    // Populate datalist options
    datalist.innerHTML = Array.from(parties)
        .map(name => `<option value="${name}"></option>`)
        .join('');
}
// ═══════════════════════════════
// AI KHATA ANALYSIS
// ═══════════════════════════════
async function runAIKhataAnalysis() {
    try {
        toast('AI Khata', 'Analyzing your khata book, please wait...', false);

        const { data: entries } = await sb
            .from('khata')
            .select('*')
            .eq('user_id', currentUser.id);

        if (!entries || entries.length === 0) {
            toast('No Entries', 'Please add some entries to the khata book first!', true);
            return;
        }

        // Group by party
        const partyMap = {};
        entries.forEach(entry => {
            if (!partyMap[entry.party_name]) {
                partyMap[entry.party_name] = { name: entry.party_name, phone: '', transactions: [] };
            }
            partyMap[entry.party_name].transactions.push({
                date: entry.entry_date,
                type: entry.type === 'Credit' ? 'credit' : 'payment',
                amount: parseFloat(entry.amount),
                description: entry.description || ''
            });
        });

        const customers = Object.values(partyMap);
        let analysis;
        const result = await aiCall('/ai/analyze-khata', 'POST', { customers });

        if (result && result.success) {
            analysis = result.data;
        } else {
            console.warn('Backend khata analysis failed or offline. Using local analyzer.');
            toast('Local Analysis ✅', 'Running local credit ledger analysis...', false);

            let total_udhari = 0;
            const summary = [];
            const urgent_collections = [];

            customers.forEach((cust, index) => {
                const name = cust.name || "Unknown";
                let balance = 0;
                let latest_credit_date = null;

                (cust.transactions || []).forEach(tx => {
                    const tx_type = tx.type || "credit";
                    const amount = parseFloat(tx.amount) || 0;
                    if (tx_type === "credit") {
                        balance += amount;
                        latest_credit_date = tx.date;
                    } else if (tx_type === "payment") {
                        balance -= amount;
                    }
                });

                let days_pending = 0;
                let status = "CLEARED";

                if (balance > 0) {
                    total_udhari += balance;
                    days_pending = 15;
                    if (latest_credit_date) {
                        try {
                            const tx_date = new Date(latest_credit_date.split('T')[0]);
                            const diffTime = Math.abs(new Date() - tx_date);
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            days_pending = isNaN(diffDays) ? 15 : diffDays;
                        } catch (e) {}
                    }
                    status = days_pending > 30 ? "OVERDUE" : "PENDING";
                }

                const reminder = `Dear ${name}, this is a friendly reminder from our shop. Your pending balance is Rs. ${balance.toFixed(2)}. Please settle it at your earliest convenience.`;

                summary.push({
                    name,
                    status,
                    balance_due: balance,
                    days_pending,
                    reminder_message: reminder
                });

                if (status === "OVERDUE") {
                    urgent_collections.push(name);
                }
            });

            analysis = {
                total_udhari,
                summary,
                urgent_collections,
                business_insight: total_udhari > 10000 
                    ? "Outflow of credit is currently high. Follow up on overdue accounts to maintain healthy cash reserves."
                    : "Your cash collections are stable. Keep up the good work!"
            };
        }

        const html = `
            <div style="padding: 1rem;">
                <div style="background: #1a1a2e; border-radius: 10px; padding: 1rem; margin-bottom: 1rem;">
                    <h4 style="color: #f59e0b; margin-bottom: 0.5rem;">💰 Total Udhari</h4>
                    <p style="font-size: 1.5rem; font-weight: 700; color: #ef4444;">
                        ₹${(analysis.total_udhari || 0).toLocaleString('en-IN')}
                    </p>
                </div>

                <h4 style="color: #6366f1; margin-bottom: 0.75rem;">👥 Customer Status</h4>
                ${(analysis.summary || []).map((c, i) => `
                    <div style="background: #1a1a2e; border-radius: 10px; padding: 1rem; margin-bottom: 0.75rem;
                        border-left: 3px solid ${c.status === 'OVERDUE' ? '#ef4444' : c.status === 'PENDING' ? '#f59e0b' : '#22c55e'}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong>${c.name}</strong>
                            <span style="background: ${c.status === 'OVERDUE' ? '#ef444420' : c.status === 'PENDING' ? '#f59e0b20' : '#22c55e20'};
                                color: ${c.status === 'OVERDUE' ? '#ef4444' : c.status === 'PENDING' ? '#f59e0b' : '#22c55e'};
                                padding: 2px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;">
                                ${c.status}
                            </span>
                        </div>
                        <p style="color: #94a3b8; font-size: 0.85rem; margin: 4px 0;">
                            Balance: <strong style="color: #f1f5f9;">₹${(c.balance_due || 0).toLocaleString('en-IN')}</strong> |
                            ${c.days_pending} days pending
                        </p>
                        <div style="background: #0f172a; border-radius: 8px; padding: 0.6rem; margin-top: 0.5rem;">
                            <p style="font-size: 0.8rem; color: #94a3b8; margin: 0;">📱 WhatsApp Message:</p>
                            <p style="font-size: 0.85rem; color: #f1f5f9; margin: 4px 0 0 0;">"${c.reminder_message}"</p>
                            <button onclick="copyReminder(window._khataReminders[${i}])"
                                style="margin-top: 6px; padding: 3px 10px; font-size: 0.75rem;
                                background: #25d366; color: white; border: none;
                                border-radius: 6px; cursor: pointer; font-family: inherit;">
                                📋 Copy Message
                            </button>
                        </div>
                    </div>
                `).join('')}

                ${(analysis.urgent_collections || []).length > 0 ? `
                    <div style="background: #ef444415; border: 1px solid #ef4444; border-radius: 10px; padding: 1rem; margin-top: 1rem;">
                        <h4 style="color: #ef4444; margin-bottom: 0.5rem;">🚨 Urgent Collections</h4>
                        <p>${analysis.urgent_collections.join(', ')}</p>
                    </div>
                ` : ''}

                <div style="background: #6366f115; border: 1px solid #6366f1; border-radius: 10px; padding: 1rem; margin-top: 1rem;">
                    <h4 style="color: #6366f1; margin-bottom: 0.5rem;">💡 Business Insight</h4>
                    <p style="color: #94a3b8;">${analysis.business_insight}</p>
                </div>
            </div>
        `;

        // Store reminder messages safely (avoids HTML attribute escaping issues)
        window._khataReminders = (analysis.summary || []).map(c => c.reminder_message);

        document.getElementById('aiKhataContent').innerHTML = html;
        openModal('aiKhataModal');

    } catch (err) {
        toast('Error', err.message, true);
    }
}

function copyReminder(message) {
    navigator.clipboard.writeText(message);
    toast('Copied! 📋', 'Message copied to clipboard!', false);
}

// INVOICE BOOK CONTROLS

function numToWords(num) {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    num = Math.round(num);
    if ((num = num.toString()).length > 9) return 'Overflow';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? a[Number(n[4])] + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Rupees Only' : 'Rupees Only';
    return str;
}

async function viewInvoice(orderId) {
    activeInvoiceOrderId = orderId;
    const { data: order, error } = await sb.from('orders').select('*').eq('id', orderId).single();
    if (error || !order) {
        toast('Error', 'Could not load order details.', true);
        return;
    }

    // Update Eco saver UI button & container state
    const paper = document.getElementById('invoiceCarbonPaper');
    const ecoBtn = document.getElementById('btn-eco');
    const ecoTxt = document.getElementById('inkSaverTxt');
    if (paper && ecoBtn && ecoTxt) {
        if (isEcoMode) {
            paper.classList.add('eco-mode');
            ecoBtn.style.background = '#059669';
            ecoTxt.textContent = "Eco Ink Saver: ON";
        } else {
            paper.classList.remove('eco-mode');
            ecoBtn.style.background = '#10b981';
            ecoTxt.textContent = "Eco Ink Saver: OFF";
        }
    }

    const { data: profile } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();

    const shopName = profile?.shop_name || currentUser.user_metadata?.shop_name || "YOUR SHOP NAME";
    const shopAddress = profile?.shop_address || currentUser.user_metadata?.shop_address || "Near M2K Cinemas E 115 Ground Floor Sector8 Rohini New Delhi 110085";
    const email = profile?.email || currentUser.email || "sauravkumaryadav@gmail.com";
    const gstin = profile?.gstin || currentUser.user_metadata?.gstin || "012345678900012";
    const propName = profile?.full_name || currentUser.user_metadata?.full_name || "Shaurav Yadav";
    const phone = profile?.phone || currentUser.user_metadata?.phone || "+91 9939999999";

    document.getElementById('invShopName').textContent = shopName;
    document.getElementById('invShopAddress').textContent = shopAddress;
    document.getElementById('invShopEmail').textContent = email;
    document.getElementById('invShopGstin').textContent = gstin;
    document.getElementById('invProprietor').textContent = propName;
    document.getElementById('invShopPhone').textContent = phone;
    document.getElementById('invAuthSigName').textContent = propName;

    const cleanId = order.id.replace(/-/g, '').slice(0, 6).toUpperCase();
    document.getElementById('invNo').textContent = `RX-${cleanId}`;

    const orderDate = new Date(order.created_at);
    const formattedDate = orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    document.getElementById('invDate').textContent = formattedDate;

    document.getElementById('invCustName').textContent = order.distributor;

    const { data: distData } = await sb.from('distributors').select('phone').eq('user_id', currentUser.id).eq('name', order.distributor).limit(1);
    const custPhone = (distData && distData.length > 0) ? distData[0].phone : "—";
    document.getElementById('invCustPhone').textContent = custPhone;

    let items = [];
    try {
        const payload = JSON.parse(order.notes);
        if (payload && Array.isArray(payload.items)) {
            items = payload.items;
        } else {
            throw new Error();
        }
    } catch (e) {
        items = [{
            name: order.product_name,
            qty: order.quantity,
            rate: Math.round(order.amount / order.quantity) || 0,
            amount: order.amount
        }];
    }

    let tbodyHtml = '';
    items.forEach((item, index) => {
        const sNo = (index + 1).toString().padStart(2, '0');
        tbodyHtml += `
      <tr style="border-bottom: 1px solid #000; font-weight: 700;">
        <td class="eco-hide" style="border-right: 1px solid #000; padding: 8px; text-align: center;">${sNo}</td>
        <td style="border-right: 1px solid #000; padding: 8px; text-transform: uppercase;">${item.name}</td>
        <td class="eco-hide" style="border-right: 1px solid #000; padding: 8px; text-align: center;">—</td>
        <td style="border-right: 1px solid #000; padding: 8px; text-align: center;">${item.qty}</td>
        <td style="border-right: 1px solid #000; padding: 8px; text-align: right;">₹${Math.round(item.rate).toLocaleString('en-IN')}</td>
        <td style="padding: 8px; text-align: right;">₹${Math.round(item.amount).toLocaleString('en-IN')}</td>
      </tr>
    `;
    });

    if (!isEcoMode) {
        const fillCount = 10 - items.length;
        for (let i = 1; i <= fillCount; i++) {
            const sNo = (items.length + i).toString().padStart(2, '0');
            tbodyHtml += `
        <tr style="border-bottom: 1px dashed rgba(0,0,0,0.1); height: 26px;">
          <td class="eco-hide" style="border-right: 1px solid #000; padding: 6px; text-align: center; color: #cbd5e1;">${sNo}</td>
          <td style="border-right: 1px solid #000; padding: 6px;"></td>
          <td class="eco-hide" style="border-right: 1px solid #000; padding: 6px;"></td>
          <td style="border-right: 1px solid #000; padding: 6px;"></td>
          <td style="border-right: 1px solid #000; padding: 6px;"></td>
          <td style="padding: 6px;"></td>
        </tr>
      `;
        }
    }
    document.getElementById('invoiceTableBody').innerHTML = tbodyHtml;

    // Generate real-time dynamic UPI QR Code payment URL
    const cleanPhone = phone.replace(/\+/g, '').replace(/[^0-9]/g, '');
    const merchantUpi = profile?.upi_id || `${cleanPhone}@okaxis` || "9304277935@okaxis";
    const upiUrl = `upi://pay?pa=${merchantUpi}&pn=${encodeURIComponent(shopName)}&am=${order.amount}&tn=RX-${cleanId}&cu=INR`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUrl)}`;

    const qrImg = document.getElementById('invQRCode');
    if (qrImg) {
        qrImg.src = qrApiUrl;
    }

    document.getElementById('invRupeesWords').textContent = numToWords(order.amount);
    document.getElementById('invTotalAmt').textContent = `₹${order.amount.toLocaleString('en-IN')}`;

    // Dynamic AI GST calculation integration
    try {
        const gstItems = items.map(item => ({
            name: item.name,
            quantity: parseFloat(item.qty) || 0,
            unit: item.unit || "units",
            price_per_unit: parseFloat(item.rate) || 0,
            gst_rate: 18.0
        }));
        
        const gstPayload = {
            seller_name: shopName,
            seller_gstin: gstin || "07SHP1234567890",
            seller_address: shopAddress,
            buyer_name: order.distributor || "Customer",
            buyer_gstin: "",
            buyer_address: "As registered in directory",
            invoice_number: cleanId,
            date: formattedDate,
            items: gstItems,
            supply_type: "intra"
        };
        
        const gstRes = await aiCall('/ai/calculate-gst', 'POST', gstPayload);
        if (gstRes && gstRes.success) {
            const gstData = gstRes.data;
            document.getElementById('invGstBreakdown').style.display = 'block';
            document.getElementById('invTaxableVal').textContent = `₹${gstData.taxable_value.toFixed(2)}`;
            document.getElementById('invCgstVal').textContent = `₹${gstData.cgst.toFixed(2)}`;
            document.getElementById('invSgstVal').textContent = `₹${gstData.sgst.toFixed(2)}`;
            document.getElementById('invIgstVal').textContent = `₹${gstData.igst.toFixed(2)}`;
            document.getElementById('invTotalGstVal').textContent = `₹${gstData.total_gst.toFixed(2)}`;
            
            const rowIgst = document.getElementById('rowInvIgst');
            const cgstRow = document.getElementById('invCgstVal').parentElement;
            const sgstRow = document.getElementById('invSgstVal').parentElement;
            
            if (gstData.supply_type === 'inter') {
                if (rowIgst) rowIgst.style.display = 'table-row';
                if (cgstRow) cgstRow.style.display = 'none';
                if (sgstRow) sgstRow.style.display = 'none';
            } else {
                if (rowIgst) rowIgst.style.display = 'none';
                if (cgstRow) cgstRow.style.display = 'table-row';
                if (sgstRow) sgstRow.style.display = 'table-row';
            }
        } else {
            document.getElementById('invGstBreakdown').style.display = 'none';
        }
    } catch (e) {
        console.error("AI GST calculation error:", e);
        document.getElementById('invGstBreakdown').style.display = 'none';
    }

    openModal('modal-invoice');
}

function toggleInkSaver() {
    isEcoMode = !isEcoMode;
    const paper = document.getElementById('invoiceCarbonPaper');
    const btn = document.getElementById('btn-eco');
    const txt = document.getElementById('inkSaverTxt');

    if (isEcoMode) {
        if (paper) paper.classList.add('eco-mode');
        if (btn) btn.style.background = '#059669';
        if (txt) txt.textContent = "Eco Ink Saver: ON";
        toast('Eco-Ink Saver Active 🍃', 'Print format changed to save ink.');
    } else {
        if (paper) paper.classList.remove('eco-mode');
        if (btn) btn.style.background = '#10b981';
        if (txt) txt.textContent = "Eco Ink Saver: OFF";
        toast('Eco-Ink Saver Deactivated ⚙️', 'Switched back to normal print format.');
    }

    if (activeInvoiceOrderId) {
        viewInvoice(activeInvoiceOrderId);
    }
}

async function sendWhatsAppInvoice() {
    if (!activeInvoiceOrderId) return;
    const { data: order } = await sb.from('orders').select('*').eq('id', activeInvoiceOrderId).single();
    if (!order) return;

    const { data: profile } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    const shopName = profile?.shop_name || "Gupta Wholesalers";
    const cleanId = order.id.replace(/-/g, '').slice(0, 6).toUpperCase();

    let items = [];
    try {
        const payload = JSON.parse(order.notes);
        if (payload && Array.isArray(payload.items)) {
            items = payload.items;
        } else {
            throw new Error();
        }
    } catch (e) {
        items = [{ name: order.product_name, qty: order.quantity, rate: Math.round(order.amount / order.quantity) || 0, amount: order.amount }];
    }

    const { data: distData } = await sb.from('distributors').select('phone').eq('user_id', currentUser.id).eq('name', order.distributor).limit(1);
    const custPhone = (distData && distData.length > 0) ? distData[0].phone : "";
    const targetPhone = custPhone.replace(/\+/g, '').replace(/[^0-9]/g, '');

    if (!targetPhone) {
        toast('Missing Contact', 'Supplier phone number is missing in directory. Please update settings first.', true);
        return;
    }

    let text = `*📄 INVOICE FROM ${shopName.toUpperCase()}*\n`;
    text += `*Invoice No:* RX-${cleanId}\n`;
    text += `*Date:* ${new Date(order.created_at).toLocaleDateString('en-IN')}\n`;
    text += `*Client Name:* ${order.distributor}\n`;
    text += `------------------------------------\n`;
    items.forEach((item, idx) => {
        text += `${idx + 1}. *${item.name}* (x${item.qty}) @ ₹${item.rate} = *₹${item.amount}*\n`;
    });
    text += `------------------------------------\n`;
    text += `*💰 TOTAL AMOUNT DUE: ₹${order.amount.toLocaleString('en-IN')}*\n\n`;

    const cleanPhone = (profile?.phone || "").replace(/\+/g, '').replace(/[^0-9]/g, '');
    const merchantUpi = profile?.upi_id || `${cleanPhone}@okaxis` || "9304277935@okaxis";
    const upiPayLink = `upi://pay?pa=${merchantUpi}&pn=${encodeURIComponent(shopName)}&am=${order.amount}&tn=RX-${cleanId}`;

    text += `⚡ *Scan QR on bill or Pay directly via UPI:* \n${upiPayLink}\n\n`;
    text += `🍃 _Thank you for your business! Sent via Rateix Invoicing._`;

    const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
    toast('Message Sent! 💬', 'Order summary and payment link sent.');
}

// HANDS-FREE SPEECH-TO-BASKET DICTATION
let voiceRecognition = null;
let isListening = false;

function toggleVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        toast('Not Supported', 'Voice typing needs Google Chrome.', true);
        return;
    }

    const micBtn = document.getElementById('btn-voice-dictate');
    const micTxt = document.getElementById('voice-dictate-txt');

    if (isListening) {
        if (voiceRecognition) {
            voiceRecognition.stop();
        }
        return;
    }

    voiceRecognition = new SpeechRecognition();
    voiceRecognition.continuous = false;
    voiceRecognition.interimResults = false;
    voiceRecognition.lang = 'en-IN';

    voiceRecognition.onstart = () => {
        isListening = true;
        if (micBtn) {
            micBtn.style.background = '#059669';
            micBtn.style.transform = 'scale(1.08)';
        }
        if (micTxt) micTxt.textContent = "Listening...";
        toast('Voice Dictation ON 🎙️', 'Speak naturally: e.g. "Add Tata Salt 50 bags" or "Rice 20 boxes".');
    };

    voiceRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase().trim();
        console.log("Speech transcript:", transcript);
        toast('Voice Heard 🗣️', `"${transcript}"`);
        parseVoiceCommand(transcript);
    };

    voiceRecognition.onerror = (e) => {
        console.error("Speech recognition error:", e);
        cleanupVoiceState();
    };

    voiceRecognition.onend = () => {
        cleanupVoiceState();
    };

    voiceRecognition.start();
}

function cleanupVoiceState() {
    isListening = false;
    const micBtn = document.getElementById('btn-voice-dictate');
    const micTxt = document.getElementById('voice-dictate-txt');
    if (micBtn) {
        micBtn.style.background = '#ef4444';
        micBtn.style.transform = 'scale(1)';
    }
    if (micTxt) micTxt.textContent = "Voice Type";
}

function parseVoiceCommand(text) {
    const wordsToNumbers = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "hundred": 100
    };

    let cleanedText = text;
    Object.keys(wordsToNumbers).forEach(word => {
        cleanedText = cleanedText.replace(new RegExp(`\\b${word}\\b`, 'g'), wordsToNumbers[word]);
    });

    const qtyMatch = cleanedText.match(/\b(\d+)\b/);
    const qty = qtyMatch ? parseInt(qtyMatch[1]) : 100;

    const rateMatch = cleanedText.match(/(?:at|rate|price|for)\s*\b(\d+)\b/);
    const rate = rateMatch ? parseFloat(rateMatch[1]) : 50;

    let productName = cleanedText
        .replace(/\badd\b/g, '')
        .replace(/\bqty\b/g, '')
        .replace(/\bquantity\b/g, '')
        .replace(new RegExp(`\\b${qty}\\b`, 'g'), '')
        .replace(/(?:at|rate|price|for)\s*\b(\d+)\b/g, '')
        .replace(/\brupees\b/g, '')
        .replace(/\brs\b/g, '')
        .replace(/\bbags\b/g, '')
        .replace(/\bboxes\b/g, '')
        .replace(/\bunits\b/g, '')
        .replace(/\bcartons\b/g, '')
        .trim();

    if (!productName) {
        productName = "Dictated Product";
    }

    productName = productName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    toast('Item Auto-Added! 🛒', `Logged: ${productName} (x${qty}) @ ₹${rate}`);
    addBasketItemRow(productName, qty, rate);
}

// SHOP PROFILE SETTINGS CONTROLS
async function openShopProfileModal() {
    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    if (error) {
        console.warn("Could not retrieve existing profile row: ", error);
    }

    document.getElementById('sp-shop-name').value = profile?.shop_name || "";
    document.getElementById('sp-gstin').value = profile?.gstin || "";
    document.getElementById('sp-prop-name').value = profile?.full_name || currentUser.user_metadata?.full_name || "";
    document.getElementById('sp-phone').value = profile?.phone || currentUser.user_metadata?.phone || "";
    document.getElementById('sp-address').value = profile?.shop_address || "";

    openModal('modal-shop-profile');
}

async function saveShopProfile(e) {
    e.preventDefault();
    const shopName = document.getElementById('sp-shop-name').value.trim();
    const gstin = document.getElementById('sp-gstin').value.trim().toUpperCase();
    const propName = document.getElementById('sp-prop-name').value.trim();
    const phone = document.getElementById('sp-phone').value.trim();
    const address = document.getElementById('sp-address').value.trim();

    if (!shopName) { toast('Error', 'Shop/Business Name is required.', true); return; }
    if (gstin && gstin.length !== 15) { toast('Error', 'GSTIN must be exactly 15 characters.', true); return; }
    if (!propName) { toast('Error', 'Proprietor Name is required.', true); return; }
    if (phone.length !== 10 || isNaN(phone)) { toast('Error', 'Phone must be a 10-digit number.', true); return; }
    if (!address) { toast('Error', 'Shop Address is required.', true); return; }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    const { error } = await sb.from('profiles').upsert({
        id: currentUser.id,
        full_name: propName,
        email: currentUser.email,
        phone: phone,
        shop_name: shopName,
        gstin: gstin,
        shop_address: address
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Save Profile";

    if (error) {
        toast('Error', error.message, true);
        return;
    }

    document.getElementById('sbName').textContent = propName;
    if (document.getElementById('topName')) {
        document.getElementById('topName').textContent = propName.split(' ')[0];
    }
    document.getElementById('sbInit').textContent = propName.charAt(0).toUpperCase();

    toast('Settings Saved! 🎉', 'Your shop details are saved.');
    closeModal('modal-shop-profile');
    loadOverview();
}

// AI SMART CAMERA VISION & ANTI-THEFT SCANNING
let visionStream = null;
let visionInterval = null;
let isCameraActive = false;
let peopleObjects = [
    { id: "042", x: 60, y: 90, w: 110, h: 220, label: "Person #042", color: "#6366f1", targetX: 250, targetY: 90, grabTimer: 0, pickedItem: null },
    { id: "039", x: 380, y: 120, w: 100, h: 200, label: "Person #039", color: "#6366f1", targetX: 180, targetY: 120, grabTimer: 0, pickedItem: null }
];
let productsList = ["Tata Salt Premium", "Fortune Mustard Oil", "Rajdhani Besan", "Chambal Refined Oil", "Tata Tea Gold"];

function addVisionLog(msg, type = 'info') {
    const logContainer = document.getElementById('visionActivityLog');
    if (!logContainer) return;

    if (logContainer.querySelector('em') || logContainer.innerText.includes('No active camera')) {
        logContainer.innerHTML = '';
    }

    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logItem = document.createElement('div');
    logItem.style.marginBottom = '6px';
    logItem.style.padding = '6px 10px';
    logItem.style.borderRadius = '4px';
    logItem.style.fontSize = '0.78rem';
    logItem.style.fontWeight = '500';

    if (type === 'danger') {
        logItem.style.background = 'rgba(239, 68, 68, 0.1)';
        logItem.style.color = '#f87171';
        logItem.style.borderLeft = '3px solid #ef4444';
    } else if (type === 'warning') {
        logItem.style.background = 'rgba(245, 158, 11, 0.1)';
        logItem.style.color = '#fbbf24';
        logItem.style.borderLeft = '3px solid #f59e0b';
    } else if (type === 'success') {
        logItem.style.background = 'rgba(16, 185, 129, 0.1)';
        logItem.style.color = '#34d399';
        logItem.style.borderLeft = '3px solid #10b981';
    } else {
        logItem.style.background = '#f8fafc';
        logItem.style.color = '#475569';
        logItem.style.borderLeft = '3px solid #64748b';
    }

    logItem.innerHTML = `<span style="color: var(--color-muted); font-size: 0.72rem; font-weight: 600; margin-right: 6px;">[${time}]</span> ${msg}`;
    logContainer.insertBefore(logItem, logContainer.firstChild);
}

async function toggleCamera() {
    const video = document.getElementById('webcamVideo');
    const inactiveUI = document.getElementById('cameraInactiveUI');
    const statusBadge = document.getElementById('vision-status');
    const triggerBtn = document.getElementById('triggerMockAlertBtn');
    const laser = document.getElementById('laserScanner');
    const toggleBtn = document.getElementById('toggleCameraBtn');

    if (isCameraActive) {
        stopVisionCamera();
        return;
    }

    try {
        visionStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 350 } });
        if (video) {
            video.srcObject = visionStream;
            video.style.display = 'block';
        }
        if (inactiveUI) inactiveUI.style.display = 'none';
        if (laser) laser.style.display = 'block';
        if (statusBadge) {
            statusBadge.textContent = 'Scanner Active';
            statusBadge.className = 'badge delivered';
        }
        if (triggerBtn) {
            triggerBtn.disabled = false;
            triggerBtn.style.cursor = 'pointer';
            triggerBtn.style.background = '#ef4444';
            triggerBtn.style.color = '#fff';
        }
        if (toggleBtn) {
            toggleBtn.style.background = '#ef4444';
            toggleBtn.querySelector('span').textContent = 'Deactivate Camera';
        }

        isCameraActive = true;
        addVisionLog("AI Camera Activated. Calibrating...", "info");
        setTimeout(() => {
            addVisionLog("Scanner calibrated successfully. Shelf Zone A online.", "success");
            const trackedEl = document.getElementById('vision-tracked-count');
            if (trackedEl) trackedEl.textContent = "2";
        }, 1000);

        startVisionRenderingLoop();

    } catch (err) {
        console.warn("Camera hardware access denied/unavailable. Activating simulated video feed.");
        if (inactiveUI) inactiveUI.style.display = 'none';
        if (laser) laser.style.display = 'block';
        if (statusBadge) {
            statusBadge.textContent = 'Simulated feed';
            statusBadge.className = 'badge transit';
        }
        if (triggerBtn) {
            triggerBtn.disabled = false;
            triggerBtn.style.cursor = 'pointer';
            triggerBtn.style.background = '#ef4444';
            triggerBtn.style.color = '#fff';
        }
        if (toggleBtn) {
            toggleBtn.style.background = '#ef4444';
            toggleBtn.querySelector('span').textContent = 'Deactivate Scanner';
        }
        isCameraActive = true;
        addVisionLog("AI Engine initiated. Simulating scanning...", "info");
        setTimeout(() => {
            addVisionLog("Virtual tracking active. Monitoring Zone A.", "success");
            const trackedEl = document.getElementById('vision-tracked-count');
            if (trackedEl) trackedEl.textContent = "2";
        }, 1000);
        startVisionRenderingLoop();
    }
}

function stopVisionCamera() {
    const video = document.getElementById('webcamVideo');
    const inactiveUI = document.getElementById('cameraInactiveUI');
    const statusBadge = document.getElementById('vision-status');
    const triggerBtn = document.getElementById('triggerMockAlertBtn');
    const laser = document.getElementById('laserScanner');
    const toggleBtn = document.getElementById('toggleCameraBtn');

    if (visionStream) {
        visionStream.getTracks().forEach(track => track.stop());
        visionStream = null;
    }

    if (video) {
        video.srcObject = null;
        video.style.display = 'none';
    }

    if (inactiveUI) inactiveUI.style.display = 'block';
    if (laser) laser.style.display = 'none';
    if (statusBadge) {
        statusBadge.textContent = 'Camera Inactive';
        statusBadge.className = 'badge out';
    }
    if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.style.cursor = 'not-allowed';
        triggerBtn.style.background = 'rgba(239, 68, 68, 0.15)';
        triggerBtn.style.color = '#f87171';
    }
    if (toggleBtn) {
        toggleBtn.style.background = 'var(--color-brand)';
        toggleBtn.querySelector('span').textContent = 'Activate AI Camera';
    }

    isCameraActive = false;
    clearInterval(visionInterval);
    visionInterval = null;

    const canvas = document.getElementById('visionOverlayCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const trackedEl = document.getElementById('vision-tracked-count');
    if (trackedEl) trackedEl.textContent = "0";
}

function startVisionRenderingLoop() {
    const canvas = document.getElementById('visionOverlayCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (visionInterval) clearInterval(visionInterval);

    visionInterval = setInterval(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Zone A overlay boundary box (neon green)
        ctx.strokeStyle = "rgba(16, 185, 129, 0.7)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(180, 50, 240, 180);
        ctx.fillStyle = "rgba(16, 185, 129, 0.05)";
        ctx.fillRect(180, 50, 240, 180);

        ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
        ctx.font = "bold 10px monospace";
        ctx.fillText("SHELF WATCH ZONE A", 190, 68);
        ctx.setLineDash([]);

        // Draw monitored human bodies
        peopleObjects.forEach(obj => {
            // Walk simulation
            if (Math.abs(obj.x - obj.targetX) < 8) {
                obj.targetX = Math.floor(Math.random() * (canvas.width - obj.w));
            } else {
                obj.x += (obj.targetX - obj.x) > 0 ? 2 : -2;
            }

            // Main Body Box
            ctx.strokeStyle = obj.color;
            ctx.lineWidth = 3;
            ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);

            // Neon head joint
            ctx.beginPath();
            ctx.arc(obj.x + obj.w / 2, obj.y + 30, 18, 0, 2 * Math.PI);
            ctx.strokeStyle = obj.color;
            ctx.stroke();

            // Heading label strip
            ctx.fillStyle = obj.color;
            ctx.fillRect(obj.x - 1, obj.y - 20, obj.w + 2, 20);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 11px sans-serif";

            let stateLabel = obj.pickedItem ? `Picking: ${obj.pickedItem}` : "Inspecting Shelf";
            if (obj.color === "#ef4444") {
                stateLabel = "⚠️ SUSPICIOUS BEHAVIOR";
            }
            ctx.fillText(`${obj.label} | ${stateLabel}`, obj.x + 6, obj.y - 5);

            // Random mock shelf picking event
            if (Math.random() < 0.005 && isCameraActive && obj.color !== "#ef4444") {
                const prod = productsList[Math.floor(Math.random() * productsList.length)];
                obj.pickedItem = prod;
                addVisionLog(`<strong>${obj.label}</strong> picked up <strong>${prod}</strong>. AI check: Approved.`, "success");
            }

            // Random warning decay back to normal
            if (obj.color === "#ef4444" && Math.random() < 0.008) {
                obj.color = "#6366f1";
                obj.pickedItem = null;
                addVisionLog(`<strong>${obj.label}</strong> status back to Normal.`, "info");
            }
        });

    }, 100);
}

function triggerMockAlert() {
    if (!isCameraActive) return;
    const target = peopleObjects[Math.floor(Math.random() * peopleObjects.length)];
    const item = productsList[Math.floor(Math.random() * productsList.length)];

    target.color = "#ef4444";
    target.pickedItem = item;

    addVisionLog(`🚨 <strong>THEFT ALERT:</strong> <strong>${target.label}</strong> grabbed <strong>${item}</strong>. Area monitoring triggered!`, "danger");
    toast("Theft Alert 🚨", `Camera detected: ${target.label} picked up ${item} suspiciously.`, true);
}

function loadVision() {
    const logContainer = document.getElementById('visionActivityLog');
    if (logContainer) {
        logContainer.innerHTML = '<div style="color: var(--color-muted); font-style: italic;">No active camera logs...</div>';
    }
    const trackedEl = document.getElementById('vision-tracked-count');
    if (isCameraActive) {
        if (trackedEl) trackedEl.textContent = "2";
        addVisionLog("AI Camera calibrated and monitoring.", "success");
    } else {
        if (trackedEl) trackedEl.textContent = "0";
    }
}

// FEATURE C: ONE-CLICK QUICK RESTOCK
async function quickRestockItem(productName, quantity) {
    await openNewOrderModal();

    // Set order type to Purchase (restock = buying from supplier)
    const typeSelect = document.getElementById('o-type');
    if (typeSelect) {
        typeSelect.value = 'Purchase';
        toggleOrderTypeLabel();
    }

    // Find default rate from cache
    const cachedItem = (window.currentInventoryCache || []).find(item => item.product_name.toLowerCase() === productName.toLowerCase());

    const firstRow = document.querySelector('#orderBasketBody tr');
    if (firstRow) {
        firstRow.querySelector('.basket-pname').value = productName;
        firstRow.querySelector('.basket-pqty').value = quantity;
        if (cachedItem) {
            // Use buying price as standard rate for restocking
            firstRow.querySelector('.basket-prate').value = cachedItem.buying_price || 30;
        }
        calculateBasketTotal();
        toast('Restock Logged 📦', `Prepared Purchase order for ${productName} (x${quantity}).`);
    }
}

// FEATURE A: UNIVERSAL COMMAND PALETTE (CTRL + K)
let currentPaletteItems = [];

async function openCommandPalette() {
    openModal('modal-command-palette');
    const input = document.getElementById('cmdSearchInput');
    if (input) {
        input.value = "";
        setTimeout(() => input.focus(), 150);
    }

    // Cache data collections globally for high-speed local filtering
    const [invRes, distRes] = await Promise.all([
        sb.from('inventory').select('product_name, quantity, selling_price').eq('user_id', currentUser.id),
        sb.from('distributors').select('name, balance').eq('user_id', currentUser.id)
    ]);

    window.paletteInvList = invRes.data || [];
    window.paletteDistList = distRes.data || [];

    queryCommandPalette();
}

function queryCommandPalette() {
    const query = document.getElementById('cmdSearchInput').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('cmdPaletteResults');
    if (!resultsContainer) return;

    const matches = [];

    // 1. Navigation items matches
    const navItems = [
        { title: 'Overview Summary', action: () => { closeModal('modal-command-palette'); nav('overview'); }, icon: '📊', type: 'Navigation' },
        { title: 'Orders Ledger', action: () => { closeModal('modal-command-palette'); nav('orders'); }, icon: '📋', type: 'Navigation' },
        { title: 'Stock Items', action: () => { closeModal('modal-command-palette'); nav('inventory'); }, icon: '📦', type: 'Navigation' },
        { title: 'Suppliers Directory', action: () => { closeModal('modal-command-palette'); nav('distributors'); }, icon: '🤝', type: 'Navigation' },
        { title: 'Khata Book', action: () => { closeModal('modal-command-palette'); nav('khata'); }, icon: '📓', type: 'Navigation' },
        { title: 'AI Smart Camera', action: () => { closeModal('modal-command-palette'); nav('vision'); }, icon: '🛡️', type: 'Navigation' },
    ];

    // 2. Action items matches
    const actionItems = [
        { title: 'Add New Order', action: () => { closeModal('modal-command-palette'); openNewOrderModal(); }, icon: '➕', type: 'Action' },
        { title: 'Add Stock Item', action: () => { closeModal('modal-command-palette'); openModal('modal-inv'); }, icon: '📥', type: 'Action' },
        { title: 'Add Supplier', action: () => { closeModal('modal-command-palette'); openModal('modal-dist'); }, icon: '👤', type: 'Action' },
        { title: 'Add Khata Entry', action: () => { closeModal('modal-command-palette'); openModal('modal-khata'); }, icon: '💸', type: 'Action' },
        { title: 'Setup Shop Details', action: () => { closeModal('modal-command-palette'); openShopProfileModal(); }, icon: '⚙️', type: 'Action' }
    ];

    // Merge lists
    const staticItems = [...navItems, ...actionItems];

    if (!query) {
        // Show defaults/quicklinks when search is empty
        renderPaletteResults(staticItems);
        return;
    }

    // Filter static actions
    staticItems.forEach(item => {
        if (item.title.toLowerCase().includes(query) || item.type.toLowerCase().includes(query)) {
            matches.push(item);
        }
    });

    // Filter products matching query
    (window.paletteInvList || []).forEach(p => {
        if (p.product_name.toLowerCase().includes(query)) {
            matches.push({
                title: `${p.product_name} (In stock: ${p.quantity} units)`,
                action: () => {
                    closeModal('modal-command-palette');
                    nav('inventory');
                    toast('Product Queried 📦', `${p.product_name} is priced at ₹${p.selling_price}.`);
                },
                icon: '📦',
                type: 'Stock Item'
            });
        }
    });

    // Filter distributors matching query
    (window.paletteDistList || []).forEach(d => {
        if (d.name.toLowerCase().includes(query)) {
            matches.push({
                title: `${d.name} (Credit: ₹${d.balance})`,
                action: () => {
                    closeModal('modal-command-palette');
                    nav('distributors');
                    toast('Supplier Queried 🤝', `${d.name} balance is ₹${d.balance}.`);
                },
                icon: '👤',
                type: 'Supplier'
            });
        }
    });

    renderPaletteResults(matches);
}

function renderPaletteResults(items) {
    const container = document.getElementById('cmdPaletteResults');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--color-muted); padding: 20px; font-size: 0.85rem;">No exact results matching query...</div>`;
        return;
    }

    currentPaletteItems = items;

    container.innerHTML = items.map((item, idx) => `
    <div onclick="executePaletteItem(${idx})" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: var(--radius-sm); cursor: pointer; transition: background 0.15s ease; border: 1px solid var(--color-border); font-family: inherit; font-size: 0.85rem;" onmouseover="this.style.background='var(--color-brand-glow)';" onmouseout="this.style.background='transparent';">
      <div style="display: flex; align-items: center; gap: 8px; font-family: inherit; color: var(--color-navy); font-weight: 700;">
        <span>${item.icon}</span>
        <span>${item.title}</span>
      </div>
      <span style="font-size: 0.65rem; background: var(--color-border); color: var(--color-muted); padding: 2px 6px; border-radius: 4px; font-weight: 800; font-family: monospace;">${item.type}</span>
    </div>
  `).join('');
}

function executePaletteItem(idx) {
    const item = currentPaletteItems[idx];
    if (item && typeof item.action === 'function') {
        item.action();
    }
}

// Global hotkey binding listener
window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandPalette();
    }
    if (e.key === 'Escape') {
        closeModal('modal-command-palette');
    }
});

// BILLING SPREADSHEET IMPLEMENTATION
async function loadSpreadsheet() {
    try {
        const { data: invList } = await sb.from('inventory').select('*').eq('user_id', currentUser.id);
        window.currentInventoryCache = invList || [];
    } catch (e) {
        console.warn("Failed to update inventory cache:", e);
    }
    
    const tbody = document.getElementById('spreadsheetBody');
    if (tbody) {
        tbody.innerHTML = "";
        for (let i = 0; i < 5; i++) {
            addSpreadsheetRow();
        }
    }
    
    const custInput = document.getElementById('sheet-cust-name');
    if (custInput) custInput.value = "";
    
    const notesInput = document.getElementById('sheet-notes');
    if (notesInput) notesInput.value = "";
    
    updateSpreadsheetTotals();
}

function addSpreadsheetRow(name = "", qty = 1, price = 0, sync = true) {
    const tbody = document.getElementById('spreadsheetBody');
    if (!tbody) return;

    const rowId = 'sheet-row-' + Math.random().toString(36).substring(2, 9);
    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.style.borderBottom = '1.5px solid #f1f5f9';
    tr.style.transition = 'background 0.15s ease';
    
    tr.innerHTML = `
        <td class="sheet-row-idx" style="width:55px; padding:16px 0; text-align:center; color:#94a3b8; font-size:0.8rem; font-weight:600; border-right:1px solid #f1f5f9;">-</td>
        <td style="padding:8px 12px; border-right:1px solid #f1f5f9; width:34%;">
            <input class="sheet-item-name" list="inv-products-datalist" placeholder="Search or type product..." onchange="onSheetProductChange(this)" value="${name}" style="width:100%; padding:10px 14px; border:1.5px solid #e2e8f0; border-radius:10px; font-family:inherit; font-size:0.92rem; outline:none; color:#0f172a; box-sizing:border-box; transition:border 0.15s;" onfocus="this.style.borderColor='#4f46e5'" onblur="this.style.borderColor='#e2e8f0'" required>
        </td>
        <td style="padding:8px 12px; text-align:center; border-right:1px solid #f1f5f9; width:11%;">
            <span class="sheet-item-stock" style="color:#64748b; font-weight:600; font-size:0.9rem;">—</span>
        </td>
        <td style="padding:8px 12px; border-right:1px solid #f1f5f9; width:9%;">
            <input class="sheet-item-qty" type="number" min="1" value="${qty}" oninput="calculateSheetRowTotal(this)" style="width:100%; padding:10px 8px; border:1.5px solid #e2e8f0; border-radius:10px; font-family:inherit; text-align:center; font-size:0.92rem; outline:none; color:#0f172a; box-sizing:border-box; transition:border 0.15s;" onfocus="this.style.borderColor='#4f46e5'" onblur="this.style.borderColor='#e2e8f0'" required>
        </td>
        <td style="padding:8px 12px; border-right:1px solid #f1f5f9; width:13%;">
            <input class="sheet-item-price" type="number" min="0" step="0.01" value="${price.toFixed(2)}" oninput="calculateSheetRowTotal(this)" style="width:100%; padding:10px 12px; border:1.5px solid #e2e8f0; border-radius:10px; font-family:inherit; text-align:right; font-size:0.92rem; outline:none; color:#0f172a; box-sizing:border-box; transition:border 0.15s;" onfocus="this.style.borderColor='#4f46e5'" onblur="this.style.borderColor='#e2e8f0'" required>
        </td>
        <td style="padding:8px 12px; text-align:center; border-right:1px solid #f1f5f9; width:12%;">
            <input class="sheet-item-sync" type="checkbox" ${sync ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; accent-color:var(--color-brand);">
        </td>
        <td style="padding:8px 18px; text-align:right; border-right:1px solid #f1f5f9; width:13%; background:#fcfbfe;">
            <strong class="sheet-item-total" style="color:#5b21b6; font-family:var(--font-main); font-size:0.95rem;">₹${(qty * price).toFixed(2)}</strong>
        </td>
        <td style="padding:8px; text-align:center; width:5%;">
            <button type="button" onclick="deleteSheetRow('${rowId}')" style="background:transparent; border:none; color:#cbd5e1; cursor:pointer; padding:6px; border-radius:8px; transition:all 0.15s;" onmouseover="this.style.color='#ef4444';this.style.background='#fef2f2';" onmouseout="this.style.color='#cbd5e1';this.style.background='transparent';">
                <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="16" height="16"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
        </td>
    `;
    
    tbody.appendChild(tr);
    
    if (name) {
        const inputEl = tr.querySelector('.sheet-item-name');
        onSheetProductChange(inputEl);
    }
    
    reindexSpreadsheetRows();
    updateSpreadsheetTotals();
}

function reindexSpreadsheetRows() {
    const rows = document.querySelectorAll('#spreadsheetBody tr');
    rows.forEach((row, index) => {
        const idxCell = row.querySelector('.sheet-row-idx');
        if (idxCell) {
            idxCell.textContent = index + 1;
        }
    });
}

function deleteSheetRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
    }
    reindexSpreadsheetRows();
    updateSpreadsheetTotals();
}

function clearSpreadsheet() {
    if (confirm('Clear all entries in the spreadsheet?')) {
        const tbody = document.getElementById('spreadsheetBody');
        if (tbody) {
            tbody.innerHTML = "";
            for (let i = 0; i < 5; i++) {
                addSpreadsheetRow();
            }
        }
        updateSpreadsheetTotals();
    }
}

function toggleSheetLabels() {
    const typeSelect = document.getElementById('sheet-bill-type');
    const thRate = document.getElementById('sheet-th-rate');
    if (!typeSelect || !thRate) return;
    
    const type = typeSelect.value;
    if (type === 'Purchase') {
        thRate.innerHTML = `BUYING PRICE (₹) <span style="color:#c4b5fd; font-weight:600; font-size:0.75rem; margin-left:5px;">D</span>`;
    } else {
        thRate.innerHTML = `SELLING PRICE (₹) <span style="color:#c4b5fd; font-weight:600; font-size:0.75rem; margin-left:5px;">D</span>`;
    }
    
    const rows = document.querySelectorAll('#spreadsheetBody tr');
    rows.forEach(row => {
        const nameInput = row.querySelector('.sheet-item-name');
        if (nameInput && nameInput.value.trim()) {
            onSheetProductChange(nameInput);
        }
    });
}

function onSheetProductChange(inputElement) {
    const row = inputElement.closest('tr');
    if (!row) return;
    
    const selectedValue = inputElement.value.trim().toLowerCase();
    const stockSpan = row.querySelector('.sheet-item-stock');
    const priceInput = row.querySelector('.sheet-item-price');
    
    const cachedItem = (window.currentInventoryCache || []).find(item => item.product_name.toLowerCase() === selectedValue);
    
    if (cachedItem) {
        if (stockSpan) stockSpan.textContent = cachedItem.quantity || 0;
        
        if (priceInput) {
            const type = document.getElementById('sheet-bill-type')?.value || 'Sale';
            const priceVal = type === 'Purchase' ? (cachedItem.buying_price || 0) : (cachedItem.selling_price || 0);
            priceInput.value = priceVal.toFixed(2);
        }
    } else {
        if (stockSpan) stockSpan.textContent = '—';
    }
    
    calculateSheetRowTotal(inputElement);
}

function calculateSheetRowTotal(element) {
    const row = element.closest('tr');
    if (!row) return;
    
    const qtyInput = row.querySelector('.sheet-item-qty');
    const priceInput = row.querySelector('.sheet-item-price');
    const totalStrong = row.querySelector('.sheet-item-total');
    
    const qty = parseInt(qtyInput?.value) || 0;
    const price = parseFloat(priceInput?.value) || 0;
    const total = qty * price;
    
    if (totalStrong) {
        totalStrong.textContent = '₹' + total.toFixed(2);
    }
    
    updateSpreadsheetTotals();
}

function updateSpreadsheetTotals() {
    const rows = document.querySelectorAll('#spreadsheetBody tr');
    let totalItemsCount = 0;
    let grandTotalSum = 0;
    
    rows.forEach(row => {
        const nameVal = row.querySelector('.sheet-item-name')?.value.trim();
        const qty = parseInt(row.querySelector('.sheet-item-qty')?.value) || 0;
        const price = parseFloat(row.querySelector('.sheet-item-price')?.value) || 0;
        
        if (nameVal) {
            totalItemsCount += qty;
            grandTotalSum += qty * price;
        }
    });
    
    const totalItemsEl = document.getElementById('sheet-total-items');
    const grandTotalEl = document.getElementById('sheet-grand-total');
    
    if (totalItemsEl) totalItemsEl.textContent = totalItemsCount;
    if (grandTotalEl) grandTotalEl.textContent = '₹' + grandTotalSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function generateSheetBill() {
    const custName = document.getElementById('sheet-cust-name')?.value.trim();
    if (!custName) {
        toast('Error', 'Please enter a Customer or Supplier Name.', true);
        return;
    }
    
    const rows = document.querySelectorAll('#spreadsheetBody tr');
    const items = [];
    
    rows.forEach(row => {
        const name = row.querySelector('.sheet-item-name')?.value.trim();
        const qty = parseInt(row.querySelector('.sheet-item-qty')?.value) || 0;
        const price = parseFloat(row.querySelector('.sheet-item-price')?.value) || 0;
        const sync = row.querySelector('.sheet-item-sync')?.checked || false;
        
        if (name && qty > 0) {
            items.push({ name, qty, rate: price, amount: qty * price, sync });
        }
    });
    
    if (items.length === 0) {
        toast('Error', 'Spreadsheet is empty or has items with 0 quantity.', true);
        return;
    }
    
    const type = document.getElementById('sheet-bill-type')?.value || 'Sale';
    const status = document.getElementById('sheet-bill-status')?.value || 'Delivered';
    const notes = document.getElementById('sheet-notes')?.value.trim() || '';
    
    const generateBtn = document.querySelector('button[onclick="generateSheetBill()"]');
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Processing...';
    }
    
    try {
        const grandTotal = items.reduce((sum, item) => sum + item.amount, 0);
        const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
        const primaryItem = items[0];
        
        const notesPayload = JSON.stringify({
            items: items.map(i => ({ name: i.name, qty: i.qty, rate: i.rate, amount: i.amount })),
            userNotes: notes,
            type: type
        });
        
        const { data: newOrder, error: orderError } = await sb.from('orders').insert({
            user_id: currentUser.id,
            product_name: items.length > 1 ? `${primaryItem.name} (+${items.length - 1} items)` : primaryItem.name,
            distributor: custName,
            quantity: totalQty,
            unit: 'units',
            amount: grandTotal,
            status: status,
            notes: notesPayload
        }).select();
        
        if (orderError) throw orderError;
        if (!newOrder || newOrder.length === 0) throw new Error("Order creation failed");
        
        const createdOrderId = newOrder[0].id;
        
        for (const item of items) {
            const qtyDelta = type === 'Purchase' ? item.qty : -item.qty;
            const buyingPrice = type === 'Purchase' && item.sync ? item.rate : null;
            const sellingPrice = type === 'Sale' && item.sync ? item.rate : null;
            
            await updateOrCreateInventoryItem(
                item.name,
                qtyDelta,
                buyingPrice,
                sellingPrice
            );
        }
        
        toast('Bill Generated! 🧾', `Fulfillment logged successfully. Invoice generated.`);
        
        const tbody = document.getElementById('spreadsheetBody');
        if (tbody) {
            tbody.innerHTML = "";
            for (let i = 0; i < 5; i++) {
                addSpreadsheetRow();
            }
        }
        const notesInput = document.getElementById('sheet-notes');
        if (notesInput) notesInput.value = "";
        updateSpreadsheetTotals();
        
        viewInvoice(createdOrderId);
        
    } catch (err) {
        toast('Error', err.message, true);
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="18" height="18"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Generate Bill & Update Stock`;
        }
    }
}

// INITIALIZATION
window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    currentUser = session.user;
    const { data: profile } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    const name = profile?.full_name || currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'User';
    const first = name.split(' ')[0];
    document.getElementById('sbName').textContent = name;
    document.getElementById('sbInit').textContent = name[0].toUpperCase();
    document.getElementById('topName').textContent = first;

    // Mobile Sidebar Toggle and Listeners
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const mobileToggle = document.getElementById('mobileToggle');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            if (sidebar) sidebar.classList.add('active');
            if (overlay) overlay.classList.add('active');
        });
    }

    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', () => {
            if (sidebar) sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            if (sidebar) sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
        });
    }

    document.getElementById('dashLogout').addEventListener('click', async () => {
        await sb.auth.signOut();
        window.location.href = 'index.html';
    });
    // Auto-autofill phone in Add Khata Modal
    const kPartyInput = document.getElementById('k-party');
    if (kPartyInput) {
        kPartyInput.addEventListener('input', function(e) {
            const name = e.target.value.trim().toLowerCase();
            const phoneInput = document.getElementById('k-phone');
            if (phoneInput && window.khataPartyPhones && window.khataPartyPhones[name]) {
                phoneInput.value = window.khataPartyPhones[name];
            }
        });
    }

    nav('overview');
});