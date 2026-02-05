async function loadMonthlyUsageTable() {
  const table = $('monthlyUsageTable');
  const errEl = $('monthlyTableError');
  if (errEl) errEl.style.display = 'none';
  if (!table) return;
  table.innerHTML = '<tr><td>Loading…</td></tr>';
  try {
    if (!billingPeriodStartYmd || !maxSelectableDay || !billingInfoLoaded) {
      // Billing info is fetched by load(); this can run before it finishes.
      // Keep the "Loading…" state and retry once shortly.
      setTimeout(() => {
        if (currentRoute === 'usage') loadMonthlyUsageTable();
      }, 250);
      return;
    }
    const url = '/api/billing/ai-daily-tokens-by-model?start=' + encodeURIComponent(billingPeriodStartYmd) +
      '&end=' + encodeURIComponent(maxSelectableDay);
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
    const rows = Array.isArray(data.days) ? data.days : [];
    const models = Array.isArray(data.models) ? data.models : [];
    const totalsByModel = data && typeof data.totalsByModel === 'object' && data.totalsByModel ? data.totalsByModel : {};
    const total = Number(data.totalTokens || 0) || 0;

    table.innerHTML = `
          <thead><tr><th>Date</th><th>Model</th><th class="num">Total</th></tr></thead>
          <tbody></tbody>
          <tfoot></tfoot>
        `;
    const tbody = table.querySelector('tbody');
    for (const r of rows) {
      const date = String(r.date || '');
      const byModel = r.byModel && typeof r.byModel === 'object' ? r.byModel : {};

      const entries = [];
      for (const m of models) {
        const v = Number(byModel[m] || 0) || 0;
        if (v > 0) entries.push([m, v]);
      }
      if (entries.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${date}</td><td>—</td><td class="num">0</td>`;
        tbody.appendChild(tr);
        continue;
      }
      for (let i = 0; i < entries.length; i++) {
        const [m, v] = entries[i];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${i === 0 ? date : ''}</td><td>${String(m)}</td><td class="num">${String(v)}</td>`;
        tbody.appendChild(tr);
      }
    }

    const tfoot = table.querySelector('tfoot');
    const totalRows = [];
    totalRows.push(`<tr><th>Total</th><th>All</th><th class="num">${String(total)}</th></tr>`);
    for (const m of models) {
      const v = Number(totalsByModel[m] || 0) || 0;
      if (v <= 0) continue;
      totalRows.push(`<tr><th>Total</th><th>${String(m)}</th><th class="num">${String(v)}</th></tr>`);
    }
    tfoot.innerHTML = totalRows.join('');
  } catch (e) {
    table.innerHTML = '';
    if (errEl) {
      errEl.textContent = String(e.message || e);
      errEl.style.display = 'block';
    }
  }
}

function fmtMoneyCents(cents, currency) {
  const cur = (currency || 'USD').toUpperCase();
  const v = Number(cents || 0) || 0;
  const amount = (v / 100);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amount);
  } catch (_) {
    return cur + ' ' + amount.toFixed(2);
  }
}

function fmtMoney(value, currency) {
  const cur = (currency || 'USD').toUpperCase();
  const v = Number(value || 0) || 0;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v);
  } catch (_) {
    return cur + ' ' + v.toFixed(2);
  }
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (_) {
    return String(timestamp);
  }
}

function formatStatus(status, transactionType) {
  const s = String(status || '').toLowerCase();
  const type = String(transactionType || '').toLowerCase();
  
  if (type === 'refund') {
    if (s === 'refunded') return '<span style="color:#dc2626;">Refunded</span>';
    if (s === 'partially_refunded') return '<span style="color:#ea580c;">Partially Refunded</span>';
  }
  
  if (s === 'completed') return '<span style="color:#16a34a;">Completed</span>';
  if (s === 'pending') return '<span style="color:#ca8a04;">Pending</span>';
  if (s === 'denied') return '<span style="color:#dc2626;">Denied</span>';
  
  return String(status || '—');
}

async function loadInvoicesTable() {
  const table = $('invoicesTable');
  const errEl = $('invoicesError');
  if (errEl) errEl.style.display = 'none';
  if (!table) return;
  table.innerHTML = '<tr><td>Loading…</td></tr>';
  try {
    const res = await fetch('/api/billing/paypal/transactions', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));

    const rows = Array.isArray(data.transactions) ? data.transactions : [];
    table.innerHTML = `
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th>Status</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody></tbody>
        `;
    const tbody = table.querySelector('tbody');
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" style="color:#555; text-align:center; padding:24px;">No payment history yet.</td>`;
      tbody.appendChild(tr);
      return;
    }
    for (const tx of rows) {
      const date = formatDate(tx.createdAt);
      const type = String(tx.transactionType || '').toUpperCase();
      const desc = String(tx.description || 'Payment');
      const status = formatStatus(tx.status, tx.transactionType);
      const amount = tx.amount ? fmtMoney(tx.amount.value, tx.amount.currency) : '—';
      const typeLabel = type === 'REFUND' ? '<span style="color:#dc2626;">Refund</span>' : '<span style="color:#16a34a;">Payment</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
            <td>${date}</td>
            <td>${typeLabel}</td>
            <td>${desc}</td>
            <td>${status}</td>
            <td class="num">${amount}</td>
          `;
      tbody.appendChild(tr);
    }
  } catch (e) {
    table.innerHTML = '';
    if (errEl) {
      errEl.textContent = String(e.message || e);
      errEl.style.display = 'block';
    }
  }
}
