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
    const investments = Storage.getInvestments();
    const expenses = Storage.getExpenses();
    const budgets = Storage.getBudgets();
    const patrimony = Storage.getPatrimony();

    document.getElementById('current-date').textContent = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }).format(new Date());

    const portfolioValue = investments.reduce((s, i) => s + i.quantity * i.currentPrice, 0);
    const portfolioCost = investments.reduce((s, i) => s + i.quantity * i.buyPrice, 0);
    const gain = portfolioValue - portfolioCost;
    const gainPct = portfolioCost > 0 ? (gain / portfolioCost * 100) : 0;

    document.getElementById('kpi-portfolio').textContent = Utils.formatCurrency(portfolioValue);
    const perfEl = document.getElementById('kpi-performance');
    perfEl.textContent = Utils.formatCurrency(gain);
    perfEl.className = 'kpi-value ' + (gain >= 0 ? 'positive' : 'negative');
    document.getElementById('kpi-performance-sub').textContent = Utils.formatPercent(gainPct);

    const manualAssets = patrimony.filter(i => i.type === 'actif').reduce((s, i) => s + i.value, 0);
    const liabilities = patrimony.filter(i => i.type === 'passif').reduce((s, i) => s + i.value, 0);
    const netWorth = portfolioValue + manualAssets - liabilities;
    document.getElementById('kpi-net-worth').textContent = Utils.formatCurrency(netWorth);
    document.getElementById('kpi-net-worth-sub').textContent =
      `Actifs: ${Utils.formatCurrency(portfolioValue + manualAssets)} · Passifs: ${Utils.formatCurrency(liabilities)}`;

    const month = Utils.getCurrentMonth();
    const monthTotal = expenses.filter(e => Utils.getExpenseMonth(e) === month).reduce((s, e) => s + e.amount, 0);
    const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
    const remaining = totalBudget - monthTotal;

    document.getElementById('kpi-expenses').textContent = Utils.formatCurrency(monthTotal);
    const expSubEl = document.getElementById('kpi-expenses-sub');
    expSubEl.textContent = totalBudget > 0 ? `Budget restant: ${Utils.formatCurrency(remaining)}` : 'Aucun budget défini';
    expSubEl.className = 'kpi-sub ' + (totalBudget > 0 ? (remaining >= 0 ? 'positive' : 'negative') : '');

    Charts.portfolioAllocation(investments);
    Charts.expensesBudget(expenses, budgets);
    this._renderRecentInvestments(investments);
    this._renderRecentExpenses(expenses);
  },

  _renderRecentInvestments(investments) {
    const container = document.getElementById('recent-investments');
    const recent = [...investments].sort((a, b) => (b.buyDate || '').localeCompare(a.buyDate || '')).slice(0, 5);
    if (!recent.length) { container.innerHTML = '<p class="text-muted">Aucun investissement</p>'; return; }
    container.innerHTML = recent.map(inv => {
      const value = inv.quantity * inv.currentPrice;
      const gain = value - inv.quantity * inv.buyPrice;
      return `<div class="recent-item">
        <div>
          <strong>${inv.name}</strong>${inv.ticker ? ` <small class="text-muted">· ${inv.ticker}</small>` : ''}<br>
          <small class="text-muted">${Utils.INVESTMENT_TYPES[inv.type]}</small>
        </div>
        <div class="text-right">
          <strong>${Utils.formatCurrency(value)}</strong><br>
          <small class="${gain >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(gain)}</small>
        </div>
      </div>`;
    }).join('');
  },

  _renderRecentExpenses(expenses) {
    const container = document.getElementById('recent-expenses');
    const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    if (!recent.length) { container.innerHTML = '<p class="text-muted">Aucune dépense</p>'; return; }
    container.innerHTML = recent.map(exp => `
      <div class="recent-item">
        <div>
          <strong>${exp.description}</strong><br>
          <small class="text-muted">${exp.category} · ${Utils.formatDate(exp.date)}</small>
        </div>
        <strong class="negative">${Utils.formatCurrency(exp.amount)}</strong>
      </div>`).join('');
  },
};

