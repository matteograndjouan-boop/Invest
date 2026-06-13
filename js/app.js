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
    const monthExp = expenses.filter(e => Utils.getExpenseMonth(e) === month);
    const monthRev = revenues.filter(r => r.date.substring(0, 7) === month);
    const totalDep = monthExp.reduce((s, e) => s + e.amount, 0);
    const totalRev = monthRev.reduce((s, r) => s + r.amount, 0);
    const solde    = totalRev - totalDep;
    const epargne  = totalRev > 0 ? (solde / totalRev * 100) : null;

    // Previous month for trend
    const prevDate = new Date(my, mm - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevExp = expenses.filter(e => Utils.getExpenseMonth(e) === prevMonth).reduce((s, e) => s + e.amount, 0);
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

    this._renderInsights(expenses, revenues, monthExp, totalDep, totalRev, prevDep);
    this._renderFluxChart(expenses, revenues);
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

    // Budget overruns
    const themes = Storage.getBudgetThemes();
    themes.forEach(theme => {
      const spent = monthExp.filter(e => e.category === theme.name).reduce((s, e) => s + e.amount, 0);
      if (!theme.planned) return;
      const pct = spent / theme.planned;
      if (pct >= 1) {
        insights.push({ type: 'danger', icon: '⚠️', title: `Budget « ${theme.name} » dépassé`, desc: `${Utils.formatCurrency(spent)} sur ${Utils.formatCurrency(theme.planned)} prévu (${Math.round(pct * 100)}%)` });
      } else if (pct >= 0.85) {
        insights.push({ type: 'warning', icon: '🔶', title: `« ${theme.name} » presque atteint`, desc: `${Math.round(pct * 100)}% du budget — ${Utils.formatCurrency(theme.planned - spent)} restant` });
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

  _renderFluxChart(expenses, revenues) {
    const months = Utils.getLast12Months().slice(-6);
    const labels  = months.map(m => {
      const [y, mo] = m.split('-').map(Number);
      const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      return MONTHS_FR[mo - 1] + ' ' + String(y).slice(2);
    });
    const getLastDay = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
    const revData  = months.map(m => revenues.filter(r => r.date.substring(0,7) === m).reduce((s,r) => s + r.amount, 0));
    const depData  = months.map(m => expenses.filter(e => Utils.getExpenseMonth(e) === m).reduce((s,e) => s + e.amount, 0));
    const soldeData = revData.map((r, i) => r - depData[i]);

    Charts.destroy('chart-dashboard-flux');
    const canvas = document.getElementById('chart-dashboard-flux');
    if (!canvas) return;
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Revenus',   data: revData,   backgroundColor: 'rgba(16,185,129,0.75)',  borderColor: '#10b981', borderWidth: 1, borderRadius: 4, type: 'bar' },
          { label: 'Dépenses',  data: depData,   backgroundColor: 'rgba(239,68,68,0.75)',   borderColor: '#ef4444', borderWidth: 1, borderRadius: 4, type: 'bar' },
          { label: 'Solde net', data: soldeData, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.08)',
            borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#8b5cf6', fill: false, tension: 0.3, type: 'line', yAxisID: 'y' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: Charts._leg('top'),
          tooltip: { ...Charts._tip(), mode: 'index', callbacks: { label: ctx => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } },
        },
        scales: { y: Charts._yAxis({ beginAtZero: false }), x: Charts._xAxis() },
      },
    });
    Charts._instances['chart-dashboard-flux'] = chart;
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
  investments: {
    sections: ['portfolio', 'positions'],
    navGroupId: 'nav-investments-group',
    default: 'portfolio',
  },
  expenses: {
    sections: ['flux', 'comparisons', 'budget'],
    navGroupId: 'nav-expenses-group',
    default: 'flux',
  },
  donnees: {
    sections: ['donnees', 'categories'],
    navGroupId: 'nav-donnees-group',
    default: 'donnees',
  },
};

let currentMode = 'expenses';

function switchMode(mode) {
  currentMode = mode;

  // Update mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Show/hide nav groups
  document.getElementById('nav-investments-group').style.display = mode === 'investments' ? '' : 'none';
  document.getElementById('nav-expenses-group').style.display = mode === 'expenses' ? '' : 'none';
  document.getElementById('nav-donnees-group').style.display = mode === 'donnees' ? '' : 'none';

  // Navigate to first section of mode
  const firstSection = APP_MODES[mode].default;
  navigateTo(firstSection);
}

