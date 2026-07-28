// Vue globale (mode Investissement, onglet par défaut) : patrimoine consolidé des enveloppes
// (js/envelopes.js), filtrable par période/enveloppe/type/établissement — mêmes filtres que
// Analyse (js/analyse.js), mais démarre sur "Toute la période" (aucun filtre actif) pour garder
// son rôle de vue d'ensemble par défaut. Toute la valorisation vient de PortfolioAnalytics
// (js/portfolio-analytics.js), aucun calcul dupliqué ici.
const Portfolio = {
  picker: null,

  // "Toute la période" (opts.allowAllTime, voir js/period-filter.js) comme état initial explicite
  // — sans ça, getDateRange()/getLabel() retomberaient sur le mois courant (fallback par défaut
  // du composant, pensé pour Flux/Budget), pas sur "tout l'historique" comme Vue globale l'a
  // toujours affiché. Non persisté (storageKey null), comme Analyse/Comparisons.
  init() {
    this.picker = createPeriodPicker('pf-period', null, { showDateModeToggle: false, allowAllTime: true });
    this.picker.set({ ...this.picker.get(), type: 'all' });
    this.picker.renderUI();
    this.picker.onChange(() => this.render());

    this._populateFilters();
    ['envelope', 'type', 'etab'].forEach(key => {
      const el = document.getElementById(`pf-filter-${key}`);
      if (el) el.addEventListener('change', () => this.render());
    });
  },

  // Même schéma que Analyse._populateFilters/Envelopes._populateFilters (Dropdown.mount,
  // ré-appelé à chaque render — enveloppes/établissements peuvent changer entre 2 visites).
  _populateFilters() {
    const envVal = document.getElementById('pf-filter-envelope')?.value || '';
    const envOpts = ['<option value="">Toutes les enveloppes</option>']
      .concat(Storage.getEnvelopes().map(e => `<option value="${e.id}"${e.id === envVal ? ' selected' : ''}>${e.name}</option>`))
      .join('');
    Dropdown.mount('pf-filter-envelope-slot', 'pf-filter-envelope', envOpts);

    const typeVal = document.getElementById('pf-filter-type')?.value || '';
    const typeOpts = ['<option value="">Tous les types</option>']
      .concat(Utils.ENVELOPE_TYPES.map(t => `<option value="${t.key}"${t.key === typeVal ? ' selected' : ''}>${t.label}</option>`))
      .join('');
    Dropdown.mount('pf-filter-type-slot', 'pf-filter-type', typeOpts);

    const etabVal = document.getElementById('pf-filter-etab')?.value || '';
    const etabOpts = ['<option value="">Tous les établissements</option>']
      .concat(Storage.getEtablissements().map(e => `<option value="${e}"${e === etabVal ? ' selected' : ''}>${e}</option>`))
      .join('');
    Dropdown.mount('pf-filter-etab-slot', 'pf-filter-etab', etabOpts);
  },

  _filteredEnvelopes() {
    const all = Storage.getEnvelopes();
    const envFilter = document.getElementById('pf-filter-envelope')?.value || '';
    const typeFilter = document.getElementById('pf-filter-type')?.value || '';
    const etabFilter = document.getElementById('pf-filter-etab')?.value || '';
    let list = all;
    if (envFilter) list = list.filter(e => e.id === envFilter);
    if (typeFilter) list = list.filter(e => e.type === typeFilter);
    if (etabFilter) list = list.filter(e => e.etablissement === etabFilter);
    return { all, list };
  },

  render() {
    this._populateFilters();
    const { all: allEnvelopes, list: envelopes } = this._filteredEnvelopes();
    const ops = Storage.getOperations();

    // range.start/end valent '' sur "Toute la période" (voir getDateRange, case 'all') : `end`
    // retombe alors sur aujourd'hui (valeur "à jour"), `start` reste null (pas de borne basse —
    // versements/gain calculés depuis l'origine réelle), reproduisant exactement l'ancien
    // comportement non filtré.
    const range = this.picker.getDateRange();
    const today = Utils.getToday();
    const end = range.end || today;
    const start = range.start || null;

    const content = document.getElementById('pf-content');
    const empty = document.getElementById('pf-empty');
    const emptyText = document.getElementById('pf-empty-text');

    if (!envelopes.length) {
      if (content) content.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      if (emptyText) {
        emptyText.innerHTML = allEnvelopes.length
          ? 'Aucune enveloppe ne correspond à ces filtres.'
          : 'Aucune enveloppe. Rendez-vous dans l\'onglet <strong>Enveloppes</strong> pour en créer une.';
      }
      Charts.destroy('chart-pf-type');
      Charts.destroy('chart-pf-evolution');
      return;
    }
    if (content) content.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');

    const metrics = PortfolioAnalytics.aggregateMetrics(envelopes, ops, start, end);

    document.getElementById('pf-kpi-value').textContent = Utils.formatCurrency(metrics.value);
    document.getElementById('pf-kpi-value-sub').textContent =
      `${envelopes.length} enveloppe${envelopes.length > 1 ? 's' : ''}`;

    const perfEl = document.getElementById('pf-kpi-perf');
    const perfPctEl = document.getElementById('pf-kpi-perf-pct');
    if (metrics.gain !== null) {
      perfEl.textContent = (metrics.gain >= 0 ? '+' : '−') + Utils.formatCurrency(Math.abs(metrics.gain));
      perfEl.className = 'kpi-value ' + (metrics.gain >= 0 ? 'positive' : 'negative');
      perfPctEl.textContent = Utils.formatPercent(metrics.gainPct);
      perfPctEl.className = 'kpi-trend ' + (metrics.gainPct >= 0 ? 'positive' : 'negative');
    } else {
      perfEl.textContent = '—';
      perfEl.className = 'kpi-value';
      perfPctEl.textContent = '';
      perfPctEl.className = 'kpi-trend';
    }

    document.getElementById('pf-kpi-contrib').textContent = Utils.formatCurrency(metrics.contributions);
    const contribSubEl = document.getElementById('pf-kpi-contrib-sub');
    if (contribSubEl) contribSubEl.textContent = start ? 'Sur la période filtrée' : "Depuis l'origine";

    const gainEl = document.getElementById('pf-kpi-gain');
    const gainSubEl = document.getElementById('pf-kpi-gain-sub');
    if (metrics.gain !== null) {
      gainEl.textContent = (metrics.gain >= 0 ? '+' : '−') + Utils.formatCurrency(Math.abs(metrics.gain));
      gainEl.className = 'kpi-value ' + (metrics.gain >= 0 ? 'positive' : 'negative');
      gainSubEl.textContent = "Depuis l'origine";
    } else {
      gainEl.textContent = '—';
      gainEl.className = 'kpi-value';
      gainSubEl.textContent = '';
    }

    this._renderTypeDonut(envelopes, ops, end);
    this._renderEvolution(envelopes, ops, start, end);
    this._renderBilan(envelopes, ops, end);
  },

  _renderTypeDonut(envelopes, ops, cutoff) {
    const groups = PortfolioAnalytics.valueByGroup(envelopes, ops, cutoff, e => e.type);
    const entries = groups.map(g => ({
      label: Envelopes._typeLabel(g.key),
      value: g.value,
      color: Utils.ENVELOPE_TYPE_COLORS[g.key] || '#6b7280',
    })).sort((a, b) => b.value - a.value);
    Charts.genericDonut('chart-pf-type', entries);
    this._renderLegend('pf-type-legend', entries);
  },

  // entries: [{label, value, color}] — légende verticale pastille/nom/montant/%, même gabarit que
  // Investments._renderLegend (.port-legend-item/.pl-*, déjà stylé — partagé visuellement, pas en
  // code, chaque module de rendu garde sa propre petite copie comme le fait déjà Investments).
  _renderLegend(containerId, entries) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!entries.length) { container.innerHTML = '<p class="text-muted">Aucune donnée</p>'; return; }
    const total = entries.reduce((s, e) => s + e.value, 0);
    container.innerHTML = entries.map(e => {
      const pct = total > 0 ? (e.value / total * 100) : 0;
      return `<div class="port-legend-item">
        <span class="pl-dot" style="background:${e.color}"></span>
        <div class="pl-info">
          <span class="pl-name">${e.label}</span>
          <span class="pl-sub">${Utils.formatCurrency(e.value)} · ${pct.toFixed(0)}%</span>
        </div>
      </div>`;
    }).join('');
  },

  // Cache le graphique (pas juste "rien à afficher") tant qu'aucune opération pertinente n'existe
  // avant `end`, parmi les enveloppes FILTRÉES : avec une série à zéro partout, Chart.js doit
  // inventer une échelle Y et produit un axe qui part en négatif avec des libellés dupliqués —
  // visuellement cassé sans qu'aucune erreur JS ne se déclenche. Un message "Aucune donnée" est
  // bien plus honnête qu'un graphique qui semble buggé (même correctif que Analyse._renderEvolution).
  _renderEvolution(envelopes, ops, start, end) {
    const envIds = new Set(envelopes.map(e => e.id));
    const relevantOps = ops.filter(o => envIds.has(o.envelopeId) && o.date <= end);
    const container = document.getElementById('chart-pf-evolution')?.parentElement;
    const empty = document.getElementById('pf-evolution-empty');
    if (!relevantOps.length) {
      Charts.destroy('chart-pf-evolution');
      if (container) container.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (container) container.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    // "Toute la période" (start=null) : la série démarre à la 1ère opération pertinente (comme
    // avant) plutôt qu'à une date arbitraire. Période choisie explicitement : la série respecte
    // exactement ses bornes, comme Analyse.
    const seriesStart = start || relevantOps.reduce((min, o) => (!min || o.date < min) ? o.date : min, null);
    const dates = PortfolioAnalytics.monthEndDates(seriesStart, end);
    const series = PortfolioAnalytics.valueTimeSeries(envelopes, ops, dates);
    Charts.genericLineEvolution('chart-pf-evolution', series.map(p => ({ label: Utils.formatDate(p.date), value: p.value })));
  },

  _renderBilan(envelopes, ops, cutoff) {
    const actifs = envelopes.reduce((s, e) => s + PortfolioAnalytics.envelopeValue(e.id, ops, cutoff), 0);
    const passifs = envelopes
      .filter(e => e.type === 'immobilier')
      .reduce((s, e) => s + PortfolioAnalytics.envelopeLiability(e, ops.filter(o => o.envelopeId === e.id), cutoff), 0);
    document.getElementById('pf-bilan-actifs').textContent = Utils.formatCurrency(actifs);
    const actifsSubEl = document.getElementById('pf-bilan-actifs-sub');
    if (actifsSubEl) actifsSubEl.textContent = `${envelopes.length} enveloppe${envelopes.length > 1 ? 's' : ''}`;
    document.getElementById('pf-bilan-passifs').textContent = Utils.formatCurrency(passifs);
    const netEl = document.getElementById('pf-bilan-net');
    const net = actifs - passifs;
    netEl.textContent = Utils.formatCurrency(net);
    netEl.className = 'kpi-value ' + (net >= 0 ? 'positive' : 'negative');
  },
};