function navigateTo(sectionId) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.section === sectionId));
  document.querySelectorAll('.section').forEach(el => el.classList.toggle('hidden', el.id !== `section-${sectionId}`));
  switch (sectionId) {
    case 'dashboard':   Dashboard.render(); break;
    case 'investments': Investments.render(); break;
    case 'expenses':    Expenses.render(); break;
    case 'budget':      Budget.render(); break;
    case 'patrimony':   Patrimony.render(); break;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  Expenses.init();

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); navigateTo(el.dataset.section); });
  });

  document.getElementById('modal-close').addEventListener('click', Modal.close);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') Modal.close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Modal.close(); });

  document.getElementById('add-investment-btn').addEventListener('click', () => Investments.openAddForm());
  document.getElementById('add-expense-btn').addEventListener('click', () => Expenses.openAddForm());
  document.getElementById('add-budget-btn').addEventListener('click', () => Budget.openAddForm());
  document.getElementById('add-patrimony-btn').addEventListener('click', () => Patrimony.openAddForm());

  document.getElementById('inv-search').addEventListener('input', () => Investments.render());
  document.getElementById('inv-filter-type').addEventListener('change', () => Investments.render());
  document.getElementById('exp-search').addEventListener('input', () => Expenses.render());
  document.getElementById('exp-filter-cat').addEventListener('change', () => Expenses.render());

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
          const CAT_MAP = {
            'epargne':'Épargne','transport':'Transport','sante':'Santé','loisir':'Loisirs',
            'loisirs':'Loisirs','alimentation':'Alimentation','abonnements':'Abonnements',
            'divers':'Autre','logement':'Logement','vetements':'Vêtements','education':'Éducation','restaurants':'Restaurants',
          };
          const parseExcelDate = (v) => {
            if (!v && v !== 0) return '';
            if (typeof v === 'number') { const d = new Date(Math.round((v-25569)*86400*1000)); return d.toISOString().split('T')[0]; }
            const s = String(v); const parts = s.split('/');
            if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
            return s;
          };
          const existing = Storage.getExpenses(); let imported = 0;
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row || row.every(c => c === '')) continue;
            const cat = String(row[catIdx]||'').trim(); const positif = row[positifIdx];
            if (cat.toLowerCase() === 'revenus') continue;
            if (positif === true || String(positif).toUpperCase() === 'TRUE' || positif === 1) continue;
            const amount = parseFloat(String(row[valeurIdx]).replace(',','.')) || 0;
            if (amount <= 0) continue;
            const subCat = String(row[subCatIdx]||'').trim(); const comment = String(row[commentIdx]||'').trim();
            const catNorm = cat.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
            existing.push({ id: Utils.generateId(), description: [subCat,comment].filter(Boolean).join(' – ')||'Import',
              amount, category: CAT_MAP[catNorm]||'Autre', date: parseExcelDate(row[dateIdx]), notes: '' });
            imported++;
          }
          Storage.saveExpenses(existing); navigateTo('expenses');
          alert(`${imported} dépense(s) importée(s) depuis Excel !`);
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

  navigateTo('dashboard');
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

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byY = {};
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!byY[y]) byY[y] = [];
      byY[y].push({ x: item.transform[4], str: item.str });
    }
    for (const y of Object.keys(byY).map(Number).sort((a,b) => b-a)) {
      const line = byY[y].sort((a,b) => a.x-b.x).map(i => i.str).join(' ').trim();
      const dateMatch = line.match(/^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+)$/);
      if (!dateMatch) continue;
      const [, rawDate, rest] = dateMatch;
      const amountMatches = [...rest.matchAll(/\b(\d[\d\s]*[,\.]\d{2})\b/g)];
      if (!amountMatches.length) continue;
      const rawAmount = amountMatches[amountMatches.length-1][1].replace(/\s/g,'').replace(',','.');
      const amount = parseFloat(rawAmount);
      if (isNaN(amount) || amount <= 0 || amount > 50000) continue;
      const firstAmtIdx = rest.indexOf(amountMatches[0][0]);
      const description = (firstAmtIdx > 0 ? rest.substring(0, firstAmtIdx) : rest).trim();
      if (!description) continue;
      const parts = rawDate.split('/');
      let year = new Date().getFullYear();
      if (parts.length === 3) { year = parseInt(parts[2]); if (year < 100) year += 2000; }
      const date = `${year}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
      transactions.push({ date, description, amount, category: guessCategory(description) });
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
  navigateTo('expenses');
  alert(`${imported} dépense(s) importée(s) !`);
}
