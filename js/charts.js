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

  // Dégradé vertical scriptable (recette standard Chart.js v4) : couleur `top` en haut de
  // la zone de tracé, `bottom` en bas. Renvoie null au tout premier passage de mise en page
  // (chartArea pas encore connu) — Chart.js rappelle alors la fonction automatiquement.
  _vGrad(top, bottom) {
    return (context) => {
      const { chart } = context;
      const { ctx, chartArea } = chart;
      if (!chartArea) return null;
      const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      return g;
    };
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
      grid: { color: 'rgba(255,255,255,0.06)' },
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
      backgroundColor: 'rgba(19,21,37,0.96)',
      titleColor: '#ffffff',
      bodyColor: '#c7c9dd',
      borderColor: 'rgba(255,255,255,0.10)',
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
        color: '#9497b8',
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
      data: { labels: keys, datasets: [{ data: Object.values(byCategory), backgroundColor: keys.map(k => Utils.getCategoryColor(k)), borderWidth: 2, borderColor: '#fff' }] },
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
      data: { labels: keys, datasets: [{ data: Object.values(byCategory), backgroundColor: keys.map(k => Utils.getCategoryColor(k)), borderWidth: 2, borderColor: '#fff' }] },
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

  // Barres groupées par catégorie (période A / période B), catégories en abscisse — mêmes
  // couleurs que les panneaux de périodes au-dessus (indigo = A, ambre = B).
  comparisonBarByCategory(labels, dataA, dataB, labelA, labelB) {
    if (!labels.length) { this.destroy('chart-comparison'); return; }

    this.create('chart-comparison', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: labelA, data: dataA, backgroundColor: '#6366f1', borderWidth: 0, borderRadius: 4 },
          { label: labelB, data: dataB, backgroundColor: '#f59e0b', borderWidth: 0, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: this._leg('top'),
          tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } },
        },
        scales: { y: this._yAxis(), x: this._xAxis() },
      },
    });
  },

  // Toujours Revenus vs Dépenses (+ Solde net) : ne dépend QUE de la période, jamais du
  // filtre de catégorie (celui-ci ne pilote que le nouveau graphique par catégorie et le
  // donut/tableau). Barres en dégradé vertical (vif en haut, sombre en bas), coins arrondis
  // côté haut uniquement (borderSkipped par défaut = base), sans bordure (pas de glow).
  fluxBar(labels, revData, depData, soldeData) {
    const barDatasets = [
      { label: 'Revenus', data: revData, backgroundColor: this._vGrad('#00b37e', '#004d35'), borderWidth: 0, borderRadius: 6, type: 'bar' },
      { label: 'Dépenses', data: depData, backgroundColor: this._vGrad('#e53e3e', '#5a0f0f'), borderWidth: 0, borderRadius: 6, type: 'bar' },
    ];

    const soldeDataset = {
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
    };

    this.create('chart-flux-bar', {
      type: 'bar',
      data: { labels, datasets: [...barDatasets, soldeDataset] },
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

  // `colors` : une couleur par label, dans le même ordre — fournie par l'appelant
  // (Utils.getCategoryColor, couleur stable par catégorie) plutôt que calculée ici par position,
  // pour qu'une catégorie garde toujours la même couleur quel que soit son rang.
  fluxDonut(labels, data, colors, activeLabels, onClickFn) {
    if (!labels.length) { this.destroy('chart-flux-donut'); return; }
    const hasFilter = activeLabels instanceof Set ? activeLabels.size > 0 : !!activeLabels;
    const isActive = (l) => activeLabels instanceof Set ? activeLabels.has(l) : l === activeLabels;

    const bgColors = labels.map((label, i) => {
      const c = colors[i];
      if (!hasFilter || isActive(label)) return c;
      return c + '38';
    });
    const offsets = labels.map(l => isActive(l) ? 14 : 0);
    const borderWidths = labels.map(l => isActive(l) ? 3 : 2);

    this.create('chart-flux-donut', {
      type: 'doughnut',
      data: {
        // Bordure = couleur des cartes (pas blanc) : sépare les segments par un fin liseré
        // qui se fond dans le fond de la carte au lieu d'un anneau blanc qui « brille ».
        labels,
        datasets: [{ data, backgroundColor: bgColors, borderWidth: borderWidths, borderColor: '#131525', offset: offsets }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '42%',   // anneau plus épais qu'avant (défaut Chart.js non précisé ~50% : plus petit = plus épais)
        plugins: {
          legend: { display: false },
          tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${ctx.label}: ${Utils.formatCurrency(ctx.raw)}` } },
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
