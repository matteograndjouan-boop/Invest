const Expenses = {
  currentMonth: Utils.getCurrentMonth(),

  init() {
    const filter = document.getElementById('expenses-month-filter');
    if (filter && !filter._initialized) {
      filter._initialized = true;
      filter.value = this.currentMonth;
      filter.addEventListener('change', (e) => { this.currentMonth = e.target.value; this.render(); });
    }
    this._populateCatFilter();
  },

  _populateCatFilter() {
    const currentVal = document.getElementById('exp-filter-cat')?.value || '';
    const cats = Storage.getCategories().filter(c => Categories._catType(c) === 'expense');
    const optsHtml = ['<option value="">Toutes catégories</option>']
      .concat(cats.map(c => `<option value="${c.name}"${c.name === currentVal ? ' selected' : ''}>${c.name}</option>`))
      .join('');
    Dropdown.mount('exp-filter-cat-slot', 'exp-filter-cat', optsHtml, { className: 'dt-select' });
  },

  render() {
    // Épargne/Revenus ne comptent jamais comme des dépenses (Utils.isExpenseCategory), même
    // si un enregistrement existe techniquement dans invest_expenses.
    const expenses = Storage.getExpenses().filter(e => Utils.isExpenseCategory(e.category));
    this._populateCatFilter();
    this._renderSummary(expenses);
    this._renderTable(expenses);
    Charts.expensesByCategory(expenses, this.currentMonth);
    Charts.expensesMonthly(expenses);
  },

  _renderSummary(expenses) {
    const monthExp = expenses.filter(e => Utils.getExpenseMonth(e) === this.currentMonth);
    const total = monthExp.reduce((s, e) => s + e.amount, 0);
    const totalBudget = Object.values(Storage.getBudgets()).reduce((s, v) => s + v, 0);
    const remaining = totalBudget - total;

    document.getElementById('exp-total-month').textContent = Utils.formatCurrency(total);
    document.getElementById('exp-total-budget').textContent = Utils.formatCurrency(totalBudget);
    const remEl = document.getElementById('exp-remaining');
    remEl.textContent = Utils.formatCurrency(remaining);
    remEl.className = 'kpi-value ' + (remaining >= 0 ? 'positive' : 'negative');
    document.getElementById('exp-remaining-card').className = 'kpi-card ' + (remaining >= 0 ? 'success' : 'danger');
  },

  _renderTable(expenses) {
    const tbody = document.getElementById('expenses-tbody');
    const empty = document.getElementById('expenses-empty');
    const search = (document.getElementById('exp-search')?.value || '').toLowerCase();
    const catFilter = document.getElementById('exp-filter-cat')?.value || '';

    let list = expenses.filter(e => Utils.getExpenseMonth(e) === this.currentMonth);
    if (search) list = list.filter(e => e.description.toLowerCase().includes(search));
    if (catFilter) list = list.filter(e => e.category === catFilter);
    list.sort((a, b) => b.date.localeCompare(a.date));

    if (!list.length) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    tbody.innerHTML = list.map(exp => `<tr>
      <td>${Utils.formatDate(exp.date)}</td>
      <td>${exp.description}</td>
      <td>
        <span class="badge badge-category">${exp.category}</span>
        ${exp.subcategory ? `<span class="badge badge-subcategory">${exp.subcategory}</span>` : ''}
      </td>
      <td><strong>${Utils.formatCurrency(exp.amount)}</strong></td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="Expenses.edit('${exp.id}')" title="Modifier">✏️</button>
        <button class="btn-icon btn-danger" onclick="Expenses.delete('${exp.id}')" title="Supprimer">${Utils.ICON_TRASH}</button>
      </td>
    </tr>`).join('');
  },

  openAddForm() { Modal.open('Ajouter une dépense', this._form(null)); },

  edit(id) {
    const exp = Storage.getExpenses().find(e => e.id === id);
    if (exp) Modal.open('Modifier la dépense', this._form(exp));
  },

  _form(exp) {
    const isEdit = !!exp;
    const today = new Date().toISOString().split('T')[0];
    // Catégories de dépense uniquement (Épargne/Revenus exclues) ; on garde la catégorie
    // actuelle si on édite une dépense existante qui en sortirait sinon silencieusement —
    // piège connu du <select> sans option "selected".
    const cats = Storage.getCategories().filter(c => Categories._catType(c) === 'expense');
    if (exp?.category && !cats.some(c => c.name === exp.category)) {
      const cur = Storage.getCategories().find(c => c.name === exp.category);
      if (cur) cats.push(cur);
    }
    const selectedCatName = exp?.category || (cats[0]?.name || '');
    const selectedCat = cats.find(c => c.name === selectedCatName) || cats[0];

    const catOptions = cats
      .map(c => `<option value="${c.name}" ${c.name === selectedCatName ? 'selected' : ''}>${c.name}</option>`).join('');

    const subcats = selectedCat?.subcategories || [];
    const subcatOptions = subcats.length
      ? ['', ...subcats].map(s => `<option value="${s}" ${(exp?.subcategory || '') === s ? 'selected' : ''}>${s || '—'}</option>`).join('')
      : '<option value="">—</option>';

    return `
      <form onsubmit="Expenses.save(event, ${isEdit ? `'${exp.id}'` : 'null'})">
        <div class="form-grid">
          <div class="form-group form-full"><label>Description *</label><input name="description" required value="${exp?.description || ''}" placeholder="ex: Courses Carrefour"></div>
          <div class="form-group"><label>Montant (€) *</label><input name="amount" type="number" step="0.01" min="0" required value="${exp?.amount || ''}"></div>
          <div class="form-group">
            <label>Catégorie *</label>
            ${Dropdown.render('category', catOptions, { required: true, onchange: 'Expenses._updateSubcats(this.value)' })}
          </div>
          <div class="form-group">
            <label>Sous-catégorie</label>
            ${Dropdown.render('subcategory', subcatOptions, { id: 'exp-subcat-select', disabled: !subcats.length })}
          </div>
          <div class="form-group"><label>Date de transaction *</label><input name="date" type="date" required value="${exp?.date || today}"></div>
          <div class="form-group">
            <label>Mois effectif <span style="font-weight:400;color:var(--text-muted)">(optionnel)</span></label>
            ${Utils.monthYearPicker(exp?.effectiveDate || '')}
          </div>
          <div class="form-group form-full"><label>Notes</label><textarea name="notes" rows="2">${exp?.notes || ''}</textarea></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Modifier' : 'Ajouter'}</button>
        </div>
      </form>`;
  },

  _updateSubcats(catName) {
    if (!document.getElementById('exp-subcat-select')) return;
    const subcats = Categories.getSubcats(catName);
    const optsHtml = subcats.length
      ? ['', ...subcats].map(s => `<option value="${s}">${s || '—'}</option>`).join('')
      : '<option value="">—</option>';
    Dropdown.setOptions('exp-subcat-select', optsHtml);
    Dropdown.setDisabled('exp-subcat-select', !subcats.length);
  },

  save(event, id) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const effectiveDate = Utils.getEffectiveDateFromForm(fd);
    const data = {
      id: id || Utils.generateId(),
      description: fd.get('description').trim(),
      amount: parseFloat(fd.get('amount')),
      category: fd.get('category'),
      subcategory: fd.get('subcategory') || '',
      date: fd.get('date'),
      ...(effectiveDate && { effectiveDate }),
      notes: (fd.get('notes') || '').trim(),
    };
    const list = Storage.getExpenses();
    if (id) { const idx = list.findIndex(e => e.id === id); if (idx !== -1) list[idx] = data; }
    else list.push(data);
    Storage.saveExpenses(list);
    Modal.close();
    this.render();
    Dashboard.render();
    Budget.render();
  },

  delete(id) {
    if (!confirm('Supprimer cette dépense ?')) return;
    Storage.saveExpenses(Storage.getExpenses().filter(e => e.id !== id));
    this.render();
    Dashboard.render();
    Budget.render();
  },
};
