const Comparisons = {
  pickerA: null,
  pickerB: null,
  _reordering: false,

  // 2 instances indépendantes du même sélecteur que le filtre global (createPeriodPicker, voir
  // js/period-filter.js) : mois/trimestre/semestre/année/plage libre, chacune avec son propre
  // état — pas persistées (storageKey null, comme l'ancien comportement periodA/periodB, qui
  // repartait toujours de "mois dernier vs mois en cours" à chaque chargement de l'app).
  init() {
    this.pickerA = createPeriodPicker('comp-period-a', null, { showDateModeToggle: false, wrapClassName: 'comp-picker-a', triggerClassName: 'comp-picker-a-trigger' });
    this.pickerB = createPeriodPicker('comp-period-b', null, { showDateModeToggle: false, wrapClassName: 'comp-picker-b', triggerClassName: 'comp-picker-b-trigger' });

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = now.getMonth() === 0
      ? `${now.getFullYear() - 1}-12`
      : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
    this.pickerA.set({ ...this.pickerA.get(), type: 'month', month: lastMonth, year: Number(lastMonth.slice(0, 4)) });
    this.pickerB.set({ ...this.pickerB.get(), type: 'month', month: thisMonth, year: now.getFullYear() });

    this.pickerA.renderUI();
    this.pickerB.renderUI();
    this.pickerA.onChange(() => { this._reorderPeriods(); this.render(); });
    this.pickerB.onChange(() => { this._reorderPeriods(); this.render(); });

    // Re-render quand le toggle Date comptable/effective change (filtre global).
    PeriodFilter.onChange(() => {
      if (!document.getElementById('section-comparisons')?.classList.contains('hidden')) this.render();
    });
  },

  // La lecture de droite (B) doit toujours être la période la plus récente : cohérent avec le
  // sens de la pastille d'évolution ("B vs A"). Comparée sur la date de DÉBUT de chaque plage
  // (pas un simple 'YYYY-MM' — une période peut maintenant être un trimestre, une année, une
  // plage libre...) : si l'utilisateur inverse l'ordre chronologique, on permute les 2 ÉTATS
  // complets (type inclus — comparer un trimestre à une année n'a pas besoin d'être symétrique).
  //
  // _reordering : garde-fou anti-réentrance. pickerA/pickerB.set() déclenchent chacun LEUR PROPRE
  // onChange (voir init(), les 2 abonnées au même _reorderPeriods()+render()) : le set() de la
  // ligne suivante re-déclenche donc _reorderPeriods() en plein milieu de celui-ci, avant que les
  // 2 côtés aient fini d'être permutés — sans garde, la comparaison s'y ferait sur un état
  // transitoire incohérent (un seul des 2 déjà permuté). Le garde-fou fait juste sortir ces appels
  // ré-entrants immédiatement ; le seul _reorderPeriods() qui compte est l'appel racine.
  //
  // _updateLabel() sur les 2 pickers après permutation : set() (contrairement à _selectMonth/
  // _prev/le clic sur un type...) ne rafraîchit PAS l'affichage propre du picker (texte du
  // déclencheur, visibilité des flèches, surbrillance du type actif) — normal pour un set() venu
  // de l'INTÉRIEUR du picker lui-même (toujours suivi d'un _updateLabel() par l'appelant), mais
  // ici l'appelant est Comparisons : sans cet appel explicite, le déclencheur du picker qui vient
  // d'être permuté resterait visuellement figé sur son ANCIENNE période après un swap.
  _reorderPeriods() {
    if (this._reordering) return;
    const a = this.pickerA.getDateRange();
    const b = this.pickerB.getDateRange();
    if (!a.start || !b.start || a.start <= b.start) return;
    this._reordering = true;
    const stateA = this.pickerA.get();
    const stateB = this.pickerB.get();
    this.pickerA.set(stateB);
    this.pickerB.set(stateA);
    this.pickerA._updateLabel();
    this.pickerB._updateLabel();
    this._reordering = false;
  },

  render() {
    // Si init() a échoué (voir safeInit dans app.js), pickerA/pickerB sont restés null — sans ce
    // garde, visiter cet onglet planterait une 2e fois au lieu de simplement rester inerte.
    if (!this.pickerA || !this.pickerB) return;
    const rangeA = this.pickerA.getDateRange();
    const rangeB = this.pickerB.getDateRange();

    // Épargne/Revenus ne sont jamais des dépenses (Utils.isExpenseCategory), même si un
    // enregistrement existe techniquement dans invest_expenses.
    const expenses = Storage.getExpenses().filter(e => Utils.isExpenseCategory(e.category));
    // Respecte le mode date comptable/effective (getExpenseDate → date filtrante) ; plage
    // inclusive, même idiome que Budget._renderList (PeriodFilter.getDateRange()).
    const inRange = (e, range) => {
      const d = Utils.getExpenseDate(e);
      return !!range.start && !!range.end && d >= range.start && d <= range.end;
    };
    const expA = expenses.filter(e => inRange(e, rangeA));
    const expB = expenses.filter(e => inRange(e, rangeB));

    // Update period name labels
    const nameA = document.getElementById('comp-period-name-a');
    const nameB = document.getElementById('comp-period-name-b');
    if (nameA) nameA.textContent = this.pickerA.getLabel();
    if (nameB) nameB.textContent = this.pickerB.getLabel();
    const totalA = expA.reduce((s, e) => s + e.amount, 0);
    const totalB = expB.reduce((s, e) => s + e.amount, 0);
    const diff   = totalB - totalA;
    const pct    = totalA > 0 ? (diff / totalA * 100) : (totalB > 0 ? 100 : 0);

    // Bandeau "Comparer" : montants + pastille d'évolution (_evoPillHtml, même logique/couleurs
    // que la colonne "Évolution" du tableau récapitulatif juste en dessous).
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('comp-total-a', Utils.formatCurrency(totalA));
    set('comp-total-b', Utils.formatCurrency(totalB));
    const evoEl = document.getElementById('comp-evo-pill');
    if (evoEl) evoEl.innerHTML = this._evoPillHtml(diff, pct);

    this._renderCatTable(expA, expB, totalA, totalB);
    this._renderCatChart(expA, expB);
  },

  // Une entrée par catégorie présente dans au moins une des deux périodes, dans l'ordre des
  // catégories (Storage.getCategories()) puis les éventuelles orphelines (renommées/supprimées).
  // Source commune au graphique en barres et au tableau récapitulatif.
  _categoryRows(expA, expB) {
    const allCats = [...new Set([...expA.map(e => e.category), ...expB.map(e => e.category)])];
    const known = Storage.getCategories().map(c => c.name);
    const sorted = known.filter(n => allCats.includes(n)).concat(allCats.filter(n => !known.includes(n)));

    return sorted.map(cat => {
      const amtA = expA.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      const amtB = expB.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      const diff = amtB - amtA;
      const pct  = amtA > 0 ? (diff / amtA * 100) : (amtB > 0 ? 100 : 0);
      return { cat, amtA, amtB, diff, pct };
    });
  },

  _renderCatChart(expA, expB) {
    const rows = this._categoryRows(expA, expB);
    Charts.comparisonBarByCategory(
      rows.map(r => r.cat),
      rows.map(r => r.amtA),
      rows.map(r => r.amtB),
      this.pickerA.getLabel(),
      this.pickerB.getLabel()
    );
  },

  // Montant en écart (colonne "Écart") : signe seul ('+'/'−', jamais de double signe) — "moins"
  // est toujours vert ici (une dépense qui baisse), même logique de sens que _evoPillHtml.
  _diffHtml(diff) {
    if (diff === 0) return `<span class="cc-dash">–</span>`;
    const cls  = diff < 0 ? 'positive' : 'negative';
    const sign = diff > 0 ? '+' : '−';
    return `<span class="${cls}">${sign} ${Utils.formatCurrency(Math.abs(diff))}</span>`;
  },

  // Pastille "Évolution" : vert/rouge comme _diffHtml, ou neutre "≈0.0%" (pas juste "0.0%") quand
  // les 2 montants sont strictement égaux — distingue visuellement "aucun changement" d'un
  // pourcentage qui arrondirait à 0.0% sans être un vrai zéro.
  _evoPillHtml(diff, pct) {
    if (diff === 0) return `<span class="cc-evo-pill neutral">≈0.0%</span>`;
    const cls  = diff < 0 ? 'positive' : 'negative';
    const sign = diff > 0 ? '+' : '−';
    return `<span class="cc-evo-pill ${cls}">${sign}${Math.abs(pct).toFixed(1)}%</span>`;
  },

  // Lignes en div/grid (pas <table>, voir index.html) : chaque ligne catégorie porte une mini
  // barre double (A/B) sous son nom, à l'échelle du MAX DE LA LIGNE (pas du tableau entier) —
  // la plus grosse des 2 périodes va toujours jusqu'à 100%, l'autre lui est proportionnelle :
  // rend l'écart A/B immédiatement lisible catégorie par catégorie (demande explicite), au prix
  // de ne plus pouvoir comparer l'AMPLEUR absolue d'une catégorie à l'autre sur ces mini-barres —
  // déjà couvert par les montants en euros à côté, le graphique du dessus (échelle commune) et le
  // tri par dépensé décroissant.
  _renderCatTable(expA, expB, totalA, totalB) {
    const rowsEl   = document.getElementById('comp-cat-rows');
    const totalRow = document.getElementById('comp-total-row');
    const empty    = document.getElementById('comp-empty');
    const thA      = document.getElementById('cc-th-a');
    const thB      = document.getElementById('cc-th-b');
    if (!rowsEl) return;

    if (thA) thA.textContent = this.pickerA.getLabel();
    if (thB) thB.textContent = this.pickerB.getLabel();

    const rows = this._categoryRows(expA, expB);
    if (!rows.length) {
      rowsEl.innerHTML = '';
      if (totalRow) totalRow.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    rowsEl.innerHTML = rows.map(({ cat, amtA, amtB, diff, pct }) => {
      const color = Utils.getCategoryColor(cat);
      const rowMax = Math.max(1, amtA, amtB);
      const barA  = (amtA / rowMax * 100).toFixed(1);
      const barB  = (amtB / rowMax * 100).toFixed(1);
      return `<div class="cc-row">
        <div class="cc-cat"><span class="cc-dot" style="background:${color}"></span><span class="cc-name">${cat}</span></div>
        <div class="cc-amount">${amtA > 0 ? Utils.formatCurrency(amtA) : '<span class="cc-dash">—</span>'}</div>
        <div class="cc-amount">${amtB > 0 ? Utils.formatCurrency(amtB) : '<span class="cc-dash">—</span>'}</div>
        <div class="cc-diff">${this._diffHtml(diff)}</div>
        <div class="cc-evo">${this._evoPillHtml(diff, pct)}</div>
        <div class="cc-bars">
          <div class="cc-bar-track"><div class="cc-bar-fill cc-bar-a" style="width:${barA}%"></div></div>
          <div class="cc-bar-track"><div class="cc-bar-fill cc-bar-b" style="width:${barB}%"></div></div>
        </div>
      </div>`;
    }).join('');

    if (totalRow) {
      totalRow.classList.remove('hidden');
      const diffTotal = totalB - totalA;
      const pctTotal  = totalA > 0 ? (diffTotal / totalA * 100) : (totalB > 0 ? 100 : 0);
      totalRow.innerHTML = `
        <div class="cc-total-label">Total dépenses</div>
        <div class="cc-total-amount cc-total-a">${Utils.formatCurrency(totalA)}</div>
        <div class="cc-total-amount cc-total-b">${Utils.formatCurrency(totalB)}</div>
        <div class="cc-diff">${this._diffHtml(diffTotal)}</div>
        <div class="cc-evo">${this._evoPillHtml(diffTotal, pctTotal)}</div>
      `;
    }
  },
};
