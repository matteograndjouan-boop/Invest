const Flux = {
  _activeFilter: null,
  _BASE_COLORS: ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#6b7280'],

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
    const active = this._activeFilter;
    container.innerHTML =
      `<button class="flux-pill${!active ? ' active' : ''}" onclick="Flux._setPillFilter(null)">Toutes</button>` +
      cats.map(c =>
        `<button class="flux-pill${active === c ? ' active' : ''}" onclick="Flux._setPillFilter('${c}')">${c}</button>`
      ).join('');
  },

  _setPillFilter(cat) {
    this._activeFilter = cat;
    this._renderCatPills();
    this.render();
  },

  toggleFilter(label) {
    if (!label || label === 'Autres') return;
    this._activeFilter = (this._activeFilter === label) ? null : label;
    this._renderCatPills();
    this.render();
  },

  clearFilter() {
    this._activeFilter = null;
    this._renderCatPills();
    this.render();
  },

  _getEffectiveCatFilter() {
    return this._activeFilter || '';
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
      expenses: Storage.getExpenses().filter(e => e.date >= start && e.date <= end),
      revenues: Storage.getRevenues().filter(r => r.date >= start && r.date <= end),
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
    const catFilter = this._getEffectiveCatFilter();

    const allExpenses = Storage.getExpenses();
    const allRevenues = Storage.getRevenues();

    let expenses = allExpenses.filter(e => e.date >= start && e.date <= end);
    const revenues = allRevenues.filter(r => r.date >= start && r.date <= end);

    if (catFilter) expenses = expenses.filter(e => e.category === catFilter);

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

    // KPI trends
    const prev = this._getPrevPeriodData();
    if (prev) {
      const prevRev = prev.revenues.reduce((s, r) => s + r.amount, 0);
      let prevExp = prev.expenses;
      if (catFilter) prevExp = prevExp.filter(e => e.category === catFilter);
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

    this._renderBarChart(allExpenses, allRevenues, catFilter);
    this._renderDonut(expenses, catFilter);
    this._renderSummaryTable(allExpenses, start, end, catFilter);
  },

  _renderBarChart(allExpenses, allRevenues, catFilter) {
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
      return allRevenues.filter(r => r.date >= s && r.date <= e).reduce((sum, r) => sum + r.amount, 0);
    });

    const depByMonth = months.map(m => {
      const mStart = `${m}-01`, mEnd = `${m}-${String(getLastDay(m)).padStart(2, '0')}`;
      const s = mStart < start ? start : mStart, e = mEnd > end ? end : mEnd;
      let exp = allExpenses.filter(ex => ex.date >= s && ex.date <= e);
      if (catFilter) exp = exp.filter(ex => ex.category === catFilter);
      return exp.reduce((sum, ex) => sum + ex.amount, 0);
    });

    const soldeByMonth = revByMonth.map((r, i) => r - depByMonth[i]);

    const titleEl = document.getElementById('flux-bar-title');
    if (titleEl) titleEl.textContent = catFilter ? `Dépenses — ${catFilter}` : 'Revenus vs Dépenses';

    Charts.fluxBar(labels, revByMonth, depByMonth, soldeByMonth, catFilter || null);
  },

  _renderDonut(expenses, activeCategory) {
    const byCategory = {};
    const { start, end } = PeriodFilter.getDateRange();
    Storage.getExpenses()
      .filter(e => e.date >= start && e.date <= end)
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
      activeCategory || null,
      (label) => this.toggleFilter(label)
    );

    // Custom HTML legend
    const legend = document.getElementById('flux-donut-legend');
    if (legend) {
      if (!entries.length) { legend.innerHTML = ''; return; }
      legend.innerHTML = entries.map(([label, value], i) => {
        const pct = total > 0 ? (value / total * 100).toFixed(1) : '0.0';
        const color = this._BASE_COLORS[i % this._BASE_COLORS.length];
        const isActive = activeCategory && label === activeCategory;
        const safeName = label.replace(/'/g, "\\'");
        return `<div class="donut-legend-item${isActive ? ' active' : ''}" onclick="Flux.toggleFilter('${safeName}')">
          <span class="donut-legend-dot" style="background:${color}"></span>
          <span class="donut-legend-name">${label}</span>
          <span class="donut-legend-pct">${pct}%</span>
          <span class="donut-legend-val">${Utils.formatCurrency(value)}</span>
        </div>`;
      }).join('');
    }
  },

  _renderSummaryTable(allExpenses, start, end, catFilter) {
    let expenses = allExpenses.filter(e => e.date >= start && e.date <= end);
    if (catFilter) expenses = expenses.filter(e => e.category === catFilter);

    const tbody = document.getElementById('flux-summary-tbody');
    const empty = document.getElementById('flux-summary-empty');
    const title = document.getElementById('flux-summary-title');
    const thLabel = document.getElementById('flux-summary-th-label');
    if (!tbody) return;

    if (title) title.textContent = catFilter ? `Répartition — ${catFilter}` : 'Répartition par catégorie';
    if (thLabel) thLabel.textContent = catFilter ? 'Sous-catégorie' : 'Catégorie';

    if (!expenses.length) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    const groups = {};
    expenses.forEach(e => {
      const key = catFilter ? (e.subcategory || '—') : e.category;
      if (!groups[key]) groups[key] = { amount: 0, count: 0 };
      groups[key].amount += e.amount;
      groups[key].count++;
    });

    const total = Object.values(groups).reduce((s, g) => s + g.amount, 0);
    const sorted = Object.entries(groups).sort((a, b) => b[1].amount - a[1].amount);

    tbody.innerHTML = sorted.map(([label, g]) => {
      const pct = total > 0 ? (g.amount / total * 100).toFixed(1) : '0.0';
      const barW = total > 0 ? Math.min(100, g.amount / total * 100).toFixed(1) : 0;
      const clickAttr = !catFilter ? `onclick="Flux._setPillFilter('${label.replace(/'/g, "\\'")}')" style="cursor:pointer"` : '';
      return `<tr ${clickAttr}>
        <td>${label}${!catFilter ? ' <span class="summary-row-hint">→</span>' : ''}</td>
        <td class="text-right negative">${Utils.formatCurrency(g.amount)}</td>
        <td class="text-right">
          <div class="summary-bar-wrap">
            <div class="summary-bar" style="width:${barW}%"></div>
            <span>${pct}%</span>
          </div>
        </td>
        <td class="text-right" style="color:var(--text-muted)">${g.count}</td>
      </tr>`;
    }).join('');
  },
};
