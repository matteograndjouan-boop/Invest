const BankImport = {
  getApiKey()      { return localStorage.getItem('claude_api_key') || ''; },
  saveApiKey(key)  { if (key) localStorage.setItem('claude_api_key', key); else localStorage.removeItem('claude_api_key'); },
  _getPdfAiEnabled() { return localStorage.getItem('bank_pdf_ai_enabled') === '1'; },
  _setPdfAiEnabled(v) { localStorage.setItem('bank_pdf_ai_enabled', v ? '1' : '0'); },

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
    btn.title = hasGemini ? 'Paramètres (Gemini IA configuré ✓)'
      : hasClaude ? 'Paramètres (Claude configuré)' : 'Paramètres';
    btn.classList.toggle('settings-configured', hasGemini || hasClaude);
  },

  openSettings() {
    const geminiKey = GeminiCat.getApiKey();
    const claudeKey = this.getApiKey();
    const pdfAi    = this._getPdfAiEnabled();
    Modal.open('Paramètres IA & Import', `
      <div class="settings-section">

        <div class="settings-block settings-block-primary">
          <div class="settings-block-title">🤖 Google Gemini — Catégorisation automatique <span class="settings-badge-free">Gratuit</span></div>
          <p class="settings-desc">
            Gemini suggère automatiquement la catégorie de chaque dépense à partir du libellé.<br><br>
            <strong>Confidentialité :</strong> seul le texte du libellé est envoyé à Google —
            jamais les montants, dates ni données personnelles.
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

        <div class="settings-block" style="margin-top:14px">
          <div class="settings-block-title">⚡ Claude Anthropic — Dernier recours PDF <span class="settings-badge-optional">Optionnel</span></div>
          <p class="settings-desc">
            Pour les relevés PDF, la méthode principale est l'encadrement local des colonnes
            (100 % privé). Si un relevé est trop atypique pour être encadré, un bouton
            « dernier recours » apparaît dans l'écran d'encadrement pour envoyer le texte
            complet du relevé à Claude — uniquement si vous l'activez ci-dessous.
          </p>
          <div class="form-group" style="margin-top:14px">
            <label class="settings-label">Clé API Anthropic</label>
            <input type="password" id="settings-claude-key" class="form-input"
              value="${claudeKey}" placeholder="sk-ant-api03-…"
              style="width:100%;font-family:monospace;font-size:13px;margin-top:6px">
          </div>
        </div>

        <div class="settings-block" style="margin-top:14px">
          <div class="settings-block-title">📄 Import PDF — IA en dernier recours <span class="settings-badge-optional">Désactivé par défaut</span></div>
          <p class="settings-desc">
            ⚠️ <strong>Attention :</strong> si activée, cette option permet d'envoyer le contenu
            complet du relevé (montants, dates, données personnelles) à l'IA.
            Contrairement à la catégorisation Gemini, ce mode ne se limite pas aux libellés.
          </p>
          <label style="display:flex;align-items:center;gap:10px;margin-top:10px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="settings-pdf-ai" ${pdfAi ? 'checked' : ''}>
            Activer l'option IA en dernier recours pour les PDF (opt-in, envoie les données complètes)
          </label>
        </div>

      </div>
      <div class="form-actions" style="margin-top:20px;flex-wrap:wrap;gap:8px">
        <button class="btn-sm" style="color:var(--text-muted);border:1px solid var(--border);background:transparent;padding:6px 12px;border-radius:6px;cursor:pointer;margin-right:auto"
          onclick="if(confirm('Vider le cache de catégorisation Gemini ? Les libellés déjà appris seront oubliés.')){GeminiCat.clearCache();alert('Cache vidé.');}">
          🗑 Vider le cache Gemini
        </button>
        ${(geminiKey || claudeKey) ? '<button class="btn-sm" style="color:var(--danger);border:1px solid var(--danger);background:transparent;padding:6px 12px;border-radius:6px;cursor:pointer" onclick="BankImport._clearAllKeys()">Effacer les clés</button>' : ''}
        <button class="btn-secondary" onclick="Modal.close()">Annuler</button>
        <button class="btn-primary" onclick="BankImport._saveSettings()">Enregistrer</button>
      </div>
    `);
  },

  _clearAllKeys() {
    this.saveApiKey(''); GeminiCat.saveApiKey('');
    Modal.close(); this._refreshSettingsIndicator();
  },

  _saveSettings() {
    GeminiCat.saveApiKey((document.getElementById('settings-gemini-key')?.value || '').trim());
    this.saveApiKey((document.getElementById('settings-claude-key')?.value || '').trim());
    this._setPdfAiEnabled(document.getElementById('settings-pdf-ai')?.checked || false);
    Modal.close(); this._refreshSettingsIndicator();
  },

  openFilePicker() { document.getElementById('bank-import-file')?.click(); },

  async handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') await this._handlePDF(file);
    else if (['csv', 'xlsx', 'xls', 'tsv'].includes(ext)) await this._handleSpreadsheet(file);
    else alert('Format non supporté. Utilisez CSV, Excel (.xlsx/.xls/.tsv) ou PDF.');
  },

  // ── TABLEUR ───────────────────────────────────────────────────────────────

  async _handleSpreadsheet(file) {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb  = XLSX.read(evt.target.result, { type: 'array', codepage: 1252 });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        let rows  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        rows = rows.filter(r => r.some(c => c !== '' && c !== null && c !== undefined));
        if (rows.length < 2) { alert('Fichier vide ou aucune donnée détectée.'); return; }

        const headerIdx  = this._findHeaderRow(rows);
        const guessed    = this._guessMapping(rows[headerIdx]);
        const profileKey = this._profileKey(rows[headerIdx]);
        const saved      = this._getProfiles()[profileKey];

        document.getElementById('modal')?.classList.add('modal-wide');
        this._showMappingWizard(rows, headerIdx, saved || guessed, profileKey, !!saved, file.name);
      } catch (err) {
        console.error(err);
        alert('Erreur lors de la lecture : ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  },

  _findHeaderRow(rows) {
    let best = 0, bestScore = -Infinity;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      let score = 0;
      for (const cell of rows[i]) {
        const s = String(cell).trim();
        if (!s) continue;
        if (isNaN(parseFloat(s)) && !/^\d{1,2}[\/\-]\d{1,2}/.test(s)) score += 2;
        else score -= 3;
      }
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  },

  _guessMapping(headerRow) {
    const n = s => String(s).toLowerCase()
      .replace(/[àâä]/g,'a').replace(/[éèêë]/g,'e').replace(/[îï]/g,'i')
      .replace(/[ôö]/g,'o').replace(/[ùûü]/g,'u').replace(/ç/g,'c').trim();
    const h = headerRow.map(n);
    // Correspondance par inclusion
    const find = (...terms) => { const i = h.findIndex(c => terms.some(t => c.includes(t))); return i >= 0 ? i : null; };
    // Correspondance exacte (pour éviter que "jour" matche "bonjour")
    const exact = (...terms) => { const i = h.findIndex(c => terms.some(t => c === t)); return i >= 0 ? i : null; };

    const date     = find('date treso','date compta','date ope','date val','date transaction','date');
    // Ne chercher les composants que si aucune colonne date unifiée n'est trouvée
    const dateDay   = date === null ? (exact('jour','day','jj','j')   ?? find('jour','day'))   : null;
    const dateMonth = date === null ? (exact('mois','month','mm','m') ?? find('mois','month'))  : null;
    const dateYear  = date === null ? (exact('annee','an','year','yyyy','aaaa') ?? find('annee','an ','year','aaaa')) : null;

    return {
      date,
      dateDay,
      dateMonth,
      dateYear,
      description: find('libelle','description','commentaire','label','intitule','operation','nature','motif','objet','details'),
      amount:      find('montant','amount','valeur','somme'),
      debit:       find('debit','sortie','depense','retrait','imputation'),
      credit:      find('credit','entree','revenu','depot','versement'),
    };
  },

  _profileKey(headerRow) {
    return headerRow.map(h => String(h).toLowerCase().trim()).filter(Boolean).sort().join('|');
  },

  _getProfiles() {
    try { return JSON.parse(localStorage.getItem('invest_bank_profiles') || '{}'); } catch { return {}; }
  },
  _saveProfile(key, mapping) {
    const p = this._getProfiles(); p[key] = mapping;
    try { localStorage.setItem('invest_bank_profiles', JSON.stringify(p)); } catch(e) {}
  },

  _showMappingWizard(rows, headerIdx, mapping, profileKey, isKnown, fileName) {
    window._bankMappingData = { rows, headerIdx, profileKey };

    const headerRow  = rows[headerIdx];
    const sampleRows = rows.slice(headerIdx + 1, headerIdx + 4).filter(r => r.some(c => c !== '' && c !== null));
    const isSplit      = mapping.debit !== null || mapping.credit !== null;
    const isDateSplit  = mapping.dateMonth !== null || mapping.dateYear !== null;

    const colOpts = (selected, withNone = false) =>
      (withNone ? '<option value="">— aucune —</option>' : '') +
      headerRow.map((h, i) =>
        `<option value="${i}"${selected === i ? ' selected' : ''}>${String(h).trim() || 'Col. ' + (i + 1)}</option>`
      ).join('');

    const thCells = headerRow.map(h => `<th>${String(h).trim() || '—'}</th>`).join('');
    const tdRows  = sampleRows.map(row =>
      `<tr>${headerRow.map((_, i) => `<td>${String(row[i] ?? '').trim().slice(0, 22)}</td>`).join('')}</tr>`
    ).join('');

    const badge = isKnown
      ? `<span class="mapping-profile-badge mapping-profile-known">✓ Format reconnu — mapping appliqué</span>`
      : `<span class="mapping-profile-badge mapping-profile-new">Nouveau format — vérifiez les champs</span>`;

    Modal.open('Correspondance des colonnes', `
      <div class="mapping-wizard">
        <div class="mapping-top-bar">
          ${badge}
          <span class="mapping-top-info">${rows.length - headerIdx - 1} ligne(s) · ${fileName}</span>
        </div>

        <div class="mapping-sample-wrap">
          <div class="mapping-sample-label">Aperçu des premières lignes :</div>
          <div class="mapping-sample-scroll">
            <table class="mapping-sample-table"><thead><tr>${thCells}</tr></thead><tbody>${tdRows}</tbody></table>
          </div>
        </div>

        <div class="mapping-fields">
          <div class="mapping-field-row">
            <label class="mapping-field-label">📅 Date</label>
            <div>
              <div class="mapping-amount-type">
                <label class="mapping-radio-lbl"><input type="radio" name="map-date-type" value="single"${!isDateSplit ? ' checked' : ''}
                  onchange="document.getElementById('map-date-single').style.display='';document.getElementById('map-date-parts').style.display='none'">
                  Colonne unique</label>
                <label class="mapping-radio-lbl"><input type="radio" name="map-date-type" value="parts"${isDateSplit ? ' checked' : ''}
                  onchange="document.getElementById('map-date-single').style.display='none';document.getElementById('map-date-parts').style.display=''">
                  Colonnes séparées (Jour / Mois / Année)</label>
              </div>
              <div id="map-date-single"${isDateSplit ? ' style="display:none"' : ''}>
                <select id="map-date" class="select-input">${colOpts(mapping.date, true)}</select>
              </div>
              <div id="map-date-parts"${!isDateSplit ? ' style="display:none"' : ''}>
                <div class="mapping-split-row mapping-split-3">
                  <div><label class="mapping-sub-lbl">Jour <small>(optionnel)</small></label><select id="map-date-day" class="select-input">${colOpts(mapping.dateDay, true)}</select></div>
                  <div><label class="mapping-sub-lbl">Mois</label><select id="map-date-month" class="select-input">${colOpts(mapping.dateMonth, true)}</select></div>
                  <div><label class="mapping-sub-lbl">Année <small style="color:var(--text-muted)">(an en cours si vide)</small></label><select id="map-date-year" class="select-input">${colOpts(mapping.dateYear, true)}</select></div>
                </div>
              </div>
            </div>
          </div>
          <div class="mapping-field-row">
            <label class="mapping-field-label">📝 Libellé</label>
            <select id="map-desc" class="select-input">${colOpts(mapping.description, true)}</select>
          </div>
          <div class="mapping-field-row">
            <label class="mapping-field-label">💶 Montant</label>
            <div>
              <div class="mapping-amount-type">
                <label class="mapping-radio-lbl"><input type="radio" name="map-amt-type" value="single"${!isSplit ? ' checked' : ''}
                  onchange="document.getElementById('map-single-wrap').style.display='';document.getElementById('map-split-wrap').style.display='none'">
                  Colonne unique (+/−)</label>
                <label class="mapping-radio-lbl"><input type="radio" name="map-amt-type" value="split"${isSplit ? ' checked' : ''}
                  onchange="document.getElementById('map-single-wrap').style.display='none';document.getElementById('map-split-wrap').style.display=''">
                  Débit / Crédit séparés</label>
              </div>
              <div id="map-single-wrap"${isSplit ? ' style="display:none"' : ''}>
                <select id="map-amount" class="select-input">${colOpts(mapping.amount, true)}</select>
              </div>
              <div id="map-split-wrap"${!isSplit ? ' style="display:none"' : ''}>
                <div class="mapping-split-row">
                  <div><label class="mapping-sub-lbl">Débit (sorties)</label><select id="map-debit" class="select-input">${colOpts(mapping.debit, true)}</select></div>
                  <div><label class="mapping-sub-lbl">Crédit (entrées)</label><select id="map-credit" class="select-input">${colOpts(mapping.credit, true)}</select></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <label class="mapping-save-lbl">
          <input type="checkbox" id="map-save-profile" checked>
          Mémoriser ce mapping pour les prochains fichiers de ce format
        </label>
      </div>
      <div class="form-actions" style="margin-top:16px">
        <button class="btn-secondary" onclick="BankImport._cancelPreview()">Annuler</button>
        <button class="btn-primary" onclick="BankImport._confirmMapping()">Continuer →</button>
      </div>
    `);
  },

  _confirmMapping() {
    const { rows, headerIdx, profileKey } = window._bankMappingData || {};
    if (!rows) return;
    const isAmtSplit  = document.querySelector('[name="map-amt-type"]:checked')?.value === 'split';
    const isDateSplit = document.querySelector('[name="map-date-type"]:checked')?.value === 'parts';
    const pi = v => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
    const mapping = {
      date:        !isDateSplit ? pi(document.getElementById('map-date')?.value)        : null,
      dateDay:     isDateSplit  ? pi(document.getElementById('map-date-day')?.value)    : null,
      dateMonth:   isDateSplit  ? pi(document.getElementById('map-date-month')?.value)  : null,
      dateYear:    isDateSplit  ? pi(document.getElementById('map-date-year')?.value)   : null,
      description: pi(document.getElementById('map-desc')?.value),
      amount:      !isAmtSplit  ? pi(document.getElementById('map-amount')?.value)      : null,
      debit:       isAmtSplit   ? pi(document.getElementById('map-debit')?.value)       : null,
      credit:      isAmtSplit   ? pi(document.getElementById('map-credit')?.value)      : null,
    };
    if (document.getElementById('map-save-profile')?.checked && profileKey) {
      this._saveProfile(profileKey, mapping);
    }
    this._runImportPipeline(rows, headerIdx, mapping);
  },

  async _runImportPipeline(rows, headerIdx, mapping) {
    const allCats      = Storage.getCategories();
    const transactions = this._parseWithMapping(rows, headerIdx, mapping, allCats);
    if (!transactions.length) {
      document.getElementById('modal')?.classList.remove('modal-wide');
      Modal.close();
      alert('Aucune transaction valide détectée.\nVérifiez les correspondances de colonnes.');
      return;
    }
    this._cleanLabels(transactions, allCats);          // étape 2, même module que le PDF
    await this._categorizeAndPreview(transactions, allCats, 'spreadsheet');
  },

  // Reconstitue une date ISO depuis des colonnes Jour, Mois, Année séparées.
  // Mois accepte : 1-12, "01"-"12", "Janvier", "Jan", "January", "janv."…
  _buildDateFromParts(day, month, year) {
    const MONTHS = {
      jan:1, fev:2, feb:2, mar:3, avr:4, apr:4, mai:5, may:5,
      jun:6, jul:7, aou:8, aug:8, sep:9, oct:10, nov:11, dec:12,
    };
    let m = parseInt(month, 10);
    if (isNaN(m)) {
      const s = String(month||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').slice(0,3);
      m = MONTHS[s] || 0;
    }
    // Si pas d'année fournie → année en cours
    let y = parseInt(year, 10);
    if (!y) y = new Date().getFullYear();
    if (y < 100) y = 2000 + y;
    const d = (day !== null && day !== '' && day !== undefined) ? (parseInt(day, 10) || 1) : 1;
    if (!m || m > 12) return '';
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  },

  _parseDate(val) {
    if (val === '' || val === null || val === undefined) return '';
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return d.toISOString().split('T')[0];
    }
    const s = String(val).trim();
    // DD/MM/YYYY ou DD/MM/YY
    const m = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
    // ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // YYYYMMDD
    const ym = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (ym) return `${ym[1]}-${ym[2]}-${ym[3]}`;
    // DD/MM sans année (courant dans les relevés PDF) → année en cours
    const short = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})$/);
    if (short) {
      const y = new Date().getFullYear();
      return `${y}-${short[2].padStart(2,'0')}-${short[1].padStart(2,'0')}`;
    }
    return '';
  },

  _parseAmount(val) {
    if (val === '' || val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    let s = String(val).trim().replace(/\s/g, '');
    // Format français : "1.234,56" → enlever le point millier puis virgule→point
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  },

  _parseWithMapping(rows, headerIdx, mapping, allCats = []) {
    const transactions = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
      const date = mapping.date !== null
        ? this._parseDate(row[mapping.date])
        : this._buildDateFromParts(
            mapping.dateDay   !== null ? row[mapping.dateDay]   : null,
            mapping.dateMonth !== null ? row[mapping.dateMonth] : null,
            mapping.dateYear  !== null ? row[mapping.dateYear]  : null
          );
      if (!date) continue;
      const desc = mapping.description !== null ? String(row[mapping.description] || '').trim() : '';
      let amount = null, isRevenue = false;
      if (mapping.amount !== null) {
        const raw = this._parseAmount(row[mapping.amount]);
        if (raw !== null && raw !== 0) { amount = Math.abs(raw); isRevenue = raw > 0; }
      } else {
        const d = mapping.debit  !== null ? this._parseAmount(row[mapping.debit])  : null;
        const c = mapping.credit !== null ? this._parseAmount(row[mapping.credit]) : null;
        if (d && Math.abs(d) > 0) { amount = Math.abs(d); isRevenue = false; }
        else if (c && Math.abs(c) > 0) { amount = Math.abs(c); isRevenue = true; }
      }
      if (!amount || amount <= 0) continue;
      const guess = isRevenue
        ? { category: this._revenueCat(allCats).name, subcategory: this._defaultRevenueCat(allCats) }
        : this._smartGuess(desc, allCats);
      transactions.push({ date, description: desc || 'Opération', amount, isRevenue,
        category: guess.category, subcategory: guess.subcategory });
    }
    return transactions;
  },

  // ── PDF ───────────────────────────────────────────────────────────────────

  // Méthode principale : l'utilisateur encadre lui-même les colonnes sur le
  // relevé affiché (voir js/pdf-zones.js) — extraction et nettoyage 100 % locaux.
  async _handlePDF(file) {
    if (typeof pdfjsLib === 'undefined') { alert('pdf.js non disponible.'); return; }
    await PdfZones.start(file);
  },

  // Catégorisation Gemini (libellés uniquement) puis aperçu — point d'entrée
  // commun appelé après extraction par PdfZones ou par le mode IA de secours.
  async finishPdfExtraction(transactions) {
    const allCats = Storage.getCategories();
    this._cleanLabels(transactions, allCats);          // étape 2 (réduction au commerçant)
    await this._categorizeAndPreview(transactions, allCats, 'pdf');
  },

  // Dernier recours (opt-in, désactivé par défaut) : envoie le texte complet
  // du relevé à Claude lorsque l'encadrement de zones n'est pas exploitable.
  async _parsePDFWithAI(fullText) {
    const apiKey = this.getApiKey();
    if (!apiKey) { alert('Clé API Anthropic requise.'); return; }
    try {
      Modal.open('Extraction IA…', `
        <div style="text-align:center;padding:52px 20px">
          <div style="font-size:52px;margin-bottom:20px">🤖</div>
          <p style="font-size:15px;font-weight:700">Extraction par IA en cours…</p>
          <p style="color:var(--text-muted);font-size:13px">⚠️ Le contenu complet du relevé est envoyé à Claude.</p>
        </div>
      `);

      const text = fullText.slice(0, 15000); // limite ~15 000 caractères
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
          max_tokens: 4000,
          messages: [{ role: 'user', content:
            'Extrais les transactions bancaires de ce relevé.\n' +
            'Réponds UNIQUEMENT en JSON : {"t":[{"date":"AAAA-MM-JJ","desc":"...","amount":<nombre signé>}]}\n' +
            'Montant négatif = dépense, positif = crédit.\n\n' + text
          }],
        }),
      });
      if (!resp.ok) throw new Error('Claude HTTP ' + resp.status);
      const data  = await resp.json();
      const raw   = data.content?.[0]?.text || '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Réponse invalide');
      const allCats    = Storage.getCategories();
      const parsed     = JSON.parse(match[0]);
      const transactions = (parsed.t || [])
        .map(t => {
          const desc      = String(t.desc || '').trim();
          const isRevenue = t.amount > 0;
          const guess = isRevenue
            ? { category: this._revenueCat(allCats).name, subcategory: this._defaultRevenueCat(allCats) }
            : this._smartGuess(desc, allCats);
          return { date: t.date, description: desc,
            amount: Math.abs(t.amount), isRevenue,
            category: guess.category, subcategory: guess.subcategory };
        })
        .filter(t => t.date && t.description && t.amount > 0);

      if (!transactions.length) { Modal.close(); alert('L\'IA n\'a pas trouvé de transactions.'); return; }

      await this.finishPdfExtraction(transactions);
    } catch (err) {
      console.error(err);
      Modal.close();
      alert('Erreur extraction IA : ' + err.message);
    }
  },

  // ── NETTOYAGE DU LIBELLÉ BANCAIRE ────────────────────────────────────────

  // Supprime les codes internes des banques pour ne garder que le nom du commerçant.
  // Ex : "DU 180426 G20 PARIS" → "G20 PARIS"
  //      "FACTURE(S) CARTE 4974XXXX8930 DU 190426 CERNAY ALIMENTA REIMS" → "CERNAY ALIMENTA REIMS"
  _cleanDesc(raw) {
    let s = (raw || '').trim();

    // Codes de référence bancaire : "DU YYMMDD" ou "DU DDMMYY" (6 chiffres consécutifs)
    s = s.replace(/\bDU\s+\d{6}\b/gi, '');

    // Numéros de carte masqués : 4974XXXXXXXX8930, XXXX XXXX XXXX 1234
    s = s.replace(/\b[0-9]{4}[X*0-9]{6,}\b/g, '');
    s = s.replace(/\b(?:X{4}\s*){3}[X\d]{4}\b/g, '');

    // Préfixes courants à supprimer
    s = s.replace(/^(?:PAIEMENT\s+(?:PAR\s+)?(?:CB|CARTE)\s+|FACTURES?\s+(?:DE\s+)?(?:CARTE\s+)?|CB\s+|RETRAIT\s+(?:DAB\s+|GAB\s+)?)/i, '');

    // Préfixes à raccourcir
    s = s.replace(/^PRELEVEMENT\s+(?:SEPA\s+)?/i, 'PREL ');
    s = s.replace(/^VIREMENT\s+(?:SEPA\s+|INST\s+|PERMANENT\s+)?/i, 'VIR ');

    // Codes de terminal de paiement / référence résiduels (ex: "CB*1234", "REF 998877")
    s = s.replace(/\bCB[\s*]?\d{2,}\b/gi, '');
    s = s.replace(/\bREF\.?\s*\d+\b/gi, '');

    // Tout nombre isolé de 5 chiffres ou plus (référence opération, code postal,
    // numéro de transaction…) — le nom d'un commerçant n'en contient jamais.
    s = s.replace(/\b\d{5,}\b/g, '');

    // Dates résiduelles en fin de libellé (ex : "CARREFOUR 21/04" ou "21.04")
    s = s.replace(/\s+\d{2}[\/\.]\d{2}(?:\s+\d{2,4})?$/, '');

    // Ponctuation résiduelle laissée par les suppressions ci-dessus
    s = s.replace(/^[\s*\-\/]+/, '').replace(/[\s*\-\/]+$/, '');

    s = s.replace(/\s{2,}/g, ' ').trim();
    return s || (raw || '').trim();
  },

  // ── ÉTAPE 2 : RÉDUCTION AU COMMERÇANT / ÉMETTEUR (100 % LOCAL) ────────────
  //
  // Complète _cleanDesc : décode les conventions bancaires (balises SEPA,
  // préfixes carte/virement/prélèvement) puis retire dates, heures, codes de
  // référence et villes pour réduire le libellé au seul nom exploitable.
  // S'applique APRÈS extraction et AVANT catégorisation — aucune donnée envoyée.
  // Renvoie { name, needsReview } : si rien d'exploitable ne subsiste, name
  // reprend le libellé brut et needsReview=true (« à catégoriser à la main »).

  // Grandes villes FR pour le retrait de la ville en fin de libellé. Volontairement
  // SANS petites communes ambiguës (ex. « Cernay », qui est ici un nom de commerçant).
  _CITIES: ['PARIS','MARSEILLE','LYON','TOULOUSE','NICE','NANTES','MONTPELLIER',
    'STRASBOURG','BORDEAUX','LILLE','RENNES','REIMS','TOULON','GRENOBLE','DIJON',
    'ANGERS','NIMES','VILLEURBANNE','LE MANS','BREST','TOURS','AMIENS','LIMOGES',
    'ANNECY','PERPIGNAN','METZ','BESANCON','ORLEANS','ROUEN','MULHOUSE','CAEN',
    'NANCY','AVIGNON','CERGY','VERSAILLES','NANTERRE','COURBEVOIE',
    'CLERMONT-FERRAND','AIX-EN-PROVENCE','SAINT-ETIENNE','LE HAVRE'],

  // Un token ressemble-t-il à un code de référence (et non à un nom) ?
  _isCodeToken(t) {
    const hasDigit = /\d/.test(t), hasAlpha = /[A-Za-z]/.test(t);
    if (hasDigit && hasAlpha && t.length >= 6) return true; // I0000003633686, 7047GN54
    if (hasDigit && hasAlpha && /^\d/.test(t)) return true; // commence par un chiffre
    if (/^\d{4,}$/.test(t)) return true;                    // longue suite de chiffres
    return false;
  },

  // Retire la ville en fin de libellé si — et seulement si — un nom subsiste avant
  // (sinon on ne viderait pas la ligne). Gère l'arrondissement (« PARIS 10 »).
  _stripTrailingCity(s) {
    const alt = this._CITIES.map(c => c.replace(/-/g, '\\-').replace(/ /g, '\\s+')).join('|');
    const m = s.match(new RegExp('^(.*?\\S)\\s+(?:' + alt + ')(?:\\s+\\d{1,3})?\\s*$', 'i'));
    return m ? m[1].trim() : null;
  },

  _merchantName(raw) {
    const original = (raw || '').replace(/\s+/g, ' ').trim();
    let s = original;

    // 1. Balises SEPA : /DE (ou /POUR, /BENEF) introduit le nom → garder la suite ;
    //    couper ensuite au 1er /TAG technique restant (/MOTIF, /REF, /ID, /ECH…).
    const intro = s.match(/\/\s*(?:DE|POUR|BENEF(?:ICIAIRE)?)\b\s*/i);
    if (intro) s = s.slice(intro.index + intro[0].length);
    s = s.split(/\/\s*[A-Z]{2,}\b/i)[0];
    s = s.replace(/\//g, ' ');

    // 2. Préfixes de type d'opération en tête → retirés (le sens reçu/émis/carte
    //    est déjà porté par le signe du montant, inutile de le garder dans le nom).
    const OP = /^(?:VIR(?:EMENT)?(?:\s+SEPA)?(?:\s+(?:RECU|EMIS|INST(?:ANTANE)?|PERMANENT))?|PR[EÉ]?LV(?:\s+SEPA)?|PR[EÉ]L[EÈ]VEMENTS?(?:\s+SEPA)?|FACTURES?\(?S?\)?\s+(?:DE\s+)?CARTE|PAIEMENTS?(?:\s+PAR)?(?:\s+(?:CB|CARTE))?|CARTE|CB|RETRAITS?(?:\s+(?:DAB|GAB))?|DAB|GAB)\b[\s:.\-]*/i;
    let prev;
    do { prev = s; s = s.replace(OP, ''); } while (s !== prev && s);

    // 3. Nettoyage générique : dates (21.04 / 29/04/26), heures (12H33), mois-année (AVR 2026).
    s = s
      .replace(/\b\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/g, ' ')
      .replace(/\b\d{1,2}\s*H\s*\d{0,2}\b/gi, ' ')
      .replace(/\b(?:JANV?|FEVR?|MARS|AVR|MAI|JUIN|JUIL|AOUT|SEPT?|OCT|NOV|DEC)\.?\s*\d{2,4}\b/gi, ' ');
    // codes de référence (I0000003633686, 7047GN54…), token par token
    s = s.split(/\s+/).filter(t => t && !this._isCodeToken(t)).join(' ');

    // 4. Mots techniques résiduels autour du vrai nom.
    s = s.replace(/\b(?:GESTION|FACTURES?|PAIEMENTS?|VIREMENTS?|PRELEVEMENTS?|SEPA|RECU|EMIS|MOTIF|REF(?:DO)?|RUM|MDT|ECH|IBAN|BIC|MENSUEL(?:LE)?|ABONNEMENT|COTISATION|AUTORISATION|TICKET|BP)\b/gi, ' ')
         .replace(/\s{2,}/g, ' ').trim();

    // 5. Ville en fin (si un nom subsiste avant — sinon on ne vide pas la ligne).
    const noCity = this._stripTrailingCity(s);
    if (noCity) s = noCity;

    s = s.replace(/^[\s,\-]+|[\s,\-]+$/g, '').replace(/\s{2,}/g, ' ').trim();

    // 6. Repli : rien d'exploitable → garder le libellé brut, à catégoriser à la main.
    const hasLetters = /[A-Za-zÀ-ÿ]/.test(s);
    if (!hasLetters || s.replace(/\s+/g, '').length < 2) return { name: original, needsReview: true };
    return { name: s, needsReview: false };
  },

  // Échappement HTML minimal (libellés de relevé injectés dans l'aperçu).
  _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // Étape 2 (réduction au commerçant) appliquée EN PLACE à un lot de transactions.
  // Module unique partagé par l'import PDF (finishPdfExtraction) ET l'import
  // tableur (_runImportPipeline) — aucune duplication de la logique de nettoyage.
  _cleanLabels(transactions, allCats) {
    transactions.forEach(t => {
      const raw = t.descriptionRaw || t.description || '';
      const m   = this._merchantName(raw);
      t.descriptionRaw = raw;
      t.description    = m.name || 'Opération';
      t.needsReview    = m.needsReview;
      // (Re)devine la catégorie sur le libellé NETTOYÉ — sauf si elle a déjà été
      // résolue depuis une colonne « Catégorie » du fichier (import tableur).
      if (!t.isRevenue && !t._catResolved) {
        const g = this._smartGuess(t.description, allCats);
        t.category = g.category; t.subcategory = g.subcategory;
      }
    });
  },

  // Catégorisation Gemini (libellés exploitables uniquement) puis aperçu.
  // Partagé PDF/tableur. Les libellés « à catégoriser » et les catégories déjà
  // résolues (fichier / correspondance) ne sont pas envoyés à Gemini.
  async _categorizeAndPreview(transactions, allCats, source) {
    Modal.open('Catégorisation…', `
      <div style="text-align:center;padding:52px 20px">
        <div style="font-size:52px;margin-bottom:20px">🤖</div>
        <p style="font-size:15px;font-weight:700;margin-bottom:8px">Catégorisation Gemini…</p>
        <p style="color:var(--text-muted);font-size:13px">Seuls les libellés sont analysés — vos données restent locales.</p>
      </div>
    `);
    const pending = t => !t.needsReview && !t._catResolved;
    const labels  = transactions.filter(pending).map(t => t.description);
    if (labels.length) {
      const catMap = await GeminiCat.categorize(labels, allCats);
      transactions.forEach(t => { if (pending(t)) this._applyCatResult(t, catMap, allCats); });
    }
    document.getElementById('modal')?.classList.add('modal-wide');
    this._showPreview(transactions, source);
  },

  // ── DÉTECTION LOCALE PAR MOTS-CLÉS ───────────────────────────────────────

  // Fallback lorsque Gemini n'est pas disponible — base de 100+ enseignes/marques françaises.
  // Renvoie {category, subcategory} en résolvant les noms réels de l'utilisateur.
  _smartGuess(desc, allCats) {
    const d = (desc||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const n = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

    // Résout un hint de catégorie vers le nom réel de l'utilisateur
    const cat = h => allCats.find(c => n(c.name) === n(h))
                  || allCats.find(c => n(c.name).includes(n(h)) || n(h).includes(n(c.name)));
    // Résout un hint de sous-catégorie dans une catégorie utilisateur
    const sub = (c, h) => !c || !h ? ''
      : c.subcategories.find(s => n(s) === n(h))
     || c.subcategories.find(s => n(s).includes(n(h)) || n(h).includes(n(s))) || '';
    // Construit le résultat final
    const res = (catH, subH) => {
      const c = cat(catH);
      return { category: c?.name || catH, subcategory: sub(c, subH) };
    };

    // Alimentation
    if (/boulangerie|paul |brioche doree|eric kayser|patisserie/.test(d))                  return res('Alimentation','Boulangerie');
    if (/restaurant|brasserie|bistro|mcdonald|burger king|kfc|quick |pizza|kebab|sushi|ramen|thai |japonais|vietnamien|grec |chinois|indien|tacos|brunch|izakaya/.test(d)) return res('Alimentation','Resto');
    if (/izly/.test(d))                                                                     return res('Alimentation','Izly');
    if (/auchan|leclerc|carrefour|intermarche|lidl|aldi|super u|biocoop|naturalia|monoprix|franprix|picard|casino |cora |simply|netto |market|supermarche|hypermarche|epicerie|primeur|grand frais|g20 |vival|spar |coccinelle|proxi |8 a huit|huit a huit|dia |leader price|cernay|alimenta/.test(d)) return res('Alimentation','Courses');

    // Transport
    if (/sncf|ter |tgv |ouigo|trenitalia|eurostar|lyria|izy /.test(d))                    return res('Transport','Train');
    if (/tram|tramway/.test(d))                                                             return res('Transport','Tram');
    if (/ratp|navigo|metro |tiseo|tcl |tbm |tan |tbc |stib|bus |navette|transpole/.test(d)) return res('Transport','Bus');
    if (/uber|bolt |heetch|taxi|g7 |lecab|vtc |kapten|chauffeur/.test(d))                  return res('Transport','Bus');
    if (/velib|lime |tier |bird |dott |pony |trotinette|trottinette/.test(d))              return res('Transport','Bus');

    // Shopping — Vêtements / Sport
    if (/adidas|nike |zara |h&m |primark|asos |shein|kiabi|uniqlo|gap |levi|lacoste|ralph lauren|tommy|hugo boss|calvin klein|gucci|louis vuitton|hermes |chanel |balenciaga|jacquemus|mango |sandro |maje |iro |ba&sh|fred perry|the north face|columbia |timberland|vans |converse|puma |reebok|new balance|under armour|salomon|asics|celio|jules |la halle|andre |eram |minelli|bocage|bobbies/.test(d)) return res('Shopping','Vêtements');
    if (/decathlon|sport 2000|go sport|intersport|foot locker|courir |athlete/.test(d))    return res('Shopping','Vêtements');

    // Shopping — Électronique
    if (/fnac |darty|boulanger|ldlc|materiel.net|cdiscount|rue du commerce|grosbill|topachat|back market/.test(d)) return res('Shopping','Electronique');
    if (/apple store|apple.com|samsung |sony |microsoft |dell |lenovo|hp |asus /.test(d)) return res('Shopping','Electronique');

    // Shopping — Maison
    if (/ikea|maisons du monde|la redoute|castorama|leroy merlin|bricorama|mr bricolage|bricoman|lapeyre|zodio|fly |but |conforama|habitat |made.com/.test(d)) return res('Shopping','Maison');

    // Abonnements — streaming/Internet
    if (/netflix|disney\+|disney plus|apple tv|hulu|canal\+|ocs |arte |molotov|crunchyroll/.test(d)) return res('Abonnements','Internet');
    if (/spotify|deezer|apple music|amazon music|youtube premium|tidal|qobuz/.test(d))    return res('Abonnements','Internet');
    if (/amazon prime/.test(d))                                                             return res('Abonnements','Internet');
    // Abonnements — téléphonie
    if (/sfr |orange |bouygues|free |numericable|sosh |red by sfr|prixtel|coriolis|lebara|lycamobile|auchan telecom/.test(d)) return res('Abonnements','Téléphone');

    // Logement
    if (/loyer |charges locatives|syndic|fonciere|agence immo|bail /.test(d))              return res('Logement','Loyer');
    if (/edf|enedis|engie|total energie|ekwateur|ilek|electricite |gaz |eau |veolia|suez /.test(d)) return res('Logement','');
    if (/airbnb/.test(d))                                                                   return res('Logement','');

    // Santé
    if (/pharmacie|parapharmacie/.test(d))                                                  return res('Santé','Pharmacie');
    if (/medecin|docteur|dr |clinique|hopital|chu |radiologie|dentiste|orthodontiste|ophtalmo|kine |osteopathe|dermatologue|cardiologue/.test(d)) return res('Santé','Médecin');
    if (/cpam|ameli|securite sociale/.test(d))                                              return res('Santé','CPAM');
    if (/mutuelle|mgen|april|swisslife|generali|groupama|allianz/.test(d))                 return res('Santé','Pharmacie');

    // Loisir
    if (/cinema|cine |mk2|ugc |pathe |odeon|theatre|opera|concert|spectacle|musee|expo |louvre|orsay|pompidou/.test(d)) return res('Loisir','Culture');
    if (/fnac |cultura|librairie/.test(d))                                                  return res('Loisir','Culture');
    if (/steam |playstation|xbox |nintendo|epic games|jeux?.video|gaming/.test(d))         return res('Loisir','Culture');
    if (/gym |fitness|basic fit|neoness|keep cool|salle de sport|musculation|piscine|tennis|badminton|squash|yoga|pilates|crossfit/.test(d)) return res('Loisir','Sport');

    // Épargne
    if (/boursorama|bourse direct|degiro|trade republic/.test(d))                          return res('Epargne','Bourso');
    if (/livret|pel |plan epargne|assurance vie|per |placement/.test(d))                   return res('Epargne','');

    // Divers
    if (/frais bancaire|cotisation carte|commission |agios|interet /.test(d))              return res('Divers','Frais bancaires');
    if (/la poste|chronopost|colissimo|ups |fedex|dhl |mondial relay/.test(d))             return res('Divers','Autre');

    // Aucune correspondance
    const fallback = allCats.find(c => n(c.name) === 'divers') || allCats[allCats.length - 1];
    return { category: fallback?.name || 'Divers', subcategory: '' };
  },

  // ── APERÇU ───────────────────────────────────────────────────────────────

  // Fait correspondre un nom de catégorie renvoyé par Gemini (qui peut différer
  // en casse/accents du nom exact stocké) à la catégorie réelle de l'utilisateur.
  // Sans ça, un nom non reconnu par le <select> fait retomber l'affichage sur
  // la 1ère option de la liste (ex: "Abonnements"), faussant tout l'aperçu.
  _matchCat(name, allCats) {
    if (!name) return null;
    const n = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    return allCats.find(c => n(c.name) === n(name)) || null;
  },
  _matchSubcat(cat, subName) {
    if (!cat || !subName) return '';
    const n = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const subs = cat.subcategories || [];
    return subs.find(s => n(s) === n(subName))
        || subs.find(s => n(s).includes(n(subName)) || n(subName).includes(n(s)))
        || '';
  },

  // Catégorie "Revenus" réelle de l'utilisateur — avec repli sur une catégorie
  // générique si elle a été supprimée/renommée au point de ne plus matcher.
  _revenueCat(allCats) {
    const n = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return allCats.find(c => n(c.name).includes('revenu'))
        || { name: 'Revenus', subcategories: Utils.REVENUE_CATEGORIES };
  },
  // Sous-catégories réelles de la catégorie "Revenus" (remplace l'ancienne liste
  // générique Salaire/Freelance/... qui ne correspondait jamais à ses propres
  // sous-catégories et faussait le select d'aperçu).
  _revenueSubcats(allCats) {
    const cat = this._revenueCat(allCats);
    return (cat.subcategories?.length) ? cat.subcategories : Utils.REVENUE_CATEGORIES;
  },
  _defaultRevenueCat(allCats) {
    const subs = this._revenueSubcats(allCats);
    const n = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return subs.find(s => n(s) === 'autre') || subs[subs.length - 1] || '';
  },

  // Applique le résultat Gemini (catégorie + sous-catégorie) à une transaction.
  // Pour un revenu, la catégorie reste toujours "Revenus" (visible dans l'aperçu) —
  // seule la sous-catégorie est choisie parmi celles que l'utilisateur a définies.
  _applyCatResult(t, catMap, allCats) {
    const result = catMap[t.description];
    if (!result) return;
    if (t.isRevenue) {
      const revCat = this._revenueCat(allCats);
      t.category = revCat.name;
      const matchedSub = this._matchSubcat(revCat, result.subcategory);
      if (matchedSub) t.subcategory = matchedSub;
    } else {
      const matched = this._matchCat(result.category, allCats);
      if (matched) {
        t.category = matched.name;
        t.subcategory = this._matchSubcat(matched, result.subcategory);
      }
    }
  },

  // Construit les <option> pour le select de sous-catégorie d'une catégorie donnée
  _subcatOpts(catName, selected = '') {
    const cat  = Storage.getCategories().find(c => c.name === catName);
    const subs = cat?.subcategories || [];
    return '<option value="">—</option>' +
      subs.map(s => `<option value="${s}"${s === selected ? ' selected' : ''}>${s}</option>`).join('');
  },

  // Mise à jour dynamique des sous-catégories quand l'utilisateur change la catégorie
  _onCatChange(sel, idx) {
    const newCat = sel.value;
    const t = (window._bankTransactions || [])[idx];
    if (t) GeminiCat.learn(t.description, newCat, '');
    const subcatSel = document.querySelector(`[data-subcat="${idx}"]`);
    if (subcatSel) subcatSel.innerHTML = this._subcatOpts(newCat, '');
  },

  // Mémorise la correction manuelle de sous-catégorie
  _onSubcatChange(sel, idx) {
    const t = (window._bankTransactions || [])[idx];
    if (!t) return;
    const cat = document.querySelector(`[data-cat="${idx}"]`)?.value || t.category;
    GeminiCat.learn(t.description, cat, sel.value);
  },

  _showPreview(transactions, source = 'spreadsheet') {
    window._bankTransactions = transactions;
    const allCats   = Storage.getCategories(); // {name, subcategories[]}[]
    const expCatNames = allCats.map(c => c.name);
    const expCats   = expCatNames.length ? expCatNames : Utils.EXPENSE_CATEGORIES;
    const revCatName = this._revenueCat(allCats).name;
    const hasGemini = !!GeminiCat.getApiKey();

    // Détection des doublons
    const expKeys = new Set(Storage.getExpenses().map(e => `${e.date}|${e.description}|${e.amount}`));
    const revKeys = new Set(Storage.getRevenues().map(r => `${r.date}|${r.description}|${r.amount}`));
    const dupKey  = t => `${t.date}|${t.description}|${t.amount}`;

    let dupCount = 0;
    const rows = transactions.map((t, i) => {
      // Pour un revenu, la catégorie est toujours "Revenus" — seule option affichée,
      // pour que l'utilisateur la voie sans pouvoir la confondre avec une dépense.
      const cats  = t.isRevenue ? [revCatName] : expCats;
      const opts  = cats.map(c => `<option value="${c}"${c === t.category ? ' selected' : ''}>${c}</option>`).join('');
      const isDup = (t.isRevenue ? revKeys : expKeys).has(dupKey(t));
      if (isDup) dupCount++;
      // Sous-catégories de la catégorie assignée (affichées aussi pour les revenus)
      const subcatHtml =
        `<select data-subcat="${i}" class="select-input bank-cat-sel"
          onchange="BankImport._onSubcatChange(this,${i})">${this._subcatOpts(t.category, t.subcategory)}</select>`;
      return `<tr${isDup ? ' class="row-dup"' : ''}>
        <td><input type="checkbox" data-idx="${i}"${isDup ? '' : ' checked'}></td>
        <td>${Utils.formatDate(t.date)}</td>
        <td class="bank-desc" title="${this._esc(t.descriptionRaw || t.description)}">${this._esc(t.description)}${t.needsReview ? ' <span class="dup-badge review-badge">à catégoriser</span>' : ''}${isDup ? ' <span class="dup-badge">⚠ doublon</span>' : ''}</td>
        <td class="text-right"><strong class="${t.isRevenue ? 'positive' : 'negative'}">${t.isRevenue ? '+' : '−'}${Utils.formatCurrency(t.amount)}</strong></td>
        <td><select data-cat="${i}" class="select-input bank-cat-sel"
          onchange="BankImport._onCatChange(this,${i})">${opts}</select></td>
        <td>${subcatHtml}</td>
      </tr>`;
    }).join('');

    const geminiNote = hasGemini
      ? `<div class="bank-import-note bank-note-ok">🤖 <strong>Catégorisation Gemini.</strong> <span class="privacy-badge">🔒 Seuls les libellés sont envoyés — jamais les montants, dates ni données personnelles.</span></div>`
      : `<div class="bank-import-note bank-note-warn">💡 Catégories par mots-clés. <a href="#" onclick="BankImport.openSettings();return false">Configurer Gemini gratuit →</a></div>`;
    const dupNote = dupCount
      ? `<div class="bank-import-note bank-note-warn">⚠️ <strong>${dupCount} doublon(s) détecté(s)</strong> et décochés — cochez-les pour forcer l'import.</div>`
      : '';

    document.getElementById('modal')?.classList.add('modal-wide');
    Modal.open(`Relevé${source === 'pdf' ? ' PDF' : ''} — ${transactions.length} opération(s)`, `
      ${geminiNote}${dupNote}
      <div class="bank-preview-wrap">
        <table class="data-table bank-preview-table">
          <thead><tr>
            <th style="width:36px"><input type="checkbox" id="bank-check-all" checked></th>
            <th>Date</th><th>Description</th><th class="text-right">Montant</th>
            <th>Catégorie</th><th>Sous-catégorie</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="form-actions bank-preview-actions">
        <button class="btn-secondary" onclick="BankImport._cancelPreview()">Annuler</button>
        <button class="btn-primary" onclick="BankImport._confirmImport()">Importer les sélectionnées</button>
      </div>
    `);

    document.getElementById('bank-check-all')?.addEventListener('change', e => {
      document.querySelectorAll('[data-idx]').forEach(cb => { cb.checked = e.target.checked; });
    });
  },

  _cancelPreview() {
    window._bankTransactions = null;
    window._bankMappingData  = null;
    document.getElementById('modal')?.classList.remove('modal-wide');
    Modal.close();
  },

  _confirmImport() {
    const transactions = window._bankTransactions || [];
    const checkboxes   = document.querySelectorAll('[data-idx]');
    const catSelects   = document.querySelectorAll('[data-cat]');
    const subcatSelects = document.querySelectorAll('[data-subcat]');
    const expenses     = Storage.getExpenses();
    const revenues     = Storage.getRevenues();
    let impExp = 0, impRev = 0;

    const subcatByIdx = {};
    subcatSelects.forEach(el => { subcatByIdx[el.dataset.subcat] = el.value; });

    checkboxes.forEach((cb, i) => {
      if (!cb.checked) return;
      const t      = transactions[i];
      const cat    = catSelects[i]?.value || t.category;
      const subcat = subcatByIdx[i] ?? t.subcategory ?? '';
      if (cat !== t.category || subcat !== t.subcategory) {
        GeminiCat.learn(t.description, cat, subcat);
      }
      // Le libellé brut est conservé (descriptionRaw) pour la vue détaillée ;
      // description = nom nettoyé du commerçant (affichage principal + clé Gemini).
      const rec = { id: Utils.generateId(), description: t.description,
        descriptionRaw: t.descriptionRaw || t.description, amount: t.amount,
        category: cat, subcategory: subcat, date: t.date, needsReview: !!t.needsReview,
        notes: t.needsReview ? 'Import bancaire — à catégoriser' : 'Import bancaire' };
      if (t.isRevenue) { revenues.push(rec); impRev++; }
      else { expenses.push(rec); impExp++; }
    });

    Storage.saveExpenses(expenses);
    Storage.saveRevenues(revenues);
    window._bankTransactions = null;
    window._bankMappingData  = null;
    document.getElementById('modal')?.classList.remove('modal-wide');
    Modal.close();
    navigateTo('flux');
    alert(`Import terminé ✓\n${impExp} dépense(s) et ${impRev} revenu(s) importé(s).`);
  },
};
