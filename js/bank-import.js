const BankImport = {
  // Clé Claude — optionnelle, pour la détection automatique des colonnes uniquement
  getApiKey()      { return localStorage.getItem('claude_api_key') || ''; },
  saveApiKey(key)  { if (key) localStorage.setItem('claude_api_key', key); else localStorage.removeItem('claude_api_key'); },

  init() {
    document.getElementById('bank-import-file')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.handleFile(file);
      e.target.value = '';
    });
    document.getElementById('bank-import-btn')?.addEventListener('click', () => this.openFilePicker());
    document.getElementById('settings-btn')?.addEventListener('click', () => this.openSettings());
    this._refreshSettingsIndicator();
  },

  _refreshSettingsIndicator() {
    const btn = document.getElementById('settings-btn');
    if (!btn) return;
    const hasGemini = !!GeminiCat.getApiKey();
    const hasClaude = !!this.getApiKey();
    btn.title = hasGemini
      ? 'Paramètres (Gemini IA configuré ✓)'
      : hasClaude ? 'Paramètres (Claude configuré)' : 'Paramètres';
    btn.classList.toggle('settings-configured', hasGemini || hasClaude);
  },

  openSettings() {
    const geminiKey = GeminiCat.getApiKey();
    const claudeKey = this.getApiKey();
    Modal.open('Paramètres IA', `
      <div class="settings-section">

        <!-- ── Gemini (catégorisation, gratuit) ───────────────────────── -->
        <div class="settings-block settings-block-primary">
          <div class="settings-block-title">🤖 Google Gemini — Catégorisation automatique <span class="settings-badge-free">Gratuit</span></div>
          <p class="settings-desc">
            À l'import d'un relevé, Gemini lit les libellés de vos transactions et
            suggère automatiquement la bonne catégorie (Alimentation, Transport…).<br><br>
            <strong>Confidentialité :</strong> seul le texte du libellé est envoyé à Google.
            Les montants, dates, soldes et toute information personnelle restent
            strictement dans votre navigateur.
          </p>
          <div class="form-group" style="margin-top:14px">
            <label class="settings-label">Clé API Google Gemini</label>
            <input type="password" id="settings-gemini-key" class="form-input"
              value="${geminiKey}" placeholder="AIza…"
              style="width:100%;font-family:monospace;font-size:13px;margin-top:6px">
            <p style="font-size:12px;color:var(--text-muted);margin-top:6px">
              Clé gratuite sur <strong>aistudio.google.com</strong> → Get API key (sans CB)
            </p>
          </div>
        </div>

        <!-- ── Claude (détection colonnes, optionnel) ──────────────────── -->
        <div class="settings-block" style="margin-top:16px">
          <div class="settings-block-title">⚡ Claude Anthropic — Détection des colonnes <span class="settings-badge-optional">Optionnel</span></div>
          <p class="settings-desc">
            Permet de détecter automatiquement les colonnes de n'importe quel relevé.
            Sans cette clé, la détection se fait par règles (fonctionne pour les formats courants).
          </p>
          <div class="form-group" style="margin-top:14px">
            <label class="settings-label">Clé API Anthropic</label>
            <input type="password" id="settings-claude-key" class="form-input"
              value="${claudeKey}" placeholder="sk-ant-api03-…"
              style="width:100%;font-family:monospace;font-size:13px;margin-top:6px">
            <p style="font-size:12px;color:var(--text-muted);margin-top:6px">
              Clé sur <strong>console.anthropic.com</strong> → API Keys (payant, ~0,001 € / import)
            </p>
          </div>
        </div>

      </div>
      <div class="form-actions" style="margin-top:20px">
        ${(geminiKey || claudeKey) ? '<button class="btn-sm" style="margin-right:auto;color:var(--danger);border:1px solid var(--danger);background:transparent;padding:6px 12px;border-radius:6px;cursor:pointer" onclick="BankImport._clearAllKeys()">Effacer les clés</button>' : ''}
        <button class="btn-secondary" onclick="Modal.close()">Annuler</button>
        <button class="btn-primary" onclick="BankImport._saveSettings()">Enregistrer</button>
      </div>
    `);
  },

  _clearAllKeys() {
    this.saveApiKey('');
    GeminiCat.saveApiKey('');
    Modal.close();
    this._refreshSettingsIndicator();
  },

  _saveSettings() {
    GeminiCat.saveApiKey((document.getElementById('settings-gemini-key')?.value || '').trim());
    this.saveApiKey((document.getElementById('settings-claude-key')?.value || '').trim());
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

        if (rows.length < 2) { alert('Fichier vide ou aucune donnée détectée.'); return; }

        document.getElementById('modal')?.classList.add('modal-wide');
        Modal.open('Analyse du relevé…', `
          <div style="text-align:center;padding:52px 20px">
            <div style="font-size:52px;margin-bottom:20px">🤖</div>
            <p style="font-size:15px;font-weight:700;margin-bottom:8px">Analyse en cours…</p>
            <p style="color:var(--text-muted);font-size:13px">Détection des colonnes et catégorisation</p>
          </div>
        `);

        // Étape 1 : détection des colonnes (Claude si clé dispo, sinon règles)
        let mapping;
        const claudeKey = this.getApiKey();
        if (claudeKey) {
          try {
            mapping = await this._detectColumnsWithClaude(rows, claudeKey);
          } catch (err) {
            console.warn('Claude colonne fallback:', err.message);
            mapping = this._guessMapping(rows[0]);
          }
        } else {
          mapping = this._guessMapping(rows[0]);
        }

        // Étape 2 : parse des transactions (catégorie provisoire par mots-clés)
        const transactions = this._parseWithMapping(rows, mapping);
        if (!transactions.length) {
          document.getElementById('modal')?.classList.remove('modal-wide');
          Modal.close();
          alert('Aucune transaction valide détectée.\n\nVérifiez que le fichier contient des colonnes de date et de montant.');
          return;
        }

        // Étape 3 : catégorisation Gemini (par lot, avec cache)
        const userCats = Storage.getCategories().map(c => c.name);
        const expenseLabels = transactions.filter(t => !t.isRevenue).map(t => t.description);
        if (expenseLabels.length) {
          const catMap = await GeminiCat.categorize(expenseLabels, userCats);
          transactions.forEach(t => {
            if (!t.isRevenue && catMap[t.description]) {
              const { category, subcategory } = catMap[t.description];
              if (category) t.category = category;
              if (subcategory) t.subcategory = subcategory;
            }
          });
        }

        this._showPreview(transactions);
      } catch (err) {
        console.error(err);
        document.getElementById('modal')?.classList.remove('modal-wide');
        Modal.close();
        alert('Erreur lors de la lecture : ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  },

  // Appel Claude pour la détection des colonnes uniquement (pas de catégorisation)
  async _detectColumnsWithClaude(rows, apiKey) {
    const headers  = rows[0];
    const samples  = rows.slice(1, Math.min(5, rows.length));
    const prompt = `Tu analyses la structure d'un relevé bancaire.
En-têtes : ${headers.map((h, i) => `${i}:"${h}"`).join(', ')}
${samples.map((r, i) => `Ligne ${i + 1}: ${r.map((v, j) => `${j}:"${v}"`).join(', ')}`).join('\n')}

Identifie les colonnes : date, description (libellé), amount (unique), debit (séparé), credit (séparé).
Réponds UNIQUEMENT en JSON : {"date":<idx|null>,"description":<idx|null>,"amount":<idx|null>,"debit":<idx|null>,"credit":<idx|null>}`;

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
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude ${resp.status}`);
    }
    const data  = await resp.json();
    const text  = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Réponse Claude invalide');
    return JSON.parse(match[0]);
  },

  _guessMapping(headerRow) {
    const n = s => String(s).toLowerCase()
      .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/ç/g, 'c').trim();
    const h = headerRow.map(n);
    const find = (...terms) => { const i = h.findIndex(c => terms.some(t => c.includes(t))); return i >= 0 ? i : null; };
    return {
      date:        find('date treso', 'date ope', 'date val', 'date'),
      description: find('libelle', 'description', 'commentaire', 'label', 'intitule', 'operation', 'nature'),
      amount:      find('montant', 'amount', 'valeur'),
      debit:       find('debit', 'sortie', 'depense', 'retrait'),
      credit:      find('credit', 'entree', 'revenu', 'depot'),
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
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return '';
  },

  _parseAmount(val) {
    if (val === '' || val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const s = String(val).trim().replace(/[ \s]/g, '');
    const cleaned = s.replace(/\.(?=\d{3}(?:[,]|$))/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  },

  _parseWithMapping(rows, mapping) {
    const transactions = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

      const date = mapping.date !== null ? this._parseDate(row[mapping.date]) : '';
      if (!date) continue;

      const desc = mapping.description !== null ? String(row[mapping.description] || '').trim() : 'Opération';

      let amount = null, isRevenue = false;
      if (mapping.amount !== null) {
        const raw = this._parseAmount(row[mapping.amount]);
        if (raw !== null && raw !== 0) { amount = Math.abs(raw); isRevenue = raw > 0; }
      } else {
        const dAmt = mapping.debit  !== null ? this._parseAmount(row[mapping.debit])  : null;
        const cAmt = mapping.credit !== null ? this._parseAmount(row[mapping.credit]) : null;
        if (dAmt && Math.abs(dAmt) > 0) { amount = Math.abs(dAmt); isRevenue = false; }
        else if (cAmt && Math.abs(cAmt) > 0) { amount = Math.abs(cAmt); isRevenue = true; }
      }
      if (!amount || amount <= 0) continue;

      transactions.push({
        date,
        description: desc || 'Opération',
        amount,
        isRevenue,
        category:    isRevenue ? 'Revenus' : guessCategory(desc),
        subcategory: '',
      });
    }
    return transactions;
  },

  _showPreview(transactions) {
    window._bankTransactions = transactions;
    const userCats = Storage.getCategories().map(c => c.name);
    const expCats  = userCats.length ? userCats : Utils.EXPENSE_CATEGORIES;
    const revCats  = Utils.REVENUE_CATEGORIES;
    const hasGemini = !!GeminiCat.getApiKey();

    const rows = transactions.map((t, i) => {
      const cats = t.isRevenue ? revCats : expCats;
      const opts = cats.map(c => `<option value="${c}"${c === t.category ? ' selected' : ''}>${c}</option>`).join('');
      return `<tr>
        <td><input type="checkbox" data-idx="${i}" checked></td>
        <td>${Utils.formatDate(t.date)}</td>
        <td class="bank-desc">${t.description}</td>
        <td class="text-right"><strong class="${t.isRevenue ? 'positive' : 'negative'}">${t.isRevenue ? '+' : '−'}${Utils.formatCurrency(t.amount)}</strong></td>
        <td><select data-cat="${i}" class="select-input bank-cat-sel"
          onchange="GeminiCat.learn('${t.description.replace(/'/g,"\\'")}', this.value, '')">${opts}</select></td>
      </tr>`;
    }).join('');

    const note = hasGemini
      ? `<div class="bank-import-note bank-note-ok">
           🤖 <strong>Catégorisation par Gemini IA.</strong>
           <span class="privacy-badge">🔒 Seuls les libellés sont envoyés — jamais les montants, dates ni données personnelles.</span>
         </div>`
      : `<div class="bank-import-note bank-note-warn">
           💡 Catégories détectées par mots-clés.
           <a href="#" onclick="BankImport.openSettings();return false">Configurer Gemini (gratuit) →</a>
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
    const checkboxes   = document.querySelectorAll('[data-idx]');
    const catSelects   = document.querySelectorAll('[data-cat]');
    const expenses     = Storage.getExpenses();
    const revenues     = Storage.getRevenues();
    let impExp = 0, impRev = 0;

    checkboxes.forEach((cb, i) => {
      if (!cb.checked) return;
      const t   = transactions[i];
      const cat = catSelects[i]?.value || t.category;

      // Apprentissage : si la catégorie finale diffère de la suggestion, on mémorise
      if (!t.isRevenue && cat !== t.category) {
        GeminiCat.learn(t.description, cat, '');
      }

      if (t.isRevenue) {
        revenues.push({ id: Utils.generateId(), description: t.description, amount: t.amount, category: cat, date: t.date, notes: 'Import bancaire' });
        impRev++;
      } else {
        expenses.push({ id: Utils.generateId(), description: t.description, amount: t.amount, category: cat, subcategory: t.subcategory || '', date: t.date, notes: 'Import bancaire' });
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
