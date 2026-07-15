const Budget = {
  _currentThemeId: null,

  // Mêmes dépenses "réelles" que Flux (Utils.isExpenseCategory) : Épargne/Revenus ne peuvent
  // plus être suivies par un budget, comme elles ne peuvent plus être sélectionnées à la
  // création (_createForm).
  _realExpenses() {
    return Storage.getExpenses().filter(e => Utils.isExpenseCategory(e.category));
  },

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
    // Le montant mensuel fixe est la référence ; l'ancien "planned" (montant fixe, non lié à
    // la période) migre tel quel comme valeur mensuelle. startDate absente (budgets créés avant
    // cette version) = pas de restriction de date, actif depuis toujours.
    if (theme.monthlyAmount == null) theme.monthlyAmount = theme.planned || 0;
    if (theme.startDate === undefined) theme.startDate = null;
    // Périodicité de saisie — sert juste à ré-afficher le bon montant/période dans le
    // formulaire d'édition (le calcul lui-même n'utilise que monthlyAmount) ; absente pour les
    // budgets créés avant cette fonctionnalité -> Mensuel.
    if (theme.inputPeriodMonths == null) theme.inputPeriodMonths = 1;
    if (theme.inputAmount == null) theme.inputAmount = theme.monthlyAmount;
    return theme;
  },

  _PERIODS: [
    { months: 1, label: 'Mensuel' },
    { months: 3, label: 'Trimestriel' },
    { months: 6, label: 'Semestriel' },
    { months: 12, label: 'Annuel' },
  ],
  _periodOptions(selectedMonths) {
    return this._PERIODS.map(p =>
      `<option value="${p.months}" ${p.months === selectedMonths ? 'selected' : ''}>${p.label}</option>`
    ).join('');
  },

  _computeSpent(theme, expenses) {
    const cats = theme.categories || [];
    if (!cats.length) return 0;
    return expenses.filter(e => cats.includes(e.category)).reduce((s, e) => s + e.amount, 0);
  },

  // [start,end] correspond-il à un nombre entier de mois calendaires (start = 1er du mois,
  // end = dernier jour d'un mois) ? Renvoie ce nombre de mois, sinon null (période partielle).
  _wholeMonthsSpan(start, end) {
    const [sy, sm, sd] = start.split('-').map(Number);
    if (sd !== 1) return null;
    const [ey, em, ed] = end.split('-').map(Number);
    if (ed !== new Date(ey, em, 0).getDate()) return null;
    return (ey - sy) * 12 + (em - sm) + 1;
  },

  // Montant prévu pour une plage de dates donnée : montant mensuel × nombre de mois si la
  // plage (une fois recadrée sur la date de début du budget) couvre des mois calendaires
  // entiers, sinon prorata au jour (montant mensuel ÷ 30 × nombre de jours) — cas d'une plage
  // libre non alignée sur des mois, ou d'un budget démarré en cours de période.
  _plannedForRange(monthlyAmount, rangeStart, rangeEnd, budgetStartDate) {
    if (!monthlyAmount || !rangeStart || !rangeEnd) return 0;
    const effStart = (budgetStartDate && budgetStartDate > rangeStart) ? budgetStartDate : rangeStart;
    if (effStart > rangeEnd) return 0;
    const months = this._wholeMonthsSpan(effStart, rangeEnd);
    if (months !== null) return monthlyAmount * months;
    const days = Math.round((new Date(rangeEnd + 'T00:00:00') - new Date(effStart + 'T00:00:00')) / 86400000) + 1;
    return monthlyAmount / 30 * days;
  },

  // Montant prévu pour la période actuellement sélectionnée dans le filtre global.
  _plannedForPeriod(theme) {
    const { start, end } = PeriodFilter.getDateRange();
    return this._plannedForRange(theme.monthlyAmount || 0, start, end, theme.startDate);
  },

  // Éclaircit une couleur hex vers le blanc (facteur 0..1) — dérive le 2e stop du dégradé du
  // ruban (--cat-bar) à partir de la couleur canonique de la catégorie (Utils.getCategoryColor),
  // pour que le budget ait toujours la même couleur que sa catégorie ailleurs dans l'app.
  _lighten(hex, pct) {
    const c = parseInt(hex.slice(1), 16);
    const mix = (shift) => { const v = (c >> shift) & 255; return Math.round(v + (255 - v) * pct); };
    return '#' + [mix(16), mix(8), mix(0)].map(v => v.toString(16).padStart(2, '0')).join('');
  },

  // Dépassé / Proche limite / Dans le budget — même statut pour le texte et la barre de
  // progression de la carte (couleur, libellé), selon % consommé de la période active.
  _status(planned, pct) {
    if (planned <= 0) return { label: 'Aucun prévu', cls: 'bstatus-none', color: 'var(--text-muted)' };
    if (pct >= 100) return { label: 'Dépassé', cls: 'bstatus-over', color: '#ef4444' };
    if (pct >= 80) return { label: 'Proche limite', cls: 'bstatus-warn', color: '#f59e0b' };
    return { label: 'Dans le budget', cls: 'bstatus-ok', color: '#10b981' };
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
    const allExpenses = this._realExpenses();
    const expenses   = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);

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
    const totalPlanned = themes.reduce((s, t) => s + this._plannedForPeriod(t), 0);
    const totalSpent   = themes.reduce((s, t) => s + this._computeSpent(t, expenses), 0);
    const totalRemain  = totalPlanned - totalSpent;
    const overCount    = themes.filter(t => {
      const pl = this._plannedForPeriod(t);
      const sp = this._computeSpent(t, expenses);
      return pl > 0 && sp > pl;
    }).length;
    const globalPct = totalPlanned > 0 ? Math.min(100, totalSpent / totalPlanned * 100) : 0;

    // KPI overview — 4 cartes façon Flux (bande dégradée en haut, pas d'icône).
    if (overviewBar) {
      overviewBar.innerHTML = `
        <div class="kpi-card budget-kpi-card bkpi-total">
          <div class="kpi-label">Budget total</div>
          <div class="kpi-value">${Utils.formatCurrency(totalPlanned)}</div>
          <div class="kpi-sub">Prévu · ${PeriodFilter.getLabel()}</div>
        </div>
        <div class="kpi-card budget-kpi-card bkpi-spent">
          <div class="kpi-label">Dépensé</div>
          <div class="kpi-value">${Utils.formatCurrency(totalSpent)}</div>
          <div class="kpi-sub">${globalPct.toFixed(0)}% du budget</div>
        </div>
        <div class="kpi-card budget-kpi-card bkpi-remain">
          <div class="kpi-label">${totalRemain >= 0 ? 'Restant' : 'Dépassement'}</div>
          <div class="kpi-value">${Utils.formatCurrency(Math.abs(totalRemain))}</div>
          <div class="kpi-sub">${totalRemain >= 0 ? 'Encore disponible' : 'Au-dessus du prévu'}</div>
        </div>
        <div class="kpi-card budget-kpi-card bkpi-over">
          <div class="kpi-label">Dépassements</div>
          <div class="kpi-value">${overCount}</div>
          <div class="kpi-sub">Catégorie${overCount !== 1 ? 's' : ''} au-dessus</div>
        </div>`;
    }

    // Cards — même carcasse visuelle que les cartes de Catégories (ruban --cat-bar dérivé de
    // la couleur du budget, icône de la catégorie, coins arrondis) ; statut/barre en couleur
    // rouge/orange/vert selon % consommé.
    if (cardsGrid) {
      cardsGrid.innerHTML = themes.map(theme => {
        const spent   = this._computeSpent(theme, expenses);
        const planned = this._plannedForPeriod(theme);
        const pct     = planned > 0 ? (spent / planned * 100) : 0;
        const color   = Utils.getCategoryColor(theme.name);
        const icon    = Categories._meta(theme.name).icon;
        const status  = this._status(planned, pct);
        const vars    = `--cat-bar:linear-gradient(90deg,${color},${this._lighten(color, 0.35)})`;

        return `<div class="category-card bcard" style="${vars}" onclick="Budget.showDetail('${theme.id}')">
          <div class="bcard-head">
            <div class="cat-left"><div class="cat-icon">${icon}</div><span class="cat-name">${theme.name}</span></div>
            <div class="cat-top-right">
              <span class="bstatus ${status.cls}">${status.label}</span>
              <button class="cat-edit-btn" onclick="event.stopPropagation();Budget.openEditForm('${theme.id}')" title="Modifier">✏️</button>
            </div>
          </div>
          <div class="bcard-bar-track"><div class="bcard-bar-fill" style="width:${Math.min(100, pct).toFixed(1)}%;background:${status.color}"></div></div>
          <div class="bcard-amounts">
            <span class="bcard-spent" style="color:${status.color}">${Utils.formatCurrency(spent)}</span>
            <span class="bcard-planned-text">sur ${Utils.formatCurrency(planned)} · ${Math.round(pct)}%</span>
          </div>
        </div>`;
      }).join('') + `
        <div class="category-card card-new" onclick="Budget.openAddForm()"><div class="new-plus">＋</div><span class="new-label">Nouveau budget</span></div>`;
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
    const color = Utils.getCategoryColor(theme.name);

    document.getElementById('budget-list-view').classList.add('hidden');
    document.getElementById('budget-detail-view').classList.remove('hidden');
    document.getElementById('budget-section-title').textContent = theme.name;
    const addBtn  = document.getElementById('add-budget-btn');
    const backBtn = document.getElementById('budget-back-btn');
    if (addBtn)  { addBtn.textContent = '✏️ Modifier'; addBtn.classList.remove('hidden'); }
    if (backBtn)   backBtn.classList.remove('hidden');

    const { start, end } = PeriodFilter.getDateRange();
    const allExpenses    = this._realExpenses();
    const periodExpenses = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);
    const spent   = this._computeSpent(theme, periodExpenses);
    const planned = this._plannedForPeriod(theme);
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

    // History chart — le prévu de chaque mois passé est recalculé individuellement (recadré sur
    // theme.startDate), pas simplement répété : un budget démarré récemment n'a rien de prévu
    // sur les mois avant son démarrage.
    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const histLabels = [], histData = [], histPlanned = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
      const mStart = `${m}-01`, mEnd = `${m}-${String(last).padStart(2,'0')}`;
      const mExp = allExpenses.filter(e => Utils.getExpenseDate(e) >= mStart && Utils.getExpenseDate(e) <= mEnd);
      histLabels.push(MONTHS_FR[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));
      histData.push(this._computeSpent(theme, mExp));
      histPlanned.push(this._plannedForRange(theme.monthlyAmount || 0, mStart, mEnd, theme.startDate));
    }
    Charts.budgetHistory(histLabels, histData, color, histPlanned);
  },

  _renderBreakdown(id, theme, periodExpenses) {
    const wrap = document.getElementById('budget-breakdown-wrap');
    if (!wrap) return;
    const cats       = theme.categories || [];
    const catExpenses = periodExpenses.filter(e => cats.includes(e.category));
    const color      = Utils.getCategoryColor(theme.name);

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
        <h3>Détail des dépenses · ${PeriodFilter.getLabel()}</h3>
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

  _createForm() {
    const existing = new Set(Storage.getBudgetThemes().map(t => {
      const m = this._migrate({ ...t });
      return (m.categories || [])[0];
    }).filter(Boolean));
    const cats = Storage.getCategories().filter(c => !existing.has(c.name) && Categories._catType(c) === 'expense');
    if (!cats.length) return `<div style="text-align:center;padding:1rem;color:var(--text-muted)">
      Toutes tes catégories ont déjà un budget.<br><small>Crée d'abord de nouvelles catégories dans Données › Catégories.</small>
      <div class="form-actions"><button type="button" class="btn-secondary" onclick="Modal.close()">Fermer</button></div></div>`;
    const today = new Date().toISOString().slice(0, 10);
    return `<form onsubmit="Budget.saveTheme(event)">
      <div class="form-grid">
        <div class="form-group form-full"><label>Catégorie *</label>
          <select name="category" required>${cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}</select></div>
        <div class="form-group"><label>Montant (€) *</label>
          <input name="amount" type="number" step="1" min="0" required placeholder="ex: 400"></div>
        <div class="form-group"><label>Périodicité *</label>
          <select name="periodMonths">${this._periodOptions(1)}</select></div>
        <div class="form-group form-full"><label>Date de début</label>
          <input name="startDate" type="date" value="${today}">
          <p class="rename-hint">Le montant prévu de chaque période est calculé à partir de ce montant (ramené au mois), à partir de cette date.</p></div>
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
        <div class="form-group"><label>Montant (€) *</label>
          <input name="amount" type="number" step="1" min="0" value="${theme.inputAmount || 0}" required></div>
        <div class="form-group"><label>Périodicité *</label>
          <select name="periodMonths">${this._periodOptions(theme.inputPeriodMonths)}</select></div>
        <div class="form-group form-full"><label>Date de début</label>
          <input name="startDate" type="date" value="${theme.startDate || ''}">
          <p class="rename-hint">Laisser vide = budget actif depuis toujours.</p></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-danger-soft" onclick="Budget.deleteTheme('${theme.id}')">${Utils.ICON_TRASH} Supprimer</button>
        <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
        <button type="submit" class="btn-primary">Enregistrer</button>
      </div></form>`;
  },

  saveTheme(event) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const category = fd.get('category');
    const amount = parseFloat(fd.get('amount')) || 0;
    const periodMonths = parseInt(fd.get('periodMonths'), 10) || 1;
    const themes = Storage.getBudgetThemes();
    themes.push({
      id: 'theme_' + Date.now(),
      name: category,
      monthlyAmount: amount / periodMonths,
      inputAmount: amount,
      inputPeriodMonths: periodMonths,
      startDate: fd.get('startDate') || null,
      categories: [category],
    });
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
    const amount = parseFloat(fd.get('amount')) || 0;
    const periodMonths = parseInt(fd.get('periodMonths'), 10) || 1;
    theme.monthlyAmount     = amount / periodMonths;
    theme.inputAmount       = amount;
    theme.inputPeriodMonths = periodMonths;
    theme.startDate         = fd.get('startDate') || null;
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
    Modal.close();
    this.showList();
  },

  suggest() {
    const id = this._currentThemeId;
    if (!id) return;
    const raw = Storage.getBudgetThemes().find(t => t.id === id);
    if (!raw) return;
    const theme = this._migrate({ ...raw });
    const allExpenses = this._realExpenses();
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
    // Réinitialise aussi la périodicité de saisie à Mensuel : la suggestion est une moyenne
    // mensuelle, pour que le formulaire d'édition réaffiche ensuite le bon montant/période.
    if (t) { t.monthlyAmount = suggested; t.inputAmount = suggested; t.inputPeriodMonths = 1; Storage.saveBudgetThemes(themes); }
    this._renderDetail(id);
  },
};
