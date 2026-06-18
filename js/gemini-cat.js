// Module de catégorisation automatique via Google Gemini (gratuit)
//
// CONFIDENTIALITÉ : seuls les libellés/descriptions des transactions sont envoyés
// à l'API Gemini. Jamais les montants, dates, soldes, numéros de compte,
// noms de titulaires ou toute autre information personnelle ou financière.
// Tout le reste reste strictement en local dans le navigateur.
const GeminiCat = {
  _CACHE_KEY:  'invest_gemini_cache',
  _CATMAP_KEY: 'invest_cat_map_cache', // correspondances « catégorie du fichier » → catégorie de l'app
  // Modèles essayés dans l'ordre, avec repli automatique si l'un n'a pas de quota
  // gratuit (ex. gemini-2.0-flash-lite → « free tier limit: 0 » sur certains projets).
  // Le premier modèle qui répond est mémorisé (localStorage 'gemini_model').
  _MODELS: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'],
  _lastError: '',                      // dernière erreur d'appel Gemini (affichée dans l'aperçu)
  _PROMPT_V: 3,                        // version du prompt — bumper invalide les noms en cache (re-demande à Gemini)

  getApiKey() { return localStorage.getItem('gemini_api_key') || ''; },
  saveApiKey(key) {
    if (key) localStorage.setItem('gemini_api_key', key);
    else localStorage.removeItem('gemini_api_key');
  },

  _getCache() {
    try { return JSON.parse(localStorage.getItem(this._CACHE_KEY) || '{}'); }
    catch { return {}; }
  },
  _saveCache(cache) {
    try { localStorage.setItem(this._CACHE_KEY, JSON.stringify(cache)); }
    catch (e) { console.warn('[GeminiCat] Erreur cache:', e); }
  },

  // Clé de cache = libellé DÉJÀ nettoyé en amont (BankImport._cleanLabel : dates et
  // numéros de carte retirés), simplement mis en minuscules et espaces normalisés.
  // On ne re-décode rien ici — le nettoyage est fait une seule fois, avant l'appel.
  _normalize(label) {
    return String(label || '').toLowerCase().replace(/\s+/g, ' ').trim();
  },

  // Apprend une correction manuelle et l'enregistre dans le cache.
  // Appelé quand l'utilisateur modifie manuellement la catégorie d'une transaction.
  learn(rawLabel, category, subcategory) {
    const key = this._normalize(rawLabel);
    if (!key) return;
    const cache = this._getCache();
    cache[key] = { ...cache[key], category, subcategory: subcategory || '', _learned: true }; // correction manuelle : prioritaire, jamais redemandée
    this._saveCache(cache);
  },

  // Point d'entrée principal : catégorise ET met en forme un tableau de libellés nettoyés.
  // Retourne un objet { "libellé": { name, category, subcategory } } — name = nom du
  // commerçant/fournisseur mis en forme par Gemini (vide si pas d'IA).
  // 1. Vérifie le cache → 2. Appelle Gemini pour les inconnus → 3. Fallback mots-clés
  async categorize(labels, userCategories) {
    const cache   = this._getCache();
    const result  = {};
    const toFetch = [];

    // Le cache n'est valable que s'il contient DÉJÀ le nom mis en forme (name).
    // Les anciennes entrées (sans name) sont redemandées à Gemini pour l'obtenir —
    // sinon la fenêtre 3 afficherait le libellé nettoyé tel quel (= fenêtre 2).
    for (const label of labels) {
      const c = cache[this._normalize(label)];
      // Valide si : nom présent ET (correction manuelle OU version de prompt à jour).
      if (c && c.name && (c._learned || c._v === this._PROMPT_V)) {
        result[label] = c;
      } else {
        result[label] = c || null;   // garde la catégorie connue comme repli
        toFetch.push(label);
      }
    }

    if (!toFetch.length) return result;

    const apiKey   = this.getApiKey();
    const fallback = label => cache[this._normalize(label)]
      || { name: '', category: guessCategory(label), subcategory: '' };

    if (apiKey) {
      try {
        const geminiResult = await this._callGemini(toFetch, userCategories);
        const updatedCache = this._getCache();
        for (const label of toFetch) {
          const cat = geminiResult[label] || fallback(label);
          result[label] = cat;
          const key = this._normalize(label);
          if (key && cat.name) updatedCache[key] = { ...cat, _v: this._PROMPT_V }; // cache + version
        }
        this._saveCache(updatedCache);
        this._lastError = '';
      } catch (err) {
        this._lastError = err.message || String(err);
        console.warn('[GeminiCat] Fallback mots-clés (' + this._lastError + ')');
        for (const label of toFetch) result[label] = fallback(label);
      }
    } else {
      // Pas de clé API → fallback silencieux sur la détection par mots-clés
      for (const label of toFetch) result[label] = fallback(label);
    }

    return result;
  },

  clearCache() {
    localStorage.removeItem(this._CACHE_KEY);
  },

  // Un appel à un modèle donné — renvoie le texte brut de la réponse.
  async _callModel(model, prompt) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.getApiKey()}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  },

  // Essaie les modèles dans l'ordre (celui qui a déjà marché en premier), avec repli
  // sur le suivant si quota épuisé / modèle indisponible. Mémorise le modèle qui répond.
  async _generate(prompt) {
    const remembered = localStorage.getItem('gemini_model');
    const list = [remembered, ...this._MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
    const errs = [];
    for (const model of list) {
      try {
        const text = await this._callModel(model, prompt);
        localStorage.setItem('gemini_model', model);
        return text;
      } catch (err) {
        const msg = (err.message || String(err)).replace(/\s+/g, ' ').trim();
        errs.push({ model, msg });
        // Quota / modèle indispo → essayer le suivant ; erreur dure (clé, réseau) → stop net.
        if (!/quota|exceeded|RESOURCE_EXHAUSTED|429|limit:\s*0|404|not ?found|not supported|unsupported/i.test(msg)) {
          throw new Error(msg);
        }
      }
    }
    console.warn('[GeminiCat] Aucun modèle Gemini disponible :', errs);
    const quota = errs.some(e => /quota|exceeded|RESOURCE_EXHAUSTED|429|limit:\s*0/i.test(e.msg));
    throw new Error(quota ? ('GEMINI_QUOTA:' + errs.map(e => e.model).join(','))
                          : (errs[0] ? errs[0].msg : 'Aucun modèle Gemini disponible'));
  },

  // Appel effectif à l'API Gemini.
  // SEULS les libellés (texte du libellé bancaire) sont transmis — rien d'autre.
  async _callGemini(labels, userCategories) {
    // Liste des catégories (et sous-catégories) de l'app — SANS table de synonymes
    // ni descriptions codées en dur : Gemini comprend les libellés bruts tout seul.
    const catBlock = (userCategories.length && typeof userCategories[0] === 'object')
      ? userCategories.map(c => {
          const subs = (c.subcategories || []).join(', ');
          return subs ? `• ${c.name} (sous-catégories : ${subs})` : `• ${c.name}`;
        }).join('\n')
      : userCategories.map(c => `• ${c}`).join('\n');

    const labelLines = labels.map((l, i) => `${i + 1}. "${l}"`).join('\n');

    const prompt =
`Tu nettoies et catégorises des libellés de transactions bancaires françaises.
Pour chaque libellé, donne :
- "n" : UNIQUEMENT le nom de la MARQUE / enseigne la plus connue et la plus COURTE (le plus souvent 1 seul mot), majuscule initiale. Préfère la marque mère : "SNCF-VOYAGEURS" → "SNCF", "CARREFOUR MARKET" → "Carrefour", "AMAZON PAYMENTS" → "Amazon", "PAYPAL *SPOTIFY" → "Spotify". RETIRE tout le reste : type d'opération (PAIEMENT, CB, CARTE, VIR, VIREMENT, PRLV, PRELEVEMENT, RETRAIT, FACTURE…), villes et « A <ville> », codes, références, formes juridiques (SARL, SAS, SA), mentions techniques (GESTION, SERVICES…). Si tu ne reconnais aucune enseigne, garde le seul mot principal le plus parlant.
- "c" : LA catégorie la plus adaptée, choisie UNIQUEMENT dans la liste ci-dessous ;
- "s" : LA sous-catégorie (même liste), ou "" si aucune ne convient.

Exemples pour "n" :
"PAIEMENT CB CARREFOUR A REIMS" → "Carrefour"
"VIR SEPA RECU /DE OPMOBILITY GESTION" → "Opmobility"
"PRELEVEMENT BOUYGUES TELECOM" → "Bouygues Telecom"
"PAIEMENT CB SNCF-VOYAGEURS PARIS 10" → "SNCF"
"CB CARREFOUR MARKET REIMS" → "Carrefour"
"DU 270426 FNAC DARTY PARIS 04" → "Fnac"

Catégories disponibles :
${catBlock}

Libellés :
${labelLines}

Réponds UNIQUEMENT en JSON valide, sans aucun texte autour :
{"r":[{"i":1,"n":"Carrefour","c":"catégorie","s":"sous-catégorie ou vide"}]}`;


    const text  = await this._generate(prompt);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Réponse Gemini non-JSON');

    const parsed  = JSON.parse(match[0]);
    const results = {};
    (parsed.r || []).forEach(item => {
      const label = labels[item.i - 1];
      if (label) results[label] = { name: item.n || '', category: item.c || '', subcategory: item.s || '' };
    });
    return results;
  },

  // ── CORRESPONDANCE DE CATÉGORIES (import : colonne « Catégorie » du fichier) ──
  //
  // CONFIDENTIALITÉ : seul le NOM de catégorie du fichier (1-3 mots) + la liste des
  // catégories de l'app sont envoyés à Gemini. Aucun montant, date, libellé ni
  // donnée personnelle — encore plus restreint que la catégorisation par libellé.

  _normCat(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim();
  },
  getCatMapCache() {
    try { return JSON.parse(localStorage.getItem(this._CATMAP_KEY) || '{}'); }
    catch { return {}; }
  },
  _saveCatMapCache(cache) {
    try { localStorage.setItem(this._CATMAP_KEY, JSON.stringify(cache)); }
    catch (e) { console.warn('[GeminiCat] Erreur cache cat-map:', e); }
  },
  clearCatMapCache() { localStorage.removeItem(this._CATMAP_KEY); },

  // Mémorise une correspondance (trouvée par Gemini ou corrigée à la main).
  learnCatMatch(fileCat, category, subcategory) {
    const key = this._normCat(fileCat);
    if (!key || !category) return;
    const cache = this.getCatMapCache();
    cache[key] = { category, subcategory: subcategory || '', original: cache[key]?.original || String(fileCat).trim() };
    this._saveCatMapCache(cache);
  },

  // Renvoie { "<nom fichier>": "<catégorie app>" } pour les noms demandés.
  // 1) cache → 2) Gemini pour les inconnus. Sans clé/erreur : les inconnus restent absents.
  async matchCategories(fileCatNames, userCategories) {
    const cache  = this.getCatMapCache();
    const result = {};
    const toFetch = [];
    for (const name of fileCatNames) {
      const key = this._normCat(name);
      if (cache[key]) result[name] = cache[key].category;
      else if (!toFetch.includes(name)) toFetch.push(name);
    }
    if (!toFetch.length || !this.getApiKey()) return result;
    try {
      const fetched = await this._callGeminiCatMatch(toFetch, userCategories);
      const updated = this.getCatMapCache();
      for (const name of toFetch) {
        const appCat = fetched[name];
        if (appCat) {
          result[name] = appCat;
          updated[this._normCat(name)] = { category: appCat, subcategory: '', original: String(name).trim() };
        }
      }
      this._saveCatMapCache(updated);
    } catch (err) {
      console.warn('[GeminiCat] matchCategories fallback (' + err.message + ')');
    }
    return result;
  },

  async _callGeminiCatMatch(names, userCategories) {
    const appList = userCategories.map(c => (typeof c === 'object' ? c.name : c)).join(', ');
    const lines   = names.map((n, i) => `${i + 1}. "${n}"`).join('\n');
    const prompt =
`On importe des transactions dont les catégories viennent d'un autre outil.
Catégories disponibles dans l'app : ${appList}.

Pour chaque catégorie ci-dessous, donne la catégorie de l'app la plus proche PAR LE SENS
(ex : "Salaire"→"Revenus", "Vacances"→"Loisir", "Médecin"→"Santé").
Utilise UNIQUEMENT une catégorie de la liste ci-dessus. Si vraiment aucune ne convient, mets "".

${lines}

Réponds UNIQUEMENT en JSON valide : {"r":[{"i":1,"c":"catégorie app ou vide"}]}`;

    const text  = await this._generate(prompt);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Réponse Gemini non-JSON');
    const parsed  = JSON.parse(match[0]);
    const results = {};
    (parsed.r || []).forEach(item => {
      const name = names[item.i - 1];
      if (name && item.c) results[name] = item.c;
    });
    return results;
  },
};
