// ─────────────────────────────────────────────
//  Ratix app.js — Dashboard Logic
// ─────────────────────────────────────────────

const SUPABASE_URL  = 'https://ixeausiogmzweppiytfy.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4ZWF1c2lvZ216d2VwcGl5dGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3Mjc4NjYsImV4cCI6MjA5ODMwMzg2Nn0.Z08IWCr10Vjuj9y_OgvsE4yFViv2jNQ1t1nwVMIaOy0';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── State ───────────────────────────────────
let USER = null;
let INVENTORY = [];       // cached product list
let BILL_ROWS = [];       // active billing rows
let ACTIVE_KHATA = null;  // selected khata customer id
let ENTRY_TYPE = 'credit';

// ─── Init ────────────────────────────────────
(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  USER = session.user;

  // Populate sidebar
  const meta = USER.user_metadata || {};
  document.getElementById('sb-shop').textContent  = meta.shop_name  || USER.email;
  document.getElementById('sb-email').textContent = meta.owner_name || USER.email;

  // Set today's date and live clock
  function updateLiveClock() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-IN', { dateStyle: 'long' });
    const timeStr = today.toLocaleTimeString('en-IN');
    const dashDateEl = document.getElementById('dash-date');
    if (dashDateEl) dashDateEl.textContent = dateStr + ' • ' + timeStr;
  }
  updateLiveClock();
  setInterval(updateLiveClock, 1000);
  document.getElementById('bill-date').value = getLocalISODate();

  await loadInventory();
  await loadDashboard();
  addBillRow(); // start with one empty row
})();

async function logout() {
  await db.auth.signOut();
  window.location.href = 'index.html';
}

// ─── Panel Navigation ─────────────────────────
function showPanel(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  if (el) el.classList.add('active');

  if (name === 'dashboard')  loadDashboard();
  if (name === 'inventory')  renderInventory();
  if (name === 'history')    loadHistory();
  if (name === 'khatabook')  loadKhataCustomers();
}

// ══════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════
async function loadDashboard() {
  const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);

  // Revenue & items sold this month
  const { data: inv } = await db.from('invoices')
    .select('total, created_at')
    .eq('user_id', USER.id)
    .gte('created_at', start.toISOString());

  const revenue = (inv || []).reduce((s, r) => s + parseFloat(r.total || 0), 0);
  document.getElementById('st-revenue').textContent = '₹' + fmt(revenue);

  // Items sold (sum of quantities in invoice_items for this month's invoices)
  if (inv && inv.length > 0) {
    const { data: items } = await db.from('invoice_items')
      .select('quantity, name, invoice_id')
      .in('invoice_id', inv.map(i => i.id));
    const totalQty = (items || []).reduce((s, r) => s + (r.quantity || 0), 0);
    document.getElementById('st-sold').textContent = totalQty;

    // Top selling items
    const itemMap = {};
    (items || []).forEach(i => {
      itemMap[i.name] = (itemMap[i.name] || 0) + i.quantity;
    });
    const sorted = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topEl = document.getElementById('top-items-list');
    if (sorted.length) {
      topEl.innerHTML = sorted.map(([name, qty]) =>
        `<div class="top-item"><span>${name}</span><span class="top-item-qty">${qty} sold</span></div>`
      ).join('');
    }
  } else {
    document.getElementById('st-sold').textContent = '0';
  }

  // Low stock count
  const lowStock = INVENTORY.filter(p => p.stock <= p.min_stock).length;
  document.getElementById('st-lowstock').textContent = lowStock;

  // Total udhari (sum of all customer dues)
  const { data: khata } = await db.from('khata_customers')
    .select('total_due').eq('user_id', USER.id);
  const totalDue = (khata || []).reduce((s, c) => s + parseFloat(c.total_due || 0), 0);
  document.getElementById('st-udhari').textContent = '₹' + fmt(totalDue);

  // Recent bills (last 5)
  const { data: recent } = await db.from('invoices')
    .select('invoice_number, customer_name, total, created_at')
    .eq('user_id', USER.id)
    .order('created_at', { ascending: false })
    .limit(5);
  const tbody = document.getElementById('dash-bills-body');
  if (recent && recent.length) {
    tbody.innerHTML = recent.map(r => `
      <tr>
        <td>${r.invoice_number}</td>
        <td>${r.customer_name}</td>
        <td>₹${fmt(r.total)}</td>
        <td>${new Date(r.created_at).toLocaleDateString('en-IN')}</td>
      </tr>`).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No bills yet</td></tr>';
  }

  // Check expiry alerts
  await loadExpiryAlerts();
}

