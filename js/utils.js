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
      ${Dropdown.render('effectiveMonth', `<option value="">Mois</option>${monthOpts}`)}
      ${Dropdown.render('effectiveYear', `<option value="">Année</option>${yearOpts.join('')}`)}
    </div>`;
  },

  // Reads effectiveDate from FormData (effectiveMonth + effectiveYear)
  getEffectiveDateFromForm(fd) {
    const m = fd.get('effectiveMonth') || '';
    const y = fd.get('effectiveYear') || '';
    return m && y ? `${y}-${m}` : '';
  },

  // 0 décimale pour un montant rond (ex. 2 500 €), toujours exactement 2 sinon (jamais 1) — un
  // simple minimumFractionDigits:0/maximumFractionDigits:2 laisserait passer "450,5 €" pour un
  // montant à 1 seule décimale significative, pas conforme aux conventions d'affichage monétaire.
  formatCurrency(amount) {
    const value = amount || 0;
    const isWhole = Math.round(value * 100) % 100 === 0;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: isWhole ? 0 : 2,
    }).format(value);
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

  // ---- Enveloppes (js/envelopes.js) ----
  // Types d'enveloppe fixes (liste imposée par la demande) — distincts des types de position de
  // Storage.getInvestments (INVESTMENT_TYPES/INVESTMENT_ACCOUNTS ci-dessus), qui restent le
  // modèle "positions valorisées" existant, inchangé.
  ENVELOPE_TYPES: [
    { key: 'pea',               label: 'PEA' },
    { key: 'compte_titres',     label: 'Compte-titres' },
    { key: 'assurance_vie',     label: 'Assurance-vie' },
    { key: 'livret',            label: 'Livret' },
    { key: 'crypto',            label: 'Crypto' },
    { key: 'immobilier',        label: 'Immobilier' },
    { key: 'produit_structure', label: 'Produit structuré' },
  ],

  // Types d'opération disponibles PAR type d'enveloppe. `fields` liste les champs du formulaire
  // (voir Envelopes._FIELD_DEFS) ; `amountLabel` personnalise le libellé du champ générique
  // `amount` selon ce qu'il représente pour cette opération précise (un seul champ de stockage,
  // plusieurs sens selon le type — voir le commentaire sur Envelopes.saveOperation).
  ENVELOPE_OPERATIONS: (() => {
    const buySell = [
      { key: 'achat', label: 'Achat', fields: ['date', 'assetName', 'ticker', 'quantity', 'unitPrice'] },
      { key: 'vente', label: 'Vente', fields: ['date', 'assetName', 'quantity', 'unitPrice'] },
      { key: 'dividende', label: 'Dividende', fields: ['date', 'assetName', 'amount'], amountLabel: 'Montant (€)' },
      { key: 'versement', label: "Versement d'espèces", fields: ['date', 'amount'], amountLabel: 'Montant (€)' },
      { key: 'retrait', label: "Retrait d'espèces", fields: ['date', 'amount'], amountLabel: 'Montant (€)' },
    ];
    return {
      pea: buySell,
      compte_titres: buySell,
      assurance_vie: [
        { key: 'versement', label: 'Versement', fields: ['date', 'amount'], amountLabel: 'Montant (€)' },
        { key: 'retrait', label: 'Retrait', fields: ['date', 'amount'], amountLabel: 'Montant (€)' },
        { key: 'maj_valeur', label: 'Mise à jour valeur', fields: ['date', 'amount'], amountLabel: 'Valeur totale du contrat (€)' },
      ],
      livret: [
        { key: 'depot', label: 'Dépôt', fields: ['date', 'amount'], amountLabel: 'Montant (€)' },
        { key: 'retrait', label: 'Retrait', fields: ['date', 'amount'], amountLabel: 'Montant (€)' },
        { key: 'maj_solde', label: 'Mise à jour solde', fields: ['date', 'amount'], amountLabel: 'Solde actuel (€)' },
      ],
      crypto: [
        { key: 'achat', label: 'Achat', fields: ['date', 'assetName', 'quantity', 'unitPrice'] },
        { key: 'vente', label: 'Vente', fields: ['date', 'assetName', 'quantity', 'unitPrice'] },
        { key: 'transfert_entrant', label: 'Transfert entrant', fields: ['date', 'amount'], amountLabel: 'Montant (€)' },
        { key: 'transfert_sortant', label: 'Transfert sortant', fields: ['date', 'amount'], amountLabel: 'Montant (€)' },
      ],
      immobilier: [
        { key: 'maj_valeur_estimee', label: 'Mise à jour valeur estimée', fields: ['date', 'amount'], amountLabel: 'Valeur estimée (€)' },
        { key: 'maj_capital_restant', label: 'Mise à jour capital restant dû', fields: ['date', 'amount'], amountLabel: 'Capital restant dû (€)' },
      ],
      produit_structure: [
        { key: 'souscription', label: 'Souscription', fields: ['date', 'amount'], amountLabel: 'Montant investi (€)' },
        { key: 'maj_valeur', label: 'Mise à jour valeur', fields: ['date', 'amount'], amountLabel: 'Valeur actuelle (€)' },
        { key: 'remboursement', label: 'Remboursement', fields: ['date', 'amount'], amountLabel: 'Montant reçu (€)' },
      ],
    };
  })(),

  // Champs additionnels du formulaire de création/édition d'enveloppe, SEULEMENT pour certains
  // types (voir Envelopes._extraFieldsHtml). `optional` = pas de required sur le <input> — reflète
  // exactement la demande initiale, qui ne marque "(optionnel)" que sur le taux d'intérêt du
  // Livret et le capital restant dû de l'Immobilier ; tout le reste de ces blocs est requis.
  ENVELOPE_EXTRA_FIELDS: {
    produit_structure: [
      { key: 'maturityDate', label: "Date d'échéance", type: 'date' },
      { key: 'yieldConditions', label: 'Conditions de rendement', type: 'textarea' },
    ],
    immobilier: [
      { key: 'address', label: 'Adresse', type: 'text' },
      { key: 'propertyType', label: 'Type de bien', type: 'select', options: [
        { value: 'residence_principale', label: 'Résidence principale' },
        { value: 'locatif', label: 'Locatif' },
        { value: 'autre', label: 'Autre' },
      ] },
      { key: 'remainingLoanCapital', label: 'Capital restant dû (€)', type: 'number', optional: true },
    ],
    livret: [
      { key: 'interestRate', label: "Taux d'intérêt (%)", type: 'number', optional: true },
    ],
  },

  // Palette des catégories : 8 teintes vives inspirées de la palette Excel standard — bleu,
  // rouge, vert (olive/foncé), violet, orange, cyan/turquoise, rose, ambre/or — choisies pour
  // rester bien lisibles sur fond sombre et immédiatement reconnaissables les unes des autres.
  // Ordre entrelacé pensé pour que deux teintes consécutives (positions voisines parmi les
  // catégories de même type, voir getCategoryColor) soient toujours nettement écartées sur le
  // cercle chromatique, jamais deux froides ou deux chaudes à la suite.
  // Trois teintes décalées par rapport à la recette standard (400-700) pour fuir des couleurs
  // déjà utilisées ailleurs dans l'app (distance RGB euclidienne cible >60) : le vert passe sur
  // l'échelle "lime" (olive) décalée en 500-800 pour rester net du vert vif de --success
  // (revenus, #00b37e) ; le rouge passe en 600-900 pour s'écarter à la fois de --danger
  // (#f56565) ET du rouge d'alerte « dépassement de budget » câblé en dur dans
  // Charts.budgetHistory (#ef4444) — les deux se seraient sinon confondus avec l'identité de
  // la catégorie sur le MÊME graphique ; l'or/ambre reste sur l'échelle "yellow" (pas "amber")
  // décalée en 300-600 pour s'écarter du badge de réaffectation de l'onglet Données (#f59e0b)
  // et de --warning (#d97706). Même recette Tailwind par ailleurs (4 nuances par teinte) — la
  // texture (dégradé clair-vers-foncé du donut, reflet, ombre — Charts._donutGradientPlugin
  // etc.) ne dépend que du hex de base, inchangée par ce choix.
  CATEGORY_COLORS: [
    '#3b82f6', '#b91c1c', '#65a30d', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899', '#facc15', // bleu / rouge / vert / violet / orange / cyan / rose / ambre-or
    '#60a5fa', '#dc2626', '#84cc16', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6', '#fde047', // …clairs
    '#2563eb', '#991b1b', '#4d7c0f', '#7c3aed', '#ea580c', '#0891b2', '#db2777', '#eab308', // …foncés
    '#1d4ed8', '#7f1d1d', '#3f6212', '#6d28d9', '#c2410c', '#0e7490', '#be185d', '#ca8a04', // …extrêmes
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

  // Couleur stable par IDENTITÉ de catégorie, indexée PARMI LES CATÉGORIES DE MÊME TYPE
  // (Categories._catType) plutôt que dans Storage.getCategories() en entier : aucune vue de
  // l'app n'affiche deux types côte à côte (donut Flux = dépenses seules, une section de
  // l'onglet Catégories = un seul type, Comparaisons = dépenses seules...), donc un index
  // global décalait les dépenses réelles au-delà d'Épargne/Revenus et faisait retomber les
  // dernières catégories sur une simple NUANCE d'une teinte déjà utilisée plus tôt (ex.
  // Shopping en bleu clair juste à côté d'Abonnements en bleu de base). Jamais par rang/
  // montant/ordre d'apparition — sinon une même catégorie changerait de couleur d'une vue ou
  // d'une période à l'autre. Seule source de vérité pour la couleur d'une catégorie, partagée
  // par tout l'app (Flux, Catégories, Comparaisons, Budget, Dépenses/Revenus...). « Autres »
  // (bucket agrégé de certains graphiques, n'existe pas comme vraie catégorie) reçoit un gris
  // neutre dédié ; catégorie introuvable (supprimée) retombe sur la 1re teinte.
  getCategoryColor(catName) {
    if (catName === 'Autres') return this.CATEGORY_COLOR_OTHER;
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.name === catName);
    if (!cat) return this.CATEGORY_COLORS[0];
    const type = Categories._catType(cat);
    const sameType = cats.filter(c => Categories._catType(c) === type).map(c => c.name);
    const idx = sameType.indexOf(catName);
    return this.CATEGORY_COLORS[(idx >= 0 ? idx : 0) % this.CATEGORY_COLORS.length];
  },
};
