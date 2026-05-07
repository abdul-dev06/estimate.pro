let quotes = [];
let invoices = [];
let invoiceCounter = 0;
let activeView = 'quotes';
let settings = JSON.parse(localStorage.getItem('ep_settings') || '{}');

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function randomQuoteNum() {
  let n;
  do { n = Math.floor(Math.random() * 90000) + 10000; }
  while (quotes.some(q => q.num === n));
  return n;
}

function addQuote() {
  const q = {
    id: uid(),
    num: randomQuoteNum(),
    name: '',
    client: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
    phone: '',
    address: '',
    jobType: 'generic',
    calc: {},
    status: 'draft',
    discount: 0,
    discountType: 'pct',
    taxRate: 0,
    materials: [{ id: uid(), desc: '', qty: 1, price: 0 }],
    labour: [{ id: uid(), desc: '', hours: 1, rate: 0, rateType: 'hourly' }],
    open: true,
    activeTab: 'materials'
  };
  quotes.push(q);
  render();
  setTimeout(() => {
    const card = document.querySelector(`[data-id="${q.id}"]`);
    if (card) card.querySelector('.quote-name-input')?.focus();
  }, 50);
}

function removeQuote(id) {
  showConfirm('Delete this quote?', () => {
    quotes = quotes.filter(q => q.id !== id);
    render();
    toast('Quote deleted');
  });
}

function duplicateQuote(id) {
  const src = quotes.find(q => q.id === id);
  if (!src) return;
  const dup = JSON.parse(JSON.stringify(src));
  dup.id = uid();
  dup.num = randomQuoteNum();
  dup.name = src.name + ' (copy)';
  dup.materials.forEach(m => m.id = uid());
  dup.labour.forEach(l => l.id = uid());
  dup.open = true;
  quotes.push(dup);
  render();
  toast('Quote duplicated');
}

function toggleQuote(id) {
  const q = quotes.find(q => q.id === id);
  if (q) { q.open = !q.open; render(); }
}

function setTab(qid, tab) {
  const q = quotes.find(q => q.id === qid);
  if (q) { q.activeTab = tab; render(); }
}

function updateField(qid, field, val) {
  const q = quotes.find(q => q.id === qid);
  if (q) q[field] = val;
  renderSummaries();
}

function updateDiscountType(qid, val) {
  const q = quotes.find(q => q.id === qid);
  if (q) q.discountType = val;
  render();
}

function setStatus(qid, val) {
  const q = quotes.find(q => q.id === qid);
  if (q) q.status = val;
  render();
}

function setView(v) {
  activeView = v;
  render();
}

function renderPipelineStats() {
  if (activeView === 'invoices') { renderInvoicePipelineStats(); return; }
  const el = document.getElementById('pipeline-stats');
  if (!el) return;
  if (quotes.length === 0) { el.innerHTML = ''; return; }
  const pipeline = quotes.reduce((s, q) => s + calcTotal(q), 0);
  const won = quotes.filter(q => q.status === 'accepted').reduce((s, q) => s + calcTotal(q), 0);
  const sentCount = quotes.filter(q => q.status === 'sent').length;
  const wonCount = quotes.filter(q => q.status === 'accepted').length;
  const statusCounts = { draft: 0, sent: 0, accepted: 0, declined: 0 };
  quotes.forEach(q => { statusCounts[q.status || 'draft']++; });
  el.innerHTML = `<div class="pipeline-bar">
    <div class="pipeline-stat">
      <div class="pipeline-label">Quotes</div>
      <div class="pipeline-value">${quotes.length}</div>
    </div>
    <div class="pipeline-stat">
      <div class="pipeline-label">Pipeline Value</div>
      <div class="pipeline-value pipeline-money">${fmt(pipeline)}</div>
    </div>
    <div class="pipeline-stat">
      <div class="pipeline-label">Awaiting Response</div>
      <div class="pipeline-value">${sentCount}</div>
    </div>
    <div class="pipeline-stat">
      <div class="pipeline-label">Won</div>
      <div class="pipeline-value pipeline-won">${fmt(won)} <span class="pipeline-sub">(${wonCount})</span></div>
    </div>
    <div class="pipeline-pills">
      ${statusCounts.draft ? `<span class="pill pill-draft">${statusCounts.draft} Draft</span>` : ''}
      ${statusCounts.sent ? `<span class="pill pill-sent">${statusCounts.sent} Sent</span>` : ''}
      ${statusCounts.accepted ? `<span class="pill pill-accepted">${statusCounts.accepted} Accepted</span>` : ''}
      ${statusCounts.declined ? `<span class="pill pill-declined">${statusCounts.declined} Declined</span>` : ''}
    </div>
  </div>`;
}

function addItem(qid, type) {
  const q = quotes.find(q => q.id === qid);
  if (!q) return;
  if (type === 'materials') {
    q.materials.push({ id: uid(), desc: '', qty: 1, price: 0 });
  } else {
    q.labour.push({ id: uid(), desc: '', hours: 1, rate: 0, rateType: q.jobType !== 'drywall' ? 'hourly' : undefined });
  }
  render();
}

function removeItem(qid, type, itemId) {
  const q = quotes.find(q => q.id === qid);
  if (!q) return;
  q[type] = q[type].filter(i => i.id !== itemId);
  render();
}

function updateItem(qid, type, itemId, field, val) {
  const q = quotes.find(q => q.id === qid);
  if (!q) return;
  const item = q[type].find(i => i.id === itemId);
  if (item) {
    if (field === 'desc') item[field] = val;
    else item[field] = parseFloat(val) || 0;
  }
  renderSummaries();
}

function updateItemType(qid, itemId, val) {
  const q = quotes.find(q => q.id === qid);
  if (!q) return;
  const item = q.labour.find(l => l.id === itemId);
  if (!item) return;
  item.rateType = val;
  if (val === 'flat') item.hours = 1;
  render();
}