async function loadExpiryAlerts() {
  const d = new Date();
  d.setDate(d.getDate() + 10); // Alert for anything expiring in next 10 days
  const threshold = getLocalISODate(d);

  const { data: batches } = await db.from('product_batches')
    .select('*, inventory(name)')
    .eq('user_id', USER.id)
    .lte('expiry_date', threshold)
    .gt('quantity', 0)
    .order('expiry_date');

  const card = document.getElementById('expiry-alerts-card');
  const tbody = document.getElementById('expiry-alerts-body');
  
  if (batches && batches.length > 0) {
    card.style.display = 'block';
    tbody.innerHTML = batches.map(b => {
      const expDate = new Date(b.expiry_date);
      const daysLeft = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
      const urgency = daysLeft <= 3 ? 'color:#dc2626;font-weight:bold;' : 'color:#d97706;';
      return `<tr>
        <td><strong>${esc(b.inventory?.name || 'Unknown')}</strong></td>
        <td>${esc(b.sku || '—')}</td>
        <td>${b.quantity}</td>
        <td style="${urgency}">${daysLeft <= 0 ? 'Expired!' : `In ${daysLeft} days`}</td>
      </tr>`;
    }).join('');
  } else {
    card.style.display = 'none';
  }
}

// Subscribe to real-time changes so if scanner updates stock, dashboard updates instantly
db.channel('custom-all-channel')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, payload => {
    loadInventory();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'product_batches' }, payload => {
    loadExpiryAlerts();
  })
  .subscribe();

// ══════════════════════════════════════════════
//  QR SCANNER 
// ══════════════════════════════════════════════
function generateQR() {
  const url = window.location.origin + '/scan.html';
  document.getElementById('qr-code-img').innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}" alt="QR Code" width="200" height="200">`;
}

// Hook into openModal to generate QR when opened
const originalOpenModal = window.openModal;
window.openModal = function(id) {
  if (id === 'qr-scanner') generateQR();
  originalOpenModal(id);
};

// ══════════════════════════════════════════════
//  INVENTORY
// ══════════════════════════════════════════════
async function loadInventory() {
  const { data, error } = await db.from('inventory')
    .select('*').eq('user_id', USER.id).order('name');
  INVENTORY = data || [];
  renderInventory();
}

