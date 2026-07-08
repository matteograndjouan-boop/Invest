const Flux = {
  _activeFilters: new Set(),
  _multiMode: false,
  _expandedCats: new Set(),

  init() {
    PeriodFilter.onChange(() => {
      if (!document.getElementById('section-flux').classList.contains('hidden')) this.render();
    });
    this._renderCatPills();
  },

  _renderCatPills() {
    const container = document.getElementById('flux-cat-pills');
    if (!container) return;
    const cats = Storage.getCategories().map(c => c.name);
    const active = this._activeFilters;
    const multi = this._multiMode;

    const multiBtn = `<button class="flux-multi-btn${multi ? ' active' : ''}" onclick="Flux._toggleMultiMode()" title="Activer la sélection multiple">⊕ Multi</button>`;
    const allActive = !active.size;
    const allBtn = `<button class="flux-pill${allActive ? ' active' : ''}" onclick="Flux._clearFilters()">
      <span class="flux-pill-dot" style="background:${allActive ? '#fff' : 'var(--text-muted)'}"></span>Toutes
    </button>`;
    const catBtns = cats.map((c) => {
      const color = Utils.getCategoryColor(c);
      const isActive = active.has(c);
      const style = isActive ? `style="background:${color};border-color:${color}"` : '';
      return `<button class="flux-pill${isActive ? ' active' : ''}" onclick="Flux._togglePill('${c.replace(/'/g, "\\'")}')" ${style}>
        <span class="flux-pill-dot" style="background:${isActive ? '#fff' : color}"></span>${c}
      </button>`;
    }).join('');
    container.innerHTML = multiBtn + allBtn + catBtns;
  },

  _toggleMultiMode() {
    this._multiMode = !this._multiMode;
    if (!this._multiMode && this._activeFilters.size > 1) {
      this._activeFilters = new Set([[...this._activeFilters][0]]);
    }
    this._renderCatPills();
    this.render();
  },

  _clearFilters() {
    this._activeFilters = new Set();
    this._renderCatPills();
    this.render();
  },

  _togglePill(cat) {
    if (this._multiMode) {
      if (this._activeFilters.has(cat)) this._activeFilters.delete(cat);
      else this._activeFilters.add(cat);
    } else {
      this._activeFilters = this._activeFilters.has(cat) ? new Set() : new Set([cat]);
    }
    this._renderCatPills();
    this.render();
  },

  // Kept for donut click compatibility
  toggleFilter(label) {
    if (!label || label === 'Autres') return;
    this._togglePill(label);
  },

  clearFilter() { this._clearFilters(); },

  _catLabel() {
    const s = this._activeFilters;
    if (!s.size) return '';
    if (s.size === 1) return [...s][0];
    return `${s.size} catégories`;
  },

  _getPrevPeriodData() {
    const s = PeriodFilter.get();
    if (s.type !== 'month') return null;
    const [y, m] = s.month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const start = `${pm}-01`;
    const end = `${pm}-${String(last).padStart(2, '0')}`;
    return {
      expenses: Storage.getExpenses().filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end),
      revenues: Storage.getRevenues().filter(r => Utils.getExpenseDate(r) >= start && Utils.getExpenseDate(r) <= end),
    };
  },

  // Couleur/flèche suivent le signe brut de la variation (vert = positif, rouge = négatif),
  // pas une notion de "bon/mauvais" par métrique — une baisse de dépenses s'affiche donc en
  // rouge comme n'importe quelle autre variation négative.
  _renderKpiTrend(id, current, prev) {
    const el = document.getElementById(id);
    if (!el) return;
    if (prev == null || prev === 0) { el.innerHTML = ''; return; }
    const diff = current - prev;
    if (diff === 0) { el.innerHTML = `<span class="trend-neutral">→ 0 % vs période préc.</span>`; return; }
    const pct = Math.abs((diff / prev) * 100).toFixed(1).replace('.', ',');
    const isUp = diff > 0;
    const arrow = isUp ? '↑' : '↓';
    const sign = isUp ? '+' : '-';
    const cls = isUp ? 'trend-good' : 'trend-bad';
    el.innerHTML = `<span class="${cls}">${arrow} ${sign}${pct} % vs période préc.</span>`;
  },

  render() {
    const { start, end } = PeriodFilter.getDateRange();
    const catFilters = this._activeFilters;

    const allExpenses = Storage.getExpenses();
    const allRevenues = Storage.getRevenues();

    let expenses = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);
    const revenues = allRevenues.filter(r => Utils.getExpenseDate(r) >= start && Utils.getExpenseDate(r) <= end);

    if (catFilters.size) expenses = expenses.filter(e => catFilters.has(e.category));

    const totalRev = revenues.reduce((s, r) => s + r.amount, 0);
    const totalDep = expenses.reduce((s, e) => s + e.amount, 0);
    const solde = totalRev - totalDep;
    const tauxEpargne = totalRev > 0 ? (solde / totalRev * 100).toFixed(1) : '—';

    document.getElementById('flux-kpi-revenus').textContent = Utils.formatCurrency(totalRev);
    document.getElementById('flux-kpi-depenses').textContent = Utils.formatCurrency(totalDep);
    document.getElementById('flux-kpi-solde').textContent = Utils.formatCurrency(solde);
    document.getElementById('flux-kpi-epargne').textContent = tauxEpargne !== '—' ? tauxEpargne.replace('.', ',') + ' %' : '—';

    const prev = this._getPrevPeriodData();
    if (prev) {
      const prevRev = prev.revenues.reduce((s, r) => s + r.amount, 0);
      let prevExp = prev.expenses;
      if (catFilters.size) prevExp = prevExp.filter(e => catFilters.has(e.category));
      const prevDep = prevExp.reduce((s, e) => s + e.amount, 0);
      const prevSolde = prevRev - prevDep;
      this._renderKpiTrend('flux-trend-revenus', totalRev, prevRev);
      this._renderKpiTrend('flux-trend-depenses', totalDep, prevDep);
      this._renderKpiTrend('flux-trend-solde', solde, prevSolde);
      const prevEp = prevRev > 0 ? prevSolde / prevRev * 100 : null;
      this._renderKpiTrend('flux-trend-epargne', parseFloat(tauxEpargne) || 0, prevEp);
    } else {
      ['flux-trend-revenus','flux-trend-depenses','flux-trend-solde','flux-trend-epargne']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    }

    this._renderBarChart(allExpenses, allRevenues);
    this._renderDonut(catFilters);
    this._renderCategoryCards(catFilters);
    this._renderSummaryTable(allExpenses, start, end, catFilters);
  },

  // Toujours Revenus vs Dépenses : ne suit QUE le filtre de période, jamais le filtre de
  // catégorie (celui-ci pilote le graphique par catégorie, le donut et le tableau, pas celui-ci).
  _renderBarChart(allExpenses, allRevenues) {
    const { start, end } = PeriodFilter.getDateRange();

    const months = [];
    let cur = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
    while (cur <= endDate) {
      months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    // Plus la période affiche de mois, plus les barres ont besoin de largeur face au donut
    // (1 mois = 2 barres ; 4+ mois commencent à être serrés) — le donut ne descend jamais
    // sous 35 %.
    const donutPct = months.length <= 1 ? 55 : months.length <= 3 ? 45 : 35;
    const chartsRow = document.getElementById('flux-charts-row');
    if (chartsRow) chartsRow.style.gridTemplateColumns = `${100 - donutPct}fr ${donutPct}fr`;

    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const labels = months.map(m => {
      const [y, mo] = m.split('-').map(Number);
      return MONTHS_FR[mo - 1] + ' ' + String(y).slice(2);
    });

    const getLastDay = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };

    const revByMonth = months.map(m => {
      const mStart = `${m}-01`, mEnd = `${m}-${String(getLastDay(m)).padStart(2, '0')}`;
      const s = mStart < start ? start : mStart, e = mEnd > end ? end : mEnd;
      return allRevenues.filter(r => Utils.getExpenseDate(r) >= s && Utils.getExpenseDate(r) <= e).reduce((sum, r) => sum + r.amount, 0);
    });

    const depByMonth = months.map(m => {
      const mStart = `${m}-01`, mEnd = `${m}-${String(getLastDay(m)).padStart(2, '0')}`;
      const s = mStart < start ? start : mStart, e = mEnd > end ? end : mEnd;
      return allExpenses.filter(ex => Utils.getExpenseDate(ex) >= s && Utils.getExpenseDate(ex) <= e).reduce((sum, ex) => sum + ex.amount, 0);
    });

    const soldeByMonth = revByMonth.map((r, i) => r - depByMonth[i]);

    Charts.fluxBar(labels, revByMonth, depByMonth, soldeByMonth);
  },

  // Dépenses de la période groupées par catégorie, triées par montant décroissant — brut,
  // sans regroupement (une entrée par catégorie ayant une dépense, jamais filtré par
  // catégorie : seule la période compte ici). Source commune à _categoryBreakdown (donut,
  // qui y ajoute le regroupement top 6 + « Autres ») et aux cartes (qui veulent tout voir).
  _categoryTotals() {
    const byCategory = {};
    const { start, end } = PeriodFilter.getDateRange();
    Storage.getExpenses()
      .filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end)
      .forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  },

  // Répartition pour le donut : top 6 + « Autres » (au-delà, le camembert devient illisible).
  _categoryBreakdown() {
    let entries = this._categoryTotals();
    const total = entries.reduce((s, [, v]) => s + v, 0);

    if (entries.length > 6) {
      const autres = entries.slice(6).reduce((s, [, v]) => s + v, 0);
      entries = [...entries.slice(0, 6), ['Autres', autres]];
    }
    return { entries, total };
  },

  _renderDonut(catFilters) {
    const { entries, total } = this._categoryBreakdown();
    const colors = entries.map(([label]) => Utils.getCategoryColor(label));

    Charts.fluxDonut(
      entries.map(([k]) => k),
      entries.map(([, v]) => v),
      colors,
      catFilters,
      (label) => this.toggleFilter(label)
    );

    const legend = document.getElementById('flux-donut-legend');
    if (legend) {
      if (!entries.length) { legend.innerHTML = ''; return; }
      // Toujours en 2 colonnes ; juste pastille + nom + pourcentage, pas de barre/montant.
      legend.innerHTML = entries.map(([label, value], i) => {
        const pct = total > 0 ? (value / total * 100) : 0;
        const pctStr = pct.toFixed(1);
        const color = colors[i];
        const isActive = catFilters.size > 0 && catFilters.has(label);
        const isFiltered = catFilters.size > 0 && !catFilters.has(label);
        const safeName = label.replace(/'/g, "\\'");
        return `<div class="dl-item${isActive ? ' active' : ''}${isFiltered ? ' dimmed' : ''}" style="--ic:${color}" onclick="Flux.toggleFilter('${safeName}')">
          <span class="dl-dot" style="background:${color}"></span>
          <span class="dl-name">${label}</span>
          <span class="dl-pct">${pctStr}%</span>
        </div>`;
      }).join('');
    }
  },

  // Dépenses par catégorie en cartes : toutes les catégories ayant une dépense sur la période
  // (_categoryTotals, PAS le regroupement top 6 + « Autres » du donut — ce dernier reste
  // réservé au camembert), une carte par catégorie (icône, nom, montant, barre proportionnelle
  // au MAX de la période — pas au total). Reliée aux mêmes filtres que le donut/tableau (clic =
  // même bascule de filtre).
  _renderCategoryCards(catFilters) {
    const container = document.getElementById('flux-cat-cards');
    if (!container) return;
    const entries = this._categoryTotals();
    if (!entries.length) { container.innerHTML = ''; return; }

    const max = Math.max(...entries.map(([, v]) => v));
    container.innerHTML = entries.map(([label, value]) => {
      const color = Utils.getCategoryColor(label);
      const icon = Categories._meta(label).icon;
      const barW = max > 0 ? (value / max * 100).toFixed(1) : 0;
      const isActive = catFilters.size > 0 && catFilters.has(label);
      const isFiltered = catFilters.size > 0 && !catFilters.has(label);
      const safeName = label.replace(/'/g, "\\'");
      return `<div class="flux-cat-card${isActive ? ' active' : ''}${isFiltered ? ' dimmed' : ''}" onclick="Flux.toggleFilter('${safeName}')">
        <div class="fcc-top"><span class="fcc-ico">${icon}</span><span class="fcc-name">${label}</span></div>
        <div class="fcc-amount">${Utils.formatCurrency(value)}</div>
        <div class="fcc-bar-bg"><div class="fcc-bar-fill" style="width:${barW}%;background:${color}"></div></div>
      </div>`;
    }).join('');
  },

  toggleCatExpand(cat) {
    if (this._expandedCats.has(cat)) this._expandedCats.delete(cat);
    else this._expandedCats.add(cat);
    const { start, end } = PeriodFilter.getDateRange();
    this._renderSummaryTable(Storage.getExpenses(), start, end, this._activeFilters);
  },

  _renderSummaryTable(allExpenses, start, end, catFilters) {
    let expenses = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);
    if (catFilters.size) expenses = expenses.filter(e => catFilters.has(e.category));

    const tbody = document.getElementById('flux-summary-tbody');
    const empty = document.getElementById('flux-summary-empty');
    const title = document.getElementById('flux-summary-title');
    const thLabel = document.getElementById('flux-summary-th-label');
    if (!tbody) return;

    const catLabel = this._catLabel();
    const showSub = catFilters.size === 1;

    if (title) title.textContent = catFilters.size ? `Répartition — ${catLabel}` : 'Répartition par catégorie';
    if (thLabel) thLabel.textContent = showSub ? 'Sous-catégorie' : 'Catégorie';

    if (!expenses.length) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    const groups = {};
    expenses.forEach(e => {
      const key = showSub ? (e.subcategory || '—') : e.category;
      if (!groups[key]) groups[key] = { amount: 0, count: 0, subs: {} };
      groups[key].amount += e.amount;
      groups[key].count++;
      if (!showSub) {
        const sub = e.subcategory || '—';
        if (!groups[key].subs[sub]) groups[key].subs[sub] = { amount: 0, count: 0 };
        groups[key].subs[sub].amount += e.amount;
        groups[key].subs[sub].count++;
      }
    });

    const total = Object.values(groups).reduce((s, g) => s + g.amount, 0);
    const sorted = Object.entries(groups).sort((a, b) => b[1].amount - a[1].amount);

    const rows = [];
    sorted.forEach(([label, g]) => {
      const pct    = total > 0 ? (g.amount / total * 100) : 0;
      const pctStr = pct.toFixed(1);
      const barW   = Math.min(100, pct).toFixed(1);
      const color  = !showSub ? Utils.getCategoryColor(label) : '#6366f1';
      const hex22  = color + '22';

      if (!showSub) {
        const subEntries = Object.entries(g.subs).sort((a, b) => b[1].amount - a[1].amount);
        const hasSubs = subEntries.length > 0 && !(subEntries.length === 1 && subEntries[0][0] === '—');
        const isExpanded = this._expandedCats.has(label);
        const expandBtn = hasSubs
          ? `<button class="srow-expand-btn${isExpanded ? ' open' : ''}" onclick="event.stopPropagation();Flux.toggleCatExpand('${label.replace(/'/g, "\\'")}')" title="${isExpanded ? 'Réduire' : 'Détailler'}">▶</button>`
          : `<span class="srow-expand-ph"></span>`;

        rows.push(`<tr class="srow" style="--rc:${color}" onclick="Flux._togglePill('${label.replace(/'/g, "\\'")}')">
          <td class="srow-td-label">
            <div class="srow-label-inner">${expandBtn}<span class="srow-dot" style="background:${color}"></span><span class="srow-name">${label}</span></div>
          </td>
          <td class="srow-td-amount">${Utils.formatCurrency(g.amount)}</td>
          <td class="srow-td-bar">
            <div class="srow-bar-outer">
              <div class="srow-bar-track" style="background:${hex22}"><div class="srow-bar-fill" style="width:${barW}%;background:${color}"></div></div>
              <span class="srow-pct">${pctStr}%</span>
            </div>
          </td>
          <td class="srow-td-count">${g.count}</td>
        </tr>`);

        if (isExpanded && hasSubs) {
          subEntries.forEach(([sub, sg]) => {
            const sPct  = g.amount > 0 ? (sg.amount / g.amount * 100) : 0;
            const sPctS = sPct.toFixed(1);
            const sBarW = Math.min(100, sPct).toFixed(1);
            rows.push(`<tr class="srow srow-sub" style="--rc:${color}">
              <td class="srow-td-label">
                <div class="srow-sub-inner"><span class="srow-sub-tree">└</span><span class="srow-sub-name">${sub}</span></div>
              </td>
              <td class="srow-td-amount srow-sub-amount">${Utils.formatCurrency(sg.amount)}</td>
              <td class="srow-td-bar">
                <div class="srow-bar-outer">
                  <div class="srow-bar-track" style="background:${hex22}"><div class="srow-bar-fill" style="width:${sBarW}%;background:${color}88"></div></div>
                  <span class="srow-pct">${sPctS}%</span>
                </div>
              </td>
              <td class="srow-td-count srow-sub-count">${sg.count}</td>
            </tr>`);
          });
        }
      } else {
        rows.push(`<tr class="srow" style="--rc:${color}">
          <td class="srow-td-label">
            <div class="srow-label-inner"><span class="srow-expand-ph"></span><span class="srow-name">${label}</span></div>
          </td>
          <td class="srow-td-amount">${Utils.formatCurrency(g.amount)}</td>
          <td class="srow-td-bar">
            <div class="srow-bar-outer">
              <div class="srow-bar-track" style="background:${hex22}"><div class="srow-bar-fill" style="width:${barW}%;background:${color}"></div></div>
              <span class="srow-pct">${pctStr}%</span>
            </div>
          </td>
          <td class="srow-td-count">${g.count}</td>
        </tr>`);
      }
    });

    tbody.innerHTML = rows.join('');
  },
};