function navigateTo(sectionId) {
  // Map section identifiers to actual HTML section IDs
  const sectionMap = {
    portfolio: 'portfolio',
    positions: 'positions',
    flux: 'flux',
    donnees: 'donnees',
    revenues: 'revenues',
    expenses: 'expenses',
    comparisons: 'comparisons',
    budget: 'budget',
    categories: 'categories',
    dashboard: 'dashboard',
    patrimony: 'patrimony',
  };

  const htmlSectionId = sectionMap[sectionId] || sectionId;

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === sectionId);
  });

  // Show/hide sections
  document.querySelectorAll('.section').forEach(el => {
    el.classList.toggle('hidden', el.id !== `section-${htmlSectionId}`);
  });

  // Period filter is only relevant in flux and budget
  const pfContainer = document.getElementById('period-filter-container');
  if (pfContainer) pfContainer.style.display = ['flux', 'budget'].includes(sectionId) ? '' : 'none';

  // Render the appropriate section
  switch (sectionId) {
    case 'dashboard':
      Dashboard.render();
      break;
    case 'portfolio':
      Investments.renderPortfolio();
      break;
    case 'positions':
      Investments.renderPositions();
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
  PeriodFilter.renderUI();
  BankImport.init();
  Expenses.init();
  Revenues.init();
  Flux.init();
  Budget.init();
  DataEntry.init();
  Comparisons.init();

  // Populate revenue category filter
  const revCatFilter = document.getElementById('rev-filter-cat');
  if (revCatFilter) {
    Utils.REVENUE_CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat; opt.textContent = cat;
      revCatFilter.appendChild(opt);
    });
  }

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
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') Modal.close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Modal.close(); });

  // Action buttons
  document.getElementById('add-investment-btn')?.addEventListener('click', () => Investments.openAddForm());
  document.getElementById('add-position-btn')?.addEventListener('click', () => Investments.openAddForm());
  document.getElementById('add-expense-btn')?.addEventListener('click', () => Expenses.openAddForm());
  document.getElementById('add-revenue-btn')?.addEventListener('click', () => Revenues.openAddForm());
  document.getElementById('add-expense-flux-btn')?.addEventListener('click', () => Expenses.openAddForm());
  document.getElementById('add-revenue-flux-btn')?.addEventListener('click', () => Revenues.openAddForm());
  document.getElementById('add-budget-btn').addEventListener('click', () => Budget.openAddForm());
  document.getElementById('add-patrimony-btn').addEventListener('click', () => Patrimony.openAddForm());
  document.getElementById('add-donnees-btn')?.addEventListener('click', () => DataEntry.openAddForm());

  // Filters
  document.getElementById('pos-search')?.addEventListener('input', () => Investments.renderPositions());
  document.getElementById('pos-filter-type')?.addEventListener('change', () => Investments.renderPositions());
  document.getElementById('exp-search').addEventListener('input', () => Expenses.render());
  document.getElementById('exp-filter-cat').addEventListener('change', () => Expenses.render());
  document.getElementById('rev-search').addEventListener('input', () => Revenues.render());
  document.getElementById('rev-filter-cat').addEventListener('change', () => Revenues.render());

  // Export
  document.getElementById('export-btn').addEventListener('click', () => {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investtrack_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'json') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          Storage.importAll(JSON.parse(evt.target.result));
          navigateTo('dashboard');
          alert('Données importées avec succès !');
        } catch { alert('Erreur lors de l\'importation.'); }
      };
      reader.readAsText(file);

    } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          const headers = rows[0].map(h => String(h).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
          const idx = (names) => headers.findIndex(h => names.some(n => h.includes(n)));
          const dateIdx = idx(['date treso', 'date']); const catIdx = idx(['categorie']);
          const subCatIdx = idx(['sous']); const commentIdx = idx(['commentaire']);
          const valeurIdx = idx(['valeur']); const positifIdx = idx(['positif']);
          let moisReelIdx = idx(['mois reel', 'mois effectif', 'mois eff', 'mois reel']);
          const CAT_MAP = {
            'abonnements':'Abonnements','alimentation':'Alimentation','divers':'Divers',
            'epargne':'Epargne','logement':'Logement','loisir':'Loisir','loisirs':'Loisir',
            'revenus':'Revenus','sante':'Santé','shopping':'Shopping','transport':'Transport',
          };
          const parseExcelDate = (v) => {
            if (!v && v !== 0) return '';
            if (typeof v === 'number') { const d = new Date(Math.round((v-25569)*86400*1000)); return d.toISOString().split('T')[0]; }
            const s = String(v); const parts = s.split('/');
            if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
            return s;
          };
          const MONTH_NAMES_FR = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
          const MONTH_ABBR_FR  = ['janv','fevr','mars','avr','mai','juin','juil','aout','sept','oct','nov','dec'];
          const parseExcelMonth = (v) => {
            if (!v && v !== 0) return '';
            if (typeof v === 'number') {
              const d = new Date(Math.round((v-25569)*86400*1000));
              return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            }
            const s = String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\./g,'');
            // "mars 2026", "janv 2026", "mars-2026"
            const textMatch = s.match(/([a-z]+)[\s\-]*(\d{4})/);
            if (textMatch) {
              let mi = MONTH_NAMES_FR.indexOf(textMatch[1]);
              if (mi < 0) mi = MONTH_ABBR_FR.indexOf(textMatch[1]);
              if (mi < 0) mi = MONTH_NAMES_FR.findIndex(m => m.startsWith(textMatch[1]));
              if (mi >= 0) return `${textMatch[2]}-${String(mi+1).padStart(2,'0')}`;
            }
            // "03/2026", "2026/03", "03-2026"
            const sepMatch = s.match(/^(\d{1,4})[\/\-](\d{1,4})$/);
            if (sepMatch) {
              const [, a, b] = sepMatch;
              if (a.length === 4) return `${a}-${b.padStart(2,'0')}`;
              if (b.length === 4) return `${b}-${a.padStart(2,'0')}`;
            }
            // "01/03/2026" full date → extract year-month
            const fullDate = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (fullDate) return `${fullDate[3]}-${fullDate[2].padStart(2,'0')}`;
            // "2026-03"
            if (/^\d{4}-\d{2}$/.test(s)) return s;
            return '';
          };
          // Auto-detect mois réel column by content if not found by name
          if (moisReelIdx < 0) {
            const knownCols = new Set([dateIdx, catIdx, subCatIdx, commentIdx, valeurIdx, positifIdx].filter(i => i >= 0));
            const MONTH_CONTENT_RE = /^(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|janv|fevr|avr|juil|sept|oct|nov|dec)[\s.\-]*\d{4}$|^\d{1,2}[\/\-]\d{4}$|^\d{4}[\/\-]\d{2}$/;
            for (let col = 0; col < headers.length; col++) {
              if (knownCols.has(col)) continue;
              const samples = rows.slice(1, Math.min(8, rows.length)).map(r => r[col]).filter(v => v !== '' && v != null);
              if (samples.length > 0 && samples.every(v => {
                const s = String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\./g,'');
                return MONTH_CONTENT_RE.test(s);
              })) { moisReelIdx = col; break; }
            }
          }
          const existing = Storage.getExpenses();
          const existingRevenues = Storage.getRevenues();
          let imported = 0; let importedRev = 0;
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row || row.every(c => c === '')) continue;
            const cat = String(row[catIdx]||'').trim(); const positif = row[positifIdx];
            const isRevenue = cat.toLowerCase() === 'revenus' ||
              positif === true || String(positif).toUpperCase() === 'TRUE' || positif === 1;
            const amount = parseFloat(String(row[valeurIdx]).replace(',','.').replace(/[^0-9.-]/g,'')) || 0;
            if (amount <= 0) continue;
            const subCat = String(row[subCatIdx]||'').trim(); const comment = String(row[commentIdx]||'').trim();
            const description = comment || subCat || 'Import';
            const date = parseExcelDate(row[dateIdx]);
            const moisReel = moisReelIdx >= 0 ? parseExcelMonth(row[moisReelIdx]) : '';
            if (isRevenue) {
              existingRevenues.push({ id: Utils.generateId(), description, amount, category: 'Revenus', subcategory: subCat, date, notes: '' });
              importedRev++;
            } else {
              const catNorm = cat.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
              existing.push({ id: Utils.generateId(), description, amount,
                category: CAT_MAP[catNorm]||'Autre', subcategory: subCat, date,
                ...(moisReel && { effectiveDate: moisReel }), notes: '' });
              imported++;
            }
          }
          Storage.saveExpenses(existing);
          Storage.saveRevenues(existingRevenues);
          navigateTo('flux');
          alert(`Import terminé : ${imported} dépense(s) et ${importedRev} revenu(s) importé(s).`);
        } catch (err) { console.error(err); alert('Erreur lors de l\'importation Excel.'); }
      };
      reader.readAsArrayBuffer(file);

    } else if (ext === 'pdf') {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const transactions = await parsePDFTransactions(evt.target.result);
          if (!transactions.length) { alert('Aucune opération détectée dans ce PDF.'); return; }
          showPDFPreview(transactions);
        } catch (err) { console.error(err); alert('Erreur lors de la lecture du PDF.'); }
      };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = '';
  });

  // Initialize: show nav groups correctly, then navigate to default
  document.getElementById('nav-investments-group').style.display = 'none';
  document.getElementById('nav-expenses-group').style.display = '';

  // Default mode is Dépenses, show expenses section
  navigateTo('flux');
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