function renderInventory(list) {
  const items = list || INVENTORY;
  document.getElementById('inv-count').textContent = items.length + ' items';
  const tbody = document.getElementById('inv-body');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">No items yet. Click "+ Add Item" to start.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(p => {
    const badge = p.stock === 0 ? '<span class="badge badge-red">Out of Stock</span>'
                : p.stock <= p.min_stock ? '<span class="badge badge-orange">Low Stock</span>'
                : '<span class="badge badge-green">In Stock</span>';
    return `<tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${esc(p.category || '')}</td>
      <td>${esc(p.sku || '—')}</td>
      <td>${p.stock} ${badge}</td>
      <td>${p.min_stock}</td>
      <td>₹${fmt(p.selling_price)}</td>
      <td>₹${fmt(p.cost_price)}</td>
      <td>${esc(p.unit || 'pcs')}</td>
      <td style="white-space:nowrap;">
        <button class="btn-edit" onclick="editProduct('${p.id}')">Edit</button>
        <button class="btn-del"  onclick="deleteProduct('${p.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

function filterInventory(q) {
  const f = q.toLowerCase();
  renderInventory(INVENTORY.filter(p =>
    p.name.toLowerCase().includes(f) ||
    (p.sku || '').toLowerCase().includes(f) ||
    (p.category || '').toLowerCase().includes(f)
  ));
}

function openProductModal(id) {
  const p = id ? INVENTORY.find(x => x.id === id) : null;
  document.getElementById('product-modal-title').textContent = p ? 'Edit Product' : 'Add Product';
  document.getElementById('p-id').value       = p?.id       || '';
  document.getElementById('p-name').value     = p?.name     || '';
  document.getElementById('p-category').value = p?.category || '';
  document.getElementById('p-sku').value      = p?.sku      || '';
  document.getElementById('p-unit').value     = p?.unit     || 'pcs';
  document.getElementById('p-sell').value     = p?.selling_price || '';
  document.getElementById('p-cost').value     = p?.cost_price    || '';
  document.getElementById('p-stock').value    = p?.stock    ?? '';
  document.getElementById('p-minstock').value = p?.min_stock ?? 5;
  openModal('product');
}

function editProduct(id) { openProductModal(id); }

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('p-id').value;
  const payload = {
    user_id:       USER.id,
    name:          document.getElementById('p-name').value.trim(),
    category:      document.getElementById('p-category').value.trim() || 'General',
    sku:           document.getElementById('p-sku').value.trim() || null,
    unit:          document.getElementById('p-unit').value.trim() || 'pcs',
    selling_price: parseFloat(document.getElementById('p-sell').value) || 0,
    cost_price:    parseFloat(document.getElementById('p-cost').value) || 0,
    stock:         parseInt(document.getElementById('p-stock').value)  || 0,
    min_stock:     parseInt(document.getElementById('p-minstock').value) || 5,
  };

  if (id) {
    await db.from('inventory').update(payload).eq('id', id);
  } else {
    await db.from('inventory').insert(payload);
  }
  closeModal('product');
  await loadInventory();
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  await db.from('inventory').delete().eq('id', id);
  await loadInventory();
}

// ══════════════════════════════════════════════
//  BILLING
// ══════════════════════════════════════════════
function addBillRow(product) {
  const row = {
    id:    Date.now() + Math.random(),
    name:  product?.name  || '',
    pid:   product?.id    || null,
    qty:   product ? 1 : '',
    rate:  product?.selling_price || '',
    total: product ? product.selling_price : 0
  };
  BILL_ROWS.push(row);
  renderBillRows();
}

function renderBillRows() {
  const tbody = document.getElementById('bill-body');
  tbody.innerHTML = BILL_ROWS.map((row, i) => `
    <tr>
      <td style="color:#9ca3af;">${i + 1}</td>
      <td>
        <div class="autocomplete-wrap">
          <input type="text" value="${esc(row.name)}" placeholder="Product name..."
            oninput="onProductInput(this, '${row.id}')"
            onfocus="onProductInput(this, '${row.id}')"
            onkeydown="navigateAutocomplete(event, '${row.id}')"
            onblur="setTimeout(()=>closeAutocomplete('${row.id}'),150)">
          <div class="autocomplete-list" id="ac-${row.id}" style="display:none;"></div>
        </div>
      </td>
      <td><input type="number" value="${row.qty}" min="0" placeholder="0"
            oninput="updateRow('${row.id}','qty',this.value)"></td>
      <td><input type="number" value="${row.rate}" min="0" step="0.01" placeholder="0.00"
            oninput="updateRow('${row.id}','rate',this.value)"></td>
      <td style="font-weight:600;">₹${fmt(row.total)}</td>
      <td><button class="del-row-btn" onclick="delBillRow('${row.id}')">✕</button></td>
    </tr>
  `).join('');
  calcTotals();
}

function onProductInput(input, rowId) {
  const q = input.value.toLowerCase();

  // Save manually typed names to the state
  const row = BILL_ROWS.find(r => String(r.id) === String(rowId));
  if (row) row.name = input.value;

  const drop = document.getElementById('ac-' + rowId);
  if (!q) { drop.style.display = 'none'; return; }
  const matches = INVENTORY.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  if (!matches.length) { drop.style.display = 'none'; return; }

  drop.innerHTML = matches.map(p =>
    `<div class="autocomplete-item" data-pid="${p.id}" onmousedown="selectProduct('${rowId}','${p.id}')">
       <span>${esc(p.name)}</span>
       <span class="autocomplete-price">₹${fmt(p.selling_price)} | Stk:${p.stock}</span>
     </div>`
  ).join('');
  drop.style.display = 'block';
  drop.dataset.activeIndex = -1;  // reset keyboard cursor
}

function closeAutocomplete(rowId) {
  const drop = document.getElementById('ac-' + rowId);
  if (drop) drop.style.display = 'none';
}

function navigateAutocomplete(e, rowId) {
  const drop = document.getElementById('ac-' + rowId);
  if (!drop || drop.style.display === 'none') return;

  const items = drop.querySelectorAll('.autocomplete-item');
  if (!items.length) return;

  let idx = parseInt(drop.dataset.activeIndex ?? -1);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    idx = (idx + 1) % items.length;
    setActiveItem(items, idx, drop);

  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    idx = (idx - 1 + items.length) % items.length;
    setActiveItem(items, idx, drop);

  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (idx >= 0 && items[idx]) {
      const pid = items[idx].dataset.pid;
      selectProduct(rowId, pid);
    }

  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeAutocomplete(rowId);
    drop.dataset.activeIndex = -1;
  }
}

function setActiveItem(items, idx, drop) {
  items.forEach(el => el.classList.remove('ac-active'));
  if (items[idx]) {
    items[idx].classList.add('ac-active');
    items[idx].scrollIntoView({ block: 'nearest' });
  }
  drop.dataset.activeIndex = idx;
}

function selectProduct(rowId, pid) {
  const product = INVENTORY.find(p => p.id === pid);
  if (!product) return;
  const row = BILL_ROWS.find(r => String(r.id) === String(rowId));
  if (!row) return;
  row.pid   = product.id;
  row.name  = product.name;
  row.rate  = product.selling_price;
  row.qty   = row.qty || 1;
  row.total = (row.qty || 1) * product.selling_price;
  renderBillRows();
}

function updateRow(rowId, field, value) {
  const row = BILL_ROWS.find(r => String(r.id) === String(rowId));
  if (!row) return;
  row[field] = parseFloat(value) || 0;
  row.total  = (parseFloat(row.qty) || 0) * (parseFloat(row.rate) || 0);
  calcTotals();
  // Update total cell without full re-render
  document.querySelectorAll('#bill-body tr').forEach((tr, i) => {
    if (String(BILL_ROWS[i]?.id) === String(rowId)) {
      tr.cells[4].textContent = '₹' + fmt(row.total);
    }
  });
}

function delBillRow(rowId) {
  BILL_ROWS = BILL_ROWS.filter(r => String(r.id) !== String(rowId));
  if (!BILL_ROWS.length) addBillRow();
  else renderBillRows();
}

function calcTotals() {
  const subtotal = BILL_ROWS.reduce((s, r) => s + (r.total || 0), 0);
  const discount = parseFloat(document.getElementById('sum-discount').value) || 0;
  const gstOn    = document.getElementById('gst-toggle').checked;
  const afterDiscount = Math.max(0, subtotal - discount);
  const gst      = gstOn ? afterDiscount * 0.18 : 0;
  const total    = afterDiscount + gst;
  document.getElementById('sum-subtotal').textContent = '₹' + fmt(subtotal);
  document.getElementById('sum-gst').textContent      = '₹' + fmt(gst);
  document.getElementById('sum-total').textContent    = '₹' + fmt(total);
}

function clearBill() {
  if (!confirm('Clear the current bill?')) return;
  BILL_ROWS = [];
  document.getElementById('bill-cust-name').value  = '';
  document.getElementById('bill-cust-phone').value = '';
  document.getElementById('sum-discount').value     = '0';
  document.getElementById('gst-toggle').checked    = false;
  document.getElementById('bill-date').value = getLocalISODate();
  addBillRow();
}

async function saveBill(print) {
  const validRows = BILL_ROWS.filter(r => r.name && r.qty > 0);
  if (!validRows.length) { alert('Add at least one item with quantity.'); return; }

  // ── STOCK VALIDATION: block if any row exceeds available stock ──
  const stockErrors = [];
  for (const r of validRows) {
    if (r.pid) {
      const prod = INVENTORY.find(p => p.id === r.pid);
      if (prod && parseInt(r.qty) > prod.stock) {
        stockErrors.push(`${prod.name}: only ${prod.stock} in stock, but billing ${parseInt(r.qty)}`);
      }
    }
  }
  if (stockErrors.length) {
    showToast('error', 'Stock Insufficient', stockErrors.join('\n'));
    alert('Cannot save bill — insufficient stock:\n\n' + stockErrors.join('\n'));
    return;
  }

  const subtotal  = validRows.reduce((s, r) => s + r.total, 0);
  const discount  = parseFloat(document.getElementById('sum-discount').value) || 0;
  const gstOn     = document.getElementById('gst-toggle').checked;
  const after     = Math.max(0, subtotal - discount);
  const gstAmt    = gstOn ? after * 0.18 : 0;
  const total     = after + gstAmt;
  const invNo     = 'INV-' + Date.now().toString().slice(-6);
  const custName  = document.getElementById('bill-cust-name').value.trim()  || 'Walk-in Customer';
  const custPhone = document.getElementById('bill-cust-phone').value.trim() || null;
  const payMode   = document.getElementById('bill-pay-mode').value;

  // Save invoice
  const { data: inv, error } = await db.from('invoices').insert({
    user_id:        USER.id,
    invoice_number: invNo,
    customer_name:  custName,
    customer_phone: custPhone,
    subtotal, discount,
    gst_amount:     gstAmt,
    total,
    payment_mode:   payMode
  }).select().single();

  if (error) { alert('Error saving bill: ' + error.message); return; }

  // Save line items & update stock
  const lineItems = validRows.map(r => ({
    invoice_id:    inv.id,
    product_id:    r.pid || null,
    name:          r.name,
    quantity:      parseInt(r.qty),
    selling_price: r.rate,
    total:         r.total
  }));
  await db.from('invoice_items').insert(lineItems);

  // Deduct stock for matched products
  for (const r of validRows) {
    if (r.pid) {
      const prod = INVENTORY.find(p => p.id === r.pid);
      if (prod) {
        const newStock = Math.max(0, prod.stock - parseInt(r.qty));
        await db.from('inventory').update({ stock: newStock }).eq('id', r.pid);

        // Fire out-of-stock notification
        if (newStock === 0) {
          showToast('error', 'Out of Stock!', `${prod.name} has reached 0 units. Restock soon.`, 8000);
        } else if (newStock <= prod.min_stock) {
          showToast('warning', 'Low Stock Alert', `${prod.name} is low — only ${newStock} unit(s) left.`, 6000);
        }
      }
    }
  }

  await loadInventory();

  if (print) printInvoice(inv, validRows, subtotal, discount, gstAmt, gstOn, total, payMode);

  clearBill();
  alert('Bill saved! Invoice: ' + invNo);
}

function printInvoice(inv, rows, subtotal, discount, gstAmt, gstOn, total, payMode) {
  const meta = USER.user_metadata || {};
  document.getElementById('pr-shop-name').textContent = meta.shop_name || 'My Shop';
  document.getElementById('pr-shop-meta').textContent =
    (meta.owner_name || '') + ' | ' + (meta.city || '') + ' | ' + (USER.user_metadata?.phone || '');
  document.getElementById('pr-inv-no').textContent  = inv.invoice_number;
  document.getElementById('pr-date').textContent    = new Date(inv.created_at).toLocaleString('en-IN');
  document.getElementById('pr-cust').textContent    = inv.customer_name;
  document.getElementById('pr-phone').textContent   = inv.customer_phone || '—';
  document.getElementById('pr-pay').textContent     = payMode;
  document.getElementById('pr-items').innerHTML = rows.map((r, i) =>
    `<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${r.qty}</td><td>₹${fmt(r.rate)}</td><td>₹${fmt(r.total)}</td></tr>`
  ).join('');
  document.getElementById('pr-subtotal').textContent = '₹' + fmt(subtotal);
  const discRow = document.getElementById('pr-discount-row');
  discRow.style.display = discount > 0 ? 'block' : 'none';
  document.getElementById('pr-discount').textContent = '₹' + fmt(discount);
  const gstRow = document.getElementById('pr-gst-row');
  gstRow.style.display = gstOn ? 'block' : 'none';
  document.getElementById('pr-gst').textContent   = '₹' + fmt(gstAmt);
  document.getElementById('pr-total').textContent = '₹' + fmt(total);
  setTimeout(() => window.print(), 200);
}

// ══════════════════════════════════════════════
//  HISTORY
// ══════════════════════════════════════════════
async function loadHistory() {
  const tbody = document.getElementById('history-bills-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="empty">Loading history...</td></tr>';
  
  const { data: invoices, error } = await db.from('invoices')
    .select('*, invoice_items(name, quantity)')
    .eq('user_id', USER.id)
    .order('created_at', { ascending: false });

  if (error || !invoices || !invoices.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No history found.</td></tr>';
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    const itemsStr = (inv.invoice_items || []).map(i => `${i.quantity}x ${i.name}`).join(', ');
    const dt = new Date(inv.created_at).toLocaleString('en-IN');
    return `<tr>
      <td><strong>${inv.invoice_number}</strong></td>
      <td>${esc(inv.customer_name)}</td>
      <td>₹${fmt(inv.total)}</td>
      <td>${dt}</td>
      <td style="font-size:0.85em;color:#666;max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(itemsStr)}">${esc(itemsStr)}</td>
    </tr>`;
  }).join('');
}

function filterHistory(q) {
  const query = q.toLowerCase();
  const rows = document.querySelectorAll('#history-bills-body tr');
  rows.forEach(row => {
    if (row.querySelector('.empty')) return;
    const invNo = row.cells[0].textContent.toLowerCase();
    const custName = row.cells[1].textContent.toLowerCase();
    if (invNo.includes(query) || custName.includes(query)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// ══════════════════════════════════════════════
//  KHATABOOK
// ══════════════════════════════════════════════
async function loadKhataCustomers() {
  const { data } = await db.from('khata_customers')
    .select('*').eq('user_id', USER.id).order('name');
  renderKhataCustomers(data || []);
}

function renderKhataCustomers(list) {
  const el = document.getElementById('khata-customers');
  if (!list.length) {
    el.innerHTML = '<div class="empty" style="padding:20px;text-align:center;">No parties yet. Click "+ Add Party".</div>';
    return;
  }
  el.innerHTML = list.map(c => {
    const due = parseFloat(c.total_due || 0);
    return `<div class="khata-party ${ACTIVE_KHATA === c.id ? 'active' : ''}" onclick="selectKhataCustomer('${c.id}')">
      <div>
        <div class="party-name">${esc(c.name)}</div>
        <div class="party-phone">${c.phone || '—'}</div>
      </div>
      <div class="party-bal ${due > 0 ? 'due' : 'clear'}">₹${fmt(Math.abs(due))}</div>
    </div>`;
  }).join('');
}

function filterKhata(q) {
  const f = q.toLowerCase();
  const els = document.querySelectorAll('.khata-party');
  els.forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(f) ? '' : 'none';
  });
}

async function selectKhataCustomer(id) {
  ACTIVE_KHATA = id;
  const { data: c } = await db.from('khata_customers').select('*').eq('id', id).single();
  if (!c) return;

  document.getElementById('khata-empty-state').style.display = 'none';
  document.getElementById('khata-ledger').style.display = 'block';
  document.getElementById('ledger-name').textContent  = c.name;
  document.getElementById('ledger-phone').textContent = c.phone || '';
  document.getElementById('ledger-bal').textContent   = '₹' + fmt(c.total_due || 0);

  // Load transactions with running balance
  const { data: entries } = await db.from('khata_entries')
    .select('*').eq('customer_id', id).order('entry_date').order('created_at');

  let balance = 0;
  const tbody = document.getElementById('ledger-entries');
  if (!entries || !entries.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No entries yet</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(e => {
    const amt = parseFloat(e.amount);
    if (e.type === 'credit') balance += amt;    // gave goods = party owes more
    else                     balance -= amt;     // received payment = balance reduces
    const drAmt = e.type === 'credit' ? '₹' + fmt(amt) : '—';
    const crAmt = e.type === 'debit'  ? '₹' + fmt(amt) : '—';
    const balClr = balance > 0 ? 'color:#dc2626;' : 'color:#16a34a;';
    let dtStr;
    if (e.entry_date.includes('T')) {
      dtStr = new Date(e.entry_date).toLocaleString('en-IN');
    } else {
      dtStr = new Date(e.entry_date + 'T00:00:00').toLocaleDateString('en-IN') + ', ' + new Date(e.created_at).toLocaleTimeString('en-IN');
    }
    return `<tr>
      <td>${dtStr}</td>
      <td>${esc(e.description || '—')}</td>
      <td style="color:#dc2626;font-weight:600;">${drAmt}</td>
      <td style="color:#16a34a;font-weight:600;">${crAmt}</td>
      <td style="${balClr}font-weight:700;">₹${fmt(Math.abs(balance))}</td>
    </tr>`;
  }).join('');

  // Also refresh customer list to update balance display
  loadKhataCustomers();
}

function openKhataCustomerModal() { openModal('khata-customer'); }

async function saveKhataCustomer(e) {
  e.preventDefault();
  const name    = document.getElementById('kc-name').value.trim();
  const phone   = document.getElementById('kc-phone').value.trim() || null;
  const address = document.getElementById('kc-address').value.trim() || null;
  await db.from('khata_customers').insert({ user_id: USER.id, name, phone, address });
  closeModal('khata-customer');
  e.target.reset();
  await loadKhataCustomers();
}

function openEntryModal(type) {
  if (!ACTIVE_KHATA) return;
  ENTRY_TYPE = type;
  document.getElementById('entry-modal-title').textContent =
    type === 'credit' ? '+ Gave Goods / Udhari' : '✓ Received Payment';
  document.getElementById('ke-submit').textContent =
    type === 'credit' ? 'Save Udhari' : 'Save Payment';
  document.getElementById('ke-date').value = getLocalISODateTime();
  document.getElementById('ke-amount').value = '';
  document.getElementById('ke-desc').value   = '';
  openModal('khata-entry');
}

async function saveKhataEntry(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('ke-amount').value);
  const desc   = document.getElementById('ke-desc').value.trim()   || null;
  const date   = document.getElementById('ke-date').value;

  if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }

  // Insert entry
  await db.from('khata_entries').insert({
    customer_id: ACTIVE_KHATA,
    type:        ENTRY_TYPE,
    amount,
    description: desc,
    entry_date:  date
  });

  // Update customer's total_due
  const { data: c } = await db.from('khata_customers').select('total_due').eq('id', ACTIVE_KHATA).single();
  const currentDue = parseFloat(c?.total_due || 0);
  const newDue = ENTRY_TYPE === 'credit'
    ? currentDue + amount    // gave goods → more owed
    : currentDue - amount;   // received payment → less owed
  await db.from('khata_customers').update({ total_due: newDue }).eq('id', ACTIVE_KHATA);

  closeModal('khata-entry');
  e.target.reset();
  selectKhataCustomer(ACTIVE_KHATA); // refresh ledger
}

// ─── Modal Helpers ────────────────────────────
function openModal(id)  { document.getElementById('modal-' + id).classList.add('open'); }
function closeModal(id) { document.getElementById('modal-' + id).classList.remove('open'); }

// Close modal on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(bd => {
  bd.addEventListener('click', e => { if (e.target === bd) bd.classList.remove('open'); });
});

// Shift+Enter inside any billing row input → add new row & focus its product cell
document.getElementById('bill-body').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    addBillRow();
    // Focus the product name input of the newly added (last) row
    const rows = document.querySelectorAll('#bill-body tr');
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const input = lastRow.querySelector('input[type="text"]');
      if (input) input.focus();
    }
  }
});

// ─── Utilities ───────────────────────────────
function fmt(n)  { return (parseFloat(n) || 0).toFixed(2); }
function esc(s)  { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function getLocalISODate(d = new Date()) { return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0]; }
function getLocalISODateTime(d = new Date()) { return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16); }

// ─── Toast Notifications ──────────────────────────────────────
// type: 'error' | 'warning' | 'success' | 'info'
function showToast(type, title, msg, duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { error: '🚫', warning: '⚠️', success: '✅', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);

  // Auto-dismiss
  setTimeout(() => {
    toast.style.animation = 'toast-out .35s ease forwards';
    setTimeout(() => toast.remove(), 380);
  }, duration);
}

// ══════════════════════════════════════════════
//  DEALER BILL SCANNER (Python Backend API)
// ══════════════════════════════════════════════

// Change this URL when you deploy your Python backend to the cloud
const SCANNER_API = 'http://localhost:8000';

let SCANNED_ITEMS = [];

function closeBillScanner() {
  closeModal('bill-scanner');
  rescanBill();
}

function rescanBill() {
  SCANNED_ITEMS = [];
  document.getElementById('bill-scan-input').value = '';
  document.getElementById('scan-preview').style.display = 'none';
  document.getElementById('scan-step-upload').style.display = '';
  document.getElementById('scan-step-progress').style.display = 'none';
  document.getElementById('scan-step-results').style.display = 'none';
  document.getElementById('scan-step-empty').style.display = 'none';
  document.getElementById('scan-progress-bar').style.width = '0%';
}

async function handleBillImage(input) {
  const file = input.files[0];
  if (!file) return;

  // Show image preview
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('scan-preview');
    preview.src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);

  // Switch to progress view
  document.getElementById('scan-step-upload').style.display = 'none';
  document.getElementById('scan-step-progress').style.display = '';
  document.getElementById('scan-progress-text').textContent = 'Sending bill to server...';

  // Animate progress bar while waiting
  let fakeProgress = 0;
  const progressInterval = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + 5, 85);
    document.getElementById('scan-progress-bar').style.width = fakeProgress + '%';
    if (fakeProgress < 30)      document.getElementById('scan-progress-text').textContent = 'Uploading image...';
    else if (fakeProgress < 60) document.getElementById('scan-progress-text').textContent = 'Enhancing image quality...';
    else                        document.getElementById('scan-progress-text').textContent = 'Reading text & parsing items...';
  }, 200);

  try {
    // Build FormData: send image + current inventory for fuzzy matching
    const formData = new FormData();
    formData.append('file', file);
    formData.append('inventory', JSON.stringify(
      INVENTORY.map(p => ({ id: p.id, name: p.name }))
    ));

    const response = await fetch(`${SCANNER_API}/api/scan-bill`, {
      method: 'POST',
      body: formData,
    });

    clearInterval(progressInterval);
    document.getElementById('scan-progress-bar').style.width = '100%';
    document.getElementById('scan-progress-text').textContent = 'Done!';

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Server error');
    }

    const data = await response.json();

    // Map API response to our internal format
    SCANNED_ITEMS = (data.items || []).map(item => ({
      raw_name:     item.name,
      matched_name: item.matched_name,
      matched_id:   item.matched_id || null,
      qty:          item.qty,
      price:        item.cost_price,
      is_new:       item.is_new,
      confidence:   item.confidence || 0,
    }));

    setTimeout(() => {
      document.getElementById('scan-step-progress').style.display = 'none';
      if (SCANNED_ITEMS.length === 0) {
        document.getElementById('scan-step-empty').style.display = '';
      } else {
        renderScanResults();
        document.getElementById('scan-step-results').style.display = '';
      }
    }, 400);

  } catch (err) {
    clearInterval(progressInterval);
    document.getElementById('scan-step-progress').style.display = 'none';
    document.getElementById('scan-step-empty').style.display = '';

    // Show a more helpful error if backend is not running
    const emptyDiv = document.getElementById('scan-step-empty');
    if (err.message.includes('fetch') || err.message.includes('Failed')) {
      emptyDiv.innerHTML = `
        <div style="font-size:2rem;margin-bottom:8px;">🔌</div>
        <div style="font-weight:600;margin-bottom:8px;">Backend server not running</div>
        <div style="font-size:0.85rem;color:#9ca3af;margin-bottom:16px;">
          Start the Python backend with:<br>
          <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;">python Backend/main.py</code>
        </div>
        <button class="btn-outline" onclick="rescanBill()">Try Again</button>
      `;
    }
    console.error('Scanner Error:', err);
  }
}

function sanitizeProductName(name) {
  // Remove OCR garbage characters
  return name
    .replace(/[|{}\[\]\\/<>@#$%^*_=+~`"'!]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\W\d]+/, '')
    .replace(/[^a-zA-Z0-9 .,&()-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function renderScanResults() {
  const tbody = document.getElementById('scan-results-body');
  if (!SCANNED_ITEMS.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:20px;">No items detected</td></tr>';
    return;
  }
  tbody.innerHTML = SCANNED_ITEMS.map((item, i) => {
    const displayName = sanitizeProductName(item.matched_name || item.raw_name || '');
    const detectedName = sanitizeProductName(item.raw_name || '');
    const totalPrice = ((item.qty || 1) * (item.price || 0)).toFixed(2);
    return `
    <tr>
      <td>
        <input type="text" value="${esc(displayName)}" 
          style="width:100%;padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;font-weight:600;"
          onchange="SCANNED_ITEMS[${i}].matched_name=sanitizeProductName(this.value);SCANNED_ITEMS[${i}].is_new=true;">
        ${item.is_new
          ? `<div style="margin-top:3px;"><span style="font-size:0.7rem;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;">🆕 NEW ITEM</span></div>`
          : `<div style="margin-top:3px;"><span style="font-size:0.7rem;background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;">✓ Matched ${item.confidence}%</span></div>`}
      </td>
      <td><input type="number" value="${item.qty}" min="0.01" step="0.01" style="width:75px;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;text-align:center;" onchange="SCANNED_ITEMS[${i}].qty=parseFloat(this.value)||1;updateScanRowTotal(${i})"></td>
      <td><input type="number" value="${item.price}" min="0" step="0.01" style="width:90px;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;text-align:right;" onchange="SCANNED_ITEMS[${i}].price=parseFloat(this.value)||0;updateScanRowTotal(${i})"></td>
      <td style="font-weight:600;color:#111;" id="scan-row-total-${i}">₹${totalPrice}</td>
      <td><button class="del-row-btn" onclick="SCANNED_ITEMS.splice(${i},1);renderScanResults()">✕</button></td>
    </tr>
  `;}).join('');
}

function updateScanRowTotal(i) {
  const item = SCANNED_ITEMS[i];
  const totalEl = document.getElementById('scan-row-total-' + i);
  if (totalEl) totalEl.textContent = '₹' + ((item.qty||1)*(item.price||0)).toFixed(2);
}

async function addScannedToInventory() {
  if (!SCANNED_ITEMS.length) return;

  const btn = document.querySelector('[onclick="addScannedToInventory()"]');
  btn.disabled = true;
  btn.textContent = 'Updating inventory...';

  let added = 0, updated = 0, errors = 0;

  for (const item of SCANNED_ITEMS) {
    // Always re-sanitize name before saving
    const cleanName = sanitizeProductName(item.matched_name || item.raw_name || '').trim();
    if (!cleanName || cleanName.length < 2) { errors++; continue; }

    const qty   = Math.max(0, parseFloat(item.qty)   || 0);
    const price = Math.max(0, parseFloat(item.price) || 0);

    if (item.matched_id && !item.is_new) {
      // Update existing product: add stock, update cost price
      const prod = INVENTORY.find(p => p.id === item.matched_id);
      if (prod) {
        const newStock = (parseFloat(prod.stock) || 0) + qty;
        const { error } = await db.from('inventory')
          .update({ stock: newStock, cost_price: price })
          .eq('id', item.matched_id);
        if (!error) updated++;
        else errors++;
      }
    } else {
      // Check if a product with this name already exists (prevent duplicates)
      const existing = INVENTORY.find(p =>
        p.name.toLowerCase().trim() === cleanName.toLowerCase().trim()
      );
      if (existing) {
        // Restock the existing one
        const newStock = (parseFloat(existing.stock) || 0) + qty;
        await db.from('inventory')
          .update({ stock: newStock, cost_price: price })
          .eq('id', existing.id);
        updated++;
      } else {
        // Insert brand new product
        const { error } = await db.from('inventory').insert({
          user_id:       USER.id,
          name:          cleanName,
          category:      'General',
          stock:         qty,
          cost_price:    price,
          selling_price: price,   // default selling = cost; user can edit later
          min_stock:     5,
          unit:          'pcs'
        });
        if (!error) added++;
        else errors++;
      }
    }
  }

  await loadInventory();
  renderInventory();

  closeModal('bill-scanner');
  rescanBill();
  btn.disabled = false;
  btn.textContent = '✓ Add to Inventory';

  let msg = `✅ Done!\n\n📦 ${updated} existing item(s) restocked\n🆕 ${added} new item(s) added to inventory`;
  if (errors > 0) msg += `\n⚠️ ${errors} item(s) skipped (invalid name or DB error)`;
  alert(msg);
}
