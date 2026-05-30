const Budget = {
  _currentThemeId: null,
  _THEME_COLORS: ['#6366f1','#10b981','#f59e0b','#ec4899','#3b82f6','#8b5cf6','#ef4444','#14b8a6'],

  init() {
    PeriodFilter.onChange(() => {
      if (!document.getElementById('section-budget').classList.contains('hidden')) this.render();
    });
  },

  render() {
    if (this._currentThemeId) {
      this._renderDetail(this._currentThemeId);
    } else {
      this._renderList();
    }
  },

  // Migrate old {items} format → new {categories, planned} format
  _migrate(theme) {
    if (!theme.categories) {
      if (theme.items && theme.items.length) {
        theme.categories = [...new Set(theme.items.map(i => i.category).filter(Boolean))];
        if (theme.planned == null) theme.planned = theme.items.reduce((s, i) => s + (i.planned || 0), 0);
      } else {
        theme.categories = [];
      }
    }
    if (theme.planned == null) theme.planned = 0;
    return theme;
  },

  _computeSpent(theme, expenses) {
    const cats = (theme.categories || []);
    if (!cats.length) return 0;
    return expenses.filter(e => cats.includes(e.category)).reduce((s, e) => s + e.amount, 0);
  },

  _prevPeriod() {
    const s = PeriodFilter.get();
    if (s.type !== 'month') return null;
    const [y, m] = s.month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return { start: `${pm}-01`, end: `${pm}-${String(last).padStart(2, '0')}` };
  },

  _prevMonthLabel() {
    const s = PeriodFilter.get();
    if (s.type !== 'month') return 'période préc.';
    const [y, m] = s.month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const MFR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    return MFR[d.getMonth()];
  },

  _renderList() {
    this._currentThemeId = null;
    document.getElementById('budget-list-view').classList.remove('hidden');
    document.getElementById('budget-detail-view').classList.add('hidden');
    document.getElementById('add-budget-btn').textContent = '+ Nouveau budget';

    const rawThemes = Storage.getBudgetThemes();
    const themes = rawThemes.map(t => this._migrate({ ...t }));
    const { start, end } = PeriodFilter.getDateRange();
    const allExpenses = Storage.getExpenses();
    const expenses = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);

    const prev = this._prevPeriod();
    const prevExpenses = prev ? allExpenses.filter(e => Utils.getExpenseDate(e) >= prev.start && Utils.getExpenseDate(e) <= prev.end) : [];

    const empty = document.getElementById('budget-empty');
    const grid = document.getElementById('budget-themes-grid');
    const summaryWrap = document.getElementById('budget-summary-wrap');
    const summaryTbody = document.getElementById('budget-summary-tbody');
    const summaryTitle = document.getElementById('budget-summary-title');

    // Update header
    const titleEl = document.getElementById('budget-section-title');
    if (titleEl) titleEl.textContent = `Budgets — ${PeriodFilter.getLabel()}`;

    // Subtitle
    let subtitleEl = document.getElementById('budget-subtitle');
    if (!subtitleEl) {
      subtitleEl = document.createElement('div');
      subtitleEl.id = 'budget-subtitle';
      subtitleEl.className = 'budget-subtitle';
      const header = document.querySelector('#section-budget .section-header');
      if (header) header.insertAdjacentElement('afterend', subtitleEl);
    }

    if (!themes.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      if (summaryWrap) summaryWrap.classList.add('hidden');
      subtitleEl.textContent = '';
      return;
    }
    empty.classList.add('hidden');

    const overBudgetCount = themes.filter(t => {
      const spent = this._computeSpent(t, expenses);
      return (t.planned || 0) > 0 && spent > t.planned;
    }).length;
    subtitleEl.textContent = `${themes.length} budget${themes.length > 1 ? 's' : ''} actif${themes.length > 1 ? 's' : ''}${overBudgetCount > 0 ? ` · ${overBudgetCount} dépassement${overBudgetCount > 1 ? 's' : ''}` : ''}`;

    const periodLabel = PeriodFilter.getLabel();
    const prevLabel = this._prevMonthLabel();

    grid.innerHTML = themes.map(theme => {
      const spent = this._computeSpent(theme, expenses);
      const planned = theme.planned || 0;
      const pct = planned > 0 ? Math.min(100, spent / planned * 100) : 0;
      const statusColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
      const remaining = planned - spent;
      const overBudget = planned > 0 && spent > planned;

      let trendHtml = '';
      if (prev) {
        const prevSpent = this._computeSpent(theme, prevExpenses);
        if (prevSpent > 0) {
          const diffPct = Math.round((spent - prevSpent) / prevSpent * 100);
          if (diffPct > 0) trendHtml = `<span class="trend-arrow negative">↑ +${diffPct}% vs ${prevLabel}</span>`;
          else if (diffPct < 0) trendHtml = `<span class="trend-arrow positive">↓ ${diffPct}% vs ${prevLabel}</span>`;
          else trendHtml = `<span class="trend-arrow" style="color:var(--text-muted)">= vs ${prevLabel}</span>`;
        }
      }

      const statusLine = overBudget
        ? `<span class="budget-card-warning">⚠ Dépassement +${Utils.formatCurrency(spent - planned)}</span>`
        : `<span class="budget-card-status">${planned > 0 ? `${pct.toFixed(0)}% · ${Utils.formatCurrency(Math.abs(remaining))} ${remaining >= 0 ? 'restants' : 'dépassé'}` : 'Aucun montant prévu'}</span>`;

      return `
        <div class="budget-theme-card${overBudget ? ' over-budget' : ''}" onclick="Budget.showDetail('${theme.id}')">
          <div class="budget-card-accent" style="background:${theme.color || '#6366f1'}"></div>
          <div class="budget-card-body">
            <div class="budget-card-top">
              <span class="budget-card-name">${theme.name}</span>
              <span class="budget-card-period-label">${periodLabel}</span>
            </div>
            <div class="budget-card-amount" style="color:${theme.color || '#6366f1'}">${Utils.formatCurrency(spent)}</div>
            <div class="budget-card-planned">/ ${Utils.formatCurrency(planned)} prévu</div>
            <div class="budget-progress-wrap">
              <div class="budget-progress-bar" style="width:${pct.toFixed(1)}%;background:${statusColor}"></div>
            </div>
            <div class="budget-card-footer">${statusLine}${trendHtml}</div>
          </div>
        </div>`;
    }).join('') + `
      <div class="budget-add-card" onclick="Budget.openAddForm()">
        <div class="budget-add-icon">+</div>
        <div class="budget-add-label">Nouveau budget</div>
      </div>`;

    // Summary table
    if (summaryWrap && summaryTbody) {
      summaryWrap.classList.remove('hidden');
      if (summaryTitle) summaryTitle.textContent = `Récap ${periodLabel} — Réel vs Prévu`;
      summaryTbody.innerHTML = themes.map(theme => {
        const spent = this._computeSpent(theme, expenses);
        const planned = theme.planned || 0;
        const ecart = planned - spent;
        const ecartPct = planned > 0 ? (ecart / planned * 100) : 0;
        const pct = planned > 0 ? Math.min(100, spent / planned * 100) : 0;
        const statusBadge = pct >= 100
          ? '<span class="status-badge status-over">Dépassé</span>'
          : pct >= 80
          ? '<span class="status-badge status-warn">Attention</span>'
          : '<span class="status-badge status-ok">OK</span>';
        return `<tr onclick="Budget.showDetail('${theme.id}')" style="cursor:pointer">
          <td><span class="budget-dot" style="background:${theme.color || '#6366f1'}"></span>${theme.name}</td>
          <td class="text-right">${Utils.formatCurrency(planned)}</td>
          <td class="text-right">${Utils.formatCurrency(spent)}</td>
          <td class="text-right ${ecart >= 0 ? 'positive' : 'negative'}">${ecart >= 0 ? '+' : ''}${Utils.formatCurrency(ecart)}</td>
          <td class="text-right ${ecartPct >= 0 ? 'positive' : 'negative'}">${ecartPct >= 0 ? '+' : ''}${ecartPct.toFixed(1)}%</td>
          <td>${statusBadge}</td>
        </tr>`;
      }).join('');
    }
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
    const raw = Storage.getBudgetThemes().find(t => t.id === id);
    if (!raw) { this.showList(); return; }
    const theme = this._migrate({ ...raw });

    document.getElementById('budget-list-view').classList.add('hidden');
    document.getElementById('budget-detail-view').classList.remove('hidden');
    document.getElementById('budget-section-title').textContent = theme.name;
    document.getElementById('add-budget-btn').textContent = '✏️ Modifier le prévu';

    const { start, end } = PeriodFilter.getDateRange();
    const allExpenses = Storage.getExpenses();
    const periodExpenses = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);

    const totalSpent = this._computeSpent(theme, periodExpenses);
    const totalPlanned = theme.planned || 0;
    const remaining = totalPlanned - totalSpent;

    document.getElementById('budget-detail-planned').textContent = Utils.formatCurrency(totalPlanned);
    document.getElementById('budget-detail-spent').textContent = Utils.formatCurrency(totalSpent);
    const remEl = document.getElementById('budget-detail-remaining');
    remEl.textContent = Utils.formatCurrency(Math.abs(remaining));
    remEl.className = 'kpi-value ' + (remaining >= 0 ? 'positive' : 'negative');
    document.getElementById('budget-detail-remaining-card').className = 'kpi-card ' + (remaining >= 0 ? 'success' : 'danger');

    const daysInPeriod = Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1;
    const daysPassed = Math.min(daysInPeriod, Math.ceil((new Date() - new Date(start)) / 86400000) + 1);
    const daysLeft = Math.max(0, daysInPeriod - daysPassed);
    let msg = `Tu as dépensé <strong>${Utils.formatCurrency(totalSpent)}</strong> sur <strong>${Utils.formatCurrency(totalPlanned)}</strong> prévu.`;
    if (remaining >= 0) msg += ` Il te reste <strong>${Utils.formatCurrency(remaining)}</strong>` + (daysLeft > 0 ? ` pour ${daysLeft} jour(s).` : '.');
    else msg += ` Dépassement de <strong class="negative">${Utils.formatCurrency(-remaining)}</strong>.`;
    document.getElementById('budget-detail-message').innerHTML = msg;

    // Breakdown table — from real expense data
    const subtitleEl = document.getElementById('budget-detail-subtitle');
    if (subtitleEl) subtitleEl.textContent = `Dépenses par sous-catégorie · ${PeriodFilter.getLabel()}`;

    const cats = theme.categories || [];
    const catExpenses = periodExpenses.filter(e => cats.includes(e.category));

    const groups = {};
    catExpenses.forEach(e => {
      const key = `${e.category}|||${e.subcategory || ''}`;
      if (!groups[key]) groups[key] = { category: e.category, subcategory: e.subcategory || '', amount: 0, count: 0 };
      groups[key].amount += e.amount;
      groups[key].count++;
    });

    const tbody = document.getElementById('budget-detail-tbody');
    const rows = Object.values(groups).sort((a, b) => b.amount - a.amount);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1rem">Aucune dépense dans ce budget sur ${PeriodFilter.getLabel()}.</td></tr>`;
    } else {
      tbody.innerHTML = rows.map(g => `<tr>
        <td>${g.category}</td>
        <td>${g.subcategory || '—'}</td>
        <td class="text-right">${Utils.formatCurrency(g.amount)}</td>
        <td class="text-right" style="color:var(--text-muted)">${g.count} op.</td>
      </tr>`).join('');
    }

    // History chart
    const now = new Date();
    const histLabels = [], histData = [];
    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
      const mExp = allExpenses.filter(e => Utils.getExpenseDate(e) >= `${m}-01` && Utils.getExpenseDate(e) <= `${m}-${String(last).padStart(2,'0')}`);
      histLabels.push(MONTHS_FR[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));
      histData.push(this._computeSpent(theme, mExp));
    }
    Charts.budgetHistory(histLabels, histData, theme.color || '#6366f1');
  },

  openAddForm() {
    if (this._currentThemeId) {
      const raw = Storage.getBudgetThemes().find(t => t.id === this._currentThemeId);
      if (raw) Modal.open('Modifier le budget prévu', this._editPlannedForm(this._migrate({ ...raw })));
    } else {
      Modal.open('Nouveau budget', this._themeForm());
    }
  },

  _themeForm() {
    const colorOptions = this._THEME_COLORS.map((c, i) =>
      `<label class="color-opt"><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}><span style="background:${c}" class="color-swatch"></span></label>`
    ).join('');
    // Only offer categories that don't already have a budget
    const existing = new Set(Storage.getBudgetThemes().map(t => {
      const m = this._migrate({ ...t });
      return (m.categories || [])[0];
    }).filter(Boolean));
    const cats = Storage.getCategories().filter(c => !existing.has(c.name));
    if (!cats.length) {
      return `<div style="text-align:center;padding:1rem;color:var(--text-muted)">
        Toutes tes catégories ont déjà un budget.<br>Crée d'abord de nouvelles catégories dans Données > Catégories.
        <div class="form-actions"><button type="button" class="btn-secondary" onclick="Modal.close()">Fermer</button></div>
      </div>`;
    }
    const catOptions = cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    return `
      <form onsubmit="Budget.saveTheme(event)">
        <div class="form-grid">
          <div class="form-group form-full">
            <label>Catégorie *</label>
            <select name="category" required>${catOptions}</select>
          </div>
          <div class="form-group form-full">
            <label>Montant prévu (€) *</label>
            <input name="planned" type="number" step="1" min="0" required placeholder="ex: 400">
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

  _editPlannedForm(theme) {
    return `
      <form onsubmit="Budget.savePlanned(event, '${theme.id}')">
        <div class="form-group">
          <label>Montant prévu (€)</label>
          <input name="planned" type="number" step="1" min="0" value="${theme.planned || 0}" required>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Enregistrer</button>
        </div>
      </form>`;
  },

  savePlanned(event, themeId) {
    event.preventDefault();
    const themes = Storage.getBudgetThemes();
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    theme.planned = parseFloat(new FormData(event.target).get('planned')) || 0;
    Storage.saveBudgetThemes(themes);
    Modal.close();
    this._renderDetail(themeId);
  },

  saveTheme(event) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const category = fd.get('category');
    const themes = Storage.getBudgetThemes();
    themes.push({
      id: 'theme_' + Date.now(),
      name: category,
      color: fd.get('color'),
      planned: parseFloat(fd.get('planned')) || 0,
      categories: [category],
      items: [],
    });
    Storage.saveBudgetThemes(themes);
    Modal.close();
    this._renderList();
  },

  deleteTheme(id) {
    if (!confirm('Supprimer ce budget ?')) return;
    Storage.saveBudgetThemes(Storage.getBudgetThemes().filter(t => t.id !== id));
    this.showList();
  },

  suggest() {
    const id = this._currentThemeId;
    if (!id) return;
    const raw = Storage.getBudgetThemes().find(t => t.id === id);
    if (!raw) return;
    const theme = this._migrate({ ...raw });
    const allExpenses = Storage.getExpenses();
    const now = new Date();
    let sum = 0;
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
      const mExp = allExpenses.filter(e => Utils.getExpenseDate(e) >= `${m}-01` && Utils.getExpenseDate(e) <= `${m}-${String(last).padStart(2,'0')}`);
      sum += this._computeSpent(theme, mExp);
    }
    const suggested = Math.ceil(sum / 3);
    const themes = Storage.getBudgetThemes();
    const t = themes.find(t => t.id === id);
    if (t) { t.planned = suggested; Storage.saveBudgetThemes(themes); }
    this._renderDetail(id);
  },
};