function calcMaterials(q) {
  return q.materials.reduce((s, m) => s + (m.qty * m.price), 0);
}
function calcLabour(q) {
  return q.labour.reduce((s, l) => s + (l.hours * l.rate), 0);
}
function calcDiscount(q) {
  const sub = calcMaterials(q) + calcLabour(q);
  const d = parseFloat(q.discount) || 0;
  if ((q.discountType || 'pct') === 'pct') return +(sub * d / 100).toFixed(2);
  return +Math.min(d, sub).toFixed(2);
}
function calcTax(q) {
  const taxable = calcMaterials(q) + calcLabour(q) - calcDiscount(q);
  return +(Math.max(0, taxable) * (parseFloat(q.taxRate) || 0) / 100).toFixed(2);
}
function calcTotal(q) { return calcMaterials(q) + calcLabour(q) - calcDiscount(q) + calcTax(q); }
function fmt(n) { return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function renderSummaries() {
  quotes.forEach(q => {
    const card = document.querySelector(`[data-id="${q.id}"]`);
    if (!card) return;
    card.querySelector('.quote-total').textContent = fmt(calcTotal(q));
    card.querySelector('.quote-name').textContent = q.name || 'Untitled Quote';
    const matEl = card.querySelector('.sum-val.materials');
    const labEl = card.querySelector('.sum-val.labour');
    const subEl = card.querySelector('.sum-val.subtotal');
    const discEl = card.querySelector('.sum-val.discount');
    const taxEl = card.querySelector('.sum-val.tax');
    const totEl = card.querySelector('.sum-val.total');
    if (matEl) matEl.textContent = fmt(calcMaterials(q));
    if (labEl) labEl.textContent = fmt(calcLabour(q));
    if (subEl) subEl.textContent = fmt(calcMaterials(q) + calcLabour(q));
    if (discEl) discEl.textContent = calcDiscount(q) > 0 ? '-' + fmt(calcDiscount(q)) : '—';
    if (taxEl) taxEl.textContent = calcTax(q) > 0 ? '+' + fmt(calcTax(q)) : '—';
    if (totEl) totEl.textContent = fmt(calcTotal(q));
    card.querySelectorAll('.mat-line-total').forEach(el => {
      const item = q.materials.find(m => m.id === el.dataset.itemId);
      if (item) el.textContent = fmt(item.qty * item.price);
    });
    card.querySelectorAll('.lab-line-total').forEach(el => {
      const item = q.labour.find(l => l.id === el.dataset.itemId);
      if (item) el.textContent = fmt(item.hours * item.rate);
    });
  });
  renderPipelineStats();
}

function render() {
  const container = document.getElementById('quotes-container');
  const invContainer = document.getElementById('invoices-container');
  document.getElementById('tab-quotes')?.classList.toggle('active', activeView === 'quotes');
  document.getElementById('tab-invoices')?.classList.toggle('active', activeView === 'invoices');
  container.style.display = activeView === 'quotes' ? '' : 'none';
  if (invContainer) invContainer.style.display = activeView === 'invoices' ? '' : 'none';
  if (activeView === 'invoices') { renderInvoiceView(); return; }

  if (quotes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#9634;</div>
        <h3>No quotes yet</h3>
        <p>Click "New Quote" to create your first estimate.</p>
      </div>`;
    renderPipelineStats();
    return;
  }

  renderPipelineStats();
  container.innerHTML = quotes.map(q => `
    <div class="quote-card ${q.open ? 'open' : ''}" data-id="${q.id}">
      <div class="quote-header" onclick="toggleQuote('${q.id}')">
        <div class="quote-title-area">
          <span class="quote-number">#${q.num}</span>
          <span class="status-badge status-${q.status || 'draft'}">${{draft:'Draft',sent:'Sent',accepted:'Accepted',declined:'Declined'}[q.status||'draft']}</span>
          ${q.jobType && q.jobType !== 'generic' ? `<span class="job-type-badge ${q.jobType}">${q.jobType.charAt(0).toUpperCase() + q.jobType.slice(1)}</span>` : ''}
          ${invoices.some(i => i.sourceQuoteId === q.id) ? `<span class="inv-linked-badge">Invoiced</span>` : ''}
          <span class="quote-name">${q.name || 'Untitled Quote'}</span>
        </div>
        <div class="quote-meta">
          <span class="quote-total">${fmt(calcTotal(q))}</span>
          <span class="chevron">&#9660;</span>
        </div>
      </div>
      <div class="quote-body">
        <div class="quote-form">
          <div class="form-row">
            <div class="form-group" style="flex:0.7">
              <label>Status</label>
              <select onchange="setStatus('${q.id}',this.value)">
                <option value="draft" ${(q.status||'draft')==='draft'?'selected':''}>Draft</option>
                <option value="sent" ${q.status==='sent'?'selected':''}>Sent</option>
                <option value="accepted" ${q.status==='accepted'?'selected':''}>Accepted</option>
                <option value="declined" ${q.status==='declined'?'selected':''}>Declined</option>
              </select>
            </div>
            <div class="form-group" style="flex:0.7">
              <label>Job Type</label>
              <select onchange="setJobType('${q.id}',this.value)">
                <option value="generic" ${(q.jobType||'generic')==='generic'?'selected':''}>Generic</option>
                <option value="drywall" ${q.jobType==='drywall'?'selected':''}>Drywall</option>
              </select>
            </div>
            <div class="form-group" style="flex:2">
              <label>Job / Quote Name</label>
              <input class="quote-name-input" type="text" value="${esc(q.name)}" placeholder="e.g. Head Unit Install — 2019 Civic"
                oninput="updateField('${q.id}','name',this.value)">
            </div>
            <div class="form-group">
              <label>Client Name</label>
              <input type="text" value="${esc(q.client)}" placeholder="Client name"
                oninput="updateField('${q.id}','client',this.value)">
            </div>
            <div class="form-group" style="flex:0.6">
              <label>Date</label>
              <input type="date" value="${q.date}"
                onchange="updateField('${q.id}','date',this.value)">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:0.8">
              <label>Phone</label>
              <input type="tel" value="${esc(q.phone||'')}" placeholder="(555) 000-0000"
                oninput="updateField('${q.id}','phone',this.value)">
            </div>
            <div class="form-group" style="flex:2">
              <label>Address</label>
              <input type="text" value="${esc(q.address||'')}" placeholder="Job site address"
                oninput="updateField('${q.id}','address',this.value)">
            </div>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea placeholder="Additional notes, scope, conditions..."
              oninput="updateField('${q.id}','notes',this.value)">${esc(q.notes)}</textarea>
          </div>
        </div>

        <div class="section-tabs">
          ${q.jobType && q.jobType !== 'generic' ? `<button class="section-tab ${q.activeTab === 'calculator' ? 'active' : ''}"
            onclick="event.stopPropagation(); setTab('${q.id}','calculator')">
            Calculator
          </button>` : ''}
          <button class="section-tab ${q.activeTab === 'materials' ? 'active' : ''}"
            onclick="event.stopPropagation(); setTab('${q.id}','materials')">
            Materials <span style="color:var(--text-muted)">(${q.materials.length})</span>
          </button>
          <button class="section-tab ${q.activeTab === 'labour' ? 'active' : ''}"
            onclick="event.stopPropagation(); setTab('${q.id}','labour')">
            Labour <span style="color:var(--text-muted)">(${q.labour.length})</span>
          </button>
        </div>

        ${q.activeTab === 'calculator' ? renderCalculator(q) : q.activeTab === 'materials' ? renderMaterials(q) : renderLabour(q)}

        <div class="summary-bar">
          <div class="summary-table">
            <div class="sum-row">
              <span class="sum-label">Materials</span>
              <span class="sum-val materials">${fmt(calcMaterials(q))}</span>
            </div>
            <div class="sum-row">
              <span class="sum-label">Labour</span>
              <span class="sum-val labour">${fmt(calcLabour(q))}</span>
            </div>
            <div class="sum-divider"></div>
            <div class="sum-row">
              <span class="sum-label">Subtotal</span>
              <span class="sum-val subtotal">${fmt(calcMaterials(q) + calcLabour(q))}</span>
            </div>
            <div class="sum-row sum-adj">
              <span class="sum-label">Discount</span>
              <div class="sum-adj-controls">
                <input class="adj-input" type="number" min="0" step="any" value="${q.discount || 0}"
                  oninput="updateField('${q.id}','discount',this.value)">
                <select class="adj-type-sel" onchange="updateDiscountType('${q.id}',this.value)">
                  <option value="pct" ${(q.discountType || 'pct') === 'pct' ? 'selected' : ''}>%</option>
                  <option value="flat" ${q.discountType === 'flat' ? 'selected' : ''}>$</option>
                </select>
              </div>
              <span class="sum-val discount">${calcDiscount(q) > 0 ? '-' + fmt(calcDiscount(q)) : '—'}</span>
            </div>
            <div class="sum-row sum-adj">
              <span class="sum-label">Tax</span>
              <div class="sum-adj-controls">
                <input class="adj-input" type="number" min="0" step="any" value="${q.taxRate || 0}"
                  oninput="updateField('${q.id}','taxRate',this.value)">
                <span class="adj-unit">%</span>
              </div>
              <span class="sum-val tax">${calcTax(q) > 0 ? '+' + fmt(calcTax(q)) : '—'}</span>
            </div>
            <div class="sum-divider sum-divider-total"></div>
            <div class="sum-row sum-total-row">
              <span class="sum-label">Total</span>
              <span class="sum-val total">${fmt(calcTotal(q))}</span>
            </div>
          </div>
        </div>

        <div class="quote-actions">
          <button class="btn btn-ghost btn-sm btn-danger" onclick="removeQuote('${q.id}')">Delete</button>
          <button class="btn btn-ghost btn-sm" onclick="duplicateQuote('${q.id}')">Duplicate</button>
          <button class="btn btn-sm" onclick="exportSingle('${q.id}')">Export Quote</button>
          <button class="btn btn-sm" onclick="convertToInvoice('${q.id}')" title="Create invoice from this quote">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Invoice
          </button>
          <button class="btn btn-sm" onclick="printQuote('${q.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            PDF
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

const GRIP_SVG = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" style="pointer-events:none"><circle cx="3" cy="2.5" r="1.3"/><circle cx="7" cy="2.5" r="1.3"/><circle cx="3" cy="7" r="1.3"/><circle cx="7" cy="7" r="1.3"/><circle cx="3" cy="11.5" r="1.3"/><circle cx="7" cy="11.5" r="1.3"/></svg>`;

function renderMaterials(q) {
  return `<div class="items-section">
    <table class="items-table">
      <thead><tr>
        <th style="width:20px"></th>
        <th style="width:50%">Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th style="text-align:right">Total</th>
        <th style="width:32px"></th>
      </tr></thead>
      <tbody>
        ${q.materials.map(m => `<tr
          ondragover="dragOver(event)" ondragleave="dragLeave(event)"
          ondrop="dragDrop('${q.id}','materials','${m.id}',event)">
          <td class="drag-handle-cell" draggable="true"
            ondragstart="dragStart('${q.id}','materials','${m.id}',event)"
            ondragend="dragEnd(event)">${GRIP_SVG}</td>
          <td><input class="item-input desc" value="${esc(m.desc)}" placeholder="Item description"
            oninput="updateItem('${q.id}','materials','${m.id}','desc',this.value)"></td>
          <td><input class="item-input num" type="number" min="0" step="1" value="${m.qty}"
            oninput="updateItem('${q.id}','materials','${m.id}','qty',this.value)"></td>
          <td><input class="item-input num" type="number" min="0" step="0.01" value="${m.price}"
            oninput="updateItem('${q.id}','materials','${m.id}','price',this.value)"></td>
          <td><span class="item-total mat-line-total" data-item-id="${m.id}">${fmt(m.qty * m.price)}</span></td>
          <td><button class="remove-item" onclick="removeItem('${q.id}','materials','${m.id}')">&times;</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="add-item-row">
      <button class="add-item-btn" onclick="addItem('${q.id}','materials')">+ Add Material</button>
    </div>
  </div>`;
}

function renderLabour(q) {
  const perSqft = q.jobType === 'drywall';
  return `<div class="items-section">
    <table class="items-table">
      <thead><tr>
        <th style="width:20px"></th>
        <th style="width:45%">Description</th>
        ${!perSqft ? '<th style="width:80px">Type</th>' : ''}
        <th>${perSqft ? 'Sqft' : 'Qty'}</th>
        <th>${perSqft ? '$/sqft' : 'Rate'}</th>
        <th style="text-align:right">Total</th>
        <th style="width:32px"></th>
      </tr></thead>
      <tbody>
        ${q.labour.map(l => {
          const isFlat = !perSqft && l.rateType === 'flat';
          return `<tr
            ondragover="dragOver(event)" ondragleave="dragLeave(event)"
            ondrop="dragDrop('${q.id}','labour','${l.id}',event)">
            <td class="drag-handle-cell" draggable="true"
              ondragstart="dragStart('${q.id}','labour','${l.id}',event)"
              ondragend="dragEnd(event)">${GRIP_SVG}</td>
            <td><input class="item-input desc" value="${esc(l.desc)}" placeholder="Labour description"
              oninput="updateItem('${q.id}','labour','${l.id}','desc',this.value)"></td>
            ${!perSqft ? `<td>
              <select class="item-type-sel" onchange="updateItemType('${q.id}','${l.id}',this.value)">
                <option value="hourly" ${l.rateType !== 'flat' ? 'selected' : ''}>Hourly</option>
                <option value="flat" ${isFlat ? 'selected' : ''}>Flat</option>
              </select>
            </td>` : ''}
            <td>${isFlat
              ? '<span class="item-flat-dash">—</span>'
              : `<input class="item-input num" type="number" min="0" step="${perSqft ? '1' : '0.25'}" value="${l.hours}"
                  oninput="updateItem('${q.id}','labour','${l.id}','hours',this.value)">`
            }</td>
            <td><input class="item-input num" type="number" min="0" step="0.01" value="${l.rate}"
              placeholder="${isFlat ? 'Amount' : '0.00'}"
              oninput="updateItem('${q.id}','labour','${l.id}','rate',this.value)"></td>
            <td><span class="item-total lab-line-total" data-item-id="${l.id}">${fmt(l.hours * l.rate)}</span></td>
            <td><button class="remove-item" onclick="removeItem('${q.id}','labour','${l.id}')">&times;</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="add-item-row">
      <button class="add-item-btn" onclick="addItem('${q.id}','labour')">+ Add Labour</button>
    </div>
  </div>`;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// Job type calculator logic

function setJobType(qid, jobType) {
  const q = quotes.find(q => q.id === qid);
  if (!q) return;
  q.jobType = jobType;
  q.calc = defaultCalc(jobType);
  q.activeTab = jobType !== 'generic' ? 'calculator' : 'materials';
  render();
}

function defaultCalc(jobType) {
  if (jobType === 'drywall') return {
    rooms: [{ id: uid(), name: 'Room 1', length: '', width: '', height: 9, doors: 1, windows: 2 }],
    extraSqft: 0, waste: 10, matMarkup: 0
  };
  return {};
}

function updateCalc(qid, field, val) {
  const q = quotes.find(q => q.id === qid);
  if (!q || !q.calc) return;
  const numFields = ['extraSqft', 'waste', 'matMarkup'];
  q.calc[field] = numFields.includes(field) ? (parseFloat(val) || 0) : val;
  render();
}


function addRoom(qid) {
  const q = quotes.find(q => q.id === qid);
  if (!q || !q.calc) return;
  q.calc.rooms = q.calc.rooms || [];
  const n = q.calc.rooms.length + 1;
  q.calc.rooms.push({ id: uid(), name: `Room ${n}`, length: '', width: '', height: 9, doors: 0, windows: 0 });
  render();
}

function removeRoom(qid, roomId) {
  const q = quotes.find(q => q.id === qid);
  if (!q || !q.calc || !q.calc.rooms || q.calc.rooms.length <= 1) return;
  q.calc.rooms = q.calc.rooms.filter(r => r.id !== roomId);
  render();
}

function updateRoom(qid, roomId, field, val) {
  const q = quotes.find(q => q.id === qid);
  if (!q || !q.calc || !q.calc.rooms) return;
  const room = q.calc.rooms.find(r => r.id === roomId);
  if (!room) return;
  const numFields = ['length', 'width', 'height', 'doors', 'windows'];
  room[field] = numFields.includes(field) ? (parseFloat(val) || 0) : val;
  render();
}

function drywallCalc(c) {
  const rooms = c.rooms || [{ length: c.roomLength, width: c.roomWidth, height: c.roomHeight, doors: c.doors, windows: c.windows }];
  let totalWall = 0, totalCeil = 0, totalNetWall = 0, totalDoors = 0, totalWindows = 0;
  const roomResults = rooms.map(room => {
    const l = parseFloat(room.length) || 0;
    const w = parseFloat(room.width) || 0;
    const h = parseFloat(room.height) || 9;
    const d = parseInt(room.doors) || 0;
    const win = parseInt(room.windows) || 0;
    const wallArea = 2 * (l + w) * h;
    const ceilArea = l * w;
    const netWall = Math.max(0, wallArea - d * 20 - win * 15);
    totalWall += wallArea;
    totalCeil += ceilArea;
    totalNetWall += netWall;
    totalDoors += d;
    totalWindows += win;
    return { name: room.name || 'Room', wallArea, ceilArea, netWall, total: netWall + ceilArea };
  });
  const extraSqft = parseFloat(c.extraSqft) || 0;
  const netWallArea = totalNetWall + extraSqft;
  const netArea = netWallArea + totalCeil;
  const waste = parseFloat(c.waste) || 10;
  const sheets = Math.ceil(netArea * (1 + waste / 100) / 32);
  const compoundGal = Math.max(1, Math.ceil(netArea / 100));
  const tape = Math.max(1, Math.ceil(netArea / 300));
  const screws = Math.max(1, Math.ceil(netArea / 300));
  const cornerBead = Math.max(0, totalDoors * 2 + totalWindows * 4);
  return {
    roomResults,
    wallArea: totalWall.toFixed(0), ceilingArea: totalCeil.toFixed(0),
    netWallArea: netWallArea.toFixed(0), netArea: netArea.toFixed(0),
    sheets, compoundGal, tape, screws, cornerBead
  };
}


function applyCalc(qid) {
  const q = quotes.find(q => q.id === qid);
  if (!q) return;
  const c = q.calc;
  const mu = 1 + (parseFloat(c.matMarkup) || 0) / 100;

  if (q.jobType === 'drywall') {
    const r = drywallCalc(c);
    const wallSqft = parseFloat(r.netWallArea) || 0;
    const ceilSqft = parseFloat(r.ceilingArea) || 0;
    q.materials = [
      { id: uid(), desc: 'Drywall sheet', qty: r.sheets, price: +(15.50 * mu).toFixed(2) },
      { id: uid(), desc: 'Joint compound', qty: r.compoundGal, price: +(12 * mu).toFixed(2) },
      { id: uid(), desc: 'Drywall tape', qty: r.tape, price: +(7 * mu).toFixed(2) },
      r.cornerBead > 0 ? { id: uid(), desc: 'Corner bead', qty: r.cornerBead, price: +(2.50 * mu).toFixed(2) } : null,
      { id: uid(), desc: 'Drywall screws', qty: r.screws, price: +(6 * mu).toFixed(2) },
    ].filter(Boolean);
    q.labour = [
      wallSqft > 0 ? { id: uid(), desc: 'Hang walls', hours: wallSqft, rate: 0 } : null,
      ceilSqft > 0 ? { id: uid(), desc: 'Hang ceiling', hours: ceilSqft, rate: 0 } : null,
      wallSqft > 0 ? { id: uid(), desc: 'Finish walls', hours: wallSqft, rate: 0 } : null,
      ceilSqft > 0 ? { id: uid(), desc: 'Finish ceiling', hours: ceilSqft, rate: 0 } : null,
    ].filter(Boolean);
  }

  q.activeTab = 'materials';
  render();
  toast('Line items generated — adjust as needed');
}

function renderCalculator(q) {
  if (q.jobType === 'drywall') return renderDrywallCalc(q);
  return '';
}

function renderDrywallCalc(q) {
  const c = q.calc;
  const rooms = c.rooms || [];
  const r = drywallCalc(c);
  return `<div class="calc-panel">
    <div class="calc-rooms-header">
      <div class="calc-section-title">Rooms</div>
      <button class="add-item-btn" onclick="addRoom('${q.id}')">+ Add Room</button>
    </div>
    <div class="calc-rooms-wrapper"><table class="calc-rooms-table">
      <thead><tr>
        <th>Name</th><th>Length (ft)</th><th>Width (ft)</th><th>Height (ft)</th><th>Doors</th><th>Windows</th><th></th>
      </tr></thead>
      <tbody>
        ${rooms.map(room => `<tr>
          <td><input class="calc-room-input" type="text" value="${esc(room.name || '')}" placeholder="Room name"
            onchange="updateRoom('${q.id}','${room.id}','name',this.value)"></td>
          <td><input class="calc-room-input num" type="number" min="0" step="0.5" value="${room.length || ''}" placeholder="0"
            onchange="updateRoom('${q.id}','${room.id}','length',this.value)"></td>
          <td><input class="calc-room-input num" type="number" min="0" step="0.5" value="${room.width || ''}" placeholder="0"
            onchange="updateRoom('${q.id}','${room.id}','width',this.value)"></td>
          <td><input class="calc-room-input num" type="number" min="0" step="0.5" value="${room.height ?? 9}"
            onchange="updateRoom('${q.id}','${room.id}','height',this.value)"></td>
          <td><input class="calc-room-input num" type="number" min="0" step="1" value="${room.doors ?? 0}"
            onchange="updateRoom('${q.id}','${room.id}','doors',this.value)"></td>
          <td><input class="calc-room-input num" type="number" min="0" step="1" value="${room.windows ?? 0}"
            onchange="updateRoom('${q.id}','${room.id}','windows',this.value)"></td>
          <td><button class="remove-item" onclick="removeRoom('${q.id}','${room.id}')" ${rooms.length <= 1 ? 'disabled' : ''}>&times;</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <div class="calc-section-title" style="margin-top:16px">Global Settings</div>
    <div class="calc-grid">
      <div class="form-group">
        <label>Extra Area (sqft)</label>
        <input type="number" min="0" step="1" value="${c.extraSqft || 0}" placeholder="0"
          onchange="updateCalc('${q.id}','extraSqft',this.value)">
      </div>
      <div class="form-group">
        <label>Waste % (typ. 10)</label>
        <input type="number" min="0" max="50" step="1" value="${c.waste ?? 10}"
          onchange="updateCalc('${q.id}','waste',this.value)">
      </div>
    </div>
    <div class="calc-section-title" style="margin-top:16px">Area Breakdown</div>
    <table class="calc-breakdown-table">
      <thead><tr>
        <th>Room</th><th class="r">Walls (gross)</th><th class="r">Ceiling</th><th class="r">Net Walls</th><th class="r">Room Total</th>
      </tr></thead>
      <tbody>
        ${r.roomResults.map(row => `<tr>
          <td>${esc(row.name)}</td>
          <td class="r">${row.wallArea.toFixed(0)} sqft</td>
          <td class="r">${row.ceilArea.toFixed(0)} sqft</td>
          <td class="r">${row.netWall.toFixed(0)} sqft</td>
          <td class="r bld">${row.total.toFixed(0)} sqft</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <td><strong>Cumulative${parseFloat(c.extraSqft) > 0 ? ` + ${c.extraSqft} sqft extra` : ''}</strong></td>
        <td class="r">${r.wallArea} sqft</td>
        <td class="r">${r.ceilingArea} sqft</td>
        <td class="r">${r.netWallArea} sqft</td>
        <td class="r bld">${r.netArea} sqft</td>
      </tr></tfoot>
    </table>
    <div class="calc-section-title" style="margin-top:16px">Materials</div>
    <div class="calc-results-grid">
      <div class="calc-result-box"><div class="calc-result-label">Sheets (4×8)</div>
        <div class="calc-result-value">${r.sheets}</div></div>
      <div class="calc-result-box"><div class="calc-result-label">Joint Compound</div>
        <div class="calc-result-value">${r.compoundGal} gal</div></div>
      <div class="calc-result-box"><div class="calc-result-label">Tape (300ft rolls)</div>
        <div class="calc-result-value">${r.tape}</div></div>
      <div class="calc-result-box"><div class="calc-result-label">Screws (boxes)</div>
        <div class="calc-result-value">${r.screws}</div></div>
      ${r.cornerBead > 0 ? `<div class="calc-result-box"><div class="calc-result-label">Corner Bead</div>
        <div class="calc-result-value">${r.cornerBead}</div></div>` : ''}
    </div>
    <div class="calc-apply-bar">
      <div class="calc-apply-rates">
        <div class="form-group">
          <label>Material Markup %</label>
          <input type="number" min="0" step="1" value="${c.matMarkup ?? 0}"
            onchange="updateCalc('${q.id}','matMarkup',this.value)">
        </div>
      </div>
      <button class="btn btn-accent" onclick="applyCalc('${q.id}')">Generate Line Items &#8594;</button>
    </div>
  </div>`;
}

// PDF Print

function printQuote(id) {
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const matTotal = calcMaterials(q);
  const labTotal = calcLabour(q);
  const discAmt = calcDiscount(q);
  const taxAmt = calcTax(q);
  const grandTotal = calcTotal(q);

  const isDrywall = q.jobType === 'drywall' && q.calc && (q.calc.rooms || []).length > 0;
  const dc = isDrywall ? drywallCalc(q.calc) : null;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${pdfFilename(q.client, 'Quote')}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1b24;line-height:1.55;padding:48px;max-width:780px;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #e5e6eb}
  .brand{display:flex;align-items:center;gap:14px}
  .co-logo{max-height:64px;max-width:160px;object-fit:contain;display:block}
  .co-name{font-size:1.15rem;font-weight:800;color:#1a1b24;letter-spacing:-0.3px}
  .app-logo{font-family:'Courier New',monospace;font-size:1.2rem;font-weight:700;color:#c98a00}
  .app-logo span{color:#52535f;font-weight:400}
  .qref{text-align:right}
  .qnum{font-family:'Courier New',monospace;font-size:0.75rem;font-weight:700;background:#fff3d0;color:#b37800;padding:2px 9px;border-radius:4px;display:inline-block;margin-bottom:5px}
  .qtitle{font-size:1.05rem;font-weight:700}
  .qdate{font-size:0.8rem;color:#52535f;margin-top:2px}
  .intro{margin-bottom:24px;padding:14px 18px;background:#f9f8f5;border-left:4px solid #c98a00;border-radius:0 6px 6px 0;font-size:0.9rem;color:#52535f;line-height:1.7}
  .intro strong{color:#1a1b24}
  .client{display:flex;flex-wrap:wrap;gap:16px 40px;margin-bottom:20px;padding:12px 16px;background:#f4f5f7;border-radius:8px}
  .cf label{font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9899a8;display:block;margin-bottom:2px}
  .qsum{display:flex;flex-wrap:wrap;border:2px solid #1a1b24;border-radius:8px;overflow:hidden;margin-bottom:28px}
  .qs{flex:1;min-width:100px;padding:14px 18px;border-right:1px solid #d8d9e2}
  .qs:last-child{border-right:none}
  .qs-label{font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9899a8;margin-bottom:5px}
  .qs-value{font-family:'Courier New',monospace;font-size:0.95rem;font-weight:700;color:#1a1b24}
  .qs.total{background:#f4f5f7}
  .qs.total .qs-label{color:#52535f}
  .qs.total .qs-value{font-size:1.15rem;color:#1a1b24}
  .sec-title{font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:#52535f;padding:6px 0;border-bottom:1px solid #d8d9e2;margin:24px 0 2px}
  table{width:100%;border-collapse:collapse;margin-bottom:4px}
  thead th{font-size:0.63rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9899a8;text-align:left;padding:7px 8px;border-bottom:1px solid #e5e6eb}
  thead th.r{text-align:right}
  tbody td{padding:7px 8px;border-bottom:1px solid #eeeff3;font-size:0.85rem;vertical-align:top}
  tbody td.r{text-align:right;font-family:'Courier New',monospace;white-space:nowrap}
  tfoot td{padding:8px;border-top:2px solid #1a1b24;font-size:0.85rem;font-weight:700;background:#f4f5f7}
  tfoot td.r{text-align:right;font-family:'Courier New',monospace;color:#c98a00}
  .calc-block{margin-top:28px;display:flex;flex-direction:column;align-items:flex-end;gap:3px;padding-top:20px;border-top:1px solid #d8d9e2}
  .crow{display:flex;min-width:300px;align-items:baseline}
  .crow .cl{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9899a8;flex:1;text-align:right;padding-right:20px;line-height:2}
  .crow .cv{font-family:'Courier New',monospace;font-size:0.95rem;font-weight:600;min-width:110px;text-align:right}
  .crow.sub{border-top:1px solid #d8d9e2;padding-top:4px;margin-top:2px}
  .crow.sub .cv{color:#52535f}
  .crow.grand{border-top:2px solid #1a1b24;margin-top:4px;padding-top:6px}
  .crow.grand .cl{font-size:0.8rem;color:#1a1b24}
  .crow.grand .cv{font-size:1.25rem;color:#1a1b24}
  .notes{margin-top:28px;padding-top:18px;border-top:1px solid #e5e6eb}
  .notes label{font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9899a8;display:block;margin-bottom:6px}
  .notes p{font-size:0.85rem;color:#52535f;white-space:pre-wrap}
  @media print{@page{margin:0}body{padding:15mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}thead{display:table-header-group}tfoot{display:table-footer-group}}
</style>
</head>
<body>
<div class="hdr">
  <div class="brand">
    ${settings.logoFile ? `<img class="co-logo" src="${esc(settings.logoFile)}" alt="logo">` : ''}
    ${settings.companyName ? `<div class="co-name">${esc(settings.companyName)}</div>` : '<div class="app-logo">estimate<span>.pro</span></div>'}
  </div>
  <div class="qref">
    <div class="qnum">#${q.num}</div>
    <div class="qtitle">${esc(q.name) || 'Untitled Quote'}</div>
    <div class="qdate">${q.date}</div>
  </div>
</div>
${q.client || q.phone || q.address ? `<div class="client">
  ${q.client ? `<div class="cf"><label>Client</label><span>${esc(q.client)}</span></div>` : ''}
  ${q.phone ? `<div class="cf"><label>Phone</label><span>${esc(q.phone)}</span></div>` : ''}
  ${q.address ? `<div class="cf"><label>Address</label><span>${esc(q.address)}</span></div>` : ''}
</div>` : ''}
<p class="intro">Thank you for choosing <strong>${esc(settings.companyName || 'us')}</strong>. We are pleased to send you your estimate for review.</p>
<div class="qsum">
  <div class="qs mat"><div class="qs-label">Materials</div><div class="qs-value">${fmt(matTotal)}</div></div>
  <div class="qs lab"><div class="qs-label">Labour</div><div class="qs-value">${fmt(labTotal)}</div></div>
  ${discAmt > 0 ? `<div class="qs disc"><div class="qs-label">Discount</div><div class="qs-value">-${fmt(discAmt)}</div></div>` : ''}
  ${taxAmt > 0 ? `<div class="qs tax"><div class="qs-label">Tax (${q.taxRate}%)</div><div class="qs-value">+${fmt(taxAmt)}</div></div>` : ''}
  <div class="qs total"><div class="qs-label">Total</div><div class="qs-value">${fmt(grandTotal)}</div></div>
</div>
${isDrywall ? `<div class="sec-title">Room Breakdown</div>
<table>
  <thead><tr>
    <th>Room</th><th class="r">Walls (gross)</th><th class="r">Ceiling</th><th class="r">Net Walls</th><th class="r">Room Total</th>
  </tr></thead>
  <tbody>
    ${dc.roomResults.map(row => `<tr>
      <td>${esc(row.name)}</td>
      <td class="r">${row.wallArea.toFixed(0)} sqft</td>
      <td class="r">${row.ceilArea.toFixed(0)} sqft</td>
      <td class="r">${row.netWall.toFixed(0)} sqft</td>
      <td class="r">${row.total.toFixed(0)} sqft</td>
    </tr>`).join('')}
  </tbody>
  <tfoot><tr>
    <td>Cumulative${parseFloat((q.calc || {}).extraSqft) > 0 ? ' + ' + q.calc.extraSqft + ' sqft extra' : ''}</td>
    <td class="r">${dc.wallArea} sqft</td>
    <td class="r">${dc.ceilingArea} sqft</td>
    <td class="r">${dc.netWallArea} sqft</td>
    <td class="r">${dc.netArea} sqft</td>
  </tr></tfoot>
</table>` : ''}
${q.materials.length > 0 ? `<div class="sec-title">Schedule of Materials</div>
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit Price</th><th class="r">Total</th></tr></thead>
<tbody>${q.materials.map(m => `<tr><td>${esc(m.desc) || '—'}</td><td class="r">${m.qty}</td><td class="r">${fmt(m.price)}</td><td class="r">${fmt(m.qty * m.price)}</td></tr>`).join('')}</tbody>
<tfoot><tr><td colspan="3">Materials Total</td><td class="r">${fmt(matTotal)}</td></tr></tfoot>
</table>` : ''}
${q.labour.length > 0 ? `<div class="sec-title">Schedule of Labour</div>
<table><thead><tr><th>Description</th><th class="r">${isDrywall ? 'Sqft' : 'Hours'}</th><th class="r">${isDrywall ? '$/sqft' : 'Rate'}</th><th class="r">Total</th></tr></thead>
<tbody>${q.labour.map(l => {
  const isFlat = !isDrywall && l.rateType === 'flat';
  return `<tr><td>${esc(l.desc) || '—'}</td><td class="r">${isFlat ? '<span style="font-size:0.78em;font-style:italic;color:#52535f">Flat Rate</span>' : l.hours}</td><td class="r">${isFlat ? '—' : fmt(l.rate)}</td><td class="r">${fmt(l.hours * l.rate)}</td></tr>`;
}).join('')}</tbody>
<tfoot><tr><td colspan="3">Labour Total</td><td class="r">${fmt(labTotal)}</td></tr></tfoot>
</table>` : ''}
<div class="calc-block">
  <div class="crow"><span class="cl">Materials</span><span class="cv">${fmt(matTotal)}</span></div>
  <div class="crow"><span class="cl">Labour</span><span class="cv">${fmt(labTotal)}</span></div>
  <div class="crow sub"><span class="cl">Subtotal</span><span class="cv">${fmt(matTotal + labTotal)}</span></div>
  ${discAmt > 0 ? `<div class="crow disc"><span class="cl">Discount${q.discountType === 'pct' ? ' (' + q.discount + '%)' : ''}</span><span class="cv">- ${fmt(discAmt)}</span></div>` : ''}
  ${taxAmt > 0 ? `<div class="crow tax"><span class="cl">Tax (${q.taxRate}%)</span><span class="cv">+ ${fmt(taxAmt)}</span></div>` : ''}
  <div class="crow grand"><span class="cl">Total</span><span class="cv">${fmt(grandTotal)}</span></div>
</div>
${q.notes ? `<div class="notes"><label>Notes</label><p>${esc(q.notes)}</p></div>` : ''}
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('Allow pop-ups to generate PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// Invoice System

function convertToInvoice(qid) {
  const q = quotes.find(q => q.id === qid);
  if (!q) return;
  const today = new Date().toISOString().slice(0, 10);
  const terms = parseInt(settings.paymentTerms) || 30;
  const due = new Date(Date.now() + terms * 86400000).toISOString().slice(0, 10);
  const inv = {
    id: uid(), num: q.num,
    sourceQuoteId: q.id, sourceQuoteNum: q.num,
    name: q.name || '', client: q.client || '',
    phone: q.phone || '', address: q.address || '',
    date: today, dueDate: due, notes: q.notes || '',
    materials: q.materials.map(m => ({ ...m, id: uid() })),
    labour: q.labour.map(l => ({ ...l, id: uid() })),
    discount: q.discount || 0, discountType: q.discountType || 'pct',
    taxRate: q.taxRate || 0, jobType: q.jobType || 'generic',
    status: 'unpaid', open: true,
  };
  invoices.push(inv);
  setView('invoices');
  toast(`Invoice INV-${inv.num} created`);
}

function toggleInvoice(id) {
  const inv = invoices.find(i => i.id === id);
  if (inv) { inv.open = !inv.open; renderInvoiceView(); }
}

function updateInvoiceField(id, field, val) {
  const inv = invoices.find(i => i.id === id);
  if (inv) inv[field] = val;
  renderInvoiceView();
}

function toggleInvoiceStatus(id) {
  const inv = invoices.find(i => i.id === id);
  if (!inv) return;
  inv.status = inv.status === 'paid' ? 'unpaid' : 'paid';
  renderInvoiceView();
}

function removeInvoice(id) {
  showConfirm('Delete this invoice?', () => {
    invoices = invoices.filter(i => i.id !== id);
    renderInvoiceView();
    toast('Invoice deleted');
  });
}

function renderInvoicePipelineStats() {
  const el = document.getElementById('pipeline-stats');
  if (!el) return;
  if (invoices.length === 0) { el.innerHTML = ''; return; }
  const outstanding = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + calcTotal(i), 0);
  const collected = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + calcTotal(i), 0);
  const unpaidCount = invoices.filter(i => i.status !== 'paid').length;
  const paidCount = invoices.filter(i => i.status === 'paid').length;
  el.innerHTML = `<div class="pipeline-bar">
    <div class="pipeline-stat"><div class="pipeline-label">Invoices</div><div class="pipeline-value">${invoices.length}</div></div>
    <div class="pipeline-stat"><div class="pipeline-label">Outstanding</div><div class="pipeline-value pipeline-money">${fmt(outstanding)}</div></div>
    <div class="pipeline-stat"><div class="pipeline-label">Collected</div><div class="pipeline-value pipeline-won">${fmt(collected)}</div></div>
    <div class="pipeline-pills">
      ${unpaidCount ? `<span class="pill pill-sent">${unpaidCount} Unpaid</span>` : ''}
      ${paidCount ? `<span class="pill pill-accepted">${paidCount} Paid</span>` : ''}
    </div>
  </div>`;
}

function renderInvoiceView() {
  const container = document.getElementById('invoices-container');
  if (!container) return;
  renderInvoicePipelineStats();
  if (invoices.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">&#9632;</div>
      <h3>No invoices yet</h3>
      <p>Open any quote and click <strong>Invoice</strong> to get started.</p>
    </div>`;
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  container.innerHTML = invoices.map(inv => {
    const matTotal = calcMaterials(inv);
    const labTotal = calcLabour(inv);
    const discAmt = calcDiscount(inv);
    const taxAmt = calcTax(inv);
    const grandTotal = calcTotal(inv);
    const isPaid = inv.status === 'paid';
    const isOverdue = !isPaid && inv.dueDate < today;
    return `<div class="quote-card ${inv.open ? 'open' : ''}" data-inv-id="${inv.id}">
      <div class="quote-header" onclick="toggleInvoice('${inv.id}')">
        <div class="quote-title-area">
          <span class="quote-number">INV-${inv.num}</span>
          <span class="status-badge ${isPaid ? 'status-accepted' : isOverdue ? 'status-declined' : 'status-sent'}">${isPaid ? 'Paid' : isOverdue ? 'Overdue' : 'Unpaid'}</span>
          <span class="quote-name">${esc(inv.name || inv.client || 'Untitled Invoice')}</span>
        </div>
        <div class="quote-meta">
          <span class="quote-total">${fmt(grandTotal)}</span>
          <span class="chevron">&#9660;</span>
        </div>
      </div>
      <div class="quote-body">
        <div class="inv-meta-grid">
          ${inv.client ? `<div class="inv-meta-item"><span class="inv-meta-label">Client</span><span>${esc(inv.client)}</span></div>` : ''}
          ${inv.address ? `<div class="inv-meta-item"><span class="inv-meta-label">Address</span><span>${esc(inv.address)}</span></div>` : ''}
          ${inv.sourceQuoteNum !== undefined ? `<div class="inv-meta-item"><span class="inv-meta-label">From Quote</span><span>#${inv.sourceQuoteNum}</span></div>` : ''}
          <div class="inv-meta-item">
            <label class="inv-meta-label">Invoice Date</label>
            <input type="date" value="${inv.date}" onchange="updateInvoiceField('${inv.id}','date',this.value)" onclick="event.stopPropagation()">
          </div>
          <div class="inv-meta-item">
            <label class="inv-meta-label">Due Date</label>
            <input type="date" value="${inv.dueDate}" onchange="updateInvoiceField('${inv.id}','dueDate',this.value)" onclick="event.stopPropagation()">
          </div>
        </div>
        <div class="summary-bar">
          <div class="summary-table">
            <div class="sum-row"><span class="sum-label">Materials</span><span class="sum-val materials">${fmt(matTotal)}</span></div>
            <div class="sum-row"><span class="sum-label">Labour</span><span class="sum-val labour">${fmt(labTotal)}</span></div>
            <div class="sum-divider"></div>
            <div class="sum-row"><span class="sum-label">Subtotal</span><span class="sum-val subtotal">${fmt(matTotal + labTotal)}</span></div>
            ${discAmt > 0 ? `<div class="sum-row"><span class="sum-label">Discount</span><span class="sum-val discount">-${fmt(discAmt)}</span></div>` : ''}
            ${taxAmt > 0 ? `<div class="sum-row"><span class="sum-label">Tax (${inv.taxRate}%)</span><span class="sum-val tax">+${fmt(taxAmt)}</span></div>` : ''}
            <div class="sum-divider sum-divider-total"></div>
            <div class="sum-row sum-total-row"><span class="sum-label">Total Due</span><span class="sum-val total">${fmt(grandTotal)}</span></div>
          </div>
        </div>
        <div class="inv-notes">
          <div class="inv-meta-label" style="margin-bottom:6px">Notes</div>
          <textarea placeholder="Additional notes, payment instructions..."
            oninput="updateInvoiceField('${inv.id}','notes',this.value)"
            onclick="event.stopPropagation()">${esc(inv.notes)}</textarea>
        </div>
        <div class="quote-actions">
          <button class="btn btn-ghost btn-sm btn-danger" onclick="removeInvoice('${inv.id}')">Delete</button>
          <button class="btn btn-sm ${isPaid ? 'btn-ghost' : 'btn-accent'}" onclick="toggleInvoiceStatus('${inv.id}')">
            ${isPaid ? 'Mark Unpaid' : '✓ Mark as Paid'}
          </button>
          <button class="btn btn-sm" onclick="printInvoice('${inv.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print Invoice
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function printInvoice(id) {
  const inv = invoices.find(i => i.id === id);
  if (!inv) return;
  const matTotal = calcMaterials(inv);
  const labTotal = calcLabour(inv);
  const discAmt = calcDiscount(inv);
  const taxAmt = calcTax(inv);
  const grandTotal = calcTotal(inv);
  const isPaid = inv.status === 'paid';
  const isDrywall = inv.jobType === 'drywall';
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !isPaid && inv.dueDate < today;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${pdfFilename(inv.client, 'Invoice')}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1b24;line-height:1.55;max-width:780px;margin:0 auto;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  /* Dark header banner */
  .hdr{background:#1a1b24;color:#fff;padding:32px 40px;display:flex;justify-content:space-between;align-items:flex-start}
  .co-logo{max-height:52px;max-width:140px;object-fit:contain;display:block;filter:brightness(0) invert(1);margin-bottom:8px}
  .co-name{font-size:1rem;font-weight:800;color:#fff;letter-spacing:-0.2px}
  .co-sub{font-size:0.75rem;color:rgba(255,255,255,0.45);margin-top:2px}
  .inv-label{font-size:2rem;font-weight:900;letter-spacing:4px;text-transform:uppercase;color:#fff;display:block;line-height:1}
  .inv-num{font-family:'Courier New',monospace;font-size:0.8rem;color:rgba(255,255,255,0.55);margin-top:6px;display:block}
  .inv-job{font-size:0.88rem;color:rgba(255,255,255,0.7);margin-top:4px}
  /* Billing row */
  .billing{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:2px solid #e5e6eb;padding:0 40px}
  .bill-col{padding:20px 0}
  .bill-col+.bill-col{border-left:1px solid #e5e6eb;padding-left:28px}
  .bl{font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9899a8;display:block;margin-bottom:10px}
  .bill-name{font-size:1rem;font-weight:700;color:#1a1b24;margin-bottom:3px}
  .bill-detail{font-size:0.82rem;color:#52535f;margin-bottom:2px}
  .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 0}
  .mf label{font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9899a8;display:block;margin-bottom:2px}
  .mf span{font-size:0.88rem;font-weight:600;color:#1a1b24}
  .mf span.overdue{color:#ef4444}
  .mf span.paid-ok{color:#16a34a}
  /* Amount due banner */
  .amount-due{display:flex;justify-content:space-between;align-items:center;background:#0369a1;color:#fff;padding:18px 40px;margin-bottom:32px}
  .ad-label{font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.65)}
  .ad-breakdown{display:flex;gap:28px}
  .ad-item{text-align:center}
  .ad-item-label{font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.5);display:block;margin-bottom:2px}
  .ad-item-val{font-family:'Courier New',monospace;font-size:0.88rem;font-weight:700;color:rgba(255,255,255,0.9)}
  .ad-total{text-align:right}
  .ad-total-val{font-family:'Courier New',monospace;font-size:1.8rem;font-weight:900;color:#fff;display:block;line-height:1}
  /* Body content */
  .body{padding:0 40px 40px}
  .sec-title{font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#0369a1;padding:5px 0;border-bottom:2px solid #0369a1;margin:24px 0 2px}
  table{width:100%;border-collapse:collapse;margin-bottom:4px}
  thead th{font-size:0.63rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9899a8;text-align:left;padding:8px 10px;background:#f8f9fb;border-bottom:1px solid #e5e6eb}
  thead th.r{text-align:right}
  tbody tr:nth-child(even) td{background:#f8f9fb}
  tbody td{padding:8px 10px;border-bottom:1px solid #eeeff3;font-size:0.85rem;vertical-align:top}
  tbody td.r{text-align:right;font-family:'Courier New',monospace;white-space:nowrap}
  tfoot td{padding:9px 10px;border-top:2px solid #0369a1;font-size:0.85rem;font-weight:700;background:#e0f0fa}
  tfoot td.r{text-align:right;font-family:'Courier New',monospace;color:#0369a1}
  /* Calc waterfall */
  .calc-block{margin-top:28px;display:flex;flex-direction:column;align-items:flex-end;gap:3px;padding-top:20px;border-top:1px solid #d8d9e2}
  .crow{display:flex;min-width:300px;align-items:baseline}
  .crow .cl{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9899a8;flex:1;text-align:right;padding-right:20px;line-height:2}
  .crow .cv{font-family:'Courier New',monospace;font-size:0.95rem;font-weight:600;min-width:110px;text-align:right;color:#1a1b24}
  .crow.sub{border-top:1px solid #d8d9e2;padding-top:4px;margin-top:2px}
  .crow.grand{border-top:2px solid #0369a1;margin-top:4px;padding-top:8px}
  .crow.grand .cl{font-size:0.8rem;color:#0369a1}
  .crow.grand .cv{font-size:1.25rem;color:#0369a1}
  /* Payment + notes */
  .payment-block{margin-top:28px;padding:16px 20px;background:#f0f7ff;border-left:4px solid #0369a1;border-radius:0 6px 6px 0}
  .payment-block h4{font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:#0369a1;margin-bottom:8px}
  .payment-block p{font-size:0.85rem;color:#1a1b24;white-space:pre-wrap;line-height:1.7}
  .paid-stamp{position:fixed;top:100px;right:52px;font-size:3rem;font-weight:900;color:rgba(22,163,74,0.2);border:5px solid rgba(22,163,74,0.2);padding:8px 22px;border-radius:8px;transform:rotate(-18deg);letter-spacing:6px;pointer-events:none}
  .notes{margin-top:24px;padding-top:18px;border-top:1px solid #e5e6eb}
  .notes label{font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9899a8;display:block;margin-bottom:6px}
  .notes p{font-size:0.85rem;color:#52535f;white-space:pre-wrap}
  @media print{@page{margin:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}thead{display:table-header-group}tfoot{display:table-footer-group}}
</style>
</head>
<body>
${isPaid ? '<div class="paid-stamp">PAID</div>' : ''}
<div class="hdr">
  <div>
    ${settings.logoFile ? `<img class="co-logo" src="${esc(settings.logoFile)}" alt="logo">` : ''}
    ${settings.companyName ? `<div class="co-name">${esc(settings.companyName)}</div>` : ''}
    <div class="co-sub">${inv.date}</div>
  </div>
  <div style="text-align:right">
    <span class="inv-label">Invoice</span>
    <span class="inv-num">INV-${inv.num}</span>
    ${inv.name ? `<div class="inv-job">${esc(inv.name)}</div>` : ''}
  </div>
</div>
<div class="billing">
  <div class="bill-col">
    <span class="bl">Bill To</span>
    ${inv.client ? `<div class="bill-name">${esc(inv.client)}</div>` : ''}
    ${inv.phone ? `<div class="bill-detail">${esc(inv.phone)}</div>` : ''}
    ${inv.address ? `<div class="bill-detail">${esc(inv.address)}</div>` : ''}
    ${!inv.client && !inv.phone && !inv.address ? `<div class="bill-detail" style="color:#9899a8;font-style:italic">No client details</div>` : ''}
  </div>
  <div class="bill-col">
    <span class="bl">Invoice Details</span>
    <div class="meta-grid">
      <div class="mf"><label>Invoice Date</label><span>${inv.date}</span></div>
      <div class="mf"><label>Due Date</label><span class="${isOverdue ? 'overdue' : ''}">${inv.dueDate}</span></div>
      ${settings.paymentTerms ? `<div class="mf"><label>Terms</label><span>Net ${settings.paymentTerms}</span></div>` : ''}
      <div class="mf"><label>Status</label><span class="${isPaid ? 'paid-ok' : isOverdue ? 'overdue' : ''}">${isPaid ? 'PAID' : isOverdue ? 'OVERDUE' : 'UNPAID'}</span></div>
      ${inv.sourceQuoteNum !== undefined ? `<div class="mf"><label>Ref. Quote</label><span>#${inv.sourceQuoteNum}</span></div>` : ''}
    </div>
  </div>
</div>
<div class="amount-due">
  <div>
    <div class="ad-label">Summary</div>
    <div class="ad-breakdown" style="margin-top:10px">
      <div class="ad-item"><span class="ad-item-label">Materials</span><span class="ad-item-val">${fmt(matTotal)}</span></div>
      <div class="ad-item"><span class="ad-item-label">Labour</span><span class="ad-item-val">${fmt(labTotal)}</span></div>
      ${discAmt > 0 ? `<div class="ad-item"><span class="ad-item-label">Discount</span><span class="ad-item-val">-${fmt(discAmt)}</span></div>` : ''}
      ${taxAmt > 0 ? `<div class="ad-item"><span class="ad-item-label">Tax</span><span class="ad-item-val">+${fmt(taxAmt)}</span></div>` : ''}
    </div>
  </div>
  <div class="ad-total">
    <span class="ad-label">Amount Due</span>
    <span class="ad-total-val">${fmt(grandTotal)}</span>
  </div>
</div>
<div class="body">
${inv.materials.length > 0 ? `<div class="sec-title">Schedule of Materials</div>
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit Price</th><th class="r">Total</th></tr></thead>
<tbody>${inv.materials.map(m => `<tr><td>${esc(m.desc)||'—'}</td><td class="r">${m.qty}</td><td class="r">${fmt(m.price)}</td><td class="r">${fmt(m.qty*m.price)}</td></tr>`).join('')}</tbody>
<tfoot><tr><td colspan="3">Materials Total</td><td class="r">${fmt(matTotal)}</td></tr></tfoot>
</table>` : ''}
${inv.labour.length > 0 ? `<div class="sec-title">Schedule of Labour</div>
<table><thead><tr><th>Description</th><th class="r">${isDrywall ? 'Sqft' : 'Hours'}</th><th class="r">${isDrywall ? '$/sqft' : 'Rate'}</th><th class="r">Total</th></tr></thead>
<tbody>${inv.labour.map(l => {
  const isFlat = !isDrywall && l.rateType === 'flat';
  return `<tr><td>${esc(l.desc)||'—'}</td><td class="r">${isFlat ? '<span style="font-size:0.78em;font-style:italic;color:#52535f">Flat Rate</span>' : l.hours}</td><td class="r">${isFlat ? '—' : fmt(l.rate)}</td><td class="r">${fmt(l.hours*l.rate)}</td></tr>`;
}).join('')}</tbody>
<tfoot><tr><td colspan="3">Labour Total</td><td class="r">${fmt(labTotal)}</td></tr></tfoot>
</table>` : ''}
<div class="calc-block">
  <div class="crow"><span class="cl">Materials</span><span class="cv">${fmt(matTotal)}</span></div>
  <div class="crow"><span class="cl">Labour</span><span class="cv">${fmt(labTotal)}</span></div>
  <div class="crow sub"><span class="cl">Subtotal</span><span class="cv">${fmt(matTotal+labTotal)}</span></div>
  ${discAmt > 0 ? `<div class="crow"><span class="cl">Discount${inv.discountType==='pct' ? ' ('+inv.discount+'%)' : ''}</span><span class="cv">- ${fmt(discAmt)}</span></div>` : ''}
  ${taxAmt > 0 ? `<div class="crow"><span class="cl">Tax (${inv.taxRate}%)</span><span class="cv">+ ${fmt(taxAmt)}</span></div>` : ''}
  <div class="crow grand"><span class="cl">Amount Due</span><span class="cv">${fmt(grandTotal)}</span></div>
</div>
${settings.paymentDetails ? `<div class="payment-block"><h4>Payment Details</h4><p>${esc(settings.paymentDetails)}</p></div>` : ''}
${inv.notes ? `<div class="notes"><label>Notes</label><p>${esc(inv.notes)}</p></div>` : ''}
</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('Allow pop-ups to generate PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// Export / Import

function exportAll() {
  if (quotes.length === 0 && invoices.length === 0) { toast('Nothing to export'); return; }
  const data = {
    version: 2, exported: new Date().toISOString(),
    quotes: quotes.map(stripRuntime),
    invoices: invoices.map(stripInvRuntime),
  };
  downloadFile(JSON.stringify(data, null, 2), `estimates_${dateStamp()}.epro`);
  toast(`Exported ${quotes.length} quote(s) and ${invoices.length} invoice(s)`);
}

function exportSingle(id) {
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const data = { version: 1, exported: new Date().toISOString(), quotes: [stripRuntime(q)] };
  const name = (q.name || 'quote').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  downloadFile(JSON.stringify(data, null, 2), `${name}_${dateStamp()}.epro`);
  toast('Quote exported');
}

function stripRuntime(q) {
  const c = { ...q };
  delete c.open;
  delete c.activeTab;
  return c;
}

function stripInvRuntime(inv) {
  const c = { ...inv };
  delete c.open;
  return c;
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function pdfFilename(clientName, type) {
  const parts = (clientName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return type;
  const last = parts[parts.length - 1];
  const first = parts.length > 1 ? parts[0] : '';
  return (last + first).replace(/[^a-zA-Z0-9]/g, '') + '-' + type;
}

function importFile() {
  document.getElementById('import-input').click();
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.quotes || !Array.isArray(data.quotes)) throw new Error('Invalid format');
      let count = 0;
      data.quotes.forEach(q => {
        q.open = false;
        q.phone = q.phone || '';
        q.address = q.address || '';
        q.jobType = q.jobType || 'generic';
        q.calc = q.calc || {};
        q.status = q.status || 'draft';
        q.discount = q.discount || 0;
        q.discountType = q.discountType || 'pct';
        q.taxRate = q.taxRate || 0;
        if (q.jobType === 'drywall' && q.calc && !q.calc.rooms) {
          q.calc.rooms = [{ id: uid(), name: 'Room 1',
            length: q.calc.roomLength || '', width: q.calc.roomWidth || '',
            height: q.calc.roomHeight || 9, doors: q.calc.doors || 0, windows: q.calc.windows || 0 }];
        }
        q.activeTab = q.activeTab || 'materials';
        q.id = uid();
        q.materials = (q.materials || []).map(m => ({ ...m, id: uid() }));
        q.labour = (q.labour || []).map(l => ({
          rateType: q.jobType !== 'drywall' ? (l.rateType || 'hourly') : undefined,
          ...l, id: uid()
        }));
        q.num = randomQuoteNum();
        quotes.push(q);
        count++;
      });
      let invCount = 0;
      if (data.invoices && Array.isArray(data.invoices)) {
        data.invoices.forEach(inv => {
          inv.open = false;
          inv.status = inv.status || 'unpaid';
          inv.id = uid();
          inv.materials = (inv.materials || []).map(m => ({ ...m, id: uid() }));
          inv.labour = (inv.labour || []).map(l => ({ ...l, id: uid() }));
          if (!inv.num) { invoiceCounter++; inv.num = invoiceCounter; }
          invoices.push(inv);
          invCount++;
        });
      }
      render();
      toast(`Imported ${count} quote(s)${invCount ? ` and ${invCount} invoice(s)` : ''}`);
    } catch (err) {
      toast('Import failed — invalid file');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// Settings

function showSettings() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px">
      <h3>Company Settings</h3>
      <p style="font-size:0.8rem;color:var(--text-muted);margin:6px 0 20px">Used on PDF exports. Changes take effect on next PDF generated.</p>
      <div class="form-group" style="margin-bottom:14px">
        <label>Company Name</label>
        <input type="text" id="set-name" value="${esc(settings.companyName || '')}" placeholder="e.g. Acme Contracting Ltd.">
      </div>
      <div class="form-group" style="margin-bottom:6px">
        <label>Logo Filename</label>
        <input type="text" id="set-logo" value="${esc(settings.logoFile || '')}" placeholder="e.g. logo.png">
      </div>
      <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:20px">Place the image in the same folder as estimates.html — any format (PNG, JPG, SVG).</p>
      <div class="form-group" style="margin-bottom:14px">
        <label>Payment Terms (days)</label>
        <input type="number" id="set-terms" min="1" value="${esc(settings.paymentTerms || '30')}" placeholder="30">
      </div>
      <div class="form-group" style="margin-bottom:20px">
        <label>Payment Details</label>
        <textarea id="set-payment" placeholder="e.g. E-transfer: payments@company.com&#10;Cheque payable to: Acme Contracting Ltd." style="height:80px">${esc(settings.paymentDetails || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-sm cancel-btn">Cancel</button>
        <button class="btn btn-sm btn-accent save-btn">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.cancel-btn').onclick = () => overlay.remove();
  overlay.querySelector('.save-btn').onclick = () => {
    settings.companyName = overlay.querySelector('#set-name').value.trim();
    settings.logoFile = overlay.querySelector('#set-logo').value.trim();
    settings.paymentTerms = overlay.querySelector('#set-terms').value.trim();
    settings.paymentDetails = overlay.querySelector('#set-payment').value.trim();
    localStorage.setItem('ep_settings', JSON.stringify(settings));
    overlay.remove();
    toast('Settings saved');
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// Confirm Modal

function showConfirm(msg, onYes) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${msg}</h3>
      <div class="modal-actions">
        <button class="btn btn-sm cancel-btn">Cancel</button>
        <button class="btn btn-sm btn-accent confirm-btn">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.cancel-btn').onclick = () => overlay.remove();
  overlay.querySelector('.confirm-btn').onclick = () => { overlay.remove(); onYes(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// Toast

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// Theme

function toggleTheme() {
  document.documentElement.dataset.theme =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
}

// Drag reorder

let dragState = null;

function dragStart(qid, type, itemId, e) {
  dragState = { qid, type, itemId };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', itemId);
  setTimeout(() => e.currentTarget.closest('tr')?.classList.add('dragging'), 0);
}

function dragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function dragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function dragDrop(qid, type, targetId, e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragState || dragState.qid !== qid || dragState.type !== type) { dragState = null; return; }
  if (dragState.itemId === targetId) { dragState = null; return; }
  const q = quotes.find(q => q.id === qid);
  if (!q) return;
  const arr = q[type];
  const from = arr.findIndex(i => i.id === dragState.itemId);
  const to = arr.findIndex(i => i.id === targetId);
  if (from === -1 || to === -1) { dragState = null; return; }
  arr.splice(to, 0, arr.splice(from, 1)[0]);
  dragState = null;
  render();
}

function dragEnd(e) {
  dragState = null;
  document.querySelectorAll('.drag-over, .dragging').forEach(el => {
    el.classList.remove('drag-over', 'dragging');
  });
}

// Init
render();
