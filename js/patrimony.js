const Patrimony = {
  render() {
    const items = Storage.getPatrimony();
    const investments = Storage.getInvestments();
    const investValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const manualAssets = items.filter(i => i.type === 'actif');
    const liabilities = items.filter(i => i.type === 'passif');
    const totalAssets = manualAssets.reduce((s, i) => s + i.value, 0) + investValue;
    const totalLiab = liabilities.reduce((s, i) => s + i.value, 0);
    const netWorth = totalAssets - totalLiab;

    document.getElementById('pat-assets').textContent = Utils.formatCurrency(totalAssets);
    document.getElementById('pat-liabilities').textContent = Utils.formatCurrency(totalLiab);
    const nwEl = document.getElementById('pat-net-worth');
    nwEl.textContent = Utils.formatCurrency(netWorth);
    nwEl.className = 'kpi-value ' + (netWorth >= 0 ? 'positive' : 'negative');
    document.getElementById('pat-assets-sum').textContent = Utils.formatCurrency(totalAssets);
    document.getElementById('pat-liabilities-sum').textContent = Utils.formatCurrency(totalLiab);

    this._renderList('patrimony-assets-list', manualAssets, investValue);
    this._renderList('patrimony-liabilities-list', liabilities, 0, true);

    const chartAssets = [...manualAssets.map(a => ({ category: a.category, value: a.value }))];
    if (investValue > 0) chartAssets.push({ category: 'Portefeuille', value: investValue });
    Charts.patrimony(chartAssets, liabilities);
  },

  _renderList(containerId, items, investValue, isLiability = false) {
    const container = document.getElementById(containerId);
    let html = '';

    if (!isLiability && investValue > 0) {
      html += `
        <div class="pat-item pat-auto">
          <div class="pat-item-info">
            <span class="pat-item-name">📈 Portefeuille d'investissements</span>
            <span class="badge badge-category">Auto</span>
          </div>
          <span class="pat-item-value positive">${Utils.formatCurrency(investValue)}</span>
        </div>`;
    }

    html += items.map(item => `
      <div class="pat-item">
        <div class="pat-item-info">
          <span class="pat-item-name">${item.name}</span>
          <span class="badge badge-category">${item.category}</span>
        </div>
        <div class="pat-item-actions">
          <span class="pat-item-value ${isLiability ? 'negative' : ''}">${Utils.formatCurrency(item.value)}</span>
          <button class="btn-icon" onclick="Patrimony.edit('${item.id}')" title="Modifier">✏️</button>
          <button class="btn-icon btn-danger" onclick="Patrimony.delete('${item.id}')" title="Supprimer">${Utils.ICON_TRASH}</button>
        </div>
      </div>`).join('');

    container.innerHTML = html || '<p class="text-muted text-center py-sm">Aucun élément</p>';
  },

  openAddForm() { Modal.open('Ajouter un élément patrimonial', this._form(null)); },

  edit(id) {
    const item = Storage.getPatrimony().find(i => i.id === id);
    if (item) Modal.open("Modifier l'élément", this._form(item));
  },

  _form(item) {
    const isEdit = !!item;
    const type = item?.type || 'actif';
    const catOptions = (t) => Utils.PATRIMONY_CATEGORIES[t]
      .map(c => `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${c}</option>`).join('');

    return `
      <form onsubmit="Patrimony.save(event, ${isEdit ? `'${item.id}'` : 'null'})">
        <div class="form-grid">
          <div class="form-group form-full"><label>Nom *</label><input name="name" required value="${item?.name || ''}" placeholder="ex: Résidence principale"></div>
          <div class="form-group">
            <label>Type *</label>
            <select name="type" required onchange="Patrimony._updateCats(this.value)">
              <option value="actif" ${type === 'actif' ? 'selected' : ''}>Actif</option>
              <option value="passif" ${type === 'passif' ? 'selected' : ''}>Passif</option>
            </select>
          </div>
          <div class="form-group">
            <label>Catégorie *</label>
            <select name="category" id="pat-cat-select" required>${catOptions(type)}</select>
          </div>
          <div class="form-group"><label>Valeur (€) *</label><input name="value" type="number" step="0.01" min="0" required value="${item?.value || ''}"></div>
          <div class="form-group form-full"><label>Notes</label><textarea name="notes" rows="2">${item?.notes || ''}</textarea></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Modifier' : 'Ajouter'}</button>
        </div>
      </form>`;
  },

  _updateCats(type) {
    const sel = document.getElementById('pat-cat-select');
    if (!sel) return;
    sel.innerHTML = Utils.PATRIMONY_CATEGORIES[type]
      .map(c => `<option value="${c}">${c}</option>`).join('');
  },

  save(event, id) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const data = {
      id: id || Utils.generateId(),
      name: fd.get('name').trim(),
      type: fd.get('type'),
      category: fd.get('category'),
      value: parseFloat(fd.get('value')),
      notes: (fd.get('notes') || '').trim(),
    };
    const list = Storage.getPatrimony();
    if (id) { const idx = list.findIndex(i => i.id === id); if (idx !== -1) list[idx] = data; }
    else list.push(data);
    Storage.savePatrimony(list);
    Modal.close();
    this.render();
    Dashboard.render();
  },

  delete(id) {
    if (!confirm('Supprimer cet élément ?')) return;
    Storage.savePatrimony(Storage.getPatrimony().filter(i => i.id !== id));
    this.render();
    Dashboard.render();
  },
};
