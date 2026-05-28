const Flux = {
  _activeFilter: null, // catégorie active par clic sur le graphique

  init() {
    PeriodFilter.onChange(() => {
      if (!document.getElementById('section-flux').classList.contains('hidden')) this.render();
    });
    const catFilter = document.getElementById('flux-filter-cat');
    if (catFilter) {
      catFilter.addEventListener('change', () => {
        this._activeFilter = null; // reset click filter when dropdown changes
        this._updateSubcatFilter(catFilter.value);
        this.render();
      });
    }
    const subcatFilter = document.getElementById('flux-filter-subcat');
    if (subcatFilter) subcatFilter.addEventListener('change', () => this.render());
    this._populateCatFilter();
  },

  _populateCatFilter() {
    const catFilter = document.getElementById('flux-filter-cat');
    if (!catFilter) return;
    catFilter.innerHTML = '<option value="">Toutes catégories</option>';
    Storage.getCategories().forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name; opt.textContent = cat.name;
      catFilter.appendChild(opt);
    });
  },

  _updateSubcatFilter(catName) {
    const subcatFilter = document.getElementById('flux-filter-subcat');
    if (!subcatFilter) return;
    const subcats = Categories.getSubcats(catName);
    if (subcats.length && catName) {
      subcatFilter.disabled = false;
      subcatFilter.innerHTML = '<option value="">Toutes sous-catégories</option>' +
        subcats.map(s => `<option value="${s}">${s}</option>`).join('');
    } else {
      subcatFilter.disabled = true;
      subcatFilter.innerHTML = '<option value="">Toutes sous-catégories</option>';
    }
  },

  // Appelé au clic sur un segment du donut
  toggleFilter(label) {
    if (!label || label === 'Autres') return; // "Autres" ne filtre pas
    this._activeFilter = (this._activeFilter === label) ? null : label;
    this.render();
  },

  _getEffectiveCatFilter() {
    // Le filtre clic prend la priorité sur le dropdown
    if (this._activeFilter) return this._activeFilter;
    return document.getElementById('flux-filter-cat')?.value || '';
  },

  _renderFilterBadge(catFilter) {
    let badge = document.getElementById('flux-active-filter');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'flux-active-filter';
      badge.className = 'flux-active-filter-badge';
      const filtersRow = document.querySelector('.flux-filters');
      if (filtersRow) filtersRow.after(badge);
    }
    if (catFilter) {
      badge.innerHTML = `Filtre actif : <strong>${catFilter}</strong> <button class="filter-badge-clear" onclick="Flux.clearFilter()">✕ effacer</button>`;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  },

  clearFilter() {
    this._activeFilter = null;
    const catFilter = document.getElementById('flux-filter-cat');
    if (catFilter) catFilter.value = '';
    const subcatFilter = document.getElementById('flux-filter-subcat');
    if (subcatFilter) { subcatFilter.disabled = true; subcatFilter.innerHTML = '<option value="">Toutes sous-catégories</option>'; }
    this.render();
  },

  render() {
    const { start, end } = PeriodFilter.getDateRange();
    const catFilter = this._getEffectiveCatFilter();
    const subcatFilter = this._activeFilter ? '' : (document.getElementById('flux-filter-subcat')?.value || '');

    const allExpenses = Storage.getExpenses();
    const allRevenues = Storage.getRevenues();

    let expenses = allExpenses.filter(e => e.date >= start && e.date <= end);
    const revenues = allRevenues.filter(r => r.date >= start && r.date <= end);

    if (catFilter) {
      expenses = expenses.filter(e => e.category === catFilter);
      if (subcatFilter) expenses = expenses.filter(e => e.subcategory === subcatFilter);
    }

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

    this._renderFilterBadge(catFilter);
    this._renderBarChart(allExpenses, allRevenues, catFilter, subcatFilter);
    this._renderDonut(expenses, catFilter);
  },

  _renderBarChart(allExpenses, allRevenues, catFilter, subcatFilter) {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const labels = months.map(m => {
      const [y, mo] = m.split('-').map(Number);
      return MONTHS_FR[mo - 1] + ' ' + String(y).slice(2);
    });
    const revByMonth = months.map(m => allRevenues.filter(r => r.date.startsWith(m)).reduce((s, r) => s + r.amount, 0));
    const depByMonth = months.map(m => {
      let exp = allExpenses.filter(e => e.date.startsWith(m));
      if (catFilter) { exp = exp.filter(e => e.category === catFilter); if (subcatFilter) exp = exp.filter(e => e.subcategory === subcatFilter); }
      return exp.reduce((s, e) => s + e.amount, 0);
    });
    Charts.fluxBar(labels, revByMonth, depByMonth, catFilter || null);
  },

  _renderDonut(expenses, activeCategory) {
    const byCategory = {};
    // Always compute donut from ALL expenses in period (unfiltered) so all slices stay visible
    const { start, end } = PeriodFilter.getDateRange();
    Storage.getExpenses()
      .filter(e => e.date >= start && e.date <= end)
      .forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });

    let entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
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
  },
};
