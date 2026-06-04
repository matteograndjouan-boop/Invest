const Budget = {
  _currentThemeId: null,
  _THEME_COLORS: ['#6366f1','#10b981','#f59e0b','#ec4899','#3b82f6','#8b5cf6','#ef4444','#14b8a6'],

  init() {
    PeriodFilter.onChange(() => {
      if (!document.getElementById('section-budget').classList.contains('hidden')) this.render();
    });
  },

  render() {
    if (this._currentThemeId) this._renderDetail(this._currentThemeId);
    else this._renderList();
  },

  _migrate(theme) {
    if (!theme.categories) {
      if (theme.items && theme.items.length) {
        theme.categories = [...new Set(theme.items.map(i => i.category).filter(Boolean))];
        if (theme.planned == null) theme.planned = theme.items.reduce((s, i) => s + (i.planned || 0), 0);
      } else { theme.categories = []; }
    }
    if (theme.planned == null) theme.planned = 0;
    return theme;
  },

  _computeSpent(theme, expenses) {
    const cats = theme.categories || [];
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
    if (s.type !== 'month') return 'péri. préc.';
    const [y, m] = s.month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][d.getMonth()];
  },

  _ring(pct, color, size = 64) {
    const clamped = Math.min(100, Math.max(0, pct));
    const inner = size - 16;
    return `<div class="bcard-ring" style="width:${size}px;height:${size}px;background:conic-gradient(${color} ${clamped}%,var(--border) ${clamped}% 100%)">
      <div class="bcard-ring-inner" style="width:${inner}px;height:${inner}px;font-size:${size <= 64 ? 10 : 13}px">${Math.round(clamped)}%</div>
    </div>`;
  },

  // ─── LIST VIEW ───────────────────────────────────────────────────────────

  _renderList() {
    this._currentThemeId = null;
    const listView   = document.getElementById('budget-list-view');
    const detailView = document.getElementById('budget-detail-view');
    const addBtn     = document.getElementById('add-budget-btn');
    const backBtn    = document.getElementById('budget-back-btn');
    if (listView)   listView.classList.remove('hidden');
    if (detailView) detailView.classList.add('hidden');
    if (addBtn)  { addBtn.textContent = '+ Nouveau budget'; addBtn.classList.remove('hidden'); }
    if (backBtn)   backBtn.classList.add('hidden');
    document.getElementById('budget-section-title').textContent = 'Budgets';

    const rawThemes  = Storage.getBudgetThemes();
    const themes     = rawThemes.map(t => this._migrate({ ...t }));
    const { start, end } = PeriodFilter.getDateRange();
    const allExpenses = Storage.getExpenses();
    const expenses   = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);
    const prev       = this._prevPeriod();
    const prevExp    = prev ? allExpenses.filter(e => Utils.getExpenseDate(e) >= prev.start && Utils.getExpenseDate(e) <= prev.end) : [];
    const prevLabel  = this._prevMonthLabel();

    const overviewBar = document.getElementById('budget-overview-bar');
    const cardsGrid   = document.getElementById('budget-cards-grid');
    const emptyEl     = document.getElementById('budget-empty');

    if (!themes.length) {
      if (overviewBar) overviewBar.innerHTML = '';
      if (cardsGrid)   cardsGrid.innerHTML   = '';
      if (emptyEl)     emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    // Overview KPIs
    const totalPlanned = themes.reduce((s, t) => s + (t.planned || 0), 0);
    const totalSpent   = themes.reduce((s, t) => s + this._computeSpent(t, expenses), 0);
    const totalRemain  = totalPlanned - totalSpent;
    const overCount    = themes.filter(t => {
      const sp = this._computeSpent(t, expenses);
      return (t.planned || 0) > 0 && sp > t.planned;
    }).length;
    const globalPct = totalPlanned > 0 ? Math.min(100, totalSpent / totalPlanned * 100) : 0;
    const globalColor = globalPct >= 100 ? '#ef4444' : globalPct >= 80 ? '#f59e0b' : '#10b981';

    if (overviewBar) {
      overviewBar.innerHTML = `
        <div class="bov-items">
          <div class="bov-item">
            <div class="bov-val">${Utils.formatCurrency(totalPlanned)}</div>
            <div class="bov-label">Budget total</div>
          </div>
          <div class="bov-divider"></div>
          <div class="bov-item">
            <div class="bov-val" style="color:#ef4444">${Utils.formatCurrency(totalSpent)}</div>
            <div class="bov-label">Dépensé</div>
          </div>
          <div class="bov-divider"></div>
          <div class="bov-item">
            <div class="bov-val ${totalRemain >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(Math.abs(totalRemain))}</div>
            <div class="bov-label">${totalRemain >= 0 ? 'Restant' : 'Dépassement'}</div>
          </div>
          <div class="bov-divider"></div>
          <div class="bov-item">
            <div class="bov-val ${overCount > 0 ? 'negative' : 'positive'}">${overCount}</div>
            <div class="bov-label">Dépassement${overCount !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="bov-progress-track">
          <div class="bov-progress-fill" style="width:${globalPct.toFixed(1)}%;background:${globalColor}"></div>
          <span class="bov-progress-label">${globalPct.toFixed(0)}% du budget global utilisé</span>
        </div>`;
    }

    // Cards
    if (cardsGrid) {
      cardsGrid.innerHTML = themes.map(theme => {
        const spent   = this._computeSpent(theme, expenses);
        const planned = theme.planned || 0;
        const pct     = planned > 0 ? (spent / planned * 100) : 0;
        const color   = theme.color || '#6366f1';
        const statusColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
        const remaining   = planned - spent;
        const overBudget  = planned > 0 && spent > planned;

        let trendHtml = '';
        if (prev) {
          const prevSpent = this._computeSpent(theme, prevExp);
          if (prevSpent > 0) {
            const dp = Math.round((spent - prevSpent) / prevSpent * 100);
            trendHtml = dp > 0
              ? `<span class="bcard-trend negative">↑ +${dp}% vs ${prevLabel}</span>`
              : dp < 0
              ? `<span class="bcard-trend positive">↓ ${dp}% vs ${prevLabel}</span>`
              : `<span class="bcard-trend">= vs ${prevLabel}</span>`;
          }
        }

        const remainText = overBudget
          ? `<span class="bcard-over">⚠ +${Utils.formatCurrency(spent - planned)}</span>`
          : planned > 0
          ? `<span class="bcard-remain ${remaining < planned * 0.2 ? 'bcard-remain-low' : ''}">${Utils.formatCurrency(remaining)} restants</span>`
          : `<span style="color:var(--text-muted);font-size:11px">Aucun montant prévu</span>`;

        return `<div class="bcard${overBudget ? ' bcard-over-budget' : ''}" onclick="Budget.showDetail('${theme.id}')">
          <div class="bcard-top">
            ${this._ring(pct, color)}
            <div class="bcard-meta">
              <div class="bcard-name">${theme.name}</div>
              <div class="bcard-period">${PeriodFilter.getLabel()}</div>
            </div>
            <div class="bcard-actions">
              <button class="bcard-btn" onclick="event.stopPropagation();Budget.openEditForm('${theme.id}')" title="Modifier">✏️</button>
              <button class="bcard-btn bcard-btn-del" onclick="event.stopPropagation();Budget.deleteTheme('${theme.id}')" title="Supprimer">×</button>
            </div>
          </div>
          <div class="bcard-amounts">
            <span class="bcard-spent" style="color:${overBudget ? '#ef4444' : color}">${Utils.formatCurrency(spent)}</span>
            <span class="bcard-planned-text">/ ${Utils.formatCurrency(planned)}</span>
          </div>
          <div class="bcard-bar-track">
            <div class="bcard-bar-fill" style="width:${Math.min(100, pct).toFixed(1)}%;background:${statusColor}"></div>
          </div>
          <div class="bcard-footer">
            ${remainText}
            ${trendHtml}
          </div>
        </div>`;
      }).join('') + `
        <div class="bcard-ghost" onclick="Budget.openAddForm()">
          <div class="bcard-ghost-icon">+</div>
          <div class="bcard-ghost-label">Nouveau budget</div>
        </div>`;
    }
  },

  // ─── DETAIL VIEW ─────────────────────────────────────────────────────────

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
    const color = theme.color || '#6366f1';

    document.getElementById('budget-list-view').classList.add('hidden');
    document.getElementById('budget-detail-view').classList.remove('hidden');
    document.getElementById('budget-section-title').textContent = theme.name;
    const addBtn  = document.getElementById('add-budget-btn');
    const backBtn = document.getElementById('budget-back-btn');
    if (addBtn)  { addBtn.textContent = '✏️ Modifier'; addBtn.classList.remove('hidden'); }
    if (backBtn)   backBtn.classList.remove('hidden');

    const { start, end } = PeriodFilter.getDateRange();
    const allExpenses    = Storage.getExpenses();
    const periodExpenses = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);
    const spent   = this._computeSpent(theme, periodExpenses);
    const planned = theme.planned || 0;
    const remain  = planned - spent;
    const pct     = planned > 0 ? spent / planned * 100 : 0;
    const statusColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';

    // Hero section
    const heroEl = document.getElementById('budget-detail-hero');
    if (heroEl) {
      const daysInPeriod = Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1;
      const daysPassed   = Math.min(daysInPeriod, Math.ceil((new Date() - new Date(start)) / 86400000) + 1);
      const daysLeft     = Math.max(0, daysInPeriod - daysPassed);
      const timePct      = daysInPeriod > 0 ? (daysPassed / daysInPeriod * 100).toFixed(1) : 0;
      const dailyRate    = daysPassed > 0 ? (spent / daysPassed) : 0;
      const projected    = dailyRate * daysInPeriod;

      heroEl.style.borderTopColor = color;
      heroEl.innerHTML = `
        <div class="bdetail-ring-col">
          ${this._ring(pct, color, 90)}
          <div class="bdetail-status-dot" style="background:${statusColor}"></div>
        </div>
        <div class="bdetail-kpis">
          <div class="bdetail-kpi">
            <div class="bdetail-kpi-val" style="color:${color}">${Utils.formatCurrency(spent)}</div>
            <div class="bdetail-kpi-label">Dépensé</div>
          </div>
          <div class="bdetail-kpi-sep"></div>
          <div class="bdetail-kpi">
            <div class="bdetail-kpi-val">${Utils.formatCurrency(planned)}</div>
            <div class="bdetail-kpi-label">Prévu <button class="bdetail-edit-planned" onclick="Budget.openEditForm('${id}')" title="Modifier le prévu">✏️</button></div>
          </div>
          <div class="bdetail-kpi-sep"></div>
          <div class="bdetail-kpi">
            <div class="bdetail-kpi-val ${remain >= 0 ? 'positive' : 'negative'}">${remain >= 0 ? '' : '-'}${Utils.formatCurrency(Math.abs(remain))}</div>
            <div class="bdetail-kpi-label">${remain >= 0 ? 'Restant' : 'Dépassement'}</div>
          </div>
          <div class="bdetail-kpi-sep"></div>
          <div class="bdetail-kpi">
            <div class="bdetail-kpi-val">${Utils.formatCurrency(dailyRate)}<span style="font-size:11px;font-weight:500">/j</span></div>
            <div class="bdetail-kpi-label">Rythme · <span style="color:${projected > planned && planned > 0 ? '#ef4444' : '#10b981'}">${Utils.formatCurrency(projected)} projeté</span></div>
          </div>
        </div>
        <div class="bdetail-progress-col">
          <div class="bdetail-bar-label"><span>Budget utilisé</span><span style="font-weight:700;color:${statusColor}">${Math.min(pct, 100).toFixed(0)}%</span></div>
          <div class="bdetail-bar-track"><div class="bdetail-bar-fill" style="width:${Math.min(100, pct).toFixed(1)}%;background:${statusColor}"></div></div>
          <div class="bdetail-bar-label"><span style="color:var(--text-muted);font-size:11px">Temps écoulé</span><span style="font-size:11px;color:var(--text-muted)">${timePct}% · ${daysLeft}j restants</span></div>
          <div class="bdetail-bar-track" style="margin-top:3px"><div class="bdetail-bar-fill" style="width:${timePct}%;background:var(--primary);opacity:0.4"></div></div>
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn-secondary btn-sm" onclick="Budget.suggest()">💡 Suggérer (moy. 3 mois)</button>
          </div>
        </div>`;
    }

    // Smart message
    const msgEl = document.getElementById('budget-detail-message');
    if (msgEl) {
      const daysInPeriod = Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1;
      const daysLeft = Math.max(0, daysInPeriod - Math.min(daysInPeriod, Math.ceil((new Date() - new Date(start)) / 86400000) + 1));
      if (remain < 0) {
        msgEl.innerHTML = `⚠️ Dépassement de <strong class="negative">${Utils.formatCurrency(-remain)}</strong> sur ce budget.`;
        msgEl.className = 'budget-smart-message budget-msg-warn';
        msgEl.classList.remove('hidden');
      } else if (pct >= 80) {
        msgEl.innerHTML = `⚡ Il te reste <strong>${Utils.formatCurrency(remain)}</strong> pour ${daysLeft} jour(s). Attention au dépassement.`;
        msgEl.className = 'budget-smart-message budget-msg-warn';
        msgEl.classList.remove('hidden');
      } else if (planned > 0) {
        msgEl.innerHTML = `✅ <strong>${Utils.formatCurrency(remain)}</strong> disponibles sur ${daysLeft > 0 ? daysLeft + ' jour(s) restants' : 'la période'}.`;
        msgEl.className = 'budget-smart-message budget-msg-ok';
        msgEl.classList.remove('hidden');
      } else {
        msgEl.classList.add('hidden');
      }
    }

    // Breakdown
    this._renderBreakdown(id, theme, periodExpenses);

    // History chart
    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const histLabels = [], histData = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
      const mExp = allExpenses.filter(e => Utils.getExpenseDate(e) >= `${m}-01` && Utils.getExpenseDate(e) <= `${m}-${String(last).padStart(2,'0')}`);
      histLabels.push(MONTHS_FR[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));
      histData.push(this._computeSpent(theme, mExp));
    }
    Charts.budgetHistory(histLabels, histData, color, planned);
  },

  _renderBreakdown(id, theme, periodExpenses) {
    const wrap = document.getElementById('budget-breakdown-wrap');
    if (!wrap) return;
    const cats       = theme.categories || [];
    const catExpenses = periodExpenses.filter(e => cats.includes(e.category));
    const color      = theme.color || '#6366f1';

    const groups = {};
    catExpenses.forEach(e => {
      const key = e.subcategory || '—';
      if (!groups[key]) groups[key] = { amount: 0, count: 0 };
      groups[key].amount += e.amount;
      groups[key].count++;
    });
    const total  = catExpenses.reduce((s, e) => s + e.amount, 0);
    const sorted = Object.entries(groups).sort((a, b) => b[1].amount - a[1].amount);

    if (!sorted.length) {
      wrap.innerHTML = `<div style="padding:20px 16px;color:var(--text-muted);font-size:14px;text-align:center">Aucune dépense sur cette période.</div>`;
      return;
    }

    const rows = sorted.map(([sub, g]) => {
      const pct  = total > 0 ? (g.amount / total * 100) : 0;
      const barW = Math.min(100, pct).toFixed(1);
      return `<div class="bbreak-row">
        <div class="bbreak-name">${sub}</div>
        <div class="bbreak-bar-wrap">
          <div class="bbreak-bar" style="width:${barW}%;background:${color}cc"></div>
        </div>
        <div class="bbreak-pct">${pct.toFixed(1)}%</div>
        <div class="bbreak-amt">${Utils.formatCurrency(g.amount)}</div>
        <div class="bbreak-count">${g.count} op.</div>
      </div>`;
    });

    wrap.innerHTML = `
      <div class="card-header-row" style="padding:14px 16px 8px">
        <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted)">Détail des dépenses · ${PeriodFilter.getLabel()}</h3>
      </div>
      ${rows.join('')}`;
  },

  // ─── FORMS ───────────────────────────────────────────────────────────────

  openAddForm() {
    if (this._currentThemeId) {
      const raw = Storage.getBudgetThemes().find(t => t.id === this._currentThemeId);
      if (raw) Modal.open('Modifier le budget', this._editThemeForm(this._migrate({ ...raw })));
    } else {
      Modal.open('Nouveau budget', this._createForm());
    }
  },

  openEditForm(id) {
    const raw = Storage.getBudgetThemes().find(t => t.id === id);
    if (raw) Modal.open('Modifier le budget', this._editThemeForm(this._migrate({ ...raw })));
  },

  _colorPicker(selected) {
    return this._THEME_COLORS.map(c =>
      `<label class="color-opt"><input type="radio" name="color" value="${c}" ${selected === c ? 'checked' : ''}><span style="background:${c}" class="color-swatch"></span></label>`
    ).join('');
  },

  _createForm() {
    const existing = new Set(Storage.getBudgetThemes().map(t => {
      const m = this._migrate({ ...t });
      return (m.categories || [])[0];
    }).filter(Boolean));
    const cats = Storage.getCategories().filter(c => !existing.has(c.name));
    if (!cats.length) return `<div style="text-align:center;padding:1rem;color:var(--text-muted)">
      Toutes tes catégories ont déjà un budget.<br><small>Crée d'abord de nouvelles catégories dans Données › Catégories.</small>
      <div class="form-actions"><button type="button" class="btn-secondary" onclick="Modal.close()">Fermer</button></div></div>`;
    return `<form onsubmit="Budget.saveTheme(event)">
      <div class="form-grid">
        <div class="form-group form-full"><label>Catégorie *</label>
          <select name="category" required>${cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}</select></div>
        <div class="form-group form-full"><label>Montant prévu (€) *</label>
          <input name="planned" type="number" step="1" min="0" required placeholder="ex: 400"></div>
        <div class="form-group form-full"><label>Couleur</label>
          <div class="color-picker-row">${this._colorPicker(this._THEME_COLORS[0])}</div></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
        <button type="submit" class="btn-primary">Créer</button>
      </div></form>`;
  },

  _editThemeForm(theme) {
    return `<form onsubmit="Budget.saveThemeEdit(event, '${theme.id}')">
      <div class="form-grid">
        <div class="form-group form-full"><label>Catégorie</label>
          <input type="text" value="${theme.name}" disabled style="opacity:0.6"></div>
        <div class="form-group form-full"><label>Montant prévu (€) *</label>
          <input name="planned" type="number" step="1" min="0" value="${theme.planned || 0}" required></div>
        <div class="form-group form-full"><label>Couleur</label>
          <div class="color-picker-row">${this._colorPicker(theme.color || this._THEME_COLORS[0])}</div></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
        <button type="submit" class="btn-primary">Enregistrer</button>
      </div></form>`;
  },

  saveTheme(event) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const category = fd.get('category');
    const themes = Storage.getBudgetThemes();
    themes.push({ id: 'theme_' + Date.now(), name: category, color: fd.get('color'), planned: parseFloat(fd.get('planned')) || 0, categories: [category], items: [] });
    Storage.saveBudgetThemes(themes);
    Modal.close();
    this._renderList();
  },

  saveThemeEdit(event, id) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const themes = Storage.getBudgetThemes();
    const theme  = themes.find(t => t.id === id);
    if (!theme) return;
    theme.planned = parseFloat(fd.get('planned')) || 0;
    theme.color   = fd.get('color') || theme.color;
    Storage.saveBudgetThemes(themes);
    Modal.close();
    if (this._currentThemeId === id) this._renderDetail(id);
    else this._renderList();
  },

  // Keep for backwards compatibility
  savePlanned(event, id) { this.saveThemeEdit(event, id); },

  deleteTheme(id) {
    if (!confirm('Supprimer ce budget ?')) return;
    Storage.saveBudgetThemes(Storage.getBudgetThemes().filter(t => t.id !== id));
    this._currentThemeId = null;
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
      sum += this._computeSpent(theme, allExpenses.filter(e => Utils.getExpenseDate(e) >= `${m}-01` && Utils.getExpenseDate(e) <= `${m}-${String(last).padStart(2,'0')}`));
    }
    const suggested = Math.ceil(sum / 3);
    const themes = Storage.getBudgetThemes();
    const t = themes.find(t => t.id === id);
    if (t) { t.planned = suggested; Storage.saveBudgetThemes(themes); }
    this._renderDetail(id);
  },
};
