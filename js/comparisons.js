const Comparisons = {
  periodA: '',
  periodB: '',

  _shortLabel(period) {
    const [y, m] = period.split('-').map(Number);
    const MONTHS = ['jan.','fév.','mar.','avr.','mai','jun.','jul.','aoû.','sep.','oct.','nov.','déc.'];
    return MONTHS[m - 1] + ' \'' + String(y).slice(2);
  },

  init() {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = now.getMonth() === 0
      ? `${now.getFullYear() - 1}-12`
      : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

    this.periodA = lastMonth;
    this.periodB = thisMonth;

    const selA = document.getElementById('comp-period-a');
    const selB = document.getElementById('comp-period-b');
    if (selA) { selA.value = this.periodA; selA.addEventListener('change', (e) => { this.periodA = e.target.value; this._reorderPeriods(); this.render(); }); }
    if (selB) { selB.value = this.periodB; selB.addEventListener('change', (e) => { this.periodB = e.target.value; this._reorderPeriods(); this.render(); }); }

    // Re-render quand le toggle Date comptable/effective change (filtre global).
    PeriodFilter.onChange(() => {
      if (!document.getElementById('section-comparisons')?.classList.contains('hidden')) this.render();
    });
  },

  // La carte de droite (B) doit toujours être la période la plus récente : cohérent avec le sens
  // de la flèche/tendance A -> B (kpi-trend "vs période A" sur la carte de droite n'aurait pas de
  // sens si B était en fait antérieure). Si le choix de l'utilisateur inverse l'ordre
  // chronologique, on permute A/B — variables internes ET valeur affichée des deux <input>.
  // Comparaison de chaînes 'YYYY-MM' : équivalente à une comparaison chronologique.
  _reorderPeriods() {
    if (this.periodA <= this.periodB) return;
    [this.periodA, this.periodB] = [this.periodB, this.periodA];
    const selA = document.getElementById('comp-period-a');
    const selB = document.getElementById('comp-period-b');
    if (selA) selA.value = this.periodA;
    if (selB) selB.value = this.periodB;
  },

  render() {
    // Épargne/Revenus ne sont jamais des dépenses (Utils.isExpenseCategory), même si un
    // enregistrement existe techniquement dans invest_expenses.
    const expenses = Storage.getExpenses().filter(e => Utils.isExpenseCategory(e.category));
    // Respecte le mode date comptable/effective (getExpenseDate → mois filtrant).
    const expMonth = e => Utils.getExpenseDate(e).substring(0, 7);
    const expA = expenses.filter(e => expMonth(e) === this.periodA);
    const expB = expenses.filter(e => expMonth(e) === this.periodB);

    // Update period name labels
    const nameA = document.getElementById('comp-period-name-a');
    const nameB = document.getElementById('comp-period-name-b');
    if (nameA) nameA.textContent = Utils.getMonthLabel(this.periodA);
    if (nameB) nameB.textContent = Utils.getMonthLabel(this.periodB);
    const totalA = expA.reduce((s, e) => s + e.amount, 0);
    const totalB = expB.reduce((s, e) => s + e.amount, 0);
    const diff   = totalB - totalA;
    const pct    = totalA > 0 ? (diff / totalA * 100) : (totalB > 0 ? 100 : 0);

    // Panel KPIs
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('comp-total-a', Utils.formatCurrency(totalA));
    set('comp-total-b', Utils.formatCurrency(totalB));

    this._renderPanelStats('comp-stats-a', expA);
    this._renderPanelStats('comp-stats-b', expB);
    this._renderDeltaTrend(diff, pct);

    this._renderCatTable(expA, expB, totalA, totalB);
    this._renderCatChart(expA, expB);
  },

  // Panier moyen / Top catégorie retirés : peu pertinents pour une dépense perso (montants trop
  // hétérogènes d'une transaction à l'autre) et redondants avec le graphique par catégorie
  // juste en dessous. Ne reste que le nombre de transactions, en une ligne discrète.
  _renderPanelStats(containerId, expenses) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const count = expenses.length;
    el.textContent = count > 1 ? `${count} transactions` : count === 1 ? '1 transaction' : 'Aucune transaction';
  },

  // Écart B vs A directement dans la carte B (kpi-trend), même traitement que les tendances Flux
  // (Charts._renderKpiTrend côté flux.js : flèche + signe + % colorés) plutôt qu'un encart séparé
  // entre les 2 cartes. Contrairement à Flux (couleur = signe brut, agnostique à la métrique),
  // ici on ne compare QUE des dépenses : "moins" est toujours souhaitable, donc vert/rouge
  // suivent le sens dépenses en baisse/hausse plutôt que le signe mathématique de l'écart.
  _renderDeltaTrend(diff, pct) {
    const el = document.getElementById('comp-trend-b');
    if (!el) return;
    if (diff === 0) { el.innerHTML = `<span class="trend-neutral">→ égal à ${this._shortLabel(this.periodA)}</span>`; return; }
    const cls   = diff <= 0 ? 'trend-good' : 'trend-bad';
    const arrow = diff > 0 ? '↑' : '↓';
    const sign  = diff > 0 ? '+' : '';
    el.innerHTML = `<span class="${cls}">${arrow} ${sign}${Utils.formatCurrency(diff)} (${sign}${pct.toFixed(1)}%) vs ${this._shortLabel(this.periodA)}</span>`;
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
      this._shortLabel(this.periodA),
      this._shortLabel(this.periodB)
    );
  },

  // Montant en écart (colonne "Écart") : signe seul ('+'/'−', jamais de double signe) — "moins"
  // est toujours vert ici (une dépense qui baisse), même logique de sens que _renderDeltaTrend.
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
  // barre double (A/B) sous son nom, à l'échelle du MAX affiché sur tout le tableau (pas du total
  // de la ligne) pour rester comparable d'une catégorie à l'autre — même barre pleine pour la
  // plus grosse dépense des 2 périodes, les autres lui sont proportionnelles.
  _renderCatTable(expA, expB, totalA, totalB) {
    const rowsEl   = document.getElementById('comp-cat-rows');
    const totalRow = document.getElementById('comp-total-row');
    const empty    = document.getElementById('comp-empty');
    const thA      = document.getElementById('cc-th-a');
    const thB      = document.getElementById('cc-th-b');
    if (!rowsEl) return;

    if (thA) thA.textContent = this._shortLabel(this.periodA);
    if (thB) thB.textContent = this._shortLabel(this.periodB);

    const rows = this._categoryRows(expA, expB);
    if (!rows.length) {
      rowsEl.innerHTML = '';
      if (totalRow) totalRow.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    const maxAmount = Math.max(1, ...rows.flatMap(r => [r.amtA, r.amtB]));

    rowsEl.innerHTML = rows.map(({ cat, amtA, amtB, diff, pct }) => {
      const color = Utils.getCategoryColor(cat);
      const barA  = (amtA / maxAmount * 100).toFixed(1);
      const barB  = (amtB / maxAmount * 100).toFixed(1);
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
