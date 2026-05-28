const DataEntry = {
  _sortCol: 'date',
  _sortDir: -1, // -1 = desc, 1 = asc

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

    // Sort
    rows.sort((a, b) => {
      let va = a[this._sortCol] ?? '';
      let vb = b[this._sortCol] ?? '';
      if (this._sortCol === 'amount') { va = Number(va); vb = Number(vb); }
      else { va = String(va); vb = String(vb); }
      return va < vb ? -this._sortDir : va > vb ? this._sortDir : 0;
    });

    // Update sort icons
    document.querySelectorAll('#donnees-table .sortable').forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = th.dataset.col === this._sortCol ? (this._sortDir === -1 ? '↓' : '↑') : '↕';
    });

    const countEl = document.getElementById('donnees-count');
    if (countEl) countEl.textContent = `${rows.length} ligne${rows.length > 1 ? 's' : ''}`;

    const tbody = document.getElementById('donnees-tbody');
    const empty = document.getElementById('donnees-empty');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    tbody.innerHTML = rows.map(row => {
      const isExpense = row._type === 'expense';
      const typeBadge = isExpense
        ? '<span class="badge badge-expense-type">Dépense</span>'
        : '<span class="badge badge-revenue-type">Revenu</span>';
      const catBadge = `<span class="badge badge-category">${row.category || '—'}</span>`;
      const subcatBadge = row.subcategory ? `<span class="badge badge-subcategory">${row.subcategory}</span>` : '<span class="text-muted">—</span>';
      const amountClass = isExpense ? 'negative' : 'positive';

      return `<tr class="donnees-row">
        <td class="donnees-date">${Utils.formatDate(row.date)}</td>
        <td>${typeBadge}</td>
        <td class="donnees-desc">${row.description || '—'}</td>
        <td>${catBadge}</td>
        <td>${subcatBadge}</td>
        <td class="text-right"><strong class="${amountClass}">${Utils.formatCurrency(row.amount)}</strong></td>
        <td class="actions-cell">
          <button class="btn-icon" onclick="DataEntry.edit('${row.id}','${row._type}')" title="Modifier">✏️</button>
          <button class="btn-icon btn-danger" onclick="DataEntry.delete('${row.id}','${row._type}')" title="Supprimer">🗑️</button>
        </td>
      </tr>`;
    }).join('');
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
      catGroup.style.display = 'none';
      revCatGroup.style.display = '';
      subcatGroup.style.display = 'none';
    } else {
      catGroup.style.display = '';
      revCatGroup.style.display = 'none';
      subcatGroup.style.display = '';
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

    // If type changed, delete from old list
    if (id && originalType !== newType) {
      if (originalType === 'expense') Storage.saveExpenses(Storage.getExpenses().filter(e => e.id !== id));
      else Storage.saveRevenues(Storage.getRevenues().filter(r => r.id !== id));
      data.id = Utils.generateId(); // new id to avoid collision
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
