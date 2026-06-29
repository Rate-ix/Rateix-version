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

  // Set today's date
  const today = new Date();
  document.getElementById('dash-date').textContent = today.toLocaleDateString('en-IN', { dateStyle: 'long' });
  document.getElementById('bill-date').value = today.toISOString().split('T')[0];

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
  const threshold = d.toISOString().split('T')[0];

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
            onfocus="onProductInput(this, '${row.id}')">
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
  const dropId = 'ac-' + rowId;
  const drop = document.getElementById(dropId);
  if (!q) { drop.style.display = 'none'; return; }
  const matches = INVENTORY.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  if (!matches.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = matches.map(p =>
    `<div class="autocomplete-item" onmousedown="selectProduct('${rowId}','${p.id}')">
       <span>${esc(p.name)}</span>
       <span class="autocomplete-price">₹${fmt(p.selling_price)} | Stk:${p.stock}</span>
     </div>`
  ).join('');
  drop.style.display = 'block';
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
  document.getElementById('bill-date').value = new Date().toISOString().split('T')[0];
  addBillRow();
}

async function saveBill(print) {
  const validRows = BILL_ROWS.filter(r => r.name && r.qty > 0);
  if (!validRows.length) { alert('Add at least one item with quantity.'); return; }

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
  document.getElementById('pr-date').textContent    = new Date(inv.created_at).toLocaleDateString('en-IN');
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
    return `<tr>
      <td>${new Date(e.entry_date).toLocaleDateString('en-IN')}</td>
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
  document.getElementById('ke-date').value = new Date().toISOString().split('T')[0];
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

// ══════════════════════════════════════════════
//  AI — GEMINI INTEGRATION
// ══════════════════════════════════════════════

// ── Key Management ────────────────────────────
function saveAIKey() {
  const key = document.getElementById('ai-key-input').value.trim();
  if (!key.startsWith('AIza')) {
    document.getElementById('ai-key-status').textContent = '❌ Invalid key format. Should start with AIza';
    document.getElementById('ai-key-status').style.color = '#dc2626';
    return;
  }
  localStorage.setItem('ratix_ai_key', key);
  document.getElementById('ai-key-status').textContent = '✅ Key saved! AI features are now active.';
  document.getElementById('ai-key-status').style.color = '#16a34a';
  setTimeout(() => closeModal('ai-setup'), 1500);
}

function getAIKey() {
  const key = localStorage.getItem('ratix_ai_key');
  if (!key) {
    alert('Please set your Gemini API key first.\nClick "⚙ AI Setup" in the sidebar.');
    openModal('ai-setup');
    return null;
  }
  return key;
}

// ── Core Gemini Call ──────────────────────────
async function callGemini(prompt) {
  const key = getAIKey();
  if (!key) return null;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
      })
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || 'Gemini API error');
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Feature 1: Business Insights (Dashboard) ─
async function generateBusinessInsights() {
  const card = document.getElementById('ai-insights-card');
  const txt  = document.getElementById('ai-insights-text');
  card.style.display = 'block';
  txt.innerHTML = '<div class="ai-loading">Analysing your shop data with AI...</div>';

  try {
    // Gather context data
    const revenue    = document.getElementById('st-revenue').textContent;
    const sold       = document.getElementById('st-sold').textContent;
    const lowStock   = document.getElementById('st-lowstock').textContent;
    const udhari     = document.getElementById('st-udhari').textContent;
    const topItems   = document.getElementById('top-items-list').innerText.trim();
    const lowItems   = INVENTORY.filter(p => p.stock <= p.min_stock)
                                .map(p => `${p.name} (stock: ${p.stock})`).join(', ') || 'None';
    const meta       = USER.user_metadata || {};

    const prompt = `You are a smart business advisor for an Indian kirana/wholesale shop named "${meta.shop_name || 'this shop'}".

Here is the shop's current data:
- Revenue this month: ${revenue}
- Items sold this month: ${sold} units
- Low/out-of-stock items: ${lowStock}
- Total pending udhari (credit): ${udhari}
- Top selling items: ${topItems}
- Low stock items: ${lowItems}

Give a concise, practical business summary in 4-5 bullet points. 
Write in simple English. Focus on actionable advice.
Use ₹ for rupees. Be specific, not generic.`;

    const result = await callGemini(prompt);
    txt.textContent = result;
  } catch (err) {
    txt.textContent = '❌ Error: ' + err.message;
  }
}

// ── Feature 2: Natural Language Bill Parser ───
async function parseNaturalBill() {
  const input = document.getElementById('nl-bill-input').value.trim();
  if (!input) { alert('Enter a bill description first.'); return; }

  const btn = document.querySelector('[onclick="parseNaturalBill()"]');
  btn.disabled = true;
  btn.textContent = 'Parsing...';

  try {
    const productList = INVENTORY.map(p => p.name).slice(0, 30).join(', ');

    const prompt = `You are a billing assistant for an Indian kirana/wholesale shop.
Available products in inventory (for matching): ${productList}

Parse this bill text into items. Try to match product names to the inventory list above.
Bill text: "${input}"

Return ONLY a valid JSON array. No explanation, no markdown, just pure JSON:
[{"name": "product name", "qty": number, "rate": number}, ...]

Rules:
- qty must be a positive number
- rate is price per unit in rupees
- If "each" or "per piece" is mentioned, use that as rate
- Match to inventory product names when possible`;

    const raw    = await callGemini(prompt);
    // Extract JSON from response (handle markdown code blocks)
    const match  = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Could not parse AI response as JSON');

    const items  = JSON.parse(match[0]);
    if (!Array.isArray(items) || !items.length) throw new Error('No items found in the text');

    // Clear existing bill and populate with parsed items
    BILL_ROWS = [];
    items.forEach(item => {
      // Try to match to existing inventory product
      const inv = INVENTORY.find(p => p.name.toLowerCase().includes(item.name.toLowerCase()) ||
                                       item.name.toLowerCase().includes(p.name.toLowerCase().split(' ')[0]));
      BILL_ROWS.push({
        id:    Date.now() + Math.random(),
        name:  inv ? inv.name : item.name,
        pid:   inv?.id || null,
        qty:   item.qty || 1,
        rate:  item.rate || inv?.selling_price || 0,
        total: (item.qty || 1) * (item.rate || inv?.selling_price || 0)
      });
    });

    if (!BILL_ROWS.length) addBillRow();
    else { renderBillRows(); calcTotals(); }

    document.getElementById('nl-bill-input').value = '';
    btn.textContent = `✓ ${items.length} items added`;
    setTimeout(() => { btn.textContent = 'Parse →'; btn.disabled = false; }, 2000);
  } catch (err) {
    alert('AI parsing failed: ' + err.message + '\n\nTip: Be more specific, e.g. "5 kg atta 45, 2 oil 180"');
    btn.textContent = 'Parse →';
    btn.disabled    = false;
  }
}

// ── Feature 3: AI Restock Analysis (Inventory) ─
async function generateRestockAnalysis() {
  const card = document.getElementById('ai-restock-card');
  const txt  = document.getElementById('ai-restock-text');
  card.style.display = 'block';
  txt.innerHTML = '<div class="ai-loading">Analysing inventory and sales patterns...</div>';

  try {
    // Get last 30 days sales per product
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: recentInvoices } = await db.from('invoices')
      .select('id').eq('user_id', USER.id)
      .gte('created_at', since.toISOString());

    let salesMap = {};
    if (recentInvoices?.length) {
      const { data: items } = await db.from('invoice_items')
        .select('name, quantity')
        .in('invoice_id', recentInvoices.map(i => i.id));
      (items || []).forEach(i => {
        salesMap[i.name] = (salesMap[i.name] || 0) + i.quantity;
      });
    }

    const inventoryData = INVENTORY.map(p => ({
      name:       p.name,
      stock:      p.stock,
      min_stock:  p.min_stock,
      sold_30d:   salesMap[p.name] || 0,
      unit:       p.unit || 'pcs'
    }));

    const prompt = `You are a smart inventory manager for an Indian kirana/wholesale shop.

Inventory data (last 30 days sales included):
${JSON.stringify(inventoryData, null, 2)}

Analyze this and return a practical restock recommendation.
Format your response as clear bullet points:
• [Item name]: Restock X [unit]. Reason: [brief reason]

Focus on:
1. Items with stock below min_stock
2. Items selling fast (high sold_30d relative to stock)
3. Out of stock items

Keep it under 10 items. Be direct and specific. Use ₹ only if needed.`;

    const result = await callGemini(prompt);
    txt.textContent = result;
  } catch (err) {
    txt.textContent = '❌ Error: ' + err.message;
  }
}

