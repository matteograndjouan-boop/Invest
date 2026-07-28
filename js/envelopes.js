// Enveloppes (PEA, assurance-vie, livret, crypto, immobilier, produit structuré...) et leurs
// opérations — modèle en 2 listes plates (Storage.getEnvelopes/getOperations, liées par
// operation.envelopeId) distinct de Storage.getInvestments (positions valorisées avec prix
// courant, utilisé par l'onglet "Vue globale"/js/investments.js, inchangé). Même gabarit
// liste/détail que Budget (js/budget.js : _currentThemeId/_renderList/_renderDetail/showList/
// showDetail/openAddForm intelligent selon la vue) — voir _currentEnvelopeId ci-dessous.
const Envelopes = {
  _currentEnvelopeId: null,

  // Définition des champs de formulaire d'opération, partagée par TOUS les types d'enveloppe —
  // seule la liste `fields` de Utils.ENVELOPE_OPERATIONS[type][i] varie d'une opération à
  // l'autre ; label/type/step/required de chaque champ ne dépendent que du champ lui-même.
  // amountLabel (sur la définition d'opération) surcharge le label par défaut de `amount` : un
  // seul champ de stockage (voir saveOperation) représente selon le type "un montant versé/
  // retiré", "une valeur totale de contrat", "un solde", "un capital restant dû"...
  _FIELD_DEFS: {
    date:      { label: 'Date', type: 'date', required: true },
    assetName: { label: "Nom de l'actif", type: 'text', required: true },
    ticker:    { label: 'Ticker', type: 'text', required: false },
    quantity:  { label: 'Quantité', type: 'number', step: '0.000001', required: true },
    unitPrice: { label: 'Prix unitaire (€)', type: 'number', step: '0.01', required: true },
    amount:    { label: 'Montant (€)', type: 'number', step: '0.01', required: true },
  },

  render() {
    if (this._currentEnvelopeId) this._renderDetail(this._currentEnvelopeId);
    else this._renderList();
  },

  showList() { this._currentEnvelopeId = null; this._renderList(); },
  showDetail(id) { this._currentEnvelopeId = id; this._renderDetail(id); },

  _typeLabel(type) { return (Utils.ENVELOPE_TYPES.find(t => t.key === type) || {}).label || type; },
  _opDefs(envelopeType) { return Utils.ENVELOPE_OPERATIONS[envelopeType] || []; },
  _opDef(envelopeType, opType) { return this._opDefs(envelopeType).find(o => o.key === opType); },

  // ─── LIST VIEW ───────────────────────────────────────────────────────────

  _renderList() {
    const listView   = document.getElementById('envelopes-list-view');
    const detailView = document.getElementById('envelope-detail-view');
    const addBtn     = document.getElementById('add-envelope-btn');
    const backBtn    = document.getElementById('env-back-btn');
    if (listView)   listView.classList.remove('hidden');
    if (detailView) detailView.classList.add('hidden');
    if (addBtn)   addBtn.textContent = '+ Nouvelle enveloppe';
    if (backBtn)  backBtn.classList.add('hidden');

    const envelopes = Storage.getEnvelopes();
    const grid  = document.getElementById('envelopes-grid');
    const empty = document.getElementById('envelopes-empty');
    if (!grid) return;

    if (!envelopes.length) {
      grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    const ops = Storage.getOperations();
    grid.innerHTML = envelopes.map(env => {
      const envOps = ops.filter(o => o.envelopeId === env.id);
      return `<div class="card">
        <div class="card-header-row">
          <h3 style="cursor:pointer" onclick="Envelopes.showDetail('${env.id}')">${env.name}</h3>
          <span class="badge badge-category">${this._typeLabel(env.type)}</span>
        </div>
        <p class="text-muted" style="margin:0 0 8px;cursor:pointer" onclick="Envelopes.showDetail('${env.id}')">${env.etablissement || 'Établissement non renseigné'}</p>
        <p style="margin:0 0 12px;cursor:pointer" onclick="Envelopes.showDetail('${env.id}')">${this._envelopeSummary(env, envOps)}</p>
        <div class="form-actions" style="margin-top:0;justify-content:flex-end">
          <button class="btn-icon" onclick="event.stopPropagation();Envelopes.openEditForm('${env.id}')" title="Modifier">✏️</button>
          <button class="btn-icon btn-danger" onclick="event.stopPropagation();Envelopes.deleteEnvelope('${env.id}')" title="Supprimer">${Utils.ICON_TRASH}</button>
        </div>
      </div>`;
    }).join('');
  },

  // Dernière opération d'un type donné (triée par date) — sert à afficher la valeur/solde le
  // plus récent sans tenir un solde couru (pas demandé, et faux dès qu'une opération est
  // ajoutée/modifiée hors ordre chronologique sans recalcul).
  _latestOpAmount(envOps, opType) {
    const matches = envOps.filter(o => o.type === opType && o.amount != null).sort((a, b) => a.date.localeCompare(b.date));
    return matches.length ? matches[matches.length - 1].amount : null;
  },

  // Résumé 1 ligne affiché sur la carte de la liste : la dernière valeur/solde connu pour les
  // types qui ont une opération "mise à jour" dédiée, sinon juste le nombre d'opérations — PEA/
  // Compte-titres/Crypto n'ont pas d'opération de valorisation (seulement achats/ventes/mouvements
  // d'espèces), calculer une valeur de portefeuille courante nécessiterait un cours actuel par
  // actif qu'aucun champ ne fournit ici : hors périmètre de cette tâche (logique/formulaires).
  _envelopeSummary(env, envOps) {
    if (!envOps.length) return 'Aucune opération';
    const n = envOps.length;
    const nOps = `${n} opération${n > 1 ? 's' : ''}`;
    const byType = {
      assurance_vie: 'maj_valeur', produit_structure: 'maj_valeur',
      livret: 'maj_solde', immobilier: 'maj_valeur_estimee',
    };
    const opType = byType[env.type];
    if (!opType) return nOps;
    const v = this._latestOpAmount(envOps, opType);
    return v !== null ? `${Utils.formatCurrency(v)} · ${nOps}` : nOps;
  },

  // ─── DETAIL VIEW ─────────────────────────────────────────────────────────

  _renderDetail(id) {
    const env = Storage.getEnvelopes().find(e => e.id === id);
    if (!env) { this.showList(); return; }

    const listView   = document.getElementById('envelopes-list-view');
    const detailView = document.getElementById('envelope-detail-view');
    const addBtn      = document.getElementById('add-envelope-btn');
    const backBtn     = document.getElementById('env-back-btn');
    if (listView)   listView.classList.add('hidden');
    if (detailView) detailView.classList.remove('hidden');
    if (addBtn)   addBtn.textContent = '+ Nouvelle opération';
    if (backBtn)  backBtn.classList.remove('hidden');

    const infoCard = document.getElementById('envelope-detail-info');
    if (infoCard) infoCard.innerHTML = this._envelopeInfoHtml(env);

    const ops = Storage.getOperations().filter(o => o.envelopeId === id).sort((a, b) => b.date.localeCompare(a.date));
    this._renderOpsTable(ops, env);
  },

  _envelopeInfoHtml(env) {
    const extra = Utils.ENVELOPE_EXTRA_FIELDS[env.type] || [];
    const extraLines = extra.map(f => {
      let val = env[f.key];
      if (val === undefined || val === null || val === '') return '';
      if (f.type === 'select') val = (f.options.find(o => o.value === val) || {}).label || val;
      if (f.type === 'date') val = Utils.formatDate(val);
      if (f.type === 'number') val = Utils.formatCurrency(val);
      return `<div class="env-info-item"><span class="text-muted">${f.label}</span><strong>${val}</strong></div>`;
    }).filter(Boolean).join('');

    return `
      <div class="card-header-row">
        <h3>${env.name}</h3>
        <div class="form-actions" style="margin-top:0">
          <button class="btn-icon" onclick="Envelopes.openEditForm('${env.id}')" title="Modifier l'enveloppe">✏️</button>
          <button class="btn-icon btn-danger" onclick="Envelopes.deleteEnvelope('${env.id}')" title="Supprimer l'enveloppe">${Utils.ICON_TRASH}</button>
        </div>
      </div>
      <div class="env-info-grid">
        <div class="env-info-item"><span class="text-muted">Type</span><strong>${this._typeLabel(env.type)}</strong></div>
        <div class="env-info-item"><span class="text-muted">Établissement</span><strong>${env.etablissement || '—'}</strong></div>
        <div class="env-info-item"><span class="text-muted">Date d'ouverture</span><strong>${env.openDate ? Utils.formatDate(env.openDate) : '—'}</strong></div>
        <div class="env-info-item"><span class="text-muted">Devise</span><strong>${env.currency || 'EUR'}</strong></div>
        ${extraLines}
      </div>`;
  },

  _opDetailText(op) {
    if (op.assetName) {
      const ticker = op.ticker ? ` (${op.ticker})` : '';
      const qtyPrice = (op.quantity != null && op.unitPrice != null)
        ? ` — ${op.quantity} × ${Utils.formatCurrency(op.unitPrice)}` : '';
      return `${op.assetName}${ticker}${qtyPrice}`;
    }
    return '—';
  },

  _renderOpsTable(ops, env) {
    const tbody = document.getElementById('envelope-ops-tbody');
    const empty = document.getElementById('envelope-ops-empty');
    if (!tbody) return;

    if (!ops.length) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    tbody.innerHTML = ops.map(op => {
      const def = this._opDef(env.type, op.type);
      const amount = op.amount != null ? op.amount : (op.quantity != null && op.unitPrice != null ? op.quantity * op.unitPrice : null);
      return `<tr>
        <td>${Utils.formatDate(op.date)}</td>
        <td>${def ? def.label : op.type}</td>
        <td>${this._opDetailText(op)}</td>
        <td class="text-right">${amount != null ? Utils.formatCurrency(amount) : '—'}</td>
        <td class="actions-cell">
          <button class="btn-icon" onclick="Envelopes.editOperation('${op.id}')" title="Modifier">✏️</button>
          <button class="btn-icon btn-danger" onclick="Envelopes.deleteOperation('${op.id}')" title="Supprimer">${Utils.ICON_TRASH}</button>
        </td>
      </tr>`;
    }).join('');
  },

  // ─── FORMULAIRE ENVELOPPE ────────────────────────────────────────────────

  // Même bouton "+ Nouvelle enveloppe"/"+ Nouvelle opération" que Budget.openAddForm : selon la
  // vue actuelle (liste ou détail), ouvre soit la création d'enveloppe soit la création
  // d'opération pour l'enveloppe affichée.
  openAddForm() {
    if (this._currentEnvelopeId) this.openAddOperation();
    else Modal.open('Nouvelle enveloppe', this._envelopeForm(null));
  },

  openEditForm(id) {
    const env = Storage.getEnvelopes().find(e => e.id === id);
    if (env) Modal.open("Modifier l'enveloppe", this._envelopeForm(env));
  },

  _etablissementDatalist() {
    return Storage.getEtablissements().map(e => `<option value="${e}">`).join('');
  },

  _envelopeForm(env) {
    const isEdit = !!env;
    const type = env?.type || Utils.ENVELOPE_TYPES[0].key;
    const typeOptions = Utils.ENVELOPE_TYPES
      .map(t => `<option value="${t.key}" ${type === t.key ? 'selected' : ''}>${t.label}</option>`).join('');

    return `
      <form onsubmit="Envelopes.saveEnvelope(event, ${isEdit ? `'${env.id}'` : 'null'})">
        <div class="form-grid">
          <div class="form-group form-full"><label>Nom *</label><input name="name" required value="${env?.name || ''}" placeholder='ex: "Mon PEA", "Livret A LCL"'></div>
          <div class="form-group"><label>Type *</label>${Dropdown.render('type', typeOptions, { required: true, id: 'env-type-select', onchange: 'Envelopes._onEnvelopeTypeChange(this.value)' })}</div>
          <div class="form-group">
            <label>Établissement *</label>
            <input name="etablissement" list="env-etab-datalist" required value="${env?.etablissement || ''}" placeholder="ex: Boursorama, Green Got, Degiro">
            <datalist id="env-etab-datalist">${this._etablissementDatalist()}</datalist>
          </div>
          <div class="form-group"><label>Date d'ouverture</label><input name="openDate" type="date" value="${env?.openDate || ''}"></div>
          <div class="form-group"><label>Devise</label><input name="currency" value="${env?.currency || 'EUR'}"></div>
        </div>
        <div id="env-extra-fields">${this._extraFieldsHtml(type, env)}</div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Modifier' : 'Créer'}</button>
        </div>
      </form>`;
  },

  _extraFieldsHtml(type, env) {
    const fields = Utils.ENVELOPE_EXTRA_FIELDS[type];
    if (!fields || !fields.length) return '';
    return `<div class="form-grid mt-md">${fields.map(f => {
      const val = env?.[f.key] ?? '';
      const req = f.optional ? '' : 'required';
      let input;
      if (f.type === 'select') {
        const opts = f.options.map(o => `<option value="${o.value}" ${val === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
        input = Dropdown.render(f.key, opts, { required: !f.optional });
      } else if (f.type === 'textarea') {
        input = `<textarea name="${f.key}" rows="2" ${req}>${val}</textarea>`;
      } else {
        input = `<input name="${f.key}" type="${f.type}" ${f.type === 'number' ? 'step="0.01" min="0"' : ''} ${req} value="${val}">`;
      }
      const full = f.type === 'textarea' ? ' form-full' : '';
      return `<div class="form-group${full}"><label>${f.label}${f.optional ? '' : ' *'}</label>${input}</div>`;
    }).join('')}</div>`;
  },

  _onEnvelopeTypeChange(type) {
    const container = document.getElementById('env-extra-fields');
    if (container) container.innerHTML = this._extraFieldsHtml(type, null);
  },

  saveEnvelope(event, id) {
    event.preventDefault();
    // Capturé AVANT toute réassignation : une création doit enchaîner sur le détail de la
    // nouvelle enveloppe (suite naturelle "maintenant j'ajoute des opérations"), mais éditer une
    // enveloppe depuis SA carte dans la liste (_currentEnvelopeId encore null à cet instant) ne
    // doit pas faire sauter l'utilisateur dans le détail — seule l'édition depuis le détail
    // lui-même doit y rester.
    const wasInDetail = !!this._currentEnvelopeId;
    const fd = new FormData(event.target);
    const type = fd.get('type');
    const etablissement = Storage.addEtablissement(fd.get('etablissement'));

    const data = {
      id: id || Utils.generateId(),
      name: fd.get('name').trim(),
      type,
      etablissement,
      openDate: fd.get('openDate') || '',
      currency: (fd.get('currency') || 'EUR').trim() || 'EUR',
    };
    (Utils.ENVELOPE_EXTRA_FIELDS[type] || []).forEach(f => {
      const raw = fd.get(f.key);
      data[f.key] = f.type === 'number' ? (raw ? parseFloat(raw) : null) : (raw || '').trim();
    });

    const list = Storage.getEnvelopes();
    if (id) { const idx = list.findIndex(e => e.id === id); if (idx !== -1) list[idx] = data; }
    else list.push(data);
    Storage.saveEnvelopes(list);
    Modal.close();
    this._currentEnvelopeId = id ? (wasInDetail ? id : null) : data.id;
    this.render();
  },

  deleteEnvelope(id) {
    if (!confirm('Supprimer cette enveloppe et toutes ses opérations ?')) return;
    Storage.saveEnvelopes(Storage.getEnvelopes().filter(e => e.id !== id));
    Storage.saveOperations(Storage.getOperations().filter(o => o.envelopeId !== id));
    if (this._currentEnvelopeId === id) this._currentEnvelopeId = null;
    this.render();
  },

  // ─── FORMULAIRE OPÉRATION ────────────────────────────────────────────────

  openAddOperation() {
    const env = Storage.getEnvelopes().find(e => e.id === this._currentEnvelopeId);
    if (!env) return;
    Modal.open('Nouvelle opération', this._operationForm(env, null));
  },

  editOperation(opId) {
    const op = Storage.getOperations().find(o => o.id === opId);
    if (!op) return;
    const env = Storage.getEnvelopes().find(e => e.id === op.envelopeId);
    if (!env) return;
    Modal.open("Modifier l'opération", this._operationForm(env, op));
  },

  // La visibilité initiale de chaque champ est calculée directement ici (pas via un <script>
  // injecté dans le HTML de la modale, qu'un innerHTML= n'exécute jamais — comportement standard
  // du DOM, pas un oubli) : même schéma que _extraFieldsHtml, qui calcule aussi son état initial
  // en construisant la chaîne plutôt qu'en rappelant une fonction après coup. _onOperationTypeChange
  // ne sert donc qu'aux changements APRÈS l'ouverture (l'utilisateur change le type d'opération).
  _operationForm(env, op) {
    const isEdit = !!op;
    const defs = this._opDefs(env.type);
    const opType = op?.type || defs[0]?.key;
    const typeOptions = defs.map(d => `<option value="${d.key}" ${opType === d.key ? 'selected' : ''}>${d.label}</option>`).join('');
    const currentDef = this._opDef(env.type, opType);
    const visibleFields = currentDef ? currentDef.fields : [];

    const fieldHtml = (key) => {
      const def = this._FIELD_DEFS[key];
      const val = op?.[key] ?? '';
      const isVisible = visibleFields.includes(key);
      // required seulement si le champ est ET requis ET actuellement visible : un <input required>
      // caché par display:none n'est PAS exempté de la validation HTML5 native malgré ce qu'on
      // pourrait attendre (testé empiriquement — Chromium bloque quand même la soumission, avec
      // juste un avertissement console "invalid form control ... not focusable", sans retour visuel
      // puisque l'input est injoignable). _onOperationTypeChange doit donc retirer/remettre required
      // en plus de .hidden à chaque changement de type, pas seulement au premier rendu ici.
      const req = (def.required && isVisible) ? 'required' : '';
      const label = key === 'amount' ? (currentDef?.amountLabel || def.label) : def.label;
      const hiddenCls = isVisible ? '' : ' hidden';
      let input;
      if (def.type === 'number') {
        input = `<input name="${key}" type="number" step="${def.step || '0.01'}" min="0" ${req} value="${val}">`;
      } else {
        input = `<input name="${key}" type="${def.type}" ${req} value="${val}">`;
      }
      return `<div class="form-group${hiddenCls}" data-field="${key}"><label id="op-label-${key}">${label}${def.required ? ' *' : ''}</label>${input}</div>`;
    };

    const allFields = ['date', 'assetName', 'ticker', 'quantity', 'unitPrice', 'amount'];

    return `
      <form onsubmit="Envelopes.saveOperation(event, ${isEdit ? `'${op.id}'` : 'null'})">
        <div class="form-grid">
          <div class="form-group form-full"><label>Type d'opération *</label>${Dropdown.render('opType', typeOptions, { required: true, id: 'op-type-select', onchange: `Envelopes._onOperationTypeChange('${env.type}', this.value)` })}</div>
          ${allFields.map(fieldHtml).join('')}
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Modifier' : 'Ajouter'}</button>
        </div>
      </form>`;
  },

  // Affiche/masque les .form-group[data-field] selon la liste `fields` de l'opération choisie.
  // Retire/remet aussi `required` sur l'input de chaque champ masqué/révélé : contrairement à ce
  // qu'on pourrait attendre, un <input required> cache par display:none n'est PAS exempté de la
  // validation HTML5 native (testé empiriquement — Chromium bloque quand même la soumission,
  // silencieusement côté utilisateur puisque l'input injoignable ne peut pas recevoir le focus
  // pour afficher la bulle d'erreur). Ajuste aussi le libellé du champ `amount`, dont le sens
  // dépend du type choisi (amountLabel — voir Utils.ENVELOPE_OPERATIONS).
  _onOperationTypeChange(envelopeType, opType) {
    const def = this._opDef(envelopeType, opType);
    const fields = def ? def.fields : [];
    document.querySelectorAll('#modal-body [data-field]').forEach(el => {
      const visible = fields.includes(el.dataset.field);
      el.classList.toggle('hidden', !visible);
      const fieldDef = this._FIELD_DEFS[el.dataset.field];
      if (fieldDef.required) {
        const input = el.querySelector('input, textarea');
        if (input) input.required = visible;
      }
    });
    const amountLabelEl = document.getElementById('op-label-amount');
    if (amountLabelEl && def) amountLabelEl.textContent = (def.amountLabel || this._FIELD_DEFS.amount.label) + (this._FIELD_DEFS.amount.required ? ' *' : '');
  },

  // En édition, l'enveloppe se déduit de l'opération elle-même (son envelopeId stocké) plutôt que
  // de this._currentEnvelopeId : les 2 coïncident forcément dans l'app réelle (editOperation n'est
  // jamais accessible que depuis la vue détail de CETTE enveloppe), mais dériver directement de
  // l'opération est strictement plus robuste — indépendant de tout état de navigation — pour un
  // coût nul. En création, il n'y a pas encore d'opération à consulter : _currentEnvelopeId reste
  // la seule source possible (et y est, lui, bien garanti correct — openAddOperation vient de le
  // vérifier avant même d'ouvrir le formulaire).
  saveOperation(event, id) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const opType = fd.get('opType');
    const targetEnvelopeId = id
      ? Storage.getOperations().find(o => o.id === id)?.envelopeId
      : this._currentEnvelopeId;
    const env = Storage.getEnvelopes().find(e => e.id === targetEnvelopeId);
    if (!env) return;
    const def = this._opDef(env.type, opType);
    const fields = def ? def.fields : [];

    const num = (key) => { const v = fd.get(key); return (v === null || v === '') ? null : parseFloat(v); };
    const data = {
      id: id || Utils.generateId(),
      envelopeId: env.id,
      type: opType,
      date: fd.get('date'),
      assetName: fields.includes('assetName') ? (fd.get('assetName') || '').trim() : null,
      ticker: fields.includes('ticker') ? (fd.get('ticker') || '').trim().toUpperCase() || null : null,
      quantity: fields.includes('quantity') ? num('quantity') : null,
      unitPrice: fields.includes('unitPrice') ? num('unitPrice') : null,
      amount: fields.includes('amount') ? num('amount') : null,
    };

    const list = Storage.getOperations();
    if (id) { const idx = list.findIndex(o => o.id === id); if (idx !== -1) list[idx] = data; }
    else list.push(data);
    Storage.saveOperations(list);
    Modal.close();
    this._currentEnvelopeId = env.id;
    this.render();
  },

  deleteOperation(id) {
    if (!confirm('Supprimer cette opération ?')) return;
    Storage.saveOperations(Storage.getOperations().filter(o => o.id !== id));
    this.render();
  },
};
