const Utils = {
  // Icône poubelle unique (trait, pas d'emoji) — tous les boutons "supprimer" de l'app la
  // partagent, pour une apparence homogène quel que soit l'écran/la police d'emoji.
  // width/height explicites (16px) en plus du viewBox : un <svg> sans attribut de taille
  // dans une chaîne HTML brute se comporte comme un <img> sans dimensions et peut s'afficher
  // énorme (fallback navigateur ~300×150) tant qu'aucune règle CSS locale ne le contraint.
  ICON_TRASH: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',

  // Une transaction ne compte comme une vraie "dépense" que si sa catégorie est de type
  // 'expense' (Categories._catType) — Revenus/Épargne (revenue/investment) n'en sont jamais,
  // même si un enregistrement existe techniquement dans invest_expenses (import bancaire,
  // saisie manuelle...). Catégorie introuvable (supprimée) -> true, comportement historique.
  isExpenseCategory(name) {
    const cat = Storage.getCategories().find(c => c.name === name);
    return cat ? Categories._catType(cat) === 'expense' : true;
  },

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

  // Palette des catégories : uniquement 4 teintes (+ nuances), le vert et le rouge sont
  // réservés aux revenus/dépenses/tendances (voir --success/--danger) et ne doivent jamais
  // servir à distinguer des catégories. Entrelacée par teinte (bleu/orange/violet/cyan) plutôt
  // que groupée par nuance, pour que deux catégories consécutives (positions voisines dans
  // Storage.getCategories()) ne partagent quasiment jamais la même famille de couleur.
  CATEGORY_COLORS: [
    '#3b82f6', '#d97706', '#8b5cf6', '#06b6d4', // bleu / orange / violet / cyan
    '#60a5fa', '#f59e0b', '#a78bfa', '#22d3ee', // …clairs
    '#2563eb', '#b45309', '#7c3aed', '#0891b2', // …foncés
    '#1d4ed8', '#fbbf24', '#6d28d9', '#0e7490', // …extrêmes
  ],

  CATEGORY_COLOR_OTHER: '#6b7280',

  // Palette générique par RANG (pas par identité de catégorie) réservée aux positions d'un
  // portefeuille (Investments._renderAccountAllocation / Charts.accountAllocation) — distincte
  // de CATEGORY_COLORS pour que la refonte des couleurs de catégories n'affecte pas l'onglet
  // Investissements (ancienne palette conservée telle quelle).
  POSITION_COLORS: [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
    '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#84cc16', '#a855f7',
  ],

  // Couleur stable par IDENTITÉ de catégorie (sa position fixe dans Storage.getCategories()),
  // jamais par rang/montant/ordre d'apparition — sinon une même catégorie changerait de couleur
  // d'une vue ou d'une période à l'autre. Seule source de vérité pour la couleur d'une catégorie,
  // partagée par tout l'app (Flux, Catégories, Comparaisons, Dépenses/Revenus...).
  // « Autres »/« Autre » (bucket agrégé de certains graphiques, n'existe pas comme vraie
  // catégorie) reçoit un gris neutre dédié plutôt que de retomber arbitrairement sur la 1re.
  getCategoryColor(catName) {
    if (catName === 'Autres') return this.CATEGORY_COLOR_OTHER;
    const cats = Storage.getCategories().map(c => c.name);
    const idx = cats.indexOf(catName);
    return this.CATEGORY_COLORS[(idx >= 0 ? idx : 0) % this.CATEGORY_COLORS.length];
  },
};
