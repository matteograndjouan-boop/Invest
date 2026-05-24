const Modal = {
  open(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },
  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  },
};

const Dashboard = {
  render() {
    const investments = Storage.getInvestments();
    const expenses = Storage.getExpenses();
    const budgets = Storage.getBudgets();
    const patrimony = Storage.getPatrimony();

    document.getElementById('current-date').textContent = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }).format(new Date());

    const portfolioValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const portfolioCost = investments.reduce((s, i) => s + i.quantity * i.buyPrice, 0);
    const gain = portfolioValue - portfolioCost;
    const gainPct = portfolioCost > 0 ? (gain / portfolioCost * 100) : 0;

    document.getElementById('kpi-portfolio').textContent = Utils.formatCurrency(portfolioValue);
    const perfEl = document.getElementById('kpi-performance');
    perfEl.textContent = Utils.formatCurrency(gain);
    perfEl.className = 'kpi-value ' + (gain >= 0 ? 'positive' : 'negative');
    document.getElementById('kpi-performance-sub').textContent = Utils.formatPercent(gainPct);

    const manualAssets = patrimony.filter(i => i.type === 'actif').reduce((s, i) => s + i.value, 0);
    const liabilities = patrimony.filter(i => i.type === 'passif').reduce((s, i) => s + i.value, 0);
    const netWorth = portfolioValue + manualAssets - liabilities;
    document.getElementById('kpi-net-worth').textContent = Utils.formatCurrency(netWorth);
    document.getElementById('kpi-net-worth-sub').textContent =
      `Actifs: ${Utils.formatCurrency(portfolioValue + manualAssets)} · Passifs: ${Utils.formatCurrency(liabilities)}`;

    const month = Utils.getCurrentMonth();
    const monthTotal = expenses.filter(e => Utils.getExpenseMonth(e) === month).reduce((s, e) => s + e.amount, 0);
    const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
    const remaining = totalBudget - monthTotal;

    document.getElementById('kpi-expenses').textContent = Utils.formatCurrency(monthTotal);
    const expSubEl = document.getElementById('kpi-expenses-sub');
    expSubEl.textContent = totalBudget > 0 ? `Budget restant: ${Utils.formatCurrency(remaining)}` : 'Aucun budget défini';
    expSubEl.className = 'kpi-sub ' + (totalBudget > 0 ? (remaining >= 0 ? 'positive' : 'negative') : '');

    Charts.portfolioAllocation(investments);
    Charts.expensesBudget(expenses, budgets);
    this._renderRecentInvestments(investments);
    this._renderRecentExpenses(expenses);
  },

  _renderRecentInvestments(investments) {
    const container = document.getElementById('recent-investments');
    const recent = [...investments].sort((a, b) => (b.buyDate || '').localeCompare(a.buyDate || '')).slice(0, 5);
    if (!recent.length) { container.innerHTML = '<p class="text-muted">Aucun investissement</p>'; return; }
    container.innerHTML = recent.map(inv => {
      const value = inv.quantity * inv.currentPrice;
      const gain = value - inv.quantity * inv.buyPrice;
      return `<div class="recent-item">
        <div>
          <strong>${inv.name}</strong>${inv.ticker ? ` <small class="text-muted">· ${inv.ticker}</small>` : ''}<br>
          <small class="text-muted">${Utils.INVESTMENT_TYPES[inv.type]}</small>
        </div>
        <div class="text-right">
          <strong>${Utils.formatCurrency(value)}</strong><br>
          <small class="${gain >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(gain)}</small>
        </div>
      </div>`;
    }).join('');
  },

  _renderRecentExpenses(expenses) {
    const container = document.getElementById('recent-expenses');
    const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    if (!recent.length) { container.innerHTML = '<p class="text-muted">Aucune dépense</p>'; return; }
    container.innerHTML = recent.map(exp => `
      <div class="recent-item">
        <div>
          <strong>${exp.description}</strong><br>
          <small class="text-muted">${exp.category} · ${Utils.formatDate(exp.date)}</small>
        </div>
        <strong class="negative">${Utils.formatCurrency(exp.amount)}</strong>
      </div>`).join('');
  },
};

function navigateTo(sectionId) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.section === sectionId));
  document.querySelectorAll('.section').forEach(el => el.classList.toggle('hidden', el.id !== `section-${sectionId}`));
  switch (sectionId) {
    case 'dashboard':   Dashboard.render(); break;
    case 'investments': Investments.render(); break;
    case 'expenses':    Expenses.render(); break;
    case 'budget':      Budget.render(); break;
    case 'patrimony':   Patrimony.render(); break;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  Expenses.init();

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); navigateTo(el.dataset.section); });
  });

  document.getElementById('modal-close').addEventListener('click', Modal.close);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') Modal.close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Modal.close(); });

  document.getElementById('add-investment-btn').addEventListener('click', () => Investments.openAddForm());
  document.getElementById('add-expense-btn').addEventListener('click', () => Expenses.openAddForm());
  document.getElementById('add-budget-btn').addEventListener('click', () => Budget.openAddForm());
  document.getElementById('add-patrimony-btn').addEventListener('click', () => Patrimony.openAddForm());

  document.getElementById('inv-search').addEventListener('input', () => Investments.render());
  document.getElementById('inv-filter-type').addEventListener('change', () => Investments.render());
  document.getElementById('exp-search').addEventListener('input', () => Expenses.render());
  document.getElementById('exp-filter-cat').addEventListener('change', () => Expenses.render());

  document.getElementById('export-btn').addEventListener('click', () => {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investtrack_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        Storage.importAll(JSON.parse(evt.target.result));
        navigateTo('dashboard');
        alert('Données importées avec succès !');
      } catch {
        alert('Erreur lors de l\'importation.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  navigateTo('dashboard');
});
