const Categories = {
  render() {
    const cats = Storage.getCategories();
    const container = document.getElementById('categories-container');
    if (!container) return;

    if (!cats.length) {
      container.innerHTML = '<p class="text-muted text-center py-lg">Aucune catégorie. Créez-en une !</p>';
      return;
    }

    container.innerHTML = cats.map(cat => {
      const subcatRows = cat.subcategories.map((sub, idx) => `
        <div class="subcat-item">
          <span>${sub}</span>
          <button class="btn-icon btn-danger" onclick="Categories.deleteSubcat('${cat.id}', ${idx})" title="Supprimer">🗑️</button>
        </div>`).join('');

      return `
        <div class="category-card" id="cat-${cat.id}">
          <div class="category-card-header">
            <h3>${cat.name}</h3>
            <button class="btn-icon btn-danger" onclick="Categories.deleteCategory('${cat.id}')" title="Supprimer la catégorie">🗑️</button>
          </div>
          <div class="subcat-list">
            ${subcatRows || '<p class="text-muted text-center py-xs">Aucune sous-catégorie</p>'}
          </div>
          <div class="subcat-add-row">
            <input type="text" id="subcat-input-${cat.id}" placeholder="Nouvelle sous-catégorie…" class="subcat-input" onkeydown="if(event.key==='Enter'){event.preventDefault();Categories.addSubcat('${cat.id}')}">
            <button class="btn-primary btn-sm" onclick="Categories.addSubcat('${cat.id}')">+ Ajouter</button>
          </div>
        </div>`;
    }).join('');
  },

  addCategory() {
    const input = document.getElementById('new-category-input');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    const cats = Storage.getCategories();
    if (cats.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      alert('Cette catégorie existe déjà.');
      return;
    }

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
    this.render();
    Expenses._populateCatFilter();
  },

  addSubcat(catId) {
    const input = document.getElementById(`subcat-input-${catId}`);
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    if (cat.subcategories.includes(name)) {
      alert('Cette sous-catégorie existe déjà.');
      return;
    }

    cat.subcategories.push(name);
    Storage.saveCategories(cats);
    input.value = '';
    this.render();
  },

  deleteSubcat(catId, idx) {
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    cat.subcategories.splice(idx, 1);
    Storage.saveCategories(cats);
    this.render();
  },

  resetToDefaults() {
    if (!confirm('Réinitialiser toutes les catégories aux valeurs par défaut ? Vos catégories personnalisées seront supprimées.')) return;
    Storage.saveCategories([]);
    const defaults = Storage.getCategories(); // re-déclenche _defaultCategories()
    this.render();
  },

  getCategoryNames() {
    return Storage.getCategories().map(c => c.name);
  },

  getSubcats(categoryName) {
    const cat = Storage.getCategories().find(c => c.name === categoryName);
    return cat ? cat.subcategories : [];
  },
};
