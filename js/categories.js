const Categories = {
  _dnd: null,
  _editingCatId: null, // catégorie en mode édition

  render() {
    const cats = Storage.getCategories();
    const container = document.getElementById('categories-container');
    if (!container) return;

    if (!cats.length) {
      container.innerHTML = '<p class="text-muted text-center py-lg">Aucune catégorie. Créez-en une !</p>';
      return;
    }

    container.innerHTML = cats.map(cat => {
      const editing = this._editingCatId === cat.id;

      const subcatRows = cat.subcategories.map((sub, idx) => `
        <div class="subcat-item" data-cat-id="${cat.id}" data-subcat-idx="${idx}">
          <span class="subcat-handle" onmousedown="Categories._dndStart(event,'subcat','${cat.id}',${idx})" ontouchstart="Categories._dndStart(event,'subcat','${cat.id}',${idx})">⠿</span>
          <span class="subcat-name">${sub}</span>
          ${editing ? `<button class="subcat-delete-btn" onclick="Categories.deleteSubcat('${cat.id}',${idx})" title="Supprimer">✕</button>` : ''}
        </div>`).join('');

      const footer = editing ? `
        <div class="cat-edit-footer">
          <button class="btn-secondary btn-sm" onclick="Categories._openAddSubcatModal('${cat.id}')">＋ Ajouter</button>
          <button class="btn-danger btn-sm" onclick="Categories.deleteCategory('${cat.id}')">Supprimer la catégorie</button>
        </div>` : '';

      return `
        <div class="category-card${editing ? ' editing' : ''}${cat.obsolete ? ' cat-obsolete' : ''}" data-cat-id="${cat.id}" id="cat-${cat.id}">
          <div class="category-card-header">
            <span class="cat-drag-handle" onmousedown="Categories._dndStart(event,'cat','${cat.id}',null)" ontouchstart="Categories._dndStart(event,'cat','${cat.id}',null)">⠿</span>
            <h3>${cat.name}</h3>
            ${cat.obsolete ? '<span class="cat-obsolete-badge" title="Ne reçoit plus les nouvelles transactions">Inactive</span>' : ''}
            ${editing ? `<button class="cat-rename-btn" onclick="Categories._openRenameCat('${cat.id}')" title="Renommer">✏️ Renommer</button>` : ''}
            ${!editing ? `<button class="cat-edit-btn" onclick="Categories._startEdit('${cat.id}')">Modifier</button>` : `<button class="cat-edit-btn active" onclick="Categories._stopEdit()">Terminer</button>`}
          </div>
          ${cat.versionNote ? `<div class="cat-version-note">↪ ${cat.versionNote}</div>` : ''}
          <div class="subcat-list" data-cat-id="${cat.id}">
            ${subcatRows || '<p class="text-muted text-center py-xs">Aucune sous-catégorie</p>'}
          </div>
          ${footer}
        </div>`;
    }).join('');
  },

  _startEdit(catId) { this._editingCatId = catId; this.render(); },
  _stopEdit()       { this._editingCatId = null;  this.render(); },

  // ---- Renommage d'une catégorie, avec portée temporelle ----
  //
  // 4 portées (la date de transaction respecte le toggle comptable/effective) :
  //  • Toutes    : renommage simple, toutes les transactions migrent, rien ne se duplique.
  //  • Futures   : l'ancienne devient INACTIVE, la nouvelle (active) reçoit les futures.
  //  • Passées   : les transactions passées migrent vers la nouvelle (INACTIVE) ; l'ancienne reste active.
  //  • Période   : les transactions de la plage migrent ; les DEUX coexistent (aucune inactive),
  //                avec une mention « valable du… au… » sur chacune.
  _openRenameCat(catId) {
    const cat = Storage.getCategories().find(c => c.id === catId);
    if (!cat) return;
    Modal.open(`Renommer « ${cat.name} »`, `
      <form onsubmit="Categories._confirmRename(event,'${catId}')">
        <div class="form-group">
          <label>Nouveau nom</label>
          <input name="newname" class="form-input" required autofocus value="${cat.name}" style="width:100%">
        </div>
        <div class="form-group">
          <label>Appliquer le nouveau nom à :</label>
          <label class="rename-scope"><input type="radio" name="scope" value="all" checked> <span><strong>Toutes</strong> les transactions <small>— renommage simple, rien ne se duplique</small></span></label>
          <label class="rename-scope"><input type="radio" name="scope" value="future"> <span><strong>Uniquement les futures</strong> <small>— les passées gardent l'ancien nom</small></span></label>
          <label class="rename-scope"><input type="radio" name="scope" value="past"> <span><strong>Uniquement les passées</strong> <small>— les futures gardent l'ancien nom</small></span></label>
          <label class="rename-scope"><input type="radio" name="scope" value="period"> <span><strong>Sur une période</strong> <small>du</small> <input type="date" name="from"> <small>au</small> <input type="date" name="to"></span></label>
        </div>
        <p class="rename-hint">↪ Le découpage passé/futur utilise la date <strong>${Storage.getDateMode() === 'effective' ? 'effective' : 'comptable'}</strong> (réglable via le toggle de période).</p>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Appliquer</button>
        </div>
      </form>`);
  },

  _confirmRename(event, catId) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const newName = (fd.get('newname') || '').trim();
    const scope = fd.get('scope');
    const from = fd.get('from'), to = fd.get('to');
    if (scope === 'period' && (!from || !to)) { alert('Choisissez une date de début et de fin.'); return; }
    if (scope === 'period' && from > to)       { alert('La date de début doit précéder la date de fin.'); return; }
    this._applyRename(catId, newName, scope, from, to);
  },

  _applyRename(catId, newName, scope, from, to) {
    const cats = Storage.getCategories();
    const cat  = cats.find(c => c.id === catId);
    if (!cat) return;
    const oldName = cat.name;
    if (!newName || newName === oldName) { Modal.close(); return; }
    if (cats.some(c => c.id !== catId && c.name.toLowerCase() === newName.toLowerCase())) {
      alert('Une catégorie porte déjà ce nom.'); return;
    }

    const today    = new Date().toISOString().slice(0, 10);
    const fmt      = d => Utils.formatDate(d);
    const expenses = Storage.getExpenses();
    const revenues = Storage.getRevenues();
    const dt       = t => Utils.getExpenseDate(t); // respecte le toggle comptable/effective

    // Fusionne des anciens noms (alias) sans doublon ni le nom courant : l'import les
    // reconnaît (ex. un relevé étiqueté « Alimentation » après renommage en « Courses »).
    const nn = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const mergeAliases = (list, selfName) => {
      const out = [];
      list.forEach(a => {
        if (!a || nn(a) === nn(selfName) || out.some(x => nn(x) === nn(a))) return;
        out.push(a);
      });
      return out;
    };

    if (scope === 'all') {
      cat.aliases = mergeAliases([...(cat.aliases || []), oldName], newName);
      cat.name = newName;
      delete cat.obsolete; delete cat.versionNote;
      [expenses, revenues].forEach(arr => arr.forEach(t => { if (t.category === oldName) t.category = newName; }));
    } else {
      let inScope;
      if (scope === 'future')    inScope = t => dt(t) >= today;
      else if (scope === 'past') inScope = t => dt(t) <  today;
      else                       inScope = t => { const d = dt(t); return d >= from && d <= to; };

      // Réaffecte au nouveau nom les transactions DANS la portée.
      [expenses, revenues].forEach(arr => arr.forEach(t => { if (t.category === oldName && inScope(t)) t.category = newName; }));

      // Nouvelle catégorie (copie des sous-catégories) ; l'ancienne reste pour le hors-portée.
      const newCat = { id: 'cat_' + Date.now(), name: newName, subcategories: [...cat.subcategories] };
      delete cat.obsolete; delete cat.versionNote;

      if (scope === 'future') {
        cat.obsolete    = true;
        cat.versionNote = `Remplacée par « ${newName} » depuis le ${fmt(today)} — anciennes transactions`;
        newCat.versionNote = `Remplace « ${oldName} » depuis le ${fmt(today)}`;
        // L'ancien nom doit désormais router les imports vers la NOUVELLE catégorie active.
        newCat.aliases = mergeAliases([...(cat.aliases || []), oldName], newName);
        cat.aliases    = [];
      } else if (scope === 'past') {
        newCat.obsolete    = true;
        newCat.versionNote = `« ${oldName} » d'avant aujourd'hui, renommées — inactive pour les nouvelles`;
        cat.versionNote    = `Active · coexiste avec « ${newName} » (transactions passées renommées)`;
      } else { // période — aucune inactive
        newCat.versionNote = `Valable du ${fmt(from)} au ${fmt(to)}`;
        cat.versionNote    = `Valable hors du ${fmt(from)} – ${fmt(to)}`;
      }

      const idx = cats.findIndex(c => c.id === catId);
      cats.splice(idx + 1, 0, newCat);
    }

    Storage.saveCategories(cats);
    Storage.saveExpenses(expenses);
    Storage.saveRevenues(revenues);
    Modal.close();
    this.render();
    if (typeof Expenses !== 'undefined' && Expenses._populateCatFilter) Expenses._populateCatFilter();
  },

  _openAddSubcatModal(catId) {
    const cat = Storage.getCategories().find(c => c.id === catId);
    if (!cat) return;
    Modal.open(`Ajouter une sous-catégorie à "${cat.name}"`, `
      <form onsubmit="Categories._confirmAddSubcat(event,'${catId}')">
        <div class="form-group">
          <label>Nom de la sous-catégorie</label>
          <input name="subcat_name" required autofocus placeholder="ex: Boulangerie" style="width:100%">
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Ajouter</button>
        </div>
      </form>`);
  },

  _confirmAddSubcat(event, catId) {
    event.preventDefault();
    const name = new FormData(event.target).get('subcat_name').trim();
    if (!name) return;
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    if (cat.subcategories.includes(name)) { alert('Cette sous-catégorie existe déjà.'); return; }
    cat.subcategories.push(name);
    Storage.saveCategories(cats);
    Modal.close();
    this._editingCatId = catId;
    this.render();
  },

  // ---- Drag & Drop ----

  _dndStart(e, type, catId, subcatIdx) {
    if (e.cancelable) e.preventDefault();
    const isTouch = !!e.touches;
    const px = isTouch ? e.touches[0].clientX : e.clientX;
    const py = isTouch ? e.touches[0].clientY : e.clientY;

    const el = type === 'cat'
      ? e.currentTarget.closest('.category-card')
      : e.currentTarget.closest('.subcat-item');
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    clone.style.cssText = `position:fixed;z-index:9999;pointer-events:none;opacity:0.88;
      width:${rect.width}px;left:${rect.left}px;top:${rect.top}px;
      box-shadow:0 12px 32px rgba(0,0,0,0.22);transform:rotate(1.5deg);transition:none;`;
    document.body.appendChild(clone);
    el.classList.add('dnd-ghost');

    this._dnd = { type, catId, subcatIdx, el, clone,
      ox: px - rect.left, oy: py - rect.top, isTouch, dropInfo: null };

    const onMove = (e) => this._dndMove(e);
    const onEnd  = (e) => {
      this._dndEnd(e);
      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
      document.removeEventListener(isTouch ? 'touchend'  : 'mouseup',   onEnd);
    };
    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
    document.addEventListener(isTouch ? 'touchend'  : 'mouseup',   onEnd);
  },

  _dndMove(e) {
    if (!this._dnd) return;
    if (e.cancelable) e.preventDefault();
    const px = e.touches ? e.touches[0].clientX : e.clientX;
    const py = e.touches ? e.touches[0].clientY : e.clientY;
    const { clone, ox, oy } = this._dnd;
    clone.style.left = (px - ox) + 'px';
    clone.style.top  = (py - oy) + 'px';

    clone.style.display = 'none';
    const over = document.elementFromPoint(px, py);
    clone.style.display = '';

    document.querySelectorAll('.dnd-over, .dnd-over-after').forEach(el => {
      el.classList.remove('dnd-over', 'dnd-over-after');
    });

    if (!over) { this._dnd.dropInfo = null; return; }

    if (this._dnd.type === 'cat') {
      const card = over.closest('.category-card[data-cat-id]');
      if (card && card !== this._dnd.el) {
        const rect = card.getBoundingClientRect();
        const insertAfter = px >= rect.left + rect.width / 2;
        card.classList.add(insertAfter ? 'dnd-over-after' : 'dnd-over');
        this._dnd.dropInfo = { catId: card.dataset.catId, insertAfter };
      } else {
        this._dnd.dropInfo = null;
      }
    } else {
      const item = over.closest('.subcat-item[data-cat-id]');
      const list = over.closest('.subcat-list[data-cat-id]');
      if (item && item !== this._dnd.el) {
        const rect = item.getBoundingClientRect();
        const insertAfter = py >= rect.top + rect.height / 2;
        item.classList.add(insertAfter ? 'dnd-over-after' : 'dnd-over');
        this._dnd.dropInfo = {
          type: 'item', catId: item.dataset.catId,
          subcatIdx: parseInt(item.dataset.subcatIdx), insertAfter
        };
      } else if (list) {
        list.classList.add('dnd-over');
        this._dnd.dropInfo = { type: 'list', catId: list.dataset.catId };
      } else {
        this._dnd.dropInfo = null;
      }
    }
  },

  _dndEnd(e) {
    if (!this._dnd) return;
    const { type, catId, subcatIdx, el, clone, dropInfo } = this._dnd;

    clone.remove();
    el.classList.remove('dnd-ghost');
    document.querySelectorAll('.dnd-over, .dnd-over-after').forEach(el => {
      el.classList.remove('dnd-over', 'dnd-over-after');
    });
    this._dnd = null;

    if (!dropInfo) return;
    const cats = Storage.getCategories();

    if (type === 'cat') {
      const { catId: tgtId, insertAfter } = dropInfo;
      if (tgtId === catId) return;
      const si = cats.findIndex(c => c.id === catId);
      const [moved] = cats.splice(si, 1);
      let ti = cats.findIndex(c => c.id === tgtId);
      if (insertAfter) ti++;
      cats.splice(ti, 0, moved);

    } else {
      const srcCat = cats.find(c => c.id === catId);
      if (!srcCat) return;

      if (dropInfo.type === 'list') {
        const tgtCat = cats.find(c => c.id === dropInfo.catId);
        if (!tgtCat) return;
        const [movedSub] = srcCat.subcategories.splice(subcatIdx, 1);
        tgtCat.subcategories.push(movedSub);
      } else {
        const tgtCatId = dropInfo.catId;
        const tgtCat = cats.find(c => c.id === tgtCatId);
        if (!tgtCat) return;
        const [movedSub] = srcCat.subcategories.splice(subcatIdx, 1);
        let ti = dropInfo.subcatIdx;
        if (tgtCatId === catId && ti > subcatIdx) ti--;
        if (dropInfo.insertAfter) ti++;
        tgtCat.subcategories.splice(ti, 0, movedSub);
      }
    }

    Storage.saveCategories(cats);
    this.render();
  },

  // ---- CRUD ----

  openAddModal() {
    Modal.open('Nouvelle catégorie', `
      <form onsubmit="Categories._confirmAdd(event)">
        <div class="form-group">
          <label>Nom de la catégorie</label>
          <input name="cat_name" class="form-input" required autofocus placeholder="ex: Transport, Loisirs, Santé…">
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Créer la catégorie</button>
        </div>
      </form>`);
  },

  _confirmAdd(event) {
    event.preventDefault();
    const name = new FormData(event.target).get('cat_name').trim();
    if (!name) return;
    const cats = Storage.getCategories();
    if (cats.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      alert('Cette catégorie existe déjà.');
      return;
    }
    cats.push({ id: 'cat_' + Date.now(), name, subcategories: [] });
    Storage.saveCategories(cats);
    Modal.close();
    this.render();
    Expenses._populateCatFilter();
  },

  deleteCategory(id) {
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === id);
    if (!cat) return;
    if (!confirm(`Supprimer la catégorie "${cat.name}" et toutes ses sous-catégories ?`)) return;
    Storage.saveCategories(cats.filter(c => c.id !== id));
    this._editingCatId = null;
    this.render();
    Expenses._populateCatFilter();
  },

  addSubcat(catId) { this._openAddSubcatModal(catId); },

  deleteSubcat(catId, idx) {
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    cat.subcategories.splice(idx, 1);
    Storage.saveCategories(cats);
    this.render();
  },

  resetToDefaults() {
    if (!confirm('Réinitialiser toutes les catégories aux valeurs par défaut ?')) return;
    Storage.saveCategories([]);
    Storage.getCategories();
    this._editingCatId = null;
    this.render();
  },

  getCategoryNames() { return Storage.getCategories().map(c => c.name); },
  getSubcats(categoryName) {
    const cat = Storage.getCategories().find(c => c.name === categoryName);
    return cat ? cat.subcategories : [];
  },
};
