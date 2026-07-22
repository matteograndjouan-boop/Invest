const DataEntry = {
  _sortCol: 'date',
  _sortDir: -1,
  _selectionMode: false,
  _selected: new Set(), // "id|type" strings
  _filteredRows: [],
  _reassignTargets: null, // [{id, type}] ciblés par la modale Réaffecter ouverte (type = bucket)
  _isDragging: false,
  _dragMode: 'select', // 'select' ou 'deselect' selon l'état de la 1ère ligne touchée

  init() {
    // AVANT le reste : donnees-filter-cat n'existe pas encore tant que _populateCatFilter() ne
    // l'a pas rendu une 1re fois (Dropdown.mount le crée à la volée) — l'appeler en premier pour
    // que le getElementById juste en dessous le trouve bien et puisse y attacher son listener.
    this._populateCatFilter();

    const search = document.getElementById('donnees-search');
    const typeFilter = document.getElementById('donnees-filter-type');
    const catFilter = document.getElementById('donnees-filter-cat');
    const reassignFilter = document.getElementById('donnees-filter-reassign');
    if (search) search.addEventListener('input', () => this.render());
    if (typeFilter) typeFilter.addEventListener('change', () => this.render());
    if (catFilter) catFilter.addEventListener('change', () => this.render());
    if (reassignFilter) reassignFilter.addEventListener('change', () => this.render());

    document.querySelectorAll('#donnees-table .sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (this._sortCol === col) this._sortDir *= -1;
        else { this._sortCol = col; this._sortDir = -1; }
        this.render();
      });
    });

    // Mouse drag — end on mouseup anywhere
    document.addEventListener('mouseup', () => { this._isDragging = false; });
    // Touch drag — event delegation on tbody (passive:false to allow preventDefault)
    const tbody = document.getElementById('donnees-tbody');
    if (tbody) {
      tbody.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
      tbody.addEventListener('touchmove',  (e) => this._onTouchMove(e),  { passive: false });
    }
    document.addEventListener('touchend', () => { this._isDragging = false; });
  },

  _populateCatFilter() {
    const currentVal = document.getElementById('donnees-filter-cat')?.value || '';
    const optsHtml = ['<option value="">Toutes catégories</option>']
      .concat(Storage.getCategories().map(cat => `<option value="${cat.name}"${cat.name === currentVal ? ' selected' : ''}>${cat.name}</option>`))
      .join('');
    Dropdown.mount('donnees-filter-cat-slot', 'donnees-filter-cat', optsHtml);
  },

  toggleSelectionMode() {
    this._selectionMode = !this._selectionMode;
    this._selected.clear();
    this._isDragging = false;
    this._updateHeaderButtons();
    this.render();
  },

  // Barre d'actions groupées (mode sélection) : Modifier (actif sur exactement 1 ligne cochée
  // — réutilise le formulaire d'édition existant), Réaffecter (actif dès 1 ligne — catégorie
  // et/ou sous-catégorie en masse) et Supprimer (inchangé) partagent toutes le même point
  // d'entrée « ☑️ Sélectionner », plutôt que le bouton « Supprimer » unique d'avant.
  _updateHeaderButtons() {
    const actions = document.getElementById('donnees-header-actions');
    if (!actions) return;
    const n = this._selected.size;
    const total = this._filteredRows.length;
    if (this._selectionMode) {
      actions.innerHTML = `
        <button class="btn-primary" id="add-donnees-btn" style="display:none"></button>
        <button class="btn-secondary btn-sm" onclick="DataEntry.toggleSelectionMode()">✕ Annuler</button>
        <button class="btn-secondary btn-sm" id="donnees-edit-sel-btn" ${n === 1 ? '' : 'disabled'}
          onclick="DataEntry.editSelected()" title="${n === 1 ? 'Modifier la ligne sélectionnée' : 'Sélectionnez exactement 1 ligne'}">
          ✏️ Modifier
        </button>
        <button class="btn-secondary btn-sm" id="donnees-reassign-sel-btn" ${n === 0 ? 'disabled' : ''}
          onclick="DataEntry.openReassign()" title="${n === 0 ? 'Sélectionnez des lignes' : ''}">
          🏷️ Réaffecter${n > 0 ? ` (${n})` : ''}
        </button>
        <button class="btn-danger btn-sm" id="donnees-delete-sel-btn" ${n === 0 ? 'disabled' : ''} onclick="DataEntry.deleteSelected()">
          ${Utils.ICON_TRASH} ${n > 0 ? `Supprimer ${n} ligne${n > 1 ? 's' : ''}` : 'Sélectionnez des lignes'}
        </button>
        <button class="btn-danger-soft" onclick="DataEntry.deleteAll()" id="donnees-delete-all-btn">${Utils.ICON_TRASH} Tout supprimer (${total})</button>`;
    } else {
      actions.innerHTML = `
        <button class="btn-primary" id="add-donnees-btn">+ Ajouter une ligne</button>
        <button class="btn-secondary" id="donnees-select-mode-btn" onclick="DataEntry.toggleSelectionMode()">☑️ Sélectionner</button>`;
      // Re-bind add button
      document.getElementById('add-donnees-btn')?.addEventListener('click', () => this.openAddForm());
    }
  },

  _onRowMousedown(key, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    this._isDragging = true;
    this._dragMode = this._selected.has(key) ? 'deselect' : 'select';
    this._applyDragMode(key);
  },

  _onRowMouseenter(key) {
    if (!this._isDragging) return;
    this._applyDragMode(key);
  },

  _onTouchStart(e) {
    if (!this._selectionMode) return;
    const tr = e.target.closest('tr[data-key]');
    if (!tr) return;
    e.preventDefault(); // bloque sélection texte iOS
    this._isDragging = true;
    this._dragMode = this._selected.has(tr.dataset.key) ? 'deselect' : 'select';
    this._applyDragMode(tr.dataset.key);
  },

  _onTouchMove(e) {
    if (!this._isDragging || !this._selectionMode) return;
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    const tr = el.closest('tr[data-key]');
    if (!tr) return;
    this._applyDragMode(tr.dataset.key);
  },

  _applyDragMode(key) {
    if (this._dragMode === 'deselect') this._selected.delete(key);
    else this._selected.add(key);
    this._refreshRowHighlights();
    this._updateHeaderButtons();
  },

  _toggleKey(key) {
    if (this._selected.has(key)) this._selected.delete(key);
    else this._selected.add(key);
    this._refreshRowHighlights();
    this._updateHeaderButtons();
  },

  _refreshRowHighlights() {
    document.querySelectorAll('#donnees-tbody tr[data-key]').forEach(tr => {
      tr.classList.toggle('selected', this._selected.has(tr.dataset.key));
    });
  },

  deleteSelected() {
    const n = this._selected.size;
    if (!n) return;
    if (!confirm(`Supprimer ${n} ligne${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''} ?`)) return;
    const expIds = new Set(), revIds = new Set();
    this._selected.forEach(key => {
      const sep = key.lastIndexOf('|');
      const id = key.slice(0, sep), type = key.slice(sep + 1);
      if (type === 'expense') expIds.add(id); else revIds.add(id);
    });
    if (expIds.size) Storage.saveExpenses(Storage.getExpenses().filter(e => !expIds.has(e.id)));
    if (revIds.size) Storage.saveRevenues(Storage.getRevenues().filter(r => !revIds.has(r.id)));
    this._selected.clear();
    this.render();
    Dashboard.render();
  },

  // Bouton "✏️ Modifier" de la barre groupée : n'a de sens que sur une seule ligne (contrairement
  // à Supprimer/Réaffecter) — actif seulement si _selected en contient exactement 1 (voir
  // _updateHeaderButtons) ; réutilise tel quel le formulaire d'édition existant (même modal que
  // l'icône ✏️ par ligne).
  editSelected() {
    if (this._selected.size !== 1) return;
    const key = [...this._selected][0];
    const sep = key.lastIndexOf('|');
    this.edit(key.slice(0, sep), key.slice(sep + 1));
  },

  deleteAll() {
    const n = this._filteredRows.length;
    if (!n) return;
    if (!confirm(`Supprimer les ${n} ligne${n > 1 ? 's' : ''} visibles ? Cette action est irréversible.`)) return;
    const expIds = new Set(this._filteredRows.filter(r => r._type === 'expense').map(r => r.id));
    const revIds = new Set(this._filteredRows.filter(r => r._type === 'revenue').map(r => r.id));
    if (expIds.size) Storage.saveExpenses(Storage.getExpenses().filter(e => !expIds.has(e.id)));
    if (revIds.size) Storage.saveRevenues(Storage.getRevenues().filter(r => !revIds.has(r.id)));
    this._selected.clear();
    this._selectionMode = false;
    this._updateHeaderButtons();
    this.render();
    Dashboard.render();
  },

  // Bouton "🏷️ Réaffecter" de la barre groupée : change catégorie et/ou sous-catégorie de
  // toutes les lignes sélectionnées en une fois — dépenses, revenus ET investissements (Épargne),
  // via un sélecteur de type qui suit Categories._TYPES (les mêmes 3 thèmes que l'onglet
  // Catégories : ajouter un thème là-bas suffit à l'ajouter ici, aucune liste séparée).
  openReassign() {
    const targets = [...this._selected].map(key => {
      const sep = key.lastIndexOf('|');
      return { id: key.slice(0, sep), type: key.slice(sep + 1) };
    });
    this._openReassignModal(targets);
  },

  // Icône "🏷️" par ligne (colonne Actions, à côté de ✏️/🗑️) : réaffecte cette seule ligne sans
  // passer par la sélection multiple — même modale que la barre groupée, ciblée sur 1 ligne.
  // `type` = bucket de stockage actuel de la ligne ('expense' ou 'revenue', voir row._type).
  reassignOne(id, type) {
    this._openReassignModal([{ id, type }]);
  },

  // Point d'entrée commun : mémorise les cibles ({id, type=bucket actuel}) dans _reassignTargets
  // (lu par _confirmReassign) plutôt que de dépendre de this._selected, qui ne représente rien
  // pour le raccourci ligne-par-ligne (reassignOne, hors mode sélection).
  _openReassignModal(targets) {
    const expenses = Storage.getExpenses(), revenues = Storage.getRevenues();
    const records = targets
      .map(t => ({ ...t, record: (t.type === 'expense' ? expenses : revenues).find(r => r.id === t.id) }))
      .filter(t => t.record);
    if (!records.length) return;

    // "Sous-catégorie seulement" n'a de sens que si toutes les lignes ciblées partagent déjà la
    // même catégorie (sinon : la sous-catégorie de laquelle ?) — sameCategory reste null sinon,
    // et _reassignForm désactive alors cette option au profit de "Catégorie (et sous-catégorie)".
    // Une catégorie commune implique un thème commun (une catégorie n'appartient qu'à un thème),
    // donc currentTheme s'en déduit directement pour présélectionner le type.
    const distinctCats = [...new Set(records.map(r => r.record.category))];
    const sameCategory = distinctCats.length === 1 ? distinctCats[0] : null;
    const sameCategoryObj = sameCategory ? Storage.getCategories().find(c => c.name === sameCategory) : null;
    const currentTheme = sameCategoryObj ? Categories._catType(sameCategoryObj) : null;

    this._reassignTargets = targets;
    Modal.open('Réaffecter', this._reassignForm(records.length, sameCategory, currentTheme));
  },

  _reassignForm(count, sameCategory, currentTheme) {
    const sameCatSubcats = sameCategory ? (Categories.getSubcats(sameCategory) || []) : [];
    const subcatOnlyOptions = sameCatSubcats.length
      ? ['', ...sameCatSubcats].map(s => `<option value="${s}" ${s === '' ? 'selected' : ''}>${s || '—'}</option>`).join('')
      : '<option value="">—</option>';

    // Type par défaut de "Catégorie (et sous-catégorie)" : le thème commun aux lignes ciblées
    // s'il y en a un, sinon le 1er thème de Categories._TYPES (Dépenses).
    const defaultType = currentTheme || Categories._TYPES[0].key;
    const typeOptions = Categories._TYPES.map(T =>
      `<option value="${T.key}" ${T.key === defaultType ? 'selected' : ''}>${T.icon} ${T.label}</option>`
    ).join('');
    const catsForType = Storage.getActiveCategories().filter(c => Categories._catType(c) === defaultType);
    const catOptions = catsForType.map((c, i) => `<option value="${c.name}" ${i === 0 ? 'selected' : ''}>${c.name}</option>`).join('');
    const firstSubcats = catsForType[0]?.subcategories || [];
    const catSubcatOptions = firstSubcats.length
      ? ['', ...firstSubcats].map(s => `<option value="${s}" ${s === '' ? 'selected' : ''}>${s || '—'}</option>`).join('')
      : '<option value="">—</option>';

    return `
      <form onsubmit="DataEntry._confirmReassign(event)">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px">
          ${count} ligne${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''} ser${count > 1 ? 'ont' : 'a'} réaffectée${count > 1 ? 's' : ''}.
        </p>
        <div class="form-group form-full" style="margin-bottom:14px">
          <label style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;cursor:${sameCategory ? 'pointer' : 'not-allowed'};opacity:${sameCategory ? '1' : '0.55'}">
            <input type="radio" name="reassign_scope" value="subcat" style="margin-top:3px"
              ${sameCategory ? 'checked' : 'disabled'} onchange="DataEntry._toggleReassignScope('subcat')">
            <span>Sous-catégorie seulement${sameCategory
              ? ` <span style="color:var(--text-muted)">(catégorie actuelle : <strong style="color:var(--text)">${sameCategory}</strong>, inchangée)</span>`
              : ' <span style="font-size:12px">— nécessite que les lignes sélectionnées partagent déjà la même catégorie</span>'}</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="radio" name="reassign_scope" value="cat" ${sameCategory ? '' : 'checked'} onchange="DataEntry._toggleReassignScope('cat')">
            Catégorie (et sous-catégorie)
          </label>
        </div>
        <div class="form-group form-full" id="reassign-subcat-only-group" style="${sameCategory ? '' : 'display:none'}">
          <label>Nouvelle sous-catégorie</label>
          ${Dropdown.render('subcat_only', subcatOnlyOptions, { disabled: !sameCatSubcats.length })}
        </div>
        <div class="form-group form-full" id="reassign-type-group" style="${sameCategory ? 'display:none' : ''}">
          <label>Type</label>
          ${Dropdown.render('new_type', typeOptions, { id: 'reassign-type-select', onchange: 'DataEntry._updateReassignCats(this.value)' })}
        </div>
        <div class="form-group form-full" id="reassign-cat-group" style="${sameCategory ? 'display:none' : ''}">
          <label>Nouvelle catégorie</label>
          ${Dropdown.render('new_category', catOptions, { id: 'reassign-cat-select', onchange: 'DataEntry._updateReassignSubcats(this.value)' })}
        </div>
        <div class="form-group form-full" id="reassign-cat-subcat-group" style="${sameCategory ? 'display:none' : ''}">
          <label>Nouvelle sous-catégorie</label>
          ${Dropdown.render('new_subcategory', catSubcatOptions, { id: 'reassign-cat-subcat-select', disabled: !firstSubcats.length })}
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Réaffecter</button>
        </div>
      </form>`;
  },

  _toggleReassignScope(scope) {
    const subOnlyGroup = document.getElementById('reassign-subcat-only-group');
    const typeGroup = document.getElementById('reassign-type-group');
    const catGroup = document.getElementById('reassign-cat-group');
    const catSubGroup = document.getElementById('reassign-cat-subcat-group');
    if (!subOnlyGroup || !typeGroup || !catGroup || !catSubGroup) return;
    if (scope === 'subcat') {
      subOnlyGroup.style.display = ''; typeGroup.style.display = 'none'; catGroup.style.display = 'none'; catSubGroup.style.display = 'none';
    } else {
      subOnlyGroup.style.display = 'none'; typeGroup.style.display = ''; catGroup.style.display = ''; catSubGroup.style.display = '';
    }
  },

  // Changement du sélecteur Type ("Catégorie (et sous-catégorie)") : recharge la liste des
  // catégories sur ce thème (Categories._catType), puis cascade sur les sous-catégories de la
  // 1ère catégorie du nouveau thème — même principe que _updateReassignSubcats pour Catégorie.
  _updateReassignCats(type) {
    if (!document.getElementById('reassign-cat-select')) return;
    const cats = Storage.getActiveCategories().filter(c => Categories._catType(c) === type);
    const optsHtml = cats.map((c, i) => `<option value="${c.name}" ${i === 0 ? 'selected' : ''}>${c.name}</option>`).join('');
    Dropdown.setOptions('reassign-cat-select', optsHtml);
    this._updateReassignSubcats(cats[0]?.name || '');
  },

  _updateReassignSubcats(catName) {
    if (!document.getElementById('reassign-cat-subcat-select')) return;
    const subcats = Categories.getSubcats(catName);
    const optsHtml = subcats.length
      ? ['', ...subcats].map(s => `<option value="${s}">${s || '—'}</option>`).join('')
      : '<option value="">—</option>';
    Dropdown.setOptions('reassign-cat-subcat-select', optsHtml);
    Dropdown.setDisabled('reassign-cat-subcat-select', !subcats.length);
  },

  _confirmReassign(event) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const scope = fd.get('reassign_scope');

    const targets = this._reassignTargets;
    if (!targets || !targets.length) { Modal.close(); return; }

    const expenses = Storage.getExpenses(), revenues = Storage.getRevenues();
    const findRec = (id, type) => (type === 'expense' ? expenses : revenues).find(r => r.id === id);

    // reassignedFrom = { cat, sub } : DEUX niveaux d'annulation indépendants (pas un seul global)
    // — sinon réaffecter la sous-catégorie d'une ligne déjà réaffectée sur sa catégorie écrasait
    // le souvenir de cette 1ère réaffectation, la rendant impossible à annuler. cat = catégorie
    // (et bucket) d'avant le dernier changement de CATÉGORIE ; sub = sous-catégorie d'avant le
    // dernier changement de SOUS-CATÉGORIE seule. save() (édition manuelle classique) remplace
    // l'objet entier et efface donc les deux automatiquement — une édition déclarée prend le pas
    // sur l'annulation d'une réaffectation en masse.
    if (scope === 'subcat') {
      // La sous-catégorie seule ne change jamais de bucket (sameCategory garantit déjà que
      // toutes les lignes ciblées sont dans la même catégorie, donc le même thème/bucket) —
      // simple mutation en place. cat préservé tel quel (voir _reassignInfo).
      const newSub = fd.get('subcat_only') || '';
      targets.forEach(({ id, type }) => {
        const rec = findRec(id, type);
        if (!rec) return;
        const info = this._reassignInfo(rec);
        rec.reassignedFrom = { cat: info.cat, sub: { subcategory: rec.subcategory || '' } };
        rec.subcategory = newSub;
      });
    } else {
      const newType = fd.get('new_type'); // thème de catégorie choisi : 'expense'/'revenue'/'investment'
      const newCat = fd.get('new_category');
      const newSub = fd.get('new_subcategory') || '';
      // Bucket de stockage cible : 'revenue' si le thème choisi est 'revenue', sinon 'expense' —
      // dépense ET investissement (Épargne) vivent tous deux dans invest_expenses, seule la
      // catégorie les distingue, pas le bucket (voir Utils.isExpenseCategory).
      const newBucket = newType === 'revenue' ? 'revenue' : 'expense';

      targets.forEach(({ id, type: oldBucket }) => {
        const rec = findRec(id, oldBucket);
        if (!rec) return;
        // sub remis à null : une sous-catégorie réaffectée séparément appartenait à l'ANCIENNE
        // catégorie, elle n'a plus de sens à annuler une fois la catégorie elle-même changée.
        const reassignedFrom = { cat: { type: oldBucket, category: rec.category, subcategory: rec.subcategory || '' }, sub: null };

        if (oldBucket === newBucket) {
          rec.reassignedFrom = reassignedFrom;
          rec.category = newCat;
          rec.subcategory = newSub;
        } else {
          // Changement de bucket (dépense/épargne <-> revenu) : retire de l'ancien, recrée dans
          // le nouveau avec un nouvel id — même logique que save() pour un changement de type
          // manuel. effectiveDate n'a de sens que pour dépense/épargne, jamais pour un revenu.
          const oldList = oldBucket === 'expense' ? expenses : revenues;
          oldList.splice(oldList.indexOf(rec), 1);
          const moved = { ...rec, id: Utils.generateId(), category: newCat, subcategory: newSub, reassignedFrom };
          if (newBucket === 'revenue') delete moved.effectiveDate;
          (newBucket === 'expense' ? expenses : revenues).push(moved);
        }
      });
    }
    Storage.saveExpenses(expenses);
    Storage.saveRevenues(revenues);

    this._reassignTargets = null;
    this._selected.clear();
    Modal.close();
    this.render();
    Dashboard.render();
  },

  // Normalise reassignedFrom vers la forme actuelle { cat, sub } quel que soit le format de
  // stockage : lignes déjà réaffectées avec ce format, mais aussi lignes réaffectées par les 2
  // versions précédentes de cette fonctionnalité (un seul niveau { type, category, subcategory,
  // scope }, voire { category, subcategory } sans scope pour les toutes premières) — sinon leur
  // badge disparaîtrait silencieusement après ce correctif. { cat: {...}|null, sub: {...}|null }.
  _reassignInfo(row) {
    const rf = row.reassignedFrom;
    if (!rf) return { cat: null, sub: null };
    if ('cat' in rf || 'sub' in rf) return { cat: rf.cat || null, sub: rf.sub || null };
    return rf.scope === 'subcat'
      ? { cat: null, sub: { subcategory: rf.subcategory || '' } }
      : { cat: { type: rf.type || 'expense', category: rf.category, subcategory: rf.subcategory || '' }, sub: null };
  },

  // Annule un des deux niveaux de réaffectation (clic sur le badge 🏷️ catégorie ou
  // sous-catégorie) : restaure les valeurs mémorisées dans reassignedFrom.cat ou .sub et efface
  // CE niveau, donc SEUL ce badge disparaît — l'autre niveau (s'il existe) reste annulable
  // séparément. Annuler la catégorie efface aussi le niveau sous-catégorie : une sous-catégorie
  // réaffectée depuis appartenait à l'ancienne catégorie, la restaurer avec la nouvelle n'aurait
  // aucun sens. `type` = bucket ACTUEL de la ligne (voir row._type dans render).
  undoReassign(id, type, part) {
    const list = type === 'expense' ? Storage.getExpenses() : Storage.getRevenues();
    const rec = list.find(r => r.id === id);
    if (!rec) return;
    const info = this._reassignInfo(rec);
    const target = part === 'sub' ? info.sub : info.cat;
    if (!target) return;

    if (part === 'sub') {
      if (!confirm(`Annuler la réaffectation ?\nSous-catégorie restaurée : ${target.subcategory || '—'}`)) return;
      rec.subcategory = target.subcategory || '';
      rec.reassignedFrom = { cat: info.cat, sub: null };
      Storage[type === 'expense' ? 'saveExpenses' : 'saveRevenues'](list);
    } else if (target.type === type) {
      if (!confirm(`Annuler la réaffectation ?\nCatégorie restaurée : ${target.category}${target.subcategory ? ' / ' + target.subcategory : ''}`)) return;
      rec.category = target.category;
      rec.subcategory = target.subcategory || '';
      delete rec.reassignedFrom;
      Storage[type === 'expense' ? 'saveExpenses' : 'saveRevenues'](list);
    } else {
      if (!confirm(`Annuler la réaffectation ?\nCatégorie restaurée : ${target.category}${target.subcategory ? ' / ' + target.subcategory : ''}`)) return;
      // La réaffectation avait changé de bucket : on l'y ramène (même mécanique que
      // _confirmReassign — retrait + recréation avec un nouvel id dans l'autre bucket).
      list.splice(list.indexOf(rec), 1);
      const restored = { ...rec, id: Utils.generateId(), category: target.category, subcategory: target.subcategory || '' };
      delete restored.reassignedFrom;
      if (target.type === 'revenue') delete restored.effectiveDate;
      const otherList = target.type === 'expense' ? Storage.getExpenses() : Storage.getRevenues();
      otherList.push(restored);
      Storage[type === 'expense' ? 'saveExpenses' : 'saveRevenues'](list);
      Storage[target.type === 'expense' ? 'saveExpenses' : 'saveRevenues'](otherList);
    }
    this.render();
    Dashboard.render();
  },

  render() {
    // La barre d'actions (Ajouter/Supprimer) n'est sinon jamais générée avant la première
    // action utilisateur — le bouton statique de index.html restait alors affiché tel quel
    // (ancien style, jamais mis à jour) à chaque arrivée sur l'onglet.
    this._updateHeaderButtons();
    const search = (document.getElementById('donnees-search')?.value || '').toLowerCase().trim();
    const typeFilter = document.getElementById('donnees-filter-type')?.value || '';
    const catFilter = document.getElementById('donnees-filter-cat')?.value || '';
    const reassignFilter = document.getElementById('donnees-filter-reassign')?.value || '';

    const expenses = Storage.getExpenses().map(e => ({ ...e, _type: 'expense' }));
    const revenues = Storage.getRevenues().map(r => ({ ...r, _type: 'revenue' }));
    let rows = [...expenses, ...revenues];

    if (typeFilter === 'expense') rows = rows.filter(r => r._type === 'expense');
    else if (typeFilter === 'revenue') rows = rows.filter(r => r._type === 'revenue');
    if (catFilter) rows = rows.filter(r => r.category === catFilter);
    if (reassignFilter) rows = rows.filter(r => !!this._reassignInfo(r)[reassignFilter === 'subcat' ? 'sub' : 'cat']);
    if (search) {
      rows = rows.filter(r =>
        (r.description || '').toLowerCase().includes(search) ||
        (r.category || '').toLowerCase().includes(search) ||
        (r.subcategory || '').toLowerCase().includes(search) ||
        (r.date || '').includes(search)
      );
    }

    rows.sort((a, b) => {
      let va = a[this._sortCol] ?? '', vb = b[this._sortCol] ?? '';
      if (this._sortCol === 'amount') { va = Number(va); vb = Number(vb); }
      else { va = String(va); vb = String(vb); }
      return va < vb ? -this._sortDir : va > vb ? this._sortDir : 0;
    });

    this._filteredRows = rows;

    document.querySelectorAll('#donnees-table .sortable').forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = th.dataset.col === this._sortCol ? (this._sortDir === -1 ? '↓' : '↑') : '↕';
    });

    const countEl = document.getElementById('donnees-count');
    if (countEl) countEl.textContent = `${rows.length} ligne${rows.length > 1 ? 's' : ''}`;

    const tbody = document.getElementById('donnees-tbody');
    const empty = document.getElementById('donnees-empty');
    const thActions = document.getElementById('donnees-th-actions');
    if (!tbody) return;
    if (thActions) thActions.style.visibility = this._selectionMode ? 'hidden' : '';

    if (!rows.length) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      if (this._selectionMode) this._updateHeaderButtons();
      return;
    }
    empty.classList.add('hidden');

    const sel = this._selectionMode;
    tbody.innerHTML = rows.map(row => {
      const key = `${row.id}|${row._type}`;
      const isExpense = row._type === 'expense';
      const isSelected = sel && this._selected.has(key);
      const typeBadge = isExpense
        ? '<span class="badge badge-expense-type">Dépense</span>'
        : '<span class="badge badge-revenue-type">Revenu</span>';
      // Couleur de la catégorie (Utils.getCategoryColor, même source que la pastille active d'un
      // filtre catégorie dans l'onglet Flux) plutôt que le violet générique de .badge-category —
      // seulement si une catégorie existe, sinon getCategoryColor('') retomberait sur une couleur
      // par défaut trompeuse pour un « — » qui n'en a pas.
      const catBadge = row.category
        ? `<span class="badge badge-category" style="background:${Utils.getCategoryColor(row.category)};color:#fff">${row.category}</span>`
        : `<span class="badge badge-category">—</span>`;
      const subcatBadge = row.subcategory ? `<span class="badge badge-subcategory">${row.subcategory}</span>` : '<span class="text-muted">—</span>';
      // Badges de réaffectation (posés par _confirmReassign, effacés par undoReassign ou par
      // toute édition manuelle via save()) : catégorie et sous-catégorie sont DEUX niveaux
      // d'annulation indépendants (_reassignInfo), donc les deux badges peuvent coexister — ex.
      // catégorie réaffectée hier, puis sa sous-catégorie retouchée aujourd'hui : les deux
      // restent annulables séparément, chacun sur sa propre colonne. Seulement hors mode
      // sélection, comme les icônes ✏️/🗑️ — en sélection, la ligne a déjà un handler mousedown
      // pour le glisser-sélectionner. Dépenses ET revenus peuvent être réaffectés (openReassign
      // gère les deux buckets) — plus de restriction aux dépenses.
      const reassignInfo = this._reassignInfo(row);
      const catReassignBadge = (!sel && reassignInfo.cat)
        ? `<span class="reassign-badge" title="Catégorie réaffectée — était : ${reassignInfo.cat.category}${reassignInfo.cat.subcategory ? ' / ' + reassignInfo.cat.subcategory : ''}. Cliquer pour annuler." onclick="DataEntry.undoReassign('${row.id}','${row._type}','cat');event.stopPropagation()">🏷️</span>`
        : '';
      const subReassignBadge = (!sel && reassignInfo.sub)
        ? `<span class="reassign-badge" title="Sous-catégorie réaffectée — était : ${reassignInfo.sub.subcategory || '—'}. Cliquer pour annuler." onclick="DataEntry.undoReassign('${row.id}','${row._type}','sub');event.stopPropagation()">🏷️</span>`
        : '';
      const amountClass = isExpense ? 'negative' : 'positive';
      const actionsTd = sel ? '' : `<td class="actions-cell">
        <button class="btn-icon" onclick="DataEntry.edit('${row.id}','${row._type}')" title="Modifier">✏️</button>
        <button class="btn-icon" onclick="DataEntry.reassignOne('${row.id}','${row._type}');event.stopPropagation()" title="Réaffecter">🏷️</button>
        <button class="btn-icon btn-danger" onclick="DataEntry.delete('${row.id}','${row._type}');event.stopPropagation()" title="Supprimer">${Utils.ICON_TRASH}</button>
      </td>`;

      return `<tr class="donnees-row${isSelected ? ' selected' : ''}${sel ? ' selectable' : ''}" data-key="${key}"
        ${sel ? `onmousedown="DataEntry._onRowMousedown('${key}',event)" onmouseenter="DataEntry._onRowMouseenter('${key}')"` : ''}>
        <td class="donnees-date">${Utils.formatDate(row.date)}</td>
        <td class="donnees-effective-date">${row.effectiveDate ? (() => { const [y,m] = row.effectiveDate.split('-'); const MFR=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']; return `<span class="effective-badge">${MFR[+m-1]} ${y}</span>`; })() : ''}</td>
        <td>${typeBadge}</td>
        <td class="donnees-desc">${row.description || '—'}</td>
        <td>${catBadge}${catReassignBadge}</td>
        <td>${subcatBadge}${subReassignBadge}</td>
        <td class="text-right"><strong class="${amountClass}">${Utils.formatCurrency(row.amount)}</strong></td>
        ${actionsTd}
      </tr>`;
    }).join('');

    if (sel) this._updateHeaderButtons();
  },

  openAddForm() {
    Modal.open('Ajouter une ligne', this._form(null, 'expense'));
  },

  edit(id, type) {
    const list = type === 'expense' ? Storage.getExpenses() : Storage.getRevenues();
    const item = list.find(i => i.id === id);
    if (item) Modal.open('Modifier', this._form({ ...item, _type: type }, type));
  },

  delete(id, type) {
    if (!confirm('Supprimer cette ligne ?')) return;
    if (type === 'expense') {
      Storage.saveExpenses(Storage.getExpenses().filter(e => e.id !== id));
    } else {
      Storage.saveRevenues(Storage.getRevenues().filter(r => r.id !== id));
    }
    this.render();
    Dashboard.render();
  },

  _form(item, defaultType) {
    const isEdit = !!item;
    const type = item?._type || defaultType || 'expense';
    const today = new Date().toISOString().split('T')[0];

    // Catégories actives de type "dépense" pour la saisie (Épargne/Revenus exclues, comme
    // dans Flux/Budget/Comparaisons) ; on conserve la catégorie actuelle de la transaction
    // éditée même si elle est devenue inactive/exclue (renommage à portée, ancienne dépense
    // Épargne importée avant ce changement...).
    const cats = Storage.getActiveCategories().filter(c => Categories._catType(c) === 'expense');
    if (item?.category && !cats.some(c => c.name === item.category)) {
      const cur = Storage.getCategories().find(c => c.name === item.category);
      if (cur) cats.push(cur);
    }
    const catOptions = cats.map(c =>
      `<option value="${c.name}" ${item?.category === c.name ? 'selected' : ''}>${c.name}</option>`
    ).join('');

    const selectedCat = cats.find(c => c.name === item?.category) || cats[0];
    const subcats = selectedCat?.subcategories || [];
    const subcatOptions = subcats.length
      ? ['', ...subcats].map(s => `<option value="${s}" ${(item?.subcategory || '') === s ? 'selected' : ''}>${s || '—'}</option>`).join('')
      : '<option value="">—</option>';

    const revCats = Utils.REVENUE_CATEGORIES.map(c =>
      `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${c}</option>`
    ).join('');

    return `
      <form onsubmit="DataEntry.save(event, '${isEdit ? item.id : ''}', '${type}')">
        <div class="form-grid">
          <div class="form-group form-full">
            <label>Type</label>
            ${Dropdown.render('entry_type', `
              <option value="expense" ${type === 'expense' ? 'selected' : ''}>Dépense</option>
              <option value="revenue" ${type === 'revenue' ? 'selected' : ''}>Revenu</option>
            `, { onchange: 'DataEntry._toggleTypeFields(this.value)' })}
          </div>
          <div class="form-group form-full">
            <label>Description *</label>
            <input name="description" required value="${item?.description || ''}" placeholder="ex: Courses Carrefour">
          </div>
          <div class="form-group">
            <label>Montant (€) *</label>
            <input name="amount" type="number" step="0.01" min="0" required value="${item?.amount || ''}">
          </div>
          <div class="form-group">
            <label>Date de transaction *</label>
            <input name="date" type="date" required value="${item?.date || today}">
          </div>
          <div class="form-group" id="de-effective-date-group">
            <label>Mois effectif <span style="font-weight:400;color:var(--text-muted)">(optionnel)</span></label>
            ${Utils.monthYearPicker(item?.effectiveDate || '')}
          </div>
          <div class="form-group" id="de-cat-group">
            <label>Catégorie *</label>
            ${Dropdown.render('category', catOptions, { required: true, onchange: 'DataEntry._updateSubcats(this.value)' })}
          </div>
          <div class="form-group" id="de-rev-cat-group" style="display:none">
            <label>Catégorie (revenu) *</label>
            ${Dropdown.render('rev_category', revCats)}
          </div>
          <div class="form-group" id="de-subcat-group">
            <label>Sous-catégorie</label>
            ${Dropdown.render('subcategory', subcatOptions, { id: 'de-subcat-select', disabled: !subcats.length })}
          </div>
          <div class="form-group form-full">
            <label>Notes</label>
            <textarea name="notes" rows="2">${item?.notes || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Modifier' : 'Ajouter'}</button>
        </div>
      </form>`;
  },

  _toggleTypeFields(type) {
    const catGroup = document.getElementById('de-cat-group');
    const revCatGroup = document.getElementById('de-rev-cat-group');
    const subcatGroup = document.getElementById('de-subcat-group');
    if (type === 'revenue') {
      catGroup.style.display = 'none'; revCatGroup.style.display = ''; subcatGroup.style.display = 'none';
    } else {
      catGroup.style.display = ''; revCatGroup.style.display = 'none'; subcatGroup.style.display = '';
    }
  },

  _updateSubcats(catName) {
    if (!document.getElementById('de-subcat-select')) return;
    const subcats = Categories.getSubcats(catName);
    const optsHtml = subcats.length
      ? ['', ...subcats].map(s => `<option value="${s}">${s || '—'}</option>`).join('')
      : '<option value="">—</option>';
    Dropdown.setOptions('de-subcat-select', optsHtml);
    Dropdown.setDisabled('de-subcat-select', !subcats.length);
  },

  save(event, id, originalType) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const newType = fd.get('entry_type');
    const isRevenue = newType === 'revenue';

    const effectiveDate = !isRevenue ? Utils.getEffectiveDateFromForm(fd) : '';
    const data = {
      id: id || Utils.generateId(),
      description: fd.get('description').trim(),
      amount: parseFloat(fd.get('amount')),
      category: isRevenue ? fd.get('rev_category') : fd.get('category'),
      subcategory: isRevenue ? '' : (fd.get('subcategory') || ''),
      date: fd.get('date'),
      ...(!isRevenue && effectiveDate && { effectiveDate }),
      notes: (fd.get('notes') || '').trim(),
    };

    if (id && originalType !== newType) {
      if (originalType === 'expense') Storage.saveExpenses(Storage.getExpenses().filter(e => e.id !== id));
      else Storage.saveRevenues(Storage.getRevenues().filter(r => r.id !== id));
      data.id = Utils.generateId();
    }

    if (isRevenue) {
      const list = Storage.getRevenues();
      const idx = list.findIndex(r => r.id === data.id);
      if (idx !== -1) list[idx] = data; else list.push(data);
      Storage.saveRevenues(list);
    } else {
      const list = Storage.getExpenses();
      const idx = list.findIndex(e => e.id === data.id);
      if (idx !== -1) list[idx] = data; else list.push(data);
      Storage.saveExpenses(list);
    }

    Modal.close();
    this.render();
    Dashboard.render();
  },
};
