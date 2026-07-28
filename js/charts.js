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

  // Éclaircit (percent > 0) ou assombrit (percent < 0) une couleur hex #rrggbb en la mélangeant
  // vers blanc/noir — utilisé pour dériver une teinte claire/sombre à partir d'une seule couleur
  // de base (catégories, comptes, positions... toutes dynamiques, donc pas de paire clair/sombre
  // fixe possible comme pour Revenus/Dépenses).
  _shade(hex, percent) {
    const h = hex.replace('#', '');
    const num = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent);
    r = Math.round((t - r) * p) + r;
    g = Math.round((t - g) * p) + g;
    b = Math.round((t - b) * p) + b;
    return `rgb(${r},${g},${b})`;
  },

  // Même couleur hex #rrggbb en rgba(r,g,b,alpha) — contrairement à _shade (qui change la TEINTE
  // en mélangeant vers blanc/noir), la couleur de base reste strictement identique, seule sa
  // transparence varie. Utilisé pour les segments de Flux._renderRepartition : tous les segments
  // d'une même barre catégorie gardent la couleur de LA catégorie, seul le rang change l'opacité.
  _alpha(hex, alpha) {
    const h = hex.replace('#', '');
    const num = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
    return `rgba(${r},${g},${b},${alpha})`;
  },

  // Toujours en nombre entier, jamais abrégé (k€/M€) : mélanger "500 €" et "1 k€" sur une même
  // échelle n'est pas homogène — un seul format, quelle que soit l'ampleur des valeurs.
  _fmt(v) {
    return `${Math.round(v).toLocaleString('fr-FR')} €`;
  },

  _yAxis(extra = {}) {
    return {
      beginAtZero: true,
      ticks: { callback: (v) => Charts._fmt(v), color: '#e8eaf2', font: { size: 14, weight: '600' } },
      grid: { color: 'rgba(255,255,255,0.06)' },
      border: { display: false },
      ...extra,
    };
  },

  // Gridlines horizontales pointillées très discrètes — variante d'axe Y utilisée par les
  // graphiques "premium" (barres Revenus/Dépenses, Comparaisons, Patrimoine, courbes). Le dash
  // se règle via `border.dash` (pas `grid.borderDash`) : c'est ce que Chart.js v4 lit réellement
  // pour dessiner le trait de grille lui-même, cf. CartesianScale#_computeGridLineItems.
  _dottedGrid(extra = {}) {
    return { grid: { color: '#ffffff08' }, border: { display: false, dash: [3, 3] }, ...extra };
  },

  _xAxis(extra = {}) {
    return {
      ticks: { color: '#e8eaf2', font: { size: 14, weight: '600' } },
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
        boxWidth: 11, boxHeight: 11,
        padding: 20,
        font: { size: 13, weight: '600' },
        usePointStyle: true,
        pointStyle: 'circle',
        color: '#c7c9dd',
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

  // Barres "Dépensé" par catégorie (Budget, vue liste) : même technique que fluxBar (dégradé
  // vertical par barre + ombre, _barGradientPlugin/_barShadowPlugin réutilisés tels quels) mais
  // une couleur PAR BARRE (celle de la catégorie, via Utils.getCategoryColor) plutôt que la
  // paire rouge/vert fixe de fluxBar — clair/sombre dérivés de cette couleur via _shade, même
  // principe que la bande des cartes catégorie de Flux (_renderCategoryCards). Contour "budget"
  // superposé (_budgetOutlinePlugin) : ni un 2e dataset Chart.js (grouperait/empilerait les
  // barres au lieu de les superposer au même x), ni un simple repère — un rectangle tracé à la
  // hauteur du budget, sur la même largeur que la barre réelle (lue sur le même élément de
  // barre) ; le dépassement se voit alors de lui-même dès que la barre réelle dépasse ce contour.
  budgetCategoryBar(labels, spentData, plannedData, colors, canvasId = 'chart-budget-category') {
    if (!labels.length) { this.destroy(canvasId); return; }
    const perBarPairs = colors.map(c => [this._shade(c, 0.35), this._shade(c, -0.45)]);
    // Assez de marge au-dessus du plus grand des deux (dépensé OU budget) pour qu'un contour de
    // budget jamais dépassé (cas normal) ne colle pas au bord haut du graphique.
    const yMax = Math.max(1, ...spentData, ...plannedData) * 1.15;

    this.create(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Dépensé', data: spentData, backgroundColor: colors, borderWidth: 0, borderRadius: 6, barPercentage: 0.6, categoryPercentage: 0.7 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tip(),
            callbacks: {
              label: (ctx) => ` Dépensé : ${Utils.formatCurrency(ctx.raw)}`,
              afterLabel: (ctx) => plannedData[ctx.dataIndex] > 0 ? `Budget : ${Utils.formatCurrency(plannedData[ctx.dataIndex])}` : 'Aucun budget défini',
            },
          },
        },
        scales: { y: this._yAxis(this._dottedGrid({ suggestedMax: yMax })), x: this._xAxis() },
      },
      plugins: [this._barShadowPlugin(), this._barGradientPlugin([perBarPairs]), this._budgetOutlinePlugin(plannedData)],
    });
  },

  // Rectangle tracé (pas rempli), coins arrondis côté haut — repère de budget superposé à la
  // barre réelle (voir budgetCategoryBar). Lit position/largeur sur l'élément de la barre RÉELLE
  // (dataset 0) mais calcule sa propre hauteur via l'échelle Y et la valeur de budget : les 2
  // hauteurs sont donc indépendantes, une barre plus haute que son contour déborde visuellement
  // au-dessus (dépassement), une barre plus basse laisse un vide entre son sommet et le contour.
  // afterDatasetsDraw (pluriel, pas afterDatasetDraw) : garantit un passage APRÈS le dégradé de
  // la barre (_barGradientPlugin, sur afterDatasetDraw) quel que soit l'ordre d'enregistrement
  // des plugins, pour que le contour reste visible par-dessus le remplissage plutôt que dessous.
  _budgetOutlinePlugin(plannedData, color = 'rgba(255,255,255,0.5)') {
    return {
      id: 'budgetOutline',
      afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || meta.type !== 'bar') return;
        const { ctx } = chart;
        const yScale = chart.scales.y;

        meta.data.forEach((el, i) => {
          const planned = plannedData[i];
          if (!planned) return;
          const { x, width, base } = el.getProps(['x', 'width', 'base'], true);
          const left = x - width / 2;
          const top = yScale.getPixelForValue(planned);
          const bottom = base;
          const h = bottom - top;
          if (!isFinite(h) || h <= 0 || !isFinite(width) || width < 2) return;
          const r = Math.max(0, Math.min(6, width / 2, h));

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(left, bottom);
          ctx.lineTo(left, top + r);
          ctx.arcTo(left, top, left + r, top, r);
          ctx.lineTo(left + width - r, top);
          ctx.arcTo(left + width, top, left + width, top + r, r);
          ctx.lineTo(left + width, bottom);
          ctx.closePath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = color;
          ctx.stroke();
          ctx.restore();
        });
      },
    };
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
    opts.spacing = 3;
    opts.plugins.legend = { display: false };
    this.create('chart-port-account', {
      type: 'doughnut',
      data: { labels, datasets: [{ data: Object.values(byAccount), backgroundColor: colors, borderWidth: 2, borderColor: '#131525' }] },
      options: opts,
      plugins: [this._donutShadowPlugin(), this._donutGradientPlugin(), this._donutGlossPlugin(), ...(centerLines ? [this._centerTextPlugin(centerLines)] : [])],
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
    opts.spacing = 3;
    opts.plugins.legend = { display: false };
    this.create('chart-port-acc-alloc', {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#131525' }] },
      options: opts,
      plugins: [this._donutShadowPlugin(), this._donutGradientPlugin(), this._donutGlossPlugin()],
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
          borderWidth: 3,
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
        scales: { y: this._yAxis(this._dottedGrid({ beginAtZero: false })), x: this._xAxis() },
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
  // couleurs que les panneaux de périodes au-dessus (indigo = A, ambre = B). Même style "premium"
  // que fluxBar (dégradé par barre, ombre, highlight, gridlines pointillées) pour l'homogénéité.
  comparisonBarByCategory(labels, dataA, dataB, labelA, labelB) {
    if (!labels.length) { this.destroy('chart-comparison'); return; }

    this.create('chart-comparison', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: labelA, data: dataA, backgroundColor: '#6366f1', borderWidth: 0, borderRadius: 6 },
          { label: labelB, data: dataB, backgroundColor: '#d946ef', borderWidth: 0, borderRadius: 6 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: this._leg('top'),
          tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } },
        },
        scales: { y: this._yAxis(this._dottedGrid()), x: this._xAxis() },
      },
      plugins: [this._barShadowPlugin(), this._barGradientPlugin([['#6366f1', '#312e81'], ['#d946ef', '#701a75']])],
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

  // Dégradé vertical propre et sobre PAR BARRE (vif en haut → sombre en bas) + fin highlight
  // blanc sur le bord supérieur. Peint directement en canvas plutôt que via un `backgroundColor`
  // scriptable (_vGrad) : celui-ci est relatif à TOUTE la zone du graphique, donc une petite
  // barre assise en bas du graphique n'affiche presque que la couleur sombre — ici chaque barre
  // montre sa propre transition claire→sombre quelle que soit sa hauteur. Style commun à TOUS
  // les graphiques en barres de l'app (homogénéité) : `recipes[datasetIndex]` est soit une paire
  // [clair,sombre] unique pour tout le dataset (ex. Revenus/Dépenses, période A/B), soit un
  // tableau de paires — une par barre — pour un dataset où chaque barre a sa propre couleur
  // (ex. Patrimoine, une couleur par catégorie).
  _barGradientPlugin(recipes) {
    return {
      id: 'barGradient',
      afterDatasetDraw(chart, args) {
        if (args.meta.type !== 'bar') return;
        const recipe = recipes[args.index];
        if (!recipe) return;
        const perBar = Array.isArray(recipe[0]);
        const { ctx } = chart;

        args.meta.data.forEach((el, i) => {
          const pair = perBar ? recipe[i] : recipe;
          if (!pair) return;
          const [top, bottom] = pair;
          const { x, y, base, width } = el.getProps(['x', 'y', 'base', 'width'], true);
          const left = x - width / 2, barTop = Math.min(y, base), barBottom = Math.max(y, base);
          const h = barBottom - barTop;
          if (!isFinite(h) || !isFinite(width) || h < 2 || width < 2) return;

          // Même rayon que celui réellement appliqué par Chart.js pour que le clip épouse
          // exactement la barre. Chart.js arrondit le coin loin de la ligne de base (value=0) et
          // garde celui à la base carré (borderSkipped par défaut) — pour une barre positive
          // c'est le haut (cas standard), mais pour une valeur négative (ex. passifs en
          // Patrimoine, la barre descend sous zéro) c'est le BAS qu'il faut arrondir.
          let r = el.options?.borderRadius;
          if (r == null) r = 6;
          if (typeof r === 'object') r = r.topLeft ?? 6;
          r = Math.max(0, Math.min(r, width / 2, h));
          const roundTop = y <= base;

          ctx.save();
          ctx.beginPath();
          if (roundTop) {
            ctx.moveTo(left, barBottom);
            ctx.lineTo(left, barTop + r);
            ctx.arcTo(left, barTop, left + r, barTop, r);
            ctx.lineTo(left + width - r, barTop);
            ctx.arcTo(left + width, barTop, left + width, barTop + r, r);
            ctx.lineTo(left + width, barBottom);
          } else {
            ctx.moveTo(left, barTop);
            ctx.lineTo(left, barBottom - r);
            ctx.arcTo(left, barBottom, left + r, barBottom, r);
            ctx.lineTo(left + width - r, barBottom);
            ctx.arcTo(left + width, barBottom, left + width, barBottom - r, r);
            ctx.lineTo(left + width, barTop);
          }
          ctx.closePath();
          ctx.clip();

          const grad = ctx.createLinearGradient(0, barTop, 0, barBottom);
          grad.addColorStop(0, top);
          grad.addColorStop(1, bottom);
          ctx.fillStyle = grad;
          ctx.fillRect(left, barTop, width, h);

          // Highlight : fine ligne claire (pas une large lueur) sur le bord supérieur.
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.fillRect(left, barTop, width, Math.min(1.5, h));

          ctx.restore();
        });
      },
    };
  },

  // Toujours Revenus vs Dépenses (+ Solde net) : ne dépend QUE de la période, jamais du
  // filtre de catégorie (celui-ci ne pilote que le nouveau graphique par catégorie et le
  // donut/tableau). Barres en dégradé vertical propre par barre (_barGradientPlugin), coins
  // arrondis côté haut uniquement (borderSkipped par défaut = base), légère ombre portée, sans
  // bordure (pas de glow), gridlines horizontales pointillées très discrètes. Solde net : ligne
  // épaisse + aire dégradée (couleur → transparent) vers zéro. `canvasId` : ce même rendu sert
  // aussi à la mini-carte Flux du Dashboard (Dashboard._renderFluxChart, app.js), pour un rendu
  // strictement identique entre les deux — pas de duplication de code/style.
  // `opts.expensesOnly` : vue "Dépenses par semaine" (Flux, périodes <= 1 mois) — un seul
  // dataset rouge, pas de Revenus ni de ligne Solde net (ces séries n'existent pas à l'échelle
  // hebdo dans ce mode, voir Flux._renderBarChart).
  fluxBar(labels, revData, depData, soldeData, canvasId = 'chart-flux-bar', opts = {}) {
    const expensesOnly = !!opts.expensesOnly;

    // Avec 1 seul mois (filtre "Mois" ou plage plus courte), Chart.js n'a qu'une seule catégorie
    // sur l'axe X : à ses barPercentage/categoryPercentage par défaut (0.9/0.8), les 2 barres
    // Revenus/Dépenses se partagent alors presque toute la largeur du graphique et ressortent en
    // gros pavés épais façon bâtons. Rétrécies explicitement dans ce cas (mais modérément — un
    // 1er essai à 0.5/0.35 rendait les barres trop fines) ; au-delà de 1 mois, plusieurs
    // catégories se partagent déjà l'espace et les valeurs par défaut restent bien. Ce cas ne se
    // produit plus en pratique (Flux affiche désormais plusieurs bâtons hebdo dès qu'il y a 1
    // seul mois), gardé pour la mini-carte Dashboard qui reste sur un vrai découpage mensuel.
    const thin = !expensesOnly && labels.length <= 1;

    const barDatasets = expensesOnly
      ? [{ label: 'Dépenses', data: depData, backgroundColor: '#e53e3e', borderWidth: 0, borderRadius: 6, type: 'bar', barPercentage: 0.6, categoryPercentage: 0.5 }]
      : [
          { label: 'Revenus', data: revData, backgroundColor: '#00b37e', borderWidth: 0, borderRadius: 6, type: 'bar', barPercentage: thin ? 0.75 : 0.9, categoryPercentage: thin ? 0.55 : 0.8 },
          { label: 'Dépenses', data: depData, backgroundColor: '#e53e3e', borderWidth: 0, borderRadius: 6, type: 'bar', barPercentage: thin ? 0.75 : 0.9, categoryPercentage: thin ? 0.55 : 0.8 },
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

    this.create(canvasId, {
      type: 'bar',
      data: { labels, datasets: expensesOnly ? barDatasets : [...barDatasets, soldeDataset] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: expensesOnly ? { display: false } : this._leg('top'),
          tooltip: { ...this._tip(), mode: 'index', callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } },
        },
        scales: { y: this._yAxis(this._dottedGrid()), x: this._xAxis() },
      },
      plugins: [this._barShadowPlugin(), this._barGradientPlugin(expensesOnly ? [['#e53e3e', '#5a0f0f']] : [['#00b37e', '#004d35'], ['#e53e3e', '#5a0f0f']])],
    });
  },

  // Ombre portée par segment : avec `spacing` (séparation entre segments), chaque segment est
  // maintenant visuellement détaché de ses voisins, donc une ombre individuelle se voit vraiment
  // (contrairement à des segments accolés où elle resterait cachée sous le voisin) — accentue le
  // relief façon petites tuiles légèrement surélevées plutôt qu'un anneau plat.
  _donutShadowPlugin(color = 'rgba(0,0,0,0.45)', blur = 6, offsetY = 3) {
    return {
      id: 'donutShadow',
      beforeDatasetDraw(chart) {
        chart.ctx.save();
        chart.ctx.shadowColor = color;
        chart.ctx.shadowBlur = blur;
        chart.ctx.shadowOffsetY = offsetY;
      },
      afterDatasetDraw(chart) {
        chart.ctx.restore();
      },
    };
  },

  // Dégradé radial PAR SEGMENT (clair vers le bord extérieur, sombre vers le trou central) —
  // équivalent du dégradé vertical des barres, pour que les anneaux ne soient pas des aplats de
  // couleur unie. Chaque segment garde sa propre teinte (dérivée via _shade, pas de palette
  // fixe possible ici puisque les couleurs viennent de sources dynamiques : catégories, comptes,
  // positions...). Clippé à la forme exacte du segment (secteur d'anneau) pour ne jamais déborder
  // sur ses voisins. `x`/`y` lus sur CHAQUE arc (pas le centre du graphique, contrairement au
  // glacis ci-dessous) : un segment "actif" décalé (offset) doit garder son dégradé centré sur
  // sa propre position, pas sur le centre du donut.
  _donutGradientPlugin() {
    return {
      id: 'donutGradient',
      afterDatasetDraw(chart, args) {
        const { ctx } = chart;
        const raw = chart.data.datasets[args.index].backgroundColor;
        const spacing = chart.options.spacing || 0;
        args.meta.data.forEach((arc, i) => {
          const color = Array.isArray(raw) ? raw[i] : raw;
          if (typeof color !== 'string' || color.length !== 7 || color[0] !== '#') return;
          const { x, y, startAngle, endAngle, innerRadius, outerRadius } = arc.getProps(
            ['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true
          );
          if (!outerRadius) return;

          // `startAngle`/`endAngle` lus ci-dessus ne tiennent PAS compte de `spacing` — Chart.js
          // ne rétrécit l'angle qu'au moment du dessin, sans le répercuter sur les propriétés de
          // l'élément. Sans ce correctif, notre repeinte comblerait l'espace entre segments.
          // Approximation : conversion pixels -> radians au rayon extérieur (suffisant, l'écart
          // avec le calcul interne exact de Chart.js est imperceptible pour un espacement fin).
          const gapAngle = spacing > 0 ? (spacing / 2) / outerRadius : 0;
          const a0 = startAngle + gapAngle, a1 = endAngle - gapAngle;
          if (a1 <= a0) return;

          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, outerRadius, a0, a1);
          ctx.arc(x, y, innerRadius, a1, a0, true);
          ctx.closePath();
          ctx.clip();

          const grad = ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
          grad.addColorStop(0, Charts._shade(color, -0.38));
          grad.addColorStop(1, Charts._shade(color, 0.15));
          ctx.fillStyle = grad;
          ctx.fillRect(x - outerRadius, y - outerRadius, outerRadius * 2, outerRadius * 2);
          ctx.restore();
        });
      },
    };
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
  // (Flux._renderDonut : Utils.getCategoryColor, l'identité couleur de chaque catégorie,
  // partagée avec les cartes/pastilles/légende sous le donut).
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
        spacing: 3,      // fine séparation entre segments (voir _donutGradientPlugin pour le
                          // correctif nécessaire à cause de ce réglage)
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
      plugins: [this._donutShadowPlugin(), this._donutGradientPlugin(), this._donutGlossPlugin()],
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
      backgroundColor: this._vGrad((color || '#6366f1') + '55', (color || '#6366f1') + '00'),
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
        scales: { y: this._yAxis(this._dottedGrid()), x: this._xAxis() },
      },
    });
  },

  // Même style "premium" que fluxBar (dégradé par barre, ombre, highlight, gridlines
  // pointillées) pour l'homogénéité — chaque barre garde sa propre teinte HSL (une par
  // catégorie, comme avant), mais avec un second stop assombri (~42% de la luminosité
  // d'origine, même teinte/saturation) pour le dégradé vertical.
  patrimony(assets, liabilities) {
    const assetsByCat = {}, liabByCat = {};
    assets.forEach(a => { assetsByCat[a.category] = (assetsByCat[a.category] || 0) + a.value; });
    liabilities.forEach(l => { liabByCat[l.category] = (liabByCat[l.category] || 0) + l.value; });

    const labels = [...Object.keys(assetsByCat).map(k => `${k} (actif)`), ...Object.keys(liabByCat).map(k => `${k} (passif)`)];
    const data = [...Object.values(assetsByCat), ...Object.values(liabByCat).map(v => -v)];
    const pairs = [
      ...Object.keys(assetsByCat).map((_, i) => {
        const l = 45 + i * 10;
        return [`hsla(142, 60%, ${l}%, 0.8)`, `hsla(142, 60%, ${Math.round(l * 0.42)}%, 0.8)`];
      }),
      ...Object.keys(liabByCat).map((_, i) => {
        const l = 50 + i * 10;
        return [`hsla(0, 80%, ${l}%, 0.8)`, `hsla(0, 80%, ${Math.round(l * 0.42)}%, 0.8)`];
      }),
    ];
    const colors = pairs.map(([light]) => light);

    if (!data.length) { this.destroy('chart-patrimony'); return; }
    this.create('chart-patrimony', {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Valeur', data, backgroundColor: colors, borderRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { ...this._tip(), callbacks: { label: (ctx) => ` ${Utils.formatCurrency(Math.abs(ctx.raw))}` } } },
        scales: { y: this._yAxis(this._dottedGrid({ beginAtZero: false })), x: this._xAxis() },
      },
      plugins: [this._barShadowPlugin(), this._barGradientPlugin([pairs])],
    });
  },
};
