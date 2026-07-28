// Vue globale (mode Investissement, onglet par défaut) : patrimoine consolidé de TOUTES les
// enveloppes (js/envelopes.js) — KPIs "à aujourd'hui", répartition par type, évolution historique
// complète, bilan actifs/passifs. Pas de filtre ici (voir Analyse, js/analyse.js, pour la vue
// filtrée) — toute la valorisation vient de PortfolioAnalytics (js/portfolio-analytics.js),
// aucun calcul dupliqué ici.
const Portfolio = {
  render() {
    const envelopes = Storage.getEnvelopes();
    const ops = Storage.getOperations();

    const content = document.getElementById('pf-content');
    const empty = document.getElementById('pf-empty');
    if (!envelopes.length) {
      if (content) content.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      Charts.destroy('chart-pf-type');
      Charts.destroy('chart-pf-evolution');
      return;
    }
    if (content) content.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');

    const today = Utils.getToday();
    const metrics = PortfolioAnalytics.aggregateMetrics(envelopes, ops, null, today);

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

    this._renderTypeDonut(envelopes, ops, today);
    this._renderEvolution(envelopes, ops, today);
    this._renderBilan(envelopes, ops, today);
  },

  _renderTypeDonut(envelopes, ops, today) {
    const groups = PortfolioAnalytics.valueByGroup(envelopes, ops, today, e => e.type);
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

  // Cache le graphique (pas juste "rien à afficher") tant qu'aucune opération n'existe : avec une
  // série à zéro partout, Chart.js doit inventer une échelle Y et produit un axe qui part en
  // négatif avec des libellés dupliqués — visuellement cassé sans qu'aucune erreur JS ne se
  // déclenche. Un message "Aucune donnée" est bien plus honnête qu'un graphique qui semble buggé.
  _renderEvolution(envelopes, ops, today) {
    const firstDate = ops.reduce((min, o) => (!min || o.date < min) ? o.date : min, null);
    const container = document.getElementById('chart-pf-evolution')?.parentElement;
    const empty = document.getElementById('pf-evolution-empty');
    if (!firstDate) {
      Charts.destroy('chart-pf-evolution');
      if (container) container.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (container) container.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    const dates = PortfolioAnalytics.monthEndDates(firstDate, today);
    const series = PortfolioAnalytics.valueTimeSeries(envelopes, ops, dates);
    Charts.genericLineEvolution('chart-pf-evolution', series.map(p => ({ label: Utils.formatDate(p.date), value: p.value })));
  },

  _renderBilan(envelopes, ops, today) {
    const actifs = envelopes.reduce((s, e) => s + PortfolioAnalytics.envelopeValue(e.id, ops, today), 0);
    const passifs = envelopes
      .filter(e => e.type === 'immobilier')
      .reduce((s, e) => s + PortfolioAnalytics.envelopeLiability(e, ops.filter(o => o.envelopeId === e.id), today), 0);
    document.getElementById('pf-bilan-actifs').textContent = Utils.formatCurrency(actifs);
    document.getElementById('pf-bilan-passifs').textContent = Utils.formatCurrency(passifs);
    const netEl = document.getElementById('pf-bilan-net');
    const net = actifs - passifs;
    netEl.textContent = Utils.formatCurrency(net);
    netEl.className = 'kpi-value ' + (net >= 0 ? 'positive' : 'negative');
  },
};
