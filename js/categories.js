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
          <button class="btn-danger btn-sm btn-outline-danger" onclick="Categories.deleteCategory('${cat.id}')">Supprimer la catégorie</button>
          <button class="btn-primary btn-sm" onclick="Categories._stopEdit()">Terminer</button>
        </div>` : '';

      return `
        <div class="category-card${editing ? ' editing' : ''}" data-cat-id="${cat.id}" id="cat-${cat.id}">
          <div class="category-card-header">
            <span class="cat-drag-handle" onmousedown="Categories._dndStart(event,'cat','${cat.id}',null)" ontouchstart="Categories._dndStart(event,'cat','${cat.id}',null)">⠿</span>
            <h3>${cat.name}</h3>
            ${!editing ? `<button class="cat-edit-btn" onclick="Categories._startEdit('${cat.id}')">Modifier</button>` : `<button class="cat-edit-btn active" onclick="Categories._stopEdit()">Terminer</button>`}
          </div>
          <div class="subcat-list" data-cat-id="${cat.id}">
            ${subcatRows || '<p class="text-muted text-center py-xs">Aucune sous-catégorie</p>'}
          </div>
          ${footer}
        </div>`;
    }).join('');
  },

  _startEdit(catId) { this._editingCatId = catId; this.render(); },
  _stopEdit()       { this._editingCatId = null;  this.render(); },

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
      ox: px - rect.left, oy: py - rect.top, isTouch };

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
    if (!over) return;

    if (this._dnd.type === 'cat') {
      const card = over.closest('.category-card[data-cat-id]');
      if (card && card !== this._dnd.el) {
        const rect = card.getBoundingClientRect();
        // Avant ou après selon la moitié verticale
        card.classList.add(py < rect.top + rect.height / 2 ? 'dnd-over' : 'dnd-over-after');
      }
    } else {
      const item = over.closest('.subcat-item[data-cat-id]');
      const list = over.closest('.subcat-list[data-cat-id]');
      if (item && item !== this._dnd.el) item.classList.add('dnd-over');
      else if (list) list.classList.add('dnd-over');
    }
  },

  _dndEnd(e) {
    if (!this._dnd) return;
    const px = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const py = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const { type, catId, subcatIdx, el, clone } = this._dnd;

    clone.style.display = 'none';
    const over = document.elementFromPoint(px, py);
    clone.style.display = '';

    clone.remove();
    el.classList.remove('dnd-ghost');

    // Lire le flag avant/après avant de nettoyer
    let insertAfter = false;
    if (over) {
      const tgtCard = over.closest('.category-card[data-cat-id]');
      if (tgtCard) insertAfter = tgtCard.classList.contains('dnd-over-after');
    }
    document.querySelectorAll('.dnd-over, .dnd-over-after').forEach(el => {
      el.classList.remove('dnd-over', 'dnd-over-after');
    });
    this._dnd = null;

    if (!over) return;
    const cats = Storage.getCategories();

    if (type === 'cat') {
      const tgtCard = over.closest('.category-card[data-cat-id]');
      if (!tgtCard) return;
      const tgtId = tgtCard.dataset.catId;
      if (tgtId === catId) return;

      // Retirer la source
      const si = cats.findIndex(c => c.id === catId);
      const [moved] = cats.splice(si, 1);
      // Recalculer l'index cible après le retrait (insert correct)
      let ti = cats.findIndex(c => c.id === tgtId);
      if (insertAfter) ti++;
      cats.splice(ti, 0, moved);

    } else {
      const tgtItem = over.closest('.subcat-item[data-cat-id]');
      const tgtList = over.closest('.subcat-list[data-cat-id]');
      const tgtCatId = tgtItem?.dataset.catId ?? tgtList?.dataset.catId;
      if (!tgtCatId) return;

      const srcCat = cats.find(c => c.id === catId);
      const tgtCat = cats.find(c => c.id === tgtCatId);
      if (!srcCat || !tgtCat) return;

      const [movedSub] = srcCat.subcategories.splice(subcatIdx, 1);

      if (tgtItem) {
        let ti = parseInt(tgtItem.dataset.subcatIdx);
        if (tgtCatId === catId && ti > subcatIdx) ti--;
        tgtCat.subcategories.splice(ti, 0, movedSub);
      } else {
        tgtCat.subcategories.push(movedSub);
      }
    }

    Storage.saveCategories(cats);
    this.render();
  },

  // ---- CRUD ----

  addCategory() {
    const input = document.getElementById('new-category-input');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    const cats = Storage.getCategories();
    if (cats.find(c => c.name.toLowerCase() === name.toLowerCase())) { alert('Cette catégorie existe déjà.'); return; }
    cats.push({ id: 'cat_' + Date.now(), name, subcategories: [] });
    Storage.saveCategories(cats);
    input.value = '';
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
