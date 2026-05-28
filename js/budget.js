const Budget = {
  _currentThemeId: null,
  _THEME_COLORS: ['#6366f1','#10b981','#f59e0b','#ec4899','#3b82f6','#8b5cf6','#ef4444','#14b8a6'],

  init() {
    PeriodFilter.onChange(() => {
      if (document.getElementById('section-budget') && !document.getElementById('section-budget').classList.contains('hidden')) this.render();
    });
  },

  render() {
    if (this._currentThemeId) {
      this._renderDetail(this._currentThemeId);
    } else {
      this._renderList();
    }
  },

  _renderList() {
    this._currentThemeId = null;
    document.getElementById('budget-list-view').classList.remove('hidden');
    document.getElementById('budget-detail-view').classList.add('hidden');
    document.getElementById('budget-section-title').textContent = 'Budgets';
    document.getElementById('add-budget-btn').textContent = '+ Nouveau budget';

    const themes = Storage.getBudgetThemes();
    const { start, end } = PeriodFilter.getDateRange();
    const expenses = Storage.getExpenses().filter(e => e.date >= start && e.date <= end);
    const empty = document.getElementById('budget-empty');
    const grid = document.getElementById('budget-themes-grid');

    if (!themes.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    grid.innerHTML = themes.map(theme => {
      const spent = this._computeSpent(theme, expenses);
      const planned = theme.items.reduce((s, i) => s + (i.planned || 0), 0);
      const pct = planned > 0 ? Math.min(100, spent / planned * 100) : 0;
      const statusColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
      const remaining = planned - spent;

      const prevSpent = this._getPrevSpent(theme);
      const trendHtml = prevSpent > 0 ? (spent > prevSpent
        ? `<span class="trend-arrow negative">↑ ${Utils.formatCurrency(spent - prevSpent)}</span>`
        : `<span class="trend-arrow positive">↓ ${Utils.formatCurrency(prevSpent - spent)}</span>`)
        : '';

      return `
        <div class="budget-theme-card" onclick="Budget.showDetail('${theme.id}')">
          <div class="budget-card-accent" style="background:${theme.color || '#6366f1'}"></div>
          <div class="budget-card-body">
            <div class="budget-card-top">
              <span class="budget-card-name">${theme.name}</span>
              ${trendHtml}
            </div>
            <div class="budget-progress-wrap">
              <div class="budget-progress-bar" style="width:${pct.toFixed(1)}%;background:${statusColor}"></div>
            </div>
            <div class="budget-card-bottom">
              <span style="font-size:0.8125rem;color:var(--text-muted)">${PeriodFilter.getLabel()}</span>
              <span style="font-size:0.875rem;font-weight:600;color:${remaining >= 0 ? 'var(--success)' : 'var(--danger)'}">${Utils.formatCurrency(spent)} / ${Utils.formatCurrency(planned)}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  },

  _computeSpent(theme, expenses) {
    return expenses.filter(e =>
      theme.items.some(item =>
        item.category === e.category &&
        (!item.subcategory || item.subcategory === e.subcategory)
      )
    ).reduce((s, e) => s + e.amount, 0);
  },

  _getPrevSpent(theme) {
    const s = PeriodFilter.get();
    let start, end;
    if (s.type === 'month') {
      const [y, m] = s.month.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      start = `${pm}-01`;
      end = `${pm}-${String(last).padStart(2, '0')}`;
    } else {
      return 0;
    }
    const prevExpenses = Storage.getExpenses().filter(e => e.date >= start && e.date <= end);
    return this._computeSpent(theme, prevExpenses);
  },

  showDetail(id) {
    this._currentThemeId = id;
    this._renderDetail(id);
  },

  showList() {
    this._currentThemeId = null;
    this._renderList();
  },

  _renderDetail(id) {
    const theme = Storage.getBudgetThemes().find(t => t.id === id);
    if (!theme) { this.showList(); return; }

    document.getElementById('budget-list-view').classList.add('hidden');
    document.getElementById('budget-detail-view').classList.remove('hidden');
    document.getElementById('budget-section-title').textContent = theme.name;
    document.getElementById('add-budget-btn').textContent = '+ Ligne';

    const { start, end } = PeriodFilter.getDateRange();
    const allExpenses = Storage.getExpenses();
    const periodExpenses = allExpenses.filter(e => e.date >= start && e.date <= end);

    const totalSpent = this._computeSpent(theme, periodExpenses);
    const totalPlanned = theme.items.reduce((s, i) => s + (i.planned || 0), 0);
    const remaining = totalPlanned - totalSpent;

    document.getElementById('budget-detail-planned').textContent = Utils.formatCurrency(totalPlanned);
    document.getElementById('budget-detail-spent').textContent = Utils.formatCurrency(totalSpent);
    const remEl = document.getElementById('budget-detail-remaining');
    remEl.textContent = Utils.formatCurrency(Math.abs(remaining));
    remEl.className = 'kpi-value ' + (remaining >= 0 ? 'positive' : 'negative');
    document.getElementById('budget-detail-remaining-card').className = 'kpi-card ' + (remaining >= 0 ? 'success' : 'danger');

    // Smart message
    const daysInPeriod = Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1;
    const daysPassed = Math.min(daysInPeriod, Math.ceil((new Date() - new Date(start)) / 86400000) + 1);
    const daysLeft = Math.max(0, daysInPeriod - daysPassed);
    let msg = `Tu as dépensé <strong>${Utils.formatCurrency(totalSpent)}</strong> sur <strong>${Utils.formatCurrency(totalPlanned)}</strong> prévu.`;
    if (remaining >= 0) msg += ` Il te reste <strong>${Utils.formatCurrency(remaining)}</strong>` + (daysLeft > 0 ? ` pour ${daysLeft} jour(s).` : '.');
    else msg += ` Dépassement de <strong class="negative">${Utils.formatCurrency(-remaining)}</strong>.`;
    document.getElementById('budget-detail-message').innerHTML = msg;

    // Detail table
    const tbody = document.getElementById('budget-detail-tbody');
    tbody.innerHTML = theme.items.map((item, idx) => {
      const real = periodExpenses.filter(e => e.category === item.category && (!item.subcategory || item.subcategory === e.subcategory)).reduce((s, e) => s + e.amount, 0);
      const ecart = item.planned - real;
      return `<tr>
        <td>${item.category}</td>
        <td>${item.subcategory || '—'}</td>
        <td><input type="number" value="${item.planned}" min="0" step="1" class="budget-inline-input" onchange="Budget.updatePlanned('${theme.id}', ${idx}, this.value)"></td>
        <td>${Utils.formatCurrency(real)}</td>
        <td class="${ecart >= 0 ? 'positive' : 'negative'}">${ecart >= 0 ? '+' : ''}${Utils.formatCurrency(ecart)}</td>
        <td class="actions-cell"><button class="btn-icon btn-danger" onclick="Budget.deleteItem('${theme.id}', ${idx})">🗑️</button></td>
      </tr>`;
    }).join('');

    // History chart: last 6 periods (months)
    const now = new Date();
    const histLabels = [], histData = [];
    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
      const mExp = allExpenses.filter(e => e.date >= `${m}-01` && e.date <= `${m}-${String(last).padStart(2,'0')}`);
      histLabels.push(MONTHS_FR[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));
      histData.push(this._computeSpent(theme, mExp));
    }
    Charts.budgetHistory(histLabels, histData, theme.color || '#6366f1');
  },

  updatePlanned(themeId, idx, value) {
    const themes = Storage.getBudgetThemes();
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    theme.items[idx].planned = parseFloat(value) || 0;
    Storage.saveBudgetThemes(themes);
  },

  deleteItem(themeId, idx) {
    if (!confirm('Supprimer cette ligne ?')) return;
    const themes = Storage.getBudgetThemes();
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    theme.items.splice(idx, 1);
    Storage.saveBudgetThemes(themes);
    this._renderDetail(themeId);
  },

  openAddForm() {
    if (this._currentThemeId) {
      Modal.open('Ajouter une ligne budgétaire', this._itemForm(null, this._currentThemeId));
    } else {
      Modal.open('Nouveau budget thématique', this._themeForm());
    }
  },

  _themeForm() {
    const colorOptions = this._THEME_COLORS.map((c, i) =>
      `<label class="color-opt"><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}><span style="background:${c}" class="color-swatch"></span></label>`
    ).join('');
    return `
      <form onsubmit="Budget.saveTheme(event)">
        <div class="form-grid">
          <div class="form-group form-full">
            <label>Nom du budget *</label>
            <input name="name" required placeholder="ex: Alimentation">
          </div>
          <div class="form-group form-full">
            <label>Couleur</label>
            <div class="color-picker-row">${colorOptions}</div>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Créer</button>
        </div>
      </form>`;
  },

  _itemForm(item, themeId) {
    const cats = Storage.getCategories();
    const catOptions = cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    return `
      <form onsubmit="Budget.saveItem(event, '${themeId}', ${item ? item._idx : 'null'})">
        <div class="form-grid">
          <div class="form-group">
            <label>Catégorie *</label>
            <select name="category" required onchange="Budget._updateItemSubcats(this.value)">${catOptions}</select>
          </div>
          <div class="form-group">
            <label>Sous-catégorie</label>
            <select name="subcategory" id="budget-item-subcat" disabled><option value="">—</option></select>
          </div>
          <div class="form-group form-full">
            <label>Montant prévu (€) *</label>
            <input name="planned" type="number" step="1" min="0" required placeholder="ex: 300">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Ajouter</button>
        </div>
      </form>`;
  },

  _updateItemSubcats(catName) {
    const sel = document.getElementById('budget-item-subcat');
    if (!sel) return;
    const subcats = Categories.getSubcats(catName);
    if (subcats.length) {
      sel.disabled = false;
      sel.innerHTML = '<option value="">—</option>' + subcats.map(s => `<option value="${s}">${s}</option>`).join('');
    } else {
      sel.disabled = true;
      sel.innerHTML = '<option value="">—</option>';
    }
  },

  saveTheme(event) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const themes = Storage.getBudgetThemes();
    themes.push({ id: 'theme_' + Date.now(), name: fd.get('name').trim(), color: fd.get('color'), items: [] });
    Storage.saveBudgetThemes(themes);
    Modal.close();
    this._renderList();
  },

  saveItem(event, themeId) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const themes = Storage.getBudgetThemes();
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    theme.items.push({ category: fd.get('category'), subcategory: fd.get('subcategory') || '', planned: parseFloat(fd.get('planned')) || 0 });
    Storage.saveBudgetThemes(themes);
    Modal.close();
    this._renderDetail(themeId);
  },

  deleteTheme(id) {
    if (!confirm('Supprimer ce budget ?')) return;
    Storage.saveBudgetThemes(Storage.getBudgetThemes().filter(t => t.id !== id));
    this.showList();
  },

  suggest() {
    const id = this._currentThemeId;
    if (!id) return;
    const theme = Storage.getBudgetThemes().find(t => t.id === id);
    if (!theme) return;
    const allExpenses = Storage.getExpenses();
    const now = new Date();
    // Average over last 3 months
    const totals = theme.items.map(item => {
      let sum = 0;
      for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
        sum += allExpenses
          .filter(e => e.date >= `${m}-01` && e.date <= `${m}-${String(last).padStart(2,'0')}`)
          .filter(e => e.category === item.category && (!item.subcategory || item.subcategory === e.subcategory))
          .reduce((s, e) => s + e.amount, 0);
      }
      return Math.ceil(sum / 3);
    });
    const themes = Storage.getBudgetThemes();
    const t = themes.find(t => t.id === id);
    t.items.forEach((item, i) => { item.planned = totals[i]; });
    Storage.saveBudgetThemes(themes);
    this._renderDetail(id);
  },
};
