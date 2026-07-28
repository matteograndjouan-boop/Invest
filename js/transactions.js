// Onglet Transactions : liste brute de TOUTES les opérations, toutes enveloppes confondues
// (Storage.getOperations), avec 4 filtres (enveloppe/type d'opération/établissement/période).
// Pas de mise en forme particulière pour l'instant (demande explicite) — un tableau simple, même
// classe .data-table que partout ailleurs, aucune saisie ici (l'ajout/édition/suppression
// d'opérations reste dans Enveloppes, voir js/envelopes.js, dont ce module réutilise les
// helpers _opDef/_opDetailText plutôt que de dupliquer cette logique).
const Transactions = {
  init() {
    this._populateFilters();
    ['envelope', 'type', 'etab'].forEach(key => {
      const el = document.getElementById(`transactions-filter-${key}`);
      if (el) el.addEventListener('change', () => this.render());
    });
    const start = document.getElementById('transactions-filter-start');
    const end = document.getElementById('transactions-filter-end');
    if (start) start.addEventListener('change', () => this.render());
    if (end) end.addEventListener('change', () => this.render());
  },

  // Types d'opération de TOUS les types d'enveloppe réunis, dédupliqués par clé — "achat" par ex.
  // apparaît dans PEA/Compte-titres/Crypto mais ne doit compter qu'une fois dans ce filtre global
  // (contrairement à Enveloppes, où les types disponibles sont déjà bornés à UNE enveloppe).
  _allOperationDefs() {
    const seen = new Map();
    Object.values(Utils.ENVELOPE_OPERATIONS).flat().forEach(def => {
      if (!seen.has(def.key)) seen.set(def.key, def.label);
    });
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  },

  // Même schéma que Envelopes._populateFilters (Dropdown.mount, ré-appelé à chaque render — les
  // enveloppes/établissements disponibles peuvent changer entre 2 visites de cet onglet).
  _populateFilters() {
    const envVal = document.getElementById('transactions-filter-envelope')?.value || '';
    const envOpts = ['<option value="">Toutes les enveloppes</option>']
      .concat(Storage.getEnvelopes().map(e => `<option value="${e.id}"${e.id === envVal ? ' selected' : ''}>${e.name}</option>`))
      .join('');
    Dropdown.mount('transactions-filter-envelope-slot', 'transactions-filter-envelope', envOpts);

    const typeVal = document.getElementById('transactions-filter-type')?.value || '';
    const typeOpts = ['<option value="">Tous les types</option>']
      .concat(this._allOperationDefs().map(d => `<option value="${d.key}"${d.key === typeVal ? ' selected' : ''}>${d.label}</option>`))
      .join('');
    Dropdown.mount('transactions-filter-type-slot', 'transactions-filter-type', typeOpts);

    const etabVal = document.getElementById('transactions-filter-etab')?.value || '';
    const etabOpts = ['<option value="">Tous les établissements</option>']
      .concat(Storage.getEtablissements().map(e => `<option value="${e}"${e === etabVal ? ' selected' : ''}>${e}</option>`))
      .join('');
    Dropdown.mount('transactions-filter-etab-slot', 'transactions-filter-etab', etabOpts);
  },

  render() {
    this._populateFilters();

    const envelopes = Storage.getEnvelopes();
    const envById = new Map(envelopes.map(e => [e.id, e]));
    const allOps = Storage.getOperations();

    const envFilter  = document.getElementById('transactions-filter-envelope')?.value || '';
    const typeFilter = document.getElementById('transactions-filter-type')?.value || '';
    const etabFilter = document.getElementById('transactions-filter-etab')?.value || '';
    const start = document.getElementById('transactions-filter-start')?.value || '';
    const end   = document.getElementById('transactions-filter-end')?.value || '';

    let ops = allOps;
    if (envFilter)  ops = ops.filter(o => o.envelopeId === envFilter);
    if (typeFilter) ops = ops.filter(o => o.type === typeFilter);
    if (etabFilter) ops = ops.filter(o => envById.get(o.envelopeId)?.etablissement === etabFilter);
    if (start)      ops = ops.filter(o => o.date >= start);
    if (end)        ops = ops.filter(o => o.date <= end);
    ops = [...ops].sort((a, b) => b.date.localeCompare(a.date));

    const tbody   = document.getElementById('transactions-tbody');
    const empty   = document.getElementById('transactions-empty');
    const countEl = document.getElementById('transactions-count');
    if (!tbody) return;

    if (countEl) countEl.textContent = `${ops.length} opération${ops.length > 1 ? 's' : ''}`;

    if (!ops.length) {
      tbody.innerHTML = '';
      if (empty) {
        empty.textContent = allOps.length ? 'Aucune opération pour ces filtres.' : 'Aucune opération.';
        empty.classList.remove('hidden');
      }
      return;
    }
    if (empty) empty.classList.add('hidden');

    tbody.innerHTML = ops.map(op => {
      const env = envById.get(op.envelopeId);
      const def = env ? Envelopes._opDef(env.type, op.type) : null;
      const amount = op.amount != null ? op.amount : (op.quantity != null && op.unitPrice != null ? op.quantity * op.unitPrice : null);
      return `<tr>
        <td>${Utils.formatDate(op.date)}</td>
        <td>${env ? env.name : '—'}</td>
        <td>${env ? (env.etablissement || '—') : '—'}</td>
        <td>${def ? def.label : op.type}</td>
        <td>${Envelopes._opDetailText(op)}</td>
        <td class="text-right">${amount != null ? Utils.formatCurrency(amount) : '—'}</td>
      </tr>`;
    }).join('');
  },
};
