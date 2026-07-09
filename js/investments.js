const Investments = {
  _currentAccount: null, // compte actif de l'onglet compte courant, ex: 'pea'
  _evoWindow: 12,         // fenêtre (en mois) de la courbe d'évolution ; 0 = tout l'historique

  // ---------- Vue globale ----------

  renderPortfolio() {
    const investments = Storage.getInvestments();
    this._recordSnapshot(investments);
    this._renderGlobalKpis(investments);
    this._renderAllocation(investments);
    this._renderEvolution();
  },

  // Un point par jour (écrasé si on revisite le même jour) : construit progressivement
  // l'historique de valeur du portefeuille au fil des visites, sans jamais inventer de données
  // passées qu'on n'a pas.
  _recordSnapshot(investments) {
    const totalValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const history = Storage.getPortfolioHistory();
    const idx = history.findIndex(h => h.date === dateStr);
    if (idx >= 0) history[idx].value = totalValue;
    else history.push({ date: dateStr, value: totalValue });
    history.sort((a, b) => a.date.localeCompare(b.date));
    Storage.savePortfolioHistory(history);
  },

  _renderGlobalKpis(investments) {
    const totalValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const totalCost  = investments.reduce((s, i) => s + i.quantity * i.buyPrice, 0);
    const gain = totalValue - totalCost;
    const gainPct = totalCost > 0 ? (gain / totalCost * 100) : 0;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('inv-kpi-value', Utils.formatCurrency(totalValue));
    set('inv-kpi-gain', (gain >= 0 ? '+' : '') + Utils.formatCurrency(gain));
    set('inv-kpi-gain-pct', investments.length ? Utils.formatPercent(gainPct) : '—');

    const annualReturn = this._annualizedReturn(investments);
    set('inv-kpi-return', annualReturn === null ? '—' : Utils.formatPercent(annualReturn));

    const avgMonthly = this._avgMonthlyContribution(investments);
    set('inv-kpi-avg', avgMonthly === null ? '—' : Utils.formatCurrency(avgMonthly));

    const series = this._evolutionSeries(this._evoWindow);
    const trendEl = document.getElementById('inv-kpi-value-trend');
    if (trendEl) {
      if (series.length >= 2 && series[0].value > 0) {
        const pct = (series[series.length - 1].value - series[0].value) / series[0].value * 100;
        trendEl.textContent = `${Utils.formatPercent(pct)} sur ${this._windowLabel()}`;
        trendEl.className = 'kpi-sub ' + (pct >= 0 ? 'positive' : 'negative');
      } else {
        trendEl.textContent = '';
        trendEl.className = 'kpi-sub';
      }
    }
  },

  _renderAllocation(investments) {
    const totalValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const byAccount = {};
    investments.forEach(inv => {
      const acc = inv.account || 'autre';
      byAccount[acc] = (byAccount[acc] || 0) + inv.quantity * inv.currentPrice;
    });
    const entries = Object.entries(byAccount).map(([acc, value]) => ({
      label: Utils.INVESTMENT_ACCOUNTS[acc] || acc,
      value,
      color: Utils.ACCOUNT_COLORS[acc] || '#6b7280',
    }));
    Charts.investmentsByAccount(investments, () => [
      { text: 'Total', font: '600 11px -apple-system, sans-serif', color: '#9497b8' },
      { text: Utils.formatCurrency(totalValue), font: '800 14px -apple-system, sans-serif', color: '#ffffff' },
    ]);
    this._renderLegend('port-alloc-legend', entries);
  },

  // entries: [{label, value, color}] — légende verticale pastille/nom/montant/%, partagée par
  // la Vue globale (répartition par compte) et les onglets compte (répartition par position).
  _renderLegend(containerId, entries) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!entries.length) { container.innerHTML = '<p class="text-muted">Aucune donnée</p>'; return; }
    const total = entries.reduce((s, e) => s + e.value, 0);
    container.innerHTML = entries.map(e => {
      const pct = total > 0 ? (e.value / total * 100) : 0;
      return `<div class="port-legend-item">
        <span class="pl-dot" style="background:${e.color}"></span>
        <span class="pl-name">${e.label}</span>
        <span class="pl-amount">${Utils.formatCurrency(e.value)}</span>
        <span class="pl-pct">${pct.toFixed(0)}%</span>
      </div>`;
    }).join('');
  },

  setEvoWindow(months) {
    this._evoWindow = parseInt(months, 10) || 0;
    this._renderGlobalKpis(Storage.getInvestments());
    this._renderEvolution();
  },

  _windowLabel() {
    return this._evoWindow === 0 ? 'tout' : `${this._evoWindow} mois`;
  },

  _lastNMonths(n) {
    const months = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  },

  _monthRange(fromMonth, toMonth) {
    const months = [];
    let [y, m] = fromMonth.split('-').map(Number);
    const [ty, tm] = toMonth.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m++; if (m > 12) { m = 1; y++; }
    }
    return months;
  },

  // Une valeur par mois (dernier point connu au plus tard à la fin de ce mois) : jamais de mois
  // "vide" à 0 avant le tout premier point réellement enregistré.
  _evolutionSeries(windowMonths) {
    const history = Storage.getPortfolioHistory();
    if (!history.length) return [];
    const firstMonth = history[0].date.slice(0, 7);
    const currentMonth = Utils.getCurrentMonth();
    let months = windowMonths > 0 ? this._lastNMonths(windowMonths) : this._monthRange(firstMonth, currentMonth);
    months = months.filter(m => m >= firstMonth);
    return months.map(m => {
      const upTo = history.filter(h => h.date.slice(0, 7) <= m);
      if (!upTo.length) return null;
      return { month: m, label: Utils.getMonthLabel(m), value: upTo[upTo.length - 1].value };
    }).filter(Boolean);
  },

  _renderEvolution() {
    const series = this._evolutionSeries(this._evoWindow);
    Charts.portfolioEvolution(series);
    const trendEl = document.getElementById('inv-evo-trend');
    if (!trendEl) return;
    if (series.length < 2) { trendEl.textContent = ''; trendEl.className = 'inv-evo-trend'; return; }
    const delta = series[series.length - 1].value - series[0].value;
    const arrow = delta >= 0 ? '↑' : '↓';
    trendEl.textContent = `${arrow} ${delta >= 0 ? '+' : '-'}${Utils.formatCurrency(Math.abs(delta))} sur ${this._windowLabel()}`;
    trendEl.className = 'inv-evo-trend ' + (delta >= 0 ? 'positive' : 'negative');
  },

  // ---------- Rendement / versements (dérivés des positions, pas de l'historique) ----------

  // Rendement annualisé pondéré — estimation simple (PAS un XIRR), affichée en "estimé" dans
  // l'UI. Ignore les positions sans date d'achat (durée de détention inconnue) ; plancher de
  // 30 jours pour éviter qu'un achat très récent explose le résultat une fois annualisé.
  _annualizedReturn(investments) {
    const now = new Date();
    let costSum = 0, weightedSum = 0;
    investments.forEach(inv => {
      if (!inv.buyDate || !inv.buyPrice) return;
      const cost = inv.quantity * inv.buyPrice;
      if (cost <= 0) return;
      const days = Math.max((now - new Date(inv.buyDate + 'T00:00:00')) / 86400000, 30);
      const gainPct = (inv.currentPrice - inv.buyPrice) / inv.buyPrice;
      costSum += cost;
      weightedSum += cost * gainPct * (365 / days);
    });
    return costSum > 0 ? (weightedSum / costSum * 100) : null;
  },

  // Total investi / mois écoulés depuis le plus ancien achat daté — proxy simple, pas un calcul
  // de flux de versements récurrents.
  _avgMonthlyContribution(investments) {
    const withDate = investments.filter(i => i.buyDate);
    if (!withDate.length) return null;
    const totalCost = withDate.reduce((s, i) => s + i.quantity * i.buyPrice, 0);
    const earliest = withDate.reduce((min, i) => (i.buyDate < min ? i.buyDate : min), withDate[0].buyDate);
    const months = Math.max((new Date() - new Date(earliest + 'T00:00:00')) / (86400000 * 30.44), 1);
    return totalCost / months;
  },

  // ---------- Onglet par compte ----------

  renderAccountTab(account) {
    if (account) this._currentAccount = account;
    const acc = this._currentAccount;
    if (!acc) return;
    const all = Storage.getInvestments();
    const accInvestments = all.filter(i => (i.account || 'autre') === acc);
    const totalValue = all.reduce((s, i) => s + i.quantity * i.currentPrice, 0);

    this._renderAccountHeader(acc);
    this._renderAccountKpis(accInvestments, totalValue);
    this._renderAccountAllocation(accInvestments);
    this._renderAccountTable(accInvestments);
  },

  _isAssuranceVie(acc) { return acc === 'assurance_vie'; },

  _renderAccountHeader(acc) {
    const label = Utils.INVESTMENT_ACCOUNTS[acc] || acc;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('inv-acc-title', label);
    set('inv-acc-kpi-value-label', this._isAssuranceVie(acc) ? 'Valeur du contrat' : 'Valeur du compte');
    set('inv-acc-alloc-title', this._isAssuranceVie(acc) ? 'Répartition du contrat' : 'Répartition');
    set('inv-acc-pos-title', this._isAssuranceVie(acc) ? 'Supports détenus' : 'Positions détenues');
    set('inv-acc-th-asset', this._isAssuranceVie(acc) ? 'Support' : 'Actif');
  },

  _renderAccountKpis(investments, totalPortfolioValue) {
    const value = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const cost  = investments.reduce((s, i) => s + i.quantity * i.buyPrice, 0);
    const gain  = value - cost;
    const gainPct = cost > 0 ? (gain / cost * 100) : 0;
    const pctOfPortfolio = totalPortfolioValue > 0 ? (value / totalPortfolioValue * 100) : 0;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('inv-acc-kpi-value', Utils.formatCurrency(value));
    set('inv-acc-kpi-value-sub', investments.length ? `${pctOfPortfolio.toFixed(0)}% du portefeuille` : '');
    set('inv-acc-kpi-gain', (gain >= 0 ? '+' : '') + Utils.formatCurrency(gain));
    set('inv-acc-kpi-gain-pct', investments.length ? Utils.formatPercent(gainPct) : '—');
    const annualReturn = this._annualizedReturn(investments);
    set('inv-acc-kpi-return', annualReturn === null ? '—' : Utils.formatPercent(annualReturn));
    set('inv-acc-kpi-cost', Utils.formatCurrency(cost));
  },

  _renderAccountAllocation(investments) {
    Charts.accountAllocation(investments);
    const entries = investments.map((inv, i) => ({
      label: inv.name,
      value: inv.quantity * inv.currentPrice,
      color: Utils.POSITION_COLORS[i % Utils.POSITION_COLORS.length],
    }));
    this._renderLegend('port-acc-alloc-legend', entries);
  },

  _renderAccountTable(investments) {
    const tbody  = document.getElementById('positions-tbody');
    const empty  = document.getElementById('positions-empty');
    const search = (document.getElementById('pos-search')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('pos-filter-type')?.value || '';

    let list = investments;
    if (search)     list = list.filter(i => i.name.toLowerCase().includes(search) || (i.ticker || '').toLowerCase().includes(search));
    if (typeFilter) list = list.filter(i => i.type === typeFilter);

    if (!list.length) { if (tbody) tbody.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');

    const totalValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);

    tbody.innerHTML = list.map(inv => {
      const value   = inv.quantity * inv.currentPrice;
      const cost    = inv.quantity * inv.buyPrice;
      const gain    = value - cost;
      const gainPct = cost > 0 ? (gain / cost * 100) : 0;
      const pct     = totalValue > 0 ? (value / totalValue * 100) : 0;
      const cls     = gain >= 0 ? 'positive' : 'negative';
      const barW    = Math.min(Math.abs(gainPct) / 30 * 100, 100);
      const barCol  = gain >= 0 ? '#10b981' : '#ef4444';
      return `<tr>
        <td><strong>${inv.name}</strong>${inv.ticker ? `<br><small class="text-muted">${inv.ticker}</small>` : ''}</td>
        <td><span class="badge badge-${inv.type}">${Utils.INVESTMENT_TYPES[inv.type] || inv.type}</span></td>
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
          <button class="btn-icon btn-danger" onclick="Investments.delete('${inv.id}')" title="Supprimer">${Utils.ICON_TRASH}</button>
        </td>
      </tr>`;
    }).join('');
  },

  // ---------- CRUD ----------

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
    this._refreshCurrentView();
  },

  delete(id) {
    if (!confirm('Supprimer cet investissement ?')) return;
    Storage.saveInvestments(Storage.getInvestments().filter(i => i.id !== id));
    this._refreshCurrentView();
  },

  // Reflète l'ajout/modification/suppression sur la vue actuellement affichée (Vue globale ou
  // un onglet compte), et rafraîchit les onglets du haut (un compte peut apparaître/disparaître
  // selon qu'il a encore des positions) + le Dashboard (valorisation du portefeuille).
  _refreshCurrentView() {
    const portfolioVisible = !document.getElementById('section-portfolio')?.classList.contains('hidden');
    if (portfolioVisible) this.renderPortfolio();
    else if (this._currentAccount) this.renderAccountTab();
    renderModeTabs(currentMode, portfolioVisible ? 'portfolio' : `account-${this._currentAccount}`);
    Dashboard.render();
  },
};
