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

  // Anneau centré (petit texte à 2 lignes, ex. "Total" / "187 450 €") : plugin Chart.js par
  // graphique (pas global), `lines` = [{text, font, color}] empilées et centrées verticalement.
  _centerTextPlugin(lines) {
    return {
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        const items = typeof lines === 'function' ? lines() : lines;
        if (!items || !items.length) return;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lineHeight = 20;
        const startY = cy - ((items.length - 1) * lineHeight) / 2;
        items.forEach((it, i) => {
          ctx.font = it.font || '600 13px -apple-system, sans-serif';
          ctx.fillStyle = it.color || '#9497b8';
          ctx.fillText(it.text, cx, startY + i * lineHeight);
        });
        ctx.restore();
      },
    };
  },

  // Légende Chart.js native désactivée : consommée séparément par Investments._renderLegend
  // (liste verticale pastille/nom/montant/%, avec le texte centré du total dans l'anneau).
  investmentsByAccount(investments, centerLines) {
    const byAccount = {};
    investments.forEach(inv => {
      const acc = inv.account || 'autre';
      byAccount[acc] = (byAccount[acc] || 0) + inv.quantity * inv.currentPrice;
    });
    const keys = Object.keys(byAccount);
    if (!keys.length) { this.destroy('chart-port-account'); return; }
    const labels = keys.map(a => Utils.INVESTMENT_ACCOUNTS[a] || a);
    const colors = keys.map(a => Utils.ACCOUNT_COLORS[a] || '#6b7280');
    const opts = this._doughnutOptions(Utils.formatCurrency);
    opts.cutout = '68%';
    opts.plugins.legend = { display: false };
    this.create('chart-port-account', {
      type: 'doughnut',
      data: { labels, datasets: [{ data: Object.values(byAccount), backgroundColor: colors, borderWidth: 2, borderColor: '#131525' }] },
      options: opts,
      plugins: centerLines ? [this._centerTextPlugin(centerLines)] : [],
    });
  },

  // Répartition par POSITION à l'intérieur d'un seul compte (pas par type) : chaque position
  // garde une couleur stable par son rang dans la liste filtrée (Utils.POSITION_COLORS —
  // palette dédiée, distincte de CATEGORY_COLORS, pour ne pas dépendre des couleurs de
  // catégories de dépense/revenu).
  accountAllocation(investments) {
    if (!investments.length) { this.destroy('chart-port-acc-alloc'); return; }
    const labels = investments.map(inv => inv.name);
    const data = investments.map(inv => inv.quantity * inv.currentPrice);
    const colors = investments.map((_, i) => Utils.POSITION_COLORS[i % Utils.POSITION_COLORS.length]);
    const opts = this._doughnutOptions(Utils.formatCurrency);
    opts.cutout = '68%';
    opts.plugins.legend = { display: false };
    this.create('chart-port-acc-alloc', {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#131525' }] },
      options: opts,
    });
  },

  // Courbe d'évolution de la valeur totale du portefeuille : `points` = [{label, value}], déjà
  // agrégés/fenêtrés par l'appelant (Investments._evolutionSeries). Aire dégradée violette,
  // cohérente avec le Solde net du Dashboard/Flux.
  portfolioEvolution(points) {
    if (!points.length) { this.destroy('chart-port-evolution'); return; }
    this.create('chart-port-evolution', {
      type: 'line',
      data: {
        labels: points.map(p => p.label),
        datasets: [{
          label: 'Valeur',
          data: points.map(p => p.value),
          borderColor: '#8b5cf6',
          backgroundColor: this._vGrad('rgba(139,92,246,0.35)', 'rgba(139,92,246,0)'),
          borderWidth: 2.5,
          pointRadius: points.length > 1 ? 3 : 4,
          pointBackgroundColor: '#8b5cf6',
          pointBorderColor: '#131525',
          pointBorderWidth: 2,
          fill: true,
          tension: 0.35,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${Utils.formatCurrency(ctx.raw)}` } },
        },
        scales: { y: this._yAxis({ beginAtZero: false }), x: this._xAxis() },
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

  // Ombre portée sous chaque barre : ctx.shadow* n'existe pas comme option de dataset Chart.js,
  // on l'applique donc en scriptant le contexte canvas juste avant/après le passage de dessin
  // du dataset visé (args.meta.type filtre : seulement les barres, jamais la ligne Solde net
  // qui partage le même chart).
  _barShadowPlugin(color = 'rgba(0,0,0,0.35)', blur = 7, offsetY = 4) {
    return {
      id: 'barShadow',
      beforeDatasetDraw(chart, args) {
        if (args.meta.type !== 'bar') return;
        chart.ctx.save();
        chart.ctx.shadowColor = color;
        chart.ctx.shadowBlur = blur;
        chart.ctx.shadowOffsetY = offsetY;
      },
      afterDatasetDraw(chart, args) {
        if (args.meta.type !== 'bar') return;
        chart.ctx.restore();
      },
    };
  },

  // Toujours Revenus vs Dépenses (+ Solde net) : ne dépend QUE de la période, jamais du
  // filtre de catégorie (celui-ci ne pilote que le nouveau graphique par catégorie et le
  // donut/tableau). Barres en dégradé vertical (vif en haut, sombre en bas), coins arrondis
  // côté haut uniquement (borderSkipped par défaut = base), légère ombre portée, sans bordure
  // (pas de glow). Solde net : ligne épaisse + aire dégradée (couleur → transparent) vers zéro.
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
      backgroundColor: this._vGrad('rgba(139,92,246,0.35)', 'rgba(139,92,246,0)'),
      borderWidth: 3,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: '#8b5cf6',
      fill: 'origin',
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
      plugins: [this._barShadowPlugin()],
    });
  },

  // Léger glacis lumineux sur le bord supérieur de l'anneau (effet de relief façon bouton
  // brillant) : un dégradé blanc→transparent, plaqué sur TOUT l'anneau (pas segment par
  // segment — plus simple, et le résultat perçu est le même : un reflet qui vient du haut)
  // via un chemin en anneau (grand cercle moins petit cercle) servant de clip.
  _donutGlossPlugin() {
    return {
      id: 'donutGloss',
      afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data.length) return;
        // Rayon depuis un arc (inchangé par le décalage "actif"), mais centre depuis la zone
        // du graphique plutôt que arc.x/y — ceux-ci se décalent avec l'offset du segment actif
        // (mode filtre), ce qui désalignerait le glacis s'il était lu sur le 1er segment.
        const { innerRadius, outerRadius } = meta.data[0].getProps(['innerRadius', 'outerRadius'], true);
        if (!outerRadius) return;
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const x = (chartArea.left + chartArea.right) / 2;
        const y = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
        ctx.arc(x, y, innerRadius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        const grad = ctx.createLinearGradient(x, y - outerRadius, x, y + outerRadius * 0.15);
        grad.addColorStop(0, 'rgba(255,255,255,0.28)');
        grad.addColorStop(0.4, 'rgba(255,255,255,0.06)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - outerRadius, y - outerRadius, outerRadius * 2, outerRadius * 2);
        ctx.restore();
      },
    };
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
        cutout: '34%',   // anneau bien plus épais (42% avant) : plus petit = plus épais
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
      plugins: [this._donutGlossPlugin()],
    });
  },

  // `plannedArr` : un montant prévu par mois (recadré sur la date de début du budget), pas une
  // valeur unique répétée — un budget démarré récemment n'a rien de prévu sur les mois avant.
  budgetHistory(labels, data, color, plannedArr) {
    const hasPlanned = plannedArr.some(v => v > 0);
    const datasets = [{
      label: 'Dépenses réelles',
      data,
      borderColor: color || '#6366f1',
      backgroundColor: (color || '#6366f1') + '22',
      fill: true, tension: 0.4, pointRadius: 5,
      pointBackgroundColor: data.map((v, i) => (plannedArr[i] > 0 && v > plannedArr[i]) ? '#ef4444' : color || '#6366f1'),
    }];
    if (hasPlanned) {
      datasets.push({
        label: 'Budget prévu',
        data: plannedArr,
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
          legend: hasPlanned ? this._leg('top') : { display: false },
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
