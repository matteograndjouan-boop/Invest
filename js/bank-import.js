const BankImport = {
  getApiKey() { return localStorage.getItem('claude_api_key') || ''; },
  saveApiKey(key) {
    if (key) localStorage.setItem('claude_api_key', key);
    else localStorage.removeItem('claude_api_key');
  },

  init() {
    const fileInput = document.getElementById('bank-import-file');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleFile(file);
        e.target.value = '';
      });
    }
    document.getElementById('bank-import-btn')?.addEventListener('click', () => this.openFilePicker());
    document.getElementById('settings-btn')?.addEventListener('click', () => this.openSettings());
    this._refreshSettingsIndicator();
  },

  _refreshSettingsIndicator() {
    const btn = document.getElementById('settings-btn');
    if (!btn) return;
    btn.title = this.getApiKey() ? 'Paramètres (clé Claude configurée ✓)' : 'Paramètres';
    btn.classList.toggle('settings-configured', !!this.getApiKey());
  },

  openSettings() {
    const key = this.getApiKey();
    const hasKey = !!key;
    Modal.open('Paramètres', `
      <div class="settings-section">
        <div class="settings-icon-row">⚙️</div>
        <h3 style="text-align:center;margin-bottom:8px;font-size:15px">Clé API Claude</h3>
        <p class="settings-desc">
          Permet d'analyser vos relevés bancaires intelligemment : détection automatique des colonnes et
          catégorisation des transactions par IA.<br><br>
          Stockée <strong>uniquement dans votre navigateur</strong>.
          Jamais transmise à autre chose qu'à l'API Anthropic directement.
        </p>
        <div class="form-group" style="margin-top:16px">
          <label style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)">Clé API Anthropic</label>
          <input type="password" id="settings-api-key" class="form-input"
            value="${key}" placeholder="sk-ant-api03-…"
            style="width:100%;font-family:monospace;font-size:13px;margin-top:6px">
          <p style="font-size:12px;color:var(--text-muted);margin-top:6px">
            Créez votre clé sur <strong>console.anthropic.com</strong> → API Keys
          </p>
        </div>
      </div>
      <div class="form-actions" style="margin-top:20px">
        ${hasKey ? '<button class="btn-sm" style="margin-right:auto;color:var(--danger);border:1px solid var(--danger);background:transparent;padding:6px 12px;border-radius:6px;cursor:pointer" onclick="BankImport._clearKey()">Supprimer la clé</button>' : ''}
        <button class="btn-secondary" onclick="Modal.close()">Annuler</button>
        <button class="btn-primary" onclick="BankImport._saveSettings()">Enregistrer</button>
      </div>
    `);
  },

  _clearKey() {
    this.saveApiKey('');
    Modal.close();
    this._refreshSettingsIndicator();
  },

  _saveSettings() {
    const key = (document.getElementById('settings-api-key')?.value || '').trim();
    this.saveApiKey(key);
    Modal.close();
    this._refreshSettingsIndicator();
  },

  openFilePicker() {
    document.getElementById('bank-import-file')?.click();
  },

  async handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      alert('Format non supporté. Utilisez un fichier CSV ou Excel (.xlsx / .xls).');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array', codepage: 1252 });
        const ws = wb.Sheets[wb.SheetNames[0]];
        let rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        rows = rows.filter(r => r.some(c => c !== '' && c !== null && c !== undefined));

        if (rows.length < 2) {
          alert('Fichier vide ou aucune donnée détectée.');
          return;
        }

        document.getElementById('modal')?.classList.add('modal-wide');
        Modal.open('Analyse du relevé…', `
          <div style="text-align:center;padding:52px 20px">
            <div style="font-size:52px;margin-bottom:20px">🤖</div>
            <p style="font-size:15px;font-weight:700;margin-bottom:8px">Analyse en cours…</p>
            <p style="color:var(--text-muted);font-size:13px">
              ${this.getApiKey() ? 'Claude IA identifie la structure de votre relevé' : 'Détection automatique des colonnes'}
            </p>
          </div>
        `);

        let mapping, aiCategories = null;
        const apiKey = this.getApiKey();

        if (apiKey) {
          try {
            const result = await this._callClaude(rows, apiKey);
            mapping = result.mapping;
            aiCategories = result.categories;
          } catch (err) {
            console.warn('Claude API fallback:', err.message);
            mapping = this._guessMapping(rows[0]);
          }
        } else {
          mapping = this._guessMapping(rows[0]);
        }

        const transactions = this._parseWithMapping(rows, mapping, aiCategories);

        if (!transactions.length) {
          document.getElementById('modal')?.classList.remove('modal-wide');
          Modal.close();
          alert('Aucune transaction valide détectée.\n\nVérifiez que le fichier est bien un relevé bancaire avec des colonnes de date et de montant.');
          return;
        }

        this._showPreview(transactions, !apiKey || !aiCategories);
      } catch (err) {
        console.error(err);
        document.getElementById('modal')?.classList.remove('modal-wide');
        Modal.close();
        alert('Erreur lors de la lecture : ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  },

  async _callClaude(rows, apiKey) {
    const headers = rows[0];
    const sampleRows = rows.slice(1, Math.min(7, rows.length));
    const userCats = Storage.getCategories().map(c => c.name);
    const catList = userCats.length
      ? userCats.join(', ')
      : 'Alimentation, Transport, Logement, Abonnements, Santé, Restaurants, Loisirs, Shopping, Divers, Autre';

    const prompt = `Tu analyses la structure d'un relevé bancaire exporté en tableur.

En-têtes (index 0 à ${headers.length - 1}) : ${headers.map((h, i) => `${i}:"${h}"`).join(', ')}

${sampleRows.map((r, i) => `Ligne ${i + 1}: ${r.map((v, j) => `${j}:"${v}"`).join(', ')}`).join('\n')}

Identifie les colonnes pour :
- date : date de l'opération (format JJ/MM/AAAA, AAAA-MM-JJ, ou numéro Excel)
- description : libellé/intitulé/commentaire
- amount : montant unique (négatif=dépense, positif=revenu) — null si colonnes séparées
- debit : colonne débit/sortie uniquement — null sinon
- credit : colonne crédit/entrée uniquement — null sinon

Pour chaque ligne de données, suggère une catégorie parmi : ${catList}

Réponds UNIQUEMENT en JSON :
{"mapping":{"date":<idx|null>,"description":<idx|null>,"amount":<idx|null>,"debit":<idx|null>,"credit":<idx|null>},"categories":[${sampleRows.map(() => '"…"').join(',')}]}`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-calls': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erreur API ${resp.status}`);
    }

    const data = await resp.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Réponse invalide');
    return JSON.parse(match[0]);
  },

  _guessMapping(headerRow) {
    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const h = headerRow.map(norm);
    const find = (...terms) => {
      const i = h.findIndex(col => terms.some(t => col.includes(t)));
      return i >= 0 ? i : null;
    };
    return {
      date: find('date treso', 'date ope', 'date val', 'date'),
      description: find('libelle', 'description', 'commentaire', 'label', 'intitule', 'operation', 'nature'),
      amount: find('montant', 'amount', 'valeur'),
      debit: find('debit', 'sortie', 'depense', 'retrait'),
      credit: find('credit', 'entree', 'revenu', 'depot', 'virement recu'),
    };
  },

  _parseDate(val) {
    if (val === '' || val === null || val === undefined) return '';
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return d.toISOString().split('T')[0];
    }
    const s = String(val).trim();
    const m = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return '';
  },

  _parseAmount(val) {
    if (val === '' || val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const s = String(val).trim().replace(/ |\s/g, '');
    // French format: 1.234,56 → remove thousand-sep dots, swap comma
    const cleaned = s.replace(/\.(?=\d{3}(?:[,]|$))/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  },

  _parseWithMapping(rows, mapping, aiCategories) {
    const transactions = [];
    const userCats = Storage.getCategories().map(c => c.name);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

      const date = mapping.date !== null ? this._parseDate(row[mapping.date]) : '';
      if (!date) continue;

      const desc = mapping.description !== null
        ? String(row[mapping.description] || '').trim()
        : 'Opération';

      let amount = null;
      let isRevenue = false;

      if (mapping.amount !== null) {
        const raw = this._parseAmount(row[mapping.amount]);
        if (raw !== null && raw !== 0) {
          amount = Math.abs(raw);
          isRevenue = raw > 0;
        }
      } else {
        const debitAmt = mapping.debit !== null ? this._parseAmount(row[mapping.debit]) : null;
        const creditAmt = mapping.credit !== null ? this._parseAmount(row[mapping.credit]) : null;
        if (debitAmt && Math.abs(debitAmt) > 0) {
          amount = Math.abs(debitAmt);
          isRevenue = false;
        } else if (creditAmt && Math.abs(creditAmt) > 0) {
          amount = Math.abs(creditAmt);
          isRevenue = true;
        }
      }

      if (!amount || amount <= 0) continue;

      const aiCat = aiCategories ? aiCategories[i - 1] : null;
      let category;
      if (isRevenue) {
        category = 'Revenus';
      } else if (aiCat && (userCats.includes(aiCat) || Utils.EXPENSE_CATEGORIES.includes(aiCat))) {
        category = aiCat;
      } else {
        category = guessCategory(desc);
      }

      transactions.push({ date, description: desc || 'Opération', amount, isRevenue, category });
    }

    return transactions;
  },

  _showPreview(transactions, noAI) {
    window._bankTransactions = transactions;
    const userCats = Storage.getCategories().map(c => c.name);
    const expCats = userCats.length ? userCats : Utils.EXPENSE_CATEGORIES;
    const revCats = Utils.REVENUE_CATEGORIES;

    const rows = transactions.map((t, i) => {
      const cats = t.isRevenue ? revCats : expCats;
      const opts = cats.map(c => `<option value="${c}"${c === t.category ? ' selected' : ''}>${c}</option>`).join('');
      return `<tr>
        <td><input type="checkbox" data-idx="${i}" checked></td>
        <td>${Utils.formatDate(t.date)}</td>
        <td class="bank-desc">${t.description}</td>
        <td class="text-right"><strong class="${t.isRevenue ? 'positive' : 'negative'}">${t.isRevenue ? '+' : '−'}${Utils.formatCurrency(t.amount)}</strong></td>
        <td><select data-cat="${i}" class="select-input bank-cat-sel">${opts}</select></td>
      </tr>`;
    }).join('');

    const note = noAI
      ? `<div class="bank-import-note bank-note-warn">
           💡 <strong>Sans clé Claude :</strong> catégories détectées par mots-clés.
           <a href="#" onclick="BankImport.openSettings();return false">Configurer l'IA →</a>
         </div>`
      : `<div class="bank-import-note bank-note-ok">
           🤖 <strong>Catégories suggérées par Claude IA.</strong> Vérifiez avant d'importer.
         </div>`;

    document.getElementById('modal')?.classList.add('modal-wide');
    Modal.open(`Relevé bancaire — ${transactions.length} opération(s)`, `
      ${note}
      <div class="bank-preview-wrap">
        <table class="data-table bank-preview-table">
          <thead><tr>
            <th style="width:36px"><input type="checkbox" id="bank-check-all" checked></th>
            <th>Date</th><th>Description</th><th class="text-right">Montant</th><th>Catégorie</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="form-actions bank-preview-actions">
        <button class="btn-secondary" onclick="BankImport._cancelPreview()">Annuler</button>
        <button class="btn-primary" onclick="BankImport._confirmImport()">Importer les sélectionnées</button>
      </div>
    `);

    document.getElementById('bank-check-all')?.addEventListener('change', (e) => {
      document.querySelectorAll('[data-idx]').forEach(cb => { cb.checked = e.target.checked; });
    });
  },

  _cancelPreview() {
    window._bankTransactions = null;
    document.getElementById('modal')?.classList.remove('modal-wide');
    Modal.close();
  },

  _confirmImport() {
    const transactions = window._bankTransactions || [];
    const checkboxes = document.querySelectorAll('[data-idx]');
    const catSelects = document.querySelectorAll('[data-cat]');
    const expenses = Storage.getExpenses();
    const revenues = Storage.getRevenues();
    let impExp = 0, impRev = 0;

    checkboxes.forEach((cb, i) => {
      if (!cb.checked) return;
      const t = transactions[i];
      const cat = catSelects[i]?.value || t.category;
      if (t.isRevenue) {
        revenues.push({ id: Utils.generateId(), description: t.description, amount: t.amount, category: cat, date: t.date, notes: 'Import bancaire' });
        impRev++;
      } else {
        expenses.push({ id: Utils.generateId(), description: t.description, amount: t.amount, category: cat, date: t.date, notes: 'Import bancaire' });
        impExp++;
      }
    });

    Storage.saveExpenses(expenses);
    Storage.saveRevenues(revenues);
    window._bankTransactions = null;
    document.getElementById('modal')?.classList.remove('modal-wide');
    Modal.close();
    navigateTo('flux');
    alert(`Import terminé ✓\n${impExp} dépense(s) et ${impRev} revenu(s) importé(s).`);
  },
};
