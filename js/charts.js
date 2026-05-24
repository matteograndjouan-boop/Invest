const Charts = {
  _instances: {},

  destroy(id) {
    if (this._instances[id]) {
      this._instances[id].destroy();
      delete this._instances[id];
    }
  },

  create(id, config) {
    this.destroy(id);
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const chart = new Chart(canvas, config);
    this._instances[id] = chart;
    return chart;
  },

  _doughnutOptions(formatFn) {
    return {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatFn(ctx.raw)}` } },
      },
    };
  },

  portfolioAllocation(investments) {
    const byType = {};
    investments.forEach(inv => {
      const type = inv.type || 'autre';
      byType[type] = (byType[type] || 0) + inv.quantity * inv.currentPrice;
    });
    const keys = Object.keys(byType);
    const labels = keys.length ? keys.map(t => Utils.INVESTMENT_TYPES[t] || t) : ['Aucun investissement'];
    const data = keys.length ? Object.values(byType) : [1];
    const colors = keys.length ? keys.map(t => Utils.TYPE_COLORS[t] || '#6b7280') : ['#e5e7eb'];

    this.create('chart-portfolio-allocation', {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
      options: this._doughnutOptions(Utils.formatCurrency),
    });
  },

  expensesBudget(expenses, budgets) {
    const month = Utils.getCurrentMonth();
    const monthExpenses = expenses.filter(e => Utils.getExpenseMonth(e) === month);
    const categories = Object.keys(budgets);
    if (!categories.length) { this.destroy('chart-expenses-budget'); return; }

    this.create('chart-expenses-budget', {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [
          { label: 'Dépensé', data: categories.map(cat => monthExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)), backgroundColor: '#6366f1', borderRadius: 4 },
          { label: 'Budget', data: categories.map(cat => budgets[cat]), backgroundColor: '#e0e7ff', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) } } },
      },
    });
  },

  investmentsByType(investments) {
    const byType = {};
    investments.forEach(inv => {
      const type = inv.type || 'autre';
      byType[type] = (byType[type] || 0) + inv.quantity * inv.currentPrice;
    });
    const keys = Object.keys(byType);
    if (!keys.length) { this.destroy('chart-inv-type'); return; }

    this.create('chart-inv-type', {
      type: 'doughnut',
      data: { labels: keys.map(t => Utils.INVESTMENT_TYPES[t] || t), datasets: [{ data: Object.values(byType), backgroundColor: keys.map(t => Utils.TYPE_COLORS[t] || '#6b7280'), borderWidth: 2, borderColor: '#fff' }] },
      options: this._doughnutOptions(Utils.formatCurrency),
    });
  },

  investmentsPerformance(investments) {
    if (!investments.length) { this.destroy('chart-inv-performance'); return; }
    const sorted = [...investments].sort((a, b) => {
      const pa = (a.currentPrice - a.buyPrice) / a.buyPrice * 100;
      const pb = (b.currentPrice - b.buyPrice) / b.buyPrice * 100;
      return pb - pa;
    }).slice(0, 10);

    const data = sorted.map(inv => ((inv.currentPrice - inv.buyPrice) / inv.buyPrice * 100));
    this.create('chart-inv-performance', {
      type: 'bar',
      data: {
        labels: sorted.map(inv => inv.ticker || inv.name),
        datasets: [{ label: 'Performance (%)', data, backgroundColor: data.map(v => v >= 0 ? '#10b981' : '#ef4444'), borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${Utils.formatPercent(ctx.raw)}` } } },
        scales: { x: { ticks: { callback: (v) => `${v}%` } } },
      },
    });
  },

  expensesByCategory(expenses, month) {
    const monthExp = expenses.filter(e => Utils.getExpenseMonth(e) === month);
    const byCategory = {};
    monthExp.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const keys = Object.keys(byCategory);
    if (!keys.length) { this.destroy('chart-exp-category'); return; }

    this.create('chart-exp-category', {
      type: 'doughnut',
      data: { labels: keys, datasets: [{ data: Object.values(byCategory), backgroundColor: keys.map((_, i) => Utils.CATEGORY_COLORS[i % Utils.CATEGORY_COLORS.length]), borderWidth: 2, borderColor: '#fff' }] },
      options: this._doughnutOptions(Utils.formatCurrency),
    });
  },

  expensesMonthly(expenses) {
    const months = Utils.getLast12Months();
    this.create('chart-exp-monthly', {
      type: 'bar',
      data: {
        labels: months.map(Utils.getMonthLabel),
        datasets: [{ label: 'Dépenses', data: months.map(m => expenses.filter(e => Utils.getExpenseMonth(e) === m).reduce((s, e) => s + e.amount, 0)), backgroundColor: '#6366f1', borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${Utils.formatCurrency(ctx.raw)}` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) } } },
      },
    });
  },

  patrimony(assets, liabilities) {
    const assetsByCat = {}, liabByCat = {};
    assets.forEach(a => { assetsByCat[a.category] = (assetsByCat[a.category] || 0) + a.value; });
    liabilities.forEach(l => { liabByCat[l.category] = (liabByCat[l.category] || 0) + l.value; });

    const labels = [...Object.keys(assetsByCat).map(k => `${k} (actif)`), ...Object.keys(liabByCat).map(k => `${k} (passif)`)];
    const data = [...Object.values(assetsByCat), ...Object.values(liabByCat).map(v => -v)];
    const colors = [
      ...Object.keys(assetsByCat).map((_, i) => `hsla(142, 60%, ${45 + i * 10}%, 0.8)`),
      ...Object.keys(liabByCat).map((_, i) => `hsla(0, 80%, ${50 + i * 10}%, 0.8)`),
    ];

    if (!data.length) { this.destroy('chart-patrimony'); return; }
    this.create('chart-patrimony', {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Valeur', data, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${Utils.formatCurrency(Math.abs(ctx.raw))}` } } },
        scales: { y: { ticks: { callback: (v) => Utils.formatCurrency(v) } } },
      },
    });
  },
};
