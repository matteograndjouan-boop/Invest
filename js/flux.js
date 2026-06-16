const Flux = {
  _activeFilters: new Set(),
  _multiMode: false,
  _expandedCats: new Set(),
  _BASE_COLORS: ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#6b7280'],

  init() {
    PeriodFilter.onChange(() => {
      if (!document.getElementById('section-flux').classList.contains('hidden')) this.render();
    });
    this._renderCatPills();
  },

  _getCatColor(catName) {
    const cats = Storage.getCategories().map(c => c.name);
    const idx = cats.indexOf(catName);
    return this._BASE_COLORS[(idx >= 0 ? idx : 0) % this._BASE_COLORS.length];
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
    const catBtns = cats.map((c, i) => {
      const color = this._BASE_COLORS[i % this._BASE_COLORS.length];
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

  _renderKpiTrend(id, current, prev, lowerIsBetter) {
    const el = document.getElementById(id);
    if (!el) return;
    if (prev == null || prev === 0) { el.innerHTML = ''; return; }
    const diff = current - prev;
    const pct = Math.abs((diff / prev) * 100).toFixed(1);
    const isUp = diff > 0;
    const isGood = lowerIsBetter ? !isUp : isUp;
    const arrow = isUp ? '↑' : '↓';
    const cls = isGood ? 'trend-good' : 'trend-bad';
    el.innerHTML = `<span class="${cls}">${arrow} ${pct}% vs mois préc.</span>`;
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
    const soldeEl = document.getElementById('flux-kpi-solde');
    soldeEl.textContent = Utils.formatCurrency(solde);
    soldeEl.className = 'kpi-value ' + (solde >= 0 ? 'positive' : 'negative');
    document.getElementById('flux-kpi-solde-card').className = 'kpi-card ' + (solde >= 0 ? 'success' : 'danger');
    const epEl = document.getElementById('flux-kpi-epargne');
    epEl.textContent = tauxEpargne !== '—' ? tauxEpargne + ' %' : '—';
    epEl.className = 'kpi-value ' + (parseFloat(tauxEpargne) >= 0 ? 'positive' : 'negative');

    const prev = this._getPrevPeriodData();
    if (prev) {
      const prevRev = prev.revenues.reduce((s, r) => s + r.amount, 0);
      let prevExp = prev.expenses;
      if (catFilters.size) prevExp = prevExp.filter(e => catFilters.has(e.category));
      const prevDep = prevExp.reduce((s, e) => s + e.amount, 0);
      const prevSolde = prevRev - prevDep;
      this._renderKpiTrend('flux-trend-revenus', totalRev, prevRev, false);
      this._renderKpiTrend('flux-trend-depenses', totalDep, prevDep, true);
      this._renderKpiTrend('flux-trend-solde', solde, prevSolde, false);
      const prevEp = prevRev > 0 ? prevSolde / prevRev * 100 : null;
      this._renderKpiTrend('flux-trend-epargne', parseFloat(tauxEpargne) || 0, prevEp, false);
    } else {
      ['flux-trend-revenus','flux-trend-depenses','flux-trend-solde','flux-trend-epargne']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    }

    this._renderBarChart(allExpenses, allRevenues, catFilters);
    this._renderDonut(expenses, catFilters);
    this._renderMonthlyChart(allExpenses, allRevenues, catFilters);
    this._renderSummaryTable(allExpenses, start, end, catFilters);
  },

  _renderBarChart(allExpenses, allRevenues, catFilters) {
    const { start, end } = PeriodFilter.getDateRange();

    const months = [];
    let cur = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
    while (cur <= endDate) {
      months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

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
      let exp = allExpenses.filter(ex => Utils.getExpenseDate(ex) >= s && Utils.getExpenseDate(ex) <= e);
      if (catFilters.size) exp = exp.filter(ex => catFilters.has(ex.category));
      return exp.reduce((sum, ex) => sum + ex.amount, 0);
    });

    const soldeByMonth = revByMonth.map((r, i) => r - depByMonth[i]);
    const catLabel = this._catLabel();

    const titleEl = document.getElementById('flux-bar-title');
    if (titleEl) titleEl.textContent = catFilters.size ? `Dépenses — ${catLabel}` : 'Revenus vs Dépenses';

    Charts.fluxBar(labels, revByMonth, depByMonth, catFilters.size ? null : soldeByMonth, catLabel || null);
  },

  _renderDonut(expenses, catFilters) {
    const byCategory = {};
    const { start, end } = PeriodFilter.getDateRange();
    Storage.getExpenses()
      .filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end)
      .forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });

    let entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);

    if (entries.length > 6) {
      const autres = entries.slice(6).reduce((s, [, v]) => s + v, 0);
      entries = [...entries.slice(0, 6), ['Autres', autres]];
    }

    Charts.fluxDonut(
      entries.map(([k]) => k),
      entries.map(([, v]) => v),
      catFilters,
      (label) => this.toggleFilter(label)
    );

    const legend = document.getElementById('flux-donut-legend');
    if (legend) {
      if (!entries.length) { legend.innerHTML = ''; return; }
      legend.innerHTML = entries.map(([label, value], i) => {
        const pct = total > 0 ? (value / total * 100) : 0;
        const pctStr = pct.toFixed(1);
        const barW = Math.min(100, pct).toFixed(1);
        const color = this._BASE_COLORS[i % this._BASE_COLORS.length];
        const isActive = catFilters.size > 0 && catFilters.has(label);
        const isFiltered = catFilters.size > 0 && !catFilters.has(label);
        const safeName = label.replace(/'/g, "\\'");
        return `<div class="dl-item${isActive ? ' active' : ''}${isFiltered ? ' dimmed' : ''}" style="--ic:${color}" onclick="Flux.toggleFilter('${safeName}')">
          <div class="dl-top">
            <span class="dl-dot" style="background:${color}"></span>
            <span class="dl-name">${label}</span>
            <span class="dl-pct">${pctStr}%</span>
          </div>
          <div class="dl-bottom">
            <div class="dl-bar-bg"><div class="dl-bar-fill" style="width:${barW}%;background:${color}"></div></div>
            <span class="dl-val">${Utils.formatCurrency(value)}</span>
          </div>
        </div>`;
      }).join('');
    }
  },

  _renderMonthlyChart(allExpenses, allRevenues, catFilters) {
    const { start, end } = PeriodFilter.getDateRange();
    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const labels = [];

    const startD = new Date(start + 'T00:00:00');
    const endD   = new Date(end   + 'T00:00:00');
    const monthDiff =
      (endD.getFullYear() - startD.getFullYear()) * 12 +
      (endD.getMonth()    - startD.getMonth());

    const catLabel = this._catLabel();
    const periodLabel = PeriodFilter.getLabel();
    const titleEl = document.getElementById('flux-monthly-title');

    // When a category filter is active → simple bar for the selected category(ies)
    if (catFilters.size) {
      const depData = [];
      if (monthDiff === 0) {
        let cur = new Date(startD);
        while (cur <= endD) {
          const day = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
          labels.push(String(cur.getDate()));
          depData.push(allExpenses.filter(e => e.date === day && catFilters.has(e.category)).reduce((s, e) => s + e.amount, 0));
          cur.setDate(cur.getDate() + 1);
        }
      } else {
        let cur = new Date(startD.getFullYear(), startD.getMonth(), 1);
        while (cur <= endD) {
          const m = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
          const last = new Date(cur.getFullYear(), cur.getMonth()+1, 0).getDate();
          const mStart = `${m}-01`, mEnd = `${m}-${String(last).padStart(2,'0')}`;
          const s = mStart < start ? start : mStart, e = mEnd > end ? end : mEnd;
          labels.push(MONTHS_FR[cur.getMonth()] + ' ' + String(cur.getFullYear()).slice(2));
          depData.push(allExpenses.filter(ex => catFilters.has(ex.category) && Utils.getExpenseDate(ex) >= s && Utils.getExpenseDate(ex) <= e).reduce((sum, ex) => sum + ex.amount, 0));
          cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
        }
      }
      if (titleEl) titleEl.textContent = `Évolution — ${catLabel} · ${periodLabel}`;
      Charts.fluxMonthly(labels, depData, null, catLabel);
      return;
    }

    // No filter → stacked bars by category (multi-month) or simple dépenses bars (single month/day)
    const cats = Storage.getCategories().map(c => c.name);
    const catColors = cats.map((_, i) => this._BASE_COLORS[i % this._BASE_COLORS.length]);

    if (monthDiff === 0) {
      // Day-by-day view for single month: simple dépenses bar + cumulative line
      const depData = [], cumData = [];
      let cumul = 0;
      let cur = new Date(startD);
      while (cur <= endD) {
        const day = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
        labels.push(String(cur.getDate()));
        const dayDep = allExpenses.filter(e => e.date === day).reduce((s, e) => s + e.amount, 0);
        depData.push(dayDep);
        cumul += dayDep;
        cumData.push(cumul);
        cur.setDate(cur.getDate() + 1);
      }
      if (titleEl) titleEl.textContent = `Dépenses quotidiennes · ${periodLabel}`;
      Charts.fluxMonthlyCumul(labels, depData, cumData);
    } else {
      // Multi-month: stacked by category
      const catData = cats.map((name, ci) => ({ name, color: catColors[ci], values: [] }));
      let cur = new Date(startD.getFullYear(), startD.getMonth(), 1);
      while (cur <= endD) {
        const m = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
        const last = new Date(cur.getFullYear(), cur.getMonth()+1, 0).getDate();
        const mStart = `${m}-01`, mEnd = `${m}-${String(last).padStart(2,'0')}`;
        const s = mStart < start ? start : mStart, e = mEnd > end ? end : mEnd;
        labels.push(MONTHS_FR[cur.getMonth()] + ' ' + String(cur.getFullYear()).slice(2));
        const monthExp = allExpenses.filter(ex => Utils.getExpenseDate(ex) >= s && Utils.getExpenseDate(ex) <= e);
        // "Autres" bucket for expenses not in known categories
        let othersTotal = 0;
        const knownCatTotals = {};
        monthExp.forEach(ex => {
          if (cats.includes(ex.category)) {
            knownCatTotals[ex.category] = (knownCatTotals[ex.category] || 0) + ex.amount;
          } else {
            othersTotal += ex.amount;
          }
        });
        catData.forEach(cd => { cd.values.push(knownCatTotals[cd.name] || 0); });
        if (othersTotal > 0) {
          // add to last category or ignore — handled below
        }
        cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
      }
      // Only include categories that have at least one non-zero value
      const activeCats = catData.filter(cd => cd.values.some(v => v > 0));
      if (titleEl) titleEl.textContent = `Dépenses par catégorie · ${periodLabel}`;
      Charts.fluxMonthlyStacked(labels, activeCats);
    }
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
      const color  = !showSub ? this._getCatColor(label) : '#6366f1';
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
