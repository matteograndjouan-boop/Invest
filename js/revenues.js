const Revenues = {
  currentMonth: Utils.getCurrentMonth(),

  init() {
    const filter = document.getElementById('revenues-month-filter');
    if (filter) {
      filter.value = this.currentMonth;
      filter.addEventListener('change', (e) => { this.currentMonth = e.target.value; this.render(); });
    }
  },

  render() {
    const revenues = Storage.getRevenues();
    this._renderSummary(revenues);
    this._renderTable(revenues);
    Charts.revenuesByCategory(revenues, this.currentMonth);
    Charts.revenuesMonthly(revenues);
  },

  _renderSummary(revenues) {
    const monthRev = revenues.filter(r => r.date.substring(0, 7) === this.currentMonth);
    const total = monthRev.reduce((s, r) => s + r.amount, 0);
    const expenses = Storage.getExpenses();
    const monthExp = expenses.filter(e => Utils.getExpenseMonth(e) === this.currentMonth);
    const totalExp = monthExp.reduce((s, e) => s + e.amount, 0);
    const balance = total - totalExp;

    document.getElementById('rev-total-month').textContent = Utils.formatCurrency(total);
    document.getElementById('rev-total-expenses').textContent = Utils.formatCurrency(totalExp);
    const balEl = document.getElementById('rev-balance');
    balEl.textContent = Utils.formatCurrency(balance);
    balEl.className = 'kpi-value ' + (balance >= 0 ? 'positive' : 'negative');
    document.getElementById('rev-balance-card').className = 'kpi-card ' + (balance >= 0 ? 'success' : 'danger');
  },

  _renderTable(revenues) {
    const tbody = document.getElementById('revenues-tbody');
    const empty = document.getElementById('revenues-empty');
    const search = (document.getElementById('rev-search')?.value || '').toLowerCase();
    const catFilter = document.getElementById('rev-filter-cat')?.value || '';

    let list = revenues.filter(r => r.date.substring(0, 7) === this.currentMonth);
    if (search) list = list.filter(r => r.description.toLowerCase().includes(search));
    if (catFilter) list = list.filter(r => r.category === catFilter);
    list.sort((a, b) => b.date.localeCompare(a.date));

    if (!list.length) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    tbody.innerHTML = list.map(rev => `<tr>
      <td>${Utils.formatDate(rev.date)}</td>
      <td>${rev.description}</td>
      <td><span class="badge badge-revenue">${rev.category}</span></td>
      <td><strong class="positive">${Utils.formatCurrency(rev.amount)}</strong></td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="Revenues.edit('${rev.id}')" title="Modifier">✏️</button>
        <button class="btn-icon btn-danger" onclick="Revenues.delete('${rev.id}')" title="Supprimer">🗑️</button>
      </td>
    </tr>`).join('');
  },

  openAddForm() { Modal.open('Ajouter un revenu', this._form(null)); },

  edit(id) {
    const rev = Storage.getRevenues().find(r => r.id === id);
    if (rev) Modal.open('Modifier le revenu', this._form(rev));
  },

  _form(rev) {
    const isEdit = !!rev;
    const today = new Date().toISOString().split('T')[0];
    const catOptions = Utils.REVENUE_CATEGORIES
      .map(c => `<option value="${c}" ${rev?.category === c ? 'selected' : ''}>${c}</option>`).join('');
    return `
      <form onsubmit="Revenues.save(event, ${isEdit ? `'${rev.id}'` : 'null'})">
        <div class="form-grid">
          <div class="form-group form-full"><label>Description *</label><input name="description" required value="${rev?.description || ''}" placeholder="ex: Salaire mars"></div>
          <div class="form-group"><label>Montant (€) *</label><input name="amount" type="number" step="0.01" min="0" required value="${rev?.amount || ''}"></div>
          <div class="form-group"><label>Catégorie *</label><select name="category" required>${catOptions}</select></div>
          <div class="form-group"><label>Date *</label><input name="date" type="date" required value="${rev?.date || today}"></div>
          <div class="form-group form-full"><label>Notes</label><textarea name="notes" rows="2">${rev?.notes || ''}</textarea></div>
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
      description: fd.get('description').trim(),
      amount: parseFloat(fd.get('amount')),
      category: fd.get('category'),
      date: fd.get('date'),
      notes: (fd.get('notes') || '').trim(),
    };
    const list = Storage.getRevenues();
    if (id) { const idx = list.findIndex(r => r.id === id); if (idx !== -1) list[idx] = data; }
    else list.push(data);
    Storage.saveRevenues(list);
    Modal.close();
    this.render();
    Dashboard.render();
  },

  delete(id) {
    if (!confirm('Supprimer ce revenu ?')) return;
    Storage.saveRevenues(Storage.getRevenues().filter(r => r.id !== id));
    this.render();
    Dashboard.render();
  },
};
