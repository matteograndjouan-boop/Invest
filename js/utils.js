const Utils = {
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // Builds a month+year two-select picker. value = 'YYYY-MM' or ''
  monthYearPicker(value) {
    const MFR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const now = new Date();
    const parts = (value || '').split('-');
    const selYear = parts[0] ? parseInt(parts[0]) : null;
    const selMonth = parts[1] ? parseInt(parts[1]) : null;
    const monthOpts = MFR.map((m, i) => {
      const v = String(i + 1).padStart(2, '0');
      return `<option value="${v}" ${selMonth === i + 1 ? 'selected' : ''}>${m}</option>`;
    }).join('');
    const yearOpts = [];
    for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 3; y++) {
      yearOpts.push(`<option value="${y}" ${selYear === y ? 'selected' : ''}>${y}</option>`);
    }
    return `<div class="month-year-picker">
      <select name="effectiveMonth"><option value="">Mois</option>${monthOpts}</select>
      <select name="effectiveYear"><option value="">Année</option>${yearOpts.join('')}</select>
    </div>`;
  },

  // Reads effectiveDate from FormData (effectiveMonth + effectiveYear)
  getEffectiveDateFromForm(fd) {
    const m = fd.get('effectiveMonth') || '';
    const y = fd.get('effectiveYear') || '';
    return m && y ? `${y}-${m}` : '';
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

  // Returns the date to use for period filtering based on date mode setting
  getExpenseDate(expense) {
    if (Storage.getDateMode() === 'effective' && expense.effectiveDate) {
      const ed = expense.effectiveDate;
      // YYYY-MM format → treat as first day of the month for range comparisons
      return ed.length === 7 ? ed + '-01' : ed;
    }
    return expense.date;
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

  INVESTMENT_ACCOUNTS: {
    pea: 'PEA',
    assurance_vie: 'Assurance vie',
    cto: 'CTO',
    pee: 'PEE',
    autre: 'Autre',
  },

  ACCOUNT_COLORS: {
    pea:            '#6366f1',
    assurance_vie:  '#8b5cf6',
    cto:            '#3b82f6',
    pee:            '#06b6d4',
    autre:          '#10b981',
  },

  EXPENSE_CATEGORIES: [
    'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
    'Vêtements', 'Éducation', 'Restaurants', 'Abonnements', 'Épargne', 'Autre',
  ],

  REVENUE_CATEGORIES: [
    'Salaire', 'Freelance', 'Remboursement', 'Loyer perçu', 'Autre',
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
