// Assistant en langage naturel : saisir une ou PLUSIEURS dépenses/revenus depuis
// une phrase écrite ou dictée (« 45 € Carrefour hier, 14 Netflix et 30 Uber »).
//
// CONFIDENTIALITÉ : tout est analysé EN LOCAL. La catégorie est d'abord devinée
// localement ; seul le libellé d'une opération que le local ne RECONNAÎT PAS part
// à Gemini (enseignes connues et corrections déjà apprises restent 100 % locales).
// Jamais le montant, la date, le solde. Si le parsing local ne trouve pas le
// montant (ou une date évoquée mais illisible), l'app propose, en option explicite
// et confirmée, d'envoyer la phrase ENTIÈRE à Gemini.
const Assistant = {
  _rec: null,         // instance SpeechRecognition (dictée vocale)
  _listening: false,  // intention d'écoute : reste vrai tant que l'utilisateur n'a pas arrêté
  _voiceFinal: '',    // transcription finalisée cumulée (survit aux redémarrages auto)
  _lastText: '',
  _draft: null,       // brouillon de transaction en cours de validation
  _multiDrafts: null, // brouillons multiples (saisie de plusieurs opérations)

  init() {
    const fab = document.getElementById('assistant-fab');
    if (fab) fab.addEventListener('click', () => this.open());
  },

  // ── Écrans ────────────────────────────────────────────────────────────────

  // Ouvre/met à jour la modale ; `wide` élargit pour le tableau multi-lignes.
  _show(title, html, wide = false) {
    Modal.open(title, html);
    const m = document.getElementById('modal');
    if (m) m.classList.toggle('modal-wide', !!wide);
  },

  open() {
    this._draft = null;
    this._show('Assistant', this._inputScreen(this._lastText));
    this._focusInput();
  },

  reformulate() {
    this._show('Assistant', this._inputScreen(this._lastText));
    this._focusInput();
  },

  _focusInput() {
    setTimeout(() => {
      const el = document.getElementById('assistant-input');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 40);
  },

  _voiceSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  _inputScreen(prefill = '', error = '') {
    const mic = this._voiceSupported()
      ? `<button type="button" class="assistant-mic" id="assistant-mic" onclick="Assistant.toggleVoice()" title="Dicter">🎤</button>`
      : '';
    const err = error
      ? `<div class="assistant-error">${this._esc(error)}</div>` : '';
    return `
      <div class="assistant-box">
        <p class="assistant-hint">Décris une dépense ou un revenu en une phrase.</p>
        ${err}
        <div class="assistant-input-row">
          <textarea id="assistant-input" class="assistant-input" rows="2"
            onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter')Assistant.analyze()"
            placeholder="ex : J'ai dépensé 45 € chez Carrefour hier">${this._esc(prefill)}</textarea>
        ${mic}
        </div>
        <div id="assistant-voice-status" class="assistant-voice-status"></div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Assistant.close()">Annuler</button>
          <button type="button" class="btn-primary" onclick="Assistant.analyze()">Analyser</button>
        </div>
        <div class="assistant-examples">
          Une à la fois : « 12,50 au tabac » · « salaire reçu 1800 le 28 mai »<br>
          Ou plusieurs d'un coup : « 45 Carrefour hier, 14 Netflix et 30 € Uber jeudi dernier »<br>
          🎤 À l'oral : marque une petite pause entre chaque dépense (date, montant, commerçant — dans l'ordre que tu veux).
        </div>
      </div>`;
  },

  _missingScreen(text, parsed) {
    const what = parsed.missing.join(' et ');
    const hasKey = !!GeminiCat.getApiKey();
    const geminiBtn = hasKey
      ? `<button type="button" class="btn-primary" onclick="Assistant.geminiFull()">Envoyer la phrase entière à Gemini</button>`
      : `<button type="button" class="btn-primary" disabled
           title="Ajoute une clé Gemini dans les paramètres pour activer cette option">Gemini indisponible (aucune clé)</button>`;
    return `
      <div class="assistant-box">
        <div class="assistant-warn">
          <span class="assistant-warn-icon">⚠️</span>
          <div>
            <strong>Je n'ai pas trouvé ${what} dans ta phrase.</strong>
            <p class="assistant-quote">« ${this._esc(text)} »</p>
            <p class="assistant-hint">Reformule (tout reste sur ton appareil) ou, si tu préfères,
              laisse Gemini analyser la phrase complète.</p>
            <p class="assistant-privacy">ⓘ Envoyer à Gemini transmet ta phrase entière, montant et date
              compris. Le reste de l'app n'envoie jamais que le libellé.</p>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Assistant.reformulate()">Reformuler</button>
          ${geminiBtn}
        </div>
      </div>`;
  },

  _loadingScreen(msg) {
    return `
      <div class="assistant-loading">
        <div class="assistant-spinner"></div>
        <p>${this._esc(msg || 'Analyse…')}</p>
      </div>`;
  },

  _previewScreen(d) {
    const cats = Storage.getCategories();
    const catOptions = cats
      .map(c => `<option value="${this._esc(c.name)}"${c.name === d.category ? ' selected' : ''}>${this._esc(c.name)}</option>`)
      .join('');
    const subOptions = BankImport._subcatOpts(d.category, d.subcategory || '');
    return `
      <div class="assistant-box">
        <p class="assistant-hint">Vérifie et ajuste si besoin, puis enregistre.</p>
        <form onsubmit="Assistant.save(event)">
          <div class="form-grid">
            <div class="form-group">
              <label>Type</label>
              <select name="type" id="asst-type" onchange="Assistant._onTypeChange()">
                <option value="depense"${d.isRevenue ? '' : ' selected'}>Dépense</option>
                <option value="revenu"${d.isRevenue ? ' selected' : ''}>Revenu</option>
              </select>
            </div>
            <div class="form-group">
              <label>Montant (€) *</label>
              <input name="amount" type="number" step="0.01" min="0" required value="${d.amount != null ? d.amount : ''}">
            </div>
            <div class="form-group form-full">
              <label>Libellé *</label>
              <input name="description" required value="${this._esc(d.description)}" placeholder="ex : Carrefour">
            </div>
            <div class="form-group">
              <label>Catégorie *</label>
              <select name="category" id="asst-cat" required onchange="Assistant._onCatChange()">${catOptions}</select>
            </div>
            <div class="form-group">
              <label>Sous-catégorie</label>
              <select name="subcategory" id="asst-subcat">${subOptions}</select>
            </div>
            <div class="form-group">
              <label>Date *</label>
              <input name="date" type="date" required value="${this._esc(d.date)}">
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" onclick="Assistant.reformulate()">Modifier la phrase</button>
            <button type="submit" class="btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>`;
  },

  _onCatChange() {
    const cat = document.getElementById('asst-cat')?.value;
    const sub = document.getElementById('asst-subcat');
    if (sub) sub.innerHTML = BankImport._subcatOpts(cat, '');
  },

  _onTypeChange() {
    const type = document.getElementById('asst-type')?.value;
    const catSel = document.getElementById('asst-cat');
    if (!catSel) return;
    // Un revenu va toujours dans la catégorie "Revenus" par défaut.
    if (type === 'revenu') catSel.value = BankImport._revenueCat(Storage.getCategories()).name;
    this._onCatChange();
  },

  // ── Pipeline ──────────────────────────────────────────────────────────────

  analyze() {
    this._stopVoice();
    const input = document.getElementById('assistant-input');
    const text = (input?.value || '').trim();
    if (!text) { input?.focus(); return; }
    this._lastText = text;

    // Plusieurs opérations énumérées → tableau d'aperçu groupé.
    if (this._splitSegments(text).length >= 2) { this._toMulti(text); return; }

    const parsed = this._parse(text);
    if (parsed.missing.length) {
      this._show('Assistant', this._missingScreen(text, parsed));
      return;
    }
    this._toPreview(text, parsed);
  },

  // Construit le brouillon depuis le parsing local + catégorisation (libellé seul).
  async _toPreview(text, parsed) {
    this._show('Assistant', this._loadingScreen('Catégorisation…'));
    const allCats = Storage.getCategories();
    const t = {
      date: parsed.date,
      description: parsed.label || (parsed.isRevenue ? 'Revenu' : 'Dépense'),
      amount: parsed.amount,
      isRevenue: parsed.isRevenue,
    };
    await this._resolveCats([t], allCats);

    this._draft = { ...t, rawText: text };
    this._show('Assistant — vérifier', this._previewScreen(this._draft));
  },

  // Repli explicite : la phrase ENTIÈRE est envoyée à Gemini (opt-in confirmé).
  async geminiFull() {
    this._show('Assistant', this._loadingScreen('Analyse de la phrase par Gemini…'));
    try {
      this._draft = await this._geminiFullParse(this._lastText);
      this._show('Assistant — vérifier', this._previewScreen(this._draft));
    } catch (e) {
      const msg = e.message === 'no-key'
        ? 'Aucune clé Gemini configurée — reformule ta phrase.'
        : "Gemini n'a pas réussi à analyser la phrase — reformule-la.";
      this._show('Assistant', this._inputScreen(this._lastText, msg));
      this._focusInput();
    }
  },

  save(event) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const isRevenue = fd.get('type') === 'revenu';
    const amount = parseFloat(fd.get('amount'));
    const description = (fd.get('description') || '').trim();
    const category = fd.get('category');
    const subcategory = fd.get('subcategory') || '';
    const date = fd.get('date');
    if (!description || isNaN(amount) || !date) return;

    // N'apprend QUE si l'utilisateur a modifié la catégorie suggérée — sinon une
    // simple validation enregistrerait la devinette (parfois Gemini) comme une
    // « correction manuelle » prioritaire, qui ressortirait ensuite à tort.
    const sug = this._draft || {};
    if (category !== sug.category || subcategory !== (sug.subcategory || '')) {
      GeminiCat.learn(description, category, subcategory);
    }

    const rec = {
      id: Utils.generateId(),
      description, amount: Math.abs(amount),
      category, subcategory, date, notes: 'Assistant',
    };
    if (isRevenue) {
      const list = Storage.getRevenues(); list.push(rec); Storage.saveRevenues(list);
    } else {
      const list = Storage.getExpenses(); list.push(rec); Storage.saveExpenses(list);
    }

    this.close();
    this._refreshViews();
    this._toast(isRevenue ? 'Revenu enregistré ✓' : 'Dépense enregistrée ✓');
  },

  // ── Plusieurs opérations en une fois ──────────────────────────────────────

  // Découpe la saisie en segments (une opération chacun). Protège les virgules
  // décimales (12,50) avant de couper sur les séparateurs/connecteurs.
  // Découpe le texte en segments = 1 dépense chacun.
  // Sauts de ligne prioritaires (dictée vocale : 1 utterance/pause par ligne, ou saisie
  // multi-lignes) : on ne re-découpe PAS une ligne sur « et »/virgule, sinon « 15 € et 50 »
  // ou « Pierre et Vacances » seraient coupés en deux (« deux pour une »). Sinon (une seule
  // ligne tapée) on tolère virgule/et/puis/ensuite, en protégeant la virgule décimale (12,50).
  _splitSegments(text) {
    if (/\n/.test(String(text))) {
      return String(text).split(/\n+|\s*;\s*|\s+(?:puis|ensuite)\s+/i).map(s => s.trim()).filter(Boolean);
    }
    const SENT = '\u0001';   // marqueur temporaire : protège les virgules décimales (12,50)
    const masked = String(text).replace(/(\d)\s*,\s*(\d)/g, '$1' + SENT + '$2');
    return masked
      .split(/\s*(?:,|;|\bet\b|\bpuis\b|\bensuite\b)\s*/i)
      .map(p => p.split(SENT).join(',').trim())
      .filter(Boolean);
  },

  async _toMulti(text) {
    this._show('Assistant', this._loadingScreen('Analyse des opérations…'));
    const allCats = Storage.getCategories();
    const drafts = [];
    let runningDate = this._isoOf(new Date());   // date propagée aux segments sans date
    for (const seg of this._splitSegments(text)) {
      const p = this._parse(seg);
      if (p.dateExplicit) runningDate = p.date;
      if (p.amount == null) continue;            // segment sans montant : ne sert qu'à la date
      drafts.push({
        date: p.dateExplicit ? p.date : runningDate,
        description: p.label || (p.isRevenue ? 'Revenu' : 'Dépense'),
        amount: p.amount,
        isRevenue: p.isRevenue,
      });
    }

    if (drafts.length === 0) {                   // aucun montant nulle part
      this._show('Assistant', this._missingScreen(text, { missing: ['le montant'] }));
      return;
    }
    await this._resolveCats(drafts, allCats);

    if (drafts.length === 1) {                   // une seule opération → aperçu simple
      this._draft = { ...drafts[0], rawText: text };
      this._show('Assistant — vérifier', this._previewScreen(this._draft));
      return;
    }
    this._multiDrafts = drafts;
    this._show('Assistant — vérifier', this._multiPreviewScreen(drafts), true);
  },

  // Devine catégorie + sous-catégorie en local (vrais noms, version datée).
  _guessCat(t, allCats) {
    // On encadre le libellé d'espaces : les motifs d'enseignes de _smartGuess
    // (« jules », « spar », « free »…) attendent un espace de fin, absent d'un
    // libellé d'un seul mot — sans ça « Jules » retomberait sur « Divers ».
    const g = t.isRevenue
      ? { category: BankImport._revenueCat(allCats).name, subcategory: BankImport._defaultRevenueCat(allCats) }
      : BankImport._smartGuess(' ' + t.description + ' ', allCats, t.date);
    t.category = g.category;
    t.subcategory = g.subcategory;
  },

  // Vrai si la devinette locale a reconnu une enseigne (≠ repli générique).
  // _smartGuess renvoie « Divers » (ou la dernière catégorie) + sous-cat vide
  // quand rien ne matche ; tout autre résultat = enseigne identifiée.
  _localHit(t, allCats) {
    if (t.isRevenue) return true;   // un revenu → catégorie Revenus, toujours « sûre »
    const n = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const fb = allCats.find(c => n(c.name) === 'divers') || allCats[allCats.length - 1];
    return !(t.category === (fb && fb.name) && !t.subcategory);
  },

  // Catégorise une liste de brouillons selon la priorité :
  //   1. correction déjà APPRISE (cache _learned) — toujours prioritaire
  //   2. enseigne reconnue EN LOCAL — on garde, rien n'est envoyé
  //   3. libellé inconnu — seul celui-là part à Gemini (cache + IA)
  async _resolveCats(drafts, allCats) {
    const cache = GeminiCat._getCache();
    const toAsk = [];
    drafts.forEach(d => {
      this._guessCat(d, allCats);                       // devinette locale d'abord
      const corr = cache[GeminiCat._normalize(d.description)];
      if (corr && corr._learned) {                       // 1. correction manuelle apprise
        BankImport._applyCatResult(d, { [d.description]: corr }, allCats);
      } else if (this._localHit(d, allCats)) {           // 2. enseigne reconnue → garder local
        /* on conserve la devinette locale, aucun envoi */
      } else {                                            // 3. inconnu → Gemini
        toAsk.push(d);
      }
    });
    if (!toAsk.length) return;
    try {
      const catMap = await GeminiCat.categorize(toAsk.map(d => d.description), allCats);
      toAsk.forEach(d => BankImport._applyCatResult(d, catMap, allCats));
    } catch (_) { /* on garde la devinette locale */ }
  },

  _multiPreviewScreen(drafts) {
    const cats = Storage.getCategories();
    const rows = drafts.map((d, i) => {
      const catOptions = cats
        .map(c => `<option value="${this._esc(c.name)}"${c.name === d.category ? ' selected' : ''}>${this._esc(c.name)}</option>`)
        .join('');
      const subOptions = BankImport._subcatOpts(d.category, d.subcategory || '');
      return `<tr>
        <td style="text-align:center"><input type="checkbox" data-row="${i}" checked></td>
        <td><select id="am-type-${i}" onchange="Assistant._onMultiType(${i})">
          <option value="depense"${d.isRevenue ? '' : ' selected'}>Dépense</option>
          <option value="revenu"${d.isRevenue ? ' selected' : ''}>Revenu</option>
        </select></td>
        <td><input id="am-date-${i}" type="date" value="${this._esc(d.date)}"></td>
        <td><input id="am-desc-${i}" value="${this._esc(d.description)}" placeholder="libellé"></td>
        <td><input id="am-amt-${i}" type="number" step="0.01" min="0" value="${d.amount != null ? d.amount : ''}"></td>
        <td><select id="am-cat-${i}" onchange="Assistant._onMultiCat(${i})">${catOptions}</select></td>
        <td><select id="am-sub-${i}">${subOptions}</select></td>
      </tr>`;
    }).join('');
    return `
      <div class="assistant-box">
        <p class="assistant-hint"><strong>${drafts.length} opérations</strong> détectées. Décoche pour exclure, ajuste si besoin, puis enregistre.</p>
        <div class="preview-table-wrap">
          <table class="data-table assistant-multi-table">
            <thead><tr>
              <th></th><th>Type</th><th>Date</th><th>Libellé</th><th>Montant</th><th>Catégorie</th><th>Sous-cat.</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Assistant.reformulate()">Modifier la phrase</button>
          <button type="button" class="btn-primary" onclick="Assistant.saveMulti()">Enregistrer (${drafts.length})</button>
        </div>
      </div>`;
  },

  _onMultiCat(i) {
    const cat = document.getElementById(`am-cat-${i}`)?.value;
    const sub = document.getElementById(`am-sub-${i}`);
    if (sub) sub.innerHTML = BankImport._subcatOpts(cat, '');
  },

  _onMultiType(i) {
    const type = document.getElementById(`am-type-${i}`)?.value;
    const catSel = document.getElementById(`am-cat-${i}`);
    if (catSel && type === 'revenu') catSel.value = BankImport._revenueCat(Storage.getCategories()).name;
    this._onMultiCat(i);
  },

  saveMulti() {
    const v = id => document.getElementById(id)?.value;
    const drafts = this._multiDrafts || [];
    const expenses = Storage.getExpenses();
    const revenues = Storage.getRevenues();
    let n = 0;
    document.querySelectorAll('[data-row]').forEach(cb => {
      if (!cb.checked) return;
      const i = cb.dataset.row;
      const isRevenue = v(`am-type-${i}`) === 'revenu';
      const amount = parseFloat(v(`am-amt-${i}`));
      const description = (v(`am-desc-${i}`) || '').trim();
      const category = v(`am-cat-${i}`);
      const subcategory = v(`am-sub-${i}`) || '';
      const date = v(`am-date-${i}`);
      if (!description || isNaN(amount) || !date) return;
      // N'apprend QUE si l'utilisateur a modifié la catégorie suggérée (sinon on
      // enregistrerait la devinette comme une correction manuelle prioritaire).
      const sug = drafts[Number(i)] || {};
      if (category !== sug.category || subcategory !== (sug.subcategory || '')) {
        GeminiCat.learn(description, category, subcategory);
      }
      const rec = { id: Utils.generateId(), description, amount: Math.abs(amount), category, subcategory, date, notes: 'Assistant' };
      (isRevenue ? revenues : expenses).push(rec);
      n++;
    });
    if (!n) return;
    Storage.saveExpenses(expenses);
    Storage.saveRevenues(revenues);
    this._multiDrafts = null;
    this.close();
    this._refreshViews();
    this._toast(`${n} opération(s) enregistrée(s) ✓`);
  },

  close() {
    this._stopVoice();
    const m = document.getElementById('modal');
    if (m) m.classList.remove('modal-wide');
    Modal.close();
  },

  // Re-rend le dashboard et l'onglet actif (sans déplacer l'utilisateur).
  _refreshViews() {
    try { Dashboard.render(); } catch (_) {}
    const active = document.querySelector('.nav-item.active')?.dataset.section;
    if (active) { try { navigateTo(active); } catch (_) {} }
  },

  // ── Parsing local (FR) ────────────────────────────────────────────────────

  _norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’‘`]/g, "'");
  },

  _MONTHS: {
    janvier: 1, janv: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4,
    mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9,
    octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12,
  },

  _parse(text) {
    const low = this._norm(text);          // même longueur/indexation que text
    const date = this._parseDate(low);
    const amount = this._parseAmount(low, date.span);
    const isRevenue = this._isRevenue(low);
    const label = this._extractLabel(text, date.span, amount && amount.span);

    const missing = [];
    if (!amount) missing.push('le montant');
    if (date.unresolved) missing.push('la date');

    return {
      amount: amount ? amount.value : null,
      date: date.iso,
      dateExplicit: date.span !== null,
      isRevenue, label, missing,
    };
  },

  _isoOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // Si une date sans année tombe loin dans le futur, on suppose l'an dernier
  // (on saisit surtout des opérations passées).
  _settleYear(year, mon, day, hadYear) {
    let d = new Date(year, mon - 1, day);
    if (!hadYear && d.getTime() > Date.now() + 7 * 864e5) d = new Date(year - 1, mon - 1, day);
    return d;
  },

  _parseDate(low) {
    const today = new Date();

    const rel = [
      [/\bavant[ -]?hier\b/, -2],
      [/\bapres[ -]?demain\b/, 2],
      [/\baujourd['e ]?hui\b/, 0],
      [/\bajd\b/, 0], [/\bauj\b/, 0],
      [/\bhier\b/, -1],
      [/\bdemain\b/, 1],
    ];
    for (const [re, off] of rel) {
      const m = low.match(re);
      if (m) {
        const d = new Date(today); d.setDate(d.getDate() + off);
        return { iso: this._isoOf(d), span: [m.index, m.index + m[0].length], unresolved: false };
      }
    }

    // "le 3 juin", "3 juin 2026", "1er mars"
    const monthNames = 'janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec';
    let m = low.match(new RegExp('\\b(\\d{1,2})(?:er)?\\s+(' + monthNames + ')(?:\\s+(\\d{4}))?\\b'));
    if (m) {
      const day = parseInt(m[1]), mon = this._MONTHS[m[2]];
      const year = m[3] ? parseInt(m[3]) : today.getFullYear();
      const d = this._settleYear(year, mon, day, !!m[3]);
      return { iso: this._isoOf(d), span: [m.index, m.index + m[0].length], unresolved: false };
    }

    // Formats numériques (espaces/points/collé/scindé) : peuvent apparaître dans le MÊME
    // texte qu'un montant à virgule (ex. « 18,28 27 06 2026 »). Piège : avec un motif jour/mois
    // générique (\d{1,2}), la fin du montant (« 28 ») et le début de la date (« 27 ») formeraient
    // un faux match « 28 27 » (jour=28, mois=27) — et un jour/mois regex-générique qui matche
    // syntaxiquement bloque tout match ultérieur (JS ne revient pas en arrière sur un match
    // global déjà consommé, même invalidé après coup). Solution : le jour (1-31) et le mois
    // (1-12) sont des ALTERNATIVES NUMÉRIQUES explicites dans le motif lui-même, donc « 27 »
    // en position mois ne matche tout simplement pas — le moteur regex saute alors tout seul
    // au bon endroit (jour=27, mois=06) sans validation a posteriori.
    const DAY = '(?:3[01]|[12][0-9]|0[1-9]|[1-9])';  // 1-31 ; combinaisons à 2 chiffres avant le repli à 1
    const MON = '(?:1[0-2]|0[1-9]|[1-9])';           // 1-12 ; idem : 2 chiffres avant le repli à 1
    const DAY2 = '(?:0[1-9]|[12][0-9]|3[01])';   // 01-31 EXACTEMENT 2 chiffres (formats collés)
    const MON2 = '(?:0[1-9]|1[0-2])';            // 01-12 EXACTEMENT 2 chiffres (formats collés)
    const firstValid = (re, build) => {
      for (const mm of low.matchAll(re)) {
        const r = build(mm);
        if (r) return { iso: this._isoOf(r), span: [mm.index, mm.index + mm[0].length], unresolved: false };
      }
      return null;
    };

    // Date numérique JJ/MM[/AAAA] (séparateur / ou - uniquement : le point reste
    // réservé aux montants).
    let found = firstValid(new RegExp('\\b(' + DAY + ')[\\/\\-](' + MON + ')(?:[\\/\\-](\\d{2,4}))?\\b', 'g'), mm => {
      let year = mm[3] ? parseInt(mm[3]) : today.getFullYear();
      if (year < 100) year += 2000;
      return this._settleYear(year, parseInt(mm[2]), parseInt(mm[1]), !!mm[3]);
    });
    if (found) return found;

    // Date numérique à espaces « 27 06 2026 » (fréquent à la dictée) : année obligatoire
    // pour la distinguer d'un montant. L'année peut être scindée en deux groupes de 2
    // chiffres (« 27 06 20 26 ») : lecture « vingt vingt-six » fréquente en dictée.
    found = firstValid(new RegExp('\\b(' + DAY + ')\\s+(' + MON + ')\\s+(\\d{2})\\s+(\\d{2})\\b', 'g'), mm => {
      const year = parseInt(mm[3] + mm[4]);
      return (year >= 2000 && year <= 2099) ? this._settleYear(year, parseInt(mm[2]), parseInt(mm[1]), true) : null;
    });
    if (found) return found;
    found = firstValid(new RegExp('\\b(' + DAY + ')\\s+(' + MON + ')\\s+(\\d{2,4})\\b', 'g'), mm => {
      let year = parseInt(mm[3]); if (year < 100) year += 2000;
      return this._settleYear(year, parseInt(mm[2]), parseInt(mm[1]), true);
    });
    if (found) return found;

    // Date numérique à points « 27.06.2026 » (convention FR courante) : année sur 4 chiffres
    // exigée pour ne jamais confondre avec un montant (les montants n'ont qu'UNE décimale
    // à point, jamais un 3e groupe de 4 chiffres).
    found = firstValid(new RegExp('\\b(' + DAY + ')\\.(' + MON + ')\\.(\\d{4})\\b', 'g'), mm =>
      this._settleYear(parseInt(mm[3]), parseInt(mm[2]), parseInt(mm[1]), true));
    if (found) return found;

    // Date numérique collée sans séparateur « 27062026 » (JJMMAAAA, 8 chiffres) : la
    // reconnaissance vocale colle parfois les groupes dictés séparément. Jour/mois à largeur
    // fixe (2 chiffres, zéro obligatoire) pour rester sans ambiguïté sans séparateur.
    found = firstValid(new RegExp('(?<!\\d)(' + DAY2 + ')(' + MON2 + ')(\\d{4})(?!\\d)', 'g'), mm => {
      const year = parseInt(mm[3]);
      return (year >= 2000 && year <= 2099) ? this._settleYear(year, parseInt(mm[2]), parseInt(mm[1]), true) : null;
    });
    if (found) return found;

    // Jour de la semaine : « jeudi », « jeudi dernier/passé », « jeudi prochain ».
    const WD = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };
    const wm = low.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
    if (wm) {
      const target = WD[wm[1]];
      const tail = low.slice(wm.index + wm[0].length).match(/^\s+(derniere?|passee?|prochaine?)\b/);
      const mod = tail ? tail[1] : '';
      const d = new Date(today);
      const dow = today.getDay();
      if (/^prochaine?$/.test(mod)) {
        let diff = (target - dow + 7) % 7; if (diff === 0) diff = 7;
        d.setDate(d.getDate() + diff);                 // prochaine occurrence future
      } else {
        let diff = (dow - target + 7) % 7;             // occurrence la plus récente ≤ aujourd'hui
        if (mod && diff === 0) diff = 7;               // « dernier » un même jour = il y a 7 jours
        d.setDate(d.getDate() - diff);
      }
      const end = wm.index + wm[0].length + (tail ? tail[0].length : 0);
      return { iso: this._isoOf(d), span: [wm.index, end], unresolved: false };
    }

    // Date évoquée mais non résoluble localement → on demandera confirmation.
    if (/\b(la semaine derniere|le mois dernier|l'autre jour|recemment|debut du mois|fin du mois|week[ -]?end)\b/.test(low)) {
      return { iso: null, span: null, unresolved: true };
    }

    // Aucune date mentionnée → aujourd'hui (pas de blocage).
    return { iso: this._isoOf(today), span: null, unresolved: false };
  },

  _parseAmount(low, dateSpan) {
    let s = low;
    if (dateSpan) s = s.slice(0, dateSpan[0]) + ' '.repeat(dateSpan[1] - dateSpan[0]) + s.slice(dateSpan[1]);
    // Classes construites en chaîne pour éviter les espaces insécables (nbsp) invisibles.
    const SP = '[\\d.\\u00a0\\u202f ]';    // chiffres + séparateurs de milliers (espace/nbsp)
    const DEC = '(?:[.,]\\s?\\d{1,2})?';   // décimales ; tolère un espace après la virgule (« 18, 28 »)
    const CUR = '(?:€|euros?|eur\\b|balles?)';
    // 1) Centimes dictés « 18 euros 28 », « 18 € et 28 », « 15 euros 50 » → 18,28. La date ayant
    //    déjà été neutralisée ci-dessus, « 15 euros 12 juin » ne prend PAS « 12 » pour des centimes.
    const cents = s.match(new RegExp('(\\d' + SP + '*)\\s*' + CUR + '\\s+(?:et\\s+)?(\\d{1,2})(?!\\s*\\d)', 'i'));
    if (cents) {
      const whole = this._toNumber(cents[1]);
      if (whole != null) return { value: whole + parseInt(cents[2], 10) / 100, span: [cents.index, cents.index + cents[0].length] };
    }
    // 2) nombre + devise · 3) devise + nombre · 4) nombre seul
    const tries = [
      new RegExp('(\\d' + SP + '*' + DEC + ')\\s*' + CUR, 'i'),
      new RegExp(CUR + '\\s*(\\d' + SP + '*' + DEC + ')', 'i'),
      new RegExp('(?<![\\w.,\\/])(\\d' + SP + '*' + DEC + ')(?![\\w.,\\/])'),
    ];
    for (const re of tries) {
      const m = s.match(re);
      if (m) {
        const value = this._toNumber(m[1]);
        if (value != null) return { value, span: [m.index, m.index + m[0].length] };
      }
    }
    return null;
  },

  // Convertit "45,50" / "1 800" / "1.800,50" / "45.50" en nombre.
  _toNumber(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().replace(/[   ]/g, ''); // retire les espaces de milliers
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) {
      // le dernier séparateur est le décimal
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.includes(',')) {
      const dec = s.split(',')[1];
      s = (dec && dec.length <= 2) ? s.replace(',', '.') : s.replace(/,/g, '');
    } else if (s.includes('.')) {
      const parts = s.split('.');
      const dec = parts[parts.length - 1];
      // point décimal seulement si "x.dd" ; sinon c'est un séparateur de milliers
      if (!(parts.length === 2 && dec.length <= 2)) s = s.replace(/\./g, '');
    }
    const val = parseFloat(s);
    return isNaN(val) ? null : val;
  },

  _isRevenue(low) {
    const rev = /\b(recu|recue|recus|recues|remboursement|rembourse|remboursee|salaire|salaires|paie|prime|primes|versement|verse|versee|virement|encaisse|encaissee|touche|touchee|gagne|gagnee|percu|percue|dividende|allocation|pension|bourse|prestation)\b/;
    const exp = /\b(depense|depenses|depensee|paye|payee|payer|regle|reglee|achete|achetee|achat|preleve|prelevee|prelevement|facture|coute|coutee|retrait)\b/;
    if (exp.test(low)) return false;     // un verbe de dépense l'emporte
    return rev.test(low);
  },

  _STOP: new Set([
    'j', 'je', 'on', 'nous', 'ai', 'as', 'a', 'un', 'une', 'des', 'de', 'du', 'd', 'le', 'la', 'les', 'l',
    'au', 'aux', 'chez', 'pour', 'par', 'en', 'et', 'ce', 'cet', 'cette', 'mon', 'ma', 'mes', 'ton', 'ta',
    'avec', 'dans', 'sur', 'vers', 'environ', 'the', 'ca', 'cela', 'depuis', 'montant', 'total',
    'depense', 'depenses', 'depensee', 'depenser', 'paye', 'payee', 'payer', 'paie', 'paiement',
    'regle', 'reglee', 'regler', 'achete', 'achetee', 'acheter', 'achat', 'achats',
    'preleve', 'prelevee', 'prelever', 'prelevement', 'coute', 'coutee', 'couter', 'facture', 'retrait', 'retire',
    'recu', 'recue', 'recus', 'recues', 'recevoir', 'remboursement', 'rembourse', 'remboursee',
    'encaisse', 'encaissee', 'encaisser', 'touche', 'touchee', 'gagne', 'gagnee', 'gagner',
    'percu', 'percue', 'verse', 'versee', 'versement', 'virement', 'vire', 'viree', 'salaire', 'salaires',
    'prime', 'primes', 'bonus', 'dividende', 'allocation', 'pension', 'bourse', 'aide', 'prestation',
    'euro', 'euros', 'eur', 'balle', 'balles',
    'hier', 'demain', 'aujourdhui', 'ajd', 'auj',
    'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
    'dernier', 'derniere', 'passe', 'passee', 'prochain', 'prochaine',
    'aussi', 'meme', 'memes', 'jour', 'jours', 'journee', 'pareil', 'idem', 'fois', 'encore',
  ]),

  // Reconstruit le libellé (commerçant/source) : retire date + montant + mots
  // outils, en conservant la casse/accents d'origine du commerçant.
  _extractLabel(text, dateSpan, amountSpan) {
    let s = text;
    const blank = (str, span) => span
      ? str.slice(0, span[0]) + ' '.repeat(span[1] - span[0]) + str.slice(span[1]) : str;
    s = blank(s, amountSpan);
    s = blank(s, dateSpan);

    // Retire les articles/pronoms élidés (l', d', j', qu'…) sans casser un vrai
    // token d'une lettre (« Super U ») ni un nom à apostrophe (« McDonald's »).
    s = s.replace(/\b(?:qu|[a-z])['’]/gi, ' ');
    const NOISE1 = new Set(['a', 'c', 'd', 'j', 'l', 'm', 'n', 's', 't', 'y']);
    const tokens = s.split(/\s+/).filter(Boolean);
    const kept = tokens.filter(tok => {
      const n = this._norm(tok).replace(/[^a-z0-9&]/g, '');
      if (!n) return false;
      if (n.length === 1 && NOISE1.has(n)) return false; // lettres élidées orphelines
      if (this._STOP.has(n)) return false;
      if (/^\d+$/.test(n)) return false;       // chiffres résiduels
      return true;
    });
    let label = kept.join(' ').replace(/\s{2,}/g, ' ').trim();
    label = label.replace(/^[\s'’\-,.]+|[\s'’\-,.]+$/g, '');
    if (label) label = label.charAt(0).toUpperCase() + label.slice(1);
    return label;
  },

  // ── Repli Gemini phrase complète ──────────────────────────────────────────

  async _geminiFullParse(text) {
    const apiKey = GeminiCat.getApiKey();
    if (!apiKey) throw new Error('no-key');
    const allCats = Storage.getCategories();
    const catBlock = allCats
      .map(c => `• ${c.name}${(c.subcategories || []).length ? ' → ' + c.subcategories.join(', ') : ''}`)
      .join('\n');
    const today = this._isoOf(new Date());
    const prompt =
`Tu extrais UNE opération financière personnelle depuis une phrase en français.
Aujourd'hui : ${today}.

Catégories disponibles :
${catBlock}

Phrase : "${text}"

Déduis :
- amount : le montant en nombre (point décimal)
- date : au format YYYY-MM-DD (déduis "hier", "le 3 juin", "lundi dernier"… à partir d'aujourd'hui)
- type : "depense" ou "revenu"
- label : libellé court (commerçant ou source)
- category + subcategory : les plus adaptées PARMI la liste ci-dessus (sinon laisse subcategory vide)

Réponds UNIQUEMENT en JSON, sans texte autour :
{"amount":0,"date":"YYYY-MM-DD","type":"depense","label":"...","category":"...","subcategory":""}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GeminiCat._MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!resp.ok) throw new Error('http');
    const data = await resp.json();
    const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = txt.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('parse');
    const p = JSON.parse(match[0]);

    const isRevenue = /revenu/i.test(p.type || '');
    const t = {
      date: this._validDate(p.date) || this._isoOf(new Date()),
      description: (p.label || '').trim() || (isRevenue ? 'Revenu' : 'Dépense'),
      amount: this._toNumber(p.amount),
      isRevenue,
    };
    // Résout vers les vraies catégories de l'utilisateur.
    if (isRevenue) {
      const rc = BankImport._revenueCat(allCats);
      t.category = rc.name;
      t.subcategory = BankImport._matchSubcat(rc, p.subcategory) || BankImport._defaultRevenueCat(allCats);
    } else {
      // Résout vers la catégorie réelle, version datée selon la date de l'opération.
      const matched = BankImport._versionedPick(BankImport._matchCat(p.category, allCats), t.date, allCats);
      if (matched) {
        t.category = matched.name;
        t.subcategory = BankImport._matchSubcat(matched, p.subcategory);
      } else {
        this._guessCat(t, allCats);
      }
    }
    return { ...t, rawText: text };
  },

  _validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return null;
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? null : s;
  },

  // ── Dictée vocale (Web Speech API) ────────────────────────────────────────

  // Dictée « mains libres » : on écoute en continu et on RELANCE automatiquement quand le
  // navigateur coupe tout seul sur un silence (Chrome arrête après quelques secondes). Ainsi
  // l'utilisateur peut énumérer plusieurs dépenses ; l'écoute ne s'arrête que quand il
  // ré-appuie sur le micro (_listening repasse à false).
  toggleVoice() {
    if (this._listening) { this._stopVoice(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const input = document.getElementById('assistant-input');
    // Repart du texte déjà présent (sur une nouvelle ligne) : on peut relancer la dictée
    // sans écraser ce qui est là.
    this._voiceFinal = input && input.value ? input.value.replace(/\s+$/, '') + '\n' : '';

    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = true;   // garde l'écoute entre les phrases (plusieurs dépenses d'affilée)
    rec.onresult = (e) => {
      // Chaque utterance FINALISÉE (= une pause dans l'énumération) devient SA PROPRE LIGNE :
      // c'est ce qui sépare proprement les dépenses dictées « plein à la suite » (le découpage
      // se fait ensuite sur les sauts de ligne, pas sur « et »/virgule). L'interim n'est
      // affiché que pour le retour visuel immédiat.
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { const c = t.trim(); if (c) this._voiceFinal += c + '\n'; }
        else interim += t;
      }
      const el = document.getElementById('assistant-input');
      if (el) el.value = this._voiceFinal + interim;
    };
    rec.onerror = (e) => {
      // Erreurs fatales seulement : on coupe et on prévient. Les transitoires ('no-speech',
      // 'aborted', 'network') laissent onend relancer l'écoute.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this._listening = false;
        this._setVoiceStatus('Micro refusé — autorise l\'accès dans le navigateur.');
      } else if (e.error === 'audio-capture') {
        this._listening = false;
        this._setVoiceStatus('Aucun micro détecté.');
      }
    };
    rec.onend = () => {
      // Tant que l'utilisateur veut écouter, on relance (le navigateur a coupé sur silence).
      // Le texte déjà finalisé est conservé (lignes), donc rien n'est perdu au redémarrage.
      if (this._listening) {
        try { rec.start(); return; } catch (_) { this._listening = false; }
      }
      this._updateMic();
    };
    this._rec = rec;
    this._listening = true;
    this._updateMic();
    this._setVoiceStatus('🔴 Écoute en continu… ré-appuie sur le micro quand tu as fini.');
    try { rec.start(); } catch (_) { this._listening = false; this._updateMic(); }
  },

  _stopVoice() {
    // Signale l'intention d'arrêter AVANT de couper, pour que onend ne relance pas l'écoute.
    this._listening = false;
    if (this._rec) { try { this._rec.stop(); } catch (_) {} }
    this._updateMic();
    this._setVoiceStatus('');
  },

  _updateMic() {
    const btn = document.getElementById('assistant-mic');
    if (btn) btn.classList.toggle('listening', this._listening);
  },

  _setVoiceStatus(msg) {
    const el = document.getElementById('assistant-voice-status');
    if (el) el.textContent = msg;
  },

  // ── Divers ────────────────────────────────────────────────────────────────

  _toast(msg) {
    const el = document.createElement('div');
    el.className = 'assistant-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
  },

  _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
};

document.addEventListener('DOMContentLoaded', () => Assistant.init());
