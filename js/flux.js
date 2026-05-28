const Flux = {
  activeView: 'depenses',

  init() {
    PeriodFilter.onChange(() => { if (document.getElementById('section-flux') && !document.getElementById('section-flux').classList.contains('hidden')) this.render(); });

    const catFilter = document.getElementById('flux-filter-cat');
    if (catFilter) {
      catFilter.addEventListener('change', () => {
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

  setView(view) {
    this.activeView = view;
    document.getElementById('flux-view-depenses').classList.toggle('hidden', view !== 'depenses');
    document.getElementById('flux-view-revenus').classList.toggle('hidden', view !== 'revenus');
    document.getElementById('flux-btn-depenses').classList.toggle('active', view === 'depenses');
    document.getElementById('flux-btn-revenus').classList.toggle('active', view === 'revenus');
    this.render();
  },

  render() {
    const { start, end } = PeriodFilter.getDateRange();
    const catFilter = document.getElementById('flux-filter-cat')?.value || '';
    const subcatFilter = document.getElementById('flux-filter-subcat')?.value || '';

    const allExpenses = Storage.getExpenses();
    const allRevenues = Storage.getRevenues();

    let expenses = allExpenses.filter(e => e.date >= start && e.date <= end);
    let revenues = allRevenues.filter(r => r.date >= start && r.date <= end);

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

    this._renderBarChart(allExpenses, allRevenues, catFilter, subcatFilter);

    if (this.activeView === 'depenses') {
      this._renderDonut(expenses);
      this._renderExpensesTable(expenses);
    } else {
      this._renderRevenuesTable(revenues);
    }
  },

  _renderBarChart(allExpenses, allRevenues, catFilter, subcatFilter) {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const labels = months.map(m => { const [y, mo] = m.split('-').map(Number); return MONTHS_FR[mo-1] + ' ' + String(y).slice(2); });

    const revByMonth = months.map(m => allRevenues.filter(r => r.date.startsWith(m)).reduce((s, r) => s + r.amount, 0));
    const depByMonth = months.map(m => {
      let exp = allExpenses.filter(e => e.date.startsWith(m));
      if (catFilter) { exp = exp.filter(e => e.category === catFilter); if (subcatFilter) exp = exp.filter(e => e.subcategory === subcatFilter); }
      return exp.reduce((s, e) => s + e.amount, 0);
    });

    Charts.fluxBar(labels, revByMonth, depByMonth);
  },

  _renderDonut(expenses) {
    const byCategory = {};
    expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    let entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (entries.length > 6) {
      const autres = entries.slice(6).reduce((s, [, v]) => s + v, 0);
      entries = [...entries.slice(0, 6), ['Autres', autres]];
    }
    Charts.fluxDonut(entries.map(([k]) => k), entries.map(([, v]) => v));
  },

  _renderExpensesTable(expenses) {
    const tbody = document.getElementById('flux-expenses-tbody');
    const empty = document.getElementById('flux-expenses-empty');
    if (!tbody) return;
    const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
    empty.classList.toggle('hidden', sorted.length > 0);
    tbody.innerHTML = sorted.map(exp => `<tr>
      <td>${Utils.formatDate(exp.date)}</td>
      <td>${exp.description}</td>
      <td><span class="badge badge-category">${exp.category}</span>${exp.subcategory ? `<span class="badge badge-subcategory">${exp.subcategory}</span>` : ''}</td>
      <td><strong>${Utils.formatCurrency(exp.amount)}</strong></td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="Expenses.edit('${exp.id}')">✏️</button>
        <button class="btn-icon btn-danger" onclick="Expenses.delete('${exp.id}')">🗑️</button>
      </td>
    </tr>`).join('');
  },

  _renderRevenuesTable(revenues) {
    const tbody = document.getElementById('flux-revenus-tbody');
    const empty = document.getElementById('flux-revenus-empty');
    if (!tbody) return;
    const sorted = [...revenues].sort((a, b) => b.date.localeCompare(a.date));
    empty.classList.toggle('hidden', sorted.length > 0);
    tbody.innerHTML = sorted.map(rev => `<tr>
      <td>${Utils.formatDate(rev.date)}</td>
      <td>${rev.description}</td>
      <td><span class="badge badge-revenue">${rev.category}</span></td>
      <td><strong class="positive">${Utils.formatCurrency(rev.amount)}</strong></td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="Revenues.edit('${rev.id}')">✏️</button>
        <button class="btn-icon btn-danger" onclick="Revenues.delete('${rev.id}')">🗑️</button>
      </td>
    </tr>`).join('');
  },
};
