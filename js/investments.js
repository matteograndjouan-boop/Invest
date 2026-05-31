const Investments = {
  _currentAccount: null,

  _renderAccountPills() {
    const container = document.getElementById('pos-account-pills');
    if (!container) return;
    const accounts = [
      { key: null, label: 'Tous' },
      { key: 'pea', label: 'PEA' },
      { key: 'assurance_vie', label: 'Assurance Vie' },
      { key: 'autre', label: 'Autre' },
    ];
    container.innerHTML = accounts.map(a =>
      `<button class="account-pill${this._currentAccount === a.key ? ' active' : ''}"
        onclick="Investments.setAccount(${a.key === null ? 'null' : `'${a.key}'`})">${a.label}</button>`
    ).join('');
  },

  renderPortfolio() {
    const investments = Storage.getInvestments();
    this._renderPortfolioKPIs(investments);
    Charts.investmentsByType(investments, 'chart-port-type');
    Charts.investmentsByAccount(investments);
    this._renderTopPositions(investments);
    this._renderPerformers(investments);
  },

  _renderPortfolioKPIs(investments) {
    const totalValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const totalCost  = investments.reduce((s, i) => s + i.quantity * i.buyPrice, 0);
    const gain    = totalValue - totalCost;
    const gainPct = totalCost > 0 ? (gain / totalCost * 100) : 0;

    document.getElementById('port-total-value').textContent = Utils.formatCurrency(totalValue);
    document.getElementById('port-total-sub').textContent =
      `${investments.length} position${investments.length !== 1 ? 's' : ''}`;

    const gainEl = document.getElementById('port-gain');
    gainEl.textContent = Utils.formatCurrency(gain);
    gainEl.className = 'kpi-value ' + (gain >= 0 ? 'positive' : 'negative');
    document.getElementById('port-gain-pct').textContent = Utils.formatPercent(gainPct);
    document.getElementById('port-gain-card').className = 'kpi-card ' + (gain >= 0 ? 'success' : 'danger');

    document.getElementById('port-cost').textContent = Utils.formatCurrency(totalCost);
    document.getElementById('port-count').textContent = investments.length;

    const accountKeys = [...new Set(investments.map(i => i.account || 'autre'))];
    document.getElementById('port-accounts-sub').textContent =
      accountKeys.map(k => Utils.INVESTMENT_ACCOUNTS[k] || k).join(' · ') || '—';
  },

  _renderTopPositions(investments) {
    const container = document.getElementById('port-top-positions');
    if (!container) return;
    if (!investments.length) { container.innerHTML = '<p class="text-muted small">Aucune position</p>'; return; }

    const sorted = [...investments]
      .map(i => ({ ...i, value: i.quantity * i.currentPrice, gain: i.quantity * (i.currentPrice - i.buyPrice) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    container.innerHTML = sorted.map((inv, idx) => {
      const gainCls = inv.gain >= 0 ? 'positive' : 'negative';
      const accountLabel = Utils.INVESTMENT_ACCOUNTS[inv.account || 'autre'] || 'Autre';
      return `<div class="port-position-row">
        <div class="port-position-rank">${idx + 1}</div>
        <div class="port-position-info">
          <div class="port-position-name">${inv.name}${inv.ticker ? `<span class="pos-ticker">${inv.ticker}</span>` : ''}</div>
          <div class="port-position-meta">
            <span class="badge badge-${inv.type}">${Utils.INVESTMENT_TYPES[inv.type] || inv.type}</span>
            <span class="badge badge-account">${accountLabel}</span>
          </div>
        </div>
        <div class="port-position-right">
          <div class="port-position-value">${Utils.formatCurrency(inv.value)}</div>
          <div class="port-position-gain ${gainCls}">${inv.gain >= 0 ? '+' : ''}${Utils.formatCurrency(inv.gain)}</div>
        </div>
      </div>`;
    }).join('');
  },

  _renderPerformers(investments) {
    const withPerf = investments
      .filter(i => i.buyPrice > 0)
      .map(i => ({
        name: i.name,
        gainPct: (i.currentPrice - i.buyPrice) / i.buyPrice * 100,
        gain: i.quantity * (i.currentPrice - i.buyPrice),
      }))
      .sort((a, b) => b.gainPct - a.gainPct);

    const renderList = (list, id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!list.length) { el.innerHTML = '<p class="text-muted small">Aucune donnée</p>'; return; }
      el.innerHTML = list.map(inv => {
        const cls = inv.gainPct >= 0 ? 'positive' : 'negative';
        const arrow = inv.gainPct >= 0 ? '▲' : '▼';
        return `<div class="port-performer-row">
          <div class="port-performer-name" title="${inv.name}">${inv.name}</div>
          <div class="port-performer-right">
            <div class="port-performer-pct ${cls}">${arrow} ${Math.abs(inv.gainPct).toFixed(1)}%</div>
            <div class="port-performer-val ${cls}">${inv.gain >= 0 ? '+' : ''}${Utils.formatCurrency(inv.gain)}</div>
          </div>
        </div>`;
      }).join('');
    };

    renderList(withPerf.slice(0, 3), 'port-top-performers');
    renderList([...withPerf].reverse().slice(0, 3), 'port-bottom-performers');
  },

  renderPositions() {
    this._renderAccountPills();
    const allInvestments = Storage.getInvestments();
    const search     = (document.getElementById('pos-search')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('pos-filter-type')?.value || '';

    let list = this._currentAccount
      ? allInvestments.filter(i => (i.account || 'autre') === this._currentAccount)
      : allInvestments;

    if (search)     list = list.filter(i => i.name.toLowerCase().includes(search) || (i.ticker || '').toLowerCase().includes(search));
    if (typeFilter) list = list.filter(i => i.type === typeFilter);
    list.sort((a, b) => (b.quantity * b.currentPrice) - (a.quantity * a.currentPrice));

    const tbody = document.getElementById('positions-tbody');
    const empty  = document.getElementById('positions-empty');
    if (!tbody) return;

    if (!list.length) { tbody.innerHTML = ''; empty?.classList.remove('hidden'); return; }
    empty?.classList.add('hidden');

    tbody.innerHTML = list.map(inv => {
      const value   = inv.quantity * inv.currentPrice;
      const cost    = inv.quantity * inv.buyPrice;
      const gain    = value - cost;
      const gainPct = cost > 0 ? (gain / cost * 100) : 0;
      const cls     = gain >= 0 ? 'positive' : 'negative';
      const barColor = gain >= 0 ? '#10b981' : '#ef4444';
      const barW    = Math.min(100, Math.abs(gainPct) / 100 * 100);
      const accountLabel = Utils.INVESTMENT_ACCOUNTS[inv.account || 'autre'] || 'Autre';
      return `<tr class="pos-row">
        <td>
          <strong>${inv.name}</strong>
          ${inv.ticker ? `<span class="pos-ticker">${inv.ticker}</span>` : ''}
        </td>
        <td><span class="badge badge-${inv.type}">${Utils.INVESTMENT_TYPES[inv.type] || inv.type}</span></td>
        <td><span class="badge badge-account">${accountLabel}</span></td>
        <td class="text-right"><strong>${Utils.formatCurrency(value)}</strong></td>
        <td class="text-right" style="color:var(--text-muted)">${Utils.formatCurrency(cost)}</td>
        <td class="text-right ${cls}">${gain >= 0 ? '+' : ''}${Utils.formatCurrency(gain)}</td>
        <td>
          <div class="pos-perf-cell">
            <div class="pos-perf-bar-wrap">
              <div class="pos-perf-bar" style="width:${barW}%;background:${barColor}"></div>
            </div>
            <span class="${cls}" style="font-size:12px;font-weight:600">${Utils.formatPercent(gainPct)}</span>
          </div>
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
