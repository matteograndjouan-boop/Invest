const Flux = {
  _activeFilters: new Set(),
  _multiMode: false,
  _expandedCats: new Set(),

  init() {
    PeriodFilter.onChange(() => {
      if (!document.getElementById('section-flux').classList.contains('hidden')) this.render();
    });
    this._renderCatPills();
  },

  // Dépenses "réelles" au sens strict (catégorie de type 'expense') : Épargne/Revenus n'en
  // font jamais partie, même si un enregistrement existe techniquement (import bancaire).
  _realExpenses() {
    return Storage.getExpenses().filter(e => Utils.isExpenseCategory(e.category));
  },

  _renderCatPills() {
    const container = document.getElementById('flux-cat-pills');
    if (!container) return;
    // Seulement les catégories ayant au moins une dépense sur la période active — pas toutes les
    // catégories de type 'expense' existantes — pour éviter une rangée de pastilles vides sans
    // rapport avec ce qui est affiché. Recalculé à chaque render() (changement de période,
    // ajout/suppression de dépense...), pas qu'à l'ouverture de l'onglet.
    const usedCats = new Set(this._categoryTotals().map(([name]) => name));
    // Purge les filtres actifs devenus invalides (catégorie qui n'a plus aucune dépense sur la
    // nouvelle période) : sans ça, une pastille active resterait invisible dans la liste — donc
    // impossible à désactiver — tout en continuant à filtrer (sans effet réel, 0 dépense de
    // toute façon, mais un état incohérent qu'il vaut mieux nettoyer).
    [...this._activeFilters].forEach(f => { if (!usedCats.has(f)) this._activeFilters.delete(f); });
    const cats = Storage.getCategories().filter(c => Categories._catType(c) === 'expense' && usedCats.has(c.name)).map(c => c.name);
    const active = this._activeFilters;
    const multi = this._multiMode;

    const multiBtn = `<button class="flux-multi-btn${multi ? ' active' : ''}" onclick="Flux._toggleMultiMode()" title="Activer la sélection multiple">⊕ Multi</button>`;
    const allActive = !active.size;
    const allBtn = `<button class="flux-pill${allActive ? ' active' : ''}" onclick="Flux._clearFilters()">
      <span class="flux-pill-dot" style="background:${allActive ? '#fff' : 'var(--text-muted)'}"></span>Toutes
    </button>`;
    const catBtns = cats.map((c) => {
      const color = Utils.getCategoryColor(c);
      const isActive = active.has(c);
      const style = isActive ? `style="background:${color};border-color:${color}"` : '';
      return `<button class="flux-pill${isActive ? ' active' : ''}" onclick="Flux._togglePill('${c.replace(/'/g, "\\'")}')" ${style}>
        <span class="flux-pill-dot" style="background:${isActive ? '#fff' : color}"></span>${c}
      </button>`;
    }).join('');
    container.innerHTML = multiBtn + allBtn + catBtns;
  },

  // render(true) ci-dessous ré-appelle _renderCatPills() lui-même (voir en tête de render()),
  // pas besoin de l'appeler ici en plus.
  _toggleMultiMode() {
    this._multiMode = !this._multiMode;
    if (!this._multiMode && this._activeFilters.size > 1) {
      this._activeFilters = new Set([[...this._activeFilters][0]]);
    }
    this.render(true);
  },

  _clearFilters() {
    this._activeFilters = new Set();
    this.render(true);
  },

  _togglePill(cat) {
    if (this._multiMode) {
      if (this._activeFilters.has(cat)) this._activeFilters.delete(cat);
      else this._activeFilters.add(cat);
    } else {
      this._activeFilters = this._activeFilters.has(cat) ? new Set() : new Set([cat]);
    }
    this.render(true);
  },

  // Kept for donut click compatibility
  toggleFilter(label) {
    if (!label) return;
    if (label === 'Autres') { this._toggleAutres(); return; }
    this._togglePill(label);
  },

  // Catégories regroupées dans "Autres" sur le donut (au-delà du top 6 — _categoryBreakdown).
  _autresCategories() {
    return this._categoryTotals().slice(6).map(([label]) => label);
  },

  // "Autres" est actif quand la sélection courante correspond EXACTEMENT à l'ensemble de ses
  // catégories (pas juste une intersection partielle) — sert au toggle ci-dessous ET à l'état
  // visuel du donut (_renderDonut), puisque "Autres" est un label synthétique qui n'apparaît
  // jamais lui-même dans _activeFilters (seules les vraies catégories qui le composent y sont).
  _isAutresActive(others = this._autresCategories()) {
    return others.length > 0 && others.length === this._activeFilters.size && others.every(c => this._activeFilters.has(c));
  },

  // Clic sur le segment/légende "Autres" du donut : sélectionne d'un coup TOUTES les catégories
  // qui le composent, en mode multi (plusieurs catégories actives à la fois, comme ⊕ Multi). Un
  // reclic sur "Autres" alors que cette sélection exacte est déjà active l'annule (même logique
  // toggle que les autres catégories).
  _toggleAutres() {
    const others = this._autresCategories();
    if (!others.length) return;
    if (this._isAutresActive(others)) {
      this._clearFilters();
      return;
    }
    this._multiMode = true;
    this._activeFilters = new Set(others);
    this.render(true);
  },

  clearFilter() { this._clearFilters(); },

  _catLabel() {
    const s = this._activeFilters;
    if (!s.size) return '';
    if (s.size === 1) return [...s][0];
    return `${s.size} catégories`;
  },

  _getPrevPeriodData() {
    const s = PeriodFilter.get();
    if (s.type !== 'month') return null;
    const [y, m] = s.month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const start = `${pm}-01`;
    const end = `${pm}-${String(last).padStart(2, '0')}`;
    return {
      expenses: this._realExpenses().filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end),
      revenues: Storage.getRevenues().filter(r => Utils.getExpenseDate(r) >= start && Utils.getExpenseDate(r) <= end),
    };
  },

  // Couleur/flèche suivent le signe brut de la variation (vert = positif, rouge = négatif),
  // pas une notion de "bon/mauvais" par métrique — une baisse de dépenses s'affiche donc en
  // rouge comme n'importe quelle autre variation négative.
  _renderKpiTrend(id, current, prev) {
    const el = document.getElementById(id);
    if (!el) return;
    if (prev == null || prev === 0) { el.innerHTML = ''; return; }
    const diff = current - prev;
    if (diff === 0) { el.innerHTML = `<span class="trend-neutral">→ 0 % vs période préc.</span>`; return; }
    const pct = Math.abs((diff / prev) * 100).toFixed(1).replace('.', ',');
    const isUp = diff > 0;
    const arrow = isUp ? '↑' : '↓';
    const sign = isUp ? '+' : '-';
    const cls = isUp ? 'trend-good' : 'trend-bad';
    el.innerHTML = `<span class="${cls}">${arrow} ${sign}${pct} % vs période préc.</span>`;
  },

  // `skipBarChart` : passé à `true` par les actions de filtre de catégorie (pastilles, donut,
  // cartes) — le graphique "Revenus vs Dépenses" n'en dépend jamais (voir _renderBarChart) et
  // ne doit donc ni se recalculer ni se ré-animer à chaque clic de filtre, seulement quand la
  // période ou le mode de date changent (PeriodFilter.onChange, ci-dessous) ou à l'ouverture
  // de l'onglet.
  render(skipBarChart = false) {
    // En premier : peut purger des pastilles actives devenues invalides (catégorie qui n'a plus
    // de dépense sur la nouvelle période) — le reste de render() doit lire _activeFilters
    // déjà nettoyé, pas avant.
    this._renderCatPills();
    const { start, end } = PeriodFilter.getDateRange();
    const catFilters = this._activeFilters;

    const allExpenses = this._realExpenses();
    const allRevenues = Storage.getRevenues();

    let expenses = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);
    const revenues = allRevenues.filter(r => Utils.getExpenseDate(r) >= start && Utils.getExpenseDate(r) <= end);

    if (catFilters.size) expenses = expenses.filter(e => catFilters.has(e.category));

    const totalRev = revenues.reduce((s, r) => s + r.amount, 0);
    const totalDep = expenses.reduce((s, e) => s + e.amount, 0);
    const solde = totalRev - totalDep;
    const tauxEpargne = totalRev > 0 ? (solde / totalRev * 100).toFixed(1) : '—';

    document.getElementById('flux-kpi-revenus').textContent = Utils.formatCurrency(totalRev);
    document.getElementById('flux-kpi-depenses').textContent = Utils.formatCurrency(totalDep);
    document.getElementById('flux-kpi-solde').textContent = Utils.formatCurrency(solde);
    document.getElementById('flux-kpi-epargne').textContent = tauxEpargne !== '—' ? tauxEpargne.replace('.', ',') + ' %' : '—';

    const prev = this._getPrevPeriodData();
    if (prev) {
      const prevRev = prev.revenues.reduce((s, r) => s + r.amount, 0);
      let prevExp = prev.expenses;
      if (catFilters.size) prevExp = prevExp.filter(e => catFilters.has(e.category));
      const prevDep = prevExp.reduce((s, e) => s + e.amount, 0);
      const prevSolde = prevRev - prevDep;
      this._renderKpiTrend('flux-trend-revenus', totalRev, prevRev);
      this._renderKpiTrend('flux-trend-depenses', totalDep, prevDep);
      this._renderKpiTrend('flux-trend-solde', solde, prevSolde);
      const prevEp = prevRev > 0 ? prevSolde / prevRev * 100 : null;
      this._renderKpiTrend('flux-trend-epargne', parseFloat(tauxEpargne) || 0, prevEp);
    } else {
      ['flux-trend-revenus','flux-trend-depenses','flux-trend-solde','flux-trend-epargne']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    }

    if (!skipBarChart) this._renderBarChart(allExpenses, allRevenues);
    this._renderDonut(catFilters);
    this._renderCategoryCards(catFilters);
    this._renderSummaryTable(allExpenses, start, end, catFilters);
  },

  // Toujours Revenus vs Dépenses total, jamais filtré par catégorie (celle-ci pilote le donut,
  // les cartes et le tableau, pas ce graphique) : `allExpenses`/`allRevenues` reçus ici ne sont
  // jamais passés au crible de `catFilters`, et l'appelant (render) n'invoque même cette
  // méthode que pour un changement de période/mode de date ou l'ouverture de l'onglet — jamais
  // pour un simple clic de filtre (voir `skipBarChart` dans render) — pour que ce graphique ne
  // se ré-anime pas non plus inutilement à chaque clic de pastille.
  _renderBarChart(allExpenses, allRevenues) {
    const { start, end } = PeriodFilter.getDateRange();

    const months = [];
    let cur = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
    while (cur <= endDate) {
      months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    // Plus la période affiche de mois, plus les barres ont besoin de largeur face au donut
    // (1 mois = 2 barres ; 4+ mois commencent à être serrés) — le donut ne descend jamais
    // sous 35 %.
    const donutPct = months.length <= 1 ? 55 : months.length <= 3 ? 45 : 35;
    const chartsRow = document.getElementById('flux-charts-row');
    if (chartsRow) chartsRow.style.gridTemplateColumns = `${100 - donutPct}fr ${donutPct}fr`;

    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const labels = months.map(m => {
      const [y, mo] = m.split('-').map(Number);
      return MONTHS_FR[mo - 1] + ' ' + String(y).slice(2);
    });

    const getLastDay = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };

    const revByMonth = months.map(m => {
      const mStart = `${m}-01`, mEnd = `${m}-${String(getLastDay(m)).padStart(2, '0')}`;
      const s = mStart < start ? start : mStart, e = mEnd > end ? end : mEnd;
      return allRevenues.filter(r => Utils.getExpenseDate(r) >= s && Utils.getExpenseDate(r) <= e).reduce((sum, r) => sum + r.amount, 0);
    });

    const depByMonth = months.map(m => {
      const mStart = `${m}-01`, mEnd = `${m}-${String(getLastDay(m)).padStart(2, '0')}`;
      const s = mStart < start ? start : mStart, e = mEnd > end ? end : mEnd;
      return allExpenses.filter(ex => Utils.getExpenseDate(ex) >= s && Utils.getExpenseDate(ex) <= e).reduce((sum, ex) => sum + ex.amount, 0);
    });

    const soldeByMonth = revByMonth.map((r, i) => r - depByMonth[i]);

    Charts.fluxBar(labels, revByMonth, depByMonth, soldeByMonth);
  },

  // Dépenses de la période groupées par catégorie, triées par montant décroissant — brut,
  // sans regroupement (une entrée par catégorie ayant une dépense, jamais filtré par
  // catégorie : seule la période compte ici). Source commune à _categoryBreakdown (donut,
  // qui y ajoute le regroupement top 6 + « Autres ») et aux cartes (qui veulent tout voir).
  _categoryTotals() {
    const byCategory = {};
    const { start, end } = PeriodFilter.getDateRange();
    this._realExpenses()
      .filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end)
      .forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  },

  // Répartition pour le donut : top 6 + « Autres » (au-delà, le camembert devient illisible).
  _categoryBreakdown() {
    let entries = this._categoryTotals();
    const total = entries.reduce((s, [, v]) => s + v, 0);

    if (entries.length > 6) {
      const autres = entries.slice(6).reduce((s, [, v]) => s + v, 0);
      entries = [...entries.slice(0, 6), ['Autres', autres]];
    }
    return { entries, total };
  },

  _renderDonut(catFilters) {
    const { entries, total } = this._categoryBreakdown();
    // Utils.getCategoryColor (même source que les cartes de _renderCategoryCards juste en
    // dessous, la légende, les pastilles de filtre...) : le donut suit maintenant l'identité
    // couleur de chaque catégorie, plutôt qu'un dégradé de bleu monochrome par rang — la
    // palette élargie à 7 teintes (Utils.CATEGORY_COLORS) rend les catégories suffisamment
    // distinguables entre elles pour ne plus avoir besoin de ce repli. "Autres" (label
    // synthétique du regroupement top 6, voir _categoryBreakdown) a sa propre couleur neutre
    // dédiée (Utils.CATEGORY_COLOR_OTHER), gérée directement par getCategoryColor.
    const colors = entries.map(([label]) => Utils.getCategoryColor(label));

    // "Autres" est un label synthétique : il n'apparaît jamais lui-même dans catFilters (seules
    // les vraies catégories qui le composent y sont), donc catFilters seul le montrerait toujours
    // comme non sélectionné/estompé — même quand on vient de cliquer dessus. displayFilters
    // substitue 'Autres' quand sa sélection exacte est active, pour que le donut/la légende le
    // mettent en évidence comme n'importe quelle autre catégorie active.
    const displayFilters = this._isAutresActive() ? new Set(['Autres']) : catFilters;

    Charts.fluxDonut(
      entries.map(([k]) => k),
      entries.map(([, v]) => v),
      colors,
      displayFilters,
      (label) => this.toggleFilter(label)
    );

    const legend = document.getElementById('flux-donut-legend');
    if (legend) {
      if (!entries.length) { legend.innerHTML = ''; return; }
      // Toujours en 2 colonnes ; juste pastille + nom + pourcentage, pas de barre/montant.
      legend.innerHTML = entries.map(([label, value], i) => {
        const pct = total > 0 ? (value / total * 100) : 0;
        const pctStr = pct.toFixed(1);
        const color = colors[i];
        const isActive = displayFilters.size > 0 && displayFilters.has(label);
        const isFiltered = displayFilters.size > 0 && !displayFilters.has(label);
        const safeName = label.replace(/'/g, "\\'");
        return `<div class="dl-item${isActive ? ' active' : ''}${isFiltered ? ' dimmed' : ''}" style="--ic:${color}" onclick="Flux.toggleFilter('${safeName}')">
          <span class="dl-dot" style="background:${color}"></span>
          <span class="dl-name">${label}</span>
          <span class="dl-pct">${pctStr}%</span>
        </div>`;
      }).join('');
    }
  },

  // Dépenses par catégorie en cartes : toutes les catégories ayant une dépense sur la période
  // (_categoryTotals, PAS le regroupement top 6 + « Autres » du donut — ce dernier reste
  // réservé au camembert), une carte par catégorie (icône, nom, montant, barre proportionnelle
  // au MAX de la période — pas au total). Reliée aux mêmes filtres que le donut/tableau (clic =
  // même bascule de filtre).
  _renderCategoryCards(catFilters) {
    const container = document.getElementById('flux-cat-cards');
    if (!container) return;
    const entries = this._categoryTotals();
    if (!entries.length) { container.innerHTML = ''; return; }

    const max = Math.max(...entries.map(([, v]) => v));
    container.innerHTML = entries.map(([label, value]) => {
      const color = Utils.getCategoryColor(label);
      // Icône personnalisée de la catégorie si définie (Categories._setIcon), sinon repli sur
      // l'auto-détection par mot-clé — _meta(label) seul ignorait tout changement d'icône fait
      // dans l'onglet Catégories (toujours l'icône déduite du nom, jamais la valeur enregistrée).
      const cat  = Storage.getCategories().find(c => c.name === label);
      const icon = (cat && cat.icon) || Categories._meta(label).icon;
      const barW = max > 0 ? (value / max * 100).toFixed(1) : 0;
      const isActive = catFilters.size > 0 && catFilters.has(label);
      const isFiltered = catFilters.size > 0 && !catFilters.has(label);
      const safeName = label.replace(/'/g, "\\'");
      return `<div class="flux-cat-card${isActive ? ' active' : ''}${isFiltered ? ' dimmed' : ''}" onclick="Flux.toggleFilter('${safeName}')">
        <div class="fcc-top"><span class="fcc-ico">${icon}</span><span class="fcc-name">${label}</span></div>
        <div class="fcc-amount">${Utils.formatCurrency(value)}</div>
        <div class="fcc-bar-bg"><div class="fcc-bar-fill" style="width:${barW}%;background:${color}"></div></div>
      </div>`;
    }).join('');
  },

  toggleCatExpand(cat) {
    if (this._expandedCats.has(cat)) this._expandedCats.delete(cat);
    else this._expandedCats.add(cat);
    const { start, end } = PeriodFilter.getDateRange();
    this._renderSummaryTable(this._realExpenses(), start, end, this._activeFilters);
  },

  _renderSummaryTable(allExpenses, start, end, catFilters) {
    let expenses = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);
    if (catFilters.size) expenses = expenses.filter(e => catFilters.has(e.category));

    const tbody = document.getElementById('flux-summary-tbody');
    const empty = document.getElementById('flux-summary-empty');
    const title = document.getElementById('flux-summary-title');
    const thLabel = document.getElementById('flux-summary-th-label');
    if (!tbody) return;

    const catLabel = this._catLabel();
    const showSub = catFilters.size === 1;

    // Filtre sur 1 seule catégorie : le tableau bascule sur ses sous-catégories (showSub),
    // dont les lignes n'ont pas de handler de clic (elles ne représentent plus la catégorie
    // filtrée) — le titre affiche donc la catégorie active sous forme de pastille (même
    // recette que .flux-pill.active dans _renderCatPills : couleur de la catégorie, pas une
    // couleur générique), seul endroit cliquable pour l'annuler, comme sur le camembert/les
    // pastilles au-dessus.
    if (title) {
      if (showSub) {
        const color = Utils.getCategoryColor(catLabel);
        const safeName = catLabel.replace(/'/g, "\\'");
        title.innerHTML = `Répartition <button type="button" class="flux-pill active" style="background:${color};border-color:${color}" onclick="Flux._togglePill('${safeName}')"><span class="flux-pill-dot" style="background:#fff"></span>${catLabel}</button>`;
      } else {
        title.textContent = catFilters.size ? `Répartition — ${catLabel}` : 'Répartition par catégorie';
      }
    }
    if (thLabel) thLabel.textContent = showSub ? 'Sous-catégorie' : 'Catégorie';

    if (!expenses.length) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    const groups = {};
    expenses.forEach(e => {
      const key = showSub ? (e.subcategory || '—') : e.category;
      if (!groups[key]) groups[key] = { amount: 0, count: 0, subs: {} };
      groups[key].amount += e.amount;
      groups[key].count++;
      if (!showSub) {
        const sub = e.subcategory || '—';
        if (!groups[key].subs[sub]) groups[key].subs[sub] = { amount: 0, count: 0 };
        groups[key].subs[sub].amount += e.amount;
        groups[key].subs[sub].count++;
      }
    });

    const total = Object.values(groups).reduce((s, g) => s + g.amount, 0);
    const sorted = Object.entries(groups).sort((a, b) => b[1].amount - a[1].amount);

    const rows = [];
    sorted.forEach(([label, g]) => {
      const pct    = total > 0 ? (g.amount / total * 100) : 0;
      const pctStr = pct.toFixed(1);
      const barW   = Math.min(100, pct).toFixed(1);
      const color  = !showSub ? Utils.getCategoryColor(label) : '#6366f1';
      const hex22  = color + '22';

      if (!showSub) {
        const subEntries = Object.entries(g.subs).sort((a, b) => b[1].amount - a[1].amount);
        const hasSubs = subEntries.length > 0 && !(subEntries.length === 1 && subEntries[0][0] === '—');
        const isExpanded = this._expandedCats.has(label);
        const expandBtn = hasSubs
          ? `<button class="srow-expand-btn${isExpanded ? ' open' : ''}" onclick="event.stopPropagation();Flux.toggleCatExpand('${label.replace(/'/g, "\\'")}')" title="${isExpanded ? 'Réduire' : 'Détailler'}">▶</button>`
          : `<span class="srow-expand-ph"></span>`;

        rows.push(`<tr class="srow" style="--rc:${color}" onclick="Flux._togglePill('${label.replace(/'/g, "\\'")}')">
          <td class="srow-td-label">
            <div class="srow-label-inner">${expandBtn}<span class="srow-dot" style="background:${color}"></span><span class="srow-name">${label}</span></div>
          </td>
          <td class="srow-td-amount">${Utils.formatCurrency(g.amount)}</td>
          <td class="srow-td-bar">
            <div class="srow-bar-outer">
              <div class="srow-bar-track" style="background:${hex22}"><div class="srow-bar-fill" style="width:${barW}%;background:${color}"></div></div>
              <span class="srow-pct">${pctStr}%</span>
            </div>
          </td>
          <td class="srow-td-count">${g.count}</td>
        </tr>`);

        if (isExpanded && hasSubs) {
          subEntries.forEach(([sub, sg]) => {
            const sPct  = g.amount > 0 ? (sg.amount / g.amount * 100) : 0;
            const sPctS = sPct.toFixed(1);
            const sBarW = Math.min(100, sPct).toFixed(1);
            rows.push(`<tr class="srow srow-sub" style="--rc:${color}">
              <td class="srow-td-label">
                <div class="srow-sub-inner"><span class="srow-sub-tree">└</span><span class="srow-sub-name">${sub}</span></div>
              </td>
              <td class="srow-td-amount srow-sub-amount">${Utils.formatCurrency(sg.amount)}</td>
              <td class="srow-td-bar">
                <div class="srow-bar-outer">
                  <div class="srow-bar-track" style="background:${hex22}"><div class="srow-bar-fill" style="width:${sBarW}%;background:${color}88"></div></div>
                  <span class="srow-pct">${sPctS}%</span>
                </div>
              </td>
              <td class="srow-td-count srow-sub-count">${sg.count}</td>
            </tr>`);
          });
        }
      } else {
        rows.push(`<tr class="srow" style="--rc:${color}">
          <td class="srow-td-label">
            <div class="srow-label-inner"><span class="srow-expand-ph"></span><span class="srow-name">${label}</span></div>
          </td>
          <td class="srow-td-amount">${Utils.formatCurrency(g.amount)}</td>
          <td class="srow-td-bar">
            <div class="srow-bar-outer">
              <div class="srow-bar-track" style="background:${hex22}"><div class="srow-bar-fill" style="width:${barW}%;background:${color}"></div></div>
              <span class="srow-pct">${pctStr}%</span>
            </div>
          </td>
          <td class="srow-td-count">${g.count}</td>
        </tr>`);
      }
    });

    tbody.innerHTML = rows.join('');
  },
};
