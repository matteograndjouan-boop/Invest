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

  revenuesByCategory(revenues, month) {
    const monthRev = revenues.filter(r => r.date.substring(0, 7) === month);
    const byCategory = {};
    monthRev.forEach(r => { byCategory[r.category] = (byCategory[r.category] || 0) + r.amount; });
    const keys = Object.keys(byCategory);
    if (!keys.length) { this.destroy('chart-rev-category'); return; }

    this.create('chart-rev-category', {
      type: 'doughnut',
      data: { labels: keys, datasets: [{ data: Object.values(byCategory), backgroundColor: keys.map((_, i) => Utils.CATEGORY_COLORS[i % Utils.CATEGORY_COLORS.length]), borderWidth: 2, borderColor: '#fff' }] },
      options: this._doughnutOptions(Utils.formatCurrency),
    });
  },

  revenuesMonthly(revenues) {
    const months = Utils.getLast12Months();
    this.create('chart-rev-monthly', {
      type: 'bar',
      data: {
        labels: months.map(Utils.getMonthLabel),
        datasets: [{ label: 'Revenus', data: months.map(m => revenues.filter(r => r.date.substring(0, 7) === m).reduce((s, r) => s + r.amount, 0)), backgroundColor: '#10b981', borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${Utils.formatCurrency(ctx.raw)}` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) } } },
      },
    });
  },

  comparisonBar(expA, expB, periodA, periodB) {
    const allCategories = [...new Set([...expA.map(e => e.category), ...expB.map(e => e.category)])].sort();
    if (!allCategories.length) { this.destroy('chart-comparison'); return; }

    const dataA = allCategories.map(cat => expA.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0));
    const dataB = allCategories.map(cat => expB.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0));

    this.create('chart-comparison', {
      type: 'bar',
      data: {
        labels: allCategories,
        datasets: [
          { label: Utils.getMonthLabel(periodA), data: dataA, backgroundColor: '#6366f1', borderRadius: 4 },
          { label: Utils.getMonthLabel(periodB), data: dataB, backgroundColor: '#f59e0b', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) } } },
      },
    });
  },

  fluxBar(labels, revData, depData, soldeData, activeCategory) {
    const barDatasets = activeCategory
      ? [{ label: activeCategory, data: depData, backgroundColor: 'rgba(99,102,241,0.75)', borderColor: '#6366f1', borderWidth: 1, borderRadius: 4, type: 'bar' }]
      : [
          { label: 'Revenus', data: revData, backgroundColor: 'rgba(16,185,129,0.75)', borderColor: '#10b981', borderWidth: 1, borderRadius: 4, type: 'bar' },
          { label: 'Dépenses', data: depData, backgroundColor: 'rgba(239,68,68,0.75)', borderColor: '#ef4444', borderWidth: 1, borderRadius: 4, type: 'bar' },
        ];

    const soldeDataset = soldeData ? {
      label: 'Solde net',
      data: soldeData,
      type: 'line',
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139,92,246,0.08)',
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: '#8b5cf6',
      fill: false,
      tension: 0.3,
      yAxisID: 'y',
    } : null;

    this.create('chart-flux-bar', {
      type: 'bar',
      data: { labels, datasets: soldeDataset ? [...barDatasets, soldeDataset] : barDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } },
        },
        scales: { y: { beginAtZero: false, ticks: { callback: (v) => Utils.formatCurrency(v) } } },
      },
    });
  },

  fluxDonut(labels, data, activeLabel, onClickFn) {
    if (!labels.length) { this.destroy('chart-flux-donut'); return; }
    const BASE_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#6b7280'];

    const bgColors = labels.map((label, i) => {
      const c = BASE_COLORS[i % BASE_COLORS.length];
      if (!activeLabel || label === activeLabel) return c;
      return c + '38';
    });
    const offsets = labels.map(l => l === activeLabel ? 14 : 0);
    const borderWidths = labels.map(l => l === activeLabel ? 3 : 2);

    this.create('chart-flux-donut', {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: bgColors, borderWidth: borderWidths, borderColor: '#fff', offset: offsets }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${Utils.formatCurrency(ctx.raw)}` } },
        },
        onClick: onClickFn
          ? (event, elements) => {
              if (elements.length > 0) onClickFn(labels[elements[0].index]);
              else onClickFn(null);
            }
          : undefined,
        onHover: onClickFn
          ? (event, elements) => { event.native.target.style.cursor = elements.length ? 'pointer' : 'default'; }
          : undefined,
      },
    });
  },

  budgetHistory(labels, data, color) {
    this.create('chart-budget-history', {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Dépenses réelles',
          data,
          borderColor: color || '#6366f1',
          backgroundColor: (color || '#6366f1') + '22',
          fill: true, tension: 0.4, pointRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
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
