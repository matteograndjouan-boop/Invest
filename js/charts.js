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

  _fmt(v) {
    const fmt = (n) => {
      const s = n.toFixed(1);
      return s.endsWith('.0') ? String(Math.round(n)) : s.replace('.', ',');
    };
    const abs = Math.abs(v);
    if (abs >= 1e6) return fmt(v / 1e6) + ' M€';
    if (abs >= 1e3) return fmt(v / 1e3) + ' k€';
    return Math.round(v) + ' €';
  },

  _yAxis(extra = {}) {
    return {
      beginAtZero: true,
      ticks: { callback: (v) => Charts._fmt(v), color: '#9ca3af', font: { size: 11 } },
      grid: { color: 'rgba(0,0,0,0.05)' },
      border: { display: false },
      ...extra,
    };
  },

  _xAxis(extra = {}) {
    return {
      ticks: { color: '#9ca3af', font: { size: 11 } },
      grid: { display: false },
      border: { display: false },
      ...extra,
    };
  },

  _tip(extra = {}) {
    return {
      backgroundColor: 'rgba(17,24,39,0.92)',
      titleColor: '#f9fafb',
      bodyColor: '#d1d5db',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      boxPadding: 4,
      ...extra,
    };
  },

  _leg(position = 'top', extra = {}) {
    return {
      position,
      labels: {
        boxWidth: 8, boxHeight: 8,
        padding: 14,
        font: { size: 12 },
        usePointStyle: true,
        pointStyle: 'circle',
        color: '#6b7280',
        ...extra,
      },
    };
  },

  _doughnutOptions(formatFn) {
    return {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: this._leg('bottom'),
        tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${ctx.label}: ${formatFn(ctx.raw)}` } },
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
        plugins: { legend: this._leg('bottom'), tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } } },
        scales: { y: this._yAxis(), x: this._xAxis() },
      },
    });
  },

  investmentsByType(investments, canvasId) {
    const byType = {};
    investments.forEach(inv => {
      const type = inv.type || 'autre';
      byType[type] = (byType[type] || 0) + inv.quantity * inv.currentPrice;
    });
    const keys = Object.keys(byType);
    if (!keys.length) { this.destroy(canvasId || 'chart-inv-type'); return; }

    this.create(canvasId || 'chart-inv-type', {
      type: 'doughnut',
      data: { labels: keys.map(t => Utils.INVESTMENT_TYPES[t] || t), datasets: [{ data: Object.values(byType), backgroundColor: keys.map(t => Utils.TYPE_COLORS[t] || '#6b7280'), borderWidth: 2, borderColor: '#fff' }] },
      options: this._doughnutOptions(Utils.formatCurrency),
    });
  },

  investmentsByAccount(investments) {
    const byAccount = {};
    investments.forEach(inv => {
      const acc = inv.account || 'autre';
      byAccount[acc] = (byAccount[acc] || 0) + inv.quantity * inv.currentPrice;
    });
    const keys = Object.keys(byAccount);
    if (!keys.length) { this.destroy('chart-port-account'); return; }
    const labels = keys.map(a => Utils.INVESTMENT_ACCOUNTS[a] || a);
    const colors = keys.map(a => Utils.ACCOUNT_COLORS[a] || '#6b7280');
    this.create('chart-port-account', {
      type: 'doughnut',
      data: { labels, datasets: [{ data: Object.values(byAccount), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
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
        datasets: [{ label: 'Dépenses', data: months.map(m => expenses.filter(e => Utils.getExpenseMonth(e) === m).reduce((s, e) => s + e.amount, 0)), backgroundColor: 'rgba(99,102,241,0.7)', borderColor: '#6366f1', borderWidth: 1, borderRadius: 5 }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${Utils.formatCurrency(ctx.raw)}` } } },
        scales: { y: this._yAxis(), x: this._xAxis() },
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
        datasets: [{ label: 'Revenus', data: months.map(m => revenues.filter(r => r.date.substring(0, 7) === m).reduce((s, r) => s + r.amount, 0)), backgroundColor: 'rgba(16,185,129,0.7)', borderColor: '#10b981', borderWidth: 1, borderRadius: 5 }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${Utils.formatCurrency(ctx.raw)}` } } },
        scales: { y: this._yAxis(), x: this._xAxis() },
      },
    });
  },

  comparisonButterfly(expA, expB, periodA, periodB) {
    const allCategories = [...new Set([...expA.map(e => e.category), ...expB.map(e => e.category)])].sort();
    if (!allCategories.length) { this.destroy('chart-comparison'); return; }

    const dataA = allCategories.map(cat => expA.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0));
    const dataB = allCategories.map(cat => expB.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0));
    const labelA = Utils.getMonthLabel(periodA);
    const labelB = Utils.getMonthLabel(periodB);

    this.create('chart-comparison', {
      type: 'bar',
      data: {
        labels: allCategories,
        datasets: [
          { label: labelA, data: dataA.map(v => -v), backgroundColor: 'rgba(99,102,241,0.75)', borderColor: '#6366f1', borderWidth: 1, borderRadius: 4 },
          { label: labelB, data: dataB, backgroundColor: 'rgba(245,158,11,0.75)', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 4 },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: this._leg('top'),
          tooltip: {
            ...this._tip(),
            callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(Math.abs(ctx.raw))}` },
          },
        },
        scales: {
          x: {
            ticks: { callback: (v) => Charts._fmt(Math.abs(v)), color: '#9ca3af', font: { size: 11 } },
            grid: {
              color: (ctx) => ctx.tick.value === 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
              lineWidth: (ctx) => ctx.tick.value === 0 ? 2 : 1,
            },
            border: { display: false },
          },
          y: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { display: false }, border: { display: false } },
        },
      },
    });
  },

  fluxBar(labels, revData, depData, soldeData, activeCategory) {
    const barDatasets = activeCategory
      ? [{ label: activeCategory, data: depData, backgroundColor: 'rgba(99,102,241,0.75)', borderColor: '#6366f1', borderWidth: 1, borderRadius: 5, type: 'bar' }]
      : [
          { label: 'Revenus', data: revData, backgroundColor: 'rgba(16,185,129,0.72)', borderColor: '#10b981', borderWidth: 1, borderRadius: 5, type: 'bar' },
          { label: 'Dépenses', data: depData, backgroundColor: 'rgba(239,68,68,0.72)', borderColor: '#ef4444', borderWidth: 1, borderRadius: 5, type: 'bar' },
        ];

    const soldeDataset = soldeData ? {
      label: 'Solde net',
      data: soldeData,
      type: 'line',
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139,92,246,0.07)',
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: '#8b5cf6',
      fill: false,
      tension: 0.35,
      yAxisID: 'y',
    } : null;

    this.create('chart-flux-bar', {
      type: 'bar',
      data: { labels, datasets: soldeDataset ? [...barDatasets, soldeDataset] : barDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: this._leg('top'),
          tooltip: { ...this._tip(), mode: 'index', callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } },
        },
        scales: { y: this._yAxis({ beginAtZero: !!activeCategory }), x: this._xAxis() },
      },
    });
  },

  fluxDonut(labels, data, activeLabels, onClickFn) {
    if (!labels.length) { this.destroy('chart-flux-donut'); return; }
    const BASE_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#6b7280'];
    const hasFilter = activeLabels instanceof Set ? activeLabels.size > 0 : !!activeLabels;
    const isActive = (l) => activeLabels instanceof Set ? activeLabels.has(l) : l === activeLabels;

    const bgColors = labels.map((label, i) => {
      const c = BASE_COLORS[i % BASE_COLORS.length];
      if (!hasFilter || isActive(label)) return c;
      return c + '38';
    });
    const offsets = labels.map(l => isActive(l) ? 14 : 0);
    const borderWidths = labels.map(l => isActive(l) ? 3 : 2);

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

  // Simple bar for filtered category view
  fluxMonthly(labels, depData, revData, activeCategory) {
    this.create('chart-flux-monthly', {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: activeCategory || 'Dépenses',
          data: depData,
          backgroundColor: activeCategory ? 'rgba(99,102,241,0.72)' : 'rgba(239,68,68,0.72)',
          borderColor: activeCategory ? '#6366f1' : '#ef4444',
          borderWidth: 1,
          borderRadius: 5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } },
        },
        scales: { y: this._yAxis(), x: this._xAxis() },
      },
    });
  },

  // Day-by-day bars + cumulative line for single-month view (no filter)
  fluxMonthlyCumul(labels, depData, cumData) {
    this.create('chart-flux-monthly', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Dépenses du jour',
            data: depData,
            backgroundColor: 'rgba(239,68,68,0.5)',
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 4,
            type: 'bar',
          },
          {
            label: 'Cumul',
            data: cumData,
            type: 'line',
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.07)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: this._leg('top'),
          tooltip: { ...this._tip(), mode: 'index', callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } },
        },
        scales: { y: this._yAxis(), x: this._xAxis() },
      },
    });
  },

  // Multi-month stacked bars by category (no filter active)
  fluxMonthlyStacked(labels, catData) {
    if (!catData.length) { this.destroy('chart-flux-monthly'); return; }
    const datasets = catData.map(cat => ({
      label: cat.name,
      data: cat.values,
      backgroundColor: cat.color + 'c0',
      borderColor: cat.color,
      borderWidth: 1,
      stack: 'expenses',
    }));

    this.create('chart-flux-monthly', {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: this._leg('bottom', { font: { size: 11 }, padding: 10 }),
          tooltip: {
            ...this._tip(),
            mode: 'index',
            callbacks: {
              label: (ctx) => ctx.raw > 0 ? ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` : null,
              footer: (items) => {
                const total = items.reduce((s, i) => s + i.raw, 0);
                return total > 0 ? `Total : ${Utils.formatCurrency(total)}` : '';
              },
            },
          },
        },
        scales: {
          x: { ...this._xAxis(), stacked: true },
          y: { ...this._yAxis(), stacked: true },
        },
      },
    });
  },

  budgetHistory(labels, data, color, planned) {
    const datasets = [{
      label: 'Dépenses réelles',
      data,
      borderColor: color || '#6366f1',
      backgroundColor: (color || '#6366f1') + '22',
      fill: true, tension: 0.4, pointRadius: 5,
      pointBackgroundColor: data.map(v => planned > 0 && v > planned ? '#ef4444' : color || '#6366f1'),
    }];
    if (planned > 0) {
      datasets.push({
        label: 'Budget prévu',
        data: labels.map(() => planned),
        borderColor: '#e5e7eb',
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0,
      });
    }
    this.create('chart-budget-history', {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: planned ? this._leg('top') : { display: false },
          tooltip: { ...this._tip(), mode: 'index', callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } },
        },
        scales: { y: this._yAxis(), x: this._xAxis() },
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
        plugins: { legend: { display: false }, tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${Utils.formatCurrency(Math.abs(ctx.raw))}` } } },
        scales: { y: this._yAxis({ beginAtZero: false }), x: this._xAxis() },
      },
    });
  },
};
