const Investments = {
  render() {
    const investments = Storage.getInvestments();
    this._renderSummary(investments);
    this._renderTable(investments);
    Charts.investmentsByType(investments);
    Charts.investmentsPerformance(investments);
  },

  _renderSummary(investments) {
    const totalValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const totalCost = investments.reduce((s, i) => s + i.quantity * i.buyPrice, 0);
    const gain = totalValue - totalCost;
    const gainPct = totalCost > 0 ? (gain / totalCost * 100) : 0;

    document.getElementById('inv-total-value').textContent = Utils.formatCurrency(totalValue);
    document.getElementById('inv-total-cost').textContent = Utils.formatCurrency(totalCost);

    const gainEl = document.getElementById('inv-total-gain');
    gainEl.textContent = Utils.formatCurrency(gain);
    gainEl.className = 'kpi-value ' + (gain >= 0 ? 'positive' : 'negative');
    document.getElementById('inv-total-gain-pct').textContent = Utils.formatPercent(gainPct);
    document.getElementById('inv-gain-card').className = 'kpi-card ' + (gain >= 0 ? 'success' : 'danger');
  },

  _renderTable(investments) {
    const tbody = document.getElementById('investments-tbody');
    const empty = document.getElementById('investments-empty');
    const search = (document.getElementById('inv-search')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('inv-filter-type')?.value || '';

    let list = investments;
    if (search) list = list.filter(i => i.name.toLowerCase().includes(search) || (i.ticker || '').toLowerCase().includes(search));
    if (typeFilter) list = list.filter(i => i.type === typeFilter);

    if (!list.length) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    tbody.innerHTML = list.map(inv => {
      const value = inv.quantity * inv.currentPrice;
      const cost = inv.quantity * inv.buyPrice;
      const gain = value - cost;
      const gainPct = cost > 0 ? (gain / cost * 100) : 0;
      const cls = gain >= 0 ? 'positive' : 'negative';
      return `<tr>
        <td><strong>${inv.name}</strong>${inv.ticker ? `<br><small class="text-muted">${inv.ticker}</small>` : ''}</td>
        <td><span class="badge badge-${inv.type}">${Utils.INVESTMENT_TYPES[inv.type] || inv.type}</span></td>
        <td>${inv.quantity}</td>
        <td>${Utils.formatCurrency(inv.buyPrice)}</td>
        <td>${Utils.formatCurrency(inv.currentPrice)}</td>
        <td><strong>${Utils.formatCurrency(value)}</strong></td>
        <td class="${cls}">${Utils.formatCurrency(gain)}</td>
        <td class="${cls}">${Utils.formatPercent(gainPct)}</td>
        <td class="actions-cell">
          <button class="btn-icon" onclick="Investments.edit('${inv.id}')" title="Modifier">✏️</button>
          <button class="btn-icon btn-danger" onclick="Investments.delete('${inv.id}')" title="Supprimer">🗑️</button>
        </td>
      </tr>`;
    }).join('');
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
    return `
      <form onsubmit="Investments.save(event, ${isEdit ? `'${inv.id}'` : 'null'})">
        <div class="form-grid">
          <div class="form-group"><label>Nom *</label><input name="name" required value="${inv?.name || ''}" placeholder="ex: Apple Inc."></div>
          <div class="form-group"><label>Ticker</label><input name="ticker" value="${inv?.ticker || ''}" placeholder="ex: AAPL"></div>
          <div class="form-group"><label>Type *</label><select name="type" required>${typeOptions}</select></div>
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
    this.render();
    Dashboard.render();
  },

  delete(id) {
    if (!confirm('Supprimer cet investissement ?')) return;
    Storage.saveInvestments(Storage.getInvestments().filter(i => i.id !== id));
    this.render();
    Dashboard.render();
  },
};
