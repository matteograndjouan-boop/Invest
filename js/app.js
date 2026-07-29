const Modal = {
  open(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },
  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  },
};

const Dashboard = {
  render() {
    const expenses  = Storage.getExpenses();
    // Épargne/Revenus ne comptent jamais comme des dépenses (Utils.isExpenseCategory) — sert
    // à tous les totaux/calculs ci-dessous. "expenses" (brut) reste utilisé uniquement pour
    // le flux d'activité récente (_renderRecentOps), qui montre tout sans distinction.
    const realExpenses = expenses.filter(e => Utils.isExpenseCategory(e.category));
    const revenues  = Storage.getRevenues();
    const budgets   = Storage.getBudgets();
    const patrimony = Storage.getPatrimony();
    const investments = Storage.getInvestments();

    document.getElementById('current-date').textContent = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }).format(new Date());

    const month = Utils.getCurrentMonth();
    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const [my, mm] = month.split('-').map(Number);
    document.getElementById('dash-month-label').textContent =
      MONTHS_FR[mm - 1] + ' ' + my;

    // --- Current month cash flow ---
    const monthExp = realExpenses.filter(e => Utils.getExpenseMonth(e) === month);
    const monthRev = revenues.filter(r => r.date.substring(0, 7) === month);
    const totalDep = monthExp.reduce((s, e) => s + e.amount, 0);
    const totalRev = monthRev.reduce((s, r) => s + r.amount, 0);
    const solde    = totalRev - totalDep;
    const epargne  = totalRev > 0 ? (solde / totalRev * 100) : null;

    // Previous month for trend
    const prevDate = new Date(my, mm - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevExp = realExpenses.filter(e => Utils.getExpenseMonth(e) === prevMonth).reduce((s, e) => s + e.amount, 0);
    const prevRev = revenues.filter(r => r.date.substring(0, 7) === prevMonth).reduce((s, r) => s + r.amount, 0);
    const prevSolde = prevRev - prevExp;

    const soldeEl = document.getElementById('dash-solde');
    soldeEl.textContent = Utils.formatCurrency(solde);
    soldeEl.className = 'kpi-value ' + (solde >= 0 ? 'positive' : 'negative');
    document.getElementById('dash-solde-card').className = 'kpi-card ' + (solde >= 0 ? 'success' : 'danger');

    const soldeSub = document.getElementById('dash-solde-sub');
    if (prevRev > 0 || prevExp > 0) {
      const diff = solde - prevSolde;
      const pct  = prevSolde !== 0 ? Math.abs(diff / Math.abs(prevSolde) * 100).toFixed(1) : null;
      const arrow = diff >= 0 ? '↑' : '↓';
      const cls   = diff >= 0 ? 'trend-good' : 'trend-bad';
      soldeSub.innerHTML = `Rev. ${Utils.formatCurrency(totalRev)} · Dép. ${Utils.formatCurrency(totalDep)}<br>` +
        (pct ? `<span class="${cls}">${arrow} ${pct}% vs mois préc.</span>` : '');
    } else {
      soldeSub.textContent = `Rev. ${Utils.formatCurrency(totalRev)} · Dép. ${Utils.formatCurrency(totalDep)}`;
    }

    const epargneEl = document.getElementById('dash-epargne');
    epargneEl.textContent = epargne !== null ? epargne.toFixed(1) + ' %' : '— %';
    epargneEl.className = 'kpi-value ' + (epargne === null ? '' : epargne >= 0 ? 'positive' : 'negative');
    document.getElementById('dash-epargne-sub').textContent =
      totalRev > 0 ? `${Utils.formatCurrency(Math.max(0, solde))} mis de côté` : 'Aucun revenu ce mois';

    // --- Budget bar ---
    const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
    const budgetPct = totalBudget > 0 ? Math.min(Math.round(totalDep / totalBudget * 100), 999) : null;
    const budgetPctEl = document.getElementById('dash-budget-pct');
    const budgetBar   = document.getElementById('dash-budget-bar');
    const budgetCard  = document.getElementById('dash-budget-card');
    if (budgetPct !== null) {
      budgetPctEl.textContent = `${budgetPct}%`;
      budgetPctEl.className = 'kpi-value ' + (budgetPct >= 100 ? 'negative' : budgetPct >= 80 ? 'warning' : 'positive');
      const barPct = Math.min(budgetPct, 100);
      budgetBar.style.width = barPct + '%';
      budgetBar.style.background = budgetPct >= 100 ? 'var(--danger)' : budgetPct >= 80 ? 'var(--warning)' : 'var(--success)';
      budgetCard.className = 'kpi-card ' + (budgetPct >= 100 ? 'danger' : budgetPct >= 80 ? 'warning' : '');
    } else {
      budgetPctEl.textContent = '—';
      budgetPctEl.className = 'kpi-value';
      budgetBar.style.width = '0';
      budgetCard.className = 'kpi-card';
    }

    // --- Net worth ---
    const portfolioValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const manualAssets   = patrimony.filter(i => i.type === 'actif').reduce((s, i) => s + i.value, 0);
    const liabilities    = patrimony.filter(i => i.type === 'passif').reduce((s, i) => s + i.value, 0);
    const netWorth       = portfolioValue + manualAssets - liabilities;
    document.getElementById('kpi-net-worth').textContent = Utils.formatCurrency(netWorth);
    document.getElementById('kpi-net-worth-sub').textContent =
      `Actifs: ${Utils.formatCurrency(portfolioValue + manualAssets)} · Passifs: ${Utils.formatCurrency(liabilities)}`;

    this._renderInsights(realExpenses, revenues, monthExp, totalDep, totalRev, prevExp);
    this._renderFluxChart(realExpenses, revenues);
    this._renderTopCategories(monthExp, totalDep, budgets);
    this._renderRecentOps(expenses, revenues);
  },

  _renderInsights(expenses, revenues, monthExp, totalDep, totalRev, prevDep) {
    const container = document.getElementById('dash-insights-panel');
    if (!container) return;

    const month = Utils.getCurrentMonth();
    const [my, mm] = month.split('-').map(Number);

    // Baseline: last 3 months before current
    const baseline = [1, 2, 3].map(i => {
      const d = new Date(my, mm - 1 - i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const insights = [];

    // Budget overruns — le prévu du mois courant est recalculé (montant mensuel recadré sur
    // la date de début du budget), pas lu tel quel : il dépend maintenant du mois, pas fixe.
    const monthStart = `${month}-01`;
    const monthEnd   = `${month}-${String(new Date(my, mm, 0).getDate()).padStart(2, '0')}`;
    const themes = Storage.getBudgetThemes();
    themes.forEach(raw => {
      const theme = Budget._migrate({ ...raw });
      const spent = monthExp.filter(e => e.category === theme.name).reduce((s, e) => s + e.amount, 0);
      const planned = Budget._plannedForRange(theme.monthlyAmount || 0, monthStart, monthEnd, theme.startDate);
      if (!planned) return;
      const pct = spent / planned;
      if (pct >= 1) {
        insights.push({ type: 'danger', icon: '⚠️', title: `Budget « ${theme.name} » dépassé`, desc: `${Utils.formatCurrency(spent)} sur ${Utils.formatCurrency(planned)} prévu (${Math.round(pct * 100)}%)` });
      } else if (pct >= 0.85) {
        insights.push({ type: 'warning', icon: '🔶', title: `« ${theme.name} » presque atteint`, desc: `${Math.round(pct * 100)}% du budget — ${Utils.formatCurrency(planned - spent)} restant` });
      }
    });

    // Category anomalies vs 3-month average
    const catGroups = {};
    monthExp.forEach(e => { catGroups[e.category] = (catGroups[e.category] || 0) + e.amount; });
    Object.entries(catGroups).forEach(([cat, amount]) => {
      const baseAmts = baseline.map(m => expenses.filter(e => Utils.getExpenseMonth(e) === m && e.category === cat).reduce((s, e) => s + e.amount, 0));
      const avg = baseAmts.reduce((s, v) => s + v, 0) / 3;
      if (avg > 30 && amount > avg * 1.6) {
        const rise = Math.round((amount / avg - 1) * 100);
        insights.push({ type: 'warning', icon: '📈', title: `${cat} en forte hausse`, desc: `+${rise}% vs la moyenne des 3 derniers mois (${Utils.formatCurrency(avg)} → ${Utils.formatCurrency(amount)})` });
      }
    });

    // Overall spending trend vs previous month
    if (prevDep > 50 && totalDep > 0) {
      const diff = totalDep - prevDep;
      const pct  = Math.round(Math.abs(diff / prevDep) * 100);
      if (diff < 0 && pct > 10) {
        insights.push({ type: 'success', icon: '✅', title: 'Dépenses en baisse', desc: `−${pct}% ce mois (${Utils.formatCurrency(Math.abs(diff))} de moins qu'en mois précédent)` });
      } else if (diff > 0 && pct > 20) {
        insights.push({ type: 'warning', icon: '📉', title: 'Dépenses en hausse', desc: `+${pct}% vs le mois précédent (+${Utils.formatCurrency(diff)})` });
      }
    }

    // High savings rate
    if (totalRev > 0) {
      const rate = (totalRev - totalDep) / totalRev * 100;
      if (rate >= 30) {
        insights.push({ type: 'success', icon: '🎉', title: 'Excellent taux d\'épargne', desc: `${rate.toFixed(0)}% de tes revenus épargnés ce mois — continue !` });
      }
    }

    if (!insights.length) { container.innerHTML = ''; return; }

    const order = { danger: 0, warning: 1, success: 2, info: 3 };
    insights.sort((a, b) => order[a.type] - order[b.type]);

    container.innerHTML = `<div class="dash-insights-grid">${
      insights.slice(0, 4).map(i => `
        <div class="insight-item insight-${i.type}">
          <span class="insight-icon">${i.icon}</span>
          <div class="insight-body">
            <div class="insight-title">${i.title}</div>
            <div class="insight-desc">${i.desc}</div>
          </div>
        </div>`).join('')
    }</div>`;
  },

  // Même rendu que le graphique "Revenus vs Dépenses" de l'onglet Flux (Charts.fluxBar) : pas
  // de style dupliqué, juste un canvas cible différent.
  _renderFluxChart(expenses, revenues) {
    const months = Utils.getLast12Months().slice(-6);
    const labels  = months.map(m => {
      const [y, mo] = m.split('-').map(Number);
      const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      return MONTHS_FR[mo - 1] + ' ' + String(y).slice(2);
    });
    const revData  = months.map(m => revenues.filter(r => r.date.substring(0,7) === m).reduce((s,r) => s + r.amount, 0));
    const depData  = months.map(m => expenses.filter(e => Utils.getExpenseMonth(e) === m).reduce((s,e) => s + e.amount, 0));
    const soldeData = revData.map((r, i) => r - depData[i]);

    Charts.fluxBar(labels, revData, depData, soldeData, 'chart-dashboard-flux');
  },

  _renderTopCategories(monthExp, totalDep, budgets) {
    const container = document.getElementById('dash-top-categories');
    if (!monthExp.length) { container.innerHTML = '<p class="text-muted">Aucune dépense ce mois</p>'; return; }

    const groups = {};
    monthExp.forEach(e => {
      if (!groups[e.category]) groups[e.category] = 0;
      groups[e.category] += e.amount;
    });
    const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 5);

    container.innerHTML = sorted.map(([cat, amount]) => {
      const pct = totalDep > 0 ? (amount / totalDep * 100).toFixed(0) : 0;
      const budget = budgets[cat] || 0;
      const budgetInfo = budget > 0
        ? `<span class="${amount > budget ? 'negative' : 'positive'}">${Utils.formatCurrency(amount)} / ${Utils.formatCurrency(budget)}</span>`
        : `<span>${Utils.formatCurrency(amount)}</span>`;
      const barW = Math.min(100, pct);
      return `<div class="dash-cat-row">
        <div class="dash-cat-header">
          <span class="dash-cat-name">${cat}</span>
          ${budgetInfo}
        </div>
        <div class="dash-cat-bar-wrap">
          <div class="dash-cat-bar" style="width:${barW}%"></div>
          <span class="dash-cat-pct">${pct}%</span>
        </div>
      </div>`;
    }).join('');
  },

  _renderRecentOps(expenses, revenues) {
    const container = document.getElementById('dash-recent-ops');
    const ops = [
      ...expenses.map(e => ({ date: e.date, label: e.description, sub: e.category, amount: -e.amount })),
      ...revenues.map(r => ({ date: r.date, label: r.description, sub: r.category, amount: r.amount })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

    if (!ops.length) { container.innerHTML = '<p class="text-muted">Aucune opération</p>'; return; }
    container.innerHTML = ops.map(op => `
      <div class="recent-item">
        <div>
          <strong>${op.label}</strong><br>
          <small class="text-muted">${op.sub} · ${Utils.formatDate(op.date)}</small>
        </div>
        <strong class="${op.amount >= 0 ? 'positive' : 'negative'}">${op.amount >= 0 ? '+' : ''}${Utils.formatCurrency(Math.abs(op.amount))}</strong>
      </div>`).join('');
  },
};

// ---- Mode & Navigation ----

const APP_MODES = {
  // 4 onglets fixes (structure demandée telle quelle) : Vue globale (patrimoine consolidé, voir
  // js/portfolio-overview.js) et Analyse (vue filtrée, ex-"Bilan patrimonial", voir js/analyse.js)
  // sont maintenant de vraies vues, comme Enveloppes/Transactions, toutes sur le modèle
  // enveloppes+opérations (js/envelopes.js, js/transactions.js) valorisé par
  // js/portfolio-analytics.js. Plus de dynamicSections (l'ancien onglet par compte, sur
  // invest_investments/js/investments.js) : le nouveau modèle enveloppes le remplace, la
  // structure demandée n'en a plus besoin. Le code et les données de l'ancien modèle "positions"
  // restent en place (Dashboard/Patrimoine s'en servent toujours pour le calcul du patrimoine
  // net), seule sa navigation dédiée disparaît.
  investments: {
    label: 'Investissements',
    sections: [
      { id: 'portfolio', label: 'Vue globale' },
      { id: 'envelopes', label: 'Enveloppes' },
      { id: 'transactions', label: 'Transactions' },
      { id: 'patrimoine', label: 'Analyse' },
    ],
    default: 'portfolio',
  },
  expenses: {
    label: 'Dépenses',
    sections: [
      { id: 'flux', label: 'Flux' },
      { id: 'comparisons', label: 'Comparaisons' },
      { id: 'budget', label: 'Budget' },
    ],
    default: 'flux',
  },
  donnees: {
    label: 'Données',
    sections: [
      { id: 'donnees', label: 'Toutes les données' },
      { id: 'categories', label: 'Catégories' },
    ],
    default: 'donnees',
  },
};

let currentMode = 'expenses';

// Mode propriétaire d'une section (pour retrouver ses onglets même en y arrivant autrement que
// par le sélecteur de mode) ; null pour les sections "Général" (dashboard, patrimony), qui
// n'appartiennent à aucun mode et n'ont donc pas d'onglets.
function modeForSection(sectionId) {
  return Object.keys(APP_MODES).find(m => {
    const cfg = APP_MODES[m];
    return cfg.sections.some(s => s.id === sectionId) || (cfg.dynamicSections && cfg.dynamicSections().some(s => s.id === sectionId));
  }) || null;
}

// Onglets du mode en haut du contenu (remplacent l'ancienne liste de nav-item par mode dans la
// barre latérale) : masqués sur les pages "Général".
function renderModeTabs(mode, activeSectionId) {
  const container = document.getElementById('mode-tabs-container');
  if (!container) return;
  const cfg = APP_MODES[mode];
  if (!cfg) { container.innerHTML = ''; container.style.display = 'none'; return; }

  container.style.display = '';
  const sections = cfg.dynamicSections ? [...cfg.sections, ...cfg.dynamicSections()] : cfg.sections;
  const tabs = sections.map(s => `
    <button class="mode-tab${s.id === activeSectionId ? ' active' : ''}" data-section="${s.id}">
      ${s.label}
    </button>`).join('');
  container.innerHTML = `<div class="mode-tabs-row">${tabs}</div>`;
  container.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.section));
  });
}

