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

        <div class="settings-block" style="margin-top:14px">
          <div class="settings-block-title">🏷️ Correspondances de catégories (import) <span class="settings-badge-optional">Mémorisées</span></div>
          <p class="settings-desc">
            Quand un fichier importé a une colonne « Catégorie », ses valeurs sont reliées à vos
            catégories (exact, sinon via Gemini sur le seul nom de catégorie). Ces correspondances
            sont mémorisées localement et réutilisées <strong>sans nouvel appel IA</strong>.
            Corrigez ou supprimez-les ici.
          </p>
          <div id="catmap-list" style="margin-top:10px">${this._catMapListHTML()}</div>
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

  // Liste éditable des correspondances « catégorie du fichier » → catégorie de l'app.
  _catMapListHTML() {
    const cache = GeminiCat.getCatMapCache();
    const keys  = Object.keys(cache);
    if (!keys.length) {
      return '<p style="font-size:12px;color:var(--text-muted);margin:0">Aucune correspondance mémorisée pour l\'instant — elles apparaîtront après un import avec colonne « Catégorie ».</p>';
    }
    const appCats = Storage.getCategories().map(c => c.name);
    const rows = keys.map((k, idx) => {
      const e = cache[k];
      const opts = appCats.map(c => `<option value="${this._esc(c)}"${c === e.category ? ' selected' : ''}>${this._esc(c)}</option>`).join('');
      return `<div class="catmap-row">
        <span class="catmap-from" title="${this._esc(e.original || k)}">${this._esc(e.original || k)}</span>
        <span class="catmap-arrow">→</span>
        <select class="select-input catmap-sel" onchange="BankImport._catMapAction(${idx},'set',this.value)">${opts}</select>
        <button class="btn-icon-sm" title="Oublier cette correspondance" onclick="BankImport._catMapAction(${idx},'del')">🗑</button>
      </div>`;
    }).join('');
    return `<div class="catmap-rows">${rows}</div>
      <button class="btn-sm" style="margin-top:8px;color:var(--text-muted);border:1px solid var(--border);background:transparent;padding:4px 10px;border-radius:6px;cursor:pointer"
        onclick="if(confirm('Oublier toutes les correspondances de catégories mémorisées ?')){GeminiCat.clearCatMapCache();const l=document.getElementById('catmap-list');if(l)l.innerHTML=BankImport._catMapListHTML();}">Tout oublier</button>`;
  },

  _catMapAction(idx, action, value) {
    const cache = GeminiCat.getCatMapCache();
    const key = Object.keys(cache)[idx];
    if (!key) return;
    if (action === 'del') delete cache[key];
    else if (action === 'set') cache[key] = { ...cache[key], category: value };
    GeminiCat._saveCatMapCache(cache);
    const list = document.getElementById('catmap-list');
    if (list) list.innerHTML = this._catMapListHTML();
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

    // Date effective (= période réellement concernée : date valeur, période…), distincte
    // de la date comptable. Détectée en premier pour ne pas être confondue avec la date.
    const dateEffRaw = find('date valeur','date val','date effective','date effet','date periode','periode concernee','periode','mois concerne','mois reel','date application');
    const findExcept = (except, ...terms) => { const i = h.findIndex((c, idx) => idx !== except && terms.some(t => c.includes(t))); return i >= 0 ? i : null; };
    let date = findExcept(dateEffRaw, 'date treso','date compta','date comptable','date operation','date ope','date transaction','date mouvement','date');
    let dateEffective = (dateEffRaw !== null && dateEffRaw !== date) ? dateEffRaw : null;
    // Une seule date « effective » et pas de date comptable → on la promeut en date principale.
    if (date === null && dateEffective !== null) { date = dateEffective; dateEffective = null; }

    // Ne chercher les composants que si aucune colonne date unifiée n'est trouvée
    const dateDay   = date === null ? (exact('jour','day','jj','j')   ?? find('jour','day'))   : null;
    const dateMonth = date === null ? (exact('mois','month','mm','m') ?? find('mois','month'))  : null;
    const dateYear  = date === null ? (exact('annee','an','year','yyyy','aaaa') ?? find('annee','an ','year','aaaa')) : null;

    // Sous-catégorie détectée avant la catégorie (sinon "catégorie" matcherait
    // aussi "sous-catégorie" par inclusion).
    const subcategory = find('sous-categorie','sous categorie','souscategorie','sous-cat','subcategory','sub-category','sous-rubrique');
    const category    = findExcept(subcategory, 'categorie','category','rubrique','poste','famille');

    return {
      date,
      dateEffective,
      dateDay,
      dateMonth,
      dateYear,
      description: find('libelle','description','commentaire','label','intitule','operation','nature','motif','objet','details'),
      amount:      find('montant','amount','somme'),
      debit:       find('debit','sortie','depense','retrait','imputation'),
      credit:      find('credit','entree','revenu','depot','versement'),
      category,
      subcategory,
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
            <label class="mapping-field-label">📆 Date effective <small style="font-weight:400;color:var(--text-muted)">(optionnel)</small></label>
            <select id="map-date-effective" class="select-input">${colOpts(mapping.dateEffective, true)}</select>
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
          <div class="mapping-field-row">
            <label class="mapping-field-label">🏷️ Catégorie <small style="font-weight:400;color:var(--text-muted)">(fichier, optionnel)</small></label>
            <select id="map-category" class="select-input">${colOpts(mapping.category, true)}</select>
          </div>
          <div class="mapping-field-row">
            <label class="mapping-field-label">🏷️ Sous-catégorie <small style="font-weight:400;color:var(--text-muted)">(fichier, optionnel)</small></label>
            <select id="map-subcategory" class="select-input">${colOpts(mapping.subcategory, true)}</select>
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
      dateEffective: pi(document.getElementById('map-date-effective')?.value),
      dateDay:     isDateSplit  ? pi(document.getElementById('map-date-day')?.value)    : null,
      dateMonth:   isDateSplit  ? pi(document.getElementById('map-date-month')?.value)  : null,
      dateYear:    isDateSplit  ? pi(document.getElementById('map-date-year')?.value)   : null,
      description: pi(document.getElementById('map-desc')?.value),
      amount:      !isAmtSplit  ? pi(document.getElementById('map-amount')?.value)      : null,
      debit:       isAmtSplit   ? pi(document.getElementById('map-debit')?.value)       : null,
      credit:      isAmtSplit   ? pi(document.getElementById('map-credit')?.value)      : null,
      category:    pi(document.getElementById('map-category')?.value),
      subcategory: pi(document.getElementById('map-subcategory')?.value),
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
    this._cleanLabels(transactions, allCats);          // nettoyage minimal local (dates/cartes)
    // La correspondance Gemini des catégories du fichier (#3) et la catégorisation par
    // libellé sont reportées à l'étape IA (fenêtre 3), après validation de la fenêtre 2.
    this._showPreview(transactions, 'spreadsheet', 'local'); // fenêtre 2 : revue locale, AUCUN envoi
  },

  // Étape #3 — résout les catégories du fichier non trouvées en exact : cache local
  // d'abord, puis Gemini (NOM de catégorie uniquement, jamais montant/date/libellé).
  // Sans clé ou en cas d'échec, les transactions restantes retombent sur la
  // catégorisation habituelle par libellé (étape suivante).
  async _resolveFuzzyCategories(transactions, allCats) {
    const pending = transactions.filter(t => t.fileCat && !t._catResolved && !t.isRevenue);
    if (!pending.length) return;

    const cache = GeminiCat.getCatMapCache();
    const toAsk = [];
    pending.forEach(t => {
      const cached = cache[GeminiCat._normCat(t.fileCat)];
      if (cached && this._matchCat(cached.category, allCats)) {
        this._applyFileCat(t, cached.category, cached.subcategory, allCats);
      } else if (!toAsk.includes(t.fileCat)) {
        toAsk.push(t.fileCat);
      }
    });

    if (toAsk.length && GeminiCat.getApiKey()) {
      const map = await GeminiCat.matchCategories(toAsk, allCats); // { fileCat: appCatName }
      pending.forEach(t => {
        if (t._catResolved) return;
        const appCat = map[t.fileCat];
        if (appCat && this._matchCat(appCat, allCats)) this._applyFileCat(t, appCat, '', allCats);
      });
    }
  },

  // Applique une correspondance (cache/Gemini) : catégorie de l'app + sous-catégorie
  // exacte si le fichier en fournit une. Marque l'origine « fuzzy » pour l'aperçu.
  _applyFileCat(t, catName, subName, allCats) {
    const cat = this._matchCat(catName, allCats);
    if (!cat) return; // garde-fou : nom inconnu → on ne résout pas (fallback libellé)
    t.category = cat.name;
    let sub = '';
    if (t.fileSubcat) sub = this._matchSubcat(cat, t.fileSubcat) || '';
    if (!sub && subName) sub = this._matchSubcat(cat, subName) || '';
    t.subcategory     = sub;
    t.catOrigin       = 'fuzzy';
    t._catResolved    = true;
    t.fileCatOriginal = t.fileCat;
  },

  // Pastille d'origine de la catégorie (aperçu) : 🟢 fichier · 🟡 approchée · 🔵 IA · ⚪ à catégoriser.
  _catOriginBadge(t) {
    const map = {
      file:  ['🟢', 'Catégorie du fichier (correspondance exacte)'],
      fuzzy: ['🟡', 'Correspondance approchée' + (t.fileCatOriginal ? ' — fichier : ' + t.fileCatOriginal : '')],
      ai:    ['🔵', 'Catégorisé par IA / mots-clés'],
      none:  ['⚪', 'À catégoriser'],
    };
    const [icon, label] = map[t.catOrigin] || map.ai;
    return `<span class="cat-origin" title="${this._esc(label)}">${icon}</span>`;
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
      // Date effective (période réellement concernée) → granularité mois (YYYY-MM), modèle de l'app.
      let effectiveDate = '';
      if (mapping.dateEffective !== null && mapping.dateEffective !== undefined) {
        const ed = this._parseDate(row[mapping.dateEffective]);
        if (ed) effectiveDate = ed.substring(0, 7);
      }
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

      // Catégorie/sous-catégorie issues du fichier (étape #3) — dépenses uniquement
      // (un revenu est toujours rattaché à la catégorie « Revenus »).
      const fileCat    = mapping.category    != null ? String(row[mapping.category]    || '').trim() : '';
      const fileSubcat = mapping.subcategory != null ? String(row[mapping.subcategory] || '').trim() : '';
      let category = guess.category, subcategory = guess.subcategory, catOrigin, catResolved = false;
      if (fileCat && !isRevenue) {
        const exact = this._matchCat(fileCat, allCats); // correspondance exacte (insensible casse/accents/espaces)
        if (exact) {
          category    = exact.name;
          subcategory = fileSubcat ? (this._matchSubcat(exact, fileSubcat) || '') : '';
          catOrigin = 'file'; catResolved = true;
        }
      }

      transactions.push({ date, description: desc || 'Opération', amount, isRevenue,
        category, subcategory,
        ...(effectiveDate && { effectiveDate }),
        ...(fileCat && !isRevenue && { fileCat }),
        ...(fileSubcat && !isRevenue && { fileSubcat }),
        ...(catOrigin && { catOrigin }),
        ...(catResolved && { _catResolved: true }) });
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
    this._cleanLabels(transactions, allCats);          // nettoyage minimal local (dates/cartes)
    this._showPreview(transactions, 'pdf', 'local');   // fenêtre 2 : revue locale, AUCUN envoi
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

  // ── NETTOYAGE MINIMAL DU LIBELLÉ (avant Gemini) ─────────────────────────
  //
  // Approche volontairement SIMPLE : on retire UNIQUEMENT les données sensibles
  // (dates sous toutes leurs formes + numéros de carte) puis on normalise les
  // espaces. Tout le reste est conservé tel quel (VIR SEPA, PRLV, /DE, /MOTIF,
  // noms de commerçants, références…) : Gemini comprend sans qu'on décode.
  // 100 % local — c'est ce libellé nettoyé qui part ensuite à Gemini.
  _cleanLabel(raw) {
    // Espaces français (insécables, fines) → espace normal, pour des regex fiables.
    let s = String(raw || '').replace(/[\u00a0\u202f\u2009]/g, ' ');

    // — Heures (avant les dates) : 12H33 / 14:22 / 09H05 —
    s = s.replace(/\b\d{1,2}\s*[H:]\s*\d{2}\b/gi, ' ');

    // — Marqueur « DU <date> » (du JJMMAA / AAMMJJ, ex. « DU 270426 ») — la date est SENSIBLE —
    s = s.replace(/\bDU\s+\d{4,}\b/gi, ' ');

    // — Dates numériques (ISO, JJ/MM[/AA], JJ-MM, JJ.MM) —
    s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
    s = s.replace(/\b\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/g, ' ');

    // — Mois textuels FR (avec/sans accents, point éventuel) —
    s = s.replace(/\b(?:JANV?|F[EÉ]VR?|MARS|AVR(?:IL)?|MAI|JUIN|JUIL(?:LET)?|AO[UÛ]T|SEPT?|OCT(?:OBRE)?|NOV(?:EMBRE)?|D[EÉ]C(?:EMBRE)?)\.?\b/gi, ' ');

    // — Numéros de carte (APRÈS les dates : dans « CARTE 21.04 », 21.04 est une date
    //   déjà retirée, donc CARTE est conservé ; « CARTE 1234 » reste bien retiré) —
    s = s.replace(/(?:[X*]{4}[\s.\-]*){2,3}\d{4}\b/gi, ' ');     // **** **** **** 1234 / XXXX XXXX XXXX 1234
    s = s.replace(/\b\d{2,6}[X*]{4,}\d{2,6}\b/gi, ' ');          // 4974XXXXXXXX8930
    s = s.replace(/\b(?:CB|CARTE)\s*(?:N[O°º]?|#|:)?\s*[\dX*]{2,}\b/gi, ' '); // CB/CARTE + chiffres ou étoiles

    // — Étiquettes de métadonnées SEPA (le nom du champ ; sa valeur code/date est retirée à côté) —
    s = s.replace(/\b(?:EMETTEUR|EMET|BENEFICIAIRE|BENEF|MOTIF|REFERENCE|REFDO|REF|RUM|MDT|MANDAT|ECHEANCE|ECH|IBAN|LIB)\b/gi, ' ');

    // — Suites de chiffres isolées (≥4) : années, dates 6/8 chiffres (270426…), réfs, 4 derniers de carte —
    s = s.replace(/\b\d{4,}\b/g, ' ');

    // — « DU » résiduel (marqueur de date omniprésent sur les relevés) —
    s = s.replace(/\bDU\b/gi, ' ');

    // — Codes de référence (lettres+chiffres mêlés, ex. FR35ZZZ418323, PAGP0110FHQUU2) et
    //   ponctuation isolée (- : /) laissée par les retraits — token par token —
    s = s.split(/\s+/).filter(tok => {
      const core = tok.replace(/^[^0-9A-Za-zÀ-ÿ]+|[^0-9A-Za-zÀ-ÿ]+$/g, '');
      return core && !this._looksLikeCode(core);
    }).join(' ');

    // — Normalisation finale —
    return s.replace(/\s{2,}/g, ' ').trim();
  },

  // Un token ressemble-t-il à un code de référence (lettres ET chiffres mêlés) ?
  // Retire FR35ZZZ418323, PAGP0110FHQUU2, AB123… ; conserve les noms courts G20, M6, 4G.
  _looksLikeCode(t) {
    if (!/[A-Za-z]/.test(t) || !/\d/.test(t)) return false; // besoin de lettres ET de chiffres
    if (t.length >= 6) return true;                          // codes longs (IBAN, RUM, réf opération…)
    const digits = (t.match(/\d/g) || []).length;
    return t.length >= 4 && digits >= 2;                     // AB12, X1Y2 (mais pas G20, M6)
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
      const raw     = t.descriptionRaw || t.description || '';
      const cleaned = this._cleanLabel(raw);
      t.descriptionRaw = raw;
      // descriptionClean = libellé minimal : affiché en fenêtre 2, sert de clé de cache
      // et c'est CE texte (et lui seul) qui part à Gemini. t.description en part, puis sera
      // remplacé par le nom mis en forme renvoyé par Gemini en fenêtre 3.
      t.descriptionClean = cleaned || raw.trim() || 'Opération';
      t.description      = t.descriptionClean;
      // « À catégoriser » seulement si vraiment aucune lettre exploitable ne subsiste.
      t.needsReview = !/[a-zA-ZÀ-ÿ]/.test(t.descriptionClean);
      // Catégorie provisoire par mots-clés (_smartGuess) — affinée par Gemini en fenêtre 3.
      // Pas touché si la catégorie vient déjà du fichier (#3, correspondance exacte).
      if (!t.isRevenue && !t._catResolved) {
        const g = this._smartGuess(t.descriptionClean, allCats);
        t.category = g.category; t.subcategory = g.subcategory;
      }
    });
  },

  // ── FENÊTRE 3 : ÉTAPE IA (déclenchée à la validation de la fenêtre 2) ──────
  //
  // Seuls les libellés NETTOYÉS (descriptionClean) des lignes cochées partent à
  // Gemini, qui les met en forme (nom du commerçant) et les catégorise. Les
  // libellés « à catégoriser » et les catégories déjà résolues par le fichier
  // ne sont pas envoyés.
  async _runAiStep(source) {
    const all = window._bankTransactions || [];
    // Reprend les mois effectifs saisis + la sélection des lignes en fenêtre 2.
    document.querySelectorAll('[data-eff]').forEach(el => {
      const t = all[+el.dataset.eff]; if (t) t.effectiveDate = el.value || t.effectiveDate || '';
    });
    const checked = [];
    document.querySelectorAll('[data-idx]').forEach(cb => { if (cb.checked) checked.push(+cb.dataset.idx); });
    const txns = checked.length ? checked.map(i => all[i]) : all.slice();
    window._bankTransactions = txns;

    const allCats = Storage.getCategories();
    if (GeminiCat.getApiKey()) {
      Modal.open('Catégorisation IA…', `
        <div style="text-align:center;padding:52px 20px">
          <div style="font-size:52px;margin-bottom:20px">🤖</div>
          <p style="font-size:15px;font-weight:700;margin-bottom:8px">Mise en forme &amp; catégorisation…</p>
          <p style="color:var(--text-muted);font-size:13px">Seuls les libellés nettoyés sont envoyés — jamais montants, dates ni données personnelles.</p>
        </div>
      `);
      // #3 — correspondance Gemini des catégories du fichier (nom de catégorie uniquement).
      if (txns.some(t => t.fileCat && !t._catResolved && !t.isRevenue)) {
        await this._resolveFuzzyCategories(txns, allCats);
      }
      // Mise en forme du libellé + catégorisation, sur les libellés NETTOYÉS uniquement.
      const pending = t => !t.needsReview && !t._catResolved;
      const labels  = txns.filter(pending).map(t => t.descriptionClean);
      if (labels.length) {
        const catMap = await GeminiCat.categorize(labels, allCats);
        txns.forEach(t => { if (pending(t)) this._applyCatResult(t, catMap, allCats); });
      }
    }
    this._showPreview(txns, source, 'ai');   // fenêtre 3
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
    // Le cache/Gemini est indexé par le libellé NETTOYÉ (descriptionClean).
    const result = catMap[t.descriptionClean || t.description];
    if (!result) return;
    // Nom du commerçant mis en forme par Gemini → devient le libellé affiché/importé
    // (sinon on garde le libellé nettoyé). Le nettoyé reste la clé de cache (descriptionClean).
    if (result.name) t.description = result.name;
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
    if (t) {
      GeminiCat.learn(t.descriptionClean || t.description, newCat, '');
      t.category = newCat;
      // Correction manuelle d'une catégorie issue du fichier → mémoriser + pastille verte.
      if (t.fileCat) {
        GeminiCat.learnCatMatch(t.fileCat, newCat, '');
        t.catOrigin = 'file';
        const ob = document.querySelector(`[data-origin="${idx}"]`);
        if (ob) ob.innerHTML = this._catOriginBadge(t);
      }
    }
    const subcatSel = document.querySelector(`[data-subcat="${idx}"]`);
    if (subcatSel) subcatSel.innerHTML = this._subcatOpts(newCat, '');
  },

  // Mémorise la correction manuelle de sous-catégorie (cache libellé + cache correspondance).
  _onSubcatChange(sel, idx) {
    const t = (window._bankTransactions || [])[idx];
    if (!t) return;
    const cat = document.querySelector(`[data-cat="${idx}"]`)?.value || t.category;
    GeminiCat.learn(t.descriptionClean || t.description, cat, sel.value);
    if (t.fileCat) GeminiCat.learnCatMatch(t.fileCat, cat, sel.value);
  },

  // Aperçu en 2 fenêtres :
  //  • stage 'local' (fenêtre 2) : revue 100 % locale (date, mois effectif, montant,
  //    libellé nettoyé) + sélection des lignes. AUCUN envoi. Bouton → étape IA.
  //  • stage 'ai' (fenêtre 3) : commerçant mis en forme + catégories (éditables) → import.
  _showPreview(transactions, source = 'spreadsheet', stage = 'ai') {
    window._bankTransactions = transactions;
    const isLocal   = stage === 'local';
    const allCats   = Storage.getCategories(); // {name, subcategories[]}[]
    const expCatNames = allCats.map(c => c.name);
    const expCats   = expCatNames.length ? expCatNames : Utils.EXPENSE_CATEGORIES;
    const revCatName = this._revenueCat(allCats).name;
    const hasGemini = !!GeminiCat.getApiKey();

    // Origine de catégorie par défaut (fenêtre IA uniquement).
    if (!isLocal) transactions.forEach(t => { if (!t.catOrigin) t.catOrigin = t.needsReview ? 'none' : 'ai'; });

    // Détection des doublons (date + libellé affiché + montant)
    const expKeys = new Set(Storage.getExpenses().map(e => `${e.date}|${e.description}|${e.amount}`));
    const revKeys = new Set(Storage.getRevenues().map(r => `${r.date}|${r.description}|${r.amount}`));
    const dupKey  = t => `${t.date}|${t.description}|${t.amount}`;

    let dupCount = 0;
    const rows = transactions.map((t, i) => {
      const isDup = (t.isRevenue ? revKeys : expKeys).has(dupKey(t));
      if (isDup) dupCount++;
      // Libellé affiché : nettoyé en fenêtre 2, commerçant mis en forme en fenêtre 3.
      const label    = isLocal ? t.descriptionClean : t.description;
      const titleTxt = this._esc(isLocal ? (t.descriptionRaw || label)
                                         : (t.descriptionClean || t.descriptionRaw || label));
      const descCell = `<td class="bank-desc" title="${titleTxt}">${this._esc(label)}${t.needsReview ? ' <span class="dup-badge review-badge">à catégoriser</span>' : ''}${isDup ? ' <span class="dup-badge">⚠ doublon</span>' : ''}</td>`;

      let catCells = '';
      if (!isLocal) {
        const cats = t.isRevenue ? [revCatName] : expCats;
        const opts = cats.map(c => `<option value="${c}"${c === t.category ? ' selected' : ''}>${c}</option>`).join('');
        const subcatHtml = `<select data-subcat="${i}" class="select-input bank-cat-sel" onchange="BankImport._onSubcatChange(this,${i})">${this._subcatOpts(t.category, t.subcategory)}</select>`;
        catCells = `<td class="bank-cat-cell"><span class="cat-origin-wrap" data-origin="${i}">${this._catOriginBadge(t)}</span><select data-cat="${i}" class="select-input bank-cat-sel" onchange="BankImport._onCatChange(this,${i})">${opts}</select></td><td>${subcatHtml}</td>`;
      }
      return `<tr${isDup ? ' class="row-dup"' : ''}>
        <td><input type="checkbox" data-idx="${i}"${isDup ? '' : ' checked'}></td>
        <td>${Utils.formatDate(t.date)}</td>
        <td><input type="month" class="bank-eff-input" data-eff="${i}" value="${t.effectiveDate || ''}" title="Période réellement concernée (optionnel)" style="font-size:12px;padding:2px 4px"></td>
        ${descCell}
        <td class="text-right"><strong class="${t.isRevenue ? 'positive' : 'negative'}">${t.isRevenue ? '+' : '−'}${Utils.formatCurrency(t.amount)}</strong></td>
        ${catCells}
      </tr>`;
    }).join('');

    const note = isLocal
      ? `<div class="bank-import-note bank-note-ok">🔒 <strong>Détection 100 % locale</strong> — rien n'a encore été envoyé. ${hasGemini ? 'En validant, seuls les <strong>libellés nettoyés</strong> (sans montant, date ni n° de carte) seront envoyés à Gemini pour la mise en forme du commerçant et la catégorisation.' : 'Configurez Gemini pour la mise en forme IA, ou continuez avec les catégories par mots-clés.'}</div>`
      : (hasGemini
          ? `<div class="bank-import-note bank-note-ok">🤖 <strong>Commerçants mis en forme &amp; catégorisés par Gemini.</strong> <span class="privacy-badge">🔒 Seuls les libellés nettoyés ont été envoyés.</span></div>`
          : `<div class="bank-import-note bank-note-warn">💡 Catégories par mots-clés (pas de clé Gemini). <a href="#" onclick="BankImport.openSettings();return false">Configurer Gemini gratuit →</a></div>`);
    const dupNote = dupCount
      ? `<div class="bank-import-note bank-note-warn">⚠️ <strong>${dupCount} doublon(s) détecté(s)</strong> et décochés — cochez-les pour forcer l'import.</div>`
      : '';

    const footer = isLocal
      ? `<button class="btn-secondary" onclick="BankImport._cancelPreview()">Annuler</button>
         <button class="btn-primary" onclick="BankImport._runAiStep('${source}')">${hasGemini ? 'Valider → mise en forme IA' : 'Valider → catégories'} →</button>`
      : `<button class="btn-secondary" onclick="BankImport._cancelPreview()">Annuler</button>
         <button class="btn-primary" onclick="BankImport._confirmImport()">Importer les sélectionnées</button>`;

    document.getElementById('modal')?.classList.add('modal-wide');
    Modal.open(`Relevé${source === 'pdf' ? ' PDF' : ''} — ${transactions.length} opération(s) · ${isLocal ? 'vérification locale' : 'catégorisation'}`, `
      ${note}${dupNote}
      <div class="bank-preview-wrap">
        <table class="data-table bank-preview-table">
          <thead><tr>
            <th style="width:36px"><input type="checkbox" id="bank-check-all" checked></th>
            <th>Date</th><th>Mois effectif</th><th>${isLocal ? 'Libellé nettoyé' : 'Commerçant'}</th><th class="text-right">Montant</th>
            ${isLocal ? '' : '<th>Catégorie</th><th>Sous-catégorie</th>'}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="form-actions bank-preview-actions">
        ${footer}
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
    const effByIdx = {};
    document.querySelectorAll('[data-eff]').forEach(el => { effByIdx[el.dataset.eff] = el.value; });

    checkboxes.forEach((cb, i) => {
      if (!cb.checked) return;
      const t      = transactions[i];
      const cat    = catSelects[i]?.value || t.category;
      const subcat = subcatByIdx[i] ?? t.subcategory ?? '';
      const eff    = (effByIdx[i] || t.effectiveDate || '').trim();
      if (cat !== t.category || subcat !== t.subcategory) {
        GeminiCat.learn(t.descriptionClean || t.description, cat, subcat);
      }
      // Le libellé brut est conservé (descriptionRaw) pour la vue détaillée ;
      // description = nom nettoyé du commerçant (affichage principal + clé Gemini).
      const rec = { id: Utils.generateId(), description: t.description,
        descriptionRaw: t.descriptionRaw || t.description, amount: t.amount,
        category: cat, subcategory: subcat, date: t.date, needsReview: !!t.needsReview,
        ...(eff && { effectiveDate: eff }),
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
