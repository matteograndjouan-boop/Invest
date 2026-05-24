const Budget = {
  render() {
    const budgets = Storage.getBudgets();
    const expenses = Storage.getExpenses();
    const month = Utils.getCurrentMonth();
    const monthExp = expenses.filter(e => Utils.getExpenseMonth(e) === month);

    const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
    const totalSpent = monthExp.reduce((s, e) => s + e.amount, 0);
    const remaining = totalBudget - totalSpent;

    document.getElementById('budget-total').textContent = Utils.formatCurrency(totalBudget);
    document.getElementById('budget-spent').textContent = Utils.formatCurrency(totalSpent);
    const leftEl = document.getElementById('budget-left');
    leftEl.textContent = Utils.formatCurrency(remaining);
    document.getElementById('budget-left-card').className = 'kpi-card ' + (remaining >= 0 ? 'success' : 'danger');

    const categories = Object.keys(budgets);
    const grid = document.getElementById('budget-grid');
    const empty = document.getElementById('budget-empty');

    if (!categories.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    grid.innerHTML = categories.map(cat => {
      const budget = budgets[cat];
      const spent = monthExp.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
      const over = spent > budget;
      const rem = budget - spent;
      const barClass = over ? 'over' : pct > 80 ? 'warning' : '';
      return `
        <div class="budget-card ${over ? 'over-budget' : ''}">
          <div class="budget-card-header">
            <span class="budget-cat">${cat}</span>
            <div>
              <button class="btn-icon" onclick="Budget.edit('${cat}')" title="Modifier">✏️</button>
              <button class="btn-icon btn-danger" onclick="Budget.delete('${cat}')" title="Supprimer">🗑️</button>
            </div>
          </div>
          <div class="budget-amounts">
            <span class="${over ? 'negative' : ''}">${Utils.formatCurrency(spent)}</span>
            <span class="text-muted">/ ${Utils.formatCurrency(budget)}</span>
          </div>
          <div class="budget-progress">
            <div class="progress-bar"><div class="progress-fill ${barClass}" style="width:${pct}%"></div></div>
            <span class="budget-pct">${pct.toFixed(0)}%</span>
          </div>
          <div class="budget-remaining ${over ? 'negative' : 'positive'}">
            ${over ? `Dépassement: ${Utils.formatCurrency(Math.abs(rem))}` : `Restant: ${Utils.formatCurrency(rem)}`}
          </div>
        </div>`;
    }).join('');
  },

  openAddForm() { Modal.open('Définir un budget', this._form(null, null)); },

  edit(category) {
    Modal.open('Modifier le budget', this._form(category, Storage.getBudgets()[category]));
  },

  _form(category, amount) {
    const isEdit = !!category;
    const used = Object.keys(Storage.getBudgets());
    const available = isEdit
      ? Utils.EXPENSE_CATEGORIES
      : Utils.EXPENSE_CATEGORIES.filter(c => !used.includes(c));

    const catField = isEdit
      ? `<input value="${category}" disabled>`
      : `<select name="category" required><option value="">Choisir...</option>${available.map(c => `<option value="${c}">${c}</option>`).join('')}</select>`;

    return `
      <form onsubmit="Budget.save(event, ${isEdit ? `'${category}'` : 'null'})">
        <div class="form-grid">
          <div class="form-group"><label>Catégorie *</label>${catField}</div>
          <div class="form-group"><label>Budget mensuel (€) *</label><input name="amount" type="number" step="0.01" min="0" required value="${amount || ''}"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Modifier' : 'Ajouter'}</button>
        </div>
      </form>`;
  },

  save(event, existingCat) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const category = existingCat || fd.get('category');
    const amount = parseFloat(fd.get('amount'));
    const budgets = Storage.getBudgets();
    budgets[category] = amount;
    Storage.saveBudgets(budgets);
    Modal.close();
    this.render();
    Dashboard.render();
    Expenses.render();
  },

  delete(category) {
    if (!confirm(`Supprimer le budget "${category}" ?`)) return;
    const budgets = Storage.getBudgets();
    delete budgets[category];
    Storage.saveBudgets(budgets);
    this.render();
    Dashboard.render();
  },
};
