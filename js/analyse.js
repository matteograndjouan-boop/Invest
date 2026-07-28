// Analyse (mode Investissement, remplace l'ex-onglet "Bilan patrimonial") : vue FILTRÉE du
// patrimoine des enveloppes — période (createPeriodPicker, même style que Flux) + enveloppe/type/
// établissement, tous combinables. Valorisation via PortfolioAnalytics (js/portfolio-analytics.js)
// — aucun calcul dupliqué ici. Distinct de Vue globale (js/portfolio-overview.js, jamais filtrée)
// et de la page "Bilan patrimonial" générale (js/patrimony.js, actifs/passifs manuels + ancien
// portefeuille, inchangée).
const Analyse = {
  picker: null,

  // Non persisté (storageKey null) : même choix que Comparisons (2 instances de
  // createPeriodPicker) — repart sur le mois courant à chaque rechargement plutôt que de garder
  // un filtre oublié qui rendrait une visite ultérieure déroutante ("pourquoi ça n'affiche
  // presque rien"). Pas de toggle Date transaction/effective : les opérations n'ont qu'une seule
  // date, ce concept n'existe pas ici (propre aux dépenses/revenus).
  init() {
    this.picker = createPeriodPicker('analyse-period', null, { showDateModeToggle: false });
    this.picker.renderUI();
    this.picker.onChange(() => this.render());

    this._populateFilters();
    ['envelope', 'type', 'etab'].forEach(key => {
      const el = document.getElementById(`analyse-filter-${key}`);
      if (el) el.addEventListener('change', () => this.render());
    });
  },

  // Même schéma que Envelopes._populateFilters/Transactions._populateFilters (Dropdown.mount,
  // ré-appelé à chaque render — enveloppes/établissements peuvent changer entre 2 visites).
  _populateFilters() {
    const envVal = document.getElementById('analyse-filter-envelope')?.value || '';
    const envOpts = ['<option value="">Toutes les enveloppes</option>']
      .concat(Storage.getEnvelopes().map(e => `<option value="${e.id}"${e.id === envVal ? ' selected' : ''}>${e.name}</option>`))
      .join('');
    Dropdown.mount('analyse-filter-envelope-slot', 'analyse-filter-envelope', envOpts);

    const typeVal = document.getElementById('analyse-filter-type')?.value || '';
    const typeOpts = ['<option value="">Tous les types</option>']
      .concat(Utils.ENVELOPE_TYPES.map(t => `<option value="${t.key}"${t.key === typeVal ? ' selected' : ''}>${t.label}</option>`))
      .join('');
    Dropdown.mount('analyse-filter-type-slot', 'analyse-filter-type', typeOpts);

    const etabVal = document.getElementById('analyse-filter-etab')?.value || '';
    const etabOpts = ['<option value="">Tous les établissements</option>']
      .concat(Storage.getEtablissements().map(e => `<option value="${e}"${e === etabVal ? ' selected' : ''}>${e}</option>`))
      .join('');
    Dropdown.mount('analyse-filter-etab-slot', 'analyse-filter-etab', etabOpts);
  },

  _filteredEnvelopes() {
    const all = Storage.getEnvelopes();
    const envFilter = document.getElementById('analyse-filter-envelope')?.value || '';
    const typeFilter = document.getElementById('analyse-filter-type')?.value || '';
    const etabFilter = document.getElementById('analyse-filter-etab')?.value || '';
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
    const { start, end } = this.picker.getDateRange();

    const metrics = PortfolioAnalytics.aggregateMetrics(envelopes, ops, start, end);

    document.getElementById('an-kpi-value').textContent = Utils.formatCurrency(metrics.value);
    document.getElementById('an-kpi-value-sub').textContent =
      `${envelopes.length} enveloppe${envelopes.length > 1 ? 's' : ''}`;

    const perfEl = document.getElementById('an-kpi-perf');
    const perfPctEl = document.getElementById('an-kpi-perf-pct');
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

    document.getElementById('an-kpi-contrib').textContent = Utils.formatCurrency(metrics.contributions);

    const gainEl = document.getElementById('an-kpi-gain');
    const gainSubEl = document.getElementById('an-kpi-gain-sub');
    if (metrics.gain !== null) {
      gainEl.textContent = (metrics.gain >= 0 ? '+' : '−') + Utils.formatCurrency(Math.abs(metrics.gain));
      gainEl.className = 'kpi-value ' + (metrics.gain >= 0 ? 'positive' : 'negative');
      gainSubEl.textContent = "Depuis l'origine";
    } else {
      gainEl.textContent = '—';
      gainEl.className = 'kpi-value';
      gainSubEl.textContent = '';
    }

    this._renderEvolution(envelopes, ops, start, end);
    this._renderDonut('chart-an-type', 'an-type-legend', envelopes, ops, end,
      e => e.type, k => Envelopes._typeLabel(k), k => Utils.ENVELOPE_TYPE_COLORS[k] || '#6b7280');
    this._renderDonut('chart-an-etab', 'an-etab-legend', envelopes, ops, end,
      e => e.etablissement || '—', k => k, (k, i) => Utils.POSITION_COLORS[i % Utils.POSITION_COLORS.length]);
    this._renderTable(allEnvelopes, envelopes, ops, end);
  },

  _renderEvolution(envelopes, ops, start, end) {
    if (!start || !end) { Charts.destroy('chart-an-evolution'); return; }
    const dates = PortfolioAnalytics.monthEndDates(start, end);
    const series = PortfolioAnalytics.valueTimeSeries(envelopes, ops, dates);
    Charts.genericLineEvolution('chart-an-evolution', series.map(p => ({ label: Utils.formatDate(p.date), value: p.value })));
  },

  // `colorFn` reçoit (clé, index) — même signature pour la palette fixe par type (index ignoré,
  // voir l'appel "type" dans render()) et la palette rotative par rang pour établissement (clé
  // ignorée, voir l'appel "etab") : noms d'établissement libres/non bornés, pas de couleur
  // d'identité stable possible comme pour les types fixes.
  _renderDonut(canvasId, legendId, envelopes, ops, cutoff, keyFn, labelFn, colorFn) {
    const groups = PortfolioAnalytics.valueByGroup(envelopes, ops, cutoff, keyFn);
    const entries = groups
      .map((g, i) => ({ label: labelFn(g.key), value: g.value, color: colorFn(g.key, i) }))
      .sort((a, b) => b.value - a.value);
    Charts.genericDonut(canvasId, entries);
    this._renderLegend(legendId, entries);
  },

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

  // Colonne "Versements totaux" : ALL-TIME (pas bornée par le début de la période filtrée,
  // contrairement au KPI "Versements sur la période" au-dessus) — demande explicite ("versements
  // TOTAUX", sans "sur la période"), lisible comme "combien j'ai mis dans cette enveloppe depuis
  // toujours" indépendamment du filtre de période en cours. Obtenu en appelant envelopeMetrics
  // avec start=null (seuls les champs contributions/withdrawals en dépendent — value/gain restent
  // identiques, ils ne dépendent jamais de `start`, voir PortfolioAnalytics.envelopeMetrics).
  _renderTable(allEnvelopes, envelopes, ops, cutoff) {
    const tbody = document.getElementById('analyse-tbody');
    const empty = document.getElementById('analyse-empty');
    if (!tbody) return;

    if (!envelopes.length) {
      tbody.innerHTML = '';
      if (empty) {
        empty.textContent = allEnvelopes.length ? 'Aucune enveloppe ne correspond à ces filtres.' : 'Aucune enveloppe.';
        empty.classList.remove('hidden');
      }
      return;
    }
    if (empty) empty.classList.add('hidden');

    tbody.innerHTML = envelopes.map(env => {
      const m = PortfolioAnalytics.envelopeMetrics(env, ops, null, cutoff);
      const gainHtml = m.gain !== null
        ? `<span class="${m.gain >= 0 ? 'positive' : 'negative'}">${m.gain >= 0 ? '+' : '−'}${Utils.formatCurrency(Math.abs(m.gain))}</span>
           <br><span class="text-muted" style="font-size:11px">${Utils.formatPercent(m.gainPct)}</span>`
        : '—';
      const perfHtml = m.gainPct !== null
        ? `<span class="${m.gainPct >= 0 ? 'positive' : 'negative'}">${Utils.formatPercent(m.gainPct)}</span>`
        : '—';
      return `<tr>
        <td>${env.name}</td>
        <td><span class="badge badge-category">${Envelopes._typeLabel(env.type)}</span></td>
        <td>${env.etablissement || '—'}</td>
        <td class="text-right">${Utils.formatCurrency(m.value)}</td>
        <td class="text-right">${Utils.formatCurrency(m.contributions)}</td>
        <td class="text-right">${gainHtml}</td>
        <td class="text-right">${perfHtml}</td>
      </tr>`;
    }).join('');
  },
};
