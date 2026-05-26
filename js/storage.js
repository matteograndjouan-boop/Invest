const Storage = {
  KEYS: {
    INVESTMENTS: 'invest_investments',
    EXPENSES: 'invest_expenses',
    BUDGETS: 'invest_budgets',
    PATRIMONY: 'invest_patrimony',
    REVENUES: 'invest_revenues',
    CATEGORIES: 'invest_categories',
  },

  get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage write error:', e);
    }
  },

  getInvestments() { return this.get(this.KEYS.INVESTMENTS) || []; },
  saveInvestments(data) { this.set(this.KEYS.INVESTMENTS, data); },

  getExpenses() { return this.get(this.KEYS.EXPENSES) || []; },
  saveExpenses(data) { this.set(this.KEYS.EXPENSES, data); },

  getBudgets() { return this.get(this.KEYS.BUDGETS) || {}; },
  saveBudgets(data) { this.set(this.KEYS.BUDGETS, data); },

  getPatrimony() { return this.get(this.KEYS.PATRIMONY) || []; },
  savePatrimony(data) { this.set(this.KEYS.PATRIMONY, data); },

  getRevenues() { return this.get(this.KEYS.REVENUES) || []; },
  saveRevenues(data) { this.set(this.KEYS.REVENUES, data); },

  _defaultCategories() {
    return ['Logement','Alimentation','Transport','Santé','Loisirs','Vêtements','Éducation','Restaurants','Abonnements','Épargne','Autre']
      .map((name, i) => ({ id: 'dcat' + i, name, subcategories: [] }));
  },
  getCategories() {
    const saved = this.get(this.KEYS.CATEGORIES);
    if (saved && saved.length > 0) return saved;
    const defaults = this._defaultCategories();
    this.saveCategories(defaults);
    return defaults;
  },
  saveCategories(data) { this.set(this.KEYS.CATEGORIES, data); },

  exportAll() {
    return {
      investments: this.getInvestments(),
      expenses: this.getExpenses(),
      budgets: this.getBudgets(),
      patrimony: this.getPatrimony(),
      revenues: this.getRevenues(),
      categories: this.getCategories(),
      exportDate: new Date().toISOString(),
    };
  },

  importAll(data) {
    if (data.investments) this.saveInvestments(data.investments);
    if (data.expenses) this.saveExpenses(data.expenses);
    if (data.budgets) this.saveBudgets(data.budgets);
    if (data.patrimony) this.savePatrimony(data.patrimony);
    if (data.revenues) this.saveRevenues(data.revenues);
    if (data.categories) this.saveCategories(data.categories);
  },
};
