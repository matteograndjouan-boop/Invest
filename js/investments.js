const Investments = {
  _currentAccount: null, // null = all, 'pea', 'assurance_vie', 'autre'

  renderPortfolio() {
    const investments = Storage.getInvestments();
    this._renderPortfolioKpis(investments);
    Charts.portfolioAllocation(investments);
    Charts.investmentsByAccount(investments);
    this._renderTopPositions(investments);
    this._renderPerformers(investments);
  },

  _renderPortfolioKpis(investments) {
    const totalValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const totalCost  = investments.reduce((s, i) => s + i.quantity * i.buyPrice, 0);
    const gain = totalValue - totalCost;
    const gainPct = totalCost > 0 ? (gain / totalCost * 100) : 0;
    const count = investments.length;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('port-total-value', Utils.formatCurrency(totalValue));
    set('port-total-cost',  Utils.formatCurrency(totalCost));
    set('port-count',       count + ' position' + (count !== 1 ? 's' : ''));
    const gainEl = document.getElementById('port-total-gain');
    if (gainEl) {
      gainEl.textContent = (gain >= 0 ? '+' : '') + Utils.formatCurrency(gain);
      gainEl.className   = 'kpi-value ' + (gain >= 0 ? 'positive' : 'negative');
    }
    const gainPctEl = document.getElementById('port-total-gain-pct');
    if (gainPctEl) gainPctEl.textContent = Utils.formatPercent(gainPct);
    const gainCard = document.getElementById('port-gain-card');
    if (gainCard) gainCard.className = 'kpi-card ' + (gain >= 0 ? 'success' : 'danger');
  },

  _renderTopPositions(investments) {
    const container = document.getElementById('port-top-positions');
    if (!container) return;
    const sorted = [...investments].sort((a, b) => (b.quantity * b.currentPrice) - (a.quantity * a.currentPrice));
    const totalValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    if (!sorted.length) { container.innerHTML = '<p class="text-muted">Aucune position</p>'; return; }
    container.innerHTML = sorted.map(inv => {
      const value = inv.quantity * inv.currentPrice;
      const pct   = totalValue > 0 ? (value / totalValue * 100) : 0;
      const gain  = value - inv.quantity * inv.buyPrice;
      const gainCls = gain >= 0 ? 'positive' : 'negative';
      const acColor = Utils.ACCOUNT_COLORS[inv.account] || '#6b7280';
      return `<div class="port-position-row">
        <div class="port-pos-dot" style="background:${acColor}"></div>
        <div class="port-pos-info">
          <strong>${inv.name}</strong>${inv.ticker ? ` <small class="text-muted">${inv.ticker}</small>` : ''}
          <div class="port-pos-bar-wrap"><div class="port-pos-bar" style="width:${Math.min(pct,100)}%"></div></div>
        </div>
        <div class="port-pos-right">
          <div>${Utils.formatCurrency(value)}</div>
          <div class="${gainCls}" style="font-size:12px">${gain >= 0 ? '+' : ''}${Utils.formatCurrency(gain)}</div>
        </div>
        <div class="port-pos-actions">
          <button class="btn-icon" onclick="Investments.edit('${inv.id}')" title="Modifier">✏️</button>
          <button class="btn-icon btn-danger" onclick="Investments.delete('${inv.id}')" title="Supprimer">🗑️</button>
        </div>
      </div>`;
    }).join('');
  },

  _renderPerformers(investments) {
    const withPerf = investments.map(inv => ({
      ...inv,
      perf: inv.buyPrice > 0 ? (inv.currentPrice - inv.buyPrice) / inv.buyPrice * 100 : 0,
    })).sort((a, b) => b.perf - a.perf);

    const best  = withPerf.slice(0, 3);
    const worst = withPerf.slice(-3).reverse();

    const render = (list, containerId, colorFn) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      if (!list.length) { el.innerHTML = '<p class="text-muted" style="padding:8px 0">-</p>'; return; }
      el.innerHTML = list.map(inv => `
        <div class="performer-row">
          <div class="performer-name">${inv.ticker || inv.name}</div>
          <div class="performer-perf ${colorFn(inv.perf)}">${inv.perf >= 0 ? '+' : ''}${Utils.formatPercent(inv.perf)}</div>
        </div>`).join('');
    };
    render(best,  'port-best',  p => p >= 0 ? 'positive' : 'negative');
    render(worst, 'port-worst', p => p >= 0 ? 'positive' : 'negative');
  },

  renderPositions() {
    const investments = Storage.getInvestments();
    this._renderAccountPills(investments);
    this._renderPositionsTable(investments);
  },

  _renderAccountPills(investments) {
    const container = document.getElementById('positions-account-pills');
    if (!container) return;
    const accounts = [...new Set(investments.map(i => i.account || 'autre'))];
    const allBtn = `<button class="account-pill ${!this._currentAccount ? 'active' : ''}" onclick="Investments.setAccount(null)">Tous</button>`;
    const pills  = accounts.map(acc => {
      const label = Utils.INVESTMENT_ACCOUNTS[acc] || acc;
      const color = Utils.ACCOUNT_COLORS[acc] || '#6b7280';
      const active = this._currentAccount === acc ? 'active' : '';
      return `<button class="account-pill ${active}" style="${active ? `background:${color};border-color:${color}` : `border-color:${color};color:${color}`}" onclick="Investments.setAccount('${acc}')">${label}</button>`;
    });
    container.innerHTML = allBtn + pills.join('');
  },

  _renderPositionsTable(investments) {
    const filtered = this._currentAccount
      ? investments.filter(i => (i.account || 'autre') === this._currentAccount)
      : investments;

    const tbody  = document.getElementById('positions-tbody');
    const empty  = document.getElementById('positions-empty');
    const search = (document.getElementById('pos-search')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('pos-filter-type')?.value || '';

    let list = filtered;
    if (search)     list = list.filter(i => i.name.toLowerCase().includes(search) || (i.ticker || '').toLowerCase().includes(search));
    if (typeFilter) list = list.filter(i => i.type === typeFilter);

    if (!list.length) { if (tbody) tbody.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');

    const totalValue = filtered.reduce((s, i) => s + i.quantity * i.currentPrice, 0);

    tbody.innerHTML = list.map(inv => {
      const value   = inv.quantity * inv.currentPrice;
      const cost    = inv.quantity * inv.buyPrice;
      const gain    = value - cost;
      const gainPct = cost > 0 ? (gain / cost * 100) : 0;
      const pct     = totalValue > 0 ? (value / totalValue * 100) : 0;
      const cls     = gain >= 0 ? 'positive' : 'negative';
      const acColor = Utils.ACCOUNT_COLORS[inv.account || 'autre'] || '#6b7280';
      const barW    = Math.min(Math.abs(gainPct) / 30 * 100, 100);
      const barCol  = gain >= 0 ? '#10b981' : '#ef4444';
      const accLabel = Utils.INVESTMENT_ACCOUNTS[inv.account] || inv.account || 'Autre';
      return `<tr>
        <td><strong>${inv.name}</strong>${inv.ticker ? `<br><small class="text-muted">${inv.ticker}</small>` : ''}</td>
        <td><span class="badge badge-${inv.type}">${Utils.INVESTMENT_TYPES[inv.type] || inv.type}</span></td>
        <td><span class="account-dot" style="background:${acColor}"></span>${accLabel}</td>
        <td>${inv.quantity}</td>
        <td>${Utils.formatCurrency(inv.buyPrice)}</td>
        <td>${Utils.formatCurrency(inv.currentPrice)}</td>
        <td><strong>${Utils.formatCurrency(value)}</strong><br><small class="text-muted">${pct.toFixed(1)}%</small></td>
        <td class="${cls}">
          <div class="pos-perf-cell">
            <div class="pos-perf-bar-wrap"><div class="pos-perf-bar" style="width:${barW}%;background:${barCol}"></div></div>
            <span>${Utils.formatPercent(gainPct)}</span>
          </div>
          <small class="${cls}">${gain >= 0 ? '+' : ''}${Utils.formatCurrency(gain)}</small>
        </td>
        <td class="actions-cell">
          <button class="btn-icon" onclick="Investments.edit('${inv.id}')" title="Modifier">✏️</button>
          <button class="btn-icon btn-danger" onclick="Investments.delete('${inv.id}')" title="Supprimer">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  },

  setAccount(account) {
    this._currentAccount = account;
    this.renderPositions();
  },

  openAddForm() { Modal.open('Ajouter un investissement', this._form(null)); },

  edit(id) {
    const inv = Storage.getInvestments().find(i => i.id === id);
    if (inv) Modal.open("Modifier l'investissement", this._form(inv));
  },

  _form(inv) {
    const isEdit = !!inv;
    const typeOptions = Object.entries(Utils.INVESTMENT_TYPES)
      .map(([v, l]) => `<option value="${v}" ${inv?.type === v ? 'selected' : ''}>${l}</option>`).join('');
    const accountOptions = Object.entries(Utils.INVESTMENT_ACCOUNTS)
      .map(([v, l]) => `<option value="${v}" ${(inv?.account || 'autre') === v ? 'selected' : ''}>${l}</option>`).join('');
    return `
      <form onsubmit="Investments.save(event, ${isEdit ? `'${inv.id}'` : 'null'})">
        <div class="form-grid">
          <div class="form-group"><label>Nom *</label><input name="name" required value="${inv?.name || ''}" placeholder="ex: Apple Inc."></div>
          <div class="form-group"><label>Ticker</label><input name="ticker" value="${inv?.ticker || ''}" placeholder="ex: AAPL"></div>
          <div class="form-group"><label>Type *</label><select name="type" required>${typeOptions}</select></div>
          <div class="form-group"><label>Compte *</label><select name="account" required>${accountOptions}</select></div>
          <div class="form-group"><label>Quantité *</label><input name="quantity" type="number" step="0.000001" min="0" required value="${inv?.quantity || ''}"></div>
          <div class="form-group"><label>Prix d'achat moyen (€) *</label><input name="buyPrice" type="number" step="0.01" min="0" required value="${inv?.buyPrice || ''}"></div>
          <div class="form-group"><label>Prix actuel (€) *</label><input name="currentPrice" type="number" step="0.01" min="0" required value="${inv?.currentPrice || ''}"></div>
          <div class="form-group"><label>Date d'achat</label><input name="buyDate" type="date" value="${inv?.buyDate || ''}"></div>
          <div class="form-group form-full"><label>Notes</label><textarea name="notes" rows="2">${inv?.notes || ''}</textarea></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Modifier' : 'Ajouter'}</button>
        </div>
      </form>`;
  },

  save(event, id) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const data = {
      id: id || Utils.generateId(),
      name: fd.get('name').trim(),
      ticker: (fd.get('ticker') || '').trim().toUpperCase(),
      type: fd.get('type'),
      account: fd.get('account') || 'autre',
      quantity: parseFloat(fd.get('quantity')),
      buyPrice: parseFloat(fd.get('buyPrice')),
      currentPrice: parseFloat(fd.get('currentPrice')),
      buyDate: fd.get('buyDate'),
      notes: (fd.get('notes') || '').trim(),
    };
    const list = Storage.getInvestments();
    if (id) { const idx = list.findIndex(i => i.id === id); if (idx !== -1) list[idx] = data; }
    else list.push(data);
    Storage.saveInvestments(list);
    Modal.close();
    this.renderPortfolio();
    this.renderPositions();
    Dashboard.render();
  },

  delete(id) {
    if (!confirm('Supprimer cet investissement ?')) return;
    Storage.saveInvestments(Storage.getInvestments().filter(i => i.id !== id));
    this.renderPortfolio();
    this.renderPositions();
    Dashboard.render();
  },
};
