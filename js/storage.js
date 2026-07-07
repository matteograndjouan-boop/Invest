const Storage = {
  KEYS: {
    INVESTMENTS: 'invest_investments',
    EXPENSES: 'invest_expenses',
    BUDGETS: 'invest_budgets',
    PATRIMONY: 'invest_patrimony',
    REVENUES: 'invest_revenues',
    CATEGORIES: 'invest_categories_v2',
    BUDGET_THEMES: 'invest_budgets_v2',
    DATE_MODE: 'invest_date_mode',
    PORTFOLIO_HISTORY: 'invest_portfolio_history',
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

  // Historique de la valeur totale du portefeuille : [{date:'YYYY-MM-DD', value}], un point par
  // jour (écrasé si on revisite le même jour) — alimenté par Investments._recordSnapshot à chaque
  // visite de la Vue globale, pour construire progressivement la courbe d'évolution.
  getPortfolioHistory() { return this.get(this.KEYS.PORTFOLIO_HISTORY) || []; },
  savePortfolioHistory(data) { this.set(this.KEYS.PORTFOLIO_HISTORY, data); },

  getExpenses() { return this.get(this.KEYS.EXPENSES) || []; },
  saveExpenses(data) { this.set(this.KEYS.EXPENSES, data); },

  getBudgets() { return this.get(this.KEYS.BUDGETS) || {}; },
  saveBudgets(data) { this.set(this.KEYS.BUDGETS, data); },

  getBudgetThemes() { return this.get(this.KEYS.BUDGET_THEMES) || []; },
  saveBudgetThemes(data) { this.set(this.KEYS.BUDGET_THEMES, data); },

  getPatrimony() { return this.get(this.KEYS.PATRIMONY) || []; },
  savePatrimony(data) { this.set(this.KEYS.PATRIMONY, data); },

  getRevenues() { return this.get(this.KEYS.REVENUES) || []; },
  saveRevenues(data) { this.set(this.KEYS.REVENUES, data); },

  _defaultCategories() {
    const data = [
      { name: 'Abonnements',  subcategories: ['Internet', 'Téléphone', 'Youtube'] },
      { name: 'Alimentation', subcategories: ['Boulangerie', 'Courses', 'Izly', 'Resto'] },
      { name: 'Divers',       subcategories: ['Autre', 'Frais bancaires'] },
      { name: 'Epargne',      subcategories: ['Bourso', 'Garance', 'Green Got'] },
      { name: 'Logement',     subcategories: ['Loyer Paris', 'Airbnb Reims'] },
      { name: 'Loisir',       subcategories: ['Sport', 'Culture'] },
      { name: 'Revenus',      subcategories: ['CAF', 'Famille', 'Opmobility', 'Ticket Resto', 'Autre'] },
      { name: 'Santé',        subcategories: ['Médecin', 'Pharmacie', 'CPAM'] },
      { name: 'Shopping',     subcategories: ['Electronique', 'Maison', 'Vêtements'] },
      { name: 'Transport',    subcategories: ['Bus', 'Train', 'Tram'] },
    ];
    return data.map((c, i) => ({ id: 'dcat' + i, ...c }));
  },

  getDateMode() { return this.get(this.KEYS.DATE_MODE) || 'transaction'; },
  setDateMode(mode) { this.set(this.KEYS.DATE_MODE, mode); },

  getCategories() {
    const saved = this.get(this.KEYS.CATEGORIES);
    if (saved && saved.length > 0) return saved;
    const defaults = this._defaultCategories();
    this.saveCategories(defaults);
    return defaults;
  },
  saveCategories(data) { this.set(this.KEYS.CATEGORIES, data); },

  // Catégories proposées pour les NOUVELLES transactions (saisie/import) : exclut les
  // versions devenues obsolètes après un renommage à portée (futures/passées).
  // Les obsolètes restent dans getCategories() pour l'affichage des anciennes données.
  getActiveCategories() { return this.getCategories().filter(c => !c.obsolete); },

  exportAll() {
    return {
      investments: this.getInvestments(),
      expenses: this.getExpenses(),
      budgets: this.getBudgets(),
      budgetThemes: this.getBudgetThemes(),
      patrimony: this.getPatrimony(),
      revenues: this.getRevenues(),
      categories: this.getCategories(),
      portfolioHistory: this.getPortfolioHistory(),
      exportDate: new Date().toISOString(),
    };
  },

  importAll(data) {
    if (data.investments) this.saveInvestments(data.investments);
    if (data.expenses) this.saveExpenses(data.expenses);
    if (data.budgets) this.saveBudgets(data.budgets);
    if (data.budgetThemes) this.saveBudgetThemes(data.budgetThemes);
    if (data.patrimony) this.savePatrimony(data.patrimony);
    if (data.revenues) this.saveRevenues(data.revenues);
    if (data.categories) this.saveCategories(data.categories);
    if (data.portfolioHistory) this.savePortfolioHistory(data.portfolioHistory);
  },
};
