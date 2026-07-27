const Comparisons = {
  periodA: '',
  periodB: '',

  _shortLabel(period) {
    const [y, m] = period.split('-').map(Number);
    const MONTHS = ['jan.','fév.','mar.','avr.','mai','jun.','jul.','aoû.','sep.','oct.','nov.','déc.'];
    return MONTHS[m - 1] + ' \'' + String(y).slice(2);
  },

  // Options du dropdown de période : fenêtre par défaut 36 mois en arrière / 2 en avant autour
  // d'aujourd'hui, ÉLARGIE si besoin pour toujours inclure `selected` (sinon une <option selected>
  // manquante retomberait silencieusement sur la 1ère option — piège Dropdown documenté dans
  // CLAUDE.md — et afficherait une période différente de celle réellement en mémoire) ET la plus
  // ancienne dépense réelle : contrairement à l'ancien <input type="month"> natif (sans bornes,
  // n'importe quelle date atteignable en tapant), une liste figée à 36 mois rendrait
  // silencieusement inaccessibles les périodes plus anciennes d'un historique importé (relevés
  // bancaires sur plusieurs années) — une vraie régression, pas juste cosmétique.
  _periodOptionsHtml(selected) {
    const MFR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const now = new Date();
    const nowIdx = now.getFullYear() * 12 + now.getMonth();
    const toIdx = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); };

    const expenseMonths = Storage.getExpenses().map(e => Utils.getExpenseDate(e).substring(0, 7)).filter(Boolean);
    const dataMinIdx = expenseMonths.length ? Math.min(...expenseMonths.map(toIdx)) : nowIdx;
    const selIdx = selected ? toIdx(selected) : nowIdx;

    const minIdx = Math.min(nowIdx - 36, dataMinIdx, selIdx);
    const maxIdx = Math.max(nowIdx + 2, selIdx);
    const opts = [];
    for (let idx = minIdx; idx <= maxIdx; idx++) {
      const y = Math.floor(idx / 12);
      const m = idx % 12;
      const v = `${y}-${String(m + 1).padStart(2, '0')}`;
      opts.push(`<option value="${v}"${v === selected ? ' selected' : ''}>${MFR[m]} ${y}</option>`);
    }
    return opts.join('');
  },

  init() {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = now.getMonth() === 0
      ? `${now.getFullYear() - 1}-12`
      : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

    this.periodA = lastMonth;
    this.periodB = thisMonth;

    const slotA = document.getElementById('comp-period-a-slot');
    const slotB = document.getElementById('comp-period-b-slot');
    if (slotA) slotA.innerHTML = Dropdown.render('comp-period-a', this._periodOptionsHtml(this.periodA), { small: true, className: 'dd-comp-a' });
    if (slotB) slotB.innerHTML = Dropdown.render('comp-period-b', this._periodOptionsHtml(this.periodB), { small: true, className: 'dd-comp-b' });

    const selA = document.getElementById('comp-period-a');
    const selB = document.getElementById('comp-period-b');
    if (selA) selA.addEventListener('change', (e) => { this.periodA = e.target.value; this._reorderPeriods(); this.render(); });
    if (selB) selB.addEventListener('change', (e) => { this.periodB = e.target.value; this._reorderPeriods(); this.render(); });

    // Re-render quand le toggle Date comptable/effective change (filtre global).
    PeriodFilter.onChange(() => {
      if (!document.getElementById('section-comparisons')?.classList.contains('hidden')) this.render();
    });
  },

  // La lecture de droite (B) doit toujours être la période la plus récente : cohérent avec le
  // sens de la pastille d'évolution ("B vs A"). Si le choix de l'utilisateur inverse l'ordre
  // chronologique, on permute A/B — variables internes ET les 2 dropdowns, via setOptions (pas
  // setValue) : la nouvelle valeur de chacun peut être hors de sa fenêtre d'origine (ex. une
  // période ancienne qui n'existait jusque-là que dans la liste de l'AUTRE dropdown) —
  // setOptions régénère une liste qui la contient forcément (voir _periodOptionsHtml).
  // Comparaison de chaînes 'YYYY-MM' : équivalente à une comparaison chronologique.
  _reorderPeriods() {
    if (this.periodA <= this.periodB) return;
    [this.periodA, this.periodB] = [this.periodB, this.periodA];
    Dropdown.setOptions('comp-period-a', this._periodOptionsHtml(this.periodA), true);
    Dropdown.setOptions('comp-period-b', this._periodOptionsHtml(this.periodB), true);
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
      this._shortLabel(this.periodA),
      this._shortLabel(this.periodB)
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
