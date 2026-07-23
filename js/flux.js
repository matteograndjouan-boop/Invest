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

    const multiBtn = `<button class="flux-multi-btn${multi ? ' active' : ''}" onclick="Flux._toggleMultiMode()" title="Activer la sélection multiple">⊕ Plusieurs</button>`;
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
  // qui le composent, en mode multi (plusieurs catégories actives à la fois, comme ⊕ Plusieurs).
  // Un reclic sur "Autres" alors que cette sélection exacte est déjà active l'annule (même
  // logique toggle que les autres catégories).
  // Sélectionne toutes les catégories groupées dans "Autres" SANS activer le mode multi — sinon
  // le clic suivant sur une autre catégorie s'ajoutait au filtre au lieu de le remplacer (mode
  // multi resté actif malgré lui). Le mode multi ne doit s'activer que par un clic explicite sur
  // le bouton "⊕ Plusieurs" (_toggleMultiMode) — jamais comme effet de bord d'un autre clic.
  _toggleAutres() {
    const others = this._autresCategories();
    if (!others.length) return;
    if (this._isAutresActive(others)) {
      this._clearFilters();
      return;
    }
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
    this._renderHBarChart(allExpenses, start, end, catFilters);
  },

  // Toujours Revenus vs Dépenses total, jamais filtré par catégorie (celle-ci pilote le donut,
  // les cartes et le tableau, pas ce graphique) : `allExpenses`/`allRevenues` reçus ici ne sont
  // jamais passés au crible de `catFilters`, et l'appelant (render) n'invoque même cette
  // méthode que pour un changement de période/mode de date ou l'ouverture de l'onglet — jamais
  // pour un simple clic de filtre (voir `skipBarChart` dans render) — pour que ce graphique ne
  // se ré-anime pas non plus inutilement à chaque clic de pastille.
  _renderBarChart(allExpenses, allRevenues) {
    const { start, end } = PeriodFilter.getDateRange();
    const startD = new Date(start + 'T00:00:00');
    const endD = new Date(end + 'T00:00:00');
    const getLastDay = (y, mo1) => new Date(y, mo1, 0).getDate(); // mo1 = mois 1-indexé

    // "Courte" = 1 mois ou moins en DURÉE RÉELLE, pas en nombre de mois calendaires touchés :
    // une plage à cheval comme 15 jan -> 15 fév dure 31 jours mais touche 2 étiquettes de mois
    // (Jan/Fév). 31 = longueur du plus long mois, donc borne haute naturelle pour "<= 1 mois".
    const diffDays = Math.round((endD - startD) / 86400000);
    const isShortPeriod = diffDays <= 31;

    // Même proportion bâton/donut (45 %) pour tous les filtres de période, courts ou longs —
    // "Mois" (ou une plage plus courte) affiche désormais un bâton par SEMAINE (ci-dessous) au
    // lieu d'un bâton unique pour tout le mois, donc a autant besoin de largeur que les autres
    // filtres (un bâton par mois) et n'a plus besoin d'un donut élargi à 55 % comme avant.
    const donutPct = 45;
    const chartsRow = document.getElementById('flux-charts-row');
    if (chartsRow) chartsRow.style.gridTemplateColumns = `${100 - donutPct}fr ${donutPct}fr`;

    const titleEl = document.getElementById('flux-bar-title');
    if (titleEl) titleEl.textContent = isShortPeriod ? 'Dépenses par semaine' : 'Revenus vs Dépenses';

    let labels, revByPeriod, depByPeriod;

    if (isShortPeriod) {
      const startYM = start.slice(0, 7);
      const lastDayOfStartMonth = getLastDay(startD.getFullYear(), startD.getMonth() + 1);
      // Vraiment "1 mois calendaire" seulement si [start, end] correspond exactement au 1er et
      // au dernier jour du même mois (filtre "Mois", ou plage libre calée dessus) — PAS juste
      // "diffDays <= 31", qui inclut aussi les plages à cheval ou partielles dans un mois.
      const isExactMonth = start.slice(8, 10) === '01' && start.slice(0, 7) === end.slice(0, 7)
        && end === `${startYM}-${String(lastDayOfStartMonth).padStart(2, '0')}`;

      if (isExactMonth) {
        // Mois calendaire complet : 4 semaines FIXES (1-7 / 8-14 / 15-21 / 22-fin), pas
        // glissantes — repère stable "Semaine N" indépendant du jour de la semaine où tombe le
        // 1er du mois. La dernière regroupe les jours restants (7 à 10 selon la longueur du mois).
        const buckets = [[1, 7], [8, 14], [15, 21], [22, lastDayOfStartMonth]];
        labels = ['Semaine 1', 'Semaine 2', 'Semaine 3', 'Semaine 4'];
        depByPeriod = buckets.map(([d1, d2]) => {
          const s = `${startYM}-${String(d1).padStart(2, '0')}`, e = `${startYM}-${String(d2).padStart(2, '0')}`;
          return allExpenses.filter(ex => Utils.getExpenseDate(ex) >= s && Utils.getExpenseDate(ex) <= e).reduce((sum, ex) => sum + ex.amount, 0);
        });
      } else {
        // Plage libre <= 1 mois, à cheval sur 2 mois ou partielle dans un mois : semaines
        // glissantes ancrées sur le DÉBUT de la période choisie (pas le lundi précédent) — le
        // 1er bâton correspond ainsi toujours au tout début de la plage, comme demandé.
        const weeks = [];
        let wStart = new Date(startD);
        while (wStart <= endD) {
          const wEnd = new Date(wStart);
          wEnd.setDate(wStart.getDate() + 6);
          weeks.push({ start: new Date(wStart), end: wEnd });
          wStart = new Date(wStart);
          wStart.setDate(wStart.getDate() + 7);
        }

        const toStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
        const fmt = (d) => `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;

        // Comparaison en chaînes (YYYY-MM-DD s'ordonne lexicographiquement comme des dates) —
        // PAS Math.max/min, qui coerceraient ces chaînes en NaN et casseraient tout l'écrêtage.
        labels = weeks.map(w => fmt(w.start));
        depByPeriod = weeks.map(w => {
          const wStartStr = toStr(w.start), wEndStr = toStr(w.end);
          const s = wStartStr < start ? start : wStartStr, e = wEndStr > end ? end : wEndStr;
          return allExpenses.filter(ex => Utils.getExpenseDate(ex) >= s && Utils.getExpenseDate(ex) <= e).reduce((sum, ex) => sum + ex.amount, 0);
        });
      }
    } else {
      const months = [];
      let cur = new Date(startD.getFullYear(), startD.getMonth(), 1);
      while (cur <= endD) {
        months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }

      const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      labels = months.map(m => {
        const [y, mo] = m.split('-').map(Number);
        return MONTHS_FR[mo - 1] + ' ' + String(y).slice(2);
      });

      revByPeriod = months.map(m => {
        const [y, mo] = m.split('-').map(Number);
        const mStart = `${m}-01`, mEnd = `${m}-${String(getLastDay(y, mo)).padStart(2, '0')}`;
        const s = mStart < start ? start : mStart, e = mEnd > end ? end : mEnd;
        return allRevenues.filter(r => Utils.getExpenseDate(r) >= s && Utils.getExpenseDate(r) <= e).reduce((sum, r) => sum + r.amount, 0);
      });

      depByPeriod = months.map(m => {
        const [y, mo] = m.split('-').map(Number);
        const mStart = `${m}-01`, mEnd = `${m}-${String(getLastDay(y, mo)).padStart(2, '0')}`;
        const s = mStart < start ? start : mStart, e = mEnd > end ? end : mEnd;
        return allExpenses.filter(ex => Utils.getExpenseDate(ex) >= s && Utils.getExpenseDate(ex) <= e).reduce((sum, ex) => sum + ex.amount, 0);
      });
    }

    if (isShortPeriod) {
      Charts.fluxBar(labels, [], depByPeriod, [], 'chart-flux-bar', { expensesOnly: true });
    } else {
      const soldeByPeriod = revByPeriod.map((r, i) => r - depByPeriod[i]);
      Charts.fluxBar(labels, revByPeriod, depByPeriod, soldeByPeriod);
    }
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

    container.innerHTML = entries.map(([label, value]) => {
      const color = Utils.getCategoryColor(label);
      // Icône personnalisée de la catégorie si définie (Categories._setIcon), sinon repli sur
      // l'auto-détection par mot-clé — _meta(label) seul ignorait tout changement d'icône fait
      // dans l'onglet Catégories (toujours l'icône déduite du nom, jamais la valeur enregistrée).
      const cat  = Storage.getCategories().find(c => c.name === label);
      const icon = (cat && cat.icon) || Categories._meta(label).icon;
      const isActive = catFilters.size > 0 && catFilters.has(label);
      const isFiltered = catFilters.size > 0 && !catFilters.has(label);
      const safeName = label.replace(/'/g, "\\'");
      // Bande du haut : dégradé couleur de la catégorie -> teinte claire de cette même couleur
      // (Charts._shade, déjà utilisé ailleurs pour ce genre de dégradé) — en custom property
      // plutôt qu'en style direct sur .flux-cat-card, pour que le ::before (voir CSS) qui porte
      // réellement la bande puisse la lire (un style inline ne s'applique jamais à un pseudo-
      // élément, seulement à l'élément qui le porte).
      const band = `linear-gradient(90deg, ${color}, ${Charts._shade(color, 0.45)})`;
      return `<div class="flux-cat-card${isActive ? ' active' : ''}${isFiltered ? ' dimmed' : ''}" style="--fcc-band:${band}" onclick="Flux.toggleFilter('${safeName}')">
        <div class="fcc-top"><span class="fcc-ico">${icon}</span><span class="fcc-name">${label}</span></div>
        <div class="fcc-amount">${Utils.formatCurrency(value)}</div>
      </div>`;
    }).join('');
  },

  toggleCatExpand(cat) {
    if (this._expandedCats.has(cat)) this._expandedCats.delete(cat);
    else this._expandedCats.add(cat);
    const { start, end } = PeriodFilter.getDateRange();
    this._renderSummaryTable(this._realExpenses(), start, end, this._activeFilters);
    this._updateHBarSegmentColors(cat);
    // Le dépli/repli change la hauteur du tableau (lignes de sous-catégorie en plus/en moins)
    // sans repasser par _renderHBarChart (_updateHBarSegmentColors ne touche qu'une couleur) —
    // sans cet appel, la synchronisation de hauteur resterait sur l'état d'avant ce clic.
    this._syncCardHeights();
  },

  // Regroupement partagé par _renderSummaryTable ET _renderHBarChart : même filtre catégorie,
  // même clé de regroupement (catégorie, ou sous-catégorie si 1 seule catégorie filtrée), même
  // tri par montant décroissant — garantit que l'ordre des barres du graphique correspond
  // TOUJOURS à celui du tableau (demandé), sans risque de divergence entre deux implémentations
  // séparées du même calcul.
  _summaryGroups(allExpenses, start, end, catFilters) {
    let expenses = allExpenses.filter(e => Utils.getExpenseDate(e) >= start && Utils.getExpenseDate(e) <= end);
    if (catFilters.size) expenses = expenses.filter(e => catFilters.has(e.category));

    const showSub = catFilters.size === 1;
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

    const sorted = Object.entries(groups).sort((a, b) => b[1].amount - a[1].amount);
    return { showSub, sorted };
  },

  // idx=0 (plus gros montant) garde la couleur vive d'origine, les suivants s'éclaircissent
  // progressivement (jusqu'à +60%) — sert à la fois aux segments d'une barre catégorie dépliée
  // (plusieurs sous-catégories dans UNE barre) et aux barres sous-catégorie quand une seule
  // catégorie est filtrée (plusieurs barres, une par sous-catégorie).
  _shadeByIndex(baseColor, idx, count) {
    if (idx <= 0 || count <= 1) return baseColor;
    const pct = 0.15 + (idx / (count - 1)) * 0.45;
    return Charts._shade(baseColor, pct);
  },

  // Barres HTML/CSS (pas Chart.js — voir commentaire CSS .flux-hbar-chart) reflétant exactement
  // _summaryGroups : même ordre que le tableau. Échelle relative au MAX affiché (pas au total) —
  // la plus grosse barre atteint 100% de la piste (moins la réserve fixe pour le montant, voir
  // HBAR_LABEL_RESERVE_PX ci-dessous), les autres lui sont proportionnelles.
  _renderHBarChart(allExpenses, start, end, catFilters) {
    const container = document.getElementById('flux-hbar-chart');
    const empty = document.getElementById('flux-hbar-empty');
    if (!container) return;

    const { showSub, sorted } = this._summaryGroups(allExpenses, start, end, catFilters);
    if (!sorted.length) {
      container.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      this._syncCardHeights();
      return;
    }
    if (empty) empty.classList.add('hidden');

    // Réserve de place (px, via calc/min) pour le montant en bout de barre, pas un simple plafond
    // en % : un plafond en % laisse une marge qui rétrécit avec la carte (responsive) ou avec un
    // montant à plus de chiffres, jusqu'à déborder (mesuré : 1.8px de marge à peine avec un
    // plafond à 78%, ça déborde carrément dès un montant à 5 chiffres sur une carte resserrée).
    // MESURÉE (le texte réel le plus large parmi les montants affichés), pas une constante figée
    // au pire cas : une constante assez large pour un montant à 5 chiffres réservait bien plus de
    // place que nécessaire pour de petits montants, écrasant à tort les proportions entre barres
    // (2 barres à ratio 2:1 rendues à la MÊME longueur, toutes deux plafonnées par une réserve
    // surdimensionnée pour ces montants-là).
    const amountStrs = sorted.map(([, g]) => Utils.formatCurrency(g.amount));
    const measureEl = document.createElement('span');
    measureEl.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:12.5px;font-weight:700;';
    document.body.appendChild(measureEl);
    const maxAmountTextWidth = Math.max(...amountStrs.map(s => { measureEl.textContent = s; return measureEl.getBoundingClientRect().width; }));
    measureEl.remove();
    const HBAR_LABEL_RESERVE_PX = Math.ceil(maxAmountTextWidth) + 16; // + gap (8px) + marge de sécurité
    const maxAmount = Math.max(...sorted.map(([, g]) => g.amount));
    const escAttr = (s) => String(s).replace(/"/g, '&quot;');
    const filterColor = showSub ? Utils.getCategoryColor(this._catLabel()) : null;

    // Hauteur d'une ligne du tableau (mesurée, pas figée en CSS — même logique que le spacer
    // d'en-tête ci-dessous) appliquée à chaque barre : sans ça, la 1re barre s'alignait bien sur
    // la 1re ligne du tableau (grâce au spacer), mais l'écart entre le rythme des lignes du
    // tableau (~47px, padding+bordure des <td>) et celui du graphique (gap flexbox ~39px)
    // s'accumulait ligne après ligne — jusqu'à 37px de décalage sur la dernière ligne d'une liste
    // de 6 catégories.
    // Le delta top-à-top entre 2 lignes réelles (pas la height d'une seule ligne isolée) capture
    // fidèlement le cycle vertical effectif du tableau, bordures collapsées comprises — measurer
    // une seule ligne laissait un résidu de 0.5px/ligne qui s'accumulait encore, en plus petit,
    // sur une longue liste. Repli sur la height d'une seule ligne s'il n'y en a qu'une (rien à
    // soustraire).
    const catRows = [...document.querySelectorAll('#flux-summary-tbody tr.srow:not(.srow-sub)')];
    const rowH = catRows.length >= 2
      ? catRows[1].getBoundingClientRect().top - catRows[0].getBoundingClientRect().top
      : (catRows[0] ? catRows[0].getBoundingClientRect().height : 0);
    const rowHStyle = rowH ? `height:${rowH}px;` : '';

    const rows = sorted.map(([label, g], idx) => {
      const rawPct = (maxAmount > 0 ? (g.amount / maxAmount * 100) : 0).toFixed(1);
      const widthCss = `min(${rawPct}%, calc(100% - ${HBAR_LABEL_RESERVE_PX}px))`;
      const amountStr = Utils.formatCurrency(g.amount);
      const safeName = label.replace(/'/g, "\\'");

      let segmentsHtml, dataCat = '', rowColor;
      if (showSub) {
        // Cas 2 (1 catégorie filtrée) : chaque barre = 1 sous-catégorie, teinte unie (nuance de
        // la couleur de LA catégorie filtrée selon le rang), pas de segmentation interne.
        rowColor = this._shadeByIndex(filterColor, idx, sorted.length);
        segmentsHtml = `<div class="hbar-seg" style="width:100%;background:${rowColor}"></div>`;
      } else {
        // Cas 1 (aucun filtre) / Cas 3 (plusieurs catégories filtrées) : chaque barre = 1
        // catégorie. Segments TOUJOURS présents à leur vraie largeur (proportion de la
        // sous-catégorie dans la catégorie) dès qu'il y a de vraies sous-catégories — seule leur
        // COULEUR change selon le dépli (teintes distinctes) ou pas (une seule teinte = barre
        // visuellement unie). Les mêmes nœuds DOM sont donc réutilisables tels quels par
        // _updateHBarSegmentColors (dépli/repli déjà en cours), qui n'a alors qu'à changer une
        // couleur pour que ça s'anime (voir .hbar-seg dans le CSS).
        rowColor = Utils.getCategoryColor(label);
        const subEntries = Object.entries(g.subs).sort((a, b) => b[1].amount - a[1].amount);
        const hasSubs = subEntries.length > 0 && !(subEntries.length === 1 && subEntries[0][0] === '—');
        const isExpanded = this._expandedCats.has(label);
        dataCat = ` data-cat="${escAttr(label)}"`;
        if (hasSubs) {
          segmentsHtml = subEntries.map(([sub, sg], i) => {
            const segColor = isExpanded ? this._shadeByIndex(rowColor, i, subEntries.length) : rowColor;
            const segPct = (g.amount > 0 ? (sg.amount / g.amount * 100) : 0).toFixed(1);
            return `<div class="hbar-seg" style="width:${segPct}%;background:${segColor}" title="${escAttr(sub)}: ${Utils.formatCurrency(sg.amount)}"></div>`;
          }).join('');
        } else {
          segmentsHtml = `<div class="hbar-seg" style="width:100%;background:${rowColor}"></div>`;
        }
      }

      const isActive = !showSub && catFilters.size > 0 && catFilters.has(label);
      const isFiltered = !showSub && catFilters.size > 0 && !catFilters.has(label);
      const cls = `hbar-row${showSub ? '' : ' clickable'}${isActive ? ' active' : ''}${isFiltered ? ' dimmed' : ''}`;
      const onClick = showSub ? '' : ` onclick="Flux._togglePill('${safeName}')"`;
      // Pastille de couleur devant le nom : seulement pour une barre CATÉGORIE (cas 1/3), jamais
      // pour une barre sous-catégorie (cas 2) — même règle que .srow-dot dans le tableau (absent
      // sur les lignes de sous-catégorie), pour que le "type" de ligne se reconnaisse pareil des
      // deux côtés.
      const dotHtml = showSub ? '' : `<span class="hbar-dot" style="background:${rowColor}"></span>`;

      return `<div class="${cls}" style="--rc:${rowColor};${rowHStyle}"${dataCat}${onClick}>
        <div class="hbar-label" title="${escAttr(label)}">${dotHtml}<span class="hbar-label-text">${label}</span></div>
        <div class="hbar-track">
          <div class="hbar-fillwrap" style="width:${widthCss}">
            <div class="hbar-fill">${segmentsHtml}</div>
            <span class="hbar-amount">${amountStr}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    // Spacer de la hauteur du <thead> du tableau : sans lui, la 1re barre du graphique démarre
    // plus haut que la 1re ligne du tableau (qui a un en-tête au-dessus, contrairement au
    // graphique) — décalage vertical qui s'accumule visuellement ligne après ligne. Mesuré en
    // JS (pas une valeur figée en CSS) pour rester juste si le style de l'en-tête change.
    const thead = document.getElementById('flux-summary-thead');
    const theadH = thead ? thead.getBoundingClientRect().height : 0;
    container.innerHTML = `<div class="hbar-head-spacer" style="height:${theadH}px"></div>${rows}`;
    this._syncCardHeights();
  },

  // Carte "Répartition visuelle" toujours EXACTEMENT de la même hauteur que la carte tableau —
  // SAUF quand une catégorie est dépliée (sous-catégories affichées en lignes en plus), où le
  // tableau grandit normalement et le graphique garde sa hauteur naturelle (plus petite, la
  // segmentation d'une catégorie dépliée reste DANS sa même barre, pas de lignes en plus). Mesuré
  // en JS (pas une hauteur CSS figée) : même en l'absence de tout dépli, marge de titre (.card-
  // header-row vs <h3> nu) et bordures de lignes de table ne tombent pas pile identiques entre
  // les deux cartes de quelques px — plus robuste que traquer chaque source de micro-écart une
  // par une, et reste juste si l'un ou l'autre style change plus tard.
  _syncCardHeights() {
    const tableCard = document.querySelector('.flux-summary-card');
    const chartCard = document.querySelector('.flux-hbar-card');
    if (!tableCard || !chartCard) return;
    chartCard.style.height = ''; // repart de la hauteur naturelle avant de (re)mesurer
    if (this._expandedCats.size > 0) return;
    const tableH = tableCard.getBoundingClientRect().height;
    chartCard.style.height = `${tableH}px`;
  },

  // Ne recalcule/recompose PAS tout le graphique — trouve directement la barre déjà à l'écran
  // (data-cat) et change juste la couleur de ses segments (déjà à la bonne largeur, voir
  // _renderHBarChart) : ce sont les mêmes nœuds DOM avant/après, donc la transition CSS
  // (.hbar-seg) joue vraiment, contrairement à un innerHTML complet qui recrée tout sans état
  // "avant" pour animer depuis.
  _updateHBarSegmentColors(cat) {
    const row = document.querySelector(`#flux-hbar-chart .hbar-row[data-cat="${CSS.escape(cat)}"]`);
    if (!row) {
      const { start, end } = PeriodFilter.getDateRange();
      this._renderHBarChart(this._realExpenses(), start, end, this._activeFilters);
      return;
    }
    const baseColor = Utils.getCategoryColor(cat);
    const isExpanded = this._expandedCats.has(cat);
    const segs = row.querySelectorAll('.hbar-seg');
    segs.forEach((seg, i) => { seg.style.background = isExpanded ? this._shadeByIndex(baseColor, i, segs.length) : baseColor; });
  },

  _renderSummaryTable(allExpenses, start, end, catFilters) {
    const tbody = document.getElementById('flux-summary-tbody');
    const empty = document.getElementById('flux-summary-empty');
    const title = document.getElementById('flux-summary-title');
    const thLabel = document.getElementById('flux-summary-th-label');
    if (!tbody) return;

    const catLabel = this._catLabel();
    const { showSub, sorted } = this._summaryGroups(allExpenses, start, end, catFilters);

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

    if (!sorted.length) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    const total = sorted.reduce((s, [, g]) => s + g.amount, 0);

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
