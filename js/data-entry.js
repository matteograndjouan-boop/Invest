const DataEntry = {
  _sortCol: 'date',
  _sortDir: -1,
  _selectionMode: false,
  _selected: new Set(), // "id|type" strings
  _filteredRows: [],
  _isDragging: false,

  init() {
    const search = document.getElementById('donnees-search');
    const typeFilter = document.getElementById('donnees-filter-type');
    const catFilter = document.getElementById('donnees-filter-cat');
    if (search) search.addEventListener('input', () => this.render());
    if (typeFilter) typeFilter.addEventListener('change', () => this.render());
    if (catFilter) catFilter.addEventListener('change', () => this.render());

    document.querySelectorAll('#donnees-table .sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (this._sortCol === col) this._sortDir *= -1;
        else { this._sortCol = col; this._sortDir = -1; }
        this.render();
      });
    });

    // End drag on mouseup anywhere
    document.addEventListener('mouseup', () => { this._isDragging = false; });

    this._populateCatFilter();
  },

  _populateCatFilter() {
    const catFilter = document.getElementById('donnees-filter-cat');
    if (!catFilter) return;
    catFilter.innerHTML = '<option value="">Toutes catégories</option>';
    Storage.getCategories().forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name; opt.textContent = cat.name;
      catFilter.appendChild(opt);
    });
  },

  toggleSelectionMode() {
    this._selectionMode = !this._selectionMode;
    this._selected.clear();
    this._isDragging = false;
    this._updateHeaderButtons();
    this.render();
  },

  _updateHeaderButtons() {
    const actions = document.getElementById('donnees-header-actions');
    if (!actions) return;
    const n = this._selected.size;
    const total = this._filteredRows.length;
    if (this._selectionMode) {
      actions.innerHTML = `
        <button class="btn-primary" id="add-donnees-btn" style="display:none"></button>
        <button class="btn-secondary btn-sm" onclick="DataEntry.toggleSelectionMode()">✕ Annuler</button>
        <button class="btn-secondary btn-sm" onclick="DataEntry.deleteAll()" id="donnees-delete-all-btn">Tout supprimer (${total})</button>
        <button class="btn-danger btn-sm" id="donnees-delete-sel-btn" ${n === 0 ? 'disabled' : ''} onclick="DataEntry.deleteSelected()">
          ${n > 0 ? `Supprimer ${n} ligne${n > 1 ? 's' : ''}` : 'Sélectionnez des lignes'}
        </button>`;
    } else {
      actions.innerHTML = `
        <button class="btn-primary" id="add-donnees-btn">+ Ajouter une ligne</button>
        <button class="btn-secondary" id="donnees-delete-mode-btn" onclick="DataEntry.toggleSelectionMode()">🗑️ Supprimer</button>`;
      // Re-bind add button
      document.getElementById('add-donnees-btn')?.addEventListener('click', () => this.openAddForm());
    }
  },

  _onRowMousedown(key, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    this._isDragging = true;
    this._toggleKey(key);
  },

  _onRowMouseenter(key) {
    if (!this._isDragging) return;
    this._selected.add(key);
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

  render() {
    const search = (document.getElementById('donnees-search')?.value || '').toLowerCase().trim();
    const typeFilter = document.getElementById('donnees-filter-type')?.value || '';
    const catFilter = document.getElementById('donnees-filter-cat')?.value || '';

    const expenses = Storage.getExpenses().map(e => ({ ...e, _type: 'expense' }));
    const revenues = Storage.getRevenues().map(r => ({ ...r, _type: 'revenue' }));
    let rows = [...expenses, ...revenues];

    if (typeFilter === 'expense') rows = rows.filter(r => r._type === 'expense');
    else if (typeFilter === 'revenue') rows = rows.filter(r => r._type === 'revenue');
    if (catFilter) rows = rows.filter(r => r.category === catFilter);
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
    if (thActions) thActions.style.display = this._selectionMode ? 'none' : '';

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
      const catBadge = `<span class="badge badge-category">${row.category || '—'}</span>`;
      const subcatBadge = row.subcategory ? `<span class="badge badge-subcategory">${row.subcategory}</span>` : '<span class="text-muted">—</span>';
      const amountClass = isExpense ? 'negative' : 'positive';
      const actionsTd = sel ? '' : `<td class="actions-cell">
        <button class="btn-icon" onclick="DataEntry.edit('${row.id}','${row._type}')" title="Modifier">✏️</button>
        <button class="btn-icon btn-icon-danger" onclick="DataEntry.delete('${row.id}','${row._type}');event.stopPropagation()" title="Supprimer">🗑️</button>
      </td>`;

      return `<tr class="donnees-row${isSelected ? ' selected' : ''}${sel ? ' selectable' : ''}" data-key="${key}"
        ${sel ? `onmousedown="DataEntry._onRowMousedown('${key}',event)" onmouseenter="DataEntry._onRowMouseenter('${key}')"` : ''}>
        <td class="donnees-date">${Utils.formatDate(row.date)}</td>
        <td>${typeBadge}</td>
        <td class="donnees-desc">${row.description || '—'}</td>
        <td>${catBadge}</td>
        <td>${subcatBadge}</td>
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

    const cats = Storage.getCategories();
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
            <select name="entry_type" onchange="DataEntry._toggleTypeFields(this.value)">
              <option value="expense" ${type === 'expense' ? 'selected' : ''}>Dépense</option>
              <option value="revenue" ${type === 'revenue' ? 'selected' : ''}>Revenu</option>
            </select>
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
            <label>Date *</label>
            <input name="date" type="date" required value="${item?.date || today}">
          </div>
          <div class="form-group" id="de-cat-group">
            <label>Catégorie *</label>
            <select name="category" required onchange="DataEntry._updateSubcats(this.value)">${catOptions}</select>
          </div>
          <div class="form-group" id="de-rev-cat-group" style="display:none">
            <label>Catégorie (revenu) *</label>
            <select name="rev_category">${revCats}</select>
          </div>
          <div class="form-group" id="de-subcat-group">
            <label>Sous-catégorie</label>
            <select name="subcategory" id="de-subcat-select" ${!subcats.length ? 'disabled' : ''}>${subcatOptions}</select>
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
    const sel = document.getElementById('de-subcat-select');
    if (!sel) return;
    const subcats = Categories.getSubcats(catName);
    if (subcats.length) {
      sel.disabled = false;
      sel.innerHTML = ['', ...subcats].map(s => `<option value="${s}">${s || '—'}</option>`).join('');
    } else {
      sel.disabled = true;
      sel.innerHTML = '<option value="">—</option>';
    }
  },

  save(event, id, originalType) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const newType = fd.get('entry_type');
    const isRevenue = newType === 'revenue';

    const data = {
      id: id || Utils.generateId(),
      description: fd.get('description').trim(),
      amount: parseFloat(fd.get('amount')),
      category: isRevenue ? fd.get('rev_category') : fd.get('category'),
      subcategory: isRevenue ? '' : (fd.get('subcategory') || ''),
      date: fd.get('date'),
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
