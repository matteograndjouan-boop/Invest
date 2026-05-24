const Utils = {
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  },

  formatPercent(value) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${(value || 0).toFixed(2)}%`;
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    return new Intl.DateTimeFormat('fr-FR').format(new Date(dateStr + 'T00:00:00'));
  },

  getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  },

  getMonthLabel(yearMonth) {
    const [year, month] = yearMonth.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' }).format(date);
  },

  getLast12Months() {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  },

  getExpenseMonth(expense) {
    return expense.date.substring(0, 7);
  },

  INVESTMENT_TYPES: {
    action: 'Action',
    etf: 'ETF',
    crypto: 'Crypto',
    immobilier: 'Immobilier',
    obligations: 'Obligations',
    autre: 'Autre',
  },

  EXPENSE_CATEGORIES: [
    'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
    'Vêtements', 'Éducation', 'Restaurants', 'Abonnements', 'Épargne', 'Autre',
  ],

  PATRIMONY_CATEGORIES: {
    actif: ['Liquidités', 'Investissements', 'Immobilier', 'Véhicule', 'Autre actif'],
    passif: ['Crédit immobilier', 'Crédit auto', 'Prêt personnel', 'Dettes', 'Autre passif'],
  },

  TYPE_COLORS: {
    action: '#6366f1',
    etf: '#8b5cf6',
    crypto: '#ec4899',
    immobilier: '#f59e0b',
    obligations: '#10b981',
    autre: '#6b7280',
  },

  CATEGORY_COLORS: [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
    '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#84cc16', '#a855f7',
  ],
};
