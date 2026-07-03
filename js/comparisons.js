const Comparisons = {
  periodA: '',
  periodB: '',

  _shortLabel(period) {
    const [y, m] = period.split('-').map(Number);
    const MONTHS = ['jan.','fév.','mar.','avr.','mai','jun.','jul.','aoû.','sep.','oct.','nov.','déc.'];
    return MONTHS[m - 1] + ' \'' + String(y).slice(2);
  },

  init() {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = now.getMonth() === 0
      ? `${now.getFullYear() - 1}-12`
      : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

    this.periodA = lastMonth;
    this.periodB = thisMonth;

    const selA = document.getElementById('comp-period-a');
    const selB = document.getElementById('comp-period-b');
    if (selA) { selA.value = this.periodA; selA.addEventListener('change', (e) => { this.periodA = e.target.value; this.render(); }); }
    if (selB) { selB.value = this.periodB; selB.addEventListener('change', (e) => { this.periodB = e.target.value; this.render(); }); }

    // Re-render quand le toggle Date comptable/effective change (filtre global).
    PeriodFilter.onChange(() => {
      if (!document.getElementById('section-comparisons')?.classList.contains('hidden')) this.render();
    });
  },

  render() {
    const expenses = Storage.getExpenses();
    // Respecte le mode date comptable/effective (getExpenseDate → mois filtrant).
    const expMonth = e => Utils.getExpenseDate(e).substring(0, 7);
    const expA = expenses.filter(e => expMonth(e) === this.periodA);
    const expB = expenses.filter(e => expMonth(e) === this.periodB);

    // Update period name labels
    const nameA = document.getElementById('comp-period-name-a');
    const nameB = document.getElementById('comp-period-name-b');
    if (nameA) nameA.textContent = Utils.getMonthLabel(this.periodA);
    if (nameB) nameB.textContent = Utils.getMonthLabel(this.periodB);
    const deltaLabel = document.getElementById('comp-delta-label');
    if (deltaLabel) deltaLabel.textContent = `${this._shortLabel(this.periodB)} vs ${this._shortLabel(this.periodA)}`;
    const headA = document.getElementById('cc-head-a');
    const headB = document.getElementById('cc-head-b');
    if (headA) headA.textContent = `← ${this._shortLabel(this.periodA)}`;
    if (headB) headB.textContent = `${this._shortLabel(this.periodB)} →`;

    const totalA = expA.reduce((s, e) => s + e.amount, 0);
    const totalB = expB.reduce((s, e) => s + e.amount, 0);
    const diff   = totalB - totalA;
    const pct    = totalA > 0 ? (diff / totalA * 100) : (totalB > 0 ? 100 : 0);

    // Panel KPIs
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('comp-total-a', Utils.formatCurrency(totalA));
    set('comp-total-b', Utils.formatCurrency(totalB));

    this._renderPanelStats('comp-stats-a', expA, totalA);
    this._renderPanelStats('comp-stats-b', expB, totalB);

    // Delta card
    const diffEl  = document.getElementById('comp-total-diff');
    const pctEl   = document.getElementById('comp-delta-pct');
    const iconEl  = document.getElementById('comp-delta-icon');
    const cardEl  = document.getElementById('comp-total-diff-card');
    if (diffEl) {
      diffEl.textContent = (diff >= 0 ? '+' : '') + Utils.formatCurrency(diff);
      diffEl.className = 'comp-delta-val ' + (diff <= 0 ? 'positive' : 'negative');
    }
    if (pctEl)  pctEl.textContent  = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
    if (iconEl) iconEl.textContent = diff > 0 ? '↑' : diff < 0 ? '↓' : '⟺';
    if (cardEl) cardEl.className   = 'comp-delta-card ' + (diff <= 0 ? 'good' : 'bad');

    this._renderCatList(expA, expB, totalA, totalB);
    Charts.comparisonButterfly(expA, expB, this.periodA, this.periodB);
  },

  _renderPanelStats(containerId, expenses, total) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const count = expenses.length;
    const avg   = count > 0 ? total / count : 0;
    const cats  = {};
    expenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
    const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    el.innerHTML = `
      <div class="comp-stat-row"><span class="comp-stat-label">Transactions</span><span class="comp-stat-val">${count}</span></div>
      <div class="comp-stat-row"><span class="comp-stat-label">Panier moyen</span><span class="comp-stat-val">${Utils.formatCurrency(avg)}</span></div>
      ${topCat ? `<div class="comp-stat-row"><span class="comp-stat-label">Top catégorie</span><span class="comp-stat-val comp-stat-top">${topCat[0]}</span></div>` : ''}
    `;
  },

  _renderCatList(expA, expB, totalA, totalB) {
    const container = document.getElementById('comp-cat-list');
    const empty     = document.getElementById('comp-empty');
    if (!container) return;

    const allCats = [...new Set([...expA.map(e => e.category), ...expB.map(e => e.category)])];
    const allCatsSorted = Storage.getCategories().map(c => c.name).filter(n => allCats.includes(n))
      .concat(allCats.filter(n => !Storage.getCategories().map(c => c.name).includes(n)));

    if (!allCatsSorted.length) {
      container.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    const maxVal = Math.max(
      ...allCatsSorted.map(cat => expA.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)),
      ...allCatsSorted.map(cat => expB.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)),
      1
    );

    const rows = allCatsSorted.map(cat => {
      const amtA = expA.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      const amtB = expB.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      const diff = amtB - amtA;
      const pct  = amtA > 0 ? (diff / amtA * 100) : (amtB > 0 ? 100 : 0);
      const barA = (amtA / maxVal * 100).toFixed(1);
      const barB = (amtB / maxVal * 100).toFixed(1);
      const cls  = diff <= 0 ? 'positive' : 'negative';
      const sign = diff >= 0 ? '+' : '';
      const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
      const color = Utils.getCategoryColor(cat);

      return `<div class="cc-row">
        <div class="cc-side-a">
          <span class="cc-amt cc-amt-a">${amtA > 0 ? Utils.formatCurrency(amtA) : '—'}</span>
          <div class="cc-bar-wrap"><div class="cc-fill-a" style="width:${barA}%;background:${color}"></div></div>
        </div>
        <div class="cc-name-col">
          <span class="cc-dot" style="background:${color}"></span>
          <span class="cc-name">${cat}</span>
        </div>
        <div class="cc-side-b">
          <div class="cc-bar-wrap"><div class="cc-fill-b" style="width:${barB}%;background:${color}"></div></div>
          <span class="cc-amt cc-amt-b">${amtB > 0 ? Utils.formatCurrency(amtB) : '—'}</span>
        </div>
        <div class="cc-delta ${cls}">
          <span class="cc-delta-arrow">${arrow}</span>
          <span class="cc-delta-amt">${amtA > 0 || amtB > 0 ? sign + Utils.formatCurrency(Math.abs(diff)) : '—'}</span>
          ${amtA > 0 ? `<span class="cc-delta-pct">${sign}${pct.toFixed(0)}%</span>` : ''}
        </div>
      </div>`;
    });

    container.innerHTML = rows.join('');
  },
};