function switchMode(mode) {
  navigateTo(APP_MODES[mode].default);
}

function navigateTo(sectionId) {
  // Map section identifiers to actual HTML section IDs — les onglets de compte dynamiques
  // (account-pea, account-assurance_vie...) partagent tous le même gabarit HTML.
  const sectionMap = {
    portfolio: 'portfolio',
    envelopes: 'envelopes',
    flux: 'flux',
    donnees: 'donnees',
    revenues: 'revenues',
    expenses: 'expenses',
    comparisons: 'comparisons',
    budget: 'budget',
    categories: 'categories',
    dashboard: 'dashboard',
    patrimony: 'patrimony',
    transactions: 'transactions',
    // 'patrimoine' (nouvel onglet placeholder du mode Investissement) n'a pas besoin d'entrée
    // ici : sectionMap[sectionId] || sectionId retombe déjà sur 'patrimoine' tel quel, qui est
    // exactement l'id HTML voulu (#section-patrimoine) — distinct de 'patrimony' ci-dessus
    // (#section-patrimony, la page "Général" existante, inchangée).
  };

  const htmlSectionId = sectionId.startsWith('account-') ? 'portfolio-account' : (sectionMap[sectionId] || sectionId);

  // Détermine le mode propriétaire de cette section (null = page "Général", hors mode) et
  // synchronise le sélecteur de mode + les onglets du haut en conséquence, même si on arrive
  // ici par un onglet ou un lien direct plutôt que par le sélecteur de mode lui-même.
  const mode = modeForSection(sectionId);
  if (mode) currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });
  renderModeTabs(mode, sectionId);

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === sectionId);
  });

  // Show/hide sections
  document.querySelectorAll('.section').forEach(el => {
    el.classList.toggle('hidden', el.id !== `section-${htmlSectionId}`);
  });

  // Barre de période (avec le toggle Date comptable/effective) : Flux, Budget
  // et Comparaisons. data-view permet au CSS de n'y montrer que le toggle sur
  // Comparaisons (qui a ses propres sélecteurs de mois A/B).
  document.body.setAttribute('data-view', sectionId);
  const pfContainer = document.getElementById('period-filter-container');
  if (pfContainer) pfContainer.style.display = ['flux', 'budget', 'comparisons'].includes(sectionId) ? '' : 'none';
  // Referme le panneau replié et rafraîchit son libellé (change de sens sur Comparaisons —
  // voir PeriodFilter._triggerLabel) à chaque changement d'onglet.
  PeriodFilter._closePanel();
  PeriodFilter._refreshTrigger();

  // Render the appropriate section
  if (sectionId.startsWith('account-')) {
    Investments.renderAccountTab(sectionId.slice('account-'.length));
    return;
  }
  switch (sectionId) {
    case 'dashboard':
      Dashboard.render();
      break;
    case 'portfolio':
      Portfolio.render();
      break;
    case 'envelopes':
      Envelopes.render();
      break;
    case 'transactions':
      Transactions.render();
      break;
    case 'patrimoine':
      Analyse.render();
      break;
    case 'flux':
      Flux.render();
      break;
    case 'donnees':
      DataEntry.render();
      break;
    case 'revenues':
      Revenues.render();
      break;
    case 'expenses':
      Expenses.render();
      break;
    case 'comparisons':
      Comparisons.render();
      break;
    case 'budget':
      Budget.render();
      break;
    case 'categories':
      Categories.render();
      break;
    case 'patrimony':
      Patrimony.render();
      break;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  Dropdown.init();

  // Dropdowns à options fixes (ne changent jamais après le chargement) : rendus une seule fois
  // ici, AVANT tout .init() de module — plusieurs modules (DataEntry.init() notamment) cherchent
  // ces éléments par id dès leur propre init() pour y attacher un listener 'change', ce qui échoue
  // silencieusement (élément introuvable, encore un <div> de slot vide) si le rendu arrive après.
  // Les dropdowns à options dynamiques (catégories, qui peuvent changer) sont plutôt reconstruits
  // par leur module à chaque render (Dropdown.setOptions) — voir _populateCatFilter dans
  // expenses.js/data-entry.js, qui ont la même contrainte d'ordre en interne.
  const renderSlot = (slotId, name, optsHtml, opts) => {
    const slot = document.getElementById(slotId);
    if (slot) slot.innerHTML = Dropdown.render(name, optsHtml, opts);
  };
  renderSlot('inv-evo-window-slot', 'inv-evo-window', `
    <option value="3">3 derniers mois</option>
    <option value="6">6 derniers mois</option>
    <option value="12" selected>12 derniers mois</option>
    <option value="24">24 derniers mois</option>
    <option value="0">Tout</option>
  `, { onchange: 'Investments.setEvoWindow(this.value)' });
  renderSlot('pos-filter-type-slot', 'pos-filter-type', `
    <option value="">Tous les types</option>
    <option value="action">Actions</option>
    <option value="etf">ETF</option>
    <option value="crypto">Crypto</option>
    <option value="immobilier">Immobilier</option>
    <option value="obligations">Obligations</option>
    <option value="autre">Autre</option>
  `);
  renderSlot('rev-filter-cat-slot', 'rev-filter-cat',
    ['<option value="">Toutes catégories</option>'].concat(Utils.REVENUE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`)).join(''));
  renderSlot('donnees-filter-type-slot', 'donnees-filter-type', `
    <option value="">Dépenses + Revenus</option>
    <option value="expense">Dépenses seulement</option>
    <option value="revenue">Revenus seulement</option>
  `);
  renderSlot('donnees-filter-reassign-slot', 'donnees-filter-reassign', `
    <option value="">Toutes les lignes</option>
    <option value="cat">🏷️ Catégorie réaffectée</option>
    <option value="subcat">🏷️ Sous-catégorie réaffectée</option>
  `);

  // Isole chaque .init() de module : une exception dans l'un d'eux (ex. donnée propre à ce module
  // dans un état inattendu) ne doit JAMAIS empêcher les modules suivants de s'initialiser, ni les
  // écouteurs mode-btn/nav-item plus bas ni navigateTo('flux') en toute fin de bloc de s'exécuter
  // — sans ce garde-fou, un seul module en échec bloquait TOUTE la navigation (plus aucun onglet/
  // mode cliquable), même pour un utilisateur qui n'a rien à faire avec ce module précis.
  // console.error (jamais avalé en silence) : seule vraie piste de diagnostic depuis la console
  // si ça se reproduit.
  const safeInit = (name, fn) => { try { fn(); } catch (e) { console.error(`${name}.init() a échoué :`, e); } };

  safeInit('PeriodFilter', () => PeriodFilter.renderUI());
  safeInit('BankImport', () => BankImport.init());
  safeInit('InvestImport', () => InvestImport.init());
  safeInit('Expenses', () => Expenses.init());
  safeInit('Revenues', () => Revenues.init());
  safeInit('Flux', () => Flux.init());
  safeInit('Budget', () => Budget.init());
  safeInit('DataEntry', () => DataEntry.init());
  safeInit('Comparisons', () => Comparisons.init());
  safeInit('Envelopes', () => Envelopes.init());
  safeInit('Transactions', () => Transactions.init());
  safeInit('Analyse', () => Analyse.init());

  // Mode switcher buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });

  // Nav items
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const section = el.dataset.section;
      // If navigating to dashboard or patrimony, no mode restriction
      navigateTo(section);
    });
  });

  // Modal
  document.getElementById('modal-close').addEventListener('click', Modal.close);
  // mousedown (pas click/mouseup) : sinon un clic commencé dans la modale qui glisse
  // jusqu'à l'overlay avant relâchement la ferme par erreur.
  document.getElementById('modal-overlay').addEventListener('mousedown', (e) => {
    if (e.target.id === 'modal-overlay') Modal.close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Modal.close(); });

  // Action buttons
  document.getElementById('add-investment-btn')?.addEventListener('click', () => Investments.openAddForm());
  document.getElementById('add-position-btn')?.addEventListener('click', () => Investments.openAddForm());
  document.getElementById('add-expense-btn')?.addEventListener('click', () => Expenses.openAddForm());
  document.getElementById('add-revenue-btn')?.addEventListener('click', () => Revenues.openAddForm());
  document.getElementById('add-budget-btn').addEventListener('click', () => Budget.openAddForm());
  document.getElementById('add-patrimony-btn').addEventListener('click', () => Patrimony.openAddForm());
  document.getElementById('add-donnees-btn')?.addEventListener('click', () => DataEntry.openAddForm());

  // Filters
  document.getElementById('pos-search')?.addEventListener('input', () => Investments.renderAccountTab());
  document.getElementById('pos-filter-type')?.addEventListener('change', () => Investments.renderAccountTab());
  document.getElementById('exp-search').addEventListener('input', () => Expenses.render());
  document.getElementById('exp-filter-cat').addEventListener('change', () => Expenses.render());
  document.getElementById('rev-search').addEventListener('input', () => Revenues.render());
  document.getElementById('rev-filter-cat').addEventListener('change', () => Revenues.render());


  // Default mode is Dépenses, show expenses section (navigateTo synchronise lui-même le
  // sélecteur de mode et les onglets du haut) — même garde-fou que safeInit ci-dessus : sans lui,
  // une exception ici laisserait TOUTES les sections dans leur état HTML brut (aucun .hidden
  // appliqué), affichage de plusieurs onglets superposés (ex. Flux + Dépenses, les deux seules
  // sections non masquées par défaut dans le HTML) sans qu'aucun clic ne puisse s'en sortir.
  try {
    navigateTo('flux');
  } catch (e) {
    console.error("navigateTo('flux') a échoué au chargement initial :", e);
  }
});

// ---- PDF Import ----
function guessCategory(desc) {
  const d = (desc||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const map = [
    [['sncf','ratp','bus ','tram','train','metro','taxi','uber','bolt','navette','velib'], 'Transport'],
    [['monoprix','carrefour','leclerc','lidl','aldi','franprix','picard','super u','casino','intermarche','biocoop','naturalia'], 'Alimentation'],
    [['loyer','edf','engie','airbnb','electricite','gaz ','eau '], 'Logement'],
    [['netflix','spotify','disney','apple.com','google','bouygues','sfr ','orange ','free ','abonnement','amazon prime'], 'Abonnements'],
    [['pharmacie','medecin','docteur','clinique','hopital','cpam','mutuelle','optique'], 'Santé'],
    [['restaurant','brasserie','mcdonald','burger','pizza','kebab','sushi','bistro','izly'], 'Restaurants'],
    [['cinema','theatre','musee','sport','fitness','piscine','concert','fnac','cultura','steam'], 'Loisirs'],
    [['livret','epargne','assurance vie','per '], 'Épargne'],
    [['zara','h&m','primark','asos','shein','kiabi'], 'Vêtements'],
  ];
  for (const [keywords, cat] of map) { if (keywords.some(k => d.includes(k))) return cat; }
  return 'Autre';
}

async function parsePDFTransactions(arrayBuffer) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js non chargé');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const transactions = [];
  const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    const items = content.items
      .filter(i => i.str && i.str.trim())
      .map(i => ({ x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), str: i.str.trim() }));

    // Detect Débit/Crédit column X positions from header
    let debitX = null, creditX = null;
    for (const item of items) {
      const s = norm(item.str);
      if (s === 'debit') debitX = item.x;
      if (s === 'credit') creditX = item.x;
    }

    // Group by Y coordinate (tolerance 3px)
    const byY = {};
    for (const item of items) {
      const y = Math.round(item.y / 3) * 3;
      if (!byY[y]) byY[y] = [];
      byY[y].push(item);
    }

    const SKIP_HEADERS = /^(SOLDE|TOTAL|NOUVEAU|ANCIEN|RELEVE|COMPTE|REPORT|Date|Nature|Valeur|Monnaie)/i;
    const AMT_RE = /^\d[\d\s]*,\d{2}$/;
    const DATE_RE = /^\d{2}\.\d{2}$/;
    let lastTx = null;

    for (const y of Object.keys(byY).map(Number).sort((a,b) => b-a)) {
      const row = byY[y].sort((a,b) => a.x - b.x);
      const first = row[0];

      // BNP format: date is DD.MM (dot separator)
      if (DATE_RE.test(first.str)) {
        const [day, month] = first.str.split('.');
        const now = new Date();
        const txMonth = parseInt(month);
        const year = txMonth > (now.getMonth() + 3) ? now.getFullYear() - 1 : now.getFullYear();
        const date = `${year}-${month}-${day}`;

        let desc = '';
        let debitAmt = null, creditAmt = null;

        for (let i = 1; i < row.length; i++) {
          const itm = row[i];
          if (DATE_RE.test(itm.str)) continue; // skip Valeur column (repeated date)
          const clean = itm.str.replace(/\s/g, '');
          if (AMT_RE.test(itm.str) || /^\d+,\d{2}$/.test(clean)) {
            const amount = parseFloat(clean.replace(',', '.'));
            if (debitX !== null && creditX !== null) {
              if (Math.abs(itm.x - debitX) < Math.abs(itm.x - creditX)) debitAmt = amount;
              else creditAmt = amount;
            } else {
              if (debitAmt === null) debitAmt = amount;
              else creditAmt = amount;
            }
          } else {
            desc += (desc ? ' ' : '') + itm.str;
          }
        }

        if (debitAmt !== null && debitAmt > 0) {
          lastTx = { date, description: desc.trim() || 'Opération', amount: debitAmt, category: guessCategory(desc) };
          transactions.push(lastTx);
        } else {
          lastTx = null;
        }
      } else if (lastTx && !SKIP_HEADERS.test(first.str)) {
        // Multi-line description continuation
        const hasAmt = row.some(i => AMT_RE.test(i.str) || /^\d+,\d{2}$/.test(i.str.replace(/\s/g,'')));
        const hasDate = row.some(i => DATE_RE.test(i.str));
        if (!hasAmt && !hasDate) {
          const extra = row.map(i => i.str).join(' ').trim();
          if (extra) {
            lastTx.description += ' ' + extra;
            lastTx.category = guessCategory(lastTx.description);
          }
        }
      }
    }
  }
  return transactions;
}

function showPDFPreview(transactions) {
  const rows = transactions.map((t, i) => `
    <tr>
      <td style="text-align:center"><input type="checkbox" data-idx="${i}" checked style="width:16px;height:16px;cursor:pointer"></td>
      <td style="white-space:nowrap">${Utils.formatDate(t.date)}</td>
      <td style="max-width:220px;word-break:break-word;font-size:12px">${t.description}</td>
      <td style="white-space:nowrap"><strong>${Utils.formatCurrency(t.amount)}</strong></td>
      <td><select data-cat="${i}" class="select-input" style="font-size:12px;padding:4px 6px">
        ${Utils.EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${c===t.category?'selected':''}>${c}</option>`).join('')}
      </select></td>
    </tr>`).join('');

  const content = `
    <p style="margin-bottom:12px;color:var(--text-muted);font-size:13px">
      <strong>${transactions.length} opération(s)</strong> détectée(s). Décochez les lignes à exclure et ajustez les catégories.
    </p>
    <div class="preview-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th style="width:32px"><input type="checkbox" id="pdf-check-all" checked style="width:16px;height:16px;cursor:pointer"></th>
          <th>Date</th><th>Description</th><th>Montant</th><th>Catégorie</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="Modal.close()">Annuler</button>
      <button class="btn-primary" onclick="confirmPDFImport()">Importer les sélectionnées</button>
    </div>`;

  window._pdfTransactions = transactions;
  document.getElementById('modal').classList.add('modal-wide');
  Modal.open(`Import PDF — ${transactions.length} opération(s)`, content);
  document.getElementById('pdf-check-all').addEventListener('change', (e) => {
    document.querySelectorAll('[data-idx]').forEach(cb => cb.checked = e.target.checked);
  });
}

function confirmPDFImport() {
  const transactions = window._pdfTransactions || [];
  const checkboxes = document.querySelectorAll('[data-idx]');
  const catSelects = document.querySelectorAll('[data-cat]');
  const existing = Storage.getExpenses();
  let imported = 0;
  checkboxes.forEach((cb, i) => {
    if (!cb.checked) return;
    const t = transactions[i];
    existing.push({ id: Utils.generateId(), description: t.description, amount: t.amount,
      category: catSelects[i]?.value || t.category, date: t.date, notes: 'Import PDF' });
    imported++;
  });
  Storage.saveExpenses(existing);
  document.getElementById('modal').classList.remove('modal-wide');
  Modal.close();
  window._pdfTransactions = null;
  navigateTo('flux');
  alert(`${imported} dépense(s) importée(s) !`);
}
